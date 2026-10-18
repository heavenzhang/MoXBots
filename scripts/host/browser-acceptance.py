#!/usr/bin/env python3
"""Manual disposable-VM acceptance, never a production installer or auth fixture.

Harness source and clean product M source are different checkouts. No product is
built here. Public immutable bytes and the exact previously built M service are
verified before use. Raw CLI/browser/service output is memory-only and never
included in exceptions, artifacts, journals, traces, HARs or screenshots.
"""
from __future__ import annotations

import argparse
import collections
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import platform
import re
import secrets
import selectors
import shutil
import signal
import socket
import sqlite3
import ssl
import subprocess
import sys
import tempfile
import time
import urllib.request
from urllib.parse import urlsplit
import uuid

sys.dont_write_bytecode = True  # imports must not add generated files to clean product M

PRODUCT = "dcf8d9a60976c160e2b2aca33313c668c071132c"
RELEASE = "20261018032115-dcf8d9a60976"
PUBLIC = "https://140.143.183.232"
ORIGIN = "https://127.0.0.1:24443"
DEX_IMAGE = "ghcr.io/dexidp/dex:v2.46.0"
SERVICE_SHA = "b73f5d462504e2d5a132d672ad85ba660605404ef21c46d4af937f92b5748d63"
INSTALL_SHA = "c317033d7bf4ae77160e2a528ae83e88d4f3edd4a59f771af2b98fba10a6853b"
STABLE_SHA = "00961ca2d710dcbad5bc6cb0c95ad0ac4bf5be6aff801c4bf86037642da5ebce"
PINS = {
    "bootstrap.py": (24272, "877fff3bf5810de7d20cc9a43ac2d49b6f9c28f29a39ba61ac3f54c168040e9c"),
    "bundle.tar.gz": (171501596, "304be176df11f9d4a952dab560160e7bdbe7af0c92dfa9eeeba6435cff037ae2"),
}
NODE = "moxbot-host-test.service"
CONNECTOR = "moxbot-host-network-test.service"
STATUS = Path("/run/moxbot-host-network-test/status.json")
IDENTITY_FILES = [
    Path("/var/lib/moxbot-host-test/host-identity.json"),
    Path("/var/lib/moxbot-host-test/home/.myagents/config.json"),
    Path("/etc/moxbot-host-test/credentials/provider-key.cred"),
    Path("/etc/moxbot-host-network-test/identity-kek.cred"),
    Path("/opt/moxbot-host-network-test/device-id.json"),
    Path("/etc/moxbot-host-network-test/owned-instance.json"),
]


class Rejected(Exception):
    """Messages are fixed non-secret gate names, never command output."""


def need(condition, gate):
    if not condition:
        raise Rejected(gate)


def run(command, *, data=None, timeout=60, env=None, check=True):
    # Never let subprocess errors serialize argv/input/stdout/stderr.
    try:
        result = subprocess.run(command, input=data, stdout=subprocess.PIPE,
                                stderr=subprocess.PIPE, timeout=timeout, env=env)
    except (OSError, subprocess.SubprocessError):
        raise Rejected("bounded-subprocess-failed") from None
    need(not check or result.returncode == 0, "bounded-subprocess-rejected")
    need(len(result.stdout) + len(result.stderr) <= 4 * 1024**2, "subprocess-output-bound")
    return result


def digest(path):
    value = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024**2), b""):
            value.update(block)
    return value.hexdigest()


def load_module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def environment_guard():
    need(os.geteuid() == 0, "root-required")
    need(all(os.environ.get(name) == value for name, value in {
        "CI": "true", "GITHUB_ACTIONS": "true", "RUNNER_ENVIRONMENT": "github-hosted",
    }.items()) and os.environ.get("GITHUB_REPOSITORY", "").lower() == "heavenzhang/moxbots",
        "canonical-disposable-github-vm-only")
    need(sys.platform == "linux" and platform.machine() == "x86_64", "linux-x86-64-only")
    need(Path("/proc/1/comm").read_text().strip() == "systemd", "real-systemd-pid1-required")
    release = dict(line.split("=", 1) for line in Path("/etc/os-release").read_text().splitlines() if "=" in line)
    need(release.get("ID", "").strip('"') == "ubuntu"
         and release.get("VERSION_ID", "").strip('"') == "24.04", "ubuntu-24-04-only")
    need(run(["systemctl", "--version"]).stdout.splitlines()[0].split()[1] == b"255", "systemd-255-only")
    need(not any(name in os.environ for name in ("GITHUB_TOKEN", "GH_TOKEN", "MYAGENTS_HOST_TRANSACTION_LOCK_FD")),
         "credential-or-inherited-transaction-environment-forbidden")


