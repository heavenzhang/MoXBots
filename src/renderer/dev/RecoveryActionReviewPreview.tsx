import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../i18n';
import '../index.css';
import { ThemeRuntimeProvider } from '../theme';
import { RecoveryActionReview } from '../components/RecoveryActionReview';
import BashTool from '../components/tools/BashTool';
import BlockGroup from '../components/BlockGroup';
import type { RecoveryActionSnapshot } from '../../shared/recoveryReconciliation';
import type { ToolUseSimple } from '../types/chat';

const initialSnapshot: RecoveryActionSnapshot = {
  sessionId: 'preview-session', sdkSessionId: 'preview-sdk', epoch: 1,
  reviewAuthority: 'preview-authority', ledgerDigest: 'preview-ledger', resolvedCount: 0,
  actions: [
    { actionHash: 'hook-denied-demo', tool: 'Bash', eligible: true, reason: 'native_hook_denied' },
    { actionHash: 'task-query-demo', tool: 'TaskGet', eligible: true, reason: 'builtin_task_query' },
    { actionHash: 'other-demo', tool: 'Other', eligible: false, reason: 'external_receipt_required' },
    { actionHash: 'missing-demo', tool: 'Other', eligible: false, reason: 'native_evidence_missing' },
  ],
};

function Preview() {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [scenario, setScenario] = useState<'blocked' | 'all-eligible'>(() =>
    new URLSearchParams(window.location.search).get('scenario') === 'eligible' ? 'all-eligible' : 'blocked');
  const [scenarioRevision, setScenarioRevision] = useState(0);
  const selectScenario = (value: 'blocked' | 'all-eligible') => {
    setSnapshot(initialSnapshot);
    setScenario(value);
    setScenarioRevision(revision => revision + 1);
  };
  const scenarioSnapshot = scenario === 'all-eligible'
    ? { ...snapshot, actions: snapshot.actions.filter(action => action.eligible) }
    : snapshot;
  const inspect = async () => scenarioSnapshot;
  const fixtureTool = (result: string, isError: boolean, exitCode?: number): ToolUseSimple => ({
    id: isError ? 'failed-bash' : 'successful-bash', name: 'Bash', input: { command: isError ? 'denied command' : 'printf ok' },
    result, isError, isLoading: false, resultMeta: { status: isError ? 'failed' : 'completed', ...(exitCode !== undefined ? { exitCode } : {}) }, streamIndex: 0,
  });
  const failedToolBlock = { type: 'tool_use', tool: {
    id: 'folded-hook-denial', name: 'Bash', input: { command: 'business action' },
    result: 'PreToolUse hook denied', isError: true, isLoading: false,
    resultMeta: { status: 'failed' }, streamIndex: 0,
  } } as const;
  const successfulToolBlock = { type: 'tool_use', tool: {
    id: 'folded-success', name: 'Bash', input: { command: 'printf ok' },
    result: 'ok', isError: false, isLoading: false,
    resultMeta: { status: 'completed', exitCode: 0 }, streamIndex: 0,
  } } as const;
  return <main className="min-h-screen bg-[var(--paper)] p-8 text-[var(--ink)]">
    <div className="mx-auto max-w-3xl rounded-xl border border-[var(--line)] bg-[var(--paper-raised)] p-5 shadow-sm">
      <h1 className="mb-1 text-lg font-semibold">Recovery action review</h1>
      <p className="mb-4 text-sm text-[var(--ink-muted)]">Synthetic preview data. Reconcile only updates this local preview.</p>
      <div className="mb-3 flex gap-2">
        <button className="rounded border px-3 py-1" onClick={() => selectScenario('blocked')}>Blocked evidence</button>
        <button className="rounded border px-3 py-1" onClick={() => selectScenario('all-eligible')}>All eligible</button>
      </div>
      <RecoveryActionReview
        sessionId="preview-session"
        disabled={false}
        inspectRevision={`preview:${scenario}:${scenarioRevision}`}
        inspect={inspect}
        reconcile={async request => {
          const next = { ...scenarioSnapshot, resolvedCount: scenarioSnapshot.resolvedCount + 1,
            actions: scenarioSnapshot.actions.filter(action => action.actionHash !== request.actionHash),
            ledgerDigest: `${scenarioSnapshot.ledgerDigest}-next` };
          setSnapshot(next);
          return next;
        }}
      />
      <section className="mt-6 grid gap-3 md:grid-cols-2" aria-label="Tool error and success status comparison">
        <div><h2 className="mb-2 text-sm font-semibold">Native hook denial · not executed</h2><BashTool tool={fixtureTool('PreToolUse hook denied', true)} /></div>
        <div><h2 className="mb-2 text-sm font-semibold">Successful Bash</h2><BashTool tool={fixtureTool('ok', false, 0)} /></div>
      </section>
      <section className="mt-6 rounded-lg border border-[var(--line)] p-3" aria-label="Collapsed ProcessRow status comparison">
        <h2 className="mb-2 text-sm font-semibold">Collapsed process rows</h2>
        <BlockGroup blocks={[failedToolBlock]} />
        <BlockGroup blocks={[successfulToolBlock]} />
      </section>
    </div>
  </main>;
}

createRoot(document.getElementById('root')!).render(
  <ThemeRuntimeProvider selection={{ themeId: 'myagents-default', appearanceMode: 'light' }}
    broadcastSelection={false} persistBootstrapSnapshot={false} syncNativeWindowBackground={false}>
    <Preview />
  </ThemeRuntimeProvider>,
);
