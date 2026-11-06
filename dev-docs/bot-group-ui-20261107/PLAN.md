# GROUP-01 · G02 群组界面与原观察者接线

完整目标仍为 R3 Bot / 项目 / 对话导航、真实独立 Bot 群组、任务交接回报及主干和安装验收。本阶段建立可接入原 Chat 的实际组件，不将组件通过当作群组功能完成。

依赖：G01 producer `86d89e693f19f93dfe96a5cb747c8530519f0cd0`（产品源 `1444db90d`），主干基线 `4ceeb2d21acc164487ef199b4a5788d7d27c65f1`。本分支 `codex/bot-group-ui-20261107` 包含该依赖，不修改冻结 producer 工作树。当前 main 未包含本批。

| ID | 状态 | 完成标准、依赖与下一步 |
| --- | --- | --- |
| G02-A 成员编辑 | 源码与本地验证完成 | 2–8 个已有 Bot、稳定 ID、同名/不可用区分、保留根 Bot；原主题与头像；冲突保留草稿后明确采用最新版本 |
| G02-B 原观察者接线 | 源码与本地验证完成 | 原 task snapshot/SSE 读群；原 Tab 签名 POST 配置；Session/runtime/epoch 精确归属；无第二轮询 |
| G02-C 异常恢复 | 源码与本地验证完成 | 不明保存结果先读回执；仅显式重试同一请求；后续重试拒绝不抹掉首次未知；断线保留草稿 |
| G02-D 接收者 | 组件与本地验证完成 | 显式单一 Bot + groupId + revision，成员/群变化后重新选择，不广播、不改投 |
| G02-E Chat 实际入口 | 依赖 G03，未完成 | 在原 Chat 头部/会话菜单/Composer 接入 SessionBotGroupEditor 和接收者；新群沿原 Session birth。发送闭环前不放出入口 |
| G03 独立 Bot 收发 | 待实施 | 原 Inbox / SessionEngine / prepared birth，配置权限和冻结项目绑定；请求预先记账，ACK/消费/终态分开，unknown 不重放 |
| G04–G06 交接和真实闭环 | 待实施 | 原 task/attempt 关联、精确回报、恢复、真实 A→B→成果→原负责人检查 |
| G07 审阅/主干/统一包 | 待原 owner | 集成依赖与本批，原 CI/版本/正式制品/安全安装/下载通道及真实路径验收 |

唯一 desktop/macOS-arm64/updater/sharedCI/main owner：`01a12bc2-907a-7702-b6dd-788225c5dfe4`。开发会话只提交推送和精确交接；不修改版本、触发共享 CI 或正式构建，不替换当前修复包。无移动端/云服务/网站变更。

下一步：沿既有 Inbox start/send 与 native Session birth 补可信群请求/目标/回报关联；真实发送消费成立后挂载以上组件和原 Composer 路径。旧 group-phase1 脏树保留，临时 native 子角色不能冒充稳定 Bot。不恢复已删除的聊天人工验收/重试/返工控件。
