#!/usr/bin/env python3
"""Offline KVM/target safety checks; never creates a VM or controls a Host."""
import importlib.util
import contextlib
import io
import json
import os
from pathlib import Path
import stat
import subprocess
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import MagicMock, patch, call

spec = importlib.util.spec_from_file_location("reboot_acceptance", Path(__file__).with_name("host-reboot-acceptance.py"))
reboot = importlib.util.module_from_spec(spec)
spec.loader.exec_module(reboot)
lab = reboot.lab_module()


class RebootGates(unittest.TestCase):
    def test_KVM_requires_real_create_VM_ioctl_and_closes_both_descriptors(self):
        with patch.object(lab, "environment_guard"), patch.object(Path, "exists", return_value=True), \
             patch.object(Path, "stat", return_value=SimpleNamespace(st_mode=stat.S_IFCHR)), \
             patch.object(Path, "read_text", return_value="flags vmx"), \
             patch.object(reboot.os, "open", return_value=91), \
             patch.object(reboot.fcntl, "ioctl", side_effect=[12, 92]) as ioctl, \
             patch.object(reboot.os, "close") as close:
            result = reboot.kvm_probe(lab)
        self.assertTrue(result["KVM_CREATE_VM"])
        self.assertFalse(result["TCGFallback"])
        self.assertEqual(ioctl.call_args_list, [call(91, 0xAE00, 0), call(91, 0xAE01, 0)])
        self.assertEqual(close.call_args_list, [call(92), call(91)])

    def test_missing_KVM_blocks_before_any_emulator_or_fallback(self):
        with patch.object(lab, "environment_guard"), patch.object(Path, "exists", return_value=False), \
             patch.object(reboot.subprocess, "Popen") as popen:
            with self.assertRaisesRegex(lab.Rejected, "blocked-no-KVM-device"):
                reboot.kvm_probe(lab)
        popen.assert_not_called()

    def test_failed_KVM_ioctl_is_a_blocker_and_does_not_fall_back(self):
        with patch.object(lab, "environment_guard"), patch.object(Path, "exists", return_value=True), \
             patch.object(Path, "stat", return_value=SimpleNamespace(st_mode=stat.S_IFCHR)), \
             patch.object(Path, "read_text", return_value="flags svm"), patch.object(reboot.os, "open", return_value=91), \
             patch.object(reboot.fcntl, "ioctl", side_effect=PermissionError), patch.object(reboot.os, "close"), \
             patch.object(reboot.subprocess, "Popen") as popen:
            with self.assertRaisesRegex(lab.Rejected, "blocked-KVM-create-VM-ioctl-failed"):
                reboot.kvm_probe(lab)
        popen.assert_not_called()

    def test_private_material_rejects_permissions_symlinks_and_hardlinks(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "private"
            path.write_text("not-a-real-key")
            path.chmod(0o600)
            self.assertEqual(reboot.private_file(path, uid=os.getuid()), b"not-a-real-key")
            path.chmod(0o644)
            with self.assertRaises(ValueError):
                reboot.private_file(path, uid=os.getuid())
            path.chmod(0o600)
            link = Path(directory) / "symlink"
            link.symlink_to(path)
            with self.assertRaises(ValueError):
                reboot.private_file(link, uid=os.getuid())
            os.link(path, Path(directory) / "hardlink")
            with self.assertRaises(ValueError):
                reboot.private_file(path, uid=os.getuid())

    def target(self):
        target = reboot.GuestTarget.__new__(reboot.GuestTarget)
        target.need = lab.need
        target.close = MagicMock()
        target.start_forward = MagicMock()
        target.check_listeners = MagicMock()
        return target

    def test_true_reboot_requires_changed_kernel_boot_id_even_when_SSH_recovers(self):
        target = self.target()
        before = {"bootId": "old-kernel-boot", "uuid": "same-VM", "uptimeSeconds": 100}
        after = {"bootId": "new-kernel-boot", "uuid": "same-VM", "uptimeSeconds": 6}
        target.call = MagicMock(side_effect=[before, True, before, after])
        with patch.object(reboot.time, "sleep"):
            result = target.reboot()
        self.assertTrue(result["passed"])
        self.assertNotEqual(result["beforeBootId"], result["afterBootId"])
        target.start_forward.assert_called_once()
        target.check_listeners.assert_called_once()

    def test_unit_restart_or_unchanged_boot_id_cannot_pass_reboot_gate(self):
        target = self.target()
        before = {"bootId": "same-kernel-boot", "uuid": "same-VM", "uptimeSeconds": 100}
        target.call = MagicMock(side_effect=[before, True, before])
        with patch.object(reboot.time, "sleep"), patch.object(reboot.time, "monotonic", side_effect=[0, 1, 151]):
            with self.assertRaisesRegex(lab.Rejected, "true-reboot-new-kernel-boot-id-and-uptime"):
                target.reboot()
        target.start_forward.assert_not_called()

    def test_process_birth_parses_spaces_and_parentheses_in_proc_comm(self):
        synthetic = "123 (command with (spaces)) S " + " ".join(str(value) for value in range(4, 53))
        with patch.object(Path, "read_text", return_value=synthetic):
            self.assertEqual(reboot.process_birth(123), "22")

    def test_guest_rejects_arbitrary_command_without_running_it_or_echoing_input(self):
        payload = {"op": "command", "nonce": "synthetic", "command": ["bash", "-c", "echo secret-value"]}
        stdin = SimpleNamespace(buffer=io.BytesIO(json.dumps(payload).encode()))
        stdout, stderr = io.StringIO(), io.StringIO()
        with patch.object(reboot, "lab_module", return_value=lab), patch.object(reboot, "guest_guard", return_value={}), \
             patch.object(reboot.sys, "stdin", stdin), patch.object(lab, "run") as command, \
             contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
            self.assertEqual(reboot.guest_main(), 1)
        command.assert_not_called()
        self.assertNotIn("secret-value", stdout.getvalue() + stderr.getvalue())
        self.assertIn("guest-operation-rejected-redacted", stderr.getvalue())

    def test_guest_allows_only_fixed_auth_transient_stop_and_show_for_final_cleanup(self):
        unit = lab.AUTH_UNITS[1]
        for command, allowed in ((["systemctl", "stop", unit], True),
                (["systemctl", "show", unit, "--property=LoadState,ActiveState,MainPID"], True),
                (["systemctl", "restart", unit], False),
                (["systemctl", "stop", "unrelated.service"], False)):
            payload = {"op": "command", "nonce": "synthetic", "command": command}
            stdin = SimpleNamespace(buffer=io.BytesIO(json.dumps(payload).encode()))
            stdout, stderr = io.StringIO(), io.StringIO()
            with self.subTest(command=command), patch.object(reboot, "lab_module", return_value=lab), \
                 patch.object(reboot, "guest_guard", return_value={}), patch.object(reboot.sys, "stdin", stdin), \
                 patch.object(lab, "run", return_value=subprocess.CompletedProcess(command, 0, b"", b"")) as run, \
                 contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
                self.assertEqual(reboot.guest_main(), 0 if allowed else 1)
                self.assertEqual(run.call_count, 1 if allowed else 0)

    def test_guest_canceled_status_projects_empty_only_and_live_status_still_rejects_empty(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(lab, "STATUS", Path(directory) / "status.json"):
            lab.STATUS.write_bytes(b"")
            for op, expected in (("canceled-status-observation", 0), ("status", 1)):
                payload = {"op": op, "nonce": "synthetic"}
                stdin = SimpleNamespace(buffer=io.BytesIO(json.dumps(payload).encode()))
                stdout, stderr = io.StringIO(), io.StringIO()
                with self.subTest(op=op), patch.object(reboot, "lab_module", return_value=lab), \
                     patch.object(reboot, "guest_guard", return_value={}), patch.object(reboot.sys, "stdin", stdin), \
                     contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
                    self.assertEqual(reboot.guest_main(), expected)
                if expected == 0:
                    self.assertEqual(json.loads(stdout.getvalue())["result"], {"kind": "empty", "ready": False})

    def test_guest_allows_only_fixed_connector_inactive_observation(self):
        command = ["systemctl", "show", lab.CONNECTOR, "--property=LoadState,ActiveState,MainPID"]
        payload = {"op": "command", "nonce": "synthetic", "command": command}
        stdin = SimpleNamespace(buffer=io.BytesIO(json.dumps(payload).encode()))
        with patch.object(reboot, "lab_module", return_value=lab), patch.object(reboot, "guest_guard", return_value={}), \
             patch.object(reboot.sys, "stdin", stdin), contextlib.redirect_stdout(io.StringIO()), \
             patch.object(lab, "run", return_value=subprocess.CompletedProcess(command, 0, b"MainPID=0\n", b"")) as run:
            self.assertEqual(reboot.guest_main(), 0)
            run.assert_called_once_with(command, timeout=45, check=False)


if __name__ == "__main__":
    unittest.main()
