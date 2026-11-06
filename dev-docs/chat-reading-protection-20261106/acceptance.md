# MB-CHAT-STYLE-20261104 · 阅读保护接续

## 范围与验收顺序

CHAT08 由现有桌面owner补齐正常产品路径中的待确认/unknown原生样本；CHAT09阅读保护开发及离线准备可独立进行，但CHAT08不能被模拟测试替代或以无样本计通过。CHAT10本地验证；CHAT11精确分支/main及唯一桌面owner发布。当前CHAT08仍待owner协调原生验收，不能宣布完整交付。

基线main05ea1e2c4d06f112585012a27503adc75c184dcc已含PR256工具间隙连续性修复。本修改仅处理真实终态时阅读内容被自动收起，不改变工具结果、审批状态、账本或运行时终态。

## 改动

Message保留曾经live的DOM到终态提交，提交时采样既有follow意图、当前选区和已展开的过程详情。阅读者保留原过程分组和嵌套展开状态，直到明确收起；没有阅读意图则自动折叠。已完成历史首次挂载仍默认折叠，全文搜索继续展开。异步终态元数据晚于loading时等待transcript收尾，不提前决定。

MessageList每个可呈现列表只订阅一个selectionchange，并通过原ChatScrollController暂停跟随；不创建第二份滚动authority，不直接写scrollTop。保留过程时将新增收起入口放在消息末尾，避免往当前阅读内容之前插入高度。用户主动收起后沿原布局通知和虚拟列表更新。

## 已完成验证

- 旧Message DOM选中文字后终态隐藏的确定性RED；修复后18项Message turnMeta通过。
- 6文件104项DOM回归通过，覆盖手动详情、阅读意图锁定、晚到终态、历史默认、unknown可见、搜索、原块间隙与scroll owner。
- 真正MessageList/Virtuoso离线WebKit旧码反事实：终态25条可见过程变0，scrollTop9542降至7154（跳动2388px）。
- WebKit/Chromium受控页面：上翻、选区、工具详情三例终态前后阅读标记Y变化0px，25条过程保留，选区文本保留；正常跟随仍自动折叠且最终结果可见；手动收起可用。
- 页面使用合成输入、只允许loopback GET，无真实模型/业务工具调用。截图由主Agent查看，不能当作真实安装版卡片验收。
- 精确命令：Node24运行vitest --project dom的Message.turnMeta、Message.processContinuity、Message.streamtail、BlockGroup、useChatScrollController、useChatFollowMotion；浏览器 node scripts/verify-chat-reading-closeout.mjs webkit --baseline（预期断言失败）、webkit、chromium。Chromium使用现存独立headless shell1243，不使用个人浏览器profile。
- 数值证据见evidence.json；私有截图/原日志存工作区work/MB-CHAT-STYLE-20261104/reading-20261106。

完整Node24 typecheck、定向ESLint、test classification、diff check及原verify-chat-process-continuity WebKit回归通过。

## 仍需完成

- CHAT08真实待确认/unknown卡片默认可见、折叠外可见与恢复证明；旧quality-reference提示不是活动卡片。
- 新代码安装版长会话上翻、选区和详情的终态原生验收。
- main/共享CI/正式包/发布由desktop/macOS-arm64/updater唯一owner01a12bc2-907a-7702-b6dd-788225c5dfe4统一完成。开发分支codex/chat-reading-protection-20261106；当前543.1冻结批不含本修改，新成果进入下一未冻结批。无云/mobile/网站部署，无迁移或新权限。
