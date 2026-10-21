<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/login-oauth-standard-20261022 -->
<!-- git-project-sync-task:base=263b1cf5c064c7ee5f375fd5c3f5697854e35723 -->
<!-- git-project-sync-task:status=in-progress -->

# MOXBOTS-LOGIN-RETURN-02 — 标准 OAuth 桌面登录

## Objective
保留 OAuth/OIDC 与 PKCE，收敛浏览器到桌面交付，简化界面；保留原账号、device ID、Keychain 和配置/registry 唯一提交权威。基于远端 main 263b1cf5。不修改已冻结制品。

## Acceptance criteria
- [x] 核对 canonical remote/main、隔离工作区与原发布负责人；已向两位负责人发出范围更新。
- [x] 架构及兼容边界审阅，标准授权码/PKCE/回调接线，移除新桌面路径自定义 poll/ACK 依赖。
- [x] 单一登录入口、明确成功/失败/重试，真实本机回调及必要回归、独立审阅。
- [ ] 提交推送，owner 统一 CI/合入 main，独立核实远端 main。
- [ ] 云端 owner 先发布兼容服务；桌面 owner 分配新构建并发布，记录 SHA/制品摘要/回滚目标。
- [ ] 原 Air c109300d-b8c9-45e3-9246-cb1e31d7f42b 登录成功，正常 Cmd-Q 并重开后登录保留；真人反馈和服务端原 principal/device 证据相符。

## Completed
旧修复已通过 PR180 合入 main 2adf5c1d，云端程序已发布；旧 516.5 是签名候选，Air 验收尚未闭环。不能将其算作本次新标准流程交付。516.8 当前批次由桌面负责人继续处理，本分支只进入下一未冻结批次。

## Verification
源实现、模拟、真实联调、main、发布和 Air 验收分开记录。本地服务210PASS/8ignore、native57PASS、DOM28PASS与独立审阅完成，详见 dev-docs/login-oauth-standard/acceptance.md；生产及Air未完成。

## Blockers and unknowns
原 Air 无可用远程诊断连接，用户已同意新版本就绪后按链接操作。当前实际本机错误原因未知；不清理凭据，不以其他 Mac 代替 Air。

## Deployment ownership
Desktop/combined CI/version: 01a12bc2-907a-7702-b6dd-788225c5dfe4。
Cloud auth/101: 01a12b99-7b38-78b1-831f-9c60257d386a。
开发只提交与交接，不越权执行共享 CI、正式打包、部署或日常客户端重启。云先桌面后；旧接口/会话兼容，两单元可各自回滚；不回滚业务数据库或 key。

## Next step
注册表22PASS、最终边界复审通过，冻结提交推送精确SHA交两位既有owner统一CI/main/云先桌面后发布；准备原Air真实验收。
