import { accessSync, constants, existsSync, readFileSync, statSync } from 'fs';
import { dirname, resolve } from 'path';

import { PLAYWRIGHT_MCP_PACKAGE_SPEC, PLAYWRIGHT_MCP_PACKAGE_VERSION, pinPresetMcpPackageVersions } from '../../shared/mcpPackages';
import type { McpServerDefinition } from '../../shared/config-types';
import { buildMcpSubprocessEnv } from '../session-core/mcp-env-policy';
import { buildSessionExecutablePath } from './session-executable-path';
import {
  findExistingPath,
  getBundledNodeDir,
  getBundledRuntimePath,
  getSystemNpxPaths,
  getScriptDir,
} from './runtime';

/** One stdio launch policy for config probes, warmup and runtime projection.
 * Only MCP children receive this PATH; the AI's shell environment is separate.
 */
export function buildMcpStdioLaunchConfig(
  server: Pick<McpServerDefinition, 'command' | 'args' | 'env'> & { isBuiltin?: boolean },
  options: {
    parentEnv?: NodeJS.ProcessEnv;
    executionEnv?: Record<string, string>;
  } = {},
): { command: string; args: string[]; env: Record<string, string> } {
  if (!server.command) throw new Error('MCP stdio command is missing');
  const parentEnv = options.parentEnv ?? process.env;
  const isWindows = process.platform === 'win32';
  // The MCP SDK merges its uppercase default PATH before this env. Use the
  // same spelling so Windows cannot keep two competing case variants.
  const pathKey = 'PATH';
  const separator = isWindows ? ';' : ':';
  const executionEnv = options.executionEnv ?? {};
  let searchPath = executionEnv[pathKey] ?? (isWindows ? executionEnv.Path : undefined)
    ?? buildSessionExecutablePath(parentEnv).value;
  let command = server.command;
  let args = Array.isArray(server.args) ? [...server.args] : [];
  if (command === 'npx') {
    const invocation = resolveNpxMcpInvocation(args, { pinPresetPackages: server.isBuiltin === true });
    command = invocation.command;
    args = invocation.args;
    // npx's shebang and npm's descendants resolve node from PATH. Moving the
    // selected distribution first is necessary even when it was present later.
    const nodeDir = dirname(command);
    const equal = (entry: string): boolean => isWindows
      ? entry.toLowerCase() === nodeDir.toLowerCase() : entry === nodeDir;
    searchPath = [nodeDir, ...searchPath.split(separator).filter(entry => entry && !equal(entry))]
      .join(separator);
  }
  const env: Record<string, string> = {
    ...executionEnv,
    [pathKey]: searchPath,
    ...buildMcpSubprocessEnv(parentEnv, server.env),
  };
  if (isWindows) {
    // Windows treats env names case-insensitively, but JS and native SDKs do
    // not. Keep exactly one spelling; explicit per-server PATH wins.
    const override = Object.entries(server.env ?? {}).find(([key]) => key.toUpperCase() === 'PATH');
    for (const key of Object.keys(env)) if (key.toUpperCase() === 'PATH') delete env[key];
    env.PATH = override?.[1] ?? searchPath;
  }
  return { command, args, env };
}

/** Check configuration without running the user's server or requiring `which`
 * to be discoverable in a deliberately overridden per-server PATH.
 */
