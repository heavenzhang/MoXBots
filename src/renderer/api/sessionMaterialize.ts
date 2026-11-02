import { parseProjectSpaceSelection, type ProjectSpaceSelection } from '../../shared/projectSpaces';
import type { SessionMetadata } from './sessionClient';
import type { SessionSnapshotPatch } from './persistInputOption';
import { sessionSidecarFetch, upgradeSessionId as defaultUpgradeSessionId } from './tauriClient';

/** A definite HTTP rejection differs from an acknowledgement lost in transit. */
export class MaterializeRequestError extends Error {
    constructor(message: string, public readonly definitive: boolean) { super(message); this.name = 'MaterializeRequestError'; }
}

/** Keep the original intent and exact identities available for reconciliation. */
export class SessionMaterializationError extends Error {
    constructor(message: string, public readonly outcome: 'failed' | 'unknown',
        public readonly pendingSessionId: string, public readonly preparedSessionId?: string,
        /** Last confirmed Rust key; a lost rekey ACK may have applied the target. */
        public readonly ownerSessionId: string = pendingSessionId) {
        super(message); this.name = 'SessionMaterializationError';
    }
}

export type MaterializePhase = 'prepare' | 'commit' | 'rollback';

export type MaterializeResponse = {
    success?: boolean;
    sessionId?: string;
    metadata?: SessionMetadata;
    error?: string;
};

export type MaterializePostBody = {
    workspacePath: string;
    phase: MaterializePhase;
    preparedSessionId?: string;
    snapshotPatch?: SessionSnapshotPatch;
    projectSpaceSelection?: ProjectSpaceSelection;
};

export type MaterializeTransport = {
    postCurrent: (body: MaterializePostBody) => Promise<MaterializeResponse>;
    postForSession?: (sessionId: string, body: MaterializePostBody) => Promise<MaterializeResponse>;
    upgradeSessionId?: (oldSessionId: string, newSessionId: string, tabId: string) => Promise<boolean>;
};

async function postMaterializeForSession(
    targetSessionId: string,
    tabId: string,
    body: MaterializePostBody,
): Promise<MaterializeResponse> {
    const response = await sessionSidecarFetch(
        targetSessionId,
        { type: 'tab', id: tabId },
        '/api/session/materialize',
        {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        },
    );
    const payload = await response.json().catch(() => ({})) as MaterializeResponse;
    if (!response.ok) {
        throw new MaterializeRequestError(payload.error ?? `Materialize request failed with HTTP ${response.status}.`, response.status < 500);
    }
    return payload;
}

export async function materializePendingSessionConfig(params: {
    pendingSessionId: string;
    tabId: string;
    workspacePath: string;
    snapshotPatch: SessionSnapshotPatch;
    /** Birth selection only; never part of the mutable Session snapshot patch. */
    projectSpaceSelection?: ProjectSpaceSelection;
    transport: MaterializeTransport;
}): Promise<{ sessionId: string; metadata: SessionMetadata }> {
    const postCurrent = params.transport.postCurrent;
    const postForSession = params.transport.postForSession
        ?? ((sessionId, body) => postMaterializeForSession(sessionId, params.tabId, body));
    const upgradeSessionId = params.transport.upgradeSessionId ?? defaultUpgradeSessionId;
    const projectSpaceSelection = params.projectSpaceSelection === undefined ? undefined : parseProjectSpaceSelection(params.projectSpaceSelection);
    const messageOf = (error: unknown) => error instanceof Error ? error.message : 'Session materialization failed';
    let prepare: MaterializeResponse;
    try {
        prepare = await postCurrent({
            workspacePath: params.workspacePath, phase: 'prepare', snapshotPatch: params.snapshotPatch,
            ...(projectSpaceSelection ? { projectSpaceSelection } : {}),
        });
    } catch (error) {
        throw new SessionMaterializationError(messageOf(error),
            error instanceof MaterializeRequestError && error.definitive ? 'failed' : 'unknown', params.pendingSessionId);
    }
    if (!prepare?.success || !prepare.sessionId || !prepare.metadata) {
        throw new SessionMaterializationError(prepare?.error ?? 'Failed to prepare pending session materialization.',
            prepare?.success === false ? 'failed' : 'unknown', params.pendingSessionId, prepare?.sessionId);
    }

    const preparedSessionId = prepare.sessionId;
    let rustUpgraded = false;
    try {
        rustUpgraded = await upgradeSessionId(params.pendingSessionId, preparedSessionId, params.tabId);
    } catch (error) {
        // A rejected invocation cannot establish which Rust key is current.
        // Retain both identities; do not rollback or start a different birth.
        throw new SessionMaterializationError(messageOf(error), 'unknown', params.pendingSessionId, preparedSessionId);
    }
    if (!rustUpgraded) {
        const rollback = await postCurrent({ workspacePath: params.workspacePath, phase: 'rollback', preparedSessionId }).catch(() => null);
        throw new SessionMaterializationError(`Failed to upgrade sidecar session id ${params.pendingSessionId} -> ${preparedSessionId}.`,
            rollback?.success ? 'failed' : 'unknown', params.pendingSessionId, preparedSessionId);
    }

    let failure: unknown;
    try {
        const commit = await postForSession(preparedSessionId, { workspacePath: params.workspacePath, phase: 'commit', preparedSessionId });
        if (commit?.success && commit.sessionId && commit.metadata) return { sessionId: commit.sessionId, metadata: commit.metadata };
        failure = new Error(commit?.error ?? 'Failed to commit pending session materialization.');
    } catch (error) { failure = error; }

    const rollback = await postForSession(preparedSessionId, { workspacePath: params.workspacePath, phase: 'rollback', preparedSessionId })
        .catch(() => null);
    if (rollback?.success) {
        const reverted = await upgradeSessionId(preparedSessionId, params.pendingSessionId, params.tabId).catch(() => false);
        throw new SessionMaterializationError(messageOf(failure), reverted ? 'failed' : 'unknown',
            params.pendingSessionId, preparedSessionId, reverted ? params.pendingSessionId : preparedSessionId);
    }
    // Commit may have won before the acknowledgement was lost. Confirm with
    // the same owner and transaction, never with another prepare or a new ID.
    const confirmed = await postForSession(preparedSessionId, { workspacePath: params.workspacePath, phase: 'commit', preparedSessionId })
        .catch(() => null);
    if (confirmed?.success && confirmed.sessionId && confirmed.metadata) return { sessionId: confirmed.sessionId, metadata: confirmed.metadata };
    throw new SessionMaterializationError(messageOf(failure), 'unknown', params.pendingSessionId, preparedSessionId, preparedSessionId);
}
