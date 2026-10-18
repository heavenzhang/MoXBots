# MODEL-PICKER-CATALOG-20261018

2026-10-18，Asia/Shanghai。用户要求模型更易查找、增加筛选、修正模型获取 API。基线 origin/main 9269dd8c52c423a180bfba366c8f0434a90db005；权威远端 https://github.com/heavenzhang/MoXBots.git。

## 交付范围

- 备用模型下拉支持大小写不敏感的模型 ID、显示名、供应商、多关键词检索；供应商与已配置密钥可组合筛选。筛选仅改变菜单展示，不写盘、不丢失现有选择；清空选择仍按原配置 writer 关闭自动备用。
- 复用 CustomSelect / Popover 与产品主题，保留现有未开启搜索的调用方。搜索获得焦点、方向键定位、Enter 原生按钮选择、Escape 返回触发器，IME 组合输入不触发菜单快捷键。
- OpenRouter 使用认证的账号过滤模型目录；Go 更新目录及三个 transport 路径，精确旧默认路径仅在执行投影中升级，不写回自定义地址/模型。
- 不增加推理探测、自动删除历史模型、自动变更备用配置或真实业务写入。密钥配置状态不等同于推理可用。

API 来源与实际无费用 GET 结果见 [api-verification.md](api-verification.md)，浏览器合成场景验收见 [ui-acceptance.md](ui-acceptance.md)。

## 验收记录

- 原有/新增设置与模型管理 3 文件 28 项 DOM 回归通过；集成复验 5 文件 52 项通过，覆盖发现请求刷新、凭据更换与旧响应隔离。
- API 7 文件 81 项通过，包含真实本地 SDK 与 Bridge/header 的回环。不同命令存在重叠，不相加冒充独立测试总数。
- 最终设置DOM12项、定向ESLint通过；独立Chromium15项实际页面验收通过，包括240项密钥状态描述关联、1440×900和800×700、390辅助检查。主Agent复核截图及实际diff，独立只读OpenRouter GET200/468复验通过。
- 远端首轮TypeScript/lint/unit通过，完整构建和最终CI/main仍待核验。本机极高负载下，两个任务自己的重复本地typecheck/build已停止，改由远端精确候选CI验证；不影响其他任务。
- 真实 OpenRouter 账号目录 GET 200（468）与同账号通用目录 GET 200（471）；Go 自有 UA 目录 GET 200（37），不携密钥。证据不包含原始密钥或账号 ID。

## 发布请求与未关闭门槛

需要桌面更新；本聊天仅交付源码/CI/main，不并发发布、重启或替换日常客户端。统一发布 owner 为 `.agent-sync/plan.md` 登记的 01a12bc2-907a-7702-b6dd-788225c5dfe4。主干合并不把本任务自动加入已冻结制品。

发布请求：将合并后本任务源码纳入下一未冻结修复版本。无需数据迁移；保留用户模型、默认选择及配置 writer；回退前版安装包即可恢复旧代码。应在空闲、有效配置备份及正式包回退路径准备后，由发布 owner 按既有签名、公证、发行规程执行。

待真实客户端验证：设置搜索/筛选与保存重载；正式 Rust 外部请求 owner 下的目录刷新；Go 账号模型推理与区域/套餐限额；实际备用切换。当前没有 Go Key，也未增加付费推理调用。Integrated DSH 模型推理不因 SDK 回环通过而视为验收完成。

## 执行记录

主 Agent 负责界面、集成、代码审查、验收与 main 交付；catalog_api 负责 API/协议与回归；ui_acceptance 独立验收合成页面。请求模型为 gpt-6.1-sol/high（API）、gpt-6-luna/medium（UI）；运行时未提供可确认的模型/effort用量与费用统计。两条独立工作流避免了共享产品文件并发编辑，主 Agent 审查实际 diff。一次搜索焦点测试发现 portal 延后挂载，已用稳定挂载 ref 修复并复验；独审发现密钥suffix未被屏幕阅读器关联，补充aria-describedby并通过DOM及240项实际页面复验。UI脚本状态重置与selector错误在验收准备中修正，不作为产品缺陷。

后续同类任务先核对产品 profile 与真实配置 owner，避免用上游 `.myagents` 配置推断 MoXBots `.moxbot` 凭据状态。
