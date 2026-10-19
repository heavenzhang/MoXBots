/**
 * progress-convergence.ts — bounded per-turn execution progress check.
 *
 * Why this exists: a long execution turn can keep reading the same code and
 * repeatedly announce that it is about to start editing, without ever emitting
 * an edit/write tool. The client cannot treat elapsed time or a raw tool count
 * as a deadlock: read-only research, broad investigation, builds/tests and
 * approval waits are all legitimate. This tracker therefore uses only
 * content-level, per-turn evidence:
 *
 *   - a stage declaration from the model ("开始改代码", "start editing"), or an
 *     execution intent in the turn text, or a self-confessed stall
 *     ("代码还没开始改");
 *   - overlapping re-reads of the same file after that declaration, measured
 *     against every range already read earlier in the turn (sequential chunks
 *     of one large file do NOT overlap; re-reading content the model lost to a
 *     context compaction DOES overlap);
 *   - a current streak of read-classified tools;
 *   - zero edit/write tool calls in the turn;
 *   - no verification command in the immediately preceding few tools.
 *
 * When all of those hold, the PostToolUse owner injects one short
 * `additionalContext` nudge (at most one per declaration, at most three per
 * turn). It never stops the turn, switches models, skips investigation,
 * replays a tool, or writes anything. The nudge explicitly tells the model to
 * ignore it when the task is read-only.
 *
 * This module is a leaf on purpose: it imports nothing from the runtime, so it
 * can be unit-tested with pure inputs and wired from any runtime owner.
 */

export type ToolKind = 'read' | 'edit' | 'verify' | 'interaction' | 'other';

export type ProgressConvergenceSnapshot = {
  toolOps: number;
  readOps: number;
  editOps: number;
  verifyOps: number;
  declarations: number;
  hints: number;
  consecutiveReads: number;
  overlappingRereads: number;
  maxFileOverlaps: number;
  executionIntent: boolean;
  readOnlyTurn: boolean;
  waitingForUser: boolean;
};

export type ProgressConvergenceLimits = {
  /** One nudge per declared stage, capped per turn. */
  maxHintsPerTurn: number;
  /** Read-classified tools in the current uninterrupted streak. */
  minReadStreak: number;
  /** Overlapping re-read events after the latest declaration. */
  minOverlappingRereads: number;
  /** Overlapping re-reads concentrated on one file. */
  minFileOverlaps: number;
  /** Do not nudge immediately after a build/test/lint command. */
  minOpsSinceVerify: number;
};

const DEFAULT_LIMITS: ProgressConvergenceLimits = {
  maxHintsPerTurn: 3,
  minReadStreak: 4,
  minOverlappingRereads: 2,
  minFileOverlaps: 2,
  minOpsSinceVerify: 4,
};

/** Latest assistant text retained for declaration scanning. */
const MAX_ASSISTANT_TEXT = 64 * 1024;
/** Re-scan this much before the previous cursor so a phrase split across chunks is seen once. */
const DECLARATION_OVERLAP = 96;

const READ_TOOL_NAMES = new Set(['Read']);
const EDIT_TOOL_NAMES = new Set([
  'Write',
  'Edit',
  'MultiEdit',
  'NotebookEdit',
  'apply_patch',
]);
const INTERACTION_TOOL_NAMES = new Set([
  'AskUserQuestion',
  'ExitPlanMode',
  'EnterPlanMode',
]);

const SOURCE_EXTENSIONS = [
  'java', 'kt', 'kts', 'ts', 'tsx', 'mts', 'cts', 'js', 'jsx', 'mjs', 'cjs',
  'vue', 'py', 'go', 'rs', 'rb', 'php', 'cs', 'c', 'cc', 'cpp', 'h', 'hpp',
  'm', 'mm', 'swift', 'scala', 'sh', 'bash', 'zsh', 'sql', 'xml', 'json',
  'jsonc', 'yaml', 'yml', 'toml', 'ini', 'properties', 'gradle', 'md', 'html',
  'css', 'scss', 'less', 'sass', 'lua', 'pl', 'r', 'dart', 'ex', 'exs', 'erl',
  'hs', 'clj', 'fs', 'fsx',
].join('|');

const SOURCE_PATH_RE = new RegExp(
  `(?:[A-Za-z]:)?\\/?(?:\\.{0,2}\\/)?(?:[\\w.@%+\\-]+\\/)+[\\w.@%+\\-]+\\.(?:${SOURCE_EXTENSIONS})\\b`
    + `|\\b[\\w.@%+\\-]+\\.(?:${SOURCE_EXTENSIONS})\\b`,
  'gi',
);

