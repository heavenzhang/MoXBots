# MOXBOTS-MODEL-POLICY-20261022-02 实现与验收

用户确认仓库 https://github.com/heavenzhang/MoXBots.git，并于本聊天明确要求合入主干。任务分支 `codex/model-policy-20261022` 从 main `c8068493cfbfd32836c132ae63d5fbd227300b53` 建立；已正常合入后续 main `5eb2ebc87489b92e250338026e2b971346ed9e15`，无冲突，保留其他任务。

## 优先级与完成内容

- [x] P0：显式候选池添加、暂停、恢复和移出；缺省兼容旧目录，{}为空池，目录刷新/新增不扩大手动名单；失效保存成员不丢失。
- [x] P0：自动选择、自动判断及自动备用遵守成员资格。没有兼容候选会返回可恢复提示，null/分类失败/CAS/异常回退不能继续用已移出模型；手动固定、进行中轮次和指定备用沿用原 authority。
- [x] P1：模型/名称/供应商搜索，多选和按当前可见项批量维护，失效原因和供应商修复/新增入口；暂停或移出判断模型有明确说明并清引用，指定备用保留并可定位故障接管设置。
- [x] P2：三档摘要、全宽列表、完整模型名称与供应商/ID、档内优先标记、双向排序及直接换档；窄窗上下布局。
- [x] P3：下一轮生效范围、分档来源、顶部保存状态、失败保留选择重试、带并发比较的一次撤销；自动判断项显示当前实际模型及供应商，数据发送说明不再误称与对话模型使用同一供应商。
- [x] 原 ConfigProvider writer 锁内针对最新值执行纯变换，保留并发字段和未知扩展字段；不新增身份、凭据、Session、运行或持久化 owner。

## 验证证据

合并最新main后的定向验证：`evidence/integrated-tests.txt`，12文件171项通过；覆盖共享解析/分档/空池、admission回退、路由/判断/备用、动态撤销、锁内并发设置、真实SettingsPage接线、模型维护和ConfirmDialog键盘行为。`static-results.json` 记录 TypeScript、受影响 ESLint、测试分类、依赖检查全部exitCode=0；依赖报告中的既有warning不是本任务新增错误。

独立后端审阅 `evidence/backend-review.md` 发现并闭环未知字段丢失，最终无P0/P1阻断。独立UI在实际生产组件、共享候选投影及合成localStorage上执行10组维护/错误恢复关键交互、四宽1440/1024/768/390检查；发现并闭环选择热区、首焦点/模态语义，以及取消焦点Enter误确认。初次报告保留真实失败，最终3组增量复验全部通过：`independent-final-report.md` / `independent-final-results.json`。报告中的a13083257+未提交补丁已纳入功能提交581d32af2，不再是未提交成果。

主Agent再次独立执行取消Enter零写入、移出/刷新保持、搜索重新加入、失败保留再重试及390无横溢：`browser-check.mjs` / `evidence/primary-browser-results.json`，5组通过、无pageerror。截图 `primary-1440.png`、`primary-390.png`。`serve.mjs` / `fixture.tsx` 可复现本地8931页面；仅合成配置，不读取日常目录/密钥或调用真实模型。夹具继承主题token，默认selection=null的棕色accent不能当成生产绿色主题回归。

## 真实与发布边界

源码实现、确定性测试、隔离浏览器交互/模拟持久化已完成。原生Tauri配置落盘、真实Provider、真实账号和已安装/生产包验收仍由统一制品owner安排；合成UI、mock/loopback或HTTP成功不替代这些结果。本任务未更改日常App/真实配置，不构建/切换正式包，不新开公网。

受影响部署单元：desktop builtin client。唯一CI/main/版本/正式构建/发布会话沿用 `01a12bc2-907a-7702-b6dd-788225c5dfe4`（MoxBots桌面端统一打包负责人）。代码交下一未冻结批次；既有5.18/5.19冻结包及版本/tag/制品身份保持。版本、tag、制品摘要和正式发布状态以该owner的批次记录为准。本分支push不触发共享CI；PR/主干及CI交该owner执行，最终远端main包含性由主Agent回读核实。

## 执行记录

主Agent负责契约、shared/server、原配置writer接线、集成与关键路径复验；`/root/ui_implementation`（gpt-6-luna/medium）独立工作树实现UI；`/root/ui_acceptance`（gpt-6.1-sol/medium）不实现源码，负责独立交互/视觉；`/root/backend_review`（gpt-6-luna/medium）只读审查。选择依据为互斥文件和独立验收收益；明确选择纯内置模式，外部模型调用为0。实测收益为发现并修复上述具体缺陷；精确用量、金额和节省比例未知，不作推算。
