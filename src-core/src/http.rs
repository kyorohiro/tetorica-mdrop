use axum::body::Body;
use axum::extract::Path;
use axum::http::{header, Method, StatusCode};
use axum::middleware::{self};
use axum::response::{IntoResponse, Response};
use axum::{
    extract::{ConnectInfo, Query, State as AxumState},
    response::Html,
};
use axum::{routing::get, Router};

use axum_server::tls_rustls::RustlsConfig;
use local_ip_address::local_ip;
use rcgen::generate_simple_self_signed;
use serde::{Deserialize, Serialize};
use std::fs;
use std::net::SocketAddr;
use std::time::Duration;
use std::{
    collections::HashMap,
    path::PathBuf,
    sync::{Arc, Mutex},
};
use tokio::{net::TcpListener, sync::oneshot};
use tower_http::cors::{Any, CorsLayer};

use crate::http_api::{api_key_guard_middleware, create_api_key};
use crate::http_file;
use crate::http_utils::{access_guard_middleware, list_ips};
use crate::{hello, http_api};
//
//
use rust_embed::RustEmbed;

#[cfg(feature = "dev_web")]
const DEV_WEB: bool = true;

#[cfg(not(feature = "dev_web"))]
const DEV_WEB: bool = false;

#[derive(RustEmbed)]
#[folder = "../dist"]
struct WebAssets;

#[derive(Debug, Deserialize)]
struct MessageQuery {
    text: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReceivedMessage {
    pub from: String,
    pub method: String,
    pub text: String,
}

//
pub type MessageCallback = Arc<dyn Fn(ReceivedMessage) + Send + Sync>;

async fn receive_message_get(
    AxumState(state): AxumState<SharedHttpServerContext>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    Query(q): Query<MessageQuery>,
) -> Html<String> {
    let text = q.text.unwrap_or_default();

    println!("MESSAGE GET from {}: {}", addr.ip(), text);

    let message = ReceivedMessage {
        from: addr.ip().to_string(),
        method: "GET".to_string(),
        text,
    };

    let callback = {
        let ctx = state.inner.lock().unwrap();
        ctx.message_callback.clone()
    };

    if let Some(callback) = callback {
        callback(message.clone());
    }

    Html("ok".to_string())
}

async fn receive_message_post(
    AxumState(state): AxumState<SharedHttpServerContext>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    body: String,
) -> Html<String> {
    println!("MESSAGE POST from {}: {}", addr.ip(), body);

    let message = ReceivedMessage {
        from: addr.ip().to_string(),
        method: "POST".to_string(),
        text: body,
    };

    let callback = {
        let ctx = state.inner.lock().unwrap();
        ctx.message_callback.clone()
    };

    if let Some(callback) = callback {
        callback(message.clone());
    }

    Html("ok".to_string())
}

fn ensure_self_signed_cert(cert_path: &str, key_path: &str, hostname: &str) -> Result<(), String> {
    if std::path::Path::new(cert_path).exists() && std::path::Path::new(key_path).exists() {
        return Ok(());
    }

    let subject_alt_names = vec!["localhost".to_string(), hostname.to_string()];

    let certified = generate_simple_self_signed(subject_alt_names).map_err(|e| e.to_string())?;

    fs::write(cert_path, certified.cert.pem()).map_err(|e| e.to_string())?;
    fs::write(key_path, certified.signing_key.serialize_pem()).map_err(|e| e.to_string())?;

    Ok(())
}

#[derive(Debug, Clone, Serialize)]
pub struct ServerStatus {
    pub running: bool,
    pub port: Option<u16>,
    pub url: Option<String>,
    pub hostname: Option<String>,
    pub ips: Option<Vec<String>>,
    pub id: Option<String>,
    pub password: Option<String>,
    pub local_only: Option<bool>,
    pub is_https: Option<bool>,
}

impl ServerStatus {
    pub fn new() -> Self {
        Self {
            running: false,
            port: None,
            url: None,
            hostname: None,
            ips: None,
            id: None,
            password: None,
            local_only: Some(true),
            is_https: Some(false),
        }
    }
}

pub struct HttpServerContext {
    pub status: ServerStatus,
    pub shutdown_tx: Option<oneshot::Sender<()>>,
    pub local_only: bool,
    pub files: HashMap<String, PathBuf>,
    pub message_callback: Option<MessageCallback>,
    pub api_key: String,
}

impl HttpServerContext {
    pub fn new() -> Self {
        Self {
            status: ServerStatus::new(),
            shutdown_tx: None,
            local_only: true,
            files: HashMap::new(),
            message_callback: None,
            api_key: create_api_key(),
        }
    }

