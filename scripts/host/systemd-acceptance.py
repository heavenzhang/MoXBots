#!/usr/bin/env python3
"""Disposable GitHub-hosted Ubuntu acceptance; never authorizes or starts networking.

Only summary.json and non-secret command logs enter --output. Verified payloads
and encrypted-key backups stay in a private temporary directory. A failed run
preserves the actual installed state for inspection; it never uninstalls a Host.
"""
from __future__ import annotations

import argparse
import fcntl
import grp
import hashlib
import importlib.util
import io
import json
import os
import pathlib
import platform
import pwd
import re
import shutil
import subprocess
import sys
import tarfile
import tempfile
import time
import uuid

PROFILE = "moxbot-test"
NODE = "moxbot-host-test.service"
NETWORK = "moxbot-host-network-test.service"
ORIGIN = "https://isolated-host-onboard.invalid"
PERSISTED = (
    "/var/lib/moxbot-host-test/host-identity.json",
    "/var/lib/moxbot-host-test/home/.myagents/config.json",
    "/etc/moxbot-host-test/credentials/provider-key.cred",
    "/etc/moxbot-host-network-test/identity-kek.cred",
    "/opt/moxbot-host-network-test/device-id.json",
    "/etc/moxbot-host-network-test/owned-instance.json",
    "/etc/systemd/system/moxbot-host-test.service",
    "/etc/systemd/system/moxbot-host-network-test.service",
)


class Rejected(RuntimeError):
    pass


def require(condition, detail):
    if not condition:
        raise Rejected(detail)


def run(args, *, check=True, timeout=240, input=None):
    result = subprocess.run(args, input=input, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=timeout)
    if check and result.returncode:
        raise Rejected(f"command failed: {args!r}: {result.stdout[-4000:].decode(errors='replace')}")
    return result


def sha(path):
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def guard(args):
    require(os.geteuid() == 0, "root is required")
    require(os.environ.get("CI") == "true" and os.environ.get("GITHUB_ACTIONS") == "true"
            and os.environ.get("RUNNER_ENVIRONMENT") == "github-hosted"
            and os.environ.get("GITHUB_REPOSITORY", "").lower() == "heavenzhang/moxbots",
            "only the disposable canonical GitHub-hosted CI job is permitted")
    require(sys.platform == "linux" and platform.machine() == "x86_64", "Ubuntu x86_64 is required")
    os_release = dict(line.split("=", 1) for line in pathlib.Path("/etc/os-release").read_text().splitlines()
                      if "=" in line and not line.startswith("#"))
    require(os_release.get("ID", "").strip('"') == "ubuntu"
            and os_release.get("VERSION_ID", "").strip('"') == "24.04", "Ubuntu 24.04 is required")
    require(pathlib.Path("/proc/1/comm").read_text().strip() == "systemd", "PID 1 must be real systemd")
    state = run(["systemctl", "is-system-running"], check=False, timeout=15).stdout.decode().strip()
    # A hosted VM can still have unrelated boot jobs. Preserve its global
    # state; the bounded real unit-manager transaction below gates installation.
    require(state in {"running", "degraded", "starting"}, "systemd is not available: " + state)
    require("MYAGENTS_HOST_TRANSACTION_LOCK_FD" not in os.environ, "an inherited install transaction is not permitted")
    for value in (args.source_root, args.host_artifact_dir, args.network_artifact_dir, args.output):
        require(value.is_absolute(), "all directories must be absolute")
    source = args.source_root.resolve()
    require(re.fullmatch(r"[0-9a-f]{40}", args.source_commit) is not None, "exact source commit required")
    git = ["git", "-c", "safe.directory=" + str(source), "-C", str(source)]
    require(run(git + ["rev-parse", "HEAD"]).stdout.decode().strip() == args.source_commit, "checkout/source mismatch")
    require(not run(git + ["status", "--porcelain", "--untracked-files=normal"]).stdout, "source checkout must be clean")
    require(pathlib.Path(os.environ.get("RUNNER_TEMP", "")).is_absolute(), "RUNNER_TEMP must be preserved through sudo")
    runner_temp = pathlib.Path(os.environ["RUNNER_TEMP"]).resolve()
    output = args.output.resolve()
    require(output != runner_temp and output.is_relative_to(runner_temp)
            and not output.is_relative_to(source) and not os.path.lexists(args.output),
            "output must be new, outside source, and below RUNNER_TEMP")
    for name in ("moxbot-host-test", "moxbot-host-network-test"):
        for prefix in ("/opt", "/var/lib", "/etc", "/run"):
            require(not os.path.lexists(pathlib.Path(prefix) / name), "existing namespace is protected: " + name)
        for path in (f"/etc/systemd/system/{name}.service", f"/etc/systemd/system/{name}.service.d",
                     f"/etc/tmpfiles.d/{name}.conf", f"/etc/{name}-public"):
            require(not os.path.lexists(path), "existing namespace configuration is protected: " + path)
        try:
            pwd.getpwnam(name)
        except KeyError:
            pass
        else:
            raise Rejected("existing service account is protected: " + name)
        try:
            grp.getgrnam(name)
        except KeyError:
            pass
        else:
            raise Rejected("existing service group is protected: " + name)
        unit = run(["systemctl", "show", name + ".service", "--property=LoadState", "--value"], check=False, timeout=15)
        require(unit.returncode in {0, 1, 4} and unit.stdout.decode().strip() == "not-found", "existing loaded unit is protected: " + name)
    return state


