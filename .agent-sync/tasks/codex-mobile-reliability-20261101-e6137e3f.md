<!-- git-project-sync-task:source-digest=fbee1c6f1ead933535ec48c67cde9eea9baf16fb8eaeb36c90f494d047d8c31d -->
<!-- git-project-sync-task:id=847ec907-6a46-415d-8b66-0151c7a45614 -->
<!-- git-project-sync-task:version=2 -->
<!-- git-project-sync-task:branch=codex/mobile-reliability-20261101 -->
<!-- git-project-sync-task:base=e11ee39b5629d6e74810b75e2155a45400d45005 -->
<!-- git-project-sync-task:status=in-progress -->

# Task: MOXBOT-MOBILE-20261101 草稿、最近会话与消息恢复

## Objective

修复手机已提交消息仍占据编辑框、提供跨 Bot 最近会话列表、自动只读确认原操作回执并恢复会话读取。保留既有账号、加密通道、原Session及执行owner。

## Acceptance criteria

- [x] 核实远端main、隔离工作树、任务及发布归属。
- [x] 已提交内容移出输入框；迟到回执不能清空后续编辑，拒绝和未知状态不丢草稿。
- [x] 跨Bot最近会话排序、搜索、原Bot打开；单个设备失败不抹去其他会话。
- [x] 同一操作自动查回执、前台恢复、快照初次失败恢复；不自动重发业务请求。
- [x] 定向回归、类型、lint与320/390实际页面及关键交互。
- [ ] 提交推送精确源码，交既有sharedCI/main与mobile owner；主干和新包真机分别验收。

## Completed

基线e11ee39b5629d6e74810b75e2155a45400d45005。定位processing只登记pending不清理草稿，回执无自动查询，初次snapshot失败不再自动poll；列表只展示当前Bot。

## Verification

- Source digest: `fbee1c6f1ead933535ec48c67cde9eea9baf16fb8eaeb36c90f494d047d8c31d`; Node24 policy 97 pass; native library 133 pass/1 existing ignored; typecheck/lint/touched Rust fmt/diff check pass; 390/320 IAB synthetic journeys pass; whole cargo fmt reports untouched baseline identity.rs differences; real phone acceptance pending existing owner.

97 policy、133 native通过/1既有ignored、type/lint、实际IAB390/320及3个P1修复复核通过。全库fmt有未改基线identity.rs格式差异，触及Rust文件fmt通过。证据 dev-docs/mobile-reliability-20261101/acceptance.md。

## Blockers and unknowns

sharedCI/main唯一负责人01a12bc2-907a-7702-b6dd-788225c5dfe4；mobile CI/build/sign/install/rollback唯一负责人01a12b99-7b38-78b1-831f-9c60257d386a。本分支不启动其共享CI或新包。真实iPhone版本、网络失败原因及端到端执行稳定性仍待原owner验证。

## Next step

保存精确源码与发布请求，原sharedCI/main owner组合集成，原mobile owner按新build7进行native+JS签名准备、目标手机可用后安装和真实路径验收。

## Collaboration

主Agent负责index、草稿、恢复、集成和整体验收；recent_sessions子Agent请求gpt-6.1-sol/medium，仅独占SessionHomeScreen、sessionPresentation和相应测试，无生产权限。选择依据为列表呈现可独立，避免共享发送状态文件；无模型升级/回退；不调用外部原因是当前内置工具足以排查，未调用AIRouter。实际用量和费用不可见。
