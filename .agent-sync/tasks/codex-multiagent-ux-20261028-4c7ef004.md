<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/multiagent-ux-20261028 -->
<!-- git-project-sync-task:base=caab6ab648b434bee17930f90c4df4de87564bba -->
<!-- git-project-sync-task:status=in-progress -->
# MOXBOTS-MULTIAGENT-UX-20261028

目标：保留原并行执行机制，让主聊天直接展示子 Agent 分工、真实状态、失败原因和核验进度。
范围：原 task ledger 的只读投影、inline 协作区、状态栏、详情错误呈现及对应测试；不改变 Plan 授权、调度、重试、业务会话或运行客户端。

## To Do

- [x] 核对 origin/main、分支、源码、现有部署归属和用户截图。
- [x] 定位 raw hook failure 被当作 completed 的两处判定差异。
- [x] 完成共享状态修复、保留 native/notification/activation 权威并覆盖旧误判。
- [x] 子 Agent 一行一项，失败/未知/中断可见，主 Agent 步骤独立折叠。
- [x] 主 Agent 核验仅针对可验收项；查看详情/反馈不重放任务。
- [x] Node24 相称回归、类型/lint及实际组件浏览器验收。
- [x] 非实现者 UI/交互/窄屏审阅和主负责人复核。
- [x] 源码、回归、独立审阅与任务记录已整理为精确SHA交接包（远端及handoff gate回执保存在工作区result.json）。
- [ ] 由既有 owner 协调共享CI/main、正式制品和原生/生产验收。

## 完成标准

用户无需打开详情即可识别失败；失败不能计入待验收；主界面与详情状态一致；模型/时间只显示已有真实记录；重试后的旧失败不覆盖新尝试；键盘、窄窗口、会话切换保留正确状态。

## 分工与验证

/root 实现 renderer、集成与总验收。status_consistency 独占 shared 状态判定/测试，请求 gpt-6.1-sol / medium；实际路由、token、费用未独立暴露。UI review 由非实现者 ui_review 完成首轮实际矩阵与最终源码复核，最后标签delta由主负责人实际IAB复验。采用 ai-yaoren-local 纯内置模式，无外部模型调用。当前阶段证据在 dev-docs/multiagent-ux-20261028/。

## 部署请求

仅 desktop/macOS/updater 及 combined CI/main intake，既有唯一 owner 01a12bc2-907a-7702-b6dd-788225c5dfe4。开发任务运行本地验证，不自行创建触发共享CI的 PR、不打包/分配版本/安装/重启日常App。新代码进入 owner 下一未冻结批次，正式源码SHA在外部交接回执提供。未向 owner 发消息；既有 owner 已通过共享批次和原heartbeat跟踪本任务，不需要另行跨聊天发送。无云/Host/mobile生产目标或迁移。

## 下一步与未知

本地178项相关测试、类型/lint、renderer生产构建和UI验收已通过，向原owner提交精确远端源码。源码/模拟UI/CI/main/签名制品/原生Provider/真实业务各自单独验收。用户原任务保持不重放；其 Plan 授权拦截本身在本任务范围外。

集成注意：同批已就绪 composer-status `580e3936058227efad516d1a0651a61887e4fda9` 同改 ExecutionStatusBar/SessionTaskPanel/语言文件。保留其32px无边框状态栏、focus/统一disclosure与固定验收入口，同时带入本任务明确已验收口径及失败/中断/待确认计数；不要整文件覆盖任一成果。精确融合由原owner本批处理并复验。
