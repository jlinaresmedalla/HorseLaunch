use regex::Regex;
use std::process::Stdio;
use tokio::process::Command;
use tokio::io::{AsyncBufReadExt, BufReader};
use std::collections::HashMap;
use std::path::Path;
use std::sync::Arc;
use tokio::sync::Mutex;
use tauri::{command, AppHandle, Emitter};
use serde::{Serialize, Deserialize};
use uuid::Uuid;
use once_cell::sync::Lazy;

// Hides the console window on Windows
#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;


static ANSI_REGEX: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"\x1b\[[0-9;]*[mGKHF]").unwrap()
});

fn strip_ansi_codes(text: &str) -> String {
    ANSI_REGEX.replace_all(text, "").to_string()
}

// ─── Data Structures ──────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct StreamMessage {
    pub process_id: String,
    pub project_name: String,
    pub config_name: String,
    pub output_type: String, // "stdout", "stderr", "info", "error", "exit"
    pub content: String,
    pub timestamp: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ProcessInfo {
    pub id: String,
    pub project_id: String,
    pub project_name: String,
    pub config_name: String,
    pub command: String,
    pub status: String, // "running", "stopped", "error"
    pub started_at: String,
}

/// Tracks a spawned process: its reader task handle + the OS PID for killing
struct ActiveEntry {
    handle: tokio::task::JoinHandle<()>,
    pid: u32,
}

pub struct ProcessManager {
    /// Map from our internal process_id → ActiveEntry
    active: Arc<Mutex<HashMap<String, ActiveEntry>>>,
    /// Map from process_id → metadata for display
    pub process_info: Arc<Mutex<HashMap<String, ProcessInfo>>>,
}

