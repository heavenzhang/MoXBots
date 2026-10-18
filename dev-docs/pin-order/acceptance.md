# MOXBOTS-PIN-001 — 置顶排序修复

2026-10-18。现象：任务出现置顶图标，仍留在原侧栏位置。根因：`sortWorkspaceSessions`先应用置顶/时间顺序，随后`orderSidebarItems`无条件以保存的拖拽顺序覆盖。工作区与自定义分区都受影响，工作区本身也存在同样的覆盖。

修复：既有排序投影接收`pinnedAt`，先置顶、再按置顶时间倒序、最后保留既有新条目/拖拽/源顺序。工作区、根列表、自定义分区和拖拽容器使用同一规则。只派生显示结果，不改存储结构或既有顺序；取消置顶恢复原保存顺序，无保存顺序时保留原最近活动排序。

## 验收

- [x] 修改前新增DOM回归实际失败：工作区内会话、自定义分区会话、根工作区三例均被旧顺序挡住。
- [x] 修改后3个文件92项定向测试通过：sidebarOrganization、globalSidebarPreference、GlobalSidebar。覆盖新旧多个置顶、比已排序项更新的新条目、无保存顺序、输入/偏好不变、真实菜单意图/权威返回、置顶/取消及重新挂载。
- [x] 全量TypeScript无输出通过；4个修改文件ESLint无错误通过。baseline-browser-mapping仅工具数据时效提示，未为此修改依赖。
- [x] 实际Chromium正式GlobalSidebar交互：1440×900、900×900，工作区/自定义分区共4组，均完成置顶立即上移→刷新保留→取消恢复→刷新保留；无pageerror。原生元数据API/存储用合成替身，非真实后端或原生验收。
- [ ] Web构建、Git/CI与远端main最终状态见任务记录/PR。
- [ ] 正式签名包发布、真实Tauri持久化和用户当前会话验收：待既定唯一桌面发布会话下一未冻结批次。日常App未替换或重启。

本地可追溯输出：`/Users/zhangshaohua/Documents/WPS Cloud/【项目】目录/MoxBot/output/pin-order-001/`（run.mjs、journeys.mjs、mock.ts、fixture.tsx、results.json和四张pinned截图）。命令：`MYAGENTS_BUILD_PROFILE=moxbot <node24> <output>/run.mjs`。只允许127.0.0.1网络、独立浏览器临时profile；不使用用户Chrome或真实业务数据。

## 发布请求与限制

唯一既定桌面发布owner：`01a12bc2-907a-7702-b6dd-788225c5dfe4`。纳入下一未冻结桌面候选；不回写0.5.9/已冻结包，不操作服务端/Host。无配置迁移；回滚为程序回滚，保留已有Session与sidebar偏好。原生验收：使用受控会话先建立手工顺序，再置顶末尾会话，确认位于同容器顶部；取消置顶、重启持久化、保留分区/导航/活动任务。

没有发送其他聊天消息；Git中的请求只代表持久化排队，不代表发布方已接收或已发布。

## 执行记录

当前primary单智能体，零worker；选择依据为共享排序的局部耦合修复，主Agent承担源码审查及UI检查，无独立审阅者。升级原因：无升级；不调用外部原因：明确采用ai-yaoren-local纯内置模式。精确runtime模型/effort、token及费用未暴露。产品修复一次通过定向验收；浏览器支架先修正Vite外部路径allow和冷启动超时后完成。复盘：同类排序变更应同时检查默认排序与已保存排序的组合。
