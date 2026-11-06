# GROUP-01 / HANDOFF-01 · 稳定 Bot 群组

任务归属 MB-BOT-NAV-20261102 / R3 M3，基于 main4ceeb2d21。当前阶段落实成员配置与原生可信写入，不把该阶段称为群聊执行完成。

| ID | 状态 | 完成标准/下一步 |
| --- | --- | --- |
| G01-A 稳定身份与目标 | 本地完成 | 权威 Bot/项目/工作区解析，同名不合并；显式 groupId + botId + revision，无默认接收者 |
| G01-B 原账本保存 | 本地完成 | 原 SessionStore/task ledger CAS；签名配置 POST、冷读、幂等、冲突、停用历史、未知执行保护通过 |
| G02 实际成员界面 | 组件/原观察者本地完成，Chat 入口待 G03 | 原主题、已有 Bot、明确接收者和配置恢复完成；48项及 WebKit 验证，见 ../bot-group-ui-20261107/PLAN.md；真实收发前不开放入口 |
| G03 真实成员会话收发 | 待实施 | 既有 Bot 自身 Session birth/Inbox/Runtime，真实消费与回报，ACK 未知不重放 |
| G04 / HANDOFF-01 任务交接 | 待实施 | 原 task/attempt/owner 精确跨 Session 引用，回报与真实检查分开，旧结果不覆盖新尝试 |
| G05 停止/重开/恢复 | 待实施 | 打开和读取零派发，保留未知结果、原预算、权限和群历史 |
| G06 真实受控闭环 | 待实施 | A → B → 成果 → 原负责人检查；实际账号/数据、真实执行证据 |
| G07 主干与发布 | 待原 owner | 独立审查、main/CI、统一包、安装、真实群组路径与下载通道 |

## 已采用的合同

成员由 config.json 的稳定 AgentConfig.id 解析，不接收客户端名称/工作区/权限快照。群属于根 Session 的冻结逻辑项目，根 Bot 仍在成员中；项目必须存在、未归档、版本一致。活跃成员最多8，历史成员32；停用保留身份和加入时间。工作区变更不能静默重绑成员。

群配置保存在原 SessionTaskLedger.botGroup（schemaVersion1，groupId=rootSessionId），复用原串行化/metadata CAS/SSE；没有第二个持久化或执行 owner。群配置 revision 与整个 ledger revision 各自有作用域。配置回执保留128条，达到上限明确拒绝，不删除历史换取幂等通过。

唯一配置入口 POST /api/session/task-orchestration/bot-group，原 Tab → Rust 精确会话 owner → P256 签名 → Node 验证实际 path/session/body → 原账本 CAS。请求只有 sessionId/requestId/expectedRevision/projectRevision/title/memberBotIds。幂等摘要是 schema 校验后的规范命令（包含所有 ID/revision），不是客户端提供的 digest；签名本身绑定实际原始正文。改变已确认 requestId 的命令会拒绝；原请求重读返回当前配置且不重写，不因后续 Bot 配置变化再创建一次。

配置修改要求原会话没有运行、排队、后台、未核对或未知工作；捕获并在持久化前复核 Session/runtime/工作区及相关名册。同名成员不取得彼此工作区，项目成员也不自动成为群成员。

创建时记录原 transcript 最后一条消息 ID，后续配置不重写该边界。这个 marker 不是上下文导出授权：G03 仍须只投影明确的本群可见输入/结果，不因时间先后将私聊或外部 Inbox 消息自动变成群上下文。当前没有消息转发、模型调用、Bot 唤醒或业务重试路径。

## 接续限制

旧 codex/group-phase1-20261031 未提交草稿保留。其同根原生子角色不能冒充 R3 独立 Bot；不复制该脏树、不重新引入用户已删除的聊天人工验收/重试/返工按钮。现有项目 Session 冻结背景、执行预算和 unknown fence 保持。

G02/G03 必须处理新群 birth（沿原 prepare/commit/rollback）与既有会话转换，不能自行发布虚构 metadata。现有 Rust metadata 通用读取会剔除 taskOrchestration，因此群配置读取应复用原 task snapshot/observer，不能为旁路展示泄露整个账本。原配置路由不应被呈现为已经能群聊的入口。

## 部署归属

仅 desktop/macOS-arm64/updater/sharedCI/main：01a12bc2-907a-7702-b6dd-788225c5dfe4。开发会话完成源提交/推送和精确交接；原负责人统一审阅、CI、版本、制品、安装和回滚。G01 不独立宣传为群组功能交付，不改变现有冻结修复制品。导航/项目工作台的独立 producer 分别80a58f3a、8c51051，原负责人已接收。
