<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/error-continue-20261028 -->
<!-- git-project-sync-task:base=caab6ab648b434bee17930f90c4df4de87564bba -->
<!-- git-project-sync-task:status=ready-for-review -->

# Task: MB-ERROR-CONTINUE-20261028

## Objective

用户确认按“未接收重发、已有执行进度继续、结果不明先核查”修改错误恢复。沿既有 SessionContinuation / SessionEngine 准入和 Runtime resume，保留产品/native 历史、工具结果、文件及任务清单。不重放业务，不改恢复 ledger、Stop、权限、任务预算或 Runtime identity。

## Acceptance criteria

- [x] 明确未接收的本地失败保留正文/附件并允许重发。
- [x] 已接收的失败轮次显示继续执行，发送带精确原 turn 的续接指令；不重发原文、不回退历史。
- [x] 结果不明仅核查；忙碌、队列、审批、新轮次/会话、成功终态和 native boundary 拒绝继续。
- [x] 定向单元、DOM、真实本地磁盘/SDK协议集成、类型/lint与实际浏览器交互验证。
- [ ] 向原 desktop/combined CI/main 负责人交精确远端 SHA，分别跟踪主干、CI、新制品和真实路径。

## Completed

- 从当前远端 main caab6ab648b434bee17930f90c4df4de87564bba 建立隔离分支，start/task-init 通过。原 composer 等工作树保持原状。实现已完成且本地验收通过，待下述原owner统一main/CI/发布。

## Verification

- 49项单元/组件、131项TabProvider DOM、27项磁盘和185项builtin SDK合成协议集成共392项PASS；tsc/lint/分类PASS，depcruise 0 error/18原有warning。Chromium/WebKit×1280/390四组合各13检查PASS，主Agent查看截图。证据见 dev-docs/error-continue-20261028/acceptance.md 和 evidence/。独立只读reviewer未发现阻断，不冒充真实Provider或原生验收。
- UI owner 为本主 Agent；沿现有错误横幅样式，覆盖未接收、部分执行、传输不明、忙碌/过期与继续失败，桌面1280及窄390宽。定向交互和视觉分开记录。

## Blockers and unknowns

- desktop/macOS-arm64/updater 与 combined CI/main 唯一负责人仍为 01a12bc2-907a-7702-b6dd-788225c5dfe4；本会话负责开发和本地验收，不触发共享 CI、正式构建或日常客户端替换。遵循用户现行向对应负责人提交 CI/发布请求的授权。
- 无 cloud/Host/mobile 部署、接口切换、数据迁移或正式版本分配。外部/DSH Runtime 既有精确安全继续能力不足时保留核查/手动继续，不退化为原文重放。
- 不调用外部原因：采用单 Agent 原生执行，修改链路紧密耦合，无外部模型调用；模型/费用用量未测量。

## Next step

- 完成commit/push与远端handoff核验后，向唯一负责人交精确SHA；由其选择下一未冻结批次进行main/共享CI/正式构建及真实路径验收。
