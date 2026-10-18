<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/bg-task-log-001-20261018 -->
<!-- git-project-sync-task:base=ffaf0005aedf88df49e127781020948bdb8cebe1 -->
<!-- git-project-sync-task:status=in-progress -->

# Task: BG-TASK-LOG-001 查看后台任务状态和执行日志

## Objective

BG-TASK-LOG-001：修复任务列表点击无反应，点击直接打开当前会话后台任务状态和只读执行日志；原消息定位为次级操作。用户确认仓库并授权发送给既定唯一桌面发布会话安排下一未冻结版本。无业务数据写入、模型调用、日常App重启或并发发行。

## Acceptance criteria / To Do

- [x] 核验原工作区/实际远端/main，隔离从 ffaf0005a 开始，保留旧工作树。
- [x] 确认故障路径：任务边缘事件可以没有可定位工具卡片；scrollToTool 无目标时静默退出。
- [x] 会话范围只读后台状态/有界日志接口，真实终态与日志缺失分离。
- [x] 点击即时详情、加载/空/缺失/错误/恢复、自动刷新、完成后保持窗口。
- [x] 窄宽/浅深、长文本、键盘/焦点、异步Session切换与关闭取消验收。
- [x] 后端/DOM回归、typecheck/lint/build、独立UI审阅。
- [ ] 提交/PR/CI/最新主干整合与远端包含核验。
- [ ] 唯一桌面发布会话收到已验收发布请求；签名包/安装/真实路径另核。

## Completed

主Agent：前端、集成、主要用户路径、主干交付和发布协调。backend：server模块及shared background-task DTO。UI验收owner在实际页面准备后独立审阅；采用现有design tokens，1440/390宽度，浅/深，任务运行/空/缺失/失败/结束，点击和键盘关闭/焦点恢复。证据 dev-docs/bg-task-log/acceptance.md；生成制品在工作目录output/bg-task-log-001-20261018，不提交日志/凭据。

## Deployment

目标：下一未冻结桌面正式版本。既定唯一owner 01a12bc2-907a-7702-b6dd-788225c5dfe4；用户明确授权向其发送修复记录及安排发行。本聊天不覆盖签名包、不操作stable、不停止活动任务。无配置/数据迁移；程序回退至此前正式版，保留业务数据。

## Blockers and unknowns

源码/模拟验收/真实联调/main/生产验收分别记录。实现完成；后端297项、前端22项及最终mixed63项通过，独立IAB与主Agent关键路径通过，typecheck/web/server构建通过；full lint/dependency/docs已通过，真实报告日志文件读取ready（不保存原文）。最新main798f3a9c无冲突整合，下一步PR正常CI与主干交付；正式签名发行和原生用户路径待唯一owner。

## Verification

- Node24.21.0 full typecheck/lint/dependency/docs/web/server gates passed; initial fixture unused import fixed and lint rerun.
- Backend297focused cases, later65security subset, route12 and8background iterator/projection checks passed. Primary22DOM and final63mixed cases passed; counts overlap and are not summed.
- Independent IAB390×844/1440×900 light/dark and actual click/keyboard/long/terminal/error/Session transitions passed. Source and controlled integration evidence: `dev-docs/bg-task-log/acceptance.md`.
- Production file reader read original reported existing10byte output without persisting content; installed native proxy/user-path still unverified.

## Next step

Finish exact-head PR133 normal CI, synchronize latest main if needed, merge normally and verify remote main containment. Then send immutable main/PR/task/evidence to sole desktop release owner with the user's explicit authorization, for next unfrozen signed version and idle-window native verification. Native release remains open until actual artifact and user-path evidence.
