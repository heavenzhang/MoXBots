<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/composer-status-20261027 -->
<!-- git-project-sync-task:base=caab6ab648b434bee17930f90c4df4de87564bba -->
<!-- git-project-sync-task:status=ready-for-review -->

# MOXBOT-20261027-COMPOSER

目标：将 Composer 上方执行/任务双叠框合并为一条紧凑无外框摘要，共用互斥详情区，待验收入口直接打开任务详情。
范围：ExecutionStatusBar、SessionExecutionStatus、本地化、对应规范和验证。不改 Session ledger、准入、调度、权限或原始用户文本。其他聊天正在修改 Composer 字号，避开其文件。

## To Do List

- [x] 核实仓库、main caab6ab648b434bee17930f90c4df4de87564bba、原工作区干净与独立分支；start gate PASS。
- [x] 代码：统一摘要与 disclosure owner，短状态和按需详情，保留原回调。
- [x] 模拟验证：互斥展开、Escape/IME、会话切换、未知/恢复/验收边界与既有回归。
- [x] 实际组件：Chromium/WebKit、320/390/768/桌面、明暗、长文本、草稿保持及无横向溢出。
- [x] 实现与验收已提交；开发分支推送，登记唯一 owner 的 CI/main/发布请求（工作区回执跟踪）。
- [ ] 远端 main 核实；待原 owner 集成，不自行触发共享 CI。
- [ ] 签名包/生产安装和真实用户验收；待原 owner 下一未冻结批。

完成标准：默认单行 <=40px；一次仅一详情区；状态/任务可键盘访问；验收入口只导航，不伪造验收；真实账本投影边界保留。UI 基准为用户截图和现有 DESIGN；UI 质量由当前主 Agent 负责，准备就绪后安排有界独立审阅。
依赖：原 task ledger/Tab/Goal 控制；本地已有依赖和隔离 loopback 夹具。

## Deployment request

- Required: desktop/macOS-arm64/updater renderer 变更，下一未冻结批。
- Owners: combined CI/main/版本/构建/安装/发布唯一会话 01a12bc2-907a-7702-b6dd-788225c5dfe4，沿 canonical plan 指定。
- 无协议、API、数据库迁移或独立 Host/mobile/cloud 发布；回滚随旧客户端制品。
- Status: 代码与本地验收已完成，待远端交接；代码、本地合成、远端主干、制品、生产和真实验收分别追踪。
- Handoff: 本分支与任务记录；head SHA 在外部回执记录。

## Execution

当前主 Agent 实现/整体验收，1名独立审阅 composer_ui_review；requested gpt-6-luna/medium，实际运行型号/effort未知；选择依据：同一组件组的紧耦合改动；独审发现1项P2历史导航焦点问题，经RED/GREEN与独立定点复验关闭，1轮修复；升级原因：无；不调用外部原因：明确采用 ai-yaoren-local 纯内置模式。主模型家族 GPT-6，精确型号/effort/费用未由运行时提供。没有成本或提速测量。

## Next step

66项DOM、42组Chromium/WebKit、类型/lint/分类、本地Web构建与8主题测试PASS。交接精确提交SHA至既有owner安排共享CI/main及下一未冻结制品；本聊天不创建PR触发共享CI、不操作生产。证据目录 dev-docs/composer-status-20261027/。