const VERIFY_COMMAND_RE = new RegExp([
  '\\b(?:npm|pnpm|yarn|bun)\\s+(?:run\\s+)?(?:test|check|build|lint|typecheck|verify)\\b',
  '\\bvitest\\b',
  '\\bjest\\b',
  '\\bmocha\\b',
  '\\bpytest\\b',
  '\\bcargo\\s+(?:test|build|check|clippy)\\b',
  '\\bgo\\s+(?:test|build|vet)\\b',
  '\\bmvn\\b',
  '\\bgradlew?\\b',
  '\\bmake\\b',
  '\\btsc\\b',
  '\\beslint\\b',
  '\\bruff\\b',
  '\\bdotnet\\s+test\\b',
  '\\bflutter\\s+test\\b',
].join('|'), 'i');

const WRITE_COMMAND_RE = new RegExp([
  '\\bapply_patch\\b',
  '\\bgit\\s+(?:apply|commit|add|mv|rm|reset|restore|stash\\s+(?:push|pop|apply))\\b',
  '\\bgit\\s+checkout\\s+--\\b',
  '\\b(?:sed|perl|ruby)\\b[^\\n|;&]*\\s-[A-Za-z]*i[A-Za-z]*\\b',
  '(?:^|[\\s;&|])rm(?:\\s|$)',
  '(?:^|[\\s;&|])(?:mv|cp|mkdir|rmdir|touch|truncate|chmod|chown|ln)(?:\\s|$)',
  '(?:^|[\\s;&|])tee(?:\\s|$)',
  '\\b(?:npm|pnpm|yarn|bun)\\s+(?:install|add|remove|uninstall|link|ci)\\b',
  '\\bpip(?:3)?\\s+(?:install|uninstall)\\b',
  '\\b(?:curl|wget)\\b[^\\n]*\\s-[oO]\\s',
  '\\b(?:scp|rsync)\\b',
].join('|'));

const HARD_READ_ONLY_RE =
  /只读|不要(?:修改|改动|改|动)(?:代码|源码)?|禁止(?:修改|改动)|不得(?:修改|改动)|(?:不要|别)(?:改|动)(?:代码|源码)|read[- ]?only|do not (?:modify|change|edit|write)|without (?:modifying|changing|editing)|make no (?:code )?changes|no code changes/i;

const RESEARCH_ONLY_RE =
  /分析|诊断|排查|审查|审阅|研究|调研|根因|review|audit|investigat|diagnos|analyz|root cause|explain/i;

const EXECUTION_INTENT_RE =
  /修改|修复|实现|新增|添加|删除|重构|改造|接入|移植|补齐|完善|开发|编写|写代码|改代码|更新代码|\b(?:fix|implement|refactor|add|remove|update|change|patch|develop|build)\b/i;

/** "开始改代码" / "现在就动手" — a declared transition into editing. */
const ZH_STAGE_DECLARATION_SOURCE =
  '(?:开始|动手|这就|马上|现在|接下来|直接|准备)(?:开始)?(?:修改|改代码|改|实现|写代码|写实现|动手)|(?:进入|开始)\\s*(?:实现|编码|开发|落地)\\s*(?:阶段)?';
const EN_STAGE_DECLARATION_SOURCE =
  // The connector between the lead-in and the edit verb may not itself be a
  // negation: "I will not start editing" is a stall, not a declared stage.
  '\\b(?:i(?:\'ll| will)|let me|now|next|start(?:ing)?|begin(?:ning)?|proceed(?:ing)? to|moving on to)\\b(?:(?!\\b(?:not|never)\\b|n\'t\\b)[^.\\n]){0,60}\\b(?:edit|editing|implement|implementing|make the changes|write the code|start coding|fix the code)\\b';

/** "代码还没开始改" — the model itself reports that the edit stage is still unstarted. */
const ZH_STALL_SOURCE =
  '(?:还|仍|尚)?(?:没|没有|未|尚未)\\s*(?:开始)?\\s*(?:修改|改代码|改|实现|写代码|动手|编码)';
const EN_STALL_SOURCE =
  '\\b(?:have(?:n\'t| not)|has(?:n\'t| not)|not yet|still (?:have not|haven\'t))\\s+(?:started|begun)\\s+(?:editing|implementing|writing|making|the changes)\\b';

