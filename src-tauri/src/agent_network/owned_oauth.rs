//! Public-client Authorization Code + S256 transport. The existing login manager
//! remains the identity, credential and registry commit owner. This module only
//! owns the short-lived loopback callback and one token exchange.
use super::NetworkError;
use oauth2::{
    basic::{BasicClient, BasicTokenType},
    AsyncHttpClient, AuthType, AuthUrl, AuthorizationCode, ClientId, CsrfToken, EndpointNotSet,
    EndpointSet, HttpRequest, HttpResponse, PkceCodeChallenge, PkceCodeVerifier, RedirectUrl,
    TokenResponse, TokenUrl,
};
use sha2::{Digest, Sha256};
use std::{
    collections::HashMap,
    future::Future,
    pin::Pin,
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        Arc, Mutex,
    },
    time::Duration,
};
use subtle::ConstantTimeEq;
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::{TcpListener, TcpStream},
};
use zeroize::Zeroizing;

const CLIENT_ID: &str = "moxbots-desktop";
const CALLBACK_PATH: &str = "/oauth/callback";
const AUTHORIZATION_SECONDS: u64 = 270;
const MAX_REQUEST: usize = 8192;
const MAX_RESPONSE: usize = 32 * 1024;
const SUCCESS: &str = "<!doctype html><html lang=zh-CN><meta charset=utf-8><meta name=referrer content=no-referrer><title>授权已收到</title><p>授权已收到，请返回 MoXBots。应用将继续验证并保存登录。</p></html>";
const FAILURE: &str = "<!doctype html><html lang=zh-CN><meta charset=utf-8><meta name=referrer content=no-referrer><title>授权未完成</title><p>授权未完成，请返回 MoXBots 后重试。</p></html>";

type OAuthClient =
    BasicClient<EndpointSet, EndpointNotSet, EndpointNotSet, EndpointNotSet, EndpointSet>;

