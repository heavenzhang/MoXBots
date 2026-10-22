<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/remote-admission-20261022 -->
<!-- git-project-sync-task:base=5eb2ebc87489b92e250338026e2b971346ed9e15 -->
<!-- git-project-sync-task:status=in-progress -->

# MB-REMOTE-ADMISSION-20261022

## Objective

修复远程消息接纳失败原因被吞掉及被错误提示为连接失败的问题。用户要求“解决并提交”；目标 Mino/Mac-mini-3.local，目标版本仅用户估计0.5.15，构建号和实际拒绝原因未知。只做可证实的错误处理修复，不声称根因已查明或目标已恢复。

## Acceptance criteria

- [x] 已知Provider、model、permission、workspace、queue、cancel与prepared拒绝可安全投影到有限错误码；未知原文不进入wire、receipt或新增日志。
- [x] 区分enqueue与dispatch；保留原操作ID/回执去重与不自动重发语义。
- [x] 界面按拒绝原因给出处理位置，旧版通用拒绝码也不再提示连接失败；草稿和显式重试入口保留。
- [x] 定向80项测试、类型/lint、实际浏览器fixture验收完成并保存证据。
- [ ] 远端分支同步、CI/main集成。
- [ ] 目标端升级后的真实双设备首发、刷新及后续发送验收。

## Completed

新增受限错误投影与关联日志；desktop/mobile共用；RemoteSession中英文原因提示。没有修改SessionEngine的准入判断、权限、Provider选择、出生CAS、原消息或真实任务。

## Verification

见 dev-docs/remote-session/admission-20261022.md，最终测试数据在那里维护。

## Blockers and unknowns

当前机器Mac-mini-2，SSH非交互只读尝试因Mac-mini-3.local无法DNS解析失败；未取得目标原始请求日志/回执。无法将某个候选拒绝原因当作本次根因。仅更新查看端可改善旧通用码提示，新的详细码需要目标端也更新。原故障仍待目标端验证。

## Deployment request

Required: yes，desktop builtin client/macOS desktop/updater这一既有不可分割单元。唯一CI/部署owner仍为01a12bc2-907a-7702-b6dd-788225c5dfe4。沿用既有分支/main策略，owner选择下一未冻结候选并分配版本。此分支push不触发Test（仅main/dev push和PR）；不在本聊天创建会触发共享CI的PR、触发workflow、构建、安装或发布。无schema/config迁移，不改冻结候选，回退沿旧制品；不涉及Host/cloud/mobile app独立发布。

Status: 本地验收完成，准备精确SHA推送交接；code/main、发布和真实验收分别追踪。没有向owner发送消息，发布队列仅为持久交接。

## Next step

完成本地验收并推送本任务分支，记录精确SHA交既有owner安排共享CI/主干集成和发布；目标可达后按原operationID查证，禁止自动重发原任务。
