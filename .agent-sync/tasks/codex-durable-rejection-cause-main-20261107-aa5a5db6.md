<!-- git-project-sync-task:source-digest=6a7dedace00114f6311fefdcf35b759634005076c9801fb5789788e93ee4c0cd -->
<!-- git-project-sync-task:id=af68860b-a5a9-49da-87e8-1541ea7b7863 -->
<!-- git-project-sync-task:version=2 -->
<!-- git-project-sync-task:branch=codex/durable-rejection-cause-main-20261107 -->
<!-- git-project-sync-task:base=a650939d2c38b8dc04750e282b159ddaac8ea346 -->
<!-- git-project-sync-task:status=in-progress -->
<!-- git-project-sync-task:scaffold=false -->

# Task: Preserve upstream rejection when durable recovery declines without cancelling the request

## Objective

MB-MODEL-REJECTION-CAUSE-20261107：持久恢复拒绝过长 Retry-After 后，保留已收到的上游 HTTP 502/429/503；仅真实 Stop、route/root/owner 撤销返回取消。范围为 desktop ModelFailover 与同步 Stop 接线，不增加重试、执行预算、权限或业务重放。

## Acceptance criteria

- [x] 基线真实 SessionModelRecovery + loopback HTTP 在两协议复现 502 被误换 499；修复后保留首因。
- [x] 暂停恢复后 SDK 相同请求不再次发送；Stop（含 HTTP abort 前）、route/root/owner 撤销仍取消。
- [x] 相关 256 unit、94 integration、类型、lint、测试分类通过。
- [ ] 原发布负责人独立审查并集成远端 main，构建新的不可变候选。
- [ ] 新包原生 502/断连恢复及原会话恢复通过，再正式发布。

## Completed

- wait(undefined) 先区分请求生命周期与恢复自己撤回的重试权限；活 Query 完成原始拒绝的有界记账。
- agent-session isLive 同步检查 builtinInterrupt，保留真实 Stop 在 HTTP abort 传播前的撤销。
- 基于实际远端 main a650939d2c38b8dc04750e282b159ddaac8ea346；候选基线旧分支未改写。源码与本地验证完成，未宣称安装或生产验收。
- desktop/macOS-arm64/updater/sharedCI/main 唯一负责人仍 01a12bc2-907a-7702-b6dd-788225c5dfe4；本开发分支不触发共享 CI、不分配版本、不构建安装。

## Verification

- Source digest: `6a7dedace00114f6311fefdcf35b759634005076c9801fb5789788e93ee4c0cd`; Baseline RED: three status units and two actual recovery/HTTP protocol cases. Fixed 256 unit and 94 integration PASS; tsc --noEmit, scoped eslint max-warnings 0, test classification and diff check PASS. Native package acceptance pending sole owner.

- Baseline RED: 429/502/503 三个重试权限撤回案例；实际 SessionModelRecovery + Anthropic/OpenAI HTTP 两案例均 499 vs 502。
- GREEN: 256 unit（model-recovery/model-failover/context-recovery/builtin model-recovery）及 94 integration（bridge failover/builtin recovery/builtin failover/buffered-tool-progress）全部通过。
- tsc --noEmit、四个改动源码/测试文件 eslint --max-warnings 0、测试分类通过。真实业务供应商及原用户操作未调用。
- 私有原始日志与摘要位于项目 work/MB-RECOVERY-INCIDENT-20261101/followup-20261107/durable-rejection-source/；unit SHA256 e76b1340610ad1de028677ef4e7764d0e40a2609cdf013ae652e5b094bee80f5，integration SHA256 0a8a21cf6439fb9fbe690699a48adf1ab2ec6c86fdd21d7204ecade02d1acdab。
- 可复查说明 dev-docs/durable-rejection-cause-20261107/acceptance.md。

## Blockers and unknowns

543.6 实际安装验收发现 502 被误换 499，不能晋级正式渠道。本分支修复尚需原负责人集成、精确 CI、新不可变包、原生复验及正式发布；未清除原会话或未知操作账本。

## Next step

原桌面发布负责人审阅本分支精确 SHA，合入现有 PR260 的下一不可变候选，重验未人工 Stop 的真实 HTTP 502、响应前 socket 断连与原会话恢复；通过后才晋级正式更新。
