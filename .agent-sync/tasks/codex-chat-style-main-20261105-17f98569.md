<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/chat-style-main-20261105 -->
<!-- git-project-sync-task:base=39b3447659dd92e71f9bb86bf12f2326bb3e5fcd -->
<!-- git-project-sync-task:status=in-progress -->
<!-- git-project-sync-task:scaffold=false -->

# Task: MB-CHAT-STYLE-20261104 Root main integration

## Objective

将producerb506b852与最新main39b34476隔离集成，保留原生登录与mobile续期成果。完整核对Codex阶段持久化、终态锚点、旧记录、失败/未知/审批与成果可见性、搜索和虚拟滚动，完成精确CI与远端main。正式版本和真实长会话验收进入下一未冻结桌面批次。

## Acceptance criteria

- [x] CHAT01 精确producer/主干/干净状态与完整差异核实，生产自动合并。
- [x] CHAT02 commentary/final_answer沿原UnifiedEvent和Product Transcript持久化，可选字段兼容旧记录；成功终态且有最终答复/turnanchor才整轮折叠。
- [x] CHAT03 Root发现搜索展开未穿透旧记录内部步骤组，新增实际Message回归先RED12pass/1fail后GREEN，并贯通BlockGroup及phase展开，保留layout通知与原顺序。
- [x] CHAT04 组合本地106DOM、145unit及255模拟集成通过，完整typecheck/定向lint/whitespace通过。
- [ ] CHAT05 精确候选PR自动CI全门。
- [ ] CHAT06 freshmain/祖先/受测整树准入后正常合入一次，远端父提交与整树核实，收齐适用自动mainCI。
- [ ] CHAT07 后续签名安装版真实长会话、恢复入口、搜索/虚拟滚动及宽窄窗验收。

## Completed

原producer分支与原用户实例保留。当前Root独立分支基于main39b34476正常merge b506b852，源码无冲突。Root只补搜索/整体展开穿透安全完成步骤组并新增回归。失败、未知、运行中、子Agent入口保留，异步提问不随commentary隐藏，附件/文件编辑成果在外部展示。布局折叠调用原ChatRowLayout通知，全文搜索向Message传revealTurnProcess。

## Verification

Node24.20.0。八DOM文件106通过；Transcript presentation/Codex子Agent106unit、display39unit通过；external-session mock全文件255integration通过；完整tsc、定向ESLint、diffcheck通过。搜索回归原RED及后GREEN原件位于work/MB-CHAT-STYLE-20261104/owner。模拟集成不冒真实Provider或安装版长会话通过。

## Blockers and unknowns

真实安装版/宽窄窗/原会话需下一统一桌面候选，当前未分配版本。542.1冻结source与原tag/制品保持独立。Root核主干arm-validation文档确认受限本机12检查补证路径已有，之前hosted-only口径过严，纠正证据位于542owner/arm-local-admission-correction-20261105.json。合入仍按当前候选完整实际检查决定。

## Next step

正常保存精确组合源与远端handoff后唯一PR/自动CI，通过后freshmain准入与远端核实。后续session-menu、mobile continue02按单元队列接续。
