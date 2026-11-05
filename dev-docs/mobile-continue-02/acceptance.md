# MB-MOBILE-CONTINUE-02 验收与发布交接

## 本批结果

只优化原会话继续工作的核心路径：首页状态覆盖 → 同Bot/Session → 固定进展/下一步 → 原当前请求 → 原成果 → 原草稿。未引入Task账本、协议、执行owner、依赖或数据迁移；没有把complete当成业务验收，也没有从内容hash臆造版本顺序。完整项目组织、可编辑业务发送提案、成果版本谱系仍不在本批。

## 确定性验证

在 mobile/app、Node24运行：`node node_modules/typescript/bin/tsc --noEmit` exit0；`node node_modules/eslint/bin/eslint.js --config eslint.config.cjs .` exit0、0告警；`node --experimental-strip-types --test tests/*.test.ts` 124通过/0失败。日志位于 evidence/type.log、lint.log、policy.log（本地忽略日志）；新增回归包括未知回执优先、过期generation/turn不算当前请求、原会话读取门禁、旧回复不冒充新要求回复、覆盖计数与分批预算/失败重试顺序。`git diff --check`通过。

## 产品组件实际验收

使用当前源码Expo网页QA、IAB可见场景，全部合成数据。预览入口隔离到本任务目录的expo-router后重新载入；未把早期误指向build9入口的页面作为证据。无真实模型、真实审批或远端业务写入。

- 主审：390长对话从旧记录点“查看当前请求”后原审批按钮出现在视口；概览最近要求/回复来自同一snapshot。允许原请求后切换到“本轮已结束/继续补充”。
- 主审：在原草稿写入文本，从概览打开成果，点继续修改，返回同一Session，草稿原文仍在且追加原成果ID/SHA引用。合成发送新消息后，再打开原成果，ID aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1 与完整64位a内容标识仍在，不因新消息消失。证据 evidence/primary-artifact-after-message.jpg。
- 主审：首页19条会话首批读取之外明确提示7条未同步、计数带+；主动续读后17需要你/1进行中/1本轮结束且未知提示消失。证据 evidence/primary-home-coverage.jpg。
- 主审：未知回执查询仍保留原文，发送禁用，没有自动重新发送的可见现象。证据 evidence/primary-unknown-receipt.jpg。
- 主审：320输入聚焦后document activeElement为原输入框；输入框x55..265/y689..729，在320×740内，页面scrollWidth=innerWidth=320。工作概览完整可滚动，关闭/返回原草稿。证据 evidence/primary-320-work.jpg。
- 非实现者：独立origin审阅19条目录/部分失败、320/390、长记录定位、成果往返、未知回执、过期审批拦截和读取失败重试，未发现阻断/P1/P2。具体动作、限制与截图见 INDEPENDENT-REVIEW.md。主审已阅读报告并复验关键路径。初次review PNG因裁切不用于完整布局结论，已由主审补完整JPEG并交审阅者视觉复核；审阅者补拍时IAB不可用，该限制记录于其报告；源实现未变化。

## 边界与后续门禁

源码审阅确认principal/identity/agent/session、owner epoch、迟到读取代次与列表更新时间指纹门禁；本轮没有动态构造真实账号切换或精确网络竞态。真实iOS键盘、VoiceOver、真实账号/Host权限与执行、重登后的真实成果持久化、正式安装分别由原owner继续，不以网页夹具代替。

## 部署归属

范围只含mobile，不要求发布desktop/Host/cloud。shared CI/main owner：01a12bc2-907a-7702-b6dd-788225c5dfe4；mobile版本/构建/签名/安装owner：01a12b99-7b38-78b1-831f-9c60257d386a。版本由mobile owner分配，不复用0.2.1 build9/tag/制品。先合并功能源与owner版本材料成一个固定候选，再由原sharedCI/main owner运行唯一最终CI并集成。开发会话不运行共享CI或正式构建、不改日常桌面或101运行实例。CI、源main、制品摘要/签名、安装/启动和真实业务验收分别记录；回滚使用原owner保留的build9原制品。

功能分支 codex/mobile-continue-02-20261103；基线 f719dad17191fc9ea260e8775be85c143af36f1d。本文件随功能提交；精确提交SHA、版本候选、CI、main、制品与安装结果由Git refs和原owner发布记录补充，未确认前不宣称已发布。

mobile owner准备结果：0.3.0-rc.1/build10已预留，build9回退包重验；当前Kevin手机暂不可用，尚未构建/签名/安装。不因接入其他设备擅自改安装目标。
