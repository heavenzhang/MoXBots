<!-- git-project-sync-task:source-digest=8ddde7af9e1de72e017ef1107b03c714d30453f7a6557b722ffb3558a2c012ac -->
<!-- git-project-sync-task:version=2 -->
<!-- git-project-sync-task:id=7c436dfa-3288-45f3-b5f6-05f7be340abc -->
<!-- git-project-sync-task:branch=codex/bot-group-delivery-20261107 -->
<!-- git-project-sync-task:base=a650939d2c38b8dc04750e282b159ddaac8ea346 -->
<!-- git-project-sync-task:status=in-progress -->
<!-- git-project-sync-task:scaffold=false -->

# Task: GROUP-01 G03 trusted independent Bot delivery and receipts

## Objective

继续完整R3目标，当前接通原Inbox独立Bot实际收发与可信群请求/回报关联；原群界面与项目保留，不将阶段协议检查视为群功能完成。

## Acceptance criteria

- 群发送由原Tab精确原生签名动作发起，原root task ledger先保留请求和目标；重复请求不二次启动，未知不重放。
- 沿原Rust FreshStart/目标Session出生与目标Bot配置；保存固定项目和有限群可见上下文，不读取私聊。
- 原Inbox回报精确匹配原请求/目标/回合；接纳、消费、终态分开，群回报不静默唤醒另一个Bot。
- 关键真实Store/原生协议/单元验证与UI接线、真实模型、main及制品安装分别验收。

## Completed

start/task-init基于远端main a650939d2通过。新隔离分支合并G01/G02 producer7d67045b和已发布工作分支项目交接producer1471ec01f，保留最新恢复代码。共享计划冲突按两侧条目合并；未改其他工作树。另一线程未提交collaboration-entry有不同冻结成员方案，已告知原owner协调，保持原样。

原ledger唯一发送、native计划目标出生约束、目标原prepared admission复核、群可见上下文和原Inbox精确回报已实现并隔离验证。停用Bot漏洞已修复；保留未知、不重复投递、快终态不被ACK覆盖、旧Inbox路径不变。G03-C/D和G04及最终交付仍未完成。

## Verification

61 unit +24 integration、实际Rust模块11项/跨语言签名、类型/lint/分类/依赖与本地server bundle通过；详见dev-docs/bot-group-delivery-20261107/acceptance.md。完整Tauri/真实模型/UI/安装未验收。

## Blockers and unknowns

完整群UI发送入口、任务交接与真实模型/原生验收仍待完成；不用临时native子角色冒充独立Bot。成员可变配置与另一未提交入口不得形成双写权威。

## Deployment request

Required: desktop/macOS-arm64/updater/sharedCI/main。唯一owner01a12bc2-907a-7702-b6dd-788225c5dfe4。开发提交推送精确源和验证，原owner统一CI/集成/版本/正式包/安装/下载。保留冻结543.4，无其他端变更。本批为后续功能批源码审阅/集成请求，不要求插入当前稳定性修复包；Chat入口与完整原生/真实路径前不得宣称群功能可发布。

## Next step

接原Chat/Composer的群消息及结果投影，补原目标只读查证与完整Tauri/真实两Bot闭环；随后原task交接与最终main/统一发行。总体goal仍active。
