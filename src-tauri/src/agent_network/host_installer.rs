//! Read-only, same-issuer publication discovery. It never installs or authorizes a Host.
use super::NetworkError;
use serde::{Deserialize, Serialize};
use std::time::Duration;

const MAX_INDEX: usize = 16_384;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Available {
    schema_version: u8,
    status: String,
    profile: String,
    platform: String,
    script_path: String,
    release_id: String,
    source_commit: String,
    bootstrap_path: String,
    bootstrap_sha256: String,
    bootstrap_bytes: u64,
    bundle_path: String,
    bundle_sha256: String,
    bundle_bytes: u64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Unavailable {
    schema_version: u8,
    status: String,
}

#[derive(Deserialize)]
#[serde(untagged)]
enum Manifest {
    Available(Available),
    Unavailable(Unavailable),
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct InstallerInfo {
    pub status: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub command: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub release_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source_commit: Option<String>,
}

impl InstallerInfo {
    fn unavailable() -> Self {
        Self {
            status: "unavailable",
            command: None,
            release_id: None,
            source_commit: None,
        }
    }
}

fn invalid() -> NetworkError {
    NetworkError::new("HOST_INSTALLER_INVALID")
}

fn origin(value: &str) -> Result<url::Url, NetworkError> {
    let url = url::Url::parse(value).map_err(|_| invalid())?;
    // Match the public bootstrap's supported DNS/IPv4 origin contract.
    let supported_host = match url.host() {
        Some(url::Host::Ipv4(_)) => true,
        Some(url::Host::Domain(host)) => {
            !host.starts_with('.')
                && !host.ends_with('.')
                && !host.contains("..")
                && host
                    .bytes()
                    .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'.' || b == b'-')
        }
        _ => false,
    };
    if !supported_host
        || url.scheme() != "https"
        || url.origin().ascii_serialization() != value
        || url.host_str().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
    {
        return Err(invalid());
    }
    Ok(url)
}

fn lower_hex(value: &str, size: usize) -> bool {
    value.len() == size
        && value
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}

fn shell_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\"'\"'"))
}

fn parse(issuer: &str, bytes: &[u8]) -> Result<InstallerInfo, NetworkError> {
    origin(issuer)?;
    if bytes.is_empty() || bytes.len() > MAX_INDEX {
        return Err(invalid());
    }
    let manifest: Manifest = serde_json::from_slice(bytes).map_err(|_| invalid())?;
    let m = match manifest {
        Manifest::Available(m) => m,
        Manifest::Unavailable(m) => {
            if m.schema_version == 1 && m.status == "unavailable" {
                return Ok(InstallerInfo::unavailable());
            }
            return Err(invalid());
        }
    };
    let (date, suffix) = m.release_id.split_once('-').ok_or_else(invalid)?;
    if m.schema_version != 1
        || m.status != "available"
        || m.profile != "moxbot-test"
        || m.platform != "ubuntu-24.04-x86_64"
        || m.script_path != "/host/install.sh"
        || !lower_hex(&m.source_commit, 40)
        || date.len() != 14
        || !date.bytes().all(|b| b.is_ascii_digit())
        || suffix != &m.source_commit[..12]
        || m.bootstrap_path != format!("/host/releases/{}/bootstrap.py", m.release_id)
        || m.bundle_path != format!("/host/releases/{}/bundle.tar.gz", m.release_id)
        || !lower_hex(&m.bootstrap_sha256, 64)
        || !lower_hex(&m.bundle_sha256, 64)
        || !(1..=262_144).contains(&m.bootstrap_bytes)
        || !(1..=2_147_483_648).contains(&m.bundle_bytes)
    {
        return Err(invalid());
    }
    let command = format!(
        "curl --proto '=https' --tlsv1.2 -fsS --max-time 30 {} | sudo bash -s -- --instance {}",
        shell_quote(&format!("{issuer}/host/install.sh")),
        shell_quote(issuer)
    );
    Ok(InstallerInfo {
        status: "available",
        command: Some(command),
        release_id: Some(m.release_id),
        source_commit: Some(m.source_commit),
    })
}

