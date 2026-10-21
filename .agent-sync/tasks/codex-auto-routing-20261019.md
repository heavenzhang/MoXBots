<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/auto-routing-20261019 -->
<!-- git-project-sync-task:base=2adf5c1d22c138d1b1c5022acc0bfd0179a78012 -->
<!-- git-project-sync-task:status=merged-main-awaiting-ci -->

# Task: MOXBOTS-AUTO-ROUTING-20261021

## Objective

把 `docs/MOXBOTS-AUTO-ROUTING-PLAN-20261019.md` 确认方案的四个阶段开发完：P0 路由引擎与分类器、P1 会话接入、P2 界面（「自动」、三档卡片、可纠正路由标签）、P3 请外援（先问我模式，候选取自三档）。来源工作区 `/Users/zhangshaohua/Documents/WPS Cloud/【项目】目录/MoxBot`。

## Acceptance criteria

- [x] P0：档位/分类/编号解析/`fitEffort`/分档优先级/缓存热只升不降/上下文压力/轮次决策 + `route tiers|explain`，单测覆盖解析、缓存、冷却、沿用上一轮与分档优先级。
- [x] P1：`SessionMetadata.modelMode` 缺省即 auto；空闲 builtin 新轮次在准入处路由，CAS 写回快照并广播；忙轮/手动/runtime-backed/仅提醒不路由；分类失败沿用上一档；档内备用模型接入 modelFailover；无正文路由记录 + `auto_route_decide`。
- [x] P2：模型菜单「自动」行（外部 Runtime 不显示）、「自动 · 当前模型」文案、三档设置卡片（判断模型可改、排序、换档、隐私说明）、消息路由标签与两个纠正按钮；中英文案；DOM 用例覆盖。
- [x] P3：`route candidates|assist|readme`；候选跨档优先且排除当前模型；隔离无工具文本轮次；先问我；无墙钟超时、Ctrl-C 取消、失败重试一次；`route_assist_dispatch`。
- [x] 手动选模型钉住本会话（快照、出生、跨历史 fork 三条路径）。
- [x] 本地：tsc、ESLint、depcruise（0 error）、unit 619/6727、dom 316/2741、integration 124 files 1409 passed、测试分类、CLI bundle contract。
- [x] 非交互 rebase 到 `2adf5c1d2`，解决 `agent-session.ts`、`builtin-adapter.ts` 冲突并保留双方语义。
- [x] 推送 `HEAD:main` 并经 `git ls-remote` 核实远端 main `c21b013bf`。
- [ ] 共享 CI run `39560599030` 结论（以 CI 页面为准）。
- [ ] 真实客户端安装验收、真实 Provider 联调、真实换模型耗时实测。
- [ ] 桌面签名构建与发布（唯一 owner `01a12bc2-907a-7702-b6dd-788225c5dfe4`）。

## Completed

源码与本地验证完成，已合入 main。交付记录 `dev-docs/auto-routing/acceptance.md`，差异补丁 `dev-docs/auto-routing/auto-routing-20261019.patch`（sha256 `b57e380a…c322`）。

## Verification

见交付记录第 5 节。开发机 Node 24，integration 需 `env -u API_TIMEOUT_MS -u API_FORCE_IDLE_TIMEOUT`。`markdown-editor/definitions.test.ts` 为已知偶发，与本改动无关。

## Blockers and unknowns

分类器、路由切换与请外援均未对真实 Provider 跑过；换模型的重载耗时未测，「缓存热只升不降」的 5 分钟阈值因此未经真实数据校验。原生安装与发布未进行。

## Next step

CI 通过后：由唯一 desktop release owner 构建并做原生验收；补测真实换模型耗时，必要时调整 `AUTO_ROUTE_WARM_CACHE_MS`。
