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
