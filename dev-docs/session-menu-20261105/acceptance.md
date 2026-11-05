# MB-SESSION-MENU-20261109 验收记录

新版 MoXBots 对话列表未接入 SessionContextMenu，右键退回系统网页菜单。恢复原菜单并增加常驻低对比度 ⋯ 和 ContextMenu/Shift+F10 键盘入口，仍以会话主题为主标题。更多按钮是独立兄弟按钮，预留宽度；右键不选中文字、不打开会话。原共享菜单提供复制ID、重命名、置顶、收藏、标签、统计、归档和删除。

GlobalSidebar 保留原 metadata mutation sequence、收藏与App重命名回调、useSessionDeletion生命周期能力及删除确认。收起侧栏时Escape优先关闭嵌套层，避免直接卸载侧栏丢失焦点。菜单卸载释放既有嵌套层登记。无新数据写入路径、接口、迁移、版本递增或生产配置变更。

## 验证

基于 main `39b3447659dd92e71f9bb86bf12f2326bb3e5fcd`；Node 24.20.0。

- [x] DOM：GlobalSidebar.test.tsx（98）及BotConversationNavigation.test.tsx（11），109项通过。新增13项覆盖完整入口、Escape焦点、App重命名、置顶/归档、复制/收藏、归档失败及App/Rust删除拒绝。
- [x] tsc --noEmit，修改文件ESLint --max-warnings=0，git diff --check。
- [x] test classification、固定AgentNet协议校验、codemirror/virtuoso/tauri-events依赖补丁检查。
- [x] Vite renderer编译通过，28.60s；存在原有大chunk提示，非正式签名构建。
- [x] Root审阅接线、入口边界和删除owner；非实现者源码审阅发现pin/archive重挂载后焦点丢失P2，已修复并由第二位只读reviewer复核关闭，无新阻断发现。
- [ ] 实际渲染/深浅主题/257px侧栏及390px布局：本任务IAB工具被Work设置禁用；用户随后授权Chrome仅本机合成页面，Chrome工具也返回同一禁用错误。尚未通过，未操作浏览器设置。
- [ ] 唯一owner共享CI/main/正式包/上线与真实持久化验收。

合成页面 `src/renderer/__fixtures__/session-menu.html` 直接加载实际导航、共享菜单及主题，网络写入只处理内存中的fixture-menu IDs，其余请求拒绝；不使用真实业务数据或模型。用Vite本机服务访问 `/__fixtures__/session-menu.html`。其他历史导航fixture保持原展示范围，不将其空菜单回调作为此功能验收。

本机原始日志：工作区 `work/MB-SESSION-MENU-20261109/evidence/{dom,typecheck,lint,renderer-build}.log`。本记录不把DOM/编译结果当真实原生验收。

## 发布交接与完成标准

唯一 desktop/macOS-arm64/updater/sharedCI/main owner `01a12bc2-907a-7702-b6dd-788225c5dfe4`，当前接入请求已回执。开发分支保存不触发共享CI；原owner统一创建PR/CI/集成与候选分配。冻结542.1不修改，本任务进入下一未冻结桌面批次；其余单元不需部署。

上线前由原owner确认新候选包含本任务精确源、相称CI、原生右键/⋯/键盘及Escape/焦点、深浅/窄屏、合成会话的重命名/置顶/收藏/归档持久读回；删除仅以可控合成数据验证确认与运行中拒绝。签名/备份/回滚/tag/制品摘要和实际运行版本与源码关系由发布记录提供。Root最后核对远端main包含本任务、发布回执及真实路径；当前均待完成。

2026-11-06补充：列表层在原聚焦节点断开且焦点落body时恢复同session新菜单按钮；归档移除时回退历史管理。另一控件持焦时不抢焦。4项真实列表投影更新回归覆盖pin/unpin/archive/外部焦点；合计109项。第二位只读reviewer复核P2关闭。源码与DOM不替代实屏。
