# MB-MOBILE-CONTINUE-03 独立审阅

审阅者：独立 UI / 源码审阅子任务 `continue03_review`；未参与产品实现。请求模型为 gpt-6.1-sol / medium，未取得独立运行时用量数据。

审阅范围：基线 `05ea1e2c4d06f112585012a27503adc75c184dcc` 上本轮六文件未提交 diff。仅审查，未操作共享 CI、构建、发布或生产数据。

## 源码审查

- 已阅读 `ConversationWorkPanel.tsx`、`conversationWork.ts`、`app/index.tsx`、`native.ts`、`qa/fixture.ts`、`tests/conversationWork.test.ts` 的本轮修改及邻近状态/提交处理。
- 最新源码复核通过，无未解决 P1 / P2；审阅期间确认的 C03-R1 已修复，历史与关闭证据见下文。
- 请求视图按 waiting_user_action / generation / turn 过滤；卡片按 generation / turn / requestId 隔离。
- 同一 owner 内切换对话与待处理采用隐藏而非卸载，回答本地状态可以保留；请求视图另以 principal / identityKey / agentId / requestedSessionId 作为 scope key。
- 原 `respond` 的刷新 preflight、view owner 检查、approvalStillCurrent、mutation 及 unknown-operation mutation fence 沿用，没有新增提交旁路。
- 对话阅读位置通过 scroll metrics / follow 状态恢复；主审已完成实际组件交互核验，记录切换前后 scrollTop 均为 2035。本审阅仅独立核对源码与截图，未独立执行该交互。

## UI 验收状态

当前最终状态：源码与 320 / 390 截图视觉复核通过；独立 UI 交互因子线程 IAB 不可用而未验证。主审已在本地合成数据环境完成实际组件交互，包括固定入口、阅读位置与输入保留、成果往返和继续修改、过期审批 preflight 与未知回执保护，详见 `evidence/primary-checks.json` 及下文证据归属说明；这些结果属于主审验收，不等同于独立交互通过。

React Native iOS / Android 实机显示隐藏、键盘及布局行为不在本次浏览器 fixture 可证范围，保持未验证；浏览器 fixture 也不证明真实账号联调或生产验收。

## 独立视觉复核与工具限制

独立审阅已实际读取主审保存的 `evidence/requests-320.jpg`、`requests-390.jpg`、`artifact-draft-320.jpg`、`reading-position-320.jpg`。320 / 390 宽下固定入口清晰、请求内容与取消/提交按钮可读，所见画面未出现横向溢出或按钮遮挡。成果修改草稿截图能看到原草稿及引用开头，输入区使用内部滚动。未读取或采用 `hot-refresh-invalid-draft-320.jpg` 作为验收证据。

该视觉判断由独立审阅者作出，但截图、交互和 `primary-checks.json` 均由主审产生，不能表述为独立交互验收。子线程尝试 `cua.createBrowserTab('iab', 'http://127.0.0.1:18826/')` 返回 `Browser is not available: iab`；可见浏览器只有 Chrome / Brave。未切换至用户浏览器，未创建临时标签页，已提交 CUA completion。因此独立 UI 操作仍未验证；主审交互记录单独归属主审。

### C03-R1 [P2] 成果继续修改返回后未显示草稿（已关闭）

- 复现（主审执行）：待处理页 → 成果 → 继续修改。
- 实际：revisionDraft 成功带回，出现“已带回这份成果的引用，请补充修改要求后发送”，但 chatSection 仍是 requests，输入框隐藏；`requests-320.jpg` 可见该状态。
- 预期：继续修改成功追加后显示对话及现有草稿；普通成果查看返回可以保持待处理与回答。
- 独立源码核对：成果返回的 append 分支未改变 chatSection，而相同 owner 的 moveLoadedOwner 不一定调用 moveOwner，因此不保证恢复 conversation。
- 影响：核心继续修改动作落在不可直接编辑的界面，需用户自行发现并切回对话。
- 负责人：主审实现；状态：已按最新源码及主审修复截图独立复核关闭；未执行独立交互复测。


## 修复复核与最终结论

已核对最新 `app/index.tsx` diff：仅在 revisionDraft 追加成功且前置 owner / request 仍匹配时切回 conversation；已在对话中直接 focus，来自待处理时经 composer onLayout focus。普通成果返回分支不修改 section；切至待处理也清除待执行 focus 标记，避免后续误聚焦。

已独立实际查看新增四图：

- `evidence/revision-from-requests-fixed-320.jpg`：对话选中，输入框可见且有焦点边框，来源 Bot / 会话及修改要求可读。主审另报告已核对原草稿、精确 artifact ID / SHA 和回答往返保留；这些行为与精确值判断来自主审，单张图不独立证明。
- `evidence/stale-approval-320.jpg`：显示“审批信息已更新，尚未提交”，符合刷新 preflight 的反馈；未提交的实际请求数由主审交互记录负责。
- `evidence/unknown-receipt-320.jpg`：未知回执、保留原文、查询入口清晰，发送按钮呈禁用态；disabled 的实际属性检查来自主审。
- `evidence/old-artifact-after-send-320.jpg`：成果页继续显示原成果 ID / SHA，说明图中保留其可核对标识；发送前后相等的过程由主审交互记录负责。

最终：本次源码审查与 320 / 390 截图视觉复核通过，无未解决 P1 / P2；C03-R1 完成一轮修复并以源码 / 截图证据关闭。**独立 UI 交互未验证（子线程 IAB 不可用）**，不能将主审的本地合成数据交互表述为独立通过；iOS / Android 原生、真实账号后端联调与生产路径也未由本审阅执行。主审仍需承担整体交互验收和最终交付判断。

执行记录：仅本审阅子任务直接审查，未额外委派；仅修改本报告。等待主审浏览器释放后发现子线程能力缺口，未绕过到用户浏览器。经验：后续先核实独立审阅线程 IAB 能力，再将“独立交互”列为可执行门禁；截图审查与交互验证保持分别记账。用量 / 费用未由运行时提供，不作节省估计。
