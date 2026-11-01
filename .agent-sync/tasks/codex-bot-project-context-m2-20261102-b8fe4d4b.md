<!-- git-project-sync-task:source-digest=59944dcb7dc5a658f6b6bd37b068924d90445ab76d5aa23cc428e104f503cf62 -->
<!-- git-project-sync-task:version=2 -->
<!-- git-project-sync-task:id=1f3c1c2b-ee66-47db-9661-20374230dc40 -->
<!-- git-project-sync-task:branch=codex/bot-project-context-m2-20261102 -->
<!-- git-project-sync-task:base=630ae62ed60c8bf8adf828dcc84cc69b5184e7f4 -->
<!-- git-project-sync-task:status=in-progress -->
<!-- git-project-sync-task:scaffold=false -->

# Task: MB-BOT-R3-DEV-20261101 / M2 项目工作台与会话上下文

## Objective

落实用户已同意的M2：项目首页、已有Bot多项目成员、项目内新对话和固定会话上下文。保留M1风格与旧workspace-Bot一对一兼容。关系见dev-docs/bot-project-context-m2/CONTRACT.md，进度见PLAN.md。M1已通过PR225进入main630ae62，原生界面/发行另由原owner处理。

## Acceptance criteria

- 同一Bot可加入A/B项目，不复制Agent，不重绑旧workspace；保存失败保留输入，重开真实配置仍在。
- 项目首页/成员/资料/新建对话使用产品组件和现有主题；1440/768/390、深浅、键盘、空/失败状态可用。
- 项目出生（包括builtin空会话）沿原prepare/rekey/commit；服务端校验当前项目/成员/原Bot目录，冻结项目快照。
- A/B同Bot同目录的自动项目资料/历史不串；旧目录背景排除逻辑项目来源；重启与fork保持身份，已有会话不可重新归属。
- 原执行身份/未知操作防重复/恢复保护保持；不宣称文件权限沙盒，不写入共享Bot配置保存项目上下文。
- 提交与精确远端分支、唯一owner共享CI/main、客户端发行和真实验收分别记录。

## Completed

- [x] 最新main630ae62已验证，新隔离worktree及start/task-init通过。
- [x] 发现并保留cross-end-workflow并行看板修改；M2不改ProjectBoard与task语义。
- [x] 只读会话路径勘察完成，识别pending出生及双向上下文泄漏边界。
- [x] 正式项目工作台、成员/资料编辑、实际配置服务和App/Sidebar/Chat入口接线。
- [x] 服务端ID校验、出生冻结、不可变保存、fork、A/B与legacy自动背景双向隔离。
- [x] 独立源码/静态视觉审查、Root IAB合成数据交互、535项去重定向行为与真实临时存储回归、类型/ESLint/分类/deps无错误/web构建。
- [x] 并发草稿、迟到保存、未知创建稳定ID、pending恢复、冻结头像、转义后6000字节预算等实际缺陷修复与补验。
- [ ] 原owner共享CI（含完整Rust crate）、远端main核验；原生配置/真实Provider/正式制品与生产验收。

## Verification

- Source digest: `59944dcb7dc5a658f6b6bd37b068924d90445ab76d5aa23cc428e104f503cf62`; Node24 targeted 535 distinct tests PASS; final UTF8/receipt reruns PASS; tsc ESLint classification deps(no errors) Vite PASS; Rust crate execution blocked by missing DSH resources; native and production pending owner.

实跑与分层证据见dev-docs/bot-project-context-m2/ACCEPTANCE.md；原始日志在任务机器/tmp与独立target，CI需独立复现，不把本地通过当原生发行。

## Blockers and unknowns

Rust新增2项真实crate测试尚未执行：签名CLIProxy资源已合法本地核验，当前因DSH资源缺失在build.rs退出101，需原owner完整Rust CI；未造假资源或绕过门禁。实际Provider/已安装App/生产路径尚未验证；后续由原owner在合适候选和活动任务窗口统一完成。未使用dirty群组或跨端工作树代码。

## Deployment request

desktop/macOS/updater/shared CI/main唯一owner01a12bc2-907a-7702-b6dd-788225c5dfe4。没有mobile/cloud/website发布变更。本开发线提交推送、自查并交精确SHA；不自行创建触发共享CI的PR、不分配版本、不替换App。跨端看板任务独立，不复制其未提交内容。

## Next step

候选提交推送后，向原owner交精确SHA/535项定向结果及Rust待验，先纳入其已知前置修改再一次冻结完整CI；Root继续读回远端main祖先/源码树。安装和发布沿原owner下一未冻结批，不替换既有候选。
