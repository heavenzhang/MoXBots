# MB-COMPOSER-TYPE-20261027

已完成源码及本地实际组件验收，尚未合入main/正式发布。桌面共享CI/main和发布依项目约定交由既有唯一会话01a12bc2-907a-7702-b6dd-788225c5dfe4；本分支不自行触发共享CI、创建触发CI的PR或安装日常App。

输入正文、占位符及灰色建议从16px改为既有text-sm（14px）；工具栏维持14px、辅助提示维持12px。显式使用原LINE_HEIGHT=26，维持自适应测量、两行最小高度和九行最大高度。共享纯文本会话同样采用14px，聊天消息阅读字号配置保持原行为。设计文档和字号注释已同步，无新增字阶、状态或依赖。

## 验收

- [x] 从最新远端main caab6ab648b434bee17930f90c4df4de87564bba建立干净隔离分支codex/composer-type-20261027。
- [x] 4文件84项既有DOM测试：SimpleChatInput.suggestion/ime/send与TextChatComposer全部通过；覆盖建议接受/取消、IME、发送等原有行为。
- [x] 全量tsc --noEmit、两处产品TSX定向ESLint、git diff --check通过。
- [x] MoXBots实际生产SimpleChatInput、ComposerSurface及TextChatComposer，原ThemeRuntime与i18n，在隔离loopback服务以合成内容运行。Config仅替换为内存fixture，发送回调仅递增本地计数；无账号/Provider/业务/本地用户目录写入。
- [x] Chromium与WebKit各4种布局：1440×900明/暗、900×900暗、390×900明，共8组。验证实际计算字号14px、行高26px、placeholder14px、hint12px；建议接受前后相同行数/宽度、Enter只接受不误发、Escape取消、长文本九行上限/内部滚动/横向不溢出、普通及纯文本发送/清空、页面无横向溢出、运行时异常0。
- [x] 主Agent实际查看WebKit宽屏暗色和Chromium窄屏浅色截图，文字层级、换行、工具栏可用；本次为作者自验，不是独立审阅。
- [ ] 原负责人统一CI/main与远端主干包含核实。
- [ ] 版本/签名制品/安装/发布与真实客户端路径验收。

源码hash：evidence/source-sha256.json；8组数据和截图：evidence/browser-results.json及同目录PNG；重现脚本：browser-check.mjs和fixture.tsx。Node24.21.0，复用已有依赖，初次浏览器revision缺失和fixture配置路径不匹配已纠正，未下载浏览器或调用用户Chrome；最终使用既有Playwright Chromium1243/WebKit2259。原始日志在WPS工作区work/MB-COMPOSER-TYPE-20261027/logs。

复现：用MOXBOTS_QA_CHROMIUM指向既有Chromium1243可执行文件、MOXBOTS_QA_WEBKIT指向WebKit2259/pw_run.sh，再以Node24运行本目录browser-check.mjs。没有另跑正式构建；本次CSS计算与渲染经两引擎实际编译验证，正式构建按已有发布owner执行。

## 发布交接

部署单元desktop/macOS-arm64/updater；源码开发与UI自验由当前会话01a178f6-1442-7162-8a95-bf328da068cd负责；combined CI/main/版本分配/正式构建/发布/回滚继续由01a12bc2-907a-7702-b6dd-788225c5dfe4负责。依赖仅现有renderer/Theme，无迁移或跨单元切换，普通制品回退即可。版本号、批次、制品摘要等待owner分配，不改任何冻结版本。本分支在现有发布队列登记请求，不发送未授权跨聊天消息；登记不代表owner接收或已发布。

## 执行记录

选择依据：小范围同一输入区样式，当前Agent直接实现与验收，0子Agent。
升级原因：无；未切换模型，精确模型和推理档位缺乏运行时可验证元数据，标为未知。
回退原因：不涉及模型回退；本地浏览器使用已有可执行文件修复环境路径。
不调用外部原因：明确采用ai-yaoren-local纯内置模式，此改动无需外部模型。
用量/费用：未知，未估算节省。产品代码无验收返工，夹具配置路径修正一次；后续同类验收应复用已有浏览器路径并先核对Vite解析后的模块ID。
