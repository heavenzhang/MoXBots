#!/usr/bin/env python3
"""HTTPS trusted, immutable MoXBots Host bundle consumer (no publisher signature)."""
from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import os
import pathlib
import platform
import re
import subprocess
import sys
import tarfile
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request

PROFILE = "moxbot-test"
PLATFORM = "ubuntu-24.04-x86_64"
MAX_BUNDLE = 2 * 1024**3
INSTALLERS = ("install.sh", "unified-install.py", "network-install.py", "network-control.py")
FILES = {"host.tar.gz", "network/myagents-host-network", "network/source-commit.txt"} | {"installers/" + x for x in INSTALLERS}
HEX = r"[0-9a-f]"


class Rejected(RuntimeError):
    pass


def origin(value: str) -> str:
    try:
        parsed = urllib.parse.urlsplit(value)
        host = parsed.hostname
        port = parsed.port
    except ValueError as exc:
        raise Rejected("instance must be a canonical HTTPS origin") from exc
    if (parsed.scheme != "https" or not host or parsed.username is not None or parsed.password is not None
            or parsed.path or parsed.query or parsed.fragment or port == 443 or not re.fullmatch(r"[a-z0-9.-]+", host)
            or host.startswith(".") or host.endswith(".") or ".." in host
            or value != "https://" + host + (f":{port}" if port else "")):
        raise Rejected("instance must be a canonical HTTPS origin, without credentials or path")
    return value


def strict_json(raw: bytes) -> dict:
    def pairs(items):
        value = {}
        for key, item in items:
            if key in value:
                raise Rejected("duplicate JSON key")
            value[key] = item
        return value
    def reject_constant(_):
        raise Rejected("non-finite JSON number")
    try:
        value = json.loads(raw, object_pairs_hook=pairs, parse_constant=reject_constant)
    except (ValueError, UnicodeError) as exc:
        raise Rejected("invalid JSON") from exc
    if not isinstance(value, dict):
        raise Rejected("JSON object required")
    return value


def validate_index(value: dict) -> dict:
    common = {"schemaVersion", "status"}
    if value.get("schemaVersion") != 1 or type(value.get("schemaVersion")) is not int:
        raise Rejected("unsupported release index")
    if value.get("status") == "unavailable" and set(value) == common:
        raise Rejected("Host installer is not published for this instance yet")
    expected = common | {"profile", "platform", "scriptPath", "releaseId", "sourceCommit", "bootstrapPath",
                         "bootstrapSha256", "bootstrapBytes", "bundlePath", "bundleSha256", "bundleBytes"}
    if (set(value) != expected or value.get("status") != "available" or value.get("profile") != PROFILE
            or value.get("platform") != PLATFORM or value.get("scriptPath") != "/host/install.sh"):
        raise Rejected("unsupported release fields/profile/platform")
    source, release = value.get("sourceCommit"), value.get("releaseId")
    if (not isinstance(source, str) or not re.fullmatch(HEX + "{40}", source)
            or not isinstance(release, str) or not re.fullmatch(r"[0-9]{14}-" + source[:12], release)):
        raise Rejected("release/source mismatch")
    for prefix, name, limit in (("bootstrap", "bootstrap.py", 262144), ("bundle", "bundle.tar.gz", MAX_BUNDLE)):
        if (value[prefix + "Path"] != f"/host/releases/{release}/{name}"
                or not isinstance(value[prefix + "Sha256"], str)
                or not re.fullmatch(HEX + "{64}", value[prefix + "Sha256"])
                or type(value[prefix + "Bytes"]) is not int or not 0 < value[prefix + "Bytes"] <= limit):
            raise Rejected("release path/digest/size is invalid")
    return value


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise Rejected("release redirects are not permitted")


