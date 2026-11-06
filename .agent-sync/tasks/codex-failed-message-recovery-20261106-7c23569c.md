<!-- git-project-sync-task:source-digest=ecfa406dbbfd87d736a38b33cc6d92e3fa4aa68d72709d6334cde16fb6e9ee2e -->
<!-- git-project-sync-task:version=2 -->
<!-- git-project-sync-task:id=0a3defff-d350-44fd-ad09-bac24c90bcd8 -->
<!-- git-project-sync-task:branch=codex/failed-message-recovery-20261106 -->
<!-- git-project-sync-task:base=045b30eef4caf827249934539b6d0197674266b4 -->
<!-- git-project-sync-task:status=in-progress -->

# Task: MB-FAILED-MESSAGE-20261106 发送失败记录的逐条恢复与防重复

## Objective

修复失败用户气泡滞留且无法逐条恢复的问题。范围仅桌面 Renderer；不变更模型配置、业务历史或后端执行规则。稳定任务 MB-FAILED-MESSAGE-20261106；主 Agent 实现与验收，零子 Agent。

## Acceptance criteria

- [x] 失败记录有可访问的逐条操作，已确认未接纳可重发/移除；未知结果只检查。
- [x] 同文多记录按消息身份处理，正式历史及草稿不变；过期操作不重发。
- [x] 定向单元/DOM/类型/lint 与实际渲染检查通过。
- [x] 源码提交推送与project-sync远端校验通过；精确HEAD由本记录metadata及外部release-queue请求核实。
- [ ] 原owner统一CI/main/新包，远端main与已安装验收分别核实。

## Completed

- [x] 当前安装 0.5.42/542.2；源于 main045b30e 的隔离工作树。
- [x] 本机日志核实两次 503/model_not_found，任务识别失败于接纳前；不重放或删改用户记录。

## Verification

- Source digest: `ecfa406dbbfd87d736a38b33cc6d92e3fa4aa68d72709d6334cde16fb6e9ee2e`; Documentation status only; production source unchanged from f3de6d6f44c047776fc82af9e050f63ed3ae35fd. Prior 192 tests/type/lint/build/IAB checks apply; main/native release remains with original owner.

- Source digest: `ecfa406dbbfd87d736a38b33cc6d92e3fa4aa68d72709d6334cde16fb6e9ee2e`; 192 targeted DOM/unit tests PASS; stale retry effect repair 3 PASS; tsc --noEmit PASS; targeted ESLint PASS; test classification PASS; renderer build with 8 theme tests PASS; IAB actual Message synthetic mouse/keyboard/draft/1280 and 800 viewport checks PASS. Native installed acceptance and main delivery pending original desktop owner.

- 192项定向测试、全树tsc、定向eslint、classification、renderer build（另含8项theme测试）PASS；新加过期重试用例修正effect后再次通过。真实组件IAB1280/800鼠标、键盘、草稿与无横溢出PASS；全部为隔离合成验收。见dev-docs/failed-message-recovery-20261106/acceptance.md。

## Blockers and unknowns

- 原 desktop/sharedCI/main owner 正在准备冻结542.6；本任务进入其下一未冻结批。Chronicle 未运行；本机日志与截图定位。

## Deployment request

- Required: desktop/macOS-arm64 新包，目标既有日常 Mac；无云/Host/手机/网站改动。
- Handoff: this remote branch and task record; report the resulting head SHA outside this file.
- Evidence: 相邻回归测试与 dev-docs/failed-message-recovery-20261106/acceptance.md；无迁移/配置/跨单元依赖。
- Status: 源码/模拟/合成真实渲染/提交推送已通过；待原owner下一批main/CI/新包/真实验收。
- Owners: desktop/sharedCI/main 唯一会话01a12bc2-907a-7702-b6dd-788225c5dfe4；本会话01a1b0a3-5c66-7da0-9aa8-515caa1c99d0仅开发交接，不分配版本/触发CI/构建/安装。

## Next step

- 原owner按release-queue中最终HEAD受理下一未冻结批；其正常CI/main/构建/安装后，本任务核远端main包含与原生逐条操作。
