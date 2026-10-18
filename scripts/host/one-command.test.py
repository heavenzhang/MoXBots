#!/usr/bin/env python3
"""Offline trust-boundary, local TLS, release and orchestration regressions."""
from __future__ import annotations

import fcntl
import hashlib
import http.server
import importlib.util
import io
import json
import os
import pathlib
import ssl
import subprocess
import tarfile
import tempfile
import threading
import types
import unittest
from unittest import mock

SCRIPTS = pathlib.Path(__file__).resolve().parent
def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module
c = load("onboard_test", SCRIPTS / "one-command.py")
p = load("prepare_test", SCRIPTS / "prepare-release.py")
SOURCE = "a" * 40
RELEASE = "20261018090000-" + SOURCE[:12]
DEVICE = "11111111-2222-4333-8444-555555555555"
def digest(raw):
    return hashlib.sha256(raw).hexdigest()
def index():
    return {"schemaVersion": 1, "status": "available", "profile": "moxbot-test", "platform": c.PLATFORM,
        "scriptPath": "/host/install.sh", "releaseId": RELEASE, "sourceCommit": SOURCE,
        "bootstrapPath": f"/host/releases/{RELEASE}/bootstrap.py", "bootstrapSha256": "b" * 64, "bootstrapBytes": 100,
        "bundlePath": f"/host/releases/{RELEASE}/bundle.tar.gz", "bundleSha256": "c" * 64, "bundleBytes": 100}
def archive_bytes(files, extra=None):
    raw = io.BytesIO()
    with tarfile.open(fileobj=raw, mode="w:gz", format=tarfile.USTAR_FORMAT) as tf:
        for name, (data, mode) in files.items():
            entry = tarfile.TarInfo(name)
            entry.mode, entry.size = mode, len(data)
            tf.addfile(entry, io.BytesIO(data))
        if extra:
            tf.addfile(extra)
    return raw.getvalue()
def host_fixture(**change):
    data = b"#!/bin/sh\nexit 0\n"
    paths = ["resources/nodejs/bin/node", "resources/claude-agent-sdk/claude"]
    manifest = {"schemaVersion": 1, "profile": "moxbot-test", "target": "linux-x64-glibc",
        "sourceCommit": SOURCE, "sourceDirty": False, "releaseId": RELEASE,
        "files": [{"path": x, "sha256": digest(data), "mode": 0o755, "size": len(data)} for x in paths]}
    manifest.update(change)
    prefix = f"moxbot-host-test/releases/{RELEASE}/"
    files = {prefix + x: (data, 0o755) for x in paths}
    files[prefix + "manifest.json"] = (json.dumps(manifest).encode(), 0o644)
    return archive_bytes(files)
def elf():
    data = bytearray(64)
    data[:6] = b"\x7fELF\x02\x01"
    data[18:20] = (62).to_bytes(2, "little")
    return bytes(data)
def bundle_fixture(host=None, changes=None, extra=None):
    files = {"host.tar.gz": (host or host_fixture(), 0o644),
        "network/myagents-host-network": (elf(), 0o755), "network/source-commit.txt": ((SOURCE + "\n").encode(), 0o644)}
    files.update({"installers/" + x: ((SCRIPTS / x).read_bytes(), 0o755 if x == "install.sh" else 0o644) for x in c.INSTALLERS})
    manifest = {"schemaVersion": 1, "profile": "moxbot-test", "platform": c.PLATFORM,
        "sourceCommit": SOURCE, "releaseId": RELEASE, "files": {name: {"sha256": digest(raw),
        "size": len(raw), "mode": mode} for name, (raw, mode) in files.items()}}
    if changes:
        changes(manifest, files)
    files["manifest.json"] = (json.dumps(manifest).encode(), 0o644)
    return archive_bytes(files, extra)


