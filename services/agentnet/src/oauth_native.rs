//! Native desktop OAuth authorization-code broker over the service's existing
//! confidential OIDC relying party and AuthStore session authority.
//!
//! The public desktop client never receives the Dex client secret or an ID
//! token. It gets a short-lived, one-use broker code, then exchanges that code
//! for the service's existing device-bound bearer session.

use super::{
    ApiError, App, MAX_TRANSACTIONS, Pending, Phase, canonical_uuid, ct_eq, unix_now,
    valid_challenge,
};
use axum::{
    Json,
    body::Body,
    extract::{OriginalUri, Request, State},
    http::{StatusCode, header},
    middleware::Next,
    response::{IntoResponse, Redirect, Response},
};
use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD};
use openidconnect::{CsrfToken, Nonce, PkceCodeChallenge, Scope, core::CoreAuthenticationFlow};
use rand::random;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{collections::HashMap, sync::Arc};
use zeroize::Zeroizing;

pub(super) const CLIENT_ID: &str = "moxbots-desktop";
const AUTH_CODE_TTL_SECONDS: i64 = 90;

pub(super) struct Context {
    pub(super) redirect_uri: String,
    pub(super) state: Zeroizing<String>,
    pub(super) challenge: String,
    pub(super) code_hash: Option<String>,
    pub(super) code_expires_at: Option<i64>,
    pub(super) subject: Option<crate::VerifiedSubject>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct TokenRequest {
    pub(super) grant_type: String,
    pub(super) code: String,
    pub(super) redirect_uri: String,
    pub(super) client_id: String,
    pub(super) code_verifier: Zeroizing<String>,
}

#[derive(Serialize)]
struct TokenResponse {
    access_token: Zeroizing<String>,
    token_type: &'static str,
    expires_in: u64,
}

pub(super) async fn authorize(
    State(app): State<Arc<App>>,
    OriginalUri(uri): OriginalUri,
) -> Result<Response, ApiError> {
    let query = uri.query().ok_or(ApiError::BadRequest)?;
    if query.len() > 4096 {
        return Err(ApiError::BadRequest);
    }
    let mut fields = HashMap::<String, String>::new();
    for (key, value) in url::form_urlencoded::parse(query.as_bytes()) {
        if !matches!(
            key.as_ref(),
            "response_type"
                | "client_id"
                | "redirect_uri"
                | "state"
                | "code_challenge"
                | "code_challenge_method"
                | "device_id"
        ) || fields
            .insert(key.into_owned(), value.into_owned())
            .is_some()
        {
            return Err(ApiError::BadRequest);
        }
    }
    let take = |fields: &mut HashMap<String, String>, name: &str| {
        fields.remove(name).ok_or(ApiError::BadRequest)
    };
    let response_type = take(&mut fields, "response_type")?;
    let client_id = take(&mut fields, "client_id")?;
    let redirect_uri = take(&mut fields, "redirect_uri")?;
    let outer_state = take(&mut fields, "state")?;
    let challenge = take(&mut fields, "code_challenge")?;
    let method = take(&mut fields, "code_challenge_method")?;
    let device_id = take(&mut fields, "device_id")?;
    let device_id = canonical_uuid(&device_id).ok_or(ApiError::BadRequest)?;
    if response_type != "code"
        || client_id != CLIENT_ID
        || method != "S256"
        || !valid_state(&outer_state)
        || !valid_challenge(&challenge)
        || !valid_redirect_uri(&redirect_uri)
    {
        return Err(ApiError::BadRequest);
    }

    let now = unix_now().map_err(|_| ApiError::Internal)?;
    let expires = now
        .checked_add(app.flow.ttl.as_secs().min(270) as i64)
        .ok_or(ApiError::Internal)?;
    let tx = uuid::Uuid::new_v4().to_string();
    let provider_state = URL_SAFE_NO_PAD.encode(random::<[u8; 32]>());
    let nonce = URL_SAFE_NO_PAD.encode(random::<[u8; 32]>());
    let (provider_challenge, provider_verifier) = PkceCodeChallenge::new_random_sha256();
    let provider_state_for_url = provider_state.clone();
    let nonce_for_url = nonce.clone();
    let auth_url = app
        .client
        .authorize_url(
            CoreAuthenticationFlow::AuthorizationCode,
            move || CsrfToken::new(provider_state_for_url),
            move || Nonce::new(nonce_for_url),
        )
        .add_scope(Scope::new("openid".into()))
        .add_scope(Scope::new("profile".into()))
        .add_scope(Scope::new("email".into()))
        .set_pkce_challenge(provider_challenge)
        .url()
        .0;
    if auth_url.query().is_none() || auth_url.fragment().is_some() {
        return Err(ApiError::Internal);
    }
    let mut all = app.flow.pending.lock().map_err(|_| ApiError::Internal)?;
    all.retain(|_, pending| pending.expires_at > now);
    if all.len() >= MAX_TRANSACTIONS {
        return Err(ApiError::Busy);
    }
    all.insert(
        tx.clone(),
        Pending {
            device_id,
            client_challenge: challenge.clone(),
            provider_verifier: Zeroizing::new(provider_verifier.secret().to_owned()),
            state: Zeroizing::new(provider_state),
            nonce: Zeroizing::new(nonce),
            expires_at: expires,
            phase: Phase::Pending,
            browser_return_path: None,
            replayable_result: false,
        },
    );
    let mut oauth = app.flow.oauth.lock().map_err(|_| ApiError::Internal)?;
    oauth.retain(|tx, _| all.contains_key(tx));
    oauth.insert(
        tx,
        Context {
            redirect_uri,
            state: Zeroizing::new(outer_state),
            challenge,
            code_hash: None,
            code_expires_at: None,
            subject: None,
        },
    );
    let mut response = Redirect::temporary(auth_url.as_str()).into_response();
    harden(&mut response);
    Ok(response)
}

pub(super) fn callback_redirect(
    app: &App,
    uri: &axum::http::Uri,
    success: bool,
) -> Option<Response> {
    let query = uri.query().filter(|query| query.len() <= 8192)?;
    let mut states = url::form_urlencoded::parse(query.as_bytes())
        .filter(|(key, _)| key == "state")
        .map(|(_, value)| value.into_owned());
    let state = states.next()?;
    if states.next().is_some() {
        return None;
    }
    let mut all = app.flow.pending.lock().ok()?;
    let now = unix_now().ok()?;
    let (tx, _) = all.iter().find(|(tx, pending)| {
        pending.expires_at > now
            && ct_eq(pending.state.as_bytes(), state.as_bytes())
            && app
                .flow
                .oauth
                .lock()
                .ok()
                .is_some_and(|contexts| contexts.contains_key(*tx))
    })?;
    let tx = tx.clone();
    let mut contexts = app.flow.oauth.lock().ok()?;
    let context = contexts.get_mut(&tx)?;
    let pending = all.get_mut(&tx)?;
    let can_issue = success
        && matches!(pending.phase, Phase::OAuthDelivered)
        && context.subject.is_some()
        && context.code_hash.is_none();
    let destination = if can_issue {
        let code = URL_SAFE_NO_PAD.encode(random::<[u8; 32]>());
        context.code_hash = Some(URL_SAFE_NO_PAD.encode(Sha256::digest(code.as_bytes())));
        context.code_expires_at = now.checked_add(AUTH_CODE_TTL_SECONDS);
        Some(format!(
            "{}?code={}&state={}",
            context.redirect_uri,
            code,
            context.state.as_str()
        ))
    } else if !success && matches!(pending.phase, Phase::Failed) {
        let provider_denied = url::form_urlencoded::parse(query.as_bytes())
            .filter(|(key, _)| key == "error")
            .any(|(_, value)| value == "access_denied");
        let error = if provider_denied {
            "access_denied"
        } else {
            "server_error"
        };
        Some(format!(
            "{}?error={error}&state={}",
            context.redirect_uri,
            context.state.as_str()
        ))
    } else {
        None
    };
    if let Some(destination) = destination {
        let mut response = Redirect::temporary(&destination).into_response();
        harden(&mut response);
        Some(response)
    } else {
        Some(processing_response())
    }
}

fn processing_response() -> Response {
    let mut response = (
        StatusCode::ACCEPTED,
        [(header::CONTENT_SECURITY_POLICY, "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'")],
        axum::response::Html("<!doctype html><meta charset=utf-8><title>Sign-in</title><p>Authorization is already processing or has been sent to the application. Return to the application.</p>"),
    ).into_response();
    harden(&mut response);
    response
}

pub(super) async fn token(
    State(app): State<Arc<App>>,
    axum::Form(req): axum::Form<TokenRequest>,
) -> Result<Response, ApiError> {
    if req.grant_type != "authorization_code" {
        return Ok(oauth_error(
            StatusCode::BAD_REQUEST,
            "unsupported_grant_type",
        ));
    }
    if req.client_id != CLIENT_ID {
        return Ok(oauth_error(StatusCode::BAD_REQUEST, "invalid_client"));
    }
    if req.code.len() != 43
        || !req
            .code
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || b"_-".contains(&byte))
        || !valid_verifier(&req.code_verifier)
    {
        return Ok(oauth_error(StatusCode::BAD_REQUEST, "invalid_grant"));
    }
    let challenge = URL_SAFE_NO_PAD.encode(Sha256::digest(req.code_verifier.as_bytes()));
    let code_hash = URL_SAFE_NO_PAD.encode(Sha256::digest(req.code.as_bytes()));
    let now = unix_now().map_err(|_| ApiError::Internal)?;
    let mut all = app.flow.pending.lock().map_err(|_| ApiError::Internal)?;
    let mut contexts = app.flow.oauth.lock().map_err(|_| ApiError::Internal)?;
    all.retain(|_, pending| pending.expires_at > now);
    contexts.retain(|tx, _| all.contains_key(tx));
    let matched = all
        .iter()
        .find_map(|(tx, pending)| {
            let context = contexts.get(tx)?;
            (matches!(pending.phase, Phase::OAuthDelivered)
                && context.code_expires_at.is_some_and(|expires| expires > now)
                && context
                    .code_hash
                    .as_ref()
                    .is_some_and(|stored| ct_eq(stored.as_bytes(), code_hash.as_bytes()))
                && context.redirect_uri == req.redirect_uri
                && ct_eq(context.challenge.as_bytes(), challenge.as_bytes())
                && pending.device_id.len() == 36)
                .then(|| tx.clone())
        })
        .ok_or(ApiError::Unauthorized)?;
    let pending = all.get_mut(&matched).ok_or(ApiError::Unauthorized)?;
    let context = contexts.get(&matched).ok_or(ApiError::Unauthorized)?;
    if context.redirect_uri != req.redirect_uri
        || !ct_eq(context.challenge.as_bytes(), challenge.as_bytes())
    {
        return Err(ApiError::Unauthorized);
    }
    let device_id = pending.device_id.clone();
    // The account subject is set by the verified OIDC callback. It is retained
    // in the phase until the one-use code is consumed, never in a public URL.
    if !matches!(pending.phase, Phase::OAuthDelivered) {
        return Err(ApiError::Unauthorized);
    }
    let subject = context.subject.clone().ok_or(ApiError::LoginFailed)?;
    pending.phase = Phase::Consuming;
    // Keep the transaction map lock through AuthStore issuance and removal so
    // concurrent token requests cannot mint two sessions for one code.
    let issued = app
        .store
        .issue_session(&subject, &device_id)
        .map_err(|_| ApiError::Internal)?;
    let expires_at = issued.expires_at;
    let token = issued.into_token();
    all.remove(&matched);
    contexts.remove(&matched);
    let response = TokenResponse {
        access_token: token,
        token_type: "Bearer",
        expires_in: expires_at.saturating_sub(unix_now().unwrap_or(now)).max(0) as u64,
    };
    let mut result = (StatusCode::OK, Json(response)).into_response();
    harden(&mut result);
    Ok(result)
}

