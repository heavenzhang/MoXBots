# MOXBOT-COMPOSER-20261027 — 发送即释放草稿

状态：源码与本地验收通过；主干、共享CI、签名包/本地替换与真实Provider验收等待原desktop owner集成。

## 原因与行为

TabProvider立即投影发送气泡，SimpleChatInput却await onSend后才清空，HTTP回执延迟使同一句已上屏时仍占输入框。本机2026-10-27日志只读统计见WPS工作目录，三次/chat/send回执耗时5110、5175、5099ms；不是模型首字或整轮耗时测量，也不据此断言每次发送均相同原因。没有重放截图中的原业务。

提交时立即清空正文、引用上下文和附件；继续等待原发送结果并保持防重复门禁。拒绝/异常时只向原会话、未编辑且没有新附件/导入的草稿恢复完整快照；成功不再修改新草稿。用户新稿（包括主动删空）、新附件和已切换的会话不被迟到结果覆盖。若用户已另写新稿，原发送失败继续由TabProvider既有失败气泡/重新发送入口承载。清空输入不表示后端已接纳、执行或持久化。

## 已完成

- [x] 原实现三项确定性重现测试失败：回执挂起时正文/附件仍在编辑区。
- [x] 75项SimpleChatInput发送测试；与IME、建议、checkpoint、autoModel、TabProvider.activity合计236项定向DOM回归通过。
- [x] 全量TypeScript、修改源码/测试及本QA脚本ESLint、test classification、git diff --check通过。依赖有baseline-browser-mapping提示，未为本修复升级共享依赖。
- [x] 实际SimpleChatInput隔离渲染：Chromium1243/WebKit2259，1440/760/390共6组，挂起回执、连续Enter、下一稿、失败恢复、IME、主动删空、附件恢复、无横向溢出通过。主Agent查看桌面/窄窗截图。
- [ ] 原owner独立审阅、精确候选共享CI、正常main集成与远端包含核验。
- [ ] 新签名客户端/生产更新与真实用户路径验收。

## 复现

```sh
/opt/homebrew/opt/node@24/bin/node node_modules/vitest/vitest.mjs run --project dom src/renderer/components/SimpleChatInput.send.test.tsx src/renderer/components/SimpleChatInput.ime.test.tsx src/renderer/components/SimpleChatInput.suggestion.test.tsx src/renderer/components/SimpleChatInput.checkpoint.test.tsx src/renderer/components/SimpleChatInput.autoModel.test.tsx src/renderer/context/TabProvider.activity.test.tsx
MOXBOTS_QA_CHROMIUM=/path/to/chrome-headless-shell MOXBOTS_QA_WEBKIT=/path/to/pw_run.sh node dev-docs/composer-submit-20261027/browser-check.mjs
```

浏览器脚本复用已有Playwright引擎；没有使用用户Chrome/已有登录、连接真实后端、启动生产mock或注入实际模型。未运行正式构建。`evidence/browser-results.json`中7–15ms是本地测试驱动观测到清空的耗时，不能外推用户机器性能；回执由测试显式结算，没有为通过而缩短后端等待。

## 交付与执行

- base main `caab6ab648b434bee17930f90c4df4de87564bba`；分支`codex/composer-submit-20261027`；权威仓库`https://github.com/heavenzhang/MoXBots.git`。既有绑定URL已从原用户明确回复核实，未更换目的地。
- desktop/macOS/updater及combinedCI/main原唯一owner `01a12bc2-907a-7702-b6dd-788225c5dfe4`；按用户“其他会话向对应单元负责会话提交CI或发布请求”的现行规则交精确SHA，不触发第二套CI/发布。
- 发布请求：将本修复纳入下一未冻结候选，先合主干并核实远端，按有效维护窗口/备份回滚纪律发布及复验。无接口/配置/数据迁移，不影响cloud/Host/mobile单元；保持0.5.24及其tag/制品不可变。
- 当前Agent实现并验收，0子Agent；选择依据：局部发送状态耦合，拆分会重复上下文；无模型升级/回退，不调用外部原因：单Agent足以完成此有界修复。模型切换和费用未测量。主审不是独立审阅，原owner后续审阅另计。
- 经验：将“编辑草稿已释放”和“发送已接纳”分别验证，异步结果使用编辑代次及会话scope限定。初次git start/task-init在编辑后执行因dirty拒绝；自有修改完整保留，提交后再跑clean gate，未绕过/伪报。浏览器初次缺预期revision，使用已有引擎；一次附件selector误用alt已改为实际可访问名称后复验通过。
