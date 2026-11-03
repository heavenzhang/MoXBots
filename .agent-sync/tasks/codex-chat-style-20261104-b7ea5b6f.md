<!-- git-project-sync-task:source-digest=d9ae8e73ed12753292e637683db1500c9a03c3fb356e3770b04e1837b13830e7 -->
<!-- git-project-sync-task:version=2 -->
<!-- git-project-sync-task:id=b043869b-e40a-455f-9591-0d2f285fd2db -->
<!-- git-project-sync-task:branch=codex/chat-style-20261104 -->
<!-- git-project-sync-task:base=065f2b6c8fb2aff58e774000909990b531ff8eb8 -->
<!-- git-project-sync-task:status=in-progress -->

# Task: MB-CHAT-STYLE-20261104 桌面会话界面调整

## Objective

让桌面会话以答复和输入为中心，压缩历史过程、重复待确认状态与工作区占位。沿用中性默认主题、Codex 主题及用户已选主题。

## Acceptance criteria

- [x] 标题只突出一次，正文和输入区对齐，次要回复操作移入菜单。
- [x] 安全完成的过程段默认折叠，失败、运行中、未知和子 Agent 入口保留。
- [x] 待确认提示按状态使用单一入口，详情与核查可达，工作区默认收起并记住显式切换。
- [x] 定向 DOM 回归及内置浏览器合成组件验证。
- [ ] 桌面负责人完成共享 CI 与远端 main 集成。
- [ ] 统一发布批次分配版本，核验安装与真实会话路径。

## Completed

桌面 renderer 布局、操作菜单、执行历史及恢复提示实现。原有主题系统、运行权限和执行账本沿用。当前主干侧栏已采用紧凑单行列表，沿用已有实现。

## Verification

- Source digest: `d9ae8e73ed12753292e637683db1500c9a03c3fb356e3770b04e1837b13830e7`; 12 DOM 文件 103 项通过；完整 typecheck、定向 ESLint、git diff --check 通过；内置浏览器合成组件核查通过。

- 12 个 DOM 测试文件，103 项通过，覆盖完成步骤折叠、失败可见、回复操作、状态栏及恢复详情。
- Codex 内置浏览器使用真实组件和合成数据验证 420 px 容器的正文与输入边缘对齐、展开历史执行，以及恢复详情打开。
- 真实桌面客户端安装、实际账号长会话、面板偏好跨重启和生产验收待发布负责人组织。

## Blockers and unknowns

真实会话和安装验收依赖后续桌面候选。main、CI、正式版本及制品尚待统一批次。

## Deployment request

- Required: desktop builtin client，macOS 桌面客户端发行。无服务端、移动端或协议改动。
- Owner: 01a12bc2-907a-7702-b6dd-788225c5dfe4，沿用共享计划。
- Status: 通过此任务分支及记录提交下一个未冻结批次的候选请求。由负责人决定集成时机、版本、构建、回滚及验收。
- Rollback: 以负责人记录的上一已验证桌面制品为准。UI 面板偏好存储独立于会话数据。

## Next step

核对远端任务 SHA，在下一未冻结桌面批次选入并协调 CI 和 main。用原生长会话确认宽窄窗、面板开合、滚动锚点、待确认项及菜单键盘操作。
