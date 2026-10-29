import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(root, 'download/index.html'), 'utf8');
const manifestName = html.match(/data-release-manifest="([^"]+)"/)[1];
const scriptName = html.match(/<script src="([^"]+)" defer>/)[1];
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'download', manifestName)));
const source = fs.readFileSync(path.join(root, 'download', scriptName), 'utf8');
const sha = data => crypto.createHash('sha256').update(data).digest('hex');
const clone = () => structuredClone(manifest);

// Execute the public script, including asynchronous loading and retry behavior.
async function render(data = clone(), options = {}) {
  const elements = new Map();
  const get = id => {
    if (!elements.has(id)) elements.set(id, {
      hidden: false, textContent: '', handlers: {},
      addEventListener(event, handler) { this.handlers[event] = handler; },
      removeAttribute(key) { delete this[key]; },
    });
    return elements.get(id);
  };
  let current = data;
  let failure = options.failure;
  let copied;
  const document = { body: { dataset: { releaseManifest: manifestName } }, getElementById: get };
  vm.runInNewContext(source, {
    document, location: new URL('https://101.42.11.29/moxbots/download/'), URL,
    fetch: async (url, init) => {
      assert.equal(url, manifestName);
      assert.equal(init.cache, 'no-store');
      if (failure === 'network') throw new Error('offline');
      return { ok: failure !== 'http', json: async () => {
        if (failure === 'json') throw new Error('malformed');
        return current;
      } };
    },
    navigator: { clipboard: { writeText: async value => {
      if (options.clipboardFailure) throw new Error('denied');
      copied = value;
    } } },
  }, { timeout: 1000 });
  const settle = () => new Promise(resolve => setImmediate(resolve));
  await settle();
  return { get, document, settle, copied: () => copied,
    retry: async value => { current = value; failure = undefined;
      get('release-retry').handlers.click(); await settle(); },
  };
}

test('immutable manifest/script names and projection mirror match exact bytes', () => {
  for (const name of [manifestName, scriptName]) {
    const bytes = fs.readFileSync(path.join(root, 'download', name));
    assert.ok(name.includes(sha(bytes).slice(0, 12)));
  }
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, 'trial-release.json'))), manifest);
  assert.equal(manifest.macArm64.version, '0.5.27');
  assert.equal(manifest.macArm64.build, '527.3');
  assert.equal(manifest.macArm64.bytes, 301917219);
  assert.equal(manifest.macArm64.sourceCommit, 'c2473e28acf2c257508dc8ad705731138441c7c2');
  assert.deepEqual(manifest.windowsX64, { status: 'preparing' });
});

test('Mac displays accepted archive identity, size, signing, notes and source', async () => {
  const s = await render();
  assert.equal(s.document.body.dataset.releaseReady, 'true');
  assert.equal(s.get('download-link').href, manifest.macArm64.url);
  assert.equal(s.get('release-version').textContent, '0.5.27');
  assert.equal(s.get('release-size').textContent, '301.9 MB');
  assert.equal(s.get('release-sha').textContent, manifest.macArm64.sha256);
  assert.equal(s.get('release-signing').textContent, 'Developer ID · 已公证');
  assert.equal(s.get('release-source').href, `https://github.com/heavenzhang/MoXBots/tree/${manifest.macArm64.sourceCommit}`);
  assert.equal(s.get('release-notes').href, manifest.macArm64.notesUrl);
  assert.equal(s.get('release-details').hidden, false);
  assert.match(s.get('release-note').textContent, /527\.3/);
  assert.equal(s.document.body.dataset.windowsReleaseReady, 'false');
  assert.equal(s.get('windows-download-link').href, undefined);
});

const archive = manifest.macArm64.url;
for (const url of [
  archive.replace('https:', 'http:'), archive.replace('101.42.11.29', 'evil.example'),
  archive + '?token=bad', archive + '#bad', archive.replace('/0.5.27/', '/0.5.26/'),
  archive.replace(manifest.macArm64.sha256, '0'.repeat(64)),
  'https://101.42.11.29/updates/.private/manifest.json',
  'https://101.42.11.29/updates/releases/0.5.27/../../private/a.tar.gz',
  'https://101.42.11.29/updates/releases/0.5.27/archive.tar.gz',
  archive.replace('https://', 'https://name:password@'),
  archive.replace('-MoXBots.app.tar.gz', '-Other.app.tar.gz'),
]) test(`unsafe or mismatched archive fails closed: ${url}`, async () => {
  const data = clone(); data.macArm64.url = url;
  const s = await render(data);
  assert.equal(s.document.body.dataset.releaseReady, 'false');
  assert.equal(s.get('download-link').href, undefined);
  assert.equal(s.get('download-link').hidden, true);
  assert.equal(s.get('release-details').hidden, true);
});

test('invalid release notes clears a previously assigned download link', async () => {
  const data = clone(); data.macArm64.notesUrl = 'https://evil.example/notes.html';
  const s = await render(data);
  assert.equal(s.document.body.dataset.releaseReady, 'false');
  assert.equal(s.get('download-link').href, undefined);
});

for (const failure of ['network', 'http', 'json']) test(`manifest ${failure} failure can retry safely`, async () => {
  const s = await render(clone(), { failure });
  assert.equal(s.get('release-retry').hidden, false);
  assert.equal(s.get('download-link').href, undefined);
  await s.retry(clone());
  assert.equal(s.document.body.dataset.releaseReady, 'true');
  assert.equal(s.get('download-link').href, archive);
});

test('retry to preparing removes earlier successful link and hash', async () => {
  const s = await render();
  const pending = clone(); pending.macArm64 = { status: 'preparing' };
  await s.retry(pending);
  assert.equal(s.get('download-link').href, undefined);
  assert.equal(s.get('release-details').hidden, true);
  await s.get('copy-sha').handlers.click();
  assert.equal(s.copied(), undefined);
});

test('Windows projection error is isolated from the valid Mac release', async () => {
  const data = clone(); data.windowsX64 = { status: 'ready', bytes: 100 };
  const s = await render(data);
  assert.equal(s.document.body.dataset.releaseReady, 'true');
  assert.equal(s.document.body.dataset.windowsReleaseReady, 'false');
});

for (const url of [
  'https://101.42.11.29/moxbots/download/packages/old.zip',
  'https://github.com/heavenzhang/MoXBots/releases/download/v0.5.6/old.zip',
]) test(`previous download channels remain compatible: ${url}`, async () => {
  const data = clone(); data.macArm64.url = url;
  const s = await render(data);
  assert.equal(s.document.body.dataset.releaseReady, 'true');
});

test('clipboard copies the accepted hash and shows a readable fallback on failure', async () => {
  const s = await render(); await s.get('copy-sha').handlers.click();
  assert.equal(s.copied(), manifest.macArm64.sha256);
  const denied = await render(clone(), { clipboardFailure: true });
  await denied.get('copy-sha').handlers.click();
  assert.match(denied.get('copy-status').textContent, /手动复制/);
});

test('current format/history and release notes no longer advertise old current packages', () => {
  assert.match(html, /TAR\.GZ · 内含 MoXBots\.app/);
  assert.match(html, /id="v0-5-27"/);
  assert.doesNotMatch(html, /最新 · macOS 自动更新|当前官网 macOS 手动安装包为此版本/);
  const notes = fs.readFileSync(path.join(root, 'download/notes/0.5.27.html'), 'utf8');
  assert.ok(notes.includes(manifest.macArm64.sha256));
  assert.ok(notes.includes(manifest.macArm64.sourceCommit));
  assert.match(notes, /手机真实业务和 TestFlight 分别跟踪/);
});
