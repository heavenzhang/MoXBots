# MB-ERROR-CONTINUE-20261028 — 错误恢复保留进度

## 目标与实现

用户确认按接纳事实恢复：明确未接收才重发原文；已有执行进度则沿原会话继续；结果不明先核查，避免重复业务动作。基于远端 main `caab6ab648b434bee17930f90c4df4de87564bba`，隔离分支 `codex/error-continue-20261028`。原有其他任务及已发布 0.5.24 未改动。

- `projectErrorRecovery` 将错误动作分为重新发送、继续执行和核查状态。原文重发 helper 只接纳 definitive local failure；已接收、正在发送、已对账或发送结果不明的记录不能经它重发。
- V2 transcript 从最新真实用户的失败 terminal 派生 continuation；renderer 复用同一 pure policy 从 canonical turn-update 即时刷新，旧 turn/跨会话事件不能覆盖最新候选，正常完成清除候选。
- 继续沿既有 `continueFromTurnId`、SessionEngine 准入、Runtime queue 与同步 commit 校验；保持 native/product 历史及 identity，不调用 rewind/retry，不新增执行 owner 或恢复队列。只追加显式续接指令，要求保留任务清单和已完成步骤，先核查不明结果。
- 核查动作只调用现有 authoritative history/queue restore；相同未确认正文再次从输入框提交时也只核查并保留草稿。不会用“历史没找到”当作未执行证明。
- 原 Goal paused 由原 Goal owner 处理；native resume boundary、Stop、ledger、权限、任务预算、运行/队列/交互门禁不变。外部/DSH 未实现原精确继续能力时仅提供核查，不退化为原文重放。
- 错误横幅承担单一恢复动作；同屏隐藏重复的普通继续横幅，但仍处理显式 sidebar intent。挂载/恢复不会自行执行，按钮 pending 防双击，失败后保持可重试。

## 验收

使用 Node 24.21.0 及已安装依赖；默认池均无真实密钥/外网 Provider/用户目录写入。

| 阶段 | 结果 | 证据/范围 |
| --- | --- | --- |
| 纯逻辑与组件 | PASS，5 文件 49 项 | sessionContinuation、errorMessageResend、continuation-admission、ErrorRecoveryAction、SessionContinuationBanner |
| TabProvider DOM | PASS，131 项 | 失败 terminal 即时刷新候选、精确 turn payload、原输入/部分输出保留、迟到旧 terminal 不覆盖新任务 |
| SessionStore 磁盘集成 | PASS，27 项 | failed turn 的 continuation、原用户输入及部分结果在冷恢复后保留 |
| builtin SDK 协议集成 | PASS，185 项 | interrupted/error 的成功、迟到完成、防双击三组真实准入/queue/commit 路径；仅合成 SDK 协议，非真实 Provider |
| 类型、局部 ESLint | PASS | 全量 `tsc --noEmit`；改动 TypeScript/TSX 的 ESLint，0 error |
| 依赖边界 | PASS，0 error | dependency-cruiser；18 项既有 orphan warning 单列，不当作0 warning |
| 测试分类 | PASS | 462 server tests，132 integration、6 credentialed；未执行真实 credentialed 池 |
| 独立代码审查 | 无阻断 | `/root/recovery_review`，请求 gpt-6-luna / medium，只读检查所有 diff；未冒充浏览器/Provider验收 |
| 浏览器组件交互 | PASS，4 组合 | Chromium/WebKit × 1280/390；实际产品组件与 helper，外围隔离 fixture、合成回执，13 项行为/布局检查每组合 |
| 视觉 | 主 Agent 查看通过 | `evidence/webkit-390-partial.png`、`chromium-1280-unknown.png`，其余4组合截图同目录；不等于原生客户端验收 |

浏览器验证无自动执行、精确续接指令、防双击、草稿保留、结果不明仅核查、键盘 Enter、明确失败重发、忙碌禁用、恢复再失败、已完成不显示继续、无横向溢出及无 page error。见 `evidence/browser-results.json`。共 392 项定向单元/DOM/集成测试通过；浏览器检查另计，不合并成 Provider 用例数。

复现命令：

```sh
node node_modules/vitest/vitest.mjs run --project unit src/shared/sessionContinuation.test.ts src/renderer/pages/errorMessageResend.test.ts src/server/session-engine/continuation-admission.unit.test.ts --project dom src/renderer/components/ErrorRecoveryAction.test.tsx src/renderer/components/SessionContinuationBanner.test.tsx
node node_modules/vitest/vitest.mjs run --project dom src/renderer/context/TabProvider.activity.test.tsx --project integration src/server/session-transcript/builtin.integration.test.ts src/server/session-transcript/store.integration.test.ts
node node_modules/typescript/bin/tsc --noEmit
node scripts/check-test-classification.mjs
node node_modules/vite/bin/vite.js --config dev-docs/error-continue-20261028/evidence/vite.qa.mjs
node dev-docs/error-continue-20261028/evidence/browser-check.mjs
```

浏览器脚本允许 `MB_CHROMIUM_EXECUTABLE`、`MB_WEBKIT_EXECUTABLE` 指向已有独立测试浏览器。此次使用已缓存 Chromium headless 1243 和 WebKit 2259，不使用用户 Chrome、业务登录或原客户端。初次默认浏览器 revision 缺失、默认 Vite root 未指向 fixture，已切换专用 QA 配置和独立临时 cache 完成验证；没有用失败环境结果冒充通过。

## 交付与发布边界

- 本会话交源分支、任务记录、测试与 SHA 清单；不创建 PR 触发共享 CI。远端 codex 分支 push 不触发当前仅 main/dev/PR 的 test workflow。
- desktop/macOS-arm64/updater 与 combined CI/main 继续由 **01a12bc2-907a-7702-b6dd-788225c5dfe4 / MoxBots桌面端统一打包负责人** 唯一负责。按既有用户授权向其提交精确 SHA，由其组织审阅、主干合并、CI 与下一未冻结正式批次。不覆盖已冻结制品。
- 无 cloud/Host/mobile 发布或数据库迁移；不分配正式版本号。运行中的用户客户端、业务/登录和后台调度未操作。
- 主干包含、共享 CI、新签名制品/摘要、安装与真实 Provider/用户路径尚待 owner 证据；本地/合成验收不替代这些阶段。Token节省未实测，不承诺具体数值或内部推理断点恢复。

## 执行记录

主 Agent 负责实现、集成与 UI 质量；实现链路紧密耦合，未并行写代码。实现后增加一个独立只读审查工作包，避免并发编辑；审查无阻断，主 Agent 独立检查最终 diff 和实际页面。模型/推理路由只有 reviewer 的请求值可确认，费用及 token 用量未知，不宣称节省比例。

本次修正类型/lint发现的残留确认回调及 optional user guard，然后重新通过检查。集成测试一次通过。复盘：复用已有 exact-turn 准入保持安全边界；后续类似任务直接采用专用 fixture root/cache，避免默认完整应用入口干扰组件验收。
