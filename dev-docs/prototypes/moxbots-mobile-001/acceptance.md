# MOXBOTS-MOBILE-001 — 左侧执行轨迹原型交付

状态：源码快照、构建、独立代码审阅与 Chrome 定向验收已完成，源提交 `596d74ca5` 已推送。PR [#167](https://github.com/heavenzhang/MoXBots/pull/167) 承接 CI 与 main 集成；最终包含证明以该 PR 与远端 refs 为准。原生与生产阶段未执行。

## 目标与范围

用户要求学习 Codex：不出现常驻功能条、执行轨迹在左边、改进钢琴效果；随后要求“改完了就提交到远端”。本轮沿获批方案修改独立移动 Web 原型，把它纳入产品权威仓库 `https://github.com/heavenzhang/MoXBots.git` 的 `dev-docs/prototypes/moxbots-mobile-001/`。原交付目录没有 Git 绑定，因此首次保存必要运行源码、固定依赖、设备资产和精简历史 V6 证据，而非只提交无法运行的三个差异文件。

这份快照不导入 `mobile/app/`，不接真实账号、Provider、Host 或业务写入。没有修改产品桌面/原生运行时、发布包、线上服务或日常客户端。

## 实现与证据

- [x] 轨迹位于消息区左侧，窄面板宽度最多 338px；不新增常驻功能条。
- [x] 四步连续状态：接收要求、整理上下文、操作、交付。显式 `pending/running/done/closed`，运行项高亮并带 `aria-current="step"`。
- [x] 12 条 CSS piano-roll 动画只用于运行项，`aria-hidden`；状态文字独立保留，reduced-motion 使用静态降级。
- [x] 保留现有 turnId、授权请求身份、停止、排队和成果回链；未新建执行 owner。
- [x] 独立审阅发现并修复：pending 读屏标签误报完成、旧 flex 规则使图标抢占摘要宽度。
- [x] 快照具备 Worker、hosting 元数据与全部 28 个受保护运行时文件，沿原 hash 检查，不放宽校验。
- [x] 导入时移除未使用 import/局部变量以符合仓库 lint。`qa-v6/baseline/Prototype.tsx` 的复制版本也仅移除未使用项；原工作区历史文件未修改。历史截图及原始量测保留。
- [ ] 与 Codex 像素完全一致：没有可核验的 Codex 同屏基准，不能宣称像素复刻完成。

主要源码：`src/ExecutionTrace.tsx`、`src/prototype.css`。设备和键盘边界见本目录 `AGENTS.md`，构建说明见 `README.md`。

## 验证分层

本分支使用 Node 24.21.0：

- `npm ci --ignore-scripts`：通过。
- `npm run check:runtime`：通过，28/28 原 hash；没有重新生成锁。
- `npm run build`：通过，TypeScript、Vite、Sites Worker 输出准备完整；JS chunk 546.56 kB 的体积提示保留。
- `npm run test:sites`：4/4 通过。
- 根仓库 ESLint 对整个快照：通过（0 warning）。
- 主 Agent 前轮浏览器走查：iPhone 393×852、Pixel 10 427×952，运行、待授权、停止、键盘展开和 reduced-motion；这是合成原型。
- 前轮既有 runtime Playwright 回归使用系统 Chrome：7/8，BottomSheet 遮罩点击被 `<html>` 拦截超时。尚无前后基线对照证明其根因，不能宣称全部通过或断言与本轮无关。
- 独立代码审阅：确认上述两项缺陷并修复。
- 独立系统 Chrome 155 定向补验：4/4 通过，两个设备 × 普通/reduced-motion，运行与待授权的折叠/展开均通过；轨迹 338px、图标 20px、摘要 226px，无溢出或输入栏遮挡。新增 `tests/execution-trace.spec.ts`。结果见 [独立记录](evidence/execution-trace-independent-20261020-final/review.md) 与同目录结构化结果/截图。仅豁免 Chrome 自动请求的可选 favicon 404，原始错误保留，其他页面错误仍失败。
- 仓库完整 `npm run lint`、`npm run verify:agent-docs` 与 `npm run test:classification`：通过。
- Git/PR：源提交 `596d74ca5` 已推送，PR #167 已创建；CI/main 仍以实际 PR 状态为准，不能用本地构建代替 CI。
- 原生编译、原生安装、真实 Provider/Host、真实账号和生产发布：未执行。

## Git 与接续

- 仓库：`https://github.com/heavenzhang/MoXBots.git`
- 工作树：`/Users/zhangshaohua/Documents/Codex/2026-10-19/moxbots-mobile-001-execution-trace`
- 分支：`codex/mobile-001-execution-trace-20261019`
- 集成基线：`18e13ce8dbad20e61af3f84173ad87d84bf090a6`
- 任务记录：`.agent-sync/tasks/codex-mobile-001-execution-trace-20261019-e6514cfc.md`
- 主干最终状态须核实远端 refs 和 PR；本记录不把计划写成已推送。

## 执行分工

主 Agent 负责实现、快照集成、构建、文档与 Git 交付；一个独立 general-purpose reviewer 负责只读代码/快照审阅和后续定向浏览器补验。未指定模型或推理档位；实际路由与费用未知，不估算。主 Agent 自测与独立审阅分开记录。

历史 `qa-v6/` 是此前会话空间调整证据，不代表本轮 piano-roll 截图。更早 V3–V5 完整证据留在原本地交付目录，没有清理或覆盖。
