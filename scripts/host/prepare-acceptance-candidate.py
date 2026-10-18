#!/usr/bin/env python3
"""Validate and stage a non-public Host acceptance candidate from prepare-release.py."""
from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import os
import pathlib
import re
import shutil
import stat
import subprocess
import sys
import tarfile
import tempfile

ROOT = pathlib.Path(__file__).resolve().parents[2]
SCRIPTS = ROOT / "scripts/host"
spec = importlib.util.spec_from_file_location("candidate_host_consumer", SCRIPTS / "one-command.py")
consumer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(consumer)

HEX40 = re.compile(r"[0-9a-f]{40}\Z")
HEX64 = re.compile(r"[0-9a-f]{64}\Z")
BOOTSTRAP_LIMIT = 262144
SERVICE_LIMIT = 128 * 1024 * 1024
CANDIDATE_FILES = ("bootstrap.py", "bundle.tar.gz")


class CandidateError(RuntimeError):
    pass


def sha256_file(path: pathlib.Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        while chunk := stream.read(1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


def strict_json(path: pathlib.Path, limit: int) -> dict:
    if path.is_symlink() or not path.is_file() or path.stat().st_size > limit:
        raise CandidateError("candidate metadata file is unsafe or oversized")
    try:
        value = consumer.strict_json(path.read_bytes())
    except (consumer.Rejected, OSError) as exc:
        raise CandidateError("candidate metadata JSON is invalid") from exc
    return value


def require_clean_source(source_root: pathlib.Path, expected: str) -> None:
    if not HEX40.fullmatch(expected):
        raise CandidateError("source commit must be a full lowercase 40-character SHA")
    try:
        head = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=source_root, text=True).strip()
        dirty = subprocess.check_output(
            ["git", "status", "--porcelain=v1", "--untracked-files=normal"],
            cwd=source_root,
            text=True,
        )
    except (OSError, subprocess.SubprocessError) as exc:
        raise CandidateError("source checkout could not be verified") from exc
    if head != expected or dirty:
        raise CandidateError("candidate requires the exact clean source commit")


def _regular_file(path: pathlib.Path, *, max_size: int, executable: bool = False) -> os.stat_result:
    try:
        info = path.lstat()
    except OSError as exc:
        raise CandidateError("candidate input file is missing") from exc
    if (not stat.S_ISREG(info.st_mode) or info.st_nlink != 1 or info.st_size <= 0
            or info.st_size > max_size or (executable and not info.st_mode & 0o111)):
        raise CandidateError("candidate input file type, link count, size or mode is invalid")
    return info


def _candidate_paths(prepared: pathlib.Path, source_commit: str) -> tuple[str, pathlib.Path, pathlib.Path, dict]:
    if prepared.is_symlink() or not prepared.is_dir():
        raise CandidateError("prepared release directory is unsafe")
    expected_top = {"install.sh", "stable.json", "release-review.json", "releases"}
    if {entry.name for entry in prepared.iterdir()} != expected_top:
        raise CandidateError("prepared release contains unexpected top-level entries")
    install_script = prepared / "install.sh"
    _regular_file(install_script, max_size=BOOTSTRAP_LIMIT, executable=True)
    stable_path = prepared / "stable.json"
    index = strict_json(stable_path, 16384)
    try:
        consumer.validate_index(index)
    except consumer.Rejected as exc:
        raise CandidateError("prepared release index failed the Host consumer contract") from exc
    if index["profile"] != "moxbot-test" or index["sourceCommit"] != source_commit:
        raise CandidateError("prepared release profile or source commit mismatch")
    release_id = index["releaseId"]
    releases = prepared / "releases"
    if releases.is_symlink() or not releases.is_dir() or {entry.name for entry in releases.iterdir()} != {release_id}:
        raise CandidateError("prepared release ID directory is ambiguous")
    release = releases / release_id
    if release.is_symlink() or not release.is_dir() or {entry.name for entry in release.iterdir()} != set(CANDIDATE_FILES):
        raise CandidateError("prepared release payload must contain exactly the pinned bootstrap and bundle")
    bootstrap = release / "bootstrap.py"
    bundle = release / "bundle.tar.gz"
    _regular_file(bootstrap, max_size=BOOTSTRAP_LIMIT)
    _regular_file(bundle, max_size=consumer.MAX_BUNDLE)
    bootstrap_bytes = bootstrap.read_bytes()
    if (len(bootstrap_bytes) != index["bootstrapBytes"]
            or hashlib.sha256(bootstrap_bytes).hexdigest() != index["bootstrapSha256"]
            or f"EXPECTED_SOURCE_COMMIT = '{source_commit}'".encode() not in bootstrap_bytes):
        raise CandidateError("bootstrap digest, size or source pin mismatch")
    if (bundle.stat().st_size != index["bundleBytes"]
            or sha256_file(bundle) != index["bundleSha256"]):
        raise CandidateError("bundle digest or size does not match the prepared release index")
    try:
        compile(bootstrap_bytes, str(bootstrap), "exec")
        with tempfile.TemporaryDirectory(prefix="moxbots-host-candidate-verify-") as temp:
            bundle_manifest = consumer.unpack_bundle(bundle, pathlib.Path(temp) / "verified", index)
    except (SyntaxError, consumer.Rejected, OSError, tarfile.TarError) as exc:
        raise CandidateError("prepared release failed strict Host consumer validation") from exc
    review = strict_json(prepared / "release-review.json", 65536)
    review_keys = {"schemaVersion", "sourceCommit", "sourceClean", "publisherSignature", "trust",
                   "installScriptSha256", "publication", "releaseIndex", "bundleManifest"}
    if (set(review) != review_keys or review["schemaVersion"] != 1 or review["sourceCommit"] != source_commit
            or review["sourceClean"] is not True or review["publisherSignature"] is not False
            or review["publication"] != "not-published" or review["releaseIndex"] != index
            or review["installScriptSha256"] != sha256_file(install_script)
            or review["bundleManifest"] != bundle_manifest):
        raise CandidateError("prepared release review receipt is invalid or claims publication")
    return release_id, bootstrap, bundle, review


def _verify_service(path: pathlib.Path) -> None:
    _regular_file(path, max_size=SERVICE_LIMIT, executable=True)
    with path.open("rb") as stream:
        header = stream.read(20)
    if (len(header) != 20 or header[:6] != b"\x7fELF\x02\x01"
            or int.from_bytes(header[18:20], "little") != 62):
        raise CandidateError("service artifact is not a Linux x86_64 ELF")


def _runner_temp_root() -> pathlib.Path:
    raw = os.environ.get("RUNNER_TEMP")
    if not raw:
        raise CandidateError("RUNNER_TEMP is required for isolated candidate outputs")
    root = pathlib.Path(raw)
    if not root.is_absolute() or root.is_symlink() or not root.is_dir():
        raise CandidateError("RUNNER_TEMP must be an existing real directory")
    return root.resolve(strict=True)


def _new_output(path: pathlib.Path, runner_temp: pathlib.Path, source_root: pathlib.Path) -> None:
    if not path.is_absolute() or path.name in {"", ".", ".."}:
        raise CandidateError("output path must be a new absolute directory")
    parent = path.parent.resolve(strict=True)
    if path.exists() or path.is_symlink() or not parent.is_relative_to(runner_temp):
        raise CandidateError("output must be new and contained by RUNNER_TEMP")
    if path.resolve(strict=False).is_relative_to(source_root.resolve(strict=True)):
        raise CandidateError("candidate output cannot be inside the source checkout")


def prepare_candidate(prepared: pathlib.Path, service_binary: pathlib.Path, source_commit: str,
                      candidate_output: pathlib.Path, service_output: pathlib.Path,
                      source_root: pathlib.Path = ROOT) -> dict:
    source_root = source_root.resolve(strict=True)
    require_clean_source(source_root, source_commit)
    runner_temp = _runner_temp_root()
    if candidate_output == service_output:
        raise CandidateError("candidate and service artifacts require distinct output directories")
    _new_output(candidate_output, runner_temp, source_root)
    _new_output(service_output, runner_temp, source_root)
    _verify_service(service_binary)
    release_id, bootstrap, bundle, _review = _candidate_paths(prepared, source_commit)

    candidate_stage = pathlib.Path(tempfile.mkdtemp(prefix=".candidate-", dir=runner_temp))
    service_stage = pathlib.Path(tempfile.mkdtemp(prefix=".service-", dir=runner_temp))
    candidate_published = False
    service_published = False
    try:
        candidate_bytes: dict[str, bytes] = {}
        for name, source in (("bootstrap.py", bootstrap), ("bundle.tar.gz", bundle)):
            candidate_bytes[name] = source.read_bytes()
            target = candidate_stage / name
            target.write_bytes(candidate_bytes[name])
            target.chmod(0o644)
        metadata = {
            "schemaVersion": 1,
            "sourceCommit": source_commit,
            "releaseId": release_id,
            "transport": "candidate-ci-artifact",
            "files": {
                name: {"bytes": len(raw), "sha256": hashlib.sha256(raw).hexdigest()}
                for name, raw in sorted(candidate_bytes.items())
            },
        }
        meta_path = candidate_stage / "candidate-meta.json"
        meta_path.write_text(json.dumps(metadata, sort_keys=True, indent=2) + "\n", encoding="utf-8")
        meta_path.chmod(0o644)
        if {item.name for item in candidate_stage.iterdir()} != {"bootstrap.py", "bundle.tar.gz", "candidate-meta.json"}:
            raise CandidateError("candidate payload staging is not the exact closed file set")

        service_target = service_stage / "myagents-agentnet-service"
        shutil.copyfile(service_binary, service_target, follow_symlinks=False)
        service_target.chmod(0o755)
        (service_stage / "source-commit.txt").write_text(source_commit + "\n", encoding="ascii")
        (service_stage / "source-commit.txt").chmod(0o644)
        if {item.name for item in service_stage.iterdir()} != {"myagents-agentnet-service", "source-commit.txt"}:
            raise CandidateError("service artifact staging is not the exact closed file set")
        _verify_service(service_target)
        require_clean_source(source_root, source_commit)
        os.rename(candidate_stage, candidate_output)
        candidate_published = True
        os.rename(service_stage, service_output)
        service_published = True
    except BaseException:
        shutil.rmtree(candidate_stage, ignore_errors=True)
        shutil.rmtree(service_stage, ignore_errors=True)
        if candidate_published and not service_published:
            shutil.rmtree(candidate_output, ignore_errors=True)
        raise
    return {
        "status": "prepared-not-published",
        "transport": "candidate-ci-artifact",
        "sourceCommit": source_commit,
        "releaseId": release_id,
        "candidateFiles": metadata["files"],
        "service": {"bytes": (service_output / service_target.name).stat().st_size,
                    "sha256": sha256_file(service_output / service_target.name)},
        "producerReceipt": {
            "schemaVersion": 1,
            "sourceCommit": source_commit,
            "releaseId": release_id,
            "files": {
                "install.sh": {"bytes": (prepared / "install.sh").stat().st_size,
                               "sha256": sha256_file(prepared / "install.sh")},
                "stable.json": {"bytes": (prepared / "stable.json").stat().st_size,
                                "sha256": sha256_file(prepared / "stable.json")},
                "myagents-agentnet-service": {
                    "bytes": (service_output / service_target.name).stat().st_size,
                    "sha256": sha256_file(service_output / service_target.name),
                },
            },
        },
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--prepared-release", type=pathlib.Path, required=True)
    parser.add_argument("--service-binary", type=pathlib.Path, required=True)
    parser.add_argument("--source-commit", required=True)
    parser.add_argument("--candidate-output", type=pathlib.Path, required=True)
    parser.add_argument("--service-output", type=pathlib.Path, required=True)
    args = parser.parse_args()
    try:
        result = prepare_candidate(args.prepared_release, args.service_binary, args.source_commit,
                                   args.candidate_output, args.service_output)
        print(json.dumps(result, sort_keys=True))
        return 0
    except (CandidateError, consumer.Rejected, OSError, ValueError, subprocess.SubprocessError,
            tarfile.TarError) as exc:
        print(f"HOST_CANDIDATE_REJECTED: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