def download(instance: str, path: str, destination: pathlib.Path, limit: int,
             digest: str | None = None, exact: int | None = None) -> None:
    origin(instance)
    if not re.fullmatch(r"/host/(stable\.json|releases/[0-9]{14}-[0-9a-f]{12}/(bootstrap\.py|bundle\.tar\.gz))", path):
        raise Rejected("unexpected release path")
    # Explicitly ignore proxy environment variables: release URLs and TLS stay on
    # this selected origin; redirects, cookies and credential headers are absent.
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
    request = urllib.request.Request(instance + path, headers={"Accept": "application/octet-stream"})
    hasher, count = hashlib.sha256(), 0
    deadline = time.monotonic() + (1800 if path.endswith("bundle.tar.gz") else 120)
    with opener.open(request, timeout=30) as response, destination.open("xb") as out:
        if response.status != 200 or response.geturl() != instance + path:
            raise Rejected("release response is not the expected same-origin resource")
        length = response.headers.get("Content-Length")
        if length is not None and (not length.isdigit() or int(length) > limit
                                   or (exact is not None and int(length) != exact)):
            raise Rejected("release Content-Length mismatch")
        while chunk := response.read(min(65536, limit + 1 - count)):
            if time.monotonic() > deadline:
                raise Rejected("release download exceeded time limit")
            count += len(chunk)
            if count > limit:
                raise Rejected("release exceeds byte limit")
            out.write(chunk)
            hasher.update(chunk)
    if (exact is not None and count != exact) or (digest is not None and hasher.hexdigest() != digest):
        raise Rejected("release SHA-256/size mismatch; no installer was executed")


def require_platform() -> None:
    if sys.platform != "linux" or platform.machine() != "x86_64":
        raise Rejected("only Ubuntu 24.04 x86_64 is supported")
    try:
        fields = dict(line.split("=", 1) for line in pathlib.Path("/etc/os-release").read_text().splitlines()
                      if "=" in line and not line.startswith("#"))
    except OSError as exc:
        raise Rejected("Ubuntu release could not be verified") from exc
    if fields.get("ID", "").strip('"') != "ubuntu" or fields.get("VERSION_ID", "").strip('"') != "24.04":
        raise Rejected("only Ubuntu 24.04 x86_64 is supported")


class BoundedTarInfo(tarfile.TarInfo):
    @classmethod
    def frombuf(cls, buf, encoding, errors):
        item = super().frombuf(buf, encoding, errors)
        if item.type == tarfile.GNUTYPE_SPARSE:
            raise Rejected("sparse archive metadata is not supported")
        if item.type in {tarfile.XHDTYPE, tarfile.XGLTYPE, tarfile.GNUTYPE_LONGNAME, tarfile.GNUTYPE_LONGLINK} and item.size > 16384:
            raise Rejected("archive extension metadata exceeds limit")
        return item


def _safe_members(archive: tarfile.TarFile, total_limit: int, file_limit: int) -> list:
    members, names, total = [], set(), 0
    for item in archive:
        path = pathlib.PurePosixPath(item.name)
        if (not item.name or len(item.name) > 4096 or any(ord(x) < 32 or ord(x) == 127 for x in item.name)
                or item.name != path.as_posix() or path.is_absolute() or ".." in path.parts
                or "." in item.name.split("/") or item.name in names or len(names) >= file_limit
                or not (item.isfile() or item.isdir()) or set(item.pax_headers) - {"path", "mtime", "atime", "ctime"}
                or item.mode & ~0o777 or item.size < 0):
            raise Rejected("unsafe archive path, duplicate, link, metadata or entry type")
        names.add(item.name)
        total += item.size
        if total > total_limit:
            raise Rejected("archive expanded size exceeds limit")
        members.append(item)
    return members


