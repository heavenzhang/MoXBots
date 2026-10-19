# MOXBOTS-STREAM-502-20261020-01

## Scope and result

修复客户端 Anthropic SSE 终态兼容性与 502 诊断；保留原 Query/Session/Goal authority、Stop、请求指纹防重放、已完成/不确定工具 ledger。未新增重试、队列、模型调用、配置或持久化 owner。

- 两层恢复包装共用 typed JSON 事件判断。只有有效 message_stop 进入消费者队列才算完成；终态后取消剩余读取、结束响应，不解析同块或后续块中的尾帧，也不等待 socket EOF。
- 空 unnamed/ping data 作为非输出心跳忽略；有名模型事件必须有一致的 JSON type。单独 [DONE]、EOF、空/伪造 terminal、error 和实际断流仍失败关闭并禁止重放。
- Anthropic 直通日志记录 provider/model、host、固定协议端点、direct/proxy/unresolved、headers/body 阶段、收到的 HTTP status 与本机 mappedStatus、取消/超时、已转发字节数、白名单底层错误码（包括递归 cause/AggregateError）及受限上游 request ID。
- 不记录 Error.message/stack、请求/响应正文、完整 URL、代理地址或认证头。状态和错误响应协议保持；consumer 正常取消不误报 body failure。
- forward cancel 在等待 reader.cancel 前撤销底层连接，避免终态清理滞留。

## Local validation

| 检查 | 结果 |
|---|---|
| 6 个定向 unit 文件 | 209 passed |
| 5 个 loopback integration 文件 | 81 passed |
| 合计 | 11 files / 290 passed |
| TypeScript `tsc --noEmit` | passed |
| Changed-file ESLint `--max-warnings=0` | passed |
| `node scripts/check-test-classification.mjs` | passed |
| `git diff --check` | passed |

新增用例覆盖同块/分块/分隔符拆分/CRLF终态、尾部 [DONE]/畸形/error/空data、终态前 [DONE]/伪造终态/EOF、Stop等待终态、相同指纹拒绝及下一不同合法推理。两控制器单独与组合路径均覆盖。原 model/context/durable recovery 测试继续覆盖迟到输出、后台/前台归属、恢复期间停止、持久 checkpoint 清理与已完成/不确定工具防重放。

真实 SDK/native child + 本地模拟供应商（无付费模型，paidCalls=0）：

| 模式 | 工具计数 | 主/备请求 | 结果 |
|---|---:|---|---|
| --terminal-trailer | 1 | 5 / 1 | 主备终态后带 [DONE]；安全接管、任务完成、保留工具结果 |
| --stream-failure | 1 | 2 / 0 | 部分输出断流后失败，不切备或重复工具 |
| --stop-during-retry | 1 | 2 / 0 | 原生停止回执完成，不再重试/切备 |

复现入口：`node --import tsx scripts/verify-model-failover-loopback.ts <mode>`。
完整本地输出：WPS MoxBot 项目目录 `work/MOXBOTS-STREAM-502-20261020-01/`。首轮10项失败来自测试误把 max_tokens 当不同请求，该字段本就不参与防重放指纹；改用不同用户内容后通过，未放宽守卫。第一次 tsc 发现 undici Response 与 DOM Response 类型差异，日志参数改为实际需要的最小 headers.get 接口后通过。

## Delivery and boundaries

- Git: https://github.com/heavenzhang/MoXBots.git ，用户明确确认。
- Branch: codex/stream-502-20261020；base: 18e13ce8dbad20e61af3f84173ad87d84bf090a6。
- 验收前无冲突快进 main `8e4c25928cb48b4a7417ea74c27512e566694655`（新增改动为账号登录流程，不与本任务文件重叠），在更新后重新执行290项回归及类型检查。
- 唯一 CI/部署会话：01a12bc2-907a-7702-b6dd-788225c5dfe4（MoxBots桌面端统一打包负责人），按既有职责及本轮用户指令接收。
- 本会话仅本地检查和任务分支提交/推送；不建 PR（避免触发 pull_request CI）、不发共享 CI、不发布构建或部署、不更换日常客户端。
- 候选选择、跨任务集成、CI、main 合入、版本号和原生包由统一会话处理；安装版本0.5.14未变化。
- 现场没有原始异常 SSE 帧，未验证真实 OpenRouter 根因。这里只证明客户端缺陷修复及本地行为，真实 Provider/签名安装/用户路径验收待统一会话。
- 集成需注意同批409/Goal相关修改对相同恢复文件的交叉影响；不可丢弃任何请求/停止/ledger护栏。无迁移或新依赖；回退为恢复此任务代码，不回退用户历史/ledger。

## Task-state mapping

代码实现、本地模拟/SDK验证：完成。提交推送：由最终远端SHA回执确认。共享CI、主干交付、生产发布和真实验收：交给统一会话，本次未执行。