def service(unit):
    raw = run(["systemctl", "show", unit, "--property=ActiveState", "--property=SubState",
               "--property=UnitFileState", "--property=MainPID"], timeout=15).stdout.decode()
    return dict(line.split("=", 1) for line in raw.splitlines())


def snapshot():
    return {"node": service(NODE), "network": service(NETWORK),
            "hostCurrent": os.readlink("/opt/moxbot-host-test/current"),
            "networkCurrent": os.readlink("/opt/moxbot-host-network-test/current"),
            "fileSha256": {name: sha(pathlib.Path(name)) if pathlib.Path(name).is_file() else None for name in PERSISTED}}


def doctor():
    value = json.loads(run(["/opt/moxbot-host-test/bin/moxbot-host", "doctor"], timeout=30).stdout)
    require(value.get("runtime", {}).get("node") == "24.20.0"
            and value.get("runtime", {}).get("sdkBinaryPresent") is True, "packaged Node/SDK is not ready")
    require(value.get("activeSession") is None and value.get("stopping") is False, "Host must be idle")
    require(isinstance(value.get("hostId"), str), "Host identity missing from real Unix IPC")
    return value


def pinned_digest(sidecar, filename):
    require(sidecar.is_file() and not sidecar.is_symlink() and sidecar.stat().st_size <= 16384,
            "bounded artifact digest sidecar is required")
    matches = []
    for line in sidecar.read_text().splitlines():
        match = re.fullmatch(r"([0-9a-fA-F]{64})\s+\*?(.+)", line)
        if match and match[2] == filename:
            matches.append(match[1].lower())
    require(len(matches) == 1, "artifact must have one exact digest entry: " + filename)
    return matches[0]


