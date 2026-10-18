// React hook for managing auto-updates (silent background updates)
//
// Flow:
// 1. Rust checks and downloads updates silently on startup
// 2. When ready, Rust emits 'updater:ready-to-restart' event
// 3. This hook receives the event and sets updateReady = true
// 4. UI shows "Restart to Update" button in titlebar
// 5. User clicks → restartAndUpdate() → app restarts with new version

import { useCallback, useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listenWithCleanup } from '@/utils/tauriListen';
import { relaunch } from '@tauri-apps/plugin-process';

import { track } from '@/analytics';
import { isTauriEnvironment } from '@/utils/browserMock';
import { isDebugMode } from '@/utils/debug';
import { isLinuxDesktop } from '@/utils/desktopPlatform';
import { getPlatform } from '@/identity/deviceIdentity';
import { IDLE_UPDATER_DOWNLOAD, parseUpdaterDownloadState, type UpdaterDownloadState } from '../../shared/updaterDownload';

export interface UpdateReadyInfo {
    version: string;
}

/** Result of a manual update check, used by caller for user-facing feedback (toast) */
export type CheckUpdateResult = 'up-to-date' | 'downloading' | 'error';

/** Result of restartAndUpdate, used by caller to show an error toast. 'ok' means
 *  install actually started (process is about to exit) — the renderer just won't
 *  see the resolution because Rust calls exit(0). */
export type RestartUpdateResult = 'ok' | 'network-error' | 'version-mismatch' | 'blocked' | 'busy' | 'activity-unknown' | 'signature-error' | 'error';

interface UseUpdaterResult {
    /** Whether an update has been downloaded and is ready to install */
    updateReady: boolean;
    /** The version that's ready to install */
    updateVersion: string | null;
    /** Restart the app to apply the update. Returns the outcome so the caller
     *  can surface a toast for failure modes. */
    restartAndUpdate: (options?: { interruptWork: boolean }) => Promise<RestartUpdateResult>;
    /** Whether a manual check is in progress */
    checking: boolean;
    /** Whether an update is being downloaded */
    downloading: boolean;
    /** Whether an install is currently in flight (button click → install start) */
    installing: boolean;
    /** Whether a silent download is currently writing the next pending package
     *  to disk. Mutually exclusive with the install button: while preparing,
     *  the button hides because the version it claims to be "ready" may be
     *  about to be replaced (or, on first-time download, isn't on disk yet). */
    preparing: boolean;
    downloadState: UpdaterDownloadState;
    /** Manually trigger an update check. Returns result for caller to show toast feedback. */
    checkForUpdate: () => Promise<CheckUpdateResult>;
    /** Version of a pending update discovered on startup (Windows/macOS, from disk) */
    pendingUpdateOnStartup: string | null;
    /** Dismiss the startup pending update dialog (keeps "Restart to Update" button visible) */
    dismissPendingUpdate: () => void;
}

// Windows and macOS defer installation until the user's explicit restart action.
const usesDeferredInstall = (): boolean => /^(darwin|windows)-/.test(getPlatform());

// Periodic check interval: 30 minutes
const CHECK_INTERVAL_MS = 30 * 60 * 1000;

