<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/goal-todo-status-fix-20261019 -->
<!-- git-project-sync-task:base=2e1c522737b30ca985c3df8d9110e2eec97e1682 -->
<!-- git-project-sync-task:status=complete -->


# Task: MOXBOTS-TODO-STATUS-20261019

## Objective

修复历史会话 Agent Status 面板把已完成任务显示为未完成（`TODO 0/10`）。复现会话 `71cc7554-171c-46c4-b8a3-282e2c5a2881`。只改历史下发投影与 Task 状态回放，不改 Task 工具、任务存储、执行/发布 owner。

## Acceptance criteria

- [x] 根因定位：服务端下发历史 `shrinkSessionMessageForClient` 最小收缩层丢弃工具输入，并把 `TaskList` result 硬截断到 256 B（JSON 失效）。
- [x] `accumulateTaskTodos`：`TaskUpdate` 缺 `parsedInput` 时从 result 的 `taskId` / `statusChange.to` 恢复，支持 `deleted`，`success:false` 仍拒绝。
- [x] 下发投影：Task 工具 result 保持合法 JSON，`TaskList` 不丢任务；保留 Task `inputJson`；区块上限采样优先保留 Task 块。
- [x] 单测：`taskTodoState.test.ts` 27、`session-message-preview.unit.test.ts` 23、`sessionWorkProgress.test.ts` 7 全部通过；`tsc --noEmit` 通过。
- [x] 真实 transcript 重放：修复前 0/10 completed，修复后 9/10 completed（1 项真实未完成）。
- [x] PR #149 合入 main（merge `51db53b021bf58efe28af9e76dbe30d08f10a761`），CI run 39147219637 全绿。
- [ ] 原生安装版真实会话验收（统一发布 owner `01a12bc2-907a-7702-b6dd-788225c5dfe4`）。

## Completed

修复提交 `f76c98912bfe0e791f70d722b58abf666a6ed69a`，经 https://github.com/heavenzhang/MoXBots/pull/149 合入。`git tag --contains` 显示该提交包含于 `v0.5.13` 及之后的版本 tag；这只说明源码已进入这些版本，不代表已做安装版验收。

## Verification

证据与可复现说明：`dev-docs/goal-todo-status-fix-20261019/acceptance.md`。

## Deployment request

部署单元为 desktop builtin client（server 历史投影 + renderer 状态回放）。正式版本与制品由唯一发布会话 `01a12bc2-907a-7702-b6dd-788225c5dfe4` 负责；本任务不触发构建、不替换日常客户端。无数据迁移；回滚即回到上一正式客户端，任务存储不受影响。

## Blockers and unknowns

修复只恢复历史中已记录的状态；当时 agent 未标记完成的任务不会被补成完成。未在安装版客户端上用原会话做原生验收。

## Next step

由发布 owner 在包含 `f76c98912` 的安装版上打开会话 `71cc7554-…`，确认 Agent Status 显示 9/10。
