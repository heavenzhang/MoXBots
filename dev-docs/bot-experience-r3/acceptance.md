# MB-BOT-R3-DEV-20261101 · M1 开发验收

M1完成产品组件与本地验证；R3整体未完成，M2/M3仍在任务计划中。当前实现与已批准原型的差距必须保留，不能把本地演示等同完整业务能力。

## 本批代码

MoXBots build profile启用对话/项目互斥导航，使用TaskCenter原SessionMetadata投影及Config原Agent/Project身份；未读来自现有badge/live Tab，进行中只来自匹配Tab的真实isGenerating。项目按钮仍经App打开原ProjectBoard。历史删除、归档、置顶及分区等能力保留在“历史管理”。自动化、技能工具、网络等原入口移到资源列表下方。

统一“新建”提供新对话和原NewAgentPanel。新对话先选Bot，再确认其当前可用项目；第一条消息可选，输入时按钮明确为发送并开始。原onOpenWorkspace负责真正打开，不直接改Tab/Session，不重绑旧会话。失败保存输入，当前配置复核、pending fence避免重复提交。

当前产品仍为Project/workspace与Agent一对一，本批只列真实有效绑定。跨项目多Bot、独立业务项目容器、稳定Bot群组/指定收件人、跨Bot真实交接、完整对话内验收均未在本批实施。未合入dirty group-phase1，该树角色成员与稳定Bot身份不等价。

## 验证

- Node24.20.0；5个相关测试文件107项通过，含85项GlobalSidebar（新增rail双向切换和显式新建）、10项偏好、6项身份/过滤投影、4项新建失败/重试/防重复/配置变化及2项头像身份。
- TypeScript最终通过；定向ESLint通过；test classification通过；dependency-cruiser0错误、18条既有warning；本地moxbot renderer Vite构建通过，主题CSS31映射通过。构建仅本地renderer，未产生正式桌面包。
- 独立源码审阅发现rail隐藏导航P2，已移入展开/收起共用tree并补回归；复审无M1范围残留P1/P2。独立审阅者检查两张运行截图，静态视觉通过。
- 主Agent在IAB实际组件fixture走过选择Bot/有效项目、读取失败保留行和重试、空态、项目筛选，以及打开失败后同表单保留文字并重试成功。NewBotConversationDialog没有默认Bot，已有绑定失效不会提交。
- 真实产品App本地空配置检查过新导航位置与空态；390×844下实际点击“我的Bots→项目→对话”成功，DOM无文档横向溢出，相关切换已持久化到原sidebar preference。
- fixture 1440×900/768×1024/390×844检查及深浅主题；390新建表单肉眼未见遮挡/横向溢出。fixture只import产品组件和原Theme/CustomSelect，合成metadata与可观察回调不证明后端创建。

## 未通过或未执行的门槛

独立审阅代理无IAB能力，未授权使用用户Chrome/Brave，独立实际点击未执行；其源码/静态视觉结果不能抵充独立交互验收。完整App390截图因IAB手动viewport与像素捕获缩放不一致而失真，保留capture-unreliable作为诊断证据，不认定完整App窄窗视觉已通过。原生长内容、完整键盘/portaled-select回归与真实持久化仍待原桌面owner安排。

本批测试输出含原GlobalSidebar分区回归的React state updater测试警告；无失败，不把测试warning隐去。Vite既有大chunk与Baseline数据提示未在本任务更新依赖处理。

源分支、远端main、共享CI、正式制品、安装客户端、实际Provider及生产验收分别追踪。仅desktop/macOS/updater单元，原owner01a12bc2-907a-7702-b6dd-788225c5dfe4不变；不触发共享CI、不另分配版本、不操作其恢复批次或日常App。


## 2026-11-02 合并前启动回执修正

原owner发现P1：旧sidebar wrapper忽略handleLaunchProject false，仅用预建Tab是否存在决定成功；新表单因此可能关闭丢输入且重复重试。现有handleLaunchProject布尔调用保持兼容，wrapper采用真实布尔。新Bot入口以App产出的结构化receipt判定 opened/not-started/uncertain，在调用createSession前及Chat接管initialMessage前由原App路径标记可能副作用；不改变SessionStore、Runtime、初始消息消费或恢复账本。

确定未开始才允许原意图重试；未知结果保留当前原文/Bot/项目/原Tab导航并禁止重发。表单隐藏不丢receipt。独立复审发现未知保护会锁住全局新建的P2，已补“保留记录并返回新建”：旧记录独立保留，只给新表单空白输入，允许新Bot或另一明确意图；不复制旧原文。待确认记录只是当前Renderer内存中的UI回执，关闭App不保证保留，不充当持久账本或已发送证明。

210项/6文件相关测试通过，包括实际App→新表单回调链的pending与prepared启动失败、createSession可能已提交但回执丢失、确定未开始的capacity拒绝、旧bool失败传播、未知后新独立意图和旧原文留存。真实Chat发送网络与原生持久化并未在本地DOM中执行；断言的是App消息交接及不再次创建/重发，不能称模型业务验收。tsc、scoped ESLint、classification、本地moxbot renderer build通过。依赖检查0error，18既有warning加1个新type-only receipt契约的no-orphans warning。最终证据verification/launch-receipt-*；独立审阅见independent-review.md。修正后当前工具无IAB，未补新的原生UI交互；此前导航/布局证据仅对应原M1状态。


首轮PR225 CI 41324772227 在完整unit发现themeArchitecture structural surface guard失败，因本地fixture误用global-sidebar-bg形成第四个消费方。预览页改用通用paper-elevated，不放宽guard、不改正式产品样式。改后本地完整unit659文件/7453pass/5skip通过。首轮Rust/clippy、Windows、Linux和headless/mobile检查通过；最终修正SHA的CI仍须原owner协调，不把旧SHA检查当作新候选通过。
