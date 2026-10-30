# MB-SESSION-ACTIVITY-20261030

## 范围与结果

主模型回合可以结束计算并等待子任务，但主任务的监督和交付责任不能因此结束。本次修复后台活跃未参与会话标识、已知执行识别失败仍可派生无账本子 Agent，以及子任务返回后原生父循环重新执行但产品 root 仍 idle 导致提示丢失。

源码基于 `origin/main d18137e87155994c4ade3d1889d04830821a8eda`，分支 `codex/session-activity-20261030`。实际工作区 `/Users/zhangshaohua/Documents/Codex/2026-10-30/moxbots-session-activity`。当前 Agent 直接实现与检查，没有子 Agent、外部模型、业务写入或安装版修改。新增用例后最终共751项独立测试通过；先前509项属于上一轮证据。

## 实现

- 原 Query 的 `background_tasks_changed` 非 ambient 整表仍为活跃权威。`getAgentState`、`chat:init` 和 `chat:status` 投影同一 `hasBackgroundWork`；后台活跃性变化及 Query 退出时刷新。
- 原 SDK `session_state_changed` 的 running/requires_action/idle 由既有 exact Query lifecycle owner 投影为 `hasNativeWork`，仅接收已初始化的非 prewarm Query；Query replacement/reset 清空，旧 Query 事件无权更新。通过 SSE/init/live API 与 Session observation 投影，不创建新 root、不修改原始输入、不把 native idle 当作产品成功终态。更新维护门禁也等待此原生活动。
- `TabProvider` 汇总 root 活动、原生活动与上述后台信号，传给既有 App 会话标识；root 的 `sessionState` / `isLoading` 保留原执行语义，不用假运行轮次驱动调度。消息终态或旧通知不能清掉仍在执行的后台工作。Stop 状态复核也使用现有 live API 的后台快照。
- 主聊天在后台仍执行时持续显示主 Agent 等待结果；后台已结束但 native parent 仍执行时显示“任务仍在执行…”，沿用原时钟与状态行。会话标识的无障碍文案改为“会话进行中”。
- `INTENT_UNCONFIRMED` 的当前准入允许只读核查和交互，拒绝未授权的执行/派生任务。错误恢复即使换了 root queue，也不能把已知识别失败当作 legacy 子任务派发许可。真正历史非托管请求、独立 Task/Goal owner 不受此新规则影响。
- 正常监督沿用原 task package、资源范围、claim、原生终态唤醒和主 Agent 验收，未新增调度器、轮询模型、预算或恢复授权。原生回合完成不等于任务验收完成；后台结果未知不重派。

## 验证

Node v24.20.0；测试只使用隔离 HOME、合成事件和磁盘。

| 检查 | 结果 |
| --- | --- |
| DOM：TabProvider.activity、MessageList.footer、GlobalSidebar、useSessionTaskOrchestration | 250 项通过 |
| integration：builtin transcript、session execution、task dispatch、session stability | 279 项通过 |
| unit：Query owners、Session observation、read route、SessionEngine | 222 项通过 |
| 全量 TypeScript | 通过 |
| 所有修改的产品/测试 TS(X) 定向 ESLint | 通过；只有既有 Baseline 数据陈旧提示 |
| 测试池分类 | 通过：469 server tests，133 integration、6 credentialed |
| MoXBots profile renderer 构建 | 最终源码通过，39.11秒；回执见外部 native-renderer-build.log；既有 chunk/动态导入提示保留 |
| 实际产品组件浏览器检查 | 通过：内置浏览器 1280×720、深色 390px 容器；后台等待/主核验/完成状态切换，合成状态，不是安装版验收 |

新增及强化场景：root idle/complete + 后台运行、后台终态边缘与权威整表分离、重连、旧会话事件拒绝、旧 start 卡片不复活会话、Stop live API 复核、后台活动 SSE 与重连 snapshot、识别失败工具准入、错误恢复 queue 变化、独立原生 owner、主任务未验收时不能完成及原生终态回接。既有停止、预算、未知结果和主 Agent 验收回归通过。

初轮 DOM 失败来自新增探针字段未更新旧全等断言、用 pending 会话测试 real-session 隔离；已改为真实 concrete session fixture 并通过。初轮 TypeScript 检出可空 admission 比较，已修正。浏览器夹具先补齐 ImagePreviewProvider 和生产调用方的虚拟列表参数/布局；开发服务器依赖优化失败转为静态构建检查，并显式声明 Tailwind 生产组件 source；未修改产品来迁就夹具。

2026-10-31补充日志核查明确观察到原生 running 与产品 root idle 并存；本轮在不产生第二个 SDK 用户输入的场景验证了原生接续提示和 native idle 收起。恢复/重复验收入口参考同一活动信号，避免把执行中的原生主线程当成空闲。

原会话只读后续证据显示子任务结束后原生运行时确实接回了主轮，后续主轮遇到 502。因此本次不把它描述成“从未回接”，也不声称已修复供应商 502、意图识别供应商失败或替用户完成原业务任务。

## UI 合同与边界

UI owner：当前 `/root`，小范围状态修改由实现者自验，无独立 UI reviewer。基线沿用实际 MessageList 状态行与 TabActivityIndicator；只检查等待/核验/完成切换、明暗和窄窗，不重设计页面。

