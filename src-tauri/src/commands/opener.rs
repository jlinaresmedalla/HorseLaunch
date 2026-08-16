use std::path::PathBuf;

use tauri::{command, State};
use tokio::process::Command;

use crate::AppState;

const VSCODE_APP_PATH: &str = "/Applications/Visual Studio Code.app";

async fn registered_project_path(
    state: &State<'_, AppState>,
    project_id: &str,
) -> Result<PathBuf, String> {
    let projects = state.projects.lock().await;
    let project = projects
        .get(project_id)
        .ok_or_else(|| "El proyecto no está registrado en HorseLaunch".to_string())?;

    let path = std::fs::canonicalize(&project.path)
        .map_err(|error| format!("No se pudo resolver la ruta del proyecto: {error}"))?;

    if !path.is_dir() {
        return Err("La ruta del proyecto no es una carpeta".to_string());
    }

    Ok(path)
}

async fn run_macos_open(args: &[&std::ffi::OsStr]) -> Result<(), String> {
    let output = Command::new("/usr/bin/open")
        .args(args)
        .output()
        .await
        .map_err(|error| format!("No se pudo ejecutar /usr/bin/open: {error}"))?;

    if output.status.success() {
        return Ok(());
    }

    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    if stderr.is_empty() {
        Err(format!("/usr/bin/open terminó con estado {}", output.status))
    } else {
        Err(stderr)
    }
}

#[command]
pub async fn open_project_in_finder(
    state: State<'_, AppState>,
    project_id: String,
) -> Result<(), String> {
    let project_path = registered_project_path(&state, &project_id).await?;
    run_macos_open(&[project_path.as_os_str()]).await
}

#[command]
pub async fn open_project_in_vscode(
    state: State<'_, AppState>,
    project_id: String,
) -> Result<(), String> {
    let project_path = registered_project_path(&state, &project_id).await?;
    let vscode_path = PathBuf::from(VSCODE_APP_PATH);

    if !vscode_path.is_dir() {
        return Err(format!("No se encontró Visual Studio Code en {VSCODE_APP_PATH}"));
    }

    run_macos_open(&[
        std::ffi::OsStr::new("-a"),
        vscode_path.as_os_str(),
        project_path.as_os_str(),
    ])
    .await
}
