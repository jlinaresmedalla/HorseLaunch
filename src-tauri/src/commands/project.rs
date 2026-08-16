use std::path::PathBuf;
use std::collections::HashMap;
use tauri::{command, Emitter};
use uuid::Uuid;
use notify::{Watcher, RecursiveMode, Event};
use super::super::models::project::{Project, ProjectConfig, CustomPaths, ProjectType};
use super::detection::{ProjectDetector, DetectedInfo};
use crate::AppState;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

/// Crea un Command de git sin ventana de consola en Windows.
fn create_git_command() -> std::process::Command {
    let mut cmd = std::process::Command::new("git");
    #[cfg(target_os = "windows")]
    {
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    cmd
}

/// Devuelve la rama git activa del proyecto, o None si no es un repo git.
#[command]
pub async fn get_git_branch(path: String) -> Result<Option<String>, String> {
    let output = create_git_command()
        .args(["rev-parse", "--abbrev-ref", "HEAD"])
        .current_dir(&path)
        .output();

    match output {
        Ok(out) if out.status.success() => {
            let branch = String::from_utf8_lossy(&out.stdout).trim().to_string();
            if branch.is_empty() {
                Ok(None)
            } else {
                Ok(Some(branch))
            }
        }
        _ => Ok(None), // No es un repo git o git no está instalado
    }
}

#[command]
pub async fn add_project(
    state: tauri::State<'_, AppState>,
    path: String,
) -> Result<Project, String> {
    let project_path = PathBuf::from(&path);
    
    if !project_path.exists() {
        return Err("Path does not exist".to_string());
    }
    
    // Detectar tipo de proyecto
    let detected = ProjectDetector::detect_project(&project_path)
        .ok_or("Could not detect project type")?;
    
    // Crear configuraciones por defecto según el tipo
    let configurations = create_default_configs(&detected, &project_path);
    
    let project = Project {
        id: Uuid::new_v4().to_string(),
        name: project_path.file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string(),
        path: project_path.clone(), 
        project_type: detected.project_type,
        language_version: detected.version,
        configurations,
        env_files: if detected.has_env_file {
            vec![project_path.join(".env")]
        } else {
            vec![]
        },
        last_used: Some(chrono::Local::now()),
    };
    
    // Guardar en estado
    let mut projects = state.projects.lock().await;
    projects.insert(project.id.clone(), project.clone());
    
    // Persistir a archivo
    save_projects_to_file(&projects).await?;
    
    Ok(project)
}

fn create_default_configs(detected: &DetectedInfo, project_path: &PathBuf) -> Vec<ProjectConfig> {
    let mut configs = Vec::new();
    
    match detected.project_type {
        ProjectType::Python => {
            for cmd in &detected.available_commands {
                if cmd.starts_with("run:") {
                    let script_name = cmd.replace("run:", "");

                    // A virtualenv lays out its activate script differently per platform:
                    // Scripts\activate on Windows, bin/activate everywhere else, where it
                    // also has to be sourced rather than executed.
                    #[cfg(target_os = "windows")]
                    let activate = ".venv\\Scripts\\activate".to_string();
                    #[cfg(not(target_os = "windows"))]
                    let activate = ". .venv/bin/activate".to_string();

                    configs.push(ProjectConfig {
                        name: script_name.clone(),
                        command: format!(
                            "{} && python {}",
                            activate,
                            script_name
                        ),
                        working_dir: project_path.clone(),
                        env_vars: HashMap::from([
                            ("ENV".to_string(), "dev".to_string()),
                            ("PYTHONPATH".to_string(), ".".to_string()),
                        ]),
                        requires_build: false,
                        build_command: None,
                        custom_paths: CustomPaths::default(),
                        group: None,
                    });
                }
            }
        }
        ProjectType::Scala => {
            configs.push(ProjectConfig {
                name: "run".to_string(),
                command: "sbt run".to_string(),
                working_dir: project_path.clone(),
                env_vars: HashMap::from([
                    ("ENV".to_string(), "dev".to_string()),
                ]),
                requires_build: false,
                build_command: Some("sbt compile".to_string()),
                custom_paths: CustomPaths {
                    java_home: None,
                    sbt_path: None,
                    ..Default::default()
                },
                group: None,
            });
            configs.push(ProjectConfig {
                name: "compile".to_string(),
                command: "sbt compile".to_string(),
                working_dir: project_path.clone(),
                env_vars: HashMap::new(),
                requires_build: true,
                build_command: None,
                custom_paths: CustomPaths::default(),
                group: None,
            });
        }
        ProjectType::CSharp => {
            if let Some(csproj) = ProjectDetector::find_csproj(project_path) {
                let _project_name = csproj.file_stem().unwrap_or_default().to_string_lossy();
                configs.push(ProjectConfig {
                    name: "run".to_string(),
                    command: format!("dotnet run --project {}", csproj.display()),
                    working_dir: project_path.clone(),
                    env_vars: HashMap::from([
                        ("ASPNETCORE_ENVIRONMENT".to_string(), "Development".to_string()),
                    ]),
                    requires_build: true,
                    build_command: Some(format!("dotnet build {}", csproj.display())),
                    custom_paths: CustomPaths::default(),
                    group: None,
                });
                configs.push(ProjectConfig {
                    name: "build".to_string(),
                    command: format!("dotnet build {}", csproj.display()),
                    working_dir: project_path.clone(),
                    env_vars: HashMap::new(),
                    requires_build: true,
                    build_command: None,
                    custom_paths: CustomPaths::default(),
                    group: None,
                });
            }
        }
        ProjectType::React => {
            for cmd in &detected.available_commands {
                configs.push(ProjectConfig {
                    name: cmd.clone(),
                    command: format!("npm run {}", cmd),
                    working_dir: project_path.clone(),
                    env_vars: HashMap::new(),
                    requires_build: cmd == "build",
                    build_command: if cmd == "build" { None } else { Some("npm run build".to_string()) },
                    custom_paths: CustomPaths::default(),
                    group: None,
                });
            }
        }
        ProjectType::JavaScript => {
            for cmd in &detected.available_commands {
                configs.push(ProjectConfig {
                    name: cmd.clone(),
                    command: format!("npm run {}", cmd),
                    working_dir: project_path.clone(),
                    env_vars: HashMap::new(),
                    requires_build: cmd == "build",
                    build_command: if cmd == "build" { None } else { Some("npm run build".to_string()) },
                    custom_paths: CustomPaths::default(),
                    group: None,
                });
            }
        }
        _ => {}
    }
    
    configs
}

// Persistencia
async fn save_projects_to_file(projects: &HashMap<String, Project>) -> Result<(), String> {
    let config_dir = dirs::config_dir()
        .ok_or("Could not find config dir")?
        .join("launcherapp");
    
    tokio::fs::create_dir_all(&config_dir).await
        .map_err(|e| e.to_string())?;
    
    let config_file = config_dir.join("projects.json");
    let data = serde_json::to_string_pretty(projects)
        .map_err(|e| e.to_string())?;
    
    tokio::fs::write(config_file, data).await
        .map_err(|e| e.to_string())
}

#[command]
pub async fn get_projects(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<Project>, String> {
    let projects = state.projects.lock().await;
    let projects_vec: Vec<Project> = projects.values().cloned().collect();
    Ok(projects_vec)
}

#[command]
pub async fn remove_project(
    state: tauri::State<'_, AppState>,
    id: String,
) -> Result<(), String> {
    let mut projects = state.projects.lock().await;
    projects.remove(&id);
    save_projects_to_file(&projects).await?;
    Ok(())
}

#[command]
pub async fn clear_all_projects(
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    let mut projects = state.projects.lock().await;
    projects.clear();
    save_projects_to_file(&projects).await?;
    Ok(())
}

#[command]
pub async fn update_project_config(
    state: tauri::State<'_, AppState>,
    project_id: String,
    config_index: usize,
    updated_config: ProjectConfig,
) -> Result<Project, String> {
    // Primer bloque: modificar el proyecto
    let updated_project = {
        let mut projects = state.projects.lock().await;
        
        let project = projects.get_mut(&project_id)
            .ok_or("Project not found")?;
        
        if config_index >= project.configurations.len() {
            return Err("Configuration index out of bounds".to_string());
        }
        
        project.configurations[config_index] = updated_config;
        project.clone() // Clonar antes de que termine el bloque
    }; // El lock se libera aquí automáticamente
    
    // Segundo bloque: guardar con un lock nuevo
    {
        let projects = state.projects.lock().await;
        save_projects_to_file(&projects).await?;
    }
    
    Ok(updated_project)
}

#[command]
pub async fn add_custom_command(
    state: tauri::State<'_, AppState>,
    project_id: String,
    new_config: ProjectConfig,
) -> Result<Project, String> {
    let updated_project = {
        let mut projects = state.projects.lock().await;
        let project = projects.get_mut(&project_id).ok_or("Project not found")?;
        project.configurations.push(new_config);
        project.clone()
    };

    {
        let projects = state.projects.lock().await;
        save_projects_to_file(&projects).await?;
    }

    Ok(updated_project)
}

#[command]
pub async fn delete_project_config(
    state: tauri::State<'_, AppState>,
    project_id: String,
    config_index: usize,
) -> Result<Project, String> {
    let updated_project = {
        let mut projects = state.projects.lock().await;
        let project = projects.get_mut(&project_id).ok_or("Project not found")?;

        if config_index >= project.configurations.len() {
            return Err("Configuration index out of bounds".to_string());
        }

        project.configurations.remove(config_index);
        project.clone()
    };

    {
        let projects = state.projects.lock().await;
        save_projects_to_file(&projects).await?;
    }

    Ok(updated_project)
}

pub async fn load_projects_from_file() -> Result<HashMap<String, Project>, String> {
    let config_dir = dirs::config_dir()
        .ok_or("Could not find config dir")?
        .join("launcherapp");
    
    let config_file = config_dir.join("projects.json");
    
    if !config_file.exists() {
        return Ok(HashMap::new());
    }
    
    let data = tokio::fs::read_to_string(config_file).await
        .map_err(|e| e.to_string())?;
    
    let projects: HashMap<String, Project> = serde_json::from_str(&data)
        .map_err(|e| e.to_string())?;
    
    Ok(projects)
}

#[command]
pub async fn watch_git_branch(
    state: tauri::State<'_, AppState>,
    project_id: String,
    project_path: String,
    app_handle: tauri::AppHandle,
) -> Result<bool, String> {
    // 1. Unwatch previous watcher for this project if it exists
    {
        let mut watchers = state.git_watchers.lock().await;
        watchers.remove(&project_id);
    }

    let git_dir = PathBuf::from(&project_path).join(".git");
    if !git_dir.exists() {
        return Ok(false); // Not a git repository
    }

    let project_id_clone = project_id.clone();
    let project_path_clone = project_path.clone();
    let app_handle_clone = app_handle.clone();

    // 2. Create the watcher
    let mut watcher = notify::recommended_watcher(move |res: Result<Event, notify::Error>| {
        if let Ok(event) = res {
            if event.paths.iter().any(|p| p.ends_with("HEAD")) {
                let _ = app_handle_clone.emit("git-branch-changed", serde_json::json!({
                    "project_id": project_id_clone,
                    "project_path": project_path_clone
                }));
            }
        }
    }).map_err(|e| e.to_string())?;

    // 3. Start watching the .git directory non-recursively
    watcher.watch(&git_dir, RecursiveMode::NonRecursive)
        .map_err(|e| e.to_string())?;

    // 4. Save to AppState to keep it alive
    {
        let mut watchers = state.git_watchers.lock().await;
        watchers.insert(project_id, watcher);
    }

    Ok(true)
}

#[command]
pub async fn unwatch_git_branch(
    state: tauri::State<'_, AppState>,
    project_id: String,
) -> Result<(), String> {
    let mut watchers = state.git_watchers.lock().await;
    watchers.remove(&project_id);
    Ok(())
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct BackendResponse {
    pub status: u16,
    pub headers: HashMap<String, String>,
    pub body: String,
}

#[command]
pub async fn fetch_external_url(url: String) -> Result<String, String> {
    let agent = ureq::AgentBuilder::new()
        .timeout(std::time::Duration::from_secs(12))
        .build();

    let response = agent.get(&url)
        .set("Accept", "application/json, text/plain, */*")
        .call()
        .map_err(|e| e.to_string())?;

    response.into_string().map_err(|e| e.to_string())
}

#[command]
pub async fn execute_backend_request(
    url: String,
    method: String,
    headers: HashMap<String, String>,
    body: Option<String>,
) -> Result<BackendResponse, String> {
    let agent = ureq::AgentBuilder::new()
        .timeout(std::time::Duration::from_secs(15))
        .build();

    let mut request = agent.request(&method.to_uppercase(), &url);

    // Set headers
    for (k, v) in headers {
        request = request.set(&k, &v);
    }

    let response = if let Some(body_content) = body {
        request.send_string(&body_content)
    } else {
        request.call()
    };

    let response = response.map_err(|e| e.to_string())?;
    let status = response.status();
    
    // Get headers
    let mut response_headers = HashMap::new();
    // ureq response doesn't expose header keys directly easily in v2 without iterate or get. 
    // We can extract common ones or loop:
    for header_name in &["content-type", "content-length", "date", "server", "cache-control", "authorization"] {
        if let Some(val) = response.header(header_name) {
            response_headers.insert(header_name.to_string(), val.to_string());
        }
    }

    let body = response.into_string().unwrap_or_else(|_| "".to_string());

    Ok(BackendResponse {
        status,
        headers: response_headers,
        body,
    })
}