    pub fn stop_server(&mut self) -> Result<ServerStatus, String> {
        println!("> stop_server");

        if !self.status.running {
            return Ok(self.status.clone());
        }

        self.status = ServerStatus::new();

        if let Some(tx) = self.shutdown_tx.take() {
            let _ = tx.send(());
        }

        Ok(self.status.clone())
    }
}

#[derive(Clone)]
pub struct SharedHttpServerContext {
    pub inner: Arc<Mutex<HttpServerContext>>,
}

async fn web_index(AxumState(state): AxumState<SharedHttpServerContext>) -> impl IntoResponse {
    let api_key = {
        let ctx = state.inner.lock().unwrap();
        ctx.api_key.clone()
    };

    embedded_web_html_response("web.html", &api_key)
}

async fn web_asset(Path(path): Path<String>) -> impl IntoResponse {
    embedded_file_response(&format!("assets/{path}"))
}

async fn web_asset_unrar_wasm() -> Response {
    match WebAssets::get("unrar.wasm") {
        Some(content) => Response::builder()
            .status(StatusCode::OK)
            .header(header::CONTENT_TYPE, "application/wasm")
            .body(Body::from(content.data.into_owned()))
            .unwrap(),
        None => Response::builder()
            .status(StatusCode::NOT_FOUND)
            .body(Body::from("not found"))
            .unwrap(),
    }
}
fn embedded_web_html_response(path: &str, api_key: &str) -> Response {
    let Some(file) = WebAssets::get(path) else {
        return StatusCode::NOT_FOUND.into_response();
    };
    let html = String::from_utf8_lossy(&file.data).replace("MDROP_DEV_ONLY_API_KEY", api_key);
    let html = html.replace("http://localhost:7878", "");
    Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, "text/html; charset=utf-8")
        .header(header::CACHE_CONTROL, "no-store")
        .body(Body::from(html))
        .unwrap()
}

fn embedded_file_response(path: &str) -> Response {
    match WebAssets::get(path) {
        Some(file) => {
            let mime = mime_guess::from_path(path).first_or_octet_stream();

            Response::builder()
                .status(StatusCode::OK)
                .header(header::CONTENT_TYPE, mime.as_ref())
                .body(Body::from(file.data.into_owned()))
                .unwrap()
        }
        None => StatusCode::NOT_FOUND.into_response(),
    }
}

