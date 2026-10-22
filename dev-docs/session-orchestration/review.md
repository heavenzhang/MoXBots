# MB-ORCH-20261022-01 独立协议与界面审阅

审阅范围：当前独立工作树的 shared 协议、SessionStore CAS、原 Runtime owner 观察、root 验收证明及实际 React 组件。审阅者不修改产品源码，不触发共享 CI、版本分配、构建或部署。权威基线为 `85981a95b5c9a8e8736d680572e2813b1f7809fd`；实施持续变更期间分轮复核，下述结果不代替正式候选冻结审查。

## 结论

已提出的阻断经实施者修复后复核关闭；本轮审阅范围内未发现新的阻断。独立 headless Chromium 对实际组件的六组宽度/主题合成交互验收通过。正式 SDK/DSH/Codex Provider 执行、已安装原生客户端及生产发布仍须由既有部署负责人验证，本报告不把夹具操作视为原生链路证明。

## 原有能力与保护范围

- 复用 builtin exact Query 背景任务 registry、DSH generation/sequence projector、subagent activation/handleRevision 合并策略，以及原 SessionStore metadata CAS。没有要求新增数据库或接管 native TaskGraph writer。
- 旧 SUBAGENT-UI-001 的任务文案仍写未合入，但实时 `git merge-base --is-ancestor b248f4e1d HEAD` 成功，原工作树 clean、相对当前无额外 diff；该文案过期，不能据此判断尚未交付。沿用原 Inspector 和观察入口。
- DSH catalog `inactive` 仅表示不活跃，不能证明成功或验收；taskGraph/plan、执行 lifecycle、Product 验收各自保持事实边界。

## 审查修复轮次

| 轮次 | 发现 | 复核结果 |
| --- | --- | --- |
| 首轮协议 | native completed 直接完成；投影按 ordinal、review 取数组最后项；多 handle 结果覆盖；unknown 可验收 | completed 进入待验收；共用 currentTaskAttempt；显式 currentTools 选择当前执行；校验 executionVerified |
| 身份与恢复 | internal CLI 不能证明 root；历史 running 被整个 Session busy 复活；CAS observation 冲突丢失 | CLI 只记 intent；原 root tool 结果提交验收；活动改精确 tool/task/run/native Agent 匹配；CAS fresh-read 有界重算 |
| root 证明 | 输入仅关键词匹配，可消费不相关 receipt；旧 Query 全局 Session 误写 | sessionTaskReviewCommand 限定直接单条 CLI 并比较完整 action；shell 名校验；captured Query authority/generation、external executionTurn、CAS 内 isCurrent fencing |
| 计划身份与重试 | plan 下标跨轮复用旧 main 验收；nativeTaskId 与业务 task ID 字符串碰撞；冷态旧 running 阻止新绑定 | Codex snapshot hash 与显式 task marker；main attempt epoch；只显式 bindings；mutation 采用同 revision 的精确 owner 快照确认 |
| 浏览器入口 | 4336 返回 SPA 主应用，/@fs 缺 React refresh；4337 fixture 缺 tabId 导致任务条不显示 | 实施者修复独立 Vite root/cache 和 fixture tabId 后，实际浏览器重新验证通过 |

核心复核文件：`src/shared/sessionTaskOrchestration.ts`、`src/shared/sessionTaskReviewCommand.ts`、`src/server/session-engine/task-orchestration.ts`、`src/server/agent-session.ts`、`src/server/runtimes/external-session.ts`、`src/server/runtimes/codex.ts`、`src/renderer/components/agent-status/{ExecutionStatusBar,SessionTaskPanel,useSessionTaskOrchestration,SubagentInspector}`。

## 独立运行界面验收

入口：`http://127.0.0.1:4337/dev-docs/session-orchestration/preview.html`。真实产品组件，API/事件/验收动作为合成夹具；浏览器使用独立 headless Chromium 1234，没有使用用户 Chrome。Codex iab 当前不可用，因此采用任务已授权的本地 Playwright。

| 旅程 | 1280 浅/深 | 390 浅/深 | 320 浅/深 |
| --- | --- | --- | --- |
| 折叠打开、执行中、回传待验收 | 通过 | 通过 | 通过 |
| 拒绝返工、新 attempt 重试、旧结果晚到仍保持当前执行 | 通过 | 通过 | 通过 |
| 再回传、验收完成、展开完成项 | 通过 | 通过 | 通过 |
| 断线保留确认结果、显示同步待恢复、恢复 | 通过 | 通过 | 通过 |
| 切换会话不显示原任务、切回可读 | 通过 | 通过 | 通过 |
| Escape 关闭任务面板并还焦点到触发按钮 | 通过 | 通过 | 通过 |
| 执行记录打开 Inspector、Escape 关闭 | 通过 | 通过 | 通过 |
| 文档横向溢出、页面异常 | 无 / 无 | 无 / 无 | 无 / 无 |

视觉实看覆盖 1280 浅色执行、390 浅色 Inspector、320 深色执行、320 浅色断线与验收结果。窄屏任务名正常换行，状态保留，footer 自动换行，Inspector 四标签和关闭入口可读。深色最初截图处于主题颜色 150ms 过渡中，已等待过渡结束补拍；稳定色为 summary `rgb(207,197,186)` / surface `rgb(36,32,24)`，不以过渡帧误报最终对比度。

独立证据：`evidence/independent-ui.mjs`、`evidence/independent-results.json`、`evidence/independent-{1280,390,320}-{light,dark}-{running,accepted,offline,inspector}.png`。`independent-1280-light-completion-debug.png` 和 `independent-320-dark-running-stable.png` 保留诊断原文，不作为新增测试场景计数。

