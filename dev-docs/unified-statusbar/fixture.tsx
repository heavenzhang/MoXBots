import { createContext, useContext } from "react";
import type { Message, AgentStatusTodoSnapshot } from "@/types/chat";
const messages: Message[] = [
  {
    id: "a",
    role: "assistant",
    timestamp: new Date(1000),
    content: [
      {
        id: "b",
        type: "tool_use",
        tool: {
          id: "child",
          name: "Agent",
          input: {},
          streamIndex: 0,
          parsedInput: { description: "检查交互与响应式布局" },
          result: "审阅结果已回传。",
          subagentLifecycle: {
            status: "completed",
            startedAt: 1000,
            finishedAt: 2000,
            model: "review-model",
          },
        },
      },
    ],
  },
];
const todos: AgentStatusTodoSnapshot[] = Array.from(
  { length: 11 },
  (_, index) => ({
    key: String(index),
    content: `第 ${index + 1} 项：${index === 8 ? "验证状态栏交互、原有日志和暂停入口" : "开发与验证"}`,
    activeForm: index === 8 ? "正在验证状态栏交互" : "",
    status: index < 8 ? "completed" : index === 8 ? "in_progress" : "pending",
  }),
);
export const initialTab = {
  messages,
  agentPlanTodos: todos,
  sessionId: "synthetic",
  sessionState: "running",
  streamingMessage: null,
  isSessionLoading: false,
  hasMoreBefore: false,
  loadOlderMessages: async () => {},
};
export const FixtureContext = createContext(initialTab);
export const useTabStateOptional = () => useContext(FixtureContext);
export const useTabState = useTabStateOptional;
export const useTabApiOptional = () => null;
export const useTabActive = () => true;
