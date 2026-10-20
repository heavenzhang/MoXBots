import { decodeHTML } from 'entities';
import { Lexer, type Token } from 'marked';

/** Parse to data only. HTML is never executed and Markdown never fetches resources. */
export function parseMessage(content: string): Token[] {
  try { return Lexer.lex(content, { gfm: true, breaks: true }); }
  catch { return [{ type: 'text', raw: content, text: content }]; }
}

export const messageLiteral = (value: string): string => decodeHTML(value);

export function messageLink(value: string): string | null {
  const decoded = decodeHTML(value);
  if (/[\u0000-\u0020\u007f]/u.test(decoded)) return null;
  try {
    const url = new URL(decoded);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return null;
    return url.href;
  } catch { return null; }
}

/** Reading above the bottom must survive polling, image layout and keyboard changes. */
export function isTranscriptAtBottom(offset: number, viewport: number, content: number): boolean {
  return content - viewport - Math.max(0, offset) <= 64;
}
