import assert from 'node:assert/strict';
import { mkdtemp, mkdir, cp, symlink, writeFile, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import test from 'node:test';
import { build, loadConfigFromFile } from 'vite';
import { JSDOM, VirtualConsole } from 'jsdom';

const require = createRequire(import.meta.url);
const repo = resolve(import.meta.dirname, '..');

test('production-built linked components share the React Hook dispatcher', async () => {
  const config = await loadConfigFromFile({ command: 'build', mode: 'production' }, join(repo, 'vite.config.ts'));
  assert.ok(config, 'load the actual renderer configuration');
  const temporary = await mkdtemp(join(tmpdir(), 'moxbots-react-singleton-'));
  const root = join(temporary, 'renderer');
  const linked = join(temporary, 'linked-probe');
  const react = dirname(require.resolve('react/package.json'));
  const reactDom = dirname(require.resolve('react-dom/package.json'));
  try {
    await mkdir(join(root, 'node_modules'), { recursive: true });
    await mkdir(join(linked, 'node_modules'), { recursive: true });
    await symlink(react, join(root, 'node_modules/react'), 'dir');
    await symlink(reactDom, join(root, 'node_modules/react-dom'), 'dir');
    // Same version, different physical module: a linked dependency can carry
    // its own dispatcher even though ordinary dependency/version checks pass.
    await cp(react, join(linked, 'node_modules/react'), { recursive: true });
    assert.notEqual(await realpath(react), await realpath(join(linked, 'node_modules/react')));
    await writeFile(join(linked, 'package.json'), JSON.stringify({ name: 'linked-probe', type: 'module', main: 'index.js' }));
    await writeFile(join(linked, 'index.js'), `import {useEffect, createElement} from 'react';
export function Probe(){useEffect(()=>{document.body.dataset.committed='yes';},[]);return createElement('p',null,'linked Hook rendered');}`);
    await symlink(linked, join(root, 'node_modules/linked-probe'), 'dir');
    await writeFile(join(root, 'entry.js'), `import React from 'react';import {createRoot} from 'react-dom/client';import {Probe} from 'linked-probe';
createRoot(document.getElementById('root')).render(React.createElement(Probe));`);

    async function mount(dedupe) {
      const result = await build({
        configFile: false, root, logLevel: 'silent', resolve: { dedupe },
        define: { 'process.env.NODE_ENV': JSON.stringify('production') },
        build: { write: false, minify: false, lib: { entry: join(root, 'entry.js'), name: 'HookSmoke', formats: ['iife'] } },
      });
      const errors = [];
      const console = new VirtualConsole();
      console.on('error', (...args) => errors.push(args.map(String).join(' ')));
      console.on('jsdomError', error => errors.push(String(error)));
      const dom = new JSDOM('<div id="root"></div>', { runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: console });
      try {
        const bundle = Array.isArray(result) ? result[0] : result;
        dom.window.eval(bundle.output.find(item => item.type === 'chunk').code);
        const end = Date.now() + 1000;
        while (!dom.window.document.body.dataset.committed && errors.length === 0 && Date.now() < end) {
          await new Promise(resolve => setTimeout(resolve, 10));
        }
        return { committed: dom.window.document.body.dataset.committed === 'yes', text: dom.window.document.body.textContent, errors };
      } finally { dom.window.close(); }
    }
    const broken = await mount([]);
    assert.equal(broken.committed, false, 'fixture must expose the pre-fix duplicate React failure');
    assert.match(broken.errors.join('\n'), /useEffect|Invalid hook|Minified React error/);
    const fixed = await mount(config.config.resolve?.dedupe ?? []);
    assert.equal(fixed.committed, true, fixed.errors.join('\n'));
    assert.equal(fixed.text, 'linked Hook rendered');
    assert.deepEqual(fixed.errors, []);
  } finally { await rm(temporary, { recursive: true, force: true }); }
});
