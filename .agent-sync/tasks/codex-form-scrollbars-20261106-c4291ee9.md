<!-- git-project-sync-task:source-digest=924f336b97ac47a5e8e150b4d776a28893b5b59b8f078ff3c4f21a904161fe0c -->
<!-- git-project-sync-task:id=8d911d9e-31da-4bed-859d-d849f6709e6d -->
<!-- git-project-sync-task:version=2 -->
<!-- git-project-sync-task:branch=codex/form-scrollbars-20261106 -->
<!-- git-project-sync-task:base=13fb88204108a3b1ad9dc1b9a72cea6e673e94f4 -->
<!-- git-project-sync-task:status=ready-for-review -->

# Task: 统一修复输入框多余滚动条

## Objective

任务 ID：MB-FORM-SCROLLBARS-20261106。用户报告多个输入框存在不必要滚动条，以新建项目弹窗截图为基准，统一普通 textarea 的换行与单轴滚动策略，修复项目表单操作区被压缩后的重复滚动条。保留长文本可编辑/可滚动、IME、草稿、版本冲突和编辑器内部输入规则。

## Acceptance criteria

- [x] 核实源码、远端主干与干净隔离 worktree，保留所有其他任务。
- [x] 审计 renderer 全部原生 textarea，普通输入软换行，长链接不产生横向滚动。
- [x] 实际组件 Chromium/WebKit：空/短/长链接/多行、资料、保存/取消/冲突复核、浅深色与窄窗；常规 footer 不滚动且操作可达。
- [x] 受影响 DOM/IME/草稿回归、类型、lint、本地 Web 构建。
- [x] 源码、验证与任务记录按本分支交付；远端精确 SHA 与队列状态以交接回执核实。
- [ ] 既有 desktop owner 统一共享 CI、main 集成、签名制品与安装版验收。

## Completed

- 源码基线：main 13fb88204108a3b1ad9dc1b9a72cea6e673e94f4。
- 全局 base layer 为普通 textarea 提供横轴 hidden、纵轴 auto、pre-wrap 与 anywhere；wrap=off、Monaco/CodeMirror/xterm 内部输入排除。组件显式样式和工具类保留优先级。
- ProjectSpaceEditor 标题/操作区 shrink-0、独立 div 担任 flex-1 主滚动区，fieldset 仅管理禁用，普通操作区不会随长表单被压缩；长版本冲突复核仍可纵向滚动。
- UI 验收由当前主 Agent 负责；本次低风险且耦合在统一 CSS/布局，零子 Agent，自验不称独立审阅。

## Verification

- 浏览器复验脚本 scripts/verify-form-scrollbars.mjs：Chromium/WebKit 各 96 组通过；原不可变基线按预期失败（footer 51px < 内容 68px、横轴 auto）。
- 真实聊天组件 scripts/verify-chat-input-zoom.mjs：两引擎各 60 组通过。
- 10 个不同 DOM 文件 59 个不同用例通过；TypeScript、ESLint、diff --check、MoXBots profile 本地 Web 构建、31 项主题映射和 8 项主题测试通过。详细命令、限制、截图和度量见 dev-docs/form-scrollbars-20261106/acceptance.md。

## Blockers and unknowns

- 部署单元 desktop/macOS-arm64/updater/sharedCI/main；唯一负责人 01a12bc2-907a-7702-b6dd-788225c5dfe4，沿用主干计划与工作区 CLAUDE.md。开发会话不并行触发 PR/共享 CI、正式构建、版本分配、安装或重启。
- 不涉及 Host、移动端、云服务、协议或数据迁移；本地 mock 保存仅用于验收，无真实业务写入。
- 原生已安装 WKWebView 验收待发布单元负责人安排；headless WebKit 不替代原生验收。

## Next step

- 既有 desktop owner 审阅远端本分支与验收记录，统一运行 CI/main 集成、选择下一未冻结候选并完成签名安装版真实页面验收。
