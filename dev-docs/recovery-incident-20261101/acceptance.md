## 最新状态：第十六项 — 完整 HTTP 拒绝的冷却等待（2026-11-02）

第十四/十五项已通过 PR228 合入实际 main `185d51653fb30dd3d4e03c36e01feb01d3060890`，受测候选 `30b1fd7a3385135aa4cacc9e144dc4aeedec5fcd` 与 main tree 相同。0.5.33/533.1 已完成签名、公证和本机安装，二进制及服务端摘要独立匹配。**原会话稳定性验收仍失败**：Max 原执行第 7 轮实际 Bash 成功后，上游返回完整 HTTP502 和 60 秒冷却；快速重试退出，而旧未知操作仍阻断严格持久恢复，导致原任务停止。双滚动条原会话后续也报告上游502，其他会话由唯一发布 owner 继续复验。

本项修复只复用当前 Query 的请求 lease、原请求重试计时器和每目标最多四次尝试预算：先走既有合法候选链，无法继续切换时，在最后目标完整冷却后使用剩余尝试；手动无备用路由同样适用。每次响应重新取得实际 HTTP 拒绝证明；取消、owner/route 变化、后台归属、策略撤销、父 deadline 和异步候选校验均能终止等待。无法放入剩余窗口的冷却不缩短，SDK 重复不续预算。未改变手动路由、持久/断流恢复权限或旧动作账本，也不重发用户输入/工具。

验证：旧实现新增用例 11 FAIL/19 PASS，修后 9 文件 333 项相关 unit/integration PASS；包含三协议真实 HTTP 冷却、60秒等待、剩余预算、取消50毫秒内结算、异步资格撤销、不可容纳冷却、合成连接502不沿用旧证明，以及原有流/账本/持久恢复回归。全量 TypeScript、定向 ESLint、测试分类和 diff 检查通过。实际 SDK/native Bash 的 `--http-rejection-cooldown --returned-history-gap` 用真实时钟等待 60,012 毫秒后完成：1次拒绝、0次换模型、5次正常推理、后续写入1次、旧未知启动0次、2次预期工具拒绝、unknown保持1，冷账本验证通过。模型服务为本地合成 HTTP；未写真实会话或业务数据，不等同已安装客户端/真实供应商验收。

打包前补充审查：更长冷却虽仍处于同请求合法等待，却未进入持久恢复状态，原10分钟闲置watchdog会误判卡死。11分钟冷却与真实 InactivityWatchdog 的受控时钟组合旧实现复现失败。修复只由原 ModelFailoverController 暴露当前有效等待读状态，原watchdog沿既有等待例外消费；取消/owner/route/策略/过期立即撤销，等待结束后的真实模型卡死仍会超时。补充5文件153项回归（与上述333项部分重叠）、全量tsc与定向lint通过；三协议实际HTTP40项及最终原生60.012秒工具链复验通过；并发等待中取消一个请求不撤销另一个的有效等待状态。无新的持久状态或重试权限。

下一步：精确提交交唯一 desktop/macOS/shared CI/main 发布 owner `01a12bc2-907a-7702-b6dd-788225c5dfe4` 独审和下一不可变候选，保留533.1失败证据；新包安装后复验 Max、双滚动条、Kevin、行情与薪资原会话。正式 stable 保持原状态，不能把测试通过或有界停止写成目标完成。私有证据位于任务相邻 `evidence/phase16-*`。

## 第十五项 — 完整 HTTP 拒绝与旧动作保护解耦（2026-11-02）

已安装 0.5.32/532.3 仍未通过原会话验收。Max / 5b 的 leverai.net 502 是真实上游拒绝；客户端另有恢复逻辑缺陷：当前 `canRetryInference()` 把旧未知操作用于阻断新的 HTTP 推理重试，快速重试和候选切换均被禁止。真实双控制器 loopback 在旧实现复现应恢复而返回 502；修正第一处后又复现切换成功的下一 distinct 请求返回 409，证明单次接管成功不足以验收。

本项只分离原快速请求预算与旧动作防重放。transport 的内部 callback 标识当前 attempt 实际收到非成功 HTTP，错误正文完整有界读取并经过既有分类后才允许原有有限重试/合法候选。每 attempt 清除旧证明，不从日志、错误文字或 synthetic 502 推断未执行。部分 SSE、未知传输结果、错误正文缺失/超限、无法验证或未配对的历史、Stop、owner/route/后台归属/策略/deadline 撤销均不能使用该例外。原长等待、压缩和断流续接仍使用严格权限，不新增状态 owner 或持久字段。

已选备用的后续不同指纹请求经原 owner、实时候选校验和精确已选身份核对后，允许一次普通推理；不能据此重试、换新候选或重放旧指纹。已选路由的新推理与失败后的重试是不同权限，真实 SDK 的原生 returned 结果尚未投影到历史的间隙也纳入组合测试。原未知动作及已完成动作仍精确阻断，独立授权写入继续允许。备用接续提示限定未知动作及其依赖步骤，不将整个原任务永久降为只读。

