import { createContext, useContext } from "react";
import type { Message, AgentStatusTodoSnapshot } from "@/types/chat";
import { emptyTaskLedger, type SessionTaskLedger } from "../../src/shared/sessionTaskOrchestration";
import type { SessionExecution } from "../../src/shared/sessionExecution";
export const execution: SessionExecution = {
  id: "execution", requestId: "request", originalInput: "优化交互",
  intent: { kind: "execute", objective: "完成输入区交互优化并核验结果", scope: "输入区", acceptanceCriteria: ["摘要紧凑清楚", "交互与草稿保持正常"] },
  phase: "running", startedAt: 100, deadlineAt: 1800100, turns: 2, reworks: 0, noProgress: 0, currentQueueId: "queue",
};
export function makeLedger(mode: string): SessionTaskLedger {
  const ledger = emptyTaskLedger();
  ledger.revision = 1;
  if (mode === "empty") return ledger;
  ledger.plan = [
    { key: "1", content: "完成交互设计", activeForm: "", status: "completed" },
    { key: "2", content: "核验键盘与窄屏交互", activeForm: "正在核验键盘与窄屏", status: "in_progress" },
    { key: "3", content: "提交并统一发布", activeForm: "", status: "pending" },
  ];
  if (mode === "unconfirmed") ledger.executionAdmission = { requestId: "request", queueId: "queue", error: "INTENT_UNCONFIRMED" };
  else ledger.execution = {
    ...execution,
    phase: ["completed", "paused", "incomplete", "rework"].includes(mode) ? mode as SessionExecution["phase"] : "running",
    intent: { ...execution.intent, objective: mode === "long" ? "优化交互并验证长内容能够完整阅读".repeat(80) : execution.intent.objective },
  };
  if (mode === "completed") ledger.plan = [];
  return ledger;
}
export const initialTab = {
  messages: [] as Message[], agentPlanTodos: [] as AgentStatusTodoSnapshot[],
  sessionId: "synthetic", sessionState: "running", streamingMessage: null,
  isSessionLoading: false, hasMoreBefore: false, loadOlderMessages: async () => {},
  apiGet: async <T,>(_path: string): Promise<T> => ({ success: true, sessionId: "synthetic", ledger: makeLedger("unconfirmed") }) as T,
  apiPost: async <T,>(): Promise<T> => { throw new Error("Read-only fixture must never submit"); },
};
export const FixtureContext = createContext(initialTab);
export const useTabStateOptional = () => useContext(FixtureContext);
export const useTabState = useTabStateOptional;
export const useTabApiOptional = () => null;
export const useTabActive = () => true;
