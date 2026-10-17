# MOXBOTS-SESSION-WINDOWS-001

2026-10-17。权威仓库 https://github.com/heavenzhang/MoXBots.git，基线 main `428ffd94ce2e5eedfb150c28dccecf201c6b2edc`，独立分支 `codex/session-windows-20261017`。

顶部只展示当前页面的标题与关闭操作，侧栏负责会话/功能导航；Chat 内已有文件、终端和浏览器沿原 owner 保留，不新增执行或持久化 owner。移除跨缓存页触控板横滑，保留键盘与通知导航。

缓存沿原12页规模，FIFO按原打开顺序回收非当前可关闭页面。原编辑器保存 admission、后台继续、SSE与精确Tab owner释放顺序继续使用。重新打开被回收会话仍走原Session恢复入口，不删除历史。

草稿/附件/IME/发送、启动中的会话、活动录音及未具备安全关闭声明的配置表单保留。异步保存只允许一个额外准入槽；全受保护或保存失败时保留页面并提示、拒绝后续新增，避免无限增长；原有录音紧急停止入口例外保留。回收前重新验证当前页、草稿与缓存数量。用户在保存期间显式关闭会以用户原因重新准入，缓存取消不会吞掉用户操作。

## 验证

- 主Agent最终定向14文件155项通过，覆盖FIFO、重开、保存等待/失败、重新聚焦、用户关闭竞态、容量已释放竞态、composer草稿、录音、持久恢复、全局快捷键和模块边界。
- TypeScript noEmit、全量lint（含依赖边界/agent-docs）及MoXBots build:web通过；未新增依赖。正式CI与主干结果以该分支PR及最终远端回执为准。
- 实际MoXBots renderer在独立loopback Vite、browser-development mode运行，无native Sidecar/真实账号/业务写入/模型请求。打开设置→关闭返回，Cmd+T连续13次→稳定12页→最早空Launcher被回收→侧栏新对话返回受保护草稿，均由主Agent通过内置IAB执行。顶部全局tablist数量0。
- 800×600、1280×720、1440×900截图通过；800px侧栏自动rail，document.scrollWidth=800，输入与标题无横向溢出。
- 独立审阅者window_ui_review（请求gpt-6-luna/medium；未假定runtime实际型号或货币用量）发现并复核关闭原因竞态修复；最终9项DOM回归通过，并独立查看三尺寸截图。其自身IAB provider不可用，动态交互由主Agent完成，不称独立实测。

原始截图、DOM快照摘要、测试日志与独立记录保存在：
`/Users/zhangshaohua/Documents/WPS Cloud/【项目】目录/MoxBot/output/session-windows-20261017/`。

复现renderer：

```sh
MYAGENTS_BUILD_PROFILE=moxbot node dev-docs/session-windows/serve.mjs
# http://127.0.0.1:8898/ — 只监听loopback；独立浏览器测试存储
```

## 发布请求

状态 queued。唯一桌面发布owner仍为 `01a12bc2-907a-7702-b6dd-788225c5dfe4`，按 `.agent-sync/plan.md` 的 Deployment coordination 串行处理。合入本分支不触发正式发布workflow，不修改0.5.9冻结包、签名、安装或重启日常App；本任务未获跨聊天发消息授权，不宣称已通知owner。

下一未冻结候选需包括本分支合并结果，并在精确原生包上验证：真实会话A/B切换及各自文件/终端/浏览器归属、12页回收/恢复、编辑保存冲突、后台任务继续、录音保护、macOS/Windows拖动/按钮安全区与800px最小窗口。真实账号/原生生产路径未验收，不能用本地renderer代替。

执行记录：主Agent负责实现/集成/实际IAB验收；一个独立审阅Agent负责只读代码/测试/截图审阅，发现一处并发问题并完成一次修复复核。无外部模型调用。总token/货币用量未由runtime提供；没有估算节省数字。
