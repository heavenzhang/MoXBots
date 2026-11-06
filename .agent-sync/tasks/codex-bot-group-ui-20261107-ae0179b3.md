<!-- git-project-sync-task:version=2 -->
<!-- git-project-sync-task:id=28d89e22-a8f5-4197-bf36-84a4182e80da -->
<!-- git-project-sync-task:branch=codex/bot-group-ui-20261107 -->
<!-- git-project-sync-task:base=4ceeb2d21acc164487ef199b4a5788d7d27c65f1 -->
<!-- git-project-sync-task:status=in-progress -->
<!-- git-project-sync-task:scaffold=false -->
<!-- git-project-sync-task:source-digest=b149671142258da824d15c37ffe905b8bc728bdaa4c514c94e6eaff17ceca906 -->

# Task: GROUP-01 G02 actual membership and recipient controls

## Objective

沿R3完整目标继续G02/G03。当前阶段在G01精确producer86d89e693f19f93dfe96a5cb747c8530519f0cd0之上接实际成员编辑、显式收件选择、原观察者与签名配置接口；随后完成真实Bot收发及HANDOFF，不将UI组件当作全功能完成。

## Acceptance criteria

- 实际组件沿原Sage风格、头像和原观察者，不新建轮询；明确单一收件者，群/版本变化不能静默改投。
- 配置用原Tab apiPost签名入口；只发送ID和版本，重试同requestId，未知结果先核对；冲突保留草稿，旧异步回执不影响新会话。
- 深浅主题、窄屏、键盘/焦点、同名Bot、错误恢复与实际路径验证。
- 完整G03前不开放误导性群发送；真实业务/主干/安装另验。

## Completed

新隔离工作树依赖已验证G01 producer，当前main仍4ceeb2d21。start/task-init因HEAD已含G01正确拒绝；host adopt要求更换旧vendored skill，因此不覆盖技能，按已核对同一仓库/base/依赖手工建立本记录，交付时由host handoff验证。未声称start/adopt通过。

## Verification

本批7文件48项回归、类型、修改文件lint、测试分类通过；依赖0errors/20既有warnings；moxbot renderer构建与隔离WebKit深浅主题/390px/焦点/未知及冲突恢复通过。详见dev-docs/bot-group-ui-20261107/acceptance.md。实际Chat入口、真实独立Bot收发与原生联调未完成。G01此前110回归及原生签名8项仅作为依赖证据。

原主题成员编辑、显式接收者、原Tab签名客户端、SessionBotGroupEditor配置/原观察者接线已完成本地验证；A/B/A和runtime/卸载隔离、断线保留草稿、未知结果先核对与同请求重试均有回归。未增加轮询或群发送假入口。

## Blockers and unknowns

G03跨Bot实际Session收发必须保持出生/配置/权限与回执owner，不能仅把群UI转为根Bot普通发送。现有desktop/sharedCI/main唯一owner01a12bc2-907a-7702-b6dd-788225c5dfe4；阶段提交/推送交其统一审阅集成，不自行版本/正式构建/安装。

## Next step

按dev-docs/bot-group-ui-20261107/PLAN.md接G03：原Inbox真实请求、成员Session birth与结果关联，再挂载原Chat入口/Composer并完成真实A→B→成果路径。将本阶段精确源交原owner审阅和统一集成，整体goal保持active。
