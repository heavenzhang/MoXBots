#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Run with the packaged Node, not a developer's node_modules or system Node.
// Encode, decode and resize in memory; no model, credentials, Session or network.
export async function verifyHostImageRuntime(resources) {
  const require = createRequire(pathToFileURL(join(resources, 'host-session-worker.mjs')));
  const runtime = join(resources, 'sharp-runtime');
  const sharp = require(join(runtime, 'node_modules/sharp'));
  const pinned = JSON.parse(readFileSync(join(runtime, 'package.json'), 'utf8')).dependencies.sharp;
  assert.equal(sharp.versions.sharp, pinned);
  const png = await sharp({ create: { width: 64, height: 48, channels: 3, background: '#326ae8' } }).png().toBuffer();
  assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  const resized = await sharp(png).resize(16, 12).png().toBuffer();
  const metadata = await sharp(resized).metadata();
  assert.equal(metadata.format, 'png');
  assert.equal(metadata.width, 16);
  assert.equal(metadata.height, 12);
  return { sharp: sharp.versions.sharp, inputBytes: png.length, outputBytes: resized.length,
    format: metadata.format, width: metadata.width, height: metadata.height };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 3) throw new Error('Usage: packaged-node verify-image-runtime.mjs <resources>');
  console.log(JSON.stringify(await verifyHostImageRuntime(resolve(process.argv[2]))));
}
