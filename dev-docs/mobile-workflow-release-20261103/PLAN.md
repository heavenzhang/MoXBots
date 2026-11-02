# MB-CROSS-END-WORKFLOW-01 · 手机第一批测试交付

用户2026-11-03明确要求发布到自己的手机体验。基线origin/main186f88dc，当前Kevin iPhone16ProMax connected，沿原手机owner最近安装目标。

- [x] 核实source/main及旧build8实际没有本次增量；核实原owner。
- [x] 从95390685抽取mobile三文件；补齐可见状态说明。
- [ ] 全policy/type/lint、实际320/390组件验证。
- [ ] 推送精确源码，原shared CI/main owner独审并组织CI/main。
- [ ] 原手机owner分配新版本build、签名新包、核验摘要及能力。
- [ ] 同一手机原位升级，读回版本和启动可见页面。

范围：V10第一批状态/入口语义。打开不重试、不发消息；本轮结束不代替任务验收。完整项目/审批/成果迭代主线未实现；不能把build9或任何新包称完整V10。

单Agent开发；本轮为三文件呈现修正，按顺序复用原owner独审、集成、CI与mobile打包，不另起协作写入者。无新协议/Store/权限/运行owner，无Mac安装/云变更。

单元与负责会话：sharedCI/main/desktop01a12bc2-907a-7702-b6dd-788225c5dfe4；mobile iOS/Android01a12b99-7b38-78b1-831f-9c60257d386a。版本号由mobile owner唯一分配，候选SHA固定后构建，不覆盖旧build8/签名包。
