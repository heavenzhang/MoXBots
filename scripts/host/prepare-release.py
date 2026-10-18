#!/usr/bin/env python3
"""Prepare (never publish) one clean-source, immutable HTTPS Host release tree."""
from __future__ import annotations

import argparse
import hashlib
import importlib.util
import io
import json
import os
import pathlib
import re
import subprocess
import sys
import tarfile
import tempfile

ROOT = pathlib.Path(__file__).resolve().parents[2]
SCRIPTS = ROOT / "scripts/host"
spec = importlib.util.spec_from_file_location("one_command", SCRIPTS / "one-command.py")
consumer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(consumer)


def sha(path: pathlib.Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        while chunk := stream.read(1024**2):
            digest.update(chunk)
    return digest.hexdigest()


def clean_source() -> str:
    head = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip()
    dirty = subprocess.check_output(["git", "status", "--porcelain", "--untracked-files=normal"], cwd=ROOT)
    if not re.fullmatch(r"[0-9a-f]{40}", head) or dirty:
        raise consumer.Rejected("release preparation requires a clean committed source tree")
    return head


def prepare(host_archive: pathlib.Path, network_dir: pathlib.Path, destination: pathlib.Path) -> dict:
    commit = clean_source()
    if destination.exists():
        raise consumer.Rejected("output already exists; immutable releases are never overwritten")
    if destination.resolve().is_relative_to(ROOT):
        raise consumer.Rejected("release output must be outside the source checkout")
    # Find the embedded release identity without trusting its archive paths.
    with tarfile.open(host_archive, "r:gz", tarinfo=consumer.BoundedTarInfo) as tf:
        members = consumer._safe_members(tf, 4 * 1024**3, 20000)
        manifests = [x for x in members if x.isfile() and re.fullmatch(
            r"moxbot-host-test/releases/[0-9]{14}-[0-9a-f]{12}/manifest.json", x.name)]
        if len(manifests) != 1 or manifests[0].size > 4 * 1024**2:
            raise consumer.Rejected("exactly one bounded Host manifest required")
        host = consumer.strict_json(tf.extractfile(manifests[0]).read())
    release = host.get("releaseId")
    # Digests are derived from actual supplied bytes, never invented values.
    index = {"schemaVersion": 1, "status": "available", "profile": consumer.PROFILE,
        "platform": consumer.PLATFORM, "scriptPath": "/host/install.sh", "sourceCommit": commit,
        "releaseId": release, "bootstrapPath": f"/host/releases/{release}/bootstrap.py",
        "bootstrapSha256": "0" * 64, "bootstrapBytes": 1,
        "bundlePath": f"/host/releases/{release}/bundle.tar.gz", "bundleSha256": "0" * 64, "bundleBytes": 1}
    consumer.validate_index(index)
    consumer.validate_host(host_archive, index)
    network = consumer.load_module("release_network", SCRIPTS / "network-install.py")
    network_file = network_dir / network.ARTIFACT
    with tempfile.TemporaryDirectory(prefix="moxbots-release-", dir=destination.parent) as temp:
        staging = pathlib.Path(temp)
        snapshot = staging / "network"
        snapshot.mkdir(mode=0o700)
        # Reuse no-symlink, exact source and ELF verification of installed path.
        network.copy_snapshot(str(network_dir.resolve()), snapshot, sha(network_file), commit)
        host_dir = staging / "host"
        release_dir = host_dir / "releases" / release
        release_dir.mkdir(parents=True)
        source = (SCRIPTS / "one-command.py").read_bytes()
        bootstrap = source.replace(b"from __future__ import annotations\n",
            b"from __future__ import annotations\nEXPECTED_SOURCE_COMMIT = " + repr(commit).encode() + b"\n", 1)
        (release_dir / "bootstrap.py").write_bytes(bootstrap)
        launcher = (b"#!/usr/bin/env bash\nset -euo pipefail\nexec python3 - \"$@\" <<'MOXBOTS_INSTALL_PYTHON'\n"
                    + source + b"\nMOXBOTS_INSTALL_PYTHON\n")
        (host_dir / "install.sh").write_bytes(launcher)
        (host_dir / "install.sh").chmod(0o755)
        paths = {"host.tar.gz": host_archive, "network/myagents-host-network": snapshot / network.ARTIFACT,
                 "network/source-commit.txt": snapshot / "source-commit.txt"}
        paths.update({"installers/" + x: SCRIPTS / x for x in consumer.INSTALLERS})
        manifest = {"schemaVersion": 1, "profile": consumer.PROFILE, "platform": consumer.PLATFORM,
                    "sourceCommit": commit, "releaseId": release, "files": {}}
        for name, path in paths.items():
            mode = 0o755 if name in {"installers/install.sh", "network/myagents-host-network"} else 0o644
            manifest["files"][name] = {"sha256": sha(path), "size": path.stat().st_size, "mode": mode}
        bundle = release_dir / "bundle.tar.gz"
        with tarfile.open(bundle, "w:gz", format=tarfile.USTAR_FORMAT) as tf:
            for name, path in sorted(paths.items()):
                info = tarfile.TarInfo(name)
                info.size = manifest["files"][name]["size"]
                info.mode = manifest["files"][name]["mode"]
                with path.open("rb") as stream:
                    tf.addfile(info, stream)
            raw = (json.dumps(manifest, sort_keys=True, indent=2) + "\n").encode()
            info = tarfile.TarInfo("manifest.json")
            info.size, info.mode = len(raw), 0o644
            tf.addfile(info, io.BytesIO(raw))
        index.update(bootstrapSha256=hashlib.sha256(bootstrap).hexdigest(), bootstrapBytes=len(bootstrap),
                     bundleSha256=sha(bundle), bundleBytes=bundle.stat().st_size)
        consumer.validate_index(index)
        verified = staging / "verified"
        verified.mkdir()
        consumer.unpack_bundle(bundle, verified, index)
        if clean_source() != commit:
            raise consumer.Rejected("source changed during release preparation")
        (host_dir / "stable.json").write_text(json.dumps(index, indent=2) + "\n")
        (host_dir / "release-review.json").write_text(json.dumps({"schemaVersion": 1,
            "sourceCommit": commit, "sourceClean": True, "publisherSignature": False,
            "trust": "verified HTTPS same-origin transport plus SHA-256 integrity; no publisher signature",
            "installScriptSha256": hashlib.sha256(launcher).hexdigest(),
            "publication": "not-published", "releaseIndex": index, "bundleManifest": manifest}, indent=2) + "\n")
        # This atomic rename exposes only fully validated local candidate bytes.
        os.rename(host_dir, destination)
    return index


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--host-archive", type=pathlib.Path, required=True)
    parser.add_argument("--network-artifact-dir", type=pathlib.Path, required=True)
    parser.add_argument("--output", type=pathlib.Path, required=True, help="new absolute directory, outside source checkout")
    args = parser.parse_args()
    try:
        if not args.output.is_absolute() or not args.network_artifact_dir.is_absolute():
            raise consumer.Rejected("output and network artifact directory must be absolute")
        value = prepare(args.host_archive, args.network_artifact_dir, args.output)
        print(json.dumps({"status": "prepared-not-published", "output": str(args.output),
                          "sourceCommit": value["sourceCommit"], "releaseId": value["releaseId"]}))
        return 0
    except (consumer.Rejected, OSError, ValueError, tarfile.TarError, subprocess.SubprocessError) as exc:
        print(f"HOST_RELEASE_REJECTED: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