配置边界纠正：磁盘旧 `modelFailover.enabled/backup` 不能证明当前运行时有可用备用；最新主干使用同档自动候选。此次不扩大候选池、不开启已关闭自动选模、不修改手动固定或跨档策略。具体原会话实际候选资格交原发布 owner 核实；没有合法备用也保留主模型原快速预算。

验证：6 文件 292 项相关回归通过，另增 2 项 Session 实际配置资格正反例通过，共 294 个不同用例；全量 TypeScript、定向 ESLint、测试分类及 diff 检查通过。三协议真实 HTTP 正例含冷 unknown、重试后合法备用、下一轮请求；负例含 transport reset、incomplete error、部分流、停止/异常历史、异步撤销、证明不跨 attempt 和不可获得长等待。真实 SDK/native Bash `--http-rejection` 及叠加 `--returned-history-gap` 均通过：4 次 502、切换 1 次、后续 5 次推理、2 次预期拒绝、测试写入 1 次、旧未知启动 0 次、unknown 保持 1，账本冷恢复通过。第一次组合测试发现 pinned 路由仍误用重试 gate，已保留失败日志并修正后复验。

本地合成供应商和临时目录未访问真实账号、未改用户原会话/凭据。原 installed 532.3 不含本项；精确提交需原 desktop owner `01a12bc2-907a-7702-b6dd-788225c5dfe4` 独审、与第十四项统一集成和下一不可变候选 CI/签名公证/安装，再验证原 Max、5b、Kevin、d29 及薪资会话的实际路径。不得将这些测试写成真实供应商稳定性或业务完成。私有证据位于任务相邻 evidence/phase15-*。

# MB-RECOVERY-INCIDENT-20261101

## 第十三项：原生成功回执不被短暂历史缺口降级（2026-11-02）

只读观察发现原双滚动条会话新增unknown的同一动作仍有原生returned/success和已归档completed记录；当前SDK选中链也有唯一成功use/result配对。现有证据不足以断言其当时具体触发路径，不能据此清除历史unknown。

合成复现确认一条缺陷路径：原生工具成功已持久化，但下一推理暂时只含同tool_use、尚未投影tool_result时，prearm将它再次标记legacy unknown。live及cold两项在旧实现失败，且不执行真实命令或访问网络。修复仅从本次分析候选移除精确toolUseId/actionHash都已有原生returned、且任何既有不确定集合均无该key的项目；原始请求、成功记录、防重放和旧unknown完全保留。不同ID、变更参数、矛盾错误结果及已有legacy四反例仍受保护。四文件141项相关策略/原生journal/HTTP回归通过，全量tsc和定向lint通过。 独立审查精确7c3fe1f09后，正式吸收审查者的失败Bash live/cold两项测试，补未完成同动作的另一attempt与仅退休身份两反例；最终scoped/attempt/journal三文件74项通过，tsc/lint/diff通过，产品逻辑未再改动。独立隔离测试不能替代实际SessionStore/原生会话复验。

进一步验收补证：`context-checkpoint.integration.test.ts` 新增成功和已知Bash退出两种结果的真实SessionStore写盘、完整模块重载与历史缺口注入；全文件11项通过。首次fixture因只创建未发布V2 birth而在重载后失去owner，409是正确的存储拒绝；补真实首条消息并断言重载owner后通过，未因此修改产品逻辑。

