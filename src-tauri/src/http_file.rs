use axum::http::{HeaderMap, HeaderValue};
use axum::response::Html;
use axum::{
    body::Body,
    extract::ConnectInfo,
    http::{Request, StatusCode},
    middleware::Next,
};
use axum::{
    extract::{Path, State as AxumState},
    http::header,
    response::Response,
};

use std::net::SocketAddr;

use base64::{engine::general_purpose, Engine};
use tokio::io::{AsyncReadExt, AsyncSeekExt};
use tokio_util::io::ReaderStream;

use crate::http::SharedHttpServerContext;
use crate::http_utils::content_type_from_path;
use crate::http_utils::is_local_ip;
use crate::http_utils::parse_range_header;

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

pub async fn index_get(
    AxumState(state): AxumState<SharedHttpServerContext>,
    //Path(id): Path<String>,
    //req: Request<Body>,
    //headers: HeaderMap,
    //files: HashMap<String, PathBuf>
) -> Html<String> {
    //request
    let files = state.inner.lock().unwrap().files.clone();
    let items = {
        files
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

pub async fn download_file(
    AxumState(state): AxumState<SharedHttpServerContext>,
    Path(id): Path<String>,
    headers: HeaderMap,
) -> Result<Response, (StatusCode, String)> {
    let path = {
        let shared = state
            .inner
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
