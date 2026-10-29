<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/recovery-review-cold-ready-20261029 -->
<!-- git-project-sync-task:base=8be89b1f88a96b70847cd142d70b055b1f8284b4 -->
<!-- git-project-sync-task:status=in-progress -->

# Task: MB-RECOVERY-REVIEW-COLD-READY-20261029

## Objective

完成原正式稳定性请求的原生冷恢复核对路径。527.1已真实正常Provider与温Query核对通过，但已有会话在SDKcontrol ready后仍以preWarm=true等待第一条输入，核对持续拒绝。保留该不可变包/源/原件与101的525通道，下一候选0.5.27/527.2不要求发送业务消息即可核对。

## Acceptance criteria

- [x] actual builtin adapter RED：cold-ready检查失败，warm abort/termination两项错误放行，共3失败/11通过。
- [x] 只允许控制面就绪且当前Query generation generator实际停驻；旧Query waiter、未就绪、未停驻、业务/后台、abort/termination仍拒绝。
- [x] 新14实际adapter回归及8真实Store冷加载通过；不会唤醒generator、变active、启动SDK请求或清原ledger。
- [ ] 受影响unit/type/lint/version检查、新exactCI与正常main核树。
- [ ] 新527.2一次正式包，签名客户端冷恢复和真实Provider后温核对、同制品本地与101交付。

## Completed

在既有lifecycle owner旁增加只读current-generation resolver事实；原hasMessageResolver语义和调度/唤醒行为不变。resolver设置/清除同时维护其generation，SDKcontrol-ready在Query replacement时仍按现有入口重置。recoveryReviewOwner对cold pre-warm区分ready parked和setup阶段，同时显式拒绝abort及termination，其他原scope/owner/ledger/签名/Store围栏不改。

## Verification

first RED 3失败/11通过保留；修复后22integration PASS（14实际adapter及8既有Store）。所有测试scratch HOME，无真实Provider、无用户数据/SDK进程或业务副作用。后续实际CI和原生包仍待验，不能以模拟代替。

## Blockers and unknowns

527.1温路径PASS不冒冷路径PASS。101仍0.5.25，无public527目录或publisher锁。当前App527.1为QA，3heartbeat已准确GUI恢复；旧117historyIDs和473个history/ledger文件原hash无变化。单独完整模型/Goal矩阵两问仍pending，云登录/物理手机边界不变。

## Next step

Root唯一desktop/macOS-arm64/updater/sharedCI/main owner完成相称检查、精确新head一次PR自动CI和正常main。新527.2候选/原AppleID/相同制品安装101，native应先在原冷恢复QA会话不发送输入地核对，再新正常Provider温路径验收。无新Agent、外部模型或跨聊天发信；不重编重签固定Reader、不重建527.1或早先已交付包。


## R3 exact CI follow-up — deterministic failed admission settlement

R2 exact e8284573 / Test40830567205 ended with 8success, 1DOMfailure, iOSconditional skip; actual ARM mac123303576112 passed all steps and was never canceled. Unit654files/7320PASS+5skip, DOM324files/2917PASS with one existing test failure. Full original connector log retained with Root receipts; the first direct log GET had a TLS redirect timeout and zero bytes, not a CI/storage failure.

The launcher failed-admission test awaited only the synchronous onSend call, then inspected text before its Promise rejection restoration committed in React. Its file and production composer blobs were unchanged between R1/R2. R3 controls the admission Promise explicitly, verifies immediate clearing of text/context, resolves false inside act, and retains every original text/context assertion. The same adjacent mention test uses the same explicit settlement. No production implementation, timeout, test skip or assertion weakening changes.

Focused DOM85PASS (75send +10checkpoint), typecheck and scoped ESLint PASS. R2 immutable freeze remains preserved; R3 keeps 0.5.27/build527.2 because no R2 formal artifact exists. New head automatic exactCI/main and signed-client cold/warm acceptance remain required. Existing PR212 receives one normal fast-forward push only after all R2 jobs became terminal; no manual rerun/dispatch or second PR.


## R4 Windows native watcher contract follow-up

R3 exact Test40833279955 passed the JS gate (including the corrected DOM admission cases), while Windows native workspace IO returned171PASS/1FAIL. The original NoCache watcher test required a Remove event after replacing and deleting the same file; the Windows trace contained late atomic.tmp rename-from and parent modification only. No rerun/cancel/production mutation was made.

The first isolated Mac experiment retained exact Remove on a distinct existing file and also failed: the exact production factory delivered Modify(Data(Content)) for the deleted path. That native counterexample is retained, so event kind is not a portable deletion proof. The product callback deliberately emits any successful native batch as coarse invalidation and DirectoryPanel re-reads the tree.

R4 changes only cfg(test): each create/rename/atomic-save/delete phase gets an independent native watcher and temporary workspace, requires an actual scoped invalidation, then verifies the exact directory entries and file contents/existence after the mutation. Previous phase events cannot acknowledge the next phase. The20second bound remains, no platform skip/cache/production change is added. New exact factory+test extraction on Mac passes all four phases in one test, strict offline harness clippy and rustfmt pass. This is not actual Windows or full Tauri acceptance; the next exact-source CI must run those gates unchanged. Original failure and first experiment are preserved. Wait for original R3 ARM to become terminal before the one next source push; do not cancel it.
