#!/usr/bin/env bash
# Isolated synthetic fixture only. Never uses Docker contexts or production files.
set -euo pipefail
umask 077
cd "$(dirname "$0")/../../.."
for tool in docker openssl python3 htpasswd curl cargo; do
  command -v "$tool" >/dev/null || { echo "required tool unavailable: $tool" >&2; exit 1; }
done
# Refuse remote engines even if the caller has an ambient Docker configuration.
export DOCKER_HOST=unix:///var/run/docker.sock
unset DOCKER_CONTEXT DOCKER_TLS_VERIFY DOCKER_CERT_PATH
docker info >/dev/null 2>&1 || { echo 'local Linux Docker daemon required' >&2; exit 1; }
fixture=$(mktemp -d "${TMPDIR:-/tmp}/moxbots-real-dex.XXXXXXXX")
container="moxbots-real-dex-$(basename "$fixture" | tr '[:upper:]' '[:lower:]')"
cleanup() {
  status=$?
  trap - EXIT INT TERM
  if docker container inspect "$container" >/dev/null 2>&1; then
    if ! docker rm -f "$container" >/dev/null 2>&1; then
      echo 'isolated Dex container cleanup failed' >&2
      [[ "$status" != 0 ]] || status=1
    fi
  fi
  if ! rm -rf -- "$fixture"; then
    echo 'isolated Dex temporary fixture cleanup failed' >&2
    [[ "$status" != 0 ]] || status=1
  fi
  exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
image=ghcr.io/dexidp/dex:v2.46.0
docker pull "$image" >/dev/null
# Execute the immutable image ID actually inspected, not a potentially moving tag.
image_id=$(docker image inspect "$image" --format '{{.Id}}')
mkdir -p output/owned-agentnet
report=output/owned-agentnet/real-dex-integration.txt
{
  printf 'requested-image=%s\nimage-id=%s\n' "$image" "$image_id"
  docker image inspect "$image_id" --format 'repo-digests={{json .RepoDigests}}'
} > "$report"
version=$(docker run --rm --network none --entrypoint /usr/local/bin/dex "$image_id" version)
printf '%s\n' "$version" >> "$report"
# Require the actual binary to report the requested version, not only a tag.
printf '%s\n' "$version" | grep -Eq '^Dex Version: v?2\.46\.0$'  || { echo 'unexpected Dex version' >&2; exit 1; }
python3 - "$fixture" <<'PY'
import json, pathlib, secrets, socket, subprocess, sys, uuid
root = pathlib.Path(sys.argv[1])
with socket.socket() as sock:
    sock.bind(('127.0.0.1', 0))
    port = sock.getsockname()[1]
issuer = f'https://127.0.0.1:{port}/dex'
password, secret = secrets.token_urlsafe(40), secrets.token_urlsafe(40)
username = 'isolated-native@example.test'
bcrypt = subprocess.run(['htpasswd', '-niBC', '10', 'fixture'], input=password+'\n', text=True, capture_output=True, check=True).stdout.strip().split(':', 1)[1]
def openssl(*args):
    subprocess.run(['openssl', *args], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
openssl('req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', str(root/'ca.key'), '-out', str(root/'ca.pem'), '-days', '1', '-subj', '/CN=Isolated native Dex test CA', '-addext', 'basicConstraints=critical,CA:TRUE')
openssl('req', '-newkey', 'rsa:2048', '-nodes', '-keyout', str(root/'tls.key'), '-out', str(root/'tls.csr'), '-subj', '/CN=127.0.0.1')
(root/'tls.ext').write_text('subjectAltName=IP:127.0.0.1\nbasicConstraints=critical,CA:FALSE\nextendedKeyUsage=serverAuth\nkeyUsage=critical,digitalSignature,keyEncipherment\n')
openssl('x509', '-req', '-in', str(root/'tls.csr'), '-CA', str(root/'ca.pem'), '-CAkey', str(root/'ca.key'), '-CAcreateserial', '-out', str(root/'tls.pem'), '-days', '1', '-extfile', str(root/'tls.ext'))
client = 'isolated-native-confidential'
config = {'issuer': issuer, 'storage': {'type': 'sqlite3', 'config': {'file': '/fixture/dex.db'}},
          'web': {'https': '0.0.0.0:5556', 'tlsCert': '/fixture/tls.pem', 'tlsKey': '/fixture/tls.key'},
          'oauth2': {'responseTypes': ['code'], 'skipApprovalScreen': False, 'passwordConnector': 'local'},
          'enablePasswordDB': True, 'staticPasswords': [{'email': username, 'hash': bcrypt, 'username': 'Isolated Synthetic User', 'userID': str(uuid.uuid4())}],
          'staticClients': [{'id': client, 'secret': secret, 'name': 'Isolated MoXBots confidential client', 'redirectURIs': ['https://agent.example.test/auth/callback']}]}
(root/'dex.json').write_text(json.dumps(config))
(root/'fixture.json').write_text(json.dumps({'issuer': issuer, 'ca_path': str(root/'ca.pem'), 'client_id': client, 'client_secret': secret, 'username': username, 'password': password}))
(root/'port').write_text(str(port))
PY
port=$(cat "$fixture/port")
docker run -d --name "$container" --user "$(id -u):$(id -g)" \
  --cap-drop ALL --security-opt no-new-privileges --log-driver none \
  -p "127.0.0.1:$port:5556" -v "$fixture:/fixture" \
  --entrypoint /usr/local/bin/dex "$image_id" serve /fixture/dex.json >/dev/null
# No Docker logs: provider diagnostics can contain account identifiers.
ready=false
for attempt in $(seq 1 60); do
  if curl --silent --fail --noproxy '*' --cacert "$fixture/ca.pem" \
      --connect-timeout 1 --max-time 2 "https://127.0.0.1:$port/dex/.well-known/openid-configuration" >/dev/null; then
    ready=true
    break
  fi
  sleep 1
done
[[ "$ready" == true ]] || { echo 'isolated Dex TLS discovery startup failed' >&2; exit 1; }
# Values remain in a private temp file, never argv or test output.
export MOXBOTS_REAL_DEX_TEST=1 MOXBOTS_REAL_DEX_FIXTURE="$fixture/fixture.json"
export CARGO_BUILD_JOBS=4
cargo test --locked --manifest-path services/agentnet/Cargo.toml \
  server::native_password::tests::password_real_dex_tls_confidential_client_pkce_lifecycle \
  -- --ignored --exact --nocapture --test-threads=1 | tee -a "$report"
grep -q 'REAL_DEX_RESULT ' "$report"
grep -q 'test result: ok. 1 passed; 0 failed;' "$report"
printf 'fixture=synthetic-only; tls=temporary-CA-only; bind=127.0.0.1; consent=explicit; production=untouched\n' | tee -a "$report"
