<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/remote-sync-20261023 -->
<!-- git-project-sync-task:base=5eb2ebc87489b92e250338026e2b971346ed9e15 -->
<!-- git-project-sync-task:status=ready-for-review -->


# Task: MB-REMOTE-SYNC-20261023 远程会话侧栏与自动同步

## Objective

用户已确认原型并于本轮要求实现。保持现有聊天/侧栏视觉，补齐已打开远程会话的侧栏入口、后台快照同步、未读提示、断线恢复与正常重开后的入口恢复。权威仓库由用户明确确认；不新增协议、执行 owner 或公开入口。

## Acceptance criteria / To Do List

- [x] 核对实际仓库、分支、干净工作区、远端 main 与既定桌面负责会话。
- [x] 原型已由用户确认；原型 15 项合成交互检查通过，不充当产品验收。
- [x] 代码：侧栏分组/来源/选中/关闭、后台观察/未读/重连、同网络串行与取消。
- [x] 自动化：13文件94/94、TypeScript、受影响ESLint、分类检查、Web生产配置构建通过；依赖检查0错误、18条orphan警告。
- [x] 实际组件页面：1440×900、900×760，9/9通过；独审和关闭按钮定位修复复验通过，见 review.md。
- [x] Git任务分支：功能提交已推送并核实远端SHA；本记录补充后再次执行handoff gate，结果以外部回执为准。
- [ ] main：既定owner统一CI/正常主干集成并核实包含成果。
- [ ] 统一桌面 CI/发行与双设备真实用户路径；分别报告，不能用浏览器模拟代替。

## Ownership and execution

主 Agent 独占 App、GlobalSidebar、remote-session UI/contract/规范与集成；remote_request_queue 工作包独占 renderer/api/remoteSession.ts 及其新并发测试。UI 独审在代表页面可用后进行。请求 worker 模型 gpt-6-luna/medium，实际值/用量等待运行时证据；主模型精确档位未知。选择依据：通信准入可独立验证，主 Agent 保持导航与会话投影一条集成线；无模型升级，采用 ai-yaoren-local 纯内置模式。

## Verification

产品代码、本地定向验证及独立页面复验已完成。证据见 dev-docs/remote-sync-20261023/acceptance.md 与 review.md；大型本地输出留 WPS MoxBot/work/MB-REMOTE-SYNC-20261023/。不存凭据或真实聊天正文。账号/传输为合成fixture，未据此宣称真实双设备或生产验收。

## Completed

已实现并独立复核远程Tab侧栏投影、后台快照同步、未读、断线草稿保留与重连，以及同connection请求串行/操作优先准入。功能提交已推送；首轮handoff正确验证远端SHA，但发现本任务记录缺少本节，现以追加文档提交补齐，不重写已推送历史。产品验证证据和全部源码均随远端任务分支保留。

## Blockers and unknowns

真实双设备与已安装包验收尚未执行。当前 CI 会在 PR/main 自动触发，沿用既定桌面负责会话协调；本开发会话只运行本地检查，不自行触发共享 CI/正式构建/发布。

## Deployment request

- Required: desktop client（renderer；随包 Sidecar 协议保持兼容），无独立云/Host 服务变更。
- Owner: 01a12bc2-907a-7702-b6dd-788225c5dfe4，沿用 canonical plan。
- Handoff: 本任务远端分支、精确提交、验收记录；仅申请下一未冻结批次，不混入已冻结519.1。
- Status: 本记录随验证通过的源码提交；远端分支回执、main、共享 CI、签名制品、发布和双端真实验收分别记录。
- Rollback: 客户端沿旧不可变制品回滚，无配置/数据库/协议迁移。版本由单元 owner 分配。

## Next step

执行最终handoff gate；按用户部署单元流程向既定桌面owner交接精确SHA与验收记录，统一处理共享CI/main和下一未冻结发行批次。owner是否接收、是否合入及发布分别以实际回执记录。
