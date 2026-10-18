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
import ctypes
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import platform
import re
import secrets
import select
import selectors
import shutil
import signal
import socket
import sqlite3
import ssl
import stat
import struct
import subprocess
import sys
import tempfile
import time
import threading
import urllib.request
from urllib.parse import urlsplit
import uuid

sys.dont_write_bytecode = True  # imports must not add generated files to clean product M
_GUEST = None  # optional strictly guarded nested-KVM target; default lane is local
SAFE_CLI_ERRORS = frozenset({"OWNED_REAUTH_REQUIRED", "SPACE_REAUTH_REQUIRED", "ACCOUNT_SESSION_EXPIRED",
    "ACCOUNT_AUTH_REVOKED", "NOT_AUTHENTICATED", "OWNED_SESSION_INVALID", "AUTH_CANCELLED", "AUTH_NOT_PENDING",
    "AUTH_EXPIRED", "AUTH_SCOPE_MISMATCH", "AUTH_ATTEMPT_STALE", "AUTH_EXPIRY_INVALID", "OWNED_STATE_CORRUPT",
    "CLI_USAGE_INVALID", "NETWORK_PROXY_INVALID", "PUBLIC_TLS_CA_UNSAFE", "NETWORK_CONTROL_REJECTED",
    "HOST_MANAGEMENT_GRANT_MISSING", "NETWORK_CREDENTIAL_STORE_AUTHORIZATION_REQUIRED"})
SAFE_STATUS_ERRORS = SAFE_CLI_ERRORS | frozenset({"NETWORK_TRANSPORT_FAILED", "NETWORK_ENDPOINT_INVALID",
    "NETWORK_CERTIFICATE_INVALID", "NETWORK_CONNECTION_CLOSED", "NETWORK_CONNECTION_TIMEOUT", "NETWORK_TOKEN_EXPIRED",
    "NETWORK_CATALOG_CHANGED", "NETWORK_CATALOG_INVALID", "NETWORK_CATALOG_OWNER_CHANGED", "NETWORK_CATALOG_TOO_LARGE",
    "NETWORK_CATALOG_UNAVAILABLE", "HOST_MANAGEMENT_BINDING_INVALID", "HOST_MANAGEMENT_REBIND_REQUIRED",
    "HOST_MANAGEMENT_RESPONSE_INVALID", "HOST_MANAGEMENT_UNCONFIRMED", "OWNED_MEMBERSHIP_REQUIRED",
    "ACCOUNT_BINDING_CHANGED", "SESSION_REAUTH_REQUIRED", "READY_PRECONDITION_FAILED", "NETWORK_RESPONSE_INVALID",
    "NETWORK_REQUEST_INVALID", "NETWORK_PROOF_INVALID", "CONTROL_INVALID", "CONTROL_SCOPE_MISMATCH", "CONTROL_UNEXPECTED",
    "CHANNEL_FRAME_INVALID", "CATALOG_INVALID", "CATALOG_NOT_CURRENT", "OWNED_SESSION_RENEWAL_INVALID", "STATUS_STALE",
    "HOST_MANAGEMENT_GRANT_CORRUPT", "HOST_MANAGEMENT_UNEXPECTED_RESPONSE", "NETWORK_TRUST_CHANGED",
    "OWNED_INSTANCE_TRUST_CHANGED", "NETWORK_HELLO_TIMEOUT", "NETWORK_BACKPRESSURE", "OWNED_JOIN_REQUIRED",
    "OWNED_JOIN_UNCONFIRMED", "OWNED_PROFILE_REQUIRED", "NETWORK_UPGRADE_REJECTED",
    "NETWORK_METADATA_INVALID", "NETWORK_METADATA_SCOPE_MISMATCH", "NETWORK_PAGE_INVALID",
    "DEVICE_NOT_REGISTERED", "CATALOG_CAPACITY", "HOST_MANAGEMENT_UNAVAILABLE",
    "HOST_MANAGEMENT_IPC_PEER_REJECTED", "HOST_MANAGEMENT_REQUEST_TOO_LARGE"})

# Source-reviewed P2 startup paths: cli -> encrypted store/discovery -> lock/IPC.
SAFE_STARTUP_ERRORS = SAFE_STATUS_ERRORS | frozenset({"NETWORK_DESCRIPTOR_INVALID", "OWNED_ACCOUNT_UNAVAILABLE",
    "OWNED_RESPONSE_INVALID", "OWNED_RESPONSE_TOO_LARGE", "OWNED_PIN_CORRUPT", "PUBLIC_TLS_CA_UNAVAILABLE",
    "PUBLIC_TLS_CA_INVALID", "DEVICE_ID_INVALID", "ACCOUNT_STATE_SCOPE_MISMATCH", "OWNED_STATE_SCOPE_MISMATCH",
    "OWNED_SCOPE_INVALID", "NETWORK_CREDENTIAL_BACKEND_UNSUPPORTED", "NETWORK_CREDENTIAL_STORE_UNAVAILABLE",
    "NETWORK_CREDENTIAL_KEY_MISSING", "NETWORK_CREDENTIAL_GENERATION_CONFLICT", "NETWORK_CREDENTIAL_CORRUPT",
    "NETWORK_CREDENTIAL_PATH_UNSAFE", "NETWORK_CREDENTIAL_PERSISTENCE_UNCONFIRMED", "NETWORK_KEY_INVALID",
    "OWNER_LOCK_UNAVAILABLE", "OWNER_LOCK_UNSAFE", "OWNER_ALREADY_RUNNING", "STATUS_PATH_UNSAFE", "STATUS_UNAVAILABLE",
    "HOST_MANAGEMENT_IPC_PATH_INVALID", "HOST_MANAGEMENT_IPC_IDENTITY_INVALID", "HOST_MANAGEMENT_IPC_PATH_EXISTS",
    "HOST_MANAGEMENT_IPC_BIND_FAILED", "ASSET_STORE_UNAVAILABLE"})

PRODUCT = "58d5247d7692acb816f211e1af7ef1891871bd6a"
RELEASE = "20261018152704-58d5247d7692"
PUBLIC = "https://140.143.183.232"
ORIGIN = "https://127.0.0.1:24443"
DEX_IMAGE = "ghcr.io/dexidp/dex:v2.46.0"
SERVICE_BYTES = 27510672
SERVICE_RUN = "39140386138"
SERVICE_ARTIFACT_ID = "12141537459"
SERVICE_ARTIFACT_NAME = "host-agentnet-service-58d5247d7692acb816f211e1af7ef1891871bd6a"
SERVICE_SHA = "59e2a8ed29d8c6c9dada0df284c58e76a34e05d2018582a2c45ae234fe6c64bd"
INSTALL_SHA = "c317033d7bf4ae77160e2a528ae83e88d4f3edd4a59f771af2b98fba10a6853b"
STABLE_SHA = "697204f6c467b5f66c4555588ad9b65122f7bef01d90cabc3e60bd2b4a211002"
PINS = {
    "bootstrap.py": (24272, "522ee5f0d7a100c3a808bdd3a0745b31bc430138d2628d7a935d715ab74c3e5a"),
    "bundle.tar.gz": (171496242, "3181bf17a51f1c5bd5cfe646af3ff3bddc4c0ae711e4f4120a795a60ad7c152c"),
}
NODE = "moxbot-host-test.service"
CONNECTOR = "moxbot-host-network-test.service"
AUTH_UNITS = tuple("moxbot-host-network-test-auth-" + action + ".service" for action in ("start", "wait", "cancel"))
STATUS = Path("/run/moxbot-host-network-test/status.json")
_BOOTSTRAP_STATE = Path("/var/lib/moxbot-host-test")
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


def host_run(command, **kwargs):
    return _GUEST.run(command, **kwargs) if _GUEST else run(command, **kwargs)


def host_status():
    return _GUEST.call("status") if _GUEST else json.loads(STATUS.read_bytes())


def canceled_status_observation():
    # M tmpfiles creates a zero-byte status before an account/daemon exists.
    # This projection is only for the canceled, proven inactive daemon gate;
    # live ready() continues to use strict host_status() JSON parsing.
    if _GUEST:
        return _GUEST.call("canceled-status-observation")
    try:
        with STATUS.open("rb") as stream:
            raw = stream.read(65537)
    except FileNotFoundError:
        return {"kind": "missing", "ready": False}
    need(len(raw) <= 65536, "canceled-status-size-bound")
    if raw == b"":
        return {"kind": "empty", "ready": False}
    value = json.loads(raw)  # nonempty invalid JSON remains an error
    need(isinstance(value, dict) and value.get("ready", False) is False
         and value.get("state") != "ready", "canceled-install-not-Ready")
    return {"kind": "json-non-ready", "ready": False}


