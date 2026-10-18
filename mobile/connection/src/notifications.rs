//! Native notification endpoint state. Push addresses are transient request data;
//! authenticated server hints never grant target or session execution authority.
use super::*;
use reqwest::Method;
static INSTALLATION_GATE: std::sync::Mutex<()> = std::sync::Mutex::new(());
const RECORD: &str = "notification-registration-v1";
const INSTALLATION: &str = "notification-installation-v1";
const BASE: &str = "/api/mobile-notify/v1/endpoints";
#[derive(Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Binding {
    issuer: String,
    service_id: String,
    environment: String,
    network_id: String,
    principal_id: String,
    device_id: String,
    trust_digest: String,
}
#[derive(Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
enum Provider {
    #[serde(rename = "fcm")]
    Fcm,
    #[serde(rename = "apns-sandbox")]
    Sandbox,
    #[serde(rename = "apns-production")]
    Production,
}
#[derive(Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
enum State {
    Disabled,
    Enabled,
    Unconfirmed,
}
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Registration {
    version: u8,
    binding: Binding,
    installation_id: String,
    provider: Provider,
    endpoint_id: Option<String>,
    state: State,
    error_code: Option<String>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Registered {
    version: u8,
    endpoint_id: String,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Revoked {
    version: u8,
    ok: bool,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Redeemed {
    version: u8,
    target_device_id: String,
    agent_id: String,
    session_id: String,
}
fn uuid(s: &str) -> bool {
    uuid::Uuid::parse_str(s).is_ok_and(|v| v.to_string() == s)
}
fn code(s: &str) -> bool {
    !s.is_empty()
        && s.len() <= 128
        && s.bytes()
            .all(|b| b.is_ascii_uppercase() || b.is_ascii_digit() || b == b'_')
}
fn digest<T: Serialize>(v: &T) -> Result<String, NetworkError> {
    let bytes = serde_json::to_vec(v).map_err(|_| err("MOBILE_NOTIFICATION_STATE_INVALID"))?;
    Ok(format!("{:x}", Sha256::digest(bytes)))
}
impl Binding {
    fn from_saved(s: &SavedAccount) -> Result<Self, NetworkError> {
        // A display-name change is not a new trust or account authority.
        let mut trust = s.instance.clone();
        trust.name.clear();
        Ok(Self {
            issuer: s.instance.issuer.clone(),
            service_id: s.instance.service_id.clone(),
            environment: s.instance.environment.clone(),
            network_id: s.instance.network_id.clone(),
            principal_id: s.session.principal_id.clone(),
            device_id: s.device_id.clone(),
            trust_digest: digest(&trust)?,
        })
    }
    fn scope(&self) -> Result<String, NetworkError> {
        Ok(format!("notification-v1:{}", digest(self)?))
    }
}
fn view(record: Option<&Registration>) -> Value {
    let record = record.filter(|r| r.state != State::Disabled);
    json!({"kind":"notification","state":record.map_or(State::Disabled,|r|r.state),"provider":record.map(|r|r.provider),"errorCode":record.and_then(|r|r.error_code.as_deref())})
}
impl MobileConnection {
    fn notification_binding(&self) -> Result<Binding, NetworkError> {
        if !self.active.load(Ordering::Acquire) {
            return Err(err("ACCOUNT_BINDING_CHANGED"));
        }
        let saved = self
            .saved
            .as_ref()
            .ok_or_else(|| err("OWNED_LOGIN_REQUIRED"))?;
        saved.instance.validate(&self.config.issuer)?;
        saved.session.validate(&saved.instance)?;
        if !uuid(&saved.device_id) {
            return Err(err("OWNED_SESSION_INVALID"));
        }
        Binding::from_saved(saved)
    }
    fn notification_current(
        &self,
        binding: &Binding,
        active: &Arc<AtomicBool>,
    ) -> Result<(), NetworkError> {
        if !Arc::ptr_eq(active, &self.active) || self.notification_binding()? != *binding {
            return Err(err("ACCOUNT_BINDING_CHANGED"));
        }
        Ok(())
    }
    fn notification_persist<T: Serialize>(
        &self,
        binding: &Binding,
        value: &T,
    ) -> Result<(), NetworkError> {
        let bytes = Zeroizing::new(
            serde_json::to_vec(value).map_err(|_| err("MOBILE_NOTIFICATION_STATE_INVALID"))?,
        );
        if bytes.len() > 8192 {
            return Err(err("MOBILE_NOTIFICATION_STATE_INVALID"));
        }
        self.notification_write(&binding.scope()?, RECORD, &bytes)
    }
    fn notification_write(&self, scope: &str, key: &str, bytes: &[u8]) -> Result<(), NetworkError> {
        self.store
            .write_record(scope, key, bytes)
            .map_err(store_error)?;
        let read = self.store.read_record(scope, key).map_err(store_error)?;
        if read.as_deref().map(|b| b.as_slice()) != Some(bytes) {
            return Err(err("MOBILE_NOTIFICATION_PERSISTENCE_UNCONFIRMED"));
        }
        Ok(())
    }
    fn notification_installation(&self, create: bool) -> Result<Option<String>, NetworkError> {
        let _gate = INSTALLATION_GATE
            .lock()
            .map_err(|_| err("MOBILE_SECURE_STORE_UNAVAILABLE"))?;
        if let Some(bytes) = self
            .store
            .read_record(&self.config.issuer, INSTALLATION)
            .map_err(store_error)?
        {
            let id = std::str::from_utf8(&bytes)
                .map_err(|_| err("MOBILE_NOTIFICATION_STATE_INVALID"))?;
            if !uuid(id) {
                return Err(err("MOBILE_NOTIFICATION_STATE_INVALID"));
            }
            return Ok(Some(id.into()));
        }
        if !create {
            return Ok(None);
        }
        let id = uuid::Uuid::new_v4().to_string();
        self.notification_write(&self.config.issuer, INSTALLATION, id.as_bytes())?;
        Ok(Some(id))
    }
    fn notification_record(&self, binding: &Binding) -> Result<Option<Registration>, NetworkError> {
        let Some(bytes) = self
            .store
            .read_record(&binding.scope()?, RECORD)
            .map_err(store_error)?
        else {
            return Ok(None);
        };
        if bytes.len() > 8192 {
            return Err(err("MOBILE_NOTIFICATION_STATE_INVALID"));
        }
        let record: Registration =
            serde_json::from_slice(&bytes).map_err(|_| err("MOBILE_NOTIFICATION_STATE_INVALID"))?;
        if record.version != 1
            || record.binding != *binding
            || !uuid(&record.installation_id)
            || self.notification_installation(false)?.as_deref() != Some(&record.installation_id)
            || record.endpoint_id.as_deref().is_some_and(|id| !uuid(id))
            || record.state == State::Enabled
                && (record.endpoint_id.is_none() || record.error_code.is_some())
            || record.state == State::Disabled
                && (record.endpoint_id.is_some() || record.error_code.is_some())
            || record.state == State::Unconfirmed && record.error_code.is_none()
            || record.error_code.as_deref().is_some_and(|c| !code(c))
        {
            return Err(err("MOBILE_NOTIFICATION_STATE_INVALID"));
        }
        Ok(Some(record))
    }
    fn notification_http(&self) -> Result<(OwnedClient, Zeroizing<String>), NetworkError> {
        self.notification_binding()?;
        let saved = self
            .saved
            .as_ref()
            .ok_or_else(|| err("OWNED_LOGIN_REQUIRED"))?;
        Ok((
            OwnedClient::pinned(saved.instance.clone(), self.config.public_tls_ca.as_deref())?,
            Zeroizing::new(saved.session.access_token.clone()),
        ))
    }
    fn notification_failure(&self, record: &mut Registration, error: NetworkError) -> NetworkError {
        record.state = State::Unconfirmed;
        record.error_code = Some(error.code.clone());
        match self.notification_persist(&record.binding, record) {
            Ok(()) => error,
            Err(e) => e,
        }
    }
    pub(super) async fn notification(&mut self, mut intent: Value) -> Result<Value, NetworkError> {
        let kind = intent["kind"]
            .as_str()
            .ok_or_else(|| err("MOBILE_INTENT_INVALID"))?
            .to_owned();
        // Validate registration before restoring account or reserving any state.
        let provider = if kind == "notification.register" || kind == "notification.refresh" {
            let p: Provider = serde_json::from_value(intent["provider"].clone())
                .map_err(|_| err("MOBILE_INTENT_INVALID"))?;
            let token = intent["token"]
                .as_str()
                .filter(|s| !s.is_empty() && s.len() <= 4096 && !s.chars().any(char::is_control))
                .ok_or_else(|| err("MOBILE_INTENT_INVALID"))?;
            if serde_json::to_vec(&json!({"version":1,"provider":p,"installationId":uuid::Uuid::nil().to_string(),"token":token})).map_err(|_|err("MOBILE_INTENT_INVALID"))?.len()>8192 {return Err(err("MOBILE_INTENT_INVALID"));}
            Some(p)
        } else {
            None
        };
        if kind == "notification.open" && !intent["eventId"].as_str().is_some_and(uuid) {
            return Err(err("MOBILE_INTENT_INVALID"));
        }
        // An automatic callback cannot restore an old account from disk or
        // create its own current scope. Normal UI status/account restoration
        // must have established the live owner before refresh is eligible.
        if kind != "notification.refresh" {
            self.restore().await?;
        }
        let binding = self.notification_binding()?;
        let active = self.active.clone();
        let action = async {
            let result = match kind.as_str() {
                "notification.status" => Ok(view(self.notification_record(&binding)?.as_ref())),
                "notification.register" | "notification.refresh" => {
                    let token = Zeroizing::new(
                        intent["token"]
                            .take()
                            .as_str()
                            .ok_or_else(|| err("MOBILE_INTENT_INVALID"))?
                            .to_owned(),
                    );
                    self.notification_register(
                        &binding,
                        provider.ok_or_else(|| err("MOBILE_INTENT_INVALID"))?,
                        &token,
                        kind == "notification.refresh",
                    )
                    .await
                }
                "notification.disable" => self.notification_disable(&binding).await,
                "notification.open" => {
                    self.notification_open(
                        &binding,
                        intent["eventId"]
                            .as_str()
                            .ok_or_else(|| err("MOBILE_INTENT_INVALID"))?,
                    )
                    .await
                }
                _ => Err(err("MOBILE_INTENT_INVALID")),
            }?;
            self.notification_current(&binding, &active)?;
            Ok(result)
        };
        tokio::time::timeout(Duration::from_secs(35), action)
            .await
            .map_err(|_| err("MOBILE_NOTIFICATIONS_UNCONFIRMED"))?
    }
    async fn notification_register(
        &self,
        binding: &Binding,
        provider: Provider,
        token: &str,
        refresh_only: bool,
    ) -> Result<Value, NetworkError> {
        let previous = self.notification_record(binding)?;
        if refresh_only {
            let Some(record) = previous.as_ref().filter(|r| r.state == State::Enabled) else {
                return Ok(view(previous.as_ref()));
            };
            if record.provider != provider {
                return Err(err("MOBILE_NOTIFICATION_PROVIDER_CHANGED"));
            }
        }
        if previous
            .as_ref()
            .is_some_and(|r| r.provider != provider && r.state != State::Disabled)
        {
            self.notification_disable(binding).await?;
        }
        let previous = self.notification_record(binding)?;
        let mut record = Registration {
            version: 1,
            binding: binding.clone(),
            installation_id: self
                .notification_installation(true)?
                .ok_or_else(|| err("MOBILE_NOTIFICATION_STATE_INVALID"))?,
            provider,
            endpoint_id: previous.and_then(|r| {
                if r.provider == provider {
                    r.endpoint_id
                } else {
                    None
                }
            }),
            state: State::Unconfirmed,
            error_code: Some("MOBILE_NOTIFICATIONS_UNCONFIRMED".into()),
        };
        self.notification_persist(binding, &record)?;
        let (client, bearer) = self.notification_http()?;
        let response=client.notification_request(Method::POST,BASE,Some(json!({"version":1,"installationId":record.installation_id,"provider":provider,"token":token})),&bearer).await;
        let response = match response {
            Ok(v) => v,
            Err(e) => return Err(self.notification_failure(&mut record, e)),
        };
        let registered: Registered = match serde_json::from_value(response) {
            Ok(v) => v,
            Err(_) => {
                return Err(self.notification_failure(
                    &mut record,
                    err("MOBILE_NOTIFICATION_RESPONSE_INVALID"),
                ))
            }
        };
        if registered.version != 1 || !uuid(&registered.endpoint_id) {
            return Err(
                self.notification_failure(&mut record, err("MOBILE_NOTIFICATION_RESPONSE_INVALID"))
            );
        }
        self.notification_binding().and_then(|current| {
            if current == *binding {
                Ok(())
            } else {
                Err(err("ACCOUNT_BINDING_CHANGED"))
            }
        })?;
        record.endpoint_id = Some(registered.endpoint_id);
        record.state = State::Enabled;
        record.error_code = None;
        self.notification_persist(binding, &record)?;
        Ok(view(Some(&record)))
    }
    async fn notification_disable(&self, binding: &Binding) -> Result<Value, NetworkError> {
        let Some(mut record) = self.notification_record(binding)? else {
            return Ok(view(None));
        };
        if record.state == State::Disabled {
            return Ok(view(None));
        }
        record.state = State::Unconfirmed;
        record.error_code = Some("MOBILE_NOTIFICATIONS_UNCONFIRMED".into());
        self.notification_persist(binding, &record)?;
        let Some(endpoint) = record.endpoint_id.as_ref() else {
            return Err(err("MOBILE_NOTIFICATIONS_UNCONFIRMED"));
        };
        let (client, bearer) = self.notification_http()?;
        let response = client
            .notification_request(Method::DELETE, &format!("{BASE}/{endpoint}"), None, &bearer)
            .await;
        let response = match response {
            Ok(v) => v,
            Err(e) => return Err(self.notification_failure(&mut record, e)),
        };
        let revoked: Revoked = match serde_json::from_value(response) {
            Ok(v) => v,
            Err(_) => {
                return Err(self.notification_failure(
                    &mut record,
                    err("MOBILE_NOTIFICATION_RESPONSE_INVALID"),
                ))
            }
        };
        if revoked.version != 1 || !revoked.ok {
            return Err(
                self.notification_failure(&mut record, err("MOBILE_NOTIFICATION_RESPONSE_INVALID"))
            );
        }
        self.notification_binding().and_then(|current| {
            if current == *binding {
                Ok(())
            } else {
                Err(err("ACCOUNT_BINDING_CHANGED"))
            }
        })?;
        record.state = State::Disabled;
        record.error_code = None;
        record.endpoint_id = None;
        self.notification_persist(binding, &record)?;
        Ok(view(None))
    }
    async fn notification_open(
        &mut self,
        binding: &Binding,
        event: &str,
    ) -> Result<Value, NetworkError> {
        let record = self
            .notification_record(binding)?
            .filter(|r| r.state == State::Enabled)
            .ok_or_else(|| err("MOBILE_NOTIFICATION_REGISTRATION_REQUIRED"))?;
        let endpoint = record
            .endpoint_id
            .ok_or_else(|| err("MOBILE_NOTIFICATION_REGISTRATION_REQUIRED"))?;
        let (client, bearer) = self.notification_http()?;
        let value = client
            .notification_request(
                Method::POST,
                &format!("{BASE}/{endpoint}/events/{event}/redeem"),
                Some(json!({"version":1})),
                &bearer,
            )
            .await?;
        let redeemed: Redeemed = serde_json::from_value(value)
            .map_err(|_| err("MOBILE_NOTIFICATION_RESPONSE_INVALID"))?;
        validate_pointer(&redeemed)?;
        if self.notification_binding()? != *binding {
            return Err(err("ACCOUNT_BINDING_CHANGED"));
        }
        self.refresh_targets().await?;
        if self.notification_binding()? != *binding {
            return Err(err("ACCOUNT_BINDING_CHANGED"));
        }
        self.notification_map_open(&redeemed)
    }
    fn notification_map_open(&self, pointer: &Redeemed) -> Result<Value, NetworkError> {
        validate_pointer(pointer)?;
        let approved = self.targets_snapshot()?;
        let (id, target) = self
            .targets
            .iter()
            .find(|(_, t)| t.device == pointer.target_device_id && t.agent == pointer.agent_id)
            .ok_or_else(|| err("MOBILE_TARGET_INVALID"))?;
        let saved = self
            .saved
            .as_ref()
            .ok_or_else(|| err("OWNED_LOGIN_REQUIRED"))?;
        let identity = drafts::identity(saved, target)?;
        if !approved["items"].as_array().is_some_and(|items| {
            items.iter().any(|i| {
                i["targetId"] == *id
                    && i["agentId"] == pointer.agent_id
                    && i["identityKey"] == identity
            })
        }) {
            return Err(err("MOBILE_TARGET_INVALID"));
        }
        Ok(
            json!({"kind":"notification-open","targetId":id,"identityKey":identity,"agentId":pointer.agent_id,"sessionId":pointer.session_id}),
        )
    }
    pub(super) async fn notification_logout(
        &self,
        disk: Option<&[u8]>,
    ) -> Result<(), NetworkError> {
        let parsed: Option<SavedAccount> = if self.saved.is_none() {
            disk.map(serde_json::from_slice)
                .transpose()
                .map_err(|_| err("OWNED_SESSION_INVALID"))?
        } else {
            None
        };
        let Some(saved) = self.saved.as_ref().or(parsed.as_ref()) else {
            return Ok(());
        };
        let binding = Binding::from_saved(saved)?;
        let record = self.notification_record(&binding);
        let remote = async {
            let Some(record) = record? else {
                return Ok(());
            };
            if record.state == State::Disabled {
                return Ok(());
            }
            let endpoint = record
                .endpoint_id
                .ok_or_else(|| err("MOBILE_NOTIFICATIONS_UNCONFIRMED"))?;
            // Disk metadata is not an endpoint selector. Logout may use an
            // expired bearer, but must still pin the configured instance origin.
            saved.instance.validate(&self.config.issuer)?;
            if !uuid(&saved.device_id) {
                return Err(err("OWNED_SESSION_INVALID"));
            }
            let client =
                OwnedClient::pinned(saved.instance.clone(), self.config.public_tls_ca.as_deref())?;
            let value = client
                .notification_request(
                    Method::DELETE,
                    &format!("{BASE}/{endpoint}"),
                    None,
                    &saved.session.access_token,
                )
                .await?;
            let revoked: Revoked = serde_json::from_value(value)
                .map_err(|_| err("MOBILE_NOTIFICATION_RESPONSE_INVALID"))?;
            if revoked.version != 1 || !revoked.ok {
                return Err(err("MOBILE_NOTIFICATION_RESPONSE_INVALID"));
            }
            Ok(())
        };
        let remote = tokio::time::timeout(Duration::from_secs(5), remote)
            .await
            .map_err(|_| err("MOBILE_NOTIFICATIONS_UNCONFIRMED"))
            .and_then(|v| v);
        // Always clear only this account's endpoint state. The non-secret stable
        // installation UUID survives logout. Remote uncertainty remains an error.
        self.store
            .remove_record(&binding.scope()?, RECORD)
            .map_err(store_error)?;
        if self
            .store
            .read_record(&binding.scope()?, RECORD)
            .map_err(store_error)?
            .is_some()
        {
            return Err(err("MOBILE_NOTIFICATION_PERSISTENCE_UNCONFIRMED"));
        }
        remote
    }
}
fn validate_pointer(p: &Redeemed) -> Result<(), NetworkError> {
    if p.version != 1
        || !uuid(&p.target_device_id)
        || p.agent_id.is_empty()
        || p.agent_id.len() > 256
        || !p
            .agent_id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b"._:-".contains(&b))
        || p.session_id.is_empty()
        || p.session_id.len() > 99
        || !p
            .session_id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-')
    {
        return Err(err("MOBILE_NOTIFICATION_RESPONSE_INVALID"));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ffi::tests::{callbacks, Memory};
    use std::sync::Mutex;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    struct Reply {
        status: u16,
        body: String,
        headers: String,
        delay_ms: u64,
        dynamic_body: Option<Arc<Mutex<Value>>>,
    }
    impl Reply {
        fn json(status: u16, value: Value) -> Self {
            Self {
                status,
                body: value.to_string(),
                headers: "Cache-Control: no-store\r\n".into(),
                delay_ms: 0,
                dynamic_body: None,
            }
        }
        fn missing() -> Self {
            Self {
                status: 404,
                body: String::new(),
                headers: String::new(),
                delay_ms: 0,
                dynamic_body: None,
            }
        }
    }
    struct Seen {
        method: String,
        path: String,
        body: Value,
    }
    struct Server {
        origin: String,
        ca: String,
        seen: Arc<Mutex<Vec<Seen>>>,
        task: tokio::task::JoinHandle<Result<(), &'static str>>,
    }
    impl Server {
        async fn start(replies: Vec<Reply>) -> Self {
            let leaf = rcgen::generate_simple_self_signed(vec!["localhost".into()]).unwrap();
            let config = rustls::ServerConfig::builder_with_provider(Arc::new(
                rustls::crypto::ring::default_provider(),
            ))
            .with_safe_default_protocol_versions()
            .unwrap()
            .with_no_client_auth()
            .with_single_cert(
                vec![leaf.cert.der().clone()],
                rustls::pki_types::PrivatePkcs8KeyDer::from(leaf.signing_key.serialize_der())
                    .into(),
            )
            .unwrap();
            let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
            let origin = format!(
                "https://localhost:{}",
                listener.local_addr().unwrap().port()
            );
            let ca = leaf.cert.pem();
            let seen = Arc::new(Mutex::new(Vec::new()));
            let capture = seen.clone();
            let task = tokio::spawn(async move {
                let acceptor = tokio_rustls::TlsAcceptor::from(Arc::new(config));
                for reply in replies {
                    let (stream, _) =
                        tokio::time::timeout(Duration::from_secs(5), listener.accept())
                            .await
                            .map_err(|_| "TCP timeout")?
                            .map_err(|_| "TCP accept")?;
                    let mut stream =
                        tokio::time::timeout(Duration::from_secs(5), acceptor.accept(stream))
                            .await
                            .map_err(|_| "TLS timeout")?
                            .map_err(|_| "TLS accept")?;
                    let mut bytes = Vec::new();
                    let header_end = loop {
                        let mut b = [0u8; 1024];
                        let n = tokio::time::timeout(Duration::from_secs(5), stream.read(&mut b))
                            .await
                            .map_err(|_| "HTTP read timeout")?
                            .map_err(|_| "HTTP read")?;
                        if n == 0 || bytes.len() + n > 16384 {
                            return Err("HTTP input bound");
                        }
                        bytes.extend_from_slice(&b[..n]);
                        if let Some(end) = bytes.windows(4).position(|b| b == b"\r\n\r\n") {
                            break end + 4;
                        }
                    };
                    let headers =
                        std::str::from_utf8(&bytes[..header_end]).map_err(|_| "header UTF8")?;
                    let line = headers.lines().next().ok_or("request line")?;
                    let mut fields = line.split_whitespace();
                    let method = fields.next().ok_or("method")?.to_owned();
                    let path = fields.next().ok_or("path")?.to_owned();
                    if path != "/api/agent-network/instance"
                        && path != "/auth/login/cancel"
                        && !headers.lines().any(|line| {
                            line.eq_ignore_ascii_case(&format!(
                                "authorization: Bearer {}",
                                "a".repeat(43)
                            ))
                        })
                    {
                        return Err("missing synthetic bearer");
                    }
                    let length = headers
                        .lines()
                        .find_map(|line| {
                            line.split_once(':')
                                .filter(|(k, _)| k.eq_ignore_ascii_case("content-length"))
                                .and_then(|(_, v)| v.trim().parse::<usize>().ok())
                        })
                        .unwrap_or(0);
                    if header_end + length > 16384 {
                        return Err("HTTP body bound");
                    }
                    while bytes.len() < header_end + length {
                        let mut b = [0u8; 1024];
                        let n = stream.read(&mut b).await.map_err(|_| "body read")?;
                        if n == 0 {
                            return Err("body EOF");
                        }
                        bytes.extend_from_slice(&b[..n]);
                    }
                    let body = if length == 0 {
                        Value::Null
                    } else {
                        serde_json::from_slice(&bytes[header_end..header_end + length])
                            .map_err(|_| "body JSON")?
                    };
                    capture
                        .lock()
                        .map_err(|_| "capture")?
                        .push(Seen { method, path, body });
                    if reply.delay_ms > 0 {
                        tokio::time::sleep(Duration::from_millis(reply.delay_ms)).await;
                    }
                    let body = reply
                        .dynamic_body
                        .map(|v| v.lock().unwrap().to_string())
                        .unwrap_or(reply.body);
                    let response=format!("HTTP/1.1 {} Response\r\nContent-Type: application/json\r\n{}Content-Length: {}\r\nConnection: close\r\n\r\n{}",reply.status,reply.headers,body.len(),body);
                    stream
                        .write_all(response.as_bytes())
                        .await
                        .map_err(|_| "HTTP response")?;
                }
                Ok(())
            });
            Self {
                origin,
                ca,
                seen,
                task,
            }
        }
        async fn finish(mut self) {
            let result = tokio::time::timeout(Duration::from_secs(5), &mut self.task).await;
            if result.is_err() {
                self.task.abort();
                let _ = self.task.await;
                panic!("notification fixture deadline; task reaped");
            }
            result.unwrap().unwrap().unwrap();
        }
    }
    fn owner(server: &Server, store: Arc<dyn SecureStore>) -> MobileConnection {
        let fixture = crate::agent_network::crypto::tests::Fixture::new();
        let mut jwk = crate::DevicePrivateKey::generate()
            .unwrap()
            .public_jwk()
            .unwrap();
        jwk["kid"] = json!("test");
        jwk["alg"] = json!("ES256");
        jwk["use"] = json!("sig");
        let network = uuid::Uuid::new_v4().to_string();
        let instance = OwnedInstance {
            version: 1,
            profile: "owned-device-relay-v1".into(),
            service_id: uuid::Uuid::new_v4().to_string(),
            environment: "development".into(),
            network_id: network.clone(),
            name: "fixture".into(),
            issuer: server.origin.clone(),
            login_issuer: "https://login.example.test/dex".into(),
            protocol: 1,
            capabilities: vec!["tls13-mtls".into()],
            root_certificate: fixture.ca.pem(),
            jwks: json!({"keys":[jwk]}),
        };
        let mut o = MobileConnection::new(
            NativeConfig {
                issuer: server.origin.clone(),
                public_tls_ca: Some(server.ca.clone()),
            },
            store,
        )
        .unwrap();
        o.saved = Some(SavedAccount {
            device_id: uuid::Uuid::new_v4().to_string(),
            instance,
            session: OwnedSession {
                access_token: "a".repeat(43),
                expires_at: jsonwebtoken::get_current_timestamp() + 600,
                principal_id: uuid::Uuid::new_v4().to_string(),
                network_id: network,
            },
        });
        o
    }
    fn register(token: &str) -> Value {
        json!({"version":1,"kind":"notification.register","provider":"fcm","token":token})
    }
    fn refresh(token: &str) -> Value {
        json!({"version":1,"kind":"notification.refresh","provider":"fcm","token":token})
    }
    fn status() -> Value {
        json!({"version":1,"kind":"notification.status"})
    }
    fn disable() -> Value {
        json!({"version":1,"kind":"notification.disable"})
    }
    fn registered(endpoint: &str) -> Reply {
        Reply::json(201, json!({"version":1,"endpointId":endpoint}))
    }
    #[tokio::test]
    async fn pinned_registration_rotation_restart_and_account_isolation_never_persist_tokens() {
        let endpoint = uuid::Uuid::new_v4().to_string();
        let instance_reply = Arc::new(Mutex::new(Value::Null));
        let session_reply = Arc::new(Mutex::new(Value::Null));
        let mut discovery = Reply::json(200, Value::Null);
        discovery.dynamic_body = Some(instance_reply.clone());
        let mut session_check = Reply::json(200, Value::Null);
        session_check.dynamic_body = Some(session_reply.clone());
        let server = Server::start(vec![
            registered(&endpoint),
            registered(&endpoint),
            discovery,
            session_check,
            Reply::json(200, json!({"version":1,"ok":true})),
        ])
        .await;
        let memory = Box::<Memory>::default();
        let store: Arc<dyn SecureStore> = Arc::new(callbacks(&memory));
        let mut o = owner(&server, store.clone());
        assert_eq!(
            o.request(status()).await["value"],
            json!({"kind":"notification","state":"disabled","provider":null,"errorCode":null})
        );
        assert_eq!(
            o.request(register("public-token-first")).await["value"]["state"],
            "enabled"
        );
        let installation = o.notification_installation(false).unwrap().unwrap();
        let binding = o.notification_binding().unwrap();
        let bytes = o
            .store
            .read_record(&binding.scope().unwrap(), RECORD)
            .unwrap()
            .unwrap();
        assert!(!std::str::from_utf8(&bytes)
            .unwrap()
            .contains("public-token"));
        assert_eq!(
            o.request(refresh("public-token-rotated")).await["value"]["state"],
            "enabled"
        );
        let saved = o.saved.as_ref().unwrap();
        *instance_reply.lock().unwrap() = serde_json::to_value(&saved.instance).unwrap();
        *session_reply.lock().unwrap() = json!({"principalId":saved.session.principal_id,"networkId":saved.session.network_id,"deviceId":saved.device_id,"expiresAt":saved.session.expires_at});
        // Seed the unchanged original native account record, then exercise its
        // real discovery + authenticated session validation on a cold owner.
        o.store
            .write_record(
                &o.config.issuer,
                "account",
                &serde_json::to_vec(saved).unwrap(),
            )
            .unwrap();
        let config = NativeConfig {
            issuer: o.config.issuer.clone(),
            public_tls_ca: o.config.public_tls_ca.clone(),
        };
        drop(o);
        let mut restarted = MobileConnection::new(config, store).unwrap();
        assert!(restarted.saved.is_none());
        assert_eq!(
            restarted.request(status()).await["value"]["state"],
            "enabled"
        );
        assert_eq!(
            restarted.notification_installation(false).unwrap().unwrap(),
            installation
        );
        let principal = restarted
            .saved
            .as_ref()
            .unwrap()
            .session
            .principal_id
            .clone();
        restarted.saved.as_mut().unwrap().session.principal_id = uuid::Uuid::new_v4().to_string();
        assert_eq!(
            restarted.request(status()).await["value"]["state"],
            "disabled"
        );
        restarted.saved.as_mut().unwrap().session.principal_id = principal;
        assert_eq!(
            restarted.request(disable()).await["value"]["state"],
            "disabled"
        );
        {
            let captured = server.seen.lock().unwrap();
            assert_eq!(captured.len(), 5);
            assert_eq!(captured[0].body["installationId"], installation);
            assert_eq!(captured[1].body["installationId"], installation);
            assert_eq!(captured[1].body["token"], "public-token-rotated");
            assert_eq!(captured[2].path, "/api/agent-network/instance");
            assert_eq!(captured[3].path, "/auth/session");
            assert_eq!(captured[4].method, "DELETE");
        }
        server.finish().await;
    }
    #[tokio::test]
    async fn unmounted_service_and_failed_disable_remain_honestly_unconfirmed() {
        let endpoint = uuid::Uuid::new_v4().to_string();
        let server = Server::start(vec![
            Reply::missing(),
            registered(&endpoint),
            Reply::json(503, json!({"error":{"code":"MOBILE_NOTIFY_UNAVAILABLE"}})),
            Reply::json(200, json!({"version":1,"ok":true})),
        ])
        .await;
        let memory = Box::<Memory>::default();
        let mut o = owner(&server, Arc::new(callbacks(&memory)));
        assert_eq!(
            o.request(register("token-one")).await["error"]["code"],
            "MOBILE_NOTIFICATIONS_UNAVAILABLE"
        );
        assert_eq!(
            o.request(status()).await["value"],
            json!({"kind":"notification","state":"unconfirmed","provider":"fcm","errorCode":"MOBILE_NOTIFICATIONS_UNAVAILABLE"})
        );
        assert_eq!(
            o.request(register("token-two")).await["value"]["state"],
            "enabled"
        );
        assert_eq!(
            o.request(disable()).await["error"]["code"],
            "MOBILE_NOTIFY_UNAVAILABLE"
        );
        assert_eq!(o.request(status()).await["value"]["state"], "unconfirmed");
        assert_eq!(o.request(disable()).await["value"]["state"], "disabled");
        {
            let seen = server.seen.lock().unwrap();
            assert_eq!(seen[2].path, seen[3].path);
            assert_eq!(seen[2].path, format!("{BASE}/{endpoint}"));
        }
        server.finish().await;
    }
    #[tokio::test]
    async fn automatic_refresh_after_disable_or_unconfirmed_never_registers_or_reserves() {
        let endpoint = uuid::Uuid::new_v4().to_string();
        let server = Server::start(vec![
            registered(&endpoint),
            Reply::json(200, json!({"version":1,"ok":true})),
            Reply::json(503, json!({"error":{"code":"MOBILE_NOTIFY_UNAVAILABLE"}})),
        ])
        .await;
        let memory = Box::<Memory>::default();
        let mut cold = MobileConnection::new(
            NativeConfig {
                issuer: server.origin.clone(),
                public_tls_ca: Some(server.ca.clone()),
            },
            Arc::new(callbacks(&memory)),
        )
        .unwrap();
        assert_eq!(
            cold.request(refresh("cold-token")).await["error"]["code"],
            "OWNED_LOGIN_REQUIRED"
        );
        assert!(cold.client.is_none());
        let mut o = owner(&server, Arc::new(callbacks(&memory)));
        assert_eq!(
            o.request(refresh("initial-token")).await["value"]["state"],
            "disabled"
        );
        assert!(o.notification_installation(false).unwrap().is_none());
        assert!(server.seen.lock().unwrap().is_empty());
        assert_eq!(
            o.request(register("enabled-token")).await["value"]["state"],
            "enabled"
        );
        let mut wrong = refresh("wrong-provider");
        wrong["provider"] = json!("apns-sandbox");
        assert_eq!(
            o.request(wrong).await["error"]["code"],
            "MOBILE_NOTIFICATION_PROVIDER_CHANGED"
        );
        assert_eq!(o.request(disable()).await["value"]["state"], "disabled");
        // This dispatch ordering models a previously scheduled OS token callback
        // reaching the single native owner after the user's disable operation.
        assert_eq!(
            o.request(refresh("late-token")).await["value"]["state"],
            "disabled"
        );
        assert_eq!(server.seen.lock().unwrap().len(), 2);
        assert_eq!(
            o.request(register("explicit-retry")).await["error"]["code"],
            "MOBILE_NOTIFY_UNAVAILABLE"
        );
        let before = o
            .notification_record(&o.notification_binding().unwrap())
            .unwrap()
            .unwrap();
        assert_eq!(
            o.request(refresh("ignored-token")).await["value"]["state"],
            "unconfirmed"
        );
        let after = o
            .notification_record(&o.notification_binding().unwrap())
            .unwrap()
            .unwrap();
        assert_eq!(
            serde_json::to_value(before).unwrap(),
            serde_json::to_value(after).unwrap()
        );
        assert_eq!(server.seen.lock().unwrap().len(), 3);
        server.finish().await;
    }
    #[tokio::test]
    async fn same_principal_new_native_login_scope_cannot_refresh_old_enabled_endpoint() {
        let endpoint = uuid::Uuid::new_v4().to_string();
        let server = Server::start(vec![registered(&endpoint)]).await;
        let memory = Box::<Memory>::default();
        let mut o = owner(&server, Arc::new(callbacks(&memory)));
        assert_eq!(
            o.request(register("token")).await["value"]["state"],
            "enabled"
        );
        let principal = o.saved.as_ref().unwrap().session.principal_id.clone();
        o.saved.as_mut().unwrap().device_id = uuid::Uuid::new_v4().to_string();
        o.active = Arc::new(AtomicBool::new(true));
        assert_eq!(o.saved.as_ref().unwrap().session.principal_id, principal);
        assert_eq!(
            o.request(refresh("late-old-callback")).await["value"]["state"],
            "disabled"
        );
        assert_eq!(server.seen.lock().unwrap().len(), 1);
        server.finish().await;
    }
    #[tokio::test]
    async fn failed_native_confirmation_keeps_reservation_and_does_not_return_enabled() {
        let endpoint = uuid::Uuid::new_v4().to_string();
        let server = Server::start(vec![registered(&endpoint), registered(&endpoint)]).await;
        let memory = Box::<Memory>::default();
        memory.discard_on.store(3, Ordering::SeqCst);
        let mut o = owner(&server, Arc::new(callbacks(&memory)));
        assert_eq!(
            o.request(register("token")).await["error"]["code"],
            "MOBILE_NOTIFICATION_PERSISTENCE_UNCONFIRMED"
        );
        assert_eq!(o.request(status()).await["value"]["state"], "unconfirmed");
        assert_eq!(
            o.request(register("token")).await["value"]["state"],
            "enabled"
        );
        {
            let seen = server.seen.lock().unwrap();
            assert_eq!(
                seen[0].body["installationId"],
                seen[1].body["installationId"]
            );
        }
        server.finish().await;
    }
    #[tokio::test]
    async fn response_limits_no_redirect_retry_and_scope_fail_closed() {
        let mut redirect = Reply::json(302, json!({"error":{"code":"REDIRECT_NOT_ALLOWED"}}));
        redirect
            .headers
            .push_str("Location: https://localhost:1/do-not-follow\r\n");
        let too_large = Reply {
            status: 201,
            body: "x".repeat(8193),
            headers: "Cache-Control: no-store\r\n".into(),
            delay_ms: 0,
            dynamic_body: None,
        };
        let server = Server::start(vec![
            redirect,
            too_large,
            Reply::json(201, json!({"version":1,"endpointId":"../../escape"})),
            Reply {
                status: 201,
                body: json!({"version":1,"endpointId":uuid::Uuid::new_v4().to_string()})
                    .to_string(),
                headers: String::new(),
                delay_ms: 0,
                dynamic_body: None,
            },
        ])
        .await;
        let memory = Box::<Memory>::default();
        let mut o = owner(&server, Arc::new(callbacks(&memory)));
        for expected in [
            "REDIRECT_NOT_ALLOWED",
            "OWNED_RESPONSE_TOO_LARGE",
            "MOBILE_NOTIFICATION_RESPONSE_INVALID",
            "OWNED_RESPONSE_INVALID",
        ] {
            assert_eq!(
                o.request(register("token")).await["error"]["code"],
                expected
            );
            assert_eq!(o.request(status()).await["value"]["state"], "unconfirmed");
        }
        o.saved.as_mut().unwrap().session.expires_at = 0;
        assert_eq!(
            o.request(status()).await["error"]["code"],
            "OWNED_SESSION_INVALID"
        );
        assert_eq!(server.seen.lock().unwrap().len(), 4);
        server.finish().await;
    }
    #[tokio::test]
    async fn failed_pending_login_cancel_retains_original_proof_until_explicit_retry_succeeds() {
        let server = Server::start(vec![
            Reply::json(
                503,
                json!({"error":{"code":"SYNTHETIC_CANCEL_UNAVAILABLE"}}),
            ),
            Reply::json(204, Value::Null),
        ])
        .await;
        let memory = Box::<Memory>::default();
        let mut o = owner(&server, Arc::new(callbacks(&memory)));
        let instance = o.saved.take().unwrap().instance;
        o.client = Some(OwnedClient::pinned(instance, Some(&server.ca)).unwrap());
        let device = uuid::Uuid::new_v4().to_string();
        let transaction = uuid::Uuid::new_v4().to_string();
        let verifier = "v".repeat(43);
        o.pending = Some(PendingLogin {
            device: device.clone(),
            transaction: transaction.clone(),
            verifier: Zeroizing::new(verifier.clone()),
            expires: jsonwebtoken::get_current_timestamp() + 300,
        });
        let first = o
            .request(json!({"version":1,"kind":"account.logout"}))
            .await;
        assert_eq!(first["ok"], false);
        assert!(o.pending.is_some());
        assert_eq!(o.account_view()["state"], "authenticating");
        let second = o
            .request(json!({"version":1,"kind":"account.logout"}))
            .await;
        assert_eq!(second["ok"], true);
        assert_eq!(second["value"]["state"], "signed-out");
        assert!(o.pending.is_none());
        // A settled logout is idempotent and performs no third HTTP request.
        assert_eq!(
            o.request(json!({"version":1,"kind":"account.logout"}))
                .await["ok"],
            true
        );
        {
            let seen = server.seen.lock().unwrap();
            assert_eq!(seen.len(), 2);
            for request in seen.iter() {
                assert_eq!(request.method, "DELETE");
                assert_eq!(request.path, "/auth/login/cancel");
                assert_eq!(
                    request.body,
                    json!({"deviceId":device,"transactionId":transaction,"pkceVerifier":verifier})
                );
            }
        }
        server.finish().await;
    }
    #[tokio::test]
    async fn logout_clears_local_endpoint_and_auth_even_when_notification_revoke_fails() {
        let endpoint = uuid::Uuid::new_v4().to_string();
        let server = Server::start(vec![
            registered(&endpoint),
            Reply::json(503, json!({"error":{"code":"MOBILE_NOTIFY_UNAVAILABLE"}})),
            Reply::json(204, Value::Null),
        ])
        .await;
        let memory = Box::<Memory>::default();
        let mut o = owner(&server, Arc::new(callbacks(&memory)));
        o.request(register("token")).await;
        let binding = o.notification_binding().unwrap();
        let installation = o.notification_installation(false).unwrap();
        let result = o
            .request(json!({"version":1,"kind":"account.logout"}))
            .await;
        assert_eq!(result["error"]["code"], "MOBILE_NOTIFY_UNAVAILABLE");
        assert_eq!(
            o.request(json!({"version":1,"kind":"account.status"}))
                .await["value"]["state"],
            "signed-out"
        );
        assert!(o.notification_record(&binding).unwrap().is_none());
        assert_eq!(o.notification_installation(false).unwrap(), installation);
        {
            let seen = server.seen.lock().unwrap();
            assert_eq!(seen[2].path, "/auth/session");
            assert_eq!(seen[2].method, "DELETE");
        }
        server.finish().await;
    }
    #[tokio::test]
    async fn public_tls_ca_cannot_fall_back_to_device_ca_or_plain_http() {
        let endpoint = uuid::Uuid::new_v4().to_string();
        let server = Server::start(vec![registered(&endpoint)]).await;
        let memory = Box::<Memory>::default();
        let mut o = owner(&server, Arc::new(callbacks(&memory)));
        // This valid, unrelated device CA is not the HTTPS server trust anchor.
        o.config.public_tls_ca = Some(o.saved.as_ref().unwrap().instance.root_certificate.clone());
        assert_eq!(
            o.request(register("token")).await["error"]["code"],
            "OWNED_ACCOUNT_UNAVAILABLE"
        );
        assert_eq!(o.request(status()).await["value"]["state"], "unconfirmed");
        assert!(server.seen.lock().unwrap().is_empty());
        assert_eq!(
            tokio::time::timeout(Duration::from_secs(5), server.task)
                .await
                .unwrap()
                .unwrap(),
            Err("TLS accept")
        );
    }
    #[tokio::test]
    async fn registration_reservation_must_persist_before_http_and_cancellation_never_enables() {
        let server = Server::start(vec![]).await;
        let memory = Box::<Memory>::default();
        memory.discard_on.store(2, Ordering::SeqCst);
        let mut o = owner(&server, Arc::new(callbacks(&memory)));
        assert_eq!(
            o.request(register("token")).await["error"]["code"],
            "MOBILE_NOTIFICATION_PERSISTENCE_UNCONFIRMED"
        );
        assert!(server.seen.lock().unwrap().is_empty());
        server.finish().await;
        let endpoint = uuid::Uuid::new_v4().to_string();
        let mut reply = registered(&endpoint);
        reply.delay_ms = 80;
        let server = Server::start(vec![reply]).await;
        let memory = Box::<Memory>::default();
        let mut o = owner(&server, Arc::new(callbacks(&memory)));
        let active = o.active.clone();
        let capture = server.seen.clone();
        let invalidate = tokio::spawn(async move {
            for _ in 0..100 {
                if !capture.lock().unwrap().is_empty() {
                    active.store(false, Ordering::Release);
                    return;
                }
                tokio::time::sleep(Duration::from_millis(2)).await;
            }
            panic!("fixture did not observe registration");
        });
        assert_eq!(
            o.request(register("token")).await["error"]["code"],
            "ACCOUNT_BINDING_CHANGED"
        );
        invalidate.await.unwrap();
        assert_eq!(
            o.request(status()).await["error"]["code"],
            "ACCOUNT_BINDING_CHANGED"
        );
        server.finish().await;
    }
    #[tokio::test]
    async fn logout_cannot_send_bearer_to_a_forged_disk_instance_origin() {
        let server = Server::start(vec![]).await;
        let memory = Box::<Memory>::default();
        let mut o = owner(&server, Arc::new(callbacks(&memory)));
        o.saved.as_mut().unwrap().instance.issuer = "https://foreign.example.test".into();
        let binding = Binding::from_saved(o.saved.as_ref().unwrap()).unwrap();
        let record = Registration {
            version: 1,
            binding: binding.clone(),
            installation_id: o.notification_installation(true).unwrap().unwrap(),
            provider: Provider::Fcm,
            endpoint_id: Some(uuid::Uuid::new_v4().to_string()),
            state: State::Enabled,
            error_code: None,
        };
        o.notification_persist(&binding, &record).unwrap();
        assert_eq!(
            o.notification_logout(None).await.unwrap_err().code,
            "NETWORK_DESCRIPTOR_INVALID"
        );
        assert!(o.notification_record(&binding).unwrap().is_none());
        assert!(server.seen.lock().unwrap().is_empty());
        server.finish().await;
    }
    #[test]
    fn corrupt_registration_never_projects_enabled_or_disabled_without_evidence() {
        let o = super::super::tests::snapshot_owner();
        let binding = Binding::from_saved(o.saved.as_ref().unwrap()).unwrap();
        let installation = o.notification_installation(true).unwrap().unwrap();
        let mut record = Registration {
            version: 1,
            binding: binding.clone(),
            installation_id: installation,
            provider: Provider::Fcm,
            endpoint_id: None,
            state: State::Enabled,
            error_code: None,
        };
        o.notification_persist(&binding, &record).unwrap();
        assert!(o.notification_record(&binding).is_err());
        record.state = State::Disabled;
        record.endpoint_id = Some(uuid::Uuid::new_v4().to_string());
        o.notification_persist(&binding, &record).unwrap();
        assert!(o.notification_record(&binding).is_err());
        record.state = State::Enabled;
        record.binding.principal_id = "foreign".into();
        o.notification_persist(&binding, &record).unwrap();
        assert!(o.notification_record(&binding).is_err());
    }
    #[test]
    fn redeemed_pointer_cannot_replace_current_target_or_account_authority() {
        let mut o = super::super::tests::snapshot_owner();
        let pointer = Redeemed {
            version: 1,
            target_device_id: o.targets["approved"].device.clone(),
            agent_id: "agent".into(),
            session_id: "session".into(),
        };
        let result = o.notification_map_open(&pointer).unwrap();
        assert_eq!(result["targetId"], "approved");
        assert_eq!(result["sessionId"], "session");
        assert_eq!(result["identityKey"].as_str().unwrap().len(), 64);
        assert!(result.get("targetDeviceId").is_none());
        o.targets.get_mut("approved").unwrap().agent = "different".into();
        assert!(o.notification_map_open(&pointer).is_err());
        o.targets.get_mut("approved").unwrap().agent = "agent".into();
        o.active.store(false, Ordering::Release);
        assert!(o.notification_map_open(&pointer).is_err());
        o.active.store(true, Ordering::Release);
        o.clear_targets();
        assert!(o.notification_map_open(&pointer).is_err());
    }
    #[tokio::test]
    async fn open_requires_fresh_directory_and_explicit_readonly_event_retry_is_safe() {
        let endpoint = uuid::Uuid::new_v4().to_string();
        let event = uuid::Uuid::new_v4().to_string();
        let device = uuid::Uuid::new_v4().to_string();
        let pointer =
            json!({"version":1,"targetDeviceId":device,"agentId":"agent","sessionId":"session"});
        let server = Server::start(vec![
            registered(&endpoint),
            Reply::json(200, pointer.clone()),
            Reply::json(200, json!({})),
            Reply::json(200, pointer),
            Reply::json(200, json!({})),
        ])
        .await;
        let memory = Box::<Memory>::default();
        let mut o = owner(&server, Arc::new(callbacks(&memory)));
        o.request(register("token")).await;
        o.client = Some(
            OwnedClient::pinned(o.saved.as_ref().unwrap().instance.clone(), Some(&server.ca))
                .unwrap(),
        );
        o.targets.insert(
            "old-cache".into(),
            Target {
                device,
                agent: "agent".into(),
            },
        );
        for _ in 0..2 {
            let result = o
                .request(json!({"version":1,"kind":"notification.open","eventId":event}))
                .await;
            assert_eq!(result["error"]["code"], "OWNED_SESSION_INVALID");
            assert!(result.get("value").is_none());
        }
        {
            let seen = server.seen.lock().unwrap();
            assert_eq!(seen.len(), 5);
            assert_eq!(
                seen[1].path,
                format!("{BASE}/{endpoint}/events/{event}/redeem")
            );
            assert_eq!(seen[1].path, seen[3].path);
            assert_eq!(seen[2].path, "/auth/session");
            assert_eq!(seen[4].path, "/auth/session");
        }
        assert!(o.peer.is_none());
        server.finish().await;
    }
}
