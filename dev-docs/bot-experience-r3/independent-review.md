# MB-BOT-R3-DEV-20261101 独立验收记录

2026-11-01；职责：只读边界审查与后续专属开发页验收。当前尚未打开任何浏览器、真实用户会话、日常 App 或生产环境；不实现代码、不运行共享 CI、不分配版本、不发布。

## 状态与下一步

- [x] 阅读仓库 AGENTS.md、ARCHITECTURE.md 核心抽象/owner/Session/导航/任务相关节、specs/design/app_shell.md、session_task_orchestration.md。
- [x] 阅读批准原型 README.md 与 verification.json，仅作为设计与本地模拟证据。
- [x] 只读审查 group-phase1 当前任务、验收记录及精确接口。
- [x] 形成必须真实接线的路径和验收矩阵。
- [ ] 取得主 Agent 提供的专属 IAB 页、URL、运行 revision 与隔离数据说明后实际点击验收。
- [ ] 对主 Agent 最终 revision 复核代码边界和失败恢复；本记录不替代原生/Provider/生产验收。

完成标准：每条用户路径有可观察行为及持久化/失败恢复证据；模拟、实际 Renderer、原生控制面、Provider、主干和生产状态分别记录。当前实现与页面未冻结，未完成项不是 pass。

## 风险 / 验收矩阵

| 路径 | 风险与必须保持的不变量 | 验收证据 / 当前状态 |
| --- | --- | --- |
| 对话 / 项目互斥导航 | 只有 App 是 active page/route owner；切换不新建重复 Session、不热替换历史身份 | 同一条会话分别从列表、项目、搜索打开，核对唯一页与准确标题；待页面 |
| 统一新建 | 全局入口不能隐式选第一位 Bot；Bot、项目必须明确，失败保留草稿 | 不选 Bot 被拦截；指定 Bot/项目后准确创建；失败/取消后草稿和既有页保全；待页面 |
| Bot 身份一致 | 稳定 agentId，而非显示名、项目名或列表索引；历史 runtimeBinding 不跟默认配置改写 | 改名/头像后跨名册、启动页、聊天、项目成员一致；重开/刷新仍一致；待页面 |
| 项目上下文 | 原 Project 是工作区登记；不能仅改标签就宣称多项目 Bot；原会话 birth snapshot/agentDir/任务归属不变 | A 项目草稿→B项目新/已有会话→回A，核对消息、草稿、文件和任务隔离；重开确认；待页面 |
| 回报 / 返工 / 验收 | native completed 只为 awaiting_review；Renderer 无直接 accept/reject 写权；精确 session/task/attempt | 请求验收走原 Chat；请求接纳不显示验收完成；返工追加 Composer且保留草稿/附件；旧回报不盖新 attempt；待页面 |
| 交接 | 更换显示负责人不证明执行 owner 迁移；保留原提交者、尝试、项目与根验收权 | 指定目标与原因；实际 owner 接纳/拒绝可见，历史不变；无后端支持须明确不可用；待实现范围确认 |
| 任务依赖 | 不能在前置仅返回或待验收时启用下游，不另建浏览器 scheduler | 前置 awaiting_review→下游受阻；原 owner验收→下游可行；待页面/后端 |
| 群组 | 未合入的 dirty M1 不能作为已完成依赖；无收件人不能发送；角色不等于真实 Bot 身份 | 如不接本期群组，则明确不可用和原因；若接入必须先协调原 owner并验完整M2/M3；当前不具备复用交付条件 |
| 异步 / 断线 / 重开 | 迟到响应不抢焦点、不同会话不串状态；未知写结果不重发 | A/B/A、失败重试、刷新、重复点击、窄窗与深浅主题检查；待页面 |

## 群组只读边界结论

工作树：`/Users/zhangshaohua/Documents/Codex/2026-10-31/moxbots-group-phase1`。分支 `codex/group-phase1-20261031`，读时 HEAD `d18137e87155994c4ade3d1889d04830821a8eda`，存在已改和未跟踪文件。未向此树写入、复制或提交任何文件。

任务 `.agent-sync/tasks/codex-group-phase1-20261031-cebe4fc1.md` 标记 `status=in-progress`；M1/G01–G02、M2/G03–G04/G06、M3/G05/G07 全未勾选。`dev-docs/group-phase1/acceptance.md` 明确：M1草稿与49项初始验证，最终UI更改待验证；M2结构化成员寻址、原生任务包指派、成员回报及接收者上下文未实现；M3 stop/recovery、签名客户端/真实Provider、CI/main和发布未验收。未将“49项通过”视为完整群组验收。

