<!-- git-project-sync-task:source-digest=a6a825d495882a282b3ac9dc00ee47f3e9e978ffb16063f0f5b57f97db1e3645 -->
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
- [x] Codex V2 轮次有明确终态和最终答复时，进度说明与安全完成的步骤默认收进一个入口；成果与待处理事项直接可见。
- [x] 定向 DOM 回归及内置浏览器合成组件验证。
- [ ] 桌面负责人完成共享 CI 与远端 main 集成。
- [ ] 统一发布批次分配版本，核验安装与真实会话路径。

## Completed

桌面 renderer 布局、操作菜单、执行历史及恢复提示实现。原有主题系统、运行权限和执行账本沿用。当前主干侧栏已采用紧凑单行列表，沿用已有实现。

Codex 原生文字阶段沿 UnifiedEvent 和 Product Transcript 保存到已有内容块。带原生结束锚点、成功状态及最终答复的桌面 V2 展示段使用整轮过程入口。搜索时临时展开，旧记录、无阶段运行时及用户插话形成的早期独立展示段按原方式显示。

## Verification

- Source digest: `a6a825d495882a282b3ac9dc00ee47f3e9e978ffb16063f0f5b57f97db1e3645`; 203 项定向单元和 DOM 测试、1 项 Codex 模拟集成通过；最终折叠回归 33 项通过；typecheck、定向 ESLint、diff 检查通过；内置浏览器 420 px 合成会话核查通过。

- Source digest: `d9ae8e73ed12753292e637683db1500c9a03c3fb356e3770b04e1837b13830e7`; 12 DOM 文件 103 项通过；完整 typecheck、定向 ESLint、git diff --check 通过；内置浏览器合成组件核查通过。

- 12 个 DOM 测试文件，103 项通过，覆盖完成步骤折叠、失败可见、回复操作、状态栏及恢复详情。
- Codex 内置浏览器使用真实组件和合成数据验证 420 px 容器的正文与输入边缘对齐、展开历史执行，以及恢复详情打开。
- 后续补充：203 项定向 DOM/单元测试、Codex 模拟会话集成、内置浏览器 420 px 合成会话检查。打开入口能恢复交错的过程顺序，结果、文件和未知项在关闭时依然可见。
- 真实桌面客户端安装、实际账号长会话、面板偏好跨重启和生产验收待发布负责人组织。

## Blockers and unknowns

真实会话和安装验收依赖后续桌面候选。main、CI、正式版本及制品尚待统一批次。

## Deployment request

- Required: desktop builtin client，macOS 桌面客户端发行。含随桌面发行的 Node Sidecar 和 renderer。内容块新增兼容可选字段，无独立服务部署或历史迁移。
- Owner: 01a12bc2-907a-7702-b6dd-788225c5dfe4，沿用共享计划。
- Status: 通过此任务分支及记录提交下一个未冻结批次的候选请求。由负责人决定集成时机、版本、构建、回滚及验收。
- Rollback: 以负责人记录的上一已验证桌面制品为准。UI 面板偏好存储独立于会话数据。

## Next step

核对远端任务 SHA，在下一未冻结桌面批次选入并协调 CI 和 main。用原生长会话确认宽窄窗、面板开合、滚动锚点、待确认项及菜单键盘操作。