enum Callback {
    Pending,
    Code(Zeroizing<String>),
    Received([u8; 32]),
    Failed(&'static str),
}
enum Exchange {
    Waiting(Option<Zeroizing<String>>),
    Issued {
        token: Zeroizing<String>,
        expires_at: u64,
    },
    Failed(NetworkError),
}
struct Inner {
    authorization_url: String,
    expires_at: u64,
    client: OAuthClient,
    callback: Arc<Mutex<Callback>>,
    exchange: tokio::sync::Mutex<Exchange>,
    cancelled: AtomicBool,
    received_expires_at: AtomicU64,
    listener: Mutex<Option<tauri::async_runtime::JoinHandle<()>>>,
}
impl Inner {
    fn stop_listener(&self) {
        if let Some(task) = self
            .listener
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .take()
        {
            task.abort();
        }
    }
}
impl Drop for Inner {
    fn drop(&mut self) {
        self.stop_listener();
    }
}

/// Clones share one exchange and cached grant. Dropping one clone never stops
/// another owner. The last drop, explicit Cancel or completed exchange closes
/// the loopback listener; neither Cancel nor Drop revokes an account session.
#[derive(Clone)]
pub(crate) struct NativeOAuth(Arc<Inner>);
impl NativeOAuth {
    pub(crate) async fn bind(origin: &str, device_id: &str) -> Result<Self, NetworkError> {
        let url =
            url::Url::parse(origin).map_err(|_| NetworkError::new("NETWORK_ISSUER_INVALID"))?;
        let test_loopback =
            cfg!(test) && url.scheme() == "http" && url.host_str() == Some("127.0.0.1");
        if (!test_loopback && url.scheme() != "https")
            || url.origin().ascii_serialization() != origin
            || !url.username().is_empty()
            || url.password().is_some()
            || url.query().is_some()
            || url.fragment().is_some()
            || !matches!(url.path(), "" | "/")
        {
            return Err(NetworkError::new("NETWORK_ISSUER_INVALID"));
        }
        if uuid::Uuid::parse_str(device_id)
            .ok()
            .map(|id| id.to_string())
            .as_deref()
            != Some(device_id)
        {
            return Err(NetworkError::new("DEVICE_ID_INVALID"));
        }
        let listener = TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, 0))
            .await
            .map_err(|_| NetworkError::new("OWNED_LOOPBACK_UNAVAILABLE"))?;
        let address = listener
            .local_addr()
            .map_err(|_| NetworkError::new("OWNED_LOOPBACK_UNAVAILABLE"))?;
        if address.port() < 1024 {
            return Err(NetworkError::new("OWNED_LOOPBACK_UNAVAILABLE"));
        }
        let redirect = format!("http://{address}{CALLBACK_PATH}");
        let client = BasicClient::new(ClientId::new(CLIENT_ID.into()))
            .set_auth_type(AuthType::RequestBody)
            .set_auth_uri(
                AuthUrl::new(format!("{origin}/auth/oauth/authorize"))
                    .map_err(|_| NetworkError::new("NETWORK_ISSUER_INVALID"))?,
            )
            .set_token_uri(
                TokenUrl::new(format!("{origin}/auth/oauth/token"))
                    .map_err(|_| NetworkError::new("NETWORK_ISSUER_INVALID"))?,
            )
            .set_redirect_uri(
                RedirectUrl::new(redirect).map_err(|_| NetworkError::new("OWNED_LOGIN_INVALID"))?,
            );
        let (challenge, verifier) = PkceCodeChallenge::new_random_sha256();
        let (authorization_url, state) = client
            .authorize_url(|| CsrfToken::new_random_len(32))
            .set_pkce_challenge(challenge)
            .add_extra_param("device_id", device_id)
            .url();
        let state = Zeroizing::new(state.secret().clone());
        let expires_at = now().saturating_add(AUTHORIZATION_SECONDS);
        let callback = Arc::new(Mutex::new(Callback::Pending));
        let received = callback.clone();
        // No Arc<Inner> is captured: the last handle can abort this task without
        // a self-retaining task/owner cycle.
        let task = tauri::async_runtime::spawn(async move {
            let run = async {
                loop {
                    let (mut socket, peer) = match listener.accept().await {
                        Ok(value) => value,
                        Err(_) => break,
                    };
                    if !peer.ip().is_loopback() {
                        continue;
                    }
                    let request = tokio::time::timeout(
                        Duration::from_secs(2),
                        read_callback(&mut socket, &address.to_string(), &state),
                    )
                    .await;
                    let accepted = match request {
                        Ok(Ok(response)) => accept_callback(&received, response),
                        _ => None,
                    };
                    let (status, body) = match accepted {
                        Some(true) => ("200 OK", SUCCESS),
                        Some(false) => ("200 OK", FAILURE),
                        None => ("400 Bad Request", FAILURE),
                    };
                    let response = format!("HTTP/1.1 {status}\r\nContent-Type: text/html; charset=utf-8\r\nCache-Control: no-store\r\nPragma: no-cache\r\nReferrer-Policy: no-referrer\r\nContent-Security-Policy: default-src 'none'; base-uri 'none'; frame-ancestors 'none'\r\nConnection: close\r\nContent-Length: {}\r\n\r\n{body}", body.len());
                    let _ = tokio::time::timeout(
                        Duration::from_secs(1),
                        socket.write_all(response.as_bytes()),
                    )
                    .await;
                }
            };
            let _ = tokio::time::timeout(Duration::from_secs(AUTHORIZATION_SECONDS), run).await;
            let mut value = received.lock().unwrap_or_else(|e| e.into_inner());
            if matches!(*value, Callback::Pending) {
                *value = Callback::Failed("OWNED_LOGIN_EXPIRED");
            }
        });
        Ok(Self(Arc::new(Inner {
            authorization_url: authorization_url.to_string(),
            expires_at,
            client,
            callback,
            exchange: tokio::sync::Mutex::new(Exchange::Waiting(Some(Zeroizing::new(
                verifier.secret().clone(),
            )))),
            cancelled: AtomicBool::new(false),
            received_expires_at: AtomicU64::new(0),
            listener: Mutex::new(Some(task)),
        })))
    }
    pub(crate) fn authorization_url(&self) -> &str {
        &self.0.authorization_url
    }
    pub(crate) fn expires_at(&self) -> u64 {
        self.0.expires_at
    }
    pub(crate) fn received_expires_at(&self) -> Option<u64> {
        match self.0.received_expires_at.load(Ordering::Acquire) {
            0 => None,
            value => Some(value),
        }
    }
    pub(crate) fn cancel(&self) {
        self.0.cancelled.store(true, Ordering::Release);
        self.0.stop_listener();
    }
    /// Does not exchange or inspect anything. Waiting for an in-flight exchange
    /// lets the manager revoke its exact issued token after explicit Cancel.
    pub(crate) async fn cached_token(&self) -> Option<Zeroizing<String>> {
        match &*self.0.exchange.lock().await {
            Exchange::Issued { token, .. } => Some(token.clone()),
            _ => None,
        }
    }
    /// The supplied pinned client must disable redirects and automatic retries.
    /// A one-use code is never resubmitted after an ambiguous HTTP outcome.
    pub(crate) async fn token(
        &self,
        http: &reqwest::Client,
    ) -> Result<Option<(Zeroizing<String>, u64)>, NetworkError> {
        let mut exchange = self.0.exchange.lock().await;
        if self.0.cancelled.load(Ordering::Acquire) {
            return Err(NetworkError::new("OWNED_LOGIN_CANCELLED"));
        }
        match &*exchange {
            Exchange::Issued { token, expires_at } => {
                if *expires_at <= now() {
                    return Err(NetworkError::new("OWNED_LOGIN_EXPIRED"));
                }
                return Ok(Some((token.clone(), *expires_at)));
            }
            Exchange::Failed(error) => return Err(error.clone()),
            Exchange::Waiting(_) => {}
        }
        if self.0.expires_at <= now() {
            return Err(NetworkError::new("OWNED_LOGIN_EXPIRED"));
        }
        let code = {
            let mut callback = self.0.callback.lock().unwrap_or_else(|e| e.into_inner());
            match &*callback {
                Callback::Pending => return Ok(None),
                Callback::Failed(code) => return Err(NetworkError::new(code)),
                Callback::Received(_) => {
                    return Err(NetworkError::new("OWNED_LOGIN_RESTART_REQUIRED"))
                }
                Callback::Code(code) => {
                    let code = code.clone();
                    *callback = Callback::Received(Sha256::digest(code.as_bytes()).into());
                    code
                }
            }
        };
        let verifier = match &mut *exchange {
            Exchange::Waiting(verifier) => verifier
                .take()
                .ok_or_else(|| NetworkError::new("OWNED_LOGIN_RESTART_REQUIRED"))?,
            _ => unreachable!("exchange mutex owns one request"),
        };
        // Set the terminal fence before awaiting IO. Even a dropped future
        // cannot redeem the code twice. A received successful grant replaces it.
        *exchange = Exchange::Failed(NetworkError::new("OWNED_LOGIN_RESTART_REQUIRED"));
        let started_at = now();
        let adapter = OAuthHttp(http.clone());
        let response = self
            .0
            .client
            .exchange_code(AuthorizationCode::new(code.to_string()))
            .set_pkce_verifier(PkceCodeVerifier::new(verifier.to_string()))
            .request_async(&adapter)
            .await;
        self.0.stop_listener();
        let response = response.map_err(|_| NetworkError::new("OWNED_LOGIN_RESTART_REQUIRED"))?;
        let lifetime = response
            .expires_in()
            .map(|duration| duration.as_secs())
            .filter(|seconds| (1..=31_536_000).contains(seconds));
        let token = response.access_token().secret();
        if response.token_type() != &BasicTokenType::Bearer
            || token.len() != 43
            || !token
                .bytes()
                .all(|byte| byte.is_ascii_alphanumeric() || b"_-".contains(&byte))
            || lifetime.is_none()
        {
            return Err(NetworkError::new("OWNED_LOGIN_RESTART_REQUIRED"));
        }
        let expires_at = started_at.saturating_add(lifetime.expect("checked lifetime"));
        let token = Zeroizing::new(token.clone());
        *exchange = Exchange::Issued {
            token: token.clone(),
            expires_at,
        };
        self.0
            .received_expires_at
            .store(expires_at, Ordering::Release);
        if self.0.cancelled.load(Ordering::Acquire) {
            return Err(NetworkError::new("OWNED_LOGIN_CANCELLED"));
        }
        Ok(Some((token, expires_at)))
    }
}

