mod bonjour;
mod hello;
mod http;
mod http_utils;
mod http_file;

use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    path::PathBuf,
    sync::{Arc, Mutex},
};
use tauri::State;
//

use crate::bonjour::{BonjourStatus, SharedBonjourContext};
use crate::http::{ServerStatus, SharedHttpServerContext};
use crate::http_utils::SharedFileControl;

#[derive(Debug, Clone, Serialize)]
struct SharedFileInfo {
    id: String,
    name: String,
    path: String,
    url: String,
}

#[tauri::command]
fn greet(name: &str) -> String {
    return hello::greet(name);
}

#[tauri::command]
async fn set_local_only(state: State<'_, AppState>, enabled: bool) -> Result<ServerStatus, String> {
    let mut server = state.server2.inner.lock().map_err(|e| e.to_string())?;
    server.local_only = enabled;
    return Ok(server.status.clone());
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let shared_files = Arc::new(Mutex::new(SharedFileControl {
        files: HashMap::new(),
    }));

    tauri::Builder::default()
        .manage(AppState {
            server2: SharedHttpServerContext::new(),
            bonjour: SharedBonjourContext::new()
        })
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            start_server,
            stop_server,
            get_server_status,
            start_bonjour,
            stop_bonjour,
            get_bonjour_status,
            share_file,
            set_local_only,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

struct AppState {
    //server: Arc<Mutex<ServerControl>>,
    server2: SharedHttpServerContext,
    bonjour: SharedBonjourContext,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StartServerRequest {
    hostname: String,
    port: String,
}

#[tauri::command]
async fn start_server(
    state: State<'_, AppState>,
    req: StartServerRequest,
) -> Result<ServerStatus, String> {
    println!("> start_server!");

    let port: u16 = req.port.parse().map_err(|_| "invalid port".to_string())?;

    let hostname = req.hostname.trim().trim_end_matches('/').to_string();

    let status = state.server2.start_server(hostname, port)?;
    //
    //
    Ok(status)
}

#[tauri::command]
async fn stop_server(state: State<'_, AppState>) -> Result<ServerStatus, String> {
    println!("> stop_server");

    let state = state.server2.stop_server();
 
    return state;
}

#[tauri::command]
async fn get_server_status(state: State<'_, AppState>) -> Result<ServerStatus, String> {
    let server = state.server2.inner.lock().map_err(|e| e.to_string())?;
    Ok(server.status.clone())
}

#[derive(Debug, Deserialize)]
struct ShareFileRequest {
    path: String,
}

#[tauri::command]
async fn share_file(
    state: State<'_, AppState>,
    req: ShareFileRequest,
) -> Result<SharedFileInfo, String> {
    println!("> share_file {}", req.path);

    let path = PathBuf::from(&req.path);

    if !path.is_file() {
        return Err("not a file".to_string());
    }

    let name = path
        .file_name()
        .ok_or("invalid file name")?
        .to_string_lossy()
        .to_string();

    let id = format!("{}", chrono::Utc::now().timestamp_millis());

    let (hostname, port) = {
        let server = state.server2.inner.lock().map_err(|e| e.to_string())?;
        (
            server
                .status
                .hostname
                .clone()
                .ok_or("server hostname is none")?,
            server.status.port.ok_or("server not running")?,
        )
    };

    {
        state.server2.inner.lock().unwrap().files.insert(id.clone(), path.clone());
    }
    Ok(SharedFileInfo {
        id: id.clone(),
        name,
        path: req.path,
        url: format!("http://{hostname}:{port}/download/{id}"),
    })
}

#[tauri::command]
async fn start_bonjour(app_tauri_state: State<'_, AppState>) -> Result<BonjourStatus, String> {
    println!("> start_bonjour");

    let (hostname, port) = {
        let server = app_tauri_state.server2.inner.lock().map_err(|e| e.to_string())?;
        (
            server
                .status
                .hostname
                .clone()
                .ok_or("server hostname is none")?,
            server.status.port.ok_or("server not running")?,
        )
    };

    let status = app_tauri_state.bonjour.start(hostname, port)?;
    //state.bonjour.start_reannounce()?;
    Ok(status)
}

#[tauri::command]
async fn stop_bonjour(app_tauri_state: State<'_, AppState>) -> Result<BonjourStatus, String> {
    println!("> stop_bonjour");

    //state.bonjour.stop_reannounce()?;
    return app_tauri_state.bonjour.stop();
}

#[tauri::command]
async fn get_bonjour_status(app_tauri_state: State<'_, AppState>) -> Result<BonjourStatus, String> {
    return app_tauri_state.bonjour.status();
}
