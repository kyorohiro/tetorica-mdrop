use local_ip_address::local_ip;
use mdns_sd::{ServiceDaemon, ServiceInfo};
use std::collections::HashMap;
//use std::{sync::LazyLock, time::Duration};
use serde::Serialize;
use std::sync::Mutex;

//
use std::time::Duration;
use tokio::sync::watch;

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize)]
pub struct BonjourStatus {
    pub running: bool,
    pub service_name: Option<String>,
    pub service_type: Option<String>,
    pub port: Option<u16>,
}

pub struct BonjourContext {
    running: bool,
    service_name: Option<String>,
    service_type: Option<String>,
    port: Option<u16>,
    //
    daemon: Option<ServiceDaemon>,
    service: Option<ServiceInfo>,
    //
    reannounce_stop_tx: Option<watch::Sender<bool>>,
}

impl BonjourContext {
    pub fn new() -> Self {
        return Self {
            running: false,
            service_name: None,
            service_type: None,
            port: None,
            //
            daemon: None,
            service: None,
            reannounce_stop_tx: None,
        };
    }

    pub fn status(&self) -> BonjourStatus {
        BonjourStatus {
            running: self.running,
            service_name: self.service_name.clone(),
            service_type: self.service_type.clone(),
            port: self.port,
        }
    }

    pub fn start_bonjour(&mut self, hostname: String, port: u16) -> Result<BonjourStatus, String> {
        println!("> start_bonjour");

        if self.running {
            return Ok(self.status());
        }

        let service_type = "_http._tcp.local.";
        let service_name = format!("Tetorica mDrop ({hostname})");

        let mut properties = HashMap::new();
        properties.insert("path".to_string(), "/".to_string());

        let ip = local_ip().map_err(|e| e.to_string())?;

        let service = ServiceInfo::new(
            service_type,
            &service_name,
            &(format!("{}.", hostname)),
            ip,
            port,
            properties,
        )
        .map_err(|e| e.to_string())?
        .enable_addr_auto();

        let daemon = ServiceDaemon::new().map_err(|e| e.to_string())?;
        daemon
            .register(service.clone())
            .map_err(|e| e.to_string())?;
        self.daemon = Some(daemon);
        self.service = Some(service);
        self.running = true;
        self.service_name = Some(service_name.to_string());
        self.service_type = Some(service_type.to_string());
        self.port = Some(port);

        return Ok(self.status());
    }

    pub fn stop_bonjour(&mut self) -> Result<BonjourStatus, String> {
        println!("> stop_bonjour");

        if let Some(daemon) = self.daemon.take() {
            let _ = daemon.shutdown();
        }

        self.running = false;
        self.service_name = None;
        self.service_type = None;
        self.port = None;
        self.service = None;
        //self.daemon = None;

        return Ok(self.status());
    }
    //
    pub fn register_bonjour(&mut self) -> Result<BonjourStatus, String> {
        println!("> register_bonjour");

        if !self.running {
            //
            return Ok(self.status());
        }

        if self.daemon.is_none() {
            //
            return Ok(self.status());
        }
        if self.service.is_none() {
            //
            return Ok(self.status());
        }

        match self
            .daemon
            .as_ref()
            .unwrap()
            .register(self.service.as_ref().unwrap().clone())
        {
            Ok(_) => {
                println!("mDNS re-announce");
            }
            Err(e) => {
                eprintln!("mDNS re-announce error: {e}");
            }
        }

        return Ok(self.status());
    }
}

pub struct SharedBonjourContext {
    inner: Mutex<BonjourContext>,
}

impl SharedBonjourContext {
    pub fn new() -> Self {
        Self {
            inner: Mutex::new(BonjourContext::new()),
        }
    }

    pub fn start(&self, hostname: String, port: u16) -> Result<BonjourStatus, String> {
        let status = self.start_bonjour(hostname, port)?;

        if let Err(e) = self.start_reannounce() {
            let _ = self.stop_bonjour();
            return Err(e);
        }

        Ok(status)
    }

    pub fn stop(&self) -> Result<BonjourStatus, String> {
        let _ = self.stop_reannounce();
        self.stop_bonjour()
    }
    pub fn start_bonjour(&self, hostname: String, port: u16) -> Result<BonjourStatus, String> {
        let mut ctx = self.inner.lock().map_err(|e| e.to_string())?;
        ctx.start_bonjour(hostname, port)
    }

    pub fn stop_bonjour(&self) -> Result<BonjourStatus, String> {
        let mut ctx = self.inner.lock().map_err(|e| e.to_string())?;
        ctx.stop_bonjour()
    }

    pub fn status(&self) -> Result<BonjourStatus, String> {
        let ctx = self.inner.lock().map_err(|e| e.to_string())?;
        Ok(ctx.status())
    }

    pub fn register_bonjour(&self) -> Result<BonjourStatus, String> {
        let mut ctx = self.inner.lock().map_err(|e| e.to_string())?;
        ctx.register_bonjour()
    }

    pub fn start_reannounce(&self) -> Result<(), String> {
        let mut ctx = self.inner.lock().map_err(|e| e.to_string())?;
        let (stop_tx, mut stop_rx) = watch::channel(false);

        if ctx.reannounce_stop_tx.is_some() {
            return Ok(());
        }
        let Some(daemon_for_task) = ctx.daemon.clone() else {
            return Err("bonjour daemon is not running".to_string());
        };

        let Some(service_for_task) = ctx.service.clone() else {
            return Err("bonjour service is not registered".to_string());
        };

        tokio::spawn(async move {
            loop {
                tokio::select! {
                    _ = tokio::time::sleep(Duration::from_secs(30)) => {
                        match daemon_for_task.register(service_for_task.clone()) {
                            Ok(_) => {
                                println!("mDNS re-announce");
                            }
                            Err(e) => {
                                eprintln!("mDNS re-announce error: {e}");
                            }
                        }
                    }
                    changed = stop_rx.changed() => {
                        if changed.is_err() || *stop_rx.borrow() {
                            println!("mDNS re-announce stopped");
                            break;
                        }
                    }
                }
            }
        });

        ctx.reannounce_stop_tx = Some(stop_tx);
        Ok(())
    }

    pub fn stop_reannounce(&self) -> Result<(), String> {
        let mut ctx = self.inner.lock().map_err(|e| e.to_string())?;

        if let Some(tx) = ctx.reannounce_stop_tx.take() {
            let _ = tx.send(true);
        }
        Ok(())
    }
}
