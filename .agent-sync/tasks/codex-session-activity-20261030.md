<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/session-activity-20261030 -->
<!-- git-project-sync-task:base=d18137e87155994c4ade3d1889d04830821a8eda -->
<!-- git-project-sync-task:status=in-progress -->
# MB-SESSION-ACTIVITY-20261030

## Objective

主轮结束但子 Agent 仍执行时，会话保持进行中，并显示主 Agent 等待后台任务。复用 exact Runtime/Query 的非 ambient 活跃快照；不根据历史卡片猜测执行，不改变 Stop、重试、任务授权或自动接续。

## Completed

- [x] 核对实际仓库、远端主干、干净工作区、截图及原会话只读证据。
- [x] 从最新 origin/main d18137e 建立隔离 worktree。
- [x] 修复运行时快照、SSE 和会话 UI 活动汇总。
- [x] 回归主轮结束/后台运行/后台结束、重连、旧会话和 ambient 边界。
- [x] 类型、定向 lint、真实组件 UI 检查。
- [x] 提交并推送产品提交 cbee2eed9fcc25fb78b24de256ca523bc7f16af9，核对远端并登记原 owner 下一批次；最终记录 HEAD 见外部回执。
- [ ] 原 owner 协调 shared CI/main、签名制品、安装及真实路径验收。

## Acceptance criteria

1. 原会话主轮 idle/complete 与后台活跃可同时存在；会话侧栏/标题指示保持进行中。
2. 主聊天显示等待后台任务，全部结束后撤下等待状态；不能把后台活跃标成新主轮。
3. Runtime 整表快照为活跃权威；ambient、旧 Query、旧会话、历史运行卡片不产生假活跃。
4. 重连恢复后台活动，无历史通知重复、业务重放、发新消息或改变执行授权。

## Verification

278 项隔离集成、231 项 DOM、TypeScript、定向 lint、测试池分类和 MoXBots 前端构建通过。内置浏览器实际生产组件在1280×720及390px深色容器的等待/核验/完成切换通过；证据 `dev-docs/session-activity-20261030/acceptance.md`。UI owner 为当前 /root；小范围状态修复，单智能体自验，非独立审阅。只使用合成数据、隔离环境；原业务会话不写入。

## Deployment

desktop/macOS-arm64/updater 与 combined CI/main 唯一负责人沿用 01a12bc2-907a-7702-b6dd-788225c5dfe4。开发分支不创建触发共享 CI 的 PR、不分配版本、不构建正式包、不安装或重启日常客户端。由原 owner 接收精确 SHA 和 release-queue 后统一集成发布。

## Blockers and unknowns

源码、模拟验证、真实 UI、CI/main、制品及原生验收分别记录。当前没有通过本次代码完成任何发布；自动接续是否成功是独立问题，不以进行中图标宣称修复。

## Next step

本地 release-queue 已登记，owner 尚未确认接收。由原 desktop/combined CI/main owner 审阅精确远端分支、选下一未冻结批次，组织主干/CI/制品/安装/真实路径验收；本任务不越权触发。