const NEGATION_RE = /(?:还没|尚未|没有|没|未|不再|not yet|haven't|have not|not)\s*$/i;

type ReadRange = { start: number; end: number | null };
type ReadSite = { key: string; range: ReadRange };

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/** Keep only the stable tail of a path so remote/local copies of one file agree. */
function normalizePathKey(path: string): string {
  const cleaned = path
    .replace(/^['"`]+|['"`]+$/g, '')
    .replace(/\\/g, '/');
  const parts = cleaned.split('/').filter(part => part.length > 0 && part !== '.');
  return parts.length > 0 ? parts.slice(-2).join('/') : cleaned;
}

function extractSourcePaths(text: string): string[] {
  const keys = new Set<string>();
  for (const match of text.matchAll(SOURCE_PATH_RE)) {
    const raw = match[0].replace(/[.,;:)\]}'"`]+$/g, '');
    if (raw) keys.add(normalizePathKey(raw));
  }
  return [...keys];
}

function looksLikeWrite(command: string): boolean {
  if (WRITE_COMMAND_RE.test(command)) return true;
  // Output redirection, but not fd plumbing such as 2>&1 / 2>/dev/null.
  return /(?:^|[^&\d])>{1,2}\s*[^\s&]/.test(command);
}

function readRangesFromBash(command: string): ReadRange[] {
  const ranges: ReadRange[] = [];
  // `sed -n '1,120p' file` / `sed -n '80p' file`. Pattern-only ranges are not
  // parsed: without known line numbers, two different searches would look like
  // a duplicate content read.
  const isSedRead = /\bsed\b[^\n|;&]*\s-[A-Za-z]*n[A-Za-z]*\b/.test(command)
    || /\bsed\s+-n\b/.test(command);
  if (isSedRead) {
    for (const match of command.matchAll(/(\d+)(?:,(\d+))?p\b/g)) {
      const start = Number(match[1]);
      const end = match[2] ? Number(match[2]) + 1 : start + 1;
      if (Number.isFinite(start) && Number.isFinite(end)) ranges.push({ start, end });
    }
    return ranges;
  }
  const head = /\bhead\s+(?:-n\s*)?(\d+)\b/.exec(command);
  if (head) {
    const count = Number(head[1]);
    if (Number.isFinite(count) && count > 0) ranges.push({ start: 1, end: count + 1 });
    return ranges;
  }
  // `cat` / `nl` / `git show ref:path` consume the whole file. `tail` is
  // deliberately ignored: repeatedly tailing a growing log is normal work.
  if (/\b(?:cat|nl)\b/.test(command) || /\bgit\s+show\s+[^\s:]+:/.test(command)) {
    ranges.push({ start: 1, end: null });
  }
  return ranges;
}

function rangesOverlap(left: ReadRange, right: ReadRange): boolean {
  if (left.end === null || right.end === null) return true;
  return left.start < right.end && right.start < left.end;
}

function readSites(name: string, input: unknown): ReadSite[] {
  const record = asRecord(input);
  if (!record) return [];
  if (READ_TOOL_NAMES.has(name)) {
    const file = stringValue(record.file_path) ?? stringValue(record.path);
    if (!file) return [];
    const offset = numberValue(record.offset) ?? 1;
    const limit = numberValue(record.limit) ?? 2000;
    return [{
      key: normalizePathKey(file),
      range: { start: Math.max(1, offset), end: Math.max(1, offset) + Math.max(1, limit) },
    }];
  }
  if (name === 'Bash') {
    const command = stringValue(record.command);
    if (!command || looksLikeWrite(command)) return [];
    const ranges = readRangesFromBash(command);
    if (ranges.length === 0) return [];
    const paths = extractSourcePaths(command);
    const sites: ReadSite[] = [];
    for (const key of paths) for (const range of ranges) sites.push({ key, range });
    return sites;
  }
  return [];
}

export function classifyTool(name: string, input: unknown): ToolKind {
  if (EDIT_TOOL_NAMES.has(name)) return 'edit';
  if (INTERACTION_TOOL_NAMES.has(name)) return 'interaction';
  if (name === 'Bash') {
    const command = stringValue(asRecord(input)?.command);
    if (!command) return 'other';
    if (looksLikeWrite(command)) return 'edit';
    if (VERIFY_COMMAND_RE.test(command)) return 'verify';
    return readRangesFromBash(command).length > 0 ? 'read' : 'other';
  }
  if (READ_TOOL_NAMES.has(name)) return 'read';
  return 'other';
}

type DeclarationMatch = { index: number; end: number };

function collectDeclarationMatches(window: string, source: string): DeclarationMatch[] {
  const matches: DeclarationMatch[] = [];
  const re = new RegExp(source, 'gi');
  for (const match of window.matchAll(re)) {
    const index = match.index ?? 0;
    matches.push({ index, end: index + match[0].length });
  }
  return matches;
}

function buildHint(input: {
  consecutiveReads: number;
  overlappingRereads: number;
  maxFileOverlaps: number;
}): string {
  return '[客户端进展检查，不是用户的新指令] '
    + `本轮已连续执行 ${input.consecutiveReads} 次只读/查看操作，同一文件出现 ${input.maxFileOverlaps} 次重叠区间的重复读取（你上次表态后累计 ${input.overlappingRereads} 次），`
    + '并且尚未出现任何编辑或写入调用；你此前已表示要开始修改。'
    + '若任务确实需要代码改动，请直接开始修改，或明确说明当前阻塞点；'
    + '如果这是只读研究任务，请忽略本提示。';
}

export class ProgressConvergenceTracker {
  private readonly limits: ProgressConvergenceLimits;
  private assistantText = '';
  private declarationScanOffset = 0;
  private declarationSeq = 0;
  private lastHintDeclarationSeq = 0;
  private turnTextSeen: string | undefined;
  private executionIntent = false;
  private readOnlyTurn = false;
  private waitingForUser = false;
  private toolOps = 0;
  private readOps = 0;
  private editOps = 0;
  private verifyOps = 0;
  private hints = 0;
  private consecutiveReads = 0;
  private opsSinceVerify = 0;
  private overlappingRereads = 0;
  /**
   * Every range read at any point in this turn. Deliberately NOT cleared on a
   * new stage declaration: re-reading a range after a context compaction is
   * the observed non-convergence pattern, and the ranges read before the
   * declaration are the evidence that makes it detectable.
   */
  private readonly readRanges = new Map<string, ReadRange[]>();
  /** Overlapping re-reads since the latest declaration, per file. */
  private readonly fileOverlapCounts = new Map<string, number>();

  constructor(limits: Partial<ProgressConvergenceLimits> = {}) {
    this.limits = { ...DEFAULT_LIMITS, ...limits };
  }

  reset(turnText?: string): void {
    this.assistantText = '';
    this.declarationScanOffset = 0;
    this.declarationSeq = 0;
    this.lastHintDeclarationSeq = 0;
    this.turnTextSeen = undefined;
    this.executionIntent = false;
    this.readOnlyTurn = false;
    this.waitingForUser = false;
    this.toolOps = 0;
    this.readOps = 0;
    this.editOps = 0;
    this.verifyOps = 0;
    this.hints = 0;
    this.consecutiveReads = 0;
    this.opsSinceVerify = 0;
    this.overlappingRereads = 0;
    this.readRanges.clear();
    this.fileOverlapCounts.clear();
    if (turnText !== undefined) this.applyTurnText(turnText);
  }

  /**
   * Observe the visible assistant text of the turn. Chunks are appended in
   * order; declarations split across chunks are detected once because the scan
   * cursor overlaps the previously scanned tail.
   */
  observeAssistantText(chunk: string): void {
    if (!chunk) return;
    this.assistantText = (this.assistantText + chunk).slice(-MAX_ASSISTANT_TEXT);
    this.scanDeclarations();
  }

  /**
   * Classify one completed tool call. Returns a hint only when every
   * content-level convergence signal holds. Subagent calls (`agentId` present)
   * are ignored: a worker's reads are not the main turn's progress.
   */
  observeTool(
    name: string,
    input: unknown,
    options: { agentId?: string; turnText?: string } = {},
  ): string | null {
    if (options.agentId) return null;
    this.applyTurnText(options.turnText);
    const kind = classifyTool(name, input);
    this.toolOps += 1;
    this.opsSinceVerify += 1;

    if (kind === 'interaction') {
      // Waiting for the user is not a loop; never nudge afterwards.
      this.waitingForUser = true;
      this.consecutiveReads = 0;
      return null;
    }
    if (kind === 'edit') {
      // An artifact was produced; convergence is no longer in question.
      this.editOps += 1;
      this.consecutiveReads = 0;
      return null;
    }
    if (kind === 'verify') {
      this.verifyOps += 1;
      this.opsSinceVerify = 0;
      this.consecutiveReads = 0;
      return null;
    }
    if (kind !== 'read') {
      this.consecutiveReads = 0;
      return null;
    }

    this.readOps += 1;
    this.consecutiveReads += 1;
    for (const site of readSites(name, input)) this.recordRead(site);
    return this.maybeHint();
  }

  snapshot(): ProgressConvergenceSnapshot {
    return {
      toolOps: this.toolOps,
      readOps: this.readOps,
      editOps: this.editOps,
      verifyOps: this.verifyOps,
      declarations: this.declarationSeq,
      hints: this.hints,
      consecutiveReads: this.consecutiveReads,
      overlappingRereads: this.overlappingRereads,
      maxFileOverlaps: Math.max(0, ...this.fileOverlapCounts.values()),
      executionIntent: this.executionIntent,
      readOnlyTurn: this.readOnlyTurn,
      waitingForUser: this.waitingForUser,
    };
  }

  private applyTurnText(turnText: string | undefined): void {
    if (turnText === undefined || turnText === this.turnTextSeen) return;
    this.turnTextSeen = turnText;
    const hardReadOnly = HARD_READ_ONLY_RE.test(turnText);
    const execution = EXECUTION_INTENT_RE.test(turnText);
    const researchOnly = RESEARCH_ONLY_RE.test(turnText) && !execution;
    this.readOnlyTurn = hardReadOnly || researchOnly;
    this.executionIntent = execution && !this.readOnlyTurn;
    if (this.executionIntent && this.declarationSeq === 0) {
      // A direct execution request is itself a declared stage. This keeps the
      // check useful when the model never narrates "I am starting".
      this.declarationSeq = 1;
      this.clearOverlapCounters();
    }
  }

  private scanDeclarations(): void {
    const start = Math.max(0, this.declarationScanOffset - DECLARATION_OVERLAP);
    const window = this.assistantText.slice(start);
    const matches: DeclarationMatch[] = [
      ...collectDeclarationMatches(window, ZH_STAGE_DECLARATION_SOURCE),
      ...collectDeclarationMatches(window, EN_STAGE_DECLARATION_SOURCE),
      ...collectDeclarationMatches(window, ZH_STALL_SOURCE),
      ...collectDeclarationMatches(window, EN_STALL_SOURCE),
    ].sort((left, right) => left.index - right.index);

    let maxEnd = this.declarationScanOffset;
    for (const match of matches) {
      const absoluteIndex = start + match.index;
      const absoluteEnd = start + match.end;
      // Skip a raw "开始改" that is actually "还没开始改"; the stall pattern
      // below counts that message once as a declared-but-unstarted stage.
      if (this.isNegated(absoluteIndex)) continue;
      if (absoluteEnd <= this.declarationScanOffset) continue;
      this.declarationSeq += 1;
      this.clearOverlapCounters();
      if (absoluteEnd > maxEnd) maxEnd = absoluteEnd;
    }
    this.declarationScanOffset = Math.max(this.declarationScanOffset, maxEnd);
  }

  private isNegated(index: number): boolean {
    // Only stage declarations can be negated in-place. The English "now" form
    // borrows text before the match; keep the window small and literal.
    const before = this.assistantText.slice(Math.max(0, index - 8), index);
    return NEGATION_RE.test(before);
  }

  /**
   * Reset only the counters scoped to one declared stage. The turn-wide range
   * ledger stays, so a promise followed by a re-read of already-consumed
   * content still counts as repetition.
   */
  private clearOverlapCounters(): void {
    this.fileOverlapCounts.clear();
    this.overlappingRereads = 0;
  }

  private recordRead(site: ReadSite): void {
    const previous = this.readRanges.get(site.key) ?? [];
    const overlaps = previous.some(range => rangesOverlap(range, site.range));
    if (overlaps && this.declarationSeq > 0) {
      this.overlappingRereads += 1;
      this.fileOverlapCounts.set(site.key, (this.fileOverlapCounts.get(site.key) ?? 0) + 1);
    }
    previous.push(site.range);
    this.readRanges.set(site.key, previous);
  }

  private maybeHint(): string | null {
    if (this.readOnlyTurn || this.waitingForUser) return null;
    if (this.editOps > 0) return null;
    if (this.hints >= this.limits.maxHintsPerTurn) return null;
    if (this.declarationSeq <= this.lastHintDeclarationSeq) return null;
    if (this.consecutiveReads < this.limits.minReadStreak) return null;
    if (this.overlappingRereads < this.limits.minOverlappingRereads) return null;
    if (this.opsSinceVerify < this.limits.minOpsSinceVerify) return null;
    const maxFileOverlaps = Math.max(0, ...this.fileOverlapCounts.values());
    if (maxFileOverlaps < this.limits.minFileOverlaps) return null;

    this.hints += 1;
    this.lastHintDeclarationSeq = this.declarationSeq;
    return buildHint({
      consecutiveReads: this.consecutiveReads,
      overlappingRereads: this.overlappingRereads,
      maxFileOverlaps,
    });
  }
}

/** Process-wide ledger for the builtin runtime (one sidecar process = one session). */
export const progressConvergence = new ProgressConvergenceTracker();