def guard(args):
    environment_guard()
    # Reuse the installed acceptance's existing namespace/account/unit guards.
    old = load_module("browser_systemd_guards", Path(__file__).with_name("systemd-acceptance.py"))
    old.guard(argparse.Namespace(source_root=args.product_source, source_commit=PRODUCT,
        host_artifact_dir=args.product_source, network_artifact_dir=args.product_source, output=args.output))
    need(args.product_source.is_absolute() and args.output.is_absolute(), "absolute-paths-required")
    need(not args.output.exists(), "summary-output-must-be-new")
    for port in (24443, 25556, 28080):
        with socket.socket() as probe:
            try:
                probe.bind(("127.0.0.1", port))
            except OSError:
                raise Rejected("lab-port-already-owned") from None
    return old


def launcher(source):
    return (b'#!/usr/bin/env bash\nset -euo pipefail\nexec python3 - "$@" <<\'MOXBOTS_INSTALL_PYTHON\'\n'
            + source + b"\nMOXBOTS_INSTALL_PYTHON\n")


def index():
    value = {"schemaVersion": 1, "status": "available", "profile": "moxbot-test",
        "platform": "ubuntu-24.04-x86_64", "scriptPath": "/host/install.sh",
        "sourceCommit": PRODUCT, "releaseId": RELEASE}
    for prefix, filename in (("bootstrap", "bootstrap.py"), ("bundle", "bundle.tar.gz")):
        value.update({prefix + "Path": f"/host/releases/{RELEASE}/{filename}",
                      prefix + "Sha256": PINS[filename][1], prefix + "Bytes": PINS[filename][0]})
    return value


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def get_exact(url, target, size, sha256):
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect(),
        urllib.request.HTTPSHandler(context=ssl.create_default_context()))
    try:
        with opener.open(url, timeout=45) as response, target.open("xb") as stream:
            need(response.status == 200 and response.geturl() == url, "immutable-full-get-required")
            total = 0
            while block := response.read(1024**2):
                total += len(block)
                need(total <= size, "immutable-byte-bound")
                stream.write(block)
    except (OSError, ValueError):
        raise Rejected("immutable-normal-tls-get-failed") from None
    need(target.stat().st_size == size and digest(target) == sha256, "immutable-size-sha-mismatch")


def prepare_candidate(args, private):
    web = private / "www"
    release = web / "host/releases" / RELEASE
    release.mkdir(parents=True)
    for filename, (size, sha256) in PINS.items():
        get_exact(f"{PUBLIC}/host/releases/{RELEASE}/{filename}", release / filename, size, sha256)
    source = (args.product_source / "scripts/host/one-command.py").read_bytes()
    script = launcher(source)
    need(hashlib.sha256(script).hexdigest() == INSTALL_SHA, "M-installer-byte-reproduction")
    bootstrap = source.replace(b"from __future__ import annotations\n",
        b"from __future__ import annotations\nEXPECTED_SOURCE_COMMIT = " + repr(PRODUCT).encode() + b"\n", 1)
    need(bootstrap == (release / "bootstrap.py").read_bytes(), "M-bootstrap-byte-reproduction")
    (web / "host/install.sh").write_bytes(script)
    stable = (json.dumps(index(), indent=2) + "\n").encode()
    need(len(stable) == 643 and hashlib.sha256(stable).hexdigest() == STABLE_SHA, "M-stable-index-byte-reproduction")
    (web / "host/stable.json").write_bytes(stable)
    consumer = load_module("browser_M_consumer", args.product_source / "scripts/host/one-command.py")
    unpacked = private / "validated-bundle"
    unpacked.mkdir()
    consumer.unpack_bundle(release / "bundle.tar.gz", unpacked, index())
    return web


def verify_service(args):
    need(args.service_artifact is not None and args.service_artifact.is_absolute(), "service-artifact-required")
    binary = args.service_artifact / "myagents-agentnet-service"
    need(binary.is_file() and not binary.is_symlink() and binary.stat().st_size == 27513232,
         "service-M-regular-size")
    need(digest(binary) == SERVICE_SHA, "service-M-sha")
    need((args.service_artifact / "source-commit.txt").read_bytes() == (PRODUCT + "\n").encode(), "service-M-provenance")
    need(binary.open("rb").read(20)[:6] == b"\x7fELF\x02\x01", "service-ELF-required")
    binary.chmod(0o755)
    return binary


def private_write(path, data):
    path.write_bytes(data.encode() if isinstance(data, str) else data)
    path.chmod(0o600)


