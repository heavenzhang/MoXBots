# SESSION-CACHE-002 — 缓存会话与历史优先恢复

用户要求：已缓存会话切回不重载；未缓存会话先显示聊天记录，在后台恢复连接。权威仓库 https://github.com/heavenzhang/MoXBots.git，任务分支 `codex/session-cache-002-20261019`，PR #147。基线 `8e60805e8`；已同步 main `2e1c52273` 的显式续接功能。

## 实现与边界

- 12 页有界 FIFO 缓存、Tab identity 和原 Rust exact-owner 裁决保持原路径。健康缓存切换不重新拉取正文、不重建连接或聊天子树；后台 ensure/reconcile 不遮住阅读面。
- 首次进入持久 Session，沿 Global 既有 SessionStore reader 立即读取最后 80 条展示消息，不等待目标 Sidecar 或 SSE。历史更早分页在原 live restore 成功后继续提供；没有新增持久缓存或 storage writer。
- 预览只取 id/messages，不采用 Runtime status、revision、队列或待审批；原 live REST/SSE snapshot/fence 独占执行与实时状态。迟到预览不能覆盖已恢复快照、live recovery、新生会话、换身份或卸载后的 Tab。
- `hasSessionHistory` 是可读状态；`isSessionLoading` 与 connectionError 仍控制发送、审批、问题回复、续接等操作。首次历史显示后用窄条提示后台连接，不用全屏启动遮罩遮住记录。
- 缓存/新打开/启动恢复的 Chat 在 owner ensure 失败、terminal 或 terminal reconcile 后均保留身份、草稿和阅读状态；普通会话可在原 Tab 重试，错误在成功前不清除。
- 同步 PR #145 后，预览不写 continuation metadata、不自动执行或续接；显式 Continue 的捕获/校验/透传保留。

## 验证结果

- 合并后 7 个 DOM 文件 236 项通过：App导航/owner竞态、TabProvider活动与preview、旧身份迟到、SSE-native cached断线、普通失败重试、标题、12页回收、RestoredTabContent、SessionContinuationBanner、启动首屏。
- 5 个定向 unit 文件 41 项通过：Global展示预览字段投影/身份校验、启动壳动作门禁、session打开/终止规划与模块依赖合同。
- TypeScript noEmit 在同步主干后通过；影响文件 ESLint 零警告通过；依赖护栏结果记录在本地证据目录。MoXBots Web构建通过（已有bundle大小/动态导入提示）；最终精确提交的完整 CI 以 PR 检查为准。
- 实际 App 在独立 loopback Vite browser-development mode 运行，只使用合成 localStorage / HTTP / EventSource，无真实账号、模型请求、用户数据写入或原生 Sidecar。
- 冷打开 A：SSE 尚未 open，聊天正文与“正在恢复连接，聊天记录可继续查看”同时可见；live snapshot随后在原fence提交。
- A→B→A：同一 Tab id；未发送草稿保留；滚动位置 `1938 → 1938`；A 的 `limit=80` 正文读取计数 `2 → 2`（一次disk preview+一次live snapshot）；A/B连接实例数未因回到A增加。history_open 的 `limit=1` 元数据埋点读取仍保留，不重新投影聊天正文。
- 1280×800、800×600截图已检查；800px无文档横向溢出。目录面板的native-only红字是浏览器模式限制，不是原生文件功能验收。
- 独立审阅 `/root/cache_review` 请求 gpt-6.1-sol/medium，先发现SSE-native cached遮罩与retry过早解锁两处问题，已修复并复核；同步主干后的显式续接交集和三张截图复核通过，无剩余阻断。主Agent负责整体验收；没有外部模型调用，真实型号/Token/货币用量未由运行时提供，不做节省测算。

原始日志、截图与可机器核对的 `ui-evidence.json`：
`/Users/zhangshaohua/Documents/WPS Cloud/【项目】目录/MoxBot/output/session-cache-002/`。

## 复现

1. 使用项目依赖及 Node 24 启动 `node dev-docs/session-cache/serve.mjs`，仅监听127.0.0.1:8907，关闭真实后端代理。
2. `SESSION_CACHE_OUTPUT=<绝对证据目录> SESSION_CACHE_CHROMIUM=<已安装测试Chromium绝对路径> node dev-docs/session-cache/ui-acceptance.mjs`。输出目录需已存在。脚本启动独立headless浏览器，不使用用户Chrome profile。
3. JSON 的 `cold.readableBeforeConnection`、`warm.draftPreserved` 为 true；scroll前后相同；正文读取/stream数不增长，errors为空。

## 发布与真实验收

本源码任务未安装、重启或替换日常0.5.11应用。桌面发布仍由计划中唯一owner `01a12bc2-907a-7702-b6dd-788225c5dfe4` 串行完成，合入main不等于已发布。签名原生候选需复验 macOS/Windows真实会话A/B切换、冷历史先显示、连接延迟/失败与重试、草稿/阅读位置、任务后台继续、历史分页、12页回收、显式续接不自动发送。发布请求在本任务接续记录与本地release-queue/SESSION-CACHE-002.json；未向其它聊天发送消息。