def canceled_connector_inactive(observation=None, save_observation=None):
    result = host_run(["systemctl", "show", CONNECTOR, "--property=LoadState,ActiveState,MainPID"])
    rows = [line.partition("=") for line in result.stdout.decode("ascii", errors="replace").splitlines()]
    properties = {key: value for key, _, value in rows}
    load_states = {"loaded", "not-found", "bad-setting", "error", "merged", "masked", "stub"}
    active_states = {"active", "reloading", "inactive", "failed", "activating", "deactivating", "maintenance", "refreshing"}
    fields_valid = (len(rows) == 3 and all(separator == "=" for _, separator, _ in rows)
                    and set(properties) == {"LoadState", "ActiveState", "MainPID"}
                    and properties.get("LoadState") in load_states
                    and properties.get("ActiveState") in active_states
                    and re.fullmatch(r"[0-9]{1,10}", properties.get("MainPID", "")) is not None)
    projection = {"fieldsValid": fields_valid,
        "loadState": properties.get("LoadState") if properties.get("LoadState") in load_states else "unknown-redacted",
        "activeState": properties.get("ActiveState") if properties.get("ActiveState") in active_states else "unknown-redacted",
        "mainPidIsZero": properties.get("MainPID") == "0"}
    if observation is not None:
        observation.update(projection)
    if save_observation:
        save_observation()  # persist only the closed projection before assertion
    need(fields_valid and projection["loadState"] == "loaded" and projection["mainPidIsZero"]
         and projection["activeState"] in {"inactive", "failed"},
         "canceled-install-connector-inactive")
    return True


def safe_exception_class(error):
    allowed = (Rejected, json.JSONDecodeError, sqlite3.OperationalError, sqlite3.DatabaseError,
               FileNotFoundError, PermissionError, ValueError, TypeError, KeyError, OSError,
               subprocess.TimeoutExpired)
    return type(error).__name__ if type(error) in allowed else "unexpected-exception-type-redacted"


def installer_failure_reason(output):
    # Exact frozen-M phrases only. Never retain the suffix or exception text.
    phrases = {
        b"Service did not become ready with the expected Node and Claude SDK; rolling back": "Node-install-readiness-rollback",
        b"Host package installation failed; its installer performed its own rollback": "Host-install-own-rollback",
        b"Host install failed and prior Host state could not be restored": "Host-rollback-unconfirmed",
        b"network install failed and Host rollback could not be verified": "Host-rollback-unconfirmed",
        b"owned network package installation failed; prior Host release and unit were restored": "network-install-prior-Host-restored",
        b"HOST_INSTALL_INCOMPLETE: join/readiness incomplete; identity and login preserved; rerun the same command": "join-or-readiness-incomplete",
        b"HOST_INSTALL_INCOMPLETE: Node Host IPC readiness check failed": "Node-IPC-contract-failed",
        b"HOST_INSTALL_INCOMPLETE: existing connector needs operator attention; inspect network status and rerun after maintenance": "existing-connector-needs-attention",
        b"HOST_INSTALL_INCOMPLETE: management binding renewal refused; same principal is required; no pins were changed": "management-binding-renewal-refused",
        b"HOST_INSTALL_INCOMPLETE: browser authorization canceled, expired or incomplete; identity is preserved; rerun the same install command": "browser-authorization-incomplete",
    }
    return sorted(label for phrase, label in phrases.items() if phrase + b"\n" in output)


def bounded_file_bytes(path, limit):
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK | os.O_CLOEXEC)
    try:
        info = os.fstat(fd)
        need(stat.S_ISREG(info.st_mode) and info.st_nlink == 1 and info.st_size <= limit, "observation-file-bound")
        data = os.read(fd, limit + 1)
        need(len(data) <= limit, "observation-file-bound")
        return data, info
    finally:
        os.close(fd)


def status_event_projection(expected, process_context=None):
    """Status-only, <=2KiB, no subprocesses, raw values remain in memory."""
    try:
        raw, _ = bounded_file_bytes(STATUS, 2048)
        if not raw:
            return {"kind": "empty"}
        value = json.loads(raw)
        if not isinstance(value, dict):
            return {"kind": "invalid-schema"}
        state, code, updated = value.get("state"), value.get("errorCode"), value.get("updatedAt")
        states = {"connecting", "initializing", "catalog", "hydrating", "ready", "signedOut", "expired", "unavailable", "stopped"}
        projection = {"kind": "JSON-object", "state": state if isinstance(state, str) and state in states else "unknown-redacted",
            "errorCode": code if isinstance(code, str) and code in SAFE_STATUS_ERRORS else (None if code is None else "unknown-redacted"),
            "errorCodeIsNull": code is None, "readyIsTrue": value.get("ready") is True,
            "schemaFieldsMatch": set(value) == {"state", "deviceId", "networkId", "ready", "errorCode", "updatedAt", "pid", "instanceId"},
            "freshWithin30Seconds": type(updated) is int and -2 <= time.time() - updated <= 30,
            "deviceMatchesProvisioned": expected is not None and value.get("deviceId") == expected}
        if process_context is not None:
            pid = value.get("pid")
            projection["samePidAsPrevious"] = type(pid) is int and pid > 0 and pid == process_context.get("previousPid")
            process_context["previousPid"] = pid if type(pid) is int and pid > 0 else None
        return projection
    except FileNotFoundError:
        return {"kind": "missing"}
    except json.JSONDecodeError:
        return {"kind": "invalid-JSON"}
    except Exception:
        return {"kind": "unavailable"}


class StatusEventWatcher:
    """Independent Linux inotify observer; never a product readiness gate."""
    MOVED_TO, CLOSE_WRITE, OVERFLOW, LOST = 0x80, 0x8, 0x4000, 0x8000 | 0x400 | 0x800

    def __init__(self):
        self.lock, self.stop_event = threading.Lock(), threading.Event()
        self.history, self.first_error, self.flags = [], None, {}
        self.fd, self.thread = -1, None
        self.expected = None
        self.process_context = {}  # raw PID stays only in controlled memory
        self.started = time.monotonic()
        self.last_projection = None

    def start(self):
        try:
            need(sys.platform == "linux", "status-inotify-Linux-only")
            try:
                value = json.loads(bounded_file_bytes(IDENTITY_FILES[0], 65536)[0]).get("hostId")
                if isinstance(value, str) and str(uuid.UUID(value)) == value:
                    self.expected = value
            except Exception:
                pass
            libc = ctypes.CDLL(None, use_errno=True)
            libc.inotify_init1.argtypes, libc.inotify_init1.restype = [ctypes.c_int], ctypes.c_int
            libc.inotify_add_watch.argtypes, libc.inotify_add_watch.restype = [ctypes.c_int, ctypes.c_char_p, ctypes.c_uint32], ctypes.c_int
            self.fd = libc.inotify_init1(os.O_NONBLOCK | os.O_CLOEXEC)
            need(self.fd >= 0, "status-inotify-init")
            self.watch_id = libc.inotify_add_watch(self.fd, os.fsencode(STATUS.parent), self.MOVED_TO | self.CLOSE_WRITE | 0x400 | 0x800)
            need(self.watch_id >= 0, "status-inotify-arm")
            self.flags["armed"] = True
            self.sample()
            self.thread = threading.Thread(target=self.watch, name="fixed-status-observer", daemon=True)
            self.thread.start()
        except Exception:
            self.flags["setupUnavailable"] = True
            if self.fd >= 0:
                os.close(self.fd)
                self.fd = -1
        return self

    def sample(self):
        projection = status_event_projection(self.expected, self.process_context)
        with self.lock:
            if projection == self.last_projection:
                return
            previous_state = self.last_projection.get("state") if self.last_projection else None
            self.last_projection = dict(projection)
            entry = {"seconds": round(time.monotonic() - self.started, 3), "previousState": previous_state, **projection}
            if self.first_error is None and (projection.get("errorCodeIsNull") is False
                    or projection.get("state") in {"signedOut", "expired", "unavailable"}):
                self.first_error = dict(entry)
            if len(self.history) >= 128:
                self.flags["historyTruncated"] = True
                self.history.pop(0)
            self.history.append(entry)

    def events(self, data):
        offset = 0
        while offset < len(data):
            if len(data) - offset < 16:
                self.flags["malformedEvent"] = True
                return
            watch_id, mask, _, length = struct.unpack_from("iIII", data, offset)
            offset += 16
            if length > 256 or offset + length > len(data):
                self.flags["malformedEvent"] = True
                return
            name = data[offset:offset + length].split(b"\0", 1)[0]
            offset += length
            if mask & self.OVERFLOW:
                self.flags["eventOverflow"] = True
            if mask & self.LOST:
                self.flags["watchLost"] = True
            if watch_id == self.watch_id and name == b"status.json" and mask & (self.MOVED_TO | self.CLOSE_WRITE):
                self.sample()

    def watch(self):
        try:
            deadline = self.started + 270
            while not self.stop_event.is_set() and time.monotonic() < deadline:
                if select.select([self.fd], [], [], 0.1)[0]:
                    self.events(os.read(self.fd, 65536))
            if time.monotonic() >= deadline:
                self.flags["boundedDeadlineReached"] = True
        except Exception:
            self.flags["observationUnavailable"] = True

    def snapshot(self):
        with self.lock:
            return {"enabled": True, "flags": dict(self.flags), "history": [dict(value) for value in self.history],
                    "firstError": dict(self.first_error) if self.first_error else None}

    def close(self):
        self.stop_event.set()
        if self.thread is not None:
            self.thread.join(timeout=1)
            self.flags["threadStopped"] = not self.thread.is_alive()
        if self.fd >= 0:
            os.close(self.fd)
            self.fd = -1
        if self.flags.get("armed"):
            self.sample()  # final fixed-file read before outer resource cleanup
        return self.snapshot()


