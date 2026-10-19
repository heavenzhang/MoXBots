//! Opt-in mobile notification delivery over fixed APNs/FCM endpoints.
//!
//! This module owns the delivery worker and provider credentials. It does not
//! expose a source-hint HTTP route: Host/session ownership must be supplied by
//! an authenticated in-process owner adapter.

use crate::mobile_notification_http::MobileNotificationService;
use crate::{AuthError, AuthStore};
use jsonwebtoken::{Algorithm, EncodingKey, Header, encode};
use myagents_agentnet_device_core::DeviceStore;
use myagents_agentnet_mobile_notify_core::{
    Authority, DeliveryClaim, DeliveryOutcome, FreshEndpoint, HostHintV1, Provider, Store,
    TargetScope,
};
use reqwest::{Client, StatusCode as ReqStatus, redirect::Policy};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::{
    path::{Path, PathBuf},
    sync::Arc,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use tokio::sync::Mutex;
use zeroize::Zeroizing;

const MAX_CREDENTIAL_BYTES: usize = 64 * 1024;
const MAX_PROVIDER_RESPONSE_BYTES: usize = 16 * 1024;
const MAX_BATCH_ENDPOINTS: usize = 128;
const MAX_BATCH_CLAIMS: usize = 10;
const PROVIDER_TIMEOUT: Duration = Duration::from_secs(15);
const WORKER_INTERVAL: Duration = Duration::from_secs(2);
const APNS_SANDBOX_ORIGIN: &str = "https://api.sandbox.push.apple.com";
const APNS_PRODUCTION_ORIGIN: &str = "https://api.push.apple.com";
const GOOGLE_OAUTH_URL: &str = "https://oauth2.googleapis.com/token";
const GOOGLE_FCM_ORIGIN: &str = "https://fcm.googleapis.com";
const GENERIC_TITLE: &str = "MoXBots";
const GENERIC_BODY: &str = "You have an Agent update";

#[derive(Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct MobileNotificationConfig {
    /// This must be explicitly set true to create routes or a worker.
    pub enabled: bool,
    #[serde(default)]
    pub apns: Option<ApnsConfig>,
    #[serde(default)]
    pub fcm: Option<FcmConfig>,
}

#[derive(Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ApnsConfig {
    pub team_id: String,
    pub key_id: String,
    pub topic: String,
    pub private_key_file: PathBuf,
    /// Must match the key's Apple environment scope. Omission preserves legacy keys.
    #[serde(default)]
    pub environment: ApnsEnvironment,
}

#[derive(Clone, Copy, Default, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ApnsEnvironment {
    Sandbox,
    Production,
    #[default]
    Both,
}

#[derive(Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct FcmConfig {
    pub project_id: String,
    pub service_account_file: PathBuf,
}

#[derive(Serialize)]
struct JwtClaims<'a> {
    iss: &'a str,
    iat: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    aud: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    scope: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    exp: Option<u64>,
}

#[derive(Deserialize)]
struct ServiceAccount {
    #[serde(rename = "type")]
    account_type: String,
    project_id: String,
    private_key_id: String,
    private_key: Zeroizing<String>,
    client_email: String,
    token_uri: String,
}

struct CachedAccessToken {
    value: Zeroizing<String>,
    expires: Instant,
}

struct ProviderClient {
    http: Client,
    apns_sandbox: Option<ApnsProvider>,
    apns_production: Option<ApnsProvider>,
    fcm: Option<FcmProvider>,
}

struct ApnsProvider {
    team_id: String,
    key_id: String,
    topic: String,
    key_pem: Zeroizing<Vec<u8>>,
    origin: String,
    cached_bearer: Arc<Mutex<Option<CachedAccessToken>>>,
}

struct FcmProvider {
    project_id: String,
    client_email: String,
    private_key_id: String,
    key_pem: Zeroizing<String>,
    oauth_url: String,
    origin: String,
    cached_token: Mutex<Option<CachedAccessToken>>,
}

impl ProviderClient {
    fn open(config: &MobileNotificationConfig) -> Result<Self, AuthError> {
        let http = Client::builder()
            .redirect(Policy::none())
            .https_only(true)
            .http2_prior_knowledge()
            .connect_timeout(Duration::from_secs(5))
            .timeout(PROVIDER_TIMEOUT)
            .http2_adaptive_window(true)
            .build()
            .map_err(|_| AuthError::Configuration)?;
        let mut sandbox = None;
        let mut production = None;
        if let Some(apns) = &config.apns {
            validate_apns_config(apns)?;
            let key = read_private_credential(&apns.private_key_file)?;
            EncodingKey::from_ec_pem(&key).map_err(|_| AuthError::Configuration)?;
            let cached_bearer = Arc::new(Mutex::new(None));
            let provider = |origin: &str| ApnsProvider {
                team_id: apns.team_id.clone(),
                key_id: apns.key_id.clone(),
                topic: apns.topic.clone(),
                key_pem: Zeroizing::new(key.to_vec()),
                origin: origin.to_owned(),
                cached_bearer: cached_bearer.clone(),
            };
            (sandbox, production) = match apns.environment {
                ApnsEnvironment::Sandbox => (Some(provider(APNS_SANDBOX_ORIGIN)), None),
                ApnsEnvironment::Production => (None, Some(provider(APNS_PRODUCTION_ORIGIN))),
                ApnsEnvironment::Both => (
                    Some(provider(APNS_SANDBOX_ORIGIN)),
                    Some(provider(APNS_PRODUCTION_ORIGIN)),
                ),
            };
        }
        let fcm = if let Some(config) = &config.fcm {
            validate_fcm_config(config)?;
            let bytes = read_private_credential(&config.service_account_file)?;
            let account: ServiceAccount =
                serde_json::from_slice(&bytes).map_err(|_| AuthError::Configuration)?;
            if account.account_type != "service_account"
                || account.project_id != config.project_id
                || account.token_uri != GOOGLE_OAUTH_URL
                || account.client_email.len() > 512
                || account.private_key_id.len() > 256
            {
                return Err(AuthError::Configuration);
            }
            EncodingKey::from_rsa_pem(account.private_key.as_bytes())
                .map_err(|_| AuthError::Configuration)?;
            Some(FcmProvider {
                project_id: config.project_id.clone(),
                client_email: account.client_email,
                private_key_id: account.private_key_id,
                key_pem: account.private_key,
                oauth_url: GOOGLE_OAUTH_URL.to_owned(),
                origin: GOOGLE_FCM_ORIGIN.to_owned(),
                cached_token: Mutex::new(None),
            })
        } else {
            None
        };
        if config.enabled && sandbox.is_none() && production.is_none() && fcm.is_none() {
            return Err(AuthError::Configuration);
        }
        Ok(Self {
            http,
            apns_sandbox: sandbox,
            apns_production: production,
            fcm,
        })
    }

