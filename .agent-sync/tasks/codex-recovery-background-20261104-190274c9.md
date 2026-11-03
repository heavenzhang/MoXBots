<!-- git-project-sync-task:version=2 -->
<!-- git-project-sync-task:branch=codex/recovery-background-20261104 -->
<!-- git-project-sync-task:base=065f2b6c8fb2aff58e774000909990b531ff8eb8 -->
<!-- git-project-sync-task:status=in-progress -->

<!-- git-project-sync-task:id=f8c444ca-a4c7-4510-b858-8cf16050d25c -->
<!-- git-project-sync-task:source-digest=92efd217bb86c3aec84da46ed8bc4fddf13c8a60cba28527e2fff16f5d17adb0 -->

# Task: MB-RECOVERY-UX-20261102 后台恢复与必要决策提示

## Objective

用户明确要求：后台自动处理核对，只有真正阻断当前任务且需要用户决定时提示，写清操作、影响和处理办法。本分支接续 MB-RECOVERY-UX-20261102，基于已交付 main065f2b6c，保留原 owner、账本、Stop 和未知操作保护。

## Acceptance criteria

- [x] BG-01：历史未知记录、检查中、检查成功和单独检查失败均不显示顶部提醒，也不发布底部待办；当前暂停的任务必须由准确 toolUseId 对应未确认调用才生成提示。
- [x] BG-02：原 Session mutation lock 内自动收集已证明回执；原一次性核查仍由原执行 owner 准入，无 UI 时新输入准入亦会核对已有证明，不新建执行器或轮询。
- [x] BG-03：提示列出具体操作/已知对象/任务及依赖/检查结果/处理办法；最多展示三项，更多进入详情；可跳原操作、提供线索、生成未发送查询草稿或延后，未知保护持续。
- [x] BG-04：本地行为、类型、lint、恢复集成与真实浏览器组件页面验证；单独记录新客户端真实会话验收。
- [ ] BG-05：源码提交与同步校验，远端状态以交接回执为准；交原 desktop owner 独立审查与集成。
- [ ] BG-06：原 owner 组织共享 CI/main、新不可变版本/制品、安装与真实原生 UI 验收、既有更新通道晋级。

依赖：BG-03依赖BG-01；BG-05依赖BG-04；BG-06依赖精确远端SHA和原发布队列。下一步以本记录 Next step 为准。

## Completed

服务端 RecoveryActionSnapshot.attention 仅作显示投影，由当前已结束的暂停任务、TOOL_OUTCOME_UNKNOWN、准确待确认调用与原自动核查准入共同计算。运行中/已完成/用户Stop/尚未结束/其他调用/可自动核查/未结束委派均不冒充用户待办。历史操作记录仍保留。UI自动检查完全静默；顶部和底部同源，只显示真实阻断；原 continuation 保持挂载和准入。英文/中文文案同步。详情保留原CAS持久补充，不将用户说明当成功证明。

服务端 reconcileAvailableRecoveryProof 在原 reconcileBuiltinExecutionEvidence（原新输入准入路径）自动保存已证明回执；可选回执采集失败仍在finally执行原生错误/完成修复。它不启动核查、不发送消息、不执行工具。原空闲检查中的一次性调查继续沿原owner，不增加后台调度器。

## Verification

- Source digest: `92efd217bb86c3aec84da46ed8bc4fddf13c8a60cba28527e2fff16f5d17adb0`; Node24 unit80 + DOM55 + integration118, tsc/scopedlint/classification/build:web PASS; IAB component fixture desktop/390px PASS; native release PENDING.

本地 unit80、DOM55、integration118，共253项通过；覆盖准确提示/静默、历史六条、异步换会话/忙碌/卸载/StrictMode、丢响应、笔记持久入口、原继续入口、Stop/unknown和后续执行。tsc/scoped ESLint通过，分类及npm run build:web（含license、theme CSS、8项theme测试）通过。IAB实际组件页面在桌面与390px下验证静默切换、具体提示、表单保存、原tool ID回调、草稿、Escape和焦点恢复；数据为本地合成fixture，不是生产执行验收。证据 dev-docs/recovery-ux-20261102/background-20261104.md。

## Blockers and unknowns

desktop builtin client/macOS-arm64/updater/sharedCI/main 唯一负责会话继续01a12bc2-907a-7702-b6dd-788225c5dfe4（本轮已确认接收）。本开发不分配正式版本、不自行触发共享CI/PR/main/安装/通道，不覆盖原541.1。无cloud/mobile/Host/website部署；无迁移。当前代码未合入/未发布/新包原生未验，不能将组件fixture当作原会话完成。

## Next step

向原desktop owner交精确远端提交、任务记录及253项回归/浏览器证据，请其独审后纳入下一未冻结批，统一集成main、必要CI、签名版本、新包原会话静默/阻断/定位/补充/未知保护验收和原更新通道发布。
