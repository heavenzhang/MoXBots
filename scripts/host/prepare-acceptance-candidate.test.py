from __future__ import annotations

import hashlib
import importlib.util
import io
import json
import os
import pathlib
import subprocess
import tarfile
import tempfile
import unittest

SCRIPT = pathlib.Path(__file__).with_name("prepare-acceptance-candidate.py")
spec = importlib.util.spec_from_file_location("candidate_builder_test", SCRIPT)
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)
consumer = builder.consumer


def sha(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


class CandidateBuilderTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="host-candidate-test-")
        self.root = pathlib.Path(self.temp.name)
        self.source = self.root / "source"
        self.source.mkdir()
        subprocess.run(["git", "init", "-q", str(self.source)], check=True)
        subprocess.run(["git", "-C", str(self.source), "config", "user.email", "candidate@example.invalid"], check=True)
        subprocess.run(["git", "-C", str(self.source), "config", "user.name", "Candidate Test"], check=True)
        (self.source / "source.txt").write_text("clean source fixture\n")
        subprocess.run(["git", "-C", str(self.source), "add", "source.txt"], check=True)
        subprocess.run(["git", "-C", str(self.source), "commit", "-qm", "fixture"], check=True)
        self.commit = subprocess.check_output(["git", "-C", str(self.source), "rev-parse", "HEAD"], text=True).strip()
        self.runner = self.root / "runner-temp"
        self.runner.mkdir()
        self.old_runner_temp = os.environ.get("RUNNER_TEMP")
        os.environ["RUNNER_TEMP"] = str(self.runner)
        self.prepared = self.root / "prepared"
        self.service = self.root / "service"
        self.candidate_out = self.runner / "candidate"
        self.service_out = self.runner / "service-artifact"
        self.release_id = "20261018123456-" + self.commit[:12]
        self._make_prepared()
        self._make_service()

    def tearDown(self):
        if self.old_runner_temp is None:
            os.environ.pop("RUNNER_TEMP", None)
        else:
            os.environ["RUNNER_TEMP"] = self.old_runner_temp
        self.temp.cleanup()

    def _make_prepared(self):
        release = self.prepared / "releases" / self.release_id
        release.mkdir(parents=True)
        bootstrap = f"EXPECTED_SOURCE_COMMIT = '{self.commit}'\nprint('not executed')\n".encode()
        host_file = b"#!/bin/sh\nexit 0\n"
        host_manifest = {
            "schemaVersion": 1, "profile": "moxbot-test", "target": "linux-x64-glibc",
            "sourceDirty": False, "sourceCommit": self.commit, "releaseId": self.release_id,
            "files": [{"path": "install.sh", "sha256": sha(host_file), "size": len(host_file), "mode": 0o755}],
        }
        host_archive_path = self.root / "host.tar.gz"
        host_prefix = f"moxbot-host-test/releases/{self.release_id}"
        host_manifest_bytes = (json.dumps(host_manifest, sort_keys=True, indent=2) + "\n").encode()
        with tarfile.open(host_archive_path, "w:gz", format=tarfile.USTAR_FORMAT) as archive:
            for directory in ("moxbot-host-test", "moxbot-host-test/releases", host_prefix):
                info = tarfile.TarInfo(directory)
                info.type, info.mode = tarfile.DIRTYPE, 0o755
                archive.addfile(info)
            for name, content, mode in ((f"{host_prefix}/manifest.json", host_manifest_bytes, 0o644),
                                        (f"{host_prefix}/install.sh", host_file, 0o755)):
                info = tarfile.TarInfo(name)
                info.size, info.mode = len(content), mode
                archive.addfile(info, io.BytesIO(content))
        bundle_files = {
            "host.tar.gz": host_archive_path.read_bytes(),
            "network/myagents-host-network": self._elf(),
            "network/source-commit.txt": (self.commit + "\n").encode(),
            "installers/install.sh": b"#!/bin/sh\nexit 0\n",
            "installers/unified-install.py": b"# fixture\n",
            "installers/network-install.py": b"# fixture\n",
            "installers/network-control.py": b"# fixture\n",
        }
        manifest = {
            "schemaVersion": 1,
            "profile": "moxbot-test",
            "platform": "ubuntu-24.04-x86_64",
            "sourceCommit": self.commit,
            "releaseId": self.release_id,
            "files": {
                name: {"sha256": sha(content), "size": len(content),
                      "mode": 0o755 if name in {"network/myagents-host-network", "installers/install.sh"} else 0o644}
                for name, content in bundle_files.items()
            },
        }
        bundle_path = release / "bundle.tar.gz"
        with tarfile.open(bundle_path, "w:gz", format=tarfile.USTAR_FORMAT) as archive:
            for name, content in sorted(bundle_files.items()):
                info = tarfile.TarInfo(name)
                info.size = len(content)
                info.mode = manifest["files"][name]["mode"]
                archive.addfile(info, io.BytesIO(content))
            raw_manifest = (json.dumps(manifest, sort_keys=True, indent=2) + "\n").encode()
            info = tarfile.TarInfo("manifest.json")
            info.size, info.mode = len(raw_manifest), 0o644
            archive.addfile(info, io.BytesIO(raw_manifest))
        (release / "bootstrap.py").write_bytes(bootstrap)
        (self.prepared / "install.sh").write_bytes(b"#!/bin/sh\nexit 0\n")
        (self.prepared / "install.sh").chmod(0o755)
        index = {
            "schemaVersion": 1, "status": "available", "profile": "moxbot-test",
            "platform": "ubuntu-24.04-x86_64", "scriptPath": "/host/install.sh",
            "sourceCommit": self.commit, "releaseId": self.release_id,
            "bootstrapPath": f"/host/releases/{self.release_id}/bootstrap.py",
            "bootstrapSha256": sha(bootstrap), "bootstrapBytes": len(bootstrap),
            "bundlePath": f"/host/releases/{self.release_id}/bundle.tar.gz",
            "bundleSha256": sha(bundle_path.read_bytes()), "bundleBytes": bundle_path.stat().st_size,
        }
        (self.prepared / "stable.json").write_text(json.dumps(index, sort_keys=True) + "\n")
        self.review = {
            "schemaVersion": 1, "sourceCommit": self.commit, "sourceClean": True,
            "publisherSignature": False, "trust": "test fixture", "installScriptSha256": sha((self.prepared / "install.sh").read_bytes()),
            "publication": "not-published", "releaseIndex": index, "bundleManifest": manifest,
        }
        (self.prepared / "release-review.json").write_text(json.dumps(self.review, sort_keys=True) + "\n")

    def _make_service(self):
        self.service.write_bytes(self._elf())
        self.service.chmod(0o755)

    @staticmethod
    def _elf():
        header = bytearray(64)
        header[:6] = b"\x7fELF\x02\x01"
        header[18:20] = (62).to_bytes(2, "little")
        return bytes(header)

    def _run(self):
        return builder.prepare_candidate(self.prepared, self.service, self.commit,
                                         self.candidate_out, self.service_out, self.source)

    def test_builds_exact_candidate_and_service_payloads(self):
        result = self._run()
        self.assertEqual(result["status"], "prepared-not-published")
        self.assertEqual(result["transport"], "candidate-ci-artifact")
        self.assertEqual({p.name for p in self.candidate_out.iterdir()},
                         {"bootstrap.py", "bundle.tar.gz", "candidate-meta.json"})
        self.assertEqual({p.name for p in self.service_out.iterdir()},
                         {"myagents-agentnet-service", "source-commit.txt"})
        metadata_bytes = (self.candidate_out / "candidate-meta.json").read_bytes()
        metadata = json.loads(metadata_bytes)
        self.assertEqual(metadata_bytes, (json.dumps(metadata, sort_keys=True, indent=2) + "\n").encode())
        self.assertEqual(metadata["sourceCommit"], self.commit)
        self.assertEqual(metadata["releaseId"], self.release_id)
        self.assertEqual(metadata["transport"], "candidate-ci-artifact")
        self.assertNotIn("publicOrigin", metadata)
        self.assertEqual(set(metadata["files"]), {"bootstrap.py", "bundle.tar.gz"})
        for name, record in metadata["files"].items():
            payload = (self.candidate_out / name).read_bytes()
            self.assertEqual(record, {"bytes": len(payload), "sha256": sha(payload)})
        self.assertEqual((self.service_out / "source-commit.txt").read_text(), self.commit + "\n")
        receipt = result["producerReceipt"]
        self.assertEqual(set(receipt["files"]), {"install.sh", "stable.json", "myagents-agentnet-service"})
        self.assertEqual(receipt["sourceCommit"], self.commit)
        self.assertEqual(receipt["releaseId"], self.release_id)

    def test_tampered_bundle_is_rejected_without_outputs(self):
        bundle = self.prepared / "releases" / self.release_id / "bundle.tar.gz"
        bundle.write_bytes(bundle.read_bytes() + b"tampered")
        with self.assertRaises(builder.CandidateError):
            self._run()
        self.assertFalse(self.candidate_out.exists())
        self.assertFalse(self.service_out.exists())

    def test_dirty_source_and_wrong_commit_are_rejected(self):
        (self.source / "source.txt").write_text("dirty\n")
        with self.assertRaises(builder.CandidateError):
            self._run()
        (self.source / "source.txt").write_text("clean source fixture\n")
        with self.assertRaises(builder.CandidateError):
            builder.prepare_candidate(self.prepared, self.service, "0" * 40,
                                     self.candidate_out, self.service_out, self.source)

    def test_wrong_service_architecture_and_existing_output_are_rejected(self):
        self.service.write_bytes(b"not ELF")
        with self.assertRaises(builder.CandidateError):
            self._run()
        self._make_service()
        self.candidate_out.mkdir()
        with self.assertRaises(builder.CandidateError):
            self._run()

    def test_install_receipt_mismatch_is_rejected(self):
        self.review["installScriptSha256"] = "0" * 64
        (self.prepared / "release-review.json").write_text(json.dumps(self.review) + "\n")
        with self.assertRaises(builder.CandidateError):
            self._run()

    def test_output_outside_runner_temp_is_rejected(self):
        outside = self.root / "outside"
        with self.assertRaises(builder.CandidateError):
            builder.prepare_candidate(self.prepared, self.service, self.commit,
                                     outside, self.service_out, self.source)


if __name__ == "__main__":
    unittest.main()
