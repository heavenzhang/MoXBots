# MOXBOTS-AUTO-ROUTING-20261021 — 自动选模型 P0–P3 交付记录

分支 `codex/auto-routing-20261019`，基线 `2adf5c1d2`（origin/main，PR #180 合入后的 HEAD），交付 head `ba97a22b4`（源码 `c21b013bf` + 交付记录提交）。

## 1. 目标与范围

按 `docs/MOXBOTS-AUTO-ROUTING-PLAN-20261019.md`（方案已于 2026-10-19 确认）把四个阶段开发完：

- **P0 引擎**：`src/shared/autoRoute.ts`（档位、分类提示词、编号解析、`fitEffort`、分档优先级、缓存热只升不降、上下文压力、轮次决策），`src/server/auto-route/{classifier,transport,router,admin}.ts`，保留 LiteLLM 价格与推理能力，内置预设 `tier` 标签，`myagents route tiers|explain`。
- **P1 接入会话**：`SessionMetadata.modelMode`（缺省即 auto），新轮次在 builtin 准入处路由并按 CAS 写回快照、广播 `chat:session-config-changed`；同一轮工具往返不重判；分类失败沿用上一档；档内下一个模型作为 `modelFailover` 备用；用户消息带无正文的路由记录；埋点 `auto_route_decide`。
- **P2 界面**：模型菜单「自动」行、「自动 · 当前模型」按钮文案、设置页三档卡片（含判断模型可改、档内排序、换档、隐私说明）、消息上的路由标签与「换一个」「以后这类都用它」两个纠正按钮；中英文案齐全。
- **P3 请外援**：候选直接取自三档（跨档优先，排除当前模型），`myagents route candidates|assist|readme`，一次隔离的无工具文本轮次，仅「先问我」模式（系统提示要求每次请求前说明模型与理由并等用户明确同意），无墙钟超时、Ctrl-C 取消、失败重试一次，埋点 `route_assist_dispatch`。

**不在范围内**：规则编辑器、按模型定义角色、固定超时记为失败、赛博摇人预设界面（分支 `codex/team-mode-20261017` 原样保留，只取回 dispatch 代码）、原生客户端构建与发布。

## 2. 勾选清单

- [x] P0–P3 实现
- [x] 本地单测 / DOM / 集成测试全绿（见第 5 节）
- [x] `tsc --noEmit`、ESLint、depcruise（0 error）、测试分类检查
- [x] 非交互 rebase 到最新 origin/main（基线 `2adf5c1d2`，跨 146 个提交，`agent-session.ts` 与 `builtin-adapter.ts` 冲突已人工合并并保留双方语义）
- [x] `git push origin HEAD:main` 并 `git ls-remote` 核实
- [x] 交付记录（本文件）、仓库任务记录与验收证据
- [x] 共享 CI：最终 main `ba97a22b4` 的 run `39563706378` conclusion `success`，全部 job 通过（iOS simulator job 为既有 skip）。此前 `c237d5684` 的 run `39561027775` 亦为 `success`；`c21b013bf` 的 run `39560599030` 被新推送取代后取消。
- [ ] 真实客户端安装验收、真实 Provider 联调（未做）
- [ ] 测量真实换模型（会话重载）耗时（未做，见第 6 节）
- [ ] 桌面签名构建与发布（交唯一 release owner，本会话不构建不发布）

## 3. 关键路径

| 项 | 值 |
|---|---|
| 仓库 | `https://github.com/heavenzhang/MoXBots.git` |
| 分支 | `codex/auto-routing-20261019` |
| 基线 main | `2adf5c1d2` |
| 交付 head | `ba97a22b4338383dd8eb29c71d814f3edd3c422a` |
| 远端 main（推送后核实） | `ba97a22b4338383dd8eb29c71d814f3edd3c422a` |
| CI | run `39563706378`（`ba97a22b4`）`success`；`39561027775`（`c237d5684`）`success`；`39560599030` 被新推送取消 |
| 提交 | `ef21941cf` P0、`0651a34cb` P1、`4d3c203b8` P2-1、`86b9c678b` P2-2、`901163629` P3、`c21b013bf` 依赖解环与埋点注册、`c237d5684` 交付记录、`ba97a22b4` CI 记录 |
| 差异补丁 | `dev-docs/auto-routing/auto-routing-20261019.patch`，sha256 `b57e380a4d68a9e56deee8c53948d662f722940d1c1950bffb8ae96b5908c322` |

