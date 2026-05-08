use axum::http::Method;
use axum::{
    middleware::{self},
};
use axum::{
    routing::get,
    Router,
};

use local_ip_address::local_ip;
use serde::{Serialize};
use std::net::SocketAddr;
use std::{
    collections::HashMap,
    path::PathBuf,
    sync::{Arc, Mutex},
};
use tokio::{net::TcpListener, sync::oneshot};
use tower_http::cors::{Any, CorsLayer};
//


use crate::hello;
use crate::http_file;
use crate::http_file::access_guard_middleware;
use crate::http_utils::list_ips;

#[derive(Debug, Clone, Serialize)]
pub struct ServerStatus {
    pub running: bool,
    pub port: Option<u16>,
    pub url: Option<String>,
    pub hostname: Option<String>,
    pub ips: Option<Vec<String>>,
}

impl ServerStatus {
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

pub struct HttpServerContext {
    //pub file_control: SharedFileControl,
    pub status: ServerStatus,
    pub shutdown_tx: Option<oneshot::Sender<()>>,
    pub local_only: bool,
    //
    pub files: HashMap<String, PathBuf>,
}

impl HttpServerContext {
    pub fn new() -> Self {
        Self {
            //file_control: SharedFileControl::new(),
            status: ServerStatus::new(),
            shutdown_tx: None,
            local_only: true,
            files: HashMap::new(),
        }
    }

    pub fn stop_server(&mut self) -> Result<ServerStatus, String> {
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
#[derive(Clone)]
pub struct SharedHttpServerContext {
    pub inner: Arc<Mutex<HttpServerContext>>,
}

impl SharedHttpServerContext {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(Mutex::new(HttpServerContext::new())),
        }
    }

    async fn run_http_server(
        self,
        port: u16,
        shutdown_rx: oneshot::Receiver<()>,
        //state: Arc<Mutex<HttpServerContext>>,
        //http_state: HttpState,
    ) -> Result<(), String> {
        let cors = CorsLayer::new()
            .allow_origin(Any)
            .allow_methods([Method::GET, Method::OPTIONS])
            .allow_headers(Any);

        let app = Router::new()
            .route("/hello", get(hello::hello()))
            .route("/", get(http_file::index_get))
            .route("/download/{id}", get(http_file::download_file))
            .route_layer(middleware::from_fn_with_state(
                self.clone(),
                access_guard_middleware,
            ))
            .layer(cors)
            .with_state(self.clone());

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
    pub fn start_server(
        &self,
        hostname: String,
        port: u16,
        //state: Arc<Mutex<HttpServerContext>>,
    ) -> Result<ServerStatus, String> {
        println!(">>> start_server");
        let mut ctx = self.inner.lock().map_err(|e| e.to_string())?;
        if ctx.status.running {
            return Ok(ctx.status.clone());
        }

        let (tx, rx) = oneshot::channel();
        let server = self.clone();
        tokio::spawn(async move {
            if let Err(e) = server.run_http_server(port, rx).await {
                eprintln!("server error: {e}");
            }
        });

        let ip = local_ip().map_err(|e| e.to_string())?;
        ctx.shutdown_tx = Some(tx);

        ctx.status = ServerStatus {
            running: true,
            port: Some(port),
            url: Some(format!("http://{}:{port}/", ip)),
            hostname: Some(hostname),
            ips: Some(list_ips()),
        };
        Ok(ctx.status.clone())
    }
    pub fn stop_server(&self) -> Result<ServerStatus, String> {
        let mut ctx = self.inner.lock().map_err(|e| e.to_string())?;
        ctx.stop_server()
    }

    pub fn status(&self) -> Result<ServerStatus, String> {
        let ctx = self.inner.lock().map_err(|e| e.to_string())?;
        Ok(ctx.status.clone())
    }
}
