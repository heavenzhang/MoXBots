<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/remote-content-completeness-20261024 -->
<!-- git-project-sync-task:base=fda7728fa11ee0b1138e9357b2b81e680f408043 -->
<!-- git-project-sync-task:status=in-progress -->
<!-- git-project-sync-task:scaffold=false -->

# Task: REMOTE-CONTENT-20261024 — complete remote transcript presentation

## Objective

REMOTE-CONTENT-20261024：修复远程会话只显示结果计数、长正文/工具结果及超过10项工具被截断的问题。复用现有snapshot/get/before只读分页和本地渲染组件，不新增协议字段、执行owner或通信模式；不重放截图中的任务，不操作日常客户端。

## Acceptance criteria

- [x] 核实权威仓库、main、隔离工作树和并行任务边界。
- [x] 定位summary折叠与16000/2000/10上限造成的内容省略。
- [x] 将原始可显示内容按现有wire限制分片，保持顺序和稳定分页锚点。
- [x] 远程结果默认可见，保留用户折叠选择、本地展示规则和只读边界。
- [x] 定向回归：长中文、emoji、超过10项工具、正文穿插、分页和消息刷新。
- [x] 实际组件桌面/窄窗视觉与交互验收；模拟证据单独标识。
- [x] 源码提交并推送远端，CI/main/下一未冻结批次请求已交既定负责人。
- [ ] 统一owner协调共享CI与main合入。
- [ ] 远端main、签名制品、真实双设备路径分别核实；未发生前不标完成。

## Ownership / 依赖

当前聊天01a169c3-e66f-7932-bca7-5855cf3605df负责源码、定向测试、UI自验和交付记录。本轮单Agent，未调用外部模型；模型/推理实际值及成本未从runtime获得。

桌面单元唯一CI/发布owner为01a12bc2-907a-7702-b6dd-788225c5dfe4；版本/候选/共享CI/构建/安装/回滚由其统一安排。现有用户选择保留任务运行、稍后维护，不在本轮重启。并行REMOTE-UI-SMOOTH-20261024拥有polling、transcriptPresentation和流畅度优化；本轮独占server projection与共享BlockGroup/ProcessRow远程默认披露规则。

## Completed

完整读取分片、默认展开、相关回归和合成组件验收完成。功能提交ea598bfd6d1df7ddbc6857f093f55eef762e8f18已推送，发布请求写入工作区release-queue并发送原负责人；尚无接收/CI/main回执。

## Verification

`dev-docs/remote-session/content-20261024/acceptance.md`及同目录合成截图/134项测试日志；TypeScript、受影响ESLint、分类和diff检查通过。界面由主Agent自验，非独立审阅；390px为会话容器宽度。没有真实业务写入。现安装0.5.19/519.2未更换。

## Blockers and unknowns

共享CI、main与正式包由既有owner独占协调，本聊天不触发或接管。未验证真实双端；候选版本及制品摘要未分配。只读核实的远端main仍为base；现安装0.5.19/519.2。首次handoff检查因记录缺少协议规定标题及一次远端探测未解析而失败，标题已修正；独立ls-remote核对main/工作分支成功，继续复核gate，不将失败报为通过。

## Next step

向既定唯一CI/发布owner补充文档提交后的精确SHA，协调与其他远程改动组合、共享CI和main交付。正式版本号、制品摘要及真实双设备只读验收保持开放。目标端读取修复与控制端默认展开均需进入包；不重发原任务。