任务与合同明确 desktop/macOS/updater、shared CI/main/release 唯一 owner：`01a12bc2-907a-7702-b6dd-788225c5dfe4`；当前冻结批次不含群组。上述任务记录没有显式列出群组源码会话稳定 ID，不能猜测。需要复用时由主 Agent 联系原任务负责人核实源码归属和候选，不从沉默推断接管。

精确源码接口（仅供协调审阅，不是可拷贝依赖）：

- `src/shared/sessionCollaboration.ts:4`：`COLLABORATION_LIMITS`（成员8、回执128、contextCharacters12000）；`:6` `collaborationMemberSchema` 仅有角色id/name/responsibility/enabled，没有跨项目Bot的稳定agentId绑定；`:26` `collaborationActionSchema` 为 configure/sessionId/requestId/expectedRevision/coordinatorId/members。
- 同文件 `:44` `hasUnresolvedCollaborationWork`；`:52` `configureCollaboration` 原ledger CAS内校验revision、幂等指纹、历史成员保留、root不可更换；`:74` `collaborationAssignment` 只生成 participant/configRevision/name/responsibility，不证明native指派已实现。
- `src/server/session-engine/session-collaboration.ts:9` `readCollaborationSupport` 仅 builtin 支持配置且拒绝busy/queue/recovery/未解决执行；所有分支 `nativeConsultation:false`。`:21` `actOnCollaboration` 调原 `mutateSessionTaskLedger`，同时核对Session/runtime identity。
- `src/server/routes/session-task-orchestration.ts:89` POST `/api/session/task-orchestration/collaboration`，要求 `verifySessionUserAction` 原生签名；普通浏览器fixture不能代替此安全边界。
- `src/renderer/components/collaboration/SessionCollaboration.tsx:10` 从既有任务Context和Tab-scoped apiPost读写；失败保留同一requestId/草稿，revision冲突才显式reload，不另建任务数据库。

结论：可以复用其设计约束和接口取舍；当前无法安全宣称复用已有群组“功能”。R3原型的2–6位已有Bot群组，与此草稿1–8个会话内协作角色也不是同一数据合同，不能把名称映射当身份集成。

## R3 相对既有源码必须真实接线的路径

原型全部为localStorage演示；不包含模型、文件、权限、调度和后端持久化。R1的Bot身份基础不是项目/Bot多对多迁移。观察期间主 Agent 正常推进分支，HEAD由初始上下文变化到`2616e107a57eef9606adcab6ced2fe9f409cd492`，本地main读为`428ffd94ce2e5eedfb150c28dccecf201c6b2edc`；此记录不宣称这些可变引用已最终冻结或远端交付。

1. **导航与新建**：`src/renderer/components/global-sidebar/GlobalSidebar.tsx`、`App.tsx` 的 `handleNewSession` / `handleNewTab` 与既有typed intent仍是入口。不能把原型页面状态直接当route/Session状态。`Launcher.tsx:293`目前由selectedWorkspace.agentId取Agent；显式Bot+项目的选择需实际传递出生上下文。
2. **独立身份和项目关系**：`src/shared/config-types.ts:540`的Project仍是必有path的工作区登记、单一agentId；`src/shared/types/agent.ts:133`的AgentConfig持有稳定id/name/icon及执行默认。`projectService.ts:133` addProject按工作区路径去重；不能新造同目录Project来模拟一个Bot参与多项目。`dev-docs/bot-identity-r1/project-relationship.md`已明确此兼容边界。
3. **跨入口身份**：`BotIdentityButton.tsx`只接name/icon/onOpen，是展示组件；持久修改须继续原Agent/Project配置事务，不能只同步React或localStorage。
4. **项目汇总**：`useProjectBoardData.ts:18`按workspacePath筛选Session agentDir与Task.workspacePath，读取原Store；要展示业务项目必须明确与工作区的映射，不能将UI筛选误当运行隔离。
5. **上下文切换**：已有 `src/shared/projectContext.ts` 是有界只读历史摘录工具，不能替代Session出生归属、更不能赋予读取其他项目授权；原Session metadata、runtimeBinding和原任务归属不得被页签切换改写。
6. **任务动作与历史**：`SessionTaskResults.tsx` 与 `SessionTaskActionsContext.ts` 已使用精确session/task/attempt，经原Chat请求主Agent验收；返工复用Composer。R3不能引入直接状态按钮、独立scheduler或localStorage验收账本。交接若超出既有root/task owner能力，需真实后端合同；没有能力时应明确不可操作。

