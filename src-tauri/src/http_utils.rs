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

pub fn list_ips() -> Vec<String> {
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

pub async fn index(AxumState(state): AxumState<HttpState>) -> Html<String> {
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

pub async fn access_guard_middleware(
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
//
//
pub fn is_local_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => is_private_or_local_v4(v4),
        IpAddr::V6(v6) => is_private_or_local_v6(v6),
    }
}
pub fn is_private_or_local_v4(ip: Ipv4Addr) -> bool {
    ip.is_loopback() ||      // 127.0.0.0/8
    ip.is_private() ||       // 10/8, 172.16/12, 192.168/16
    ip.is_link_local() // 169.254.0.0/16
}

pub fn is_private_or_local_v6(ip: Ipv6Addr) -> bool {
    ip.is_loopback() ||      // ::1
    ip.is_unicast_link_local() || // fe80::/10
    is_unique_local_v6(ip) // fc00::/7
}

pub fn is_unique_local_v6(ip: Ipv6Addr) -> bool {
    (ip.segments()[0] & 0xfe00) == 0xfc00
}

#[derive(Debug, Clone, Serialize)]
pub struct SharedFileInfo {
    id: String,
    name: String,
    path: String,
    url: String,
}

pub struct SharedFileControl {
    pub files: HashMap<String, PathBuf>,
}

impl  SharedFileControl {
    pub fn new() -> Self {
        Self {
            files: HashMap::new(),
        }
    }
}
#[derive(Debug, Clone, Serialize)]
pub struct ServerStatus {
    pub running: bool,
    pub port: Option<u16>,
    pub url: Option<String>,
    pub hostname: Option<String>,
    pub ips: Option<Vec<String>>,
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

pub struct ServerControl {
    pub status: ServerStatus,
    pub shutdown_tx: Option<oneshot::Sender<()>>,
    pub local_only: bool,
}

#[derive(Clone)]
pub struct HttpState {
    pub shared_files: Arc<Mutex<SharedFileControl>>,
    pub server: Arc<Mutex<ServerControl>>,
}

impl HttpState {
    pub fn new() -> Self {
        Self {
            shared_files: Arc::new(Mutex::new(SharedFileControl::new())),
            server: Arc::new(Mutex::new(ServerControl {
                status: ServerStatus::new(),
                shutdown_tx: None,
                local_only: true,
            })),
        }
    }
}

pub fn parse_range_header(range: &str, size: u64) -> Result<(u64, u64), ()> {
    if !range.starts_with("bytes=") {
        return Err(());
    }

    let value = &range["bytes=".len()..];

    // 複数 Range は今回は未対応
    if value.contains(',') {
        return Err(());
    }

    let Some((start_text, end_text)) = value.split_once('-') else {
        return Err(());
    };

    if size == 0 {
        return Err(());
    }

    if start_text.is_empty() {
        // bytes=-500
        let suffix_len: u64 = end_text.parse().map_err(|_| ())?;
        if suffix_len == 0 {
            return Err(());
        }

        let start = size.saturating_sub(suffix_len);
        let end = size - 1;
        return Ok((start, end));
    }

    let start: u64 = start_text.parse().map_err(|_| ())?;

    if start >= size {
        return Err(());
    }

    let end = if end_text.is_empty() {
        size - 1
    } else {
        let end: u64 = end_text.parse().map_err(|_| ())?;
        end.min(size - 1)
    };

    if end < start {
        return Err(());
    }

    Ok((start, end))
}

pub fn content_type_from_path(path: &PathBuf) -> &'static str {
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

pub async fn download_file(
    AxumState(state): AxumState<HttpState>,
    Path(id): Path<String>,
    headers: HeaderMap,
) -> Result<Response, (StatusCode, String)> {
    let path = {
        let shared = state
            .shared_files
            .lock()
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

        shared
            .files
            .get(&id)
            .cloned()
            .ok_or((StatusCode::NOT_FOUND, "not found".to_string()))?
    };

    let metadata = tokio::fs::metadata(&path)
        .await
        .map_err(|e| (StatusCode::NOT_FOUND, e.to_string()))?;

    let file_size = metadata.len();

    let filename = path
        .file_name()
        .and_then(|v| v.to_str())
        .unwrap_or("download.bin");

    let content_type = content_type_from_path(&path);

    let mut file = tokio::fs::File::open(&path)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let range = headers.get(header::RANGE).and_then(|v| v.to_str().ok());

    if let Some(range) = range {
        let (start, end) = match parse_range_header(range, file_size) {
            Ok(v) => v,
            Err(_) => {
                return Response::builder()
                    .status(StatusCode::RANGE_NOT_SATISFIABLE)
                    .header(header::ACCEPT_RANGES, "bytes")
                    .header(header::CONTENT_RANGE, format!("bytes */{file_size}"))
                    .body(Body::empty())
                    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()));
            }
        };

        let len = end - start + 1;

        file.seek(std::io::SeekFrom::Start(start))
            .await
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

        let stream = ReaderStream::new(file.take(len));
        let body = Body::from_stream(stream);

        return Response::builder()
            .status(StatusCode::PARTIAL_CONTENT)
            .header(header::CONTENT_TYPE, content_type)
            .header(header::ACCEPT_RANGES, "bytes")
            .header(header::CONTENT_LENGTH, len.to_string())
            .header(
                header::CONTENT_RANGE,
                format!("bytes {start}-{end}/{file_size}"),
            )
            .header(
                header::CONTENT_DISPOSITION,
                format!("inline; filename=\"{}\"", filename),
            )
            .body(body)
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()));
    }

    let stream = ReaderStream::new(file);
    let body = Body::from_stream(stream);

    Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, content_type)
        .header(header::ACCEPT_RANGES, "bytes")
        .header(header::CONTENT_LENGTH, file_size.to_string())
        .header(
            header::CONTENT_DISPOSITION,
            format!("inline; filename=\"{}\"", filename),
        )
        .body(body)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))
}
