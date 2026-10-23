//! Resumable transport only. updater.rs owns admission, UI state and publication;
//! an incomplete file can never become an installable pending package here.
use base64::{engine::general_purpose::STANDARD, Engine as _};
use minisign_verify::{PublicKey, Signature};
use reqwest::{header, Client, StatusCode, Url};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs::{self, File, OpenOptions};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

pub(crate) const MAX_ATTEMPTS: u32 = 3;
const MAX_BYTES: u64 = 2 * 1024 * 1024 * 1024;
const META_FILE: &str = "updater.partial.json";
const DATA_FILE: &str = "updater.partial.bin";
const WRITE_BUFFER: usize = 256 * 1024;

#[derive(Clone)]
pub(crate) struct Artifact {
    pub target: String,
    pub version: String,
    pub url: Url,
    pub signature: String,
    pub public_key: String,
    pub headers: header::HeaderMap,
}

#[derive(Clone, Debug)]
pub(crate) struct Failure {
    pub code: &'static str,
    pub message: String,
    pub retryable: bool,
}
impl Failure {
    pub(crate) fn new(code: &'static str, message: impl Into<String>, retryable: bool) -> Self {
        Self {
            code,
            message: message.into(),
            retryable,
        }
    }
    fn disk() -> Self {
        Self::new("disk", "无法保存更新文件，请检查磁盘空间和文件权限。", true)
    }
    fn range() -> Self {
        Self::new(
            "range",
            "更新服务器返回了不一致的文件范围，请重新下载。",
            true,
        )
    }
}

#[derive(Clone, Debug)]
pub(crate) struct Progress {
    pub downloaded: u64,
    pub total: Option<u64>,
    pub bytes_per_second: Option<u64>,
    pub attempt: u32,
    pub retry_at_ms: Option<u64>,
    pub failure: Option<Failure>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct PartialMeta {
    format: u32,
    identity: String,
    version: String,
    total: Option<u64>,
}

#[derive(Clone)]
pub(crate) struct Policy {
    pub idle_timeout: Duration,
    pub retry_delay: Duration,
    pub max_attempts: u32,
}
impl Default for Policy {
    fn default() -> Self {
        Self {
            idle_timeout: Duration::from_secs(30),
            retry_delay: Duration::from_secs(1),
            max_attempts: MAX_ATTEMPTS,
        }
    }
}

fn regular(path: &Path) -> Result<Option<u64>, Failure> {
    match fs::symlink_metadata(path) {
        Ok(meta) if meta.file_type().is_file() => {
            #[cfg(windows)]
            {
                use std::os::windows::fs::MetadataExt;
                if meta.file_attributes() & 0x400 != 0 {
                    return Err(Failure::disk());
                }
            }
            Ok(Some(meta.len()))
        }
        Ok(_) => Err(Failure::disk()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(_) => Err(Failure::disk()),
    }
}

fn open_regular(path: &Path, truncate: bool) -> Result<File, Failure> {
    regular(path)?;
    let mut options = OpenOptions::new();
    options
        .create(true)
        .read(true)
        .write(true)
        .truncate(truncate);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.custom_flags(libc::O_NOFOLLOW).mode(0o600);
    }
    #[cfg(windows)]
    {
        use std::os::windows::fs::OpenOptionsExt;
        options.custom_flags(0x00200000); // FILE_FLAG_OPEN_REPARSE_POINT
    }
    let file = options.open(path).map_err(|_| Failure::disk())?;
    let metadata = file.metadata().map_err(|_| Failure::disk())?;
    if !metadata.is_file() {
        return Err(Failure::disk());
    }
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        if metadata.file_attributes() & 0x400 != 0 {
            return Err(Failure::disk());
        }
    }
    Ok(file)
}

fn write_meta(dir: &Path, meta: &PartialMeta) -> Result<(), Failure> {
    regular(&dir.join(META_FILE))?;
    let temp = dir.join("updater.partial.json.tmp");
    let mut file = open_regular(&temp, true)?;
    let bytes = serde_json::to_vec(meta).map_err(|_| Failure::disk())?;
    file.write_all(&bytes)
        .and_then(|_| file.sync_all())
        .map_err(|_| Failure::disk())?;
    drop(file);
    fs::rename(temp, dir.join(META_FILE)).map_err(|_| Failure::disk())?;
    Ok(())
}

