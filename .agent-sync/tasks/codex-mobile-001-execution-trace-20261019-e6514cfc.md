<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/mobile-001-execution-trace-20261019 -->
<!-- git-project-sync-task:base=18e13ce8dbad20e61af3f84173ad87d84bf090a6 -->
<!-- git-project-sync-task:status=in-progress -->

# Task: MOXBOTS-MOBILE-001 Codex 风格左侧执行轨迹原型

## Objective

将独立的 MOXBOTS-MOBILE-001 本地合成移动 Web 原型，以可复现源码快照纳入 MoXBots 仓库；把当前轮次执行轨迹改为 Codex 风格的会话内左侧窄轨迹，移除常驻功能条，提供连续步骤、当前步骤高亮、状态文字和装饰性 CSS piano-roll 动画。保留现有 turnId、授权身份校验、停止、排队和成果文件语义。范围不包含 React Native native app、真实 Provider、Host、账号、业务写入、生产发布或真机验收。

## Acceptance criteria

- [x] 原型快照可从仓库路径独立安装、构建和运行。
- [x] 执行轨迹在会话内容左侧呈现，不新增常驻功能条或工具栏。
- [x] 展开轨迹显示接收、上下文、操作、交付四个连续步骤，当前步骤有 `aria-current="step"`、状态文字和 piano-roll 动画。
- [x] 完成、运行、待确认、停止、拒绝、过期、另一端处理和成果文件状态保留。
- [x] 移动运行时保护文件未被修改。
- [ ] native app、真实服务、真机和生产验收不属于本任务，明确记录为未验证。

## Completed

- 从原型交付目录复制 `src/`、`public/`、`scripts/`、`tests/`、配置、README、AGENTS 和精简 `qa-v6/` 证据至 `dev-docs/prototypes/moxbots-mobile-001/`；排除 `node_modules`、`dist`、`test-results` 和日志。
- `src/ExecutionTrace.tsx` 使用显式 `pending | running | done | closed` 步骤状态；当前步骤高亮，状态文字和可访问性语义与动画分离。
- `src/prototype.css` 提供左侧窄轨迹、运行步骤高亮、CSS piano-roll、reduced-motion 降级和窄屏适配。
- `AGENTS.md` 固化 V6 左对齐执行轨迹、无常驻功能条和动画不可替代 ARIA 状态的约束。
- 任务分支从最新 `origin/main` `18e13ce8dbad20e61af3f84173ad87d84bf090a6` 创建。

## Verification

- `npm run check:runtime`：原始工作区已通过，28 个受保护运行文件完整性通过。
- `npm run build`：原始工作区已通过 TypeScript、Vite 和 Sites 静态输出准备。
- 前轮系统 Google Chrome：8 项移动 runtime 回归中 7 项通过；BottomSheet 遮罩点击用例被 `<html>` pointer interception 拦截而超时。没有前后基线证明根因，不宣称全通过。
- iPhone `393×852`、Pixel 10 `427×952`：左侧轨迹、运行态、授权态、停止态、reduced-motion 和键盘展开已完成主 Agent 走查。
- 本分支快照 `npm ci --ignore-scripts`、`npm run check:runtime`（28/28）、`npm run build`、`npm run test:sites`（4/4）及根 ESLint 定向检查通过；`git diff --check` 随提交执行。详见 `dev-docs/prototypes/moxbots-mobile-001/acceptance.md`。
- 独立 reviewer 发现 pending 读屏标签和旧 flex 规则两项缺陷，已修复；独立浏览器结果以同目录 `evidence/` 为准。
- 合成原型验证不证明 native app、真实 Provider、Host、账号、业务写入或生产路径。

## Blockers and unknowns

- 默认 Playwright Chromium 未安装，回归使用系统 Google Chrome；BottomSheet 一项既有测试仍失败。
- 本地原型目录不是 Git 检出，因此提交的是仓库内 `dev-docs/prototypes/moxbots-mobile-001/` 可复现快照，不修改 `mobile/app/` native 客户端。
- 未执行 native build、真机验收、真实服务联调、CI 或生产发布。

## Next step

源实现已推送，PR https://github.com/heavenzhang/MoXBots/pull/167 已创建。独立 Chrome 定向补验 4/4 通过，双设备/双动效各覆盖运行和待授权折叠/展开；精选证据随跟进提交保存。仓库完整 lint、文档和测试分类通过。下一步核实 PR 全部适用 CI，正常合入 main，并以远端 refs 验证包含；原生/生产不属于此次交付。
