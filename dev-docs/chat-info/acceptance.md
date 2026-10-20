# MOXBOTS-CHAT-INFO-20261020-01

实施日期2026-10-20，实际界面验收于2026-10-21完成（Asia/Shanghai）。用户要求落实具体当前动作、关键节点进展、明确等待原因和可直接打开的成果入口；信息充分且不挤占对话空间。范围为桌面renderer，发布交既有唯一会话统一处理。

## 用户可见变化

- 原30px状态行以本轮live streaming message显示读取/更新的文件名、搜索目标或公开命令说明；并行数来自实际活动事件。无事件时明确等待模型，不扫描历史或读取私有思考，也不回显完整shell命令。兼容字符串消息的公开回复流。
- 原状态owner保持优先：启动、停止、上下文压缩、真实重试/恢复计时，以及等待用户授权、补充信息和计划确认分别呈现。交互等待无旋转动画；显示的耗时明确标注为本轮总耗时，避免冒充当前动作等待时长。没有新增轮询或永久面板。
- 原折叠过程行使用最多两个具体文件/结果线索和剩余项计数，保持事件顺序与公开进展正文；失败、运行、中断、未知保持原可见策略。单行省略、title与一次展开保留原始依据；不推断业务完成或生产验收。
- 原助手操作行加入已确认文件变更的直达预览，最多两个；容器变窄时保留一个文件、完整文件清单入口及短文件数标签，统计退入既有完整清单。沿原FileActionProvider执行文件存在性复验与预览，不从任意命令输出猜测产物。

## 代码与约束

`currentActivity.ts`是纯呈现投影。MessageList保留原Footer、Tab时钟和Virtuoso owner，移除旧随机文案及其局部lint suppression后，修复被暴露的原有render-phase引用问题：行数据通过已有Virtuoso context，事件回调的latest refs在layoutEffect同步；原可见提交快照改为同组件内的snapshot publisher，经useSyncExternalStore读取，仅在可见layoutEffect推进，hidden继续使用已提交快照。没有新增执行、业务或持久化authority。snapshot发布可能增加一次活跃render，memo依赖与相等检查阻止自循环；既有freeze/隐藏timer/测量回归已通过。

## 验证状态

| 层级 | 状态和证据 |
| --- | --- |
| 实现 | 四项均完成；代码和中英文文案在本任务分支 |
| 定向回归 | 最终12文件146项通过，含过程outcome、文件归属、状态优先级、历史隔离、字符串兼容、模型恢复倒计时、隐藏计时器、Virtuoso冻结/测量、原生runtime操作和引用 |
| 类型与lint | 完整tsc --noEmit、修改文件ESLint通过；测试分类通过。依赖检查0 errors/18既有warnings，未增加跨层依赖 |
| 本地renderer构建 | Vite生产renderer构建通过；最终源重建记录由交付回执核实。非正式构建、非签名制品 |
| 主Agent实际页面 | `browser-check.mjs`运行真实MessageList/Message/BlockGroup/文件操作与预览组件；1440×900、768×1024、390×844；单30px状态、公开进展、键盘折叠、文件正文、完整列表、草稿和中英文暗色通过；[JSON](evidence/ui-evidence.json) |
| 独立实际页面 | 主17组与最后受影响区域复验通过；已实际查看截图；[报告](independent-review.md)、[证据](independent-evidence/report.json) |
| 真实联调 | 受控合成transcript与原生文件传输mock，沿原文件检查/读取与真实预览组件；未调用真实模型、账号或原生日常App |
| 主干/CI | 由交付回执和远端refs记录最终状态；本地通过不是共享CI或main交付 |
| 生产/安装版 | 本开发会话未构建正式包、安装、重启或发布。既定publisher接收后按其冻结批次验证 |

## 实际页面与复现

在已有依赖下用Node24运行 `node dev-docs/chat-info/serve.mjs`，地址 `http://127.0.0.1:8918/chat-info-qa`；另运行 `node dev-docs/chat-info/browser-check.mjs`。Playwright使用独立headless Chromium，`CHAT_INFO_CHROMIUM`可指定本地测试浏览器。独立验证脚本为`independent-check.mjs`及`independent-responsive-refresh.mjs`。所有事件、文件正文与workspace均为显式合成数据，不读取用户磁盘或账号。

截图：[宽窗](evidence/01-wide-light.png)、[390窄窗](evidence/02-width-390-light.png)、[原文件预览](evidence/03-file-preview-390.png)、[暗色英文](evidence/04-dark-english-390.png)。独立证据另保留三尺寸明暗、键盘展开和最终短标签复验。

## 问题修复与边界

初轮发现并修复：非法FileIcon尺寸；夹具父容器零高度与缺分页索引；文件排序/状态selector误判；窄窗文件图标化与清单标签截断；受控Tauri事件mock遗漏unregisterListener；原组件被旧lint suppression隐藏的引用问题。没有降低门禁或将DOM可见代替实际可见页面。初轮日志及最终回归原文保留在本机任务工作证据中。

保留一条来源未定的Virtuoso missing-key开发console warning；无未关闭的本次产品阻断、无NaN索引或uncaught浏览器异常。原FilePreviewModal集中Cmd+W关闭，不因夹具未挂App全局键盘而新增Escape行为；实际验证通过关闭按钮返回，文件清单原Escape路径已通过。未宣称全量无障碍、真实provider、真实文件系统、已安装客户端或生产验收。

## 发布交接与执行记录

桌面/updater单元required，既有负责会话`01a12bc2-907a-7702-b6dd-788225c5dfe4`。不修改其已冻结候选或分配新正式版本；下一适当未冻结批次接收本任务精确提交，回滚由该owner使用原制品。无协议、配置迁移、敏感权限、云/Host/mobile/Windows发布依赖。

root负责状态呈现、集成与最终验收；process_artifacts负责过程摘要/文件入口；ui_review独立源码和真实浏览器验收。请求模型分别为gpt-6-luna/medium和gpt-6.1-sol/medium；实际token/费用未知。选择依据是互斥组件实现与独立布局判断；无外部模型调用，无额外编排层。窄窗缺陷原worker修复、原reviewer复验，最终由root核对。task记录位于`.agent-sync/tasks/codex-chat-info-20261020-a322def5.md`。
