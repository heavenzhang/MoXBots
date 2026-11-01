# M2 验收记录

稳定任务 MB-BOT-R3-DEV-20261101 / M2；代码基线 main 630ae62，独立分支 codex/bot-project-context-m2-20261102。本记录在候选提交前维护；主干、制品和原生验收由原负责会话独立记录，不将此处模拟检查当作安装成功。

- [x] Root 审查共享 schema、ConfigStore 锁内写入、出生事务、不可变保存、fork、自动背景范围及 Rust 自动记忆过滤 diff。
- [x] Root 重新执行 unit 11 文件 250 项、DOM 5 文件 212 项、实际临时目录 integration 4 文件 67 项，均通过。原始输出 `/tmp/m2-final-{unit,dom,integration}.log`。最终边界新增4项UTF8与2项App回执回归，独立复跑unit3文件163项、App DOM111项通过；实际临时存储19项补验通过。去重后的上述定向集合为535项，非全仓测试。
- [x] TypeScript、受影响文件 ESLint、测试分类、dependency-cruiser 无错误。依赖检查保留既有 no-orphans 类型契约警告；不改变依赖和门禁。
- [x] MoXBots profile Vite production web build 通过（本地独立 `/tmp/moxbots-m2-web-dist`），保留既有大 bundle 提示。这不是 Tauri 制品或正式发布。
- [x] 独立审查实际组件，发现并修复并发编辑无法续存、恢复草稿丢当前输入、迟到保存跨项目显示、冻结头像混用、pending 元数据查询、创建 ACK 未知重试换 ID 等问题；均有行为回归。
- [x] 独立审查 1440×900 深色、768×1024 深色、390×844 浅色和固定背景模态截图，可见范围无遗留 P1/P2。独立审阅者没有执行 IAB 交互，不扩大其结论。

## Root 内置浏览器交互

仅使用本任务 IAB、本地 dev-only fixture 和合成项目/回调；不读取/修改安装版用户配置、不调用模型。fixture 直接导入正式页面、Editor、ConversationDialog、Badge、ThemeRuntimeProvider、Logo 与 Bot assets；正式 App/Sidebar 接线另有真实组件 DOM 回归。

- [x] A 项目业务分析 Bot 发起新对话，打开固定项目背景，核对说明/文字资料/目录引用与原 Bot cwd；Escape 关闭后焦点回原按钮。
- [x] B 项目同一 Bot 仍是 `/demo/bots/analyst`，显示 B 的目标与资料；A 对话没有出现在 B 列表。
- [x] 编辑时模拟保存失败，字段保留并显示失败；同一份输入重试后首页变更且显示已保存。
- [x] 明确未启动时保留输入可重试；模拟未知结果后选择器和发送按钮禁用，原文只读、保留本次查看入口；请求计数仅增加一次。
- [x] 归档后编辑/新对话禁用，历史行仍可见；恢复后入口回来。
- [x] 读取失败显示错误与重试，已读取内容仍保留。
- [x] 窄屏项目概览/成员页可用，实测 viewport/body scrollWidth/clientWidth 均 390，无整页横溢；主题切换可用；结束恢复默认视口。

截图及独立审阅原件在工作空间 `MoxBot/work/MB-BOT-R3-DEV-20261101-M2/`，不纳入生产资源：`screenshots/project-overview-dark.png`、`project-tablet-dark.png`、`project-mobile-light.png`、`session-project-snapshot.png`、`save-failure-retained.png`、`unknown-birth-fenced.png`。审阅报告 `ui-review.md`；实现与客户端报告 `session-map.md`；Rust 过滤报告 `memory-guard.md`。

## 待统一验收

- [ ] Rust 真 crate 新增两用例：本地 Rust 1.92 fmt/diff 通过。合法复用匹配版本/签名/摘要的 CLIProxy 缓存后，build.rs 验证通过；真实测试仍在 Tauri 的 DSH 资源缺失处退出 101，新增测试尚未执行。没有删配置、造假资源或绕过门禁；由唯一 CI owner 的完整 Rust job 执行。
- [ ] 原生 ConfigStore/Rust bridge、真实 Provider 和已安装应用重开/发送的实机路径。
- [ ] 唯一 owner 统一共享 CI、主干合并、版本分配、不可变制品/发布及真实路径回执。开发分支、本地构建与截图不替代上述状态。

## 协作复盘

Root 负责契约、共享数据模型、页面/导航集成和最终验收。m2_session_map 独占 Session 后端/客户端和 App 行为测试；m2_memory_guard 独占 Rust 窄修及配置/侧栏行为补验；r3_acceptance 独立只读审查并拥有回归测试。文件边界明确，修复回到原 worker，生产动作留给原 owner。跨模块出生/持久化和原生未知操作的风险支持本轮 Sol medium 请求；实际 token/费用未由工具暴露，不估算节省。没有调用外部模型。主要返工来自真实独立审查发现的状态恢复问题，未为增加测试数量复制实现。

最终边界复核：最大合法emoji、HTML符号、引号及控制字符，经JSON/提醒协议转义后仍≤6000 UTF8 bytes，JSON/XML保持完整；省略显式标truncated。普通/managed未知出生回执保存pending/prepared/最后确认owner三标识。Root最后web构建、类型和全改动ESLint输出分别为`/tmp/m2-final-web-build.log`、`/tmp/m2-final-all-typecheck.log`、`/tmp/m2-final-all-lint.log`。
