//! Generic, identity-scoped pointers only. This owner never starts or mutates a Session.
use super::NetworkError;
use myagents_agent_network_protocol::{ConnectionScope, DeviceScope};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
#[cfg(unix)]
use std::fs::File;

use std::{
    fs::{self, OpenOptions},
    io::{Read, Write},
    path::{Path, PathBuf},
    sync::Mutex,
};

const TTL: u64 = 86_400;
const MAX_PENDING: usize = 128;
const MAX_CONFIRMED: usize = 512;
const MAX_DISK_BYTES: u64 = 512 * 1024;

#[derive(Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(in crate::agent_network) struct SourceScope {
    pub issuer: String,
    pub local: DeviceScope,
    pub account_binding: String,
}

#[derive(Clone)]
pub(in crate::agent_network) struct Activation {
    pub scope: SourceScope,
    pub connection: ConnectionScope,
    pub generation: u64,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(in crate::agent_network) struct Observation {
    pub source_event_id: String,
    pub session_id: String,
    pub workspace_path: PathBuf,
    key: String,
    created_at: u64,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Confirmed {
    source_event_id: String,
    event_id: String,
    key: String,
    created_at: u64,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Disk {
    version: u8,
    scope: String,
    pending: Vec<Observation>,
    confirmed: Vec<Confirmed>,
}

/// Transport reconnects may resume an unacknowledged pointer only under the
/// same full identity/account scope. Its source ID is unchanged; publication
/// proves the *current* connection epoch, never a retired socket or bearer.
pub(in crate::agent_network) struct DesktopNotificationSource {
    root: Option<PathBuf>,
    active: Mutex<Option<Activation>>,
    disk_gate: Mutex<()>,
}

fn failure() -> NetworkError {
    NetworkError::new("DESKTOP_NOTIFICATION_SOURCE_UNAVAILABLE")
}
fn uuid(value: &str) -> bool {
    uuid::Uuid::parse_str(value).is_ok_and(|id| id.to_string() == value)
}
fn digest(value: &impl Serialize) -> Result<String, NetworkError> {
    let bytes = serde_json::to_vec(value).map_err(|_| failure())?;
    Ok(format!("{:x}", Sha256::digest(bytes)))
}
fn valid_key(value: &str) -> bool {
    value.len() == 64
        && value
            .bytes()
            .all(|b| b.is_ascii_hexdigit() && !b.is_ascii_uppercase())
}
fn now() -> u64 {
    jsonwebtoken::get_current_timestamp()
}

impl DesktopNotificationSource {
    pub fn new(root: Option<PathBuf>) -> Self {
        Self {
            root,
            active: Mutex::new(None),
            disk_gate: Mutex::new(()),
        }
    }

    pub fn activate(&self, activation: Activation) -> Result<(), NetworkError> {
        let a = &activation;
        if self.root.is_none()
            || a.scope.issuer.is_empty()
            || a.scope.issuer.len() > 4096
            || a.scope.account_binding.is_empty()
            || a.scope.account_binding.len() > 256
            || a.scope.local.service_id != a.connection.service_id
            || a.scope.local.network_id != a.connection.network_id
            || !uuid(&a.connection.connection_epoch)
        {
            return Err(failure());
        }
        *self.active.lock().map_err(|_| failure())? = Some(activation);
        Ok(())
    }

    pub fn deactivate(&self, expected: &Activation) {
        if let Ok(mut active) = self.active.lock() {
            if active.as_ref().is_some_and(|a| {
                a.generation == expected.generation
                    && a.scope == expected.scope
                    && a.connection == expected.connection
            }) {
                *active = None;
            }
        }
    }

    pub fn capture(&self) -> Option<Activation> {
        self.active.lock().ok()?.clone()
    }

    pub fn current(&self, expected: &Activation) -> bool {
        self.capture().is_some_and(|a| {
            a.scope == expected.scope
                && a.generation == expected.generation
                && a.connection == expected.connection
        })
    }

    fn private_root(&self) -> Result<&Path, NetworkError> {
        let root = self.root.as_deref().ok_or_else(failure)?;
        let mut builder = fs::DirBuilder::new();
        builder.recursive(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::DirBuilderExt;
            builder.mode(0o700);
        }
        builder.create(root).map_err(|_| failure())?;
        let meta = fs::symlink_metadata(root).map_err(|_| failure())?;
        if !meta.is_dir() || meta.file_type().is_symlink() {
            return Err(failure());
        }
        #[cfg(unix)]
        {
            use std::os::unix::fs::MetadataExt;
            // SAFETY: geteuid has no pointer arguments or side effects.
            if meta.mode() & 0o777 != 0o700 || meta.uid() != unsafe { libc::geteuid() } {
                return Err(failure());
            }
        }
        Ok(root)
    }

    fn path(&self, scope: &SourceScope) -> Result<PathBuf, NetworkError> {
        Ok(self
            .private_root()?
            .join(format!("{}.json", digest(scope)?)))
    }

    fn read(&self, scope: &SourceScope) -> Result<Disk, NetworkError> {
        let path = self.path(scope)?;
        let scope_key = digest(scope)?;
        let mut options = OpenOptions::new();
        options.read(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.custom_flags(libc::O_NOFOLLOW);
        }
        let file = match options.open(path) {
            Ok(file) => file,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                return Ok(Disk {
                    version: 1,
                    scope: scope_key,
                    pending: Vec::new(),
                    confirmed: Vec::new(),
                })
            }
            Err(_) => return Err(failure()),
        };
        let meta = file.metadata().map_err(|_| failure())?;
        if !meta.is_file() || meta.len() > MAX_DISK_BYTES {
            return Err(failure());
        }
        #[cfg(unix)]
        {
            use std::os::unix::fs::MetadataExt;
            // SAFETY: geteuid has no pointer arguments or side effects.
            if meta.mode() & 0o777 != 0o600
                || meta.nlink() != 1
                || meta.uid() != unsafe { libc::geteuid() }
            {
                return Err(failure());
            }
        }
        let mut bytes = Vec::new();
        file.take(MAX_DISK_BYTES + 1)
            .read_to_end(&mut bytes)
            .map_err(|_| failure())?;
        if bytes.len() as u64 > MAX_DISK_BYTES {
            return Err(failure());
        }
        let disk: Disk = serde_json::from_slice(&bytes).map_err(|_| failure())?;
        if disk.version != 1
            || disk.scope != scope_key
            || disk.pending.len() > MAX_PENDING
            || disk.confirmed.len() > MAX_CONFIRMED
            || disk.pending.iter().any(|i| {
                !uuid(&i.source_event_id)
                    || !uuid(&i.session_id)
                    || !i.workspace_path.is_absolute()
                    || i.workspace_path.as_os_str().len() > 8192
                    || !valid_key(&i.key)
                    || i.created_at > now()
            })
            || disk.confirmed.iter().any(|i| {
                !uuid(&i.source_event_id)
                    || !uuid(&i.event_id)
                    || !valid_key(&i.key)
                    || i.created_at > now()
            })
        {
            return Err(failure());
        }
        Ok(disk)
    }

    fn write(&self, scope: &SourceScope, disk: &Disk) -> Result<(), NetworkError> {
        let path = self.path(scope)?;
        let temporary = path.with_extension(format!("{}.tmp", uuid::Uuid::new_v4()));
        let bytes = serde_json::to_vec(disk).map_err(|_| failure())?;
        if bytes.len() as u64 > MAX_DISK_BYTES {
            return Err(failure());
        }
        let outcome = (|| {
            let mut options = OpenOptions::new();
            options.write(true).create_new(true);
            #[cfg(unix)]
            {
                use std::os::unix::fs::OpenOptionsExt;
                options.mode(0o600);
            }
            let mut file = options.open(&temporary).map_err(|_| failure())?;
            file.write_all(&bytes)
                .and_then(|()| file.sync_all())
                .map_err(|_| failure())?;
            drop(file);
            fs::rename(&temporary, &path).map_err(|_| failure())?;
            #[cfg(unix)]
            File::open(self.private_root()?)
                .and_then(|file| file.sync_all())
                .map_err(|_| failure())?;
            Ok(())
        })();
        if outcome.is_err() {
            let _ = fs::remove_file(temporary);
        }
        outcome
    }

    pub fn observe(
        &self,
        expected: &Activation,
        session_id: &str,
        workspace: &Path,
        observation: &str,
    ) -> Result<(), NetworkError> {
        self.observe_guarded(expected, session_id, workspace, observation, || true)
    }

    pub fn observe_guarded(
        &self,
        expected: &Activation,
        session_id: &str,
        workspace: &Path,
        observation: &str,
        still_original: impl Fn() -> bool,
    ) -> Result<(), NetworkError> {
        if !uuid(session_id)
            || !workspace.is_absolute()
            || workspace.as_os_str().len() > 8192
            || observation.is_empty()
            || observation.len() > 1024
        {
            return Err(failure());
        }
        let _gate = self.disk_gate.lock().map_err(|_| failure())?;
        if !self.current(expected) || !still_original() {
            return Err(failure());
        }
        let mut disk = self.read(&expected.scope)?;
        let at = now();
        disk.pending
            .retain(|i| at.saturating_sub(i.created_at) < TTL);
        disk.confirmed
            .retain(|i| at.saturating_sub(i.created_at) < TTL);
        let key = digest(&(session_id, observation))?;
        if disk.pending.iter().any(|i| i.key == key) || disk.confirmed.iter().any(|i| i.key == key)
        {
            return Ok(());
        }
        if disk.pending.len() >= MAX_PENDING {
            return Err(NetworkError::new("DESKTOP_NOTIFICATION_SOURCE_CAPACITY"));
        }
        disk.pending.push(Observation {
            source_event_id: uuid::Uuid::new_v4().to_string(),
            session_id: session_id.into(),
            workspace_path: workspace.into(),
            key,
            created_at: at,
        });
        if !self.current(expected) || !still_original() {
            return Err(failure());
        }
        self.write(&expected.scope, &disk)
    }

    #[cfg(test)]
    pub fn peek(&self, expected: &Activation) -> Result<Option<Observation>, NetworkError> {
        Ok(self.candidates(expected)?.into_iter().next())
    }

    pub fn candidates(&self, expected: &Activation) -> Result<Vec<Observation>, NetworkError> {
        let _gate = self.disk_gate.lock().map_err(|_| failure())?;
        if !self.current(expected) {
            return Err(failure());
        }
        Ok(self
            .read(&expected.scope)?
            .pending
            .into_iter()
            .filter(|i| now().saturating_sub(i.created_at) < TTL)
            .collect())
    }

    pub fn acknowledge(
        &self,
        expected: &Activation,
        item: &Observation,
        event_id: &str,
    ) -> Result<(), NetworkError> {
        if !uuid(event_id) {
            return Err(failure());
        }
        let _gate = self.disk_gate.lock().map_err(|_| failure())?;
        if !self.current(expected) {
            return Err(failure());
        }
        let mut disk = self.read(&expected.scope)?;
        if let Some(prior) = disk
            .confirmed
            .iter()
            .find(|i| i.source_event_id == item.source_event_id)
        {
            return if prior.event_id == event_id {
                Ok(())
            } else {
                Err(failure())
            };
        }
        let index = disk
            .pending
            .iter()
            .position(|i| i.source_event_id == item.source_event_id && i.key == item.key)
            .ok_or_else(failure)?;
        let item = disk.pending.remove(index);
        disk.confirmed.push(Confirmed {
            source_event_id: item.source_event_id,
            event_id: event_id.into(),
            key: item.key,
            created_at: item.created_at,
        });
        if disk.confirmed.len() > MAX_CONFIRMED {
            disk.confirmed.remove(0);
        }
        if !self.current(expected) {
            return Err(failure());
        }
        self.write(&expected.scope, &disk)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    struct Fixture {
        root: PathBuf,
        active: Activation,
    }
    impl Fixture {
        fn new() -> Self {
            let local = DeviceScope {
                service_id: uuid::Uuid::new_v4().to_string(),
                environment: "development".into(),
                network_id: uuid::Uuid::new_v4().to_string(),
                principal_id: uuid::Uuid::new_v4().to_string(),
                device_id: uuid::Uuid::new_v4().to_string(),
                key_generation: 1,
            };
            let connection = ConnectionScope {
                service_id: local.service_id.clone(),
                network_id: local.network_id.clone(),
                boot_epoch: uuid::Uuid::new_v4().to_string(),
                connection_epoch: uuid::Uuid::new_v4().to_string(),
            };
            Self {
                root: std::env::temp_dir()
                    .join(format!("desktop-source-test-{}", uuid::Uuid::new_v4())),
                active: Activation {
                    scope: SourceScope {
                        issuer: "https://desktop-source.test".into(),
                        local,
                        account_binding: uuid::Uuid::new_v4().to_string(),
                    },
                    connection,
                    generation: 7,
                },
            }
        }
        fn open(&self) -> DesktopNotificationSource {
            let source = DesktopNotificationSource::new(Some(self.root.clone()));
            source.activate(self.active.clone()).unwrap();
            source
        }
    }
    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.root);
        }
    }
    fn sid() -> String {
        uuid::Uuid::new_v4().to_string()
    }

