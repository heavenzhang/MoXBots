# MOXBOTS-TODO-STATUS-20261019 验收记录

## 结论

历史会话 Agent Status 面板把已完成任务显示为未完成（`TODO 0/10`）的问题已修复，并已合入 main。

- 修复提交：`f76c98912bfe0e791f70d722b58abf666a6ed69a`（分支 `codex/goal-todo-status-fix-20261019`，base `2e1c52273`）
- PR：https://github.com/heavenzhang/MoXBots/pull/149（merge `51db53b021bf58efe28af9e76dbe30d08f10a761`）
- CI：https://github.com/heavenzhang/MoXBots/actions/runs/39147219637（全部通过）
- 版本 tag：`git tag --contains f76c98912` 包含 `v0.5.13` 及之后版本（仅源码包含关系）

## 根因

复现会话 `71cc7554-171c-46c4-b8a3-282e2c5a2881` 的任务存储中大部分任务已完成。服务端下发历史时，`src/server/utils/session-message-preview.ts` 的最小收缩层（辅助内容超过 256 KB 时触发）造成两处丢失：

1. 丢弃所有工具输入（`input` / `inputJson` / `parsedInput`），`accumulateTaskTodos` 拿不到 `TaskUpdate.taskId`，状态变更全部被跳过。
2. 工具 `result` 按字节截断到 256 B。约 941 B 的 `TaskList` 快照截断后 `JSON.parse` 失败，无法回填。

10 个任务因此全部回放为 `pending`。本地 `sessions-v2` 事件存储和 Claude transcript 是完整的，用它们复现会掩盖投影层丢失，必须用服务端实际下发的历史复现。

## 修复内容

| 文件 | 变更 |
|---|---|
| `src/shared/taskTodoState.ts` | `TaskUpdate` 缺 `parsedInput` 时从 result 恢复 `taskId` 与 `statusChange.to`；支持 `deleted`；`success:false` 仍不应用 |
| `src/server/utils/session-message-preview.ts` | 最小收缩层保留 Task 工具 `inputJson`；Task result 结构化收缩保持合法 JSON，`TaskList` 逐字段压缩且不丢任务；`capBlockCountForHistory` 优先保留 Task 块 |
| `src/renderer/utils/taskTodoState.test.ts` | 新增无 `parsedInput` 回放、删除、拒绝变更、真实下发切片 4 个用例 |
| `src/server/utils/session-message-preview.unit.test.ts` | 新增大历史下 Task 块保留且 JSON 有效的用例 |

## 验证矩阵

| 层级 | 证据 | 状态 |
|---|---|---|
| 单测（Node 24 / vitest） | `taskTodoState.test.ts` 27、`session-message-preview.unit.test.ts` 23、`sessionWorkProgress.test.ts` 7 | PASS |
| 类型检查 | `tsc --noEmit` | PASS |
| 真实 transcript 重放 | `~/.moxbot/sessions-v2/71cc7554-….jsonl` 经下发投影后回放：修复前 0/10 completed，修复后 9/10（1 项真实未完成），`TaskList` 快照可解析 | PASS（本地，主 Agent 自测） |
| CI | run 39147219637 | PASS |
| 合入 main | PR #149，merge `51db53b02` | 完成 |
| 原生安装版验收 | 原会话在安装版客户端打开并核对面板 | 未做 |
| 生产发布 | 唯一发布 owner `01a12bc2-907a-7702-b6dd-788225c5dfe4` | 不在本任务范围 |

## 执行记录

主 Agent 完成定位、实现、测试、PR 与合并；未使用独立 reviewer，以上 PASS 均为主 Agent 自测与 CI 结果，不是独立验收。

## 未完成 / 边界

- 未在安装版客户端上做原生验收。
- 修复只恢复历史中已记录的状态；agent 当时没有标记完成的任务不会被补成完成。
- 合入 main 与版本 tag 包含关系不等于已发布或已安装验收。
