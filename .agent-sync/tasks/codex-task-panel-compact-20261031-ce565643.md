<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/task-panel-compact-20261031 -->
<!-- git-project-sync-task:base=e11ee39b5629d6e74810b75e2155a45400d45005 -->
<!-- git-project-sync-task:status=in-progress -->

# Task: MB-TASK-PANEL-COMPACT-20261031

## Objective

消除任务重复展示、压缩底部任务列表并改善会话与Composer间隔；仅桌面renderer。

## Acceptance criteria

- [x] 当前任务仅有一个默认折叠的清单，紧凑行保留状态及详情。
- [x] Composer顶部16px留白纳入既有高度观测；窄窗长标题不横向溢出，滚动与键盘可达。
- [x] 完成历史可展开查看，原验收/执行权威不变。
- [x] 36 DOM、type/lint和真实组件合成浏览器验收。
- [ ] 原owner统一CI/main、正式发行、原生真实路径验收。

## Completed

运行中聊天尾部重复清单移除；全部验收历史默认收起。底部卡片改紧凑行，任务详情高度限制200px/28vh，状态区独立边界及间距。实现证据见 `dev-docs/task-panel-compact-20261031/acceptance.md`。

## Verification

Node24：36项DOM通过、全量TypeScript通过、定向ESLint通过、组件预览构建通过。内置浏览器明暗/390px容器/展开/收起/滚动/Escape焦点/完成历史通过；合成账本而非安装版真实会话。

## Blockers and unknowns

desktop/macOS-arm64/updater、sharedCI/main唯一owner `01a12bc2-907a-7702-b6dd-788225c5dfe4`。现有0.5.28/528.1冻结，本开发不创建触发共享CI的PR或自行合并发布。没有实际安装、正式制品摘要和真实会话验收；也未宣称已通知或owner已接收。

## Next step

精确分支SHA提交既有release-queue；由原owner选入下一未冻结批次，正常CI/main、签名发行后验证原会话滚动和Composer避让。
