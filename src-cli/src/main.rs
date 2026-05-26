use clap::Parser;
use serde::Deserialize;
use std::fs;
use std::path::PathBuf;
use tetorica_mdrop_core::bonjour::SharedBonjourContext;
use tetorica_mdrop_core::http::SharedHttpServerContext;

#[derive(Parser)]
struct Cli {
    path: Option<PathBuf>,

    #[arg(long)]
    config: Option<PathBuf>,

    #[arg(long)]
    hostname: Option<String>,

    #[arg(long)]
    port: Option<u16>,

    #[arg(long, default_value_t = false)]
    no_bonjour: bool,

    #[arg(long)]
    local_only: Option<bool>,

    #[arg(long)]
    is_https: Option<bool>,

    #[arg(long)]
    id: Option<String>,

    #[arg(long)]
    password: Option<String>,
}

#[derive(Debug, Default, Deserialize)]
struct Config {
    path: Option<PathBuf>,
    hostname: Option<String>,
    port: Option<u16>,
    no_bonjour: Option<bool>,
    local_only: Option<bool>,
    is_https: Option<bool>,
    id: Option<String>,
    password: Option<String>,
}

fn load_config(path: Option<&PathBuf>) -> Result<Config, String> {
    let Some(path) = path else {
        return Ok(Config::default());
    };

    let text = fs::read_to_string(path).map_err(|e| e.to_string())?;
    toml::from_str(&text).map_err(|e| e.to_string())
}

#[tokio::main]
async fn main() -> Result<(), String> {
    let cli = Cli::parse();
    let config = load_config(cli.config.as_ref())?;

    let path = cli
        .path
        .or(config.path)
        .ok_or("path is required. pass PATH or set path in config.toml")?;

    let hostname = cli
        .hostname
        .or(config.hostname)
        .unwrap_or_else(|| "mdrop.local".to_string());

    let port = cli.port.or(config.port).unwrap_or(7878);

    let no_bonjour = if cli.no_bonjour {
        true
    } else {
        config.no_bonjour.unwrap_or(false)
    };

    let local_only = cli.local_only.or(config.local_only).unwrap_or(true);
    let is_https = cli.is_https.or(config.is_https).unwrap_or(false);

    let id = cli.id.or(config.id).unwrap_or_default();
    let password = cli.password.or(config.password).unwrap_or_default();

    let server = SharedHttpServerContext::new();
    let bonjour = SharedBonjourContext::new();

    let status = server.start_server(
        hostname.clone(),
        port,
        Some(id),
        Some(password),
        Some(is_https),
        Some(local_only),
    )?;

    let file_id = "mdrop".to_string();
    {
        let mut inner = server.inner.lock().map_err(|e| e.to_string())?;
        inner.files.insert(file_id, path.clone());
    }

    if !no_bonjour {
        bonjour.start(hostname.clone(), port)?;
    }

    println!("mDrop sharing:");
    println!("  {}", path.display());

    let ip_info = status
        .ips
        .as_ref()
        .map(|ips| ips.join(","))
        .unwrap_or_default();

    println!("  ip_info: {}", ip_info);
    println!("  http://{}:{}/", hostname, port);
    println!("Press Ctrl+C to stop.");

    tokio::signal::ctrl_c()
        .await
        .map_err(|e| e.to_string())?;

    if !no_bonjour {
        let _ = bonjour.stop();
    }

    let _ = server.stop_server();

    println!("Stopped.");
    Ok(())
}