    #[test]
    fn unacknowledged_source_survives_restart_and_reconnect_without_changing_event_id() {
        let f = Fixture::new();
        let source = f.open();
        let session = sid();
        source
            .observe(&f.active, &session, &f.root, "terminal:turn-a")
            .unwrap();
        source
            .observe(&f.active, &session, &f.root, "terminal:turn-a")
            .unwrap();
        let first = source.peek(&f.active).unwrap().unwrap();
        drop(source);
        let restored = f.open();
        let mut reconnected = f.active.clone();
        reconnected.generation += 1;
        reconnected.connection.connection_epoch = sid();
        restored.activate(reconnected.clone()).unwrap();
        assert!(!restored.current(&f.active));
        assert!(restored.peek(&f.active).is_err());
        let second = restored.peek(&reconnected).unwrap().unwrap();
        assert_eq!(first.source_event_id, second.source_event_id);
        let confirmation = sid();
        restored
            .acknowledge(&reconnected, &second, &confirmation)
            .unwrap();
        assert!(restored.peek(&reconnected).unwrap().is_none());
        restored
            .observe(&reconnected, &session, &f.root, "terminal:turn-a")
            .unwrap();
        assert!(restored.peek(&reconnected).unwrap().is_none());
        assert!(restored.acknowledge(&reconnected, &second, &sid()).is_err());
    }