def validate_host(archive: pathlib.Path, index: dict) -> dict:
    with tarfile.open(archive, "r:gz", tarinfo=BoundedTarInfo) as tf:
        members = _safe_members(tf, 4 * 1024**3, 20000)
        name = f"moxbot-host-test/releases/{index['releaseId']}/manifest.json"
        if any(x.name != "moxbot-host-test" and not x.name.startswith("moxbot-host-test/") for x in members):
            raise Rejected("Host archive root does not match profile")
        by_name = {x.name: x for x in members if x.isfile()}
        if name not in by_name or by_name[name].size > 4 * 1024**2:
            raise Rejected("Host manifest missing/oversized")
        value = strict_json(tf.extractfile(name).read())
        if (type(value.get("schemaVersion")) is not int or value.get("schemaVersion") != 1 or value.get("profile") != PROFILE
                or value.get("target") != "linux-x64-glibc" or value.get("sourceDirty") is not False
                or value.get("sourceCommit") != index["sourceCommit"] or value.get("releaseId") != index["releaseId"]):
            raise Rejected("Host source/profile/platform/release mismatch or dirty source")
        files = value.get("files")
        if not isinstance(files, list) or not files:
            raise Rejected("Host file manifest missing")
        expected = {name}
        prefix = name.rsplit("/", 1)[0] + "/"
        for entry in files:
            if not isinstance(entry, dict) or set(entry) != {"path", "sha256", "size", "mode"}:
                raise Rejected("invalid Host file metadata")
            path = entry["path"]
            if not isinstance(path, str) or path != pathlib.PurePosixPath(path).as_posix() or path.startswith("/") or ".." in path.split("/"):
                raise Rejected("invalid Host file path")
            full = prefix + path
            if full in expected or full not in by_name:
                raise Rejected("Host file duplicate or missing")
            expected.add(full)
            member = by_name[full]
            if (type(entry["size"]) is not int or entry["size"] <= 0 or member.size != entry["size"]
                    or type(entry["mode"]) is not int or member.mode != entry["mode"]):
                raise Rejected("Host file size/mode mismatch")
            h = hashlib.sha256()
            stream = tf.extractfile(member)
            while chunk := stream.read(65536):
                h.update(chunk)
            if h.hexdigest() != entry["sha256"]:
                raise Rejected("Host file SHA-256 mismatch")
        if expected != set(by_name):
            raise Rejected("Host contains unlisted files")
        allowed_directories = {parent.as_posix() for path in expected
                               for parent in pathlib.PurePosixPath(path).parents if parent.as_posix() != "."}
        if any(x.isdir() and x.name not in allowed_directories for x in members):
            raise Rejected("Host contains unlisted directories")
        return value


def unpack_bundle(archive: pathlib.Path, destination: pathlib.Path, index: dict) -> dict:
    with tarfile.open(archive, "r:gz", tarinfo=BoundedTarInfo) as tf:
        members = _safe_members(tf, MAX_BUNDLE + 16 * 1024**2, 32)
        by_name = {x.name: x for x in members}
        if set(by_name) != FILES | {"manifest.json"} or not all(x.isfile() for x in members):
            raise Rejected("bundle must contain only the fixed release file set")
        if by_name["manifest.json"].size > 16384:
            raise Rejected("bundle manifest oversized")
        value = strict_json(tf.extractfile("manifest.json").read())
        if (set(value) != {"schemaVersion", "profile", "platform", "sourceCommit", "releaseId", "files"}
                or type(value["schemaVersion"]) is not int or value["schemaVersion"] != 1 or value["profile"] != PROFILE or value["platform"] != PLATFORM
                or value["sourceCommit"] != index["sourceCommit"] or value["releaseId"] != index["releaseId"]
                or not isinstance(value["files"], dict) or set(value["files"]) != FILES):
            raise Rejected("bundle source/profile/platform/release mismatch")
        for name in sorted(FILES):
            entry, member = value["files"][name], by_name[name]
            limit = MAX_BUNDLE if name == "host.tar.gz" else 128 * 1024**2 if name == "network/myagents-host-network" else 262144
            mode = 0o755 if name == "network/myagents-host-network" or name == "installers/install.sh" else 0o644
            if (not isinstance(entry, dict) or set(entry) != {"sha256", "size", "mode"}
                    or type(entry["size"]) is not int or not 0 < entry["size"] <= limit or member.size != entry["size"]
                    or type(entry["mode"]) is not int or entry["mode"] != mode or member.mode != mode or not isinstance(entry["sha256"], str)
                    or not re.fullmatch(HEX + "{64}", entry["sha256"])):
                raise Rejected("bundle file metadata invalid")
            path = destination / name
            path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
            h = hashlib.sha256()
            with tf.extractfile(member) as inp, path.open("xb") as out:
                while chunk := inp.read(65536):
                    h.update(chunk)
                    out.write(chunk)
            if h.hexdigest() != entry["sha256"]:
                raise Rejected("bundle file SHA-256 mismatch")
            path.chmod(mode)
        if (destination / "network/source-commit.txt").read_bytes() != (index["sourceCommit"] + "\n").encode():
            raise Rejected("network source commit mismatch")
        binary = (destination / "network/myagents-host-network").open("rb")
        with binary:
            header = binary.read(20)
        if len(header) != 20 or header[:6] != b"\x7fELF\x02\x01" or int.from_bytes(header[18:20], "little") != 62:
            raise Rejected("network artifact is not Linux x86_64 ELF")
        validate_host(destination / "host.tar.gz", index)
        return value


