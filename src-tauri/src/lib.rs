use serde::Serialize;
use std::sync::Mutex;
use tauri::State;
use tokio::sync::oneshot;

use axum::{routing::get, Router};
use tokio::net::TcpListener;
//
use local_ip_address::local_ip;
use mdns_sd::{ServiceDaemon, ServiceInfo};
use std::collections::HashMap;

//
// hello
//
async fn hello() -> &'static str {
    "hello, world"
}

//
// bonjure
//
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
//
// http_server
//
async fn run_http_server(port: u16, shutdown_rx: oneshot::Receiver<()>) -> Result<(), String> {
    let app = Router::new().route("/", get(hello));

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

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    println!("> greet {}", name);
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
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
        })
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            greet,        //
            start_server, //
            stop_server,
            get_server_status,
            start_bonjour,
            stop_bonjour,
            get_bonjour_status,
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
}

#[tauri::command]
async fn start_server(state: State<'_, AppState>) -> Result<ServerStatus, String> {
    println!("> start_server");

    // 既に起動してるか確認
    {
        let server = state.server.lock().map_err(|e| e.to_string())?;
        if server.status.running {
            return Ok(server.status.clone());
        }
    }

    let port = 7878;

    // shutdown channel
    let (tx, rx) = oneshot::channel();

    // サーバーをバックグラウンドで起動
    tokio::spawn(async move {
        if let Err(e) = run_http_server(port, rx).await {
            eprintln!("server error: {e}");
        }
    });

    let mut server = state.server.lock().map_err(|e| e.to_string())?;

    let ip = local_ip().map_err(|e| e.to_string())?;
    let status = ServerStatus {
        running: true,
        port: Some(port),
        url: Some(format!("http://{}:{port}/", ip)),
    };
    server.status = status;

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
    println!("> get_server_status");

    let server = state.server.lock().map_err(|e| e.to_string())?;
    Ok(server.status.clone())
}

//
// bonjure
//
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
    let hostname = "tetorica-home.local.";
    let ip = local_ip().map_err(|e| e.to_string())?;

    let service = ServiceInfo::new(
        service_type,
        service_name,
        "tetorica-home.local.",
        ip, // ← 第4引数
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
    println!("> get_bonjour_status");

    let bonjour = state.bonjour.lock().map_err(|e| e.to_string())?;
    Ok(bonjour.status.clone())
}
