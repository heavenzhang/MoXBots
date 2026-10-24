<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/session-stability-20261024 -->
<!-- git-project-sync-task:base=71871fc57ee2c4f29b63931dc29654520aa3f6aa -->
<!-- git-project-sync-task:status=ready-for-review -->

# Task: MOXBOTS-SESSION-STABILITY-20261024: ordinary session execution stability repair

## Objective

先前整体评估已完成；用户随后明确要求“全面修复以上问题”。本次修复四项确认缺陷：SSE分片活性、执行身份提前切换、独立Task/Goal误拒、host交互工具误拒。沿用原SessionStore CAS、原queue和权限owner，不增加调度器；保留Stop、未知写入防重放和根验收。稳定任务ID不变。

## Acceptance criteria

- [x] 核对最新远端main与独立审查工作树。
- [x] 区分必要保护、确定缺陷、设计取舍和未验证事项。
- [x] 现有关键回归与新增隔离行为探针可复现，无真实模型/业务动作。
- [x] 形成带源码行号、风险排序、最小改进与验证边界的独立报告。
- [x] 审查报告与487项原回归、9项异常刻画留存。
- [x] 四项产品修复已写入隔离工作树，原审查探针转为期望正常行为的回归。
- [x] 补齐排队多输入、取消、Stop、晚到回执、作用域伪造与共享资源保护验收。
- [x] 组合回归、TypeScript与差异审查通过。
- [x] 提交本任务、推送工作分支并交付精确SHA给桌面唯一owner。
- [ ] main合入、共享CI、候选构建、发布及真实用户路径：由原owner统一执行和回传证据。

## Completed

四项源代码修复、17项稳定性验收和25文件673项组合回归完成，代码已推送任务分支并交给既有owner。下面保留修复前评估过程，修复验收见文末Repair acceptance。

基线main 71871fc57ee2c4f29b63931dc29654520aa3f6aa（PR199/0.5.21源）。git observe/start/task-init PASS。先前原实现未改、审查探针明确断言异常行为；修复阶段将其改名为session-stability.integration.test.ts并转为正确行为回归。独立报告及原始日志保存在用户工作区 work/session-stability-20261024/。

## Verification

当前修复验证：673项PASS，TypeScript/ESLint/classification/diff PASS，详见Repair acceptance与dev-docs/session-stability-20261024/acceptance.md。下文487+9为修复前历史记录。

Node v24.20.0。7文件157项基础回归、另13文件330项恢复/编排/Stop/路由回归全部PASS，互不重复，共20文件487项。新增审查探针9项PASS，刻画主干分片流停顿、新输入在promotion前撤权/覆盖、独立Task/Goal被旧execution门禁拦截、host交互误拒。TypeScript --noEmit --incremental false PASS。

同一内存SSE分片对照：主干stalled=true，既有修复分支885b25c33a2c7d3bb730f2c36c96ea6dbae1bcfa为false并返回文本。054e54dc7fe057e047cf30e1425c2cdefea22f49修复不是当前main祖先。均无真实Provider请求、日常App操作或业务写入。

## Blockers and unknowns

本地四项修复与673项组合回归已完成，ready-for-review。真实调度/原生Task/Goal及真实Provider用户路径尚未验收。桌面/shared CI/main/版本/发布仍归既有唯一owner 01a12bc2-907a-7702-b6dd-788225c5dfe4；本线程不替代该单元发布。开发范围无待解决代码阻断。

## Next step

代码已提交推送并向owner交付精确SHA及dev-docs/session-stability-20261024/acceptance.md，补正任务记录后核实handoff gate。owner同步main，组合并发PR200，统一审查/CI/主干集成/候选版本/发布并回传真实路径证据。未获单元移交，不自行接管共享CI、构建或日常App。

## Repair execution log

- Root负责session-execution、session-task-dispatch、selector的原队列接纳组合与host工具门禁、agent-session原生owner参数传递及测试；一个内置worker /root/sse_stability（gpt-6-luna/medium）独立负责两个SSE包装器与专项测试，49项通过后由root组合审阅。无外部模型调用，费用/用量未知，不推算节省比例。
- 分类准备仅登记独立pending capability，保留原root/子执行权限；pending真人输入阻止旧自动continuation抢先运行。classified scoped输入统一沿原turn-boundary接纳，以避免实时送达尚未消费时更换权限；显式Stop继续原入口同步撤权，强制发送仍沿原队列实现。
- 每条输入capability分别保留，后输入不会覆盖前输入；在原beforeDispatch持久化账本，final validateAtCommit绑定原接纳记录。预算从promotion开始，未接纳输入取消/拒绝/准备失败不pause旧执行。
- 独立Task/Goal必须带原native TurnIdentity及当前Query authority；不接受模型输入/source/任意queue作为独立owner证明，托管子执行绑定与共享资源锁继续保留。
- 不改首次意图utility/provider配置顺序。原owner当前真实客户端首发意图识别阻断属于其并发修复范围；本次不能以模拟通过替代该真实验收。

## Repair acceptance

正确行为回归17项，在原71871fc干净源码快照上15失败/2通过，在修复树17通过；25文件673项组合回归PASS。最终TypeScript无emit/无incremental、变更文件ESLint max-warnings=0、测试分类与diff检查PASS。独立复审提出未知child没有launch仍可继承owner的边界风险，已加入原native launch证明条件，补充正反例后复核无新确定缺陷。精确行为、真实验收范围与发布交接见dev-docs/session-stability-20261024/acceptance.md；原始日志和命令见工作区work/session-stability-20261024/repair-*。

并发PR200修复first-input默认auto mode，与本次源文件不重叠；不得把旧候选包视为已含本任务。唯一发布owner核对两者并集并重新固定候选SHA，本任务不改版本号、不自行跑共享CI。当前版本元数据0.5.21，仅说明源码基线。