pub(crate) fn clear_partial(dir: &Path) -> Result<(), Failure> {
    for name in [DATA_FILE, META_FILE, "updater.partial.json.tmp"] {
        let path = dir.join(name);
        // Never follow or delete directories, junctions or symlinks supplied by
        // another actor. Surface an actionable disk failure instead.
        if regular(&path)?.is_some() {
            fs::remove_file(path).map_err(|_| Failure::disk())?;
        }
    }
    Ok(())
}

fn read_meta(dir: &Path) -> Result<Option<PartialMeta>, Failure> {
    let Some(len) = regular(&dir.join(META_FILE))? else {
        return Ok(None);
    };
    if len > 16 * 1024 {
        return Ok(None);
    }
    let mut file = open_regular(&dir.join(META_FILE), false)?;
    let mut bytes = Vec::new();
    Read::by_ref(&mut file)
        .take(16 * 1024 + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| Failure::disk())?;
    let meta: PartialMeta = match serde_json::from_slice(&bytes) {
        Ok(meta) => meta,
        Err(_) => return Ok(None),
    };
    if meta.format != 1
        || meta.identity.len() != 64
        || meta.version.len() > 512
        || meta
            .total
            .is_some_and(|total| total == 0 || total > MAX_BYTES)
    {
        return Ok(None);
    }
    Ok(Some(meta))
}

pub(crate) fn recovered_partial(dir: &Path) -> Result<Option<(String, u64, Option<u64>)>, Failure> {
    let Some(meta) = read_meta(dir)? else {
        return Ok(None);
    };
    let Some(length) = regular(&dir.join(DATA_FILE))? else {
        return Ok(None);
    };
    if length == 0 || length > MAX_BYTES || meta.total.is_some_and(|total| length > total) {
        return Ok(None);
    }
    Ok(Some((meta.version, length, meta.total)))
}

fn prepare(dir: &Path, artifact: &Artifact) -> Result<PartialMeta, Failure> {
    if artifact.version.len() > 512
        || artifact.target.len() > 128
        || artifact.url.as_str().len() > 8192
        || artifact.signature.len() > 16 * 1024
        || artifact.public_key.len() > 4096
        || !matches!(artifact.url.scheme(), "http" | "https")
    {
        return Err(Failure::new(
            "manifest",
            "更新清单中的文件信息无效。",
            false,
        ));
    }
    let identity = format!(
        "{:x}",
        Sha256::digest(
            serde_json::to_vec(&(
                &artifact.target,
                &artifact.version,
                artifact.url.as_str(),
                &artifact.signature,
                &artifact.public_key
            ))
            .map_err(|_| Failure::new("manifest", "更新清单无效。", false))?
        )
    );
    fs::create_dir_all(dir).map_err(|_| Failure::disk())?;
    if let Some(meta) = read_meta(dir)? {
        if meta.identity == identity {
            let length = regular(&dir.join(DATA_FILE))?.unwrap_or(0);
            if length <= MAX_BYTES && !meta.total.is_some_and(|total| length > total) {
                return Ok(meta);
            }
        }
    }
    clear_partial(dir)?;
    let meta = PartialMeta {
        format: 1,
        identity,
        version: artifact.version.clone(),
        total: None,
    };
    write_meta(dir, &meta)?;
    Ok(meta)
}

fn content_range(value: &str) -> Option<(u64, u64, u64)> {
    let value = value.strip_prefix("bytes ")?;
    let (span, total) = value.split_once('/')?;
    let (start, end) = span.split_once('-')?;
    let (start, end, total) = (start.parse().ok()?, end.parse().ok()?, total.parse().ok()?);
    if start <= end && end < total && total <= MAX_BYTES {
        Some((start, end, total))
    } else {
        None
    }
}