class ReleaseValidation(unittest.TestCase):
    def test_strict_index_and_same_origin_paths(self):
        self.assertEqual(c.validate_index(index()), index())
        for key, value in [("schemaVersion", True), ("status", "ready"), ("profile", "myagents-test"),
                           ("platform", "linux-arm64"), ("sourceCommit", "d" * 40), ("bundleBytes", True),
                           ("bootstrapBytes", 262145), ("bundleBytes", c.MAX_BUNDLE + 1),
                           ("bundlePath", "https://evil.example/a"), ("bundlePath", "/host/../secret"),
                           ("bundlePath", f"/host/releases/{RELEASE}/bundle.tar.gz?token=secret"),
                           ("bundlePath", f"/host/releases/{RELEASE}/%62undle.tar.gz")]:
            value_index = index(); value_index[key] = value
            with self.subTest(key=key, value=value), self.assertRaises(c.Rejected):
                c.validate_index(value_index)
        with self.assertRaises(c.Rejected):
            c.validate_index({"schemaVersion": 1, "status": "unavailable"})
        with self.assertRaises(c.Rejected):
            c.strict_json(b'{"status":"available","status":"unavailable"}')

    def test_origin_rejects_credentials_nonhttps_and_noncanonical_input(self):
        for value in ["http://owned.example", "https://u:p@owned.example", "https://owned.example/", "https://Owned.example",
                      "https://owned.example?x=a", "https://owned.example#x", "https://evil.example/../", "https://owned..example",
                      "https://owned.example:0", "https://owned.example:443", "https://owned.example:443/path"]:
            with self.subTest(value=value), self.assertRaises(c.Rejected):
                c.origin(value)
        self.assertEqual(c.origin("https://owned.example:8443"), "https://owned.example:8443")

    def test_supported_os_and_architecture_are_enforced(self):
        for os_name, machine, text in [("darwin", "x86_64", "ID=ubuntu\nVERSION_ID=24.04"),
            ("linux", "aarch64", "ID=ubuntu\nVERSION_ID=24.04"), ("linux", "x86_64", "ID=ubuntu\nVERSION_ID=22.04"),
            ("linux", "x86_64", "ID=debian\nVERSION_ID=24.04")]:
            with (self.subTest(os_name=os_name, machine=machine, text=text), mock.patch.object(c.sys, "platform", os_name),
                  mock.patch.object(c.platform, "machine", return_value=machine), mock.patch.object(pathlib.Path, "read_text", return_value=text)):
                with self.assertRaises(c.Rejected):
                    c.require_platform()
        with (mock.patch.object(c.sys, "platform", "linux"), mock.patch.object(c.platform, "machine", return_value="x86_64"),
              mock.patch.object(pathlib.Path, "read_text", return_value='ID=ubuntu\nVERSION_ID="24.04"')):
            c.require_platform()

    def unpack(self, raw):
        with tempfile.TemporaryDirectory() as temp:
            root = pathlib.Path(temp)
            archive = root / "bundle.tar.gz"; archive.write_bytes(raw)
            target = root / "out"; target.mkdir()
            return c.unpack_bundle(archive, target, index())

    def test_valid_complete_bundle_and_host_manifest(self):
        self.assertEqual(self.unpack(bundle_fixture())["sourceCommit"], SOURCE)

    def test_source_profile_dirty_and_internal_file_tampering_rejected(self):
        for changes in ({"sourceCommit": "b" * 40}, {"profile": "myagents-test"}, {"sourceDirty": True}, {"target": "linux-arm64"}):
            with self.subTest(changes=changes), self.assertRaises(c.Rejected):
                self.unpack(bundle_fixture(host=host_fixture(**changes)))
        for change in [lambda m, f: m.update(sourceCommit="b" * 40), lambda m, f: m.update(profile="myagents-test"),
                       lambda m, f: f.update({"installers/install.sh": (b"modified", 0o755)}),
                       lambda m, f: f.update({"network/source-commit.txt": (b"bad\n", 0o644)})]:
            with self.subTest(change=change), self.assertRaises(c.Rejected):
                self.unpack(bundle_fixture(changes=change))

    def test_archive_traversal_link_duplicate_and_special_entries_rejected(self):
        for name, kind in [("../outside", tarfile.REGTYPE), ("/tmp/outside", tarfile.REGTYPE),
                           ("network/link", tarfile.SYMTYPE), ("network/hardlink", tarfile.LNKTYPE),
                           ("network/fifo", tarfile.FIFOTYPE), ("host.tar.gz", tarfile.REGTYPE),
                           ("network/./odd", tarfile.REGTYPE)]:
            item = tarfile.TarInfo(name); item.type = kind; item.linkname = "../../outside"
            with self.subTest(name=name, kind=kind), self.assertRaises(c.Rejected):
                self.unpack(bundle_fixture(extra=item))

    def test_prepare_emits_reviewable_exact_source_candidate_and_never_overwrites(self):
        with tempfile.TemporaryDirectory() as temp:
            root = pathlib.Path(temp)
            host = root / "host.tar.gz"; host.write_bytes(host_fixture())
            network = root / "network"; network.mkdir()
            (network / "myagents-host-network").write_bytes(elf())
            (network / "source-commit.txt").write_text(SOURCE + "\n")
            out = root / "prepared"
            with mock.patch.object(p, "clean_source", return_value=SOURCE):
                metadata = p.prepare(host, network, out)
                self.assertEqual(metadata, json.loads((out / "stable.json").read_bytes()))
                self.assertEqual(metadata["bundleSha256"], p.sha(out / "releases" / RELEASE / "bundle.tar.gz"))
                compile((out / "releases" / RELEASE / "bootstrap.py").read_bytes(), "bootstrap.py", "exec")
                script = (out / "install.sh").read_text()
                self.assertIn('exec python3 - "$@"', script)
                self.assertFalse(json.loads((out / "release-review.json").read_bytes())["publisherSignature"])
                with self.assertRaises(p.consumer.Rejected):
                    p.prepare(host, network, out)
            self.assertEqual(set(root.iterdir()), {host, network, out})

    def test_prepare_rejects_dirty_source(self):
        with (mock.patch.object(p.subprocess, "check_output", side_effect=[SOURCE + "\n", b" M scripts/host/one-command.py"]),
              self.assertRaises(p.consumer.Rejected)):
            p.clean_source()