    #[test]
    fn account_device_key_and_network_boundaries_cannot_adopt_pending_pointers() {
        let f = Fixture::new();
        let source = f.open();
        source
            .observe(&f.active, &sid(), &f.root, "terminal:a")
            .unwrap();
        for index in 0..6 {
            let mut other = f.active.clone();
            match index {
                0 => other.scope.account_binding = sid(),
                1 => other.scope.local.device_id = sid(),
                2 => other.scope.local.key_generation += 1,
                3 => other.scope.local.principal_id = sid(),
                4 => {
                    other.scope.local.network_id = sid();
                    other.connection.network_id = other.scope.local.network_id.clone();
                }
                _ => other.scope.issuer = "https://another-issuer.test".into(),
            }
            source.activate(other.clone()).unwrap();
            assert!(source.peek(&other).unwrap().is_none());
            assert!(source
                .observe(&f.active, &sid(), &f.root, "terminal:b")
                .is_err());
        }
        source.activate(f.active.clone()).unwrap();
        source.deactivate(&f.active);
        assert!(source.peek(&f.active).is_err());
        assert!(source
            .observe(&f.active, &sid(), &f.root, "terminal:c")
            .is_err());
    }

    #[test]
    fn stale_connection_cleanup_cannot_deactivate_successor() {
        let f = Fixture::new();
        let source = f.open();
        let mut next = f.active.clone();
        next.connection.connection_epoch = sid();
        source.activate(next.clone()).unwrap();
        source.deactivate(&f.active);
        assert!(source.current(&next));
        next.generation += 1;
        source.activate(next.clone()).unwrap();
        source.deactivate(&f.active);
        assert!(source.current(&next));
    }