## 证据与限制

已读：以上文件及原型 `README.md` / `verification.json`、群组任务/acceptance/开发合同。仅读源码与项目文档，没有读取真实用户Session内容。模型名称和用量：当前独立执行环境未暴露可核实的精确模型及token/费用计量，均为未知。未新增外部模型调用。

阻断：尚无专属运行页和冻结revision；无实际UI通过结论。原生签名、真实Provider、原生文件、账号权限与生产验收不在本审阅授权内，必须由主Agent和既定发布owner分别记录。

## M1 候选独立审阅（后续进展）

收到专属fixture `http://127.0.0.1:18753/__fixtures__/bot-experience-r3.html` 与完整App `http://127.0.0.1:18753/`；限定M1导航/新会话，不涵盖M2/M3，也不证明真实后端创建。源码读时：HEAD `2616e107a57eef9606adcab6ced2fe9f409cd492` 加未提交M1。独立核对 SHA256：

- `BotConversationNavigation.tsx`：`69c36f6502e2559dc43d3db15c477ebded733ab830a0125e68ad256427780d41`
- `NewBotConversationDialog.tsx`：`58c3ba54fe22e1957be809bb63e360a14e34cde0054a60d518463b3da1e08f11`

### 实际浏览器阻断

本子代理调用 `cua.createBrowserTab("iab", fixture, {visible:false})` 返回 `Browser is not available: iab`。随后 `cua.listBrowsers()` 仅暴露Brave个人与Chrome Kevin两个extension浏览器。未使用它们、未创建任何其他tab、未改变viewport。此为工具能力缺失；已通知主Agent由具备IAB的线程接手真实点击。没有截图，没有实际页面pass。

### 确认的源码缺陷

**P2：rail模式没有对话/项目切换入口。** `GlobalSidebar.tsx:1427` 的tablist限定 `botExperience && expanded`；rail flyout渲染的 `{tree}`（读时`:1610`）仅包含RemoteSessionSidebar与BotConversationNavigation/WorkspaceTree，没有同一切换。`BotConversationNavigation`本身仅有筛选、列表、新Bot与管理历史按钮。

复现路径：展开侧栏选择“项目”→收起或缩窄窗口进入rail→点文件夹打开flyout→只有项目列表，没有切回“对话”入口；从默认对话视图进入rail同样无法选项目。窄窗不能展开时此入口不可达。fixture自身总是展示tablist，所以fixture独立组件验收无法检出此集成回归。建议在共用tree/flyout中提供同一切换，避免展开态重复。已发主Agent修复；待更新源码和真实IAB复验。

### 源码正向证据与待验证项

- `projectBotConversations` 排除archived/automation/system-maintenance会话，并按唯一工作区路径匹配；没有偷偷改变Session或Project元数据。
- 对话行Bot身份来自Project.agentId对应AgentConfig；未读用通知计数与Tab.hasUnread的max合并，摘要与会话标题分别展示；项目筛选无匹配时回退全部。
- 新会话初始botId/projectId为空；仅选择Bot后列出当前有效Project绑定并预选首个绑定。本批不证明跨项目多Bot，符合已告知的1:1限制。
- submit重新核对当前projects/agents；pending ref阻止重复调用；失败不清text；成功才关闭。关闭和Escape在pending时阻止；所有操作仍走原onOpenWorkspace，不增加前端执行owner。
- 读取失败保留原conversations，并显示重试调用原refresh；状态为空时显示新建入口。
- 需主线程IAB复核：CustomSelect的FloatingPortal使用preserveTabOrder，不能仅凭portal在body就推断焦点逃逸；必须实测Tab/Shift+Tab/Escape/方向键。长Bot名、长项目目录在选中身份行的窄窗换行/横溢也待实测。
- 需完整App验证rail、菜单与飞出层交互；fixture不能代替GlobalSidebar集成接线。

当前结论：源码存在以上一个P2，实际UI独立验收被IAB不可用阻断；其余正向检查仅是源码审查，不能标为真实点击通过。M2/M3继续未完成。