fn now() -> u64 {
    jsonwebtoken::get_current_timestamp()
}
enum CallbackResponse {
    Code(Zeroizing<String>),
    Denied,
}
async fn read_callback(
    socket: &mut TcpStream,
    host: &str,
    expected_state: &str,
) -> Result<CallbackResponse, ()> {
    let mut bytes = Zeroizing::new(Vec::new());
    loop {
        let mut chunk = [0u8; 1024];
        let count = socket.read(&mut chunk).await.map_err(|_| ())?;
        if count == 0 || bytes.len() + count > MAX_REQUEST {
            return Err(());
        }
        bytes.extend_from_slice(&chunk[..count]);
        if let Some(end) = bytes.windows(4).position(|part| part == b"\r\n\r\n") {
            if end + 4 != bytes.len() {
                return Err(());
            }
            return parse_callback(&bytes[..end], host, expected_state);
        }
    }
}
fn parse_callback(bytes: &[u8], host: &str, expected_state: &str) -> Result<CallbackResponse, ()> {
    let text = std::str::from_utf8(bytes).map_err(|_| ())?;
    let mut lines = text.split("\r\n");
    let mut first = lines.next().ok_or(())?.split(' ');
    if first.next() != Some("GET") {
        return Err(());
    }
    let target = first.next().ok_or(())?;
    if first.next() != Some("HTTP/1.1") || first.next().is_some() {
        return Err(());
    }
    let (path, query) = target.split_once('?').ok_or(())?;
    if path != CALLBACK_PATH || query.contains('#') {
        return Err(());
    }
    let mut host_count = 0;
    for line in lines {
        if line.starts_with([' ', '\t']) || line.chars().any(|ch| ch.is_control() && ch != '\t') {
            return Err(());
        }
        let (name, value) = line.split_once(':').ok_or(())?;
        if name.eq_ignore_ascii_case("host") {
            host_count += 1;
            if value.trim() != host {
                return Err(());
            }
        }
        if name.eq_ignore_ascii_case("transfer-encoding")
            || (name.eq_ignore_ascii_case("content-length") && value.trim() != "0")
        {
            return Err(());
        }
    }
    if host_count != 1 {
        return Err(());
    }
    let mut fields = HashMap::new();
    for (key, value) in url::form_urlencoded::parse(query.as_bytes()) {
        if !matches!(
            key.as_ref(),
            "state" | "code" | "error" | "error_description" | "error_uri"
        ) || fields
            .insert(key.into_owned(), Zeroizing::new(value.into_owned()))
            .is_some()
        {
            return Err(());
        }
    }
    let state = fields.remove("state").ok_or(())?;
    if state.len() != 43 || !bool::from(state.as_bytes().ct_eq(expected_state.as_bytes())) {
        return Err(());
    }
    match (fields.remove("code"), fields.remove("error")) {
        (Some(code), None)
            if code.len() == 43
                && code
                    .bytes()
                    .all(|byte| byte.is_ascii_alphanumeric() || b"_-".contains(&byte)) =>
        {
            Ok(CallbackResponse::Code(code))
        }
        (None, Some(error))
            if !error.is_empty()
                && error.len() <= 128
                && error
                    .bytes()
                    .all(|byte| byte.is_ascii_lowercase() || byte == b'_') =>
        {
            Ok(CallbackResponse::Denied)
        }
        _ => Err(()),
    }
}
fn accept_callback(state: &Mutex<Callback>, response: CallbackResponse) -> Option<bool> {
    let mut state = state.lock().unwrap_or_else(|e| e.into_inner());
    match response {
        CallbackResponse::Code(code) => {
            let digest: [u8; 32] = Sha256::digest(code.as_bytes()).into();
            match &*state {
                Callback::Pending => {
                    *state = Callback::Code(code);
                    Some(true)
                }
                Callback::Code(existing) => {
                    let existing: [u8; 32] = Sha256::digest(existing.as_bytes()).into();
                    bool::from(existing.ct_eq(&digest)).then_some(true)
                }
                Callback::Received(existing) => bool::from(existing.ct_eq(&digest)).then_some(true),
                Callback::Failed(_) => None,
            }
        }
        CallbackResponse::Denied => match *state {
            Callback::Pending => {
                *state = Callback::Failed("OWNED_LOGIN_DENIED");
                Some(false)
            }
            Callback::Failed("OWNED_LOGIN_DENIED") => Some(false),
            _ => None,
        },
    }
}

