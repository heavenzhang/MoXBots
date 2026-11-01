# MB-CROSS-END-WORKFLOW-01

第一批：以主干630ae62e为基线，修正桌面看板完成/验收/归档语义及手机入口描述。

- [x] 核实实际主干、仓库、任务归属和并发开发；隔离worktree。
- [x] 确定本批契约与依赖。
- [x] 状态投影与归档入口修正，手机原会话入口对齐。
- [x] 定向单元/DOM、类型、lint、实际浏览器页面走查。
- [ ] 提交推送，交原owner统一CI与main交付。
- [ ] 主干包含、发布、真实双端验收分别取证。

## 完成标准

空闲/近期活跃/工具返回不建立完成事实；待验收不在已完成列；归档不写done；已完成Task仍可独立归档/恢复；原会话和Bot身份不变；手机打开动作明确不自动重试。

## 依赖与排除

本批只复用既有Task/Goal/Session owner，无协议/Store迁移。TaskStore done仍表示既有显式完成状态，不宣称其是Session子任务账本的验收。Bot多项目身份M2由已有桌面开发线处理，避免重复实现。后续：同源成果版本/审批/真实两端同步按原计划推进。

部署单元：desktop/macOS/updater/sharedCI/main owner01a12bc2-907a-7702-b6dd-788225c5dfe4；mobile iOS/Android owner01a12b99-7b38-78b1-831f-9c60257d386a。开发会话只提交push不触发PR或共享CI；原owner选择下一未冻结批次。不分配版本、不替换日常App。
