# 手机可靠性主流程独立审阅

任务：MOXBOT-MOBILE-20261101。审阅范围：主 Agent 修改的 index.tsx、draftPersistence.ts、deliveryPolicy.ts、recentSessionRead.ts、native.ts、mobilePolicy.ts。只读静态审阅，无产品文件修改、CI、发布。本审阅者实现了最近会话 UI，故该 UI 不包含在独立审阅结论中。

## 第一轮发现（第二轮状态见文末）

### P1：重启后列表页确认 accepted，已发送原文仍作为可编辑草稿恢复

位置：index.tsx queryPending 的 canSettleRestored（约 1234–1237）、accepted 结算（约 1266–1272）。

可复现顺序：
1. 在已有会话输入消息，保存本机草稿，发送获得 processing 或未知状态。
2. 杀进程并重启，进入默认会话列表；原生 journal 恢复 pending，JS submittedDraftsRef 为空。
3. 列表页自动或手动查询原操作得到 accepted。
4. canSettleRestored 因 queryOwner.screen 不是 chat 为 false；settleSubmitted 因没有内存 ticket 无法清草稿，但 pending 被移除。
5. 打开原会话：本机原文重新加载；已无 pending，也无内存 ticket，允许同一原文用新 UUID 再次发送。

新建会话的 null 草稿也存在该风险。需要针对操作原始草稿 scope 做账户级安全结算，比较提交原文与持久草稿及版本，保留真正的新编辑，而不是仅结算当前 chat 草稿。添加重启 → 停留列表 → 自动 accepted → 打开会话回归。

### P1：自动 receipt 查询在切视图时丢弃本账户有效结算结果

位置：index.tsx queryPending currentAccount 将 eligible() 与账户代数检查合并（约 1232），await 后 early return（约 1245、1262），receipt poll eligible 带精确 view owner（约 1292–1294）。

可复现顺序：
1. 同一账户发送 processing 消息，原文草稿保留且有内存提交 ticket。
2. 自动 receipt 查询发出，在返回前切另一会话或返回列表；旧 poll cleanup/owner 变化使 eligible=false。
3. native 收到 accepted 后按既有 settle_journal 逻辑删除 pending record，再把 accepted 回给 JS。
4. JS await 后因 eligible=false early return，不执行 settleSubmitted/clearSubmitted。
5. 下次 loadAccount 读取 journal 后 pending=[]；提交 ticket 因渲染过滤条件失去隐藏效力，原文重新可编辑，可能重复发送。

应分离账户级结果结算与当前视图副作用：本账户且结果匹配原操作时仍处理结算；通知、导航、snapshot 才受 view/poll 门禁。添加延迟 receipt → 导航 → accepted → journal 无 pending → 返回原会话的测试。

## 非阻断观察

- 初次目录失败且尚无 target 时，断线自动恢复 effect 仅在 target.online===false 时启动，因此不会定时重试；手动刷新和重新前台可恢复。若要求无操作自动恢复，需覆盖 target=null 且目录失败路径。
- readRecentSessions 每轮先 publish([])，已有列表会在15秒刷新时先清空，再逐个重建；慢设备下会出现短暂空列表。失败隔离和双 worker 边界已正确实现，打开条目也会重新检查当前 target.online。
- 初次 snapshot 失败后的自动读取不再依赖已有 snapshot，且 owner/read flight 检查能防止旧会话结果覆盖新会话。
- 原生 pending schema 的 submittedText 为可选，旧 journal 返回兼容；stop/respond 无该字段。
- 曾怀疑 native error 后 journal 无 op 会永久隐藏草稿；当前渲染已用 sending/pending 筛选 submitted ticket，该条已撤销，未列为问题。

## 验证边界

以上 P1 为代码事件顺序审阅结论，尚未运行真实手机或新增主流程 harness。主 Agent 正在编写主流程测试，须用延迟原生响应、进程重启、原生 journal 结算语义验证。既有策略测试、tsc/lint 通过不能单独排除上述跨生命周期问题。


## 第二轮复核：原两条 P1 已修，发现一个首次发送未知状态漏口

本轮只读审阅主 Agent 修改；未修改产品源码，未重复执行主 Agent 已通过的测试与 UI 验收。以下位置为本轮代码状态，后续并发修改可能移动行号。

### 原 P1 结论

