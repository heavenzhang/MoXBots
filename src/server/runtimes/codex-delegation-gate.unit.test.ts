import { describe, expect, it, vi } from 'vitest';
import { buildCodexAppServerLaunchConfig, CodexRuntime } from './codex';
import { ClaudeCodeRuntime } from './claude-code';
import type { RuntimeProcess } from './types';

describe('Codex native delegation launch gate', () => {
  it.each(['system-cli', 'managed-provider'] as const)('closes both native implementations for %s', runtimeSource => {
    const { args } = buildCodexAppServerLaunchConfig({ commandPath: '/codex', runtimeSource, codexEnv: {},
      extensionConfigArgs: ['-c', 'features.collab=true'], subagentDelegationEnabled: false });
    expect(args.slice(-5)).toEqual(['-c', 'features.collab=false', '-c', 'features.multi_agent_v2=false', 'app-server']);
  });
  it.each([undefined, true])('preserves native configuration for legacy/confirmed %s', subagentDelegationEnabled => {
    const { args } = buildCodexAppServerLaunchConfig({ commandPath: '/codex', runtimeSource: 'system-cli', codexEnv: {}, subagentDelegationEnabled });
    expect(args).not.toContain('features.collab=false');
    expect(args).not.toContain('features.multi_agent_v2=false');
  });
});


describe('native root final lease checks', () => {
  it('rejects Codex before native root admission or RPC', async () => {
    const call = vi.fn();
    const process = { exited: false, rpc: { call } } as unknown as RuntimeProcess;
    await expect(new CodexRuntime().sendMessage(process, 'stale input', [], {
      clientUserMessageId: 'user', beforeDispatch: () => { throw new Error('PLAN_REVISION_CHANGED'); },
    })).rejects.toThrow('PLAN_REVISION_CHANGED');
    expect(call).not.toHaveBeenCalled();
  });
  it('rejects Claude Code before writing native stdin', async () => {
    const writeLine = vi.fn();
    const process = { writeLine } as unknown as RuntimeProcess;
    await expect(new ClaudeCodeRuntime().sendMessage(process, 'stale input', [], {
      beforeDispatch: () => { throw new Error('PLAN_REVISION_CHANGED'); },
    })).rejects.toThrow('PLAN_REVISION_CHANGED');
    expect(writeLine).not.toHaveBeenCalled();
  });
});


describe('Codex realtime native admission validator', () => {
  it('rejects a stale realtime plan before turn/steer RPC', async () => {
    const call = vi.fn().mockResolvedValue({ turnId: 'native-turn' });
    const process = { exited: false, activeSteerTurnId: 'native-turn', threadId: 'thread', rpc: { call } } as unknown as RuntimeProcess;
    await expect(new CodexRuntime().steerMessage(process, 'blocked realtime', [], {
      clientUserMessageId: 'unsent-user', beforeNativeDispatch: () => { throw new Error('PLAN_RUNTIME_DELEGATION_UNAVAILABLE'); },
    })).rejects.toThrow('PLAN_RUNTIME_DELEGATION_UNAVAILABLE');
    expect(call).not.toHaveBeenCalled();
  });
  it('validates an ordinary realtime input once immediately before its exact turn RPC', async () => {
    const events: string[] = [];
    const call = vi.fn(async () => { events.push('rpc'); return { turnId: 'native-turn' }; });
    const beforeNativeDispatch = vi.fn(() => { events.push('validate'); });
    const process = { exited: false, activeSteerTurnId: 'native-turn', threadId: 'thread', rpc: { call } } as unknown as RuntimeProcess;
    await new CodexRuntime().steerMessage(process, 'ordinary input', [], { clientUserMessageId: 'user', beforeNativeDispatch });
    expect(events).toEqual(['validate', 'rpc']);
    expect(beforeNativeDispatch).toHaveBeenCalledOnce();
    expect(call).toHaveBeenCalledWith('turn/steer', expect.objectContaining({ expectedTurnId: 'native-turn', threadId: 'thread' }), 15_000);
  });

});
