# MB-BOT-R3-DEV-20261101 / M2

基线main630ae62；分支codex/bot-project-context-m2-20261102。完成标准与数据关系见CONTRACT.md。

|步骤|状态|完成标准/依赖|下一步/证据|
|---|---|---|---|
|仓库与并发核验|完成|main、干净新树、唯一owner；不碰旧看板并行线|start/task-init PASS；Session只读map|
|关系和共享schema|完成|定义与旧Project/Agent的边界、出生快照、兼容/隔离规则|CONTRACT.md|
|代表性页面原型|完成|保留Logo/Bot头像/Theme组件，项目首页/成员/资料/对话可实际点击|原型只用合成数据；先验一页再扩展|
|真实配置与页面|代码/模拟完成，原生待验|原config.json锁内持久化、revision冲突不覆盖、重开还原|依赖共享schema/页面方向|
|出生/持久化/背景|实现与临时文件验证完成|原SessionStore与binding owner，四runtime统一，A/B及legacy双向隔离|依赖schema；服务端读取配置冻结|
|集成与独立UI|完成|原App/Tab导航、实际组件流程/适配与失败修复|1440×900/768×1024/390×844；dark/light|
|代码及模拟验证|通过；原Rust crate执行待CI|定向回归/实际临时文件重启/类型/lint/build|不得冒充Provider/native验收|
|远端主干|最新主干已整合；934回归通过，待owner统一CI/main|提交push，原owner固定一次候选/共享CI/main；Root读回祖先与树|避免移动基线重复CI|
|原生与发布|用户已授权新包/现有下载通道，等owner选版本|原owner统一版本/制品/安装/真实路径回执|代码、模拟、真实联调、生产分别跟踪|

执行：Root负责schema/配置/UI与集成；m2_session_map已完成Session后端/客户端和App行为补验，m2_memory_guard已完成Rust窄修与配置/侧栏补验（Rust执行受资源门禁阻断）；r3_acceptance负责独立UI与方案复核。现有代码/工具足够，本轮内置协作，不调用外部模型。请求模型/effort与实际暴露用量分别记录，不估算省费。

- [x] schema / 页面 / 出生与隔离实现。
- [x] 独立源码/静态视觉审阅和Root IAB合成数据交互。
- [x] 535项去重定向回归、类型/ESLint/分类/无依赖错误、web构建。
- [x] 最终UTF8预算和exact receipt补验，冻结source。
- [ ] 原owner共享CI（含原Rust crate）、主干远端核验。
- [ ] 原owner客户端版本/正式制品/真实联调与生产验收。

详见ACCEPTANCE.md。当前无业务数据改写或模型请求；群组/M3、旧看板与跨端任务语义不在本轮。

## 本轮发布接续

- [x] 合并最新主干52405a701并重测M2及受影响恢复/Bridge路径：934项通过。
- [ ] 提交新精确source，原owner一次冻结完整CI并合main，Root独立读回。
- [ ] 原owner分配不可变新版本/tag，签名公证包、摘要、原生关键路径与回滚。
- [ ] 更新现有下载通道，Root独立核对可下载文件的版本、摘要/签名和通道指向。

不再停在上轮仅source intake；本轮以主干、新包、现有下载通道真实可用为交付范围。