def load_module(name: str, path: pathlib.Path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def node_ready(device: str) -> None:
    result = subprocess.run(["/opt/moxbot-host-test/bin/moxbot-host", "doctor"], check=True,
                            stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=15)
    if len(result.stdout) > 65536:
        raise Rejected("Node doctor response oversized")
    value = strict_json(result.stdout)
    if (value.get("hostId") != device or value.get("runtime", {}).get("node") != "24.20.0"
            or value.get("runtime", {}).get("sdkBinaryPresent") is not True):
        raise Rejected("Node Host IPC readiness check failed")


def renew_management(control) -> str:
    """Only bounded non-secret renewal diagnostics may be captured."""
    command = [sys.executable, str(pathlib.Path(control.__file__)), "--profile", PROFILE, "renew-management"]
    renewed = subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=120,
                             pass_fds=_inherited_fds())
    if len(renewed.stdout) + len(renewed.stderr) > 16384:
        raise Rejected("management renewal returned oversized diagnostics")
    if renewed.returncode == 0:
        record = strict_json(renewed.stdout)
        if record.get("status") not in {"renewed", "unchanged"}:
            raise Rejected("management renewal success was not confirmed")
        return "OK"
    records = []
    for line in renewed.stderr.splitlines():
        try:
            record = strict_json(line)
            if record.get("status") == "error" and isinstance(record.get("code"), str):
                records.append(record["code"])
        except Rejected:
            pass
    if len(records) != 1:
        raise Rejected("management renewal failed without a verified diagnostic; inspect network status")
    return records[0]


