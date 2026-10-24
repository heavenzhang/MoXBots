# MOXBOTS-INPUT-CARD-ORDER-20261025

候选修复已通过本地验证，位于独立任务分支 `codex/input-card-order-20261025`。主干/CI/发布/已安装客户端验收由原 owner 继续，不能由本地通过推定完成。用户已于 2026-10-25 现场确认 Git 目的地。

## 行为与范围

1. 真人输入 `继续执行` 保留为独立用户正文，执行说明不追加到该正文。
2. builtin facade 把执行提醒经 `runtimeReminder` 单独送到 SDK 文本块；原 transcript、用户回声和队列预览不保存该提醒。
3. 可信原文输入在 dispatch guard 创建/接续任务卡片前，先经原 user surface 持久化并推送。排队输入在晋级时采用同一顺序；Goal/基础设施隐形准入保持既有门禁。
4. 自动续跑的原请求、执行 ID、验收指令采用纯隐藏 `SESSION_EXECUTION` 系统记录，不生成可见人类发言，也不计入真人输入。
5. 原 Stop、取消、真实工具证据和最终原生准入继续裁决执行；原文已显示不表示任务获准运行。拒绝或停止时可保留真实用户发言，但不进入 SDK。

不迁移或改写用户既有历史，不重放截图中的业务任务，不修改版本或部署配置。

## 验证

基线为现场核实的远端 main `848e333455c7045534bf51a951a19b6945c6aa1a`，Node 24。所有验证均使用隔离目录或合成数据。

| 检查 | 结果 | 证明范围 |
| --- | --- | --- |
| SessionEngine、message codec 单元 + execution integration | 185 PASS | 原文/模型上下文隔离、生成卡片的准入时序、原有执行门禁 |
| builtin transcript integration 全文件 | 170 PASS | 直接/排队/拒绝路径、持久化、恢复、原有 Stop/Goal 门禁 |
| 新 Stop 参数及顺序定向复核 | 5 PASS，166 skipped | 两种 early-human 设置及直接/排队/拒绝场景；包含新增的停止前已显示原文情形 |
| Message userbubble DOM | 9 PASS | 只渲染一个真实用户气泡；复制内容为 `继续执行`；自动上下文隐藏 |
| 原生 SDK + 本机合成供应商：普通续跑 | PASS | 2 轮完成，1 次真人输入，用户事件先于卡片，落盘原文不变、上下文隐藏 |
| 原生 SDK + 本机合成供应商：返工 | PASS | 3 轮、1 次返工，仍只有 1 次真人输入，顺序和落盘隔离正确 |
| 全量 TypeScript、修改文件 ESLint | PASS | 类型及静态检查 |
| 补丁对基线 dry-run | PASS | 可应用到上述 main，不代表已应用或已提交 |

原生收据在 [evidence/native-single.json](evidence/native-single.json) 和 [evidence/native-rework.json](evidence/native-rework.json)。本地完整日志保留于交付工作区 `work/MOXBOTS-INPUT-CARD-ORDER-20261025/`，不以日志末尾命令退出代替断言结果。

初次原生检查的 SSE 观察器遗漏了解包 liveRevision envelope，因此只观察到卡片、没有观察到用户回声。失败日志保留；按正式协议修正观察器后，两种原生模式均通过，未降低顺序断言。

## 验收边界与接续

UI 质量由当前主 Agent 自查，未安排独立审阅。没有布局改动：视觉/响应式验收不适用；DOM 行为和原生事件顺序已验证。真实已安装客户端、真实供应商和真实业务验收未进行，不能用合成服务收据替代。

Git：在用户确认 `https://github.com/heavenzhang/MoXBots.git` 后重新 fetch 并经 `observe/start/task-init` 核实 main 仍为上述 base，从该 SHA 建立隔离任务分支。预览与本分支修改源码逐文件摘要相同，验证对应相同源码；正式接续记录为 `.agent-sync/tasks/codex-input-card-order-20261025-fcd42f2f.md`。提交与远端 SHA 由交接收据记录，接收方仍须重新核实当前 main。

部署单元为既有桌面/macOS/updater，combined CI/main/构建/版本分配/发布唯一 owner 仍是 `01a12bc2-907a-7702-b6dd-788225c5dfe4`。当前开发会话不触发共享 CI、不分配新版本，不修改冻结候选。源码交接、main、制品摘要、安装和真实验收须逐项补齐；当前没有本次制品或发布批次。

## 执行记录

- 主 Agent `/root` 负责实现、集成和 UI 自查；零子 Agent，无独立审阅。
- 选择依据：修改位于同一发送/持久化链，分拆写入会增加共享文件协调成本。
- 升级原因：未切换或升级模型。精确运行型号及推理档位未核实。
- 不调用外部原因：采用 `ai-yaoren-local` 纯内置模式，无外部模型需求；原生验证仅调用本机合成供应商，测试内付费调用为 0。
- Agent 的 token、费用和比较基线未测量，不作节省声明。
- 复盘：原生落盘与广播顺序断言验证了此次核心要求；后续保留此回归，并使用正式 liveRevision 解包 helper，避免观察器把协议外壳误判成产品事件缺失。
