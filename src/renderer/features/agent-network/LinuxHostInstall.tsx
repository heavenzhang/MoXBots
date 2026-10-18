import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import CustomSelect from "@/components/CustomSelect";
import { copyPlainText } from "@/utils/clipboard";
import {
  allCallableAgents,
  allNetworkDevices,
  hostInstallerInfo,
  type CallableAgent,
  type HostInstallerInfo,
  type NetworkDevice,
  type NetworkSnapshot,
} from "@/api/agentNetwork";
import { currentNetworkGeneration } from "./store";

const buttonClass =
  "rounded-lg border border-[var(--line)] px-3 py-2 text-sm hover:bg-[var(--hover-bg)] disabled:cursor-not-allowed disabled:opacity-50";
const primaryClass =
  "rounded-lg bg-[var(--button-primary-bg)] px-4 py-2 text-sm font-semibold text-[var(--button-primary-text)] hover:bg-[var(--button-primary-bg-hover)] disabled:cursor-not-allowed disabled:opacity-50";
export const HOST_POLL_INTERVAL = 5_000;
export const HOST_POLL_TIMEOUT = 5 * 60_000;
type Directory<T> = { items: T[]; complete: boolean };
type Observation = {
  devices: Directory<NetworkDevice> | null;
  callable: Directory<CallableAgent> | null;
};

