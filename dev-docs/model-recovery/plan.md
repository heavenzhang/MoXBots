# MOXBOTS-MODEL-RECOVERY-001

目标：普通 Session 和 Goal 的可恢复模型故障进入持久等待；恢复沿原生历史和工具回执继续，暂停/停止撤销旧唤醒。

仓库 https://github.com/heavenzhang/MoXBots.git；base `885426ea19afe9d3d86b54f0d13695c8bdae9ce4`；分支 `codex/model-recovery-001-20261019`。主 Agent 拥有实现集成及 main 交付；发布聊天仍为 `01a12bc2-907a-7702-b6dd-788225c5dfe4`。

## To Do List

| 状态 | 工作 | 完成标准 / 证据 | 依赖 / 下一步 |
|---|---|---|---|
| [x] | 仓库与 owner 核实 | 干净隔离工作树、observe/start通过；保持已有任务 | 读取原 Session/Goal/Query 不变量 |
| [x] | 恢复架构 | 同一 inference lease 等待，SessionStore唯一持久writer；Goal保留原turn；独立检查确认watchdog缺口 | 实现与审查 |
| [x] | 代码实现 | 持久等待、原native history恢复、动作ledger、取消代次、原UI状态 | 定向验证 |
| [x] | 模拟与故障注入 | 真实loopback HTTP和SDK计数器；重复动作=1；暂停/停止/重启竞态 | 不读取真实业务凭据 |
| [x] | UI及独立审查 | 原聊天等待状态/停止；Goal暂停取消；同revision实际浏览器 | 合成数据不作生产证明 |
| [ ] | 合并后测试与CI | 正常CI、最新main组合回归 | 保留并发变更 |
| [ ] | main交付 | 正常合入并核远端main含提交 | 不强推/绕保护 |
| [ ] | 发布安排 | 完整交付记录给既定publisher并确认接收/批次 | 下一未冻结批次 |
| [ ] | 真实联调/生产验收 | 签名候选原生与真实Provider路径 | publisher独立跟踪，不能以测试/主干代替 |

## 约束

- 先沿现有短重试/合法备用路由，耗尽后才进入15秒至5分钟的长等待；默认每次故障链最多等待30分钟，不刷新期限，截止后保留进度暂停。
- 只重试尚未交付的推理；流式部分交付、结果不确定、损坏回执及持久化失败禁止盲重放。恢复前完整请求归档并持久激活动作ledger；只读核查可继续，确切已完成动作拒绝执行。
- 恢复记录只有非秘密路由摘要、native identity、scope、时间及状态，不保存密钥；原private归档与ledger沿现有0700/0600及容量限制。
- Session的持久意图独立于Goal的业务状态；Goal恢复始终由原Rust owner裁决，Node不得另启Goal turn。旧Query/route/token/控制代次均不可写回新状态。
- 电脑休眠/退出期间不承诺调用；重开原Session恢复持久意图。应用后台任务的owner和生产维护窗口沿既有规则，不操作日常客户端。

## 执行记录

使用 `ai-yaoren-local` 和 `git-project-sync`。主Agent负责跨层实现/验收；`goal_recovery_audit`请求gpt-6-luna/medium，先只读Goal控制及watchdog审查后负责独占持久恢复模块；`bridge_recovery`请求gpt-6.1-sol/high，独占模型桥接lease与流式终端。选择依据：跨层状态主线统一，两个包接口明确且互斥；升级原因：桥接包包含partial stream和Query lease的高后果竞态，直接选较强模型以减少返工；不调用外部原因：本轮现场状态/跨进程验证交接成本高，采用宿主内置有界协作。实际费用和token未提供，不估算。

当前下一步：最终transport配置、最新main组合回归和CI后正常合入，向唯一publisher交下一未冻结批次。最终证据见 `acceptance.md`。代码、模拟、真实联调、生产验收分别计状态。
