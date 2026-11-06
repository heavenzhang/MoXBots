<!-- git-project-sync-task:version=2 -->
<!-- git-project-sync-task:source-digest=903dfb3355d3a337d88d7b8077aa01c40f8fe9cfcbfd6bc0bc451eb631461168 -->
<!-- git-project-sync-task:id=3f0550f3-0277-40ba-8838-2cbd5ef17bf0 -->
<!-- git-project-sync-task:branch=codex/bot-collaboration-20261107 -->
<!-- git-project-sync-task:base=bfbc92f3800a3ee4da5785b0f25fc61e2b7a32c2 -->
<!-- git-project-sync-task:status=in-progress -->

# Task: BC-02/03 Preserve fixed project context across local Bot handoff

## Objective

BC-02/03的可独立交付前置能力：本地稳定Bot交接时保留来源固定项目要求，目标自己的模型/权限不变，沿原Inbox/SessionStore出生和回报。不新增群运行时、UI面板或任务验收按钮。

## Acceptance criteria

- 本地项目session start自动继承固定项目背景，目标身份/工作区重新绑定；当前双方成员/唯一工作区/归档验证通过后才出生。
- 实际注入文本包含原send.request和有界固定背景，显示正文不泄漏控制内容；冷读仍保留背景。
- 外部CLI/跨设备不继承本地项目；无项目旧路径保持，失败与未知ACK不静默重派。
- 单元、实际隔离SessionStore、独立复核与类型/lint通过；原生构建检查和真实模型/用户验收分别列证据。

## Completed

- 复用原Admin、Rust FreshStart布尔传输与目标Session出生入口；权威projectSpace快照只有原SessionStore持久化。
- 固定项目内容/revision与当前身份/成员准入区分；目标保留自身Agent配置。项目归档/删除、成员失效与坏配置明确拒绝。
- 同一个隐藏提醒携带固定背景；没有展开动态历史、合并私人记忆或修改权限。
- 更新CLI内置指南及局部架构文档。稳定清单见 dev-docs/bot-collaboration-20261107/PLAN.md。

## Verification

- Source digest: `903dfb3355d3a337d88d7b8077aa01c40f8fe9cfcbfd6bc0bc451eb631461168`; 68 unit, 30 isolated integration, 4 Rust fresh admission tests, independent55, typecheck, scoped eslint, server build, classification, docs and diff PASS; dependencies 0 errors/20 warnings; main and native acceptance pending original owner.

- 68 unit / 30 integration范围通过（含新增隔离真实持久化、冷读、首轮注入、成员拒绝、未知ACK和显示转义）；独立55/55通过，无P1/P2。
- TypeScript、修改文件ESLint、server build、classification通过；依赖检查0errors/20既有warnings。
- 完整证据与Rust原生代码检查结果见 dev-docs/bot-collaboration-20261107/acceptance.md。

## Blockers and unknowns

- 未把mock执行器/隔离持久化等同真实模型、运行中桌面或生产验收。群关系、协作入口和成果汇总仍在后续BC-02/04/05。
- 前两批SimpleUX组合8240ddbc不在当前main，本分支不包含该组合；原owner分别接收，不要求冻结版本插入本批。

## Deployment request

- Required: desktop/macOS-arm64/updater/sharedCI/main；无cloud/mobile/Host/website部署。
- Owner: 01a12bc2-907a-7702-b6dd-788225c5dfe4，仍唯一负责main/共享CI/版本/正式构建/安装/验证。开发不触发竞争PR或共享CI。
- Handoff: 本分支精确SHA、任务记录及acceptance；无新数据库/配置schema迁移，现有projectSpace字段兼容，Rust布尔缺失默认false。签名制品/摘要/发行批次由原owner分配。
- Status: source verified; main/CI/native release pending owner. 真实两Bot模型和用户路径未验收。

## Next step

原owner接收精确远端源，按最新main保留PR257简洁聊天行为后统一验证与交付；开发按PLAN补稳定协作主题/负责人/成员入口并完成真实两Bot闭环。
