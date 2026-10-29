# MOXBOTS-MULTIAGENT-UX-20261028

用户截图中，计划步骤和子 Agent 一起列在“关联成果”下；已经被 Plan hook 拦截的子 Agent 在详情标失败，主聊天却没有失败说明，还计入待验收。本次保留原并行机制、Session/ledger/Runtime authority 和原聊天交互入口，修正状态解释与信息层级。

## 交付行为

- 主聊天按子任务展示当前子 Agent 执行、状态、简短结果/失败原因、已有模型/时间与详情入口。失败先于正常进度展示，状态同时使用文字和颜色。
- 主 Agent 自行执行的计划步骤独立折叠；状态栏明确“已验收 X/Y”，失败/中断/待确认另列。成功回传与主 Agent 验收通过保持分开。
- Plan hook/Agent 类型拒绝与详情页使用同一个精确前缀识别器。没有 `isError` 的历史拒绝不再被当成成功报告；普通报告谈及错误不据此判失败。
- 对旧账本中同一 `:initial`、无 activation/runId/provenance 的 `completed` 推断，只在当前 transcript 有确切派发拒绝时做有界更正。旧 review 保留但不使失败恢复为完成，UI将它标为历史记录。明确 native/notification 和新 activation/run 的事实仍优先。
- 失败显示“查看原因”、运行显示“查看进展”、未知/中断显示“查看记录”；仅已回传/已验收/返工报告使用“查看成果”。原工具行注解和协作行共享同一标签判定。
- 失败详情先显示简短原因与处理责任，原始错误默认折叠；被拒绝的派发不显示虚假的子 Agent 执行时长。
- 验收请求只针对当前待验收尝试；失败/中断/未知/返工允许追加处理意见。生产 Chat 和验收夹具复用精确 session/task/attempt 目标 guard；反馈保留已有草稿，不发送、不重试任务。

## 验证

基线为远端 main `caab6ab648b434bee17930f90c4df4de87564bba`，隔离分支 `codex/multiagent-ux-20261028`。Node v24，使用既有依赖树，无安装新依赖。最终源码摘要见 `evidence/source-sha256.json`，结构化结果见 `checks.json`。

| 层次 | 验证及结果 |
|---|---|
| 共享状态、renderer projection/action guard/DOM | 8文件113项通过，覆盖真实hook原文、旧误判/旧accept保留、native/notification来源、新activation/run、失败可见/不可验收、反馈/重试请求、会话切换、原生工具注解 |
| 服务边界与磁盘集成 | routes/session-task-orchestration.unit、task-orchestration.integration、session-task-dispatch.integration共65项通过；不调用真实Provider |
| 类型、lint、分类、依赖 | TypeScript无错误；本次源码/测试ESLint无warning；分类通过；depcruise无error，有18项既有orphan warning，不扩大范围处理 |
| 本地构建 | `MYAGENTS_BUILD_PROFILE=moxbot npm run build:web`通过；最后文案/原工具注解变更后再次以同profile完成Vite生产renderer构建。已有大chunk警告保留；不是正式App制品 |
| 独立UI | `review.md`：1440×900、1000×740、390×844，明暗/中英文、失败/运行/回传/已验收/未知、新尝试、详情4标签、Escape/focus trap、草稿、请求失败恢复。首轮完整矩阵通过；最后标签变更独立源码复核通过，审阅者新IAB连接不可用，没有假称其二轮浏览器通过 |
| 主负责人最终UI | 使用自己仍有效的IAB tab实际复验：失败原因/原错误折叠、反馈追加原草稿、不显示假0:00；未知3项均为查看记录，无查看成果/验收；未知详情无报告；mixed仅1项请求回执、仍已验收0/8；工具注解标签由DOM回归覆盖 |

本地预览：`http://127.0.0.1:4386/@fs/Users/zhangshaohua/Documents/Codex/2026-10-28/moxbots-multiagent-ux/dev-docs/multiagent-ux-20261028/preview.html`。使用真实产品组件和合成messages/ledger/队列回执；页面控制按钮仅用于验收，不进入产品。复现：Node24环境在仓库运行 `./node_modules/.bin/vite --host 127.0.0.1 --port 4386 --strictPort`，然后打开该路径。

## 执行与修复记录

主负责人直接实现renderer、Chat入口guard、集成及最终复核；`status_consistency`独占shared修复/回归；`ui_review`为非实现者UI owner。两位worker均请求 `gpt-6.1-sol / medium`，由于跨层状态权威与多状态窄屏交互需要明确判断，采用此档位。实际模型路由、token/费用未暴露，不估算节省。采用 `ai-yaoren-local` 纯内置模式，无外部模型调用。没有操作真实业务任务。

三次有实质证据的修正：独立审阅发现unknown夹具同时声明native completed的矛盾，改为只有异步派发回执；主审发现失败反馈被旧Chat待验收guard拒绝，分开review/feedback目标准入；主审/DOM发现unknown原工具注解仍称“成果”，统一详情标签并复核。失败证据与测试日志在本机交付工作区保存，记录位置在checks.json。

参考[OpenAI公开Subagents说明](https://learn.chatgpt.com/docs/agent-configuration/subagents?surface=app&translationFallback=zh-Hans)中“可单独查看每个子Agent活动、结果由主聊天汇总”的组织方式；具体视觉沿用产品Proof主题。Codex原生app读取被工具禁止，未绕过限制、未声称观察了当前原生实现。[Web Interface Guidelines](https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md)用于检查明确按钮文案、键盘焦点及内容收缩。

## CI、主干与发布

部署单元为desktop/macOS-arm64/updater及其combined CI/main intake，唯一既有负责人 `01a12bc2-907a-7702-b6dd-788225c5dfe4`（MoxBots桌面端统一打包负责人）。该会话的 `MOXBOTS-NEXT-RELEASE-20261028` 已明确等待本源码；其当前计划为0.5.25/525.1、未冻结。本任务只交精确远端SHA/证据和release-queue记录，不自行建触发共享CI的PR、不分配版本/打正式包/安装/重启客户端，不修改owner的BATCH。

代码已在本任务分支实现并本地验收；共享CI、合入真实main、签名公证制品、安装、真实Provider/原生WebView及生产验收由原owner按该批统一完成，不能由本地组件验收替代。无云/Host/mobile/网站单元部署或迁移，回滚为原owner保留的上一正式制品；此UI不改变数据格式必需项或授权规则。旧账本无provenance时无法普遍辨别所有历史来源，因此不宣称普遍修复所有历史状态。

集成注意：本批 `composer-status` 的精确 `580e3936058227efad516d1a0651a61887e4fda9` 同改状态栏、任务面板、语言文件。既有owner应保留其32px无边框布局、focus/统一disclosure、固定验收入口，同时合入本任务“已验收”口径、失败/中断/未知计数；不要整文件替换任一成果。此开发分支不提前选入另一任务提交。
