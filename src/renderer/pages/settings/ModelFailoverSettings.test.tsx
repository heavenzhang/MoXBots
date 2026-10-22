import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { i18n } from '@/i18n';
import type { Provider } from '../../../shared/config-types';
import { ModelFailoverSettings } from './ModelFailoverSettings';

const provider: Provider = {
  id: 'backup-provider', name: 'Backup Provider', vendor: 'custom', cloudProvider: 'fixture', type: 'api',
  isBuiltin: false, apiProtocol: 'openai', config: { baseUrl: 'https://fixture.invalid' }, enabled: true,
  primaryModel: 'backup-model', models: [{ model: 'backup-model', modelName: 'Backup Model', modelSeries: 'fixture' }],
};
const backup = { providerId: provider.id, modelId: 'backup-model' };
const keys = { [provider.id]: 'fixture-key' };

async function chooseMode(label: string) {
  fireEvent.click(screen.getByRole('button', { name: 'Failure recovery mode' }));
  fireEvent.click(await screen.findByRole('button', { name: label }));
}

afterEach(cleanup);
beforeEach(async () => { await i18n.changeLanguage('en-US'); });

describe('backup model settings', () => {
  it('defaults to same-tier automatic failover and keeps cross-tier selection off', () => {
    render(<ModelFailoverSettings value={undefined} providers={[provider]} apiKeys={keys} updateConfig={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Failure recovery mode' })).toHaveTextContent('Follow automatic model selection');
    expect(screen.getByRole('checkbox', { name: /different tier/ })).not.toBeChecked();
  });

  it('selects exactly one provider/model through the config owner without enabling specified mode', async () => {
    const update = vi.fn().mockResolvedValue(undefined);
    render(<ModelFailoverSettings value={undefined} providers={[provider]} apiKeys={keys} updateConfig={update} />);
    fireEvent.click(screen.getByRole('button', { name: 'Backup provider and model' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Backup Provider · backup-model' }));
    await waitFor(() => expect(update).toHaveBeenCalledWith({ modelFailover: { enabled: false, mode: 'auto', backup } }));
    expect(document.querySelector('select')).toBeNull();
  });

  it('requires an API key and excludes disabled, subscription, runtime-backed and cloud-session providers', async () => {
    const update = vi.fn();
    const excluded: Provider[] = [
      { ...provider, id: 'disabled', name: 'Disabled Provider', enabled: false },
      { ...provider, id: 'subscription', name: 'Subscription Provider', type: 'subscription' },
      { ...provider, id: 'runtime', name: 'Runtime Provider', execution: { kind: 'runtime-backed', runtime: 'codex', source: 'managed-provider' } },
      { ...provider, id: 'cloud-session:fixture', name: 'Cloud Session Provider' },
    ];
    render(<ModelFailoverSettings value={{ enabled: true, mode: 'specified', backup }} providers={[provider, ...excluded]} apiKeys={{ [provider.id]: '  ' }} updateConfig={update} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Backup Provider · Backup Model is missing an API key.');
    fireEvent.click(screen.getByRole('button', { name: 'Backup provider and model' }));
    expect(await screen.findByRole('button', { name: 'Backup Provider · backup-model' })).toBeVisible();
    for (const item of excluded) expect(screen.queryByRole('button', { name: `${item.name} · backup-model` })).not.toBeInTheDocument();
    expect(update).not.toHaveBeenCalled();
  });

  it('searches names and IDs, supports keyboard choice, empty results and reopening', async () => {
    const update = vi.fn().mockResolvedValue(undefined);
    const many = { ...provider, models: [...provider.models, { model: 'other-id', modelName: 'Human friendly', modelSeries: 'fixture' }] };
    render(<ModelFailoverSettings value={undefined} providers={[many]} apiKeys={keys} updateConfig={update} />);
    const trigger = screen.getByRole('button', { name: 'Backup provider and model' });
    fireEvent.click(trigger);
    const search = screen.getByRole('searchbox');
    expect(search).toHaveFocus();
    fireEvent.keyDown(search, { key: 'Escape', isComposing: true });
    expect(search).toBeVisible();
    fireEvent.change(search, { target: { value: 'missing' } });
    expect(screen.getByText('No matching models. Try another search or filter.')).toBeVisible();
    fireEvent.change(search, { target: { value: 'HUMAN friendly' } });
    expect(screen.queryByRole('button', { name: /Backup Provider · backup-model/ })).toBeNull();
    fireEvent.keyDown(search, { key: 'ArrowDown' });
    const choice = screen.getByRole('button', { name: /Backup Provider · other-id/ });
    expect(choice).toHaveAccessibleDescription('Key configured');
    expect(choice).toHaveFocus();
    fireEvent.click(choice);
    await waitFor(() => expect(update).toHaveBeenCalledWith({ modelFailover: { enabled: false, mode: 'auto', backup: { providerId: provider.id, modelId: 'other-id' } } }));
    expect(trigger).toHaveFocus();
    fireEvent.click(trigger);
    expect(screen.getByRole('searchbox')).toHaveValue('');
    fireEvent.keyDown(screen.getByRole('searchbox'), { key: 'Escape' });
    expect(screen.queryByRole('searchbox')).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it('filters providers and keys without changing the saved selection or writing config', async () => {
    const update = vi.fn();
    const other = { ...provider, id: 'other-provider', name: 'Other Provider' };
    render(<ModelFailoverSettings value={{ enabled: true, mode: 'specified', backup }} providers={[provider, other]} apiKeys={keys} updateConfig={update} />);
    fireEvent.click(screen.getByRole('button', { name: 'Filter by provider' }));
    fireEvent.click(screen.getByRole('button', { name: 'Other Provider' }));
    const trigger = screen.getByRole('button', { name: 'Backup provider and model' });
    expect(trigger).toHaveTextContent('Backup Provider · backup-model');
    fireEvent.click(trigger);
    expect(screen.queryByRole('button', { name: /Backup Provider · backup-model/ })).toBeNull();
    expect(screen.getByRole('button', { name: /Other Provider · backup-model/ })).toBeVisible();
    fireEvent.keyDown(screen.getByRole('searchbox'), { key: 'Escape' });
    fireEvent.click(screen.getByRole('checkbox', { name: 'API key configured only' }));
    fireEvent.click(trigger);
    expect(screen.queryByRole('button', { name: /Other Provider · backup-model/ })).toBeNull();
    expect(trigger).toHaveTextContent('Backup Provider · backup-model');
    expect(update).not.toHaveBeenCalled();
  });

  it('enables specified mode with a ready backup and displays only persisted mode', async () => {
    const update = vi.fn().mockResolvedValue(undefined);
    const { rerender } = render(<ModelFailoverSettings value={{ enabled: false, backup }} providers={[provider]} apiKeys={keys} updateConfig={update} />);
    await chooseMode('Use specified backup');
    await waitFor(() => expect(update).toHaveBeenCalledWith({ modelFailover: { enabled: true, mode: 'specified', backup } }));
    expect(screen.getByRole('button', { name: 'Failure recovery mode' })).toHaveTextContent('Follow automatic model selection');
    rerender(<ModelFailoverSettings value={{ enabled: true, mode: 'specified', backup }} providers={[provider]} apiKeys={keys} updateConfig={update} />);
    expect(screen.getByRole('button', { name: 'Failure recovery mode' })).toHaveTextContent('Use specified backup');
  });

  it('shows an unavailable saved backup and permits turning switching off while preserving it', async () => {
    const update = vi.fn().mockResolvedValue(undefined);
    render(<ModelFailoverSettings value={{ enabled: true, backup }} providers={[]} apiKeys={keys} updateConfig={update} />);
    expect(screen.getByRole('button', { name: 'Backup provider and model' })).toHaveTextContent('Unavailable · backup-model');
    expect(screen.getByRole('alert')).toHaveTextContent('Provider is unavailable for failover.');
    expect(screen.getByRole('checkbox', { name: /different tier/ })).not.toBeDisabled();
    await chooseMode('Do not switch models');
    await waitFor(() => expect(update).toHaveBeenCalledWith({ modelFailover: { enabled: false, mode: 'off', backup } }));
  });

  it('clears the selected backup without silently changing the selected mode', async () => {
    const update = vi.fn().mockResolvedValue(undefined);
    const { rerender } = render(<ModelFailoverSettings value={{ enabled: true, mode: 'specified', backup }} providers={[provider]} apiKeys={keys} updateConfig={update} />);
    fireEvent.click(screen.getByRole('button', { name: 'Backup provider and model' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Select a backup model' }));
    await waitFor(() => expect(update).toHaveBeenCalledWith({ modelFailover: { enabled: true, mode: 'specified' } }));
    rerender(<ModelFailoverSettings value={{ enabled: true, mode: 'specified' }} providers={[provider]} apiKeys={keys} updateConfig={update} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Choose a backup model before using specified mode.');
  });

  it('keeps provider identity when two providers offer the same model, even while the replacement is keyless', async () => {
    const other = { ...provider, id: 'other-provider', name: 'Other Provider' };
    const update = vi.fn().mockResolvedValue(undefined);
    render(<ModelFailoverSettings value={{ enabled: true, mode: 'specified', backup }} providers={[provider, other]} apiKeys={keys} updateConfig={update} />);
    fireEvent.click(screen.getByRole('button', { name: 'Backup provider and model' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Other Provider · backup-model' }));
    await waitFor(() => expect(update).toHaveBeenCalledWith({ modelFailover: {
      enabled: true, mode: 'specified', backup: { providerId: 'other-provider', modelId: 'backup-model' },
    } }));
  });

  it('retains persisted settings after a save failure and allows retry', async () => {
    const update = vi.fn().mockRejectedValueOnce(new Error('disk write failed')).mockResolvedValue(undefined);
    render(<ModelFailoverSettings value={{ enabled: false, backup }} providers={[provider]} apiKeys={keys} updateConfig={update} />);
    await chooseMode('Use specified backup');
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not save. Your previous settings are unchanged. Try again.');
    expect(screen.getByRole('button', { name: 'Failure recovery mode' })).toHaveTextContent('Follow automatic model selection');
    expect(screen.getByRole('button', { name: 'Failure recovery mode' })).not.toBeDisabled();
    await chooseMode('Use specified backup');
    await waitFor(() => expect(update).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  });

  it('locks both controls during saving and prevents duplicate writes', async () => {
    let finish: (() => void) | undefined;
    const update = vi.fn().mockImplementation(() => new Promise<void>(resolve => { finish = resolve; }));
    render(<ModelFailoverSettings value={{ enabled: false, backup }} providers={[provider]} apiKeys={keys} updateConfig={update} />);
    await chooseMode('Use specified backup');
    expect(screen.getByRole('button', { name: 'Failure recovery mode' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Backup provider and model' })).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('Saving…');
    expect(update).toHaveBeenCalledTimes(1);
    await act(async () => finish?.());
    expect(screen.getByRole('button', { name: 'Failure recovery mode' })).not.toBeDisabled();
  });

  it('explains safety limits and supports the Chinese UI resource', async () => {
    await i18n.changeLanguage('zh-CN');
    render(<ModelFailoverSettings value={{ enabled: true, mode: 'specified' }} providers={[]} apiKeys={{}} updateConfig={vi.fn()} />);
    fireEvent.click(screen.getByText('切换规则与适用范围'));
    expect(screen.getByText(/仅支持 Claude Agent SDK 运行环境的 API 模型；DSH、订阅模型和外部 CLI 暂不支持/)).toBeVisible();
    expect(screen.getByText(/保留进度并停止，避免自动重复执行操作/)).toBeVisible();
    expect(screen.getByRole('button', { name: '故障接管模式' })).toHaveTextContent('使用指定备用');
  });

  it('allows the auto mode to opt into cross-tier backups and retains that choice in off mode', async () => {
    const update = vi.fn().mockResolvedValue(undefined);
    const { rerender } = render(<ModelFailoverSettings value={{ enabled: false, mode: 'auto', backup }} providers={[provider]} apiKeys={keys} updateConfig={update} />);
    const crossTier = screen.getByRole('checkbox', { name: /different tier/ });
    expect(crossTier).not.toBeChecked();
    fireEvent.click(crossTier);
    await waitFor(() => expect(update).toHaveBeenCalledWith({ modelFailover: { enabled: false, mode: 'auto', backup, allowCrossTier: true } }));
    rerender(<ModelFailoverSettings value={{ enabled: false, mode: 'off', backup, allowCrossTier: true }} providers={[provider]} apiKeys={keys} updateConfig={update} />);
    expect(screen.getByRole('checkbox', { name: /different tier/ })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /different tier/ })).toBeDisabled();
  });

  it('allows choosing specified mode before configuration and links the blocked status to providers', async () => {
    const update = vi.fn().mockResolvedValue(undefined);
    const openProviders = vi.fn();
    const { rerender } = render(<ModelFailoverSettings value={undefined} providers={[]} apiKeys={{}} updateConfig={update} onOpenProviders={openProviders} />);
    await chooseMode('Use specified backup');
    await waitFor(() => expect(update).toHaveBeenCalledWith({ modelFailover: { enabled: true, mode: 'specified' } }));
    rerender(<ModelFailoverSettings value={{ enabled: true, mode: 'specified' }} providers={[]} apiKeys={{}} updateConfig={update} onOpenProviders={openProviders} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Choose a backup model before using specified mode.');
    fireEvent.click(screen.getByRole('button', { name: 'Open model providers to fix this' }));
    expect(openProviders).toHaveBeenCalledOnce();
  });

  it('shows the exact configured model and retains backup and cross-tier preference when changing mode', async () => {
    const update = vi.fn().mockResolvedValue(undefined);
    render(<ModelFailoverSettings value={{ enabled: true, mode: 'specified', backup, allowCrossTier: true }} providers={[provider]} apiKeys={keys} updateConfig={update} />);
    expect(screen.getByText('Specified backup: Backup Provider · Backup Model')).toBeVisible();
    await chooseMode('Do not switch models');
    await waitFor(() => expect(update).toHaveBeenCalledWith({ modelFailover: { enabled: false, mode: 'off', backup, allowCrossTier: true } }));
  });
});