def install_ca(private):
    ca = private / "lab-ca.crt"
    key = private / "lab-ca.key"
    run(["openssl", "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-sha256", "-days", "2",
         "-subj", "/CN=MoXBots disposable browser lab CA", "-keyout", str(key), "-out", str(ca),
         "-addext", "basicConstraints=critical,CA:TRUE", "-addext", "keyUsage=critical,keyCertSign,cRLSign"])
    run(["openssl", "req", "-newkey", "rsa:2048", "-nodes", "-subj", "/CN=127.0.0.1",
         "-keyout", str(private / "ingress.key"), "-out", str(private / "ingress.csr")])
    private_write(private / "ingress.ext", "subjectAltName=IP:127.0.0.1\nbasicConstraints=CA:FALSE\nkeyUsage=digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\n")
    run(["openssl", "x509", "-req", "-days", "2", "-sha256", "-in", str(private / "ingress.csr"),
         "-CA", str(ca), "-CAkey", str(key), "-CAcreateserial", "-extfile", str(private / "ingress.ext"),
         "-out", str(private / "ingress.crt")])
    # Install only in this disposable OS; no public-TLS-CA argument or product changes.
    installed = Path("/usr/local/share/ca-certificates/moxbots-disposable-browser-lab.crt")
    need(not installed.exists(), "existing-lab-CA-protected")
    browser_home = private / "browser-home"
    nss = browser_home / ".pki/nssdb"
    nss.mkdir(parents=True)
    run(["certutil", "-N", "-d", "sql:" + str(nss), "--empty-password"])
    run(["certutil", "-A", "-d", "sql:" + str(nss), "-n", "MoXBots disposable lab", "-t", "C,,", "-i", str(ca)])
    shutil.copyfile(ca, installed)
    installed.chmod(0o644)
    try:
        run(["update-ca-certificates"], timeout=60)
    except Rejected:
        installed.unlink(missing_ok=True)
        run(["update-ca-certificates"], timeout=60, check=False)
        raise
    return installed, browser_home


def nginx_config(private, web):
    # The telemetry alphabet is fixed. No URI/query, header value, IP, body or URL is logged.
    return f"""daemon off;
master_process off;
pid {private}/nginx.pid;
error_log /dev/null;
events {{ worker_connections 128; }}
http {{
  map $http_dpop $has_dpop {{ '' 0; default 1; }}
  map $http_authorization $has_auth {{ '' 0; default 1; }}
  map $uri $route {{
    default other;
    /auth/login/start start; /auth/login/poll poll; /auth/callback callback;
    /auth/login/cancel cancel;
    /dex/token dex-token; /v1/session/renew renew; /v1/ws ws;
    /v1/devices/self/catalog catalog;
    ~^/v1/networks/[^/]+/devices/[^/]+/join$ join;
  }}
  log_format bounded '$route $status $has_dpop $has_auth';
  access_log {private}/route-counts.log bounded;
  client_max_body_size 10m;
  client_body_temp_path {private}/nginx-body;
  proxy_temp_path {private}/nginx-proxy;
  server {{
    listen 127.0.0.1:24443 ssl;
    server_name 127.0.0.1;
    ssl_certificate {private}/ingress.crt;
    ssl_certificate_key {private}/ingress.key;
    ssl_protocols TLSv1.3;
    location /host/ {{ root {web}; }}
    location /dex/ {{ proxy_pass http://127.0.0.1:25556; proxy_set_header Host $http_host; }}
    location / {{
      proxy_pass http://127.0.0.1:28080;
      proxy_http_version 1.1;
      proxy_set_header Host $http_host;
      proxy_set_header Upgrade $http_upgrade;
      proxy_set_header Connection "upgrade";
      proxy_read_timeout 300s;
      proxy_buffering off;
    }}
  }}
}}
"""


def route_counts(private):
    result = collections.Counter()
    path = private / "route-counts.log"
    if path.exists():
        need(path.stat().st_size < 1024**2, "route-telemetry-bound")
        for line in path.read_text().splitlines():
            need(re.fullmatch(r"(other|start|poll|callback|cancel|dex-token|renew|ws|catalog|join) [0-9]{3} [01] [01]", line),
                 "telemetry-closed-alphabet")
            route, status, dpop, auth = line.split()
            result[(route, int(status), int(dpop), int(auth))] += 1
    return result


def hits(counts, route, success=True, dpop=False):
    return sum(n for (name, status, proof, _), n in counts.items()
               if name == route and (not success or 200 <= status < 300) and (not dpop or proof == 1))


def completed_polls(counts):
    return sum(n for (route, status, _, _), n in counts.items() if route == "poll" and status == 200)


