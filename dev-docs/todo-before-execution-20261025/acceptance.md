# MB-TODO-BEFORE-EXEC-20261025 验收记录

## 范围和结果

多步骤实际执行前在原账本预建 To Do List，执行过程复用精确任务 ID 同步，不为已授权任务增加确认。用户只讨论方案时保留原方案流程。现有 owner、权限、Stop、未知结果不重放、根验收和原 Runtime 能力边界保留。

## 验证矩阵

| 场景 | 层级 / 证据 | 状态 |
| --- | --- | --- |
| 首次实际派发前完整清单已持久、无额外 proposal；重复 guard 幂等 | 真 SessionStore / 原 guard 集成 | PASS |
| 同任务接续保留 task IDs、进度和原预算；新目标隔离、旧 queue 不覆盖 | 集成回归 | PASS |
| 单步分类后可发现原生待办；显式 ensure 细分步骤可追加 | 集成 / 纯投影 | PASS |
| DSH 原生 task ID + subject marker 规范化，Codex原精确marker兼容 | 共用生产归一化 / 投影回归 | PASS |
| 原生 TaskCreate/TaskUpdate → 原ledger →真实Write/Read →根评审/持久终态 | installed SDK + 原facade/queue/CLI/SessionStore，loopback合成上游 | PASS，见 evidence/native-todo-plan.json |
| Claude Code根原生Todo结果经原external owner同步 | fake native runtime事件/真实external owner/磁盘集成 | PASS |
| 无工具消息时清单可见、展开可查看步骤、SSE状态更新、没有确认卡 | 真实ExecutionStatusBar DOM交互 | PASS |
| 类型、ESLint、依赖/测试分类、server bundle | 本地构建/静态检查 | PASS，本地证据见 evidence/validation.json |
| 远端主干和CI | 原统一owner协调 | 待最终记录 |
| 发行制品、安装版本、真实Provider/签名客户端 | 现有发布会话 | 待统一批次，开发验证不替代 |

真实SDK检查通过命令：`node --import tsx scripts/verify-session-execution-loopback.ts --todo-plan`。fixture对模型答复使用私有loopback，真实启动SDK子进程并运行原生工具、文件写读和真实SessionStore。原用户输入一次，跨两个原生queue，原生Write/Read各一次，TaskCreate两次、TaskUpdate四次；原生工具前已有清单，验收后同两项completed。未使用真实供应商/付费接口、账号或日常App。不得将此证据称为生产业务验收。

## 独立审查与修复

内置worker todo_review / gpt-6.1-sol medium仅只读审查。已修复单步空列表吞掉后续native步骤、DSH标记过滤次序和Claude Code工具结果缺少观察者三项问题。最后审查当前diff无新增明确缺陷；主Agent负责实际测试和验收。既有baseline风险不通过本任务扩大修改范围。

## 发布交接

部署单元 desktop builtin client/共享Session进度；combined CI、main集成、正式版本和桌面制品由原唯一会话01a12bc2-907a-7702-b6dd-788225c5dfe4统一协调。本任务不分配正式版本、不触发共享CI、不重启日常App、不修改已冻结候选、云端或Host运行服务。需要验证新普通多步请求在真实模型发起工具前已有清单，原生步骤切换/完成/主Agent验收以及同任务接续和Stop不重置。DSH/Codex/外置CC实际安装端按使用能力验收，列表变化不代表拥有builtin自动续跑。

## 最终本地检查

10个unit/DOM/integration文件428项全部通过，44.76秒；TypeScript、改动文件ESLint、test分类、dependency-cruiser（零error、18项既有orphan warning）、文档链接及server bundle通过。CLI/SDK实际单Agent列表更新及返工通过。新增外置CC用例首轮夹具使用了Codex权限名，已改用原getMaxPermissionForRuntime及既有opus夹具配置，实际external owner回归通过；未通过降低产品权限或mock观察者修复。

额外双worker首轮在原保护门禁BACKGROUND_WORK_ACTIVE下45秒超时。保留原日志hash及未定归因：两个claim和root评审已结清，不等于原生replace-level背景静默。加实际live状态诊断后原断言通过，未修改848e3334基线的对照也通过，均观察真实并发峰值2、不同native执行身份和根Read/Review。未修改background owner或降低原断言；该次时序现象作为发布owner需关注的观察项，不能宣称已找出并修复其根因。见 evidence/parallel-observation.json 和对应原生收据。

最终主Agent审阅修正原生TaskCreate默认activeForm回显内部任务标记，保留稳定ID但展示正常步骤名称。追加50项受影响纯投影/DOM回归、ESLint与真实SDK --todo-plan通过（3340ms）。该修正不改步骤、权限或验收语义。

## 0.5.23 组合审查补充

组合分支把内部清单指令分离为 `runtimeReminder`，但外部 adapter 未继续传递，导致外部原生模型缺少稳定任务 ID 和更新指令。开发分支补齐现有请求/context/原生冷启动、恢复、后续发送和实时 steer；原始 operation.text、用户消息及可见投影保持原文。无新 owner/调度器；DSH 继续校验实际 native inputFingerprint。owner 合并类型时只保留单一可选 runtimeReminder 字段及其原有 surfaceUserBeforeDispatch 字段。

实际 fake runtime/原 external owner 回归 247 项通过（45.60秒），新增 5 项覆盖 Codex CLI、Managed Codex、Claude Code、DSH 的首次/后续输入和实时追加，断言原生收到精确 task ID 且持久用户原文不含内部指令。最终类型检查发现夹具 prewarm 使用不存在的参数，删除该无效参数后新增 5 项复核及 TypeScript、ESLint 均通过；独立只读复审未发现新增明确缺陷。见 evidence/external-private-reminder.json。原 964 文件 / 9922 项 unit+DOM 全量回归属于补丁前已推送源码，不声称在补丁后重跑。