export function useUpdater(): UseUpdaterResult {
    const [updateReady, setUpdateReady] = useState(false);
    const [updateVersion, setUpdateVersion] = useState<string | null>(null);
    const [checking, setChecking] = useState(false);
    const [downloadState, setDownloadState] = useState<UpdaterDownloadState>(IDLE_UPDATER_DOWNLOAD);
    const downloading = downloadState.phase === 'downloading' || downloadState.phase === 'retrying';
    const [installing, setInstalling] = useState(false);
    const [preparing, setPreparing] = useState(false);
    // Windows/macOS: version from disk-persisted pending update (shown as startup dialog)
    const [pendingUpdateOnStartup, setPendingUpdateOnStartup] = useState<string | null>(null);
    const intervalRef = useRef<NodeJS.Timeout | null>(null);
    const updateReadyRef = useRef(false);
    // Ref guards for checkForUpdate to prevent race conditions on rapid clicks.
    // State values in a useCallback closure can be stale; refs are always current.
    const checkingRef = useRef(false);
    const installingRef = useRef(false);
    const downloadStateRef = useRef(downloadState);
    const retryInFlightRef = useRef(false);

    const applyDownloadState = useCallback((value: unknown) => {
        const next = parseUpdaterDownloadState(value);
        if (!next || next.revision < downloadStateRef.current.revision) return;
        downloadStateRef.current = next;
        setDownloadState(next);
        setChecking(next.phase === 'checking');
        setPreparing(next.phase === 'checking' || next.phase === 'downloading' || next.phase === 'retrying');
        if (next.version) setUpdateVersion(next.version);
        if (next.phase === 'ready' && next.version) {
            setUpdateVersion(next.version);
            setUpdateReady(true);
        }
    }, []);

    // Keep ref in sync with state
    useEffect(() => {
        updateReadyRef.current = updateReady;
    }, [updateReady]);

    // Trigger the updater, then read its authoritative snapshot for the UI.
    const checkForUpdate = useCallback(async (): Promise<CheckUpdateResult> => {
        if (isLinuxDesktop()) return 'error'; // deb upgrades are installed manually.
        if (!isTauriEnvironment()) {
            console.warn('[useUpdater] Manual check not available outside Tauri');
            return 'error';
        }
        // Use refs for guards — immune to stale closure on rapid clicks
        if (updateReadyRef.current) return 'downloading';
        if (checkingRef.current || retryInFlightRef.current) return 'downloading';

        checkingRef.current = true;
        setChecking(true);
        try {
            retryInFlightRef.current = true;
            await invoke('check_and_download_update');
            const snapshot = await invoke('get_update_download_state');
            const state = parseUpdaterDownloadState(snapshot);
            if (!state) return 'error';
            applyDownloadState(state);
            const phase = state.phase;
            if (phase === 'failed') return 'error';
            if (phase === 'idle') return 'up-to-date';
            return 'downloading';
        } catch (err) {
            console.error('[useUpdater] Manual check failed:', err);
            try {
                const snapshot = await invoke('get_update_download_state');
                if (parseUpdaterDownloadState(snapshot)) applyDownloadState(snapshot);
                else if (downloadStateRef.current.phase === 'checking') {
                    const idle = { ...downloadStateRef.current, phase: 'idle' as const };
                    downloadStateRef.current = idle;
                    setDownloadState(idle);
                    setPreparing(false);
                }
            } catch {
                if (downloadStateRef.current.phase === 'checking') {
                    const idle = { ...downloadStateRef.current, phase: 'idle' as const };
                    downloadStateRef.current = idle;
                    setDownloadState(idle);
                    setPreparing(false);
                }
            }
            return 'error';
        } finally {
            checkingRef.current = false;
            retryInFlightRef.current = false;
            setChecking(false);
        }
    }, [applyDownloadState]);

    // Dismiss the startup pending update dialog (keeps "Restart to Update" button visible)
    const dismissPendingUpdate = useCallback(() => {
        setPendingUpdateOnStartup(null);
    }, []);

    // Restart app to apply the update.
    //
    // Returns the outcome so callers can show user feedback (toast).
    // On success the renderer never meaningfully resumes — Windows exits via
    // NSIS and macOS requests a managed restart immediately after install.
    //
    // Important: on Windows we no longer call cmd_shutdown_for_update from
    // here. The Rust install_pending_update handles shutdown internally,
    // AFTER it has resolved a usable Update object. Pre-killing the user's
    // sidecars and then failing the install (e.g., flaky network) was the
    // root cause of the "click does nothing" reports — the user was left in
    // a broken state with the install never actually starting.
    const restartAndUpdate = useCallback(async (options?: { interruptWork: boolean }): Promise<RestartUpdateResult> => {
        if (isLinuxDesktop()) return 'blocked';
        if (!isTauriEnvironment()) return 'error';
        if (installingRef.current) return 'ok';  // already in flight

        // Track update_install event before restarting
        if (updateVersion) {
            track('update_install', { version: updateVersion });
        } else {
            track('update_install');
        }

        installingRef.current = true;
        setInstalling(true);

        // Windows/macOS install verified bytes persisted during the background
        // download. macOS must not replace the live .app before this explicit
        // action: TCC cannot prompt a process whose executable was unlinked.
        if (usesDeferredInstall()) {
            try {
                if (options?.interruptWork === true) {
                    await invoke('install_pending_update', { interruptWork: true });
                } else {
                    await invoke('install_pending_update');
                }
                // Windows exits via NSIS; macOS immediately requests restart.
                return 'ok';
            } catch (err) {
                const errStr = String(err);
                installingRef.current = false;
                setInstalling(false);
                if (errStr.includes('UPDATE_BUSY')) return 'busy';
                if (errStr.includes('UPDATE_ACTIVITY_UNKNOWN')) return 'activity-unknown';
                if (errStr.includes('UPDATE_SIGNATURE_INVALID')) {
                    setUpdateReady(false);
                    setUpdateVersion(null);
                    setPendingUpdateOnStartup(null);
                    return 'signature-error';
                }
                if (errStr.includes('VERSION_MISMATCH')) {
                    console.warn('[useUpdater] Pending update version mismatch, will re-download');
                    setUpdateReady(false);
                    setUpdateVersion(null);
                    setPendingUpdateOnStartup(null);
                    // Trigger a fresh download (silent — toast tells user what's up)
                    void invoke('check_and_download_update');
                    return 'version-mismatch';
                }
                if (errStr.includes('NETWORK_ERROR')) {
                    // Network was unreachable for all retries. Keep the
                    // update-ready state so the user can retry once online.
                    console.warn('[useUpdater] Network required to verify update, will retry when online');
                    return 'network-error';
                }
                if (
                    errStr.includes('UPDATE_PROCESSES_STILL_RUNNING')
                    || errStr.includes('UPDATE_FILES_STILL_LOCKED')
                    || errStr.includes('UPDATE_LOCK_PROBE_UNAVAILABLE')
                    || errStr.includes('UPDATE_TERMINALS_STILL_RUNNING')
                    || errStr.includes('UPDATE_WORKER_STILL_RUNNING')
                    || errStr.includes('UPDATE_SHUTDOWN_IN_PROGRESS')
                    || errStr.includes('UPDATE_SHUTDOWN_ALREADY_IN_PROGRESS')
                ) {
                    console.warn('[useUpdater] Update install blocked until background processes exit:', err);
                    return 'blocked';
                }
                console.error('[useUpdater] install_pending_update failed:', err);
                return 'error';
            }
        }

        // Legacy non-deferred packages relaunch after installation. Ubuntu deb
        // is rejected above and must never enter this path.
        try {
            await invoke('cmd_shutdown_for_update');
        } catch (err) {
            console.warn('[useUpdater] Pre-restart cleanup failed:', err);
        }
        try {
            await relaunch();
            return 'ok';
        } catch (err) {
            console.error('[useUpdater] Restart failed:', err);
            try {
                await invoke('restart_app');
                return 'ok';
            } catch (e) {
                console.error('[useUpdater] Rust restart also failed:', e);
                installingRef.current = false;
                setInstalling(false);
                return 'error';
            }
        }
    }, [updateVersion]);

    // Listen for update ready event from Rust
    useEffect(() => {
        if (!isTauriEnvironment() || isLinuxDesktop()) {
            if (isDebugMode()) {
                console.log('[useUpdater] Not in Tauri environment, skipping event listener setup');
            }
            return;
        }

        if (isDebugMode()) {
            console.log('[useUpdater] Setting up event listener for updater:ready-to-restart...');
        }
        const ac = new AbortController();

        const subscriptions = [listenWithCleanup<UpdateReadyInfo>('updater:ready-to-restart', (event) => {
            if (isDebugMode()) {
                console.log('[useUpdater] Event received: updater:ready-to-restart', event.payload);
            }
            setUpdateVersion(event.payload.version);
            setUpdateReady(true);
        }, ac.signal),

        // `download-started` hides the install button: the bytes that
        // would back a click are mid-replacement, so the click target
        // is briefly inconsistent. Mirror via `download-failed` to
        // un-hide if the download couldn't commit.
        listenWithCleanup<UpdateReadyInfo>('updater:download-started', (event) => {
            if (isDebugMode()) {
                console.log('[useUpdater] Event received: updater:download-started', event.payload);
            }
            if (downloadStateRef.current.revision < 0) setPreparing(true);
        }, ac.signal),

        listenWithCleanup<UpdateReadyInfo>('updater:download-failed', (event) => {
            if (isDebugMode()) {
                console.log('[useUpdater] Event received: updater:download-failed', event.payload);
            }
            if (downloadStateRef.current.revision < 0) setPreparing(false);
        }, ac.signal),

        listenWithCleanup<UpdaterDownloadState>('updater:download-state', (event) => {
            applyDownloadState(event.payload);
        }, ac.signal)];
        // Subscribe first, then hydrate. Revision fencing prevents an older
        // snapshot response from overwriting an event delivered in between.
        void Promise.all(subscriptions).then(() => {
            if (ac.signal.aborted) return null;
            return invoke('get_update_download_state');
        }).then(value => { if (!ac.signal.aborted) applyDownloadState(value); }).catch((error) => {
            console.warn('[useUpdater] Unable to hydrate download state:', error);
        });

        return () => ac.abort();
    }, [applyDownloadState]);

    // Windows/macOS: check for a pending update on disk at startup
    // If found, show a dialog prompting the user to install it
    useEffect(() => {
        if (!isTauriEnvironment() || isLinuxDesktop() || !usesDeferredInstall()) return;

        const checkPending = async () => {
            try {
                const version = await invoke('check_pending_update') as string | null;
                if (version) {
                    if (isDebugMode()) {
                        console.log(`[useUpdater] Found pending update v${version} on disk`);
                    }
                    setPendingUpdateOnStartup(version);
                    setUpdateVersion(version);
                    setUpdateReady(true);
                }
            } catch (err) {
                console.error('[useUpdater] Failed to check pending update:', err);
            }
        };

        void checkPending();
    }, []);

    // Periodic background check (silent - just triggers Rust to check and download)
    // Uses ref to avoid recreating interval when updateReady changes
    useEffect(() => {
        if (!isTauriEnvironment() || isLinuxDesktop()) return;

        const doCheck = async () => {
            // Always check — even if an update is already ready.
            // The Rust backend tracks the downloaded version and only re-downloads
            // if the server has something NEWER (latest-wins protocol).
            // This ensures v0.1.61 replaces a cached v0.1.60 seamlessly.
            try {
                await invoke('check_and_download_update');
                // Track update_check event only after successful check
                track('update_check');
            } catch (err) {
                // Packaged debug builds are deliberately disabled by Rust
                // even when renderer debug logging is off.
                if (err === 'UPDATER_DISABLED_IN_DEVELOPMENT') return;
                // Silent failure - don't bother user
                console.error('[useUpdater] Periodic check failed:', err);
            }
        };

        intervalRef.current = setInterval(() => {
            void doCheck();
        }, CHECK_INTERVAL_MS);

        return () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
        };
    }, []); // One interval per enabled app profile

    return {
        updateReady,
        updateVersion,
        restartAndUpdate,
        checking,
        downloading,
        installing,
        preparing,
        downloadState,
        checkForUpdate,
        pendingUpdateOnStartup,
        dismissPendingUpdate,
    };
}