def db_snapshot(private):
    state = private / "service-state"
    with sqlite3.connect(f"file:{state}/auth.sqlite3?mode=ro", uri=True) as db:
        sessions = db.execute("SELECT principal_id,device_id,session_handle,token_hash,expires_at,revoked_at FROM sessions ORDER BY session_handle").fetchall()
        principals = db.execute("SELECT COUNT(*) FROM principals").fetchone()[0]
        rotations = db.execute("SELECT COUNT(*) FROM session_revocation_tokens").fetchone()[0]
    with sqlite3.connect(f"file:{state}/metadata.sqlite3?mode=ro", uri=True) as db:
        devices = db.execute("SELECT device_id,joined,membership_revision,presence,connection_epoch,catalog_epoch,catalog_seq,key_fingerprint,key_generation FROM devices").fetchall()
        catalogs = db.execute("SELECT COUNT(*) FROM catalogs").fetchone()[0]
        items = db.execute("SELECT COUNT(*) FROM catalog_items").fetchone()[0]
    return {"sessions": sessions, "principals": principals, "rotations": rotations,
            "devices": devices, "catalogs": catalogs, "items": items}


def installed_identity_hashes():
    # First-install cancellation has no issued device key yet. Pending account
    # ciphertext must change when native cancel clears that attempt; the Host
    # identity, config (including absence), KEKs and any device keys must not.
    paths = IDENTITY_FILES + sorted(Path("/var/lib/moxbot-host-network-test").glob("key-*.sealed"))
    need(IDENTITY_FILES[0].is_file() and IDENTITY_FILES[2].is_file() and IDENTITY_FILES[3].is_file(),
         "first-install-identity-and-KEKs-required")
    need(not any(path.is_symlink() for path in paths), "identity-symlink-forbidden")
    return {str(path): digest(path) if path.is_file() else None for path in paths}


def persistent_hashes(include_accounts=True):
    paths = IDENTITY_FILES + sorted(Path("/var/lib/moxbot-host-network-test").glob("key-*.sealed"))
    if include_accounts:
        paths += sorted(Path("/var/lib/moxbot-host-network-test").glob("state-*.sealed"))
    need(all(not path.is_symlink() and (path.is_file() or path == IDENTITY_FILES[1]) for path in paths), "persistent-file-contract")
    need(any(path.name.startswith("key-") for path in paths), "encrypted-device-key-required")
    if include_accounts:
        need(any(path.name.startswith("state-") for path in paths), "encrypted-account-required")
    return {str(path): digest(path) if path.is_file() else None for path in paths}


def wait_for(operation, timeout=45):
    until = time.monotonic() + timeout
    while time.monotonic() < until:
        try:
            value = operation()
            if value:
                return value
        except (OSError, ValueError, sqlite3.Error, Rejected):
            pass
        time.sleep(0.5)
    raise Rejected("bounded-readiness-deadline")


def node_pid():
    return int(run(["systemctl", "show", NODE, "--property=MainPID", "--value"]).stdout)


def tcp_listeners():
    return {line.split()[3] for line in run(["ss", "-H", "-lnt"]).stdout.decode().splitlines()}


def only_lab_listeners(baseline):
    need(tcp_listeners() - baseline == {"127.0.0.1:24443", "127.0.0.1:25556", "127.0.0.1:28080"},
         "new-listeners-must-be-exact-loopback-lab-only")
    return True


def ready(private):
    value = json.loads(STATUS.read_bytes())
    need(value.get("state") == "ready" and value.get("ready") is True and value.get("errorCode") is None,
         "connector-not-ready")
    need(time.time() - value.get("updatedAt", 0) < 30, "connector-stale-status")
    pid = int(run(["systemctl", "show", CONNECTOR, "--property=MainPID", "--value"]).stdout)
    need(pid > 0 and value.get("pid") == pid, "connector-status-pid")
    doctor = json.loads(run(["/opt/moxbot-host-test/bin/moxbot-host", "doctor"]).stdout)
    need(doctor.get("hostId") == value.get("deviceId") and doctor.get("runtime", {}).get("node") == "24.20.0"
         and doctor.get("runtime", {}).get("sdkBinaryPresent") is True
         and doctor.get("activeSession") is None and doctor.get("stopping") is False, "real-Node-doctor")
    db = db_snapshot(private)
    need(len(db["sessions"]) == 1 and db["principals"] == 1 and len(db["devices"]) == 1
         and db["devices"][0][0] == doctor["hostId"] and db["devices"][0][1] == 1
         and db["devices"][0][3] == "ready" and db["devices"][0][4] == db["devices"][0][5]
         and db["devices"][0][6] > 0 and db["catalogs"] == 1 and db["items"] == 0,
         "real-AuthStore-membership-empty-catalog-ready")
    return db


