use axum;

use if_addrs::get_if_addrs;
use serde::{Serialize};
use std::net::{IpAddr, Ipv4Addr, Ipv6Addr};
use std::{
    collections::HashMap,
    path::PathBuf,
};

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