// Use an explicit Send future rather than the closure blanket implementation:
// native registry drivers move this exchange future across runtime threads.
struct OAuthHttp(reqwest::Client);
impl<'c> AsyncHttpClient<'c> for OAuthHttp {
    type Error = NetworkError;
    type Future = Pin<Box<dyn Future<Output = Result<HttpResponse, NetworkError>> + Send + 'c>>;
    fn call(&'c self, request: HttpRequest) -> Self::Future {
        let client = self.0.clone();
        Box::pin(async move { oauth_request(&client, request).await })
    }
}

async fn oauth_request(
    http: &reqwest::Client,
    request: HttpRequest,
) -> Result<HttpResponse, NetworkError> {
    let (parts, body) = request.into_parts();
    let body = Zeroizing::new(body);
    let mut response = http
        .request(parts.method, parts.uri.to_string())
        .headers(parts.headers)
        .timeout(Duration::from_secs(30))
        .body(body.to_vec())
        .send()
        .await
        .map_err(|_| NetworkError::new("OWNED_LOGIN_RESTART_REQUIRED"))?;
    if response.status().is_redirection()
        || response
            .content_length()
            .is_some_and(|size| size > MAX_RESPONSE as u64)
        || !response
            .headers()
            .get(reqwest::header::CACHE_CONTROL)
            .and_then(|value| value.to_str().ok())
            .is_some_and(|value| {
                value
                    .split(',')
                    .any(|part| part.trim().eq_ignore_ascii_case("no-store"))
            })
    {
        return Err(NetworkError::new("OWNED_LOGIN_RESTART_REQUIRED"));
    }
    let mut builder = oauth2::http::Response::builder().status(response.status());
    for (name, value) in response.headers() {
        builder = builder.header(name, value);
    }
    let mut bytes = Zeroizing::new(Vec::new());
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| NetworkError::new("OWNED_LOGIN_RESTART_REQUIRED"))?
    {
        if bytes.len() + chunk.len() > MAX_RESPONSE {
            return Err(NetworkError::new("OWNED_LOGIN_RESTART_REQUIRED"));
        }
        bytes.extend_from_slice(&chunk);
    }
    builder
        .body(bytes.to_vec())
        .map_err(|_| NetworkError::new("OWNED_LOGIN_RESTART_REQUIRED"))
}

