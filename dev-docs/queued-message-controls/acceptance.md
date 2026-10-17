# MOXBOTS-QUEUE-UI-001 排队卡片

2026-10-17，隔离分支基线main 3e7fec64。主Agent直接实现与验收，零子Agent，未调用外部模型；精确用量/费用未知。此次小范围采用主Agent UI检查，无独立审阅。

## 故障证据与行为

用户截图中的 /compact 点击×无反馈。只读核对本机 `.moxbot/logs/unified-2026-10-17.log` 23:14：请求到达原Session，SDK cancel_async_message返回not-cancelled，HTTP409；TabProvider catch只写日志并返回null，UI不显示失败。按钮本身热区仅16px且只在hover显示；取消还同时恢复输入框，缺少独立编辑含义。

现在正文和操作分行；编辑/立即发送常驻，×独立取消，全部至少32px热区和可见键盘focus。立即发送Tip说明会停止当前回复。编辑只有在原queue owner确认撤回成功后恢复草稿；已有草稿先提示，不撤回；请求期间的新输入/图片合并保留。复审发现imperative handle的图片/上下文随render形成快照，已在await后重读当前handle，避免覆盖等待期间新增附件；改后125项、完整类型和Chat lint再次通过。取消不修改输入框。保留原Runtime能力位和optimistic项控制限制，零隐式Stop、零重发或假删除。

后端原拒绝状态附稳定errorCode，错误沿Promise到卡片：409明确已接收且无法撤回/编辑，停止提供这两个无效入口；503说明不支持撤回；网络/其他失败保留消息并可重试。单条请求未完成时禁用该条全部操作，避免重复/冲突。其他行仍可操作。

## 验证

- 3文件125项通过：`vitest run --project dom src/renderer/components/QueuedMessageBubble.test.tsx src/renderer/context/TabProvider.activity.test.tsx --project unit src/server/routes/session-engine-queue.unit.test.ts`。新增用例覆盖编辑/取消分离、键盘、409/503错误到UI、状态保留、网络失败重试、重复点击、optimistic/长内容和草稿提示；新增route两例及Provider三例包括force失败。总新增11项（组件6、Provider3、route2），原有114项保持通过。
- 完整 `tsc --noEmit` 通过；限定11个改动源文件/测试及fixture ESLint通过。首次新增test在render捕获变量触发react-hooks/globals，已改为useEffect后107项Provider复跑及最终lint通过；未suppress。
- `APP_BUILD_PROFILE=moxbot npm run build:web` 通过，含license、theme CSS与8项theme测试；`npm run build:server`通过。
- 实际后台IAB 1280×720，生产QueuedMessagesPanel + 既有ThemeRuntimeProvider；fixture复用composer的同一flex行/换行类和合成任务进度。URL为本工作树Vite4397的 `/@fs/.../dev-docs/queued-message-controls/fixture.html`。没有连接日常Session或真实Provider。
- 实际点击编辑：待处理时三按钮disabled及“正在处理”，结束后卡片消失，textarea出现精确`/compact`，操作记录仅edit。
- 实际点击409取消：消息仍在，出现“已被接收，无法再撤回或编辑”，两个无效动作消失，未隐藏消息，见02图。
- 320px内容栏（内部294px）浅色、深色、双行长文本检查通过；任务进度换到独立行，未叠加。6按钮中心命中本按钮，热区32px高，取消32×32；横向溢出0，见01/03图及geometry.json。长正文可在96px区域滚动，正文不再截掉60字之后的内容。
- 实际取消成功：卡片移除，textarea保持空，操作记录cancel；网络失败保留消息、显示重试提示，切回成功场景后同按钮可重试。英文窄栏显示Edit/Send now/Cancel queued完整，实际Send now仅记录一次force，处理中三按钮disabled，成功后卡片移除且草稿空；最终宽栏浅色见04图。未以fixture回调冒充原生API闭环。

## 范围与发布

源码、本地DOM/合成实际UI、远端CI/main、签名发行、正式客户端真实Runtime分别追踪。用户原消息已被SDK接收不能凭本任务强制撤回；新UI如实解释该边界。正式端完整Chat→Rust→Sidecar→真实SDK和附件恢复尚待统一发布owner在下一未冻结候选串行验收，不操作或重启现有任务。未向其他聊天发消息；发布请求持久记录于本任务 `.agent-sync/tasks/codex-queued-message-controls-20261017-99ad1762.md`。

执行回顾：先用真实日志区分命中失败与owner拒绝，避免无效放大按钮后宣称取消修复；一个测试lint修复、一次fixture热更新入口修复后验收。类似反馈优先查操作请求/回执，再检查点击热区。
