import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CommandItem, SkillItem } from '../../shared/skillsTypes';
import { createRef } from 'react';
import SkillsCommandsList, { type SkillsCommandsListRef } from './SkillsCommandsList';

const apiMocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  delete: vi.fn(),
  interactionProbe: vi.fn(),
}));

vi.mock('@/api/apiFetch', () => ({
  apiGetJson: apiMocks.get,
  apiPostJson: apiMocks.post,
  apiDelete: apiMocks.delete,
}));

vi.mock('@/components/Toast', () => ({
  useToast: () => ({
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  }),
}));

vi.mock('./SkillDialogs', () => ({
  CreateDialog: (props: { name: string; onNameChange: (name: string) => void; onConfirm: () => void; onCancel: () => void }) => <>
    <input aria-label="New command name" value={props.name} onChange={event => props.onNameChange(event.target.value)} />
    <button onClick={props.onConfirm}>Confirm new command</button>
    <button onClick={props.onCancel}>Cancel new command</button>
  </>,
  NewSkillChooser: (props: {
    onUploadSkill: (file: File) => void;
    onWriteSkill: () => void;
    onImportFolder: (path: string) => void;
    onInstallFromUrl: () => void;
    onCancel: () => void;
  }) => <>
    <button onClick={() => { props.onUploadSkill(new File(['---\nname: uploaded\n---\nRun'], 'uploaded.md')); apiMocks.interactionProbe(); }}>Upload test Skill</button>
    <button onClick={() => props.onImportFolder('/source/skill')}>Import test folder</button>
    <button onClick={props.onWriteSkill}>Write test Skill</button>
    <button onClick={props.onInstallFromUrl}>Open URL installer</button>
    <button onClick={props.onCancel}>Cancel test chooser</button>
  </>,
  InstallFromUrlDialog: (props: { onInstall: (url: string, selection?: { folderNames: string[] }) => void; onCancel: () => void }) => <>
    <textarea aria-label="URL input" />
    <button onClick={props.onCancel}>Cancel URL installer</button>
    <button onClick={() => props.onInstall('https://example.com/skill.zip')}>Preview test URL</button>
    <button onClick={() => props.onInstall('https://example.com/skill.zip', { folderNames: ['review'] })}>Confirm test URL</button>
  </>,
}));

const requiredSkill: SkillItem = {
  name: 'myagents-cli',
  description: 'Required operations',
  scope: 'user',
  path: '/global/myagents-cli/SKILL.md',
  folderName: 'myagents-cli',
  systemOwned: true,
  required: true,
  enabled: true,
  capabilityId: 'global:skill:myagents-cli',
  origin: 'global',
};

const optionalSkill: SkillItem = {
  name: 'review',
  description: 'Project review',
  scope: 'project',
  path: '/workspace/.claude/skills/review/SKILL.md',
  folderName: 'review',
  systemOwned: false,
  required: false,
  enabled: true,
  capabilityId: 'project:skill:review',
  origin: 'project',
};

const globalCommand: CommandItem = {
  name: 'ship',
  description: 'Ship release',
  scope: 'user',
  path: '/global/commands/ship.md',
  fileName: 'ship',
  enabled: false,
  capabilityId: 'global:command:ship',
  origin: 'global',
  author: 'MyAgents',
};

