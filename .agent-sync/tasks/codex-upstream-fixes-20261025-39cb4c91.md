<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/upstream-fixes-20261025 -->
<!-- git-project-sync-task:base=848e333455c7045534bf51a951a19b6945c6aa1a -->
<!-- git-project-sync-task:status=in-progress -->

# Task: MB-UPSTREAM-FIXES-20261025 八组上游稳定性修复与主干交付

## Objective

按用户2026-10-25明确授权，把已审查的八组 MyAgents 稳定性修复适配到 MoXBots，保留当前导航、模型管理、恢复授权、Stop、原任务身份和预算。完成独立本地验收，交既有负责人协调共享 CI/main，回读远端主干，再交对应部署单元下一未冻结批统一发布。

目标仓库 `https://github.com/heavenzhang/MoXBots.git`；上游 `https://github.com/hAcKlyc/MyAgents.git` 固定 `9d7f3710da46188e53bfe32ad8390a8343fc13ea`。不引入 IM 卡片/黑名单、运行环境升级、模型服务商或导航重设计。本轮不安装/重启日常 App，不操作用户业务或记忆数据。

## Acceptance criteria

- [x] 输入恢复：ambient/display task 不永久阻止精确 Query 重建；真实后台活动仍阻挡，Stop 后新消息可接纳。
- [x] 新对话：旧会话忙碌、恢复或绑定渠道时独立新建；旧任务/历史/绑定保留，新消息不混入旧 projection。
- [x] WebView/SSE：重载恢复标签，快照/分页恢复不堵塞 SSE；保留 MoXBots 原恢复/ledger/Stop机制。
- [x] Native：配对 JS/Rust 事件释放与原生退出投影，既有精确进程组清理、升级重启和录音确认保持。
- [x] 滚动：旧索引事务让位于新滚动；小数尺寸保留，Chrome/WebKit必要回归。
- [x] Runtime：显式 Claude SDK 不被默认 DSH 替代；DSH 恢复失败退役对应代次，不重放不确定操作。
- [x] 记忆：已有自定义规则由初始化、维护脚本及任务提示共同尊重，不修改用户真实文件。
- [x] 渠道：停止再启用按候选配置校验；拒绝时不落盘。
- [x] 主 Agent 完整 diff 审查、关键 Node/Rust/DOM/隔离原生与页面检查通过；保留失败和证据。
- [ ] 同步最新 main、遵守既有负责人 CI/主干流程、远端主干包含本任务；精确 SHA/证据交接并确认接收。

## Completed

- 已核实源工作区干净、remote/HEAD/远端 main；创建隔离工作树，start/task-init通过。
- 已向既有桌面负责人预登记；不把预登记视为候选接收/CI/发布。

## To Do List / execution

| 工作包 | Owner / 分支 | 状态 | 依赖与下一步 |
| --- | --- | --- | --- |
| 1 输入、6 Runtime、8 渠道、整体集成 | root / codex/upstream-fixes-20261025 | 本地验收完成 | 候选推送、原owner共享CI/main及远端核验 |
| 2 新对话、3 重载/SSE | session_transitions / codex/upstream-transitions-20261025 | 已集成并修复Rust窄依赖 | Node/DOM和组合Rust通过，保留原owner门禁 |
| 4 Native 退出/事件 | native_lifecycle / codex/upstream-native-20261025 | 已集成/验收 | 配对vendor/真实fixture通过；附必要Windows字节保护 |
| 5 滚动、7 记忆 | scroll_memory / codex/upstream-scroll-memory-20261025 | 已集成/验收 | Chromium/WebKit、跨语言parity/Task/Skill62通过 |
| 独立验收 | 复用非实现者工作 Agent | 已完成本地审阅 | 395项切换、67项DOM/7项滚动补丁独立复跑；不替代真实Provider/安装验收 |

选择依据：三条工作线可用独立 worktree 隔离；原生及切换跨层风险使用 sol/high，确定性滚动/记忆使用 luna/medium。当前主 Agent 不声称切换模型。外部未调用：内置 Agent 直接操作现有 Git/原生测试现场，避免另建工具回调链。实际 token/费用未知，后续只报告实测。

## Deployment requests

| 部署单元 | 负责人 | 本次状态/门槛 |
| --- | --- | --- |
| desktop/macOS/updater、combined CI/main | `01a12bc2-907a-7702-b6dd-788225c5dfe4` / MoxBots桌面端统一打包负责人 | 复用既有指定；开发者不触发共享 CI/正式构建，不分配版本。提交完整证据后由其选择下一未冻结批；当前已预登记 |
| 共用 server 源码的 Host 软件 | `01a12b99-7b38-78b1-831f-9c60257d386a` | 沿用 plan 的原 Host/mobile owner；精确范围及依赖在候选冻结后交接。无服务协议/数据库变更，独立发布/回滚 |

源码、本地模拟、共享 CI/main、制品发布、真实原生/Provider/业务路径分别记录。生产/已安装验收由对应负责人统一组织，开发结果不替代发布状态。

## Verification

- `project-sync observe/start/task-init --remote https://github.com/heavenzhang/MoXBots.git`：PASS，基线见头部。
- 检查证据位于 `dev-docs/upstream-fixes-20261025/`（本轮生成）。
- 组合：Node1387、Rust211（1既有opt-in忽略）、script344（14平台skip）、类型、lint、Clippy redlines、dep边界、license/theme/Web构建、Chromium/WebKit和隔离原生fixture通过。失败、并发控制与全仓Rustfmt既有差异见acceptance；不得简化为所有检查或生产均已通过。

## Blockers and unknowns

- 当前没有开发授权阻断。版本分配、共享 CI、正式构建与已安装/真实 Provider 验收继续归既有负责人。
- 原生 fixture/隔离浏览器只证明相应局部行为，不是日常客户端或真实外部 IM 验收。

## Next step

- 固定远端候选、同步最新main，向 `01a12bc2` 提交精确SHA/base/tree及证据，请其协调共享CI/main；本聊天跟踪到远端main确实包含成果，再向两单元正式交接。
