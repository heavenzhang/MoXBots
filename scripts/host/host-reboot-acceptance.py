#!/usr/bin/env python3
"""Nested-KVM coordinator and closed guest helper; no TCG or paid-runner fallback.

Only synthetic cloud-init/SSH/CA material exists below a root-private temporary
directory. The guest's SSH host key is generated in that controlled seed before
first boot and pinned, never learned through an unauthenticated network scan.
"""
from __future__ import annotations
import argparse
import base64
import fcntl
import grp
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import pwd
import re
import shutil
import signal
import socket
import stat
import subprocess
import sys
import tempfile
import time
import urllib.request
import uuid

sys.dont_write_bytecode = True
PROFILE = "moxbots-disposable-kvm-reboot-v1"
MARKER = Path("/var/lib/moxbots-disposable-kvm-lab/marker.json")
HELPER = "/root/moxbots-lab/host-reboot-acceptance.py"
INSTALL_PROCESS = Path("/run/moxbots-disposable-install.json")
IMAGE_ROOT = "https://cloud-images.ubuntu.com/noble/current/"
IMAGE_NAME = "noble-server-cloudimg-amd64.img"
SSH_PORT = 22222


def lab_module():
    spec = importlib.util.spec_from_file_location("reboot_browser_lab", Path(__file__).with_name("browser-acceptance.py"))
    value = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(value)
    return value


def private_file(path, uid=0):
    info = path.lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_uid != uid or info.st_mode & 0o777 != 0o600 or info.st_nlink != 1:
        raise ValueError("private-regular-root-owned-file-required")
    return path.read_bytes()


def kvm_probe(lab):
    lab.environment_guard()
    lab.need(Path("/dev/kvm").exists() and stat.S_ISCHR(Path("/dev/kvm").stat().st_mode), "blocked-no-KVM-device")
    lab.need(re.search(r"\b(vmx|svm)\b", Path("/proc/cpuinfo").read_text()) is not None, "blocked-no-nested-CPU-extension")
    try:
        fd = os.open("/dev/kvm", os.O_RDWR | os.O_CLOEXEC)
        try:
            lab.need(fcntl.ioctl(fd, 0xAE00, 0) == 12, "blocked-KVM-API-version")
            vm = fcntl.ioctl(fd, 0xAE01, 0)  # KVM_CREATE_VM is the actual capability gate
            os.close(vm)
        finally:
            os.close(fd)
    except OSError:
        raise lab.Rejected("blocked-KVM-create-VM-ioctl-failed") from None
    return {"device": True, "apiVersion": 12, "KVM_CREATE_VM": True, "TCGFallback": False}


def guest_guard(payload, lab):
    lab.need(os.geteuid() == 0 and sys.platform == "linux", "guest-root-linux-required")
    lab.need(Path("/proc/1/comm").read_text().strip() == "systemd", "guest-real-systemd-PID1")
    release = dict(line.split("=", 1) for line in Path("/etc/os-release").read_text().splitlines() if "=" in line)
    lab.need(release.get("ID", "").strip('"') == "ubuntu" and release.get("VERSION_ID", "").strip('"') == "24.04",
             "guest-Ubuntu24-required")
    lab.need(os.uname().machine == "x86_64" and lab.run(["systemctl", "--version"]).stdout.split()[1] == b"255",
             "guest-x86-systemd255-required")
    lab.need(lab.run(["systemd-detect-virt", "--vm"]).stdout.strip() in {b"kvm", b"qemu"}, "guest-QEMU-VM-required")
    marker = json.loads(private_file(MARKER))
    lab.need(MARKER.parent.stat().st_uid == 0 and MARKER.parent.stat().st_mode & 0o777 == 0o700,
             "guest-private-marker-directory")
    lab.need(set(marker) == {"profile", "uuid", "nonce"} and marker["profile"] == PROFILE
             and marker["nonce"] == payload.get("nonce") and re.fullmatch(r"[0-9a-f]{64}", marker["nonce"]), "guest-marker-nonce-profile")
    lab.need(Path("/sys/class/dmi/id/product_uuid").read_text().strip().lower() == marker["uuid"], "guest-DMI-UUID-match")
    return marker


