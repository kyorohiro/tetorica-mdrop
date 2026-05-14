use tetorica_mdrop_core::bonjour::{BonjourStatus, SharedBonjourContext};
use tetorica_mdrop_core::hello;
use tetorica_mdrop_core::http::{ServerStatus, SharedHttpServerContext};
use tetorica_mdrop_core::http_utils::SharedFileControl;

use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    path::PathBuf,
    sync::{Arc, Mutex},
};
use tauri::State;

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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let server2 = SharedHttpServerContext::new();
    let bonjour = SharedBonjourContext::new();
    let shared_files = Arc::new(Mutex::new(SharedFileControl {
        files: HashMap::new(),
    }));

    tauri::Builder::default()
        .manage(AppState {
            server2: server2.clone(),
            bonjour,
        })
        .setup(move |app| {
            use tauri::Emitter;

            println!("setup message callback");

            let app_handle = app.handle().clone();

            server2.set_message_callback(move |msg| {
                println!("callback received: {:?}", msg);

                let ret = app_handle.emit("message-received", msg);
                println!("emit result: {:?}", ret);
            });

            Ok(())
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
            unshare_file,
            unshare_all_files,
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
    id: Option<String>,
    password: Option<String>,
    is_https: Option<bool>,
    local_only: Option<bool>,
}

#[tauri::command]
async fn start_server(
    state: State<'_, AppState>,
    req: StartServerRequest,
) -> Result<ServerStatus, String> {
    println!("> start_server! {:?}", req);

    let port: u16 = req.port.parse().map_err(|_| "invalid port".to_string())?;

    let hostname = req.hostname.trim().trim_end_matches('/').to_string();
    let is_https: bool = req.is_https.unwrap_or(false);
    let local_only: bool = req.local_only.unwrap_or(true);
    let status = state.server2.start_server(
        hostname,
        port,
        req.id,
        req.password,
        Some(is_https),
        Some(local_only),
    )?;
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

#[derive(Debug, Deserialize)]
struct UnshareFileRequest {
    id: String,
}

#[tauri::command]
async fn unshare_file(state: State<'_, AppState>, req: UnshareFileRequest) -> Result<(), String> {
    println!("> unshare_file {}", req.id);

    let mut server = state.server2.inner.lock().map_err(|e| e.to_string())?;

    if server.files.remove(&req.id).is_none() {
        return Err("shared file not found".to_string());
    }

    Ok(())
}

#[tauri::command]
async fn unshare_all_files(state: State<'_, AppState>) -> Result<(), String> {
    println!("> unshare_all_files");

    let mut server = state.server2.inner.lock().map_err(|e| e.to_string())?;
    server.files.clear();

    Ok(())
}

#[tauri::command]
async fn share_file(
    state: State<'_, AppState>,
    req: ShareFileRequest,
) -> Result<SharedFileInfo, String> {
    println!("> share_file {}", req.path);

    let path = PathBuf::from(&req.path);

    //if !path.is_file() {
    //    return Err("not a file".to_string());
    //}

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
        state
            .server2
            .inner
            .lock()
            .unwrap()
            .files
            .insert(id.clone(), path.clone());
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
        let server = app_tauri_state
            .server2
            .inner
            .lock()
            .map_err(|e| e.to_string())?;
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
