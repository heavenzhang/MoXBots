# BC-02 持久协作对话入口验收

## 交付行为

- 新项目对话选择负责 Bot 后，按需展开“邀请 Bot 协作”，选择总计 2–8 位成员并填写协作任务。切换到已选成员担任负责人时交换原负责人，保持协作；不确定回执保留原意图，不重派。
- 原 Session 出生 owner 分配真实 Session ID 后固定 `projectSpace.collaboration.leadSessionId`；关闭重开、冷读及 fork 均保留原组。只有原根 Session 才是负责对话。
- 同项目不同协作及普通项目会话的动态历史双向隔离；本地交接必须同时满足冻结成员与当前项目准入。
- 侧栏按原根收纳成员对话，汇总未读、活动与最新时间；置顶成员和原根缺失时的成员保持独立可达。聚合只影响展示，不回写 Session。
- 聊天默认只显示负责 Bot 与协作详情按钮。展开后显示成员、当前会话任务和已加载对话的文件记录；可跨工作区打开成员原会话。详情默认关闭，切换标签卸载；任务/成果明确当前会话范围。
- 文件使用 f815453 已审查的纯 conversationFiles 投影：只取助手链接与成功文件编辑，经原 FileAction 重验；用户附件、日志、代码块、失败写入不冒充成果。文件记录不代表内容验收。

## 验证证据

主 Agent 131/131 定向测试通过（13 文件），覆盖 real isolated SessionStore / Inbox、birth 准备及幂等、冷读与 fork、组间隔离、模型提醒 roster、client 冻结、文件投影、侧栏及真实组件 DOM。独立审阅者另跑 87/87（9 文件，存在重叠，不相加）。原 4 项 P2 均修复：负责人交换、嵌套弹窗、成员活动时间、隐藏控件焦点。

类型检查、定向 lint、server build、测试分类、依赖检查及文档校验通过；依赖检查有原有 20 条 warning、0 error。Web build 及其 8 项主题检查通过。未修改版本号。

实际内置浏览器验证生产组件 + 合成数据：创建协作提交的 selection 包含负责人与精确成员；成员导航回调携带原 Session 和 `/fixture/writer`；任务页只显示当前记录，成果通过原 FileAction 回调。默认窗口浅色、390×844深色下无横向溢出（documentWidth=390，dialogWidth=358）。方向键切换 tabs、Escape 关闭、焦点恢复、含嵌套资料和完成任务 attempt 的 Tab/Shift+Tab 回绕均通过。

截图 `evidence/`：create-light、members-light、members-390-dark、results-390-dark、keyboard-tasks-light。`serve.mjs` 仅监听127.0.0.1且关闭代理；state.ts 为明确合成数据，不调用模型、账号或原生 Sidecar。截图及HTTP页面不代表安装版验收。

## 交付与发布边界

本批基于已推送1471ec01f（项目内本地Bot交接），复用f815453的conversationFiles两个文件；SimpleUX前两批综合分支8240ddbc仍须一并由主干owner纳入，不以本批替代。最近核实main a650939d，三个交付项尚未被证实合入。

唯一 desktop/macOS-arm64/updater/sharedCI/main owner：01a12bc2-907a-7702-b6dd-788225c5dfe4。当前开发会话仅提交源分支和本地证据；实际主干、统一CI、版本、签名制品、安装版与真实模型双Bot协作另验。未覆盖543.5冻结候选，也未运行共享CI或正式构建。

真实验收路径：从项目入口选负责Bot及成员并创建任务→模型按需本地交接→成员返回结果→关闭所有相关tab并重新从侧栏进入→检查仍为同一根、同一成员和实际成果→新建另一协作确认历史隔离。由原owner在下一未冻结批的同一签名制品验证。
