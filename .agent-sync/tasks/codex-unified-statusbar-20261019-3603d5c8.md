<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/unified-statusbar-20261019 -->
<!-- git-project-sync-task:base=18e13ce8dbad20e61af3f84173ad87d84bf090a6 -->
<!-- git-project-sync-task:status=in-progress -->


# Task: MOXBOT-STATUSBAR-20261019: unified composer execution status

## Objective

合并待办、子 Agent、目标执行为默认收起的一条状态栏；共用详情区，暂停/继续外置，其他目标动作进菜单。沿用原投影和执行控制，不变更运行/持久化 owner。

## Acceptance criteria

- [x] 三类摘要同一行，默认收起，详情互斥；无数据不显示。
- [x] 暂停/继续始终可达，取消/编辑保留原回调。
- [x] 本轮/历史、后台日志、终态摘要、Escape/输入法、320px/桌面、浅深主题通过。
- [x] 定向测试、类型/lint、构建、独立界面审阅通过。
- [ ] CI/main/远端包含；唯一发布 owner 后续正式包与原生路径另验。

## Completed

- 已核实 origin/main 18e13ce8d，隔离工作树从该点创建，原工作树无改动。

## Verification

5文件59项DOM、实际组件11组浏览器、类型、变更lint、依赖边界、Web构建、测试分层、agent文档与独立界面审阅通过。详情和边界 dev-docs/unified-statusbar/acceptance.md。

## Blockers and unknowns

正式桌面发布由 01a12bc2-907a-7702-b6dd-788225c5dfe4 独占；不替换/重启日常客户端。源码与合成 UI 不能代替原生验收。

## Next step

本地验收已通过，提交并推送后进行精确head CI与正常main集成；下一未冻结桌面发行按唯一publisher门禁完成原生验收。

## Execution

主 Agent 实现/集成，独立 UI reviewer 已完成只读审阅；选择依据：输入区耦合改动串行，审阅可独立。未切换主模型；实际用量未知。不调用外部原因：本次原生工具足以完成。

## Deployment request

需要下一未冻结桌面版本；无迁移/配置变更，回滚原发行包；请求记录随代码提交，未向发布聊天发送消息。