    async fn send(
        &self,
        claim: &DeliveryClaim,
        still_current: impl Fn() -> bool,
    ) -> DeliveryOutcome {
        match claim.provider() {
            Provider::ApnsSandbox => match self.apns_sandbox.as_ref() {
                Some(provider) => self.send_apns(provider, claim, &still_current).await,
                None => DeliveryOutcome::PermanentFailure,
            },
            Provider::ApnsProduction => match self.apns_production.as_ref() {
                Some(provider) => self.send_apns(provider, claim, &still_current).await,
                None => DeliveryOutcome::PermanentFailure,
            },
            Provider::Fcm => match self.fcm.as_ref() {
                Some(provider) => self.send_fcm(provider, claim, &still_current).await,
                None => DeliveryOutcome::PermanentFailure,
            },
        }
    }

    fn supports(&self, provider: Provider) -> bool {
        match provider {
            Provider::ApnsSandbox => self.apns_sandbox.is_some(),
            Provider::ApnsProduction => self.apns_production.is_some(),
            Provider::Fcm => self.fcm.is_some(),
        }
    }

    fn supported_providers(&self) -> Vec<Provider> {
        [
            Provider::ApnsSandbox,
            Provider::ApnsProduction,
            Provider::Fcm,
        ]
        .into_iter()
        .filter(|provider| self.supports(*provider))
        .collect()
    }

    async fn send_apns(
        &self,
        provider: &ApnsProvider,
        claim: &DeliveryClaim,
        still_current: &impl Fn() -> bool,
    ) -> DeliveryOutcome {
        if !valid_apns_token(claim.token()) {
            return DeliveryOutcome::PermanentFailure;
        }
        let token = match apns_bearer(provider).await {
            Ok(token) => token,
            Err(()) => return DeliveryOutcome::PermanentFailure,
        };
        let body = json!({
            "aps": { "alert": { "title": GENERIC_TITLE, "body": GENERIC_BODY }, "sound": "default" },
            "eventId": claim.envelope().event_id(),
        });
        if !still_current() {
            return DeliveryOutcome::Unknown;
        }
        let result = self
            .http
            .post(format!("{}/3/device/{}", provider.origin, claim.token()))
            .header("authorization", format!("bearer {}", token.as_str()))
            .header("apns-topic", &provider.topic)
            .header("apns-push-type", "alert")
            .json(&body)
            .send()
            .await;
        classify_response(result).await
    }

    async fn send_fcm(
        &self,
        provider: &FcmProvider,
        claim: &DeliveryClaim,
        still_current: &impl Fn() -> bool,
    ) -> DeliveryOutcome {
        if !still_current() {
            return DeliveryOutcome::Unknown;
        }
        let access = match self.fcm_access_token(provider, still_current).await {
            Ok(token) => token,
            Err(()) => return DeliveryOutcome::Unknown,
        };
        let body = json!({
            "message": {
                "token": claim.token(),
                "notification": { "title": GENERIC_TITLE, "body": GENERIC_BODY },
                "data": { "eventId": claim.envelope().event_id() },
            }
        });
        if !still_current() {
            return DeliveryOutcome::Unknown;
        }
        let result = self
            .http
            .post(format!(
                "{}/v1/projects/{}/messages:send",
                provider.origin, provider.project_id
            ))
            .bearer_auth(access.as_str())
            .json(&body)
            .send()
            .await;
        classify_fcm_response(result, &provider.project_id).await
    }

    async fn fcm_access_token(
        &self,
        provider: &FcmProvider,
        still_current: &impl Fn() -> bool,
    ) -> Result<Zeroizing<String>, ()> {
        let mut cache = provider.cached_token.lock().await;
        if let Some(token) = cache
            .as_ref()
            .filter(|token| Instant::now() < token.expires)
        {
            return Ok(Zeroizing::new(token.value.to_string()));
        }
        let now = unix_seconds().map_err(|_| ())?;
        let exp = now.checked_add(3600).ok_or(())?;
        let claims = JwtClaims {
            iss: &provider.client_email,
            iat: now,
            aud: Some(&provider.oauth_url),
            scope: Some("https://www.googleapis.com/auth/firebase.messaging"),
            exp: Some(exp),
        };
        let key = EncodingKey::from_rsa_pem(provider.key_pem.as_bytes()).map_err(|_| ())?;
        let mut header = Header::new(Algorithm::RS256);
        header.kid = Some(provider.private_key_id.clone());
        let assertion = Zeroizing::new(encode(&header, &claims, &key).map_err(|_| ())?);
        if !still_current() {
            return Err(());
        }
        let response = self
            .http
            .post(&provider.oauth_url)
            .form(&[
                ("grant_type", "urn:ietf:params:oauth:grant-type:jwt-bearer"),
                ("assertion", assertion.as_str()),
            ])
            .send()
            .await
            .map_err(|_| ())?;
        let status = response.status();
        let bytes = bounded_body(response).await.map_err(|_| ())?;
        if !status.is_success() {
            return Err(());
        }
        let response: OAuthResponse = serde_json::from_slice(&bytes).map_err(|_| ())?;
        if response.access_token.is_empty()
            || response.access_token.len() > 16 * 1024
            || response.expires_in < 60
            || response.token_type != "Bearer"
        {
            return Err(());
        }
        let duration = response.expires_in.min(3600).saturating_sub(30);
        let token = Zeroizing::new(response.access_token);
        *cache = Some(CachedAccessToken {
            value: Zeroizing::new(token.to_string()),
            expires: Instant::now() + Duration::from_secs(duration),
        });
        Ok(token)
    }
}

