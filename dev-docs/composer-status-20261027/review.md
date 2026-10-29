# Composer 状态栏独立 UI/代码审查

审查日期：2026-10-27
仓库：`/Users/zhangshaohua/Documents/Codex/2026-10-27/moxbots-composer-status`
审查基线：`caab6ab648b434bee17930f90c4df4de87564bba`；当前分支 `codex/composer-status-20261027`，本次审查只读现有未提交修改。
边界：未改产品源码、未提交、未调用共享 CI、未部署、未操作日常客户端。输出仅为本文件。

## 结论

视觉目标基本达到：Composer 上方是约 32px 高的单行无外框摘要，没有原先状态框与编排卡片上下叠加的厚重感。桌面截图层级明确；390px 深色截图仍能辨识执行状态、任务计数和固定右侧待验收入口。展开的任务详情作为单一圆角背景区出现，视觉密度可接受。当前不因一般样式偏好阻断。

复验结论：先前发现的键盘焦点缺陷已修复。本轮确认有效历史入口仅在 `hasAgents` 时显示；键盘激活后，新协作详情区获得焦点，Escape 收起详情并回到稳定的任务摘要入口。源码不再让即将卸载的历史按钮承担 Escape 返回目标。位置：[ExecutionStatusBar.tsx](../../src/renderer/components/agent-status/ExecutionStatusBar.tsx:155) 与 [SessionTaskPanel.tsx](../../src/renderer/components/agent-status/SessionTaskPanel.tsx:36)。

| 优先级 | 发现与影响 | 证据 / 复现路径 |
|---|---|---|
| 已修复（原 P2） | 任务详情内“查看全部执行记录”切换到协作详情时，焦点丢失且 Escape 无法稳定闭环。修复后切换时聚焦新详情区，Escape 返回原稳定摘要入口；无协作历史时不显示该入口。 | 修复前 RED 测试日志 `/tmp/moxbots-composer-status-history-red.log`：`keeps keyboard focus inside collaboration history and returns Escape to the summary` 在 `expect(details).toHaveFocus()` 失败。修复后独立 headless Chromium 定点复验通过：history → Enter → region 聚焦 → Escape → 原任务摘要聚焦；夹具脚本对应 `check.mjs` 第 93–107 行。未重复全矩阵。 |

## 已通过 / 支持证据

- **视觉检查（独立）**：查看 `evidence/chromium-1440-dark.png`、`chromium-390-dark.png`，并查看更清晰的 `composer-dark-2x.png` 与 `composer-review-2x.png`。摘要 32px、无外框；待验收右对齐且使用警示色；展开区与 Composer 有清楚间隔。390px 下摘要与右侧入口均未被页面裁切。
- **交互与布局证据（审阅已有合成夹具结果）**：`evidence/results.json` 显示 Chromium 与 WebKit 的互斥展开、直接待验收入口、保留草稿/输入焦点、Enter/Escape、会话切换、状态变体、320/390/768/1440px 浅深主题和页面溢出案例均通过。历史导航焦点路径由本轮独立 headless Chromium 单独复验通过；未重跑完整矩阵。
- **摘要状态边界（独立源审）**：执行投影按 requestId 过滤旧执行；unknown 时使用“状态待同步”，详情不显示旧验收结论；未确认意图使用“执行未确认”，不显示成功状态。覆盖数仅在 completed 且非 unknown 时取证据，未完成态显示 0/N。对应 [SessionExecutionStatus.tsx](../../src/renderer/components/agent-status/SessionExecutionStatus.tsx:48)。
- **空数据与数量语义（独立源审）**：无任务而有协作时显示“协作”；存在任务时完成数/总数如 0/3 表示完成项计数，固定待验收入口另列，未把 0/0 当成任务。待验收入口只切换到任务详情，不调用验收回调。
- **规范对齐**：无外框紧凑行、唯一互斥详情区、右侧待验收、IME Escape 保护、窄屏摘要滚动等要求与 [goal_todo_interaction.md](../../specs/tech_docs/goal_todo_interaction.md:5) 一致；修复前焦点缺陷已由定点复验确认关闭。

## 未验证边界

- 本轮仅独立实测 history 导航焦点路径，未重跑完整浏览器矩阵、TypeScript、lint 或 build。主 Agent 报告 65 项 DOM/tsc/lint、完整本地 web build 与 Chromium/WebKit 40 组通过，报告值不作为本审查的独立实测。
- 未在真实桌面壳、真实 Provider、真实业务会话或发布版本验收；当前证据来自合成组件夹具和源码。
- 独立 headless 复验覆盖了任务摘要键盘打开、历史入口键盘激活、详情区自动聚焦及 Escape 返回原摘要；未测试真实桌面壳与真实会话。

## 调度与工作量记录

- 单 Agent 独立审查；未启动子 Agent。理由：范围已限定在两个组件、现有截图与一次窄路径交互判断，拆分会增加协调成本。
- 本地源审、截图查看和已有证据检查均已完成；没有进行源码修改或发布操作。
- 实际模型与推理 effort：本运行时未提供可确认值，故标记未知。token 用量与本次工作收益无可靠计量，标记未知。
