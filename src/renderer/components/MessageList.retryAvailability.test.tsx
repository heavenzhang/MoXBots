import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { i18n } from '@/i18n';
import MessageList from './MessageList';
vi.mock('react-virtuoso',()=>import('../../test/ConversationVirtuoso'));
vi.mock('@/context/ImagePreviewContext',()=>({useImagePreview:()=>({openPreview:vi.fn()})}));
afterEach(cleanup);
it('only renders retry when the caller supplies the capability and updates memoized rows when it changes',()=>{
 const message={id:'a',role:'assistant' as const,content:'answer',timestamp:new Date()};
 const props={messages:[message],streamingMessage:null,isLoading:false,virtuosoRef:createRef<import('react-virtuoso').VirtuosoHandle>(),followEnabledRef:{current:false},scrollToBottom:vi.fn(),handleAtBottomChange:vi.fn(),composerPlacement:'flow' as const};
 const retry=vi.fn(),label=String(i18n.t('app:message.actions.retry'));
 const view=render(<MessageList {...props}/>);
 expect(screen.queryByRole('button',{name:label})).toBeNull();
 expect(document.querySelector<HTMLElement>('[data-chat-footer-spacer]')?.style.height).toBe('16px');
 view.rerender(<MessageList {...props} onRetry={retry}/>);
 fireEvent.click(screen.getByRole('button',{name:label}));expect(retry).toHaveBeenCalledWith('a');
 view.rerender(<MessageList {...props}/>);expect(screen.queryByRole('button',{name:label})).toBeNull();
});