#[derive(Deserialize)]
struct OAuthResponse {
    access_token: String,
    expires_in: u64,
    token_type: String,
}

async fn apns_bearer(provider: &ApnsProvider) -> Result<Zeroizing<String>, ()> {
    let mut cache = provider.cached_bearer.lock().await;
    if let Some(token) = cache
        .as_ref()
        .filter(|token| Instant::now() < token.expires)
    {
        return Ok(Zeroizing::new(token.value.to_string()));
    }
    let now = unix_seconds().map_err(|_| ())?;
    let claims = JwtClaims {
        iss: &provider.team_id,
        iat: now,
        aud: None,
        scope: None,
        exp: None,
    };
    let key = EncodingKey::from_ec_pem(&provider.key_pem).map_err(|_| ())?;
    let mut header = Header::new(Algorithm::ES256);
    header.kid = Some(provider.key_id.clone());
    let token = Zeroizing::new(encode(&header, &claims, &key).map_err(|_| ())?);
    *cache = Some(CachedAccessToken {
        value: Zeroizing::new(token.to_string()),
        // APNs authentication tokens are valid for one hour. Refresh well
        // before expiry and reuse the token across both APNs environments.
        expires: Instant::now() + Duration::from_secs(45 * 60),
    });
    Ok(token)
}

async fn classify_response(response: Result<reqwest::Response, reqwest::Error>) -> DeliveryOutcome {
    let response = match response {
        Ok(response) => response,
        Err(_) => return DeliveryOutcome::Unknown,
    };
    let status = response.status();
    if bounded_body(response).await.is_err() {
        return DeliveryOutcome::Unknown;
    }
    match status {
        ReqStatus::OK => DeliveryOutcome::Accepted,
        ReqStatus::TOO_MANY_REQUESTS | ReqStatus::SERVICE_UNAVAILABLE | ReqStatus::BAD_GATEWAY => {
            DeliveryOutcome::RetryableFailure
        }
        status if status.is_server_error() => DeliveryOutcome::RetryableFailure,
        status if status.is_success() => DeliveryOutcome::Unknown,
        _ => DeliveryOutcome::PermanentFailure,
    }
}

async fn classify_fcm_response(
    response: Result<reqwest::Response, reqwest::Error>,
    expected_project: &str,
) -> DeliveryOutcome {
    let response = match response {
        Ok(response) => response,
        Err(_) => return DeliveryOutcome::Unknown,
    };
    let status = response.status();
    let bytes = match bounded_body(response).await {
        Ok(bytes) => bytes,
        Err(()) => return DeliveryOutcome::Unknown,
    };
    if status == ReqStatus::OK || status == ReqStatus::CREATED {
        let Ok(body) = serde_json::from_slice::<FcmSendResponse>(&bytes) else {
            return DeliveryOutcome::Unknown;
        };
        return if valid_fcm_message_name(&body.name, expected_project) {
            DeliveryOutcome::Accepted
        } else {
            DeliveryOutcome::Unknown
        };
    }
    match status {
        ReqStatus::TOO_MANY_REQUESTS | ReqStatus::SERVICE_UNAVAILABLE | ReqStatus::BAD_GATEWAY => {
            DeliveryOutcome::RetryableFailure
        }
        status if status.is_server_error() => DeliveryOutcome::RetryableFailure,
        status if status.is_success() => DeliveryOutcome::Unknown,
        _ => DeliveryOutcome::PermanentFailure,
    }
}

#[derive(Deserialize)]
struct FcmSendResponse {
    name: String,
}

fn valid_fcm_message_name(value: &str, expected_project: &str) -> bool {
    let Some(message_id) = value
        .strip_prefix("projects/")
        .and_then(|rest| rest.strip_prefix(expected_project))
        .and_then(|rest| rest.strip_prefix("/messages/"))
    else {
        return false;
    };
    !message_id.is_empty()
        && message_id.len() <= 512
        && !message_id.contains('/')
        && !message_id.chars().any(char::is_control)
}

async fn bounded_body(mut response: reqwest::Response) -> Result<Vec<u8>, ()> {
    if response
        .content_length()
        .is_some_and(|length| length > MAX_PROVIDER_RESPONSE_BYTES as u64)
    {
        return Err(());
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|_| ())? {
        if bytes.len().saturating_add(chunk.len()) > MAX_PROVIDER_RESPONSE_BYTES {
            return Err(());
        }
        bytes.extend_from_slice(&chunk);
    }
    Ok(bytes)
}

fn validate_apns_config(config: &ApnsConfig) -> Result<(), AuthError> {
    if !valid_id(&config.team_id, 64)
        || !valid_id(&config.key_id, 64)
        || config.topic.is_empty()
        || config.topic.len() > 255
        || config
            .topic
            .bytes()
            .any(|byte| !(byte.is_ascii_alphanumeric() || b".-".contains(&byte)))
        || !config.private_key_file.is_absolute()
    {
        return Err(AuthError::Configuration);
    }
    Ok(())
}

fn validate_fcm_config(config: &FcmConfig) -> Result<(), AuthError> {
    if !valid_id(&config.project_id, 128) || !config.service_account_file.is_absolute() {
        return Err(AuthError::Configuration);
    }
    Ok(())
}

fn valid_id(value: &str, max: usize) -> bool {
    !value.is_empty()
        && value.len() <= max
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || b"._-".contains(&byte))
}

fn valid_apns_token(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 4096
        && value.len().is_multiple_of(2)
        && value.bytes().all(|byte| byte.is_ascii_hexdigit())
}

