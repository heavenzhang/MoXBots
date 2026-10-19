//! Independent outbound owner; no Tauri, Node or OS keyring credential access.
// Original reused modules expose operations beyond this deliberately empty host.
#[allow(dead_code)]
// Shared Desktop modules include operations deliberately absent from a zero-Agent host.
pub(crate) mod agent_network;
mod auth;
mod bot_execution;
mod bot_execution_ipc;
mod management_admission;
mod management_ipc;
mod native_management;
mod notification_source;
mod owned;
mod owned_state;
mod probe;
mod state;
pub(crate) use agent_network::connector;
pub mod cli;
#[allow(dead_code)] // Original registry also exposes Desktop try_acquire.
#[path = "../../src/keyed_lifecycle.rs"]
mod keyed_lifecycle;
#[cfg(test)]
#[allow(dead_code)] // Original test HTTP helper also provides Sidecar clients.
#[path = "../../src/local_http.rs"]
mod local_http;
#[path = "../../src/network_diagnostics.rs"]
mod network_diagnostics;
mod status;
pub(crate) mod proxy_config {
    struct OsResolver;
    impl reqwest::dns::Resolve for OsResolver {
        fn resolve(&self, name: reqwest::dns::Name) -> reqwest::dns::Resolving {
            let host = name.as_str().to_owned();
            Box::pin(async move {
                let addresses =
                    tokio::net::lookup_host((host.as_str(), 0))
                        .await
                        .map_err(|_| {
                            Box::new(crate::network_diagnostics::DnsUnavailable)
                                as Box<dyn std::error::Error + Send + Sync>
                        })?;
                Ok(Box::new(addresses.collect::<Vec<_>>().into_iter()) as reqwest::dns::Addrs)
            })
        }
    }
    pub fn build_client_with_proxy(
        builder: reqwest::ClientBuilder,
    ) -> Result<reqwest::Client, reqwest::Error> {
        builder
            .dns_resolver(std::sync::Arc::new(OsResolver))
            .build()
    }
}
// The original diagnostic helper has already redacted every dynamic component.
#[macro_export]
macro_rules! ulog_warn { ($message:ident; request_id = $id:ident) => { eprintln!("{} requestId={}", $message, $id) }; ($($args:tt)*) => {eprintln!($($args)*)}; }
#[macro_export]
macro_rules! ulog_info { ($($args:tt)*) => {eprintln!($($args)*)}; }
pub(crate) mod device_identity {
    use std::sync::OnceLock;
    #[derive(Clone)]
    pub struct DeviceIdentity {
        pub device_id: String,
        pub device_name: Option<String>,
        pub platform: String,
        pub os_version: Option<String>,
        pub app_version: String,
    }
    static DEVICE: OnceLock<DeviceIdentity> = OnceLock::new();
    pub fn initialize(id: String, name: Option<String>) -> Result<(), ()> {
        DEVICE
            .set(DeviceIdentity {
                device_id: id,
                device_name: name,
                platform: format!("{}-{}", std::env::consts::OS, std::env::consts::ARCH),
                os_version: None,
                app_version: env!("CARGO_PKG_VERSION").into(),
            })
            .map_err(|_| ())
    }
    pub fn current_device_identity() -> Result<DeviceIdentity, ()> {
        DEVICE.get().cloned().ok_or(())
    }
}
pub(crate) mod space_cloud {
    pub(crate) mod agent_network {
        pub(crate) use crate::agent_network::account_operation::AccountOperation;
        pub(crate) use crate::auth::{read_account_response_body, OfficialAccountSession};
    }
}

pub(crate) async fn shutdown() {
    #[cfg(unix)]
    {
        if let Ok(mut term) =
            tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
        {
            tokio::select! {_=tokio::signal::ctrl_c()=>{},_=term.recv()=>{}};
            return;
        }
    }
    let _ = tokio::signal::ctrl_c().await;
}
