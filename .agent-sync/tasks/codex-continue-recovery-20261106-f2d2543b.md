<!-- git-project-sync-task:source-digest=9a1d8a44298ba3d71736b35982aa84ce7f4a7cdf04f5522b5586e111ab8d519c -->
<!-- git-project-sync-task:version=2 -->
<!-- git-project-sync-task:id=c8ef069a-e630-4ec1-905e-622e7ca00404 -->
<!-- git-project-sync-task:branch=codex/continue-recovery-20261106 -->
<!-- git-project-sync-task:base=045b30eef4caf827249934539b6d0197674266b4 -->
<!-- git-project-sync-task:status=in-progress -->

# Task: MB-CONTINUE-RECOVERY-20261106 恢复会话并修复错误拦截与原因提示

## Objective

修复 MB-CONTINUE-RECOVERY-20261106：已返回的 Bash exit 128 被错判为结果未知，拦截原会话继续执行；暂停原因被旧评审摘要遮盖，dispatch 拒绝又没有界面反馈。恢复原任务并验证真实产物。范围为 desktop builtin recovery / continuation admission / task status UI。

## Acceptance criteria

- [x] 正常非中断 exit 128 记为明确失败，仍禁止自动重放相同命令；124 / 信号 / 缺失回执继续保持未知。
- [x] 旧失败仅在原生 SDK 当前选定链及压缩祖先、原始回执、已存 attempt 身份和 digest 全部匹配时修复；不手改生产账本。
- [x] 任务仍有旧完成摘要时，暂停原因在折叠状态可见；发送前拒绝有明确反馈且不调用模型。
- [ ] 远端 main 包含修复，原桌面发布负责人完成构建和安全安装。
- [x] 原会话原 execution 继续执行，核实任务产物、实际默认工具使用、6/6 正式验收和折叠暂停原因展示。

## Completed

- 修正 exit 128 边界，新增精确历史失败核对；保留其他 legacy uncertainty 和所有未知操作保护。
- 核对支持 SDK 原生 compaction logicalParentUuid 与 preserved segments，不扫描其他物理分支来授权恢复。
- 发送前拒绝显示可理解原因；任务状态优先显示暂停原因，不再被 assessment.summary 覆盖。
- 使用隔离临时目录测试与真实记录只读内存模拟，未重放操作、未更改会话数据。

## Verification

- Source digest: `9a1d8a44298ba3d71736b35982aa84ce7f4a7cdf04f5522b5586e111ab8d519c`; Documentation-only update. Installed5431 native paused reason and original execution resume verified; production exact128 reconciled without manual ledger writes; original execution completed and6/6 accepted persisted. Actual default CLI116 sample independent verification passed. Main/5432 still pending. git diff --check passed.

- Source digest: `bb0c98fec7bb1b5ffd29b62d450da5382b45122aa442ae639aaaab7e6b2cbf7f`; 2 blocked/needs_user DOM counterexamples fail before fix and pass after; status and execution-bar DOM files pass (3 new cases); typecheck, changed-file ESLint and diff-check pass. Recovery backend unchanged. 241 distinct targeted tests including prior passed suites.

- Source digest: `f8f075c7110863164baf90ece51f5171c1d9fb4c53b45005e4eac0465f754bfc`; 17 production queue/recovery integration tests pass, typecheck and changed-file ESLint pass; explicit user cancellation remains acknowledged without false system-error warning. Total 238 distinct targeted tests.

- Source digest: `fe70f56b6910fc880f725b52b0078167ddf31cdf1d76d28829c0b864728ee062`; Production recovery owner and durable Store cold-path test passed; all 16 stream-continuation tests passed; typecheck and changed test ESLint passed. Total 237 distinct targeted tests. Production code unchanged from reviewed ea3c678.

- Source digest: `d8812a55031837db882b2635ac270d70cf58bf4de35af5d6f5b76b2948354d5a`; Main ce11d2a merged cleanly; only independent website content changed; tested production recovery/UI bytes unchanged; 236 targeted tests/typecheck/lint and actual history memory proof remain applicable.

- 已同步最新 main ce11d2a332c8e276478048fdf3cf935b5dabaad6，只有独立网站下载页变更，无源码重叠或冲突。

