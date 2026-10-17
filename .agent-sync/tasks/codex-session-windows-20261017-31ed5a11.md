<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/session-windows-20261017 -->
<!-- git-project-sync-task:base=428ffd94ce2e5eedfb150c28dccecf201c6b2edc -->
<!-- git-project-sync-task:status=in-progress -->

# Task: codex/session-windows-20261017

## Objective

MOXBOTS-SESSION-WINDOWS-001：侧栏切换会话，顶部只显示当前页面；沿原 Chat owner 保留文件、终端和浏览器。现有 12 页缓存按打开顺序回收，不删除历史、不丢草稿、不停止后台执行。

## Acceptance criteria

- [x] 单页标题替代全局 TabBar，侧栏/通知/快捷键仍可定位会话。
- [x] 稳态最多缓存12页，FIFO回收经既有关闭 lifecycle，保存失败/输入草稿/启动中/录音受保护。
- [x] 回收异步等待期间最多一个额外准入槽；无法安全回收时保留数据并明确提示，不无限增长。
- [x] 156项定向回归、类型、全量lint、build:web与实际浏览器三尺寸/独立代码及截图审阅通过。
- [ ] CI、合入 main、推送及远端包含性验证。
- [ ] 原生包发布/真实安装验收交既定唯一发布owner，保持未验证状态。

## Completed

- [x] 核实仓库/主干/分支/干净工作树；独立worktree基于428ffd94。
- [x] 读取原Tab/Chat/Sidecar authority与发布职责；未修改日常App。
- [x] UI独立验收由window_ui_review负责，主Agent实现/集成。

## Verification

- project-sync observe/start/task-init 通过。
- 定向14文件156项通过；详见`dev-docs/session-windows/acceptance.md`。
- TypeScript、全量lint、MoXBots build:web通过；独立审阅发现1处关闭竞态，修复和复核通过。
- 全量unit 585文件6129项通过/5跳过；全量DOM首轮其余299文件通过，旧TabBar harness迁移后App导航82项全部通过。原CI的JS失败已保留日志，必须在新头重跑通过。
- 源码CI/main以本分支PR及远端main包含性为准；本记录整体仍in-progress，因为统一原生发行未完成。

## Blockers and unknowns

- 唯一桌面发布会话仍为01a12bc2-907a-7702-b6dd-788225c5dfe4；本任务不并发签名、换包、退出或重启日常App。
- 只使用本地合成状态，无模型费用、业务写入或用户Chrome。

## Next step

- 验证本分支PR已被远端main包含后，唯一发布owner将其排入下一未冻结候选，按acceptance.md完成真实原生路径；不得重跑已冻结0.5.9发布。
