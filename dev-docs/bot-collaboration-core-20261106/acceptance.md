# MB-BOT-CORE-20261106 · 主干准备验收

用户明确要求两批SimpleUX合入主干，并将桌面端收敛为以Bot协作为核心。

本工作树为本地组合准备，基线05ea1e2c4d06f112585012a27503adc75c184dcc。保留59faa99和f815453的Git ancestry；不是向main直接推送，不触发共享CI/PR或正式构建。

## 合并决策

- 保留主干全部流式/恢复/输入稳定性代码，合入两批功能与源验收记录。
- 主干已存在window级工作区偏好。新增workspace偏好优先，缺失时只读旧global值；不写回或清空旧global键。窄窗仍不自动打开覆盖对话的drawer；原文件定位打开不写默认。
- 保留主干工具入口sr-only，加入首批aria与模型Tip/完整名称；第二批组件/投影及对应测试和f815453字节一致。
- 原主干计划完整保留，再追加两批记录与本次Bot协作路线，不删除其他owner状态。

## 本地失败与修复

初次本地冲突处理正则错误截断Chat/SimpleChatInput，产生的中间本地合并提交7a11afe6未被当作候选交接。保留该历史作为复现证据；从精确05ea1e2完整源码恢复两文件，再逐项重施已审两批必要改动。最终相对05ea1e2的差异均为局部修改，独立review确认没有截断/丢失主干逻辑。不重写历史，不影响两批原始提交或远端main。

## 最终验证

- unit 5文件116项，DOM 15文件244项，主题8项通过。
- TypeScript与修改文件ESLint通过；classification通过；depcruise零错误20已有warning。
- MYAGENTS_BUILD_PROFILE=moxbot npm run build:web通过。
- 非实现者simple_ux_review独立34项通过，diff --check通过；确认完整主干代码及两批功能保留。
- 审阅文件blob：Chat 8c7aed33616149ef54c21ff602bfca66d7b009f4；SimpleChatInput 7a74fd1f630b3e45b1d899114aea08dca4ce0e52。
- 第二批既有IAB合成组件证据保留；本次组合没有重启日常App或冒称原生文件IO验收。

原始日志在本地协作目录work/MB-BOT-CORE-20261106/logs/，独立日志simple-main-ready-independent.log。

## 交付与后续

源码/本地/独立审阅已通过；远端任务分支保存/handoff、原owner共享CI/main、正式包及原生真实路径分别追踪。唯一desktop/macOS-arm64/updater/sharedCI/main负责人仍01a12bc2-907a-7702-b6dd-788225c5dfe4。保留其当前543.1与后续543.2边界，不分配版本或覆盖制品。

Bot核心方向与BC-00～05稳定清单见PLAN.md。下一阶段是同账号/同设备两个稳定Bot的协作交接闭环；具体群状态和新增命令owner契约需先明确，本轮未实现或宣称M3已完成。
