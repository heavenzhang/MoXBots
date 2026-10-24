<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/todo-before-execution-20261025 -->
<!-- git-project-sync-task:base=848e333455c7045534bf51a951a19b6945c6aa1a -->
<!-- git-project-sync-task:status=in-progress -->

# MB-TODO-BEFORE-EXEC-20261025

## Objective

多步骤任务在实际执行前生成 To Do List，执行过程中同步更新；已授权任务不再要求方案确认。保持讨论方案、Stop、权限、真实验收和未知结果不重放边界。只修改现有会话 owner/ledger/进度投影，不创建新 scheduler 或数据存储。

## Acceptance criteria

- [x] T01 核实权威仓库、main、隔离分支、现有任务/发布归属。基线 848e333455c7045534bf51a951a19b6945c6aa1a；start/task-init PASS。
- [x] T02 执行前在原准入 CAS 中持久化稳定清单。多步骤请求在首次 native dispatch 前可读取，不依赖模型先自发调用 TodoWrite；不创建 proposal/伪造 confirmation。依赖 T01。
- [x] T03 现有原生任务事件同步同一组 task ID，重试/接续保留，旧事件不覆盖新任务；完成须主 Agent 验收。依赖 T02。
- [x] T04 聚焦单元/真实 SessionStore 集成与 UI 投影回归、类型/lint；独立只读审查并修复。依赖 T03。
- [ ] T05 提交、推送与 handoff；由已有 owner 协调 CI/正常合入 main，并验证远端主干包含最终修改。依赖 T04。
- [ ] T06 交既定发布会话下一未冻结批次；签名制品、安装版本和真实账号路径由原 owner 统一验收。依赖 T05。

## Completed

执行前任务物化、精确原生进度同步、单步兼容、同任务接续和根验收结算已实现，核心源码已提交推送。428项本地回归、类型/静态检查及原生SDK合成上游验证通过；独立审查问题已修复。CI/main及正式发行仍由既定owner执行，尚不算主干或发布完成。

## Ownership and scope

开发：本聊天主 Agent；只读独立审查 worker todo_review。仓库 https://github.com/heavenzhang/MoXBots.git。部署单元 desktop builtin client，及既有共享 Node Session 进度；桌面 combined CI/主干集成/版本/发布唯一会话 01a12bc2-907a-7702-b6dd-788225c5dfe4（MoxBots桌面端统一打包负责人），沿用 canonical plan，用户已明确授权通知和统一发布。预登记已发送，最终精确 SHA 后发送正式请求。不改云、Host 服务、手机或日常 App。DSH/外部 Runtime 的原生进度和授权语义保持，普通行动自动闭环仍以真实 adapter 能力为界。

## Verification and stage states

代码：已实现。模拟/本地真实磁盘集成：428项unit/DOM/integration全通过；类型/lint/依赖/分类/文档与server bundle通过。真实SDK合成供应商Todo/返工及双worker诊断回归通过；双worker首轮原门禁超时的未定时序观察及原始证据保留于验收记录。真实 Provider/签名客户端：待原发布 owner。生产验收：待统一发布。Git提交/主干交付：待完成。版本/制品摘要/发布批次由原 owner 分配，本开发会话不占正式版本。

## Execution record

主 Agent统一实现和验收；1 名 gpt-6.1-sol/medium 内置 worker只读审查（请求参数，可确认）。选择依据为准入、投影、旧事件和验收的交叉风险；不启用额外外部模型，现有源码与确定性测试足够。具体模型用量/费用未知，不估造节省。

## Blockers and unknowns

无开发授权阻断。已有发布会话当前批次是否冻结以其回执为准，不将预登记等同于 CI/主干/发布完成。

## Next step

提交推送精确源码及验证证据，交原owner统一CI/main集成并在远端核验，再由同owner选择下一未冻结发行批次。
