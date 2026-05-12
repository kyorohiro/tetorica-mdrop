use clap::Parser;
use std::path::PathBuf;
use tetorica_mdrop_core::bonjour::SharedBonjourContext;
use tetorica_mdrop_core::http::SharedHttpServerContext;

#[derive(Parser)]
struct Cli {
    path: PathBuf,

    #[arg(long, default_value = "")]
    hostname: String,

    #[arg(long, default_value_t = 7878)]
    port: u16,

    #[arg(long)]
    no_bonjour: bool,
}

#[tokio::main]
async fn main() -> Result<(), String> {
    let cli = Cli::parse();

    let server = SharedHttpServerContext::new();
    let bonjour = SharedBonjourContext::new();
    let mut hostname = cli.hostname.clone();
    if cli.hostname.is_empty() {
        hostname = "mdrop.local".into();
    }

    let status = server.start_server(
        hostname.clone(),
        cli.port,
        None,
        None,
        Some(false),
        Some(true),
    )?;

    let id = "mdrop".to_string();
    {
        let mut inner = server.inner.lock().map_err(|e| e.to_string())?;
        inner.files.insert(id.clone(), cli.path.clone());
    }

    if !cli.no_bonjour {
        bonjour.start(hostname.clone(), cli.port)?;
    }

    println!("mDrop sharing:");
    println!("  {}", cli.path.display());
    println!("  http://{}:{}/download/{}", hostname.clone(), cli.port, id);
    println!("Press Ctrl+C to stop.");

    tokio::signal::ctrl_c()
        .await
        .map_err(|e| e.to_string())?;

    if !cli.no_bonjour {
        let _ = bonjour.stop();
    }

    let _ = server.stop_server();

    println!("Stopped.");
    Ok(())
}