def browser_flow(payload):
    environment_guard()
    need(set(payload) == {"url", "email", "password"}, "browser-input-contract")
    parsed = urlsplit(payload["url"])
    need(parsed.scheme == "https" and parsed.netloc == "127.0.0.1:24443" and parsed.path == "/dex/auth"
         and not parsed.fragment, "browser-origin-fence")
    from playwright.sync_api import sync_playwright
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        try:
            context = browser.new_context()  # normal TLS; no traces, HAR, recording or screenshots
            page = context.new_page()
            page.set_default_timeout(15000)
            page.goto(payload["url"], wait_until="domcontentloaded")
            if page.locator("#login").count() == 0:
                page.locator('a[href*="/auth/local"]').click()
            page.locator("#login").fill(payload["email"])
            page.locator("#password").fill(payload["password"])
            page.locator("#submit-login").click()
            page.locator('form:has(input[name="approval"][value="approve"]) button').click()
            page.wait_for_url(ORIGIN + "/auth/callback?**", wait_until="domcontentloaded")
            need(page.title() == "Sign-in complete", "real-OIDC-callback-page")
            context.close()
        finally:
            browser.close()


def install_with_browser(private, browser_home, email, password, action):
    # Deliberately the literal public curl | sudo bash command, with ordinary TLS.
    command = f"set -o pipefail; curl --fail --silent --show-error {ORIGIN}/host/install.sh | sudo bash -s -- --instance {ORIGIN}"
    child = subprocess.Popen(["bash", "-c", command], stdout=subprocess.PIPE,
                             stderr=subprocess.STDOUT, start_new_session=True)
    output = bytearray()
    seen = False
    interrupt_at = None
    interrupted = False
    cancellation_identity = None
    selector = selectors.DefaultSelector()
    selector.register(child.stdout, selectors.EVENT_READ)
    deadline = time.monotonic() + 270
    try:
        while selector.get_map():
            need(time.monotonic() < deadline, "install-browser-deadline")
            if interrupt_at is not None and time.monotonic() >= interrupt_at and not interrupted:
                # Only this installation's process group, never the lab servers
                # or systemd units. M owns the cancellation/revocation operation.
                need(child.poll() is None, "installer-exited-before-native-cancel")
                interrupted = True
                os.killpg(child.pid, signal.SIGINT)
            for key, _ in selector.select(timeout=0.5):
                block = os.read(key.fd, 65536)
                if not block:
                    selector.unregister(key.fileobj)
                    continue
                output.extend(block)
                need(len(output) < 2 * 1024**2, "install-output-bound")
                # Product owned-auth-start emits one complete JSON line.
                for line in bytes(output).splitlines():
                    try:
                        value = json.loads(line)
                    except (ValueError, UnicodeDecodeError):
                        continue
                    if isinstance(value, dict) and "authorizationUrl" in value and not seen:
                        need(action in {"authorize", "cancel"}, "unexpected-browser-request")
                        seen = True
                        if action == "cancel":
                            cancellation_identity = installed_identity_hashes()
                            interrupt_at = time.monotonic() + 1
                            continue
                        payload = {"url": value["authorizationUrl"], "email": email, "password": password}
                        env = {key: val for key, val in os.environ.items() if key not in {"DEBUG", "PWDEBUG"}}
                        env["HOME"] = str(browser_home)
                        result = run([sys.executable, str(Path(__file__).resolve()), "--browser"],
                                     data=json.dumps(payload).encode(), timeout=75, env=env, check=False)
                        need(result.returncode == 0 and result.stdout == b"browser-passed\n", "real-Chromium-flow-failed")
        exit_code = child.wait(timeout=10)
        if action == "reject":
            need(exit_code != 0 and not seen and b"MoXBots Host ready." not in output,
                 "bad-digest-command-must-reject")
            need(b"release SHA-256/size mismatch; no installer was executed" in output,
                 "bad-digest-must-fail-at-actual-SHA-gate")
            return True
        if action == "cancel":
            need(exit_code != 0 and seen and interrupted and b"MoXBots Host ready." not in output,
                 "canceled-command-must-not-succeed")
            need(installed_identity_hashes() == cancellation_identity, "native-cancel-preserves-Host-identity-config-KEKs")
            return cancellation_identity
        need(exit_code == 0, "public-command-failed")
        need(b"MoXBots Host ready." in output, "public-command-final-ready")
        need(seen == (action == "authorize"), "browser-count-contract")
        return True
    finally:
        selector.close()
        if child.poll() is None:
            os.killpg(child.pid, signal.SIGTERM)
            try:
                child.wait(timeout=10)
            except subprocess.TimeoutExpired:
                os.killpg(child.pid, signal.SIGKILL)
                child.wait(timeout=5)
        output.clear()


