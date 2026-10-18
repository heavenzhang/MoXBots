<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/session-resend-20261019 -->
<!-- git-project-sync-task:base=2e1c522737b30ca985c3df8d9110e2eec97e1682 -->
<!-- git-project-sync-task:status=in-progress -->


# Task: SESSION-RESEND-20261019-01 安全重发

## Objective

SESSION-RESEND-20261019-01：修复错误横幅「重新发送」隐式回溯消息与文件导致恢复点失效的机制。保留显式重新生成和时间回溯的既有语义。

## Acceptance criteria

- [x] 错误横幅重发走普通发送，不调用 /chat/retry、回溯或修改 native 恢复点。
- [x] canonical history 和已执行的工具进度保留；只替换本地失败气泡。
- [x] Goal 可见输入、原附件引用与异步问答上下文保留；隐藏自动 continuation 不冒充用户请求。
- [x] 通过相关单测、DOM 回归、类型检查及构建。
- [ ] CI 与远端 main 交付验证。
- [ ] 新安装包与原生 UI 真实路径验收；不能用旧会话的数据恢复证明新版发布。

## Completed

单 Agent（零子 Agent），修改集中在错误横幅的发送路径；当前主 Agent 负责实现和验收，无模型切换、无外部模型调用。UI 沿用既有横幅和按钮，无布局变化。复发回归应优先覆盖提示按钮的实际动作，不能仅检查错误文案。

## Verification

聚焦 Vitest：115/115 通过（6 项重发投影 + 109 项 TabProvider DOM）。TypeScript --noEmit 通过；修改文件 ESLint 通过；git diff --check 通过。build:web 完整通过（含许可证、主题 CSS 与 8 项主题测试）。已同步 origin/main fe82002ed，包含并发的后台请求与 499 修复，未触及本任务前端文件。原始运行数据不入仓；此前两个会话已恢复可用不等于此产品修复已发布。

## Blockers and unknowns

尚未发布。私有包由统一打包会话协调；需要遵守现有发布队列、活动会话保护和原生验收。

## Next step

运行聚焦测试，审查结果后提交并完成 main/CI 交付，将准确 SHA 进入现有打包队列。