fn response_layout(
    status: StatusCode,
    headers: &header::HeaderMap,
    offset: u64,
    previous_total: Option<u64>,
) -> Result<(bool, Option<u64>), Failure> {
    // Content-Encoding changes the byte coordinate system; requests explicitly
    // ask for identity, so reject a server/proxy that ignores it.
    if headers
        .get(header::CONTENT_ENCODING)
        .is_some_and(|value| value != "identity")
    {
        return Err(Failure::range());
    }
    let length = headers.get(header::CONTENT_LENGTH).map(|value| {
        value
            .to_str()
            .ok()
            .and_then(|value| value.parse::<u64>().ok())
    });
    if length == Some(None) {
        return Err(Failure::range());
    }
    let length = length.flatten();
    if length.is_some_and(|length| length == 0 || length > MAX_BYTES) {
        return Err(Failure::range());
    }
    if status == StatusCode::OK {
        // Range ignored: ALWAYS restart the file, never append a full response.
        return Ok((true, length));
    }
    if status == StatusCode::PARTIAL_CONTENT {
        let (start, end, total) = headers
            .get(header::CONTENT_RANGE)
            .and_then(|value| value.to_str().ok())
            .and_then(content_range)
            .ok_or_else(Failure::range)?;
        if start != offset
            || end != total - 1
            || previous_total.is_some_and(|old| old != total)
            || length.is_some_and(|length| length != end - start + 1)
        {
            return Err(Failure::range());
        }
        return Ok((false, Some(total)));
    }
    Err(Failure::new(
        "http",
        format!("更新文件请求失败（HTTP {}）。", status.as_u16()),
        status.is_server_error() || status == StatusCode::TOO_MANY_REQUESTS,
    ))
}

async fn persist(mut file: File, buffer: Vec<u8>, sync: bool) -> Result<File, Failure> {
    tokio::task::spawn_blocking(move || {
        file.write_all(&buffer).map_err(|_| Failure::disk())?;
        if sync {
            file.sync_all().map_err(|_| Failure::disk())?;
        }
        Ok(file)
    })
    .await
    .map_err(|_| Failure::disk())?
}

async fn transfer<F: FnMut(Progress)>(
    client: &Client,
    dir: &Path,
    artifact: &Artifact,
    meta: &mut PartialMeta,
    policy: &Policy,
    attempt: u32,
    progress: &mut F,
) -> Result<(), Failure> {
    use std::io::{Seek, SeekFrom};
    let offset = regular(&dir.join(DATA_FILE))?.unwrap_or(0);
    progress(Progress {
        downloaded: offset,
        total: meta.total,
        bytes_per_second: None,
        attempt,
        retry_at_ms: None,
        failure: None,
    });
    let mut request = client
        .get(artifact.url.clone())
        .headers(artifact.headers.clone())
        .header(header::ACCEPT, "application/octet-stream")
        .header(header::ACCEPT_ENCODING, "identity");
    if offset > 0 {
        request = request.header(header::RANGE, format!("bytes={offset}-"));
    }
    let mut response = tokio::time::timeout(policy.idle_timeout, request.send())
        .await
        .map_err(|_| Failure::new("timeout", "连接更新服务器超时，将保留已下载内容。", true))?
        .map_err(|error| {
            if error.is_timeout() {
                Failure::new("timeout", "连接更新服务器超时，将保留已下载内容。", true)
            } else if error.is_connect() {
                Failure::new(
                    "network",
                    "无法连接更新服务器，请检查网络或代理设置。",
                    true,
                )
            } else {
                Failure::new(
                    "network",
                    "更新服务器未返回有效响应，将保留已下载内容。",
                    true,
                )
            }
        })?;
    if response.status() == StatusCode::RANGE_NOT_SATISFIABLE {
        let total = response
            .headers()
            .get(header::CONTENT_RANGE)
            .and_then(|value| value.to_str().ok())
            .and_then(|value| value.strip_prefix("bytes */"))
            .and_then(|value| value.parse::<u64>().ok());
        if offset > 0 && total == Some(offset) && meta.total == Some(offset) {
            return Ok(());
        }
        // Unknown or inconsistent 416 must never authorize completion. Clear it
        // so the bounded retry starts a new response from byte zero.
        clear_partial(dir)?;
        meta.total = None;
        write_meta(dir, meta)?;
        return Err(Failure::range());
    }
    let (restart, total) =
        match response_layout(response.status(), response.headers(), offset, meta.total) {
            Ok(layout) => layout,
            Err(error) => {
                if error.code == "range" {
                    clear_partial(dir)?;
                    meta.total = None;
                    write_meta(dir, meta)?;
                }
                return Err(error);
            }
        };
    let mut file = open_regular(&dir.join(DATA_FILE), restart)?;
    file.seek(SeekFrom::End(0)).map_err(|_| Failure::disk())?;
    let base = if restart { 0 } else { offset };
    meta.total = total;
    write_meta(dir, meta)?;
    let mut downloaded = base;
    let started = Instant::now();
    let mut last_progress = Instant::now();
    let mut buffer = Vec::with_capacity(WRITE_BUFFER);
    loop {
        let read = tokio::time::timeout(policy.idle_timeout, response.chunk()).await;
        let chunk = match read {
            Ok(Ok(Some(chunk))) => chunk,
            other => {
                // Flush accumulated bytes even on a dropped/stalled stream.
                persist(file, buffer, true).await?;
                progress(Progress {
                    downloaded,
                    total,
                    bytes_per_second: None,
                    attempt,
                    retry_at_ms: None,
                    failure: None,
                });
                return match other {
                    Ok(Ok(None))
                        if total.is_none_or(|total| total == downloaded) && downloaded > 0 =>
                    {
                        Ok(())
                    }
                    Ok(Ok(None)) => Err(Failure::new(
                        "network",
                        "更新文件未下载完整，将继续下载。",
                        true,
                    )),
                    Err(_) => Err(Failure::new(
                        "timeout",
                        "更新下载暂时无响应，将保留已下载内容。",
                        true,
                    )),
                    _ => Err(Failure::new(
                        "network",
                        "更新连接中断，将保留已下载内容。",
                        true,
                    )),
                };
            }
        };
        let next = downloaded
            .checked_add(chunk.len() as u64)
            .ok_or_else(Failure::range)?;
        if next > MAX_BYTES || total.is_some_and(|total| next > total) {
            drop(file);
            clear_partial(dir)?;
            meta.total = None;
            write_meta(dir, meta)?;
            return Err(Failure::range());
        }
        buffer.extend_from_slice(&chunk);
        downloaded = next;
        if buffer.len() >= WRITE_BUFFER || last_progress.elapsed() >= Duration::from_millis(500) {
            last_progress = Instant::now();
            file = persist(
                file,
                std::mem::replace(&mut buffer, Vec::with_capacity(WRITE_BUFFER)),
                false,
            )
            .await?;
            let seconds = started.elapsed().as_secs_f64();
            progress(Progress {
                downloaded,
                total,
                bytes_per_second: Some(((downloaded - base) as f64 / seconds.max(0.001)) as u64),
                attempt,
                retry_at_ms: None,
                failure: None,
            });
        }
    }
}

