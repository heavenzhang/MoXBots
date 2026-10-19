# MOXBOT-CHATLOAD-20261019 验收

用户反馈打开聊天长时间停留在“正在加载聊天记录”。本次范围为展示读取与打开历史时的统计归因，不改变执行 owner、历史格式、配置或运行中的客户端。

## 原因与实现

只读原生日志显示一次80条历史响应约3.3MB，代理耗时4882ms/3983ms；不保存真实正文。原Global预览调用完整SessionStore reader，再做Runtime overlay克隆，analytics的limit=1同样读取完整正文。新view=history只返回id/messages：V1 JSONL异步反向读取最近20条，V2复用canonical fold/active projection后只转换20条，旧JSON只读兼容。view=metadata不读正文。没有文件迁移、writer激活或authority变更；正式REST恢复和较早分页保留80条。SSE全量回放未在此修改，V2冷fold和最终恢复仍可能耗时。

## 验证结果

- 6个定向测试文件166项通过，包括文件尾读、SessionStore V1/V2/旧JSON、隐藏会话和展示路由、sessionClient、Tab恢复及Todo。随后针对Todo再次通过；审查发现正式页缩为20会遗漏21–80条之间的TodoWrite，已恢复80。
- tsc --noEmit、改动文件ESLint、Web生产构建通过；dependency-cruiser 0 errors/18既有orphan warnings。构建保留原有chunk大小告警。
- 实际renderer使用本地Playwright独立上下文和合成HTTP/SSE：SSE尚未连接时历史已读；A→B→A草稿保留、scrollTop 10196→10196、A历史读取数2→2且没有新建A流。pageerror为空；浏览器模式DirectoryPanel原生不可用和既有React key告警不属于原生验收。
- 1280×800截图人工复核可读。800×600的文档overflow为false且草稿保留，但既有三栏布局明显挤压聊天区域，不将此作为完整窄屏布局验收。未改布局。
- 1名独立只读审查者，1轮修正后通过；主Agent负责代码集成、页面和关键路径。实际模型、token和费用未知，未调用外部模型。

合成基准为76,247,978字节、1024行V1文件，三轮热文件缓存。原全文件读取解析后取80条中位2442.7ms；尾读20条中位47.7ms，最新20条完全一致。此值只衡量文件读取与解析，排除HTTP、renderer、Sidecar、Provider和V2 fold，不是用户端到端加速承诺。原始数据见 [benchmark.json](benchmark.json)，页面断言见 [ui-evidence.json](ui-evidence.json)。本地截图/日志在WPS项目output/chatload-20261019；均为合成内容。

## 复现

使用仓库要求的Node24和已安装依赖：

```sh
npx vitest run --project unit src/renderer/api/__tests__/sessionClient.test.ts src/server/routes/session-read.unit.test.ts src/shared/sessionWorkProgress.test.ts --project dom src/renderer/context/TabProvider.activity.test.tsx --project integration src/server/session-history-tail.integration.test.ts src/server/session-history-preview.integration.test.ts
npx tsc --noEmit
npm run lint:deps
npm run build:web
node --import tsx dev-docs/chatload/benchmark.mjs
```

页面验证先在另一个终端运行 `node dev-docs/chatload/serve.mjs`，再以SESSION_CACHE_OUTPUT指定已有输出目录运行 `node dev-docs/chatload/ui-acceptance.mjs`；可用SESSION_CACHE_CHROMIUM指定本地Chromium。仅绑定127.0.0.1，不连接真实账号或用户Chrome。

## 交付边界与下一步

代码和模拟页面已验证；提交/CI/main状态以对应PR和远端SHA回执为准。桌面发布需纳入下一未冻结候选，由既定唯一publisher 01a12bc2-907a-7702-b6dd-788225c5dfe4完成签名/安全维护窗口/实际包验收。本任务不换包或重启日常App；只登记队列，没有向其它聊天发消息。真实长会话冷打开、旧记录翻页、恢复/重试、Todo、草稿和活动任务安全待实际包复验。无数据迁移，回滚沿原已签名版本。
