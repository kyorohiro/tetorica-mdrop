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
use crate::hello;
use crate::http_utils;
use crate::http_utils::access_guard_middleware;
use crate::http_utils::download_file;
use crate::http_utils::is_local_ip;
use crate::http_utils::HttpState;
use crate::http_utils::ServerControl;
//use crate::http_utils::ServerStatus;
use crate::http_utils::SharedFileControl;
use crate::http_utils::list_ips;



#[derive(Debug, Clone, Serialize)]
pub struct ServerStatus {
    pub running: bool,
    pub port: Option<u16>,
    pub url: Option<String>,
    pub hostname: Option<String>,
    pub ips: Option<Vec<String>>
}

impl  ServerStatus {
    pub fn new() -> Self {
        Self {
            running: false,
            port: None,
            url: None,
            hostname: None,
            ips: None,
        }
    }
}

async fn run_http_server(
    port: u16,
    shutdown_rx: oneshot::Receiver<()>,
    http_state: HttpState) -> Result<(), String> {
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods([Method::GET, Method::OPTIONS])
        .allow_headers(Any);

    let app = Router::new()
        .route("/hello", get(hello::hello()))
        .route("/", get(http_utils::index))
        //.route("/download/{id}", get(download_file))
        //.route_layer(middleware::from_fn_with_state(
        //    http_state.clone(),
        //    access_guard_middleware,
        //))
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


pub struct HttpServerContext {
    //pub file_control: SharedFileControl,
    pub status: ServerStatus,
    pub shutdown_tx: Option<oneshot::Sender<()>>,
    pub local_only: bool,
}

impl HttpServerContext {
    pub fn new() -> Self {
        Self {
            //file_control: SharedFileControl::new(),
            status: ServerStatus::new(),
            shutdown_tx: None,
            local_only: true,
        }
    }

    pub async fn start_server(&mut self, hostname: String, port: u16) -> Result<ServerStatus, String> {
        println!("> start_server");

        if self.status.running {
            return Ok(self.status.clone());
        }

        let (tx, rx) = oneshot::channel();

        tokio::spawn(async move {
            if let Err(e) = run_http_server(port, rx, HttpState::new()).await {
                eprintln!("server error: {e}");
            }
        });

        let ip = local_ip().map_err(|e| e.to_string())?;
        //let mut server = state.server.lock().map_err(|e| e.to_string())?;
        //server.status = ServerStatus {
        //    running: true,
        //    port: Some(port),
        //    url: Some(format!("http://{}:{port}/", ip)),
        //    hostname: Some(hostname),
        //    //ips: Some(list_ips()),
        //};
        self.shutdown_tx = Some(tx);

        self.status = ServerStatus {
            running: true,
            port: Some(port),
            url: Some(format!("http://{}:{port}/", ip)),
            hostname: Some(hostname),
            ips: Some(list_ips()),
        };
        Ok(self.status.clone())
    }
pub async fn stop_server(&mut self) -> Result<ServerStatus, String> {
    println!("> stop_server");

    let shutdown_tx = {
        //let mut server = state.server.lock().map_err(|e| e.to_string())?;

        if !self.status.running {
            return Ok(self.status.clone());
        }

        self.status = ServerStatus {
            running: false,
            port: None,
            url: None,
            hostname: None,
            ips: None,
        };

        self.shutdown_tx.take()
    };

    if let Some(tx) = shutdown_tx {
        let _ = tx.send(());
    }

    //let server = self.server.lock().map_err(|e| e.to_string())?;
    Ok(self.status.clone())
}

}
