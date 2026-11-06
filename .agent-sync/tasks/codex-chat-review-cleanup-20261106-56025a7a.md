<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/chat-review-cleanup-20261106 -->
<!-- git-project-sync-task:base=045b30eef4caf827249934539b6d0197674266b4 -->
<!-- git-project-sync-task:status=in-progress -->

# Task: MB-CHAT-REVIEW-CLEANUP-20261106 简化聊天验收操作

## Objective

MB-CHAT-REVIEW-CLEANUP-20261106：按用户截图要求简化聊天。撤掉请求验收、重试验收、返工模板入口与对应数量/回执说明，让用户直接在原对话反馈。范围仅桌面 renderer；后台任务账本、核验、权限及旧消息不变。

## Acceptance criteria

- [x] 四项主任务待核验时，无底部验收操作栏或空分隔区。
- [x] 子任务保留真实状态、错误原因和查看详情；已验收主任务历史默认折叠并能展开。
- [x] 移除预设消息发送/填入草稿路径；没有自动请求或自动接受任务。
- [x] 相邻组件回归、类型、lint、实际组件浏览器检查。
- [ ] 原桌面负责人独立审阅、主干集成并核实远端包含。
- [ ] 原负责人统一安排本机/正式版本及原生真实会话验收。

## Completed

- 从远端 main 045b30eef4caf827249934539b6d0197674266b4 创建独立工作树，未修改其他开发分支。
- 删除 SessionTaskResults 请求状态及整组按钮、SessionTaskResultRow 返工模板入口、Chat 对应预设消息回调和已无调用的目标校验器。
- 用结果展示回归替换已删除按钮的旧测试；保留快照共用、历史执行身份、异常可见和未核验不完成的检查。
- 实际组件验证页面及证据：dev-docs/chat-review-cleanup-20261106/。

## Verification

- Node 24，vitest DOM：SessionTaskResults、useSessionTaskOrchestration、ExecutionStatusBar 共48项通过。
- tsc --noEmit、修改源码及预览eslint、test classification、git diff --check通过。
- IAB实际生产组件 + 合成数据：1280浅色四项待核验无操作栏；已完成历史展开显示4项；390深色异常结果和查看原因回调正常。
- 浏览器夹具不是完整原生Chat，不证明真实账号/发送/部署验收；生产消息没有删除。
- 本地renderer构建结果见验收记录。

## Blockers and unknowns

- desktop/macOS-arm64/updater/sharedCI/main仍由01a12bc2-907a-7702-b6dd-788225c5dfe4唯一负责；本任务不创建PR、触发共享CI、分配版本或安装。沿用用户默认集成交付与负责人交接授权。
- 本次不新增后台自动验收机制，也不把历史awaiting_review强行标为完成。既有核验能力不变。
- 无服务接口、存储迁移、其他部署单元依赖。

## Next step

桌面负责人审阅本分支精确提交并接入下一未冻结批次，统一完成main交付和原生会话验证；已冻结版本不覆盖。
