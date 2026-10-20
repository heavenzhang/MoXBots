import assert from 'node:assert/strict';
import test from 'node:test';
import type { Tokens } from 'marked';
import { parseMessage, messageLink, messageLiteral, isTranscriptAtBottom } from '../src/messagePresentation.ts';
import { messagePresentationFixture } from '../qa/messagePresentationFixture.ts';

test('mixed Chinese conversation is parsed as structure rather than displayed Markdown punctuation', () => {
  const blocks = parseMessage(messagePresentationFixture);
  assert.deepEqual(blocks.filter(t => t.type === 'heading').map(t => (t as Tokens.Heading).depth), [1, 2, 3, 3]);
  const paragraph = blocks.find(t => t.type === 'paragraph') as Tokens.Paragraph;
  assert.ok(paragraph.tokens.some(t => t.type === 'strong' && t.text === '重点内容'));
  assert.ok(paragraph.tokens.some(t => t.type === 'em'));
  assert.ok(paragraph.tokens.some(t => t.type === 'del'));
  assert.ok(paragraph.tokens.some(t => t.type === 'codespan'));
  assert.ok(paragraph.tokens.some(t => t.type === 'br'), 'Chinese soft line breaks remain readable');
  const table = blocks.find(t => t.type === 'table') as Tokens.Table;
  assert.equal(table.header.length, 3);
  assert.equal(table.rows.length, 3);
  assert.deepEqual(table.align, [null, 'center', 'right']);
});

test('nested numbered and task lists retain order, hierarchy and checked state', () => {
  const blocks = parseMessage('3. 第一项\n4. 第二项\n   - 子项\n\n- [x] 已完成\n- [ ] 待确认');
  const ordered = blocks[0] as Tokens.List;
  assert.equal(ordered.start, 3);
  assert.equal(ordered.items[1].tokens[1].type, 'list');
  const tasks = blocks.find(t => t.type === 'list' && !t.ordered) as Tokens.List;
  assert.deepEqual(tasks.items.map(t => t.checked), [true, false]);
});

test('complete and still-streaming code preserve spaces, angle brackets and line breaks', () => {
  const source = '```ts\n  const x = a < b && b > c;\n\n    return x;\n```';
  assert.equal((parseMessage(source)[0] as Tokens.Code).text, '  const x = a < b && b > c;\n\n    return x;');
  assert.equal(parseMessage('```ts\n  unfinished')[0].type, 'code');
  assert.equal(parseMessage('普通的 **未闭合文本')[0].type, 'paragraph');
  assert.equal(parseMessage('<img src=x onerror=alert(1)>')[0].type, 'html', 'HTML remains an inert data token');
});

test('links use only explicit web navigation, never credentials, scripts, files or native commands', () => {
  for (const url of ['javascript:alert(1)', 'data:text/html,test', 'file:///etc/passwd', 'moxbots://execute', '//example.com', 'https://user:pass@example.com', 'https://example.com/\nscript', '&#10;https://example.com']) assert.equal(messageLink(url), null, url);
  assert.equal(messageLink('https://example.com/a?x=1#part'), 'https://example.com/a?x=1#part');
  assert.equal(messageLink('http://example.com/a'), 'http://example.com/a');
});

test('reading history stays above the bottom across growing responses and image layout', () => {
  assert.equal(isTranscriptAtBottom(100, 600, 1800), false);
  assert.equal(isTranscriptAtBottom(100, 600, 2000), false);
  assert.equal(isTranscriptAtBottom(1380, 600, 2000), true);
  assert.equal(isTranscriptAtBottom(-40, 600, 400), true, 'short conversation / iOS bounce');
  assert.equal(isTranscriptAtBottom(500, 600, 1164), true);
  assert.equal(isTranscriptAtBottom(500, 600, 1165), false);
});

test('entities are decoded to inert text outside code and URL query separators are preserved', () => {
  assert.equal(messageLiteral('a &amp; b &lt;script&gt; &#x4e2d;'), 'a & b <script> 中');
  assert.equal(messageLink('https://example.com/?a=1&amp;b=2'), 'https://example.com/?a=1&b=2');
});