def finish_join(control, device: str) -> str:
    try:
        if control.run_control("join", PROFILE, enable_on_boot=True) != 0:
            raise ValueError("join did not complete")
        node_ready(device)
        return device
    except (Rejected, OSError, ValueError, subprocess.SubprocessError) as exc:
        # Called only when this invocation found the connector inactive. Do not
        # leave our failed new run blocking the next recovery attempt.
        subprocess.run(["systemctl", "stop", control.DAEMON_UNIT], check=True,
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        raise Rejected("join/readiness incomplete; identity and login preserved; rerun the same command") from exc


def onboard(control) -> str:
    control.select_profile(PROFILE)
    device = control.verified_host_id()
    # Existing ready installations do not log in again, renew bindings or restart
    # their Node PID. A failed check never stops an already-running connector.
    running = subprocess.run(["systemctl", "is-active", "--quiet", control.DAEMON_UNIT],
                             stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0
    try:
        if control.run_control("run", PROFILE, enable_on_boot=True) != 0:
            raise ValueError("connector could not start")
        node_ready(device)
        return device
    except (OSError, ValueError, subprocess.SubprocessError):
        if running:
            raise Rejected("existing connector needs operator attention; inspect network status and rerun after maintenance")
        subprocess.run(["systemctl", "stop", control.DAEMON_UNIT], check=True,
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    # Recover authorization completed on a prior attempt without rotating its
    # login. Only this explicitly requested installation may request the join.
    try:
        if control.run_control("join", PROFILE, enable_on_boot=True) == 0:
            node_ready(device)
            return device
    except (OSError, ValueError, subprocess.SubprocessError):
        subprocess.run(["systemctl", "stop", control.DAEMON_UNIT], check=True,
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    # Connectivity, corrupt state and scope failures must never rotate a valid
    # login. Ask the native authority for a bounded reason before starting auth.
    reason = renew_management(control)
    if reason == "OK":
        return finish_join(control, device)
    if reason not in {"OWNED_REAUTH_REQUIRED", "SPACE_REAUTH_REQUIRED", "ACCOUNT_SESSION_EXPIRED",
                       "ACCOUNT_AUTH_REVOKED", "NOT_AUTHENTICATED", "OWNED_SESSION_INVALID"}:
        raise Rejected("existing authorization needs operator attention; no login, pin or scope was changed")
    print("Open the short authorization URL below in your browser. This command will continue after authorization.", flush=True)
    try:
        if control.run_control("start", PROFILE) != 0 or control.run_control("wait", PROFILE) != 0:
            raise Rejected("browser authorization canceled, expired or incomplete; identity is preserved; rerun the same install command")
    except KeyboardInterrupt:
        # Fence a late browser result using the native cancellation owner before
        # releasing the transaction; never leave an interrupted poll authoritative.
        control.run_control("cancel", PROFILE)
        raise
    # This operation never creates a grant or permits a principal/scope change.
    # Only the native owner's exact MISSING result permits first enrollment.
    if renew_management(control) not in {"OK", "HOST_MANAGEMENT_GRANT_MISSING"}:
        raise Rejected("management binding renewal refused; same principal is required; no pins were changed")
    # The install command explicitly requests enrollment and boot reconnect.
    return finish_join(control, device)


def _inherited_fds() -> tuple:
    text = os.environ.get("MYAGENTS_HOST_TRANSACTION_LOCK_FD")
    return (int(text),) if text and re.fullmatch(r"[1-9][0-9]*", text) and int(text) >= 3 else ()


def consume(instance: str, index: dict, archive: pathlib.Path, scratch: pathlib.Path) -> str:
    manifest = unpack_bundle(archive, scratch, index)
    unified = load_module("one_command_unified", scratch / "installers/unified-install.py")
    control = load_module("one_command_control", scratch / "installers/network-control.py")
    fd = unified._acquire_lock()
    previous = os.environ.get("MYAGENTS_HOST_TRANSACTION_LOCK_FD")
    os.environ["MYAGENTS_HOST_TRANSACTION_LOCK_FD"] = str(fd)
    try:
        # unified.install closes its descriptor; an inherited duplicate keeps the
        # whole install/login/join transaction exclusive until this function exits.
        child_fd = os.dup(fd)
        os.environ["MYAGENTS_HOST_TRANSACTION_LOCK_FD"] = str(child_fd)
        try:
            unified.install(argparse.Namespace(profile=PROFILE, host_archive=str(scratch / "host.tar.gz"),
                host_sha256=manifest["files"]["host.tar.gz"]["sha256"], network_artifact_dir=str(scratch / "network"),
                network_sha256=manifest["files"]["network/myagents-host-network"]["sha256"],
                network_source_commit=index["sourceCommit"], owned_instance=instance, public_tls_ca_file=None))
        finally:
            try:
                os.close(child_fd)
            except OSError:
                pass
            os.environ["MYAGENTS_HOST_TRANSACTION_LOCK_FD"] = str(fd)
        return onboard(control)
    finally:
        os.close(fd)
        if previous is None:
            os.environ.pop("MYAGENTS_HOST_TRANSACTION_LOCK_FD", None)
        else:
            os.environ["MYAGENTS_HOST_TRANSACTION_LOCK_FD"] = previous


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--instance", required=True)
    parser.add_argument("--index", help=argparse.SUPPRESS)
    args = parser.parse_args()
    try:
        require_platform()
        if os.geteuid() != 0:
            raise Rejected("run the installer through sudo")
        instance = origin(args.instance)
        if args.index is None:
            with tempfile.TemporaryDirectory(prefix="moxbots-bootstrap-") as temp:
                stage = pathlib.Path(temp)
                stage.chmod(0o700)
                index_path = stage / "stable.json"
                download(instance, "/host/stable.json", index_path, 16384)
                index = validate_index(strict_json(index_path.read_bytes()))
                bootstrap = stage / "bootstrap.py"
                download(instance, index["bootstrapPath"], bootstrap, 262144,
                         index["bootstrapSha256"], index["bootstrapBytes"])
                return subprocess.run([sys.executable, str(bootstrap), "--instance", instance,
                                       "--index", str(index_path)], check=False).returncode
        raw = pathlib.Path(args.index).read_bytes()
        if len(raw) > 16384:
            raise Rejected("index oversized")
        index = validate_index(strict_json(raw))
        if index["sourceCommit"] != globals().get("EXPECTED_SOURCE_COMMIT"):
            raise Rejected("bootstrap source pin mismatch")
        with tempfile.TemporaryDirectory(prefix="moxbots-onboard-") as temp:
            scratch = pathlib.Path(temp)
            scratch.chmod(0o700)
            archive = scratch / "bundle.tar.gz"
            download(instance, index["bundlePath"], archive, MAX_BUNDLE, index["bundleSha256"], index["bundleBytes"])
            target = scratch / "verified"
            target.mkdir(mode=0o700)
            device = consume(instance, index, archive, target)
        print(f"MoXBots Host ready. HostID: {device}. Boot reconnect enabled.")
        return 0
    except KeyboardInterrupt:
        print("Authorization interrupted. Identity and configuration are preserved; rerun the same command.", file=sys.stderr)
        return 130
    except (Rejected, OSError, ValueError, tarfile.TarError, subprocess.SubprocessError) as exc:
        print(f"HOST_INSTALL_INCOMPLETE: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