def registry_file_observation():
    """Fixed original registry contract only; never initialize or repair it."""
    directory = Path("/var/lib/moxbot-host-test/home/.myagents")
    observed = {}
    try:
        import pwd
        node = pwd.getpwnam("moxbot-host-test")
    except Exception:
        return {name: {"kind": "unsafe"} for name in ("config", "projects")}
    parent_fd = -1
    try:
        parent_fd = os.open(directory, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC)
        parent = os.fstat(parent_fd)
        if parent.st_uid != node.pw_uid or stat.S_IMODE(parent.st_mode) & 0o077:
            return {name: {"kind": "unsafe"} for name in ("config", "projects")}
        for name in ("config", "projects"):
            value, fd = {"kind": "unsafe"}, -1
            observed[name] = value
            try:
                fd = os.open(name + ".json", os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK | os.O_CLOEXEC, dir_fd=parent_fd)
                info = os.fstat(fd)
                value.update({"expectedNodeUID": info.st_uid == node.pw_uid, "mode600": stat.S_IMODE(info.st_mode) == 0o600,
                              "nonpublic": stat.S_IMODE(info.st_mode) & 0o077 == 0})
                if (not stat.S_ISREG(info.st_mode) or info.st_nlink != 1 or info.st_size > 4 * 1024**2
                        or not value["expectedNodeUID"] or not value["nonpublic"]):
                    continue
                raw = bytearray()
                while len(raw) <= 4 * 1024**2:
                    block = os.read(fd, min(65536, 4 * 1024**2 + 1 - len(raw)))
                    if not block:
                        break
                    raw.extend(block)
                if len(raw) > 4 * 1024**2:
                    continue
                value["kind"] = "invalidJSON"
                record = json.loads(raw)
                value["kind"] = "regular"
                if name == "config":
                    agents = record.get("agents") if isinstance(record, dict) else None
                    value.update({"configIsObject": isinstance(record, dict), "agentsIsArray": isinstance(agents, list),
                                  "agentCount": len(agents) if isinstance(agents, list) else None})
                else:
                    value.update({"projectsIsArray": isinstance(record, list),
                                  "projectCount": len(record) if isinstance(record, list) else None})
            except FileNotFoundError:
                value["kind"] = "missing"
            except Exception:
                pass  # only fixed enum/booleans/counts; no exception or file contents
            finally:
                if fd >= 0:
                    os.close(fd)
    except FileNotFoundError:
        observed = {name: {"kind": "missing"} for name in ("config", "projects")}
    except Exception:
        observed = {name: {"kind": "unsafe"} for name in ("config", "projects")}
    finally:
        if parent_fd >= 0:
            os.close(parent_fd)
    return observed


def startup_contract_observation():
    """Fixed P bootstrap input metadata only. Never journal, credentials or repair."""
    import pwd
    try:
        node_uid = pwd.getpwnam("moxbot-host-test").pw_uid
    except KeyError:
        return {"nodeAccountPresent": False}
    observed, handles, names = {"nodeAccountPresent": True, "directories": {}}, {}, {}

    def directory(path):
        fd = os.open(path.anchor, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC)
        safe = True
        try:
            for part in path.parts[1:]:
                parent = os.fstat(fd)
                sticky = parent.st_uid == 0 and bool(parent.st_mode & stat.S_ISVTX)
                safe = safe and parent.st_uid in {0, node_uid} and not (stat.S_IMODE(parent.st_mode) & (0o6000 if sticky else 0o7000))
                safe = safe and (not (parent.st_mode & 0o022) or sticky)
                next_fd = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC, dir_fd=fd)
                os.close(fd)
                fd = next_fd
            info = os.fstat(fd)
            value = {"kind": "directory", "canonicalPathMatches": path.resolve(strict=True) == path,
                     "ancestorsSafe": bool(safe), "expectedNodeUID": info.st_uid == node_uid,
                     "private700": stat.S_IMODE(info.st_mode) == 0o700}
            if not all(value[key] for key in ("canonicalPathMatches", "ancestorsSafe", "expectedNodeUID", "private700")):
                os.close(fd)
                return value, -1, None
            entries = set()
            with os.scandir(fd) as iterator:
                for entry in iterator:
                    if len(entries) >= 128:
                        value["entryLimitExceeded"] = True
                        return value, fd, None
                    entries.add(entry.name)  # names remain private, including unknown names
            return value, fd, entries
        except Exception:
            os.close(fd)
            raise

    def authority_file(name):
        fd = -1
        value = {"kind": "unsafe"}
        try:
            fd = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK | os.O_CLOEXEC, dir_fd=handles["state"])
            info = os.fstat(fd)
            value.update({"expectedNodeUID": info.st_uid == node_uid, "mode600": stat.S_IMODE(info.st_mode) == 0o600,
                          "singleLink": info.st_nlink == 1})
            if not stat.S_ISREG(info.st_mode) or info.st_size > 1024 or not all(value[key] for key in ("expectedNodeUID", "mode600", "singleLink")):
                return value, None
            raw = os.read(fd, 1025)
            if len(raw) != info.st_size or len(raw) > 1024:
                return value, None
            value["kind"] = "invalidJSON"
            data = json.loads(raw)
            value["kind"] = "regular"
            return value, data
        except FileNotFoundError:
            return {"kind": "missing"}, None
        except Exception:
            return value, None
        finally:
            if fd >= 0:
                os.close(fd)

    try:
        paths = {"state": _BOOTSTRAP_STATE, "home": _BOOTSTRAP_STATE / "home",
                 "registry": _BOOTSTRAP_STATE / "home/.myagents", "workspaces": _BOOTSTRAP_STATE / "workspaces",
                 "defaultWorkspace": _BOOTSTRAP_STATE / "workspaces/default"}
        for label, path in paths.items():
            try:
                value, fd, entries = directory(path)
                observed["directories"][label] = value
                if fd >= 0:
                    handles[label], names[label] = fd, entries
            except FileNotFoundError:
                observed["directories"][label] = {"kind": "missing"}
            except Exception:
                observed["directories"][label] = {"kind": "unsafe"}
        skel = {".bashrc", ".bash_logout", ".profile"}
        namespace = observed["freshNamespace"] = {}
        if names.get("state") is not None:
            namespace["stateEntriesMatchFreshContract"] = names["state"] <= {"home", "host.lock", "workspaces"}
        if names.get("home") is not None:
            namespace["homeEntriesMatchFreshContract"] = names["home"] <= skel | {".myagents"}
            namespace["homeHasNoSkeletonEntries"] = not bool(names["home"] & skel)
            skel_safe = True
            for name in names["home"] & skel:
                info = os.stat(name, dir_fd=handles["home"], follow_symlinks=False)
                skel_safe = skel_safe and stat.S_ISREG(info.st_mode) and info.st_uid == node_uid and info.st_nlink == 1 and not (info.st_mode & 0o022)
            namespace["skelMetadataMatches"] = bool(skel_safe)
        for label in ("workspaces", "defaultWorkspace"):
            if names.get(label) is not None:
                namespace[label + "Empty"] = not bool(names[label])
        if names.get("registry") is not None:
            namespace["registryHasExtraEntry"] = bool(names["registry"] - {"config.json", "projects.json", "agent-config-intent.lock", "projects.json.lock", "config.json.lock"})
        if "state" in handles:
            identity_meta, identity = authority_file("host-identity.json")
            marker_meta, marker = authority_file("registry-bootstrap-v1.json")
            def canonical_uuid(value):
                return isinstance(value, str) and re.fullmatch(r"[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}", value) is not None
            identity_ok = (isinstance(identity, dict) and set(identity) == {"hostId", "schemaVersion"}
                           and type(identity.get("schemaVersion")) is int and identity["schemaVersion"] == 1 and canonical_uuid(identity.get("hostId")))
            marker_ok = (isinstance(marker, dict) and set(marker) == {"version", "purpose", "hostId", "transaction", "phase"}
                         and type(marker.get("version")) is int and marker["version"] == 1 and marker.get("purpose") == "host-registry-bootstrap"
                         and canonical_uuid(marker.get("hostId")) and canonical_uuid(marker.get("transaction"))
                         and isinstance(marker.get("phase"), str) and marker["phase"] in {"pending", "committed"})
            identity_meta["schemaMatches"] = bool(identity_ok)
            marker_meta["phase"] = marker["phase"] if marker_ok else ("missing" if marker_meta["kind"] == "missing" else "invalid")
            observed.update({"identity": identity_meta, "marker": marker_meta,
                             "identityMatchesMarker": bool(identity_ok and marker_ok and identity["hostId"] == marker["hostId"])})
    except Exception:
        observed["observationUnavailable"] = True
    finally:
        for fd in handles.values():
            os.close(fd)
    return observed


def project_startup_errors(raw):
    """Each journal JSON record contains one MESSAGE; no arbitrary value escapes."""
    counts, unknown = collections.Counter(), False
    lines = raw.splitlines()
    for line in lines[:30]:
        try:
            record = json.loads(line)
            message = record.get("MESSAGE") if isinstance(record, dict) else None
            if not isinstance(message, str):
                continue
            value = json.loads(message)  # whole MESSAGE, not a substring or prefixed log
            if not isinstance(value, dict) or value.get("status") != "error":
                continue
            code = value.get("code")
            if isinstance(code, str) and code in SAFE_STARTUP_ERRORS:
                counts[code] += 1
            else:
                unknown = True
        except (ValueError, TypeError):
            pass  # non-JSON progress, system messages and all raw strings are discarded
    return {"codeCounts": dict(sorted(counts.items())), "unknownCodeObserved": unknown, "truncated": len(lines) > 30}