#[cfg(test)]
mod tests {
    use super::*;
    const DEVICE: &str = "22222222-2222-4222-8222-222222222222";
    fn fields(flow: &NativeOAuth) -> HashMap<String, String> {
        url::Url::parse(flow.authorization_url())
            .unwrap()
            .query_pairs()
            .map(|(key, value)| (key.into_owned(), value.into_owned()))
            .collect()
    }
    fn http() -> reqwest::Client {
        crate::local_http::builder()
            .redirect(reqwest::redirect::Policy::none())
            .retry(reqwest::retry::never())
            .timeout(Duration::from_secs(3))
            .build()
            .unwrap()
    }
    async fn callback(flow: &NativeOAuth, query: &str) -> String {
        let redirect = url::Url::parse(&fields(flow)["redirect_uri"]).unwrap();
        let address = format!("127.0.0.1:{}", redirect.port().unwrap());
        let mut socket = TcpStream::connect(&address).await.unwrap();
        socket.write_all(format!("GET {CALLBACK_PATH}?{query} HTTP/1.1\r\nHost: {address}\r\nConnection: close\r\n\r\n").as_bytes()).await.unwrap();
        let mut response = Vec::new();
        tokio::time::timeout(Duration::from_secs(2), socket.read_to_end(&mut response))
            .await
            .unwrap()
            .unwrap();
        String::from_utf8(response).unwrap()
    }
    async fn token_request(socket: &mut TcpStream) -> (String, HashMap<String, String>) {
        let mut bytes = Vec::new();
        loop {
            let mut chunk = [0u8; 2048];
            let count = socket.read(&mut chunk).await.unwrap();
            assert!(count > 0 && bytes.len() + count <= MAX_REQUEST);
            bytes.extend_from_slice(&chunk[..count]);
            if let Some(end) = bytes.windows(4).position(|part| part == b"\r\n\r\n") {
                let headers = std::str::from_utf8(&bytes[..end]).unwrap();
                let length: usize = headers
                    .lines()
                    .find_map(|line| {
                        let (name, value) = line.split_once(':')?;
                        name.eq_ignore_ascii_case("content-length")
                            .then(|| value.trim().parse().unwrap())
                    })
                    .unwrap();
                if bytes.len() >= end + 4 + length {
                    let params = url::form_urlencoded::parse(&bytes[end + 4..end + 4 + length])
                        .map(|(key, value)| (key.into_owned(), value.into_owned()))
                        .collect();
                    return (headers.to_owned(), params);
                }
            }
        }
    }
    async fn respond_token(socket: &mut TcpStream) {
        let body = format!(
            r#"{{"access_token":"{}","token_type":"Bearer","expires_in":3600,"scope":"agentnet"}}"#,
            "t".repeat(43)
        );
        socket.write_all(format!("HTTP/1.1 200 OK\r\nCache-Control: no-store\r\nPragma: no-cache\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}", body.len()).as_bytes()).await.unwrap();
    }
    async fn accept_code(flow: &NativeOAuth) {
        let response = callback(
            flow,
            &format!("state={}&code={}", fields(flow)["state"], "c".repeat(43)),
        )
        .await;
        assert!(response.starts_with("HTTP/1.1 200"));
        assert!(response.contains("Cache-Control: no-store"));
        assert!(response.contains("Referrer-Policy: no-referrer"));
        assert!(!response.contains(&fields(flow)["state"]));
        assert!(!response.contains(&"c".repeat(43)));
    }

