# PLAN-LIFECYCLE-20261023 独立 UI / 代码审阅

## 审阅边界

- 仓库：`/Users/zhangshaohua/Documents/Codex/2026-10-23/moxbots-plan-lifecycle`
- 基线：`d4a89cca58c2c7295560e8ced1d6f769f686bcbd`
- 审阅者不修改生产源码、不触发 CI 或部署，不操作用户 Chrome 或日常 App。
- 浏览器合成夹具仅证明真实 renderer 组件在给定投影下的呈现和交互；不能证明 SDK、native admission、真实 Provider 或生产行为。
- 起始工作区有未跟踪 `.agent-sync/tasks/codex-plan-lifecycle-20261023-ef960699.md`，审阅期间保留。

## 规范断言

- 计划确认与任务验收是不同状态。确认不能显示为执行完成；native completed 只进入待验收，只有有效验收记录才计入完成。
- 执行显示必须来自确切 attempt/activity；失去证据时显示未知，不从 Session busy 或历史 loading 推断运行。
- 确认后的启动状态区分 pending、claimed、dispatched；不确定的 native 回执不自动重放。
- 仅当前 Session / proposal ID / revision 的状态能驱动当前方案卡。旧 proposal、旧 revision、旧 attempt 的迟到响应不能污染新方案。
- 断线或恢复期间保留最后确认事实，同时明确同步状态；恢复的 native complete 不得升格为已验收。
- 状态应给出可理解的下一步或阻断原因；证据入口可键盘到达，细节可通过原生 disclosure 键盘操作。
- 沿用现有设计 token 和布局，在 1280、390、320 px 宽度与 light/dark 主题检查换行、溢出、按钮可达性和证据可用性。

## 待实现就绪后执行

待主 Agent 通知实现完成后，先记录审阅时的 HEAD、工作区 diff 与实际命令，再选择仓库内的 Vite / Playwright 合成夹具，优先挂载真实 `OrchestrationPlanCard`、真实任务面板和状态栏组件。覆盖待确认、确认、启动 pending/claimed/dispatched、执行、回传待验收、失败、返工、中断、阻塞、未知、全部验收完成、断线恢复，以及方案切换和旧响应迟到。

每个问题记录文件与行号、宽度/主题、前置状态、操作步骤、实际表现、预期表现、严重程度和截图/DOM证据。若夹具无法驱动某项状态或组件被替身替代，明确标注缺口，不把它计为通过。

## 执行记录

- 初始 HEAD：`d4a89cca58c2c7295560e8ced1d6f769f686bcbd`（与约定 base 一致）。
- 初始分支：`codex/plan-lifecycle-20261023`，跟踪 `origin/main`。
- 初始工作区：仅发现未跟踪任务记录 `.agent-sync/tasks/codex-plan-lifecycle-20261023-ef960699.md`。
- 初始阶段浏览器/测试/构建尚未执行；最终已完成的检查以本文后续“独立审阅结果”和“实际执行记录”为准。
- 模型、effort、耗时或用量：本工具环境未暴露，未知。

## 独立审阅结果

**结论：未发现阻断本次 UI 交付的问题。** 最新源码由真实 `ExecutionStatusBar`、`useSessionTaskOrchestration` 与方案卡渲染；夹具只合成 Tab / Session ledger 与 HTTP transport。任务状态由 `projectSessionTasks` 得到，再由 `projectSessionPlanExecution` 按当前 proposal ID、revision 和 step ID 映射。只读状态投影的代码位置见 `src/shared/sessionPlanExecution.ts:12`，卡片状态与 stale 处理见 `src/renderer/components/agent-status/OrchestrationPlanCard.tsx:112`，步骤、验收依据与执行记录呈现见 `src/renderer/components/agent-status/PlanExecutionProgress.tsx:10`。

本地 Chromium headless 的独立脚本通过 **96/96** 断言：16 种状态 × 1280/390/320 px × light/dark。覆盖待确认、已确认、启动 pending/claimed/dispatched、执行中、回传待验收、失败、返工、中断、仍有可执行步骤但依赖项阻塞、全部步骤受阻、未知、全量验收完成、旧 revision 迟到结果、断线恢复。各组合均无横向溢出；方案状态标签符合预期。旧 revision 中全部验收通过的任务没有被新 revision 统计；pending + blocked 混合场景显示仍可执行，所有 step 都阻塞时显示受阻。

在 320/390/1280 的 light/dark 组合中，完成态键盘聚焦并按 Enter 可展开步骤验收详情，验收证据可读；脚本点击“查看执行记录”并确认 callback 收到 `tool-inspect`。这验证了组件向上游传递 toolUseId 的入口，不代表实际 Inspector 弹层或原生执行记录打开流程已通过。本夹具使用合成 ledger，没有构造同一 task 的多次 attempt，因此上一 attempt 与当前 attempt 的完整视觉历史尚未由本轮独立截图覆盖。

断线场景在夹具中保留最后一次 ledger 投影，并确认 stale 标记可见；脚本也等待恢复读取后状态回到“执行状态待核实”，原投影保持不变。主 Agent 随后在内置浏览器另行连续复验了断线→恢复，确认 badge 从“同步待恢复”回到“已完成 · 验收通过”且 3/3 保持不变。此类结果仍只证明前端快照恢复与合成状态映射，不证明 SDK/native/Provider/生产恢复。

截图与结构化结果位于 `dev-docs/plan-lifecycle-20261023/evidence/`；24 张截图覆盖完成态、待验收、未知和断线快照的六个宽度/主题组合，`ui-results.json` 保存 96 条断言结果。独立 fixture TypeScript 检查通过；Vite 将入口与生产组件正常转换并服务于 `http://127.0.0.1:4349/dev-docs/plan-lifecycle-20261023/preview.html`。本审阅未触发 CI、构建或部署。

## 实际执行记录

- 工作树与 HEAD：`/Users/zhangshaohua/Documents/Codex/2026-10-23/moxbots-plan-lifecycle`；base/HEAD `d4a89cca58c2c7295560e8ced1d6f769f686bcbd`。主 Agent 同时改动生产源码；审阅者仅写本目录下 fixture、脚本、证据和本 review 文件。
- 启动命令：`/opt/homebrew/opt/node@24/bin/node node_modules/vite/bin/vite.js --config dev-docs/plan-lifecycle-20261023/vite.config.ts`，本地端口 `127.0.0.1:4349`，Codex exec session `37090`。
- UI 命令：`PLAN_REVIEW_CHROMIUM=/Users/zhangshaohua/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell /opt/homebrew/opt/node@24/bin/node dev-docs/plan-lifecycle-20261023/ui-check.mjs`；结果 `96/96` 通过。
- fixture TS：临时 `/tmp/plan-lifecycle-20261023-tsconfig.json` 扩展仓库配置，包含 `src/**/*` 与本次 `preview.tsx`；`tsc` exit 0。Vite `curl` 入口转换成功。
- Playwright 首次未指定缓存浏览器路径时退出，提示默认 chromium-headless-shell 不存在；改用已安装的 `chromium_headless_shell-1243` 后通过。未下载浏览器、未使用用户 Chrome 或日常 App。
- 风险边界：本次仅 renderer 合成 UI 和浏览器 DOM 行为，不构成 native / 真实 Runtime / Provider / 生产验收。主 Agent 报告其定向测试、TS、lint 等源码验证结果，本审阅者未重复触发。
- 主 Agent 调度请求：gpt-6-luna / medium。实际计量、token 用量与费用未暴露，未知。审阅耗时：开始与完成时间未由工具记录，未知。