fn verify_file(path: &Path, artifact: &Artifact) -> Result<(), Failure> {
    let invalid = || Failure::new("signature", "更新文件签名校验失败，请重新下载。", true);
    let decode = |value: &str| {
        STANDARD
            .decode(value)
            .ok()
            .and_then(|bytes| String::from_utf8(bytes).ok())
    };
    let key = decode(&artifact.public_key)
        .and_then(|value| PublicKey::decode(&value).ok())
        .ok_or_else(invalid)?;
    let signature = decode(&artifact.signature)
        .and_then(|value| Signature::decode(&value).ok())
        .ok_or_else(invalid)?;
    let mut file = open_regular(path, false)?;
    match key.verify_stream(&signature) {
        Ok(mut verifier) => {
            let mut buffer = [0_u8; 64 * 1024];
            loop {
                let size = file.read(&mut buffer).map_err(|_| Failure::disk())?;
                if size == 0 {
                    break;
                }
                verifier.update(&buffer[..size]);
            }
            verifier.finalize().map_err(|_| invalid())
        }
        // Legacy signatures cannot stream. Bound this compatibility path; modern
        // updater artifacts use prehashed minisign and retain constant memory.
        Err(minisign_verify::Error::UnsupportedLegacyMode) => {
            if file.metadata().map_err(|_| Failure::disk())?.len() > 64 * 1024 * 1024 {
                return Err(invalid());
            }
            let mut bytes = Vec::new();
            file.take(64 * 1024 * 1024 + 1)
                .read_to_end(&mut bytes)
                .map_err(|_| Failure::disk())?;
            key.verify(&bytes, &signature, true).map_err(|_| invalid())
        }
        Err(_) => Err(invalid()),
    }
}

