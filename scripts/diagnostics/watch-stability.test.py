"""Coverage regressions: real temporary log files, no model or private inputs."""
import importlib.util
import json
import tempfile
import unittest
import fcntl
from pathlib import Path

spec = importlib.util.spec_from_file_location("watch_stability", Path(__file__).with_name("watch-stability.py"))
watch = importlib.util.module_from_spec(spec)
spec.loader.exec_module(watch)


class CoverageTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.logs = self.root / "logs"
        self.logs.mkdir()
        self.state = self.root / "state.json"

    def run_scan(self, budget=1024 * 1024):
        return watch.scan(self.logs, self.state, max_bytes=budget, budget_seconds=10)

    def log(self, name, data):
        path = self.logs / name
        path.write_bytes(data)
        return path

    def test_first_scan_reads_old_days_and_file_prefix_not_tail(self):
        raw = b"2026-10-19 01:00:00.000 [agent] SDK terminal error 502 SECRET_BODY\n"
        self.log("unified-2026-10-19.log", raw + b"ordinary\n" * 1000)
        result = self.run_scan()
        self.assertEqual(result["diagnosticCounts"], {"model_transient": 1})
        self.assertEqual(result["files"][0]["startOffset"], 0)
        self.assertTrue(result["snapshotCovered"])
        self.assertNotIn("SECRET_BODY", json.dumps(result))

    def test_bounded_backlog_then_rename_continues_same_file(self):
        p = self.log("unified-2026-10-19.log", b"a\n" * 300)
        first = self.run_scan(100)
        self.assertGreater(first["pendingBytes"], 0)
        p.rename(self.logs / "unified-2026-10-19.rotated.log")
        second = self.run_scan(100)
        self.assertEqual(second["files"][0]["startOffset"], 100)
        while not self.run_scan(100)["snapshotCovered"]:
            pass
        self.assertEqual(self.run_scan()["readBytes"], 0)

    def test_legacy_tail_cursor_is_not_full_coverage(self):
        p = self.log("unified-2026-10-19.log", b"early\nlate\n")
        st = p.stat()
        self.state.write_text(json.dumps({"files": {str(p): {"identity": [st.st_dev, st.st_ino], "offset": st.st_size}}}))
        result = self.run_scan()
        self.assertEqual(result["readBytes"], p.stat().st_size)
        self.assertTrue(result["legacyCoverageReset"])
        self.assertTrue(self.state.with_suffix(".legacy-v1.json").exists())

    def test_in_place_rewrite_and_truncation_do_not_skip_new_prefix(self):
        p = self.log("unified-2026-10-19.log", b"a\n" * 300)
        self.run_scan()
        p.write_bytes(b"2026-10-19 01:00:00 [bridge] fetch failed\n")
        result = self.run_scan()
        self.assertEqual(result["files"][0]["startOffset"], 0)
        self.assertEqual(result["diagnosticCounts"], {"transport_failure": 1})
        self.assertEqual(len(result["discontinuities"]), 1)

    def test_partial_utf8_line_is_not_consumed_or_lost(self):
        p = self.log("unified-2026-10-19.log", b"ok\n" + "半句".encode())
        self.assertEqual(self.run_scan()["pendingBytes"], 6)
        with p.open("ab") as f:
            f.write(b" [agent] API Error: 499\n")
        result = self.run_scan()
        self.assertEqual(result["diagnosticCounts"], {"model_cancelled": 1})
        self.assertTrue(result["snapshotCovered"])

    def test_all_crash_files_and_new_generation_not_just_latest_three(self):
        (self.logs / "crash").mkdir()
        for i in range(6):
            (self.logs / "crash" / f"{i}.log").write_bytes(b"SIGSEGV\n" if i == 0 else b"header\n")
        result = self.run_scan()
        self.assertEqual(len(result["files"]), 6)
        self.assertEqual(result["diagnosticCounts"], {"runtime_crash": 1})

    def test_complete_diagnostic_index_survives_output_cap_and_rescan(self):
        p = self.log("unified-2026-10-19.log", b"".join(f"2026-10-19 01:00:{i:02} [bridge] fetch failed {i}\n".encode() for i in range(80)))
        result = self.run_scan()
        self.assertEqual(result["diagnosticCounts"]["transport_failure"], 80)
        self.assertEqual(len(json.loads(self.state.read_text())["events"]), 80)
        self.assertNotIn("fetch failed", json.dumps(result))
        # Physical occurrences remain indexed; fingerprints group copied content.
        self.log("unified-2026-10-19.copy.log", p.read_bytes())
        copied = self.run_scan()
        self.assertEqual(copied["newDiagnosticCounts"], {"transport_failure": 80})
        self.assertEqual(copied["newFingerprintCounts"], {})

    def test_missing_unread_generation_is_reported_not_certified(self):
        p = self.log("unified-2026-10-19.log", b"a\n" * 300)
        self.run_scan(100)
        p.unlink()
        result = self.run_scan()
        self.assertFalse(result["snapshotCovered"])
        self.assertEqual(result["missingUnreadStreams"][0]["unreadSnapshotBytes"], 500)

    def test_missing_legacy_file_is_permanent_explicit_gap(self):
        self.state.write_text(json.dumps({"files": {str(self.logs / "unified-2026-10-18.log"): {"identity": [111, 222], "offset": 4321}}}))
        result = self.run_scan()
        self.assertTrue(result["snapshotCovered"])
        self.assertFalse(result["historicalCoverageComplete"])
        self.assertEqual(result["unavailableLegacyFiles"][0]["legacyOffset"], 4321)
        self.assertFalse(self.run_scan()["historicalCoverageComplete"])

    def test_corrupt_state_fails_without_resetting_evidence(self):
        self.state.write_text("invalid state")
        with self.assertRaises(json.JSONDecodeError):
            self.run_scan()
        self.assertEqual(self.state.read_text(), "invalid state")

    def test_overlapping_scan_cannot_mutate_cursor(self):
        with self.state.with_suffix(".json.lock").open("a+") as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            with self.assertRaises(BlockingIOError):
                self.run_scan()
        self.assertFalse(self.state.exists())

    def test_overlong_line_never_skips_unscanned_bytes(self):
        p = self.log("unified-2026-10-19.log", b"x" * (watch.MAX_LINE + 1) + b"\n")
        result = self.run_scan(watch.MAX_LINE * 2)
        self.assertEqual(result["readBytes"], 0)
        self.assertEqual(result["pendingBytes"], p.stat().st_size)
        self.assertEqual(result["errors"][0]["code"], "line_exceeds_bound")

    def test_existing_path_cannot_hide_missing_legacy_identity(self):
        p = self.log("unified-2026-10-19.log", b"new generation\n")
        self.state.write_text(json.dumps({"files": {str(p): {"identity": [111, 222], "offset": 999}}}))
        result = self.run_scan()
        self.assertFalse(result["historicalCoverageComplete"])
        self.assertEqual(len(result["unavailableLegacyFiles"]), 1)

    def test_repeated_identical_lines_keep_every_occurrence(self):
        raw = b"2026-10-19 01:00:00 [bridge] fetch failed\n"
        self.log("unified-2026-10-19.log", raw * 3)
        result = self.run_scan()
        self.assertEqual(result["newDiagnosticCounts"], {"transport_failure": 3})
        self.assertEqual(len(json.loads(self.state.read_text())["events"]), 3)

    def test_middle_rewrite_with_unchanged_prefix_and_anchor_is_detected(self):
        p = self.log("unified-2026-10-19.log", b"normal\n" * 600)
        self.run_scan()
        with p.open("r+b") as f:
            f.seek(1400)
            f.write(b"[bridge] fetch failed\n".ljust(70, b" ") + b"\n")
        result = self.run_scan()
        self.assertEqual(len(result["discontinuities"]), 1)
        self.assertEqual(result["diagnosticCounts"], {"transport_failure": 1})

    def test_schema_two_migration_preserves_missing_backlog_and_events(self):
        self.state.write_text(json.dumps({"schemaVersion": 2,
            "streams": {"111:222": {"identity": "111:222", "paths": ["removed"], "offset": 10, "snapshotBytes": 100}},
            "events": {"old-event": {"code": "transport_failure", "byteOffset": 1}}}))
        result = self.run_scan()
        self.assertFalse(result["historicalCoverageComplete"])
        self.assertEqual(result["unavailableRetiredStreams"][0]["unreadSnapshotBytes"], 90)
        self.assertEqual(result["indexedDiagnosticEvents"], 1)
        self.assertEqual(json.loads(self.state.read_text())["legacyEvents"]["old-event"]["byteOffset"], 1)
        self.assertFalse(self.run_scan()["historicalCoverageComplete"])

    def test_unknown_future_schema_is_not_discarded(self):
        self.state.write_text('{"schemaVersion":999,"preserve":true}')
        with self.assertRaises(ValueError):
            self.run_scan()
        self.assertIn('"preserve":true', self.state.read_text())

    def test_fully_recovered_migrated_stream_can_be_deleted_without_new_gap(self):
        p = self.log("unified-2026-10-19.log", b"a\n" * 100)
        st = p.stat()
        key = f"{st.st_dev}:{st.st_ino}"
        self.state.write_text(json.dumps({"schemaVersion": 2,
            "streams": {key: {"identity": key, "paths": [str(p)], "offset": 10, "snapshotBytes": 200}},
            "legacyFiles": {str(p): {"identity": [st.st_dev, st.st_ino], "offset": 20}}}))
        self.assertTrue(self.run_scan()["historicalCoverageComplete"])
        p.unlink()
        after = self.run_scan()
        self.assertEqual(after["unavailableRetiredStreams"], [])
        self.assertEqual(after["unavailableLegacyFiles"], [])
        self.assertTrue(after["historicalCoverageComplete"])


if __name__ == "__main__":
    unittest.main()