def empty_namespace(lab):
    for name in ("moxbot-host-test", "moxbot-host-network-test"):
        for prefix in ("/opt", "/var/lib", "/etc", "/run"):
            lab.need(not os.path.lexists(Path(prefix) / name), "guest-existing-MoX-namespace-protected")
        for path in (f"/etc/systemd/system/{name}.service", f"/etc/systemd/system/{name}.service.d",
                     f"/etc/tmpfiles.d/{name}.conf", f"/etc/{name}-public"):
            lab.need(not os.path.lexists(path), "guest-existing-MoX-config-protected")
        for lookup in (pwd.getpwnam, grp.getgrnam):
            try:
                lookup(name)
            except KeyError:
                pass
            else:
                raise lab.Rejected("guest-existing-MoX-account-protected")
        lab.need(lab.run(["systemctl", "show", name + ".service", "--property=LoadState", "--value"], check=False).stdout.strip() == b"not-found",
                 "guest-existing-MoX-unit-protected")
    lab.require_absent_auth_units()
    return True


def process_birth(pid):
    # starttime is field22; comm may contain spaces and parentheses.
    return Path(f"/proc/{pid}/stat").read_text().rsplit(")", 1)[1].split()[19]


def guest_install(lab, marker):
    lab.need(not INSTALL_PROCESS.exists(), "guest-install-already-recorded")
    command = f"set -o pipefail; curl --fail --silent --show-error {lab.ORIGIN}/host/install.sh | sudo bash -s -- --instance {lab.ORIGIN}"
    process = subprocess.Popen(["bash", "-c", command], stdin=subprocess.DEVNULL, start_new_session=True)
    record = {"pid": process.pid, "birth": process_birth(process.pid), "nonce": marker["nonce"]}
    lab.private_write(INSTALL_PROCESS, json.dumps(record))
    try:
        try:
            return process.wait(timeout=285)
        except subprocess.TimeoutExpired:
            os.killpg(process.pid, signal.SIGTERM)
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                os.killpg(process.pid, signal.SIGKILL)
                process.wait(timeout=5)
            return 1
    finally:
        INSTALL_PROCESS.unlink(missing_ok=True)


def guest_main():
    lab = lab_module()
    try:
        raw = sys.stdin.buffer.read(65537)
        lab.need(len(raw) <= 65536, "guest-payload-bound")
        payload = json.loads(raw)
        marker = guest_guard(payload, lab)
        op = payload.get("op")
        if op == "install":
            return guest_install(lab, marker)
        if op == "empty-namespace":
            result = empty_namespace(lab)
        elif op == "boot-info":
            result = {"bootId": Path("/proc/sys/kernel/random/boot_id").read_text().strip(),
                      "uptimeSeconds": float(Path("/proc/uptime").read_text().split()[0]), "uuid": marker["uuid"]}
        elif op == "status":
            result = json.loads(lab.STATUS.read_bytes())
        elif op == "identity-hashes":
            result = lab.installed_identity_hashes()
        elif op == "persistent-hashes":
            lab.need(type(payload.get("include_accounts")) is bool, "guest-hash-mode")
            result = lab.persistent_hashes(payload["include_accounts"])
        elif op == "listeners":
            result = sorted(lab.tcp_listeners())
        elif op == "auth-unit-observation":
            result = lab.auth_unit_observation()
        elif op == "trust-ca":
            value = payload.get("certificate", "")
            lab.need(isinstance(value, str) and len(value) < 65536 and value.startswith("-----BEGIN CERTIFICATE-----"), "guest-CA-format")
            ca = Path("/usr/local/share/ca-certificates/moxbots-disposable-browser-lab.crt")
            lab.need(not ca.exists(), "guest-existing-CA-protected")
            ca.write_text(value)
            ca.chmod(0o644)
            lab.run(["update-ca-certificates"])
            result = True
        elif op in {"interrupt-install", "abort-install"}:
            record = json.loads(private_file(INSTALL_PROCESS))
            lab.need(record["nonce"] == marker["nonce"] and process_birth(record["pid"]) == record["birth"]
                     and os.getpgid(record["pid"]) == record["pid"], "guest-owned-process-birth-check")
            if op == "interrupt-install":
                result = lab.interrupt_installer_owner(record["pid"])
            else:
                os.killpg(record["pid"], signal.SIGTERM)
                result = True
        elif op == "reboot":
            lab.run(["systemctl", "--no-block", "reboot"])
            result = True
        elif op == "command":
            command = payload.get("command")
            allowed = [["/opt/moxbot-host-test/bin/moxbot-host", "doctor"]]
            for unit in (lab.NODE, lab.CONNECTOR):
                allowed += [["systemctl", "show", unit, "--property=MainPID", "--value"]]
                allowed += [["systemctl", verb, "--quiet", unit] for verb in ("is-active", "is-enabled")]
                allowed += [["systemctl", "stop", unit]]
            for unit in lab.AUTH_UNITS:
                allowed += [["systemctl", "stop", unit],
                            ["systemctl", "show", unit, "--property=LoadState,ActiveState,MainPID"]]
            allowed += [["systemctl", "restart", lab.CONNECTOR]]
            lab.need(command in allowed, "guest-command-outside-closed-owner-operations")
            completed = lab.run(command, timeout=45, check=False)
            result = {"returncode": completed.returncode, "stdout": base64.b64encode(completed.stdout).decode()}
        else:
            raise lab.Rejected("guest-unknown-operation")
        print(json.dumps({"ok": True, "result": result}, separators=(",", ":")))
        return 0
    except Exception:
        # Never print an exception object or traceback from guest auth processes.
        print('{"ok":false,"error":"guest-operation-rejected-redacted"}', file=sys.stderr)
        return 1