/** Enrollment survives directory revisions; the parent keys its auth/network/state scope. */
export function LinuxHostInstall({
  connectionId,
  snapshot,
  networkName,
  localDeviceId,
  onBack,
  onClose,
  onManage,
}: {
  connectionId: string;
  snapshot: NetworkSnapshot;
  networkName: string;
  localDeviceId: string;
  onBack: () => void;
  onClose: () => void;
  onManage: (device: NetworkDevice) => void;
}) {
  const { t } = useTranslation("app");
  const text = (key: string, values?: Record<string, string | number>) =>
    t(`agentNetwork.hostOnboarding.${key}`, values);
  const [installer, setInstaller] = useState<HostInstallerInfo | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "error" | "done">(
    "loading",
  );
  const [loadRevision, setLoadRevision] = useState(0);
  const [phase, setPhase] = useState<"command" | "waiting">("command");
  const [status, setStatus] = useState<
    "idle" | "polling" | "timeout" | "error" | "invalid"
  >("idle");
  const [copying, setCopying] = useState(false);
  const [reading, setReading] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const [observation, setObservation] = useState<Observation | null>(null);
  const [targetId, setTargetId] = useState("");
  const [run, setRun] = useState(0);
  const mounted = useRef(false);
  const epoch = useRef(0);
  const pending = useRef(false);
  const copyLock = useRef(false);
  const baseline = useRef<Map<string, boolean> | null>(null);
  const selected = useRef("");
  const ready =
    snapshot.state === "ready" &&
    !!snapshot.networkId &&
    !!snapshot.principalId;
  useLayoutEffect(() => {
    selected.current = targetId;
  }, [targetId]);
  useLayoutEffect(() => {
    const epochs = epoch;
    mounted.current = true;
    return () => {
      mounted.current = false;
      epochs.current++;
    };
  }, [connectionId]);
  const valid = useCallback(
    () =>
      mounted.current &&
      ready &&
      snapshot.authGeneration === currentNetworkGeneration(connectionId),
    [ready, connectionId, snapshot.authGeneration],
  );
  const scopedDevices = useCallback(
    (directory: Directory<NetworkDevice>) =>
      directory.items.every(
        (item) =>
          item.networkId === snapshot.networkId &&
          item.principalId === snapshot.principalId,
      ),
    [snapshot.networkId, snapshot.principalId],
  );
  useEffect(() => {
    let active = true;
    setLoadState("loading");
    setInstaller(null);
    if (!ready) {
      setLoadState("error");
      return;
    }
    void hostInstallerInfo(connectionId, snapshot.authGeneration).then(
      (info) => {
        if (!active) return;
        if (!valid()) {
          setLoadState("error");
          return;
        }
        setInstaller(info);
        setLoadState("done");
      },
      () => {
        if (active) setLoadState("error");
      },
    );
    return () => {
      active = false;
    };
    // Auth/network/state changes are keyed by the parent; catalogue revisions do not restart enrollment.
  }, [
    connectionId,
    snapshot.authGeneration,
    snapshot.networkId,
    snapshot.principalId,
    snapshot.state,
    ready,
    loadRevision,
    valid,
  ]);

  useEffect(() => {
    if (run === 0) return;
    const epochs = epoch;
    const token = ++epochs.current;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    const live = () => !stopped && epoch.current === token && valid();
    const deadline = setTimeout(() => {
      if (stopped || epoch.current !== token || !mounted.current) return;
      stopped = true;
      if (timer) clearTimeout(timer);
      setStatus(valid() ? "timeout" : "invalid");
    }, HOST_POLL_TIMEOUT);
    async function poll() {
      if (!live()) {
        if (!stopped && mounted.current) setStatus("invalid");
        return;
      }
      if (pending.current) return;
      pending.current = true;
      setReading(true);
      const [devices, callable] = await Promise.allSettled([
        allNetworkDevices(connectionId),
        allCallableAgents(snapshot.networkId!, connectionId),
      ]);
      pending.current = false;
      if (mounted.current) setReading(false);
      if (!live()) {
        if (!stopped && mounted.current && epoch.current === token)
          setStatus("invalid");
        return;
      }
      const directory =
        devices.status === "fulfilled" && scopedDevices(devices.value)
          ? devices.value
          : null;
      const callableDirectory =
        callable.status === "fulfilled" &&
        callable.value.items.every(
          (item) => item.source.networkId === snapshot.networkId,
        )
          ? callable.value
          : null;
      setObservation({ devices: directory, callable: callableDirectory });
      let target = selected.current;
      if (!target && directory?.complete && baseline.current) {
        const candidates = directory.items.filter(
          (item) =>
            item.deviceId !== localDeviceId &&
            item.joined &&
            item.connectionState === "ready" &&
            baseline.current!.get(item.deviceId) !== true,
        );
        if (candidates.length === 1) {
          target = candidates[0].deviceId;
          selected.current = target;
          setTargetId(target);
        }
      }
      const device = directory?.items.find((item) => item.deviceId === target);
      if (device?.joined && device.connectionState === "ready") {
        clearTimeout(deadline);
        setStatus("idle");
        return;
      }
      setStatus(directory ? "polling" : "error");
      timer = setTimeout(() => void poll(), HOST_POLL_INTERVAL);
    }
    void poll();
    return () => {
      stopped = true;
      clearTimeout(deadline);
      if (timer) clearTimeout(timer);
      epochs.current++;
    };
  }, [
    run,
    connectionId,
    snapshot.networkId,
    snapshot.principalId,
    snapshot.authGeneration,
    snapshot.state,
    localDeviceId,
    ready,
    valid,
    scopedDevices,
  ]);

  async function copyCommand() {
    if (
      !valid() ||
      copyLock.current ||
      pending.current ||
      installer?.status !== "available" ||
      !installer.command
    )
      return;
    copyLock.current = true;
    setCopying(true);
    setCopyFailed(false);
    const token = epoch.current;
    try {
      // A complete pre-install directory prevents an existing online Host from being mistaken for this installation.
      // Directory failures disable automatic identification but must not prevent installation.
      const before = await allNetworkDevices(connectionId).catch(() => null);
      if (!valid() || token !== epoch.current) return;
      baseline.current =
        before?.complete && scopedDevices(before)
          ? new Map(
              before.items.map((item) => [
                item.deviceId,
                item.joined && item.connectionState === "ready",
              ]),
            )
          : null;
      await copyPlainText(installer.command);
      if (!valid() || token !== epoch.current) return;
      setObservation(null);
      selected.current = "";
      setTargetId("");
      setPhase("waiting");
      setStatus("polling");
      setRun((value) => value + 1);
    } catch {
      if (valid() && token === epoch.current) setCopyFailed(true);
    } finally {
      copyLock.current = false;
      if (mounted.current) setCopying(false);
    }
  }
  const devices = observation?.devices?.items ?? [];
  const device = devices.find((item) => item.deviceId === targetId);
  const online =
    status !== "invalid" &&
    status !== "timeout" &&
    !!device?.joined &&
    device.connectionState === "ready";
  const callableCount =
    observation?.callable?.items.filter((item) => item.deviceId === targetId)
      .length ?? 0;
  const execution = !online
    ? text("unknown")
    : targetId === localDeviceId
      ? text("localExecution")
      : !observation?.callable
        ? text("unavailable")
        : callableCount
          ? text("callable", { count: callableCount })
          : observation.callable.complete
            ? text("noAgent")
            : text("partial");
  const finish = (manage: boolean) => {
    if (valid() && online && device) {
      if (manage) onManage(device);
      else onClose();
    } else setStatus("invalid");
  };
  return (
    <>
      <ol
        aria-label={text("linuxSteps")}
        className="grid grid-cols-2 gap-2 border-y border-[var(--line-subtle)] bg-[var(--paper-inset)] px-5 py-3 text-xs sm:px-6"
      >
        {["command", "waiting"].map((value, index) => (
          <li
            key={value}
            aria-current={phase === value ? "step" : undefined}
            className={
              phase === value
                ? "font-semibold text-[var(--accent)]"
                : "text-[var(--ink-muted)]"
            }
          >
            {index + 1}.{" "}
            {text(
              value === "command" ? "linuxCommandStep" : "linuxWaitingStep",
            )}
          </li>
        ))}
      </ol>
      <div className="min-h-0 min-w-0 overflow-y-auto px-5 py-5 text-sm leading-relaxed sm:px-6">
        <div className="space-y-4">
          <h3 className="font-semibold">
            {text(
              phase === "command" ? "linuxCommandTitle" : "linuxWaitingTitle",
            )}
          </h3>
          <p className="text-[var(--ink-muted)]">{text("linuxRequirements")}</p>
          <div className="break-words rounded-xl border border-[var(--line)] p-3">
            <p className="text-xs text-[var(--ink-muted)]">{text("network")}</p>
            <p className="mt-1 font-semibold">
              {networkName || text("official")}
            </p>
          </div>
          {phase === "command" ? (
            <>
              {loadState === "loading" && (
                <p role="status">{text("linuxLoading")}</p>
              )}
              {(loadState === "error" || !ready) && (
                <p role="alert">{text("linuxLoadError")}</p>
              )}
              {loadState === "done" && installer?.status === "unavailable" && (
                <p role="status">{text("linuxInstallerUnavailable")}</p>
              )}
              {installer?.status === "available" && installer.command && (
                <>
                  <p className="text-[var(--ink-muted)]">
                    {text("linuxCommandBody")}
                  </p>
                  <pre
                    aria-label={text("linuxCommandStep")}
                    className="max-w-full overflow-x-auto rounded-xl bg-[var(--paper-inset)] p-3 text-xs"
                  >
                    <code>{installer.command}</code>
                  </pre>
                  <button
                    type="button"
                    className={primaryClass}
                    disabled={copying || !ready}
                    onClick={() => void copyCommand()}
                  >
                    {text(copying ? "linuxPreparing" : "copy")}
                  </button>
                </>
              )}
              {loadState !== "loading" && installer?.status !== "available" && (
                <button
                  type="button"
                  className={buttonClass}
                  onClick={() => setLoadRevision((value) => value + 1)}
                >
                  {text("linuxRetry")}
                </button>
              )}
            </>
          ) : (
            <>
              <p className="text-[var(--ink-muted)]">
                {text("linuxWaitingBody")}
              </p>
              <p
                role={
                  status === "timeout" ||
                  status === "error" ||
                  status === "invalid"
                    ? "alert"
                    : "status"
                }
              >
                {text(
                  status === "timeout"
                    ? "linuxTimeout"
                    : status === "error"
                      ? "linuxPollError"
                      : status === "invalid"
                        ? "linuxScopeChanged"
                        : online
                          ? "linuxConnected"
                          : "linuxPolling",
                )}
              </p>
              <CustomSelect
                ariaLabel={text("select")}
                value={targetId}
                placeholder={text("choose")}
                disabled={!devices.length || status === "invalid"}
                options={devices.map((item) => ({
                  value: item.deviceId,
                  label: `${item.name} · ${item.deviceId}`,
                }))}
                onChange={(value) => {
                  selected.current = value;
                  setTargetId(value);
                  if (status === "idle") {
                    setStatus("polling");
                    setRun((previous) => previous + 1);
                  }
                }}
                size="md"
              />
              <p className="text-xs text-[var(--ink-muted)]">
                {text("linuxSelectionHint")}
              </p>
              <dl aria-live="polite" className="grid gap-3 sm:grid-cols-2">
                {[
                  [
                    "online",
                    online
                      ? text("onlineYes")
                      : device
                        ? text(
                            device.joined
                              ? device.connectionState === "syncing"
                                ? "syncing"
                                : "offline"
                              : "notJoined",
                          )
                        : text("unselected"),
                  ],
                  ["execution", execution],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    className="rounded-xl border border-[var(--line)] p-4"
                  >
                    <dt className="text-xs text-[var(--ink-muted)]">
                      {text(label)}
                    </dt>
                    <dd className="mt-2 font-semibold">{value}</dd>
                  </div>
                ))}
              </dl>
              {observation?.devices && !observation.devices.complete && (
                <p>{text("partial")}</p>
              )}
              <p className="text-[var(--ink-muted)]">{text("executionHint")}</p>
              {(status === "timeout" || status === "error") && (
                <button
                  type="button"
                  className={buttonClass}
                  disabled={reading}
                  onClick={() => {
                    if (valid() && !pending.current) {
                      setObservation(null);
                      setStatus("polling");
                      setRun((value) => value + 1);
                    }
                  }}
                >
                  {text("linuxRetry")}
                </button>
              )}
              <button
                type="button"
                className={buttonClass}
                disabled={!online}
                onClick={() => finish(true)}
              >
                {text("manage")}
              </button>
            </>
          )}
          {copyFailed && (
            <p role="alert" className="text-[var(--error)]">
              {text("linuxCopyFailed")}
            </p>
          )}
        </div>
      </div>
      <footer className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-[var(--line-subtle)] px-5 py-4 sm:px-6">
        <button type="button" className={buttonClass} onClick={onBack}>
          {text("back")}
        </button>
        {phase === "waiting" && (
          <button
            type="button"
            className={primaryClass}
            disabled={!online}
            onClick={() => finish(false)}
          >
            {text("done")}
          </button>
        )}
      </footer>
    </>
  );
}