fn read_private_credential(path: &Path) -> Result<Zeroizing<Vec<u8>>, AuthError> {
    use std::os::unix::fs::{MetadataExt, OpenOptionsExt};
    let metadata = std::fs::symlink_metadata(path).map_err(|_| AuthError::UnsafePath)?;
    if !metadata.file_type().is_file()
        || metadata.nlink() != 1
        || metadata.mode() & 0o777 != 0o600
        || metadata.uid() != nix::unistd::Uid::effective().as_raw()
        || metadata.len() > MAX_CREDENTIAL_BYTES as u64
    {
        return Err(AuthError::UnsafePath);
    }
    let file = std::fs::OpenOptions::new()
        .read(true)
        .custom_flags(libc::O_NOFOLLOW | libc::O_CLOEXEC)
        .open(path)
        .map_err(|_| AuthError::UnsafePath)?;
    let mut bytes = Zeroizing::new(Vec::new());
    use std::io::Read;
    let opened = file.metadata().map_err(|_| AuthError::UnsafePath)?;
    if !opened.is_file()
        || opened.nlink() != 1
        || opened.mode() & 0o777 != 0o600
        || opened.uid() != nix::unistd::Uid::effective().as_raw()
        || opened.len() > MAX_CREDENTIAL_BYTES as u64
    {
        return Err(AuthError::UnsafePath);
    }
    file.take(MAX_CREDENTIAL_BYTES as u64 + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| AuthError::UnsafePath)?;
    if bytes.is_empty() || bytes.len() > MAX_CREDENTIAL_BYTES {
        return Err(AuthError::UnsafePath);
    }
    Ok(bytes)
}

fn unix_seconds() -> Result<u64, AuthError> {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|_| AuthError::Configuration)
        .map(|duration| duration.as_secs())
}

/// Owns the opt-in routes and bounded delivery worker. `router()` is only
/// merged by server.rs when the explicit config is enabled.
pub(crate) struct MobileNotificationRuntime {
    service: MobileNotificationService,
    providers: Arc<ProviderClient>,
    auth: Arc<AuthStore>,
}

impl MobileNotificationRuntime {
    pub(crate) fn open(
        auth: Arc<AuthStore>,
        devices: Arc<DeviceStore>,
        store: Arc<Store>,
        network_id: &str,
        config: &MobileNotificationConfig,
    ) -> Result<Self, AuthError> {
        if !config.enabled {
            return Err(AuthError::Configuration);
        }
        let providers = Arc::new(ProviderClient::open(config)?);
        let supported_providers = providers.supported_providers();
        Ok(Self {
            service: MobileNotificationService::new(auth.clone(), devices, store, network_id)
                .with_provider_allowlist(supported_providers),
            providers,
            auth,
        })
    }

    pub(crate) fn router(&self) -> axum::Router<()> {
        self.service.router()
    }

    pub(crate) async fn run_worker(self: Arc<Self>) {
        let mut interval = tokio::time::interval(WORKER_INTERVAL);
        interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
        let mut cursor: Option<String> = None;
        loop {
            interval.tick().await;
            let candidates = match self.service.store.endpoint_candidates_page(
                &self.service.network_id,
                cursor.as_deref(),
                MAX_BATCH_ENDPOINTS,
            ) {
                Ok(candidates) => candidates,
                Err(_) => {
                    cursor = None;
                    continue;
                }
            };
            if candidates.is_empty() {
                cursor = None;
                continue;
            }
            let page_was_full = candidates.len() == MAX_BATCH_ENDPOINTS;
            let mut budget = MAX_BATCH_CLAIMS;
            for candidate in &candidates {
                cursor = Some(candidate.endpoint_id().to_owned());
                if !self.providers.supports(candidate.provider()) {
                    continue;
                }
                let Some(claims) = self.claim_fresh(candidate, budget) else {
                    continue;
                };
                for claim in claims {
                    let outcome = self
                        .providers
                        .send(&claim, || self.claim_is_current(candidate, &claim))
                        .await;
                    let _ = self.with_candidate_auth(candidate, |authority| {
                        let endpoint = FreshEndpoint::from_validated_service_state(
                            candidate.endpoint_id(),
                            authority,
                            candidate.session_handle(),
                        )
                        .map_err(|_| AuthError::SessionRejected)?;
                        self.service
                            .store
                            .settle_delivery(
                                &endpoint,
                                &claim,
                                outcome,
                                unix_seconds().map_err(|_| AuthError::Storage)? as i64,
                            )
                            .map_err(|_| AuthError::Storage)
                    });
                    budget -= 1;
                    if budget == 0 {
                        break;
                    }
                }
                if budget == 0 {
                    break;
                }
            }
            if budget > 0 && !page_was_full {
                cursor = None;
            }
        }
    }

    /// Trusted in-process source seam. The caller must derive Agent/session
    /// ownership from the active Host connection; no public HTTP JSON route
    /// can construct these arguments.
    #[allow(dead_code)] // Wired by the Host owner only after its ownership contract is available.
    pub(crate) fn publish_validated_host_hint(
        &self,
        host_session_handle: &str,
        agent_id: &str,
        session_id: &str,
        source_event_id: &str,
        connection_epoch: &str,
    ) -> Result<String, AuthError> {
        self.auth
            .with_valid_session_handle(host_session_handle, |session| {
                let authority = self
                    .service
                    .authority_for(&session)
                    .map_err(|_| AuthError::SessionRejected)?;
                let target = TargetScope::from_validated_host_session(&authority, agent_id)
                    .map_err(|_| AuthError::SessionRejected)?;
                let hint = HostHintV1::new(source_event_id, session_id)
                    .map_err(|_| AuthError::SessionRejected)?;
                let envelope = self
                    .service
                    .store
                    .enqueue_hint(
                        &authority,
                        &target,
                        connection_epoch,
                        &hint,
                        unix_seconds().map_err(|_| AuthError::Storage)? as i64,
                        86_400,
                    )
                    .map_err(|_| AuthError::Storage)?;
                Ok(envelope.event_id().to_owned())
            })
    }

    fn claim_fresh(
        &self,
        candidate: &myagents_agentnet_mobile_notify_core::EndpointCandidate,
        remaining_budget: usize,
    ) -> Option<Vec<DeliveryClaim>> {
        if remaining_budget == 0 {
            return Some(Vec::new());
        }
        self.with_candidate_auth(candidate, |authority| {
            let endpoint = FreshEndpoint::from_validated_service_state(
                candidate.endpoint_id(),
                authority,
                candidate.session_handle(),
            )
            .map_err(|_| AuthError::SessionRejected)?;
            let claims = self
                .service
                .store
                .claim_due(
                    &endpoint,
                    unix_seconds().map_err(|_| AuthError::Storage)? as i64,
                    remaining_budget,
                )
                .map_err(|_| AuthError::Storage)?;
            Ok(claims)
        })
        .ok()
    }

