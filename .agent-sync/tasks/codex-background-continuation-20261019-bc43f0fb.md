<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/background-continuation-20261019 -->
<!-- git-project-sync-task:base=a6e9f9c9b43603b647090827f4851ea4366f8766 -->
<!-- git-project-sync-task:status=in-progress -->

# Task: MOXBOTS-BACKGROUND-CONTINUATION-20261019

## Objective

补齐安全后台接续：默认阻挡，原 Query owner 对用户刚观察的精确 task/run/Query 实例确认和撤销；不重放未知结果、不猜测后台命令安全性，不接管薪资或桌面发行 owner。

## Acceptance criteria

目标：长期后台 Shell 不再无提示地阻断接续；所有非 ambient 默认阻挡，仅用户针对已观察的精确运行显式允许并行。禁止按命令或描述猜安全。保留 Query/SessionEngine/Goal 原 owner、等待用户/队列/未知结果/取消门禁。

仓库：https://github.com/heavenzhang/MoXBots.git；main；branch codex/background-continuation-20261019；base a6e9f9c9b43603b647090827f4851ea4366f8766。原客户端会话1eeeeeb3-6825-4157-a5fb-83ea4664d933连续断流退出，当前Codex主Agent接续同一任务，保留原未提交修改，不重复新建会话。原薪资业务仍由原会话负责。

## To Do

- [x] 独立review1：否决无父Shell自动放行，改为非ambient默认阻挡。
- [x] 第一轮97 unit +108模拟SDK集成通过（不覆盖之后的接口修订）。
- [x] review2：用户观察的task/run/Query实例身份必须经原owner原子校验；缺失/陈旧身份拒绝。
- [x] 确认失效/撤销/Query替换/队列/未知结果的回归；UI只展示权威可确认能力，旧回执不能污染新任务。
- [x] 完成中英文文案、DOM/桌面真实组件合成渲染与相称type/lint验证；原生真实Session仍另验。
- [ ] 同步最新main，审阅合并结果、正常CI/PR、合入及远端SHA核实。
- [ ] 交由唯一桌面发布owner准备合规签名候选；安装与真实模型验收另验，不重启日常客户端。
- [ ] 修复验收生效后恢复原薪资Goal至受控业务验收、测试、远端master、原CI生产与真实路径复验（观察主任务负责）。

完成标准分别追踪代码、模拟、真实联调、main、候选、安装、生产；任何前置状态不能替代后置验收。候选/原生构建不得绕过资源/签名校验，不操作真实薪资数据或停止既有会话。

当前依赖：原补修会话公开idle，无并发writer；本机运行0.5.13-rc.1不含本补丁确认入口；唯一桌面publisher另有4aacea71候选在构建，不能混改冻结包。完整观察证据留观察目录，不提交日志、凭据或业务数据。

下一步：沿现有后台详情reader投影精确Query实例token+run身份；确认/撤销在lifecycle同步比较后提交；route只校验并交facade，UI按身份fence处理晚回执；先加回归再实现。

阶段成果：精确身份确认/撤销及Query authority失效已落地；Node24定向229项 + 后续owners35项通过，typecheck/ESLint通过。原17文件修改完整保留并整合；当前主Agent串行负责源码，原客户端会话保留idle且不再发送接续。

## Completed

- 已整合原修复修改并补齐运行身份、Query替换、撤销、UI晚回执保护；代码提交在当前任务分支。
- 同步当前main4aacea71，保留较新的native Stop修复；仅共享计划顶端冲突，双方记录均保留。
- 保留原客户端会话与未提交修改快照，接续后不再发送重复prompt，无并发writer或运行应用操作。

## Verification

Node24定向7文件229项unit/DOM/模拟SDK集成通过；追加authority撤销/同Query重新授权后owners35项通过；typecheck、定向ESLint和源码空白检查通过。真实组件IAB合成确认/撤销/拒绝桌面交互通过。合并后的完整回归与MoxBots Web/server构建在执行；最终日志在本机观察目录，验收状态见dev-docs/background-continuation/acceptance.md。

## Blockers and unknowns

正常PR/CI/远端main尚未交付；未准备本补丁的签名候选，未安装或做真实Provider/原生验收。已有唯一publisher的冻结候选不能修改。本任务限制不向其它既有线程发消息、不重启客户端；必要协调在独立准备完成后再明确请求。HRM生产仍由原业务/CI owner负责。

## Next step

完成合并结果回归/构建，正常PR与精确head CI/main；核实远端包含成果。随后准备可审阅的唯一publisher接纳请求，保持候选/安装和薪资验收的独立门禁。
