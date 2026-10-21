<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/model-settings-20261022 -->
<!-- git-project-sync-task:base=85981a95b5c9a8e8736d680572e2813b1f7809fd -->
<!-- git-project-sync-task:status=ready-for-review -->

# MOXBOTS-MODEL-SETTINGS-20261022 — 模型策略统一入口

## Objective

用户最终明确要求：合并为一个“模型策略”入口，自动选模型为主要设置，备用放在“故障接管”的高级设置。前一“两入口”候选f8626f148已取代并已通知既有 desktop owner 停用。本次继续使用用户确认的 https://github.com/heavenzhang/MoXBots.git。

## Acceptance criteria / To Do List

- [x] 一个模型策略入口；供应商页不挂载两张策略卡片。
- [x] 自动选模型为主区域；故障接管默认折叠，展开后才显示备用配置。
- [x] 已启用指定备用的状态在折叠摘要可见；禁用时如实显示未启用。
- [x] 中英文、窄窗口档位纵排、旧导航意图转到统一入口并正确消费。
- [x] 50项DOM及实际组件合成浏览器三宽度/键盘/保存/刷新/失败验证；产品服务端逻辑与配置shape不变。
- [x] 最终 TypeScript/lint 通过；最终提交/远端同步和 handoff gate 以工作区同任务 result.json 精确回执为准。
- [ ] 唯一 desktop CI/main owner 统一集成、远端 main 验证。
- [ ] 下一未冻结制品及原生配置/真实 Provider/生产验收。

## Completed

模型策略统一入口及高级折叠区、状态摘要、旧导航规范化、中英文与响应式修订已完成。未修改用户配置或服务端接管机制。

## Verification

`dev-docs/model-settings-20261022/acceptance.md` 与 `evidence/unified/browser-results.json` 为最终验收记录。根 evidence 两入口截图是历史；最终以 unified 子目录为准。浏览器为真实 SettingsPage + 合成配置/API，无真实账号/Provider；主 Agent 自验，无独立 reviewer。服务端未改，保留初版31项回归不重复运行。

## Blockers and unknowns

现有 desktop owner 唯一负责共享 CI/main/构建/发布。开发会话不主动建PR/运行共享CI/打包/替换日常App。当前功能分支不是已主干/已发布；接收回执、最终远端与后续版本状态见工作区 result.json 和发布队列。

## Deployment request

- Required: desktop client UI，仅 renderer settings/navigation/i18n，含窄窗口布局。
- Owner: 01a12bc2-907a-7702-b6dd-788225c5dfe4，沿用 canonical plan；不改变其当前冻结候选。
- Handoff: 本任务分支的最新精确远端 SHA，本记录与最终验收证据；旧两入口请求已取代。
- Dependencies: 既有 main 自动路由组件；无跨单元依赖、schema或协议迁移，保留 config shape 和原回滚制品。
- Status: 源码/本地合成验收完成；共享 CI/main/下一未冻结发行和原生验收待 owner。
- Version/tag/artifact digest: 未分配，继续由既有 owner 唯一管理。

## Next step

desktop owner 取得本分支最新精确 SHA，使用最终统一入口版本替代旧f862请求；同步实际 main，组织其统一CI和正常合入，核实远端main包含最终成果，再在下一未冻结制品组织原生导航/折叠/配置落盘验证。
