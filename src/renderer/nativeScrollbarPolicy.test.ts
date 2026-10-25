import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../..');

function source(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), 'utf8');
}

describe('native scrollbar policy', () => {
  it('leaves scrollbar appearance and input states to the native WebView', () => {
    const entry = source('src/renderer/main.tsx');
    const styles = source('src/renderer/index.css');
    const floatingStyles = source('src/renderer/floating-ball/fb.css');

    expect(existsSync(resolve(root, 'src/renderer/utils/overlayScrollbarActivity.ts'))).toBe(false);
    expect(entry).not.toContain('installOverlayScrollbarActivity');
    expect(entry).not.toContain('installPlatformClass');
    expect(styles).not.toContain('scrollbar-width: thin');
    expect(styles).not.toContain('scrollbar-color:');
    expect(styles).not.toContain('myagents-scrollbar-active');
    expect(floatingStyles).not.toContain('.fbw-convo::-webkit-scrollbar');
  });

  it('keeps native theme projection and stable classic-scrollbar fallbacks outside chat', () => {
    expect(source('src/renderer/theme/ThemeRuntime.tsx')).toContain(
      'root.style.colorScheme = resolvedTheme.resolvedColorScheme',
    );

    for (const scrollOwner of [
      'src/renderer/components/global-sidebar/GlobalSidebar.tsx',
      'src/renderer/components/workspace-tree/WorkspaceTreeViewport.tsx',
      'src/renderer/components/AgentCapabilitiesPanel.tsx',
    ]) {
      expect(source(scrollOwner), scrollOwner).toMatch(/scrollbarGutter:\s*['"]stable['"]/);
    }
  });

  it('limits the hidden-scrollbar exception to the existing chat scroll surfaces', () => {
    const styles = source('src/renderer/index.css');
    expect(styles).toMatch(/\.chat-scroll-surface\s*\{\s*scrollbar-width:\s*none;\s*\}/);
    expect(styles).toMatch(/\.chat-scroll-surface::-webkit-scrollbar\s*\{\s*display:\s*none;\s*\}/);
    expect(source('src/renderer/components/MessageList.tsx')).toContain('className="h-full chat-scroll-surface"');
    expect(source('src/renderer/components/chat/QueryNavigator.tsx')).toContain('chat-scroll-surface min-h-0 overflow-y-auto');
  });

});
