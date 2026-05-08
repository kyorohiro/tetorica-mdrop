mod bonjour;
mod http_utils;
mod hello;
mod http;

use axum::http::HeaderMap;
use axum::http::Method;
use axum::response::Html;
use axum::{
    body::Body,
    extract::ConnectInfo,
    http::{Request, StatusCode},
    middleware::{self, Next},
};
use axum::{
    extract::{Path, State as AxumState},
    http::header,
    response::Response,
    routing::get,
    Router,
};

use if_addrs::get_if_addrs;
use local_ip_address::local_ip;
use serde::{Deserialize, Serialize};
use serde_json::value::Index;
use std::net::SocketAddr;
use std::net::{IpAddr, Ipv4Addr, Ipv6Addr};
use std::{
    collections::HashMap,
    path::PathBuf,
    sync::{Arc, Mutex},
};
use tauri::State;
use tokio::{net::TcpListener, sync::oneshot};
use tower_http::cors::{Any, CorsLayer};
//

use tokio::io::{AsyncReadExt, AsyncSeekExt};
use tokio_util::io::ReaderStream;

use crate::bonjour::{BonjourStatus, SharedBonjourContext};
use crate::http_utils::HttpState;
use crate::http_utils::ServerControl;
use crate::http_utils::ServerStatus;
use crate::http_utils::SharedFileControl;
use crate::http_utils::access_guard_middleware;
use crate::http_utils::download_file;
use crate::http_utils::is_local_ip;
use crate::http_utils::list_ips;



#[derive(Debug, Clone, Serialize)]
struct SharedFileInfo {
    id: String,
    name: String,
    path: String,
    url: String,
}


async fn run_http_server(
    port: u16,
    shutdown_rx: oneshot::Receiver<()>,
    http_state: HttpState,
) -> Result<(), String> {
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods([Method::GET, Method::OPTIONS])
        .allow_headers(Any);

    let app = Router::new()
        .route("/hello", get(hello::hello()))
        .route("/", get(http_utils::index))
        .route("/download/{id}", get(download_file))
        .route_layer(middleware::from_fn_with_state(
            http_state.clone(),
            access_guard_middleware,
        ))
        .layer(cors)
        .with_state(http_state);

    let listener = TcpListener::bind(format!("0.0.0.0:{port}"))
        .await
        .map_err(|e| e.to_string())?;

    println!("Server started on http://0.0.0.0:{port}");

    axum::serve(
        listener,
        app.into_make_service_with_connect_info::<SocketAddr>(),
    )
    .with_graceful_shutdown(async {
        shutdown_rx.await.ok();
        println!("Server shutting down...");
    })
    .await
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
fn greet(name: &str) -> String {
    return hello::greet(name);
}

#[tauri::command]
async fn set_local_only(state: State<'_, AppState>, enabled: bool) -> Result<ServerStatus, String> {
    let mut server = state.server.lock().map_err(|e| e.to_string())?;
    server.local_only = enabled;
    Ok(server.status.clone())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let shared_files = Arc::new(Mutex::new(SharedFileControl {
        files: HashMap::new(),
    }));

    tauri::Builder::default()
        .manage(AppState {
            server: Arc::new(Mutex::new(ServerControl {
                status: ServerStatus {
                    running: false,
                    port: None,
                    url: None,
                    hostname: None,
                    ips: None,
                },
                shutdown_tx: None,
                local_only: true,
            })),
            bonjour: SharedBonjourContext::new(),
            shared_files,
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
    server: Arc<Mutex<ServerControl>>,
    bonjour: SharedBonjourContext,
    shared_files: Arc<Mutex<SharedFileControl>>,
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
    println!("> start_server");

    let port: u16 = req.port.parse().map_err(|_| "invalid port".to_string())?;

    let hostname = req.hostname.trim().trim_end_matches('/').to_string();

    {
        let server = state.server.lock().map_err(|e| e.to_string())?;
        if server.status.running {
            return Ok(server.status.clone());
        }
    }

    let (tx, rx) = oneshot::channel();

    let http_state = HttpState {
        shared_files: state.shared_files.clone(),
        server: state.server.clone(),
    };

    tokio::spawn(async move {
        if let Err(e) = run_http_server(port, rx, http_state).await {
            eprintln!("server error: {e}");
        }
    });

    let ip = local_ip().map_err(|e| e.to_string())?;
    let mut server = state.server.lock().map_err(|e| e.to_string())?;
    server.status = ServerStatus {
        running: true,
        port: Some(port),
        url: Some(format!("http://{}:{port}/", ip)),
        hostname: Some(hostname),
        ips: Some(list_ips()),
    };
    server.shutdown_tx = Some(tx);

    Ok(server.status.clone())
}

#[tauri::command]
async fn stop_server(state: State<'_, AppState>) -> Result<ServerStatus, String> {
    println!("> stop_server");

    let shutdown_tx = {
        let mut server = state.server.lock().map_err(|e| e.to_string())?;

        if !server.status.running {
            return Ok(server.status.clone());
        }

        server.status = ServerStatus {
            running: false,
            port: None,
            url: None,
            hostname: None,
            ips: None,
        };

        server.shutdown_tx.take()
    };

    if let Some(tx) = shutdown_tx {
        let _ = tx.send(());
    }

    let server = state.server.lock().map_err(|e| e.to_string())?;
    Ok(server.status.clone())
}

#[tauri::command]
async fn get_server_status(state: State<'_, AppState>) -> Result<ServerStatus, String> {
    let server = state.server.lock().map_err(|e| e.to_string())?;
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
        let server = state.server.lock().map_err(|e| e.to_string())?;
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
        let mut shared = state.shared_files.lock().map_err(|e| e.to_string())?;
        shared.files.insert(id.clone(), path);
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
        let server = app_tauri_state.server.lock().map_err(|e| e.to_string())?;
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
