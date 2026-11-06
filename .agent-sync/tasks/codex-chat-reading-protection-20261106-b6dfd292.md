<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/chat-reading-protection-20261106 -->
<!-- git-project-sync-task:base=05ea1e2c4d06f112585012a27503adc75c184dcc -->
<!-- git-project-sync-task:status=in-progress -->
<!-- git-project-sync-task:scaffold=false -->

# Task: 保护整轮结束时的阅读状态并补齐待确认真实验收

## Objective

MB-CHAT-STYLE-20261104 接续。先取得正常产品路径待确认/unknown原生验收，再保护任务结束时用户阅读中的过程与选区。仅 desktop renderer；保留现有滚动与会话authority。

## Acceptance criteria

- [ ] CHAT08 原桌面owner完成真实待确认/unknown样本可见性及恢复；合成数据不冒真实验收。
- [x] CHAT09 实现阅读保护：上翻、手动展开和选区在终态不自动隐藏；正常跟随仍自动折叠；手动收起、历史默认和搜索正常。
- [x] CHAT10 104DOM、双引擎几何选区、原工具间隙WebKit回归、完整typecheck、定向lint、分类及diff检查通过。
- [ ] CHAT11 精确远端分支交接、主干包含核实及唯一owner统一CI/发布/安装版复验。

## Completed

基于05ea1e2c4建立独立分支，保留PR256工具间隙live修复。现有owner已收到用户新增授权与原生验收请求。

## Verification

104项DOM通过，旧DOM选区RED与WebKit2388px跳动反事实复现；修复双引擎上翻/选区/详情锚点变化0px，正常跟随仍折叠。证据dev-docs/chat-reading-protection-20261106/acceptance.md。前次542.6受控8调用/137903ms整轮折叠、展开及会话tab重开通过；真实卡片缺口不继承为通过。

## Blockers and unknowns

桌面owner当前正在另一个已冻结版本的公证与安全维护流程，本任务等待其协调原生UI。未知操作只读或隔离无副作用测试，不清原账本，不重放业务。部署单元 desktop/macOS-arm64/updater/sharedCI/main 唯一owner01a12bc2-907a-7702-b6dd-788225c5dfe4；开发分支不触发共享CI或正式构建，无其他单元变更。新成果进入下一未冻结批，不覆盖现有候选。

## Next step

精确源分支交原桌面owner独立审阅；先完成CHAT08原生卡片验收，按用户顺序推进主干、统一发布与安装版阅读复验。当前543.1冻结候选不含本修复。
