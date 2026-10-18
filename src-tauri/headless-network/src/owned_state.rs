//! Encrypted owned-account authority, independent of the official account namespace.
use crate::agent_network::NetworkError;
use myagents_agent_network_crypto::EncryptedIdentityStore;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::sync::Arc;
use zeroize::{Zeroize, Zeroizing};

#[derive(Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct Scope {
    pub issuer: String,
    pub service_id: String,
    pub environment: String,
    pub network_id: String,
    pub device_id: String,
}
fn uuid(value: &str) -> bool {
    uuid::Uuid::parse_str(value).is_ok_and(|id| id.to_string() == value)
}
impl Scope {
    pub fn validate(&self) -> Result<(), NetworkError> {
        let origin =
            url::Url::parse(&self.issuer).map_err(|_| NetworkError::new("OWNED_SCOPE_INVALID"))?;
        if origin.scheme() != "https"
            || origin.origin().ascii_serialization() != self.issuer
            || !origin.username().is_empty()
            || origin.password().is_some()
            || origin.query().is_some()
            || origin.fragment().is_some()
            || !uuid(&self.service_id)
            || !uuid(&self.network_id)
            || !uuid(&self.device_id)
            || !["production", "development"].contains(&self.environment.as_str())
        {
            return Err(NetworkError::new("OWNED_SCOPE_INVALID"));
        }
        Ok(())
    }
    fn namespace(&self) -> Result<String, NetworkError> {
        self.validate()?;
        let bytes =
            serde_json::to_vec(self).map_err(|_| NetworkError::new("OWNED_SCOPE_INVALID"))?;
        Ok(format!("owned-headless:{:x}", Sha256::digest(bytes)))
    }
}
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct Pending {
    pub attempt: String,
    pub transaction_id: Option<String>,
    pub verifier: String,
    pub expires_at: u64,
    /// Written before each poll. An uncertain single-consumption response cannot be resent.
    pub poll_consumed: bool,
}
impl Drop for Pending {
    fn drop(&mut self) {
        self.verifier.zeroize();
    }
}
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct PendingRenewal {
    pub token: String,
    pub session_handle: String,
    pub key_generation: u64,
    pub key_fingerprint: String,
}
impl Drop for PendingRenewal {
    fn drop(&mut self) {
        self.token.zeroize();
    }
}
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct Account {
    pub binding: String,
    pub principal: String,
    pub token: String,
    pub expires_at: u64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub renewal: Option<PendingRenewal>,
}
impl Drop for Account {
    fn drop(&mut self) {
        self.token.zeroize();
    }
}
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct State {
    pub version: u8,
    pub scope: Scope,
    pub trust_fingerprint: String,
    pub revision: String,
    pub pending: Option<Pending>,
    pub account: Option<Account>,
}
impl State {
    fn validate(&self, scope: &Scope, trust: &str) -> Result<(), NetworkError> {
        scope.validate()?;
        if self.version != 1
            || &self.scope != scope
            || self.trust_fingerprint != trust
            || !valid_fingerprint(trust)
            || !uuid(&self.revision)
            || self.pending.is_some() && self.account.is_some()
        {
            return Err(NetworkError::new("OWNED_STATE_SCOPE_MISMATCH"));
        }
        if self.pending.as_ref().is_some_and(|p| {
            !uuid(&p.attempt)
                || p.attempt != self.revision
                || p.transaction_id.as_ref().is_some_and(|id| !uuid(id))
                || !(43..=128).contains(&p.verifier.len())
                || !p
                    .verifier
                    .bytes()
                    .all(|b| b.is_ascii_alphanumeric() || b"-._~".contains(&b))
                || p.expires_at == 0
                || p.transaction_id.is_none() && p.poll_consumed
        }) || self.account.as_ref().is_some_and(|a| {
            !uuid(&a.binding)
                || !uuid(&a.principal)
                || a.token.len() != 43
                || !a
                    .token
                    .bytes()
                    .all(|b| b.is_ascii_alphanumeric() || b"-_".contains(&b))
                || a.expires_at == 0
                || a.renewal.as_ref().is_some_and(|r| {
                    r.token.len() != 43
                        || r.token == a.token
                        || base64::Engine::decode(
                            &base64::engine::general_purpose::URL_SAFE_NO_PAD,
                            &r.token,
                        )
                        .map(|b| b.len())
                        .ok()
                            != Some(32)
                        || !uuid(&r.session_handle)
                        || r.key_generation == 0
                        || r.key_generation > 9_007_199_254_740_991
                        || !valid_fingerprint(&r.key_fingerprint)
                })
        }) {
            return Err(NetworkError::new("OWNED_STATE_CORRUPT"));
        }
        Ok(())
    }
    pub fn begin(&mut self, verifier: String, now: u64) {
        self.account = None;
        self.revision = uuid::Uuid::new_v4().to_string();
        self.pending = Some(Pending {
            attempt: self.revision.clone(),
            transaction_id: None,
            verifier,
            expires_at: now.saturating_add(3600),
            poll_consumed: false,
        });
    }
    pub fn clear(&mut self) {
        self.pending = None;
        self.account = None;
        self.revision = uuid::Uuid::new_v4().to_string();
    }
    pub fn claim_poll(&mut self, attempt: &str, now: u64) -> Result<(), NetworkError> {
        let p = self
            .pending
            .as_mut()
            .filter(|p| p.attempt == attempt)
            .ok_or_else(|| NetworkError::new("AUTH_CANCELLED"))?;
        if p.expires_at <= now {
            return Err(NetworkError::new("AUTH_EXPIRED"));
        }
        if p.poll_consumed {
            return Err(NetworkError::new("AUTH_POLL_UNCONFIRMED"));
        }
        if p.transaction_id.is_none() {
            return Err(NetworkError::new("AUTH_NOT_PENDING"));
        }
        p.poll_consumed = true;
        Ok(())
    }
    pub fn publish_account(
        &mut self,
        attempt: &str,
        principal: String,
        token: String,
        expires_at: u64,
        now: u64,
    ) -> Result<(), NetworkError> {
        if self
            .pending
            .as_ref()
            .is_none_or(|p| p.attempt != attempt || !p.poll_consumed || p.expires_at <= now)
            || expires_at <= now
        {
            return Err(NetworkError::new("AUTH_CANCELLED"));
        }
        self.account = Some(Account {
            binding: uuid::Uuid::new_v4().to_string(),
            principal,
            token,
            expires_at,
            renewal: None,
        });
        self.pending = None;
        self.revision = uuid::Uuid::new_v4().to_string();
        Ok(())
    }
}
fn valid_fingerprint(value: &str) -> bool {
    value.len() == 64
        && value
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}
pub(crate) struct Owner {
    pub store: Arc<EncryptedIdentityStore>,
    pub scope: Scope,
    pub trust_fingerprint: String,
}
pub(crate) type StateRead = (State, Option<Zeroizing<Vec<u8>>>);
impl Owner {
    pub fn read(&self) -> Result<StateRead, NetworkError> {
        crate::state::bind_device(&self.store, &self.scope.device_id)?;
        let raw = self.store.load_state(&self.scope.namespace()?)?;
        let state = match &raw {
            Some(raw) => {
                serde_json::from_slice(raw).map_err(|_| NetworkError::new("OWNED_STATE_CORRUPT"))?
            }
            None => State {
                version: 1,
                scope: self.scope.clone(),
                trust_fingerprint: self.trust_fingerprint.clone(),
                revision: uuid::Uuid::new_v4().to_string(),
                pending: None,
                account: None,
            },
        };
        state.validate(&self.scope, &self.trust_fingerprint)?;
        Ok((state, raw))
    }
    pub fn commit(&self, old: Option<&[u8]>, state: &State) -> Result<(), NetworkError> {
        state.validate(&self.scope, &self.trust_fingerprint)?;
        let bytes = Zeroizing::new(
            serde_json::to_vec(state).map_err(|_| NetworkError::new("OWNED_STATE_CORRUPT"))?,
        );
        self.store
            .compare_exchange_state(&self.scope.namespace()?, old, &bytes)?;
        Ok(())
    }
    /// Durably stage the client-selected candidate before sending it. The
    /// original plaintext is a CAS witness; it is never written unencrypted.
    pub fn stage_renewal(
        &self,
        original: &[u8],
        pending: PendingRenewal,
    ) -> Result<Zeroizing<Vec<u8>>, NetworkError> {
        let mut state: State = serde_json::from_slice(original)
            .map_err(|_| NetworkError::new("OWNED_STATE_CORRUPT"))?;
        state.validate(&self.scope, &self.trust_fingerprint)?;
        let account = state
            .account
            .as_mut()
            .ok_or_else(|| NetworkError::new("OWNED_REAUTH_REQUIRED"))?;
        if account.expires_at <= jsonwebtoken::get_current_timestamp() || account.renewal.is_some()
        {
            return Err(NetworkError::new("ACCOUNT_SESSION_EXPIRED"));
        }
        account.renewal = Some(pending);
        self.commit(Some(original), &state)?;
        Ok(Zeroizing::new(
            serde_json::to_vec(&state).map_err(|_| NetworkError::new("OWNED_STATE_CORRUPT"))?,
        ))
    }
    /// Adopt only a server-confirmed candidate. Recovery can outlive the old
    /// local expiry, but must first authenticate the candidate and prove the
    /// exact persisted device key and session handle. No expiry is guessed.
    pub fn commit_renewal(
        &self,
        original: &[u8],
        candidate: &str,
        expires_at: u64,
    ) -> Result<(), NetworkError> {
        let mut state: State = serde_json::from_slice(original)
            .map_err(|_| NetworkError::new("OWNED_STATE_CORRUPT"))?;
        state.validate(&self.scope, &self.trust_fingerprint)?;
        let account = state
            .account
            .as_mut()
            .ok_or_else(|| NetworkError::new("OWNED_REAUTH_REQUIRED"))?;
        if account
            .renewal
            .as_ref()
            .is_none_or(|r| r.token != candidate)
            || expires_at < account.expires_at
            || expires_at <= jsonwebtoken::get_current_timestamp()
        {
            return Err(NetworkError::new("OWNED_SESSION_RENEWAL_INVALID"));
        }
        account.token = candidate.into();
        account.expires_at = expires_at;
        account.renewal = None;
        self.commit(Some(original), &state)
    }
    pub fn ensure_pending_renewal(
        &self,
        binding: &str,
        candidate: &str,
    ) -> Result<(), NetworkError> {
        let (state, _) = self.read()?;
        if state.account.as_ref().is_none_or(|a| {
            a.binding != binding || a.renewal.as_ref().is_none_or(|r| r.token != candidate)
        }) {
            return Err(NetworkError::new("ACCOUNT_BINDING_CHANGED"));
        }
        Ok(())
    }
    pub fn ensure_binding(&self, binding: &str) -> Result<(), NetworkError> {
        let (s, _) = self.read()?;
        let a = s
            .account
            .as_ref()
            .ok_or_else(|| NetworkError::new("OWNED_REAUTH_REQUIRED"))?;
        if a.binding != binding {
            return Err(NetworkError::new("ACCOUNT_BINDING_CHANGED"));
        }
        if a.expires_at <= jsonwebtoken::get_current_timestamp() {
            return Err(NetworkError::new("ACCOUNT_SESSION_EXPIRED"));
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn scope() -> Scope {
        Scope {
            issuer: "https://isolated.invalid".into(),
            service_id: uuid::Uuid::new_v4().to_string(),
            environment: "development".into(),
            network_id: uuid::Uuid::new_v4().to_string(),
            device_id: uuid::Uuid::new_v4().to_string(),
        }
    }
    fn state() -> State {
        State {
            version: 1,
            scope: scope(),
            trust_fingerprint: "a".repeat(64),
            revision: uuid::Uuid::new_v4().to_string(),
            pending: None,
            account: None,
        }
    }
    #[test]
    fn namespace_and_closed_state_bind_every_scope_component() {
        let s = state();
        let original = s.scope.namespace().unwrap();
        for field in 0..5 {
            let mut next = s.scope.clone();
            match field {
                0 => next.issuer = "https://other.invalid".into(),
                1 => next.service_id = uuid::Uuid::new_v4().to_string(),
                2 => next.environment = "production".into(),
                3 => next.network_id = uuid::Uuid::new_v4().to_string(),
                _ => next.device_id = uuid::Uuid::new_v4().to_string(),
            }
            assert_ne!(next.namespace().unwrap(), original);
            assert!(s.validate(&next, &s.trust_fingerprint).is_err());
        }
        assert!(s.validate(&s.scope, &"b".repeat(64)).is_err());
        let mut json = serde_json::to_value(&s).unwrap();
        json["extra"] = serde_json::json!(true);
        assert!(serde_json::from_value::<State>(json).is_err());
    }
    #[test]
    fn poll_claim_is_single_and_cancel_or_new_attempt_never_restores_account() {
        let mut s = state();
        s.begin("x".repeat(43), 10);
        s.pending.as_mut().unwrap().transaction_id = Some(uuid::Uuid::new_v4().to_string());
        let attempt = s.revision.clone();
        s.claim_poll(&attempt, 11).unwrap();
        assert_eq!(
            s.claim_poll(&attempt, 11).unwrap_err().code,
            "AUTH_POLL_UNCONFIRMED"
        );
        s.clear();
        assert!(s
            .publish_account(
                &attempt,
                uuid::Uuid::new_v4().to_string(),
                "x".repeat(43),
                200,
                12
            )
            .is_err());
        s.begin("y".repeat(43), 12);
        assert!(s
            .publish_account(
                &attempt,
                uuid::Uuid::new_v4().to_string(),
                "x".repeat(43),
                200,
                12
            )
            .is_err());
    }
    #[test]
    fn account_publication_requires_live_claim_and_expiry() {
        let mut s = state();
        s.begin("x".repeat(43), 10);
        s.pending.as_mut().unwrap().transaction_id = Some(uuid::Uuid::new_v4().to_string());
        let attempt = s.revision.clone();
        assert!(s
            .publish_account(
                &attempt,
                uuid::Uuid::new_v4().to_string(),
                "x".repeat(43),
                200,
                12
            )
            .is_err());
        s.claim_poll(&attempt, 11).unwrap();
        assert!(s
            .publish_account(
                &attempt,
                uuid::Uuid::new_v4().to_string(),
                "x".repeat(43),
                11,
                12
            )
            .is_err());
        s.publish_account(
            &attempt,
            uuid::Uuid::new_v4().to_string(),
            "x".repeat(43),
            200,
            12,
        )
        .unwrap();
        s.validate(&s.scope, &s.trust_fingerprint).unwrap();
        assert!(s.pending.is_none());
    }
    fn owner(root: &std::path::Path, scope: Scope, kek: &[u8; 32]) -> Owner {
        Owner {
            store: Arc::new(EncryptedIdentityStore::for_test(root, kek).unwrap()),
            scope,
            trust_fingerprint: "a".repeat(64),
        }
    }
    #[test]
    fn actual_encrypted_cas_restarts_consumed_claim_and_rejects_late_publication() {
        use std::os::unix::fs::PermissionsExt;
        let dir = tempfile::tempdir().unwrap();
        std::fs::set_permissions(dir.path(), std::fs::Permissions::from_mode(0o700)).unwrap();
        let root = std::fs::canonicalize(dir.path()).unwrap();
        let scope = scope();
        let first = owner(&root, scope.clone(), &[31; 32]);
        let (mut s, raw) = first.read().unwrap();
        s.begin("x".repeat(43), 10);
        s.pending.as_mut().unwrap().transaction_id = Some(uuid::Uuid::new_v4().to_string());
        first
            .commit(raw.as_deref().map(|v| v.as_slice()), &s)
            .unwrap();
        let (mut claimed, raw) = first.read().unwrap();
        let attempt = claimed.revision.clone();
        claimed.claim_poll(&attempt, 11).unwrap();
        first
            .commit(raw.as_deref().map(|v| v.as_slice()), &claimed)
            .unwrap();
        let restart = owner(&root, scope.clone(), &[31; 32]);
        let (mut restored, raw) = restart.read().unwrap();
        assert_eq!(
            restored.claim_poll(&attempt, 12).unwrap_err().code,
            "AUTH_POLL_UNCONFIRMED"
        );
        let old = Zeroizing::new(serde_json::to_vec(&claimed).unwrap());
        restored.clear();
        restart
            .commit(raw.as_deref().map(|v| v.as_slice()), &restored)
            .unwrap();
        claimed
            .publish_account(
                &attempt,
                uuid::Uuid::new_v4().to_string(),
                "z".repeat(43),
                100,
                12,
            )
            .unwrap();
        assert!(first.commit(Some(&old), &claimed).is_err());
        assert!(restart.read().unwrap().0.account.is_none());
        assert!(first
            .store
            .load_state(&format!(
                "official-headless:{}:{}",
                crate::state::SERVICE_ID,
                scope.device_id
            ))
            .unwrap()
            .is_none());
        assert!(owner(&root, scope, &[32; 32]).read().is_err());
    }
    #[test]
    fn staged_rotation_persists_and_cas_rejects_cancel_relogin_trust_and_two_renewers() {
        use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
        use std::os::unix::fs::PermissionsExt;
        let dir = tempfile::tempdir().unwrap();
        std::fs::set_permissions(dir.path(), std::fs::Permissions::from_mode(0o700)).unwrap();
        let root = std::fs::canonicalize(dir.path()).unwrap();
        let scope = scope();
        let owner = owner(&root, scope.clone(), &[49; 32]);
        let (mut state, raw) = owner.read().unwrap();
        let now = jsonwebtoken::get_current_timestamp();
        state.account = Some(Account {
            binding: uuid::Uuid::new_v4().to_string(),
            principal: uuid::Uuid::new_v4().to_string(),
            token: URL_SAFE_NO_PAD.encode([1u8; 32]),
            expires_at: now + 60,
            renewal: None,
        });
        owner
            .commit(raw.as_deref().map(|r| r.as_slice()), &state)
            .unwrap();
        let (_, raw) = owner.read().unwrap();
        let original = raw.unwrap();
        let candidate = URL_SAFE_NO_PAD.encode([2u8; 32]);
        let pending = || PendingRenewal {
            token: candidate.clone(),
            session_handle: uuid::Uuid::new_v4().to_string(),
            key_generation: 1,
            key_fingerprint: "b".repeat(64),
        };
        let staged = owner.stage_renewal(&original, pending()).unwrap();
        assert!(owner.stage_renewal(&original, pending()).is_err()); // two renewers
        let restarted = super::tests::owner(&root, scope.clone(), &[49; 32]);
        let (crash_state, crash_raw) = restarted.read().unwrap();
        assert_eq!(crash_raw.as_deref().unwrap().as_slice(), staged.as_slice());
        assert_eq!(
            crash_state
                .account
                .as_ref()
                .unwrap()
                .renewal
                .as_ref()
                .unwrap()
                .token,
            candidate
        );
        assert_eq!(
            crash_state.account.as_ref().unwrap().token,
            state.account.as_ref().unwrap().token
        );
        assert!(restarted
            .commit_renewal(&staged, &URL_SAFE_NO_PAD.encode([3u8; 32]), now + 3600)
            .is_err());
        restarted
            .commit_renewal(&staged, &candidate, now + 3600)
            .unwrap();
        let (renewed, _) = owner.read().unwrap();
        let a = renewed.account.as_ref().unwrap();
        let before = state.account.as_ref().unwrap();
        assert_eq!(
            (&a.binding, &a.principal),
            (&before.binding, &before.principal)
        );
        assert_eq!(a.token, candidate);
        assert_eq!(renewed.revision, state.revision);
        assert_eq!(a.expires_at, now + 3600);
        assert!(a.renewal.is_none());
        assert!(owner
            .commit_renewal(&staged, &candidate, now + 7200)
            .is_err());
        // Stage another attempt, then cancel or relogin before its ACK.
        let (_, raw) = owner.read().unwrap();
        let staged = owner
            .stage_renewal(
                &raw.unwrap(),
                PendingRenewal {
                    token: URL_SAFE_NO_PAD.encode([4u8; 32]),
                    session_handle: uuid::Uuid::new_v4().to_string(),
                    key_generation: 1,
                    key_fingerprint: "b".repeat(64),
                },
            )
            .unwrap();
        let (mut cancelled, _) = owner.read().unwrap();
        cancelled.clear();
        owner.commit(Some(&staged), &cancelled).unwrap();
        assert!(owner
            .commit_renewal(&staged, &URL_SAFE_NO_PAD.encode([4u8; 32]), now + 7200)
            .is_err());
        let (_, raw) = owner.read().unwrap();
        cancelled.account = Some(Account {
            binding: uuid::Uuid::new_v4().to_string(),
            principal: before.principal.clone(),
            token: URL_SAFE_NO_PAD.encode([5u8; 32]),
            expires_at: now + 60,
            renewal: None,
        });
        owner
            .commit(raw.as_deref().map(|r| r.as_slice()), &cancelled)
            .unwrap();
        assert!(owner
            .commit_renewal(&staged, &URL_SAFE_NO_PAD.encode([4u8; 32]), now + 7200)
            .is_err());
        let mut changed_trust = super::tests::owner(&root, scope, &[49; 32]);
        changed_trust.trust_fingerprint = "c".repeat(64);
        assert!(changed_trust
            .commit_renewal(&staged, &URL_SAFE_NO_PAD.encode([4u8; 32]), now + 7200)
            .is_err());
    }
    #[test]
    fn persisted_account_guard_observes_cancel_expiry_and_new_login_binding() {
        use std::os::unix::fs::PermissionsExt;
        let dir = tempfile::tempdir().unwrap();
        std::fs::set_permissions(dir.path(), std::fs::Permissions::from_mode(0o700)).unwrap();
        let root = std::fs::canonicalize(dir.path()).unwrap();
        let owner = owner(&root, scope(), &[31; 32]);
        let (mut s, raw) = owner.read().unwrap();
        let now = jsonwebtoken::get_current_timestamp();
        s.begin("x".repeat(43), now);
        s.pending.as_mut().unwrap().transaction_id = Some(uuid::Uuid::new_v4().to_string());
        let attempt = s.revision.clone();
        s.claim_poll(&attempt, now).unwrap();
        s.publish_account(
            &attempt,
            uuid::Uuid::new_v4().to_string(),
            "z".repeat(43),
            now + 300,
            now,
        )
        .unwrap();
        let binding = s.account.as_ref().unwrap().binding.clone();
        owner
            .commit(raw.as_deref().map(|v| v.as_slice()), &s)
            .unwrap();
        owner.ensure_binding(&binding).unwrap();
        let (mut s, raw) = owner.read().unwrap();
        s.clear();
        owner
            .commit(raw.as_deref().map(|v| v.as_slice()), &s)
            .unwrap();
        assert_eq!(
            owner.ensure_binding(&binding).unwrap_err().code,
            "OWNED_REAUTH_REQUIRED"
        );
        let (mut s, raw) = owner.read().unwrap();
        s.begin("y".repeat(43), now);
        s.pending.as_mut().unwrap().transaction_id = Some(uuid::Uuid::new_v4().to_string());
        let attempt = s.revision.clone();
        s.claim_poll(&attempt, now).unwrap();
        s.publish_account(
            &attempt,
            uuid::Uuid::new_v4().to_string(),
            "w".repeat(43),
            now + 300,
            now,
        )
        .unwrap();
        let new_binding = s.account.as_ref().unwrap().binding.clone();
        owner
            .commit(raw.as_deref().map(|v| v.as_slice()), &s)
            .unwrap();
        assert_eq!(
            owner.ensure_binding(&binding).unwrap_err().code,
            "ACCOUNT_BINDING_CHANGED"
        );
        owner.ensure_binding(&new_binding).unwrap();
        let (mut s, raw) = owner.read().unwrap();
        s.account.as_mut().unwrap().expires_at = now;
        owner
            .commit(raw.as_deref().map(|v| v.as_slice()), &s)
            .unwrap();
        assert_eq!(
            owner.ensure_binding(&new_binding).unwrap_err().code,
            "ACCOUNT_SESSION_EXPIRED"
        );
    }
    #[test]
    fn concurrent_claims_only_one_publish_and_failed_save_preserves_claim() {
        use std::os::unix::fs::PermissionsExt;
        let dir = tempfile::tempdir().unwrap();
        std::fs::set_permissions(dir.path(), std::fs::Permissions::from_mode(0o700)).unwrap();
        let root = std::fs::canonicalize(dir.path()).unwrap();
        let owner = Arc::new(owner(&root, scope(), &[31; 32]));
        let (mut s, raw) = owner.read().unwrap();
        s.begin("x".repeat(43), 10);
        s.pending.as_mut().unwrap().transaction_id = Some(uuid::Uuid::new_v4().to_string());
        owner
            .commit(raw.as_deref().map(|v| v.as_slice()), &s)
            .unwrap();
        let barrier = Arc::new(std::sync::Barrier::new(2));
        let threads = (0..2)
            .map(|_| {
                let owner = owner.clone();
                let barrier = barrier.clone();
                std::thread::spawn(move || {
                    let (mut s, raw) = owner.read().unwrap();
                    let attempt = s.revision.clone();
                    s.claim_poll(&attempt, 11).unwrap();
                    barrier.wait();
                    owner
                        .commit(raw.as_deref().map(|v| v.as_slice()), &s)
                        .is_ok()
                })
            })
            .collect::<Vec<_>>();
        assert_eq!(
            threads
                .into_iter()
                .map(|t| usize::from(t.join().unwrap()))
                .sum::<usize>(),
            1
        );
        let (mut s, raw) = owner.read().unwrap();
        let attempt = s.revision.clone();
        s.publish_account(
            &attempt,
            uuid::Uuid::new_v4().to_string(),
            "z".repeat(43),
            100,
            12,
        )
        .unwrap();
        std::fs::set_permissions(&root, std::fs::Permissions::from_mode(0o750)).unwrap();
        assert!(owner
            .commit(raw.as_deref().map(|v| v.as_slice()), &s)
            .is_err());
        std::fs::set_permissions(&root, std::fs::Permissions::from_mode(0o700)).unwrap();
        let (mut s, _) = owner.read().unwrap();
        assert!(s.account.is_none());
        assert_eq!(
            s.claim_poll(&attempt, 12).unwrap_err().code,
            "AUTH_POLL_UNCONFIRMED"
        );
    }
}
