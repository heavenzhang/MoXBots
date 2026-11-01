# 项目与 Bot 的关系 — 2026-11-01 补充决策

用户明确提出“项目还是很有必要保留”。保留项目为独立入口，Bot 是长期执行身份，项目是目标、资料与工作记录的组织范围；第二轮原型已体现两种入口。

## 竞品事实

当前阅读 [Grok Bot / Bots](https://docs.x.ai/grok-bot/bots) 的 Organize your roster：以 sections 按项目、客户或业务整理 Bots；[Files and results](https://docs.x.ai/grok-bot/files-and-results)：共享 /workspace 内使用项目文件夹；[Grok FAQ](https://docs.x.ai/grok/faq) 提到聊天产品 Projects 功能。公开 Grok Bot 文档尚未给出以 Project 统一承载目标、任务、成果与权限的实体模型，不能把普通 Grok Projects 和 Grok Bot 机制合并推断。

## MoXBots 的目标关系

| 对象 | 职责 |
| --- | --- |
| Bot | 稳定 ID、名字、形象、通用能力与长期偏好；可以参与多个项目 |
| 项目 | 目标、项目资料/规则、参与 Bots、项目会话/群组、任务与交付记录 |
| 会话 | 一次交流上下文；单聊明确 Bot 和可选项目，个人会话不强制归项目 |
| 群组 | 一组 Bots 的协作场所；本轮先明确一个所属项目，不当作项目本身 |
| 任务 | 项目内工作，有准确负责人、尝试、回报和验收状态，交接不改变归属项目 |
| 工作区 | 文件和工具的资源环境，由实际执行 owner 选择；当前原型展示项目目录 |

通用偏好可以跟随 Bot；项目资料、指令、会话和授权上下文需按项目选择，跨项目参与不意味着自动混用全部资料。此为后续实现要求，原型没有真实权限和 Runtime。

## 本轮实现边界

当前代码的 Project 是既有工作区登记，通常通过 agentId 与 AgentConfig 配对，元数据由既有 composite patch 同步。R1 保留此兼容关系及原目录、ID 和历史，不声称已经实现多项目 Bot 执行或独立项目上下文。名称设置仍通过原 Agent/Project 显示元数据入口；新业务项目名称独立于 Bot 名称属于后续实现。

R2 新增两项目的合成视图，演示同一 Mino/小八参与不同项目；新建会话选项目、项目内会话/群组/任务汇总、切换项目目录。这里的多对多关系仅为设计数据，不接真实 Session/配置 owner。

后续代码阶段先核实可复用的 ProjectBoard/Project/AgentConfig owner，设计显式项目引用、成员关系与 Session 出生上下文兼容，再实施跨项目执行；不通过 UI 换名假装已经解耦。
