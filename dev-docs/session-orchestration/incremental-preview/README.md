# 已批准原布局的实现验收夹具

MB-ORCH-20261022-01。此目录加载生产 SessionTaskOrchestrationProvider、ProcessRow、SessionTaskResults、MessageList、PermissionPrompt 和完整 SimpleChatInput。Agent 执行、聊天发送及 Inspector 外壳是合成数据，不是完整 Chat／原生／Provider 验收。

保留已批准 V2 的工具调用、已发及草稿附件、排队编辑/取消/立即发送、原工具审批、Goal 暂停/继续和完整 Composer。增强前状态栏为 origin/main 263b1cf5 的只读比较副本；其余组件直接从当前源码加载。Shell 与顶部/底部演示工具仅用于比较，不进入产品。

从仓库根目录，使用项目要求的 Node24：

```bash
MYAGENTS_BUILD_PROFILE=moxbot node node_modules/vite/bin/vite.js build --config dev-docs/session-orchestration/incremental-preview/vite.config.mjs
python3 -m http.server 4352 --bind 127.0.0.1 --directory dev-docs/session-orchestration/incremental-preview/dist
```

打开 http://127.0.0.1:4352/ 。先切换增强前后，再检查回传待验收、验收完成、局部返工和工具审批。两侧采用相同数据。审批测试须保留完整 footer 及测量后的输入浮层占位；夹具 tail 滚动到实际 scroller.scrollHeight，不能仅定位最后消息。

独立脚本位于 `../evidence/incremental-ui.mjs`。从本目录运行，Playwright 有默认浏览器时可直接运行；否则设置 `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` 为已有测试浏览器位置。`ORCHESTRATION_PREVIEW_URL` 可覆盖本地地址。脚本生成本地 evidence；不要把它当作真实 Provider 测试，也不应提交生成的缓存、dist 或业务数据。

默认网络围栏拒绝业务端点及外部服务，不使用日常客户端或凭据。来源与验收边界见 `../incremental-validation.md`。
