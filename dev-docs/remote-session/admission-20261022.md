# MB-REMOTE-ADMISSION-20261022

## 交付范围

修复远程消息被拒绝时原因丢失和界面误导。桌面及移动Session target对已知拒绝原因投影有限错误码，分别记录enqueue/dispatch阶段及原operation/Agent/Session ID；原始adapter错误、任务文本、答案、路径、Provider配置及凭据不会进入新增回执或日志。保留已有拒绝、Session出生CAS、操作去重及Stop行为；不自动换Provider、权限或Session，不重发原任务。

查看端可正确解释旧的REMOTE_SESSION_ADMISSION_REJECTED，不再把它描述为读取或连接故障；新详细原因需要目标端更新。分类依赖当前adapter已知文本，为旧接口的保守兼容层，未知文本仍拒绝且不外传。

## 验收

- [x] unit：admission14、desktop19，共33项；包含首次start的enqueue/dispatch失败、同ID回执重复查询不重复adopt/发送。
- [x] DOM：RemoteSession18项，包括拒绝提示、草稿、刷新无二次发送及原交互/Stop回归。
- [x] integration：mobile22、receipts6、receipts-failure1，共29项；真实临时磁盘receipt终态、去重、未知状态和写失败回归。
- [x] 共80项、6文件，均通过。Node24.21.0；命令为 node node_modules/vitest/vitest.mjs run --project unit src/server/remote-session/admission.unit.test.ts src/server/remote-session/desktop.unit.test.ts --project dom src/renderer/features/remote-session/RemoteSession.test.tsx；以及 --project integration 下mobile.integration、receipts.integration、receipts-failure.integration。desktop追加start案例后重新运行19项通过。
- [x] 全量tsc --noEmit、修改TS/TSX的ESLint --max-warnings=0、test classification、git diff --check通过。
- [x] 实际RemoteSession及TextChatComposer在隔离Chromium中执行发送→安全拒绝→刷新；草稿保持，start计数1，1280/800宽度无横向溢出。传输、空transcript与账号fixture为合成数据，不是真实远端联调。由当前主Agent自验，没有独立审阅。
- [ ] 共享CI、main集成，由既有唯一owner协调，不在开发聊天自行触发。
- [ ] 新制品、发布、目标安装和真实双设备验收，均未完成。

## 原故障边界

截图目标Mino/Mac-mini-3.local，用户只估计为0.5.15，确切build未知。当前机器Mac-mini-2.local；非交互只读SSH因目标.local无法解析失败，未得到目标本次拒绝日志或回执。不能把测试中的Provider拒绝当作该次真实根因，不能声称目标发送已经恢复。没有重发截图中的业务指令，也没有配置/凭据、运行任务、安装或服务变更。

## 证据与接续

原诊断、浏览器fixture、截图和结果：WPS交付工作区 work/MB-REMOTE-ADMISSION-20261022/。测试源码完整随Git提交；本地截图不是生产证明。既有desktop builtin client/macOS updater唯一CI/发布owner01a12bc2-907a-7702-b6dd-788225c5dfe4；下一未冻结批次纳入精确SHA。详见.agent-sync/tasks/codex-remote-admission-20261022-a033d65f.md。没有新版本号、tag或制品摘要，因为本聊天没有构建发布。

执行：当前Agent单独实现、自测、审查与提交；0子Agent、无外部模型调用，精确用量/费用未知。浏览器隔离fixture的依赖/样式装配曾失败，保留为测试环境问题并修正；未据此修改产品逻辑或降低验收。后续优先核验目标原operation日志/回执，再作配置或运行逻辑修复。