describe('SkillsCommandsList project capability controls', () => {
  beforeEach(() => {
    apiMocks.get.mockReset();
    apiMocks.post.mockReset();
    apiMocks.delete.mockReset();
    apiMocks.get.mockResolvedValue({
      success: true,
      skills: [requiredSkill, optionalSkill],
      commands: [globalCommand],
    });
    apiMocks.post.mockResolvedValue({
      success: true,
      skills: [requiredSkill, { ...optionalSkill, enabled: false }],
      commands: [globalCommand],
    });
  });

  it('loads project and global cards once, hides required switches, and persists an exact toggle', async () => {
    const onSelectSkill = vi.fn();
    render(
      <SkillsCommandsList
        scope="project"
        agentDir="/workspace"
        onSelectSkill={onSelectSkill}
        onSelectCommand={vi.fn()}
      />,
    );

    const reviewTitle = await screen.findByText('review');
    const requiredCard = screen.getByText('myagents-cli').closest('.group');
    const reviewCard = reviewTitle.closest('.group');
    expect(apiMocks.get).toHaveBeenCalledTimes(1);
    expect(apiMocks.get).toHaveBeenCalledWith('/api/project-capabilities?agentDir=%2Fworkspace');
    expect(requiredCard?.querySelector('[role="switch"]')).toBeNull();
    expect(reviewCard?.querySelector('[role="switch"]')).not.toBeNull();
    const requiredTitle = screen.getByText('myagents-cli');
    const systemStatus = screen.getByText('系统');
    const commandTitle = screen.getByText('ship');
    const commandCard = commandTitle.closest('.group');
    const commandIcon = commandCard?.querySelector('[data-capability-type-icon="command"]');
    const commandAuthor = commandCard?.querySelector('[data-capability-author]');
    expect(requiredCard?.querySelector('[data-capability-type-icon="skill"]')?.nextElementSibling).toContainElement(requiredTitle);
    expect(systemStatus).toHaveClass('rounded-full', 'bg-[var(--paper-inset)]');
    expect(commandIcon?.nextElementSibling).toContainElement(commandTitle);
    expect(commandTitle.nextElementSibling).toBe(commandAuthor);
    expect(commandAuthor).not.toHaveClass('rounded-full', 'bg-[var(--paper-inset)]');

    fireEvent.click(requiredCard!);
    expect(onSelectSkill).toHaveBeenCalledWith('myagents-cli', 'user');

    fireEvent.click(reviewCard!.querySelector('[role="switch"]')!);

    await waitFor(() => expect(apiMocks.post).toHaveBeenCalledWith(
      '/api/project-capability/toggle',
      {
        capabilityId: 'project:skill:review',
        enabled: false,
        agentDir: '/workspace',
      },
    ));
    await waitFor(() => expect(reviewCard!.querySelector('[role="switch"]')).toHaveAttribute('aria-checked', 'false'));
  });

  it('restores the last authoritative value when save and refresh both fail', async () => {
    apiMocks.get
      .mockResolvedValueOnce({
        success: true,
        skills: [requiredSkill, optionalSkill],
        commands: [globalCommand],
      })
      .mockRejectedValueOnce(new Error('refresh unavailable'));
    apiMocks.post.mockRejectedValueOnce(new Error('save unavailable'));
    render(
      <SkillsCommandsList
        scope="project"
        agentDir="/workspace"
        onSelectSkill={vi.fn()}
        onSelectCommand={vi.fn()}
      />,
    );

    const reviewCard = (await screen.findByText('review')).closest('.group')!;
    const toggle = reviewCard.querySelector('[role="switch"]')!;
    fireEvent.click(toggle);

    await waitFor(() => expect(apiMocks.post).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(toggle).toHaveAttribute('aria-checked', 'true'));
  });
});

describe('SkillsCommandsList install destinations', () => {
  beforeEach(() => {
    apiMocks.get.mockReset().mockResolvedValue({ success: true, skills: [], commands: [] });
    apiMocks.post.mockReset().mockResolvedValue({ success: false, error: 'test response' });
  });

  it.each(['/bot-a', '/bot-b'])('keeps upload, folder import and URL preview/confirmation on %s', async agentDir => {
    render(<SkillsCommandsList scope="project" agentDir={agentDir} onSelectSkill={vi.fn()} onSelectCommand={vi.fn()} />);
    await waitFor(() => expect(screen.getAllByRole('button', { name: '新建' })).toHaveLength(2));
    fireEvent.click(screen.getAllByRole('button', { name: '新建' })[0]);
    fireEvent.click(screen.getByText('Upload test Skill'));
    await waitFor(() => expect(apiMocks.post).toHaveBeenCalledWith('/api/skill/upload', expect.objectContaining({ scope: 'project', agentDir })));
    fireEvent.click(screen.getByText('Import test folder'));
    await waitFor(() => expect(apiMocks.post).toHaveBeenCalledWith('/api/skill/import-folder', { folderPath: '/source/skill', scope: 'project', agentDir }));
    fireEvent.click(screen.getByText('Open URL installer'));
    fireEvent.click(screen.getByText('Preview test URL'));
    fireEvent.click(screen.getByText('Confirm test URL'));
    expect(apiMocks.post).toHaveBeenCalledWith('/api/skill/install-from-url', { url: 'https://example.com/skill.zip', scope: 'project', agentDir, confirmedSelection: undefined });
    expect(apiMocks.post).toHaveBeenCalledWith('/api/skill/install-from-url', { url: 'https://example.com/skill.zip', scope: 'project', agentDir, confirmedSelection: { folderNames: ['review'] } });
  });

  it('keeps user scope independent of the selected Bot', async () => {
    render(<SkillsCommandsList scope="user" agentDir="/bot-a" onSelectSkill={vi.fn()} onSelectCommand={vi.fn()} />);
    await waitFor(() => expect(screen.getAllByRole('button', { name: '新建' })).toHaveLength(2));
    fireEvent.click(screen.getAllByRole('button', { name: '新建' })[0]);
    fireEvent.click(screen.getByText('Import test folder'));
    await waitFor(() => expect(apiMocks.post).toHaveBeenCalledWith('/api/skill/import-folder', { folderPath: '/source/skill', scope: 'user' }));
  });
});

