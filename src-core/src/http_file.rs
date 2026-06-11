use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

fn system_time_to_millis(t: SystemTime) -> Option<u128> {

    t.duration_since(UNIX_EPOCH)

        .ok()

        .map(|d| d.as_millis())

}

use axum::http::HeaderMap;
use axum::response::{Html, IntoResponse};
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
use crate::http_utils::{
    apply_html_security_headers, apply_shared_security_headers, build_html_content_security_policy,
    content_disposition_inline, natural_sort_key, parse_range_header,
};
use crate::http_utils::{
    content_type_from_path, escape_header_value, escape_html, url_encode_path_segment,
};

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

//
//

pub async fn download_root_file(
    AxumState(state): AxumState<SharedHttpServerContext>,
    Path(id): Path<String>,
    headers: HeaderMap,
) -> Result<Response<Body>, (StatusCode, String)> {
    download_file_inner(state, id, None, headers).await
}

pub async fn download_file(
    AxumState(state): AxumState<SharedHttpServerContext>,
    Path((id, sub_path)): Path<(String, String)>,
    headers: HeaderMap,
) -> Result<Response<Body>, (StatusCode, String)> {
    download_file_inner(state, id, Some(sub_path), headers).await
}

async fn download_file_inner(
    state: SharedHttpServerContext,
    id: String,
    sub_path: Option<String>,
    headers: HeaderMap,
) -> Result<Response<Body>, (StatusCode, String)> {
    println!("> download_file_inner {id} {:?}", sub_path);
    let (base_path, csp) = {
        let shared = state
            .inner
            .lock()
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

        (
            shared
                .files
                .get(&id)
                .cloned()
                .ok_or((StatusCode::NOT_FOUND, "not found".to_string()))?,
            build_html_content_security_policy(&shared.status),
        )
    };

    let path = match sub_path.as_deref() {
        Some(sub_path) => safe_join(&base_path, sub_path)?,
        None => base_path,
    };

    let metadata = tokio::fs::metadata(&path)
        .await
        .map_err(|e| (StatusCode::NOT_FOUND, e.to_string()))?;

    if metadata.is_dir() {
        //println!(">> file dir {:?}", path.as_path().to_str());
        return directory_response(&id, sub_path.as_deref(), &path, &csp).await;
        //return directory_response(&id, &path).await;
    }

    if metadata.is_file() {
        //println!(">> file {:?}", path.as_path().to_str());
        return file_response(&path, metadata.len(), headers, &csp).await;
    }

    println!(">> ERROR");
    Err((StatusCode::NOT_FOUND, "not found".to_string()))
}

fn safe_join(base: &PathBuf, sub_path: &str) -> Result<PathBuf, (StatusCode, String)> {
    let mut result = base.clone();

    for part in sub_path.split('/') {
        if part.is_empty() || part == "." {
            continue;
        }

        if part == ".." || part.contains('\\') {
            return Err((StatusCode::BAD_REQUEST, "invalid path".to_string()));
        }

        result.push(part);
    }

    Ok(result)
}

struct DirEntryInfo {
    name: String,
    is_dir: bool,
}
async fn directory_response(
    id: &str,
    sub_path: Option<&str>,
    path: &PathBuf,
    csp: &str,
) -> Result<Response<Body>, (StatusCode, String)> {
    let mut entries = tokio::fs::read_dir(path)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let current_url = match sub_path {
        Some(sub_path) if !sub_path.is_empty() => {
            format!("/download/{}/{}", id, sub_path)
        }
        _ => {
            format!("/download/{}", id)
        }
    };

    let mut html = String::from(
        r#"<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>mDrop files</title>
</head>
<body>
<h1>Files</h1>
<ul>
"#,
    );

    //
    //
    let mut entry_infos: Vec<DirEntryInfo> = Vec::new();

    while let Some(entry) = entries
        .next_entry()
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
    {
        let file_name = entry.file_name();
        let file_name = file_name.to_string_lossy().to_string();

        let meta = entry
            .metadata()
            .await
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

        entry_infos.push(DirEntryInfo {
            name: file_name,
            is_dir: meta.is_dir(),
        });
    }

    //entry_infos.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    entry_infos.sort_by(|a, b| natural_sort_key(&a.name).cmp(&natural_sort_key(&b.name)));
    for entry in entry_infos {
        let suffix = if entry.is_dir { "/" } else { "" };
        let label = escape_html(&entry.name);
        let encoded_name = url_encode_path_segment(&entry.name);

        let href = format!(
            "{}/{}{}",
            current_url.trim_end_matches('/'),
            encoded_name,
            suffix
        );

        html.push_str(&format!(
            r#"<li><a href="{}">{}{}</a></li>"#,
            href, label, suffix
        ));
    }

    html.push_str(
        r#"
</ul>
</body>
</html>
"#,
    );

    let mut res = Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, "text/html; charset=utf-8")
        .body(Body::from(html))
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    apply_html_security_headers(&mut res, csp);
    Ok(res)
}

async fn file_response(
    path: &PathBuf,
    file_size: u64,
    headers: HeaderMap,
    csp: &str,
) -> Result<Response<Body>, (StatusCode, String)> {
    let filename = path
        .file_name()
        .and_then(|v| v.to_str())
        .unwrap_or("download.bin");

    let content_type = content_type_from_path(path);

    let mut file = tokio::fs::File::open(path)
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

        let mut res = Response::builder()
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
                content_disposition_inline(filename),
            )
            .body(body)
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
        if content_type.starts_with("text/html") {
            apply_html_security_headers(&mut res, csp);
        } else {
            apply_shared_security_headers(&mut res);
        }
        return Ok(res);
    }

    let stream = ReaderStream::new(file);
    let body = Body::from_stream(stream);

    let mut res = Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, content_type)
        .header(header::ACCEPT_RANGES, "bytes")
        .header(header::CONTENT_LENGTH, file_size.to_string())
        .header(
            header::CONTENT_DISPOSITION,
            content_disposition_inline(filename),
        )
        .body(body)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    if content_type.starts_with("text/html") {
        apply_html_security_headers(&mut res, csp);
    } else {
        apply_shared_security_headers(&mut res);
    }
    Ok(res)
}
