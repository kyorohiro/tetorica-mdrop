use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

fn system_time_to_millis(t: SystemTime) -> Option<u128> {

    t.duration_since(UNIX_EPOCH)

        .ok()

        .map(|d| d.as_millis())

}

use axum::extract::Query;
use axum::http::{HeaderMap, Request};
use axum::middleware::Next;
use axum::response::{Html, IntoResponse};
use axum::Error;
use axum::{body::Body, http::StatusCode};
use axum::{
    extract::{Path, State as AxumState},
    http::header,
    response::Response,
};
use std::collections::HashMap;

use tokio::io::{AsyncReadExt, AsyncSeekExt};
use tokio_util::io::ReaderStream;

use crate::http::SharedHttpServerContext;
use crate::http_utils::{content_disposition_inline, natural_sort_key, parse_range_header};
use crate::http_utils::{
    content_type_from_path, escape_header_value, escape_html, url_encode_path_segment,
};

pub async fn api_get_download_lists(
    AxumState(state): AxumState<SharedHttpServerContext>,
) -> String {
    let context = state.inner.lock().unwrap();
    let files_dict = context.files.clone();
    let mut files: Vec<serde_json::Value> = vec![];
    for ele in files_dict.iter() {
        //files.push(ele.0.to_string());
        let p = &ele.1;

        let s = p.to_string_lossy().to_string();

        let v = serde_json::json!({
            "id": ele.0.to_string(),
            "path": s,
            "isFile": p.is_file(),
            "isDir": p.is_dir(),
        });
        files.push(v);
    }

    return serde_json::to_string(&files).unwrap();
}

pub async fn api_get_files(
    AxumState(state): AxumState<SharedHttpServerContext>,
    Query(params): Query<HashMap<String, String>>,
) -> String {
    let id = params.get("i").cloned().unwrap_or_default();
    let sub_path = params.get("p").cloned().unwrap_or_else(|| "/".to_string());

    let context = state.inner.lock().unwrap();
    let files_dict = context.files.clone();
    drop(context);

    let mut files: Vec<serde_json::Value> = vec![];

    let Some(base_path) = files_dict.get(&id) else {
        return serde_json::to_string(&files).unwrap();
    };

    // 先頭の / を外して base_path に join
    let clean_sub_path = sub_path.trim_start_matches('/');
    let target_path = base_path.join(clean_sub_path);

    if !target_path.is_dir() {
        return serde_json::to_string(&files).unwrap();
    }

    let Ok(entries) = std::fs::read_dir(&target_path) else {
        return serde_json::to_string(&files).unwrap();
    };

    for entry in entries.flatten() {
        let p = entry.path();

        let name = entry.file_name().to_string_lossy().to_string();

        let relative_path = if clean_sub_path.is_empty() {
            format!("/{}", name)
        } else {
            format!("/{}/{}", clean_sub_path, name)
        };

        let metadata = entry.metadata().ok();

        let size = metadata.as_ref().map(|m| m.len()).unwrap_or(0);

        let created_at = metadata
            .as_ref()
            .and_then(|m| m.created().ok())
            .and_then(system_time_to_millis);

        let modified_at = metadata
            .as_ref()
            .and_then(|m| m.modified().ok())
            .and_then(system_time_to_millis);

        let v = serde_json::json!({
            "id": id,
            "name": name,
            "path": relative_path,
            "isFile": p.is_file(),
            "isDir": p.is_dir(),
            "size": size,
            "createdAt": created_at,
            "modifiedAt": modified_at,
        });

        files.push(v);
    }

    serde_json::to_string(&files).unwrap()
}


const API_KEY_HEADER: &str = "X-mDrop-API-Key";

pub async fn api_key_guard_middleware(
    AxumState(state): AxumState<SharedHttpServerContext>,
    headers: HeaderMap,
    req: Request<Body>,
    next: Next,
) -> Result<Response, StatusCode> {
    let expected_api_key = {
        let ctx = state.inner.lock().unwrap();
        ctx.api_key.clone()
    };

    let actual_api_key = headers
        .get(API_KEY_HEADER)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");

    if actual_api_key != expected_api_key {
        return Err(StatusCode::UNAUTHORIZED);
    }

    Ok(next.run(req).await)
}

pub fn create_api_key() -> String {
    if cfg!(feature = "dev_web") {
        "MDROP_DEV_ONLY_API_KEY".to_string()
    } else {
        uuid::Uuid::new_v4().to_string()
    }
}