#!/usr/bin/env python3
"""Offline harness gates. These tests never install, log in or start a daemon."""
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import subprocess
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


if __name__ == "__main__":
    unittest.main()