    #[tokio::test]
    async fn public_client_url_uses_library_s256_and_exact_loopback_without_client_secret() {
        let flow = NativeOAuth::bind("https://owned.example", DEVICE)
            .await
            .unwrap();
        let params = fields(&flow);
        assert_eq!(params.len(), 7);
        assert_eq!(params["response_type"], "code");
        assert_eq!(params["client_id"], CLIENT_ID);
        assert_eq!(params["device_id"], DEVICE);
        assert_eq!(params["code_challenge_method"], "S256");
        assert_eq!(params["state"].len(), 43);
        assert_eq!(params["code_challenge"].len(), 43);
        let redirect = url::Url::parse(&params["redirect_uri"]).unwrap();
        assert_eq!(redirect.host_str(), Some("127.0.0.1"));
        assert!(redirect.port().unwrap() >= 1024);
        assert_eq!(redirect.path(), CALLBACK_PATH);
        assert!(flow.expires_at() <= now() + AUTHORIZATION_SECONDS);
        assert_eq!(flow.received_expires_at(), None);
        assert!(flow.token(&http()).await.unwrap().is_none());
        assert!(flow.cached_token().await.is_none());
        assert!(!flow.authorization_url().contains("client_secret"));
    }

    #[tokio::test]
    async fn token_future_is_send_for_the_native_registry_driver() {
        fn assert_send<T: Send>(value: T) -> T {
            value
        }
        let flow = NativeOAuth::bind("https://owned.example", DEVICE)
            .await
            .unwrap();
        let http = http();
        assert!(assert_send(flow.token(&http)).await.unwrap().is_none());
    }

