<!-- git-project-sync-task:source-digest=aa1fbec843783fb9dbf364c57443fa8cd7d32a52440eac9da05b413aeb30ad50 -->
<!-- git-project-sync-task:version=2 -->
<!-- git-project-sync-task:id=1520b587-2cdb-4730-bfb7-355f23cbdb7f -->
<!-- git-project-sync-task:branch=codex/chat-jitter-20261106 -->
<!-- git-project-sync-task:base=14956e2fd898ba0cdb9d0be089da524c1a46c91b -->
<!-- git-project-sync-task:status=in-progress -->


# Task: 修复长历史聊天界面持续抖动

## Objective

MB-CHAT-JITTER-20261106：修复长历史会话静止时反复上下跳动。只处理已有聊天滚动/虚拟列表几何；不执行原业务操作、不修改会话账本、权限、模型或发布版本。当前 Agent 直接实现并负责 UI 验收，零子 Agent；没有独立审阅时明确记录。

## Acceptance criteria

- [ ] 用现有实际 MessageList/Virtuoso 和 WebKit 复现可测的连续位移，记录根因及反证。
- [ ] 静止长历史在收敛后连续帧无反复上下跳动；保留流式跟随、手动上滚、显式回底、展开、搜索和生命周期围栏。
- [ ] 定向回归、类型和 lint 通过；真实日常客户端验收由桌面唯一 owner 统一安排。
- [ ] 提交精确源与证据、推送工作分支，交原 sharedCI/main owner 统一集成，核实后续主干/发布状态。

## Completed

- [x] 核实权威仓库、origin/main14956e2f、干净隔离 worktree；日常安装0.5.42/542.2。
- [x] 用户确认聊天内容反复上下跳动；原会话只读打开，未发送消息、未执行旧工具。
- [ ] 根因、实现、确定性回归。
- [ ] 实际组件与真实窗口验收。
- [ ] 提交/远端工作分支/统一 main 与发布交接。

## Verification

- Source digest: `aa1fbec843783fb9dbf364c57443fa8cd7d32a52440eac9da05b413aeb30ad50`; Native UI visual failure observed; 120/300 scoped read-only samples recorded; isolated WebKit/WKWebView comparisons stable; existing full scroll baseline FAIL row-shrink assertion; product code unchanged.

实际结果与反证见 dev-docs/chat-jitter-20261106/acceptance.md。21组开发、6组生产及原生WK隔离对照未复现持续抖动；原生日常截图确认异常，120/300帧采样几何稳定。现有全套基线另有row shrink断言FAIL，尚未关联。没有产品源码修改，不把只读诊断当修复；UI owner为当前Agent。

## Blockers and unknowns

Chronicle 当前未运行，没有读取历史录屏。真实窗口最初处于另一操作的登录验证中，未干预；登录完成后只读打开微信 kevin。已连续观察到原生窗口静止时正文跳动和空白变化；前述手动滚动后的短时停稳不能作为通过。开发/生产Playwright WebKit及macOS WKWebView隔离对照未复现持续抖动；正在原窗口只读检查110%缩放下的逐帧几何。浏览器合成验证不等于已安装客户端验收。

## Deployment request

- Required: desktop/macOS-arm64/updater，需要下一未冻结批修复发布；sharedCI/main沿同一owner。
- Owner: 01a12bc2-907a-7702-b6dd-788225c5dfe4，沿main既有归属。本开发会话不触发PR/共享CI/正式构建/替换日常应用。
- Handoff: 本任务分支和记录，另存工作区work/release-queue精确SHA；不改变已冻结542.4批次。
- Compatibility: renderer only，未改协议/数据库/权限；版本与不可变制品由原owner分配。
- Status: 排查中；原生故障验收请求已发送既有owner（消息工具成功，不等于接收/处理）。未合主干、未发布、原生验收未完成。

## Next step

等待用户完成/允许离开当前新建项目表单，再安全还原临时translateZ(0)诊断样式并继续原生A/B定位；先用实测确认几何或绘制原因，避免猜测性产品修改。
