# MB-STREAM-STABILITY-20261106 验收记录

## 结论与范围

源码修复和离线验证完成，未发布、未安装新包，原会话新版本复验仍待原桌面owner完成。用户报告当前执行过程跳跃闪烁且存在多次执行失败；本次分别处理一个确定的Renderer高度抖动根因和只读回执诊断，不重放业务工具、不修改原会话/模型/凭据/账本。

当前安装0.5.42/542.6已含较早的committed virtual extent修复。本次是独立的消息生命周期判断缺陷，不应把此前静态/长JSON验收等同于已覆盖本次工具交替间隙。

## 根因与改动

Message原先以isLoading && hasIncompleteBlocks向BlockGroup投影live。工具结果结束到下一块开始之间，hasIncompleteBlocks短暂为false，于是所有成功过程组变成历史并折叠；下一块开始又恢复，导致高度和底部位置大幅往返。

现直接使用当前消息owner的isLoading维持live，只有消息真实结束才进入历史折叠。ProcessRow/getProcessOutcome仍依据每行实际完成位和结果独立显示：已完成行不变成执行中，失败、停止、未知及子Agent导航仍保留。没有延时/重试/额外滚动owner或虚假终态。

## 验证

- [x] 旧码真实Message DOM回归RED，2/2因工具完成空档隐藏成功行而失败。
- [x] 新码6文件71项通过；主Agent与独立审阅者各运行一次。覆盖Message过程连续性、streamtail、整轮折叠、BlockGroup、ProcessRow、follow motion。
- [x] 真实MessageList/Virtuoso离线WebKit反事实：旧码过程高度1569.40625→113.390625px，可见过程行25→0；确切复现空档收缩，非测试超时。
- [x] 修复WebKit与Chromium均通过3次工具/思考交替：每个间隙scrollTop、scrollHeight及消息高度变化均0px；随后手动上滚250px的follow=false位置保持不变；真实终态仍折叠，手动展开28行。
- [x] 上述页面为合成数据，仅loopback GET；未使用用户Chrome账号，未调用真实模型或业务工具。WebKit截图由主Agent查看，样式/边界无新增变化。
- [x] Node24 tsc --noEmit、定向ESLint、test classification、git diff --check通过。
- [x] 只读独立源码审阅无finding，检查Provider空结果、缺失输出、子Agent生命周期、人工展开与终态折叠。该审查不等于独立原生UI验收。
- [ ] 原owner统一共享CI/main。
- [ ] 原owner分配下一未冻结版本，构建/签名/安装后在原会话按实际缩放复验工具交替、阅读、展开、切换与终态。

命令：Node24运行vitest --project dom，文件为Message.processContinuity.test.tsx、Message.streamtail.test.tsx、Message.turnMeta.test.tsx、BlockGroup.test.tsx、ProcessRow.test.tsx、hooks/useChatFollowMotion.test.tsx。浏览器命令node scripts/verify-chat-process-continuity.mjs webkit --baseline（预期失败）、webkit及chromium。Chromium本机预期revision缓存不存在，复用已安装的独立headless shell1223，通过MOXBOTS_SCROLL_CHROMIUM_PATH指定；没有下载、使用个人profile或绕过缺失的检查。最初夹具计数预期有误导致一次等待超时，修正夹具的相邻同类阶段合并后才得到上述有效反事实，不将该超时作为旧码复现证据。

几何证据见[evidence.json](evidence.json)。截图与私有原回执只保留工作区work/MB-STREAM-STABILITY-20261106，不入公共源码。

## 执行失败诊断（与UI分开）

21:13之后的有限窗口共277个工具、28个失败标志。截图21:27:50–21:28:03窗口两次失败均为execution_review输入漏参/字段类型错误；正确queueId/assessment/checks[].criterion:number/toolUseIds合同已在原native提醒中提供，未发现schema漂移。其他失败还包含任务revision冲突、路径/搜索/编辑错误，不能将所有失败解释成界面或runtime故障。

“证据不属于当前native generation”来自成功list查询的验收资格投影，不是CLI执行失败；后续5个新Read已获得有效epoch。还有一个原Git组合操作的Exit128保留为unknown，必须由原恢复owner核对原native回执与journal，不能自动重跑或清除；本次不放松验收和未知操作围栏。

## 部署交接与限制

单元desktop/macOS-arm64/updater/sharedCI/main唯一owner：01a12bc2-907a-7702-b6dd-788225c5dfe4。开发分支codex/stream-stability-20261106，基线045b30eef4caf827249934539b6d0197674266b4。仅修改Renderer，无迁移、云端发布或新权限，冻结542.6保持原制品。原owner统一CI/main、下一批版本和原会话验收。后端业务任务仍由原会话处理，不由本次UI回归代验。

## 执行记录

主Agent负责诊断、实现、双引擎页面与整体验收；一个execution_failures子Agent负责只读失败诊断及后续独立源码/DOM复核。两者均沿用运行时现有设置，未覆盖模型/推理档位，精确型号和用量未取得运行时证明。选择依据：回执与UI可独立，浏览器由主Agent独占；未发生模型升级。不调用外部原因：明确采用ai-yaoren-local纯内置模式。

本次产品修复1轮；夹具先修计数预期及测试类型声明，再完成确定性验证。成本/收益未测，不估算节省。复盘：按消息owner维护live资格比继续调平滑滚动更直接；今后持续输出验收加入工具完成到下一块的空档，避免只验静态长回复。