describe('SkillsCommandsList navigation admission', () => {
  beforeEach(() => {
    apiMocks.get.mockReset().mockResolvedValue({ success: true, skills: [optionalSkill], commands: [] });
    apiMocks.post.mockReset();
    apiMocks.interactionProbe.mockReset();
  });

  it('guards the URL input and retains the lock after closing its dialog until installation settles', async () => {
    let finish!: (value: { success: boolean }) => void;
    apiMocks.post.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const ref = createRef<SkillsCommandsListRef>();
    render(<SkillsCommandsList ref={ref} scope="project" agentDir="/bot-a" onSelectSkill={vi.fn()} onSelectCommand={vi.fn()} />);
    await screen.findByText('review');
    expect(ref.current?.isEditing()).toBe(false);
    fireEvent.click(screen.getAllByRole('button', { name: '新建' })[0]);
    expect(ref.current?.isEditing()).toBe(true);
    fireEvent.click(screen.getByText('Open URL installer'));
    fireEvent.change(screen.getByRole('textbox', { name: 'URL input' }), { target: { value: 'https://example.com/my-skill.zip' } });
    expect(ref.current?.isEditing()).toBe(true);
    fireEvent.click(screen.getByText('Preview test URL'));
    fireEvent.click(screen.getByText('Cancel URL installer'));
    expect(ref.current?.isEditing()).toBe(true);
    await act(async () => { finish({ success: false }); });
    expect(ref.current?.isEditing()).toBe(false);
  });

  it('guards file reading synchronously and upload after the chooser closes, then releases on failure', async () => {
    let finish!: (value: { success: boolean }) => void;
    apiMocks.post.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const ref = createRef<SkillsCommandsListRef>();
    apiMocks.interactionProbe.mockImplementation(() => expect(ref.current?.isEditing()).toBe(true));
    render(<SkillsCommandsList ref={ref} scope="project" agentDir="/bot-a" onSelectSkill={vi.fn()} onSelectCommand={vi.fn()} />);
    await screen.findByText('review');
    fireEvent.click(screen.getAllByRole('button', { name: '新建' })[0]);
    fireEvent.click(screen.getByText('Upload test Skill'));
    expect(apiMocks.interactionProbe).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByText('Cancel test chooser'));
    expect(ref.current?.isEditing()).toBe(true);
    await waitFor(() => expect(apiMocks.post).toHaveBeenCalledWith('/api/skill/upload', expect.objectContaining({ agentDir: '/bot-a' })));
    expect(ref.current?.isEditing()).toBe(true);
    await act(async () => { finish({ success: false }); });
    expect(ref.current?.isEditing()).toBe(false);
  });

  it('guards folder import after dialog cancellation and releases once the server responds', async () => {
    let finish!: (value: { success: boolean }) => void;
    apiMocks.post.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const ref = createRef<SkillsCommandsListRef>();
    render(<SkillsCommandsList ref={ref} scope="project" agentDir="/bot-a" onSelectSkill={vi.fn()} onSelectCommand={vi.fn()} />);
    await screen.findByText('review');
    fireEvent.click(screen.getAllByRole('button', { name: '新建' })[0]);
    fireEvent.click(screen.getByText('Import test folder'));
    fireEvent.click(screen.getByText('Cancel test chooser'));
    expect(ref.current?.isEditing()).toBe(true);
    await act(async () => { finish({ success: false }); });
    expect(ref.current?.isEditing()).toBe(false);
  });

  it('guards capability persistence before the batched render and releases after failure', async () => {
    let fail!: (reason: Error) => void;
    const ref = createRef<SkillsCommandsListRef>();
    apiMocks.post.mockImplementation(() => {
      expect(ref.current?.isEditing()).toBe(true);
      return new Promise((_resolve, reject) => { fail = reject; });
    });
    render(<SkillsCommandsList ref={ref} scope="project" agentDir="/bot-a" onSelectSkill={vi.fn()} onSelectCommand={vi.fn()} />);
    await screen.findByText('review');
    fireEvent.click(screen.getByRole('switch'));
    expect(ref.current?.isEditing()).toBe(true);
    await act(async () => { fail(new Error('save unavailable')); });
    expect(ref.current?.isEditing()).toBe(false);
  });
});

