# MB-RECOVERY-UX-20261102

用户批准中断恢复交互方案，当前交付源码与本地验证；主干、统一候选、正式制品及原会话实装验收分别追踪。

## 范围与行为

- 默认紧凑卡片展示系统检查状态，正常会话无恢复入口，不再自动展开内部记录和“0条核对记录”。
- 自动检查每次空闲修订。可核实的仅查询/明确拒绝未执行，由现有带签名的恢复入口和 Session mutation owner 串行保存依据。记录本身不是业务成功，也不会执行命令或向模型发送任务。
- 只有未知记录才留待处理；同一会话仍可交流，通过既有操作级围栏推进独立工作。无效 owner、繁忙/后台/Stop、SDK identity、摘要/CAS、持久化门禁不变。
- 原生记录存在时显示实际类型与文件 basename；原始命令、任意 description、消息正文、URL、环境变量、完整文件路径不投影。记录缺失/重复时明确无法展示，不从模型文本或用户说明推断执行事实。
- 详情为单一可滚动侧栏，窄窗占满宽度，支持 Escape、焦点圈与关闭后返回。关闭不取消自动检查，不删除或跳过底层任务。
- “补充结果或请 Bot 查询”准备未发送的原会话草稿，追加已有输入，保留 checkpoint 锁；实际结果进一步由原任务与既有工具 owner 判定。没有“我确认完成”解锁或通用“重新执行”按钮。
- 继续执行整合进状态卡，保持原组件身份，检查/展示切换不重置已接纳标记。自动检查不会将用户 Stop 转成自动续跑；已有任务自动接续仍由原 execution owner 裁决。

## 验证

- `node@24 vitest run --project dom ... --project unit ...`：9文件159项通过。覆盖自动串行结算、摘要前进、未知保留、无进展停止、丢失响应回读、SDK authority变化、busy/session/unmount/StrictMode、详情关闭、消息草稿回调、焦点、继续入口保持身份，以及原操作级/冷恢复保护。
- `node@24 vitest run --project integration src/server/openai-bridge/context-recovery.integration.test.ts`：28项通过。
- `tsc --noEmit`、变更文件ESLint `--max-warnings=0`、`scripts/check-test-classification.mjs`、`git diff --check`：通过。
- 本地 `vite build`：通过。既有大chunk提示不是正式构建/发行验收。
- Codex IAB：真实产品组件 + 合成 snapshot/回执；1280桌面与390×844，浅/深色主题，未知保留、全部eligible自动完成、详情/关闭、草稿准备通过。截图在 `evidence/`。没有真实Provider调用、原会话业务写入或日常App替换。

## To Do

- [x] 代码实现与作者整审。
- [x] 模拟回归、原保护机制和实际组件浏览器检查。
- [ ] 非实现者审阅：交现有唯一桌面owner。
- [ ] 远端main与精确候选CI：交现有唯一桌面owner。
- [ ] 不可变正式包/版本/tag/摘要/回滚目标与安全窗口安装。
- [ ] 原会话真实恢复/补充/查询及结果持久化验收。

## 部署与接续

部署单元 desktop builtin client/macOS-arm64/updater；唯一 sharedCI/main/版本/构建/部署/回滚 owner `01a12bc2-907a-7702-b6dd-788225c5dfe4`，用户当前AGENTS与主干共享计划授权。请求下一未冻结批；开发分支push不触发共享CI，PR/main由原owner协调。无其他部署单元/数据迁移/新公网端点。新增字段可选，旧前端忽略；回滚继续读取原账本并保留原防重放语义。

执行为当前主Agent串行实施与验收，没有新增执行者/模型或第二发布负责人；token与费用未测量。初次验证新增展示字段引起一处原快照断言失败，已更新准确预期；补充TypeScript/ESLint问题已修复。自查发现继续入口动态挂载问题，修复并追加回归。完整最终记录以Git源码及验证为准，截图均为合成数据。


## 完整流程补齐（用户要求“把它做完”）

源码沿原任务分支续接，先合入最新main82dffd887，保留原导航修改。当前实现补齐以下产品行为，第一阶段187项不是本轮最终测试数：