impl ProcessManager {
    pub fn new() -> Self {
        Self {
            active: Arc::new(Mutex::new(HashMap::new())),
            process_info: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    /// Builds the shell invocation for a user-defined project command.
    ///
    /// Windows runs the command through PowerShell; Unix-like systems run it through
    /// a login shell. Both paths force UTF-8 so child process output decodes cleanly.
    fn build_command(command_str: &str, working_dir: &Path, env_vars: &HashMap<String, String>) -> Command {
        #[cfg(target_os = "windows")]
        let mut cmd = {
            let mut cmd = Command::new("powershell");

            // Force UTF-8 encoding for the PowerShell session and any child processes.
            // - chcp 65001      : sets the Windows console codepage to UTF-8 at the Win32 API level,
            //                     which covers native binaries (C/C++, Java, .NET, etc.) that read
            //                     GetConsoleCP() directly — the layer that [Console]::OutputEncoding
            //                     alone does NOT reach.
            // - OutputEncoding  : makes PowerShell itself write UTF-8 to the pipe.
            // - InputEncoding   : makes PowerShell read UTF-8 from stdin.
            // - PYTHONIOENCODING: legacy env-var respected by Python 3.6+.
            // - PYTHONUTF8=1    : Python 3.7+ global UTF-8 mode (strongest guarantee for Python).
            let utf8_prefix = "chcp 65001 | Out-Null; \
                               [Console]::OutputEncoding = [System.Text.Encoding]::UTF8; \
                               [Console]::InputEncoding  = [System.Text.Encoding]::UTF8; \
                               $env:PYTHONIOENCODING = 'utf-8'; \
                               $env:PYTHONUTF8 = '1'; ";

            let wrapped_command = format!("{}{}", utf8_prefix, command_str);

            cmd.args(&[
                "-NoProfile",
                "-NonInteractive",
                "-Command",
                &wrapped_command,
            ]);

            use std::os::windows::process::CommandExt;
            cmd.creation_flags(CREATE_NO_WINDOW);

            cmd
        };

        #[cfg(not(target_os = "windows"))]
        let mut cmd = {
            // A GUI app launched from Finder inherits launchd's minimal PATH
            // (/usr/bin:/bin:/usr/sbin:/sbin), so version managers like nvm, pyenv and sdkman
            // are invisible and `npm`, `python` and `sbt` fail to resolve.
            //
            // Both flags are needed to undo that. `-l` sources the login profile
            // (.zprofile / .zlogin), and `-i` sources .zshrc — which zsh otherwise reads only
            // for interactive shells, and which is where most setups actually put their PATH
            // exports. Startup costs roughly 0.7s per command; a GUI launcher runs one command
            // per click, so that is a fair trade for commands resolving at all.
            let shell = if Path::new("/bin/zsh").exists() { "/bin/zsh" } else { "/bin/sh" };
            let mut cmd = Command::new(shell);
            if shell == "/bin/zsh" {
                cmd.args(&["-i", "-l", "-c", command_str]);
            } else {
                cmd.args(&["-l", "-c", command_str]);
            }

            // Unix terminals are already UTF-8, so there is no `chcp` equivalent to run.
            // Python still needs these explicitly: it falls back to ASCII when LANG/LC_ALL
            // are unset, which is exactly the case for a GUI app launched from Finder.
            cmd.env("PYTHONIOENCODING", "utf-8");
            cmd.env("PYTHONUTF8", "1");

            // Put the shell in its own process group so `kill_by_pid` can signal the whole
            // tree at once. Without this we could only reach the shell itself, and its
            // children (node, the JVM behind sbt, ...) would survive as orphans.
            cmd.process_group(0);

            cmd
        };

        cmd.current_dir(working_dir);
        cmd.stdout(Stdio::piped());
        cmd.stderr(Stdio::piped());

        // Apply user-defined env vars (they can override the defaults above if needed)
        for (k, v) in env_vars {
            cmd.env(k, v);
        }

        cmd
    }


    /// Kills the whole process tree, so sub-processes (e.g. sbt → JVM) die too.
    ///
    /// Windows uses `taskkill /F /T /PID`. Unix relies on the child having been placed in
    /// its own process group by `build_command`: signalling the negated PID reaches every
    /// process in that group. SIGTERM goes first to let processes shut down cleanly, then
    /// SIGKILL after a grace period for anything that ignored it.
    async fn kill_by_pid(pid: u32) {
        #[cfg(target_os = "windows")]
        {
            let _ = tokio::process::Command::new("taskkill")
                .args(&["/F", "/T", "/PID", &pid.to_string()])
                .creation_flags(CREATE_NO_WINDOW)
                .output()
                .await;
        }
        #[cfg(not(target_os = "windows"))]
        {
            let group = format!("-{}", pid);

            let _ = tokio::process::Command::new("kill")
                .args(&["-TERM", &group])
                .output()
                .await;

            tokio::time::sleep(std::time::Duration::from_secs(2)).await;

            // Succeeds only if something in the group is still alive; the error when the
            // group is already gone is expected and ignored.
            let _ = tokio::process::Command::new("kill")
                .args(&["-KILL", &group])
                .output()
                .await;
        }
    }

    pub async fn spawn_streaming(
        &self,
        app_handle: AppHandle,
        process_id: String,
        project_id: String,
        project_name: String,
        config_name: String,
        command_str: String,
        working_dir: std::path::PathBuf,
        env_vars: HashMap<String, String>,
    ) -> Result<ProcessInfo, String> {
        let mut cmd = Self::build_command(&command_str, &working_dir, &env_vars);
        let mut child = cmd.spawn().map_err(|e| format!("Failed to spawn: {}", e))?;

        // Grab the OS-level PID immediately before moving child into the task
        let os_pid = child.id().ok_or("Could not get process PID")?;

        let stdout = child.stdout.take().expect("no stdout");
        let stderr = child.stderr.take().expect("no stderr");

        let now = chrono::Local::now().to_rfc3339();

        let info = ProcessInfo {
            id: process_id.clone(),
            project_id: project_id.clone(),
            project_name: project_name.clone(),
            config_name: config_name.clone(),
            command: command_str.clone(),
            status: "running".to_string(),
            started_at: now.clone(),
        };

        // Store metadata
        {
            let mut info_map = self.process_info.lock().await;
            info_map.insert(process_id.clone(), info.clone());
        }

        // Emit start event
        let _ = app_handle.emit("process-output", StreamMessage {
            process_id: process_id.clone(),
            project_name: project_name.clone(),
            config_name: config_name.clone(),
            output_type: "info".to_string(),
            content: format!("▶ Started (PID {}): {}", os_pid, command_str),
            timestamp: now.clone(),
        });

        // Clone refs for the background task
        let pid = process_id.clone();
        let pname = project_name.clone();
        let cname = config_name.clone();
        let ah = app_handle.clone();
        let process_info_ref = self.process_info.clone();
        let active_ref = self.active.clone();

        let handle = tokio::spawn(async move {
            let mut stdout_reader = BufReader::new(stdout).lines();
            let mut stderr_reader = BufReader::new(stderr).lines();

            // Stream both stdout and stderr concurrently
            loop {
                tokio::select! {
                    line = stdout_reader.next_line() => {
                        match line {
                            Ok(Some(text)) => {
                                let clean_text = strip_ansi_codes(&text);
                                let _ = ah.emit("process-output", StreamMessage {
                                    process_id: pid.clone(),
                                    project_name: pname.clone(),
                                    config_name: cname.clone(),
                                    output_type: "stdout".to_string(),
                                    content: clean_text,
                                    timestamp: chrono::Local::now().to_rfc3339(),
                                });
                            }
                            Ok(None) => break,
                            Err(_) => break,
                        }
                    }
                    line = stderr_reader.next_line() => {
                        match line {
                            Ok(Some(text)) => {
                                let clean_text = strip_ansi_codes(&text);
                                let _ = ah.emit("process-output", StreamMessage {
                                   process_id: pid.clone(),
                                    project_name: pname.clone(),
                                    config_name: cname.clone(),
                                    output_type: "stderr".to_string(),
                                    content: clean_text,
                                    timestamp: chrono::Local::now().to_rfc3339(),
                                });
                            }
                            Ok(None) => break,
                            Err(_) => break,
                        }
                    }
                }
            }

            // Wait for the child to exit naturally
            let exit_code = child.wait().await.ok().and_then(|s| s.code());
            let exit_type = match exit_code {
                Some(0) => "info",
                _ => "error",
            };

            let _ = ah.emit("process-output", StreamMessage {
                process_id: pid.clone(),
                project_name: pname.clone(),
                config_name: cname.clone(),
                output_type: exit_type.to_string(),
                content: format!(
                    "■ Process exited with code: {}",
                    exit_code.map(|c| c.to_string()).unwrap_or_else(|| "unknown".to_string())
                ),
                timestamp: chrono::Local::now().to_rfc3339(),
            });

            let _ = ah.emit("process-exit", serde_json::json!({
                "process_id": pid,
                "exit_code": exit_code,
            }));

            // Mark as stopped
            {
                let mut info_map = process_info_ref.lock().await;
                if let Some(info) = info_map.get_mut(&pid) {
                    info.status = "stopped".to_string();
                }
            }
            // Remove from active map
            {
                let mut active = active_ref.lock().await;
                active.remove(&pid);
            }
        });

        // Store handle + PID
        {
            let mut active = self.active.lock().await;
            active.insert(process_id.clone(), ActiveEntry { handle, pid: os_pid });
        }

        Ok(info)
    }

    pub async fn stop(&self, process_id: &str, app_handle: &AppHandle) -> Result<(), String> {
        let entry = {
            let mut active = self.active.lock().await;
            active.remove(process_id)
        };

        if let Some(entry) = entry {
            // 1. Kill the OS process tree (sbt → JVM, npm → node, etc.)
            Self::kill_by_pid(entry.pid).await;
            // 2. Abort the tokio reader task
            entry.handle.abort();
        }

        // Update metadata
        {
            let mut info_map = self.process_info.lock().await;
            if let Some(info) = info_map.get_mut(process_id) {
                info.status = "stopped".to_string();
            }
        }

        let _ = app_handle.emit("process-output", StreamMessage {
            process_id: process_id.to_string(),
            project_name: String::new(),
            config_name: String::new(),
            output_type: "info".to_string(),
            content: "■ Process stopped by user".to_string(),
            timestamp: chrono::Local::now().to_rfc3339(),
        });

        let _ = app_handle.emit("process-exit", serde_json::json!({
            "process_id": process_id,
            "exit_code": null,
        }));

        Ok(())
    }

    pub async fn get_active_processes(&self) -> Vec<ProcessInfo> {
        let info_map = self.process_info.lock().await;
        let active = self.active.lock().await;
        info_map.values()
            .filter(|p| active.contains_key(&p.id) && p.status == "running")
            .cloned()
            .collect()
    }
}

// ─── Tauri Commands ───────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ExecutionResult {
    pub stdout: String,
    pub stderr: String,
    pub exit_code: Option<i32>,
}

#[command]
pub async fn spawn_project_command(
    app_handle: AppHandle,
    state: tauri::State<'_, crate::AppState>,
    project_id: String,
    config_index: usize,
) -> Result<ProcessInfo, String> {
    let (project_name, config_name, final_command, working_dir, env_vars) = {
        let projects = state.projects.lock().await;
        let project = projects.get(&project_id).ok_or("Project not found")?;
        let config = project.configurations.get(config_index)
            .ok_or("Config index out of bounds")?;

        let cmd = build_command_with_paths(config, project).await?;
        let wd = if config.working_dir.as_os_str().is_empty() || !config.working_dir.exists() {
            project.path.clone()
        } else {
            config.working_dir.clone()
        };
        (
            project.name.clone(),
            config.name.clone(),
            cmd,
            wd,
            config.env_vars.clone(),
        )
    };

    let process_id = Uuid::new_v4().to_string();

    state.process_manager.spawn_streaming(
        app_handle,
        process_id,
        project_id,
        project_name,
        config_name,
        final_command,
        working_dir,
        env_vars,
    ).await
}

#[command]
pub async fn stop_process(
    app_handle: AppHandle,
    state: tauri::State<'_, crate::AppState>,
    process_id: String,
) -> Result<(), String> {
    state.process_manager.stop(&process_id, &app_handle).await
}

#[command]
pub async fn get_active_processes(
    state: tauri::State<'_, crate::AppState>,
) -> Result<Vec<ProcessInfo>, String> {
    Ok(state.process_manager.get_active_processes().await)
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async fn build_command_with_paths(
    config: &crate::models::project::ProjectConfig,
    _project: &crate::models::project::Project,
) -> Result<String, String> {
    let mut command = config.command.clone();

    if let Some(java_home) = &config.custom_paths.java_home {
        command = format!("$env:JAVA_HOME='{}'; $env:Path=\"$env:JAVA_HOME\\bin;$env:Path\"; {}", java_home, command);
    }

    if let Some(sbt_path) = &config.custom_paths.sbt_path {
        command = command.replace("sbt", &format!("\"{}\"", sbt_path));
    }

    if let Some(python_main) = &config.custom_paths.python_main {
        command = command.replace("main.py", python_main);
    }

    if let Some(dotnet_project) = &config.custom_paths.dotnet_project {
        command = command.replace("--project", &format!("--project \"{}\"", dotnet_project));
    }

    Ok(command)
}