def accept(args):
    guard(args)
    args.output.mkdir(mode=0o755)
    summary = {"schemaVersion": 1, "productSource": PRODUCT, "releaseId": RELEASE,
        "harnessSource": run(["git", "-c", "safe.directory=*", "-C", str(Path(__file__).resolve().parents[2]), "rev-parse", "HEAD"]).stdout.decode().strip(),
        "mode": args.mode, "steps": [], "passed": False,
        "serviceArtifact": {"runId": "39093243842", "artifactId": "12123324723", "name": "owned-agentnet-auth-linux",
                            "sha256": SERVICE_SHA, "bytes": 27513232},
        "immutablePayloads": {name: {"sha256": pin[1], "bytes": pin[0]} for name, pin in PINS.items()},
        "reboot": "not-tested: GitHub-hosted runner has no supported resume after VM reboot",
        "productionAccountOrUIAcceptance": "not-tested: synthetic isolated lab account only",
        "freshExpiry": "not-tested: existing offline expiry rejection tests are separate evidence",
        "modelInvoked": False, "businessTaskCreated": False, "executionEnabled": False}

    def save():
        (args.output / "summary.json").write_text(json.dumps(summary, indent=2) + "\n")

    def step(name, operation):
        summary["currentGate"] = name
        save()
        start = time.monotonic()
        result = operation()
        summary["steps"].append({"gate": name, "passed": True, "seconds": round(time.monotonic() - start, 3)})
        save()
        print("passed: " + name, flush=True)
        return result

    processes = []
    container = "moxbots-browser-lab-" + uuid.uuid4().hex
    container_started = False
    ca_installed = None
    installation_attempted = False
    baseline_listeners = tcp_listeners()
    os.umask(0o077)
    with tempfile.TemporaryDirectory(prefix="moxbots-browser-lab-", dir=os.environ["RUNNER_TEMP"]) as scratch:
        private = Path(scratch)
        try:
            binary = step("exact-M-service-artifact", lambda: verify_service(args))
            web = step("exact-M-public-bytes-and-launcher", lambda: prepare_candidate(args, private))
            ca_installed, browser_home = step("normal-OS-and-Chromium-CA-trust", lambda: install_ca(private))
            need(shutil.which("docker") is not None, "docker-required")
            run(["docker", "info"], timeout=20)
            # Real source bootstrap creates only synthetic Dex configuration; no AuthStore sessions are injected.
            bootstrap = load_module("browser_M_Dex_bootstrap", args.product_source / "services/agentnet/deploy/bootstrap_auth.py")
            need(bootstrap.DEX_IMAGE == DEX_IMAGE, "source-Dex-version-pin")
            email, password = "host-browser-lab@example.invalid", secrets.token_urlsafe(32)
            dex = private / "dex"
            bootstrap.prepare(dex, ORIGIN + "/dex", ORIGIN + "/auth/callback", email, "Disposable Host lab", password)
            config = json.loads((dex / "dex.json").read_bytes())
            config["web"] = {"http": "127.0.0.1:25556"}
            private_write(dex / "dex.json", json.dumps(config))
            private_write(private / "nginx.conf", nginx_config(private, web))
            run(["nginx", "-t", "-c", str(private / "nginx.conf")])
            processes.append(subprocess.Popen(["nginx", "-c", str(private / "nginx.conf")], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL))
            # Host network + explicit loopback web bind avoids any docker NAT/public listener.
            container_started = True  # also clean up an uncertain docker-start response
            run(["docker", "run", "--detach", "--name", container, "--network=host", "--read-only", "--user=0:0",
                 "--cap-drop=ALL", "--security-opt=no-new-privileges:true", "--log-driver=none",
                 "--mount", f"type=bind,src={dex},dst=/etc/dex,readonly",
                 "--mount", f"type=bind,src={dex}/dex-state,dst=/var/dex",
                 "--tmpfs", "/tmp:rw,noexec,nosuid,size=16m", DEX_IMAGE, "dex", "serve", "/etc/dex/dex.json"], timeout=120)
            def discovery():
                with urllib.request.urlopen(ORIGIN + "/dex/.well-known/openid-configuration", timeout=3) as response:
                    return json.load(response).get("issuer") == ORIGIN + "/dex"
            step("real-Dex-normal-TLS-discovery", lambda: wait_for(discovery))
            state = private / "service-state"
            state.mkdir(mode=0o700)
            keys = private / "identity-keys.json"
            run([str(binary), "--initialize-identity-keys", str(keys)])
            config = {"issuer": ORIGIN + "/dex", "client_id": "myagents-agentnet",
                "client_secret": (dex / "oidc-client-secret").read_text(), "callback_url": ORIGIN + "/auth/callback",
                "network_id": str(uuid.uuid4()), "state_dir": str(state), "listen": "127.0.0.1:28080",
                "ca_bundle": str(private / "lab-ca.crt"), "session_ttl_seconds": 60 if args.mode == "renewal" else 86400,
                "identity": {"issuer": ORIGIN, "service_id": str(uuid.uuid4()), "environment": "development", "key_file": str(keys)},
                "network": {"name": "Isolated disposable Host browser lab"}, "relay": True, "execution": False}
            private_write(private / "service.json", json.dumps(config))
            processes.append(subprocess.Popen([str(binary), "--config", str(private / "service.json")],
                                               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL))
            def health():
                with urllib.request.urlopen(ORIGIN + "/health", timeout=3) as response:
                    return response.status == 200
            step("real-M-service-normal-TLS-health", lambda: wait_for(health))
            step("lab-listeners-bind-loopback-only", lambda: only_lab_listeners(baseline_listeners))
            original_index = (web / "host/stable.json").read_bytes()
            damaged = index()
            damaged["bundleSha256"] = "0" * 64
            (web / "host/stable.json").write_text(json.dumps(damaged, indent=2) + "\n")
            installation_attempted = True
            try:
                step("real-curl-bad-bundle-digest-rejected", lambda: install_with_browser(private, browser_home, email, password, "reject"))
                # Run the original guarded no-namespace/account/unit checks again;
                # only the output location differs because summary now exists.
                namespace_guard = load_module("post_rejection_namespace_guard", Path(__file__).with_name("systemd-acceptance.py"))
                namespace_guard.guard(argparse.Namespace(source_root=args.product_source, source_commit=PRODUCT,
                    host_artifact_dir=args.product_source, network_artifact_dir=args.product_source,
                    output=args.output.parent / ("host-browser-never-created-" + uuid.uuid4().hex)))
                step("bad-digest-created-no-Host-unit-account-or-state", lambda: True)
            finally:
                (web / "host/stable.json").write_bytes(original_index)
            canceled_identity = step("fresh-authorization-interrupt-uses-M-native-cancel", lambda:
                install_with_browser(private, browser_home, email, password, "cancel"))
            canceled = db_snapshot(private)
            need(canceled["sessions"] == [] and canceled["principals"] == 0 and canceled["rotations"] == 0
                 and canceled["catalogs"] == 0 and hits(route_counts(private), "join") == 0
                 and hits(route_counts(private), "cancel") >= 1, "native-cancel-no-account-session-or-join")
            need(not json.loads(STATUS.read_bytes()).get("ready", False), "canceled-install-not-Ready")
            need(run(["systemctl", "is-active", "--quiet", CONNECTOR], check=False).returncode != 0,
                 "canceled-install-connector-inactive")
            step("canceled-install-no-Ready-or-join-and-identity-preserved", lambda: True)
            step("same-command-resume-real-Chromium-OIDC-auto-join", lambda:
                install_with_browser(private, browser_home, email, password, "authorize"))
            need(installed_identity_hashes().items() >= canceled_identity.items(), "resume-preserves-original-Host-identity-config-KEKs")
            first = step("real-DPoP-empty-catalog-and-Ready", lambda: wait_for(lambda: ready(private)))
            counts = route_counts(private)
            need(hits(counts, "start") == 2 and completed_polls(counts) == 1 and hits(counts, "callback") == 1
                 and hits(counts, "dex-token") == 1 and hits(counts, "join", dpop=True) == 1
                 and hits(counts, "catalog", dpop=True) >= 1, "browser-auth-and-DPoP-route-evidence")
            for unit in (NODE, CONNECTOR):
                run(["systemctl", "is-active", "--quiet", unit])
                run(["systemctl", "is-enabled", "--quiet", unit])
            before_files = persistent_hashes()
            before_pid = node_pid()
            step("same-command-repeat-without-browser", lambda: install_with_browser(private, browser_home, email, password, "repeat"))
            second = ready(private)
            second_counts = route_counts(private)
            need(before_pid > 0 and node_pid() == before_pid and persistent_hashes() == before_files,
                 "repeat-keeps-Node-PID-identity-config-ciphertext")
            need(first["sessions"] == second["sessions"] and first["rotations"] == second["rotations"]
                 and first["devices"][0][1:3] == second["devices"][0][1:3], "repeat-keeps-auth-membership")
            need(all(hits(counts, route, False) == hits(second_counts, route, False)
                     for route in ("start", "poll", "callback", "dex-token", "join", "renew")), "repeat-zero-login-join-renewal")
            step("repeat-idempotence-state-and-traffic", lambda: True)
            summary["persistentFileSha256"] = before_files
            stable = persistent_hashes(include_accounts=False)
            if args.mode == "renewal":
                def renewed():
                    current = ready(private)
                    need(current["rotations"] > second["rotations"] and current["sessions"][0][3] != second["sessions"][0][3]
                         and current["sessions"][0][4] > second["sessions"][0][4], "natural-session-rotation-pending")
                    return current
                third = step("natural-60s-AuthStore-token-rotation", lambda: wait_for(renewed, timeout=70))
                need(third["sessions"][0][:3] == second["sessions"][0][:3] and third["sessions"][0][5] is None
                     and third["devices"][0][7:] == second["devices"][0][7:] and node_pid() == before_pid
                     and persistent_hashes(False) == stable, "natural-renewal-preserves-identity-and-Node")
                need(hits(route_counts(private), "renew", dpop=True) > hits(second_counts, "renew", dpop=True), "natural-renewal-DPoP-proof")
            else:
                third = second
            pid = int(run(["systemctl", "show", CONNECTOR, "--property=MainPID", "--value"]).stdout)
            run(["systemctl", "restart", CONNECTOR], timeout=40)
            fourth = step("connector-systemd-restart-recovers-Ready", lambda: wait_for(lambda: ready(private)))
            need(int(run(["systemctl", "show", CONNECTOR, "--property=MainPID", "--value"]).stdout) != pid,
                 "restart-must-replace-connector-PID")
            need(node_pid() == before_pid and persistent_hashes(False) == stable
                 and fourth["sessions"][0][:3] == third["sessions"][0][:3]
                 and fourth["devices"][0][1:3] == third["devices"][0][1:3]
                 and fourth["devices"][0][7:] == third["devices"][0][7:], "restart-preserves-original-identity-session-membership")
            step("Host-opened-no-new-TCP-listener", lambda: only_lab_listeners(baseline_listeners))
            summary["browserAuthorizations"] = 1
            summary["freshCancellationAndSameCommandResumeObserved"] = True
            summary["badDigestRejectedBeforeInstallation"] = True
            summary["naturalRotationObserved"] = args.mode == "renewal"
            summary["passed"] = True
            summary.pop("currentGate", None)
        except Exception as error:
            summary["failureGate"] = str(error) if isinstance(error, Rejected) else "unexpected-lab-error-redacted"
            raise Rejected(summary["failureGate"]) from None
        finally:
            # Only resources owned by this guarded invocation; never enumerate/kill other processes.
            cleanup_ok = True
            if installation_attempted:
                for unit in (CONNECTOR, NODE):
                    try:
                        run(["systemctl", "stop", unit], timeout=30, check=False)
                        need(run(["systemctl", "is-active", "--quiet", unit], timeout=15, check=False).returncode != 0,
                             "owned-unit-still-active-after-cleanup")
                    except Rejected:
                        cleanup_ok = False
            for process in reversed(processes):
                if process.poll() is None:
                    process.terminate()
                    try:
                        process.wait(timeout=10)
                    except subprocess.TimeoutExpired:
                        process.kill()
                        process.wait(timeout=5)
            if container_started:
                try:
                    run(["docker", "rm", "--force", container], timeout=30)
                except Rejected:
                    cleanup_ok = False
            if ca_installed is not None:
                ca_installed.unlink(missing_ok=True)
                try:
                    run(["update-ca-certificates"], timeout=60)
                except Rejected:
                    cleanup_ok = False
            summary["cleanupCompleted"] = cleanup_ok
            if not cleanup_ok:
                summary["passed"] = False
            save()
    need(summary["passed"], "lab-or-cleanup-failed")


def main():
    if sys.argv[1:] == ["--browser"]:
        try:
            raw = sys.stdin.buffer.read(32769)
            need(len(raw) <= 32768, "browser-payload-bound")
            browser_flow(json.loads(raw))
            print("browser-passed")
            return 0
        except Exception:
            print("browser-failed-redacted", file=sys.stderr)
            return 1
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--product-source", required=True, type=Path)
    parser.add_argument("--service-artifact", type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--mode", choices=("standard", "renewal"), default="standard")
    parser.add_argument("--preflight", action="store_true")
    args = parser.parse_args()
    try:
        if args.preflight:
            guard(args)
            print("passed: disposable-VM-preflight")
        else:
            accept(args)
        return 0
    except Exception as error:
        # Unexpected parser/OS/Playwright exceptions can include URL/state/code/input.
        print("HOST_BROWSER_ACCEPTANCE_REJECTED: " + (str(error) if isinstance(error, Rejected) else "redacted-error"), file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