`node --import tsx scripts/verify-operation-scoped-recovery-loopback.ts --returned-history-gap` 使用实际SDK和原生Bash、本地合成模型，在确认原生成功结果已保存后只对一次传输投影删除该result；5次本地推理、2次应有拒绝、后续测试操作执行1次、旧未知操作执行0次，unknown维持1，账本重新加载通过。默认不注入模式也通过。SDK配置用独立`CLAUDE_CONFIG_DIR`，接口已核对本地0.3.296类型及[官方SDK参考](https://code.claude.com/docs/en/agent-sdk/typescript)、[环境变量说明](https://code.claude.com/docs/en/env-vars)。本测试不使用真实远端SSH、供应商付费推理或生产Store，也不替代签名客户端和四原会话验收；缺口是明确的故障注入，不能反推原5b事故的实际时序。

第十二项e9f60a已交原owner、独审181项通过，并冻结独立532.2候选fcd96c5c/PR226/CI41325876238；此新增项不改写冻结制品或把其CI算作本项通过。待精确提交独审后由同owner安排下一未冻结批。现用532.1仍未通过四原会话最终验收，本项也不宣称恢复已有4条unknown或解决供应商429。

## 最新状态：第十二项（2026-11-02）

第十一项 ca7ac7e 已由原 desktop owner 经 PR224 集成到 main `ad68c28d3408b9e21705837c08acd8af383de75a`，0.5.32/532.1 经 CI、签名、公证及备份安装。原生评审回执在三条原会话确实 committed，说明大账本截断修复已到运行版本；但四会话整体仍未通过。安装制品 SHA-256 为 `bfd9d45223301063fab3dd6c7d5093a194955e70a0ec3e7fa65a19bb2ef0dcc9`，正式 stable 通道保持 HOLD。

行情会话实际出现有效回执后的无效 accept 自动纠错至19轮，reworks=0/noProgress=0。原任务有5个验收条件，模型仅提交1项并混用 Bash 或最后修改之前的 Read；拒绝验收正确，无界纠错和缺少具体反馈是缺陷。第十二项沿既有 reworks 对完整终态中的无效 accept 计数，最多三次；列出全部条件和失效证据。纯规则与原生资格投影复用，成功证明、Stop、未知结果及人工同任务续接边界保留。新增4个旧实现失败复现；另补持久化冷重启/原生代次变化，纠正旧测试 CLI 单引号未转义造成其仅触发回执失败的问题，现明确先断言 committedBy 再验证失效证据。

双滚动条首次失败来自代理连接建立的 UND_ERR_CONNECT_TIMEOUT；后次评审已提交，再遇供应商429，不能把后者当成请求未发送。连接恢复仅针对原生 connector 的 ConnectTimeoutError，沿当前 attempt 许可和 fetch 取消信号最多重建连接两次，保留同连接池、原HTTP/推理/工具保护。直接使用缓存 RetryAgent 的原型在取消后仍建立连接，已拒用；最终逐请求计时器在取消后不再连接。实际 loopback 包括 ProxyAgent CONNECT/TLS 停滞、2连接仅1HTTP、已发送/部分流不重试、HTTP429/502/503不误判、重定向拒绝及旧unknown账本不变/SDK重复仍409。当前429处理规则不变，不宣称消除上游限流。

Kevin本轮被分类为控制核查，尚未证明原 execution 恢复；薪资核查的当前 execution 已按具体阻断暂停，不能冒称更早被替换的原 execution 已恢复。本轮未修改原会话账本、手动改ID、重放未知操作、变更生产代理或执行旧业务对外发布。新源码需精确独审/主干/新不可变制品及原会话复验，仍由唯一 owner `01a12bc2-907a-7702-b6dd-788225c5dfe4` 完成。

## 当前结论

0.5.28/528.1 的真实会话仍失败，不能以此前 CI、本地 fixture 或安装成功认定稳定性已恢复。第一提交交付两项有失败复现的源码修复；后续增量如下，原会话恢复、网络和意图识别问题尚未全部解决。

基线 main `e11ee39b5629d6e74810b75e2155a45400d45005`；已安装包所对应的 release source `9be7cc78a0ecf336d144ae429d4cb7bb4bebcfff`。源码、当前安装包、公共稳定通道是三个状态。负责人当前确认 0.5.28 晋级暂停，正式通道仍 0.5.27。

## 修复与回归

1. Chat 中恢复横幅和操作核查组件同为 sessionId key，切换会话后出现遗留 DOM。抽取原组件组合 SessionRecoveryPanels，使用组件类型加 sessionId 区分身份；保留核查的禁用条件、自动检查 revision、错误内容、原回调和布局顺序。8 次会话切换、错误显隐、卸载和迟到的继续请求回执均验证只保留当前入口。相同 key 基线 2 个测试失败，修复后组件组 22 项通过。
2. protectInference 在已有请求活跃时，拒绝第二个推理的恢复预备，却经通用 stop 同时封锁主 scope。为这一发生在归档、账本写入和 upstream execute 之前的并发拒绝设独立内部错误类型，仅返回该请求 409；原 fingerprint 仍保留，不增加请求重试或工具执行权限。两种 fixture（干净历史/旧未知操作）修复前都在后续主请求得到 409，修复后主请求可继续；旧辅助请求、已完成请求和旧未知操作不能重放。第三项验证实际流失败后主 scope 仍封锁。已坏账本、失去 owner、持久化失败等仍使用原关闭路径。

本次没有让被拒绝的辅助请求自动重试，也没有使缺少结果的旧操作变为成功。若辅助请求自身承担必要工作，仍需原有任务层处理其失败。

## 四个原会话证据

只读快照置于开发任务相邻的私有 evidence 目录，manifest 含文件摘要，原始消息及账本不进入 Git。四个 ledger 与 product/native transcript 均保全，未修改运行数据。

| 会话 | 已核实链路 | 未结事项 |
| --- | --- | --- |
| 双滚动条 | 原生 Bash 三次 INTENT_UNCONFIRMED；随后 WebFetch 辅助推理返回 exclusive recovery authority 409；另一 WebFetch 完成后主推理被 blocked_exact_scope 拦截 | 并发错误扩大问题已有独立复现；线上当时的独占检查含多个分支，不能仅凭通用文案断定都由并发引发。意图失败原因仍未知；2 个未知操作未核销 |
| 行情分析 | Responses 约 302 秒无模型进展，由 idle deadline 中止；后续推理 blocked_exact_scope；界面显示首个协议校验失败 | 原始 upstream frames 未保留，不能认定供应商返回了坏协议；1 个旧未知操作保留 |
| 微信 kevin | proxy 路由、response_headers 阶段，UND_ERR_CONNECT_TIMEOUT，约 10066ms，requestHeadersStarted=false、requestBodySent=false、responseHeadersReceived=false、bytesDelivered=0；bridge 映射 502 | 不等于供应商实际返回 HTTP502；网络连接路径仍需独立验证；5 个旧未知操作保留 |
| 考勤薪资 | 多个重复横幅，16 个旧未知操作；核查无法证明执行结果 | 横幅修复不代表这 16 个操作已经完成或可安全重放 |

旧历史核查报告仅证明 physical native records，未证明 selected chain，不作为清除保护或重放的依据。历史真实复测报告 MB-HISTORY-RETEST-20261031 的 0/3 完成交付仍为失败证据。

INTENT_UNCONFIRMED：当前 classifier 包含 8 秒 utility 时限、JSON/schema 和 continuationOf/steps 校验，多种失败都落为 undefined。现有证据不足以区分超时、不可用模型或返回无效结构；本次没有猜测用户意图、放宽写入门禁或增大重试预算。

## 验证状态

- 134 项 context recovery 单元测试通过（四文件），覆盖操作隔离、原生错误、请求生命周期中的既有保护与新增 3 项并发用例。
- 27 项 context recovery 隔离集成测试通过；无真实供应商调用、无业务重放。
- 22 项恢复组件 DOM 测试通过。
- 全量 TypeScript、定向 ESLint、测试分类、git diff --check 通过。ESLint 仅输出 baseline-browser-mapping 数据过期提示，不是 lint failure。
- 源码自审发现抽取中遗漏的 review disabled / inspectRevision 属性，已在最终改动恢复原值并重跑相关验证。
- 未进行原生安装/页面操作/会话执行：既有部署会话有用户停止原生 UI 的指令。本次未重启 App、未删除会话、未清账本。

## 集成与后续验收

Desktop/macOS-arm64/updater/sharedCI/main 唯一负责会话 `01a12bc2-907a-7702-b6dd-788225c5dfe4`。本开发分支仅提交推送，交该 owner 独立审阅、正常 CI/main 与下批版本分配。codex 分支推送未匹配共享测试 main/dev 或正式发布触发条件；不创建 PR、不运行共享 CI、不生成正式制品。

下一步：先审阅并集成这两项确定修复；保持 0.5.28 晋级暂停。待允许原生验收时，在原会话切换至少 8 次确认横幅不累积，验证并发辅助调用失败不再封锁独立后续推理，再逐项核查原操作结果。分别验证意图识别、代理连接与 idle/协议错误；四会话真实路径交付前，不将整个稳定性任务标为完成。当前无本任务新版本、制品摘要或发布批次。


## 第二批增量：Responses 推理进展与意图失败证据

用户本轮继续要求彻底解决，并明确答复“解除暂停，由原发布负责人安装并验证”。此授权已转交唯一 desktop owner；旧原生暂停不再作为阻断。原结果未知操作仍先核查，不能自动清账本或重复业务。

### 协议缺陷及修复

`KNOWN_RESPONSES_EVENTS` 漏掉官方 `response.reasoning_summary_part.added/done` 和 `response.reasoning_text.delta/done`；合法事件会把 interruption cause 记为 unproven/protocol_validation，盖过后续真正的 socket/idle 原因。translator 也忽略 reasoning_text delta，不能更新 model-progress，可能在持续推理输出时误判 idle。

新增明确事件类型、合法 metadata 校验、reasoning text 到 thinking/progress 的翻译；仅非空、结构有效的 delta 计为模型进展。非法索引、错误 delta/part 类型仍错误终止，空 metadata 不延长停滞期限；未知事件仍保持不可信。没有扩大重试次数、时间、工具许可或改变历史账本。

真实 loopback HTTP 流通过 bridge + ContextRecovery + ModelFailover 的 fixture 在旧代码失败：合法 reasoning 后真实 socket 中断不能生成既有 settled receipt。修后同一 fixture 通过，且 eof/transport 可识别，authentication、ping-only、half-frame 仍不能恢复。原线上失败没有保存原始 frames，本修复不能反向证明行情会话一定走了此分支。

官方核对（2026-11-01）：https://developers.openai.com/api/reference/resources/responses/streaming-events 。本代码仅适配上述事件，没有整体声称支持所有 Responses 工具/事件。

### 意图识别诊断

沿既有 tool-free utility → classifier → executionAdmission → 状态详情的数据流添加固定枚举原因，区分 timeout/cancelled/unavailable/transport/empty_response/invalid_json/invalid_schema/missing_continuation/missing_steps。只保存枚举，不保存 prompt、模型原文、endpoint 或密钥；旧记录仍显示原通用说明。8 秒时限不变，超时后迟到的返回不会成为有效意图。

诊断不作为权限：没有有效 intent 时仍为 INTENT_UNCONFIRMED，写入/派生任务保持拒绝，Read 仍可核查。添加实际 SessionStore 落盘 timeout 原因与写入拒绝的集成测试，以及展开详情显示准确原因的 DOM 测试。这是补足下一次原生失败的证据，不冒充已经修复识别模型的所有失败。

### 当前网络实测

2026-11-01 00:28（Asia/Shanghai），OpenRouter 公共 models API，无凭据/无推理：当前应用配置未显式代理的路径 3/3 HTTP200，既有 HTTP proxy 3/3 HTTP200。约 80–1228ms。结果保存在私有 network-current.json；未改代理配置。只能说明当前连通，不能证明之前 CONNECT_TIMEOUT 已根除，更不能代替推理和业务实测。

### 验证与发布门

本增量：16 Responses 语义单元 + 28 recovery HTTP 集成 + 2 buffered-progress 集成 = 46；66 session-execution 集成；17 状态详情 DOM，共 129 项定向测试。类型、定向 lint、分类和 diff 检查分别留有日志。此前44fd167由原owner独立复核2 DOM/68单元通过，现有联合CI运行中。

交付本增量精确SHA后由原owner重核最终候选，正式晋级仍须原四会话可继续及相关工作交付。无本开发线程新版本号、制品、tag或安装动作。尚不可宣称稳定性全部解决；下一步根据新包原生结果继续修复，而非清除未知证据。


## 第三批：按用户明确要求取消任务总时限

用户否决“恢复任务，再授权30分钟”的方案，明确要求去掉30分钟总限制。本次因此不新增续期动作/预算窗口/endpoint，不要求定期人工点击续期。原模型请求超时、工具权限和防重放不在取消范围内。

取消 SessionExecution 在父/子推理准入、工具门、任务包注册与派发、自动续跑、完成验收中的总时长比较。保留原deadlineAt序列化字段和旧写入格式以免破坏已有记录/旧版本reader；当前代码不会使用这个历史字段限制任务。旧记录不被离线重写，因deadline_exceeded停止的任务通过新的可信人工继续回到原execution，保留身份、原请求、任务步骤、已完成证据和操作保护。Stop、无进展/返工封顶、未知写入、错误owner、依赖/资源冲突继续拒绝。

特别区分：此前‘手动继续与一键继续’入场路径不同，不能把全部截图409归因于过期。本次取消时间门解决已确认的task-level time expiry；不授权一键继续改写其他执行限制，也不宣称四个会话已经真实恢复。

验证包括旧期限过去一天后真实owner自动派发下一步、旧超时任务同ID人工继续、active native child跨期限继续且Stop仍撤销；另有原资源/依赖/未知写入回归。网络单请求超时和模型重试仍独立覆盖。构建版本、安装和四会话业务验收由原desktop owner统一执行。

第三批最终验证：202项通过（任务策略/派发单元、Session执行/派发/编排集成、模型failover单元、真实HTTP请求超时集成），全量类型、定向lint、测试分类、diff检查通过。3个时间边界行为测试在7b7d0db原实现均失败，修后均通过，保留no-deadline-baseline.log。取消的是运行策略；兼容序列化字段仍存在，回滚到旧二进制会恢复旧版本的时间规则，不能当作当前规则继续验收。


## 第四批：一键继续接回原执行账本

真实 builtin 队列 fixture 加入已有 execution、taskPlanId、成功证据与可信人工输入后，d544 旧实现四项失败（interrupted/error × 单击/双击）：新输入已经进入 SDK，原 execution 仍停留旧 queue、turns=1。此前无执行账本的 transcript 测试未覆盖这一缺陷。证据为私有 continuation-owner-baseline.log，迟到完成两项仍正确拒绝。

移除 continueFromTurnId 对执行准入的跳过；继续复用已有 tool-free 意图判定和可信用户原文，不新增执行权限。continuation guard 捕获原 generation，随后组合新 execution guard/queue，保留两套检查、取消和同步提交边界；不再覆盖执行 guard。继续消息在同步提交后才成为新可见 root，避免自己的新消息反过来让旧 turn 校验失效。准备阶段旧 turn 变化则释放 execution admission。原 execution 的 ID、目标、清单和证据由已有同任务接续逻辑维护；停止、权限、无进展/返工、未知写入仍保留。

新增6个原生队列场景，与已有6项共同验证同ID/新queue、原taskPlanId和证据、双击只有一个SDK输入、迟到完成不进入SDK。原四文件422项回归和全量tsc通过；再补队列占位归属/旧turn变更及执行保护拒绝的2项单元。此为隔离原生队列集成，非真实Provider或原业务通过。意图模型本身仍可能超时/失败，应使用第二批诊断继续复测，不把本增量当作所有调用故障已消除。


## 第五批：已知 Bash 失败的两个 owner 状态同步

行情原会话的一条 Bash 仅做本地 JSON 读取和排序，但因 str/None 混排返回原生 exit 1；旧 execution 将所有 Bash failure 当作仍 pending。只读核验进一步确认：ContextRecovery 已有同 session/sdk/queue/toolUseId/actionHash 的 bash-exited 原生回执，operation attempt 为 returned/bash-exit；SDK 当前选中链包含唯一 use/result，完整 name/input/output 摘要与 execution fact 一致。原始数据和未知操作记录未修改，证据保存在私有 market-selected-native-chain.json、market-paired-receipt-check.json。

新失败 hook 先等原操作 owner 耐久提交，再把其严格 bash-exit 结论传给 execution；不根据任意错误文本自行判断。历史修复复用原 Session mutation 锁与 SDK 当前选中链核对，跨 IO/CAS 检查 owner、execution 和账本摘要；仅将匹配的 failed fact.pending 改 false、记录 native-bash-exit，successful 仍 false。若原暂停仅源于这些已结清事实，则保留暂停阶段并更正为 turn_error，交新的可信人工继续准入决定后续；不自动续跑。不改 ContextRecovery 账本，其精确旧命令重放保护保持有效。

2个正例在撤掉执行 owner 的新同步行为后均失败，修后通过；该基线保留新测试/API脚手架，复现的是旧 owner 行为，并非声称完整 checkout 23620fba。7个负例覆盖中断、参数/结果变化、重复结果、foreign history、owner变化、账本变化；都保留 unknown。任意Write/MCP失败不适用进程退出回执。

最终相关验证：195项builtin队列/生命周期集成、66项原生错误/operation journal/作用域单元、76项执行集成、142项adapter/facade单元，共479项通过。一次fixture在prearm阶段检查投影后防重复断言不当，已按原controller既有两阶段合同纠正并重跑整个76项执行文件；产品未为该断言修改保护逻辑。全量tsc、定向lint、依赖检查通过（0 errors，18条既有orphan warnings）；分类与diff单独记录。官方SDK hooks核对：https://code.claude.com/docs/en/agent-sdk/hooks；实际API边界以已安装sdk.d.ts与原controller为准。

这批不修改无进展次数规则；Kevin仍需新包实测与分类/网络原因复核。原会话整体业务验收尚未通过，不声明稳定性已全部解决。


## 第六批：自动防空转不再永久拒绝新的人工继续

Kevin 原会话 noProgress=2、reason=no_progress_limit_reached，旧 humanContinuationBlock 在核对其他状态之前直接拒绝所有同任务人工继续。删除任务30分钟总期限并不能解决这个独立阻断。四个隔离测试在修改前全部失败，包含两类封顶后的继续和本轮真实证据验收。

新的可信人工输入仍须原持久化 input proof、准确 continuationOf、上一轮真实终态、原 queue/transcript 同步提交和当前权限/Stop/后台/未知操作检查。仅取消人工准入对自动计数封顶的拒绝，保留原 execution/清单/证据和计数；自动 canContinueSessionExecution 限制完全不变。新的人工回合没有进展则再停止；返工已封顶但未获真实验收也落入 incomplete，不允许自动重试。不能凭模型文字、重复 request ID 或改成新会话获得这一权限。

本轮78项执行集成、163项共享策略/架构边界/facade单元、24项builtin提交边界测试（其余183未运行）共265项通过；全量tsc、定向lint、test classification、diff检查通过。记录见相邻私有 human-continuation-exhaustion-* 日志。已有未知写入/unknown delegation 两个拒绝测试同时设置两类计数封顶，仍然拒绝；Stop、迟到变更、重复请求、双击和 transcript 保护沿既有回归验证。四个旧实现失败正例修复后通过。builtin SDK 隔离队列增加12个封顶情况下的成功/双击/迟到完成场景，保留旧任务身份、步骤与证据。实际Provider及Kevin原会话仍须新包安装复验。

第五批全量 CI 暴露 builtin 模块反向依赖 SessionEngine，原发布负责人以655514deb37b4e0c9e5e2c5bbc5a077318a81fb5修正：依赖由原 facade 注入，原架构边界测试保留；本分支快进采用该已提交联合候选后开发本增量，未自行分配版本或触发共享CI。

## 第七批：安装后意图识别超时与明确续接

0.5.29/529.1 已由唯一 desktop owner 安装，二进制与已签名公证候选匹配。双滚动条原会话在安装后的首次正常继续中仍出现 `INTENT_UNCONFIRMED / timeout`；同一新 queue 的 SDK 只读核查结束，写入未获准，原 execution 未续接。其余三个样本因用户正在切换原生界面尚未尝试。此结果为真实验收失败，不能被此前 CI 或 SDK success 替代。

根因之一是明确的产品续接也要重新调用模型分类，且 required intent JSON 被 optional suggestion 的 8 秒上限截断。修复分两部分：
- 只有固定一键续接、有效停止轮次、根消息真人请求 ID 与原 execution 请求 ID 精确匹配、无新增图片/mentions/上下文时，由 continuation owner 捕获原意图，交同一执行 owner 继续。缺证/不同任务/变更正文继续分类；原任务、步骤、证据、计数和权限不重置。
- 普通意图识别单次预算 60 秒，默认可选建议仍 8 秒；预算包含 transport 初始化，取消可中止初始化等待和网络等待。订阅/托管 SDK 的内层计时器得到相同预算，不被旧 30 秒默认值截断。

非实现者（原 desktop owner）审阅指出旧执行关联、SDK 内层预算及初始化取消三项，已补反例与修复。旧实现 12 个真实 builtin commit 边界用例在分类器不可用时失败，另一个 12 秒才返回的意图响应也失败。新回归包含不同任务根消息、legacy root、queryPrimaryContext、双击、迟到完成、无进展/返工封顶、初始化超时/取消、SDK 35 秒响应及默认短预算；全部为合成数据，不写原会话。

代码/隔离回归完成后由唯一 desktop owner 统一独审、主干、CI、分配新的不可变候选、安装与四原会话复验。本增量不能覆盖或复用 529.1 已冻结制品。系统真实稳定性与旧业务产物结果分别记录；最终实测尚未通过。

最终定向验证：294 个执行/分类/utility/准入测试及 31 个 builtin 真实队列/计时器用例，共 325 个不重复 case 通过；此前完整 builtin 文件211项通过后，仅针对审查新增的3项及受影响准入/计时器路径重跑31项。全量 TypeScript、定向 ESLint、test classification、git diff --check 通过。原数据未写，真实 Provider 原会话验收待下一候选。

## 第八项：实装后的任务查询重复误拦截

530.1 经 PR222/main2ff069ae、两轮全通过CI、签名公证及原owner备份安装，实际程序摘要与冻结18cbda52候选一致；三个心跳运行态恢复。原薪资和行情会话均沿用原execution成功准入并获得真实工具结果。行情新一轮的直接产品CLI `session tasks --json` 却因同actionHash历史成功被永久拒绝；后续Read旧回执不构成查询刷新成功，正式通道保持HOLD。

复现用合成native流/原journal先成功查询revision1，再请求相同参数的全新toolUseId，旧实现返回automatic_replay_blocked。修复仅对严格直接产品CLI list查询解除“已有成功”拦截；不加入广义只读白名单，live/blocked/unknown/native-error仍优先，每轮仍durable reserve/commit。写入数据、任意同名路径、Shell组合/重定向、后台运行和未知options均不适用；旧toolUseId仍禁止重复。旧unknown账本和历史成功证据不清除。

213相关单元与隔离集成通过，含冷恢复、未知查询、Stop、存储失败、写命令与伪装路径反例；全量tsc、定向lint、classification、diff通过。需要原desktop owner独审、合入和下一不可变包真实复验，不能宣称已安装530.1包含第八项。本线程未发送原业务命令或修改原数据。


## 第九项：530.1 四原会话实测后的补修

四例真实尝试未全部通过，不能晋级公开稳定版。双滚动条原生 TaskList 仍被已成功hash误拦截，故将第八项严格刷新例外扩展至既有原生 TaskList/TaskGet 查询形状；namespaced MCP、额外参数、写入、未知结果、旧tool ID均不豁免。两项真实形态冷恢复回归旧实现FAIL，新实现通过。

薪资主Agent把评审CLI包在Python或管道中，只读success后将pending提案当完成；严格原生回执未确认，系统反复给泛化的未完成提醒。保持回执提交规则，新增直接CLI/完整JSON指引，并从原ledger识别上轮未确认提案，在下轮明确提示重新提交当前queue评审而不重做业务。三项包装/管道/缺回执测试旧实现FAIL；正确重提交后可按原needs_user终态停止。Kevin出现根据历史整段封锁文字自行停工，未出现新的工具拒绝；新增实际独立只读核查指引，仍不允许改参数重放未知操作。指引效果仍须新包真实验证。

双滚动条12:56原调用记录empty_response但未记录usage，不能倒推其精确响应。隔离工具外探针使用同原4条上下文、原execution与同已配置分类模型，复现HTTP200/stop_reason=max_tokens，1024输出token全部为thinking，无text。相同上下文4096预算对照HTTP200/end_turn，1136输出token含862thinking，最终506字符有效JSON；不写原会话、不执行工具、不修改Provider设置。公开源码只保留摘要，真实上下文不入Git。官方语义参考：https://openrouter.ai/docs/guides/best-practices/reasoning-tokens （推理计入输出预算）。

required intent经RuntimeTextUtilityTask向builtin传4096输出预算，transport不再把显式预算钳至1536；默认建议1024、tier分类2048保留，上限4096且请求60秒/取消不变。max_tokens终态返回有界output_limit诊断，不泄露原始响应、不自动retry、不接受截断JSON。所有未知操作保护和执行schema/continuation身份核对保留。仅增加预算不能保证供应商永不失败；必须验证实际恢复与准确失败表现。

联合验证和非实现者审查完成后交原desktop owner选择下一不可变候选；530.1不含第八/九项，原四会话系统验收仍未通过。旧业务发布和对外消息不是本轮探针范围。

第九项最终联合回归：9个文件446项通过（原生队列/执行/作用域/传输/系统指引）；全量tsc、定向lint、分类与diff通过。新增transport测试首次有mock构造问题，修正fixture后纳入完整回归，不将该错误计为产品旧行为失败。第九项已有原生查询2项与评审回执3项旧实现失败证据，空响应依据上述真实Provider对照。订阅/托管SDK不受此次直接transport输出预算修复覆盖，其既有预算路径未作新的生产声明。


## 第十项：评审包装不能伪造自动续接进展

530.1薪资原会话在未确认评审回执时已自动续接28轮；原owner通过一次有效原生Stop将同execution暂停，保留任务/证据/未知保护。第九项虽修指引，仍不足以在模型不遵循时阻止空转：包装后的Bash成功事实随queue/提案ID变化，被原progressDigest视为新进展。

最终采用独立的连续评审回执失败计数reviewReceiptFailures，仅依据原ledger当前queue的真实提案是否已committed。连续3个完成轮次仍未确认时停止自动续接，保留所有真实业务facts和原noProgress；不是任务总时限或“业务没有进展”。正确回执或后续无失败提案轮次清连续计数，重复/迟到terminal不重复计数。Stop和未知操作保护优先。人工继续仍沿原execution，计数保留到实际正常提交。

终态使用旧包已支持的incomplete/turn_error，新增可选计数独立持久化；新UI明确显示“评审结果连续未确认，已停止自动续接；任务进度已保留”。旧reader继续读写原账本与已支持的人工恢复原因，不需要清数据。单测覆盖旧无字段记录、JSON恢复、重复terminal和成功/无失败提案后的清零，集成读取原SessionStore持久化索引。

原owner先发现a8a整轮稳定digest误伤真实Write，再指出0a31凭唯一pending Shell无法证明提案来源；两版均在打包前拦下，最终移除工具归因及改写业务进展规则。最终验证覆盖纯包装循环、真实Write进展保留且停于明确的评审故障、人工同任务恢复并提交有效回执、并发/非Shell/未返回工具仍未知保护、UI精确原因。此前第九项1757d67的446项联合回归及owner118项独立验证仍有效；最终增量交同一owner独审/新包/原会话验收。

最终增量本地验证：87执行集成+11共享策略+18 DOM共116项通过，全量tsc、定向lint、diff通过；测试日志review-receipt-budget-final2.log及配套类型/lint日志保存在私有evidence。最终源码还需原owner精确独审/候选CI/安装/原会话验收。

## 第十一项：531.1 真实验收后的回执截断与长任务误停止

531.1 已经 PR223/main0d0ad99f、精确 CI、签名公证及本机安装，实际运行字节与归档一致。原会话再次执行仍发现缺陷，公开稳定通道继续 HOLD，不能将安装成功或只读 query 完成当作原执行验收。

行情三次直接评审命令均返回完整增长账本在前、回执在尾。原生输出约32KiB截断，回执只能从结果文件另读，不能提交原根工具评审；连续失败计数3正确阻止了空转，但回执协议本身仍失败。现于既有命令响应边界只返回小型确认回执/修订号，保留原持久化、根工具身份与终态验收，list仍提供完整快照。生成大账本的两个route回归旧实现输出约605KB；实际route→原生截断→SessionStore确认回归旧实现失败。修复后还覆盖task review实际原生确认路径，不采用复制回执或读取文件来放宽证明。

另一个原执行运行约32分钟、完成71个工具操作后，原生压缩成功但下一推理立即409。源码发现 ModelFailoverController 仍把隐式30分钟预算绑定整个root。改为单次推理/重试/切换链预算，正常推进的新请求可跨30分钟继续；旧指纹、未知操作、Stop和显式父deadline单调收紧均保留。旧实现新请求在33分钟返回409已复现；新实现通过同root多次推理与真实loopback HTTP/ContextRecovery联合验证。

只读核对被分类为control时没有收到历史错误纠正，模型虽成功调用TaskList仍错误声称整段会话封锁。给已有执行的只读跟进补充当前边界提示，不新建执行、不恢复写权限、不将旧错误当当前状态。指引效果仍待真实模型复验。一次只读核对被分类为新execute，属于不同验收请求，不能宣称原execution恢复；原记录保留且不手改ID。

本批5文件235项联合回归通过，全量TypeScript、定向ESLint、测试分类通过；原输出、未知操作快照和失败日志仅在私有evidence，未复制真实业务内容进Git。由原desktop owner独审、集成、分配下一不可变包并重新验证四原会话；531.1原生验收仍未通过。

## Phase14：真实大账本验收查询与只读复测范围（2026-11-02）

532.3 的原行情执行真实推进了三轮，但每轮在最终 Read 后又用 Shell 重定向/Python 过滤完整任务账本，导致修改顺序门拒绝全部旧证据，最终 rework_limit_reached。该停止正确且有界，但不等于原任务验收通过。新增可选 list/view=execution，只投影原生工具资格与最后可能修改操作，20条分页、24 KiB预算；默认list兼容，复用结算规则，既不修改账本也不授予重放。精确当前代次/成功/修改顺序条件保持。

此前复测人为加入“本轮只读”，收窄了部分续接请求；Kevin原执行未推进不能单独归因于恢复缺陷。执行提醒现明确授权范围内必要修改可继续，历史核对不能成为永久禁写；显式只读control本轮仍不授予写权限。隔离测试覆盖先只读核对、再明确续接原任务后Write/Bash获准且原execution不变。

新增用户截图Max：日志确认先上游429，换路由后成功一次Glob，下一推理返回上游502；原生恢复核对已核销11条明确pre-tool-denied，仍有1条未知保护。行情未知记录新增1条，旧成功execution_review同时出现在completed/legacyUncertain；首次误标链尚未证明，未清理或放宽历史保护。此问题与供应商失败仍需独立验证，不能称整体稳定。

验证：旧实现3项查询/识别失败复现；6文件236项当前相关回归通过。全量tsc、定向ESLint、分类和diff检查PASS；发布独审待完成；安装仍532.3，本批源码尚未安装，原会话最终验收未完成。私有原始证据位于本任务相邻evidence目录，不进入Git。