class GuestTarget:
    def __init__(self, path, runner, need):
        self.runner, self.need = runner, need
        need(path.is_absolute() and path.resolve() == path and path.name == "target.json"
             and path.parent.name.startswith("moxbots-reboot-kvm-")
             and path.parent.stat().st_uid == 0 and path.parent.stat().st_mode & 0o777 == 0o700,
             "guest-target-private-coordinator-root")
        self.config = json.loads(private_file(path))
        need(set(self.config) == {"profile", "uuid", "nonce", "key", "knownHosts", "port"}
             and self.config["profile"] == PROFILE and self.config["port"] == SSH_PORT,
             "guest-target-closed-profile")
        need(str(uuid.UUID(self.config["uuid"])) == self.config["uuid"]
             and re.fullmatch(r"[0-9a-f]{64}", self.config["nonce"]), "guest-target-UUID-nonce")
        for name in ("key", "knownHosts"):
            key = Path(self.config[name])
            need(key.is_absolute() and key.parent == path.parent, "guest-target-private-sibling-path")
            private_file(key)
        known = Path(self.config["knownHosts"]).read_text().strip()
        need(re.fullmatch(r"\[127\.0\.0\.1\]:22222 ssh-ed25519 [A-Za-z0-9+/=]+(?: [^\r\n]+)?", known),
             "guest-known-hosts-one-preseeded-key-only")
        self.ssh = ["ssh", "-F", "/dev/null", "-i", self.config["key"], "-p", str(SSH_PORT),
            "-o", "BatchMode=yes", "-o", "IdentitiesOnly=yes", "-o", "StrictHostKeyChecking=yes",
            "-o", "UserKnownHostsFile=" + self.config["knownHosts"], "-o", "GlobalKnownHostsFile=/dev/null",
            "-o", "ConnectTimeout=3", "-o", "ServerAliveInterval=3", "-o", "ServerAliveCountMax=3"]
        self.forward = None
        self.baseline = None

    def payload(self, op, **kwargs):
        return json.dumps({"op": op, "nonce": self.config["nonce"], **kwargs}).encode()

    def call(self, op, **kwargs):
        command = self.ssh + ["root@127.0.0.1", "python3", HELPER, "--guest"]
        raw = self.runner(command, data=self.payload(op, **kwargs), timeout=55, check=False)
        self.need(raw.returncode == 0, "guest-operation-failed-redacted")
        value = json.loads(raw.stdout)
        self.need(set(value) == {"ok", "result"} and value["ok"] is True, "guest-operation-confirmed")
        return value["result"]

    def run(self, command, *, check=True, timeout=60, **kwargs):
        self.need(not kwargs, "guest-command-no-input-or-environment-override")
        value = self.call("command", command=command)
        self.need(not check or value["returncode"] == 0, "guest-host-command-rejected")
        return subprocess.CompletedProcess(command, value["returncode"], base64.b64decode(value["stdout"]), b"")

    def prepare(self):
        self.call("empty-namespace")
        self.baseline = set(self.call("listeners"))
        boot = self.call("boot-info")
        self.need(boot["uuid"] == self.config["uuid"], "guest-boot-target-UUID")
        return True

    def start_forward(self):
        self.forward = subprocess.Popen(self.ssh + ["-N", "-o", "ExitOnForwardFailure=yes", "-R",
            "127.0.0.1:24443:127.0.0.1:24443", "root@127.0.0.1"],
            stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        time.sleep(0.5)
        self.need(self.forward.poll() is None, "guest-loopback-forward-start")

    def configure_ca(self, certificate):
        self.call("trust-ca", certificate=certificate)
        self.start_forward()
        self.check_listeners()
        return True

    def check_listeners(self):
        self.need(set(self.call("listeners")) - self.baseline == {"127.0.0.1:24443"}, "guest-no-new-listener-except-loopback-forward")

    def popen_install(self):
        process = subprocess.Popen(self.ssh + ["root@127.0.0.1", "python3", HELPER, "--guest"],
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, start_new_session=True)
        process.stdin.write(self.payload("install"))
        process.stdin.close()
        return process

    def close(self):
        if self.forward is not None and self.forward.poll() is None:
            self.forward.terminate()
            try:
                self.forward.wait(timeout=10)
            except subprocess.TimeoutExpired:
                self.forward.kill()
                self.forward.wait(timeout=5)
        self.forward = None

    def reboot(self):
        before = self.call("boot-info")
        try:
            self.call("reboot")
        except Exception:
            # A lost reply is permitted only if a different real boot is observed.
            pass
        self.close()
        until = time.monotonic() + 150
        after = None
        while time.monotonic() < until:
            try:
                current = self.call("boot-info")
                if current["bootId"] != before["bootId"]:
                    after = current
                    break
            except Exception:
                pass
            time.sleep(2)
        self.need(after is not None and after["uuid"] == before["uuid"] and after["uptimeSeconds"] < 150,
                  "true-reboot-new-kernel-boot-id-and-uptime")
        self.start_forward()
        self.check_listeners()
        return {"passed": True, "beforeBootId": before["bootId"], "afterBootId": after["bootId"],
                "afterUptimeSeconds": after["uptimeSeconds"], "sameVMUUID": True}


def download_image(private, lab):
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), lab.NoRedirect())
    with opener.open(IMAGE_ROOT + "SHA256SUMS", timeout=30) as response:
        sums = response.read(1024**2 + 1)
    lab.need(len(sums) <= 1024**2, "Ubuntu-image-checksum-bound")
    matches = re.findall(rb"^([0-9a-f]{64}) [ *]" + re.escape(IMAGE_NAME.encode()) + rb"$", sums, re.MULTILINE)
    lab.need(len(matches) == 1, "Ubuntu-image-exact-checksum-entry")
    expected = matches[0].decode()
    path = private / "ubuntu24.img"
    total = 0
    deadline = time.monotonic() + 300
    with opener.open(IMAGE_ROOT + IMAGE_NAME, timeout=45) as response, path.open("xb") as out:
        lab.need(response.status == 200 and response.geturl() == IMAGE_ROOT + IMAGE_NAME, "Ubuntu-image-normal-TLS-full-get")
        while block := response.read(1024**2):
            lab.need(time.monotonic() < deadline, "Ubuntu-image-download-deadline")
            total += len(block)
            lab.need(total < 2 * 1024**3, "Ubuntu-image-download-bound")
            out.write(block)
    lab.need(lab.digest(path) == expected, "Ubuntu-image-SHA256")
    return path, {"url": IMAGE_ROOT + IMAGE_NAME, "bytes": total, "sha256": expected}


