import { createContext, useContext } from "react";
import type { AgentStatusTodoSnapshot } from "@/types/chat";
export const todos: AgentStatusTodoSnapshot[] = [
  ...[
    "数据库迁移：新增 finance_principal_type/id 列",
    "core 模块新增 addExamine Feign 调用",
    "改造 ReimbursementApprovalRuleService",
    "前端规则管理表单改造",
    "更新测试",
  ].map((content, i) => ({
    key: String(i),
    content,
    activeForm: content,
    status: "completed" as const,
  })),
  {
    key: "active",
    content: "移除专用报销审批规则层",
    activeForm: "正在校验通用审批流的金额条件与权限边界",
    status: "in_progress",
  },
  ...[
    "验证历史审批记录兼容性",
    "验证配置保存与重新加载",
    "检查窄窗口和键盘操作",
    "提交验收结果并准备发布",
  ].map((content, i) => ({
    key: `pending-${i}`,
    content,
    activeForm: content,
    status: "pending" as const,
  })),
];
export const FixtureContext = createContext(todos);
export function useTabStateOptional() {
  return {
    messages: [],
    sessionState: "running",
    sessionId: "synthetic-goal-todo",
    agentPlanTodos: useContext(FixtureContext),
  };
}

export const useTabState = useTabStateOptional;
export const useTabApiOptional = () => null;
export const useTabApi = () => {
  throw new Error("No API in synthetic component preview");
};
export const useTabActive = () => true;
