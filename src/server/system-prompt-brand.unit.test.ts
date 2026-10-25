import { describe, expect, it, vi } from 'vitest';

vi.mock('../shared/appProfile', async (importOriginal) => ({
  ...await importOriginal<typeof import('../shared/appProfile')>(),
  APP_DISPLAY_NAME: 'MoXBots',
  APP_CLI_NAME: 'moxbot',
  APP_DATA_DIR_NAME: '.moxbot',
}));

import { buildDshSystemContext, buildSystemPromptAppend, type InteractionScenario } from './system-prompt';
import type { RuntimeType } from '../shared/types/runtime';
import {
  buildFloatingBallContextReminder,
  buildGoalContextReminder,
  buildGoalContinuationReminder,
  buildTaskCommentReminder,
  buildTaskDiscussionReminder,
  parseLeadingSystemReminder,
} from '../shared/systemReminder';
import { buildCronTaskReminder } from './utils/cron-reminder';
import { buildUserToolsSectionText } from './utils/cli-tools-registry';
import { renderSessionEventPrompt } from './inbox/session-event';
import { IMAGE_UNDERSTANDING_TOOL_ID, OFFICIAL_TOOLS, SPEECH_RECOGNITION_TOOL_ID } from '../shared/official-tools';
import { publicCliHelp, TOP_HELP } from '../cli/myagents';

const scenarios: InteractionScenario[] = [
  { type: 'desktop' },
  { type: 'desktop', surface: 'floating-ball' },
  { type: 'im', platform: 'feishu', sourceType: 'private' },
  { type: 'im', platform: 'telegram', sourceType: 'group' },
  { type: 'agent-channel', platform: 'test', sourceType: 'private' },
  { type: 'cron', taskId: 'task-brand', intervalMinutes: 60, aiCanExit: true },
  { type: 'registeredAgent', platform: 'space', spaceId: 'space-brand', registeredAgentId: 'agent-brand' },
];
const runtimes: RuntimeType[] = ['builtin', 'claude-code', 'codex', 'dsh'];
const options = {
  cliToolsEnabled: true,
  enabledOfficialToolIds: [IMAGE_UNDERSTANDING_TOOL_ID, SPEECH_RECOGNITION_TOOL_ID],
};

describe('MoXBots product identity across runtime and scenario boundaries', () => {
  it.each(runtimes.flatMap(runtime => scenarios.map(scenario => ({ runtime, scenario }))))(
    'uses the selected product identity for $runtime / $scenario.type',
    ({ runtime, scenario }) => {
      const prompt = buildSystemPromptAppend(scenario, { ...options, runtime });
      expect(prompt).toContain('MoXBots');
      expect(prompt).not.toContain('MyAgents');
      expect(prompt).toContain('<myagents-identity>');
      expect(prompt).toContain('~/.moxbot');
      expect(prompt).toContain('moxbot task readme');
      expect(prompt).toContain('myagents-task-automation');
    },
  );

  it.each(scenarios)('keeps DSH section identities while branding $type context', (scenario) => {
    const snapshot = buildDshSystemContext(scenario, options);
    expect(snapshot.sections.map(section => section.id)).toEqual([
      'myagents:identity', 'myagents:capability-routing', 'myagents:session',
    ]);
    const text = snapshot.sections.map(section => section.text).join('\n');
    expect(text).toContain('You are the active agent in MoXBots');
    expect(text).not.toContain('MyAgents');
  });
});

describe('MoXBots dynamic reminders and capability discovery', () => {
  const goal = { objective: '检查结果', goalId: 'goal-brand', goalStatus: 'active', turnNumber: 2 };
  const visibleUserMessage = '检查 MyAgents 上游差异';
  const reminders = [
    buildFloatingBallContextReminder({ appName: 'Editor' }),
    buildTaskDiscussionReminder({ candidatesDir: '/tmp/candidates', workspaceId: 'workspace-brand', workspacePath: '/tmp/workspace', visibleUserMessage }),
    buildTaskCommentReminder({ taskId: 'task-brand', taskName: '检查', taskMdPath: '/tmp/task.md', commentId: 'comment-brand', targetSessionId: 'session-brand', visibleUserMessage }),
    buildGoalContinuationReminder(goal),
    buildGoalContextReminder({ ...goal, visibleUserMessage }),
    buildCronTaskReminder({ prompt: visibleUserMessage, taskId: 'task-brand', aiCanExit: true }),
  ];

  it.each(reminders.map((reminder, index) => ({ reminder, index })))(
    'brands reminder $index without rewriting user text',
    ({ reminder }) => {
      const parsed = parseLeadingSystemReminder(reminder);
      expect(parsed.hasReminder).toBe(true);
      expect(parsed.body).toContain('MoXBots');
      expect(parsed.body).not.toContain('MyAgents');
      if (parsed.visibleText) expect(parsed.visibleText).toBe(visibleUserMessage);
    },
  );

  it('brands CLI help and tool descriptions while preserving command and authorization contracts', () => {
    expect(TOP_HELP).toContain('moxbot — MoXBots product capabilities CLI');
    expect(TOP_HELP).not.toContain('MyAgents');
    const help = publicCliHelp([]);
    expect(help).toContain('MoXBots');
    expect(help).not.toContain('MyAgents');
    expect(help).toContain('MYAGENTS_API_TOKEN');
    expect(OFFICIAL_TOOLS.find(tool => tool.id === SPEECH_RECOGNITION_TOOL_ID)?.description).toContain('MoXBots');
  });

  it('brands registered-tool guidance without rewriting a user-owned description', () => {
    const description = 'Compare MyAgents upstream releases';
    const text = buildUserToolsSectionText([{ name: 'compare-upstream', description }]);
    expect(text).toContain('registered the following CLI tools in MoXBots');
    expect(text).toContain(description);
    expect(text).toContain('<myagents-user-tools>');
  });

  it('brands session notifications while preserving their protocol and user payload', () => {
    const text = renderSessionEventPrompt({
      version: 1,
      type: 'send.request',
      eventId: 'brand-event',
      createdAt: '2026-10-25T12:00:00.000Z',
      sourceSessionId: 'source',
      targetSessionId: 'target',
      sourceNotification: 'auto',
      payload: '检查 MyAgents 上游差异',
    });
    const summary = text.match(/<event-summary>([\s\S]*?)<\/event-summary>/)?.[1];
    expect(summary).toContain('MoXBots');
    expect(summary).not.toContain('MyAgents');
    expect(text).toContain('<myagents-session-event');
    expect(text).toContain('检查 MyAgents 上游差异');
  });
});
