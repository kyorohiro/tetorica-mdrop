use serde::Serialize;
use std::sync::Mutex;
use tauri::State;
use tokio::sync::oneshot;

use axum::{routing::get, Router};
use tokio::net::TcpListener;

async fn hello() -> &'static str {
    "hello, world"
}

async fn run_http_server(port: u16, shutdown_rx: oneshot::Receiver<()>) {
    let app = Router::new().route("/", get(hello));

    let listener = TcpListener::bind(format!("127.0.0.1:{port}"))
        .await
        .unwrap();

    println!("Server started on http://127.0.0.1:{port}");

    axum::serve(listener, app)
        .with_graceful_shutdown(async {
            shutdown_rx.await.ok();
            println!("Server shutting down...");
        })
        .await
        .unwrap();
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
        })
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            greet,        //
            start_server,  //
            stop_server,
            get_server_status
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
    tokio::spawn(run_http_server(port, rx));

    let mut server = state.server.lock().map_err(|e| e.to_string())?;

    server.status = ServerStatus {
        running: true,
        port: Some(port),
        url: Some(format!("http://127.0.0.1:{port}/")),
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
    println!("> get_server_status");

    let server = state.server.lock().map_err(|e| e.to_string())?;
    Ok(server.status.clone())
}