class HTTPSBoundary(unittest.TestCase):
    def test_local_verified_https_download_hash_limit_redirect_and_http_rejection(self):
        with tempfile.TemporaryDirectory() as temp:
            root = pathlib.Path(temp)
            key, cert = root / "key.pem", root / "cert.pem"
            subprocess.run(["openssl", "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", str(key),
                "-out", str(cert), "-days", "1", "-subj", "/CN=localhost", "-addext", "subjectAltName=DNS:localhost"],
                check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            class Handler(http.server.BaseHTTPRequestHandler):
                def log_message(self, *args): pass
                def do_GET(self):
                    if self.path == "/host/stable.json":
                        data = b'{"schemaVersion":1,"status":"unavailable"}'
                        self.send_response(200); self.send_header("Content-Length", str(len(data))); self.end_headers(); self.wfile.write(data)
                    else:
                        self.send_response(302); self.send_header("Location", "https://foreign.example/payload"); self.end_headers()
            server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Handler)
            context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER); context.load_cert_chain(cert, key)
            server.socket = context.wrap_socket(server.socket, server_side=True)
            thread = threading.Thread(target=server.serve_forever, daemon=True); thread.start()
            instance = f"https://localhost:{server.server_port}"
            try:
                with mock.patch.dict(os.environ, {"SSL_CERT_FILE": str(cert)}):
                    c.download(instance, "/host/stable.json", root / "good", 16384)
                    raw = (root / "good").read_bytes()
                    c.download(instance, "/host/stable.json", root / "equal", 16384, digest(raw), len(raw))
                    for name, limit, sha, exact in [("tampered", 16384, "0" * 64, len(raw)), ("oversize", 2, None, None),
                                                    ("bad-size", 16384, None, len(raw) + 1)]:
                        with self.subTest(name=name), self.assertRaises(c.Rejected):
                            c.download(instance, "/host/stable.json", root / name, limit, sha, exact)
                    with self.assertRaises(c.Rejected):
                        c.download(instance, f"/host/releases/{RELEASE}/bundle.tar.gz", root / "redirect", 4096)
                    with self.assertRaises(c.Rejected):
                        c.download("http://localhost", "/host/stable.json", root / "http", 4096)
            finally:
                server.shutdown(); server.server_close(); thread.join()