pub(crate) async fn fetch(issuer: &str) -> Result<InstallerInfo, NetworkError> {
    let mut endpoint = origin(issuer)?;
    endpoint.set_path("/host/stable.json");
    // Public installers must also work on a clean Ubuntu machine. Do not add
    // a desktop-private CA here that curl and the Linux bootstrap do not have.
    // Fixed external HTTPS origin; the localhost builder is inappropriate here.
    #[allow(clippy::disallowed_methods)]
    let builder = reqwest::Client::builder()
        .https_only(true)
        .no_proxy()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(Duration::from_secs(10))
        .retry(reqwest::retry::never())
        .tls_backend_preconfigured(super::crypto::external_tls_config()?);
    let client = builder
        .build()
        .map_err(|_| NetworkError::new("HOST_INSTALLER_UNAVAILABLE"))?;
    let mut response = client
        .get(endpoint)
        .header(reqwest::header::ACCEPT, "application/json")
        .send()
        .await
        .map_err(|_| NetworkError::new("HOST_INSTALLER_UNAVAILABLE"))?;
    if response.status() == reqwest::StatusCode::NOT_FOUND {
        return Ok(InstallerInfo::unavailable());
    }
    if !response.status().is_success()
        || response
            .content_length()
            .is_some_and(|size| size > MAX_INDEX as u64)
    {
        return Err(NetworkError::new("HOST_INSTALLER_UNAVAILABLE"));
    }
    let mut body = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| NetworkError::new("HOST_INSTALLER_UNAVAILABLE"))?
    {
        if body.len().saturating_add(chunk.len()) > MAX_INDEX {
            return Err(invalid());
        }
        body.extend_from_slice(&chunk);
    }
    parse(issuer, &body)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::{json, Value};
    fn manifest() -> Value {
        json!({"schemaVersion":1,"status":"available","profile":"moxbot-test","platform":"ubuntu-24.04-x86_64",
            "scriptPath":"/host/install.sh","releaseId":"20261018090000-aaaaaaaaaaaa","sourceCommit":"a".repeat(40),
            "bootstrapPath":"/host/releases/20261018090000-aaaaaaaaaaaa/bootstrap.py","bootstrapSha256":"b".repeat(64),"bootstrapBytes":100,
            "bundlePath":"/host/releases/20261018090000-aaaaaaaaaaaa/bundle.tar.gz","bundleSha256":"c".repeat(64),"bundleBytes":1000})
    }
    #[test]
    fn publication_is_strict_and_only_available_produces_a_command() {
        let info = parse(
            "https://140.143.183.232",
            &serde_json::to_vec(&manifest()).unwrap(),
        )
        .unwrap();
        assert!(info
            .command
            .unwrap()
            .contains("--instance 'https://140.143.183.232'"));
        assert!(parse(
            "https://owned.example",
            br#"{"schemaVersion":1,"status":"unavailable"}"#
        )
        .unwrap()
        .command
        .is_none());
        for (field, value) in [
            ("profile", json!("myagents-test")),
            ("platform", json!("linux-arm64")),
            (
                "scriptPath",
                json!("https://elsewhere.example/host/install.sh"),
            ),
            ("bootstrapPath", json!("/host/releases/../bootstrap.py")),
            (
                "bundlePath",
                json!("/host/releases/20261018090000-aaaaaaaaaaaa/bundle.tar.gz?token=secret"),
            ),
            ("bootstrapBytes", json!(262145)),
            ("bundleBytes", json!(2147483649u64)),
            ("sourceCommit", json!("a")),
            ("releaseId", json!("20261018090000-bbbbbbbbbbbb")),
            ("unexpected", json!(true)),
        ] {
            let mut bad = manifest();
            bad[field] = value;
            assert!(
                parse("https://owned.example", &serde_json::to_vec(&bad).unwrap()).is_err(),
                "{field}"
            );
        }
        assert!(parse(
            "https://owned.example",
            br#"{"schemaVersion":1,"status":"unavailable","command":"bad"}"#
        )
        .is_err());
        assert!(parse(
            "http://owned.example",
            &serde_json::to_vec(&manifest()).unwrap()
        )
        .is_err());
        assert!(parse(
            "https://owned.example/path",
            &serde_json::to_vec(&manifest()).unwrap()
        )
        .is_err());
        for issuer in [
            "https://[::1]",
            "https://owned.example.",
            "https://bad_host.example",
            "https://bad..example",
        ] {
            assert!(parse(issuer, &serde_json::to_vec(&manifest()).unwrap()).is_err());
        }
        assert!(parse("https://owned.example", &vec![b' '; MAX_INDEX + 1]).is_err());
    }
}
