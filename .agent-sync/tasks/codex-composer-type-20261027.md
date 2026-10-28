# MB-COMPOSER-TYPE-20261027

目标：截图红框内输入正文及灰色建议从16px调为14px，与现有工具栏协调；保留12px提示及26px测量行高。

- 仓库：https://github.com/heavenzhang/MoXBots.git
- 分支：codex/composer-type-20261027
- Base：caab6ab648b434bee17930f90c4df4de87564bba
- 开发/UI自验负责人：01a178f6-1442-7162-8a95-bf328da068cd（当前Agent，0子Agent）。
- 部署单元：desktop/macOS-arm64/updater；combined CI/main/正式构建/版本/发布沿用01a12bc2-907a-7702-b6dd-788225c5dfe4。

## To Do List

- [x] 核实仓库、最新main、干净隔离分支及发布归属。
- [x] 调整输入正文与建议字号并同步设计约定。
- [x] 实际生产组件渲染：Chromium/WebKit、宽/窄、明/暗、长文本、建议接受/取消、输入与发送；相关既有测试/type/lint。
- [x] 源码与验收成果提交并推送开发分支（产品提交4213abc54）；发布请求登记WPS工作区work/release-queue/MB-COMPOSER-TYPE-20261027.json。
- [ ] 原负责人统一CI/main并核实远端main包含成果。
- [ ] 下一未冻结签名制品发布和原生实际路径验收。

验收基准：输入和ghost均14px/26px，提示12px，现有工具栏14px；长文本自然换行、横轴无溢出、建议接受后几何一致，既有IME和发送行为通过。
范围仅renderer样式和设计说明，无协议、数据迁移、Provider或业务写入；真实Provider联调不适用。正式App验收由既有发布会话完成，本聊天不触发共享CI、不安装/重启日常App。
依赖：复用既有依赖树与本地loopback组件夹具；后续依赖发布owner选择批次。
下一步：提交推送精确源码和证据，在既有队列登记，由原负责人组织CI/main及下一未冻结发布。证据：dev-docs/composer-type-20261027/。

本地产品/界面检查全部通过，远端分支已保存；本记录的后续提交仅更新交付状态。CI/main、正式制品和原生验收未完成，不声明用户当前App已生效。