    #[test]
    fn strict_callback_rejects_wrong_method_host_path_duplicates_and_ambiguous_results() {
        let state = "s".repeat(43);
        let code = "c".repeat(43);
        let target = format!("{CALLBACK_PATH}?state={state}&code={code}");
        let good = format!("GET {target} HTTP/1.1\r\nHost: 127.0.0.1:9000");
        assert!(parse_callback(good.as_bytes(), "127.0.0.1:9000", &state).is_ok());
        for request in [
            good.replace("GET ", "POST "),
            good.replace("/oauth/callback?", "/wrong?"),
            good.replace("Host: 127.0.0.1:9000", "Host: attacker.example"),
            format!("{good}\r\nHost: 127.0.0.1:9000"),
            good.replace(" HTTP/1.1", &format!("&state={state} HTTP/1.1")),
            good.replace(" HTTP/1.1", "&error=access_denied HTTP/1.1"),
            good.replace(&format!("&code={code}"), ""),
            format!("{good}\r\nTransfer-Encoding: chunked"),
            format!("{good}\r\nContent-Length: 1"),
            good.replace(&state, &"x".repeat(43)),
        ] {
            assert!(parse_callback(request.as_bytes(), "127.0.0.1:9000", &state).is_err());
        }
    }

    #[tokio::test]
    async fn bad_state_does_not_consume_callback_and_duplicate_good_callback_is_idempotent() {
        let flow = NativeOAuth::bind("https://owned.example", DEVICE)
            .await
            .unwrap();
        let wrong = callback(
            &flow,
            &format!("state={}&code={}", "x".repeat(43), "c".repeat(43)),
        )
        .await;
        assert!(wrong.starts_with("HTTP/1.1 400"));
        assert!(flow.token(&http()).await.unwrap().is_none());
        accept_code(&flow).await;
        accept_code(&flow).await;
        let another = callback(
            &flow,
            &format!("state={}&code={}", fields(&flow)["state"], "d".repeat(43)),
        )
        .await;
        assert!(another.starts_with("HTTP/1.1 400"));
    }

    #[tokio::test]
    async fn code_exchange_is_singleflight_form_encoded_and_cached_without_redeeming_again() {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let flow = NativeOAuth::bind(
            &format!("http://{}", listener.local_addr().unwrap()),
            DEVICE,
        )
        .await
        .unwrap();
        accept_code(&flow).await;
        let params = fields(&flow);
        let server = async {
            let (mut socket, _) = listener.accept().await.unwrap();
            let (headers, body) = token_request(&mut socket).await;
            assert!(headers.starts_with("POST /auth/oauth/token HTTP/1.1"));
            assert!(!headers.to_ascii_lowercase().contains("authorization:"));
            assert_eq!(body.len(), 5);
            assert_eq!(body["grant_type"], "authorization_code");
            assert_eq!(body["client_id"], CLIENT_ID);
            assert_eq!(body["redirect_uri"], params["redirect_uri"]);
            assert_eq!(body["code"], "c".repeat(43));
            let verifier = PkceCodeVerifier::new(body["code_verifier"].clone());
            assert_eq!(
                PkceCodeChallenge::from_code_verifier_sha256(&verifier).as_str(),
                params["code_challenge"]
            );
            respond_token(&mut socket).await;
        };
        let http = http();
        let (first, second, ()) = tokio::join!(flow.token(&http), flow.token(&http), server);
        let first = first.unwrap().unwrap();
        let second = second.unwrap().unwrap();
        assert_eq!(*first.0, "t".repeat(43));
        assert_eq!(*first.0, *second.0);
        assert_eq!(first.1, second.1);
        assert_eq!(flow.received_expires_at(), Some(first.1));
        assert_eq!(*flow.cached_token().await.unwrap(), *first.0);
        assert_eq!(*flow.token(&http).await.unwrap().unwrap().0, *first.0);
        assert!(
            tokio::time::timeout(Duration::from_millis(30), listener.accept())
                .await
                .is_err()
        );
    }

