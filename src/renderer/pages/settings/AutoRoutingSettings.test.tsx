import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { i18n } from '@/i18n';
import { AutoRoutingSettings, type AutoRouteTiersView } from './AutoRoutingSettings';

const view: AutoRouteTiersView = {
  enabled: true,
  classifier: { providerId: 'p', model: 'claude-haiku-5-5', chosenBy: 'auto' },
  tiers: {
    fast: [{ providerId: 'p', model: 'claude-haiku-5-5', modelName: 'Haiku 5.5' }],
    balanced: [{ providerId: 'p', model: 'claude-sonnet-5-5', modelName: 'Sonnet 5.5' }],
    strong: [
      { providerId: 'p', model: 'claude-opus-5-5', modelName: 'Opus 5.5' },
      { providerId: 'q', model: 'grok-4.7' },
    ],
  },
};
const names = { p: 'Fixture', q: 'Other' };

afterEach(cleanup);
beforeEach(async () => { await i18n.changeLanguage('en-US'); });

describe('auto routing settings card', () => {
  it('shows three tiers, the automatic classifier and the privacy note; on by default', async () => {
    render(<AutoRoutingSettings value={undefined} updateConfig={vi.fn()} loadTiers={async () => view} providerNames={names} />);
    expect(screen.getByRole('switch', { name: 'Enable auto model selection' })).toHaveAttribute('aria-checked', 'true');
    const strong = await screen.findByRole('group', { name: 'Strong' });
    expect(within(strong).getAllByRole('listitem').map(item => item.textContent)).toEqual([
      expect.stringContaining('Fixture · Opus 5.5'),
      expect.stringContaining('Other · grok-4.7'),
    ]);
    expect(screen.getByRole('group', { name: 'Fast' })).toHaveTextContent('Fixture · Haiku 5.5');
    expect(screen.getByText('Classifier: Fixture · Haiku 5.5 (auto)')).toBeVisible();
    expect(screen.getByText(/The classifier receives this message/)).toBeVisible();
  });

  it('turning off writes enabled:false through the config owner', async () => {
    const update = vi.fn().mockResolvedValue(undefined);
    render(<AutoRoutingSettings value={undefined} updateConfig={update} loadTiers={async () => view} />);
    fireEvent.click(screen.getByRole('switch', { name: 'Enable auto model selection' }));
    await waitFor(() => expect(update).toHaveBeenCalledWith({ autoRouting: { enabled: false } }));
  });

  it('reordering inside a tier writes the whole tier order', async () => {
    const update = vi.fn().mockResolvedValue(undefined);
    render(<AutoRoutingSettings value={undefined} updateConfig={update} loadTiers={async () => view} providerNames={names} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Move Other · grok-4.7 up' }));
    await waitFor(() => expect(update).toHaveBeenCalledWith({
      autoRouting: { tierOrder: { strong: ['q/grok-4.7', 'p/claude-opus-5-5'] } },
    }));
  });

  it('moving a model between tiers writes a tier override and keeps other settings', async () => {
    const update = vi.fn().mockResolvedValue(undefined);
    const value = { tierOrder: { fast: ['p/claude-haiku-5-5'] } };
    render(<AutoRoutingSettings value={value} updateConfig={update} loadTiers={async () => view} providerNames={names} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Move Fixture · Sonnet 5.5 to a stronger tier' }));
    await waitFor(() => expect(update).toHaveBeenCalledWith({
      autoRouting: { ...value, tierOverrides: { 'p/claude-sonnet-5-5': 'strong' } },
    }));
    expect(screen.getByRole('button', { name: 'Move Fixture · Opus 5.5 to a stronger tier' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move Fixture · Haiku 5.5 to a faster tier' })).toBeDisabled();
  });

  it('reports a failed tier read and a failed save', async () => {
    const update = vi.fn().mockRejectedValue(new Error('disk'));
    const { unmount } = render(<AutoRoutingSettings value={undefined} updateConfig={update} loadTiers={async () => { throw new Error('offline'); }} />);
    expect(await screen.findByText('Could not load tiers. Try again later.')).toBeVisible();
    fireEvent.click(screen.getByRole('switch', { name: 'Enable auto model selection' }));
    expect(await screen.findByText('Could not save. Try again.')).toBeVisible();
    unmount();
  });
});
