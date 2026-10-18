<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/sidebar-order-20261019 -->
<!-- git-project-sync-task:base=2e1c522737b30ca985c3df8d9110e2eec97e1682 -->
<!-- git-project-sync-task:status=in-progress -->

# Task: Persist fixed sidebar project order

## Objective

SIDEBAR-ORDER-20261019：固定左侧项目顺序，点击任务、活动时间更新和重新加载不改变已有位置。保留手动排序与置顶；新项目追加末尾。用户已确认权威仓库 https://github.com/heavenzhang/MoXBots.git 。

## Acceptance criteria

- [x] 确认源码、分支、远端、干净工作区和当前 main。
- [x] 新增 DOM 回归在修复前实际失败（更新 Beta 活动时间后变为 b,a）。
- [x] 实现本机持久项目顺序及旧偏好兼容。
- [ ] 定向测试、TypeScript、ESLint、实际浏览器交互通过。
- [ ] CI、合入 main、核实远端包含修复。
- [ ] 原生版本发行及真实客户端验收另行追踪；本聊天不并发覆盖既定发布工作。

## Completed

GlobalSidebar 单独使用固定 fallback 顺序，不改变 Launcher 最近使用排序或 touchProject 的元数据职责。排序快照存于已有 localStorage 偏好，保留置顶和组织拖拽优先级；项目加载失败时不清空快照。

## Verification

修复前 DOM 回归失败已复现。102项定向测试、ESLint及1440/900px四组浏览器通过，tsc运行中；本地证据 /Users/zhangshaohua/Documents/WPS Cloud/【项目】目录/MoxBot/output/sidebar-order-20261019/ 。

## Blockers and unknowns

原生发行受既定唯一桌面发布owner协调约束，当前不操作日常客户端。模拟存储/浏览器不能代替原生持久化验收。

## Next step

检查定向测试及浏览器结果，完成验收记录后提交、CI和主干交付。当前 Agent 单人实现及UI验收，零worker；选择依据：局部耦合修复，拆分会增加重复上下文；无模型升级，不调用外部模型是因为确定性本机验证足够。模型计费用量未知。
