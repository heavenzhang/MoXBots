<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/intent-execution-v2-20261024 -->
<!-- git-project-sync-task:base=fda7728fa11ee0b1138e9357b2b81e680f408043 -->
<!-- git-project-sync-task:status=in-progress -->


# Task: MOXBOTS-INTENT-EXECUTION-20261024 single Agent closed loop and unified 0.5.21

## Objective

MOXBOTS-INTENT-EXECUTION-20261024。用户授权先完成普通单 Agent 从意图到行动、真实证据验收、返工、有限持续推进，再完善统一模型池与有约束的并行。全部进入 0.5.21 统一批次，不单独发布中间成果。新增截图“多次分析结束，最终尚无可确认结果”是关键回归场景。

## Acceptance criteria

- [x] 从远端 main fda7728fa11ee0b1138e9357b2b81e680f408043 初始化隔离分支，start/task-init gate PASS；移除备用设置的三依赖提交已 cherry-pick，原记录保留。
- [x] 原始 SessionEngine、持久账本、原生 queue/claim/Stop 调用链只读核对；不增加第二 scheduler/数据库。
- [x] 单 Agent 源码和离线集成：可信用户意图准入、可验证产物/验收证据、有限自动续跑和返工；一次请求经失败返工交付，重复终态、停止、新输入和未知写入不重复派发。真实模型/客户端另验。
- [x] 独立源码审阅与隔离真实组件渲染/交互；缺失证据、失败、暂停与完成状态一致。首发 helper 测试不等于完整 Chat 原生验收。
- [x] 模型统一池有限候选链、真实调用健康/origin故障域和父总恢复时间；认证/权限/付费错误不盲切。
- [x] 多 Agent 任务依赖/assignee/attempt/资源准入及共享预算；无独立可并行包则主 Agent 执行。unknown 不被迟到 ACK 解除。
- [x] 61 个文件 1070 项相关回归、类型、lint/dependency/test分类、本地 server bundle 与边界验证；真实供应商另验。
- [x] 原 builtin facade/SDK/hooks/CLI 的普通产物闭环合成供应商 native 验收：首轮只分析后自动新queue实际Write/Read并accept、后台包、受控失败后新queue返工完成、两个独立worker真正并发；均由主 Agent 独立复跑。真实供应商/安装客户端另验。
- [ ] 固定最终 SHA、提交并推送工作分支，交原 owner 统一 CI/主干/0.5.21 构建与发布。
- [ ] 真实账号/运行版本业务路径验收：一次“课程介绍网站”指令产生可打开的真实产物并验证导航；受控失败→返工；Stop和重启未知结果不重放。

## Ownership and dependencies

主 Agent/开发会话：01a169af-d5f7-7203-bf88-ff4c8364e8bf，负责集成/验收/精确源码交接。
桌面、统一 CI/main、正式版本/制品/发布唯一 owner：01a12bc2-907a-7702-b6dd-788225c5dfe4。已消息告知用户指定 0.5.21，尚未交最终候选；请勿据预告触发 CI/安装。
保留 520.1 冻结与用户“稍后维护”选择，不覆盖原制品、重启日常客户端或重放业务任务。Host/mobile如涉及独立运行版本另交对应 owner，不把桌面发布视作所有端已升级。
依赖原 unified-routing b2fadf243b5aa7380e1c88afaa21ac225a3e365d（本分支 cherry-pick：20ac5d1a3 / b09af135c / 381888b48）；旧窄请求作为本完整批次依赖，不单独发布。

## Execution record

- 主 Agent 负责 intent/ledger/queue/receipt 集成；Luna medium worker负责纯策略与离线集成回归、另一个Luna medium负责只读状态UI；Sol high独立审阅原子投递、停止与未知写入。选择依据是隔离文件、独立验收收益以及重复写入风险；无任意外部 provider worker 声称。
- 不调用外部原因：本轮沿用已选择的 ai-yaoren-local 内置实现/审查模式，无额外 AIRouter 调用；不代表 AIRouter 不可用。
- 用量：当前无逐模型准确账单，不计算虚构费用或节省比例。

## Verification / current states

代码：本批已实现。61 文件 1070 项相关 unit/integration/DOM 全部通过，TypeScript PASS，原 runtime-boundary 断言保留；test分类 PASS，dependency-cruiser 零错误/18原有orphan warnings，本地 server bundle PASS。改动文件 ESLint 与文档检查通过，见验收记录。独立 Sol high 最后源码审阅无新增明确 P1/P2；有限审阅不证明任意模型行为。

原 SDK/native child + 私有 loopback 供应商/MCP counter 通过：故障接续 counter=1/P5/B1；Stop counter=1/P2/B0；多候选chain P5/A4/B1、switch2、counter1。普通完整闭环 native 默认/后台包/返工/双独立worker四模式均由主 Agent 独立复跑通过：输入一次，真实写读、CLI评审、不同queue、实际SessionStore completed；双worker峰值在途2，两个原生executionTaskId均verified/completed且claim settled。永久脱敏收据在验收文档 evidence/。UI 真实组件合成状态 1440/768/390 PASS，首发是 helper DOM 组合测试。没有访问日常 App 或重放原 MoX Curriculum 业务。

远端工作分支：核心158ef11adbcdc503b442077af07edd621241da08、预算修复39f79cff9ae7898914b9360e33620878e737d36e已推送；本次提交追加完整native verifier/永久脱敏收据/交接记录。最终工作分支完整 SHA 与remote-handoff结果由开发会话在外部 `work/release-queue/MOXBOTS-INTENT-EXECUTION-20261024.json` 固定，避免在自身提交中循环引用HEAD。远端 main/统一 CI：待原 owner；0.5.21版本/制品/发布/安装：未执行；真实供应商/签名客户端整体/生产用户验收：未完成。证据和真实验收清单：`dev-docs/intent-execution-20261024/acceptance.md`，合同 `specs/tech_docs/intent_execution.md`。上述各状态不可互相替代。

## Completed

源码、离线验证和本地合成供应商 native 验收已完成：核心158ef11ad、预算修复39f79cff9、完整 QA 及八份永久脱敏收据9a0db7088均已提交推送。主 Agent 独立复跑四个产物闭环模式与多候选chain；最终1070项相关回归、类型、lint、文档、分类与本地server bundle通过。工作树清洁，QA loopback服务已停止。此项只说明本阶段开发完成，不代表已合入、已构建或已发布。

## Blockers and unknowns

开发源码没有待解决的已知 P1/P2。共享 CI/main、0.5.21正式版本/制品和实际发布只能由原 owner执行；当前远端 main 已并发前进至185f8fa22eee0e1a6523923bc078185c6536e948，owner应在原流程中同步最新主干、审查并集并固定精确候选。保持现有520.1冻结与“稍后维护”要求，不接管日常App或重放业务。真实供应商是否遵循新交付协议、实际签名客户端的首发/Rust签名准入、安装后真实课程网站用户路径尚未验证，正式制品摘要与CI编号尚未分配。

## Next step

固定并推送本批精确 SHA，原 SDK 普通闭环有缺陷则先修复并重验。交原 owner 统一下一未冻结 0.5.21 候选及 combined CI/main；同一 owner 在有效维护窗口完成新制品、实际“课程网站一次指令交付”、失败返工、Stop/新输入/重启不重放与安装后真实验收。新单元不接管原发布权，不据此覆盖520.1冻结候选。
