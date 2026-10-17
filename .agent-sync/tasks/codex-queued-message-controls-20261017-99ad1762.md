<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/queued-message-controls-20261017 -->
<!-- git-project-sync-task:base=3e7fec6444a22e3a6eced3337d31c76ebb099339 -->
<!-- git-project-sync-task:status=in-progress -->


# Task: MOXBOTS-QUEUE-UI-001 排队卡片编辑、取消与失败反馈

## Objective

MOXBOTS-QUEUE-UI-001：修复排队卡片点击无反馈及操作含义不清，新增独立编辑入口，改善点击热区与窄窗布局。基线远端 main 3e7fec64。只修改原 Session queue 的展示与错误传递，不绕过 Runtime 取消裁决。

## Acceptance criteria / To Do

- [x] 读取实际日志：2026-10-17 23:14，/compact 撤回到达原 Session，SDK 返回 not-cancelled / HTTP409；原UI吞掉异常。
- [x] 实现独立编辑/取消、32px点击区、明确提交/处理中/错误反馈。
- [x] 编辑保护现有草稿，异步期间新输入合并保留；附件与Agent上下文沿原路径恢复。
- [x] 定向DOM/路由回归125项、完整TypeScript通过；限定eslint修正test effect后通过。
- [x] 实际IAB交互/视觉/窄栏验收；证据见acceptance.md和evidence/。
- [x] MoXBots web/server构建及主Agent最终审查。
- [ ] PR远端CI。
- [ ] 提交、合入并核验远端main。
- [ ] 统一负责人下一未冻结版本发布及正式客户端真实路径验收。

## Completed

独立编辑/取消、Runtime拒绝错误传递、操作防重和32px热区已实现。生产组件IAB实测、125项定向/完整类型/限定lint/web与server构建通过。先同步main b5781988官网改动；原候选9b96cb66六CI全通过。再次同步main fa63b5d4的会话导航/回收，代码自动合并，计划末尾仅追加章节冲突且双方保留；新候选回归/CI另验。

## Verification

详见 `dev-docs/queued-message-controls/acceptance.md`；使用生产QueuedMessagesPanel和隔离合成fixture，未操作日常App，不启动真实Provider。

## Deployment request

required：由 `.agent-sync/plan.md` 既定桌面发布owner 01a12bc2-907a-7702-b6dd-788225c5dfe4 纳入下一未冻结候选；不回写已发布0.5.9，不并发换包/重启/操作服务器。本聊天没有向其他聊天发送消息。原生验收须受控真实队列：取消只移除目标；编辑撤回成功才恢复草稿；409保留消息并解释，不停止执行中的其他任务。

## Blockers and unknowns

源码/main、隔离组件验证、签名发行、安装客户端及真实SDK分别追踪。SDK已接收项本来不可保证撤回；本修复不虚报取消。当前主Agent独立实施和验收，零子Agent；此小范围采用主Agent UI验收，未作独立审阅。无外部模型调用，费用/token未知。

## Next step

PR https://github.com/heavenzhang/MoXBots/pull/108 已创建；等待最新head必需CI并合入main，核验远端包含源码；发布仍在统一owner队列。
