<!-- git-project-sync-task:source-digest=c8625881de3b1f4115b43a118c61b056985337d38aa5fae9753dadf373350a11 -->
<!-- git-project-sync-task:version=2 -->
<!-- git-project-sync-task:id=4e268aad-dab8-466d-9e6d-5e1ad931098e -->
<!-- git-project-sync-task:branch=codex/bot-identity-r1-20261101 -->
<!-- git-project-sync-task:base=58941e30d9a7e8c12a03ecb833900ff6869ab9b8 -->
<!-- git-project-sync-task:status=in-progress -->
<!-- git-project-sync-task:scaffold=false -->

# Task: MB-BOT-R1-20261101 Bot 身份与头像及第二轮协作原型

## Objective

稳定任务 MB-BOT-R1-20261101。用户确认第一轮实现 Bot 身份命名、内置头像选择及各入口一致展示；第二轮仅做基于实际界面的项目/Bot/会话/群组/任务关系原型。用户后续明确保留项目，已补独立项目入口与两项目复用同一 Bot 的演示；真实多项目执行未实施。保留现有样式、用户配置、工作区与历史。独立 worktree 从实际 main 58941e30 起步，不修改 group-phase1 的并发成果。

## Acceptance criteria

- [x] 现有长期身份入口统一使用 Bot；运行协议及临时子 Agent 保留现有标识。
- [x] 三个统一风格且轮廓不同的内置头像，通过原 icon 字段和原配置 owner 保存；切换不改变名称、工作区、会话和 Runtime。
- [x] 新建与设置共用选择器；侧栏、会话标题及其他原 WorkspaceIcon 入口一致；旧图标与 emoji 可继续读取和选择。
- [x] 相称 DOM/持久化回归、TypeScript/lint 和浏览器实际组件验证通过。
- [x] 第二轮可操作原型演示同一 Bot 的跨会话身份、群组点名、任务负责人及待验收/返工；标明模拟边界。
- [ ] 任务分支提交推送、远端 SHA 核实；主干/CI/桌面发行交现有唯一 owner，并分别追踪。

## Completed

- [x] 确认用户范围、实际仓库、最新主干、独立工作树与并发修改边界。
- [x] 确认现有 WorkspaceIcon/WorkspaceIconGrid 与 AgentConfig/Project icon 字符串及原保存入口。
- [x] 第一轮产品实现、三角色资源及第二轮原型完成；证据见 dev-docs/bot-identity-r1/acceptance.md。

## Verification

- Source digest: `c8625881de3b1f4115b43a118c61b056985337d38aa5fae9753dadf373350a11`; 164 targeted unit/DOM PASS; TypeScript/scoped ESLint/classification PASS; dependency check 0 errors, 18 existing warnings; local moxbot renderer build PASS; actual avatar picker and prototype 1440/768/390 UI verified; project context preserved in R2; native/main/release pending sole owner.

start/task-init PASS；164 项定向 unit/DOM PASS，tsc/定向 ESLint PASS，classification PASS；dependency-cruiser 0 errors / 18 existing warnings。本地 moxbot renderer build PASS（含 license/theme checks）；真实组件头像选择及原型 1440/768/390 交互观察通过。证据 dev-docs/bot-identity-r1/acceptance.md。

## Blockers and unknowns

无开发阻断。共享 CI/main 与 desktop 发布由既有唯一 owner 处理；未直接触发。新头像为本轮可选资产，用户可继续选择原图标。独立非实现者审阅尚未安排。

## Deployment request

- Required: desktop builtin client，需要后续发布；无 cloud/Host/mobile/website 变更。
- Owners: 01a12bc2-907a-7702-b6dd-788225c5dfe4，既有 desktop/macOS-arm64/updater/shared CI/main 唯一会话；本会话不接管。
- Handoff: 本任务远端分支和记录，最终精确 SHA 在外部回报；依现有流程提交下一未冻结候选，不触发共享 CI。
- Compatibility: 复用 icon 字符串及现有配置事务，无迁移；旧数据仍可读；回滚前把新增头像切回旧图标即可，不改历史或账本。
- Status: 代码及本地验证完成；真实原生持久化/主干/正式制品/生产验收未完成。原型不需部署。

## Next step

保存远端分支并向既有 owner 交接精确 SHA；在 owner 接收后追踪独审、共享 CI/main，原生配置重开与签名客户端验收。第二轮原型等待用户评审后另行实施。