def connector_startup_error_observation():
    # Fixed current boot/unit/read-only journal query. Never follow or persist it.
    command = ["journalctl", "--boot=0", "--unit=" + CONNECTOR, "--lines=30", "--no-pager", "--quiet",
               "--output=json", "--output-fields=MESSAGE"]
    process = subprocess.Popen(command, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
    raw, truncated = bytearray(), False
    selector = selectors.DefaultSelector()
    try:
        selector.register(process.stdout, selectors.EVENT_READ)
        deadline = time.monotonic() + 2
        while selector.get_map():
            remaining = deadline - time.monotonic()
            need(remaining > 0, "startup-journal-read-deadline")
            for key, _ in selector.select(timeout=min(0.1, remaining)):
                block = os.read(key.fd, min(16384, 65537 - len(raw)))
                if not block:
                    selector.unregister(key.fileobj)
                    continue
                raw.extend(block)
                if len(raw) > 65536:
                    truncated = True
                    break
            if truncated:
                break
        if not truncated:
            need(process.wait(timeout=max(0.01, deadline - time.monotonic())) == 0, "startup-journal-read-failed")
        # Never parse a partial trailing record when the byte cap was reached.
        bounded = bytes(raw[:65536])
        if truncated:
            bounded = bounded.rsplit(b"\n", 1)[0] if b"\n" in bounded else b""
        result = project_startup_errors(bounded)
        result["truncated"] = result["truncated"] or truncated
        return result
    finally:
        selector.close()
        if process.poll() is None:
            process.terminate()  # only this diagnostic's owned journalctl process
            try:
                process.wait(timeout=1)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=1)
        process.stdout.close()
        raw.clear()


def runtime_readiness_observation(*, include_startup_errors=False):
    """Read-only closed projections; never a Ready gate, start or recovery."""
    need(type(include_startup_errors) is bool, "runtime-startup-errors-flag")
    if _GUEST:
        return _GUEST.call("runtime-readiness-observation", include_startup_errors=include_startup_errors)
    observed, pids = {"units": {}, "registryFiles": registry_file_observation(),
                      "startupContract": startup_contract_observation()}, {}
    enums = {"LoadState": {"loaded", "not-found", "error", "masked", "bad-setting", "stub", "merged"},
        "ActiveState": {"active", "inactive", "failed", "activating", "deactivating", "reloading", "maintenance", "refreshing"},
        "SubState": {"running", "exited", "dead", "failed", "start", "start-pre", "start-post", "stop", "stop-sigterm", "auto-restart"},
        "Result": {"success", "exit-code", "signal", "timeout", "start-limit-hit", "resources", "protocol", "core-dump", "oom-kill"},
        "Restart": {"no", "on-success", "on-failure", "on-abnormal", "on-watchdog", "on-abort", "always"}}
    for label, unit in (("Node", NODE), ("connector", CONNECTOR)):
        try:
            raw = run(["systemctl", "show", unit, "--property=LoadState,ActiveState,SubState,Result,ExecMainStatus,MainPID,Restart,NRestarts"], timeout=2).stdout
            rows = [line.partition("=") for line in raw.decode("ascii", errors="replace").splitlines()]
            fields = {key: value for key, _, value in rows}
            valid = (len(rows) == 8 and all(separator == "=" for _, separator, _ in rows)
                     and set(fields) == set(enums) | {"ExecMainStatus", "MainPID", "NRestarts"})
            values = {key: fields.get(key) if fields.get(key) in allowed else "unknown-redacted" for key, allowed in enums.items()}
            for key in ("ExecMainStatus", "MainPID", "NRestarts"):
                valid = valid and re.fullmatch(r"[0-9]{1,10}", fields.get(key, "")) is not None
            pids[label] = int(fields["MainPID"]) if valid else 0
            values.update({"fieldsValid": valid, "mainPidPositive": pids[label] > 0,
                           "execMainStatus": int(fields["ExecMainStatus"]) if valid and int(fields["ExecMainStatus"]) <= 255 else None,
                           "restartCount": int(fields["NRestarts"]) if valid and int(fields["NRestarts"]) <= 1000000 else None})
            observed["units"][label] = values
        except Exception:
            observed["units"][label] = {"observationUnavailable": True}
    expected = None
    try:
        identity = json.loads(bounded_file_bytes(IDENTITY_FILES[0], 65536)[0])
        candidate = identity.get("hostId")
        if isinstance(candidate, str) and str(uuid.UUID(candidate)) == candidate:
            expected = candidate
    except Exception:
        pass
    observed["provisionedIdentityReadable"] = expected is not None
    network_account = None
    try:
        import pwd
        network_account = pwd.getpwnam("moxbot-host-network-test")
    except Exception:
        pass
    try:
        raw, info = bounded_file_bytes(STATUS, 2048)
        projection = {"kind": "empty" if not raw else "invalid-JSON", "mode640": stat.S_IMODE(info.st_mode) == 0o640,
            "ownerMatchesNetwork": network_account is not None and info.st_uid == network_account.pw_uid,
            "groupMatchesNetwork": network_account is not None and info.st_gid == network_account.pw_gid}
        observed["status"] = projection
        if raw:
            value = json.loads(raw)
            if isinstance(value, dict):
                code = value.get("errorCode")
                updated = value.get("updatedAt")
                projection.update({"kind": "JSON-object",
                    "schemaFieldsMatch": set(value) == {"state", "deviceId", "networkId", "ready", "errorCode", "updatedAt", "pid", "instanceId"},
                    "state": value.get("state") if isinstance(value.get("state"), str) and value.get("state") in
                    {"connecting", "initializing", "catalog", "hydrating", "ready", "signedOut", "expired", "unavailable", "stopped"} else "unknown-redacted",
                    "readyIsTrue": value.get("ready") is True, "errorCodeIsNull": code is None,
                    "errorCode": code if isinstance(code, str) and code in SAFE_STATUS_ERRORS else (None if code is None else "unknown-redacted"),
                    "freshWithin30Seconds": type(updated) is int and -2 <= time.time() - updated <= 30,
                    "deviceMatchesProvisioned": expected is not None and value.get("deviceId") == expected,
                    "pidMatchesConnector": pids.get("connector", 0) > 0 and type(value.get("pid")) is int and value["pid"] == pids["connector"],
                    "networkIdCanonical": isinstance(value.get("networkId"), str) and re.fullmatch(r"[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}", value["networkId"]) is not None})
    except FileNotFoundError:
        observed["status"] = {"kind": "missing"}
    except Exception:
        if "status" not in observed:
            observed["status"] = {"kind": "unavailable"}
    try:
        parent, sock = STATUS.parent.lstat(), (STATUS.parent / "management.sock").lstat()
        observed["managementSocket"] = {"present": True, "contractMatches": network_account is not None
            and stat.S_ISDIR(parent.st_mode) and parent.st_uid == network_account.pw_uid and parent.st_gid == network_account.pw_gid
            and stat.S_IMODE(parent.st_mode) == 0o2750 and stat.S_ISSOCK(sock.st_mode) and sock.st_nlink == 1
            and sock.st_uid == network_account.pw_uid and sock.st_gid == network_account.pw_gid and stat.S_IMODE(sock.st_mode) == 0o660}
    except FileNotFoundError:
        observed["managementSocket"] = {"present": False}
    except Exception:
        observed["managementSocket"] = {"observationUnavailable": True}
    observed["NodeDropinsPresent"] = {name: (Path("/etc/systemd/system/moxbot-host-test.service.d") / name).is_file()
                                      for name in ("owned-management.conf", "network-status.conf")}
    doctor = {"attempted": pids.get("Node", 0) > 0}
    observed["NodeDoctor"] = doctor
    if doctor["attempted"]:
        try:
            completed = run(["/opt/moxbot-host-test/bin/moxbot-host", "doctor"], timeout=2, check=False)
            doctor["exitZero"] = completed.returncode == 0
            if completed.returncode == 0 and len(completed.stdout) <= 65536:
                value = json.loads(completed.stdout)
                need(isinstance(value, dict), "observation-doctor-object")
                doctor.update({"JSONobject": True, "hostIdMatchesProvisioned": expected is not None and value.get("hostId") == expected,
                    "nodeVersionMatches": isinstance(value.get("runtime"), dict) and value["runtime"].get("node") == "24.20.0",
                    "sdkBinaryPresent": isinstance(value.get("runtime"), dict) and value["runtime"].get("sdkBinaryPresent") is True,
                    "activeSessionAbsent": "activeSession" in value and value["activeSession"] is None,
                    "stoppingFalse": value.get("stopping") is False})
        except Exception:
            doctor["observationUnavailable"] = True
    connector = observed["units"].get("connector", {})
    if (include_startup_errors and connector.get("fieldsValid") and connector.get("LoadState") == "loaded"
            and connector.get("ActiveState") == "failed" and connector.get("mainPidPositive") is False
            and observed.get("status", {}).get("kind") in {"empty", "missing"}):
        try:
            observed["connectorStartupErrors"] = connector_startup_error_observation()
        except Exception:
            observed["connectorStartupErrors"] = {"observationUnavailable": True}
    return observed