impl SharedHttpServerContext {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(Mutex::new(HttpServerContext::new())),
        }
    }

    pub fn set_message_callback<F>(&self, callback: F)
    where
        F: Fn(ReceivedMessage) + Send + Sync + 'static,
    {
        if let Ok(mut ctx) = self.inner.lock() {
            ctx.message_callback = Some(Arc::new(callback));
        }
    }

    pub fn clear_message_callback(&self) {
        if let Ok(mut ctx) = self.inner.lock() {
            ctx.message_callback = None;
        }
    }

    fn build_router(self) -> Router {
        let cors = CorsLayer::new()
            .allow_origin(Any)
            //.allow_methods([Method::GET, Method::POST, Method::OPTIONS])
            .allow_methods([Method::GET, Method::HEAD, Method::POST, Method::OPTIONS])
            .allow_headers(Any)
            .expose_headers([
                header::ACCEPT_RANGES,
                header::CONTENT_LENGTH,
                header::CONTENT_RANGE,
                header::CONTENT_TYPE,
            ]);
        let api_routes = Router::new()
            .route("/downloadList", get(http_api::api_get_download_lists))
            .route("/files", get(http_api::api_get_files))
            .route_layer(middleware::from_fn_with_state(
                self.clone(),
                api_key_guard_middleware,
            ));
        Router::new()
            .route("/hello", get(hello::hello()))
            .nest("/api", api_routes)
            //.route("/", get(http_file::index_get))
            //.route("/api/downloadList", get(http_api::api_get_download_lists))
            //.route("/api/files", get(http_api::api_get_files))
            .route(
                "/message",
                get(receive_message_get).post(receive_message_post),
            )
            .route(
                "/download/{id}",
                get(http_file::download_root_file).head(http_file::download_root_file),
            )
            .route(
                "/download/{id}/{*sub_path}",
                get(http_file::download_file).head(http_file::download_file),
            )
            //.route("/download/{id}", get(http_file::download_root_file))
            //.route("/download/{id}/{*sub_path}", get(http_file::download_file))
            .route("/", get(web_index))
            .route("/assets/{*path}", get(web_asset))
            .route("/unrar.wasm", get(web_asset_unrar_wasm))
            //.route("/", get(web_index))
            //.nest_service(
            //    "/assets",
            //    get_service(ServeDir::new(web_dist_dir.join("assets"))),
            //)
            //.route("/meta.json", get(web_meta()))
            .route_layer(middleware::from_fn_with_state(
                self.clone(),
                access_guard_middleware,
            ))
            .layer(cors)
            .with_state(self.clone())
    }

    async fn run_https_server(
        self,
        port: u16,
        cert_path: &str,
        key_path: &str,
        shutdown_rx: oneshot::Receiver<()>,
    ) -> Result<(), String> {
        let app = self.clone().build_router();

        let config = RustlsConfig::from_pem_file(cert_path, key_path)
            .await
            .map_err(|e| e.to_string())?;

        let addr = SocketAddr::from(([0, 0, 0, 0], port));
        let handle = axum_server::Handle::new();

        {
            let handle = handle.clone();
            tokio::spawn(async move {
                shutdown_rx.await.ok();
                println!("HTTPS Server shutting down...");
                handle.graceful_shutdown(Some(Duration::from_secs(5)));
            });
        }

        println!("Server started on https://0.0.0.0:{port}/");

        axum_server::bind_rustls(addr, config)
            .handle(handle)
            .serve(app.into_make_service_with_connect_info::<SocketAddr>())
            .await
            .map_err(|e| e.to_string())?;

        Ok(())
    }

    async fn run_http_server(
        self,
        port: u16,
        shutdown_rx: oneshot::Receiver<()>,
    ) -> Result<(), String> {
        let app = self.clone().build_router();

        let listener = TcpListener::bind(format!("0.0.0.0:{port}"))
            .await
            .map_err(|e| e.to_string())?;

        println!("Server started on http://0.0.0.0:{port}/");

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
        id: Option<String>,
        password: Option<String>,
        is_https: Option<bool>,
        local_only: Option<bool>,
    ) -> Result<ServerStatus, String> {
        println!(
            ">>> start_server isHttp:{:?} localOnly:{:?}",
            is_https, local_only
        );

        let mut ctx = self.inner.lock().map_err(|e| e.to_string())?;

        if ctx.status.running {
            return Ok(ctx.status.clone());
        }

        ctx.local_only = local_only.unwrap_or(true);

        let (tx, rx) = oneshot::channel();

        let server = self.clone();

        if is_https.unwrap_or(false) == false {
            tokio::spawn(async move {
                if let Err(e) = server.run_http_server(port, rx).await {
                    eprintln!("server error: {e}");
                }
            });
        } else {
            let cert_hostname = hostname.clone();

            tokio::spawn(async move {
                if let Err(e) = ensure_self_signed_cert("cert.pem", "key.pem", &cert_hostname) {
                    eprintln!("cert error: {e}");
                    return;
                }

                if let Err(e) = server
                    .run_https_server(port, "cert.pem", "key.pem", rx)
                    .await
                {
                    eprintln!("https server error: {e}");
                }
            });
        }

        let ip = local_ip().map_err(|e| e.to_string())?;
        ctx.shutdown_tx = Some(tx);

        let id = id.unwrap_or_else(|| "mdrop".to_string());
        let password = password.unwrap_or_else(|| "".to_string());

        let scheme = if is_https == Some(true) {
            "https"
        } else {
            "http"
        };

        ctx.status = ServerStatus {
            running: true,
            port: Some(port),
            url: Some(format!("{scheme}://{}:{port}/", ip)),
            hostname: Some(hostname),
            ips: Some(list_ips()),
            id: Some(id),
            password: Some(password),
            is_https,
            local_only,
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
