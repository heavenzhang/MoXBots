<!-- git-project-sync-task:source-digest=fd8fd7137026094f7ab639ff66083fa59df31cc290ca0bd320fe0dca3e783246 -->
<!-- git-project-sync-task:id=152f4e3e-949e-4830-9f22-d8d9282f29ff -->
<!-- git-project-sync-task:version=2 -->
<!-- git-project-sync-task:branch=codex/release-recovery-background-0542-r1-20261104 -->
<!-- git-project-sync-task:base=065f2b6c8fb2aff58e774000909990b531ff8eb8 -->
<!-- git-project-sync-task:status=in-progress -->

# Task: MB-RECOVERY-UX-20261102 BG Root unified release0542

## Objective

将恢复核对放到后台，仅当前原任务确因精确未知调用阻断且需要用户信息时提示操作、影响与处理办法。原唯一desktop/macOS-arm64/updater/sharedCI/main owner统一集成和发布新0.5.42/542.1，旧541.1制品不变。

## Acceptance criteria

- [x] 精确producer33df108d全祖先、当前main065f2基线与原owner边界；无整支mobile/cloud/Host混入。
- [x] Root独审原Session锁、Stop/unknown/epoch/CAS/资源保留及提示准入；复现并修复逐条回执重复读取原生历史。
- [x] 12条已证明回执单次并行读取历史与native records、逐条原CAS提交；后续调用新读取、owner变化拒绝、未知保留。
- [ ] 必要精确CI全部实际通过，freshmain/祖先/受测整树先准入后正常merge并核远端。
- [ ] 新不可变签名包真实原会话静默/必要提示/定位/补充持久/Stop及未知保护通过，正常安全维护安装并恢复设置。
- [ ] 同份归档通过101现有stable CAS和完整正常TLS/签名/Range/路径postcheck正式发布。

## Completed

在干净新隔离worktree、修改前task-init PASS后正常组合producer33df；Root一次真实性能RED确认12条回执读取SDK历史13次，修复为每次锁内采集仅使用一个只读历史观察。每条收据仍重新读取当前ledger、身份检查和原CAS；文件检查保持实时；无跨调用缓存、工具调用、调查唤醒或新增调度器。8份manifest/lock统一0.5.42/542.1，source/签名包/真实验收仍分开。

## Verification

- Source digest: `65776dc05cdfbf0da618fd862615db0acd544a48cdd92d27d42e905647315522`; Root83unit+55DOM+118integration=256PASS; typecheck/scopedlint/classification/3versioncontracts/whitespacePASS; history reads13 RED to1 GREEN; signed native and publication pending

Root unit83 + DOM55 + integration118=256行为回归通过；scopedlint/classification及3版本合同/whitespace通过。Root首次typecheck仅新增受控Promise测试的泛型推断错误，原log保留；补充明确测试类型后复核，结果见协作owner记录。未触发额外正式包用于测速。author IAB desktop/390px为组件fixture，真实新签名客户端验收待本批完成。

## Blockers and unknowns

未冻结前精确sourceCI/main/formal/native/install/101尚未完成，不能冒交付。无新Agent或跨聊天发信；其他部署owner保持。旧541.1归档和本地安装原件保留，本批不复用旧最终包、不直接晋级旧包。完整模型/Goal故障矩阵及其他手机云路径不是本批默认验收。

## Next step

完成最终typecheck回读后冻结精确候选，唯一正常push/handoff/PR，组织自动精确CI；全门实际通过后按先准入再mutation执行正常main交付和新制品完整验收发布。