def public_readability(paths):
    import pwd
    uid = os.environ.get("SUDO_UID", "")
    need(re.fullmatch(r"[1-9][0-9]{0,9}", uid), "nonroot-uploader-UID-required")
    username = pwd.getpwuid(int(uid)).pw_name
    for path in paths:
        run(["runuser", "-u", username, "--", "test", "-r", str(path)], timeout=15)
    return True


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
    require_absent_auth_units()
    need(args.product_source.is_absolute() and args.output.is_absolute(), "absolute-paths-required")
    need(not args.output.exists(), "summary-output-must-be-new")
    cached = getattr(args, "cached_public_payload", None)
    candidate = getattr(args, "candidate_payload", None)
    validate_payload_inputs(args)
    exported = getattr(args, "export_public_cache", None)
    for value in (cached, candidate, exported):
        if value:
            need(value.is_absolute() and value.resolve() == value
                 and value != args.output and not value.is_relative_to(args.output)
                 and value.is_relative_to(Path(os.environ["RUNNER_TEMP"]).resolve())
                 and not value.is_relative_to(args.product_source.resolve()), "public-cache-isolated-RUNNER-TEMP-directory")
    if exported:
        need(not os.path.lexists(exported), "public-cache-export-must-be-new")
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


def public_cache_meta():
    return {"schemaVersion": 1, "publicOrigin": PUBLIC, "sourceCommit": PRODUCT,
        "releaseId": RELEASE, "transport": "normal-tls-full-get",
        "files": {name: {"bytes": pin[0], "sha256": pin[1]} for name, pin in PINS.items()}}


def public_cache_meta_bytes():
    return (json.dumps(public_cache_meta(), sort_keys=True, indent=2) + "\n").encode()


def candidate_meta_bytes():
    # Candidate artifacts are not evidence of a public HTTPS download. Pins still
    # come from the reviewed harness commit, never from untrusted artifact data.
    value = {key: val for key, val in public_cache_meta().items() if key != "publicOrigin"}
    value["transport"] = "candidate-ci-artifact"
    return (json.dumps(value, sort_keys=True, indent=2) + "\n").encode()


def validate_payload_inputs(args):
    for prefix in ("cached_public", "candidate"):
        path = getattr(args, prefix + "_payload", None)
        run_id = getattr(args, prefix + "_run", "")
        artifact_id = getattr(args, prefix + "_artifact_id", "")
        need(bool(path) == bool(run_id) == bool(artifact_id), "payload-path-and-IDs-required-together")
        need(all(not value or re.fullmatch(r"[1-9][0-9]{0,19}", value)
                 for value in (run_id, artifact_id)), "payload-positive-integer-IDs-only")
    cached = getattr(args, "cached_public_payload", None)
    candidate = getattr(args, "candidate_payload", None)
    exported = getattr(args, "export_public_cache", None)
    need(sum(bool(value) for value in (cached, candidate, exported)) <= 1,
         "payload-transports-mutually-exclusive")


def payload_input_summary(args):
    candidate = getattr(args, "candidate_payload", None)
    cached = getattr(args, "cached_public_payload", None)
    if candidate:
        return {"kind": "isolated-candidate-artifact", "transport": "candidate-ci-artifact",
            "normalTLSFullGETThisRun": False, "publicOrigin": None,
            "candidateRun": args.candidate_run, "candidateArtifactId": args.candidate_artifact_id,
            "firstPublicFullGETRun": None, "firstPublicFullGETArtifactId": None,
            "candidateMetaSha256": hashlib.sha256(candidate_meta_bytes()).hexdigest()}
    return {"kind": "cached-immutable-public-bytes" if cached else "normal-TLS-public-full-GET",
        "transport": "GitHub-Actions-cache-of-previous-normal-TLS-full-GET" if cached else "normal-TLS-public-full-GET",
        "normalTLSFullGETThisRun": not bool(cached), "publicOrigin": PUBLIC,
        "cachedPublicRun": args.cached_public_run or None, "cachedPublicArtifactId": args.cached_public_artifact_id or None,
        "firstPublicFullGETRun": args.cached_public_run or os.environ.get("GITHUB_RUN_ID"),
        "firstPublicFullGETArtifactId": args.cached_public_artifact_id or None,
        "cacheMetaSha256": hashlib.sha256(public_cache_meta_bytes()).hexdigest()}