| 场景 | 实际行为与边界 |
| --- | --- |
| 中断前调用已成功、产品回执遗失 | 读取真实SDK选中链与原生原始记录，校验每个同输入调用的唯一use/result、父链、source UUID、归属及结果；仅成功的Write/Edit/前台Bash可形成耐久完成证明。所有未配对peer/较新reservation/后台launch/错误回执保留保护。 |
| 写文件结果未知 | 只读比对原工作区内原Write目标的实际完整字节（2MiB上限）；区分一致、不同、缺失、变化、不可读、超工作区。文件一致仅证明现状，不冒充原调用成功。 |
| 外部系统操作结果未知 | 不执行原shell/HTTP/MCP/发送动作。原任务可自动进行一次有界只读核查，使用现有已授权的读取能力；能力/账号/原回执不足时给出具体缺口，并提供补充/原会话查询入口。没有通用业务凭据或任意外部重试接口。 |
| 用户补充/延后 | 在原SessionTaskLedger经CAS持久化，绑定SDK/session/action与requestId。重启可读，丢响应回读同ID，冲突/过期/容量拒绝。用户补充与系统证据分开，延后不完成步骤或清围栏。 |
| 相互依赖的步骤 | 只按精确tool binding归组，遍历blockedBy展示依赖；缺失关联明确保留，不按标题/模型文本猜测。 |
| 独立工作 | 原有独立运行任务保持原owner；自动核查允许继续预先登记、依赖已验收且实际规范化资源不冲突的后台任务包。未知根操作保留只读资源reservation，未知范围锁定整个工作区；路径别名、越界、前置未验收和改包绕过均拒绝。 |
| 检查完成后的续接 | 耐久完成证明仅同步原execution的精确pending fact，保留原ID/计数/清单及操作防重复。全部相关未知消除后由原SessionExecution owner沿原queue续接；Stop、未结算root、delegation、权限、预算及最终真实验收不放宽。 |
| 状态一致性 | 状态卡与底部任务条共享同一session UI投影；恢复事项作为当前主状态，任务验收与技术详情保留原owner。正常会话安静，已处理明细可折叠查看。 |

### 本轮验证

- unit/dom：218项通过，含补充表单、保存失败保留草稿、延后、自动investigate准入、底部原任务与会话状态回归。
- SessionExecution/真实SessionStore/文件检查：106项通过，含保留原任务身份、Stop/空转/跨scope/幂等/冷恢复、精确完成同步、既有独立包/依赖/真实路径别名冲突/子任务越界/未知范围锁定。
- ContextRecovery/adapter/真实agent-session停靠检查：285项通过；既有task-dispatch完整15项通过。
- `scripts/verify-native-recovery-completion.ts`：实际安装的SDK原生Write一次、真实文件字节、SDK历史读取、原始记录匹配、完成证明持久化与冷恢复防重放通过。本地合成模型两次响应，付费调用零；使用隔离HOME/工作区，不接触原会话、账号、供应商或日常客户端。初始未知账本为模拟崩溃夹具，不等于原业务验收。
- 最终tsc、变更文件ESLint、测试分类、renderer build通过；依赖检查0错误、20项警告均指向本次未改动的模块。日志分别记录在本地工作区 `work/MB-RECOVERY-UX-20261102/` 最终日志；CI不由本开发会话触发。
- 新增流程真实IAB：工具明确返回 `Local browser use is disabled in Work settings`，因此未通过、不借用第一阶段截图冒充本轮。新增表单/状态通过DOM交互验证；正式客户端与真实原会话路径仍交唯一desktop owner。

### 兼容、回滚与发布门禁

没有第二executor、scheduler或数据库。完成证明在原ContextRecovery ledger的可选nativeCompletions字段，由原journal/SessionStore持久化；原raw uncertain保留，旧客户端忽略新证明后继续保守阻断。用户补充在原TaskLedger的可选recoveryFollowups。原SessionExecution增加可选recoveryPassDigest限制同一未知集合只自动核查一轮。

回滚必须在原owner确认空闲并结清活动Query后使用已记录旧制品；不能带着新版正在执行的恢复核查切回不识别新标记的旧客户端。无需删除或迁移用户业务数据，不能整体恢复旧数据库覆盖新输入。没有新版本/tag/摘要；由原owner选择下一未冻结版本，原已冻结包不覆盖。完整源码与本地行为已准备，独立审阅、最终组合CI/main、正式包/安装、真实页面及原会话验收分别待回执。

官方SDK合同核对：[Work with sessions](https://code.claude.com/docs/en/agent-sdk/sessions)、[TypeScript reference](https://code.claude.com/docs/en/agent-sdk/typescript)，以当前安装sdk.d.ts/sdk-tools.d.ts及本轮真实SDK回执为执行依据；单纯历史文本不提供执行权限。
