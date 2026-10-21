# MOXBOTS-MODEL-SETTINGS-20261022 — 模型策略功能验收

仓库 https://github.com/heavenzhang/MoXBots.git；分支 `codex/model-settings-20261022`；原始基线 `85981a95b5c9a8e8736d680572e2813b1f7809fd`。单一入口候选 cdf33fd9 已完成；本次追加六项功能。旧两入口及 UI-only 截图保留为历史；本次以 `evidence/six-features/` 为准。

## To Do List

- [x] 统一“模型策略”入口，自动选模型为主，高级故障接管默认折叠，旧导航兼容。
- [x] 1. 先清除空闲新轮次的旧自动备用；manual、null、分类失败、异常、CAS失败均不能沿用；busy当前轮次保持。
- [x] 2. 自动/指定备用默认同实际主模型档位；跨档必须显式 `allowCrossTier=true`，未知档位拒绝。
- [x] 3. 跟随自动/指定备用/不自动切换三种模式；关闭不取消主模型重试、Stop和动作guard。
- [x] 4. 配置就绪状态、修复入口，以及运行时凭据/endpoint/catalog/history/图片/已知上下文/工具协议约束。
- [x] 5. 标签显示实际选模、备用候选或未选原因，不能冒称已切换；实际发备用请求前才落切换诊断。
- [x] 6. 目录加载重试、失效分类器恢复、单独恢复自动分档/默认排序；保存失败保留旧值。
- [x] 21文件414 tests、类型检查、受影响ESLint、依赖检查、测试分类通过。
- [x] 真实SettingsPage合成浏览器9组场景，1440/768/390；独立review复验通过。
- [x] 真实SDK/native child本地回环3条路径通过，工具计数均1。
- [ ] 统一发布负责人完成共享CI/main集成及远端main包含性验证。
- [ ] 负责人在下一未冻结制品中完成原生配置/真实Provider/生产路径验收。

## 行为与兼容性

沿用config.json与原updateConfig/atomic writer，不迁移用户数据，不引入新的Session、Query或recovery owner。`modelFailover.mode`、`allowCrossTier`为可选新增字段：无mode时旧enabled=true映射specified，否则auto；显式mode优先。切换模式保留已选择备用和跨档值；off只禁止切模型，不绕过原模型重试与停止门禁。

自动备用只借给本次admission绑定的实际primary，且Session仍为auto。新idle admission在分类前撤销旧候选，仅保留上轮tier；busy消息、工具往返不改本轮候选。分类失败不建立虚构档位，手动并发选择/CAS优先。指定备用失效时不暗自改成自动备用。

备用在请求接纳、异步内容校验后和实际发送前重新检查配置/权限/停止门禁；同轮固定身份，动态撤销可阻止下一请求，原guard与结果不确定性限制继续有效。真实切换仅为本轮推理，不改会话desired主模型。`route explain`与标签均展示实际策略候选。共享catalog移至叶模块，路由/设置/接管复用原目录逻辑，避免依赖循环。

## 验证证据

`evidence/six-features/tests.txt`：最终21文件414项通过，覆盖shared策略、admission、诊断、classifier/assist、bridge主备、已缓存工具进度、context/recovery、卡片、导航及中英文侧栏。未把重复执行的独立review/增量测试累计到414。

`typecheck.txt`：tsc --noEmit通过；`lint.txt`：受影响TS/TSX ESLint通过；`dependencies.txt`：0 errors，18条现有no-orphans warnings；`classification.txt`：新增server tests分类正确。baseline-browser-mapping仅开发工具数据陈旧提示，本次不扩大依赖升级。

浏览器：Node24运行 `serve.mjs`，仅监听127.0.0.1:8924并关闭proxy，再运行 `browser-six-check.mjs`。实际SettingsPage/Sidebar/卡片，配置/API/localStorage均合成，无真实凭据。`browser-results.json`记录9组通过、0 page errors；检查三模式、跨档显式开关与值保留、reload、失效分类器恢复、独立重置、读取失败重试、保存失败保留旧值、指定备用失效摘要及修复跳转、旧导航与英文。6张截图覆盖三宽度折叠/展开，无横向页面溢出，窄窗口档位纵排。主Agent查看1440与390展开截图；非实现者独立context重跑9组并人工检查1440/768/390截图，结果在 `independent-browser-results.json`。

真实SDK：运行 `scripts/verify-model-failover-loopback.ts`（普通、--stream-failure、--stop-during-retry），隔离scratch HOME、原SDK/native child、本地合成HTTP与counter MCP，不调用真实模型。三个json回执分别证明：普通路径primaryCalls5/backupCalls1/switches1/工具1并保留工具结果；已输出断流与Stop路径primaryCalls2/backupCalls0/switches0/工具1，Stop transport已完成。它们证明原恢复/防重放集成路径，不冒称已安装日常客户端验收。

## 独立审阅与修复

主Agent负责shared/server/标签与集成；UI实现worker仅settings/i18n；独立reviewer只读。选择依据：UI与运行时策略可互斥拆分，安全恢复由主Agent集中修改；reviewer覆盖跨层竞态及实际浏览器。UI沿既有设计，无新增框架。未调用外部模型服务；原生worker运行，token/费用不可确认，不做节省估算。

修复并复验：异步校验期间canRetry撤销后仍发备用（P1）；分类失败误报无备用及缺latest fence；OpenAI沿用已丢弃SDK max_tokens误判窗口；route explain展示未使用自动备用。均无剩余P1/P2阻断。首次浏览器重置失败来自fixture键格式错误，改用实际provider/model键后全量重跑通过。

## 边界与发布交接

配置“已就绪”不代表真实服务可用。运行时拦截已知不兼容：图片模态、工具transport/声明协议、可确认的上一轮context usage与输出预算；OpenAI使用实际显式target输出cap，不能使用被翻译器丢弃的SDK预算。完整请求的实际token量、未声明工具能力、未知窗口/全局输出上限及真实Provider行为尚未实测，不宣称已证明全部兼容。

部署单元仍为desktop client（renderer/shared/内置Session/bridge），唯一负责人 `01a12bc2-907a-7702-b6dd-788225c5dfe4`（MoxBots桌面端统一打包负责人）。本会话提交push源码并按用户授权交接精确SHA与证据，不自行PR/共享CI/正式构建/版本分配/替换日常App，不加入冻结候选。精确源码SHA、handoff gate、接收回执见本任务工作区result.json/发布队列和owner消息。主干、候选制品、原生与生产验收分别追踪。
