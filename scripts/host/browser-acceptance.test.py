#!/usr/bin/env python3
"""Offline harness gates. These tests never install, log in or start a daemon."""
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import signal
import stat
import subprocess
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("browser_acceptance", Path(__file__).with_name("browser-acceptance.py"))
lab = importlib.util.module_from_spec(spec)
spec.loader.exec_module(lab)
ROOT = Path(__file__).resolve().parents[2]


class Response(io.BytesIO):
    status = 200

    def geturl(self):
        return "https://expected.example/immutable"


class HarnessGates(unittest.TestCase):
    def test_candidate_snapshot_has_distinct_provenance_and_fixed_integrity(self):
        payloads = {"bootstrap.py": b"synthetic-bootstrap", "bundle.tar.gz": b"synthetic-bundle"}
        pins = {name: (len(data), hashlib.sha256(data).hexdigest()) for name, data in payloads.items()}
        for scenario in ("valid", "public-meta", "foreign-source", "tampered", "hardlink", "fifo"):
            with self.subTest(scenario=scenario), tempfile.TemporaryDirectory() as directory, patch.object(lab, "PINS", pins):
                root = Path(directory)
                incoming, restored = root / "candidate", root / "restored"
                incoming.mkdir()
                restored.mkdir()
                for name, data in payloads.items():
                    (incoming / name).write_bytes(data)
                meta = lab.candidate_meta_bytes()
                if scenario == "public-meta":
                    meta = lab.public_cache_meta_bytes()
                elif scenario == "foreign-source":
                    value = json.loads(meta)
                    value["sourceCommit"] = "0" * 40
                    meta = (json.dumps(value, sort_keys=True, indent=2) + "\n").encode()
                (incoming / "candidate-meta.json").write_bytes(meta)
                if scenario == "tampered":
                    (incoming / "bundle.tar.gz").write_bytes(b"x" * pins["bundle.tar.gz"][0])
                elif scenario == "hardlink":
                    os.link(incoming / "bundle.tar.gz", root / "linked")
                elif scenario == "fifo":
                    (incoming / "bundle.tar.gz").unlink()
                    os.mkfifo(incoming / "bundle.tar.gz")
                if scenario == "valid":
                    lab.import_payload_snapshot(incoming, restored, candidate=True)
                    self.assertEqual({p.name for p in restored.iterdir()}, set(pins))
                    for name, data in payloads.items():
                        self.assertEqual((restored / name).read_bytes(), data)
                else:
                    with self.assertRaises((lab.Rejected, OSError)):
                        lab.import_payload_snapshot(incoming, restored, candidate=True)

    def test_candidate_input_cannot_claim_public_download_or_export_public_cache(self):
        args = SimpleNamespace(candidate_payload=Path("/candidate"), candidate_run="123", candidate_artifact_id="456",
            cached_public_payload=None, cached_public_run="", cached_public_artifact_id="", export_public_cache=None)
        lab.validate_payload_inputs(args)
        value = lab.payload_input_summary(args)
        self.assertFalse(value["normalTLSFullGETThisRun"])
        self.assertIsNone(value["publicOrigin"])
        self.assertIsNone(value["firstPublicFullGETRun"])
        self.assertIsNone(value["firstPublicFullGETArtifactId"])
        self.assertEqual(value["transport"], "candidate-ci-artifact")
        self.assertEqual(value["candidateArtifactId"], "456")
        self.assertNotIn("publicOrigin", json.loads(lab.candidate_meta_bytes()))
        for field, invalid in (("candidate_run", ""), ("candidate_artifact_id", "x;secret"),
                               ("export_public_cache", Path("/export"))):
            with self.subTest(field=field):
                bad = SimpleNamespace(**{**vars(args), field: invalid})
                with self.assertRaises(lab.Rejected):
                    lab.validate_payload_inputs(bad)
        both = SimpleNamespace(**{**vars(args), "cached_public_payload": Path("/public"),
            "cached_public_run": "111", "cached_public_artifact_id": "222"})
        with self.assertRaisesRegex(lab.Rejected, "mutually-exclusive"):
            lab.validate_payload_inputs(both)

    def test_candidate_workflows_never_export_candidate_as_public_cache(self):
        browser = (ROOT / ".github/workflows/host-browser-acceptance.yml").read_text()
        reboot = (ROOT / ".github/workflows/host-reboot-acceptance.yml").read_text()
        for workflow in (browser, reboot):
            self.assertIn("repository: heavenzhang/MoXBots", workflow)
            self.assertIn('public_args=(--candidate-payload', workflow)
            self.assertIn("sum(bool(pair[0]) for pair in pairs) > 1", workflow)
        export_guard = next(line for line in browser.splitlines() if "if: always() && inputs.mode" in line)
        self.assertIn("inputs.candidate_run == '' && inputs.candidate_artifact_id == ''", export_guard)
        self.assertIn("uses: ./.github/workflows/host-candidate.yml", browser)
        self.assertIn("if: inputs.mode != 'candidate-build'", browser)
        producer = (ROOT / ".github/workflows/host-candidate.yml").read_text()
        self.assertIn("workflow_call:", producer)
        self.assertIn("ref: ${{ github.sha }}\n          path: harness", producer)
        self.assertIn("ref: ${{ inputs.source_commit }}\n          path: product", producer)
        self.assertIn('--source-root "$PWD"', producer)
        self.assertNotIn("secrets: inherit", producer + browser)

    def test_exact_M_launcher_bootstrap_and_index_reproduce_producer(self):
        source = subprocess.check_output(["git", "-C", str(ROOT), "show", lab.PRODUCT + ":scripts/host/one-command.py"])
        self.assertEqual(hashlib.sha256(lab.launcher(source)).hexdigest(), lab.INSTALL_SHA)
        bootstrap = source.replace(b"from __future__ import annotations\n",
            b"from __future__ import annotations\nEXPECTED_SOURCE_COMMIT = " + repr(lab.PRODUCT).encode() + b"\n", 1)
        self.assertEqual((len(bootstrap), hashlib.sha256(bootstrap).hexdigest()), lab.PINS["bootstrap.py"])
        consumer = lab.load_module("offline_M_index", ROOT / "scripts/host/one-command.py")
        consumer.validate_index(lab.index())
        self.assertEqual(lab.index()["sourceCommit"], lab.PRODUCT)
        self.assertEqual(lab.index()["releaseId"], lab.RELEASE)
        stable = (json.dumps(lab.index(), indent=2) + "\n").encode()
        self.assertEqual(len(stable), 643)
        self.assertEqual(hashlib.sha256(stable).hexdigest(), lab.STABLE_SHA)

    def test_bad_digest_and_oversized_transfer_fail_before_candidate_use(self):
        for size, digest in [(3, "0" * 64), (2, hashlib.sha256(b"abc").hexdigest())]:
            with self.subTest(size=size), tempfile.TemporaryDirectory() as directory:
                class Opener:
                    def open(self, url, timeout):
                        return Response(b"abc")
                with patch.object(lab.urllib.request, "build_opener", return_value=Opener()):
                    with self.assertRaises(lab.Rejected):
                        lab.get_exact("https://expected.example/immutable", Path(directory) / "candidate", size, digest)

    def test_redirected_transfer_is_not_accepted_as_immutable_bytes(self):
        class Redirected(Response):
            def geturl(self):
                return "https://foreign.example/immutable"
        class Opener:
            def open(self, url, timeout):
                return Redirected(b"abc")
        with tempfile.TemporaryDirectory() as directory, patch.object(lab.urllib.request, "build_opener", return_value=Opener()):
            with self.assertRaisesRegex(lab.Rejected, "immutable-full-get-required"):
                lab.get_exact("https://expected.example/immutable", Path(directory) / "candidate", 3, hashlib.sha256(b"abc").hexdigest())

    def test_browser_cannot_navigate_to_production_or_another_origin(self):
        for url in (lab.PUBLIC + "/dex/auth?state=secret", "https://127.0.0.1:24443/other?code=secret",
                    "http://127.0.0.1:24443/dex/auth?state=secret"):
            with self.subTest(url=url), patch.object(lab, "environment_guard"):
                with self.assertRaisesRegex(lab.Rejected, "browser-origin-fence") as error:
                    lab.browser_flow({"url": url, "email": "synthetic", "password": "synthetic"})
                self.assertNotIn("secret", str(error.exception))

    def test_secret_command_output_never_enters_failure_message(self):
        result = subprocess.CompletedProcess(["not-logged"], 1, stdout=b"authorizationUrl=secret", stderr=b"password=secret")
        with patch.object(lab.subprocess, "run", return_value=result):
            with self.assertRaisesRegex(lab.Rejected, "bounded-subprocess-rejected") as error:
                lab.run(["not-logged"])
        self.assertNotIn("secret", str(error.exception))

    def test_telemetry_rejects_url_or_header_injection_and_counts_pending_poll_separately(self):
        with tempfile.TemporaryDirectory() as directory:
            private = Path(directory)
            log = private / "route-counts.log"
            log.write_text("poll 202 0 0\npoll 200 0 0\njoin 200 1 1\n")
            counts = lab.route_counts(private)
            self.assertEqual(lab.completed_polls(counts), 1)
            self.assertEqual(lab.hits(counts, "join", dpop=True), 1)
            log.write_text("https://example.invalid?state=secret 200 0 0\n")
            with self.assertRaisesRegex(lab.Rejected, "telemetry-closed-alphabet"):
                lab.route_counts(private)

    def test_guard_rejects_non_CI_before_namespace_or_filesystem_mutation(self):
        with patch.object(lab.os, "geteuid", return_value=0), patch.dict(lab.os.environ, {}, clear=True):
            with self.assertRaisesRegex(lab.Rejected, "canonical-disposable-github-vm-only"):
                lab.environment_guard()

    def test_nginx_telemetry_has_no_secret_valued_variables(self):
        config = lab.nginx_config(Path("/private-lab"), Path("/private-lab/www"))
        self.assertIn("listen 127.0.0.1:24443 ssl;", config)
        self.assertIn("ssl_protocols TLSv1.3;", config)
        line = next(line for line in config.splitlines() if "log_format" in line)
        self.assertEqual(line.strip(), "log_format bounded '$route $status $has_dpop $has_auth';")
        self.assertNotIn("$request_uri", config)
        self.assertNotIn("$args", config)

    def test_public_cache_exports_and_imports_only_fixed_three_verified_files(self):
        payloads = {"bootstrap.py": b"synthetic-bootstrap", "bundle.tar.gz": b"synthetic-bundle"}
        pins = {name: (len(data), hashlib.sha256(data).hexdigest()) for name, data in payloads.items()}
        with tempfile.TemporaryDirectory() as directory, patch.object(lab, "PINS", pins):
            root = Path(directory)
            release, restored = root / "release", root / "restored"
            release.mkdir()
            restored.mkdir()
            for name, data in payloads.items():
                (release / name).write_bytes(data)
            exported = root / "public-cache"
            lab.export_public_cache(exported, release)
            self.assertEqual(exported.stat().st_mode & 0o777, 0o755)
            self.assertTrue(all(path.stat().st_mode & 0o777 == 0o644 for path in exported.iterdir()))
            self.assertEqual({path.name for path in exported.iterdir()}, set(pins) | {"cache-meta.json"})
            self.assertEqual((exported / "cache-meta.json").read_bytes(), lab.public_cache_meta_bytes())
            lab.import_public_cache(exported, restored)
            self.assertEqual({path.name for path in restored.iterdir()}, set(pins))
            self.assertTrue(all((restored / name).read_bytes() == data for name, data in payloads.items()))
            with self.assertRaisesRegex(lab.Rejected, "public-cache-export-must-be-new"):
                lab.export_public_cache(exported, release)

    def test_public_cache_rejects_extra_file_symlink_tampering_and_foreign_metadata(self):
        payloads = {"bootstrap.py": b"bootstrap", "bundle.tar.gz": b"bundle"}
        pins = {name: (len(data), hashlib.sha256(data).hexdigest()) for name, data in payloads.items()}
        for scenario in ("extra", "symlink", "tamper", "foreign-meta"):
            with self.subTest(scenario=scenario), tempfile.TemporaryDirectory() as directory, patch.object(lab, "PINS", pins):
                root = Path(directory)
                cache, restored = root / "cache", root / "restored"
                cache.mkdir()
                restored.mkdir()
                for name, data in payloads.items():
                    (cache / name).write_bytes(data)
                (cache / "cache-meta.json").write_bytes(lab.public_cache_meta_bytes())
                if scenario == "extra":
                    (cache / "unexpected-state.json").write_text("synthetic")
                elif scenario == "symlink":
                    (cache / "bootstrap.py").unlink()
                    (root / "source").write_bytes(payloads["bootstrap.py"])
                    (cache / "bootstrap.py").symlink_to(root / "source")
                elif scenario == "tamper":
                    (cache / "bundle.tar.gz").write_bytes(b"x" * pins["bundle.tar.gz"][0])
                else:
                    value = lab.public_cache_meta()
                    value["publicOrigin"] = "https://foreign.invalid"
                    (cache / "cache-meta.json").write_text(json.dumps(value))
                with self.assertRaises((lab.Rejected, OSError)):
                    lab.import_public_cache(cache, restored)

    def test_failed_public_cache_export_never_publishes_partial_directory(self):
        pins = {"bootstrap.py": (3, hashlib.sha256(b"abc").hexdigest()),
                "bundle.tar.gz": (3, hashlib.sha256(b"def").hexdigest())}
        with tempfile.TemporaryDirectory() as directory, patch.object(lab, "PINS", pins):
            root = Path(directory)
            release = root / "release"
            release.mkdir()
            (release / "bootstrap.py").write_bytes(b"abc")
            (release / "bundle.tar.gz").write_bytes(b"bad")
            with self.assertRaisesRegex(lab.Rejected, "public-cache-copy-size-SHA"):
                lab.export_public_cache(root / "export", release)
            self.assertFalse((root / "export").exists())
            self.assertEqual({path.name for path in root.iterdir()}, {"release"})

    def test_public_cache_metadata_contains_only_fixed_public_provenance(self):
        value = lab.public_cache_meta()
        self.assertEqual(set(value), {"schemaVersion", "publicOrigin", "sourceCommit", "releaseId", "transport", "files"})
        self.assertEqual(value["transport"], "normal-tls-full-get")
        self.assertEqual(value["sourceCommit"], lab.PRODUCT)
        self.assertEqual(value["publicOrigin"], lab.PUBLIC)
        self.assertEqual(set(value["files"]), {"bootstrap.py", "bundle.tar.gz"})

    def test_public_artifact_read_admission_uses_actual_sudo_UID_without_hardcoded_user(self):
        with patch.dict(lab.os.environ, {"SUDO_UID": "1234"}), \
             patch("pwd.getpwuid", return_value=SimpleNamespace(pw_name="synthetic-uploader")), \
             patch.object(lab, "run") as run:
            self.assertTrue(lab.public_readability([Path("/non-secret/summary.json")]))
        self.assertEqual(run.call_args.args[0], ["runuser", "-u", "synthetic-uploader", "--", "test", "-r", "/non-secret/summary.json"])
        for value in ("0", "", "1;unexpected"):
            with self.subTest(value=value), patch.dict(lab.os.environ, {"SUDO_UID": value}), patch.object(lab, "run") as run:
                with self.assertRaisesRegex(lab.Rejected, "nonroot-uploader-UID-required"):
                    lab.public_readability([Path("/non-secret/summary.json")])
                run.assert_not_called()

    def test_authorization_JSON_is_detected_across_chunks_multiline_and_progress_prefix(self):
        raw = b'fixed progress {"authorizationUrl":\n "https://127.0.0.1:24443/dex/auth?state=synthetic",\n "expiresAt":42}\n'
        for boundary in (1, 18, 42, len(raw) - 2):
            output = bytearray(raw[:boundary])
            lab.installer_json_records(output)  # partial objects are not errors
            output.extend(raw[boundary:])
            values = lab.installer_json_records(output)
            self.assertEqual(len(values), 1)
            self.assertIn("authorizationUrl", values[0])

    def test_interrupt_targets_only_verified_installer_owner_in_another_process_group(self):
        with patch.object(lab, "installer_owner", return_value={"pid": 2301, "birth": "42", "sameGroupAsPipeline": False}), \
             patch.object(lab, "proc_birth", return_value="42"), patch.object(lab.os, "kill") as kill, patch.object(lab.os, "killpg") as killpg:
            result = lab.interrupt_installer_owner(100)
        kill.assert_called_once_with(2301, signal.SIGINT)
        killpg.assert_not_called()
        self.assertTrue(result["installerOwnerFound"])
        self.assertFalse(result["installerOwnerSameGroupAsPipeline"])
        with patch.object(lab, "installer_owner", return_value={"pid": 2301, "birth": "42", "sameGroupAsPipeline": False}), \
             patch.object(lab, "proc_birth", return_value="changed"), patch.object(lab.os, "kill") as kill:
            with self.assertRaisesRegex(lab.Rejected, "installer-owner-process-birth-changed"):
                lab.interrupt_installer_owner(100)
            kill.assert_not_called()

    def test_owner_search_requires_exact_M_bytes_and_only_walks_owned_descendants(self):
        source = subprocess.check_output(["git", "-C", str(ROOT), "show", lab.PRODUCT + ":scripts/host/one-command.py"])
        bootstrap = source.replace(b"from __future__ import annotations\n",
            b"from __future__ import annotations\nEXPECTED_SOURCE_COMMIT = " + repr(lab.PRODUCT).encode() + b"\n", 1)
        for tampered in (False, True):
            with self.subTest(tampered=tampered), tempfile.TemporaryDirectory(prefix="moxbots-bootstrap-") as directory:
                stage = Path(directory).resolve()
                path = stage / "bootstrap.py"
                path.write_bytes(bootstrap if not tampered else b"X" + bootstrap[1:])
                original_text, original_bytes, original_lstat = Path.read_text, Path.read_bytes, Path.lstat
                def text(value, *args, **kwargs):
                    if str(value) == "/proc/100/task/100/children":
                        return "200"
                    if str(value) == "/proc/200/task/200/children":
                        return ""
                    return original_text(value, *args, **kwargs)
                def data(value, *args, **kwargs):
                    if str(value) == "/proc/100/cmdline":
                        return b"bash\0-c\0fixed-public-command\0"
                    if str(value) == "/proc/200/cmdline":
                        return b"\0".join([b"/usr/bin/python3", os.fsencode(path), b"--instance", lab.ORIGIN.encode(),
                                             b"--index", os.fsencode(stage / "stable.json"), b""])
                    return original_bytes(value, *args, **kwargs)
                def metadata(value, *args, **kwargs):
                    if value == path:
                        return SimpleNamespace(st_mode=stat.S_IFREG | 0o600, st_uid=0, st_nlink=1, st_size=len(bootstrap))
                    return original_lstat(value, *args, **kwargs)
                with patch.object(Path, "read_text", text), patch.object(Path, "read_bytes", data), \
                     patch.object(Path, "lstat", metadata), patch.object(lab, "proc_birth", return_value="42"), \
                     patch.object(lab.os, "getpgid", side_effect=lambda pid: pid):
                    if tampered:
                        with self.assertRaisesRegex(lab.Rejected, "installer-owner-must-be-exact-M-bootstrap"):
                            lab.installer_owner(100)
                    else:
                        self.assertEqual(lab.installer_owner(100), {"pid": 200, "birth": "42", "sameGroupAsPipeline": False})

    def test_streamed_cancel_fixture_finishes_and_summary_never_contains_capability(self):
        script = r'''import json, signal, sys, time
def canceled(*unused):
    print("Authorization interrupted.", flush=True)
    sys.exit(130)
signal.signal(signal.SIGINT, canceled)
print(json.dumps({"status":"error","code":"AUTH_NOT_PENDING"}), flush=True)
print(json.dumps({"status":"error","code":"SYNTHETIC_SECRET_UNKNOWN_CODE"}), flush=True)
print("Open the short authorization URL below fixed progress ", end="", flush=True)
print(json.dumps({"authorizationUrl":"https://127.0.0.1:24443/dex/auth?state=SYNTHETIC_CAPABILITY", "expiresAt":42}, indent=2), flush=True)
while True: time.sleep(.1)
'''
        child = subprocess.Popen([sys.executable, "-c", script], stdout=subprocess.PIPE, stderr=subprocess.STDOUT, start_new_session=True)
        diagnostics = {}
        def interrupt(pid):
            self.assertEqual(pid, child.pid)
            os.kill(pid, signal.SIGINT)
            return {"installerOwnerFound": True, "installerOwnerSameGroupAsPipeline": False,
                    "interruptTarget": "verified-M-bootstrap-owner-only"}
        try:
            with tempfile.TemporaryDirectory() as directory, patch.object(lab.subprocess, "Popen", return_value=child), \
                 patch.object(lab, "interrupt_installer_owner", side_effect=interrupt), \
                 patch.object(lab, "installed_identity_hashes", return_value={"identity": "same"}), \
                 patch.object(lab, "auth_unit_observation", return_value={"wait": {"ActiveState": "inactive"}}), \
                 patch.object(lab, "runtime_readiness_observation", return_value={"closedProjection": True}) as runtime:
                result = lab.install_with_browser(Path(directory), Path(directory), "synthetic", "synthetic", "cancel", diagnostics=diagnostics)
            self.assertEqual(result, {"identity": "same"})
            self.assertGreaterEqual(runtime.call_count, 2)
            self.assertTrue(diagnostics["runtimeReadinessObservations"][-1]["closedProjection"])
            self.assertTrue(diagnostics["authorizationJsonSeen"] and diagnostics["interruptSent"] and diagnostics["pipeEOF"])
            self.assertEqual(diagnostics["childExitCode"], 130)
            self.assertIn("AUTH_NOT_PENDING", diagnostics["knownCliErrorCodes"])
            self.assertTrue(diagnostics["unknownCliErrorCodeObserved"])
            serialized = json.dumps(diagnostics)
            self.assertNotIn("SYNTHETIC_CAPABILITY", serialized)
            self.assertNotIn("SYNTHETIC_SECRET_UNKNOWN_CODE", serialized)
            self.assertNotIn("https://", serialized)
        finally:
            if child.poll() is None:
                child.terminate()
                child.wait(timeout=5)
            child.stdout.close()

    def test_auth_cleanup_stops_only_three_owned_transients_and_verifies_PID_zero(self):
        commands = []
        def host(command, **kwargs):
            commands.append(command)
            stdout = b"LoadState=loaded\nActiveState=inactive\nMainPID=0\n" if command[1] == "show" else b""
            return subprocess.CompletedProcess(command, 0, stdout, b"")
        with patch.object(lab, "host_run", side_effect=host):
            result = lab.cleanup_auth_units(wait_seconds=0)
        self.assertTrue(result["completed"])
        self.assertEqual([command for command in commands if command[1] == "stop"],
                         [["systemctl", "stop", unit] for unit in lab.AUTH_UNITS])
        self.assertTrue(all(value["mainPidIsZero"] and value["terminated"] for value in result["units"].values()))

    def test_failed_gate_cleanup_cannot_claim_complete_with_unterminated_auth_wait(self):
        for unresolved in (b"LoadState=loaded\nActiveState=active\nMainPID=123\n",
                           b"LoadState=loaded\nActiveState=active\nMainPID=0\n",
                           b"LoadState=loaded\nActiveState=inactive\nMainPID=123\n",
                           b"unexpected=SYNTHETIC_CAPABILITY\n"):
            with self.subTest(state=unresolved):
                def host(command, **kwargs):
                    stdout = (unresolved if command[2] == lab.AUTH_UNITS[1] else b"LoadState=not-found\nActiveState=inactive\nMainPID=0\n") if command[1] == "show" else b""
                    return subprocess.CompletedProcess(command, 0, stdout, b"")
                with patch.object(lab, "host_run", side_effect=host):
                    result = lab.cleanup_auth_units(wait_seconds=0)
                self.assertFalse(result["completed"])
                self.assertFalse(result["units"][lab.AUTH_UNITS[1]]["terminated"])
                self.assertNotIn("SYNTHETIC_CAPABILITY", json.dumps(result))

    def test_canceled_missing_or_zero_byte_status_is_non_ready_but_live_status_stays_strict(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(lab, "STATUS", Path(directory) / "status.json"):
            self.assertEqual(lab.canceled_status_observation(), {"kind": "missing", "ready": False})
            with self.assertRaises(FileNotFoundError):
                lab.host_status()
            lab.STATUS.write_bytes(b"")
            self.assertEqual(lab.canceled_status_observation(), {"kind": "empty", "ready": False})
            with self.assertRaises(json.JSONDecodeError):
                lab.host_status()
            with self.assertRaises(json.JSONDecodeError):
                lab.ready(Path(directory))

    def test_canceled_nonempty_status_rejects_bad_JSON_or_ready_and_projects_no_secret_fields(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(lab, "STATUS", Path(directory) / "status.json"):
            for data in (b" ", b"SYNTHETIC_CAPABILITY"):
                lab.STATUS.write_bytes(data)
                with self.assertRaises(json.JSONDecodeError):
                    lab.canceled_status_observation()
            for value in ([], {"ready": True}, {"state": "ready", "ready": False}, {"ready": 1}):
                lab.STATUS.write_text(json.dumps(value))
                with self.assertRaisesRegex(lab.Rejected, "canceled-install-not-Ready"):
                    lab.canceled_status_observation()
            lab.STATUS.write_text(json.dumps({"ready": False, "state": "waiting", "secret": "SYNTHETIC_CAPABILITY"}))
            self.assertEqual(lab.canceled_status_observation(), {"kind": "json-non-ready", "ready": False})

    def test_canceled_daemon_requires_loaded_inactive_and_zero_MainPID(self):
        for state, expected in ((b"LoadState=loaded\nActiveState=inactive\nMainPID=0\n", True),
                (b"LoadState=loaded\nActiveState=active\nMainPID=0\n", False),
                (b"LoadState=loaded\nActiveState=inactive\nMainPID=123\n", False),
                (b"LoadState=not-found\nActiveState=inactive\nMainPID=0\n", False),
                (b"LoadState=loaded\nActiveState=failed\nMainPID=0\n", True),
                (b"LoadState=loaded\nActiveState=failed\nMainPID=123\n", False),
                (b"LoadState=loaded\nActiveState=activating\nMainPID=0\n", False),
                (b"LoadState=loaded\nActiveState=deactivating\nMainPID=0\n", False),
                (b"LoadState=loaded\nActiveState=inactive\nMainPID=0\nMainPID=0\n", False),
                (b"LoadState=loaded\nActiveState=inactive\nMainPID=bad\n", False),
                (b"LoadState=loaded\nActiveState=inactive\nMainPID=0\nUnexpected=secret\n", False)):
            with self.subTest(state=state), patch.object(lab, "host_run", return_value=subprocess.CompletedProcess([], 0, state, b"")):
                if expected:
                    self.assertTrue(lab.canceled_connector_inactive())
                else:
                    with self.assertRaisesRegex(lab.Rejected, "canceled-install-connector-inactive"):
                        lab.canceled_connector_inactive()

    def test_canceled_connector_saves_closed_projection_before_rejection(self):
        observation, saved = {}, []
        state = b"LoadState=loaded\nActiveState=SYNTHETIC_CAPABILITY\nMainPID=123\n"
        with patch.object(lab, "host_run", return_value=subprocess.CompletedProcess([], 0, state, b"")):
            with self.assertRaisesRegex(lab.Rejected, "canceled-install-connector-inactive"):
                lab.canceled_connector_inactive(observation, lambda: saved.append(dict(observation)))
        self.assertEqual(saved, [{"fieldsValid": False, "loadState": "loaded", "activeState": "unknown-redacted", "mainPidIsZero": False}])
        self.assertNotIn("SYNTHETIC_CAPABILITY", json.dumps(observation))

    def test_runtime_observation_projects_contracts_without_capabilities_IDs_or_PIDs(self):
        expected = "123e4567-e89b-42d3-a456-426614174000"
        status = {"state": "unavailable", "deviceId": expected, "networkId": expected, "pid": 23456,
                  "updatedAt": int(lab.time.time()), "ready": False, "errorCode": "NETWORK_TRANSPORT_FAILED",
                  "capability": "SYNTHETIC_CAPABILITY"}
        def contents(path, limit):
            value = status if path == lab.STATUS else {"hostId": expected}
            return json.dumps(value).encode(), SimpleNamespace(st_mode=stat.S_IFREG | 0o640, st_uid=1234, st_gid=2345)
        def lstat(path):
            return SimpleNamespace(st_mode=(stat.S_IFDIR | 0o2750) if path == lab.STATUS.parent else (stat.S_IFSOCK | 0o660),
                                   st_uid=1234, st_gid=2345, st_nlink=1)
        commands = []
        def command(argv, **kwargs):
            commands.append((argv, kwargs))
            if argv[-1] == "doctor":
                data = json.dumps({"hostId": expected, "runtime": {"node": "24.20.0", "sdkBinaryPresent": True},
                                   "activeSession": None, "stopping": False, "token": "SYNTHETIC_CAPABILITY"}).encode()
            else:
                pid = b"12345" if argv[2] == lab.NODE else b"23456"
                data = b"LoadState=loaded\nActiveState=active\nSubState=running\nResult=success\nExecMainStatus=0\nMainPID=" + pid + b"\nRestart=on-failure\nNRestarts=0\n"
            return subprocess.CompletedProcess(argv, 0, data, b"SYNTHETIC_CAPABILITY")
        with patch.object(lab, "bounded_file_bytes", side_effect=contents), patch.object(Path, "lstat", lstat), \
             patch("pwd.getpwnam", return_value=SimpleNamespace(pw_uid=1234, pw_gid=2345)), patch.object(lab, "run", side_effect=command):
            result = lab.runtime_readiness_observation()
            self.assertTrue(result["status"]["pidMatchesConnector"])
            self.assertTrue(result["status"]["deviceMatchesProvisioned"])
            self.assertEqual(result["status"]["errorCode"], "NETWORK_TRANSPORT_FAILED")
            self.assertTrue(result["NodeDoctor"]["nodeVersionMatches"] and result["NodeDoctor"]["sdkBinaryPresent"])
            self.assertTrue(result["managementSocket"]["contractMatches"])
            for code in ("NETWORK_UPGRADE_REJECTED", "NETWORK_HELLO_TIMEOUT", "NETWORK_CONNECTION_TIMEOUT",
                         "NETWORK_CERTIFICATE_INVALID", "NETWORK_CATALOG_UNAVAILABLE", "CATALOG_NOT_CURRENT",
                         "NETWORK_METADATA_INVALID", "NETWORK_METADATA_SCOPE_MISMATCH", "NETWORK_PAGE_INVALID",
                         "DEVICE_NOT_REGISTERED", "CATALOG_CAPACITY"):
                status["errorCode"] = code
                self.assertEqual(lab.runtime_readiness_observation()["status"]["errorCode"], code)
            status.update({"state": "SYNTHETIC_CAPABILITY", "errorCode": "SYNTHETIC_CAPABILITY"})
            unknown = lab.runtime_readiness_observation()
        for result in (result, unknown):
            serialized = json.dumps(result)
            for secret in (expected, "SYNTHETIC_CAPABILITY", "12345", "23456"):
                self.assertNotIn(secret, serialized)
        self.assertTrue(all(kwargs["timeout"] <= 2 for _, kwargs in commands))

    def test_p_installer_failure_phrases_are_closed_and_never_keep_suffixes(self):
        phrases = {
            b"Service did not become ready with the expected Node and Claude SDK; rolling back": "Node-install-readiness-rollback",
            b"Host package installation failed; its installer performed its own rollback": "Host-install-own-rollback",
            b"Host install failed and prior Host state could not be restored": "Host-rollback-unconfirmed",
            b"network install failed and Host rollback could not be verified": "Host-rollback-unconfirmed",
            b"owned network package installation failed; prior Host release and unit were restored": "network-install-prior-Host-restored",
        }
        for phrase, code in phrases.items():
            with self.subTest(code=code):
                self.assertEqual(lab.installer_failure_reason(b"SYNTHETIC_CAPABILITY\n" + phrase + b"\nSYNTHETIC_CAPABILITY"), [code])
                self.assertEqual(lab.installer_failure_reason(phrase + b" SYNTHETIC_CAPABILITY\n"), [])
                self.assertNotIn("SYNTHETIC_CAPABILITY", json.dumps(lab.installer_failure_reason(phrase + b"\n")))

    def test_pre_auth_cancel_observes_but_still_rejects_without_native_auth(self):
        script = 'import sys; print("Service did not become ready with the expected Node and Claude SDK; rolling back"); print("SYNTHETIC_CAPABILITY"); sys.exit(1)'
        for broken in (False, True):
            child = subprocess.Popen([sys.executable, "-c", script], stdout=subprocess.PIPE, stderr=subprocess.STDOUT, start_new_session=True)
            diagnostics = {}
            try:
                with tempfile.TemporaryDirectory() as directory, patch.object(lab.subprocess, "Popen", return_value=child), \
                     patch.object(lab, "auth_unit_observation", return_value={}), \
                     patch.object(lab, "runtime_readiness_observation", side_effect=RuntimeError("SYNTHETIC_CAPABILITY") if broken else None,
                                  return_value={"startupContract": {"nodeAccountPresent": False}}) as runtime:
                    with self.assertRaisesRegex(lab.Rejected, "^canceled-command-must-not-succeed$"):
                        lab.install_with_browser(Path(directory), Path(directory), "synthetic", "synthetic", "cancel", diagnostics=diagnostics)
                self.assertGreaterEqual(runtime.call_count, 2)
                self.assertFalse(diagnostics["authorizationJsonSeen"] or diagnostics["interruptSent"])
                self.assertEqual(diagnostics["installerFailureReasons"], ["Node-install-readiness-rollback"])
                self.assertTrue(diagnostics["runtimeObservationUnavailable"] if broken else diagnostics["runtimeReadinessObservations"])
                self.assertNotIn("SYNTHETIC_CAPABILITY", json.dumps(diagnostics))
            finally:
                if child.poll() is None:
                    child.terminate()
                    child.wait(timeout=5)
                child.stdout.close()

    def test_startup_metadata_is_fixed_bounded_readonly_and_keeps_authority_private(self):
        host_id, transaction = "123e4567-e89b-42d3-a456-426614174000", "223e4567-e89b-42d3-a456-426614174000"
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory).resolve()
            state = base / "state"
            def observe():
                with patch.object(lab, "_BOOTSTRAP_STATE", state), patch("pwd.getpwnam", return_value=SimpleNamespace(pw_uid=os.getuid())):
                    return lab.startup_contract_observation()
            self.assertTrue(all(value == {"kind": "missing"} for value in observe()["directories"].values()))
            self.assertEqual(list(base.iterdir()), [])
            for relative in ("home/.myagents", "workspaces/default"):
                (state / relative).mkdir(parents=True, mode=0o700)
            for path in (state, state / "home", state / "workspaces"):
                path.chmod(0o700)
            identity, marker = state / "host-identity.json", state / "registry-bootstrap-v1.json"
            identity.write_text(json.dumps({"hostId": host_id, "schemaVersion": 1}))
            marker.write_text(json.dumps({"hostId": host_id, "transaction": transaction, "version": 1,
                                          "purpose": "host-registry-bootstrap", "phase": "committed"}))
            for path in (identity, marker):
                path.chmod(0o600)
            (state / "home/.profile").write_text("SYNTHETIC_CAPABILITY")
            (state / "home/.profile").chmod(0o644)
            (state / "SYNTHETIC_CAPABILITY").write_text("SYNTHETIC_CAPABILITY")
            (state / "home/.myagents/config.json").write_text('{"agents":[],"token":"SYNTHETIC_CAPABILITY"}')
            before = {str(path.relative_to(state)): (path.read_bytes(), path.stat().st_ino) for path in state.rglob("*") if path.is_file()}
            original_open = lab.os.open
            def readonly_open(path, flags, *args, **kwargs):
                self.assertFalse(flags & (os.O_WRONLY | os.O_RDWR | os.O_CREAT | os.O_EXCL | os.O_TRUNC | os.O_APPEND))
                return original_open(path, flags, *args, **kwargs)
            with patch.object(lab.os, "open", side_effect=readonly_open), \
                 patch.object(lab.os, "mkdir", side_effect=AssertionError("no seed")), \
                 patch.object(lab.os, "unlink", side_effect=AssertionError("no cleanup")), \
                 patch.object(lab.os, "rename", side_effect=AssertionError("no repair")):
                result = observe()
            self.assertTrue(result["identityMatchesMarker"])
            self.assertEqual(result["marker"]["phase"], "committed")
            self.assertTrue(result["identity"]["mode600"] and result["identity"]["singleLink"])
            self.assertFalse(result["freshNamespace"]["stateEntriesMatchFreshContract"])
            self.assertTrue(result["freshNamespace"]["homeEntriesMatchFreshContract"] and result["freshNamespace"]["skelMetadataMatches"])
            self.assertTrue(result["freshNamespace"]["defaultWorkspaceEmpty"])
            self.assertFalse(result["freshNamespace"]["homeHasNoSkeletonEntries"])
            self.assertEqual({str(path.relative_to(state)): (path.read_bytes(), path.stat().st_ino) for path in state.rglob("*") if path.is_file()}, before)
            for secret in (host_id, transaction, "SYNTHETIC_CAPABILITY", str(base)):
                self.assertNotIn(secret, json.dumps(result))
            (state / "home/.profile").unlink()
            self.assertTrue(observe()["freshNamespace"]["homeHasNoSkeletonEntries"])
            marker.write_text('{broken SYNTHETIC_CAPABILITY')
            result = observe()
            self.assertEqual(result["marker"]["kind"], "invalidJSON")
            self.assertEqual(result["marker"]["phase"], "invalid")
            self.assertFalse(result["identityMatchesMarker"])
            marker.write_text(json.dumps({"hostId": host_id, "transaction": transaction, "version": 1,
                                          "purpose": "host-registry-bootstrap", "phase": "SYNTHETIC_CAPABILITY"}))
            self.assertEqual(observe()["marker"]["phase"], "invalid")
            self.assertNotIn("SYNTHETIC_CAPABILITY", json.dumps(observe()))
            marker.unlink()
            self.assertEqual(observe()["marker"]["phase"], "missing")
            self.assertFalse(observe()["identityMatchesMarker"])
            os.link(identity, marker)
            self.assertEqual(observe()["identity"]["kind"], "unsafe")
            marker.unlink()
            identity.unlink()
            identity.symlink_to(state / "SYNTHETIC_CAPABILITY")
            self.assertEqual(observe()["identity"]["kind"], "unsafe")
            identity.unlink()
            for index in range(129):
                (state / ("unknown-" + str(index))).touch()
            self.assertTrue(observe()["directories"]["state"]["entryLimitExceeded"])
            self.assertNotIn("SYNTHETIC_CAPABILITY", json.dumps(observe()))

    def test_startup_metadata_never_follows_registry_symlink_or_reads_credentials(self):
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory).resolve()
            state, outside = base / "state", base / "SYNTHETIC_CAPABILITY"
            (state / "home").mkdir(parents=True, mode=0o700)
            state.chmod(0o700)
            outside.mkdir(mode=0o700)
            (outside / "config.json").write_text("SYNTHETIC_CAPABILITY")
            (state / "home/.myagents").symlink_to(outside, target_is_directory=True)
            original_open = lab.os.open
            def fixed_open(path, *args, **kwargs):
                self.assertNotIn("credentials", str(path))
                self.assertNotIn("SYNTHETIC_CAPABILITY", str(path))
                return original_open(path, *args, **kwargs)
            with patch.object(lab, "_BOOTSTRAP_STATE", state), patch("pwd.getpwnam", return_value=SimpleNamespace(pw_uid=os.getuid())), \
                 patch.object(lab.os, "open", side_effect=fixed_open):
                result = lab.startup_contract_observation()
            self.assertEqual(result["directories"]["registry"]["kind"], "unsafe")
            self.assertNotIn("SYNTHETIC_CAPABILITY", json.dumps(result))
            self.assertEqual((outside / "config.json").read_text(), "SYNTHETIC_CAPABILITY")

    def test_post_reboot_deadline_remains_90_and_final_guest_projection_precedes_failure(self):
        diagnostics, saved, calls = {}, [], []
        projection = {"units": {"connector": {"LoadState": "loaded", "ActiveState": "failed", "SubState": "failed",
                       "Result": "start-limit-hit", "execMainStatus": 1, "mainPidPositive": False}},
                      "status": {"kind": "missing"}, "NodeDoctor": {"attempted": False},
                      "startupContract": {"marker": {"phase": "committed"}, "identityMatchesMarker": True}}
        class Guest:
            def call(self, op, **kwargs):
                calls.append(op)
                self_outer.assertEqual(op, "runtime-readiness-observation")
                self_outer.assertEqual(kwargs, {"include_startup_errors": True})
                return projection
        self_outer = self
        def bounded(operation, timeout):
            self.assertEqual(timeout, 90)
            for _ in range(3):
                with self.assertRaisesRegex(lab.Rejected, "^connector-not-ready$"):
                    operation()
            raise lab.Rejected("bounded-readiness-deadline")
        with patch.object(lab, "_GUEST", Guest()), patch.object(lab, "ready", side_effect=lab.Rejected("connector-not-ready")), \
             patch.object(lab, "wait_for", side_effect=bounded), patch.object(lab, "run", side_effect=AssertionError("no extra command")):
            with self.assertRaisesRegex(lab.Rejected, "^bounded-readiness-deadline$"):
                lab.post_reboot_ready(Path("unused"), diagnostics, lambda: saved.append(dict(diagnostics)))
        self.assertEqual(calls, ["runtime-readiness-observation"])
        self.assertEqual(diagnostics["pollCount"], 3)
        self.assertFalse(diagnostics["gatePassed"])
        self.assertEqual(diagnostics["lastPollFailure"], {"stage": "connector-not-ready", "exceptionClass": "Rejected"})
        self.assertEqual(saved[-1]["lastRuntimeObservation"]["units"]["connector"]["Result"], "start-limit-hit")
        self.assertIs(diagnostics["lastRuntimeObservation"], projection)

    def test_post_reboot_observation_and_save_failures_never_override_original_error_or_leak(self):
        for error in (lab.Rejected("SYNTHETIC_CAPABILITY"), OSError("SYNTHETIC_CAPABILITY"),
                      subprocess.TimeoutExpired(["SYNTHETIC_CAPABILITY"], 1)):
            diagnostics = {}
            def bounded(operation, timeout):
                self.assertEqual(timeout, 90)
                return operation()
            with patch.object(lab, "ready", side_effect=error), patch.object(lab, "wait_for", side_effect=bounded), \
                 patch.object(lab, "runtime_readiness_observation", side_effect=RuntimeError("SYNTHETIC_CAPABILITY")), \
                 patch.object(lab, "run", side_effect=AssertionError("no repair")):
                with self.assertRaises(type(error)) as raised:
                    lab.post_reboot_ready(Path("unused"), diagnostics, lambda: (_ for _ in ()).throw(RuntimeError("SYNTHETIC_CAPABILITY")))
            self.assertIs(raised.exception, error)
            self.assertTrue(diagnostics["runtimeObservationUnavailable"] and diagnostics["diagnosticSaveFailed"])
            self.assertFalse(diagnostics["gatePassed"])
            self.assertEqual(diagnostics["lastPollFailure"]["stage"], "unknown-redacted")
            self.assertNotIn("SYNTHETIC_CAPABILITY", json.dumps(diagnostics))

    def test_post_reboot_AuthStore_projection_is_conditional_closed_and_never_masks_deadline(self):
        state = {"sessions": [["SYNTHETIC_CAPABILITY"]], "principals": 1,
                 "devices": [["SYNTHETIC_CAPABILITY", 1, 0, "ready", 7, 7, 2]], "catalogs": 1, "items": 0}
        for stage, broken in (("connector-not-ready", False), ("real-AuthStore-membership-empty-catalog-ready", False),
                              ("real-AuthStore-membership-empty-catalog-ready", True)):
            diagnostics = {}
            def bounded(operation, timeout):
                self.assertEqual(timeout, 90)
                with self.assertRaises(lab.Rejected):
                    operation()
                raise lab.Rejected("bounded-readiness-deadline")
            with patch.object(lab, "ready", side_effect=lab.Rejected(stage)), patch.object(lab, "wait_for", side_effect=bounded), \
                 patch.object(lab, "runtime_readiness_observation", return_value={}), \
                 patch.object(lab, "db_snapshot", return_value=state,
                              side_effect=RuntimeError("SYNTHETIC_CAPABILITY") if broken else None) as db:
                with self.assertRaisesRegex(lab.Rejected, "^bounded-readiness-deadline$"):
                    lab.post_reboot_ready(Path("unused"), diagnostics)
            self.assertEqual(db.call_count, int(stage == "real-AuthStore-membership-empty-catalog-ready"))
            if broken:
                self.assertTrue(diagnostics["AuthStoreObservationUnavailable"])
            elif db.call_count:
                self.assertEqual(diagnostics["AuthStoreProjection"], {"sessionCount": 1, "principalCount": 1,
                    "deviceCount": 1, "catalogCount": 1, "catalogItemCount": 0, "joinedDeviceCount": 1, "readyDeviceCount": 1,
                    "singleDeviceEpochsMatch": True, "singleDeviceCatalogSequencePositive": True})
            self.assertNotIn("SYNTHETIC_CAPABILITY", json.dumps(diagnostics))

    def test_post_reboot_success_returns_original_DB_even_when_diagnostic_fails(self):
        original = {"sessions": [["SYNTHETIC_CAPABILITY"]]}
        for broken in (False, True):
            diagnostics = {}
            def bounded(operation, timeout):
                self.assertEqual(timeout, 90)
                return operation()
            with patch.object(lab, "ready", return_value=original), patch.object(lab, "wait_for", side_effect=bounded), \
                 patch.object(lab, "runtime_readiness_observation", return_value={"NodeDoctor": {"attempted": True}},
                              side_effect=RuntimeError("SYNTHETIC_CAPABILITY") if broken else None) as observe:
                result = lab.post_reboot_ready(Path("unused"), diagnostics)
            self.assertIs(result, original)
            self.assertTrue(diagnostics["gatePassed"])
            self.assertEqual(observe.call_count, 1)
            self.assertNotIn("SYNTHETIC_CAPABILITY", json.dumps(diagnostics))

    def test_startup_journal_projection_accepts_only_complete_error_codes_without_secrets(self):
        def record(value):
            return json.dumps({"MESSAGE": json.dumps(value), "_CAPABILITY": "SYNTHETIC_CAPABILITY"}).encode()
        raw = b"\n".join([record({"status": "error", "code": "OWNED_ACCOUNT_UNAVAILABLE", "token": "SYNTHETIC_CAPABILITY"}),
            record({"status": "error", "code": "OWNED_ACCOUNT_UNAVAILABLE"}),
            record({"status": "error", "code": "NETWORK_CREDENTIAL_KEY_MISSING"}),
            record({"status": "error", "code": "SYNTHETIC_SECRET_UNKNOWN_CODE"}),
            record({"status": "error", "code": {"token": "SYNTHETIC_CAPABILITY"}}),
            record({"status": "success", "code": "SYNTHETIC_CAPABILITY"}),
            json.dumps({"MESSAGE": 'prefix {"status":"error","code":"OWNED_ACCOUNT_UNAVAILABLE"}'}).encode(),
            b"SYNTHETIC_CAPABILITY", b'{"MESSAGE":"broken SYNTHETIC_CAPABILITY'])
        result = lab.project_startup_errors(raw)
        self.assertEqual(result, {"codeCounts": {"NETWORK_CREDENTIAL_KEY_MISSING": 1, "OWNED_ACCOUNT_UNAVAILABLE": 2},
                                  "unknownCodeObserved": True, "truncated": False})
        self.assertNotIn("SYNTHETIC", json.dumps(result))
        bounded = lab.project_startup_errors(b"\n".join([record({"status": "error", "code": "OWNER_LOCK_UNSAFE"})] * 31))
        self.assertEqual(bounded["codeCounts"], {"OWNER_LOCK_UNSAFE": 30})
        self.assertTrue(bounded["truncated"])

    def test_journal_collector_uses_exact_current_boot_query_and_bounds_bytes(self):
        for overflow in (False, True):
            payload = json.dumps({"MESSAGE": json.dumps({"status": "error", "code": "OWNED_ACCOUNT_UNAVAILABLE"})}).encode() + b"\n"
            script = "import sys;sys.stdout.buffer.write(bytes.fromhex(sys.argv[1]));sys.stdout.buffer.write(b'SYNTHETIC_CAPABILITY'*8000 if sys.argv[2]=='1' else b'')"
            child = subprocess.Popen([sys.executable, "-c", script, payload.hex(), "1" if overflow else "0"],
                                     stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
            try:
                with patch.object(lab.subprocess, "Popen", return_value=child) as popen:
                    result = lab.connector_startup_error_observation()
                popen.assert_called_once_with(["journalctl", "--boot=0", "--unit=" + lab.CONNECTOR, "--lines=30", "--no-pager", "--quiet",
                    "--output=json", "--output-fields=MESSAGE"], stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
                self.assertEqual(result["codeCounts"], {"OWNED_ACCOUNT_UNAVAILABLE": 1})
                self.assertEqual(result["truncated"], overflow)
                self.assertNotIn("SYNTHETIC", json.dumps(result))
            finally:
                if child.poll() is None:
                    child.terminate()
                    child.wait(timeout=5)
                child.stdout.close()

    def test_runtime_startup_errors_require_explicit_flag_failed_connector_and_empty_status(self):
        for enabled, active, kind in ((False, "failed", "empty"), (True, "active", "empty"),
                                      (True, "failed", "json"), (True, "failed", "empty"), (True, "failed", "missing")):
            def command(argv, **kwargs):
                state = active if argv[2] == lab.CONNECTOR else "failed"
                data = (f"LoadState=loaded\nActiveState={state}\nSubState=failed\nResult=exit-code\nExecMainStatus=1\nMainPID=0\nRestart=on-failure\nNRestarts=3\n").encode()
                return subprocess.CompletedProcess(argv, 0, data, b"")
            def contents(path, bound):
                if path == lab.STATUS:
                    if kind == "missing":
                        raise FileNotFoundError()
                    return (b"" if kind == "empty" else b'{"state":"unavailable","ready":false}'), SimpleNamespace(st_mode=stat.S_IFREG | 0o640, st_uid=1234, st_gid=2345)
                raise FileNotFoundError()
            with patch.object(lab, "run", side_effect=command), patch.object(lab, "bounded_file_bytes", side_effect=contents), \
                 patch("pwd.getpwnam", return_value=SimpleNamespace(pw_uid=1234, pw_gid=2345)), \
                 patch.object(lab, "connector_startup_error_observation", return_value={"codeCounts": {}, "unknownCodeObserved": False}) as journal:
                result = lab.runtime_readiness_observation(include_startup_errors=enabled)
            expected = enabled and active == "failed" and kind in {"empty", "missing"}
            self.assertEqual(journal.call_count, int(expected))
            self.assertEqual(result["units"]["connector"]["Restart"], "on-failure")
            self.assertEqual(result["units"]["connector"]["restartCount"], 3)
            self.assertEqual("connectorStartupErrors" in result, expected)

    def test_startup_journal_deadline_cleans_only_its_owned_reader(self):
        child = subprocess.Popen([sys.executable, "-c", "import time;time.sleep(60)"], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
        try:
            with patch.object(lab.subprocess, "Popen", return_value=child), patch.object(lab.time, "monotonic", side_effect=[0, 3]):
                with self.assertRaisesRegex(lab.Rejected, "^startup-journal-read-deadline$"):
                    lab.connector_startup_error_observation()
            self.assertIsNotNone(child.poll())
        finally:
            if child.poll() is None:
                child.terminate()
                child.wait(timeout=5)
            child.stdout.close()

    def test_runtime_restart_policy_and_count_remain_closed_when_values_are_unknown(self):
        state = b"LoadState=loaded\nActiveState=failed\nSubState=failed\nResult=exit-code\nExecMainStatus=1\nMainPID=0\nRestart=SYNTHETIC_CAPABILITY\nNRestarts=9999999999\n"
        with patch.object(lab, "run", return_value=subprocess.CompletedProcess([], 0, state, b"")):
            result = lab.runtime_readiness_observation()
        self.assertEqual(result["units"]["connector"]["Restart"], "unknown-redacted")
        self.assertIsNone(result["units"]["connector"]["restartCount"])
        self.assertNotIn("SYNTHETIC_CAPABILITY", json.dumps(result))

    def test_runtime_startup_flag_defaults_false_and_rejects_non_bool_before_guest_RPC(self):
        class Guest:
            def call(self, op, **kwargs):
                self_outer.assertEqual(op, "runtime-readiness-observation")
                self_outer.assertIs(kwargs["include_startup_errors"], False)
                return {}
        self_outer = self
        with patch.object(lab, "_GUEST", Guest()):
            self.assertEqual(lab.runtime_readiness_observation(), {})
            for value in (1, 0, "true", None, [], {}):
                with self.assertRaisesRegex(lab.Rejected, "^runtime-startup-errors-flag$"):
                    lab.runtime_readiness_observation(include_startup_errors=value)

    def test_runtime_observation_does_not_attempt_doctor_without_Node_PID(self):
        state = b"LoadState=loaded\nActiveState=failed\nSubState=failed\nResult=exit-code\nExecMainStatus=1\nMainPID=0\nRestart=on-failure\nNRestarts=3\n"
        with patch.object(lab, "run", return_value=subprocess.CompletedProcess([], 0, state, b"")) as run:
            result = lab.runtime_readiness_observation()
        self.assertFalse(result["NodeDoctor"]["attempted"])
        self.assertEqual(run.call_count, 2)

    def test_registry_file_projection_distinguishes_missing_partial_corrupt_without_writing(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            original_open = lab.os.open
            def open_fixed(path, *arguments, **kwargs):
                if path == Path("/var/lib/moxbot-host-test/home/.myagents"):
                    path = root
                return original_open(path, *arguments, **kwargs)
            with patch("pwd.getpwnam", return_value=SimpleNamespace(pw_uid=os.getuid())), patch.object(lab.os, "open", side_effect=open_fixed):
                result = lab.registry_file_observation()
                self.assertEqual(result, {"config": {"kind": "missing"}, "projects": {"kind": "missing"}})
                config, projects = root / "config.json", root / "projects.json"
                config.write_text('{"providerApiKeys":{"synthetic":"SYNTHETIC_CAPABILITY"}}')
                config.chmod(0o600)
                result = lab.registry_file_observation()
                self.assertEqual(result["config"]["kind"], "regular")
                self.assertFalse(result["config"]["agentsIsArray"])
                self.assertIsNone(result["config"]["agentCount"])
                projects.write_text('{broken SYNTHETIC_CAPABILITY')
                projects.chmod(0o600)
                before = {path.name: path.read_bytes() for path in (config, projects)}
                result = lab.registry_file_observation()
                self.assertEqual(result["projects"]["kind"], "invalidJSON")
                self.assertEqual({path.name: path.read_bytes() for path in (config, projects)}, before)
                config.write_text(json.dumps({"agents": [{"id": "SYNTHETIC_CAPABILITY"}], "token": "SYNTHETIC_CAPABILITY"}))
                projects.write_text(json.dumps([{"id": "SYNTHETIC_CAPABILITY", "path": "SYNTHETIC_CAPABILITY"}]))
                before = {path.name: path.read_bytes() for path in (config, projects)}
                result = lab.registry_file_observation()
                self.assertEqual(result["config"]["agentCount"], 1)
                self.assertEqual(result["projects"]["projectCount"], 1)
                self.assertTrue(result["config"]["expectedNodeUID"] and result["config"]["mode600"] and result["config"]["nonpublic"])
                self.assertNotIn("SYNTHETIC_CAPABILITY", json.dumps(result))
                self.assertEqual({path.name: path.read_bytes() for path in (config, projects)}, before)

    def test_registry_projection_rejects_linked_nonprivate_or_oversize_files(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            original_open = lab.os.open
            def open_fixed(path, *arguments, **kwargs):
                if path == Path("/var/lib/moxbot-host-test/home/.myagents"):
                    path = root
                return original_open(path, *arguments, **kwargs)
            target = root / "target"
            target.write_text('"SYNTHETIC_CAPABILITY"')
            target.chmod(0o600)
            config, projects = root / "config.json", root / "projects.json"
            config.symlink_to(target)
            os.link(target, projects)
            with patch("pwd.getpwnam", return_value=SimpleNamespace(pw_uid=os.getuid())), patch.object(lab.os, "open", side_effect=open_fixed):
                result = lab.registry_file_observation()
                self.assertTrue(all(value["kind"] == "unsafe" for value in result.values()))
                config.unlink()
                projects.unlink()
                config.write_text('{"agents":[]}')
                config.chmod(0o644)
                projects.write_bytes(b"x" * (4 * 1024**2 + 1))
                projects.chmod(0o600)
                result = lab.registry_file_observation()
                self.assertTrue(all(value["kind"] == "unsafe" for value in result.values()))
                self.assertNotIn("SYNTHETIC_CAPABILITY", json.dumps(result))

    def test_observation_failure_keeps_original_installer_failure_and_redacts_reason(self):
        script = 'import sys; print("HOST_INSTALL_INCOMPLETE: join/readiness incomplete; identity and login preserved; rerun the same command"); print("SYNTHETIC_CAPABILITY"); sys.exit(1)'
        child = subprocess.Popen([sys.executable, "-c", script], stdout=subprocess.PIPE, stderr=subprocess.STDOUT, start_new_session=True)
        diagnostics = {}
        try:
            with tempfile.TemporaryDirectory() as directory, patch.object(lab.subprocess, "Popen", return_value=child), \
                 patch.object(lab, "auth_unit_observation", return_value={}), \
                 patch.object(lab.StatusEventWatcher, "start", side_effect=RuntimeError("SYNTHETIC_CAPABILITY")), \
                 patch.object(lab, "runtime_readiness_observation", side_effect=RuntimeError("SYNTHETIC_CAPABILITY")):
                with self.assertRaisesRegex(lab.Rejected, "^public-command-failed$"):
                    lab.install_with_browser(Path(directory), Path(directory), "synthetic", "synthetic", "authorize", diagnostics=diagnostics)
            self.assertTrue(diagnostics["runtimeObservationUnavailable"])
            self.assertTrue(diagnostics["statusEventObservationUnavailable"])
            self.assertEqual(diagnostics["installerFailureReasons"], ["join-or-readiness-incomplete"])
            self.assertNotIn("SYNTHETIC_CAPABILITY", json.dumps(diagnostics))
        finally:
            if child.poll() is None:
                child.terminate()
                child.wait(timeout=5)
            child.stdout.close()

    def test_status_event_thread_preserves_brief_error_before_stopped_without_heavy_observers(self):
        read_fd, write_fd = os.pipe()
        os.set_blocking(read_fd, False)
        watcher = lab.StatusEventWatcher()
        watcher.fd, watcher.watch_id = read_fd, 42
        watcher.flags["armed"] = True
        expected = "123e4567-e89b-42d3-a456-426614174000"
        watcher.expected = expected
        def event(name=b"status.json", mask=lab.StatusEventWatcher.MOVED_TO):
            raw = name + b"\0"
            return lab.struct.pack("iIII", 42, mask, 0, len(raw)) + raw
        with tempfile.TemporaryDirectory() as directory, patch.object(lab, "STATUS", Path(directory) / "status.json"), \
             patch.object(lab, "run", side_effect=AssertionError("heavy-observer-forbidden")):
            lab.STATUS.write_bytes(b"")
            watcher.sample()
            watcher.thread = lab.threading.Thread(target=watcher.watch, daemon=True)
            watcher.thread.start()
            try:
                status = {"state": "unavailable", "errorCode": "NETWORK_UPGRADE_REJECTED", "ready": False,
                          "deviceId": expected, "pid": 12345, "networkId": expected, "instanceId": expected,
                          "updatedAt": int(lab.time.time()), "secret": "SYNTHETIC_CAPABILITY"}
                lab.STATUS.write_text(json.dumps(status))
                os.write(write_fd, event())
                deadline = lab.time.monotonic() + 2
                while watcher.snapshot()["firstError"] is None and lab.time.monotonic() < deadline:
                    lab.time.sleep(.005)
                self.assertEqual(watcher.snapshot()["firstError"]["errorCode"], "NETWORK_UPGRADE_REJECTED")
                status.update({"state": "stopped", "errorCode": None})
                lab.STATUS.write_text(json.dumps(status))
                os.write(write_fd, event(mask=lab.StatusEventWatcher.CLOSE_WRITE))
                deadline = lab.time.monotonic() + 2
                while watcher.snapshot()["history"][-1].get("state") != "stopped" and lab.time.monotonic() < deadline:
                    lab.time.sleep(.005)
                watcher.events(event(b"SYNTHETIC_CAPABILITY"))
                result = watcher.close()
                self.assertTrue(result["flags"]["threadStopped"])
                self.assertEqual(result["history"][-1]["state"], "stopped")
                self.assertTrue(result["history"][-1]["samePidAsPrevious"])
                self.assertEqual(result["history"][-1]["previousState"], "unavailable")
                self.assertEqual(result["firstError"]["errorCode"], "NETWORK_UPGRADE_REJECTED")
                serialized = json.dumps(result)
                for secret in (expected, "SYNTHETIC_CAPABILITY", "12345"):
                    self.assertNotIn(secret, serialized)
            finally:
                watcher.close()
                os.close(write_fd)

    def test_status_event_history_deduplicates_bounds_and_records_lost_or_overflow(self):
        watcher = lab.StatusEventWatcher()
        watcher.watch_id = 42
        projection = {"kind": "JSON-object", "state": "unavailable", "errorCode": "unknown-redacted", "errorCodeIsNull": False}
        with patch.object(lab, "status_event_projection", return_value=projection):
            watcher.sample()
            watcher.sample()
            self.assertEqual(len(watcher.snapshot()["history"]), 1)
            for count in range(140):
                projection["state"] = "connecting" if count % 2 == 0 else "unavailable"
                watcher.sample()
        watcher.events(lab.struct.pack("iIII", -1, watcher.OVERFLOW, 0, 0))
        watcher.events(lab.struct.pack("iIII", 42, watcher.LOST, 0, 0))
        result = watcher.close()
        self.assertEqual(len(result["history"]), 128)
        self.assertTrue(all(result["flags"][key] for key in ("historyTruncated", "eventOverflow", "watchLost")))
        self.assertEqual(result["firstError"]["state"], "unavailable")

    def test_status_watch_setup_failure_closes_owned_fd_and_is_only_a_diagnostic(self):
        class Function:
            def __init__(self, result):
                self.result = result
            def __call__(self, *unused):
                return self.result
        libc = SimpleNamespace(inotify_init1=Function(91), inotify_add_watch=Function(-1))
        with patch.object(lab.sys, "platform", "linux"), patch.object(lab.ctypes, "CDLL", return_value=libc), \
             patch.object(lab.os, "close") as close:
            watcher = lab.StatusEventWatcher().start()
            result = watcher.close()
        close.assert_called_once_with(91)
        self.assertTrue(result["flags"]["setupUnavailable"])
        self.assertEqual(result["history"], [])

    def test_status_watch_arms_only_fixed_directory_before_starting_thread(self):
        calls = []
        class Function:
            def __init__(self, result, name):
                self.result, self.name = result, name
            def __call__(self, *arguments):
                calls.append((self.name, arguments))
                return self.result
        class Thread:
            def __init__(self, **kwargs):
                pass
            def start(self):
                calls.append(("thread-start", ()))
            def join(self, timeout):
                pass
            def is_alive(self):
                return False
        libc = SimpleNamespace(inotify_init1=Function(91, "init"), inotify_add_watch=Function(42, "watch"))
        with patch.object(lab.sys, "platform", "linux"), patch.object(lab.ctypes, "CDLL", return_value=libc), \
             patch.object(lab.threading, "Thread", Thread), patch.object(lab, "status_event_projection", return_value={"kind": "empty"}), \
             patch.object(lab.os, "close") as close:
            result = lab.StatusEventWatcher().start().close()
        self.assertEqual(calls, [("init", (os.O_NONBLOCK | os.O_CLOEXEC,)),
            ("watch", (91, os.fsencode(lab.STATUS.parent), 0x80 | 0x8 | 0x400 | 0x800)), ("thread-start", ())])
        close.assert_called_once_with(91)
        self.assertTrue(result["flags"]["armed"] and result["flags"]["threadStopped"])

    def test_failure_exception_projection_has_only_fixed_class_names(self):
        errors = (json.JSONDecodeError("SYNTHETIC_CAPABILITY", "secret", 0),
                  lab.sqlite3.OperationalError("SYNTHETIC_CAPABILITY"), FileNotFoundError("SYNTHETIC_CAPABILITY"))
        for error in errors:
            self.assertEqual(lab.safe_exception_class(error), type(error).__name__)
        Unknown = type("SYNTHETIC_CAPABILITY", (Exception,), {})
        self.assertEqual(lab.safe_exception_class(Unknown()), "unexpected-exception-type-redacted")

    def test_existing_auth_transient_is_protected_before_installation(self):
        with patch.object(lab, "run", return_value=subprocess.CompletedProcess([], 0, b"loaded\n", b"")):
            with self.assertRaisesRegex(lab.Rejected, "existing-auth-transient-unit-is-protected"):
                lab.require_absent_auth_units()


if __name__ == "__main__":
    unittest.main()
