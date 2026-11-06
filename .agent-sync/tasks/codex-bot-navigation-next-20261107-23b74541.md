<!-- git-project-sync-task:source-digest=5ca4800eb546dc72de6cc2f271c09d2b79ca27c24e26944c6e3061d57e515112 -->
<!-- git-project-sync-task:id=6bfa6039-313f-4842-bea6-fd2b027f3a10 -->
<!-- git-project-sync-task:version=2 -->
<!-- git-project-sync-task:branch=codex/bot-navigation-next-20261107 -->
<!-- git-project-sync-task:base=bfbc92f3800a3ee4da5785b0f25fc61e2b7a32c2 -->
<!-- git-project-sync-task:status=in-progress -->
<!-- git-project-sync-task:scaffold=false -->

# Task: MB-BOT-NAV-20261102 下一轮导航与协作体验

## Objective

继续完成 MB-BOT-NAV-20261102 及原 R3 Bot 中心体验：导航可用性、项目工作入口、稳定群组与明确收件人、任务交接与成果链。保留项目及历史 Session/Bot 冻结身份，沿既有状态与持久化 owner。

## Acceptance criteria

- NAV-01：筛选菜单只列有可见会话的稳定 Bot，重名可辨认；历史 Bot 可查，完整名册不受影响。
- NAV-02：按当前范围投影首次加载、后台更新与失败；完成不持续转圈；失败可重试且原会话可读。
- PROJECT-01：项目以当前工作、会话、资料与成果为主，成员/配置次级；真实页面与打开路径验证。
- GROUP-01：真实群成员、明确单一收件 Bot 与原会话权限；不把原型/IM 权限设置当作协作群组。
- HANDOFF-01：一次真实提出→负责→交接→成果→检查→用户确认；保持现有内部检查机制，不恢复主干已删除的聊天人工评审控件。
- DELIVERY-01：每批相称回归/实际页面验证、精确 SHA、原 owner 统一 CI/main/正式发行/真实路径复验；不把局部交付标成目标完成。

## Completed

- 核对原进展与最新 main bfbc92f3800a3ee4da5785b0f25fc61e2b7a32c2，保留近期会话菜单及聊天清理成果。
- 独立分支和 worktree 的 observe/start/task-init 通过。
- NAV-02 已定位：被动工作区请求只结清 workspaceSessionStates；导航无条件 OR 全局 isSessionsLoading 初值，导致无活动全量读取仍持续显示。

## Verification

5 文件 165 项相关回归通过；新增身份碰撞案例后导航 DOM 19 项通过。类型、lint、测试分类及真实组件 WebKit 通过；详见 dev-docs/bot-navigation-next-20261107/acceptance.md。共享 CI/main/新包和原生验收未完成。

## Blockers and unknowns

桌面/macOS-arm64/updater/shared CI/main/安装与回滚唯一负责人保持 01a12bc2-907a-7702-b6dd-788225c5dfe4。2026-11-07 当前 owner 正处理 543.3 公证；本批只能进入下一未冻结批，不触发第二 CI 或正式构建。旧 11 月 3 日进展版本不代表当前安装。真实群组/交接需继续核对当前源码，未承诺已存在。

## Next step

NAV-01/NAV-02 已实现并通过本地/实际组件验收，提交精确源交原 owner 下一批；并继续 PROJECT-01、GROUP-01、HANDOFF-01，整体目标保持 active。
