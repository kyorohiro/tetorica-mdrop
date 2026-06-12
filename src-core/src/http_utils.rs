use axum;

use if_addrs::get_if_addrs;
use serde::Serialize;
use std::net::{IpAddr, Ipv4Addr, Ipv6Addr};
use std::{
    collections::BTreeSet,
    collections::HashMap,
    path::PathBuf,
};

use axum::http::{HeaderName, HeaderValue};
use axum::{
    body::Body,
    extract::ConnectInfo,
    http::{Request, StatusCode},
    middleware::Next,
};
use axum::{
    extract::{State as AxumState},
    http::header,
    response::Response,
};

use std::net::SocketAddr;

use base64::{engine::general_purpose, Engine};

use crate::http::{ServerStatus, SharedHttpServerContext};

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

pub fn apply_shared_security_headers(res: &mut Response<Body>) {
    let headers = res.headers_mut();
    headers.insert(
        header::X_CONTENT_TYPE_OPTIONS,
        HeaderValue::from_static("nosniff"),
    );
    headers.insert(
        header::REFERRER_POLICY,
        HeaderValue::from_static("no-referrer"),
    );
    headers.insert(
        HeaderName::from_static("cross-origin-resource-policy"),
        HeaderValue::from_static("same-site"),
    );
}

pub fn build_html_content_security_policy(status: &ServerStatus) -> String {
    let allow_hosts = if status.local_only == Some(true) {
        let scheme = if status.is_https == Some(true) {
            "https"
        } else {
            "http"
        };
        let port = status.port.unwrap_or(7878);
        let mut origins = BTreeSet::new();

        origins.insert(format!("{scheme}://localhost:{port}"));
        origins.insert(format!("{scheme}://127.0.0.1:{port}"));
        origins.insert(format!("{scheme}://localhost:1420"));
        origins.insert(format!("{scheme}://127.0.0.1:1420"));

        if let Some(hostname) = status.hostname.as_deref() {
            let hostname = hostname.trim().trim_end_matches('/');
            if !hostname.is_empty() {
                origins.insert(format!("{scheme}://{hostname}:{port}"));
            }
        }

        if let Some(ips) = status.ips.as_ref() {
            for ip in ips {
                if let Some(ip) = ip.split_whitespace().next() {
                    if !ip.is_empty() {
                        origins.insert(format!("{scheme}://{ip}:{port}"));
                    }
                }
            }
        }

        origins.into_iter().collect::<Vec<_>>().join(" ")
    } else {
        "'self'".to_string()
    };

    format!(
        concat!(
            "default-src 'self' blob: data:; ",
            "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; ",
            "style-src 'self' 'unsafe-inline'; ",
            "img-src 'self' blob: data: {allow_hosts}; ",
            "font-src 'self' data:; ",
            "media-src 'self' blob: data: {allow_hosts}; ",
            "connect-src 'self' {allow_hosts}; ",
            "worker-src 'self' blob:; ",
            "frame-src 'none'; ",
            "object-src 'none'; ",
            "base-uri 'none'; ",
            "form-action 'none'; ",
            "frame-ancestors 'none';"
        ),
        allow_hosts = allow_hosts
    )
}

pub fn apply_html_security_headers(res: &mut Response<Body>, csp: &str) {
    apply_shared_security_headers(res);
    res.headers_mut().insert(
        header::CONTENT_SECURITY_POLICY,
        HeaderValue::from_str(csp).unwrap_or_else(|_| HeaderValue::from_static("default-src 'self'")),
    );
}



fn basic_auth_required_response() -> Response<Body> {
    let mut res = Response::new(Body::from("Unauthorized"));
    *res.status_mut() = StatusCode::UNAUTHORIZED;

    res.headers_mut().insert(
        header::WWW_AUTHENTICATE,
        HeaderValue::from_static(r#"Basic realm="mDrop""#),
    );

    res
}

pub async fn access_guard_middleware(
    AxumState(state): AxumState<SharedHttpServerContext>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    req: Request<Body>,
    next: Next,
) -> Result<Response, Response<Body>> {
    let local_only = {
        let server = state
            .inner
            .lock()
            .map_err(|_| {
                let mut res = Response::new(Body::from("Internal Server Error"));
                *res.status_mut() = StatusCode::INTERNAL_SERVER_ERROR;
                res
            })?;
        server.local_only
    };

    if local_only && !is_local_ip(addr.ip()) {
        let mut res = Response::new(Body::from("Forbidden"));
        *res.status_mut() = StatusCode::FORBIDDEN;
        return Err(res);
    }

    let (expected_id, expected_password) = {
        let server = state
            .inner
            .lock()
            .map_err(|_| {
                let mut res = Response::new(Body::from("Internal Server Error"));
                *res.status_mut() = StatusCode::INTERNAL_SERVER_ERROR;
                res
            })?;

        (
            server.status.id.clone().unwrap_or_default(),
            server.status.password.clone().unwrap_or_default(),
        )
    };

    let auth_enabled = !expected_id.is_empty() && !expected_password.is_empty();

    if auth_enabled {
        let auth_header = req
            .headers()
            .get(header::AUTHORIZATION)
            .and_then(|v| v.to_str().ok())
            .and_then(|v| v.strip_prefix("Basic "))
            .and_then(|v| general_purpose::STANDARD.decode(v).ok())
            //.and_then(|v| base64::decode(v).ok())
            .and_then(|v| String::from_utf8(v).ok())
            .map(|v| {
                let mut parts = v.splitn(2, ':');
                let id = parts.next().unwrap_or("").to_string();
                let password = parts.next().unwrap_or("").to_string();
                (id, password)
            });

        match auth_header {
            Some((auth_id, auth_password))
                if auth_id == expected_id && auth_password == expected_password => {}

            _ => {
                return Err(basic_auth_required_response());
            }
        }
    }

    Ok(next.run(req).await)
}

pub fn escape_html(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&#39;")
}

pub fn escape_header_value(s: &str) -> String {
    s.replace('\\', "\\\\").replace('"', "\\\"")
}

pub fn url_encode_path_segment(s: &str) -> String {
    let mut result = String::new();

    for b in s.bytes() {
        match b {
            b'A'..=b'Z'
            | b'a'..=b'z'
            | b'0'..=b'9'
            | b'-'
            | b'_'
            | b'.'
            | b'~' => result.push(b as char),
            _ => result.push_str(&format!("%{:02X}", b)),
        }
    }

    result
}


pub fn natural_sort_key(s: &str) -> String {
    let mut result = String::new();
    let mut number = String::new();

    for ch in s.chars() {
        if ch.is_ascii_digit() {
            number.push(ch);
        } else {
            if !number.is_empty() {
                result.push_str(&format!("{:08}", number.parse::<u64>().unwrap_or(0)));
                number.clear();
            }

            result.push(ch.to_ascii_lowercase());
        }
    }

    if !number.is_empty() {
        result.push_str(&format!("{:08}", number.parse::<u64>().unwrap_or(0)));
    }

    result
}


use percent_encoding::{utf8_percent_encode, NON_ALPHANUMERIC};
pub fn content_disposition_inline(filename: &str) -> String {
    let encoded = utf8_percent_encode(filename, NON_ALPHANUMERIC).to_string();

    format!(
        "inline; filename=\"download.bin\"; filename*=UTF-8''{}",
        encoded
    )
}
