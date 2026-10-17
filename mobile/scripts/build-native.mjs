#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, copyFileSync, writeFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const mobile = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repo = path.dirname(mobile);
const target = process.argv[2];
const moduleDir = path.join(mobile, 'app/modules/moxbots-remote');
const manifest = path.join(mobile, 'connection/Cargo.toml');
const cargoTarget = path.join(mobile, 'connection/target');
function run(command, args, env = {}) {
  const result = spawnSync(command, args, { cwd: repo, env: { ...process.env, ...env }, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed (${result.status ?? result.signal})`);
}
function check(file, label) { if (!existsSync(file)) throw new Error(`${label} missing: ${file}`); }
function build(triple, env = {}) {
  run('cargo', ['build', '--locked', '--release', '--manifest-path', manifest, '--target', triple], {
    CARGO_TARGET_DIR: cargoTarget, ...env,
  });
}
if (target === 'android') {
  const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
  if (!sdk) throw new Error('Set ANDROID_HOME to the installed Android SDK');
  const ndk = process.env.ANDROID_NDK_HOME || path.join(sdk, 'ndk/27.1.12297006');
  const toolchain = path.join(ndk, 'toolchains/llvm/prebuilt/darwin-x86_64/bin');
  const clang = path.join(toolchain, 'aarch64-linux-android24-clang');
  const ar = path.join(toolchain, 'llvm-ar');
  check(clang, 'Android NDK clang'); check(ar, 'Android NDK ar');
  build('aarch64-linux-android', {
    CC_aarch64_linux_android: clang, AR_aarch64_linux_android: ar,
    CARGO_TARGET_AARCH64_LINUX_ANDROID_LINKER: clang, ANDROID_NDK_HOME: ndk,
  });
  const destination = path.join(moduleDir, 'android/native/arm64-v8a');
  mkdirSync(destination, { recursive: true });
  copyFileSync(path.join(cargoTarget, 'aarch64-linux-android/release/libmox_mobile_connection.so'),
    path.join(destination, 'libmox_mobile_connection.so'));
} else if (target === 'ios') {
  run('xcrun', ['--sdk', 'iphoneos', '--show-sdk-path']);
  const staging = path.join(cargoTarget, 'xcframework-stage');
  const frameworks = [];
  for (const [triple, platform] of [['aarch64-apple-ios', 'iphoneos'], ['aarch64-apple-ios-sim', 'iphonesimulator']]) {
    build(triple, { IPHONEOS_DEPLOYMENT_TARGET: '16.4' });
    const framework = path.join(staging, platform, 'MoxConnectionCore.framework');
    mkdirSync(path.join(framework, 'Headers'), { recursive: true });
    mkdirSync(path.join(framework, 'Modules'), { recursive: true });
    copyFileSync(path.join(cargoTarget, triple, 'release/libmox_mobile_connection.a'), path.join(framework, 'MoxConnectionCore'));
    copyFileSync(path.join(mobile, 'connection/include/mox_connection.h'), path.join(framework, 'Headers/mox_connection.h'));
    writeFileSync(path.join(framework, 'Modules/module.modulemap'), 'framework module MoxConnectionCore {\n  umbrella header "mox_connection.h"\n  export *\n  module * { export * }\n}\n');
    writeFileSync(path.join(framework, 'Info.plist'), `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>CFBundleExecutable</key><string>MoxConnectionCore</string><key>CFBundleIdentifier</key><string>com.moxbots.mobile.connectioncore</string><key>CFBundleName</key><string>MoxConnectionCore</string><key>CFBundlePackageType</key><string>FMWK</string><key>CFBundleVersion</key><string>1</string><key>CFBundleSupportedPlatforms</key><array><string>${platform === 'iphoneos' ? 'iPhoneOS' : 'iPhoneSimulator'}</string></array><key>MinimumOSVersion</key><string>16.4</string></dict></plist>`);
    frameworks.push(framework);
  }
  const output = path.join(moduleDir, 'ios/Frameworks/MoxConnectionCore.xcframework');
  if (existsSync(output)) rmSync(output, { recursive: true });
  mkdirSync(path.dirname(output), { recursive: true });
  run('xcodebuild', ['-create-xcframework', ...frameworks.flatMap((f) => ['-framework', f]), '-output', output]);
} else {
  throw new Error('Usage: node mobile/scripts/build-native.mjs android|ios');
}
