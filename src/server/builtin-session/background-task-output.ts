import { constants } from 'node:fs';
import { lstat, open, realpath } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, parse, resolve, sep } from 'node:path';
import type { BackgroundTaskDetail } from '../../shared/types/background-task';

export const BACKGROUND_TASK_OUTPUT_LIMIT = 64 * 1024;
type Output = Pick<BackgroundTaskDetail, 'output' | 'outputState' | 'truncated' | 'totalBytes'>;

/** A runtime receipt is trusted metadata only in a registered task's context. */
export function extractBackgroundTaskOutputPath(content: unknown): string | undefined {
  const text = typeof content === 'string' ? content : Array.isArray(content)
    ? content.filter((block): block is { type: string; text: string } => Boolean(block && typeof block === 'object'
      && block.type === 'text' && typeof block.text === 'string')).map(block => block.text).join('\n') : '';
  // SDK local_bash receipts carry an explicit output path; legacy receipts use "Output:".
  // Never search arbitrary command text or a serialized structured result.
  return text.match(/(?:^|\n)Command running in background with ID: [\w-]+\. Output is being written to: ([^\r\n]+?\.output)(?:\. (?:You will be notified|To check)|$)/)?.[1]
    ?? text.match(/(?:^|\n)Output(?: file)?:\s*([^\r\n]+\.output)\s*(?:\n|$)/)?.[1]?.trim();
}

/** Plain text: remove ANSI CSI/OSC and non-printing controls; retain tabs/newlines. */
export function sanitizeBackgroundTaskText(text: string): string {
  let result = '';
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code === 27 && text[index + 1] === '[') {
      index += 2;
      while (index < text.length && !(text.charCodeAt(index) >= 64 && text.charCodeAt(index) <= 126)) index += 1;
      continue;
    }
    if (code === 27 && text[index + 1] === ']') {
      index += 2;
      while (index < text.length && text.charCodeAt(index) !== 7
        && !(text.charCodeAt(index) === 27 && text[index + 1] === '\\')) index += 1;
      if (text.charCodeAt(index) === 27) index += 1;
      continue;
    }
    if ((code < 32 && code !== 9 && code !== 10 && code !== 13) || (code >= 127 && code <= 159)) continue;
    result += text[index];
  }
  return result;
}

async function canonicalWithoutSymlinks(path: string): Promise<string> {
  // OS temp aliases (/tmp, /var on macOS) are canonicalized at the root;
  // every component below that is checked, including the final file.
  let canonical = parse(path).root;
  const parts = path.slice(canonical.length).split(sep).filter(Boolean);
  for (let index = 0; index < parts.length; index += 1) {
    canonical = join(canonical, parts[index]!);
    const stat = await lstat(canonical);
    if (!stat.isSymbolicLink()) continue;
    if (index === 0 && process.platform === 'darwin' && ['tmp', 'var'].includes(parts[index]!)) {
      canonical = await realpath(canonical);
      continue;
    }
    throw new Error('UNSAFE_OUTPUT_PATH');
  }
  return canonical;
}

export async function readRegisteredTaskOutput(
  outputPath: string | undefined, taskId: string, sdkSessionId: string,
): Promise<Output> {
  const unavailable: Output = { output: '', outputState: 'unavailable', truncated: false, totalBytes: 0 };
  if (!outputPath) return unavailable;
  // Even SDK-provided metadata is constrained to this exact task/session file.
  if (!/^[\w-]+$/.test(taskId) || !isAbsolute(outputPath) || outputPath.includes('\0')
    || basename(outputPath) !== `${taskId}.output` || basename(dirname(outputPath)) !== 'tasks'
    || basename(dirname(dirname(outputPath))) !== sdkSessionId || resolve(outputPath) !== outputPath) return unavailable;
  let file: Awaited<ReturnType<typeof open>> | undefined;
  try {
    const canonical = await canonicalWithoutSymlinks(outputPath);
    if (await realpath(outputPath) !== canonical) return unavailable;
    file = await open(canonical, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const stat = await file.stat();
    // A parent swap cannot redirect an already-open handle to a different inode.
    const currentPath = await canonicalWithoutSymlinks(outputPath);
    if (currentPath !== canonical || await realpath(outputPath) !== canonical) return unavailable;
    const current = await lstat(currentPath);
    if (!stat.isFile() || stat.nlink !== 1 || current.dev !== stat.dev || current.ino !== stat.ino) return unavailable;
    const length = Math.min(stat.size, BACKGROUND_TASK_OUTPUT_LIMIT);
    const buffer = Buffer.alloc(length);
    const { bytesRead } = await file.read(buffer, 0, length, Math.max(0, stat.size - length));
    let start = 0;
    // A tail may start midway through UTF-8; skip only its leading continuation bytes.
    if (stat.size > length) while (start < bytesRead && (buffer[start]! & 0xc0) === 0x80) start += 1;
    const output = sanitizeBackgroundTaskText(buffer.subarray(start, bytesRead).toString('utf8'));
    return { output, outputState: stat.size === 0 ? 'empty' : 'ready', truncated: stat.size > length,
      totalBytes: stat.size };
  } catch (error) {
    return { ...unavailable, outputState: (error as NodeJS.ErrnoException).code === 'ENOENT' ? 'missing' : 'unavailable' };
  } finally { await file?.close(); }
}
