<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/recovery-review-completion-fence-20261029 -->
<!-- git-project-sync-task:base=a589ec1daeee9728afeed13226479948b71585e6 -->
<!-- git-project-sync-task:status=in-progress -->
<!-- git-project-sync-task:scaffold=false -->

# Task: MB-RELIABILITY-20261028-DEPLOY-01: distinguish Query completion fence from teardown

## Objective

Make recovery review available for a genuinely parked idle builtin Query before any first input, while keeping teardown and unknown-action fences. Release build527.3 through the existing desktop owner.

## Acceptance criteria

- Exact-source CI/main; signed cold and warm native review; immutable same-artifact local install and 101 updater delivery.

## Completed

- Real527.2 failure and original artifacts preserved; current-generation waiter requirement reviewed; no model/tool or business replay.

## Verification

- 18 actual-adapter integration; 82 related signature/recovery/turn unit; tsc, scoped eslint, 3 version contracts, classification and whitespace PASS.

## Blockers and unknowns

- Exact-head CI and new signed native cold review remain required. Full model/Goal matrix and cloud login keep their existing pending/deferred scope.

## Next step

Commit/push the reviewed source once, create one PR, collect actual exact-head automatic checks.

- Give the next agent one concrete starting action.

## MB-RELIABILITY-20261028-DEPLOY-01 接续验收

目标：0.5.27/build527.3 修复真实527.2冷恢复核对拒绝，完成当前Root负责的 main 与本地/101同制品交付。

- [x] 核实远端main a589、独立clean worktree与唯一desktop/sharedCI/updater owner。
- [x] 封存527.2签名原包和真实失败；101 stable525保持，业务输入/reconcile POST/重放均0。
- [x] 真实adapter重现2项失败；16项负例/既有项通过。首次依赖复制未完成的启动错误单独保留，不冒RED。
- [x] 仅修正Query完成凭据与当前parked waiter判断；保留abort/未知操作/Store/native签名所有围栏。
- [x] 18集成/82相关unit/类型/lint/3版本合同/分类/whitespace实际PASS。
- [ ] 精确head自动CI、正常合入远端main并核tree。
- [ ] 新candidate首次527.3 build/sign/Apple/archive，安装后冷恢复不发首输入核对、真实Provider温核对。
- [ ] 同份不可变制品本地与101正式更新发布；旧版本和rollback保持。

依赖/完成标准：必要门真实通过后才晋级，模拟/adapter测试不代替签名native。固定Reader/DSH/SDK与正常维护授权沿原批；主干/制品/真实验收/发布分别记录。证据：release-0527-20261029 owner r5*与candidate-5272-3b89e570/native-cold-review-failure.json（仅私有owner目录）。
