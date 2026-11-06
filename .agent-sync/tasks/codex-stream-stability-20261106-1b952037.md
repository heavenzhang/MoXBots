<!-- git-project-sync-task:version=2 -->
<!-- git-project-sync-task:id=941cfd7f-2fe3-454a-8520-c8b3ae8ef599 -->
<!-- git-project-sync-task:branch=codex/stream-stability-20261106 -->
<!-- git-project-sync-task:base=045b30eef4caf827249934539b6d0197674266b4 -->
<!-- git-project-sync-task:status=in-progress -->
<!-- git-project-sync-task:source-digest=2a2062c8016daee9360ad7baf243b5849c834fabd0ff6593565d5de65fdb62ef -->

# Task: MB-STREAM-STABILITY-20261106 连续执行稳定性与失败诊断

## Objective

MB-STREAM-STABILITY-20261106：修复原生块之间空档导致执行过程反复收起/展开的跳动，核实原会话真实工具失败。仅桌面Renderer与对应离线回归；不重放原业务任务、不改模型配置、不放松验收门禁。

## Acceptance criteria

- [x] 旧码定向用例复现间隙自动隐藏成功行，修复后同一DOM行持续可见。
- [x] 最后工具完成、正文间隙、下一思考开始/结束及手工展开状态连续；真实终态仍正常折叠。
- [x] 真实MessageList/Virtuoso双引擎离线检查，原码/修复几何对照。
- [x] 关键回归、类型、lint及独立审阅通过。
- [ ] 分支提交/远端保存，经原owner统一CI/main集成。
- [ ] 新制品安装后原会话连续执行复验，由原发布owner完成。

## Completed

- 已核实实际仓库与main基线045b30eef4caf827249934539b6d0197674266b4，独立worktree，不覆盖其他任务。
- 当前安装版本0.5.42/542.6，已包含较早virtual extent修复；本次空档折叠是另一路径。
- Message把isLoading与hasIncompleteBlocks合取，空档误变为history。现以消息owner的isLoading维持live资格；每行仍独立计算成功/失败/未知，不伪造执行中。

## Verification

- Source digest: `2a2062c8016daee9360ad7baf243b5849c834fabd0ff6593565d5de65fdb62ef`; 71 DOM + WebKit/Chromium continuity PASS; old WebKit RED; tsc/ESLint/classification/diff PASS.

- Node24、真实Message定向RED：2/2因成功行不可见失败。
- 修复后Message/BlockGroup/ProcessRow/follow motion定向6文件71/71通过；双引擎、类型、lint、分类与独立源码/DOM审查通过。

## Blockers and unknowns

- 模拟页面不等于已安装原会话；当前业务会话有真实活动，不发送请求、不重启或改写历史。
- CLI版本冲突、schema漏参及native generation资格问题由并行只读诊断核实，未作为UI问题掩盖或放松。

## Deployment request

- Required: required；desktop/macOS-arm64/updater/sharedCI/main。
- Handoff: 当前任务分支及本记录，冻结542.6不修改，精确SHA在提交后交原owner。
- Evidence and dependencies: dev-docs/stream-stability-20261106/acceptance.md；不涉及server状态迁移或云服务，不改变操作围栏和权限。
- Status: 源码/双引擎/独立审查完成，远端保存进行中；main、正式制品和原会话验收未完成。
- Owners: 01a12bc2-907a-7702-b6dd-788225c5dfe4，沿用现有共享CI/集成/桌面发布owner；开发会话不自行触发共享CI或构建。

## Next step

- 原owner接收精确远端SHA，统一main/CI及下一未冻结桌面批，保持原业务unknown回执不重跑。