改动规模：60 个文件，+3744 / −38。

## 4. 主要设计决定（含理由）

1. **手动选模型即钉住本会话**：`persistInputOption` 在内置模型选择分支写 `modelMode: 'manual'`，`createSession` 出生与跨历史 fork 同步带上 `manual`。否则下一轮自动路由会覆盖用户刚选的模型。
2. **准入处只读路由、不改请求**：`applyAutoRouteAdmission` 失败时原样放行；忙轮、手动、runtime-backed、只有提醒的轮次不路由。
3. **换模型代价高于 Magpie**：MoXBots 换模型会重载会话、丢 prompt cache，因此缓存热（5 分钟）时只升不降，同档不换。
4. **P3 与赛博摇人的区别**：赛博摇人对按保存的预设派工；请外援直接读实时三档表，因此改档位立刻影响可用候选。派工代码（文件附件安全校验、一次重试、无墙钟预算、按次推理强度）原样取回，角色/预设/`team show` 等未取。
5. **依赖解环**：`agent-session` 只导入叶子模块 `auto-route/assist-hint` 读取进程内可用性标志，避免 `router → title-generator → agent-session` 环（depcruise `no-circular`）。标志在 `route candidates` 调用时按有效配置刷新，下一次 Query 重建时生效。
6. **一次调用的推理强度**：`generateUtilityText` 增加 `timeoutMs`、`label`、`reasoning` 三个可选参数，分类器继续用短预算，生成型派工不设墙钟预算。

## 5. 本地验证（开发机，Node 24）

| 检查 | 结果 |
|---|---|
| `tsc --noEmit -p .` | 通过 |
| `eslint . --max-warnings=0` | 通过 |
| `depcruise` | 0 error（18 条既有 orphan 警告） |
| unit | 619 files / 6727 passed / 5 skipped |
| dom | 316 files / 2741 passed |
| integration（`env -u API_TIMEOUT_MS -u API_FORCE_IDLE_TIMEOUT`） | 124 files passed + 1 skipped / 1409 passed / 32 skipped |
| `check-test-classification.mjs` | 通过 |
| `scripts/cli-bundle-contract.test.mjs` | 通过 |

新增测试文件：`src/shared/autoRoute.test.ts`、`src/server/auto-route/{classifier,admission,assist}.unit.test.ts`、`src/renderer/pages/settings/AutoRoutingSettings.test.tsx`、`src/renderer/components/{SimpleChatInput.autoModel,Message.autoRoute}.test.tsx`；`persistInputOption.test.ts` 与 `model-failover.integration.test.ts` 按新语义更新；`system-prompt-cli-tools.unit.test.ts` 增加请外援提示的开/关用例。

运行中出现的已知偶发：`src/renderer/components/markdown-editor/definitions.test.ts` 首次运行失败、单独复跑与完整复跑均通过（与本改动无关，stash 后同样偶发）。

## 6. 未完成 / 未验证（明确边界）

- **共享 CI**：run `39563706378`（`ba97a22b4`）已 `success`。这不等于原生安装验收。
- **真实客户端安装验收**：未构建、未安装、未截图。本地 DOM 测试不等于原生验收。
- **真实 Provider 联调**：分类器、路由切换、请外援一次真实调用都未在本机对真实厂商跑过；单测里传输层与派工 runner 都是注入的替身。
- **真实换模型耗时**：方案 P1 要求实测会话重载耗时，本次未测。这决定「缓存热只升不降」的阈值是否合理。
- **判断模型隐私**：卡片文案已写明原话会发给判断模型所属厂商，本地模型作为候选要等 `route tiers` 实际配置验证。
- **赛博摇人分支 `codex/team-mode-20261017`**：原样保留、未清理、未合入。
- **发布**：交唯一 desktop 发布 owner `01a12bc2-907a-7702-b6dd-788225c5dfe4`；本会话不构建、不安装、不替换日常客户端。

## 7. 执行记录

- 主 Agent 完成后端引擎、会话接入、界面与请外援，并运行本地全部检查、rebase 与推送。
- 模型/推理档位：本会话使用默认模型，推理档位未显式指定（实际值未知）。
- 未产生付费调用；未访问真实 Provider；未操作日常客户端；未触碰发布队列。
