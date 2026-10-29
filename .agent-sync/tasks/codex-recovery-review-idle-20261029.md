<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/recovery-review-idle-20261029 -->
<!-- git-project-sync-task:base=6993e70e2e953a65df15d7b3f6da9e731da636ed -->
<!-- git-project-sync-task:status=in-progress -->

# Task: MB-RECOVERY-REVIEW-WARM-IDLE-20261029

## Objective

完成原正式请求 MB-RELIABILITY-20261028-DEPLOY-01 的签名客户端验收。0.5.26 原生有限 QA 中，正常 Provider 回复后会话已 idle，但新增核对入口拒绝温 Query；保留该不可变 tag/制品与失败证据，停止101晋级，用新版本0.5.27/527.1修复准入判断。

## Acceptance criteria

- [x] 真实 builtin adapter 回归先 RED：温 Query processing=true 时空闲核对失败，5个拒绝场景继续通过。
- [x] 修复仅区分有 Query 的等待期与无 Query 的启动间隙；原工作/后台/身份/签名/未知/存储围栏保留。
- [x] 7个实际 adapter/Store定向回归与8个既有Store冷恢复测试通过；原fixture错误断言与日志保留。
- [ ] 精确新源CI/main核树。
- [ ] 新不可变正式包一次构建、同份本地与101发布、原生核对入口真实通过。

## Completed

原生普通模型回复通过；温Query核对入口失败，未对任何未知记录发结清POST、未自动续跑。根因是 processing 覆盖整个 streaming iterator 生命周期，已有 waitForSessionIdle 文档明确如此；recoveryReviewOwner 原先无条件拒绝该标志。改为仅无Query的spawn期拒绝，其他谓词保持原值。真实适配器测试不 mock inspectBuiltinRecoveryActions，使用scratch HOME/SessionStore，不连接真实SDK或Provider。

## Verification

原失败包不重建、不改tag。新回归 first RED 1 failed/5 passed；修复后15 integration PASS；类型、定向lint、适配器/签名/原版本合同检查见后续记录。原始账本与业务历史保持；本次新包尚未构建或发布。

## Blockers and unknowns

现有101 stable仍0.5.25。本地0.5.26/526.1为有限QA安装，核对入口未通过，不冒正式交付。完整故障矩阵原两问仍pending，云浏览器登录与物理手机边界不变。原生新入口必须后续签名候选复验；新回归不是生产验收。

## Next step

Root 01a12bc2-907a-7702-b6dd-788225c5dfe4 继续唯一desktop/macOS-arm64/updater/sharedCI/main owner。新精确源CI通过后正常main合并/核树，再一次新527.1构建/签名/原AppleID/归档、fresh维护备份、本地原生验收与101现存stable CAS。无子Agent、外部模型或跨聊天发信；紧耦合准入修复由Root直接完成。