    #[test]
    fn activation_requires_an_available_private_store() {
        let f = Fixture::new();
        let source = DesktopNotificationSource::new(None);
        assert!(source.activate(f.active.clone()).is_err());
        assert!(source.capture().is_none());
    }

    #[test]
    fn pending_original_generation_must_survive_until_durable_handoff() {
        let f = Fixture::new();
        let source = f.open();
        let reads = std::cell::Cell::new(0);
        let result =
            source.observe_guarded(&f.active, &sid(), &f.root, "interactive:original", || {
                let count = reads.get();
                reads.set(count + 1);
                count == 0
            });
        assert!(result.is_err());
        assert_eq!(reads.get(), 2);
        assert!(source.peek(&f.active).unwrap().is_none());
    }

    #[test]
    fn explicit_capacity_failure_does_not_discard_unacknowledged_observations() {
        let f = Fixture::new();
        let source = f.open();
        let session = sid();
        for i in 0..MAX_PENDING {
            source
                .observe(&f.active, &session, &f.root, &format!("terminal:{i}"))
                .unwrap();
        }
        let first = source.peek(&f.active).unwrap().unwrap();
        assert_eq!(
            source
                .observe(&f.active, &session, &f.root, "terminal:overflow")
                .unwrap_err()
                .code,
            "DESKTOP_NOTIFICATION_SOURCE_CAPACITY"
        );
        assert_eq!(
            first.source_event_id,
            source.peek(&f.active).unwrap().unwrap().source_event_id
        );
        let bytes = fs::read(source.path(&f.active.scope).unwrap()).unwrap();
        let disk: Disk = serde_json::from_slice(&bytes).unwrap();
        assert_eq!(disk.pending.len(), MAX_PENDING);
    }