    #[tokio::test]
    async fn ambiguous_exchange_failure_is_terminal_and_never_resubmits_consumed_code() {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let flow = NativeOAuth::bind(
            &format!("http://{}", listener.local_addr().unwrap()),
            DEVICE,
        )
        .await
        .unwrap();
        accept_code(&flow).await;
        let server = async {
            let (mut socket, _) = listener.accept().await.unwrap();
            let _ = token_request(&mut socket).await;
            // The server may have consumed the code before its response was lost.
        };
        let http = http();
        let (result, ()) = tokio::join!(flow.token(&http), server);
        assert_eq!(result.err().unwrap().code, "OWNED_LOGIN_RESTART_REQUIRED");
        assert_eq!(
            flow.token(&http).await.err().unwrap().code,
            "OWNED_LOGIN_RESTART_REQUIRED"
        );
        assert!(flow.cached_token().await.is_none());
        assert!(
            tokio::time::timeout(Duration::from_millis(30), listener.accept())
                .await
                .is_err()
        );
    }

    #[tokio::test]
    async fn cancel_during_exchange_keeps_exact_issued_token_available_for_manager_revocation() {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let flow = NativeOAuth::bind(
            &format!("http://{}", listener.local_addr().unwrap()),
            DEVICE,
        )
        .await
        .unwrap();
        accept_code(&flow).await;
        let (received_tx, received_rx) = tokio::sync::oneshot::channel();
        let (continue_tx, continue_rx) = tokio::sync::oneshot::channel();
        let server = async {
            let (mut socket, _) = listener.accept().await.unwrap();
            let _ = token_request(&mut socket).await;
            received_tx.send(()).unwrap();
            continue_rx.await.unwrap();
            respond_token(&mut socket).await;
        };
        let cancel = async {
            received_rx.await.unwrap();
            flow.cancel();
            continue_tx.send(()).unwrap();
            flow.cached_token().await
        };
        let http = http();
        let (result, cached, ()) = tokio::join!(flow.token(&http), cancel, server);
        assert_eq!(result.err().unwrap().code, "OWNED_LOGIN_CANCELLED");
        assert_eq!(*cached.unwrap(), "t".repeat(43));
        assert!(flow.received_expires_at().is_some());
        assert_eq!(
            flow.token(&http).await.err().unwrap().code,
            "OWNED_LOGIN_CANCELLED"
        );
    }

    #[tokio::test]
    async fn denial_has_no_sensitive_echo_and_cannot_exchange_a_token() {
        let flow = NativeOAuth::bind("https://owned.example", DEVICE)
            .await
            .unwrap();
        let response = callback(
            &flow,
            &format!(
                "state={}&error=access_denied&error_description=private-detail",
                fields(&flow)["state"]
            ),
        )
        .await;
        assert!(response.starts_with("HTTP/1.1 200"));
        assert!(!response.contains("private-detail"));
        assert_eq!(
            flow.token(&http()).await.err().unwrap().code,
            "OWNED_LOGIN_DENIED"
        );
        assert!(flow.cached_token().await.is_none());
    }

    #[tokio::test]
    async fn dropping_one_clone_keeps_listener_but_last_drop_closes_it() {
        let flow = NativeOAuth::bind("https://owned.example", DEVICE)
            .await
            .unwrap();
        let address = url::Url::parse(&fields(&flow)["redirect_uri"])
            .unwrap()
            .socket_addrs(|| None)
            .unwrap()[0];
        let other = flow.clone();
        drop(flow);
        accept_code(&other).await;
        drop(other);
        tokio::time::timeout(Duration::from_secs(1), async {
            loop {
                if TcpStream::connect(address).await.is_err() {
                    break;
                }
                tokio::time::sleep(Duration::from_millis(5)).await;
            }
        })
        .await
        .unwrap();
    }
}
