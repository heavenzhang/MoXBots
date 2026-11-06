# CHAT08 — 停止后的未确认结果提示

## 问题与边界

安装版543.1的真实隔离QA中，Bash已经写入START标记，普通停止后原操作journal仍reserved且无原生失败证明。原生界面仅显示通用工具失败与“有待确认项”，没有可见的结果不明提示。真实样本和账本保留在原桌面owner私有记录 `work/native-confirmation-chat08-20261106/owner/UNKNOWN-NATIVE-GAP.json`，未重放、清账或改写样本。

既有recovery attention仅覆盖有任务计划、因未知操作暂停的执行；无计划的主动Stop被遗漏。本改动保留原attention，另在同一只读RecoveryActionSnapshot中投影最近已结算产品轮的精确未决调用：已验证journal的toolUseId、原生选中链对应调用、产品transcript原轮须三者吻合。运行中、其他轮、匿名历史、已证明结果及可自动结清的调用不进入提示。既有执行/Stop/权限/持久化owner和全部门禁不变。

界面在过程之外显示“本轮有操作的结果尚未确认”，说明停止或工具报错不能证明没有产生影响。可查看原操作及只读详情；无任务计划时不声称任务因未知暂停、不要求填写业务验收、不自动继续。工具原始错误保留，不把原生报错改写为成功。

## 已验证

- 确定性RED：原代码服务快照缺少当前停止轮提示；真实组件也不显示提示（2项失败、73项原回归通过）。
- GREEN及相关回归：7文件158项unit/DOM通过，覆盖终态种类、其他轮、运行中、旧匿名记录、缺原生身份、已知成功/失败、重开与纯查看不写入。
- 15项隔离模拟集成通过：context checkpoint与recovery followup，保留原证据结算/CAS/冷重载行为。
- Node24完整TypeScript检查、定向ESLint、test classification（485 server、140 integration、6 credentialed）、脚本语法与diff检查通过。
- `node scripts/verify-chat-unknown-notice.mjs`：WebKit真实RecoveryActionReview组件、合成快照，1100×760与390×844均验证收起过程后提示/成果可见、定位原工具、打开详情、卸载重挂载；写入请求0、横向溢出0、页面错误0。根会话已查看两张截图。该受控页面不是安装版业务验收；数值见evidence.json。

## 交付与下一步

基线main `bfbc92f3800a3ee4da5785b0f25fc61e2b7a32c2`，分支 `codex/chat-unknown-visibility-20261107`。本分支不重复包含阅读保护1921；两份源由唯一桌面/macOS-arm64/updater/sharedCI/main owner `01a12bc2-907a-7702-b6dd-788225c5dfe4` 审阅及统一交付，新源进入下一未冻结批，保留543.3原候选。

仍须：原owner同一真实QA样本安装版复验；Codex待审批路径补验；阅读保护1921安装版长会话核对；精确主干与CI/签名制品/实际安装/正式发布收据。未将源码或合成页面通过冒充真实验收通过。没有云、网站、mobile发布、权限扩大或账本迁移。