    #[test]
    fn corrupted_storage_fails_closed_without_overwriting_original_bytes() {
        let f = Fixture::new();
        let source = f.open();
        source
            .observe(&f.active, &sid(), &f.root, "terminal:a")
            .unwrap();
        let path = source.path(&f.active.scope).unwrap();
        fs::write(&path, b"broken").unwrap();
        assert!(source.peek(&f.active).is_err());
        assert!(source
            .observe(&f.active, &sid(), &f.root, "terminal:b")
            .is_err());
        assert_eq!(fs::read(path).unwrap(), b"broken");
    }

    #[cfg(unix)]
    #[test]
    fn private_storage_rejects_symlinks_hardlinks_and_permissive_files() {
        use std::os::unix::fs::{symlink, PermissionsExt};
        let f = Fixture::new();
        let source = f.open();
        source
            .observe(&f.active, &sid(), &f.root, "terminal:a")
            .unwrap();
        let path = source.path(&f.active.scope).unwrap();
        fs::set_permissions(&path, fs::Permissions::from_mode(0o644)).unwrap();
        assert!(source.peek(&f.active).is_err());
        fs::set_permissions(&path, fs::Permissions::from_mode(0o600)).unwrap();
        let backup = path.with_extension("backup");
        fs::hard_link(&path, &backup).unwrap();
        assert!(source.peek(&f.active).is_err());
        fs::remove_file(&backup).unwrap();
        fs::rename(&path, &backup).unwrap();
        symlink(&backup, &path).unwrap();
        assert!(source.peek(&f.active).is_err());
    }
}
