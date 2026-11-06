<!-- git-project-sync-task:source-digest=e411306b3ca746088ea82266403246aaa4fd26f731f0c9eef32462213b7c2ca2 -->
<!-- git-project-sync-task:version=2 -->
<!-- git-project-sync-task:id=1520b587-2cdb-4730-bfb7-355f23cbdb7f -->
<!-- git-project-sync-task:branch=codex/chat-jitter-20261106 -->
<!-- git-project-sync-task:base=14956e2fd898ba0cdb9d0be089da524c1a46c91b -->
<!-- git-project-sync-task:status=in-progress -->


# Task: 修复长历史聊天界面持续抖动

## Objective

MB-CHAT-JITTER-20261106：找到持续上下跳动根因并修复，交既有桌面负责人统一main/CI/发布和原会话验收。只处理滚动与Footer几何，不发送消息、不重试失败发送、不重放历史工具、不改会话数据/权限/模型。本Agent直接实现和主审，零子Agent。

## Acceptance criteria

- [x] 真实MessageList/Virtuoso中确定复现持续往返，退回旧逻辑会失败，保留失败与反证。
- [x] 跟随不越过已测量模型，待测消息保持挂载；Footer自然底部与模型一致。
- [x] 定向DOM 68项及WebKit/Chromium新增回归通过，手动阅读、恢复和显式回底保留。
- [x] 同步main后的相称检查、源码提交与远端工作分支已核实：062c2f6fe4091309e6b5ce126b65fc894f05c270。
- [ ] 桌面owner统一main/共享CI/构建安装及真实原会话验收；不以夹具或短时停稳代替。

## Completed

- [x] 权威仓库、分支、安装版本已核实；同步并合入main至66f76d734c1bdf026b3708d5ece9ed925a50a37e，保留他人成果。
- [x] 原窗口只读观察、原生几何和临时样式对照；临时设置已恢复、诊断面板关闭。
- [x] 确认grow/clamp/unmount根因：原生overflow领先size tree，旧follow越界导致空range并卸载待测尾行。WebKit和Mac WKWebView 110%均确定复现逐帧往返。
- [x] 同一motion owner读取既有extent上限、观察实际投影提交、保留安全像素接管；Footer flow-root修正漏算16px。
- [x] 真实任务Footer/测量延迟双引擎回归、StrictMode与嵌套作用域单测、全滚动WebKit/Chromium基线、原生110%对照及最终类型/lint通过。
- [x] 最终检查、源码提交和远端工作分支完成；发布交接要求见下。

## Verification

- Source digest: `e411306b3ca746088ea82266403246aaa4fd26f731f0c9eef32462213b7c2ca2`; Documentation only after source commit062c2f6; source and remote verified; WebKit/Chromium full and focused scroll checks PASS; native WK110 old motion FAIL vs fixed PASS; DOM68, tsc, targeted lint and diff checks PASS; no shared CI or installed acceptance performed by this task.

- Source digest: `dc7ed98d2b723296256c5805a572d3d4d3cdd91220b13b67bcc0f1864650d45d`; PASS: WebKit and Chromium full verify-chat-scroll; task-footer measurement handoff regression on both engines with 6.5s idle zero scroll writes; native WKWebView 110 percent old motion FAIL versus fixed PASS; targeted DOM 68/68; tsc --noEmit; targeted ESLint; doc-link tests 4/4; git diff --check. Current main 66f76d734 merged; installed original-session acceptance remains with existing desktop owner.

原生旧motion对照：top37798/42577交替、tailMounted true/false交替，放行后160帧尾行仍缺失；新motion同容器同110%：等待测量8帧始终挂载、top37797固定，交付后160帧top42576固定并到底。Footer原窗口natural69462.992889与model69447差约16px，flow-root对照后相符。

DOM68项通过；新增WebKit/Chromium回归通过；现有完整verify-chat-scroll WebKit通过。Chromium完整基线、最终类型/lint和diff检查也已通过；同步main后新增双引擎回归重验通过。原生隔离是测试容器，不是日常安装验收。完整证据与限制见dev-docs/chat-jitter-20261106/acceptance.md。

## Blockers and unknowns

没有待用户补充的信息。日常原会话已被另一既有排错任务新增文本改变尾部，但本任务没有发送消息。确定性复现通过独立合成数据暴露真实测量交付窗口，不删除或恢复原聊天。最终安装版仍须按原会话验收；不能宣告已发布或已验收。

## Deployment request

- Unit: desktop/macOS-arm64/updater，sharedCI/main沿同一owner。
- Owner: 01a12bc2-907a-7702-b6dd-788225c5dfe4，用户明确要求修复后交此会话统一发布/验收。
- Candidate: 由owner选择下一未冻结批，本开发会话不分配版本，不触发PR/共享CI/正式构建/安装。
- Compatibility: renderer only，无协议/数据库/权限变更；发布/回滚沿原制品流程。
- Status: 源码修复验证收口中；将提交精确SHA及安装后30秒静置、原长回复/任务汇总、阅读/回底/切换复验要求。

## Next step

现有桌面owner接收本分支的精确候选后，统一main/共享CI/下一未冻结版本及原会话验收；不抢占或覆盖冻结批。源码修复SHA为062c2f6fe4091309e6b5ce126b65fc894f05c270；分支最终tip还包含交接记录，以远端snapshot核实。建议整分支PR集成，保留此前排查记录，避免单独cherry-pick造成新增文档的modify/delete冲突。
