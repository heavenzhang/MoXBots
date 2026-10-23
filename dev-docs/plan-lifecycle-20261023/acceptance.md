# PLAN-LIFECYCLE-20261023 方案执行与验收反馈

## 目标与实现

用户提供的 0.5.19/build519.2 测试截图中，两个只读步骤已有主 Agent accept 记录，卡片仍显示“计划草案 / 方案已确认 / 启动请求已交给通道”。本次将确认后的卡片改为执行计划，直接汇总同一 Session 原任务投影，显示已验收步骤数和当前阶段，展开查看步骤、依赖、验收依据、原生返回和历史尝试。

状态覆盖待确认、已确认尚无启动记录、等待启动、启动核对、待执行、执行中、待验收、完成、返工、失败、中断、受阻和未知。`projectSessionPlanExecution` 按 proposal ID + revision + step ID 精确筛选，缺失步骤不能被省略或借历史成果补齐。只统计原任务投影中已验收完成的步骤；原生 completed 仍是待验收。历史同 handle 尝试只显示自身结果，只有当前尝试有现有 Inspector 入口。

未新增通信、执行 owner、scheduler、数据库、权限或重播行为。GET/SSE 仍由原 hook 观察；重新同步只读，断线时保留上次验收事实、显式显示同步中断。当前运行时不支持确认时，已确认方案与既有成果仍可查看。

## 验收清单

- [x] 当前主干 d4a89cca58c2c7295560e8ced1d6f769f686bcbd、origin、隔离分支、start/task-init 核验。
- [x] 截图的主 Agent 两步骤均 accept → 完成2/2，JSON冷恢复仍成立。
- [x] 旧方案/版本、缺失步骤、返回未验收、新 activation、拒绝/失败/中断与未知边界。
- [x] 真实 SessionStore/确认策略/route/turn owner 既有回归；不改变授权和写入。
- [x] 主 Agent 内置浏览器检查真实产品组件与 hook 的合成快照，八个执行状态、展开依据、当前记录回调、断线保留3/3和恢复完成均通过。
- [x] 独立 UI 审阅和三宽度/两主题矩阵96/96通过，见 `review.md` 和 `evidence/ui-results.json`；主Agent复看1280浅色与320深色截图。
- [ ] 源码提交推送、同一 SHA 的统一 CI、远端 main 包含。
- [ ] 新签名桌面包、当前版本及真实用户路径复验。

## 已运行验证

运行时：本机 Node24 `/opt/homebrew/opt/node@24/bin/node`，复用既有 node_modules，不新增依赖。针对实际代码的第一轮 unit/DOM 89 tests PASS；增加同 handle 历史入口回归后的最终结果在下方补记。

- Pure/DOM：`vitest run --project unit src/shared/sessionPlanExecution.test.ts src/shared/sessionTaskOrchestration.test.ts src/shared/sessionPlanConfirmation.test.ts --project dom src/renderer/components/agent-status/OrchestrationPlanCard.test.tsx src/renderer/components/agent-status/useSessionTaskOrchestration.test.tsx src/renderer/components/agent-status/SessionTaskResults.test.tsx`。
- 原 owner 回归：`task-orchestration.integration.test.ts` 39 tests、`session-plan-policy.unit.test.ts` 25、`session-task-orchestration.unit.test.ts` 10、`task-turn-orchestrator.unit.test.ts` 8，共82 PASS。真实临时磁盘 + 本地 runtime 夹具，非真实 Provider。
- `tsc --noEmit --pretty false` PASS；修改源码/测试定向 ESLint PASS；test classification PASS。
- dependency-cruiser：0 errors，18 个其他模块 orphan warnings；无 suppress 或架构绕行。
- Vite 本地 web build PASS（32.31s），有既有大 chunk 提示。输出 `/tmp/moxbots-plan-lifecycle-web-20261023`，非正式安装包；最新小修改后的结果在下方补记。

最终源码验证：pure/DOM **90 PASS**，连同原 owner82项共 **172 PASS**；最新 JSX/locale 和同 handle历史回归后的 tsc / ESLint exit0，Vite最终 web build **PASS / 32.20s**，输出 `/tmp/moxbots-plan-lifecycle-web-final-20261023`。原始定向日志 `/tmp/moxbots-plan-lifecycle-{focused,tsc,eslint}.log`、`/tmp/moxbots-plan-lifecycle-web-final-20261023.log`；大型产物与Vite本地缓存不进入Git，任务专属缓存按既有preview规则加入ignore并保留。

## UI 条件与证据边界

本地入口 `http://127.0.0.1:4349/dev-docs/plan-lifecycle-20261023/preview.html`。真实 `ExecutionStatusBar` / `OrchestrationPlanCard` / 原 hook / ThemeRuntimeProvider，Session transport 为显式合成数据，由原 ledger + `projectSessionTasks` 生成；不连用户数据、SDK或生产。主 Agent 在内置浏览器实际执行步骤，独立审阅脚本使用隔离已安装 Chromium。Inspector 夹具仅记录 toolUseId 回调；真实 Inspector、原生签名、账号/Provider/主子 Agent 委派和发布后路径必须由发布 owner 在新制品另验。

独立 reviewer `plan_ui_review` 请求模型 gpt-6-luna / medium；主 Agent 负责实现、审查和最终验收。没有 AIRouter 调用；模型实际用量、费用及收益未计量，不估算。

## 主干与发布归属

分支 `codex/plan-lifecycle-20261023`；源码工作树 `/Users/zhangshaohua/Documents/Codex/2026-10-23/moxbots-plan-lifecycle`；本开发会话 `01a16926-e6a6-7012-b3e7-ed9a694c95ab`。

部署单元 desktop/macOS/updater 与 combined CI/main 的唯一既定负责会话仍为 `01a12bc2-907a-7702-b6dd-788225c5dfe4`。提交精确 SHA 后由其组织 CI、main、下一未冻结版本、构建、签名、发布、原生真实路径和回滚。本会话不触发共享 CI、正式构建或日常 App 替换；既有 0.5.19/build519.2 冻结制品不包含本改动，不能重标或覆盖。所含任务仅 PLAN-LIFECYCLE-20261023；无独立云、Host、移动端或业务数据发布。