class Orchestration(unittest.TestCase):
    def test_one_transaction_lock_survives_child_installer_through_browser_flow(self):
        with tempfile.TemporaryDirectory() as temp:
            root = pathlib.Path(temp)
            lock = root / "transaction.lock"
            fd = os.open(lock, os.O_RDWR | os.O_CREAT, 0o600)
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
            manifest = {"files": {"host.tar.gz": {"sha256": "a" * 64},
                                  "network/myagents-host-network": {"sha256": "b" * 64}}}
            calls = []
            def install(args):
                calls.append("installed")
                os.close(int(os.environ["MYAGENTS_HOST_TRANSACTION_LOCK_FD"]))
            def onboard(control):
                calls.append("onboard")
                foreign = os.open(lock, os.O_RDWR)
                try:
                    with self.assertRaises(BlockingIOError):
                        fcntl.flock(foreign, fcntl.LOCK_EX | fcntl.LOCK_NB)
                finally:
                    os.close(foreign)
                return DEVICE
            unified = types.SimpleNamespace(_acquire_lock=lambda: fd, install=install)
            with (mock.patch.object(c, "unpack_bundle", return_value=manifest),
                  mock.patch.object(c, "load_module", side_effect=[unified, object()]),
                  mock.patch.object(c, "onboard", side_effect=onboard),
                  mock.patch.dict(os.environ, {}, clear=True)):
                self.assertEqual(c.consume("https://owned.example", index(), root / "bundle", root), DEVICE)
                self.assertNotIn("MYAGENTS_HOST_TRANSACTION_LOCK_FD", os.environ)
            self.assertEqual(calls, ["installed", "onboard"])
            foreign = os.open(lock, os.O_RDWR)
            try:
                fcntl.flock(foreign, fcntl.LOCK_EX | fcntl.LOCK_NB)
            finally:
                os.close(foreign)

    def control(self, outcomes):
        calls = []
        def run(command, profile, **kwargs):
            calls.append((command, kwargs.get("enable_on_boot", False)))
            value = outcomes.get(command, [0])
            item = value.pop(0) if len(value) > 1 else value[0]
            if isinstance(item, BaseException): raise item
            return item
        return types.SimpleNamespace(select_profile=lambda p: None, verified_host_id=lambda: DEVICE,
            DAEMON_UNIT="moxbot-host-network-test.service", run_control=run, __file__=str(SCRIPTS / "network-control.py")), calls

    def test_existing_ready_install_is_no_login_no_renew_no_join(self):
        control, calls = self.control({})
        with (mock.patch.object(c.subprocess, "run", return_value=types.SimpleNamespace(returncode=0)) as run,
              mock.patch.object(c, "node_ready") as ready):
            self.assertEqual(c.onboard(control), DEVICE)
            self.assertEqual(calls, [("run", True)])
            self.assertEqual(run.call_count, 1)
            ready.assert_called_once_with(DEVICE)

    def test_existing_auth_partial_attempt_joins_without_new_login(self):
        control, calls = self.control({"run": [ValueError("not joined")]})
        with (mock.patch.object(c.subprocess, "run", return_value=types.SimpleNamespace(returncode=3)), mock.patch.object(c, "node_ready")):
            self.assertEqual(c.onboard(control), DEVICE)
        self.assertEqual(calls, [("run", True), ("join", True)])

    def test_browser_success_renews_existing_same_principal_then_autojoin(self):
        control, calls = self.control({"run": [ValueError("signed out")], "join": [ValueError("signed out"), 0]})
        with (mock.patch.object(c.subprocess, "run", return_value=types.SimpleNamespace(returncode=3)),
              mock.patch.object(c, "renew_management", side_effect=["OWNED_REAUTH_REQUIRED", "OK"]) as renewal,
              mock.patch.object(c, "node_ready")):
            self.assertEqual(c.onboard(control), DEVICE)
            self.assertEqual(renewal.call_count, 2)
        self.assertEqual(calls, [("run", True), ("join", True), ("start", False), ("wait", False), ("join", True)])

    def test_fresh_missing_grant_permits_join_but_other_principal_never_does(self):
        for code, accepted in [("HOST_MANAGEMENT_GRANT_MISSING", True), ("HOST_MANAGEMENT_REBIND_REQUIRED", False),
                               ("HOST_MANAGEMENT_GRANT_CORRUPT", False)]:
            control, calls = self.control({"run": [ValueError("out")], "join": [ValueError("out"), 0]})
            with (mock.patch.object(c.subprocess, "run", return_value=types.SimpleNamespace(returncode=3)),
                  mock.patch.object(c, "renew_management", side_effect=["OWNED_REAUTH_REQUIRED", "OK" if code == "OK" else code]),
                  mock.patch.object(c, "node_ready"), self.subTest(code=code)):
                if accepted: self.assertEqual(c.onboard(control), DEVICE)
                else:
                    with self.assertRaises(c.Rejected): c.onboard(control)
                    self.assertEqual(calls[-1][0], "wait")

    def test_canceled_expired_auth_and_existing_running_failure_never_join_or_delete(self):
        for auth in [1, 130]:
            control, calls = self.control({"run": [ValueError("out")], "join": [ValueError("out")], "wait": [auth]})
            with (mock.patch.object(c.subprocess, "run", return_value=types.SimpleNamespace(returncode=3)),
                  mock.patch.object(c, "renew_management", return_value="OWNED_REAUTH_REQUIRED"), self.assertRaises(c.Rejected)):
                c.onboard(control)
            self.assertEqual(calls[-1], ("wait", False))
        control, calls = self.control({"run": [ValueError("busy")]})
        with (mock.patch.object(c.subprocess, "run", return_value=types.SimpleNamespace(returncode=0)), self.assertRaises(c.Rejected)):
            c.onboard(control)
        self.assertEqual(calls, [("run", True)])

    def test_transport_or_corrupt_scope_failure_never_starts_auth(self):
        for reason in ["NETWORK_TRUST_CHANGED", "HOST_MANAGEMENT_GRANT_CORRUPT", "HOST_MANAGEMENT_REBIND_REQUIRED", "TRANSPORT_UNAVAILABLE"]:
            control, calls = self.control({"run": [ValueError("failed")], "join": [ValueError("failed")]})
            with (mock.patch.object(c.subprocess, "run", return_value=types.SimpleNamespace(returncode=3)),
                  mock.patch.object(c, "renew_management", return_value=reason), self.subTest(reason=reason), self.assertRaises(c.Rejected)):
                c.onboard(control)
            self.assertFalse(any(command == "start" for command, _ in calls))

    def test_terminal_interrupt_cancels_native_attempt_before_lock_release(self):
        control, calls = self.control({"run": [ValueError("out")], "join": [ValueError("out")], "wait": [KeyboardInterrupt()]})
        with (mock.patch.object(c.subprocess, "run", return_value=types.SimpleNamespace(returncode=3)),
              mock.patch.object(c, "renew_management", return_value="OWNED_REAUTH_REQUIRED"), self.assertRaises(KeyboardInterrupt)):
            c.onboard(control)
        self.assertEqual(calls[-2:], [("wait", False), ("cancel", False)])

    def test_nonsecret_renewal_diagnostics_are_closed_and_bounded(self):
        control, _ = self.control({})
        cases = [(0, b'{"status":"renewed"}', b"", "OK"),
            (1, b"", b'{"status":"error","code":"OWNED_REAUTH_REQUIRED"}', "OWNED_REAUTH_REQUIRED"),
            (0, b'{"status":"unknown"}', b"", None), (1, b"", b"no structured result", None),
            (1, b"x" * 16385, b"", None)]
        for status, out, err, expected in cases:
            with (self.subTest(out=out[:20], expected=expected), mock.patch.object(c.subprocess, "run",
                    return_value=types.SimpleNamespace(returncode=status, stdout=out, stderr=err)) as run):
                if expected: self.assertEqual(c.renew_management(control), expected)
                else:
                    with self.assertRaises(c.Rejected): c.renew_management(control)
                self.assertEqual(run.call_args.args[0][-1], "renew-management")

    def test_node_doctor_requires_exact_identity_and_runtime(self):
        good = {"hostId": DEVICE, "runtime": {"node": "24.20.0", "sdkBinaryPresent": True}}
        for data in [good, {**good, "hostId": "other"}, {"hostId": DEVICE, "runtime": {"node": "24.0.0", "sdkBinaryPresent": True}}]:
            with mock.patch.object(c.subprocess, "run", return_value=types.SimpleNamespace(stdout=json.dumps(data).encode())):
                if data == good: c.node_ready(DEVICE)
                else:
                    with self.assertRaises(c.Rejected): c.node_ready(DEVICE)

    def test_failed_new_join_stops_only_its_connector_for_rerun(self):
        control, calls = self.control({"join": [ValueError("temporary failure")]})
        with (mock.patch.object(c.subprocess, "run", return_value=types.SimpleNamespace(returncode=0)) as run,
              self.assertRaisesRegex(c.Rejected, "rerun the same command")):
            c.finish_join(control, DEVICE)
        self.assertEqual(run.call_args.args[0], ["systemctl", "stop", control.DAEMON_UNIT])
        self.assertEqual(calls, [("join", True)])


if __name__ == "__main__":
    unittest.main(verbosity=2)
