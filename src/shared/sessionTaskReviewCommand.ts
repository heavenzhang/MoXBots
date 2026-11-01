import { APP_CLI_NAME } from './appProfile';
import type { SessionTaskAction } from './sessionTaskOrchestration';

/** Deliberately accepts only one direct CLI invocation, never a shell program. */
export function parseSessionTaskCommand(input: unknown,
): Record<string, unknown> | undefined {
  if (typeof input === 'string') { try { input = JSON.parse(input); } catch { return undefined; } }
  if (!input || typeof input !== 'object') return undefined;
  const value = input as Record<string, unknown>;
  const command = value.command ?? value.cmd;
  if (typeof command !== 'string') return undefined;
  const tokens: string[] = [];
  let token = '', quote = '', begun = false;
  for (let i = 0; i < command.length; i++) {
    const c = command[i];
    if (quote === "'") { if (c === "'") quote = ''; else token += c; continue; }
    if (c === '\\') { if (++i >= command.length) return undefined; token += command[i]; begun = true; continue; }
    if (quote === '"') { if (c === '"') quote = ''; else if (c === '$' || c === '`') return undefined; else token += c; continue; }
    if (c === "'" || c === '"') { quote = c; begun = true; continue; }
    if (/[;|&<>()\r\n#$`]/.test(c)) return undefined;
    if (/\s/.test(c)) { if (begun) { tokens.push(token); token = ''; begun = false; } }
    else { token += c; begun = true; }
  }
  if (quote) return undefined;
  if (begun) tokens.push(token);
  const executable = tokens[0]?.split(/[\\/]/).at(-1);
  if (![APP_CLI_NAME, `${APP_CLI_NAME}.cmd`].includes(executable ?? '') || tokens[1] !== 'session' || tokens[2] !== 'tasks') return undefined;
  let data: unknown;
  for (let i = 3; i < tokens.length; i++) {
    if (tokens[i] === '--json') continue;
    if (tokens[i] !== '--data' || data !== undefined || !tokens[i + 1]) return undefined;
    try { data = JSON.parse(tokens[++i]); } catch { return undefined; }
  }
  if (data === undefined) return { kind: "list" };
  if (!data || typeof data !== 'object' || Array.isArray(data)) return undefined;
  return data as Record<string, unknown>;
}

/** Only the product CLI's foreground list operation may refresh a completed read.
 * This is not a general shell safety classifier or historical settlement proof.
 */
export function isDirectSessionTaskListCommand(input: unknown): boolean {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return false;
  const value = input as Record<string, unknown>;
  if (Object.keys(value).some(key => !['command', 'description', 'timeout', 'run_in_background'].includes(key))
    || typeof value.command !== 'string'
    || (value.description !== undefined && typeof value.description !== 'string')
    || (value.timeout !== undefined && (typeof value.timeout !== 'number' || !Number.isFinite(value.timeout) || value.timeout <= 0))
    || (value.run_in_background !== undefined && value.run_in_background !== false)) return false;
  // Bare product CLI only: the broader bookkeeping parser also accepts paths,
  // but an arbitrary same-basename executable cannot grant replay admission.
  const executable = value.command.trim().split(/\s/, 1)[0];
  if (executable !== APP_CLI_NAME && executable !== `${APP_CLI_NAME}.cmd`) return false;
  const action = parseSessionTaskCommand(value);
  return action?.kind === 'list' && Object.keys(action).length === 1;
}

export function parseTaskReviewCommand(
  input: unknown,
): Extract<SessionTaskAction, { kind: 'review' }> | undefined {
  const data = parseSessionTaskCommand(input);
  if (!data) return undefined;
  const action = data as Extract<SessionTaskAction, { kind: 'review' }>;
  if (action.kind !== 'review' || typeof action.taskId !== 'string' || typeof action.attemptId !== 'string'
    || !['accept', 'reject'].includes(action.decision) || typeof action.evidence !== 'string'
    || !Number.isSafeInteger(action.expectedRevision) || action.expectedRevision < 0
    || Object.keys(action).some(key => !['kind', 'taskId', 'attemptId', 'decision', 'evidence', 'expectedRevision'].includes(key))) return undefined;
  return action;
}

export function sameTaskReview(a: Extract<SessionTaskAction, { kind: 'review' }>, b: Extract<SessionTaskAction, { kind: 'review' }>): boolean {
  return a.taskId === b.taskId && a.attemptId === b.attemptId && a.decision === b.decision && a.evidence === b.evidence && a.expectedRevision === b.expectedRevision;
}