- Source digest: `f3891f43d34eb3c401b69fa5e7ef7a5ebbb1672586ca614fa3b53126d924d98e`; 236 distinct targeted unit/DOM/integration tests passed across 8 files; typecheck and changed-file ESLint passed; dependency check 0 errors (20 baseline warnings); classification and diff-check passed; real historical exit128 matched in memory, no production writes/replay.

- 7 文件 224 项 unit / DOM / integration 通过，覆盖拒绝不 dispatch、原 execution 接续、压缩历史核对、超时与信号不解除。
- 类型检查通过；改动文件 ESLint 通过；依赖检查 0 error（20 项原有 orphan warnings）；测试分类通过。
- 实际历史只读内存验证匹配 exit 128；其他 7 个历史 uncertainty 保留，未执行工具、未写生产账本。原始证据只留本机。
- 新增 legacy uncertainty 保留、容量检查和真实 Store 冷重载回归；补充 3 文件 66 项通过（与上组部分重叠），总计 8 个不同文件 241 项通过。

## Blockers and unknowns

- 核心恢复已安装 543.1 并通过原会话实际验收；远端 main 与描述型原因补充修正 543.2 尚待原桌面负责人交付，不能把 543.1 当作补充修正已发布。
- 原生回执不是业务成功证明。本修复记录失败，不替模型验收原任务。

## Deployment request

- Required: yes; desktop/macOS-arm64、shared CI/main，沿用唯一负责会话 01a12bc2-907a-7702-b6dd-788225c5dfe4。
- Handoff: 当前远端分支及本记录，精确 SHA 随交接消息提供。开发会话不自行运行共享 CI/正式构建、版本分配或安装。
- Evidence and dependencies: dev-docs/continue-recovery-20261106/acceptance.md；仅现有 ledger schema 的保守分类修复，无新增服务/API或权限。旧二进制不能识别新增 exit 128 证明时会 fail closed；回滚由负责人使用同批变更前快照，不能清空账本。
- Status: 543.1 已安装，原会话恢复且原任务 6/6 正式完成，默认业务工具独立读回通过；PR #257 main、543.2 补充修正及重启持久性仍待统一负责人交付。
- Owners: desktop/sharedCI/main 01a12bc2-907a-7702-b6dd-788225c5dfe4；本任务只负责源码修复和原会话恢复验收。

## Next step

原发布负责人完成 PR #257 main 与已冻结 543.2；本会话核实实际安装、补充原因显示修正及原完成状态重启保持。原业务不再重跑。

- 真实验收：543.1 源码 35c1dc5f0d53abd481ba1262acf776689bb9b0a3，归档 SHA-256 883b6bb7e0a9e7eb7910935924e24ad9d22fa761d66cb496e9d8bcd9dfe7ae8a。原 execution 自动核对原 exit 128 后从 paused 转 running，最终 completed；6/6 正式评审 accept 和 plan completed 已持久化；原生界面显示已完成。7 个其他 legacy uncertainty 保留，手动账本写入 0。
- 默认业务工具已实际生效，独立同窗口 116 条验证通过：85 转发、4 引用恢复，27 普通文本和元数据不变，无 warning，原版备份保留。详见 dev-docs/continue-recovery-20261106/acceptance.md；私有样本及原始会话证据不提交 Git。

- 补充通过真实 production recovery owner + SessionStore 隔离联调：冷启动同一 provider、压缩历史失败128核对、持久执行事实修复；保留 legacy unknown，无模型输入或上游请求。完整 stream-continuation 文件17项通过，类型与lint通过。

- 最终审查保留主动取消语义：dispatch_canceled 仍发送 queue:cancelled，不新增 chat:agent-error；真实系统拦截继续显示原因。17项生产队列联调与类型/lint复核通过。

- 安装前补审发现并修复描述型暂停原因回归：blocked/needs_user 把自然语言 summary 直接存作 reason，不能用未知枚举兜底遮盖。2个反例先在旧显示代码失败；修正后两文件DOM通过，并新增不使用旧accept摘要的反例。已知reason code保持最高优先级；仅reason与当前summary完全一致时展示该说明。后端与原生恢复逻辑没有变化。