describe('SkillsCommandsList command creation and internal transitions', () => {
  beforeEach(() => {
    apiMocks.get.mockReset().mockResolvedValue({ success: true, skills: [optionalSkill], commands: [] });
    apiMocks.post.mockReset();
  });
  it.each(['/bot-a', '/bot-b'])('creates commands in %s and keeps navigation guarded while saving', async agentDir => {
    let finish!: (value: { success: boolean }) => void;
    apiMocks.post.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const ref = createRef<SkillsCommandsListRef>();
    render(<SkillsCommandsList ref={ref} scope="project" agentDir={agentDir} onSelectSkill={vi.fn()} onSelectCommand={vi.fn()} />);
    await screen.findByText('review');
    fireEvent.click(screen.getAllByRole('button', { name: '新建' })[1]);
    expect(ref.current?.isEditing()).toBe(true);
    fireEvent.change(screen.getByRole('textbox', { name: 'New command name' }), { target: { value: 'ship' } });
    fireEvent.click(screen.getByText('Confirm new command'));
    expect(apiMocks.post).toHaveBeenCalledWith('/api/command-item/create', { name: 'ship', description: undefined, scope: 'project', agentDir });
    fireEvent.click(screen.getByText('Cancel new command'));
    expect(ref.current?.isEditing()).toBe(true);
    await act(async () => { finish({ success: false }); });
    expect(ref.current?.isEditing()).toBe(false);
  });

  it('keeps the lock while quick creation transitions from chooser to a pending server request', async () => {
    let finish!: (value: { success: boolean }) => void;
    apiMocks.post.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const ref = createRef<SkillsCommandsListRef>();
    render(<SkillsCommandsList ref={ref} scope="project" agentDir="/bot-a" onSelectSkill={vi.fn()} onSelectCommand={vi.fn()} />);
    await screen.findByText('review');
    fireEvent.click(screen.getAllByRole('button', { name: '新建' })[0]);
    fireEvent.click(screen.getByText('Write test Skill'));
    expect(screen.queryByText('Cancel test chooser')).toBeNull();
    expect(ref.current?.isEditing()).toBe(true);
    await act(async () => { finish({ success: false }); });
    expect(ref.current?.isEditing()).toBe(false);
  });

  it('does not unmount the guarded list by opening details during an in-flight toggle', async () => {
    let finish!: (value: { success: boolean }) => void;
    apiMocks.post.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const onSelectSkill = vi.fn();
    render(<SkillsCommandsList scope="project" agentDir="/bot-a" onSelectSkill={onSelectSkill} onSelectCommand={vi.fn()} />);
    const title = await screen.findByText('review');
    fireEvent.click(screen.getByRole('switch'));
    fireEvent.click(title.closest('.group')!);
    expect(onSelectSkill).not.toHaveBeenCalled();
    await act(async () => { finish({ success: false }); });
  });
});

describe('SkillsCommandsList background refresh', () => {
  it('keeps the URL input mounted and guarded while inventory refresh is pending', async () => {
    apiMocks.get.mockReset().mockResolvedValue({ success: true, skills: [optionalSkill], commands: [] });
    const ref = createRef<SkillsCommandsListRef>();
    const props = { scope: 'project' as const, agentDir: '/bot-a', onSelectSkill: vi.fn(), onSelectCommand: vi.fn() };
    const view = render(<SkillsCommandsList ref={ref} {...props} refreshKey={0} />);
    await screen.findByText('review');
    fireEvent.click(screen.getAllByRole('button', { name: '新建' })[0]);
    fireEvent.click(screen.getByText('Open URL installer'));
    const input = screen.getByRole('textbox', { name: 'URL input' });
    fireEvent.change(input, { target: { value: 'retained URL draft' } });
    let finish!: (value: { success: boolean; skills: SkillItem[]; commands: CommandItem[] }) => void;
    apiMocks.get.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    view.rerender(<SkillsCommandsList ref={ref} {...props} refreshKey={1} />);
    expect(screen.getByRole('textbox', { name: 'URL input' })).toBe(input);
    expect(input).toHaveValue('retained URL draft');
    expect(ref.current?.isEditing()).toBe(true);
    await act(async () => { finish({ success: true, skills: [optionalSkill], commands: [] }); });
    expect(screen.getByRole('textbox', { name: 'URL input' })).toBe(input);
    expect(input).toHaveValue('retained URL draft');
  });
});
