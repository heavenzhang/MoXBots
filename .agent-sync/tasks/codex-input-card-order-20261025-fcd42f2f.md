<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/input-card-order-20261025 -->
<!-- git-project-sync-task:base=848e333455c7045534bf51a951a19b6945c6aa1a -->
<!-- git-project-sync-task:status=ready-for-review -->

# Task: Keep human input before execution cards and separate runtime context

## Objective

MOXBOTS-INPUT-CARD-ORDER-20261025。真人原话先独立持久化和推送，随后创建/接续任务卡片；执行上下文单独传给模型，不追加到用户正文。自动续跑采用隐藏系统事件，不伪造真人发言。用户现场确认目的地 `https://github.com/heavenzhang/MoXBots.git`。

## Acceptance criteria

- [x] `继续执行` 的消息正文和复制内容保持原文，执行提醒进入独立 SDK 文本块。
- [x] 直接和排队晋级路径均先推送/保存原文，再进入创建卡片的 guard。
- [x] 拒绝/Stop 不产生 SDK 执行，已受理的真实原话可保留；Goal/基础设施隐形门禁维持。
- [x] 自动续跑/返工只保留一条真实人类输入，上下文不显示为真人发言。
- [x] 本地单元、集成、DOM、原生 SDK 合成供应商验证及类型/lint。
- [ ] 原 owner 统一 exact-head CI、main 集成及远端主干核实。
- [ ] 原 owner 下一未冻结桌面候选、安装及真实路径验收。

## Completed

- facade 删除向原话追加 reminder 的逻辑，adapter/队列只向模型传递 `runtimeReminder`。
- 原生 user surface 支持可信真人先落地；排队晋级复用原 surface，不新建消息/持久化 owner。
- 自动续跑改为标准 leading `SESSION_EXECUTION` envelope，无可见尾文。
- 新增消息内容、复制、广播顺序、队列/拒绝/Stop、隐藏自动上下文回归，并扩展原生 loopback verifier。
- 规范与验收：`specs/tech_docs/intent_execution.md`、`dev-docs/input-card-order-20261025/acceptance.md`。

## Verification

- `observe` / `start` / `task-init` PASS，base 为上述 metadata 的完整 main SHA，remote 和 push URL 一致。
- 预览与本分支全部修改源码逐文件摘要一致；验证从相同 base/源码移入，不以重新执行相同测试制造额外证据。
- Node24 focused185、builtin170、顺序/Stop定向5、DOM9全部 PASS；全量 TypeScript 与修改文件 ESLint PASS。
- 原生 SDK + 本机合成供应商普通2轮、返工3轮均 completed，1次真人输入，用户事件先于卡片，持久正文不变；收据在验收目录 `evidence/`。
- 完整本地日志：交付工作区 `work/MOXBOTS-INPUT-CARD-ORDER-20261025/`。这些验证不证明真实供应商、已安装 App 或生产业务结果。

## Blockers and unknowns

- 原桌面/macOS/updater/shared-CI/main owner `01a12bc2-907a-7702-b6dd-788225c5dfe4` 保持不变；本开发会话 `01a16ec6-2124-7e61-a9ad-c1d72d6ba9e7` 不触发共享 CI、PR CI、构建、安装或发布。
- 基线包含 PR204 的 continuity/main 成果，未修改版本或冻结制品，无数据迁移、跨单元接口或真实任务重放。
- UI 由主 Agent 自查，未独立审阅；无布局改动，视觉/响应式不适用，真实客户端行为待新制品验收。
- 代码、本地模拟、main、制品、安装和真实用户验收分开追踪。

## Next step

- 原 owner fetch 远端 `codex/input-card-order-20261025`，先读本记录与验收证据，核对接收的精确 SHA。审核后选择下一未冻结批次，处理当前主干并发及共享 `agent-session.ts` 变更，重验受影响路径，统一 PR/CI/main，再按既有维护窗口与回滚纪律分配新制品。不得把已冻结候选改标为包含本修复。
