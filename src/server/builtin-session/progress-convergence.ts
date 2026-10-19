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
 * Read-only intent is taken from the turn's directive, not from a raw keyword
 * hit. An unscoped prohibition ("不要修改代码", "do not modify code") exempts the
 * whole turn, but an object-scoped constraint ("不要修改生产数据", "do not modify
 * other modules") only limits side effects and must not hide an explicitly
 * requested implementation. Quoted strings and fenced code are material under
 * discussion, not instructions for this turn.
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

/**
 * Quoted spans and fenced/inline code are content the user is pointing at ("fix
 * the prompt that says do not modify"), not directives for this turn, so they
 * are removed before intent detection. ASCII single quotes are deliberately
 * not stripped: an apostrophe in "don't" would otherwise swallow a directive.
 */
const QUOTED_OR_CODE_SPAN_RE =
  /```[\s\S]*?```|`[^`\n]*`|“[^”\n]{0,400}”|「[^」\n]{0,400}」|『[^』\n]{0,400}』|"[^"\n]{0,400}"/g;

/**
 * "Don't modify it" forms. The verb is followed by the object that decides
 * whether the prohibition covers the whole turn or one target.
 */
const ZH_PROHIBITION_SOURCE = [
  '(?:请?勿|不要|禁止|不得)\\s*(?:再|去|直接|随意|擅自|手动)?\\s*(?:修改|改动|改造|改进|改善|改变|编辑|变更|动手|改|动)',
  // Bare "不修改" is directive only at a clause start ("不修改订单模块，只修改
  // 支付模块"). The same words mid-clause are often descriptive ("重复读取但不
  // 改代码的问题"), so they do not form a prohibition there.
  '(?:^|[，。；：、！？,.;:!?\\s]|暂时|暂|先)\\s*不\\s*(?:再|去|直接|随意|擅自|手动)?\\s*(?:修改|改动|改造|改进|改善|改变|编辑|变更|动手|改|动)',
  // 别 is only a directive after a boundary or an intensifier; otherwise it is
  // part of an ordinary word such as 区别/类别.
  '(?:^|[，。；：、！？,.;:!?\\s]|千万|可)\\s*别\\s*(?:再|去|直接|随意|擅自|手动)?\\s*(?:修改|改动|改造|改进|改善|改变|编辑|变更|动手|改|动)',
].join('|');
const EN_PROHIBITION_SOURCE = [
  '\\b(?:do\\s+not|don\'t|never|must\\s+not|should\\s+not)\\s+(?:modify|change|edit|write|touch|alter)\\b',
  '\\bwithout\\s+(?:modifying|changing|editing|writing|touching|altering)\\b',
  '\\bmake\\s+no\\s+(?:code\\s+)?changes?\\b',
  '\\bno\\s+code\\s+changes?\\b',
].join('|');
const PROHIBITION_SOURCE = `${ZH_PROHIBITION_SOURCE}|${EN_PROHIBITION_SOURCE}`;

/** Where the object of a prohibition ends and the next clause begins. */
const CLAUSE_BOUNDARY_RE =
  /[，。；：、！？,.;:!?\n]|\b(?:and|but|then|while|instead)\b|(?:但是|但|然后|随后|同时|并且|并|而是)/i;

/**
 * Objects that make a prohibition cover the whole turn: the code itself, files
 * in general, the implementation. A qualified object (production data,
 * credentials, config, another module) is scoped instead.
 */
const ZH_GENERIC_OBJECT_RE =
  /^(?:该|此|本|这(?:个|些)?|那(?:个|些)?|任何|所有|全部|现有|当前|整个|项目(?:里|中)?的?|仓库(?:里|中)?的?)?\s*(?:的)?\s*(?:代码|源码|源代码|代码库|代码文件|文件|文件内容|实现|逻辑)/;
const EN_GENERIC_OBJECT_RE =
  /^(?:any\s+|all\s+|the\s+|this\s+|that\s+|these\s+|those\s+|existing\s+|current\s+)*(?:code|code\s*base|source\s+code|files?|file\s+content|implementation|logic|project|repo(?:sitory)?|anything)\b/i;

/** Explicitly partial scopes: "other modules", "files outside src", "except X". */
const SCOPED_OBJECT_RE =
  /(?:其他|其它|别的|另外|之外|以外|除了|而不是)|\b(?:other|others|else|except|excluding|outside|instead|rather\s+than)\b/i;

/**
 * A generic head with a qualifier is still a scoped target: "any files in
 * production/" and "the code path that writes to production" do not forbid
 * editing the project, only the named area. "代码里的生产环境配置" likewise.
 */
const SCOPED_QUALIFIER_RE = new RegExp([
  '(?:里|中|内)的|之(?:中|内|外)',
  '\\b(?:in|inside|under|within|outside|except|other\\s+than|containing)\\b',
  // A relative clause only narrows the object when it names a data-flow role:
  // "the code path that writes to production". "The code that we discussed"
  // is still the whole code target.
  '\\b(?:that|which)\\s+(?:\\w+\\s+){0,3}(?:writes?|reads?|uses?|touches?|handles?|serves?|feeds?|imports?|exports?|targets?|references?|accesses?|modifies?|affects?)\\b',
].join('|'), 'i');

/** "不要动手改代码" — the object is another edit verb, so nothing is scoped. */
const ZH_EDIT_VERB_OBJECT_RE =
  /^(?:去|再|直接|开始|动手)?\s*(?:修改|改动|编辑|变更|改|写|实现|修复|重构|动)/;

/** "只给方案" / "仅提供分析" — deliver analysis, not code. */
const ANALYSIS_ONLY_RE =
  /(?:只|仅)(?:需要|需|要|想)?\s*(?:给出|提供|输出|说明|整理|写|做|做一份|给)?\s*(?:一份|一个|个)?\s*(?:方案|计划|建议|报告|评审|意见|分析|诊断)/;

const READ_ONLY_MARKER_SOURCE = '只读|read[- ]?only';

type ObjectSegment = { text: string; consumed: number };

const CLAUSE_PUNCTUATION_RE = /[，。；：、！？,.;:!?\n]/;

/** Text of the prohibition's object, plus the raw length it occupies. */
function objectSegment(tail: string): ObjectSegment {
  const leading = /^\s*/.exec(tail)?.[0].length ?? 0;
  const window = tail.slice(leading, leading + 120);
  let boundary = window.search(CLAUSE_BOUNDARY_RE);
  // A conjunction at the start of the object belongs to the object phrase
  // ("并发控制", "同时运行的配置", "while-loop behavior"), not to a new clause.
  if (boundary === 0 && !CLAUSE_PUNCTUATION_RE.test(window[0])) {
    const next = window.slice(1).search(CLAUSE_BOUNDARY_RE);
    boundary = next < 0 ? -1 : next + 1;
  }
  const consumed = leading + (boundary < 0 ? window.length : boundary);
  return {
    text: window.slice(0, boundary < 0 ? window.length : boundary)
      .replace(/^[\s"'“”‘’「」『』]+/, '')
      .trim(),
    consumed,
  };
}

/**
 * Keep a placeholder rather than deleting the span: in `do not modify
 * "production data"` the quoted text is the object, and an empty object would
 * turn a scoped constraint into a whole-turn prohibition.
 */
function stripQuotedAndCode(text: string): string {
  return text.replace(QUOTED_OR_CODE_SPAN_RE, ' quoted ');
}

/**
 * "只读" that describes an object's attribute ("这个文件是只读的", "设为只读",
 * "只读副本", "read-only replicas") is an environment fact, not the task type.
 * A bare "只读分析" or "read-only research" is the task type.
 */
const READ_ONLY_ATTRIBUTE_OBJECT_SOURCE = [
  '文件|目录|属性|权限|挂载|磁盘|卷|副本|实例|节点|数据库|表|字段|列',
  '连接|会话|事务|账号|用户|标志|开关|端口|配置|模式|镜像|快照|视图|接口',
  '缓存|日志|访问|角色|集群|桶|存储',
].join('|');
const READ_ONLY_ATTRIBUTE_OBJECT_RE = new RegExp(
  `^\\s*(?:的\\s*)?(?:${READ_ONLY_ATTRIBUTE_OBJECT_SOURCE})`,
);
// "设为只读" and "标记为只读" are attribute conversions regardless of subject;
// a bare "是/为只读" is only an attribute when the subject is an object
// ("这个配置文件是只读的"), not when it is the task itself ("任务是只读的").
const READ_ONLY_ATTRIBUTE_BEFORE_RE = new RegExp([
  '(?:设为|设成|设置为|设置成|改成|调成|调整成|变成|成为|改为)\\s*$',
  `(?:${READ_ONLY_ATTRIBUTE_OBJECT_SOURCE})\\s*(?:是|为)?\\s*$`,
].join('|'));

const EN_READ_ONLY_ATTRIBUTE_OBJECT_SOURCE = [
  'files?|director(?:y|ies)|mounts?|disks?|volumes?|replicas?|instances?|nodes?',
  'databases?|tables?|fields?|columns?|connections?|sessions?|transactions?',
  'accounts?|users?|flags?|switches?|ports?|config(?:uration)?|modes?',
  'images?|snapshots?|views?|interfaces?|caches?|logs?|access|roles?',
  'clusters?|buckets?|storage|permissions?|attributes?|properties|endpoints?',
].join('|');
const EN_READ_ONLY_ATTRIBUTE_OBJECT_RE = new RegExp(
  `^\\s*(?:${EN_READ_ONLY_ATTRIBUTE_OBJECT_SOURCE})\\b`,
  'i',
);
const EN_READ_ONLY_ATTRIBUTE_BEFORE_RE = new RegExp([
  `(?:${EN_READ_ONLY_ATTRIBUTE_OBJECT_SOURCE})\\s+(?:is|are)\\s*$`,
  '(?:set\\s+to|marked\\s+as|made|becomes?|turned)\\s*$',
].join('|'), 'i');

function hasWholeTurnReadOnlyMarker(text: string): boolean {
  const re = new RegExp(READ_ONLY_MARKER_SOURCE, 'gi');
  for (const match of text.matchAll(re)) {
    const index = match.index ?? 0;
    const end = index + match[0].length;
    const before = text.slice(Math.max(0, index - 32), index);
    const after = text.slice(end, end + 32);
    if (
      READ_ONLY_ATTRIBUTE_BEFORE_RE.test(before)
      || EN_READ_ONLY_ATTRIBUTE_BEFORE_RE.test(before)
      || READ_ONLY_ATTRIBUTE_OBJECT_RE.test(after)
      || EN_READ_ONLY_ATTRIBUTE_OBJECT_RE.test(after)
    ) {
      continue;
    }
    return true;
  }
  return false;
}

/**
 * True when a prohibition covers the whole turn. A named object is scoped only
 * when the turn separately authorizes an edit; on its own ("不得修改接口。",
 * "不要修改它。") a prohibition with no execution request is still read-only.
 */
function hasWholeTurnProhibition(text: string, executionAuthorized: boolean): boolean {
  const re = new RegExp(PROHIBITION_SOURCE, 'gi');
  for (const match of text.matchAll(re)) {
    const object = objectSegment(text.slice((match.index ?? 0) + match[0].length)).text;
    if (!object) return true; // "不要修改。" — nothing scoped
    if (SCOPED_OBJECT_RE.test(object)) continue; // "不要修改其他模块"
    if (SCOPED_QUALIFIER_RE.test(object)) continue; // "任何文件 in production/"
    if (ZH_EDIT_VERB_OBJECT_RE.test(object)) return true; // "不要动手改代码"
    if (ZH_GENERIC_OBJECT_RE.test(object) || EN_GENERIC_OBJECT_RE.test(object)) return true;
    if (!executionAuthorized) return true; // "不得修改接口。" — no other edit requested
  }
  return false;
}

/**
 * Remove prohibition clauses before looking for execution/research intent, so
 * "只分析，不要修改生产数据" is not read as an execution request merely because
 * the prohibition contains 修改.
 */
function stripProhibitionClauses(text: string): string {
  const re = new RegExp(PROHIBITION_SOURCE, 'gi');
  let cursor = 0;
  let result = '';
  for (const match of text.matchAll(re)) {
    const start = match.index ?? 0;
    const verbEnd = start + match[0].length;
    const object = objectSegment(text.slice(verbEnd));
    result += text.slice(cursor, start) + ' ';
    cursor = verbEnd + object.consumed;
  }
  return result + text.slice(cursor);
}

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
    // The enqueued turn text is the caller's whole message (external/inbox and
    // task turns can wrap their own instructions), so classify only explicit
    // directives: quoted/code content is discussion material, and prohibitions
    // are judged by their object.
    const directive = stripQuotedAndCode(turnText);
    // Execution is computed first: a named prohibition object is scoped only
    // when the rest of the turn actually authorizes an edit.
    const taskText = stripProhibitionClauses(directive);
    const execution = EXECUTION_INTENT_RE.test(taskText);
    const hardReadOnly = hasWholeTurnReadOnlyMarker(directive)
      || ANALYSIS_ONLY_RE.test(directive)
      || hasWholeTurnProhibition(directive, execution);
    const researchOnly = RESEARCH_ONLY_RE.test(taskText) && !execution;
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