def checked_public_copy(source, target, size, sha256):
    # Copy once into this root-private snapshot, then verify the copied bytes;
    # never trust a mutable downloaded artifact path after an earlier hash check.
    import stat
    fd = os.open(source, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        info = os.fstat(fd)
        need(stat.S_ISREG(info.st_mode) and info.st_nlink == 1 and info.st_size == size,
             "public-cache-regular-file-size")
        total, hasher = 0, hashlib.sha256()
        with os.fdopen(fd, "rb", closefd=False) as stream, target.open("xb") as out:
            while block := stream.read(1024**2):
                total += len(block)
                need(total <= size, "public-cache-copy-byte-bound")
                hasher.update(block)
                out.write(block)
        need(total == size and hasher.hexdigest() == sha256, "public-cache-copy-size-SHA")
    finally:
        os.close(fd)


def import_payload_snapshot(directory, release, *, candidate=False):
    meta_name = "candidate-meta.json" if candidate else "cache-meta.json"
    need(directory.is_dir() and not directory.is_symlink()
         and {path.name for path in directory.iterdir()} == set(PINS) | {meta_name}, "public-cache-exact-three-file-whitelist")
    expected = candidate_meta_bytes() if candidate else public_cache_meta_bytes()
    checked_public_copy(directory / meta_name, release / meta_name, len(expected), hashlib.sha256(expected).hexdigest())
    need((release / meta_name).read_bytes() == expected, "public-cache-fixed-meta-bytes")
    for filename, (size, sha256) in PINS.items():
        checked_public_copy(directory / filename, release / filename, size, sha256)
    (release / meta_name).unlink()


def import_public_cache(directory, release):
    import_payload_snapshot(directory, release)


def export_public_cache(directory, release):
    # Separate fresh directory outside every lab/secret/summary root. Only public
    # immutable payloads and the fixed metadata are ever copied or published.
    need(not os.path.lexists(directory), "public-cache-export-must-be-new")
    with tempfile.TemporaryDirectory(prefix="moxbots-public-cache-stage-", dir=directory.parent) as scratch:
        staging = Path(scratch)
        for filename, (size, sha256) in PINS.items():
            checked_public_copy(release / filename, staging / filename, size, sha256)
            (staging / filename).chmod(0o644)
        (staging / "cache-meta.json").write_bytes(public_cache_meta_bytes())
        (staging / "cache-meta.json").chmod(0o644)
        need({path.name for path in staging.iterdir()} == set(PINS) | {"cache-meta.json"}, "public-cache-export-whitelist")
        staging.chmod(0o755)
        os.rename(staging, directory)


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
    if getattr(args, "candidate_payload", None):
        import_payload_snapshot(args.candidate_payload, release, candidate=True)
    elif args.cached_public_payload:
        import_public_cache(args.cached_public_payload, release)
    else:
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
    if args.export_public_cache:
        need(not args.export_public_cache.is_relative_to(private) and not private.is_relative_to(args.export_public_cache),
             "public-cache-must-be-outside-private-lab")
        export_public_cache(args.export_public_cache, release)
        public_readability([args.export_public_cache / name for name in (*PINS, "cache-meta.json")])
    return web


def verify_service(args):
    need(args.service_artifact is not None and args.service_artifact.is_absolute(), "service-artifact-required")
    binary = args.service_artifact / "myagents-agentnet-service"
    need(binary.is_file() and not binary.is_symlink() and binary.stat().st_size == SERVICE_BYTES,
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
    if _GUEST:
        return _GUEST.call("identity-hashes")
    paths = IDENTITY_FILES + sorted(Path("/var/lib/moxbot-host-network-test").glob("key-*.sealed"))
    need(IDENTITY_FILES[0].is_file() and IDENTITY_FILES[2].is_file() and IDENTITY_FILES[3].is_file(),
         "first-install-identity-and-KEKs-required")
    need(not any(path.is_symlink() for path in paths), "identity-symlink-forbidden")
    return {str(path): digest(path) if path.is_file() else None for path in paths}


def persistent_hashes(include_accounts=True):
    if _GUEST:
        return _GUEST.call("persistent-hashes", include_accounts=include_accounts)
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
    return int(host_run(["systemctl", "show", NODE, "--property=MainPID", "--value"]).stdout)


def tcp_listeners():
    return {line.split()[3] for line in run(["ss", "-H", "-lnt"]).stdout.decode().splitlines()}


def only_lab_listeners(baseline):
    need(tcp_listeners() - baseline == {"127.0.0.1:24443", "127.0.0.1:25556", "127.0.0.1:28080"},
         "new-listeners-must-be-exact-loopback-lab-only")
    if _GUEST:
        _GUEST.check_listeners()
    return True


def ready(private):
    value = host_status()
    need(value.get("state") == "ready" and value.get("ready") is True and value.get("errorCode") is None,
         "connector-not-ready")
    need(time.time() - value.get("updatedAt", 0) < 30, "connector-stale-status")
    pid = int(host_run(["systemctl", "show", CONNECTOR, "--property=MainPID", "--value"]).stdout)
    need(pid > 0 and value.get("pid") == pid, "connector-status-pid")
    doctor = json.loads(host_run(["/opt/moxbot-host-test/bin/moxbot-host", "doctor"]).stdout)
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


def post_reboot_ready(private, diagnostics, save_diagnostics=None):
    """Observe the original readiness gate; never repair or extend its wait."""
    failures = {"connector-not-ready", "connector-stale-status", "connector-status-pid", "real-Node-doctor",
                "real-AuthStore-membership-empty-catalog-ready", "guest-operation-failed-redacted",
                "guest-operation-confirmed", "guest-host-command-rejected"}
    diagnostics.update({"pollCount": 0, "gatePassed": False})
    started = time.monotonic()

    def poll():
        diagnostics["pollCount"] = min(1024, diagnostics["pollCount"] + 1)
        try:
            return ready(private)
        except Exception as error:
            stage = str(error) if isinstance(error, Rejected) else None
            diagnostics["lastPollFailure"] = {"stage": stage if stage in failures else "unknown-redacted",
                                              "exceptionClass": safe_exception_class(error)}
            raise  # preserve exactly the retry/exception policy in wait_for

    try:
        value = wait_for(poll, 90)
        diagnostics["gatePassed"] = True
        return value  # original DB object, including its unchanged admission checks
    finally:
        diagnostics["readinessSeconds"] = round(time.monotonic() - started, 3)
        # One final existing closed RPC, before caller cleanup. Keeping it outside
        # the wait avoids adding SSH/doctor work to every readiness poll.
        try:
            snapshot = runtime_readiness_observation(include_startup_errors=True)
            need(isinstance(snapshot, dict), "post-reboot-diagnostic-object")
            diagnostics["lastRuntimeObservation"] = snapshot
        except Exception:
            diagnostics["runtimeObservationUnavailable"] = True
        if (not diagnostics["gatePassed"] and diagnostics.get("lastPollFailure", {}).get("stage")
                == "real-AuthStore-membership-empty-catalog-ready"):
            try:
                state = db_snapshot(private)  # existing local lab snapshot, no new guest operation
                devices = state["devices"]
                diagnostics["AuthStoreProjection"] = {"sessionCount": len(state["sessions"]), "principalCount": state["principals"],
                    "deviceCount": len(devices), "catalogCount": state["catalogs"], "catalogItemCount": state["items"],
                    "joinedDeviceCount": sum(row[1] == 1 for row in devices), "readyDeviceCount": sum(row[3] == "ready" for row in devices),
                    "singleDeviceEpochsMatch": len(devices) == 1 and devices[0][4] == devices[0][5],
                    "singleDeviceCatalogSequencePositive": len(devices) == 1 and devices[0][6] > 0}
            except Exception:
                diagnostics["AuthStoreObservationUnavailable"] = True
        if save_diagnostics:
            try:
                save_diagnostics()
            except Exception:
                diagnostics["diagnosticSaveFailed"] = True  # never replace the gate's original outcome


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


def installer_json_records(output):
    """Decode complete objects independent of pipe chunks/newlines/prefix text.

    These objects may contain capabilities and stay in driver memory only.
    Diagnostic projection below never serializes a record or arbitrary value.
    """
    text = bytes(output).decode("utf-8", errors="replace")
    decoder, cursor, values = json.JSONDecoder(), 0, []
    while (start := text.find("{", cursor)) >= 0:
        try:
            value, end = decoder.raw_decode(text, start)
        except ValueError:
            cursor = start + 1
            continue
        if isinstance(value, dict):
            values.append(value)
        cursor = end
    return values


def proc_birth(pid):
    return Path(f"/proc/{pid}/stat").read_text().rsplit(")", 1)[1].split()[19]


def installer_owner(root_pid):
    """Inspect only this invocation's bounded descendant tree; never global ps.

    sudo may create a different process group. A signal to the shell pipeline's
    group can therefore miss the actual Python owner or interrupt its parent
    waiter first. Identify the inner verified M bootstrap, not a systemd auth
    transient unit or another Python process, before sending the one SIGINT.
    """
    import stat
    pending, visited, matches = [root_pid], set(), []
    while pending:
        pid = pending.pop()
        if pid in visited:
            continue
        visited.add(pid)
        need(len(visited) <= 128, "installer-descendant-tree-bound")
        try:
            children = Path(f"/proc/{pid}/task/{pid}/children").read_text().split()
            pending.extend(int(child) for child in children)
            argv = Path(f"/proc/{pid}/cmdline").read_bytes().split(b"\0")
            if argv and argv[-1] == b"":
                argv.pop()
            if len(argv) != 6 or argv[2:5] != [b"--instance", ORIGIN.encode(), b"--index"]:
                continue
            if not re.fullmatch(r"python3(?:\.[0-9]+)?", Path(os.fsdecode(argv[0])).name):
                continue
            path = Path(os.fsdecode(argv[1]))
            if path.name != "bootstrap.py" or not path.parent.name.startswith("moxbots-bootstrap-"):
                continue
            born = proc_birth(pid)
            info = path.lstat()
            need(stat.S_ISREG(info.st_mode) and info.st_uid == 0 and info.st_nlink == 1
                 and path.resolve() == path and info.st_size == PINS["bootstrap.py"][0]
                 and digest(path) == PINS["bootstrap.py"][1], "installer-owner-must-be-exact-M-bootstrap")
            index_path = Path(os.fsdecode(argv[5]))
            need(index_path.parent == path.parent and index_path.name == "stable.json", "installer-owner-fixed-index-argv")
            need(proc_birth(pid) == born, "installer-owner-process-birth-changed")
            matches.append({"pid": pid, "birth": born, "sameGroupAsPipeline": os.getpgid(pid) == os.getpgid(root_pid)})
        except (FileNotFoundError, ProcessLookupError):
            continue
    need(len(matches) == 1, "exactly-one-owned-M-installer-required")
    return matches[0]


def interrupt_installer_owner(root_pid):
    owner = installer_owner(root_pid)
    need(proc_birth(owner["pid"]) == owner["birth"], "installer-owner-process-birth-changed")
    os.kill(owner["pid"], signal.SIGINT)
    return {"installerOwnerFound": True, "installerOwnerSameGroupAsPipeline": owner["sameGroupAsPipeline"],
            "interruptTarget": "verified-M-bootstrap-owner-only"}


def auth_unit_observation():
    if _GUEST:
        return _GUEST.call("auth-unit-observation")
    fields = {"LoadState": {"loaded", "not-found", "error", "masked"},
        "ActiveState": {"active", "inactive", "failed", "activating", "deactivating", "reloading"},
        "SubState": {"running", "exited", "dead", "failed", "start", "start-pre", "start-post", "stop", "stop-sigterm"},
        "Result": {"success", "exit-code", "signal", "timeout", "start-limit-hit", "resources", "protocol", "core-dump"}}
    observed = {}
    for action in ("start", "wait", "cancel"):
        unit = "moxbot-host-network-test-auth-" + action + ".service"
        raw = run(["systemctl", "show", unit, "--property=LoadState,ActiveState,SubState,Result,ExecMainStatus"], check=False, timeout=5).stdout
        values = {}
        for line in raw.decode(errors="replace").splitlines():
            key, _, value = line.partition("=")
            if key in fields:
                values[key] = value if value in fields[key] else "other"
            elif key == "ExecMainStatus" and re.fullmatch(r"[0-9]{1,3}", value):
                values[key] = int(value)
        observed[action] = values
    return observed


def require_absent_auth_units():
    for unit in AUTH_UNITS:
        need(run(["systemctl", "show", unit, "--property=LoadState", "--value"], check=False, timeout=5).stdout.strip() == b"not-found",
             "existing-auth-transient-unit-is-protected")
    return True


def cleanup_auth_units(*, wait_seconds=10):
    """Final cleanup only; never proves or substitutes for native cancellation.

    Initial host/guest guards proved these three fixed names absent. Stop every
    owned transient and require actual terminal state/MainPID zero, even if the
    installer pipe failed or its signal was never delivered. No API is called.
    """
    results = {}
    for unit in AUTH_UNITS:
        observed = {"terminated": False}
        results[unit] = observed
        try:
            completed = host_run(["systemctl", "stop", unit], check=False, timeout=30)
            observed["stopExitCode"] = completed.returncode
        except Exception:
            observed["stopInvocationFailed"] = True
        until = time.monotonic() + wait_seconds
        try:
            while True:
                response = host_run(["systemctl", "show", unit, "--property=LoadState,ActiveState,MainPID"], check=False, timeout=5)
                fields = {}
                for line in response.stdout.decode(errors="replace").splitlines():
                    key, separator, value = line.partition("=")
                    need(separator and key in {"LoadState", "ActiveState", "MainPID"} and key not in fields,
                         "auth-cleanup-closed-status-projection")
                    fields[key] = value
                observed["loadState"] = fields.get("LoadState") if fields.get("LoadState") in {"loaded", "not-found", "error", "masked"} else "other"
                observed["activeState"] = fields.get("ActiveState") if fields.get("ActiveState") in {"active", "inactive", "failed", "activating", "deactivating", "reloading"} else "other"
                observed["mainPidIsZero"] = fields.get("MainPID") == "0"
                observed["terminated"] = (observed["mainPidIsZero"]
                    and (observed["loadState"] == "not-found"
                         or (observed["loadState"] == "loaded" and observed["activeState"] in {"inactive", "failed"})))
                if observed["terminated"] or time.monotonic() >= until:
                    break
                time.sleep(0.2)
        except Exception:
            observed["statusVerificationFailed"] = True
    return {"completed": all(value["terminated"] for value in results.values()), "units": results}


def install_with_browser(private, browser_home, email, password, action, *, diagnostics=None, save_diagnostics=None):
    # Deliberately the literal public curl | sudo bash command, with ordinary TLS.
    command = f"set -o pipefail; curl --fail --silent --show-error {ORIGIN}/host/install.sh | sudo bash -s -- --instance {ORIGIN}"
    diagnostics = diagnostics if diagnostics is not None else {}
    status_watcher = None
    if action == "authorize":
        if _GUEST:
            diagnostics["statusEventObservation"] = {"enabled": False, "reason": "guest-diagnostic-not-enabled"}
        else:
            try:
                status_watcher = StatusEventWatcher().start()  # armed before M or synchronous Chromium can run
            except Exception:
                diagnostics["statusEventObservationUnavailable"] = True
    try:
        child = (_GUEST.popen_install() if _GUEST else subprocess.Popen(["bash", "-c", command], stdout=subprocess.PIPE,
                                 stderr=subprocess.STDOUT, start_new_session=True))
    except Exception:
        if status_watcher:
            try:
                status_watcher.close()
            except Exception:
                diagnostics["statusEventObservationUnavailable"] = True
        raise
    output = bytearray()
    seen = False
    interrupt_at = None
    interrupted = False
    cancellation_identity = None
    owner_signal = {}
    pipe_eof = False
    started = time.monotonic()
    last_observation = 0
    def observe():
        nonlocal last_observation
        if status_watcher:
            try:
                diagnostics["statusEventObservation"] = status_watcher.snapshot()
            except Exception:
                diagnostics["statusEventObservationUnavailable"] = True
        records = installer_json_records(output)
        known, unknown = set(), False
        for value in records:
            if value.get("status") != "error":
                continue
            code = value.get("code")
            if isinstance(code, dict):
                code = code.get("code")
            if isinstance(code, str) and code in SAFE_CLI_ERRORS:
                known.add(code)
            else:
                unknown = True
        diagnostics.update({"action": action, "seconds": round(time.monotonic() - started, 3),
            "authorizationJsonSeen": seen, "interruptSent": interrupted,
            "childExited": child.poll() is not None, "childExitCode": child.poll(), "pipeEOF": pipe_eof,
            "outputBytes": len(output), "completeJSONObjectCount": len(records), "knownCliErrorCodes": sorted(known),
            "unknownCliErrorCodeObserved": unknown, "authPromptSeen": b"Open the short authorization URL below" in output,
            "readyMarkerSeen": b"MoXBots Host ready." in output,
            "interruptedMarkerSeen": b"Authorization interrupted." in output,
            "installerFailureMarkerSeen": b"HOST_INSTALL_INCOMPLETE:" in output,
            "installerFailureReasons": installer_failure_reason(output), **owner_signal})
        try:
            diagnostics["authUnits"] = auth_unit_observation()
        except Exception:
            diagnostics["authUnitObservationUnavailable"] = True
        counts = route_counts(private)
        diagnostics["routes"] = {"startRequests": hits(counts, "start", False), "pollRequests": hits(counts, "poll", False),
            "completedPolls": completed_polls(counts), "cancelRequests": hits(counts, "cancel", False),
            "cancelSuccesses": hits(counts, "cancel"), "joinSuccesses": hits(counts, "join"),
            "callbackSuccesses": hits(counts, "callback"), "dexTokenSuccesses": hits(counts, "dex-token"),
            "catalogRequests": hits(counts, "catalog", False), "catalogSuccesses": hits(counts, "catalog"),
            "websocketRequests": hits(counts, "ws", False),
            "websocketUpgrades": sum(n for (route, status, _, _), n in counts.items() if route == "ws" and status == 101)}
        if action in {"authorize", "cancel"}:
            try:
                snapshot = runtime_readiness_observation()
                snapshot["seconds"] = round(time.monotonic() - started, 3)
                history = diagnostics.setdefault("runtimeReadinessObservations", [])
                history.append(snapshot)
                del history[:-32]
            except Exception:
                diagnostics["runtimeObservationUnavailable"] = True
            if action == "authorize" and child.poll() is not None:
                try:
                    state = db_snapshot(private)
                    diagnostics["AuthStoreProjection"] = {"sessionCount": len(state["sessions"]), "principalCount": state["principals"],
                        "deviceCount": len(state["devices"]), "catalogCount": state["catalogs"], "catalogItemCount": state["items"],
                        "joinedDeviceCount": sum(row[1] == 1 for row in state["devices"]),
                        "readyDeviceCount": sum(row[3] == "ready" for row in state["devices"])}
                except Exception:
                    diagnostics["AuthStoreObservationUnavailable"] = True
        if save_diagnostics:
            save_diagnostics()
        last_observation = time.monotonic()
    selector = selectors.DefaultSelector()
    selector.register(child.stdout, selectors.EVENT_READ)
    deadline = time.monotonic() + 270
    try:
        while selector.get_map():
            if time.monotonic() - last_observation >= 10:
                observe()
            need(time.monotonic() < deadline, "install-browser-deadline")
            if interrupt_at is not None and time.monotonic() >= interrupt_at and not interrupted:
                # Signal only the verified inner M owner. Its Python exception
                # handler must invoke native cancel; neither outer waiter nor
                # independently owned auth-wait unit receives our SIGINT.
                need(child.poll() is None, "installer-exited-before-native-cancel")
                if _GUEST:
                    owner_signal = _GUEST.call("interrupt-install")
                else:
                    owner_signal = interrupt_installer_owner(child.pid)
                interrupted = True
                observe()
            for key, _ in selector.select(timeout=0.5):
                block = os.read(key.fd, 65536)
                if not block:
                    selector.unregister(key.fileobj)
                    pipe_eof = not bool(selector.get_map())
                    continue
                output.extend(block)
                need(len(output) < 2 * 1024**2, "install-output-bound")
                # Actual M uses compact println. This also accepts split writes,
                # pretty objects or fixed surrounding progress without logging.
                for value in installer_json_records(output):
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
        if status_watcher:
            try:
                diagnostics["statusEventObservation"] = status_watcher.close()
            except Exception:
                diagnostics["statusEventObservationUnavailable"] = True
        try:
            observe()  # before cleanup so true failure phase/units survive as booleans
        except Exception:
            diagnostics["finalObservationUnavailable"] = True
            if save_diagnostics:
                save_diagnostics()
        selector.close()
        if child.poll() is None:
            if _GUEST:
                try:
                    _GUEST.call("abort-install")
                except Exception:
                    pass  # the coordinator still terminates only its owned VM
            os.killpg(child.pid, signal.SIGTERM)
            try:
                child.wait(timeout=10)
            except subprocess.TimeoutExpired:
                os.killpg(child.pid, signal.SIGKILL)
                child.wait(timeout=5)
        output.clear()


def accept(args):
    global _GUEST
    guard(args)
    args.output.mkdir(mode=0o755)
    args.output.chmod(0o755)  # coordinator's inherited umask077 must not block uploader traversal
    summary = {"schemaVersion": 1, "productSource": PRODUCT, "releaseId": RELEASE,
        "harnessSource": run(["git", "-c", "safe.directory=*", "-C", str(Path(__file__).resolve().parents[2]), "rev-parse", "HEAD"]).stdout.decode().strip(),
        "mode": args.mode, "steps": [], "passed": False,
        "publicPayloadInput": payload_input_summary(args),
        "serviceArtifact": {"runId": SERVICE_RUN, "artifactId": SERVICE_ARTIFACT_ID, "name": SERVICE_ARTIFACT_NAME,
                            "sha256": SERVICE_SHA, "bytes": SERVICE_BYTES},
        "immutablePayloads": {name: {"sha256": pin[1], "bytes": pin[0]} for name, pin in PINS.items()},
        "reboot": "not-tested: GitHub-hosted runner has no supported resume after VM reboot",
        "productionAccountOrUIAcceptance": "not-tested: synthetic isolated lab account only",
        "freshBrowserExpiry": "not-tested: existing offline browser-authorization expiry tests are separate evidence",
        "originalAccountExpiryCrossed": False,
        "modelInvoked": False, "businessTaskCreated": False, "executionEnabled": False}

    def save():
        (args.output / "summary.json").write_text(json.dumps(summary, indent=2) + "\n")
        (args.output / "summary.json").chmod(0o644)  # explicit non-secret artifact readable by runner uploader

    def step(name, operation):
        summary["currentGate"] = name
        save()
        start = time.monotonic()
        result = operation()
        summary["steps"].append({"gate": name, "passed": True, "seconds": round(time.monotonic() - start, 3)})
        save()
        print("passed: " + name, flush=True)
        return result

    def install(action, private, browser_home, email, password):
        diagnostics = summary.setdefault("installerDiagnostics", {}).setdefault(action, {})
        return install_with_browser(private, browser_home, email, password, action,
                                    diagnostics=diagnostics, save_diagnostics=save)

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
            if args.guest_target_json:
                target_module = load_module("host_reboot_target", Path(__file__).with_name("host-reboot-acceptance.py"))
                _GUEST = target_module.GuestTarget(args.guest_target_json, run, need)
                step("nested-KVM-guest-profile-UUID-nonce-empty-namespace", _GUEST.prepare)
            binary = step("exact-M-service-artifact", lambda: verify_service(args))
            web = step("exact-M-public-bytes-and-launcher", lambda: prepare_candidate(args, private))
            summary["publicPayloadCacheExported"] = bool(args.export_public_cache)
            save()
            step("nonroot-uploader-can-read-public-summary", lambda: public_readability([args.output / "summary.json"]))
            ca_installed, browser_home = step("normal-OS-and-Chromium-CA-trust", lambda: install_ca(private))
            if _GUEST:
                step("guest-normal-OS-CA-and-loopback-reverse-forward", lambda: _GUEST.configure_ca((private / "lab-ca.crt").read_text()))
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
                step("real-curl-bad-bundle-digest-rejected", lambda: install("reject", private, browser_home, email, password))
                # Run the original guarded no-namespace/account/unit checks again;
                # only the output location differs because summary now exists.
                if _GUEST:
                    _GUEST.call("empty-namespace")
                else:
                    namespace_guard = load_module("post_rejection_namespace_guard", Path(__file__).with_name("systemd-acceptance.py"))
                    namespace_guard.guard(argparse.Namespace(source_root=args.product_source, source_commit=PRODUCT,
                        host_artifact_dir=args.product_source, network_artifact_dir=args.product_source,
                        output=args.output.parent / ("host-browser-never-created-" + uuid.uuid4().hex)))
                step("bad-digest-created-no-Host-unit-account-or-state", lambda: True)
            finally:
                (web / "host/stable.json").write_bytes(original_index)
            canceled_identity = step("fresh-authorization-interrupt-uses-M-native-cancel", lambda:
                install("cancel", private, browser_home, email, password))
            canceled = step("canceled-install-read-AuthStore-snapshot", lambda: db_snapshot(private))
            canceled_routes = step("canceled-install-read-closed-route-counters", lambda: route_counts(private))
            step("native-cancel-no-account-session-or-join", lambda:
                need(canceled["sessions"] == [] and canceled["principals"] == 0 and canceled["rotations"] == 0
                     and canceled["catalogs"] == 0 and hits(canceled_routes, "join") == 0
                     and hits(canceled_routes, "cancel") >= 1, "native-cancel-no-account-session-or-join"))
            summary["canceledConnectorObservation"] = {}
            step("canceled-install-connector-inactive-with-zero-MainPID", lambda:
                canceled_connector_inactive(summary["canceledConnectorObservation"], save))
            summary["canceledStatusObservation"] = step("canceled-install-non-Ready-status-observation", canceled_status_observation)
            step("canceled-install-no-Ready-or-join-and-identity-preserved", lambda: True)
            step("same-command-resume-real-Chromium-OIDC-auto-join", lambda:
                install("authorize", private, browser_home, email, password))
            need(installed_identity_hashes().items() >= canceled_identity.items(), "resume-preserves-original-Host-identity-config-KEKs")
            first = step("real-DPoP-empty-catalog-and-Ready", lambda: wait_for(lambda: ready(private)))
            def fresh_home():
                observation = runtime_readiness_observation().get("startupContract", {})
                namespace = observation.get("freshNamespace", {})
                need(namespace.get("homeEntriesMatchFreshContract") is True
                     and namespace.get("homeHasNoSkeletonEntries") is True,
                     "fresh-dedicated-home-must-not-inherit-system-skeleton")
                return {"freshHomeContractMatched": True, "inheritedSkeletonAbsent": True}
            step("fresh-dedicated-HOME-excludes-system-skeleton", fresh_home)
            counts = route_counts(private)
            need(hits(counts, "start") == 2 and completed_polls(counts) == 1 and hits(counts, "callback") == 1
                 and hits(counts, "dex-token") == 1 and hits(counts, "join", dpop=True) == 1
                 and hits(counts, "catalog", dpop=True) >= 1, "browser-auth-and-DPoP-route-evidence")
            for unit in (NODE, CONNECTOR):
                host_run(["systemctl", "is-active", "--quiet", unit])
                host_run(["systemctl", "is-enabled", "--quiet", unit])
            before_files = persistent_hashes()
            before_pid = node_pid()
            step("same-command-repeat-without-browser", lambda: install("repeat", private, browser_home, email, password))
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
                original_expiry = second["sessions"][0][4]
                def beyond_original_account_expiry():
                    if time.time() < original_expiry + 3:
                        return False
                    current = ready(private)
                    need(current["sessions"][0][4] > time.time() and current["sessions"][0][5] is None
                         and current["sessions"][0][:3] == second["sessions"][0][:3]
                         and current["devices"][0][7:] == second["devices"][0][7:]
                         and current["devices"][0][1:3] == second["devices"][0][1:3]
                         and node_pid() == before_pid and persistent_hashes(False) == stable,
                         "beyond-original-account-expiry-live-session-identity-and-Node")
                    current_counts = route_counts(private)
                    need(all(hits(second_counts, route, False) == hits(current_counts, route, False)
                             for route in ("start", "poll", "callback", "dex-token", "join")),
                         "beyond-original-account-expiry-no-new-login-or-join")
                    return current
                third = step("Ready-and-Node-IPC-beyond-original-account-expiry-plus-3s", lambda:
                    wait_for(beyond_original_account_expiry, timeout=75))
                summary["originalAccountExpiryCrossed"] = True
                save()
            else:
                third = second
            pid = int(host_run(["systemctl", "show", CONNECTOR, "--property=MainPID", "--value"]).stdout)
            host_run(["systemctl", "restart", CONNECTOR], timeout=40)
            fourth = step("connector-systemd-restart-recovers-Ready", lambda: wait_for(lambda: ready(private)))
            need(int(host_run(["systemctl", "show", CONNECTOR, "--property=MainPID", "--value"]).stdout) != pid,
                 "restart-must-replace-connector-PID")
            need(node_pid() == before_pid and persistent_hashes(False) == stable
                 and fourth["sessions"][0][:3] == third["sessions"][0][:3]
                 and fourth["devices"][0][1:3] == third["devices"][0][1:3]
                 and fourth["devices"][0][7:] == third["devices"][0][7:], "restart-preserves-original-identity-session-membership")
            step("Host-opened-no-new-TCP-listener", lambda: only_lab_listeners(baseline_listeners))
            if _GUEST:
                pre_boot_hashes = persistent_hashes()
                pre_boot_db = db_snapshot(private)
                pre_boot_counts = route_counts(private)
                reboot_evidence = step("true-KVM-guest-reboot-and-new-boot-id", _GUEST.reboot)
                summary["postRebootReadinessDiagnostics"] = {}
                post_boot_db = step("original-Host-boot-autostart-Ready-and-Node-IPC", lambda:
                    post_reboot_ready(private, summary["postRebootReadinessDiagnostics"], save))
                need(persistent_hashes() == pre_boot_hashes and post_boot_db["sessions"] == pre_boot_db["sessions"]
                     and post_boot_db["devices"][0][1:3] == pre_boot_db["devices"][0][1:3]
                     and post_boot_db["devices"][0][7:] == pre_boot_db["devices"][0][7:], "true-reboot-preserves-identity-config-ciphertext-session-membership")
                post_boot_counts = route_counts(private)
                need(all(hits(pre_boot_counts, route, False) == hits(post_boot_counts, route, False)
                         for route in ("start", "poll", "callback", "dex-token", "join", "renew")), "true-reboot-zero-login-join-renewal")
                step("reboot-identity-ciphertext-and-no-new-auth-or-join", lambda: only_lab_listeners(baseline_listeners))
                summary["reboot"] = reboot_evidence
            summary["browserAuthorizations"] = 1
            summary["freshCancellationAndSameCommandResumeObserved"] = True
            summary["badDigestRejectedBeforeInstallation"] = True
            summary["naturalRotationObserved"] = args.mode == "renewal"
            summary["passed"] = True
            summary.pop("currentGate", None)
        except Exception as error:
            summary["failureGate"] = str(error) if isinstance(error, Rejected) else "unexpected-lab-error-redacted"
            summary["failureExceptionClass"] = safe_exception_class(error)
            raise Rejected(summary["failureGate"]) from None
        finally:
            # Only resources owned by this guarded invocation; never enumerate/kill other processes.
            cleanup_ok = True
            if installation_attempted:
                for unit in (CONNECTOR, NODE):
                    try:
                        host_run(["systemctl", "stop", unit], timeout=30, check=False)
                        need(host_run(["systemctl", "is-active", "--quiet", unit], timeout=15, check=False).returncode != 0,
                             "owned-unit-still-active-after-cleanup")
                    except Rejected:
                        cleanup_ok = False
                # This runs only after success/failure of all original native
                # cancel/session/join/identity gates, never before their checks.
                auth_cleanup = cleanup_auth_units()
                summary["authTransientCleanup"] = auth_cleanup
                cleanup_ok = cleanup_ok and auth_cleanup["completed"]
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
            if _GUEST:
                _GUEST.close()
                _GUEST = None
            summary["cleanupCompleted"] = cleanup_ok
            if not cleanup_ok:
                summary["passed"] = False
            save()
            try:
                public_readability([args.output / "summary.json"])
            except Exception:
                summary["passed"] = False
                summary["failureGate"] = "nonroot-uploader-cannot-read-public-summary"
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
    parser.add_argument("--guest-target-json", type=Path, help=argparse.SUPPRESS)
    parser.add_argument("--cached-public-payload", type=Path)
    parser.add_argument("--cached-public-run", default="")
    parser.add_argument("--cached-public-artifact-id", default="")
    parser.add_argument("--export-public-cache", type=Path)
    parser.add_argument("--candidate-payload", type=Path)
    parser.add_argument("--candidate-run", default="")
    parser.add_argument("--candidate-artifact-id", default="")
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
