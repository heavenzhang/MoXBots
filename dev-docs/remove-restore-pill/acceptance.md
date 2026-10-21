# 移除旧恢复入口：源码验收与集成交接

## 结论

旧标题栏“恢复上次标签页”入口、计数、关闭恢复提示和 App 旧候选接线已删除。普通启动（含异常退出）进入 fresh Launcher；仅合法 update-composer handoff 可恢复有草稿的对应页面，草稿仍由 exact-scope composer 接收，不自动发送。

本记录是原任务分支的源码与本地确定性回归，不代表最新 main 组合、共享 CI、原生安装或生产发布通过。

## 范围与 owner

- 分支：`codex/remove-restore-pill-20261020`。
- 原始 base：`cd4d8fb6b5ab379abcf454e5f58eeab89b00aa03`。
- 权威仓库：`https://github.com/heavenzhang/MoXBots.git`。
- App/Tab workspace 继续负责页面导航、校验、挂载和缓存；Session opening admission、`canRestoreSession(sessionId, agentDir)`、既有 Session materialization 不替换。
- `composerUpdateCheckpoint` 继续持有草稿 handoff；读取后只向 App 投影有草稿的 Tab，原磁盘交接保留到 exact composer 消费。未挂载草稿同样阻止自动缓存回收。
- 保留 RecordStore、Session、TaskStore、Goal authority 与历史入口。不创建执行器，不发送旧输入，不重放任务，不修改持久任务目标。
- 未修改版本、依赖、Provider、网络/应用配置、业务数据或 ledger；未操作薪资共享资源。

## 验证

所有本次测试命令均显式 `cd` 到原源码工作树，并使用：

```sh
env -u NODE_OPTIONS PATH='/opt/homebrew/opt/node@24/bin:/opt/homebrew/bin:/usr/bin:/bin' npm exec -- <tool> ...
```

同一次测试 Bash 先打印 `process.execPath` 与 `process.version`，实际为 `/opt/homebrew/Cellar/node@24/24.21.0/bin/node`、`v24.21.0`；Vitest `3.2.4`。

| 验证 | 实际结果 |
| --- | --- |
| `vitest run --project dom src/renderer/App.helperLaunch.test.tsx --reporter=dot --silent` | 91/91，通过 |
| DOM：`CustomTitleBar.restorepill`、`SimpleChatInput.checkpoint`、`CronTaskSettingsModal.checkpoint`、`LocalTaskEditors.checkpoint`、`ThoughtCard.checkpoint` | 5 文件 43/43，通过 |
| `vitest run --project unit src/renderer/utils/composerUpdateCheckpoint.test.ts --reporter=dot --silent` | 筛选修复后 28/28，通过 |
| 上轮 `tabPersistence.test.ts` + `composerUpdateCheckpoint.test.ts` unit | 37 + 27 = 64/64；本轮仅重跑有行为变更的 checkpoint，tabPersistence 后续只改注释及 suite 标题 |
| `tsc --noEmit` | 通过 |
| 9 个变更 TS/TSX 文件 `eslint ... --max-warnings=0` | 通过；仅 dependency 的 baseline-browser-mapping 数据陈旧提示，未升级依赖 |
| `git diff --check` | 通过 |
| project-sync `observe --remote https://github.com/heavenzhang/MoXBots.git` | PASS；分支 local-behind、dirty 为实测状态，不代表集成完成 |

测试涵盖：普通启动忽略旧 localStorage/durable snapshot；更新 handoff 不受 quit marker 影响；读取失败保留 Launcher；无自动发送/新 Session；exact scope、workflow config owner 接受、草稿 IO 拒绝与保留；隐藏未挂载草稿保护；无草稿 Chat/Record 不进入真实 handoff 的页面恢复投影。

App 文件中既有 Record、pending discussion 等恢复测试使用 mock handoff，属于 App 原有恢复 owner 的隔离验证，不证明真实 checkpoint 接纳这些草稿类型。真实 checkpoint 仍拒绝未持久化 Session、非 chat scope 与未经 attestation 的 remote-session 更新。

## 保留的失败证据

此前未固定 PATH 的 DOM 运行失败，首错为 `afterEach localStorage.clear is not a function`，不能作为产品回归结论。只读诊断在本地交付工作区 `work/salary-recovery-20261020/a0-dom-environment-diagnosis-20261021/diagnosis.json`。诊断表明 Node 25 可无 storage flag 复现相同形态；旧失败进程的真实解释器未记录，因此不宣称已确定旧进程来源。本轮固定 Node 24 后 App 91 项通过；没有放宽断言、修改测试环境或升级依赖。

## 集成与未完成边界

- 本轮只读远端 main 为 `a746a900122ff6662a214d16c44e15361ac47831`，任务基线落后 149 commits；未在脏区 rebase/merge。最终任务 commit 和远端分支一致性由源码交接 JSON 与 project-sync handoff 回执记录。
- [x] 移除旧恢复入口与普通启动旧候选。
- [x] 合法更新交接仅投影有草稿页面，保护 deferred composer。
- [x] 相称本地测试、TypeScript、scoped lint。
- [ ] 独立代码/GUI 验收：之前三个只读 reviewer 未完成，无独立通过结论；本轮依指令不新建子 Agent，不解锁/操作 GUI。
- [ ] 最新 main 组合与共享 CI：交指定集成负责人；不把原基线回归等同当前 main 通过。
- [ ] 同 Session 已在不同 Tab ID 打开、boot 异步期间容量被占满、校验失败后不重启即可重新到达原 exact Tab 的完整恢复体验，未新增端到端验证。现有 merge 去重/capacity 策略保持，handoff 不因 App 读取而删除，但“磁盘保留”不等于这些路径可立即恢复。
- [ ] 原生真实更新、真实 Provider/Host、安装、签名、发布均未执行。

## 执行与后续

本线程主 Agent 完成本轮只读复核、最小筛选修复、本地验证与分支交付；无本轮子 Agent。实际模型/推理档位未由工具证明，记为未知，不估算费用。

指定集成/桌面发布负责人：`01a12bc2-907a-7702-b6dd-788225c5dfe4`。下一步从精确远端任务 commit 审阅差异，将最新 main 的 App/Tab/composer 合同纳入组合验证，并裁决上述并发恢复边界；共享 CI、版本、正式构建、安装及发布只由原 owner 执行。不得覆盖冻结版本或替换/重启日常客户端。
