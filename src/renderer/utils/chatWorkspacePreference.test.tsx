import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readWorkspacePanelPreference, rememberWorkspacePanelPreference } from './chatWorkspaceLayout';

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe('workspace panel presentation preference', () => {
  it('starts with conversation space and restores an explicit choice for only that workspace', () => {
    expect(readWorkspacePanelPreference('/first', 'inline')).toBe(false);
    rememberWorkspacePanelPreference('/first', true);
    expect(readWorkspacePanelPreference('/first', 'inline')).toBe(true);
    expect(readWorkspacePanelPreference('/second', 'inline')).toBe(false);
    // A small-window startup must not reopen a covering drawer or erase the
    // wide-window preference. Explicit open still uses the normal reducer.
    expect(readWorkspacePanelPreference('/first', 'overlay')).toBe(false);
    expect(readWorkspacePanelPreference('/first', 'inline')).toBe(true);
    rememberWorkspacePanelPreference('/first', false);
    expect(readWorkspacePanelPreference('/first', 'inline')).toBe(false);
  });

  it('keeps the UI usable when preference storage is denied', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied'); });
    expect(readWorkspacePanelPreference('/first', 'inline')).toBe(false);
    expect(() => rememberWorkspacePanelPreference('/first', true)).not.toThrow();
  });
});
