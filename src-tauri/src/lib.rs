use axum::response::Html;
use axum::{
    extract::{Path, State as AxumState},
    http::header,
    response::{IntoResponse, Response},
    routing::get,
    Router,
};
use local_ip_address::local_ip;
use mdns_sd::{ServiceDaemon, ServiceInfo};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    path::PathBuf,
    sync::{Arc, Mutex},
};
use tauri::State;
use tokio::{net::TcpListener, sync::oneshot};

async fn hello() -> &'static str {
    "hello, world"
}

async fn index(AxumState(state): AxumState<HttpState>) -> Html<String> {
    let items = {
        let shared = match state.shared_files.lock() {
            Ok(shared) => shared,
            Err(_) => {
                return Html("<h1>Internal Server Error</h1>".to_string());
            }
        };

        shared
            .files
            .iter()
            .map(|(id, path)| {
                let name = path
                    .file_name()
                    .and_then(|v| v.to_str())
                    .unwrap_or("download");

                format!(r#"<li><a href="/download/{id}">{name}</a></li>"#)
            })
            .collect::<Vec<_>>()
            .join("\n")
    };

    let body = if items.is_empty() {
        "<p>No shared files yet.</p>".to_string()
    } else {
        format!("<ul>{items}</ul>")
    };

    Html(format!(
        r#"<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Tetorica Home Server</title>
</head>
<body>
  <h1>Tetorica Home Server</h1>
  {body}
</body>
</html>"#
    ))
}

#[derive(Debug, Clone, Serialize)]
struct SharedFileInfo {
    id: String,
    name: String,
    path: String,
    url: String,
}

struct SharedFileControl {
    files: HashMap<String, PathBuf>,
}

#[derive(Clone)]
struct HttpState {
    shared_files: Arc<Mutex<SharedFileControl>>,
}

async fn download_file(
    AxumState(state): AxumState<HttpState>,
    Path(id): Path<String>,
) -> Result<Response, String> {
    let path = {
        let shared = state.shared_files.lock().map_err(|e| e.to_string())?;
        shared.files.get(&id).cloned().ok_or("not found")?
    };

    let bytes = tokio::fs::read(&path).await.map_err(|e| e.to_string())?;

    let filename = path
        .file_name()
        .and_then(|v| v.to_str())
        .unwrap_or("download.bin");

    let headers = [
        (header::CONTENT_TYPE, "application/octet-stream".to_string()),
        (
            header::CONTENT_DISPOSITION,
            format!("attachment; filename=\"{}\"", filename),
        ),
    ];

    Ok((headers, bytes).into_response())
}

#[derive(Debug, Clone, Serialize)]
struct BonjourStatus {
    running: bool,
    service_name: Option<String>,
    service_type: Option<String>,
    port: Option<u16>,
}

struct BonjourControl {
    status: BonjourStatus,
    daemon: Option<ServiceDaemon>,
}

async fn run_http_server(
    port: u16,
    shutdown_rx: oneshot::Receiver<()>,
    http_state: HttpState,
) -> Result<(), String> {
    let app = Router::new()
        .route("/hello", get(hello))
        .route("/", get(index))
        .route("/download/{id}", get(download_file))
        .with_state(http_state);

    let listener = TcpListener::bind(format!("0.0.0.0:{port}"))
        .await
        .map_err(|e| e.to_string())?;

    println!("Server started on http://0.0.0.0:{port}");

    axum::serve(listener, app)
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
    println!("> greet {}", name);
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let shared_files = Arc::new(Mutex::new(SharedFileControl {
        files: HashMap::new(),
    }));

    tauri::Builder::default()
        .manage(AppState {
            server: Mutex::new(ServerControl {
                status: ServerStatus {
                    running: false,
                    port: None,
                    url: None,
                },
                shutdown_tx: None,
            }),
            bonjour: Mutex::new(BonjourControl {
                status: BonjourStatus {
                    running: false,
                    service_name: None,
                    service_type: None,
                    port: None,
                },
                daemon: None,
            }),
            shared_files,
        })
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            start_server,
            stop_server,
            get_server_status,
            start_bonjour,
            stop_bonjour,
            get_bonjour_status,
            share_file,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[derive(Debug, Clone, Serialize)]
struct ServerStatus {
    running: bool,
    port: Option<u16>,
    url: Option<String>,
}

struct ServerControl {
    status: ServerStatus,
    shutdown_tx: Option<oneshot::Sender<()>>,
}

struct AppState {
    server: Mutex<ServerControl>,
    bonjour: Mutex<BonjourControl>,
    shared_files: Arc<Mutex<SharedFileControl>>,
}

#[tauri::command]
async fn start_server(state: State<'_, AppState>) -> Result<ServerStatus, String> {
    println!("> start_server");

    {
        let server = state.server.lock().map_err(|e| e.to_string())?;
        if server.status.running {
            return Ok(server.status.clone());
        }
    }

    let port = 7878;
    let (tx, rx) = oneshot::channel();

    let http_state = HttpState {
        shared_files: state.shared_files.clone(),
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

    let port = {
        let server = state.server.lock().map_err(|e| e.to_string())?;
        server.status.port.ok_or("server not running")?
    };

    {
        let mut shared = state.shared_files.lock().map_err(|e| e.to_string())?;
        shared.files.insert(id.clone(), path);
    }

    Ok(SharedFileInfo {
        id: id.clone(),
        name,
        path: req.path,
        url: format!("http://tetorica-home.local:{port}/download/{id}"),
    })
}

#[tauri::command]
async fn start_bonjour(state: State<'_, AppState>) -> Result<BonjourStatus, String> {
    println!("> start_bonjour");

    let port = {
        let server = state.server.lock().map_err(|e| e.to_string())?;

        if !server.status.running {
            return Err("server is not running".to_string());
        }

        server.status.port.ok_or("server port is none")?
    };

    let mut bonjour = state.bonjour.lock().map_err(|e| e.to_string())?;

    if bonjour.status.running {
        return Ok(bonjour.status.clone());
    }

    let service_type = "_http._tcp.local.";
    let service_name = "Tetorica Home Server";

    let daemon = ServiceDaemon::new().map_err(|e| e.to_string())?;

    let mut properties = HashMap::new();
    properties.insert("path".to_string(), "/".to_string());

    let ip = local_ip().map_err(|e| e.to_string())?;

    let service = ServiceInfo::new(
        service_type,
        service_name,
        "tetorica-home.local.",
        ip,
        port,
        properties,
    )
    .map_err(|e| e.to_string())?;

    daemon.register(service).map_err(|e| e.to_string())?;

    bonjour.status = BonjourStatus {
        running: true,
        service_name: Some(service_name.to_string()),
        service_type: Some(service_type.to_string()),
        port: Some(port),
    };

    bonjour.daemon = Some(daemon);

    Ok(bonjour.status.clone())
}

#[tauri::command]
async fn stop_bonjour(state: State<'_, AppState>) -> Result<BonjourStatus, String> {
    println!("> stop_bonjour");

    let mut bonjour = state.bonjour.lock().map_err(|e| e.to_string())?;

    if let Some(daemon) = bonjour.daemon.take() {
        let _ = daemon.shutdown();
    }

    bonjour.status = BonjourStatus {
        running: false,
        service_name: None,
        service_type: None,
        port: None,
    };

    Ok(bonjour.status.clone())
}

#[tauri::command]
async fn get_bonjour_status(state: State<'_, AppState>) -> Result<BonjourStatus, String> {
    let bonjour = state.bonjour.lock().map_err(|e| e.to_string())?;
    Ok(bonjour.status.clone())
}
