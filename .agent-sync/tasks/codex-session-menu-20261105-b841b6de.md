<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/session-menu-20261109 -->
<!-- git-project-sync-task:base=39b3447659dd92e71f9bb86bf12f2326bb3e5fcd -->
<!-- git-project-sync-task:status=in-progress -->

# Task: MB-SESSION-MENU-20261109 恢复新版会话菜单并上线

## Objective

恢复新版会话列表原右键菜单并合入main、由既有桌面owner上线。范围仅菜单入口/接线/嵌套关闭与合成验证；无服务、账号、数据迁移。

## Acceptance criteria

- [x] 右键、⋯、ContextMenu/Shift+F10调出原完整菜单；原mutation及删除保护保持。
- [x] 定向DOM、类型/lint、renderer编译通过。
- [ ] 远端main包含本任务。
- [ ] 正式客户端上线，真实原生菜单与持久化复验。

## Completed

- 新入口复用SessionContextMenu；新增菜单状态与卸载清理，修正侧栏Escape嵌套层关闭顺序。
- 合成UI fixture与13项新DOM行为回归。详见dev-docs/session-menu-20261109/acceptance.md。

## Verification

- Node24：109 DOM tests、tsc、定向ESLint、classification、协议/依赖补丁校验、Vite renderer build、diff check通过。
- Root自审及独立源码复核通过；焦点P2已关闭。真实渲染未通过。

## Blockers and unknowns

- IAB与获用户授权的Chrome均被Work设置禁用；需在原生候选补实屏与持久化验收。
- desktop/sharedCI/main/版本/正式构建/上线唯一owner为01a12bc2-907a-7702-b6dd-788225c5dfe4；已接入下一未冻结批，开发不触发共享CI。
- 源码提交、主干、正式制品、上线各阶段分别记录；尚未完成发布。

## Next step

把精确HEAD与验收记录交既有owner统一审查/CI/main/正式发布；Root持续核对远端与原生证据。
