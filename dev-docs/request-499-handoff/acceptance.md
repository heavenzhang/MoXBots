# MOXBOTS-499-20261025 — 排队输入恢复交接与任务状态

用户要求：修复重复本地 499，打新包并更换本地。当前分支 `codex/request-499-handoff-20261025`，从远端 main `c5fd489b56d2eb2f19923d9dddc5cb6097cd439f` 隔离；未改 routing-single-scroll 工作树的既有修改。

## 原因与最终行为

A 请求处于模型恢复等待，真人 B 在 turn-boundary 队列中。Force 通过原 Stop 暂停 A；A 原生终态后 B 启动，但 enqueue 时未见 paused，未清理原暂停推理链。Bridge isCurrent 随即拒绝 B，返回本地499，SDK仅39ms、0输入输出。上游此前的响应头超时并不能单独证明模型本身故障。

新输入保留原 desktop ingress 身份，在实际 generator 准入时重新检查暂停链；仅在原生终态、领域准入、持久 Stop 结算后，沿原 SessionStore CAS 清理该推理 checkpoint 并开启新轮次。重检 Product/SDK/route/checkpoint/Query代次、controller和队列取消，旧 action ledger 与不可变 Stop fence 保留。自动提醒不能清理暂停；本修复不重放原任务或历史工具，不修改同任务执行期限。

To Do 的 in_progress 是历史计划进度。新增可选 rootActivity 投影，由 server 的真实 isBusy/sessionState 与 renderer 的当前 Tab 状态分别提供；无独立执行凭据的主计划在根 idle 时显示“已中断”，加载或失联显示待确认。真实子任务、已回传待验收与正式验收结果保留；不改历史计划或自动标记完成。

## 验证

- [x] 先红：新回归在未修复代码上收到499而非200。原始日志 `/tmp/moxbots-499-red.log`。
- [x] 五种新交接回归：正常、暂停落盘等待、恢复CAS期间Stop、恢复CAS期间取消、自动输入不获得恢复权限。
- [x] 集成4文件263项通过：builtin transcript、interrupt、model recovery、task orchestration。
- [x] 单元5文件149项通过：model recovery、interrupt、task projection、bridge recovery、turn queue。
- [x] DOM2文件35项通过：真实hook及ExecutionStatusBar的运行→停止→新请求、返回待验收、Escape和原交互回归。
- [x] TypeScript `tsc --noEmit`、改动文件ESLint、test classification及diff检查通过。
- [x] 独立只读代码审查：`/root/review_499_handoff`，未发现阻断性生产问题；审查发现的测试参数误替换已修复并复验。
- [x] 实际浏览器页面：生产ExecutionStatusBar/TabContext/task projection，1280与390宽度，运行→停止→新请求、待验收保留、Escape、无水平溢出/JS异常。主Agent检查截图，视觉与交互通过；页面使用合成状态，不是原生/真实Provider验收。
- [ ] 远端main、精确候选共享CI。
- [ ] 签名新包、备份/替换日常客户端、安装版本与源码对应、真实SDK/Provider路径。

## 复现命令与证据

使用 Node24，执行：

```sh
node node_modules/vitest/vitest.mjs run --project integration src/server/session-transcript/builtin.integration.test.ts src/server/__tests__/builtin-interrupt.integration.test.ts src/server/builtin-session/model-recovery.integration.test.ts src/server/session-engine/task-orchestration.integration.test.ts
node node_modules/vitest/vitest.mjs run --project unit src/server/builtin-session/model-recovery.unit.test.ts src/server/builtin-session/interrupt.unit.test.ts src/shared/sessionTaskOrchestration.test.ts src/server/openai-bridge/model-recovery.unit.test.ts src/server/session-core/turn-queue.unit.test.ts
node node_modules/vitest/vitest.mjs run --project dom src/renderer/components/agent-status/useSessionTaskOrchestration.test.tsx src/renderer/components/agent-status/ExecutionStatusBar.test.tsx
node node_modules/typescript/bin/tsc --noEmit
node scripts/check-test-classification.mjs
```

浏览器预览：`node node_modules/vite/bin/vite.js --config dev-docs/session-orchestration/vite.config.ts --port 4349`；随后 `node dev-docs/request-499-handoff/verify-ui.mjs <absolute-evidence-directory>`。若Playwright默认浏览器版本缺失，可用 `MOXBOTS_QA_CHROMIUM` 指向已安装的隔离Playwright Chromium；不操作用户Chrome。

本地完整证据：工作区 `output/MOXBOTS-499-20261025/validation-20261026/` 与 `ui-20261026/`。代码审查边界：恢复中的旧A受 MF退休/epoch/boundRequest控制，但一般后台HTTP可跨主turn，不宣称全部旧HTTP都按scope拒绝。

## 发布交接

部署单元 desktop builtin client；唯一CI/版本/构建/安装负责人 `01a12bc2-907a-7702-b6dd-788225c5dfe4`（MoxBots桌面端统一打包负责人）。新版本和不可变制品由其分配并记录，不覆盖0.5.23/523.1。用户已授权本地替换；安装前核对活动任务、备份与回滚，保留原会话/文件/账本，不自动重跑旧业务。

当前Agent实现与集成，1名只读独立审查；UI小改由主Agent验收。未调用外部模型；无实测费用数据。源码验证、合成SDK/页面、共享CI、签名制品、安装及真实Provider验收分别记录。
