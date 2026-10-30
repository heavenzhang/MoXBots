<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/sidebar-grip-20261031 -->
<!-- git-project-sync-task:base=d18137e87155994c4ade3d1889d04830821a8eda -->
<!-- git-project-sync-task:status=in-progress -->

# Task: 移除侧边栏拖动提示图标

## Objective

MB-SIDEBAR-GRIP-20261031：移除侧边栏项目、会话与分区的六点拖动提示图标，保留原有拖动、键盘排序、可访问名称和布局。

## Acceptance criteria

- [x] 不再渲染两处 GripIcon。
- [x] 原有拖动监听器、激活节点、键盘入口保留；既有侧边栏回归通过。
- [ ] 统一 owner 合入远端 main、协调 CI 与下一未冻结桌面发布。
- [ ] 安装版真实侧边栏视觉、鼠标拖动及键盘排序复验。

## Completed

仅修改 SidebarOrganizationControls.tsx，删除 GripIcon 导入和两处图形；不修改持久化、排序逻辑或版本号。

## Verification

- vitest run --project dom src/renderer/components/global-sidebar/GlobalSidebar.test.tsx：83/83 PASS，包含键盘启动拖动覆盖层回归。
- eslint src/renderer/components/global-sidebar/SidebarOrganizationControls.tsx --max-warnings=0：PASS。
- git diff --check：PASS。
- 本次为低影响图标删除，复用既有测试；未新增镜像实现测试。未执行原生页面/生产验收。

## Blockers and unknowns

desktop builtin client 的唯一共享 CI/main/发布 owner 沿用 01a12bc2-907a-7702-b6dd-788225c5dfe4。PR 创建及 main push 会触发共享 CI，因此本开发会话只推送 codex 工作分支，由该 owner 集成。当前未分配版本/制品/发布批次，不宣称安装版已经更新。

## Next step

统一 owner 取本分支精确 SHA，复核最新 main 后合入、运行 CI、安排下一未冻结批，验收真实侧边栏图标消失及拖动排序。没有发送跨会话消息；本记录为持久交接入口。