pub(super) fn harden(response: &mut Response) {
    let headers = response.headers_mut();
    headers.insert(header::CACHE_CONTROL, "no-store".parse().unwrap());
    headers.insert(header::PRAGMA, "no-cache".parse().unwrap());
    headers.insert(header::REFERRER_POLICY, "no-referrer".parse().unwrap());
}

fn oauth_error(status: StatusCode, error: &'static str) -> Response {
    let mut response = (status, Json(serde_json::json!({"error": error}))).into_response();
    harden(&mut response);
    response
}

pub(super) async fn token_error_middleware(request: Request<Body>, next: Next) -> Response {
    let response = next.run(request).await;
    if response.status().is_success() {
        let mut response = response;
        harden(&mut response);
        return response;
    }
    let status_original = response.status();
    let body = axum::body::to_bytes(response.into_body(), 4096)
        .await
        .unwrap_or_default();
    let declared = serde_json::from_slice::<serde_json::Value>(&body)
        .ok()
        .and_then(|value| {
            value
                .get("error")
                .and_then(serde_json::Value::as_str)
                .map(str::to_owned)
        });
    if let Some(error) = declared.filter(|error| {
        matches!(
            error.as_str(),
            "invalid_request"
                | "invalid_client"
                | "invalid_grant"
                | "unauthorized_client"
                | "unsupported_grant_type"
                | "invalid_scope"
                | "server_error"
                | "temporarily_unavailable"
        )
    }) {
        let mut response =
            (status_original, Json(serde_json::json!({"error": error}))).into_response();
        harden(&mut response);
        return response;
    }
    let (status, error) = match status_original {
        StatusCode::UNAUTHORIZED => (StatusCode::BAD_REQUEST, "invalid_grant"),
        StatusCode::SERVICE_UNAVAILABLE | StatusCode::TOO_MANY_REQUESTS => {
            (StatusCode::SERVICE_UNAVAILABLE, "temporarily_unavailable")
        }
        StatusCode::INTERNAL_SERVER_ERROR | StatusCode::BAD_GATEWAY => {
            (StatusCode::INTERNAL_SERVER_ERROR, "server_error")
        }
        _ => (StatusCode::BAD_REQUEST, "invalid_request"),
    };
    oauth_error(status, error)
}

