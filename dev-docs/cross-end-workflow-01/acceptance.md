# MB-CROSS-END-WORKFLOW-01 第一批验收

源码基线630ae62ed60c8bf8adf828dcc84cc69b5184e7f4；分支codex/cross-end-workflow-01-20261102。当前Agent实现和整体验收，未派发子Agent，未调用外部模型；本批范围小且状态/页面互相依赖，采用单写入者。未做独立非实现者审阅，交原统一owner复审。

## 行为变化

- 空闲会话归待继续（较老记录不活跃），不按24小时时间、TODO完成或工具返回显示已完成。明确Goal complete仍保留，显示目标已完成。
- Task verifying与单次Agent Task运行后明确idle进入需要我/待验收；保留原Task状态与会话关联。原生查询失效、错误、Goal执行和审批优先级保留。
- 移除看板归档前隐式写Done；只允许已有Done Task归档。恢复沿现有Archived→Done用户动作，不调用run/rerun。移除依赖隐式完成的验收说明输入；增加任务中心核对入口，复用TaskCenter既有显式确认流程。
- 手机目录卡片按状态显示查看进展、查看请求、核对状态、打开原会话或查看已有记录；沿用原onOpen，不触发恢复/发送。Turn complete文案明确不等于任务验收。

## 验证

1. RED：新增近期idle且全部TODO完成的反例，旧实现返回done而非idle，1失败26通过；原日志evidence/red.log。
2. GREEN：27投影单元+9看板DOM+8数据读取DOM=44通过。覆盖待验收无归档/无隐式status写入、TaskCenter导航、Done归档恢复、原会话转换/并发执行重查；既有Goal/旧快照/共享Session隔离断言保留。
3. 手机全部policy测试117通过，包含Bot目录状态/操作映射，不凭preview文字推断完成。
4. 根/手机TypeScript均退出0；两端改动文件ESLint退出0（手机依赖baseline-browser-mapping提示为既有数据提醒，未升级依赖）；测试分类检查通过；diff whitespace通过。
5. 实际React组件＋隔离模拟transport：待验收任务在needs、无归档按钮；近期空闲会话在待继续；任务详情显示核对说明/TaskCenter入口。Done归档→历史→恢复的调用记录只有archive一次和恢复status done一次，没有run/rerun。
6. 实际1440×900和390×844：DOM读回文档宽度等于视口；390详情关闭按钮、原会话/TaskCenter入口可达。截图review-desktop.png、review-narrow.png。浏览器开发服务一次重启导致标签落入连接错误页，恢复同一HTTP地址重新验证；未绕过安全警告。最初夹具缺少转任务API导出，补齐仅本地mock，不改产品传输。

## 边界

浏览器截图只证明实际组件＋合成状态，不是原生包、真实业务或真实跨端验收。手机本次仅小幅入口与状态文案，117policy/type/lint通过，未安装新包或实测物理手机。无Runtime/协议/持久化owner/TaskStore状态机或权限扩大，没有给用户确认冒充Session子任务账本主Agent验收。

主干/共享CI由既有01a12bc2统一；手机打包安装由01a12b99。本批无版本分配/CI触发/安装/部署。后续仍需继续工作完整入口、跨项目Bot、审批和同源成果版本等后续批次，不能宣称五阶段已完成。

原始.log由仓库既有ignore保留在本地；版本化证据为results.json及两张合成截图。没有为日志放宽ignore。