def accept(args):
    baseline = guard(args)
    args.output.mkdir(mode=0o755)
    summary = {"sourceCommit": args.source_commit, "profile": PROFILE, "baselineSystemState": baseline,
               "authorizationAttempted": False, "networkStarted": False, "modelInvoked": False, "phases": []}
    apparmor = pathlib.Path("/sys/module/apparmor/parameters/enabled")
    summary["apparmorBaseline"] = apparmor.read_text().strip() if apparmor.exists() else "not-present"

    def save():
        (args.output / "summary.json").write_text(json.dumps(summary, indent=2) + "\n")

    def step(name, operation):
        started = time.monotonic()
        value = operation()
        summary["phases"].append({"name": name, "passed": True, "seconds": round(time.monotonic() - started, 3), "result": value})
        save()
        print("passed: " + name, flush=True)
        return value

    def install(name, command, expected=0):
        result = run(command, check=False, timeout=240)
        (args.output / (name + ".log")).write_bytes(result.stdout)
        require(result.returncode == expected, f"{name}: unexpected exit {result.returncode}; see non-secret log")
        return {"exit": result.returncode}

    def probe_manager():
        command = ["systemd-run", "--quiet", "--wait", "--pipe", "--collect",
                   "--unit=moxbots-ci-manager-" + uuid.uuid4().hex,
                   "--property=Type=oneshot", "--property=NoNewPrivileges=yes", "/usr/bin/true"]
        started = time.monotonic()
        try:
            result = run(command, check=False, timeout=30)
            detail = {"command": command, "exit": result.returncode,
                      "seconds": round(time.monotonic() - started, 3),
                      "stdout": result.stdout[-4000:].decode(errors="replace")}
        except subprocess.TimeoutExpired as error:
            detail = {"command": command, "exit": None, "timedOut": True,
                      "seconds": round(time.monotonic() - started, 3),
                      "stdout": (error.stdout or b"")[-4000:].decode(errors="replace")}
            (args.output / "unit-manager-probe.log").write_text(json.dumps(detail, indent=2) + "\n")
            raise Rejected("unit manager probe exceeded 30 seconds") from error
        (args.output / "unit-manager-probe.log").write_text(json.dumps(detail, indent=2) + "\n")
        require(result.returncode == 0, "unit manager probe failed; see non-secret log")
        return {"exit": result.returncode}

    try:
        save()
        step("unit-manager-ready", probe_manager)
        with tempfile.TemporaryDirectory(prefix="moxbots-ci-systemd-") as temporary:
            scratch = pathlib.Path(temporary)
            source = args.source_root.resolve()
            consumer = load("acceptance_verify", source / "scripts/host/one-command.py")
            consumer.require_platform()
            host_dir, network_dir = args.host_artifact_dir.resolve(), args.network_artifact_dir.resolve()
            for directory in (host_dir, network_dir):
                require((directory / "source-commit.txt").read_bytes() == (args.source_commit + "\n").encode(),
                        "artifact/source mismatch")
            archives = list(host_dir.glob("moxbot-host-test-*.tar.gz"))
            require(len(archives) == 1 and re.fullmatch(r"moxbot-host-test-([0-9]{14}-" + args.source_commit[:12] + r")\.tar\.gz",
                    archives[0].name) is not None and not archives[0].is_symlink(), "exactly one matching MoX Host archive required")
            original = archives[0]
            release_id = original.name[len("moxbot-host-test-"):-len(".tar.gz")]
            host_sha = pinned_digest(original.with_name(original.name + ".sha256"), original.name)
            staged_host = scratch / "host.tar.gz"
            shutil.copyfile(original, staged_host)
            require(sha(staged_host) == host_sha, "Host digest mismatch")
            consumer.validate_host(staged_host, {"sourceCommit": args.source_commit, "releaseId": release_id})
            network_sha = pinned_digest(network_dir / "SHA256SUMS", "myagents-host-network")
            network = load("acceptance_network", source / "scripts/host/network-install.py")
            staged_network = scratch / "network"
            staged_network.mkdir(mode=0o700)
            network.copy_snapshot(str(network_dir), staged_network, network_sha, args.source_commit)
            summary.update(hostSha256=host_sha, networkSha256=network_sha, releaseId=release_id)
            base = [sys.executable, str(source / "scripts/host/unified-install.py"), "--profile", PROFILE,
                    "--host-archive", str(staged_host), "--host-sha256", host_sha,
                    "--network-artifact-dir", str(staged_network), "--network-sha256", network_sha,
                    "--network-source-commit", args.source_commit, "--owned-instance", ORIGIN]
            step("fresh-systemd-install", lambda: install("fresh", base))
            doctor()
            # Use the existing local writer to create real, disabled configuration.
            # No provider key is supplied and no Session/model is started.
            configuration = {"expectedRevision": 0, "providerId": "moonshot-coding",
                             "model": "synthetic-ci-disabled", "executionAuthorized": False,
                             "mutationId": str(uuid.uuid4())}
            receipt = json.loads(run(["/opt/moxbot-host-test/bin/moxbot-host", "configure"],
                                     input=json.dumps(configuration).encode(), timeout=30).stdout)
            require(receipt.get("status") == "persisted" and receipt.get("revision") == 1
                    and receipt.get("settings", {}).get("executionAuthorized") is False,
                    "local configuration writer did not persist a disabled revision")
            config = pathlib.Path(PERSISTED[1])
            require(config.is_file() and not config.is_symlink(), "persisted configuration is missing")
            step("disabled-local-config-persisted", lambda: {"revision": 1, "executionAuthorized": False})
            first, first_doctor = snapshot(), doctor()
            require(first_doctor.get("settings", {}).get("model") == "synthetic-ci-disabled"
                    and first_doctor["settings"]["executionAuthorized"] is False,
                    "actual Node IPC does not reflect persisted disabled configuration")
            summary["hostId"] = first_doctor["hostId"]
            require(first["node"]["ActiveState"] == "active" and first["node"]["UnitFileState"] == "enabled", "Node unit not active/enabled")
            require(first["network"]["ActiveState"] == "inactive" and first["network"]["UnitFileState"] == "disabled", "network must remain inactive/disabled")
            for key in (PERSISTED[0], PERSISTED[1], PERSISTED[2], PERSISTED[3], PERSISTED[4]):
                require(first["fileSha256"][key] is not None, "identity/encrypted credential missing: " + key)
            step("real-node-ipc-and-encrypted-credentials", lambda: {"hostId": first_doctor["hostId"], "nodePid": first["node"]["MainPID"]})
            step("repeat-install", lambda: install("repeat", base))
            require(snapshot() == first and doctor()["hostId"] == summary["hostId"], "repeat changed PID/identity/config/credentials/units")
            step("same-version-noop-proven", lambda: {"samePidAndState": True})

            def contention():
                descriptor = os.open("/run/myagents-host-unified-install.lock", os.O_RDWR)
                try:
                    fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
                    value = install("lock-refusal", base, 1)
                    require(b"another Host or network install transaction is active" in (args.output / "lock-refusal.log").read_bytes(), "wrong contention refusal")
                finally:
                    os.close(descriptor)
                require(snapshot() == first, "contention changed installed state")
                return value
            step("real-flock-contention-refused", contention)
            installed = pathlib.Path("/opt/moxbot-host-test/current").resolve()
            manifest = json.loads((installed / "manifest.json").read_bytes())
            fixture_id = ("20000101000000-" if not release_id.startswith("20000101000000-") else "20000101000001-") + args.source_commit[:12]
            manifest["releaseId"] = fixture_id
            update = scratch / "private-update-fixture.tar.gz"
            # Actual installed payload bytes are retained; only this private
            # test release's timestamp changes. It never enters output/artifacts.
            with tarfile.open(update, "w:gz", format=tarfile.USTAR_FORMAT, compresslevel=1) as archive:
                prefix = "moxbot-host-test/releases/" + fixture_id + "/"
                for entry in manifest["files"]:
                    path = installed / entry["path"]
                    info = tarfile.TarInfo(prefix + entry["path"])
                    info.mode, info.size = entry["mode"], path.stat().st_size
                    with path.open("rb") as stream:
                        archive.addfile(info, stream)
                raw = (json.dumps(manifest) + "\n").encode()
                info = tarfile.TarInfo(prefix + "manifest.json")
                info.mode, info.size = 0o644, len(raw)
                archive.addfile(info, io.BytesIO(raw))
            altered = base.copy()
            altered[altered.index("--host-archive") + 1] = str(update)
            altered[altered.index("--host-sha256") + 1] = sha(update)
            step("active-update-refused", lambda: install("busy-update-refusal", altered, 1))
            require(snapshot() == first, "active update changed installed state")
            require(b"active" in (args.output / "busy-update-refusal.log").read_bytes()
                    or b"busy" in (args.output / "busy-update-refusal.log").read_bytes(), "wrong active update refusal")
            backup = scratch / "private-backup"
            backup.mkdir(mode=0o700)
            for index, name in enumerate(PERSISTED):
                if pathlib.Path(name).is_file():
                    shutil.copy2(name, backup / str(index))
            run(["systemctl", "stop", NODE], timeout=30)
            stopped = snapshot()
            require(stopped["node"]["ActiveState"] == "inactive", "Node did not stop for rollback test")
            rejected = altered.copy()
            rejected[rejected.index("--owned-instance") + 1] = "https://second-isolated-host-onboard.invalid"
            step("second-component-rejection", lambda: install("second-component-rollback", rejected, 1))
            require(b"prior Host release and unit were restored" in (args.output / "second-component-rollback.log").read_bytes(),
                    "post-Node rollback was not confirmed")
            require(snapshot() == stopped, "rollback failed to restore exact prior current/unit/enabled/inactive/files")
            step("rollback-state-proven", lambda: {"sameCurrentUnitEnabledStateIdentityConfigKeys": True})
            run(["systemctl", "start", NODE], timeout=30)
            restored = None
            for _ in range(45):
                try:
                    restored = doctor()
                    break
                except (Rejected, ValueError):
                    time.sleep(1)
            require(restored is not None and restored["hostId"] == summary["hostId"], "original packaged Host did not return ready")
            final = snapshot()
            require(final["network"]["ActiveState"] == "inactive" and final["network"]["UnitFileState"] == "disabled", "network unexpectedly activated")
            require(final["fileSha256"] == first["fileSha256"], "durable identity/configuration/credential bytes changed")
            summary.update(status="passed", finalState=final)
            save()
            print(json.dumps({"status": "passed", "sourceCommit": args.source_commit, "hostId": summary["hostId"],
                              "phases": len(summary["phases"]), "summary": str(args.output / "summary.json")}))
    except BaseException as error:
        summary.update(status="failed", detail=str(error))
        save()
        raise


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-root", type=pathlib.Path, required=True)
    parser.add_argument("--source-commit", required=True)
    parser.add_argument("--host-artifact-dir", type=pathlib.Path, required=True)
    parser.add_argument("--network-artifact-dir", type=pathlib.Path, required=True)
    parser.add_argument("--output", type=pathlib.Path, required=True)
    try:
        accept(parser.parse_args())
        return 0
    except (Rejected, OSError, ValueError, tarfile.TarError, subprocess.SubprocessError) as error:
        print("SYSTEMD_ACCEPTANCE_INCOMPLETE: " + str(error), file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
