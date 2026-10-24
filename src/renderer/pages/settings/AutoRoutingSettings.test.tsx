import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { useCallback, useMemo, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { i18n } from '@/i18n';
import type { AutoRoutingSettings as Settings } from '../../../shared/autoRoute';
import { AutoRoutingSettings, type AutoRouteTiersView } from './AutoRoutingSettings';

const view: AutoRouteTiersView = {
  enabled: true,
  classifier: { providerId: 'p', model: 'claude-haiku-5-5', chosenBy: 'auto' },
  tiers: {
    fast: [{ providerId: 'p', model: 'claude-haiku-5-5', modelName: 'Haiku 5.5' }],
    balanced: [{ providerId: 'p', model: 'claude-sonnet-5-5', modelName: 'Sonnet 5.5' }],
    strong: [
      { providerId: 'p', model: 'claude-opus-5-5', modelName: 'Opus 5.5' },
      { providerId: 'q', model: 'grok-4.7', modelName: 'Grok 4.7' },
    ],
  },
  models: [
    { providerId: 'p', model: 'claude-haiku-5-5', modelName: 'Haiku 5.5', providerName: 'Fixture', tier: 'fast', source: 'catalog', inPool: true, enabled: true, available: true },
    { providerId: 'p', model: 'claude-sonnet-5-5', modelName: 'Sonnet 5.5', providerName: 'Fixture', tier: 'balanced', source: 'catalog', inPool: true, enabled: true, available: true },
    { providerId: 'p', model: 'claude-opus-5-5', modelName: 'Opus 5.5', providerName: 'Fixture', tier: 'strong', source: 'catalog', inPool: true, enabled: true, available: true },
    { providerId: 'q', model: 'grok-4.7', modelName: 'Grok 4.7', providerName: 'Other', tier: 'strong', source: 'name', inPool: true, enabled: true, available: true },
    { providerId: 'q', model: 'new-chat', modelName: 'New Chat', providerName: 'Other', tier: 'balanced', source: 'default', inPool: false, enabled: false, available: true },
    { providerId: 'q', model: 'embedding-v2', modelName: 'Embedding', providerName: 'Other', tier: 'fast', source: 'default', inPool: false, enabled: false, available: false, unavailableReason: 'not-chat' },
    { providerId: 'z', model: 'broken-model', providerName: 'Broken', tier: 'balanced', source: 'default', inPool: true, enabled: true, available: false, unavailableReason: 'provider-disabled' },
  ],
};
const names = { p: 'Fixture', q: 'Other' };
const load = async () => view;
const renderCard = (props: Partial<ComponentProps<typeof AutoRoutingSettings>> = {}) => render(
  <AutoRoutingSettings value={undefined} updateConfig={vi.fn().mockResolvedValue(undefined)} loadTiers={load} providerNames={names} {...props} />,
);
function StatefulCard() {
  const [value, setValue] = useState<unknown>({});
  const settings = value as Settings;
  const tierOrder = settings.tierOrder?.strong;
  const tiers = useMemo(() => ({ ...view.tiers, strong: [...view.tiers.strong].sort((left, right) => {
    const leftIndex = tierOrder?.indexOf(`${left.providerId}/${left.model}`) ?? -1;
    const rightIndex = tierOrder?.indexOf(`${right.providerId}/${right.model}`) ?? -1;
    return (leftIndex < 0 ? Number.MAX_SAFE_INTEGER : leftIndex) - (rightIndex < 0 ? Number.MAX_SAFE_INTEGER : rightIndex);
  }) }), [tierOrder]);
  const load = useCallback(async () => ({ ...view, tiers }), [tiers]);
  const modify = useCallback(async (modifier: (current: Settings) => Settings) => setValue((current: unknown) => modifier(current as Settings)), []);
  return <AutoRoutingSettings value={value} updateConfig={async patch => setValue(patch.autoRouting)} loadTiers={load} providerNames={names} modifySettings={modify} />;
}

afterEach(cleanup);
beforeEach(async () => { await i18n.changeLanguage('en-US'); });

describe('auto routing candidate pool settings', () => {
  it('shows policy state, tier counts, full model identity, source and the specified readiness boundary', async () => {
    renderCard();
    expect(await screen.findByText(/Changes take effect next turn/)).toBeVisible();
    expect(screen.getByText(/Candidate pool follows the provider directory/)).toBeVisible();
    expect(screen.getByLabelText('Available models by tier')).toHaveTextContent('Fast1Balanced1Strong2');
    expect(screen.getByText('Haiku 5.5')).toBeVisible();
    expect(screen.getByText('Fixture · claude-haiku-5-5')).toBeVisible();
    expect(screen.getByText(/does not verify a live model call/i)).toBeVisible();
  });

  it('keeps old tier-only callers working and reports model readiness without claiming live tests', async () => {
    const oldView = { ...view, models: undefined };
    render(<AutoRoutingSettings value={undefined} updateConfig={vi.fn()} loadTiers={async () => oldView} providerNames={names} />);
    expect(await screen.findByText('Haiku 5.5')).toBeVisible();
    expect(screen.getByText(/setup status does not verify a live model call/i)).toBeVisible();
    expect(screen.getByText('Classifier: automatic selection')).toBeVisible();
  });

  it('uses a pure modifier against the latest settings when toggling global automatic selection', async () => {
    const modify = vi.fn(async (modifier: (current: Settings) => Settings) => {
      const legacyModelFailover = { enabled: true, mode: 'specified', allowCrossTier: true, backup: { providerId: 'q', modelId: 'legacy-model' } };
      const latest = { autoRouting: { classifier: { providerId: 'p', model: 'claude-opus-5-5' }, tierOverrides: { 'p/claude-haiku-5-5': 'balanced' as const } }, modelFailover: legacyModelFailover };
      const first = modifier(latest.autoRouting); const second = modifier(latest.autoRouting);
      expect(first).toEqual(second);
      expect(first).toEqual({ ...latest.autoRouting, enabled: false });
      expect({ ...latest, autoRouting: first }.modelFailover).toEqual(legacyModelFailover);
    });
    renderCard({ modifySettings: modify, value: undefined });
    fireEvent.click(await screen.findByRole('button', { name: 'Add models' }));
    expect(await screen.findByText('New Chat')).toBeVisible();
    fireEvent.click(screen.getByRole('switch', { name: 'Enable auto model selection' }));
    await waitFor(() => expect(modify).toHaveBeenCalledTimes(1));
  });

  it('adds selected directory models to a manual pool and assigns their chosen tier', async () => {
    const update = vi.fn().mockResolvedValue(undefined);
    renderCard({ updateConfig: update, value: undefined });
    fireEvent.click(await screen.findByRole('button', { name: 'Add models' }));
    const add = await screen.findByRole('checkbox', { name: /New Chat.*new-chat/ });
    expect(screen.getByRole('checkbox', { name: /Embedding.*embedding-v2/ })).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText('Search model name, provider, or ID'), { target: { value: 'new-chat' } });
    expect(screen.getByRole('checkbox', { name: /New Chat.*new-chat/ })).toBeVisible();
    expect(screen.queryByRole('checkbox', { name: /Embedding.*embedding-v2/ })).not.toBeInTheDocument();
    fireEvent.click(add);
    fireEvent.click(screen.getByRole('button', { name: 'Add 1 selected' }));
    await waitFor(() => expect(update).toHaveBeenCalledWith({ autoRouting: {
      pool: { 'p/claude-haiku-5-5': { enabled: true }, 'p/claude-sonnet-5-5': { enabled: true }, 'p/claude-opus-5-5': { enabled: true }, 'q/grok-4.7': { enabled: true }, 'z/broken-model': { enabled: true }, 'q/new-chat': { enabled: true } },
      tierOverrides: { 'q/new-chat': 'balanced' },
    } }));
  });

  it('confirms pause and clears a classifier that points at the paused model', async () => {
    const update = vi.fn().mockResolvedValue(undefined);
    const value = { classifier: { providerId: 'p', model: 'claude-haiku-5-5' } };
    renderCard({ updateConfig: update, value });
    fireEvent.click((await screen.findAllByRole('button', { name: 'Pause' }))[0]);
    expect(await screen.findByText(/Any matching classifier setting will also be cleared/)).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(update).toHaveBeenCalledWith({ autoRouting: {
      pool: { 'p/claude-haiku-5-5': { enabled: false }, 'p/claude-sonnet-5-5': { enabled: true }, 'p/claude-opus-5-5': { enabled: true }, 'q/grok-4.7': { enabled: true }, 'z/broken-model': { enabled: true } },
    } }));
  });

  it('keeps existing unavailable settings visible and restores the classifier to automatic', async () => {
    const update = vi.fn().mockResolvedValue(undefined);
    renderCard({ updateConfig: update, value: { classifier: { providerId: 'gone', model: 'old-model' } } });
    expect(await screen.findByRole('alert')).toHaveTextContent('Saved classifier gone · old-model is unavailable');
    fireEvent.click(screen.getByRole('button', { name: 'Restore automatic classifier' }));
    await waitFor(() => expect(update).toHaveBeenCalledWith({ autoRouting: {} }));
  });

  it('disables maintenance while loading and after catalog load failure, then offers retry', async () => {
    let resolveLoad!: (next: AutoRouteTiersView) => void;
    const loadSlow = () => new Promise<AutoRouteTiersView>(resolve => { resolveLoad = resolve; });
    const update = vi.fn();
    const { rerender } = render(<AutoRoutingSettings value={undefined} updateConfig={update} loadTiers={loadSlow} />);
    expect(screen.getByRole('switch', { name: 'Enable auto model selection' })).toBeDisabled();
    resolveLoad(view);
    expect(await screen.findByText('Haiku 5.5')).toBeVisible();
    rerender(<AutoRoutingSettings value={undefined} updateConfig={update} loadTiers={async () => { throw new Error('offline'); }} />);
    expect(await screen.findByText('Could not load tiers.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeVisible();
    expect(screen.getByRole('switch', { name: 'Enable auto model selection' })).toBeDisabled();
    expect(update).not.toHaveBeenCalled();
  });

  it('keeps legacy failover config outside candidate-pool updates', async () => {
    const update = vi.fn().mockResolvedValue(undefined);
    const legacyModelFailover = { enabled: true, mode: 'specified', allowCrossTier: true, backup: { providerId: 'q', modelId: 'legacy-model' } };
    const modify = vi.fn(async (modifier: (current: Settings) => Settings) => {
      const latest = { autoRouting: {}, modelFailover: legacyModelFailover };
      const updated = { ...latest, autoRouting: modifier(latest.autoRouting) };
      expect(updated.modelFailover).toEqual(legacyModelFailover);
      expect(updated.autoRouting.pool?.['q/new-chat']).toEqual({ enabled: true });
    });
    renderCard({ updateConfig: update, value: undefined, modifySettings: modify });
    expect(await screen.findByRole('region', { name: 'Auto model selection' })).toBeVisible();
    expect(screen.queryByText(/specified backup after removal/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add models' }));
    fireEvent.click(await screen.findByRole('checkbox', { name: /New Chat.*new-chat/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Add 1 selected' }));
    await waitFor(() => expect(modify).toHaveBeenCalledTimes(1));
    expect(update).not.toHaveBeenCalled();
  });

  it('reorders the rendered effective tier list and marks its first priority', async () => {
    render(<StatefulCard />);
    const list = await screen.findByRole('list');
    expect(within(list).getAllByRole('listitem').map(item => item.textContent)).toEqual([
      expect.stringContaining('Haiku 5.5'), expect.stringContaining('Sonnet 5.5'),
      expect.stringContaining('Opus 5.5'), expect.stringContaining('Grok 4.7'),
    ]);
    fireEvent.click(screen.getByRole('button', { name: 'Move Fixture · Opus 5.5 down' }));
    await waitFor(() => expect(within(screen.getByRole('list')).getAllByRole('listitem').map(item => item.textContent)).toEqual([
      expect.stringContaining('Haiku 5.5'), expect.stringContaining('Sonnet 5.5'),
      expect.stringContaining('Grok 4.7'), expect.stringContaining('Opus 5.5'),
    ]));
    expect(within(screen.getByRole('list')).getAllByText('First priority')).toHaveLength(3);
  });

  it('clears the old batch selection when search changes the visible list', async () => {
    renderCard();
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Select visible (4)' }));
    expect(screen.getByText('4 selected')).toBeVisible();
    fireEvent.change(screen.getByPlaceholderText('Search model, name, or provider'), { target: { value: 'Sonnet' } });
    expect(screen.queryByText('4 selected')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Pause selected' })).not.toBeInTheDocument();
  });

  it('selects a model from its identity hit area without making row controls part of the label', async () => {
    renderCard();
    const list = await screen.findByRole('list');
    const row = within(list).getAllByRole('listitem')[0];
    const checkbox = within(row).getByRole('checkbox', { name: 'Select Fixture · Haiku 5.5' });
    fireEvent.click(within(row).getByText('Haiku 5.5'));
    expect(checkbox).toBeChecked();
    fireEvent.click(within(row).getByRole('button', { name: 'Move Fixture · Haiku 5.5 down' }));
    expect(checkbox).toBeChecked();
  });

  it('keeps batch selection and confirmation available after a failed save', async () => {
    const update = vi.fn().mockRejectedValue(new Error('disk unavailable'));
    renderCard({ updateConfig: update });
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Select Fixture · Haiku 5.5' }));
    fireEvent.click(screen.getByRole('button', { name: 'Pause selected' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not save. Try again.');
    expect(screen.getByText('1 selected')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeVisible();
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('reports an undo conflict instead of applying an inverse over a newer setting', async () => {
    let current: Settings = {};
    const modify = async (modifier: (latest: Settings) => Settings) => { current = modifier(current); };
    renderCard({ modifySettings: modify });
    await screen.findByRole('list');
    fireEvent.click(screen.getByRole('switch', { name: 'Enable auto model selection' }));
    expect(await screen.findByRole('button', { name: 'Undo' })).toBeVisible();
    current = { ...current, enabled: true };
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Undo was skipped because this setting changed after the save');
  });
});
