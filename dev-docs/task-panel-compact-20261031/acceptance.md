# MB-TASK-PANEL-COMPACT-20261031

目标：解决截图中上下重复任务清单、底部卡片过大、与会话贴近的问题。基线 `e11ee39b5629d6e74810b75e2155a45400d45005`；分支 `codex/task-panel-compact-20261031`。

## 实现

- 运行中的主任务只在 Composer 的默认折叠任务入口展示清单。聊天尾部不再自动展开同一清单；全部已验收后保留默认折叠的历史记录。
- 底部任务改为细分隔线的紧凑行，移除重复的主 Agent 说明；仅子任务保留回传/验收提示。具体依赖、尝试、验收证据及失败状态仍可查。
- 状态区使用主题底色和边框，与输入框相隔8px。Composer 外层增加16px顶部空间，由既有 ResizeObserver 计入对话避让高度。
- 任务详情高度上限 `min(200px, 28vh)`，长标题换行、状态不收缩。其他执行/Goal/Agent详情保留原280px/38vh上限。默认折叠、Escape关闭并返回触发按钮的行为保留。
- 无后端、数据、权限、任务账本或实际执行行为变化。

## 验证

- [x] Node24：SessionTaskResults 14、ExecutionStatusBar 21、TextChatComposer 1，共36项DOM测试通过。
- [x] 全量 `tsc --noEmit` 通过；5个修改的TS/TSX文件定向ESLint通过（既有Baseline数据陈旧提示）。
- [x] 实际产品组件Vite夹具构建通过，diff检查通过。
- [x] CUA内置浏览器：默认收起、单一清单、展开/收起、Escape焦点恢复、完成历史展开、明亮/深色、390px容器长标题换行及End滚动到末项。
- [x] 宽窗口实测：摘要34px，5行详情178px，总高212px；734px内容宽与scrollWidth相等。窄容器内容宽356px、scrollWidth356px，详情上限200px，末项可滚动访问。
- [ ] 远端main/共享CI：交既有owner下一未冻结批次。
- [ ] 签名制品、安装和真实原会话验收：尚未执行。

新增回归同时挂载生产结果区与状态栏，证明当前任务只出现一次、默认收起且不再逐行重复owner；另验证已验收历史默认折叠。早期夹具误把原地修改函数当返回值、单步骤被业务规则省略，以及遗漏验收记录；均修正夹具，未放宽产品完成语义。

浏览器使用 `preview.tsx` 的真实 SessionTaskResults/ExecutionStatusBar/SessionTaskPanel 和合成账本；外围聊天正文/输入框为布局夹具，不是原生客户端或完整Chat联调。Composer避让高度依据实际生产ResizeObserver链路审阅，原生滚动验收仍待发行。没有真实Provider、业务写入、独立审阅或正式打包。

复现：在仓库根执行 `node node_modules/vite/bin/vite.js build --config dev-docs/task-panel-compact-20261031/vite.config.ts`，用仅绑定127.0.0.1的静态服务打开产物中的preview.html。预览产物不提交Git。

本地证据：工作区 `work/MB-TASK-PANEL-COMPACT-20261031/evidence/` 的expanded-light.png、expanded-dark.png、narrow-dark.png；同任务logs目录保存测试/type/lint/build日志。

## 发布交接

单元：desktop/macOS-arm64/updater；shared CI/main 与发行唯一owner `01a12bc2-907a-7702-b6dd-788225c5dfe4`。依据当前main共享计划，0.5.28/528.1已冻结，本任务进入后续未冻结批次，由owner分配版本和候选。不新建触发共享CI的PR、不替换日常App。

开发提交、远端分支与release-queue回执独立于owner接收、main、制品和真实验收。源码需要owner按当前main正常合并并复验；无接口/迁移依赖，回滚沿上一已核验桌面制品。正式版本、tag、制品摘要未分配；不以本地预览哈希代替正式制品。

执行：当前Agent独立实现和自验，零子Agent；用量、费用、成本收益未测量。