/// Returns only a complete, signature-verified file. Caller owns pending commit.
pub(crate) async fn download<F: FnMut(Progress)>(
    client: &Client,
    dir: &Path,
    artifact: &Artifact,
    policy: &Policy,
    mut progress: F,
) -> Result<PathBuf, Failure> {
    let mut meta = prepare(dir, artifact)?;
    let attempts = policy.max_attempts.clamp(1, MAX_ATTEMPTS);
    for attempt in 1..=attempts {
        match transfer(
            client,
            dir,
            artifact,
            &mut meta,
            policy,
            attempt,
            &mut progress,
        )
        .await
        {
            Ok(()) => {
                let path = dir.join(DATA_FILE);
                let verify_path = path.clone();
                let artifact = artifact.clone();
                let verified =
                    tokio::task::spawn_blocking(move || verify_file(&verify_path, &artifact))
                        .await
                        .map_err(|_| Failure::disk())?;
                if let Err(error) = verified {
                    if error.code == "signature" {
                        clear_partial(dir)?;
                    }
                    return Err(error);
                }
                return Ok(path);
            }
            Err(error) if error.retryable && attempt < attempts => {
                let delay = policy.retry_delay.saturating_mul(1 << (attempt - 1));
                let retry_at_ms = SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_millis()
                    .saturating_add(delay.as_millis())
                    .min(u64::MAX as u128) as u64;
                progress(Progress {
                    downloaded: regular(&dir.join(DATA_FILE))?.unwrap_or(0),
                    total: meta.total,
                    bytes_per_second: None,
                    attempt,
                    retry_at_ms: Some(retry_at_ms),
                    failure: Some(error),
                });
                tokio::time::sleep(delay).await;
            }
            Err(error) => return Err(error),
        }
    }
    unreachable!("attempt count is nonzero")
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::TcpListener;
    use std::sync::{Arc, Mutex};
    use std::thread;
    use tempfile::TempDir;

    fn fixture(url: &str) -> (Artifact, Vec<u8>) {
        let json: serde_json::Value = serde_json::from_str(include_str!(
            "../test-fixtures/moxbots-updater-signature.json"
        ))
        .unwrap();
        (
            Artifact {
                target: "darwin-aarch64".into(),
                version: "9.9.9".into(),
                url: Url::parse(url).unwrap(),
                signature: json["signature"].as_str().unwrap().into(),
                public_key: json["pubkey"].as_str().unwrap().into(),
                headers: header::HeaderMap::new(),
            },
            json["bytes"].as_str().unwrap().as_bytes().to_vec(),
        )
    }
    fn policy() -> Policy {
        Policy {
            idle_timeout: Duration::from_millis(500),
            retry_delay: Duration::ZERO,
            max_attempts: 3,
        }
    }
    fn full(bytes: &[u8]) -> Vec<u8> {
        [
            format!(
                "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                bytes.len()
            )
            .as_bytes(),
            bytes,
        ]
        .concat()
    }
    fn partial(bytes: &[u8], offset: usize) -> Vec<u8> {
        [format!("HTTP/1.1 206 Partial Content\r\nContent-Range: bytes {}-{}/{}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n", offset, bytes.len()-1, bytes.len(), bytes.len()-offset).as_bytes(), &bytes[offset..]].concat()
    }
    fn server(
        count: usize,
        mut reply: impl FnMut(usize, &str, &mut std::net::TcpStream) + Send + 'static,
    ) -> (String, Arc<Mutex<Vec<String>>>, thread::JoinHandle<()>) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let url = format!("http://{}/artifact", listener.local_addr().unwrap());
        let requests = Arc::new(Mutex::new(Vec::new()));
        let received = requests.clone();
        listener.set_nonblocking(true).unwrap();
        let handle = thread::spawn(move || {
            let deadline = Instant::now() + Duration::from_secs(5);
            for index in 0..count {
                let mut stream = loop {
                    match listener.accept() {
                        Ok((stream, _)) => break stream,
                        Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                            assert!(Instant::now() < deadline, "loopback request timed out");
                            thread::sleep(Duration::from_millis(2));
                        }
                        Err(error) => panic!("{error}"),
                    }
                };
                // macOS accepted sockets inherit O_NONBLOCK from the listener;
                // Linux does not. The fixture reads a complete HTTP request.
                stream.set_nonblocking(false).unwrap();
                stream
                    .set_read_timeout(Some(Duration::from_secs(1)))
                    .unwrap();
                let mut request = Vec::new();
                let mut byte = [0u8; 1];
                while !request.ends_with(b"\r\n\r\n") && request.len() < 8192 {
                    if stream.read(&mut byte).unwrap_or(0) == 0 {
                        break;
                    }
                    request.push(byte[0]);
                }
                let request = String::from_utf8(request).unwrap().to_lowercase();
                received.lock().unwrap().push(request.clone());
                reply(index, &request, &mut stream);
            }
        });
        (url, requests, handle)
    }
    fn client() -> Client {
        crate::local_http::builder().build().unwrap()
    }
    fn seed(dir: &Path, artifact: &Artifact, bytes: &[u8], total: u64) {
        let mut meta = prepare(dir, artifact).unwrap();
        meta.total = Some(total);
        write_meta(dir, &meta).unwrap();
        fs::write(dir.join(DATA_FILE), bytes).unwrap();
    }

    #[tokio::test]
    async fn dropped_stream_resumes_with_range_and_preserves_progress() {
        let (_, bytes) = fixture("http://127.0.0.1/");
        let body = bytes.clone();
        let (url, requests, server) = server(2, move |index, _, stream| {
            let response = if index == 0 {
                full(&body)[..full(&body).len() - (body.len() - 16)].to_vec()
            } else {
                partial(&body, 16)
            };
            stream.write_all(&response).unwrap();
        });
        let (artifact, _) = fixture(&url);
        let dir = TempDir::new().unwrap();
        let mut events = Vec::new();
        let path = download(&client(), dir.path(), &artifact, &policy(), |event| {
            events.push(event)
        })
        .await
        .unwrap();
        assert_eq!(fs::read(path).unwrap(), bytes);
        server.join().unwrap();
        assert!(requests.lock().unwrap()[1].contains("range: bytes=16-"));
        assert!(events
            .iter()
            .any(|event| event.retry_at_ms.is_some() && event.downloaded == 16));
    }

    #[tokio::test]
    async fn partial_survives_transport_failure_and_new_download_instance() {
        let (_, bytes) = fixture("http://127.0.0.1/");
        let body = bytes.clone();
        let (url, requests, server) = server(2, move |index, _, stream| {
            let response = if index == 0 {
                full(&body)[..full(&body).len() - (body.len() - 16)].to_vec()
            } else {
                partial(&body, 16)
            };
            stream.write_all(&response).unwrap();
        });
        let (artifact, _) = fixture(&url);
        let dir = TempDir::new().unwrap();
        let mut first = policy();
        first.max_attempts = 1;
        assert!(download(&client(), dir.path(), &artifact, &first, |_| {})
            .await
            .is_err());
        assert_eq!(
            recovered_partial(dir.path()).unwrap().unwrap(),
            ("9.9.9".into(), 16, Some(bytes.len() as u64))
        );
        let path = download(&client(), dir.path(), &artifact, &policy(), |_| {})
            .await
            .unwrap();
        assert_eq!(fs::read(path).unwrap(), bytes);
        server.join().unwrap();
        assert!(requests.lock().unwrap()[1].contains("range: bytes=16-"));
    }

    #[tokio::test]
    async fn ignored_range_200_truncates_instead_of_appending() {
        let (_, bytes) = fixture("http://127.0.0.1/");
        let body = bytes.clone();
        let (url, requests, server) = server(1, move |_, _, stream| {
            stream.write_all(&full(&body)).unwrap()
        });
        let (artifact, _) = fixture(&url);
        let dir = TempDir::new().unwrap();
        seed(
            dir.path(),
            &artifact,
            b"obsolete prefix!!",
            bytes.len() as u64,
        );
        let path = download(&client(), dir.path(), &artifact, &policy(), |_| {})
            .await
            .unwrap();
        assert_eq!(fs::read(path).unwrap(), bytes);
        server.join().unwrap();
        assert!(requests.lock().unwrap()[0].contains("range: bytes=17-"));
    }

    #[tokio::test]
    async fn changed_identity_discards_old_bytes_and_hides_url_credentials() {
        let (_, bytes) = fixture("http://127.0.0.1/");
        let body = bytes.clone();
        let (url, requests, server) = server(1, move |_, _, stream| {
            stream.write_all(&full(&body)).unwrap()
        });
        let (artifact, _) = fixture(&url);
        let mut previous = artifact.clone();
        previous.url.set_password(Some("private-secret")).unwrap();
        previous.url.set_username("user").unwrap();
        let dir = TempDir::new().unwrap();
        seed(dir.path(), &previous, &bytes[..16], bytes.len() as u64);
        assert!(!fs::read_to_string(dir.path().join(META_FILE))
            .unwrap()
            .contains("private-secret"));
        let path = download(&client(), dir.path(), &artifact, &policy(), |_| {})
            .await
            .unwrap();
        assert_eq!(fs::read(path).unwrap(), bytes);
        server.join().unwrap();
        assert!(!requests.lock().unwrap()[0].contains("range:"));
        for mutation in 0..4 {
            let mut changed = artifact.clone();
            match mutation {
                0 => changed.version.push('1'),
                1 => changed.signature.push('A'),
                2 => changed.target.push('1'),
                _ => changed.public_key.push('A'),
            }
            seed(dir.path(), &artifact, &bytes[..16], bytes.len() as u64);
            prepare(dir.path(), &changed).unwrap();
            assert!(regular(&dir.path().join(DATA_FILE)).unwrap().is_none());
        }
    }

    #[tokio::test]
    async fn inconsistent_ranges_and_totals_restart_from_zero() {
        for range in [
            "bytes 15-31/32",
            "bytes 16-32/33",
            "bytes 16-30/32",
            "bytes 16-31/*",
        ] {
            let (_, bytes) = fixture("http://127.0.0.1/");
            let body = bytes.clone();
            let range = range.to_string();
            let (url, requests, server) = server(2, move |index, _, stream| {
                let response = if index == 0 {
                    format!("HTTP/1.1 206 Partial Content\r\nContent-Range: {range}\r\nContent-Length: 16\r\nConnection: close\r\n\r\nxxxxxxxxxxxxxxxx").into_bytes()
                } else {
                    full(&body)
                };
                stream.write_all(&response).unwrap();
            });
            let (artifact, _) = fixture(&url);
            let dir = TempDir::new().unwrap();
            seed(dir.path(), &artifact, &bytes[..16], bytes.len() as u64);
            let path = download(&client(), dir.path(), &artifact, &policy(), |_| {})
                .await
                .unwrap();
            assert_eq!(fs::read(path).unwrap(), bytes);
            server.join().unwrap();
            assert!(!requests.lock().unwrap()[1].contains("range:"));
        }
    }

    #[tokio::test]
    async fn range_416_only_accepts_exact_complete_file_then_verifies() {
        for complete in [true, false] {
            let (_, bytes) = fixture("http://127.0.0.1/");
            let body = bytes.clone();
            let (url, requests, server) = server(
                if complete { 1 } else { 2 },
                move |index, _, stream| {
                    if index == 0 {
                        stream.write_all(format!("HTTP/1.1 416 Range Not Satisfiable\r\nContent-Range: bytes */{}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n", body.len()).as_bytes()).unwrap();
                    } else {
                        stream.write_all(&full(&body)).unwrap();
                    }
                },
            );
            let (artifact, _) = fixture(&url);
            let dir = TempDir::new().unwrap();
            seed(
                dir.path(),
                &artifact,
                if complete { &bytes } else { &bytes[..16] },
                bytes.len() as u64,
            );
            let path = download(&client(), dir.path(), &artifact, &policy(), |_| {})
                .await
                .unwrap();
            assert_eq!(fs::read(path).unwrap(), bytes);
            server.join().unwrap();
            if !complete {
                assert!(!requests.lock().unwrap()[1].contains("range:"));
            }
        }
    }

    #[tokio::test]
    async fn stalled_body_times_out_with_bounded_retry_and_preserves_file() {
        let (url, _, server) = server(3, move |_, _, stream| {
            stream.write_all(b"HTTP/1.1 200 OK\r\nContent-Length: 32\r\nConnection: close\r\n\r\n1234567890123456").unwrap();
            // A fixed server-side sleep can close the incomplete body before a
            // loaded client polls its timeout, turning this into an EOF test.
            // Retain the body until the client actually abandons the request;
            // server() already bounds this read to one second.
            let mut byte = [0];
            match stream.read(&mut byte) {
                Ok(0) => {}
                Err(error)
                    if matches!(
                        error.kind(),
                        std::io::ErrorKind::ConnectionReset | std::io::ErrorKind::ConnectionAborted
                    ) => {}
                other => panic!("stalled body must remain open until client disconnect: {other:?}"),
            }
        });
        let (artifact, _) = fixture(&url);
        let dir = TempDir::new().unwrap();
        let mut policy = policy();
        policy.idle_timeout = Duration::from_millis(25);
        let started = Instant::now();
        let mut retries = 0;
        let failure = download(&client(), dir.path(), &artifact, &policy, |event| {
            if event.retry_at_ms.is_some() {
                retries += 1;
            }
        })
        .await
        .unwrap_err();
        assert_eq!(failure.code, "timeout");
        assert_eq!(retries, 2);
        assert!(started.elapsed() < Duration::from_secs(1));
        assert!(regular(&dir.path().join(DATA_FILE)).unwrap().unwrap() > 0);
        // Let the runtime drain the cancelled response while joining the server.
        tokio::task::spawn_blocking(move || server.join().unwrap())
            .await
            .unwrap();
    }

    #[tokio::test]
    async fn exact_length_does_not_bypass_signature_or_create_pending() {
        let (_, bytes) = fixture("http://127.0.0.1/");
        let corrupt = vec![b'X'; bytes.len()];
        let (url, _, server) = server(1, move |_, _, stream| {
            stream.write_all(&full(&corrupt)).unwrap()
        });
        let (artifact, _) = fixture(&url);
        let dir = TempDir::new().unwrap();
        fs::write(
            dir.path().join("pending_update.bin"),
            b"previous verified pending",
        )
        .unwrap();
        let failure = download(&client(), dir.path(), &artifact, &policy(), |_| {})
            .await
            .unwrap_err();
        assert_eq!(failure.code, "signature");
        assert!(regular(&dir.path().join(DATA_FILE)).unwrap().is_none());
        assert_eq!(
            fs::read(dir.path().join("pending_update.bin")).unwrap(),
            b"previous verified pending"
        );
        server.join().unwrap();
    }

    #[tokio::test]
    async fn unknown_total_is_streamed_and_verified_without_fabricated_percentage() {
        let (_, bytes) = fixture("http://127.0.0.1/");
        let body = bytes.clone();
        let (url, _, server) = server(1, move |_, _, stream| {
            stream
                .write_all(b"HTTP/1.1 200 OK\r\nConnection: close\r\n\r\n")
                .unwrap();
            stream.write_all(&body).unwrap();
        });
        let (artifact, _) = fixture(&url);
        let dir = TempDir::new().unwrap();
        let mut events = Vec::new();
        let path = download(&client(), dir.path(), &artifact, &policy(), |event| {
            events.push(event)
        })
        .await
        .unwrap();
        assert_eq!(fs::read(path).unwrap(), bytes);
        assert!(events.iter().all(|event| event.total.is_none()));
        server.join().unwrap();
    }

    #[test]
    fn oversized_and_malformed_headers_are_rejected() {
        for (name, value) in [
            (header::CONTENT_LENGTH, "2147483649"),
            (header::CONTENT_LENGTH, "invalid"),
            (header::CONTENT_ENCODING, "gzip"),
        ] {
            let mut headers = header::HeaderMap::new();
            headers.insert(name, value.parse().unwrap());
            assert!(response_layout(StatusCode::OK, &headers, 0, None).is_err());
        }
    }

    #[cfg(unix)]
    #[test]
    fn partial_symlinks_fail_closed_and_do_not_touch_target() {
        let (artifact, _) = fixture("http://127.0.0.1/");
        let dir = TempDir::new().unwrap();
        let outside = TempDir::new().unwrap();
        let target = outside.path().join("untouched");
        fs::write(&target, b"private").unwrap();
        std::os::unix::fs::symlink(&target, dir.path().join(DATA_FILE)).unwrap();
        assert_eq!(prepare(dir.path(), &artifact).err().unwrap().code, "disk");
        assert_eq!(fs::read(target).unwrap(), b"private");
    }
}
