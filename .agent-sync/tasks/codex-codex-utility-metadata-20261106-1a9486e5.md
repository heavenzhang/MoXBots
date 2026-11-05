<!-- git-project-sync-task:source-digest=74747e47ca8c6f09e71330e50a6f8db302bc9d4d412a290f371ddddc2ca8feb0 -->
<!-- git-project-sync-task:id=1ad00b6f-835a-465b-a5ed-06afb16dc535 -->
<!-- git-project-sync-task:version=2 -->
<!-- git-project-sync-task:branch=codex/codex-utility-metadata-20261106 -->
<!-- git-project-sync-task:base=59e0277a518d8b221bc5756bb890da1f91d4417b -->
<!-- git-project-sync-task:status=in-progress -->

# Task: MB-CHAT-STYLE-20261104 Codex utility metadata admission repair

## Objective

解除 MB-CHAT-STYLE-20261104 的真实 Codex 会话验收准入阻断。上游文本流含原生支持的 response.metadata 时，保留原生元数据并按原校验继续读取完整安全终态。

## Acceptance criteria

- [x] 真实结构重建测试先在旧代码稳定失败。
- [x] 只增加已观察到的 response.metadata 类型，其余事件、工具内容、异常与未完成终态边界保留。
- [x] 单次网关转发正文和 metadata 原字节保持一致。
- [x] 完整 utility 单元 31 项、完整类型检查、定向 lint 和 diff 检查通过。
- [ ] 唯一桌面负责人组织 CI/main、下一候选和真实 Codex 长会话验收。

## Completed

生产改动仅为一个 SSE event 类型。回归覆盖 metadata 正常转发、缺终态、失败/不完整终态、未知事件、metadata 携带工具 item/part/response 及终态之后追加事件。

## Verification

- Source digest: `74747e47ca8c6f09e71330e50a6f8db302bc9d4d412a290f371ddddc2ca8feb0`; 旧代码正向红例稳定失败；修复后31项utility单元通过；完整npm run typecheck、定向ESLint、git diff --check通过。实际新候选原生验收待桌面唯一负责人。

红例见本机 /tmp/mox-utility-metadata-red.log，正向旧代码失败，其余 8 个拒绝边界通过。完整检查和精确源码核验在本次保存时追加。

原始独立结构诊断由桌面发布负责人保存于工作区 work/release-0542-20261106/owner/candidate-5422-d9200b95/codex-utility-upstream-shape-diagnosis.json，结构 SHA256 da2108316810bf806adf523308c706992201af5f8b2fe690e7200ab32a6a63a0。47 帧中第 43 帧 response.metadata 被拒，其后有 completed 且仅 assistant/output_text。未保存上游正文、认证信息。该诊断与已安装请求同源码/模型/运行时，helper 环境不是已安装请求的原字节证据。

官方原生实现亦保留该类型作为元数据事件。
https://github.com/openai/codex/blob/main/codex-rs/codex-api/src/sse/responses.rs

## Blockers and unknowns

两次已安装 UI 请求均在准入前失败，真实折叠正向验收仍未完成。修复后的实际原生结果、当前真实审批/未知样本、发布通道晋级另行验证。未调整未经证实的 terminal-text 假设。

## Deployment request

desktop builtin client 的 Node Sidecar；唯一 CI/main/版本/构建/发布负责人仍为 01a12bc2-907a-7702-b6dd-788225c5dfe4。冻结 0.5.42/542.2 不混入新字节。此分支经本地验证后交下一未冻结批；原有 unknown 账本、凭据、端点、重试和任务准入规则沿用。

## Next step

将精确源码 SHA 交桌面负责人独审，在相应 CI/main 后组织新候选，对真实只读长任务验证能准入及整轮折叠、展开顺序和成果/待处理项可见性。
