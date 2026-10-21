# MOXBOTS-MODEL-SETTINGS-20261022 — 模型策略统一入口

按用户最终确认方案：侧栏仅保留“模型策略”，自动选模型为主要设置，备用模型归入默认折叠的“故障接管 · 高级设置”。已启用指定备用时，折叠摘要仍显示状态。供应商页仅负责供应商接入。

仓库 https://github.com/heavenzhang/MoXBots.git；分支 codex/model-settings-20261022；原始基线85981a95b5c9a8e8736d680572e2813b1f7809fd。前一两入口候选f8626f148已被本方案取代，且已通知既有 desktop owner 停用；此前截图留在 evidence 根目录作为历史，不代表最终界面。

## To Do List

- [x] 核实 main、任务分支/远端、干净工作树和既有部署负责人；沿用隔离源码目录。
- [x] 单一入口、自动选模型主区域、故障接管高级折叠区及指定备用启用状态。
- [x] model-policy 为 canonical section；auto-routing/model-failover 旧导航意图转到统一页，保留一次性导航消费行为。
- [x] 两配置仍由原 writer 保存；无配置迁移、凭据、服务端恢复逻辑或用户数据变更。
- [x] 中文和英文，模型档位窄窗口纵向排列、宽桌面三列。
- [x] 6 files / 50 DOM tests 通过；初版31项服务端路由/主备回归保留，服务端输入未变无需重跑。
- [x] 真实 SettingsPage 本地浏览器视觉、交互、键盘、失败状态与三尺寸检查通过。
- [x] 最终增量 TypeScript/lint 通过；最终提交/远端同步 gate 回执保存在工作区 result.json。
- [ ] desktop owner 统一 CI/main 集成及远端主干验证。
- [ ] owner 下一未冻结制品与原生用户路径验收。

## 实现与策略边界

`SettingsPage` 只挂载统一模型策略页，故障接管使用原生 details/summary，默认折叠、键盘 Enter 可操作。`ModelFailoverSettings` 的选择、开关、保存错误等逻辑沿用。折叠区标明“已启用指定备用”或“未启用指定备用”，不会把保存但关闭的配置误称不存在。原有 settings navigation owner 使用一个纯 helper 规范化前一入口意图，先前输入来源变化仍会通知 host 消费。

自动路由仍在轮次开始时选模型；既有主备控制器优先启用的指定备用，否则可读取自动模式提供的同档备用。同档没有其他可用候选，或兼容性/安全条件不满足时，不保证切换。本次没有改变 SDK/API 适用范围和防重复执行约束。

## 验证证据

Node 24：DOM 范围为 AutoRoutingSettings、ModelFailoverSettings、SettingsSidebar.i18n、useSettingsNavigation、SettingsPage.visionTool.dom、SettingsPage.linux.dom。最终 50 tests 通过；覆盖唯一侧栏入口、主要区域、默认折叠、已启用摘要、展开/收起、页面切换及前一导航意图兼容。运行时未改变，初版31项回归结果保留。

`fixture.tsx` 渲染真实产品 SettingsPage/Sidebar/卡片；仅配置状态、浏览器持久化和目录/API 为合成 transport。`serve.mjs` 只监听127.0.0.1:8924并关闭 proxy，不读取真实账号/目录/凭据。运行方式：Node24启动 serve.mjs，另一终端运行 browser-check.mjs。

最终结果位于 `evidence/unified/browser-results.json`。三宽度1440/768/390分别检查折叠/展开、无页面横溢出，档位卡片宽度均大于200px，窄窗口纵向排列、1440宽度三列。验证自动开关和指定备用选择/启用互不覆盖，导航及刷新后合成配置保留；目录失败仍可打开高级配置；保存失败保留旧值并维持展开；中英文显示正确、0 page errors。

主 Agent 实际查看 policy-collapsed-1440.png、policy-collapsed-390.png、policy-expanded-390.png，复核层级、文字可读性、折叠摘要和控件。发现初轮390宽度三列导致模型名不可读后，调整为窄窗口单列并完整重跑浏览器验证。自验不冒称独立 review、原生落盘、真实 Provider 或生产验收。

## 交付与执行记录

部署单元 desktop client；唯一 CI/main/构建/发布会话继续为01a12bc2-907a-7702-b6dd-788225c5dfe4。开发会话只提交功能分支和证据，不开自动触发共享 CI 的 PR，不构建/替换日常客户端。无 cloud/Host/手机原生/协议/schema变动；版本、候选 SHA、制品摘要和原生发行由 owner 分配。当前未发布，不能将发送请求等同接收或上线。

当前 Agent 单人实现和主审。选择依据：已有页面的小范围结构调整；独立并发会重复上下文，未启动子 Agent；外部调用0，确定性工具足够。模型未切换，token/费用未知，升级/回退无。修复记录：窄窗口排版一轮；未重复跑不受影响的服务端用例。后续同类导航更改同时覆盖 raw intent 消费和规范化目标，避免仅测页面显示。