    fn claim_is_current(
        &self,
        candidate: &myagents_agentnet_mobile_notify_core::EndpointCandidate,
        claim: &DeliveryClaim,
    ) -> bool {
        self.with_candidate_auth(candidate, |authority| {
            let endpoint = FreshEndpoint::from_validated_service_state(
                candidate.endpoint_id(),
                authority,
                candidate.session_handle(),
            )
            .map_err(|_| AuthError::SessionRejected)?;
            self.service
                .store
                .claim_is_current(
                    &endpoint,
                    claim,
                    unix_seconds().map_err(|_| AuthError::Storage)? as i64,
                )
                .map_err(|_| AuthError::Storage)
        })
        .unwrap_or(false)
    }

    fn with_candidate_auth<T>(
        &self,
        candidate: &myagents_agentnet_mobile_notify_core::EndpointCandidate,
        operation: impl FnOnce(Authority) -> Result<T, AuthError>,
    ) -> Result<T, AuthError> {
        self.auth
            .with_valid_session_handle(candidate.session_handle(), |session| {
                if session.session_handle != candidate.session_handle() {
                    return Err(AuthError::SessionRejected);
                }
                let authority = self
                    .service
                    .authority_for(&session)
                    .map_err(|_| AuthError::SessionRejected)?;
                if &authority != candidate.authority() {
                    return Err(AuthError::SessionRejected);
                }
                operation(authority)
            })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{
        Router,
        body::{Bytes, to_bytes},
        extract::State,
        http::{Request, StatusCode, Version},
        routing::post,
    };
    use myagents_agent_network_crypto::DevicePrivateKey;
    use myagents_agentnet_device_core::{DeviceRecord, SessionContext};
    use myagents_agentnet_mobile_notify_core::{HostHintV1, RegisterEndpointV1, TargetScope};
    use rsa::{
        RsaPrivateKey,
        pkcs8::{EncodePrivateKey, LineEnding},
    };
    use serde_json::Value;
    use std::{
        collections::VecDeque,
        fs,
        os::unix::fs::PermissionsExt,
        sync::{
            Arc,
            atomic::{AtomicBool, AtomicUsize, Ordering},
        },
    };

    const PRINCIPAL_SUBJECT: &str = "mobile-notify-test-user";
    const NETWORK: &str = "22222222-2222-4222-8222-222222222222";
    const DEVICE: &str = "33333333-3333-4333-8333-333333333333";

    struct TestScope {
        _dir: tempfile::TempDir,
        auth: Arc<AuthStore>,
        devices: Arc<DeviceStore>,
        store: Arc<Store>,
        endpoint: FreshEndpoint,
        claims: Vec<DeliveryClaim>,
        record: DeviceRecord,
        handle: String,
        bearer: Zeroizing<String>,
    }

    fn scope_with_claims(provider: Provider, provider_token: &str) -> TestScope {
        let mut scope = scope_with_pending(provider, provider_token, 2);
        scope.claims = scope.store.claim_due(&scope.endpoint, 3, 3).unwrap();
        scope
    }

    fn scope_with_pending(provider: Provider, provider_token: &str, now: i64) -> TestScope {
        let dir = tempfile::tempdir().unwrap();
        fs::set_permissions(dir.path(), fs::Permissions::from_mode(0o700)).unwrap();
        let auth_config = crate::AuthConfig {
            network_id: NETWORK.into(),
            login_ttl: Duration::from_secs(300),
            session_ttl: Duration::from_secs(3600),
        };
        let auth = Arc::new(AuthStore::open(dir.path(), &auth_config).unwrap());
        let subject = crate::VerifiedSubject::from_verified_claims(
            "https://issuer.example.test".into(),
            PRINCIPAL_SUBJECT.into(),
        )
        .unwrap();
        let bearer = Zeroizing::new(
            auth.issue_session(&subject, DEVICE)
                .unwrap()
                .into_token()
                .to_string(),
        );
        let session = auth.validate_session(&bearer).unwrap();
        let context = SessionContext {
            principal_id: session.account.principal_id.clone(),
            network_id: session.account.network_id.clone(),
            device_id: session.device_id.clone(),
            session_handle: session.session_handle.clone(),
            expires_at: session.expires_at,
        };
        let devices = Arc::new(DeviceStore::open(dir.path()).unwrap());
        let device_key = DevicePrivateKey::generate().unwrap();
        let record = devices
            .claim_initial(&context, &device_key.csr().unwrap())
            .unwrap();
        let authority = Authority::from_validated_service_state(
            &record.principal_id,
            &record.network_id,
            &record.device_id,
            &record.identity_binding_id,
            record.key_generation,
        )
        .unwrap();
        let store = Arc::new(Store::open(dir.path()).unwrap());
        let endpoint_id = store
            .register_endpoint_for_session(
                &authority,
                &session.session_handle,
                RegisterEndpointV1::new(
                    provider,
                    "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
                    provider_token,
                )
                .unwrap(),
                1,
            )
            .unwrap();
        let target = TargetScope::from_validated_host_session(&authority, "agent-main").unwrap();
        for source_event_id in [
            "88888888-8888-4888-8888-888888888881",
            "88888888-8888-4888-8888-888888888882",
            "88888888-8888-4888-8888-888888888883",
        ] {
            let hint = HostHintV1::new(source_event_id, "private-session-ref").unwrap();
            store
                .enqueue_hint(
                    &authority,
                    &target,
                    "99999999-9999-4999-8999-999999999999",
                    &hint,
                    now,
                    3600,
                )
                .unwrap();
        }
        let endpoint = FreshEndpoint::from_validated_service_state(
            endpoint_id.as_str(),
            authority,
            session.session_handle.clone(),
        )
        .unwrap();
        TestScope {
            _dir: dir,
            auth,
            devices,
            store,
            endpoint,
            claims: Vec::new(),
            record,
            handle: session.session_handle,
            bearer,
        }
    }

    fn live_claim(scope: &TestScope, claim: &DeliveryClaim) -> bool {
        scope
            .auth
            .with_valid_session_handle(&scope.handle, |session| {
                let context = SessionContext {
                    principal_id: session.account.principal_id,
                    network_id: session.account.network_id,
                    device_id: session.device_id,
                    session_handle: session.session_handle,
                    expires_at: session.expires_at,
                };
                let record = scope
                    .devices
                    .read_state(&context, &scope.record.device_id)
                    .map_err(|_| AuthError::Storage)?;
                if record.as_ref() != Some(&scope.record) {
                    return Ok(false);
                }
                scope
                    .store
                    .claim_is_current(&scope.endpoint, claim, 4)
                    .map_err(|_| AuthError::Storage)
            })
            .unwrap_or(false)
    }

    #[derive(Clone)]
    struct FixtureState {
        statuses: Arc<tokio::sync::Mutex<VecDeque<StatusCode>>>,
        delay_send: Duration,
        send_count: Arc<AtomicUsize>,
        payloads: Arc<tokio::sync::Mutex<Vec<Value>>>,
        success_response: Arc<tokio::sync::Mutex<Value>>,
        http2_seen: Arc<AtomicBool>,
    }

    async fn oauth_fixture() -> axum::Json<Value> {
        axum::Json(
            json!({"access_token":"fixture-access-token","expires_in":3600,"token_type":"Bearer","scope":"ignored"}),
        )
    }

    async fn fcm_fixture(
        State(state): State<FixtureState>,
        body: Bytes,
    ) -> (StatusCode, axum::Json<Value>) {
        state.send_count.fetch_add(1, Ordering::SeqCst);
        if !state.delay_send.is_zero() {
            tokio::time::sleep(state.delay_send).await;
        }
        if let Ok(payload) = serde_json::from_slice::<Value>(&body) {
            state.payloads.lock().await.push(payload);
        }
        let status = state
            .statuses
            .lock()
            .await
            .pop_front()
            .unwrap_or(StatusCode::OK);
        let body = if status.is_success() {
            state.success_response.lock().await.clone()
        } else {
            json!({"provider":"fixture","error":"not returned to caller"})
        };
        (status, axum::Json(body))
    }

    async fn apns_h2_fixture(
        State(state): State<FixtureState>,
        request: Request<axum::body::Body>,
    ) -> (StatusCode, axum::Json<Value>) {
        state
            .http2_seen
            .store(request.version() == Version::HTTP_2, Ordering::SeqCst);
        let body = request.into_body();
        state.send_count.fetch_add(1, Ordering::SeqCst);
        if let Ok(bytes) = to_bytes(body, 4096).await
            && let Ok(payload) = serde_json::from_slice::<Value>(&bytes)
        {
            state.payloads.lock().await.push(payload);
        }
        let status = state
            .statuses
            .lock()
            .await
            .pop_front()
            .unwrap_or(StatusCode::OK);
        (status, axum::Json(json!({})))
    }

    async fn fixture_client(
        scope: &TestScope,
        statuses: Vec<StatusCode>,
        delay_send: Duration,
        timeout: Duration,
    ) -> (
        ProviderClient,
        tokio::task::JoinHandle<()>,
        Arc<AtomicUsize>,
        Arc<tokio::sync::Mutex<Vec<Value>>>,
        Arc<tokio::sync::Mutex<Value>>,
    ) {
        let state = FixtureState {
            statuses: Arc::new(tokio::sync::Mutex::new(statuses.into())),
            delay_send,
            send_count: Arc::new(AtomicUsize::new(0)),
            payloads: Arc::new(tokio::sync::Mutex::new(Vec::new())),
            success_response: Arc::new(tokio::sync::Mutex::new(
                json!({"name":"projects/test-project/messages/fixture-message"}),
            )),
            http2_seen: Arc::new(AtomicBool::new(false)),
        };
        let app = Router::new()
            .route("/oauth/token", post(oauth_fixture))
            .route("/v1/projects/test-project/messages:send", post(fcm_fixture))
            .with_state(state.clone());
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        let server = tokio::spawn(async move {
            let _ = axum::serve(listener, app).await;
        });
        let base = format!("http://{addr}");
        let client = Client::builder()
            .redirect(Policy::none())
            .connect_timeout(Duration::from_secs(1))
            .timeout(timeout)
            .build()
            .unwrap();
        let client = ProviderClient {
            http: client,
            apns_sandbox: None,
            apns_production: None,
            fcm: Some(FcmProvider {
                project_id: "test-project".into(),
                client_email: "fixture@example.test".into(),
                private_key_id: "fixture-key".into(),
                key_pem: Zeroizing::new(test_rsa_key()),
                oauth_url: format!("{base}/oauth/token"),
                origin: base,
                cached_token: Mutex::new(None),
            }),
        };
        let _ = scope;
        (
            client,
            server,
            state.send_count,
            state.payloads,
            state.success_response,
        )
    }

    fn test_rsa_key() -> String {
        let key = RsaPrivateKey::new(&mut rsa::rand_core::OsRng, 2048).unwrap();
        key.to_pkcs8_pem(LineEnding::LF).unwrap().to_string()
    }

    fn test_ec_key() -> Vec<u8> {
        use p256::{
            ecdsa::SigningKey,
            elliptic_curve::rand_core::OsRng,
            pkcs8::{EncodePrivateKey, LineEnding},
        };
        SigningKey::random(&mut OsRng)
            .to_pkcs8_pem(LineEnding::LF)
            .unwrap()
            .as_bytes()
            .to_vec()
    }

    fn test_apns_provider() -> ApnsProvider {
        ApnsProvider {
            team_id: "TESTTEAM123".into(),
            key_id: "TESTKEY123".into(),
            topic: "com.example.test".into(),
            key_pem: Zeroizing::new(test_ec_key()),
            origin: APNS_SANDBOX_ORIGIN.into(),
            cached_bearer: Arc::new(Mutex::new(None)),
        }
    }

    #[tokio::test]
    async fn apns_environment_limits_actual_endpoint_registration() {
        use tower::ServiceExt;

        let keys = tempfile::tempdir().unwrap();
        let key_path = keys.path().join("synthetic-apns.p8");
        fs::write(&key_path, test_ec_key()).unwrap();
        fs::set_permissions(&key_path, fs::Permissions::from_mode(0o600)).unwrap();
        for (environment, expected) in [
            (None, vec![Provider::ApnsSandbox, Provider::ApnsProduction]),
            (
                Some("both"),
                vec![Provider::ApnsSandbox, Provider::ApnsProduction],
            ),
            (Some("sandbox"), vec![Provider::ApnsSandbox]),
            (Some("production"), vec![Provider::ApnsProduction]),
        ] {
            let mut value = json!({"enabled":true,"apns":{
                "team_id":"TESTTEAM123","key_id":"TESTKEY123",
                "topic":"com.example.test","private_key_file":key_path
            }});
            if let Some(environment) = environment {
                value["apns"]["environment"] = json!(environment);
            }
            let config: MobileNotificationConfig = serde_json::from_value(value).unwrap();
            let scope = scope_with_pending(Provider::Fcm, "existing-synthetic-token", 2);
            let runtime = MobileNotificationRuntime::open(
                scope.auth.clone(),
                scope.devices.clone(),
                scope.store.clone(),
                NETWORK,
                &config,
            )
            .unwrap();
            assert_eq!(runtime.providers.supported_providers(), expected);
            let principal = scope
                .auth
                .validate_session(&scope.bearer)
                .unwrap()
                .account
                .principal_id;
            for (provider, installation) in [
                (
                    Provider::ApnsSandbox,
                    "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
                ),
                (
                    Provider::ApnsProduction,
                    "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
                ),
            ] {
                let before = scope
                    .store
                    .endpoint_candidates(&principal, NETWORK)
                    .unwrap()
                    .len();
                let response = runtime
                    .router()
                    .oneshot(
                        Request::post("/api/mobile-notify/v1/endpoints")
                            .header("authorization", format!("Bearer {}", scope.bearer.as_str()))
                            .header("content-type", "application/json")
                            .body(axum::body::Body::from(
                                json!({
                                    "version":1,"provider":provider,"installationId":installation,
                                    "token":"ab".repeat(32)
                                })
                                .to_string(),
                            ))
                            .unwrap(),
                    )
                    .await
                    .unwrap();
                let allowed = expected.contains(&provider);
                assert_eq!(
                    response.status(),
                    if allowed {
                        StatusCode::CREATED
                    } else {
                        StatusCode::SERVICE_UNAVAILABLE
                    }
                );
                let body: Value = serde_json::from_slice(
                    &to_bytes(response.into_body(), 16 * 1024).await.unwrap(),
                )
                .unwrap();
                if allowed {
                    assert!(body["endpointId"].as_str().is_some());
                } else {
                    assert_eq!(body["error"]["code"], "MOBILE_NOTIFY_PROVIDER_UNAVAILABLE");
                }
                assert_eq!(
                    scope
                        .store
                        .endpoint_candidates(&principal, NETWORK)
                        .unwrap()
                        .len(),
                    before + usize::from(allowed)
                );
            }
        }
    }

    #[test]
    fn apns_environment_rejects_unknown_or_mistyped_scope() {
        for environment in [
            json!("staging"),
            json!("Sandbox"),
            json!(""),
            json!(null),
            json!(false),
            json!([]),
        ] {
            let config = json!({"enabled":true,"apns":{
                "team_id":"TESTTEAM123","key_id":"TESTKEY123","topic":"com.example.test",
                "private_key_file":"/unused/synthetic-apns.p8","environment":environment
            }});
            assert!(serde_json::from_value::<MobileNotificationConfig>(config).is_err());
        }
    }

    #[tokio::test]
    async fn fcm_loopback_observes_live_auth_device_scope_and_maps_provider_statuses() {
        let scope = scope_with_claims(Provider::Fcm, "opaque-device-token");
        let (client, server, send_count, payloads, _) = fixture_client(
            &scope,
            vec![
                StatusCode::OK,
                StatusCode::UNAUTHORIZED,
                StatusCode::TOO_MANY_REQUESTS,
            ],
            Duration::ZERO,
            PROVIDER_TIMEOUT,
        )
        .await;
        let mut outcomes = Vec::new();
        for claim in &scope.claims {
            outcomes.push(client.send(claim, || live_claim(&scope, claim)).await);
        }
        assert_eq!(
            outcomes,
            vec![
                DeliveryOutcome::Accepted,
                DeliveryOutcome::PermanentFailure,
                DeliveryOutcome::RetryableFailure,
            ]
        );
        assert_eq!(send_count.load(Ordering::SeqCst), 3);
        for payload in payloads.lock().await.iter() {
            assert_eq!(payload["message"]["notification"]["title"], GENERIC_TITLE);
            assert_eq!(payload["message"]["notification"]["body"], GENERIC_BODY);
            let data = payload["message"]["data"].as_object().unwrap();
            assert_eq!(data.len(), 1);
            assert!(data.contains_key("eventId"));
            assert!(!payload.to_string().contains("private-session-ref"));
        }
        server.abort();
    }

    #[tokio::test]
    async fn fcm_success_requires_matching_project_message_name() {
        let scope = scope_with_claims(Provider::Fcm, "opaque-device-token");
        let (client, server, _, _, success_response) = fixture_client(
            &scope,
            vec![StatusCode::OK, StatusCode::OK, StatusCode::NO_CONTENT],
            Duration::ZERO,
            PROVIDER_TIMEOUT,
        )
        .await;
        let claim = &scope.claims[0];
        *success_response.lock().await = json!({"name":"projects/other-project/messages/id"});
        assert_eq!(
            client.send(claim, || live_claim(&scope, claim)).await,
            DeliveryOutcome::Unknown
        );
        *success_response.lock().await = json!({"unexpected":"gateway body"});
        assert_eq!(
            client.send(claim, || live_claim(&scope, claim)).await,
            DeliveryOutcome::Unknown
        );
        *success_response.lock().await = json!({
            "name":"projects/test-project/messages/fixture-message"
        });
        assert_eq!(
            client.send(claim, || live_claim(&scope, claim)).await,
            DeliveryOutcome::Unknown
        );
        server.abort();
    }

    #[tokio::test]
    async fn apns_provider_token_cache_reuses_until_safe_refresh_window() {
        let provider = test_apns_provider();
        *provider.cached_bearer.lock().await = Some(CachedAccessToken {
            value: Zeroizing::new("cached-apns-token".into()),
            expires: Instant::now() + Duration::from_secs(60),
        });
        assert_eq!(
            apns_bearer(&provider).await.unwrap().as_str(),
            "cached-apns-token"
        );

        *provider.cached_bearer.lock().await = None;
        let generated = apns_bearer(&provider).await.unwrap();
        let cached = provider.cached_bearer.lock().await;
        let entry = cached.as_ref().unwrap();
        assert_eq!(entry.value.as_str(), generated.as_str());
        assert!(entry.expires > Instant::now() + Duration::from_secs(44 * 60));
        assert!(entry.expires < Instant::now() + Duration::from_secs(46 * 60));
    }

    #[test]
    fn apns_device_tokens_are_bounded_even_length_hex_without_fixed_size_assumption() {
        assert!(valid_apns_token("ab"));
        assert!(valid_apns_token(&"ab".repeat(32)));
        assert!(valid_apns_token(&"ab".repeat(2048)));
        assert!(!valid_apns_token(""));
        assert!(!valid_apns_token("abc"));
        assert!(!valid_apns_token("ag"));
        assert!(!valid_apns_token(&"ab".repeat(2049)));
    }

    #[tokio::test]
    async fn provider_timeout_is_unknown_and_stale_auth_blocks_outbound_calls() {
        let scope = scope_with_claims(Provider::Fcm, "opaque-device-token");
        let claim = &scope.claims[0];
        let (client, server, send_count, _, _) = fixture_client(
            &scope,
            vec![StatusCode::OK],
            Duration::from_millis(100),
            Duration::from_millis(25),
        )
        .await;
        assert_eq!(
            client.send(claim, || live_claim(&scope, claim)).await,
            DeliveryOutcome::Unknown
        );
        assert_eq!(send_count.load(Ordering::SeqCst), 1);
        server.abort();

        let (client, server, send_count, _, _) = fixture_client(
            &scope,
            vec![StatusCode::OK],
            Duration::ZERO,
            PROVIDER_TIMEOUT,
        )
        .await;
        scope.auth.revoke_session(&scope.bearer).unwrap();
        assert_eq!(
            client.send(claim, || live_claim(&scope, claim)).await,
            DeliveryOutcome::Unknown
        );
        assert_eq!(send_count.load(Ordering::SeqCst), 0);
        server.abort();
    }

    #[tokio::test]
    async fn apns_loopback_uses_generic_event_only_alert() {
        let scope = scope_with_claims(Provider::ApnsSandbox, &"ab".repeat(32));
        let state = FixtureState {
            statuses: Arc::new(tokio::sync::Mutex::new(VecDeque::from([
                StatusCode::OK,
                StatusCode::CREATED,
                StatusCode::NO_CONTENT,
            ]))),
            delay_send: Duration::ZERO,
            send_count: Arc::new(AtomicUsize::new(0)),
            payloads: Arc::new(tokio::sync::Mutex::new(Vec::new())),
            success_response: Arc::new(tokio::sync::Mutex::new(
                json!({"name":"projects/test-project/messages/fixture-message"}),
            )),
            http2_seen: Arc::new(AtomicBool::new(false)),
        };
        let app = Router::new()
            .route("/3/device/{token}", post(apns_h2_fixture))
            .with_state(state.clone());
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        let server = tokio::spawn(async move {
            let _ = axum::serve(listener, app).await;
        });
        let http = Client::builder()
            .redirect(Policy::none())
            .http2_prior_knowledge()
            .timeout(PROVIDER_TIMEOUT)
            .build()
            .unwrap();
        let mut provider = test_apns_provider();
        provider.origin = format!("http://{addr}");
        let client = ProviderClient {
            http,
            apns_sandbox: Some(provider),
            apns_production: None,
            fcm: None,
        };
        let claim = &scope.claims[0];
        assert_eq!(
            client.send(claim, || live_claim(&scope, claim)).await,
            DeliveryOutcome::Accepted
        );
        assert_eq!(state.send_count.load(Ordering::SeqCst), 1);
        assert!(state.http2_seen.load(Ordering::SeqCst));
        for claim in &scope.claims[1..] {
            assert_eq!(
                client.send(claim, || live_claim(&scope, claim)).await,
                DeliveryOutcome::Unknown
            );
        }
        assert_eq!(state.send_count.load(Ordering::SeqCst), 3);
        let payloads = state.payloads.lock().await;
        let payload = &payloads[0];
        assert_eq!(payload["aps"]["alert"]["title"], GENERIC_TITLE);
        assert_eq!(payload["aps"]["alert"]["body"], GENERIC_BODY);
        assert!(payload["eventId"].as_str().is_some());
        assert!(!payload.to_string().contains("private-session-ref"));
        server.abort();
    }

    #[test]
    fn worker_claims_only_the_remaining_tick_budget() {
        let now = unix_seconds().unwrap() as i64;
        let scope = scope_with_pending(Provider::Fcm, "opaque-device-token", now);
        let candidate = scope
            .store
            .endpoint_candidates_page(NETWORK, None, 10)
            .unwrap()
            .remove(0);
        let service = MobileNotificationService::new(
            scope.auth.clone(),
            scope.devices.clone(),
            scope.store.clone(),
            NETWORK,
        );
        let runtime = MobileNotificationRuntime {
            service,
            providers: Arc::new(ProviderClient {
                http: Client::new(),
                apns_sandbox: None,
                apns_production: None,
                fcm: None,
            }),
            auth: scope.auth.clone(),
        };

        let claimed = runtime.claim_fresh(&candidate, 1).unwrap();
        assert_eq!(claimed.len(), 1);
        let still_due = scope
            .store
            .claim_due(&scope.endpoint, now + 1, MAX_BATCH_CLAIMS)
            .unwrap();
        assert_eq!(
            still_due.len(),
            2,
            "unclaimed work must remain immediately due"
        );
    }
}