`preview.html` / `preview.tsx` / `preview.css` 为实际生产组件与合成状态夹具，无 Provider、凭据或业务连接。开发预览使用 Vite 的 `/@fs/<绝对路径>/preview.html`；依赖共享时应为本次进程设置独立 cacheDir。静态复现沿用仓库 Vite 配置、root 指向本目录、入口 preview.html，并在生产 HTML transform 中移除仅开发所需 react-refresh preamble。制品留在 `/tmp/moxbots-session-activity-ui-build`，仅绑定 127.0.0.1 供 CUA 内置浏览器检查。

实际 CUA 内置浏览器验证：后台状态含一个真实 TabActivityIndicator 进行中点及等待行；点击“子任务返回，主线程核验”后继续进行中；点击“完成验收”后活动点和等待行同时消失。1280×720 明亮布局及390px深色容器文字完整、无横向溢出。视觉、上述交互和容器适配通过；未做原生客户端/真实Provider/权限/业务联调，也不宣称完整移动设备验收。新增实际组件“原生接续执行”用例：根 isLoading=false、background=false、root state=idle，仍保留活动点、持续计时和“任务仍在执行…”；点击完成后收起。截图native-resume-light.png、native-resume-dark-390.png；最终夹具构建42.76秒。

截图位于项目外部工作记录 `work/MB-SESSION-ACTIVITY-20261030/evidence/`，包含 background-light.png、main-review.png、accepted.png、background-dark-390.png。静态组件夹具最终构建33.34秒。

源码/本地模拟通过不代表已安装客户端或真实 Provider 验收。现有原生客户端保持 0.5.27/527.3；本任务不分配新版本或重建旧制品。

## 部署交接

desktop/macOS-arm64/updater 和 combined CI/main 继续由 `01a12bc2-907a-7702-b6dd-788225c5dfe4` 唯一负责。开发仅推送任务分支并登记 release-queue；不创建触发共享 CI 的 PR、不替代其合并/构建/安装/发布。精确 HEAD 在外部交接回执记录，避免文档自引用。

远端主干、共享 CI、签名制品摘要、不可变 tag、安装/生产及真实路径验收均等待原 owner 回执；没有完成这些步骤前不宣告整体发布完成。没有 cloud/Host/mobile 部署请求、协议切换或数据迁移依赖。

## 执行记录

单智能体（零子 Agent）：紧密关联的状态与准入修复由 `/root` 负责，主模型精确变体和 effort 未通过任务接口独立暴露，无模型切换。选择依据是避免重复读取同一生命周期；升级原因：无升级；不调用外部原因：明确采用 ai-yaoren-local 纯内置模式。用量、费用和相对节省未测量。复盘：保持 runtime level 和主轮状态分离有效；后续同类 UI 夹具优先静态构建并显式带齐生产布局参数，以减少 Vite 优化器与虚拟列表夹具返工。

## 2026-10-31 第三次反馈：执行过程消失

只读核实安装版仍为0.5.27/527.3，前两次源码修复尚未发布。原会话 V2 文件可由生产 readTranscriptFile 解码，tail=clean；消失的助手行 id=4 含233个内容块、134个主工具调用，Agent容器下159条子调用记录。日志00:46:37显示重连只恢复4条历史行；源码确认 liveStreamingMessage 被排除出历史，而前端又以 root idle 丢弃该行。此为展示恢复缺陷，不能据截图认定磁盘全量丢失。后续只读 live API已能看到行4回到历史。

两个入口（REST恢复、SSE init）统一按 Runtime 返回的 live row 保留内容/身份，不再要求 root active；loading仍只按root状态判定。保留后续增量及正常/错误结束归档；未创建新用户输入、未写原业务会话、未运行恢复或重复业务操作。

新增2个回归用例在修复前均复现：内容为空、子Agent详情为空；修复后验证冷恢复、SSE重连、revision缺口恢复、子调用结果更新及api_error终态归档。初次修复后用例中的子工具事件误用主工具名称，按真实subagent事件协议纠正后通过。完整5文件DOM回归261项通过，TypeScript通过；前两轮279集成+222单元证据沿用，本轮未改后端不重复跑，不将其计作本轮重新执行。

未完成原因独立核查：00:05:38 API502；00:50:41 aborted_streaming；后续多个 Bash/Write 返回 automatic_replay_blocked（前序工具结果不确定，只允许Read/Grep/Glob核查）。这些证据说明业务尚未完成，不能把某个SDK completed、子任务待验收、或UI修复当作整体成功；本次不解除未知结果门禁，不声称修复供应商或完成请假业务。

本轮实际组件UI：CUA内置浏览器、1280×720明亮/深色，主聊天过程与子Agent报告同时可见；工具标签可展开Read输出；关闭详情后过程保留。截图 `evidence/transcript-restored-details-dark.png` 为合成状态、非安装版。预览夹具按生产调用方使用合并后的messages（首次夹具漏传live row已纠正），不修改产品布局迁就夹具。最终静态构建日志 `transcript-restore-ui-build.log`；TypeScript、定向lint和diff检查通过。无正式构建、安装或共享CI。