## M1 修复复审与静态视觉检查

对上述结论的后续更新：原rail P2已在源码层关闭。`GlobalSidebar.tsx`把tablist移至共享`tree`顶部，不再限定expanded；展开区与rail flyout均消费同一tree，resourceView仍通过原偏好owner写入。新增`GlobalSidebar.test.tsx`的forcedRail用例实际点“我的Bots”后，在flyout内切项目→对话并核对aria-selected及localStorage；另测显式新建不会调用默认工作区/旧onNewTab。`globalSidebarPreference.test.ts`新增旧偏好默认值和projects/history/非法值兼容用例。源码读时HEAD仍为`2616e107a57eef9606adcab6ced2fe9f409cd492`加未提交M1；两个新组件SHA256与上次一致。

独立使用view_image查看主Agent提交的两张截图：

- `/Users/zhangshaohua/Documents/Codex/2026-11-01/moxbots-bot-experience-r3/dev-docs/bot-experience-r3/evidence/mobile-new-conversation.png`：390×844静态截图中的新会话表单完整落在窗口内，标题、说明、Bot、项目、当前绑定路径、消息和底部操作层级清楚，没有可见遮挡或裁切，关闭/取消/打开按钮可辨识。
- `/Users/zhangshaohua/Documents/Codex/2026-11-01/moxbots-bot-experience-r3/dev-docs/bot-experience-r3/evidence/new-conversation-failure.png`：桌面失败状态中输入文本仍显示，失败提示与重试主按钮可见，没有可见重叠或裁切。

以上只证明这两张静态画面的可读性，不证明截图之外的长路径/所有选项/深浅主题，也不证明我的独立实际点击。未使用已知像素缩放失真的完整App截图作视觉通过依据。

主Agent报告完整App390×844的“我的Bots→项目→对话”点击与无横溢、fixture打开失败后重试/读取失败后重试/筛选/空态已完成；相关事实属于主Agent交互证据，我未重复执行。主Agent另报告107项相关测试通过，曾删除TestingLibrary不支持的exact属性后重跑tsc；本审阅只确认测试内容与修复方向，不冒称独立运行全部测试或最终tsc状态。

当前复审结论：在本次所读M1导航、新会话及共享tree修复范围内，未发现残留P1/P2；原rail P2源码修复成立。独立实际交互仍因无IAB blocked，CustomSelect键盘焦点及长内容适配仍需具备IAB能力的主Agent保留实际证据。M2/M3、真实后端/原生/Provider与生产验收均未纳入本次通过范围。


## Launch receipt repair rereview 2026-11-02

## P2 修复再次复审

当前修复以独立`UncertainBirthReceipt[]`保留未知记录中的原Bot名、项目名、原文与tabId。未知表单内仍阻止原submit；“保留记录并返回新建”清空当前Bot/项目/文本/error/uncertain并返回菜单，旧receipt保留在待确认section/details的只读文本框，无重发按钮。由新菜单创建新Bot或另开空白对话，不把旧原文带入新请求。关闭/查看原tab不会丢失原记录；成功的新意图也不清除旧receipt。

扩展App调用链测试分别覆盖普通pending与prepared Session：未知后重开仍禁止重发→保留记录回菜单→新Bot入口enabled→新对话文本为空→发送不同intent→保留两条不同Chat及各自initialMessage→重开仍可读取旧原文。prepared第二次调用使用独立prepared id，不把同一mock id假装两个Session。测试仍是App/Dialog+mock native，不升级为原生送达证明。

独立`git diff --check`通过。复审文件SHA256：App `f5657cd9869828a210ed6d90fd6cb20bdabe33c201ad8970953c66b1926e9894`；Dialog `d8eabfa96e9aa08cb0c5762d0191b0cb71392bde36a6ea55f02c06dea96edf2c`；App helper测试 `2a28d570ee98f50925d4b42579bacafde7a0a56b5adcc68e1e979a21410978a8`。

复审建议：上述新增P2在当前源码层关闭；所读启动回执修复范围未发现其他P1/P2，可以在主Agent最终相关测试、tsc/lint和主干合并门禁通过后提交集成。此建议不冒称最终检查已通过或主干已交付；独立真实UI仍无IAB，M2/M3/原生/Provider/生产边界不变。未知记录仅保存在当前Renderer生命周期内，不宣称重启后持久化或已自动完成原生对账。
