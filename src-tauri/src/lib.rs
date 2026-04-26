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
    response::{IntoResponse, Response},
    routing::get,
    Router,
};
use if_addrs::get_if_addrs;
use local_ip_address::local_ip;
use mdns_sd::{ServiceDaemon, ServiceInfo};
use serde::{Deserialize, Serialize};
use std::net::SocketAddr;
use std::net::{IpAddr, Ipv4Addr, Ipv6Addr};
use std::time::Duration;
use std::{
    collections::HashMap,
    path::PathBuf,
    sync::{Arc, Mutex},
};
use tauri::State;
use tokio::{
    net::TcpListener,
    sync::{oneshot, watch},
};
use tower_http::cors::{Any, CorsLayer};

pub fn is_local_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => is_private_or_local_v4(v4),
        IpAddr::V6(v6) => is_private_or_local_v6(v6),
    }
}

fn is_private_or_local_v4(ip: Ipv4Addr) -> bool {
    ip.is_loopback() ||      // 127.0.0.0/8
    ip.is_private() ||       // 10/8, 172.16/12, 192.168/16
    ip.is_link_local() // 169.254.0.0/16
}

fn is_private_or_local_v6(ip: Ipv6Addr) -> bool {
    ip.is_loopback() ||      // ::1
    ip.is_unicast_link_local() || // fe80::/10
    is_unique_local_v6(ip) // fc00::/7
}

fn is_unique_local_v6(ip: Ipv6Addr) -> bool {
    (ip.segments()[0] & 0xfe00) == 0xfc00
}

async fn local_only_middleware(
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    req: Request<Body>,
    next: Next,
) -> Result<Response, StatusCode> {
    if !is_local_ip(addr.ip()) {
        println!("blocked non-local access: {}", addr);
        return Err(StatusCode::FORBIDDEN);
    }

    Ok(next.run(req).await)
}

async fn access_guard_middleware(
    AxumState(state): AxumState<HttpState>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    req: Request<Body>,
    next: Next,
) -> Result<Response, StatusCode> {
    let local_only = {
        let server = state
            .server
            .lock()
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
        server.local_only
    };

    if local_only && !is_local_ip(addr.ip()) {
        println!("blocked non-local access: {}", addr);
        return Err(StatusCode::FORBIDDEN);
    }

    Ok(next.run(req).await)
}
async fn hello() -> &'static str {
    "hello, world"
}

fn list_ips() -> Vec<String> {
    let mut result = Vec::new();

    if let Ok(addrs) = get_if_addrs() {
        for iface in addrs {
            // IPv4だけに絞る
            if let std::net::IpAddr::V4(ipv4) = iface.ip() {
                // localhostは除外
                if !ipv4.is_loopback() {
                    result.push(format!("{} ({})", ipv4, iface.name));
                }
            }
        }
    }

    result
}

fn content_type_from_path(path: &PathBuf) -> &'static str {
    match path
        .extension()
        .and_then(|v| v.to_str())
        .unwrap_or("")
        .to_lowercase()
        .as_str()
    {
        "html" | "htm" => "text/html; charset=utf-8",
        "txt" => "text/plain; charset=utf-8",
        "css" => "text/css; charset=utf-8",
        "js" => "text/javascript; charset=utf-8",
        "json" => "application/json; charset=utf-8",
        "pdf" => "application/pdf",

        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "svg" => "image/svg+xml",

        "mp3" => "audio/mpeg",
        "wav" => "audio/wav",
        "mp4" => "video/mp4",
        "webm" => "video/webm",

        "zip" => "application/zip",
        "wasm" => "application/wasm",

        _ => "application/octet-stream",
    }
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
  <title>Tetorica mDrop</title>
</head>
<body>
  <h1>Tetorica mDrop</h1>
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
    server: Arc<Mutex<ServerControl>>,
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

    let content_type = content_type_from_path(&path);

    let headers = [
        (header::CONTENT_TYPE, content_type.to_string()),
        (
            header::CONTENT_DISPOSITION,
            format!("inline; filename=\"{}\"", filename),
        ),
        //(
        //    header::CONTENT_DISPOSITION,
        //    format!("attachment; filename=\"{}\"", filename),
        //),
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
    reannounce_stop_tx: Option<watch::Sender<bool>>,
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
        .route("/hello", get(hello))
        .route("/", get(index))
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
    println!("> greet {}", name);
    format!("Hello, {}! You've been greeted from Rust!", name)
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
            bonjour: Mutex::new(BonjourControl {
                status: BonjourStatus {
                    running: false,
                    service_name: None,
                    service_type: None,
                    port: None,
                },
                daemon: None,
                reannounce_stop_tx: None,
            }),
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

#[derive(Debug, Clone, Serialize)]
struct ServerStatus {
    running: bool,
    port: Option<u16>,
    url: Option<String>,
    hostname: Option<String>,
    ips: Option<Vec<String>>,
}

struct ServerControl {
    status: ServerStatus,
    shutdown_tx: Option<oneshot::Sender<()>>,
    local_only: bool,
}

struct AppState {
    server: Arc<Mutex<ServerControl>>,
    bonjour: Mutex<BonjourControl>,
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
async fn start_bonjour(state: State<'_, AppState>) -> Result<BonjourStatus, String> {
    println!("> start_bonjour");

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

    let mut bonjour = state.bonjour.lock().map_err(|e| e.to_string())?;

    if bonjour.status.running {
        return Ok(bonjour.status.clone());
    }

    let service_type = "_http._tcp.local.";
    let service_name = format!("Tetorica mDrop ({hostname})");

    let daemon = ServiceDaemon::new().map_err(|e| e.to_string())?;

    let mut properties = HashMap::new();
    properties.insert("path".to_string(), "/".to_string());

    let ip = local_ip().map_err(|e| e.to_string())?;

    let service = ServiceInfo::new(
        service_type,
        &service_name,
        &(format!("{}.", hostname)),
        ip,
        port,
        properties,
    )
    .map_err(|e| e.to_string())?
    .enable_addr_auto();

    daemon
        .register(service.clone())
        .map_err(|e| e.to_string())?;

    let (stop_tx, mut stop_rx) = watch::channel(false);

    let daemon_for_task = daemon.clone();
    let service_for_task = service.clone();

    tokio::spawn(async move {
        loop {
            tokio::select! {
                _ = tokio::time::sleep(Duration::from_secs(30)) => {
                    match daemon_for_task.register(service_for_task.clone()) {
                        Ok(_) => {
                            println!("mDNS re-announce");
                        }
                        Err(e) => {
                            eprintln!("mDNS re-announce error: {e}");
                        }
                    }
                }
                changed = stop_rx.changed() => {
                    if changed.is_err() || *stop_rx.borrow() {
                        println!("mDNS re-announce stopped");
                        break;
                    }
                }
            }
        }
    });

    bonjour.status = BonjourStatus {
        running: true,
        service_name: Some(service_name.to_string()),
        service_type: Some(service_type.to_string()),
        port: Some(port),
    };

    bonjour.daemon = Some(daemon);
    bonjour.reannounce_stop_tx = Some(stop_tx);

    Ok(bonjour.status.clone())
}

#[tauri::command]
async fn stop_bonjour(state: State<'_, AppState>) -> Result<BonjourStatus, String> {
    println!("> stop_bonjour");

    let mut bonjour = state.bonjour.lock().map_err(|e| e.to_string())?;

    if let Some(tx) = bonjour.reannounce_stop_tx.take() {
        let _ = tx.send(true);
    }

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
