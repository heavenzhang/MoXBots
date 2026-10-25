<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/brand-prompts-20261025 -->
<!-- git-project-sync-task:base=c5fd489b56d2eb2f19923d9dddc5cb6097cd439f -->
<!-- git-project-sync-task:status=in-progress -->

# Task: MB-BRAND-PROMPTS-20261025

## Objective

清理 MoXBots 向模型声明产品身份、能力和内置帮助时残留的 MyAgents 品牌；同步项目与当前交付工作区的 CLAUDE.md。保留 CLI/Skill 名称、环境变量、协议标签、兼容目录和第三方归属，不更改恢复保护、权限、业务会话或历史记录。

## Acceptance criteria

- [x] B01 核实权威仓库、远端 main、干净隔离分支和发布归属。基线 c5fd489b56d2eb2f19923d9dddc5cb6097cd439f；observe/start/task-init PASS。
- [x] B02 修正实际 assembler、动态 reminder、辅助模型和按需能力说明中的产品称呼；审阅内置帮助的打包品牌适配。依赖 B01。
- [x] B03 聚焦场景矩阵与现有内置帮助回归、类型/lint、本地 server bundle 检查；兼容命令/协议保持。依赖 B02。
- [ ] B04 提交、推送、handoff；由原唯一 owner 组织共享 CI 和正常合入 main，再核实远端主干包含修改。依赖 B03。
- [ ] B05 由原 owner 选择下一未冻结桌面批次，记录精确候选、制品、安装与新会话真实路径。依赖 B04。

## Completed

实现和本地验收完成；源码、兼容边界与发布请求见 `dev-docs/brand-prompts-20261025/acceptance.md`。当前开发会话 01a17383-d8ec-7d91-9a6f-64a684ac665c。

## Verification

554项聚焦unit（含44项MoXBots身份回归）、9项资源/CLI bundle测试、TypeScript/ESLint/依赖/分类/agent-docs、本地MoXBots profile的server/CLI bundle、编译后纯提示词probe与153文件资源preparation通过。源码/本地验证完成；共享CI/main/签名制品/安装/真实Provider待原owner。无业务数据写入。

## Ownership and execution

仓库 https://github.com/heavenzhang/MoXBots.git；开发分支 codex/brand-prompts-20261025。主 Agent 单人实现与审阅，零子 Agent；选择依据为改动集中于静态文案及已有测试矩阵，拆分会重复上下文。不调用外部原因：确定性源码检查足以完成本次文案修复，采用 ai-yaoren-local 纯内置模式；不声称切换当前模型，具体用量/费用未知。

桌面/macOS/updater 与 combined CI/main 唯一 owner 保持 01a12bc2-907a-7702-b6dd-788225c5dfe4，沿 canonical plan 既有指定。共享 server 若被 Host 采用，由原 Host/mobile owner 01a12b99-7b38-78b1-831f-9c60257d386a 选择独立批次；本任务只请求桌面发行，不改 Host/cloud/mobile、不占版本、不改冻结制品、不操作日常 App。

## Blockers and unknowns

无开发授权阻断；正式 CI/main、制品与真实客户端验收待原 owner。此前问题截图具体使用的历史上下文不重写，旧会话能否原位更新提示词以既有 runtime 生命周期为准。

## Next step

提交推送精确源码和验收，通过handoff gate后交原唯一owner统一CI/main/下一未冻结桌面批次；核实远端main和正式安装结果，保留未通过项。

## Root intake

唯一owner已核原用户授权、精确远端8ea和本地产品差异，Root44项profile及9项资源/CLI复核PASS；接收进入下一未冻结524批，与待交499修复合并后只触发一次精确共享CI。源码8ea未部署；23原tag/制品保持，当前日常应用不变。主干/CI/制品与实际新Query身份验收按Root组合任务分别更新，不以接收状态冒称发布。
