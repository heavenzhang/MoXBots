import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { i18n } from "@/i18n";
import type { Project } from "@/config/types";
import type { AgentConfig } from "../../../shared/types/agent";
import type { SidebarConversationLaunchResult } from '@/utils/sidebarConversationLaunch';
import NewBotConversationDialog from "./NewBotConversationDialog";
const projects: Project[] = [
  {
    id: "p1",
    name: "Product",
    path: "/product",
    agentId: "b1",
    providerId: null,
    permissionMode: null,
  },
  {
    id: "p2",
    name: "Sales",
    path: "/sales",
    agentId: "b2",
    providerId: null,
    permissionMode: null,
  },
];
const agents: AgentConfig[] = [
  {
    id: "b1",
    name: "Mino",
    enabled: true,
    permissionMode: "plan",
    channels: [],
  },
  {
    id: "b2",
    name: "Analyst",
    enabled: true,
    permissionMode: "plan",
    channels: [],
  },
];
async function chooseBot() {
  fireEvent.click(screen.getByRole("button", { name: "新对话" }));
  fireEvent.click(screen.getByRole("button", { name: "合作 Bot" }));
  fireEvent.click(screen.getByRole("button", { name: "Mino" }));
}
beforeEach(async () => {
  await i18n.changeLanguage("zh-CN");
});
describe("New Bot conversation", () => {
  it("requires an explicit Bot, projects only valid binding, and never silently launches", async () => {
    const onOpen = vi.fn(async () => ({ status: 'opened' as const }));
    render(
      <NewBotConversationDialog
        projects={projects}
        agents={agents}
        onOpen={onOpen}
        onClose={vi.fn()}
        onCreateBot={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "新对话" }));
    expect(screen.getByRole("button", { name: "打开对话" })).toBeDisabled();
    expect(onOpen).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "合作 Bot" }));
    fireEvent.click(screen.getByRole("button", { name: "Mino" }));
    fireEvent.click(screen.getByRole("button", { name: "所属项目" }));
    expect(
      screen.queryByRole("button", { name: "Sales" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Product" })).toBeInTheDocument();
  });
  it("preserves input after failed birth and retries the exact selected target", async () => {
    const onOpen = vi
        .fn()
        .mockResolvedValueOnce({ status: 'not-started' })
        .mockResolvedValueOnce({ status: 'opened' }),
      onClose = vi.fn();
    render(
      <NewBotConversationDialog
        projects={projects}
        agents={agents}
        onOpen={onOpen}
        onClose={onClose}
        onCreateBot={vi.fn()}
      />,
    );
    await chooseBot();
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "Keep this work" },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "发送并开始" }));
    });
    expect(screen.getByRole("alert")).toHaveTextContent("输入已保留");
    expect(screen.getByRole("textbox")).toHaveValue("Keep this work");
    expect(onClose).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "发送并开始" }));
    });
    expect(onOpen).toHaveBeenNthCalledWith(2, projects[0], {
      text: "Keep this work",
    });
    expect(onClose).toHaveBeenCalledOnce();
  });
  it("fences duplicate submit while birth is pending", async () => {
    let settle!: (v: SidebarConversationLaunchResult) => void;
    const onOpen = vi.fn(
      () =>
        new Promise<SidebarConversationLaunchResult>((resolve) => {
          settle = resolve;
        }),
    );
    render(
      <NewBotConversationDialog
        projects={projects}
        agents={agents}
        onOpen={onOpen}
        onClose={vi.fn()}
        onCreateBot={vi.fn()}
      />,
    );
    await chooseBot();
    fireEvent.click(screen.getByRole("button", { name: "打开对话" }));
    expect(screen.getByRole("button", { name: "正在打开…" })).toBeDisabled();
    fireEvent.submit(screen.getByRole("textbox").closest("form")!);
    expect(onOpen).toHaveBeenCalledOnce();
    await act(async () => settle({ status: 'not-started' }));
  });
  it("treats an unclassified rejected callback as uncertain and keeps the receipt across dismissal", async () => {
    const onOpen = vi.fn().mockRejectedValueOnce(new Error('response lost'));
    const props = { projects, agents, onOpen, onClose: vi.fn(), onCreateBot: vi.fn() };
    const view = render(<NewBotConversationDialog {...props} />);
    await chooseBot();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'keep original' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '发送并开始' })); });
    expect(screen.getByRole('alert')).toHaveTextContent('启动结果暂未确认');
    view.rerender(<NewBotConversationDialog {...props} open={false} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    view.rerender(<NewBotConversationDialog {...props} open />);
    expect(screen.getByRole('textbox')).toHaveValue('keep original');
    fireEvent.submit(screen.getByRole('textbox').closest('form')!);
    expect(onOpen).toHaveBeenCalledOnce();
  });
  it("rejects a removed binding at submission and keeps the draft", async () => {
    const onOpen = vi.fn(async () => ({ status: 'opened' as const })),
      onClose = vi.fn();
    const { rerender } = render(
      <NewBotConversationDialog
        projects={projects}
        agents={agents}
        onOpen={onOpen}
        onClose={onClose}
        onCreateBot={vi.fn()}
      />,
    );
    await chooseBot();
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "Do not lose this" },
    });
    rerender(
      <NewBotConversationDialog
        projects={[]}
        agents={agents}
        onOpen={onOpen}
        onClose={onClose}
        onCreateBot={vi.fn()}
      />,
    );
    await act(async () => {
      fireEvent.submit(screen.getByRole("textbox").closest("form")!);
    });
    expect(onOpen).not.toHaveBeenCalled();
    expect(screen.getByRole("textbox")).toHaveValue("Do not lose this");
    expect(screen.getByRole("alert")).toHaveTextContent("当前可用");
  });
});
