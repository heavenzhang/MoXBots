# CHAT08-COLD：冷启动后恢复未确认结果提示

543.4 原生原样本复验发现：首次恢复核查 GET 在冷启动尚未就绪时返回409，SDK随后已就绪，但历史未变化，界面没有再次读取。原未决操作及账本保留；这次原生验收不通过。

沿已有 chat:status 通道附加当前 recovery owner 的不透明读取版本；SDK控制面就绪和当前Query等待器安装两个顺序均覆盖。读版本只在原完整核查门禁可用时提供。Tab只接纳显式属于当前Session的版本；Chat将其加入现有inspectRevision，继续由RecoveryActionReview去重、处理忙碌和过期响应。没有轮询、新的执行权限或发送动作；不改变检查/写入门禁、账本或原操作。

## 验证

- RED：原TabProvider和真实RecoveryActionReview组合，首次读失败，收到当前Session就绪通知后仍只读一次，预期两次失败。
- GREEN：响应先到/就绪先到均恢复一次读取及未确认事项展示；重复、无版本及外会话状态不引发重查，无reconcile写入。
- 168 DOM/3文件通过（TabProvider.activity、RecoveryActionReview、SessionRecoveryPanels）；20模拟集成通过，包含原恢复门禁和控制面/等待器两种顺序、被替换Query拒绝、账本不写入。
- Node24完整tsc、6源码/测试文件eslint、测试分类、diff检查通过。日志摘要见evidence.json。命令：Node24运行vitest --project dom上述3文件；--project integration recovery-review-warm-idle.integration.test.ts；tsc --noEmit及定向eslint。

## 原生和交付边界

本地fixture和状态事件模拟不是安装版证明。唯一桌面/sharedCI/main负责人01a12bc2-907a-7702-b6dd-788225c5dfe4接收精确源，审阅并纳入下一未冻结候选；543.4原签名包不修改。

下一候选先只读打开同一原未决样本，验证提示、原工具定位和重开保留，无新增发送、继续或重放；随后真实Codex审批与阅读/选区/详情保护、正常自动折叠与展开顺序。成果和待确认事项需始终可见。原生门禁全部通过后才由同一owner统一发布。