- 列表页 accepted 清草稿：已修。queryPending 在请求 receipt 前使用 pending 原 target、session、submittedText 调用 capturePending，后台读取不会切换活跃草稿 owner。accepted 对恢复 ticket 及内存 ticket 分别作版本/文本匹配清除。
- 导航时 receipt accepted 被丢弃：已修。queryPending 的 currentAccount 只检查账户 generation、principal；eligible 仅约束发请求前的资格。响应返回后账户结算不受 poll cleanup/视图变化影响，UI 通知和 snapshot 导航仍检查 viewStillOwned。
- accepted 后 snapshot 迟到：未发现新的 P0/P1。readSnapshot 使用 owner 精确epoch与 SnapshotReadTracker flight，finish 成功才 commit；receipt后发起的read另外绑定账户generation。切会话、账号导致owner变化后旧结果无法覆盖新视图。
- 首发前 persistSubmitted 等待已有flight；同文CAS冲突后读取desired相等可采纳saved，避免原生已清草稿后JS重复清空产生持续conflict。
- 初次 target=null 恢复与最近列表闪空：已修。目录恢复条件排除仅online=true；最近loader复用previous缓存，失败来源标offline，其余来源保留。

### 新 P1：首次发送发生未知错误时，导航使待确认保护完全跳过

位置：index.tsx retainFailedMutationUntilJournalCheck 开头的 isCurrentOwner 与 early return（约 423–425）；mutation/sendMobile catch；列表返回和打开原会话只 loadSessions/readSnapshot。

可复现顺序：
1. 会话 S 输入并持久化消息，点击发送；原生写入op O的journal并向远端发送，前端sendFlight=true。
2. 首次 RPC 尚未返回时，点击返回列表，再打开原会话 S（工具栏返回没有 sending 禁用）。
3. 远端可能已经接收，但本次 bridge/network RPC 抛错或响应丢失。
4. catch 调 retainFailedMutationUntilJournalCheck；旧 mutationOwner 与当前owner epoch不同，函数在任何 pending/journal 核对前return。
5. finally释放sending。JS pending仍空，submittedEdits由于 sending/pending过滤不再隐藏原文。当前S的本机草稿恢复为原文，发送按钮可用。
6. 用户再次发送产生新UUID，可能重复执行；旧O直到下一次loadAccount才可能被发现。native accepted清草稿只能处理获得accepted的路径，不能替代unknown journal保护。

建议：首次发送失败也区分账户级不确定操作恢复和视图级notice。捕获账户generation+principal，仍为同一账户时建立provisional并读journal，即使已经导航；视图门禁只用于notice。添加首次RPC延迟→导航回S→RPC抛错→journal含O→断言仅receipt可用的主流程测试。

### 验证与归属边界

主 Agent 本轮提供的证据：96 policy、133 native通过加1既有ignored、tsc/lint通过；UI processing→accepted、rejected恢复原文、发送响应丢失→两次回执读失败→成功与重开空草稿已通过。本审阅者未独立重跑这些证据，不把它们描述为本人实测。

本审阅者实现了原生drafts.rs/peer.rs补偿与最近UI；这两部分由主 Agent 审阅，不属于本人独立验收。旧journal没有草稿revision/writeId，完全相同文本后来重输的区分能力仍是既有协议边界；本轮未新增协议或存储authority。

## 第三轮最终复核：三条已发现 P1 均已修复

只读核对 index.tsx 当前实现：retainFailedMutationUntilJournalCheck 使用捕获的 accountGeneration 与 principal 独立判断账户有效性；即使原视图已导航，仍先建立 provisional pending，并在读取本机 journal 后核对原操作。viewStillOwned 仅约束提示。mutation 与 sendMobile 均捕获并传入账户 generation，在远端派发前及响应结算后校验 generation，因此同 principal 退出再登录也不会接收旧生命周期结果。

第三条“首次发送未知错误 + 导航跳过待确认保护”的原事件顺序已被修复；前两条 accepted 结算修复仍保留。本次限定复核未发现仍未关闭的 P0/P1。此结论限于所列主流程与事件顺序，不是完整产品或真实原生发布验收。

主 Agent 补充实际 IAB fixture 验收证据：首发响应延迟 3.5 秒后抛错，期间返回列表，navigation-pending-390.jpg 显示待确认；自动回执两次读取失败后 accepted；重新打开原会话草稿为空且原文消息计数为 1。这是主 Agent 执行并报告的模拟集成证据，本审阅者未重新操作浏览器或复跑测试，亦未将其描述为真实手机/生产验收。

本轮只更新本审阅文档，无产品源码修改、CI、构建、提交或发布。原生补偿与最近会话 UI 为本审阅者实现，仍由主 Agent 负责审查与整体验收。
