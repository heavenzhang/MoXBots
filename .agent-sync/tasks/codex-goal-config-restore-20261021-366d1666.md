<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/goal-config-restore-20261021 -->
<!-- git-project-sync-task:base=4206eb2ef8f8bf2f9dc211b4f13842441dead0de -->
<!-- git-project-sync-task:status=ready-for-review -->
<!-- git-project-sync-task:scaffold=false -->

# MOXBOTS-GOAL-CONFIG-RESTORE-20261021

根任务 SALARY-RECOVERY-20261020。目标：用户在原会话菜单保存兼容供应商/模型后，原 Goal 下一轮从该 Session 当前配置继续，无需全应用重启。

## 范围、权限与交付

- 权威仓库 https://github.com/heavenzhang/MoXBots.git；main；branch `codex/goal-config-restore-20261021`。
- 新隔离 worktree `/Users/zhangshaohua/Documents/Codex/2026-10-21/moxbots-goal-config-restore`。核实旧 reconcile worktree 干净、HEAD b759372e；不在该树写入。本任务不包含5a928679/b759372e两提交。
- fetch origin main 后精确 base `4206eb2ef8f8bf2f9dc211b4f13842441dead0de`；start/task-init gate PASS。该 remote main 早于本机515.7候选，不能将本任务base结果当成515.7集成验收。
- 桌面/macOSarm64/updater是同一部署单元，唯一CI/发布负责人 `01a12bc2-907a-7702-b6dd-788225c5dfe4`。当前开发范围只有源码、隔离测试与本地commit；不push、不共享CI、不正式构建/签名/安装、不操作原Session或生产。515.7冻结候选不修改，新修复进入下一批，由原owner集成实际main。
- 本次单worker本地执行；未派更多Agent、未调用外部模型。实际费用/runtime计量未知，不估造。

## To Do / 完成标准

- [x] 核实remote/HEAD/status、map→plan→task记录与Session/Goal/provider owner规范。
- [x] 普通InjectedTurn保持原语义；仅Goal-owned injected continuation读取本Session当前provider/model/reasoning配置。
- [x] 原queue ticket内解析原Session配置；拒绝错Session、错runtime、不可用/缺省无法解析路由、跨provider历史边界，不创建新Session或native history。
- [x] 新配置替换空闲Query后仍resume同一native identity；原Goal权限、claim/terminal、绝对deadline与已执行工作保留。后台任务存在而需替换Query时拒绝，不停止该任务。
- [x] 配置observation排除stats/lastActive/recovery记账；跨Query teardown、Goal claim及最后materialization await后的同步commit复核；陈旧时先回滚原claim。
- [x] 配置替换只保留本轮原admission ticket，使Stop在teardown前/中/后可通过既有cancel owner撤销；不复活其它输入，不新建epoch或重试。
- [x] 新旧配置、真实route resolver、默认reasoning、无效路由/订阅、runtime、后台任务、paused恢复、Stop、跨await及最终commit行为回归。
- [x] base305项测试、TypeScript、scopedESLint、classification、diffcheck；515.7组合兼容结果见下。
- [ ] 非实现者独立review（交主Agent安排）。
- [ ] 实际main集成/共享CI/下一批制品/原生provider请求验收（唯一publisher后续；本次范围外）。

## 故障与实现

515.7中的Goal prepare分支只恢复MCP/permission，runInjectedTurn不传provider/model；旧Query的currentProviderEnv成为实际值。菜单保存成功不等于暖Goal已应用。本次在原builtin enqueue的准入ticket内读取current Session配置，复用resolveWorkspaceConfig与现有Query重建逻辑，不将Goal配置扩充为第二套执行模板。model/effort编辑同样重建空闲Query，避免SDK setter失败后带旧模型继续。

修复开发中的Stop回归曾失败：新引入的Goal配置切换需要等待旧Query终止，原abort会释放新turn尚未入队的ticket，Stop找不到它。现仅在本次内部配置替换传入精确preserveAdmissionQueueId；真实Stop仍撤销原ticket。此证据不能倒推旧515.6原Goal graceful Stop已失效。

另一修中回归证明仅在异步claim后检查配置不足：最后materialization await后仍可执行旧配置。现组合并保留原validateAtCommit，在原同步commit seam再次检查，原Goal guard仍裁决Stop/claim/background。

## 证据与验证

运行Node24 `/Applications/MoXBots.app/Contents/Resources/nodejs/bin/node`。SDK fake transport +临时HOME/SessionStore，无真实provider/工具执行。测试harness显式隔离platform HOME，避免读取日常供应商配置；无日常状态写入。

私有完整日志：`/Users/zhangshaohua/Documents/WPS Cloud/【项目】目录/MoxBot/work/salary-recovery-20261020/goal-config-restore-20261021/`。

- `moxbots-goal-config-red.log`：原源码2失败/1通过，暖配置及兼容拒绝未实现。
- `moxbots-goal-config-green2.log`：首次修复后Stop跨teardown失败，10项通过；`green3/green4`保留修后通过证据。
- `moxbots-goal-config-commit-red.log`：最后await后陈旧配置错误执行；`green-commit.log`修后通过。
- base最终：`final-integration.log`134/134（新增22项）；`final-unit2.log`171/171，4文件。最末新增原Session检查修正两处旧unit不匹配的sid夹具，保留中间失败输出；不是放宽权限检查。
- `tsc-final2.log`、`eslint-final3.log`无错误；`classification-final.log`427server tests分类通过；`git diff --check`通过。

## 与515.7的兼容验证

原冻结候选精确 `915ff89a8e2640789124038b318aafc131ad80a6`，publisher checkout只读不修改。在自己的detached worktree `/Users/zhangshaohua/Documents/Codex/2026-10-21/moxbots-goal-config-5157-check` 验证。

4206→915ff的agent-session变化涉及watchdog恢复预算、durable Stop、status心跳及真实输出reset；builtin-adapter未变化。本次实际实现hunk及unit/spec hunk git apply --check/apply均通过。原integration测试在同一describe插入点多了13个watchdog回归，完整patch该hunk不能直接apply：在独立验证树保留这13项并插入本任务22项及HOME隔离harness；不能覆盖原测试文件。初次未成功apply时跑出的125项是原515.7 baseline，明确不是本任务组合通过。

515.7组合：`5157-patched-integration.log`147/147、`5157-patched-unit.log`171/171，共5文件318项通过；`5157-patched-tsc.log`TypeScript通过。该树只有本任务兼容验证WIP，无正式制品；保留位置供主审追溯，不操作共享integration。不将本地兼容检查等同最终main/CI。

## 下一步与原生边界

主Agent审阅精确commit；唯一publisher在下一批同步实际main、合并测试插入点及计划记录，固定新候选后再CI。已安装515.7冷启动正常读取Session snapshot的路径与本修复独立；本修复仍需在安全维护窗口验证原Goal暂停→原菜单保存兼容RC→不重启直接Continue→真实请求provider确为RC，且Goal ID/turn统计/已完成工作保留、Stop有效。未取得该native/provider证据前不能说本次实际原任务全部解决。
