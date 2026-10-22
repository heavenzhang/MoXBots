#!/usr/bin/env python3
"""Private incremental diagnostics: full retained logs, metadata only, no app IO."""
import argparse
import collections
import datetime
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import tempfile
import time
import uuid

PATTERNS = {
    "model_transient": r"\[agent\].*SDK terminal error.*(?:408|429|5\d\d)",
    "model_cancelled": r"\[agent\].*API [Ee]rror:\s*499",
    "transport_failure": r"\[bridge\].*(?:Upstream timeout|fetch failed|ECONNRESET|ETIMEDOUT)",
    "stream_interrupted": r'\[agent\].*"terminalReason":"aborted_streaming"',
    "replay_safety_stop": r"\[agent\].*(?:context_recovery_required|automatic_replay_blocked)",
    "runtime_crash": r"(?:uncaughtException|unhandledRejection|FATAL ERROR|SIGSEGV)",
}
RULES = {key: re.compile(value) for key, value in PATTERNS.items()}
MAX_LINE = 4 * 1024 * 1024


def digest(data):
    return hashlib.sha256(data).hexdigest()


def atomic(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix="." + path.name, dir=path.parent)
    try:
        with os.fdopen(fd, "w") as stream:
            json.dump(value, stream, ensure_ascii=False, indent=2)
            stream.write("\n")
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
        directory = os.open(path.parent, os.O_RDONLY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def matches(stream, record, size, deadline):
    offset = record["offset"]
    if offset > size:
        return None
    stream.seek(0)
    if digest(stream.read(record["prefixBytes"])) != record["prefixSha256"]:
        return None
    length = min(256, offset)
    stream.seek(offset - length)
    if digest(stream.read(length)) != record["anchorSha256"]:
        return None
    # Sparse anchors alone miss same-inode middle rewrites. Verify every byte
    # previously consumed, then extend this hasher only with complete new rows.
    result = hashlib.sha256()
    stream.seek(0)
    left = offset
    while left:
        if time.monotonic() >= deadline:
            raise TimeoutError("prefix_verification_budget")
        chunk = stream.read(min(left, 1024 * 1024))
        if not chunk:
            return None
        result.update(chunk)
        left -= len(chunk)
    return result if result.hexdigest() == record.get("contentSha256") else None


def scan(logs, state_path, max_bytes=64 * 1024 * 1024, budget_seconds=15):
    """One bounded snapshot. Cursor advances only after complete lines are indexed.

    Inodes survive rename; full consumed-prefix digest rejects rewrite/reuse. New
    physical copies are read from zero; content fingerprints aid separate triage.
    Legacy offsets prove no prefix coverage and are intentionally backfilled.
    """
    logs, state_path = Path(logs), Path(state_path)
    if max_bytes < 1 or budget_seconds <= 0:
        raise ValueError("positive budgets required")
    state_path.parent.mkdir(parents=True, exist_ok=True)
    with state_path.with_suffix(state_path.suffix + ".lock").open("a+") as lock:
        os.chmod(lock.name, 0o600)
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        state = json.loads(state_path.read_text()) if state_path.exists() else {}
        legacy = bool(state and state.get("schemaVersion") != 3)
        if legacy:
            version = state.get("schemaVersion", 1)
            if version not in (1, 2):
                raise ValueError("unsupported cursor schema; preserve state for review")
            legacy_files = state.get("legacyFiles", state.get("files", {}))
            legacy_path = state_path.with_suffix(f".legacy-v{version}.json")
            if not legacy_path.exists():
                atomic(legacy_path, state)
            state = {"legacyFiles": legacy_files,
                     "legacyEvents": state.get("events", {}),
                     "migrationStreams": state.get("streams", {}),
                     "retiredStreams": state.get("retiredStreams", [])}
        state.setdefault("schemaVersion", 3)
        records = state.setdefault("streams", {})
        events = state.setdefault("events", {})
        started = time.monotonic()
        # Include all retained days and crash files, not just today's/latest three.
        paths = sorted(set(logs.glob("unified-*.log")) | set((logs / "crash").glob("*.log")))
        snapshot, errors, reports, discontinuities = [], [], [], []
        for path in paths:
            try:
                st = path.stat()
                snapshot.append((path, st.st_dev, st.st_ino, st.st_size))
            except OSError:
                errors.append({"file": str(path), "code": "stat_failed"})
        total_read = 0
        scan_io = 0
        new_counts = collections.Counter()
        fingerprints = {event["contentFingerprint"] for event in events.values()}
        fingerprints.update(state.get("legacyEvents", {}))
        new_fingerprints = collections.Counter()
        counts = collections.Counter()
        live_ids = set()
        for path, dev, ino, size in snapshot:
            identity = f"{dev}:{ino}"
            live_ids.add(identity)
            report = {"file": str(path), "identity": [dev, ino], "snapshotBytes": size,
                      "startOffset": 0, "endOffset": 0, "readBytes": 0,
                      "pendingBytes": size, "counts": {}, "locations": []}
            try:
                with path.open("rb") as stream:
                    actual = os.fstat(stream.fileno())
                    if (actual.st_dev, actual.st_ino) != (dev, ino):
                        errors.append({"file": str(path), "code": "changed_during_open"})
                        reports.append(report)
                        continue
                    record = records.get(identity)
                    hasher = matches(stream, record, actual.st_size, started + budget_seconds) if record else None
                    if record and hasher is None:
                        discontinuities.append({"file": str(path), "identity": [dev, ino],
                                                "code": "content_changed_or_truncated",
                                                "priorOffset": record["offset"],
                                                "priorSnapshotBytes": record.get("snapshotBytes")})
                        state.setdefault("retiredStreams", []).append(record)
                        record = None
                    if record is None:
                        prefix_size = min(1024, size)
                        stream.seek(0)
                        record = {"identity": identity, "offset": 0,
                                  "streamId": uuid.uuid4().hex, "contentSha256": digest(b""),
                                  "prefixBytes": prefix_size, "prefixSha256": digest(stream.read(prefix_size)),
                                  "anchorSha256": digest(b""), "paths": []}
                        records[identity] = record
                        hasher = hashlib.sha256()
                    if str(path) not in record["paths"]:
                        record["paths"].append(str(path))
                    record["snapshotBytes"] = size
                    offset = record["offset"]
                    report["startOffset"] = offset
                    stream.seek(offset)
                    local_counts = collections.Counter()
                    # Fixed file snapshot: concurrent appends belong to the next run.
                    while offset < size and scan_io < max_bytes and time.monotonic() - started < budget_seconds:
                        remaining = min(size - offset, max_bytes - scan_io)
                        raw = stream.readline(min(remaining, MAX_LINE))
                        scan_io += len(raw)
                        if not raw or not raw.endswith(b"\n"):
                            if len(raw) == MAX_LINE:
                                errors.append({"file": str(path), "code": "line_exceeds_bound", "byteOffset": offset})
                            break  # partial UTF-8/frame/line remains pending, never skipped
                        text = raw.decode("utf-8", errors="replace")
                        for code, rule in RULES.items():
                            if not rule.search(text):
                                continue
                            local_counts[code] += 1
                            counts[code] += 1
                            fingerprint = digest(code.encode() + b"\0" + raw)
                            key = digest(f'{record["streamId"]}:{offset}:{code}'.encode())
                            if key not in events:
                                stamp = re.match(r"\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?", text)
                                sid = re.search(r"\bsid=([a-f0-9-]{36})\b", text)
                                event = {"eventKey": key, "code": code, "file": str(path),
                                         "contentFingerprint": fingerprint, "streamId": record["streamId"],
                                         "identity": [dev, ino], "byteOffset": offset,
                                         "timestamp": stamp.group(0) if stamp else None,
                                         "sessionId": sid.group(1) if sid else None}
                                events[key] = event
                                new_counts[code] += 1
                                if fingerprint not in fingerprints:
                                    new_fingerprints[code] += 1
                                    fingerprints.add(fingerprint)
                                if len(report["locations"]) < 80:
                                    report["locations"].append(event)
                        offset += len(raw)
                        total_read += len(raw)
                        hasher.update(raw)
                    record["offset"] = offset
                    record["contentSha256"] = hasher.hexdigest()
                    stream.seek(max(0, offset - 256))
                    record["anchorSha256"] = digest(stream.read(min(256, offset)))
                    report.update(endOffset=offset, readBytes=offset - report["startOffset"],
                                  pendingBytes=max(0, size - offset), counts=dict(local_counts))
            except TimeoutError:
                errors.append({"file": str(path), "code": "prefix_verification_budget"})
            except OSError:
                errors.append({"file": str(path), "code": "read_failed"})
            reports.append(report)
        missing = [{"identity": key, "paths": r["paths"],
                    "unreadSnapshotBytes": max(0, r.get("snapshotBytes", 0) - r["offset"])}
                   for key, r in records.items() if key not in live_ids and r.get("snapshotBytes", 0) > r["offset"]]
        # Old path disappearance is not proof of coverage. Preserve unresolved
        # legacy identities even when all currently retained files are scanned.
        recovered_legacy = set(state.get("recoveredLegacyIdentities", []))
        for old in state.get("legacyFiles", {}).values():
            key = ":".join(map(str, old.get("identity", [])))
            if key in live_ids and records.get(key, {}).get("offset", -1) >= old.get("offset", 0):
                recovered_legacy.add(key)
        state["recoveredLegacyIdentities"] = sorted(recovered_legacy)
        unavailable = []
        for path, old in state.get("legacyFiles", {}).items():
            identity = ":".join(map(str, old.get("identity", [])))
            if identity not in live_ids and identity not in recovered_legacy:
                unavailable.append({"file": path, "identity": old.get("identity"),
                                    "legacyOffset": old.get("offset", 0),
                                    "code": "historical_file_unavailable"})
        checked = datetime.datetime.now().astimezone().isoformat()
        state["checkedAt"] = checked
        state["lastDiscontinuities"] = discontinuities
        state["missingUnreadStreams"] = missing
        state["unavailableLegacyFiles"] = unavailable
        retired_gaps = [{"identity": r["identity"], "paths": r["paths"],
                         "unreadSnapshotBytes": r["snapshotBytes"] - r["offset"]}
                        for r in state.get("retiredStreams", []) if r.get("snapshotBytes", 0) > r["offset"]]
        recovered_migrations = set(state.get("recoveredMigrationIdentities", []))
        for key, old in state.get("migrationStreams", {}).items():
            if key in live_ids and records.get(key, {}).get("offset", -1) >= old.get("snapshotBytes", 0):
                recovered_migrations.add(key)
        state["recoveredMigrationIdentities"] = sorted(recovered_migrations)
        retired_gaps.extend({"identity": key, "paths": r.get("paths", []),
                             "unreadSnapshotBytes": r["snapshotBytes"] - r["offset"],
                             "code": "migrated_unread_generation_unavailable"}
                            for key, r in state.get("migrationStreams", {}).items()
                            if key not in live_ids and key not in recovered_migrations
                            and r.get("snapshotBytes", 0) > r["offset"])
        # Full sanitized event index is durable before any cursor can hide a row.
        atomic(state_path, state)
        pending = sum(r["pendingBytes"] for r in reports)
        return {"checkedAt": checked, "schemaVersion": 3, "readOnly": True,
                "rawMessagesIncluded": False, "files": reports, "readBytes": total_read,
                "scanIoBytes": scan_io,
                "pendingBytes": pending, "snapshotCovered": not (pending or errors or missing or discontinuities),
                "legacyCoverageReset": legacy, "diagnosticCounts": dict(counts),
                "newDiagnosticCounts": dict(new_counts),
                "indexedDiagnosticEvents": len(events) + len(state.get("legacyEvents", {})),
                "indexedLegacyDiagnosticEvents": len(state.get("legacyEvents", {})),
                "newFingerprintCounts": dict(new_fingerprints),
                "eventIndex": str(state_path), "errors": errors, "missingUnreadStreams": missing,
                "unavailableLegacyFiles": unavailable,
                "unavailableRetiredStreams": retired_gaps,
                "historicalCoverageComplete": not (pending or errors or missing or discontinuities or unavailable or retired_gaps),
                "discontinuities": discontinuities,
                "coverageScope": "retained snapshot files only; removed historical bytes cannot be certified"}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--logs", type=Path, default=Path.home() / ".moxbot/logs")
    parser.add_argument("--state", type=Path, default=Path(__file__).with_name("stability-watch-state.json"))
    parser.add_argument("--max-bytes", "--limit", dest="max_bytes", type=int, default=64 * 1024 * 1024)
    parser.add_argument("--budget-seconds", type=float, default=15)
    parser.add_argument("--report", type=Path)
    args = parser.parse_args()
    result = scan(args.logs, args.state, args.max_bytes, args.budget_seconds)
    if args.report:
        atomic(args.report, result)
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