## 未验证边界

- 合成按钮直接调用 pure reducer，不能证明 CLI → receipt → 原 SDK/native root hook 的真实端到端行为；需结合 owner 集成回归和正式原生验收。
- 本轮浏览器覆盖返工→重试，不额外声称真实 Provider 执行失败、进程重启或冷启动已通过；对应协议只能由源码及实施者定向测试证明。
- 未执行共享 CI/发布，也未操作日常客户端、业务会话、受控测试身份或真实模型。
- 实际模型 token、费用与收益未由工具计量，均未知；不估算节省。

## 后续授权扩展：计划确认 UI 与原生请求证明

本节替代前文“审阅者不修改产品源码”的旧角色边界：后续由主负责人明确授权本 Agent 实现指定 UI 文件和 Rust 请求证明；本 Agent 已成为该部分实现者，由主负责人做最终独立审阅。未触发正式构建、CI 或部署。

UI 接入包括 proposal 无正式任务时仍展示、收到同 Session 真实 ledger 才更新确认结果、A/B/A 会话切换隔离、POST 失败同 requestId 重试、调整意见保留、讨论追加既有输入草稿并聚焦。确认和执行分别呈现：pending/claimed/error 有专门人类提示，不暴露技术码，不把 confirmed 当作已执行；恢复不确定时明确先核对结果且不自动重播。修复 320px 原始卡片把输入框挤出屏幕的问题，详情 28vh、整个卡片 65vh 内可滚动。

- 48 项 pure/DOM（4 文件）通过；包括源卡片、实际 ExecutionStatusBar 组合、hook acknowledgment/迟到/重试及启动状态边界。
- 全 TypeScript noEmit 已通过；分配 UI 的 ESLint 无错误，仅已有 baseline-browser-mapping 版本数据提示。
- 新增 1280/390/320 × 浅深色共 6 组实际组件浏览器验收通过：未创建正式任务也显示草案；讨论保留已有草稿、聚焦、不 POST；调整断线保留文字、重试同 requestId；新版方案重新确认；确认后折叠；切换会话隔离；pending/claimed/error 提示。页面异常 0，横向溢出 0；320/390 输入框完整在 viewport 内。
- 证据：`evidence/independent-plan-{tests,types,lint,browser}.log`、`independent-plan-results.json`、`independent-plan-ui.mjs`、`independent-plan-preview.{html,tsx}` 和矩阵截图。此处 API 是合成传输；草稿夹具与 Chat 回调一致，但未启动完整原生 Chat 或真实 Provider。

安全门禁审查发现原 localhost POST 不能证明人类按钮来源，随后按主负责人定义实现原生证明：Rust 进程内 OnceLock P256 私钥，Node 仅收到 SPKI 公钥；仅取得 Session Tab dispatch lease 的限定 POST 路径签名，绑定 hint、路径、原始 body SHA256、时间与 nonce；所有 caller supplied 证明头均剥离，global/analytics 不签名。私钥不出 Rust，不写盘，不记录签名。新模块 `src-tauri/src/session_user_action.rs` 使用仓库现有依赖，隔离最小 Cargo 实编译与 6 unit 通过。整库 targeted Cargo 独立执行仍在依赖编译，已按主负责人要求中断最初并行运行并以 `CARGO_BUILD_JOBS=2` 复用缓存继续，整库结果待单独记录。

另已只读复核主负责人新增的 Node 验签、humanInputs 与 draft 边界：旧的“同一条创建前用户消息确认新草案”入口被关闭；确认必须有原生证明匹配实际消息 clientRequestId、正文 SHA、同 proposal/revision，且消息严格晚于草案边界。Node 验签测试由主负责人负责。本节不是本 Agent 对自己实现的最终独立批准。

整库 Rust 定向验证结果：被既有资源准备门禁阻断，`build_cliproxy.rs:31` 报 `Missing CLIProxy bundle manifest-v1.json; run package-cliproxy-component.mjs stage`。未下载、伪造或跳过资源门禁；不能宣称整个 Tauri crate 已编译通过。新 Rust 模块的隔离同源码 compile/test 6/6 是已完成证据，见 `independent-user-action-isolated.log`；整库原始失败见 `independent-user-action-cargo.log`。

## 最后确认竞态：绑定用户实际看到的版本

后续补齐“自然语言确认到达时服务端已出现新版本”的 P1：hook 仅在 proposal 完成 React commit 后发布显示 target，且只对 awaiting_confirmation / 非加载状态；确认、移除、清理时发布 null。TabProvider 在 layout 阶段监听，同 Tab / Session 才接收，在会话变更时清空；仅保存 composer 输入关联 ref，不建立第二计划 store。sendMessage 在发送动作开始时捕获 `{proposalId, expectedRevision}` 写入 `orchestrationPlanTarget`，SSE 的未显示版本不能直接推进此关联。服务端由主负责人校验 Rust 签名 body 中的 target 与当前方案精确一致。

定向 hook + 实际 TabProvider 回归覆盖：显示 rev1、SSE 先到 rev2 而 UI 尚未提交时，实际 chat/send 仍携带 rev1；错 Tab / Session 不写 target；不再等待确认时清空；A/B/A 不继承旧 target。证据：`independent-visible-plan-tests.log`、`independent-visible-plan-lint.log`。此轮未重复启动整库 tsc，沿用主负责人唯一编译进程协调。
