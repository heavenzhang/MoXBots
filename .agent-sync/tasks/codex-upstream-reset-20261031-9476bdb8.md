<!-- git-project-sync-task:source-digest=9d41ed4c19c74cb1533e8e99b67798009048d9948a34798375742b3136dd88a2 -->
<!-- git-project-sync-task:version=2 -->
<!-- git-project-sync-task:id=68dce249-a5b4-46e8-9865-0925a9d10fc4 -->
<!-- git-project-sync-task:branch=codex/upstream-reset-20261031 -->
<!-- git-project-sync-task:base=d18137e87155994c4ade3d1889d04830821a8eda -->
<!-- git-project-sync-task:status=in-progress -->

# Task: MB-UPSTREAM-RESET-20261031 连接重置诊断与安全恢复

## Objective

定位截图会话 ECONNRESET 的连接链路，修正当前网络路由并补足逐请求证据；避免将本机映射的 502 误报为供应商 HTTP 故障。恢复动作边界与已有 replay-scope/replay-recovery 任务联合交付，不覆盖其修改。

## Acceptance criteria

- [x] 核实本机/供应商路由，比较新建与复用连接，并标明无法追溯的历史证据。
- [x] 通过原生设置保存单供应商的现有代理范围修正；其他配置摘要不变；真实认证只读 API 200。
- [x] 补足脱敏连接观测和正确提示，不增加自动重放权限或新重试预算。
- [ ] 最终回归/类型/lint、提交推送、远端分支核验。
- [ ] 原 owner 联合恢复依赖完成 main/CI/签名发布与真实会话验收。

## Completed

安装版/运行日志诊断、无密钥新建与复用探针、配置 UI 修正和实际认证 models API 验证；连接观测/错误提示及回归源码完成。诊断边界见 `dev-docs/upstream-reset-20261031/acceptance.md`。

## Verification

- Source digest: `9d41ed4c19c74cb1533e8e99b67798009048d9948a34798375742b3136dd88a2`; Node24: 92 targeted tests PASS; full tsc PASS; scoped eslint PASS; test classification PASS; diff check PASS; real configured-proxy authenticated models GET200; no inference or business replay

最终七文件 92 项通过；全量 TypeScript、定向 ESLint、测试分类与 diff whitespace 检查通过。Node 24.20.0，隔离 loopback 测试；原任务未重放，推理调用为零。

## Blockers and unknowns

历史 reset 缺少 socket/TLS 证据，不能追溯认定远端、TUN 或连接复用。当前间歇直连故障可以复现，后续也有成功；代理修正是已验证的缓解。原任务历史 unknown 由已有恢复任务处理，本聊天不清账本。当前已安装版尚未包含本次源码。

## Deployment request

Required: desktop/macOS-arm64/updater/shared CI/main；owner `01a12bc2-907a-7702-b6dd-788225c5dfe4`。开发分支 codex/upstream-reset-20261031，不自行分配版本、不触发共享 CI/正式构建/安装。源代码和网络配置修正分别验收；配置可独立回退。依赖：现有 replay-recovery-20261030、replay-scope-20261031 联合审查；本改动无数据迁移、无新凭据/公网入口。当前主干/制品/原生恢复验收未完成，发布请求待源码验证后排队。

## Next step

验证已通过；提交推送精确源码分支，加入既定发布队列供原 owner 联合审阅。
