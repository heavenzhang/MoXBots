<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/chatload-20261019 -->
<!-- git-project-sync-task:base=18e13ce8dbad20e61af3f84173ad87d84bf090a6 -->
<!-- git-project-sync-task:status=in-progress -->

# MOXBOT-CHATLOAD-20261019

目标：减少打开长会话时“正在加载聊天记录”的等待。范围：既有SessionStore显示读端、首屏分页与统计读取；不改历史文件、执行owner、用户配置或运行中客户端。

- [x] 核实权威仓库/remote/main/隔离工作树和现有缓存修复PR147已合入。
- [x] 定位：原生日志80条返回3.3MB，单次代理4882ms；SSE还会回放全历史。日志仅记录元数据，正文不进入证据。
- [x] 实现：V1异步反向尾读20条纯显示；V2沿canonical fold；预览20/权威恢复80/较早80；analytics仅metadata。
- [x] 定向单元、真实临时文件/大行/损坏行集成测试、类型/lint、构建。
- [x] 实际renderer合成传输：先读后连、A/B/A草稿/滚动、1280和800宽度；独立代码审查。
- [ ] 提交、CI、合入最新main、推送并验证远端包含。
- [ ] 下一未冻结原生发行与真实长会话复验：既定唯一桌面owner01a12bc2-907a-7702-b6dd-788225c5dfe4；本任务不安装/重启日常客户端。

完成标准：上述代码、临时文件/页面验证与main交付有证据；原生发布和真实账号路径单列，不以合成页面代替。依赖：Node24、现有renderer测试/Chromium。当前下一步：完成精确提交 CI、合入远端 main，登记桌面发布队列。

执行：主Agent实现/整体/UI验收；history_review只读审查（请求gpt-6.1-sol/medium，跨文件异步读取与隔离风险，实际模型和费用未知）。0外部模型调用；未读/复制真实聊天正文。首次task-init因本任务自己的未提交diff拒绝，未清理改动，手工按既有格式建立此记录。

发布请求：需要下一未冻结桌面版本，沿既定唯一发布owner；无迁移/配置变化，回滚为原版本；需签名实际包的冷打开、旧记录翻页、恢复/重试、草稿与运行会话安全验收。只登记发布队列，未获本次发消息授权，不通知其他聊天。

验证：166项定向测试、To Do 专项复测、tsc、改动文件ESLint、Web生产构建通过；依赖检查0error/18既有orphan警告。真实renderer合成传输先读后连、A/B/A草稿/滚动/无重复历史读取通过。1280截图已复核；800仅验证文档无横向溢出，原三栏布局挤压仍存在，不宣称完整窄屏验收。独立审查指出正式页20条会损失旧Todo，已恢复80并补回归，复核无新增阻断。合成V1 76.25MB/1024行，3轮热文件缓存中位数2443ms→48ms，仅文件读与解析，非客户端端到端指标。详见 `dev-docs/chatload/acceptance.md`。