export function isMcpCommandAvailable(
  launch: { command: string; env: Record<string, string> },
  cwd = process.cwd(),
): boolean {
  const isWindows = process.platform === 'win32';
  const extensions = isWindows
    ? ['', ...(launch.env.PATHEXT ?? process.env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD').split(';')]
    : [''];
  const directories = launch.command.includes('/') || (isWindows && launch.command.includes('\\'))
    ? [cwd]
    : [
      // Windows spawn/cross-spawn also searches the working directory, and
      // PATH entries may be quoted by Windows installers. Match that lookup.
      ...(isWindows ? [cwd] : []),
      ...(launch.env.PATH ?? '').split(isWindows ? ';' : ':').map(entry => (
        (isWindows ? entry.replace(/^"(.*)"$/, '$1') : entry) || cwd
      )),
    ];
  return directories.some(directory => extensions.some(extension => {
    try {
      const candidate = resolve(cwd, directory, launch.command + extension);
      if (!statSync(candidate).isFile()) return false;
      accessSync(candidate, isWindows ? constants.F_OK : constants.X_OK);
      return true;
    } catch { return false; }
  }));
}

export interface ResolvedNpxMcpInvocation {
  command: string;
  args: string[];
  source: 'system' | 'bundled' | 'runtime-sibling';
}

export class NpxMcpResolutionError extends Error {
  constructor() {
    super('No complete Windows Node.js distribution with npm/bin/npx-cli.js was found for MCP startup');
    this.name = 'NpxMcpResolutionError';
  }
}

function resolveWindowsNodeNpxInvocation(
  nodePath: string,
  args: string[],
  source: ResolvedNpxMcpInvocation['source'],
): ResolvedNpxMcpInvocation | null {
  const npxCliPath = resolve(dirname(nodePath), 'node_modules', 'npm', 'bin', 'npx-cli.js');
  if (!existsSync(nodePath) || !existsSync(npxCliPath)) return null;
  return {
    command: nodePath,
    args: [npxCliPath, ...args],
    source,
  };
}

/**
 * Resolve a product-owned `npx` MCP invocation once, before handing it to an
 * SDK/runtime process. Both builtin Claude and managed Codex consume this
 * owner so they cannot drift on package pinning or bundled Node fallback.
 */
export function resolveNpxMcpInvocation(
  args: readonly string[],
  options: { pinPresetPackages?: boolean } = {},
): ResolvedNpxMcpInvocation {
  const normalizedArgs = options.pinPresetPackages
    ? pinPresetMcpPackageVersions(args)
    : [...args];
  // Packaged resources contain the dependency but no npm .bin
  // shims. npx sees that local package and then fails to find playwright-mcp.
  // Use the pinned preset's actual CLI with our Node distribution instead;
  // never reinterpret custom packages or npm flags as a bundled invocation.
  const presetArgs = normalizedArgs[0] === '-y' ? normalizedArgs.slice(1) : normalizedArgs;
  if (options.pinPresetPackages && presetArgs[0] === PLAYWRIGHT_MCP_PACKAGE_SPEC) {
    const packageDir = resolve(getScriptDir(), 'node_modules', '@playwright', 'mcp');
    const cli = resolve(packageDir, 'cli.js');
    const nodeDir = getBundledNodeDir();
    const node = nodeDir && resolve(nodeDir, process.platform === 'win32' ? 'node.exe' : 'node');
    if (node && existsSync(node) && existsSync(cli)) {
      try {
        const metadata = JSON.parse(readFileSync(resolve(packageDir, 'package.json'), 'utf8'));
        if (metadata.version === PLAYWRIGHT_MCP_PACKAGE_VERSION) {
          return { command: node, args: [cli, ...presetArgs.slice(1)], source: 'bundled' };
        }
      } catch { /* An incomplete resource tree retains the normal npm resolver. */ }
    }
  }
  const withYes = normalizedArgs.includes('-y') ? normalizedArgs : ['-y', ...normalizedArgs];

  if (process.platform === 'win32') {
    // Codex owns the final stdio spawn, so MyAgents cannot route a `.cmd`
    // shim through its subprocess adapter. Hand Codex a real executable and
    // structured argv from one complete Node distribution instead.
    for (const npxPath of getSystemNpxPaths()) {
      if (!existsSync(npxPath)) continue;
      const invocation = resolveWindowsNodeNpxInvocation(
        resolve(dirname(npxPath), 'node.exe'),
        withYes,
        'system',
      );
      if (invocation) return invocation;
    }

    const bundledNodeDir = getBundledNodeDir();
    if (bundledNodeDir) {
      const invocation = resolveWindowsNodeNpxInvocation(
        resolve(bundledNodeDir, 'node.exe'),
        withYes,
        'bundled',
      );
      if (invocation) return invocation;
    }

    const runtimePath = getBundledRuntimePath();
    const runtimeInvocation = resolveWindowsNodeNpxInvocation(
      runtimePath,
      withYes,
      'runtime-sibling',
    );
    if (runtimeInvocation) return runtimeInvocation;

    throw new NpxMcpResolutionError();
  }

  const systemNpx = findExistingPath(getSystemNpxPaths());
  if (systemNpx) {
    return { command: systemNpx, args: withYes, source: 'system' };
  }

  const bundledNodeDir = getBundledNodeDir();
  if (bundledNodeDir) {
    return {
      command: resolve(bundledNodeDir, 'npx'),
      args: withYes,
      source: 'bundled',
    };
  }

  const runtimePath = getBundledRuntimePath();
  return {
    command: resolve(dirname(runtimePath), 'npx'),
    args: withYes,
    source: 'runtime-sibling',
  };
}
