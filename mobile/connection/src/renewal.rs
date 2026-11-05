//! Native account maintenance. The original account record stays readable by
//! older apps; crash recovery lives in a separate encrypted OS record.
use super::*;
use crate::agent_network::transport::SessionRenewal;
use zeroize::Zeroize;

const PENDING: &str = "account-renewal";
const CLOCK: &str = "account-renewal-clock";
const CHECK_INTERVAL: u64 = 6 * 60 * 60;

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Renewal {
    original: SavedAccount,
    candidate: String,
    session_handle: String,
    key_generation: u64,
    key_fingerprint: String,
}
impl Drop for Renewal {
    fn drop(&mut self) {
        self.candidate.zeroize();
    }
}
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Clock {
    account_hash: String,
    checked_at: u64,
}
fn account_hash(account: &SavedAccount) -> Result<String, NetworkError> {
    let bytes =
        Zeroizing::new(serde_json::to_vec(account).map_err(|_| err("OWNED_SESSION_INVALID"))?);
    Ok(format!("{:x}", Sha256::digest(&bytes)))
}
impl Renewal {
    fn validate(&self, issuer: &str, account: &SavedAccount) -> Result<(), NetworkError> {
        self.original.instance.validate(issuer)?;
        self.original
            .instance
            .ensure_same_trust(&account.instance)?;
        if self.original.device_id != account.device_id
            || self.original.session.principal_id != account.session.principal_id
            || self.original.session.network_id != account.session.network_id
            || self.candidate.len() != 43
            || URL_SAFE_NO_PAD
                .decode(&self.candidate)
                .map(|b| b.len())
                .ok()
                != Some(32)
            || uuid::Uuid::parse_str(&self.session_handle)
                .map(|id| id.to_string() != self.session_handle)
                .unwrap_or(true)
            || self.key_generation == 0
            || self.key_fingerprint.is_empty()
            || self.key_fingerprint.len() > 256
        {
            return Err(err("OWNED_SESSION_RENEWAL_INVALID"));
        }
        let original = account_hash(account)? == account_hash(&self.original)?;
        let committed = account.session.access_token == self.candidate
            && account.session.expires_at >= self.original.session.expires_at;
        if !original && !committed {
            return Err(err("OWNED_SESSION_RENEWAL_INVALID"));
        }
        Ok(())
    }
}
impl MobileConnection {
    fn read_renewal(&self) -> Result<Option<Renewal>, NetworkError> {
        self.store
            .read_record(&self.config.issuer, PENDING)
            .map_err(store_error)?
            .map(|bytes| {
                if bytes.len() > 256 * 1024 {
                    return Err(err("OWNED_SESSION_RENEWAL_INVALID"));
                }
                serde_json::from_slice(&bytes).map_err(|_| err("OWNED_SESSION_RENEWAL_INVALID"))
            })
            .transpose()
    }
    fn write_checked(&self, record: &str, bytes: &[u8]) -> Result<(), NetworkError> {
        self.store
            .write_record(&self.config.issuer, record, bytes)
            .map_err(store_error)?;
        if self
            .store
            .read_record(&self.config.issuer, record)
            .map_err(store_error)?
            .as_deref()
            .map(|v| v.as_slice())
            != Some(bytes)
        {
            return Err(err("MOBILE_SECURE_STORE_UNAVAILABLE"));
        }
        Ok(())
    }
    fn remove_checked(&self, record: &str) -> Result<(), NetworkError> {
        self.store
            .remove_record(&self.config.issuer, record)
            .map_err(store_error)?;
        if self
            .store
            .read_record(&self.config.issuer, record)
            .map_err(store_error)?
            .is_some()
        {
            return Err(err("MOBILE_SECURE_STORE_UNAVAILABLE"));
        }
        Ok(())
    }
    fn renewal_due(&self) -> Result<bool, NetworkError> {
        let Some(saved) = self.saved.as_ref() else {
            return Ok(false);
        };
        if self.read_renewal()?.is_some() {
            return Ok(true);
        }
        let now = jsonwebtoken::get_current_timestamp();
        if saved.session.expires_at <= now {
            return Ok(false);
        }
        let clock = self
            .store
            .read_record(&self.config.issuer, CLOCK)
            .map_err(store_error)?;
        let checked = clock
            .as_deref()
            .and_then(|bytes| serde_json::from_slice::<Clock>(bytes).ok());
        let current_hash = account_hash(saved)?;
        Ok(!checked.is_some_and(|clock| {
            let interval = (saved.session.expires_at.saturating_sub(clock.checked_at) / 2)
                .clamp(30, CHECK_INTERVAL);
            clock.account_hash == current_hash
                && clock.checked_at <= now
                && now - clock.checked_at < interval
                && saved.session.expires_at > now.saturating_add(30)
        }))
    }
    fn retire_account_connections(&mut self) {
        self.active.store(false, Ordering::Release);
        self.active = Arc::new(AtomicBool::new(true));
        self.connected = None;
        self.peer = None;
        let aliases = take_target_aliases(&mut self.targets, &mut self.suspended_target_aliases);
        self.clear_targets();
        self.suspended_target_aliases = aliases;
    }
    fn finish_renewal(
        &mut self,
        pending: &Renewal,
        session: OwnedSession,
    ) -> Result<(), NetworkError> {
        let saved = self
            .saved
            .as_ref()
            .ok_or_else(|| err("OWNED_LOGIN_REQUIRED"))?;
        pending.validate(&self.config.issuer, saved)?;
        if session.access_token != pending.candidate
            || session.principal_id != saved.session.principal_id
            || session.network_id != saved.session.network_id
            || session.expires_at < pending.original.session.expires_at
        {
            return Err(err("OWNED_SESSION_RENEWAL_INVALID"));
        }
        session.validate(&saved.instance)?;
        let updated = SavedAccount {
            device_id: saved.device_id.clone(),
            instance: saved.instance.clone(),
            session,
        };
        let bytes =
            Zeroizing::new(serde_json::to_vec(&updated).map_err(|_| err("OWNED_SESSION_INVALID"))?);
        // The authority has confirmed rotation. Retire old snapshots even if
        // durable publication fails; the staged candidate remains recoverable.
        self.retire_account_connections();
        self.write_checked("account", &bytes)?;
        self.saved = Some(updated);
        self.account_rejected = false;
        let clock = serde_json::to_vec(&Clock {
            account_hash: account_hash(self.saved.as_ref().unwrap())?,
            checked_at: jsonwebtoken::get_current_timestamp(),
        })
        .map_err(|_| err("MOBILE_SECURE_STORE_UNAVAILABLE"))?;
        self.write_checked(CLOCK, &clock)?;
        self.remove_checked(PENDING)
    }
    /// Inspect the staged token before validating the old bearer, which may
    /// already have expired after the server committed a lost renewal response.
    pub(super) async fn recover_account_renewal(&mut self) -> Result<(), NetworkError> {
        let Some(pending) = self.read_renewal()? else {
            return Ok(());
        };
        let saved = self
            .saved
            .as_ref()
            .ok_or_else(|| err("OWNED_LOGIN_REQUIRED"))?;
        pending.validate(&self.config.issuer, saved)?;
        let inspected = self
            .client
            .as_ref()
            .ok_or_else(|| err("OWNED_LOGIN_REQUIRED"))?
            .inspect_session_candidate(&saved.device_id, &pending.candidate)
            .await;
        match inspected {
            Ok(Some(session)) => {
                if session.principal_id != saved.session.principal_id
                    || session.network_id != saved.session.network_id
                    || session.expires_at < pending.original.session.expires_at
                {
                    return Err(err("OWNED_SESSION_RENEWAL_INVALID"));
                }
                let recovered = SavedAccount {
                    device_id: saved.device_id.clone(),
                    instance: saved.instance.clone(),
                    session,
                };
                let (identity, _) = self.identity_for_account(&recovered, true).await?;
                if identity.access.session_handle != pending.session_handle
                    || identity.scope.key_generation != pending.key_generation
                    || identity.device_key().public_fingerprint()? != pending.key_fingerprint
                {
                    return Err(err("OWNED_SESSION_RENEWAL_INVALID"));
                }
                self.finish_renewal(&pending, recovered.session)
            }
            Ok(None) => {
                // Both tokens are dead only after confirmed candidate rejection
                // and the original deadline. A network failure never gets here.
                if saved.session.expires_at <= jsonwebtoken::get_current_timestamp() {
                    self.remove_checked(PENDING)?;
                } else {
                    self.client
                        .as_ref()
                        .unwrap()
                        .validate_session(&saved.device_id, &saved.session)
                        .await?;
                }
                Ok(())
            }
            Err(error) => Err(error),
        }
    }
    pub(super) async fn account_identity(
        &self,
        existing_only: bool,
    ) -> Result<(NetworkIdentity, NetworkTransport), NetworkError> {
        if self.account_rejected {
            return Err(err("OWNED_SESSION_INVALID"));
        }
        let saved = self
            .saved
            .as_ref()
            .ok_or_else(|| err("OWNED_LOGIN_REQUIRED"))?;
        self.identity_for_account(saved, existing_only).await
    }
    async fn identity_for_account(
        &self,
        saved: &SavedAccount,
        existing_only: bool,
    ) -> Result<(NetworkIdentity, NetworkTransport), NetworkError> {
        self.client
            .as_ref()
            .ok_or_else(|| err("OWNED_LOGIN_REQUIRED"))?
            .validate_session(&saved.device_id, &saved.session)
            .await?;
        let guard = self.active.clone();
        let account = NetworkAccountSession::Owned(Arc::new(OwnedAccount {
            binding_id: uuid::Uuid::new_v4().to_string(),
            connection_id: uuid::Uuid::new_v4().to_string(),
            device_id: saved.device_id.clone(),
            session_bound: true,
            descriptor: saved.instance.clone(),
            active: self.active.clone(),
            session: saved.session.clone(),
            public_tls_ca: self.config.public_tls_ca.clone(),
            join_authorized: AtomicBool::new(false),
            guard: Arc::new(move || {
                if guard.load(Ordering::Acquire) {
                    Ok(())
                } else {
                    Err(err("ACCOUNT_BINDING_CHANGED"))
                }
            }),
        }));
        let identity = if existing_only {
            NetworkIdentity::initialize_existing(account, self.store.clone()).await?
        } else {
            NetworkIdentity::initialize_with_store(account, None, self.store.clone()).await?
        };
        let transport = NetworkTransport::new_with_public_ca(
            &identity.network_url,
            identity.device_key(),
            MemoryBudget::default(),
            identity.account.public_tls_ca(),
        )?;
        Ok((identity, transport))
    }
    pub(super) fn stage_account_renewal(
        &self,
        identity: &NetworkIdentity,
    ) -> Result<Renewal, NetworkError> {
        let saved = self
            .saved
            .as_ref()
            .ok_or_else(|| err("OWNED_LOGIN_REQUIRED"))?;
        let NetworkAccountSession::Owned(account) = &identity.account else {
            return Err(err("OWNED_SESSION_RENEWAL_INVALID"));
        };
        identity.account.ensure_current()?;
        if account.session.access_token != saved.session.access_token
            || account.session.principal_id != saved.session.principal_id
            || account.session.network_id != saved.session.network_id
            || account.device_id != saved.device_id
        {
            return Err(err("ACCOUNT_BINDING_CHANGED"));
        }
        let fingerprint = identity.device_key().public_fingerprint()?;
        if let Some(pending) = self.read_renewal()? {
            pending.validate(&self.config.issuer, saved)?;
            if pending.session_handle != identity.access.session_handle
                || pending.key_generation != identity.scope.key_generation
                || pending.key_fingerprint != fingerprint
            {
                return Err(err("OWNED_SESSION_RENEWAL_INVALID"));
            }
            return Ok(pending);
        }
        let seed = Zeroizing::new(format!("{}{}", uuid::Uuid::new_v4(), uuid::Uuid::new_v4()));
        let pending = Renewal {
            original: SavedAccount {
                device_id: saved.device_id.clone(),
                instance: saved.instance.clone(),
                session: saved.session.clone(),
            },
            candidate: URL_SAFE_NO_PAD.encode(Sha256::digest(seed.as_bytes())),
            session_handle: identity.access.session_handle.clone(),
            key_generation: identity.scope.key_generation,
            key_fingerprint: fingerprint,
        };
        let bytes = Zeroizing::new(
            serde_json::to_vec(&pending).map_err(|_| err("OWNED_SESSION_RENEWAL_INVALID"))?,
        );
        self.write_checked(PENDING, &bytes)?;
        Ok(pending)
    }
    pub(super) async fn renew_account(
        &mut self,
        identity: &NetworkIdentity,
        transport: &NetworkTransport,
    ) -> Result<(), NetworkError> {
        let pending = self.stage_account_renewal(identity)?;
        let renewed: SessionRenewal = transport
            .renew_session(&identity.token, &pending.candidate)
            .await?;
        renewed.validate(
            &pending.original.session.principal_id,
            &pending.original.device_id,
            &pending.original.session.network_id,
            &pending.session_handle,
            pending.original.session.expires_at,
            jsonwebtoken::get_current_timestamp(),
        )?;
        let session = OwnedSession {
            access_token: pending.candidate.clone(),
            expires_at: renewed.expires_at,
            principal_id: renewed.principal_id,
            network_id: renewed.network_id,
        };
        self.finish_renewal(&pending, session)
    }
    pub(super) async fn maintain_account(&mut self) -> Result<(), NetworkError> {
        if self.account_rejected {
            return Ok(());
        }
        if !self.renewal_due()? {
            return Ok(());
        }
        let saved = self.saved.as_ref().unwrap();
        // A status read never grants initial device enrollment. New logins use
        // their original explicit enrollment path before their first renewal.
        if self
            .store
            .read_record(&self.config.issuer, &format!("joined:{}", saved.device_id))
            .map_err(store_error)?
            .is_none()
        {
            return Ok(());
        }
        let (identity, transport) = self.account_identity(true).await?;
        self.renew_account(&identity, &transport).await
    }
    pub(super) async fn renew_enrolled_account(
        &mut self,
        identity: &mut NetworkIdentity,
        transport: &mut NetworkTransport,
    ) -> Result<(), NetworkError> {
        if self.renewal_due()? {
            self.renew_account(identity, transport).await?;
            (*identity, *transport) = self.account_identity(true).await?;
        }
        Ok(())
    }
    /// Logout must revoke the candidate even after the original bearer alias
    /// expired. Preserve the record if either request has an uncertain result.
    pub(super) async fn revoke_pending_account_renewal(&self) -> Result<(), NetworkError> {
        let Some(pending) = self.read_renewal()? else {
            return Ok(());
        };
        pending.validate(
            &self.config.issuer,
            self.saved.as_ref().unwrap_or(&pending.original),
        )?;
        let client = OwnedClient::pinned(
            pending.original.instance.clone(),
            self.config.public_tls_ca.as_deref(),
        )?;
        let candidate = client.logout(&pending.candidate).await;
        let original = client.logout(&pending.original.session.access_token).await;
        candidate?;
        original?;
        self.remove_checked(PENDING)?;
        self.remove_checked(CLOCK)
    }
    pub(super) async fn validate_current_account(&mut self) -> Result<(), NetworkError> {
        let Some(saved) = self.saved.as_ref() else {
            return Ok(());
        };
        if self.account_rejected
            || saved.session.expires_at <= jsonwebtoken::get_current_timestamp()
        {
            return Ok(());
        }
        let client = self
            .client
            .as_ref()
            .ok_or_else(|| err("OWNED_LOGIN_REQUIRED"))?;
        match client
            .inspect_session_candidate(&saved.device_id, &saved.session.access_token)
            .await?
        {
            Some(session)
                if session.principal_id == saved.session.principal_id
                    && session.network_id == saved.session.network_id
                    && session.expires_at == saved.session.expires_at =>
            {
                Ok(())
            }
            Some(_) => Err(err("OWNED_SESSION_INVALID")),
            None => {
                self.retire_account_connections();
                self.account_rejected = true;
                Ok(())
            }
        }
    }
    pub(super) async fn renewal_notification_account(
        &self,
    ) -> Result<Option<SavedAccount>, NetworkError> {
        let Some(pending) = self.read_renewal()? else {
            return Ok(None);
        };
        pending.validate(
            &self.config.issuer,
            self.saved.as_ref().unwrap_or(&pending.original),
        )?;
        let client = OwnedClient::pinned(
            pending.original.instance.clone(),
            self.config.public_tls_ca.as_deref(),
        )?;
        let Some(session) = client
            .inspect_session_candidate(&pending.original.device_id, &pending.candidate)
            .await?
        else {
            return Ok(None);
        };
        if session.principal_id != pending.original.session.principal_id
            || session.network_id != pending.original.session.network_id
            || session.expires_at < pending.original.session.expires_at
        {
            return Err(err("OWNED_SESSION_RENEWAL_INVALID"));
        }
        Ok(Some(SavedAccount {
            device_id: pending.original.device_id.clone(),
            instance: pending.original.instance.clone(),
            session,
        }))
    }
}

#[cfg(test)]
#[path = "renewal_tests.rs"]
mod tests;
