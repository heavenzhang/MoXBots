import { act, fireEvent, screen, render as renderDom } from '@testing-library/react';
import type { ReactElement } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
import { ThemeRuntimeProvider } from '@/theme';
import type { Message } from '@/types/chat';
import { SessionFilesButton } from './SessionFilesButton';

const mocks = vi.hoisted(() => ({ open: vi.fn() }));
vi.mock('@/context/FileActionContext', () => ({ useFileAction: () => ({ workspacePath: '/workspace', openFileTarget: mocks.open }) }));
const messages: Message[] = [{ id: 'source', role: 'assistant', content: '[周报](reports/week.docx) [汇总](summary.pdf)', timestamp: new Date(0) }];
const props = () => ({ active: true, messages, hasMoreBefore: false, onLoadOlder: vi.fn().mockResolvedValue(undefined), onNavigate: vi.fn() });
// Keep the provider as a stable wrapper when testing the same mounted Session.
const render = (ui: ReactElement) => renderDom(ui, { wrapper: ({ children }) =>
  <ThemeRuntimeProvider selection={{ themeId: 'myagents-default', appearanceMode: 'light' }}>{children}</ThemeRuntimeProvider>,
});
beforeEach(() => vi.clearAllMocks());

it('keeps the list closed, then searches and opens through the original FileAction owner', () => {
  render(<SessionFilesButton {...props()} />);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(mocks.open).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: '成果与文件' }));
  const search = screen.getByRole('searchbox');
  expect(search).toHaveFocus();
  fireEvent.change(search, { target: { value: 'week' } });
  expect(screen.queryByTitle('summary.pdf')).not.toBeInTheDocument();
  fireEvent.click(screen.getByTitle('reports/week.docx'));
  expect(mocks.open).toHaveBeenCalledWith({ scope: 'workspace', path: 'reports/week.docx' }, { displayPath: 'reports/week.docx' });
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: '成果与文件' })).toHaveFocus();
});

it('navigates to the exact source without opening a file and returns focus on Escape', () => {
  const p = props(); render(<SessionFilesButton {...p} />);
  const trigger = screen.getByRole('button', { name: '成果与文件' });
  fireEvent.click(trigger);
  fireEvent.click(screen.getByRole('button', { name: '查看 reports/week.docx 的来源消息' }));
  expect(p.onNavigate).toHaveBeenCalledWith('source');
  expect(mocks.open).not.toHaveBeenCalled();
  fireEvent.click(trigger);
  fireEvent.keyDown(screen.getByRole('searchbox'), { key: 'Escape' });
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(trigger).toHaveFocus();
});

it('keeps existing files and query through a failed earlier-page load, then retries', async () => {
  const p = props(); p.hasMoreBefore = true; p.onLoadOlder.mockRejectedValueOnce(new Error('offline'));
  render(<SessionFilesButton {...p} />);
  fireEvent.click(screen.getByRole('button', { name: '成果与文件' }));
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'week' } });
  await act(async () => fireEvent.click(screen.getByRole('button', { name: '加载更早记录' })));
  expect(screen.getByRole('alert')).toHaveTextContent('加载失败');
  expect(screen.getByRole('searchbox')).toHaveValue('week');
  expect(screen.getByTitle('reports/week.docx')).toBeVisible();
  await act(async () => fireEvent.click(screen.getByRole('button', { name: '加载更早记录' })));
  expect(p.onLoadOlder).toHaveBeenCalledTimes(2);
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

it('resets the panel on a keyed Session change so old files cannot be acted on', () => {
  const p = props(); const view = render(<SessionFilesButton key="first" {...p} />);
  fireEvent.click(screen.getByRole('button', { name: '成果与文件' }));
  view.rerender(<SessionFilesButton key="second" {...p} messages={[]} />);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '成果与文件' }));
  expect(screen.queryByTitle('reports/week.docx')).not.toBeInTheDocument();
  expect(screen.getByText(/暂未找到文件记录/)).toBeVisible();
});

it('retires a cached hidden tab portal and does not reopen it when returning', () => {
  const p = props(); const view = render(<SessionFilesButton {...p} />);
  fireEvent.click(screen.getByRole('button', { name: '成果与文件' }));
  expect(screen.getByRole('dialog')).toBeVisible();
  view.rerender(<SessionFilesButton {...p} active={false} />);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '成果与文件' })).not.toBeInTheDocument();
  view.rerender(<SessionFilesButton {...p} />);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(mocks.open).not.toHaveBeenCalled();
});

it('returns focus to search when the loaded final page removes the focused load control', async () => {
  const p = props(); p.hasMoreBefore = true;
  const view = render(<SessionFilesButton {...p} />);
  p.onLoadOlder.mockImplementation(async () => { view.rerender(<SessionFilesButton {...p} hasMoreBefore={false} />); });
  fireEvent.click(screen.getByRole('button', { name: '成果与文件' }));
  const load = screen.getByRole('button', { name: '加载更早记录' });
  load.focus();
  await act(async () => fireEvent.click(load));
  expect(screen.queryByRole('button', { name: '加载更早记录' })).not.toBeInTheDocument();
  expect(screen.getByRole('searchbox')).toHaveFocus();
});