def coordinator(args):
    lab = lab_module()
    lab.guard(argparse.Namespace(product_source=args.product_source, output=args.output,
        cached_public_payload=args.cached_public_payload, cached_public_run=args.cached_public_run,
        cached_public_artifact_id=args.cached_public_artifact_id))
    try:
        probe = kvm_probe(lab)
    except lab.Rejected as error:
        args.output.mkdir(mode=0o755)
        args.output.chmod(0o755)
        (args.output / "summary.json").write_text(json.dumps({"passed": False, "status": "blocked", "gate": str(error),
            "TCGFallback": False, "reboot": "not-tested", "productionTouched": False}, indent=2) + "\n")
        (args.output / "summary.json").chmod(0o644)
        lab.public_readability([args.output / "summary.json"])
        raise
    if args.probe_only:
        print("passed: real-KVM-create-VM-ioctl")
        return
    lab.need(args.service_artifact is not None, "exact-M-service-artifact-required")
    os.umask(0o077)
    qemu = None
    with tempfile.TemporaryDirectory(prefix="moxbots-reboot-kvm-", dir=os.environ["RUNNER_TEMP"]) as scratch:
        private = Path(scratch)
        try:
            with socket.socket() as sock:
                sock.bind(("127.0.0.1", SSH_PORT))
            image, image_evidence = download_image(private, lab)
            disk_info = json.loads(lab.run(["qemu-img", "info", "--output=json", str(image)]).stdout)
            lab.need(disk_info.get("format") == "qcow2" and not disk_info.get("backing-filename")
                     and 0 < disk_info.get("virtual-size", 0) <= 8 * 1024**3, "Ubuntu-image-standalone-qcow2-capacity")
            overlay = private / "guest.qcow2"
            lab.run(["qemu-img", "create", "-f", "qcow2", "-F", "qcow2", "-b", str(image), str(overlay), "8G"])
            for filename in ("controller-key", "guest-host-key"):
                lab.run(["ssh-keygen", "-q", "-t", "ed25519", "-N", "", "-f", str(private / filename)])
            key = private / "controller-key"
            vm_uuid, nonce = str(uuid.uuid4()), os.urandom(32).hex()
            marker = {"profile": PROFILE, "uuid": vm_uuid, "nonce": nonce}
            files = [{"path": str(MARKER), "owner": "root:root", "permissions": "0600", "content": json.dumps(marker)}]
            for filename in ("host-reboot-acceptance.py", "browser-acceptance.py"):
                files.append({"path": "/root/moxbots-lab/" + filename, "owner": "root:root", "permissions": "0600",
                              "content": Path(__file__).with_name(filename).read_text()})
            files.append({"path": "/etc/ssh/sshd_config.d/00-moxbots-lab.conf", "owner": "root:root", "permissions": "0600",
                          "content": "PasswordAuthentication no\nKbdInteractiveAuthentication no\nPermitRootLogin prohibit-password\nHostKey /etc/ssh/ssh_host_ed25519_key\nGatewayPorts no\n"})
            cloud = {"disable_root": False, "ssh_pwauth": False,
                "users": [{"name": "root", "lock_passwd": True, "ssh_authorized_keys": [(private / "controller-key.pub").read_text().strip()]}],
                "ssh_keys": {"ed25519_private": (private / "guest-host-key").read_text(), "ed25519_public": (private / "guest-host-key.pub").read_text().strip()},
                "write_files": files, "package_update": True, "packages": ["curl", "python3", "sudo", "ca-certificates", "libstdc++6"],
                "runcmd": [["chmod", "0700", str(MARKER.parent)], ["systemctl", "restart", "ssh.service"], ["touch", "/var/lib/moxbots-disposable-kvm-lab/cloud-ready"]]}
            lab.private_write(private / "user-data", "#cloud-config\n" + json.dumps(cloud))
            lab.private_write(private / "meta-data", json.dumps({"instance-id": vm_uuid, "local-hostname": "moxbots-disposable-kvm"}))
            seed = private / "seed.img"
            lab.run(["cloud-localds", str(seed), str(private / "user-data"), str(private / "meta-data")])
            known = private / "known-hosts"
            lab.private_write(known, f"[127.0.0.1]:{SSH_PORT} " + (private / "guest-host-key.pub").read_text())
            target = private / "target.json"
            lab.private_write(target, json.dumps({**marker, "key": str(key), "knownHosts": str(known), "port": SSH_PORT}))
            qemu = subprocess.Popen(["qemu-system-x86_64", "-accel", "kvm", "-cpu", "host", "-smp", "2", "-m", "3072",
                "-uuid", vm_uuid, "-drive", f"file={overlay},format=qcow2,if=virtio", "-drive", f"file={seed},format=raw,if=virtio,readonly=on",
                "-netdev", f"user,id=net0,hostfwd=tcp:127.0.0.1:{SSH_PORT}-:22", "-device", "virtio-net-pci,netdev=net0",
                "-display", "none", "-serial", "null", "-monitor", "none"],
                stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
            control = GuestTarget(target, lab.run, lab.need)
            until = time.monotonic() + 300
            while time.monotonic() < until:
                lab.need(qemu.poll() is None, "KVM-guest-exited-before-boot")
                try:
                    control.call("boot-info")
                    # Wait for package installation and ssh restart, without any raw cloud-init output.
                    result = lab.run(control.ssh + ["root@127.0.0.1", "test", "-f", "/var/lib/moxbots-disposable-kvm-lab/cloud-ready"], check=False, timeout=8)
                    if result.returncode == 0:
                        break
                except Exception:
                    pass
                time.sleep(2)
            else:
                raise lab.Rejected("KVM-cloud-init-ready-deadline")
            command = [sys.executable, str(Path(__file__).with_name("browser-acceptance.py")),
                "--product-source", str(args.product_source), "--service-artifact", str(args.service_artifact),
                "--output", str(args.output), "--guest-target-json", str(target)]
            if args.cached_public_payload:
                command += ["--cached-public-payload", str(args.cached_public_payload), "--cached-public-run", args.cached_public_run,
                            "--cached-public-artifact-id", args.cached_public_artifact_id]
            # Browser driver already prints only fixed gates. Keep even that raw pipe
            # in memory here and forward only the fixed pass/fail marker alphabet.
            result = lab.run(command, timeout=2400, check=False)
            for line in result.stdout.decode(errors="replace").splitlines():
                if re.fullmatch(r"passed: [A-Za-z0-9-]+", line):
                    print(line, flush=True)
            lab.need(args.output.joinpath("summary.json").is_file(), "reboot-driver-summary-required")
            summary = json.loads((args.output / "summary.json").read_bytes())
            summary["KVMProbe"] = probe
            summary["guestImage"] = image_evidence
            summary["guestSSH"] = "private guest NAT:22, outer host forwarding only127.0.0.1:22222, preseeded pinned host key"
            summary["guestSSHHostPublicKeySha256"] = hashlib.sha256((private / "guest-host-key.pub").read_bytes()).hexdigest()
            (args.output / "summary.json").write_text(json.dumps(summary, indent=2) + "\n")
            args.output.chmod(0o755)
            (args.output / "summary.json").chmod(0o644)
            lab.public_readability([args.output / "summary.json"])
            lab.need(result.returncode == 0 and summary.get("passed") is True, "reboot-browser-driver-failed-see-redacted-summary")
        except Exception as error:
            if not args.output.exists():
                args.output.mkdir(mode=0o755)
            args.output.chmod(0o755)
            if not (args.output / "summary.json").exists():
                gate = str(error) if isinstance(error, lab.Rejected) else "unexpected-coordinator-error-redacted"
                (args.output / "summary.json").write_text(json.dumps({"passed": False, "status": "failed", "gate": gate,
                    "TCGFallback": False, "KVMProbe": probe, "reboot": "not-tested", "productionTouched": False}, indent=2) + "\n")
                (args.output / "summary.json").chmod(0o644)
                lab.public_readability([args.output / "summary.json"])
            raise
        finally:
            if qemu is not None and qemu.poll() is None:
                qemu.terminate()
                try:
                    qemu.wait(timeout=15)
                except subprocess.TimeoutExpired:
                    qemu.kill()
                    qemu.wait(timeout=5)


def main():
    if sys.argv[1:] == ["--guest"]:
        return guest_main()
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--product-source", type=Path, required=True)
    parser.add_argument("--service-artifact", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--probe-only", action="store_true")
    parser.add_argument("--cached-public-payload", type=Path)
    parser.add_argument("--cached-public-run", default="")
    parser.add_argument("--cached-public-artifact-id", default="")
    args = parser.parse_args()
    try:
        coordinator(args)
        return 0
    except Exception:
        print("HOST_REBOOT_ACCEPTANCE_REJECTED: redacted-error; inspect summary if present", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
