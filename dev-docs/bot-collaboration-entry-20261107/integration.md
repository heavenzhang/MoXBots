# BC-02 主干集成候选

当前分支 `codex/bot-collaboration-main-ready-20261107` 基于实际main `a650939d2c38b8dc04750e282b159ddaac8ea346`，普通合并 `aef6d722a70ef2d5c8bf745bfcb2777cd5f954ae`（含1471ec01f项目本地交接）与 `8240ddbc4697862c6064d12d56ae62d8be98fa7c`（首两批SimpleUX）。两次计划文档冲突均保留完整双方内容；最新主干的发布、恢复、意图修复及阅读保护仍在。

整合时发现全局成果按钮与协作成果重复。协作会话现在仅从“协作详情→成果”查看文件，复用同一SessionFilesPanel，保留搜索、文件状态、来源定位、旧记录加载、错误重试和末页焦点恢复；普通会话仍用原标题栏文件按钮。Chat共用chatScrollModel.data与原captureAnchor/preserveAnchorAfterPrepend/scrollToMessage路径，避免改变正在阅读的内容。嵌入面板为region，不新增模态弹窗或观察owner。

组合337/337测试（20文件）、类型、定向lint、Web/server构建、8主题检查通过。独立组合复核另跑70/70（6文件，包含滚动控制器/焦点/文件入口/协作组件/投影，有重叠不相加），无未关闭P1/P2。前一源码131与独立87为原源证据，不冒充组合树检查。

实际内置浏览器使用当前组合组件和合成数据检查：成果搜索、来源回调精确定位report消息；Tab从末尾加载控件回到关闭按钮；390×844深色无横向溢出，dialog358px。新截图evidence/combined-results-390-dark.jpg。先前出生、成员导航、资料/任务焦点证据仍有效；真实账号、模型、原生签名制品另验。

沿原唯一desktop/macOS-arm64/updater/sharedCI/main owner `01a12bc2-907a-7702-b6dd-788225c5dfe4`。本分支仅合并候选，不是main交付或发布：由原owner复核当前活动543.5批，选下一未冻结批，统一CI/main/版本/制品/安装与真实两Bot协作验收。开发未触发PR/共享CI/正式构建，不覆盖冻结版本；不涉及cloud/mobile/website。

下一步：原owner将精确候选合入实际main；本会话核实远端main祖先与相应代码后，再按同一签名制品证明关闭重开、成员协作、文件成果与组间隔离。源码分支推送、工具handoff或合成页面不能替代这些门禁。
