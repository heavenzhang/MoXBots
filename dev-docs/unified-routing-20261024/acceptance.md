# 统一候选池故障接管验收

任务：MOXBOTS-UNIFIED-ROUTING-20261024；源分支 `codex/unified-routing-20261024`，base main `fda7728fa11ee0b1138e9357b2b81e680f408043`。本文件记录局部源码与本地合成验证，未发布。

## 行为

独立的“使用指定备用/不自动切换/跨档接管”设置和运行时覆盖已删除。新自动轮次沿既有自动分类与候选池选择模型，再选择同档、API可执行且history-compatible的接管候选；无此候选时保留原有限恢复。订阅/托管/scoped来源不通过本API桥接接管，手动固定会话保持原模型。旧config.modelFailover保留为不参与决策的未知字段，不写用户配置或更改正在运行的会话。

接管仍只在原Query/root及安全预算内进行；模型输出已交付、动作结果不确定、Stop或后台归属不明仍不能重放。request图像/工具/上下文/输出预算在发送前复核。历史记录中的旧模式和诊断保留。恢复route identity带统一策略版本，旧checkpoint不匹配则按原流程暂停保留进度。

## 验证结果

- 243项受影响unit/integration/DOM测试，14文件。首次组合运行242通过、1个旧中文文案断言失败；更新为“同档接管候选”后，相关17项DOM复核全通过；其余242项的通过结果保持，未重复整套以增加无意义运行。
- 路由14、Session接管32、admission31项包含旧specified/off/cross-tier失效、池暂停/移除撤销、订阅候选跳过/订阅primary无候选、凭据轮换、history/协议/图像/context、原Query/Stop/防重放等行为。
- TypeScript `tsc --noEmit`、改动TS/TSX的ESLint、server esbuild bundle、测试分类通过。dependency-cruiser为0 errors/18既有orphan warnings。
- 非实现者子Agent负责后端独立审阅，发现订阅候选误报P2；修复后复核通过并独立重跑42项聚焦测试。主Agent负责集成，审阅UI diff并操作真实SettingsPage。
- `browser-check.mjs` 通过；真实SettingsPage、合成配置与tiers transport，检查已删除旧入口、开关保存/刷新/旧字段保留、失败保存反馈、1440×1000/768×1024/390×844，无pageerror及页面横向溢出。证据 `evidence/browser-result.json` 与相邻截图。

复现：Node24 + 项目依赖，运行 `node dev-docs/unified-routing-20261024/serve.mjs`，另一终端运行 `node dev-docs/unified-routing-20261024/browser-check.mjs`。仅loopback8937，无真实密钥或Provider请求。

## 交付边界与执行记录

代码原文件中沿用ModelFailoverController命名指原Query的恢复/防重放控制器，保留该安全实现不表示保留独立备用产品机制。AppConfig独立备用类型已移除；历史AutoRouteRecord模式字段仅作旧transcript展示。

主Agent实现backend/shared/接线与总验收；`settings_cleanup`（请求gpt-6-luna/medium）实现UI并审阅非自身实现的backend。没有外部模型调用；响应token/费用和收益没有实测数据，不推算。独立审阅一轮P2修复复核。源代码测试不等于真实Provider、原生客户端或生产验收。

desktop/builtin单元由既有唯一owner `01a12bc2-907a-7702-b6dd-788225c5dfe4` 组织共享CI/main、版本、签名包、发布及原会话验证。本会话未重启客户端/触发该单元CI/发布，也未更改现有冻结候选。

用户随后要求全面评审多模型/意图驱动自动执行，开两个讨论线程；本分支先保存为可审阅源码，整体机制结论另记，不把删除独立备用当作全部完成。