fn valid_state(state: &str) -> bool {
    state.len() == 43
        && URL_SAFE_NO_PAD
            .decode(state)
            .is_ok_and(|bytes| bytes.len() == 32 && URL_SAFE_NO_PAD.encode(bytes) == state)
}

fn valid_verifier(verifier: &str) -> bool {
    (43..=128).contains(&verifier.len())
        && verifier
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || b"-._~".contains(&byte))
}

fn valid_redirect_uri(value: &str) -> bool {
    let Ok(url) = url::Url::parse(value) else {
        return false;
    };
    url.as_str() == value
        && url.scheme() == "http"
        && url.host_str() == Some("127.0.0.1")
        && url
            .port()
            .is_some_and(|port| (1024..=65535).contains(&port))
        && url.path() == "/oauth/callback"
        && url.username().is_empty()
        && url.password().is_none()
        && url.query().is_none()
        && url.fragment().is_none()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_only_exact_native_loopback_redirects() {
        for good in [
            "http://127.0.0.1:1024/oauth/callback",
            "http://127.0.0.1:65535/oauth/callback",
        ] {
            assert!(valid_redirect_uri(good), "{good}");
        }
        for bad in [
            "http://localhost:12345/oauth/callback",
            "http://127.0.0.1:1023/oauth/callback",
            "http://127.0.0.1:65536/oauth/callback",
            "https://127.0.0.1:12345/oauth/callback",
            "http://127.0.0.1:12345/oauth/callback/",
            "http://127.0.0.1:12345/oauth/callback?next=https://evil.test",
            "http://user@127.0.0.1:12345/oauth/callback",
        ] {
            assert!(!valid_redirect_uri(bad), "{bad}");
        }
    }

    #[test]
    fn validates_fixed_client_and_state_shape() {
        assert_eq!(CLIENT_ID, "moxbots-desktop");
        assert!(valid_state(&URL_SAFE_NO_PAD.encode([7u8; 32])));
        assert!(!valid_state("short"));
    }
}
