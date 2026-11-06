# G02 群组界面与观察者验收

## 已实现

- `BotGroupEditor` 沿原 Overlay、close-layer、主题、头像和 IME 边界实现成员编辑。保留根 Bot，限制 2–8 个成员；同名使用工作区/稳定身份区分。不可用的旧成员可以移出但不能重新添加。取消和关闭可用；请求在途防止重复提交。
- `BotGroupRecipient` 使用原 CustomSelect 和头像。初始无选择；旧 groupId/revision 或停用成员不能静默改投根 Bot。只是目标选择组件，不授予发送/执行权限。
- `SessionBotGroupEditor` 使用冻结 Session 项目快照、当前配置名册和原 task observer。冲突核对同时重读原 appConfig / projects / group；采用最新版本后，停用成员仍阻止保存。原观察者断线不会卸载编辑器或丢草稿；Session/epoch 切换不能沿用旧编辑器。
- 原 `useSessionTaskOrchestration` 增加群配置投影与原 Tab POST / 显式 read。多个消费者仍共用一个 observer；group 回执不拼造整个 task ledger revision。A→B→A、runtime 变化和卸载后旧回调拒绝；旧 ledger 不跨 observer epoch 覆盖新读数。
- 明确区分原请求拒绝与未确认结果。未知后保存命令和 requestId 固定，先只读核对；找到回执不重写；找不到回执仅允许用户主动重试同一命令。后一次 retry 被拒绝也不证明首次请求失败。所有配置写入保留 G01 原签名/CAS。

## 验证

- Node 24：7 文件 48 tests 通过。包含 9 项原共享 group 合同、17 项原 task observer、客户端 5 项、名册 3 项、成员/接收者 7 项、单观察者/epoch 4 项、原配置/观察者编辑器 3 项。
- TypeScript、修改文件 ESLint（max-warnings=0）、测试分类通过。依赖边界 0 errors、20 个原有 warnings。
- `MYAGENTS_BUILD_PROFILE=moxbot npm exec -- vite build` 通过；仅 renderer 构建，不是正式桌面包。保留既有 chunk-size/baseline 数据警告，不升级无关依赖。
- `MYAGENTS_BUILD_PROFILE=moxbot node scripts/verify-bot-group-controls.mjs`：隔离 WebKit 与真实产品组件，合成状态；显式接收者、同名区分、键盘循环/焦点返回、响应丢失后核对且不重复 POST、冲突保留草稿/明确采用新版本、深浅主题、390px 均通过；页面宽390、弹窗可视/滚动宽均356，无横向溢出、无 pageerror。额外检查禁用保存按钮的实际透明度。
- 初次 DOM 焦点循环和 WebKit 关闭后焦点返回暴露问题，已修复：过滤实际禁用控件，原入口传入 returnFocusRef。由主执行者实际检查截图，未冒称独立审阅。
- 开发页面切换到 CustomSelect 时一次依赖优化过程出现 React dispatcher 错误；在本记录保留该次失败事实，未忽略 pageerror 门禁。后续完整浏览器检查实际通过；未据此修改产品 React 或依赖版本。

验收日志/截图留在 WPS 项目 `work/MB-BOT-NAV-20261102/group-ui-20261107/`；`scripts/verify-bot-group-controls.mjs` 可复现，fixture 标明本地合成数据、不发送消息。

## 交付边界

实际 Chat 的新建/转换群入口尚未挂载，等待 G03 可信独立 Bot 消息收发；现有 Composer 仍保持原发送行为，不能把配置 API/静态成员显示当作群发送上线。真实账号/独立 Runtime/跨 Session 任务交接、主干集成、共享 CI、正式包/安装与下载通道均未由本批证明。没有业务写入、模型调用或运行数据修改。

完整验收仍按 `PLAN.md` 和 G01 计划继续；仅原 desktop owner 负责主干和统一发行。本批保存到分支是阶段交付，整体 goal 未完成。
