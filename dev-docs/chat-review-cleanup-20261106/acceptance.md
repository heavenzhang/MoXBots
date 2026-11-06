# MB-CHAT-REVIEW-CLEANUP-20261106

用户反馈聊天底部“可验收/验收请求已提交/重新请求验收/提出返工意见”增加复杂度。现移除整组操作及流程解释，清理Chat预设消息发送和填入草稿路径；异常成果的同类模板反馈入口也移除，保留查看原因/成果。

## 行为与边界

- 无子任务且主任务只是awaiting_review时，整个结果footer不渲染，不留下空分隔区。
- 子任务状态及详情仍显示；真正验收通过的主任务历史默认折叠。
- 无自动发消息/重跑/接受任务；原账本、工具权限、队列与输入框路径不变；截图中的旧消息不删除。
- 没有新增自动验收逻辑；本次目标是清理用户界面和无用模板动作。

## 验证

- Node24，`vitest run --project dom src/renderer/components/agent-status/SessionTaskResults.test.tsx src/renderer/components/agent-status/useSessionTaskOrchestration.test.tsx src/renderer/components/agent-status/ExecutionStatusBar.test.tsx`：48通过，原文dom-results.txt。
- 首轮47/48：ready辅助等待第一条主任务为awaiting_review，在混合主/子任务场景实际第一条为pending；改为等待结果region后48/48，未改变产品逻辑。
- `tsc --noEmit`、修改源码与preview eslint、`node scripts/check-test-classification.mjs`、`git diff --check`通过。eslint只提示现有baseline-browser-mapping数据更新时间，不产生lint错误。
- IAB实际SessionTaskResults + 生产Provider，合成ledger：1280浅色四项待核验无footer；完成历史默认折叠并展开4条；390深色异常原因可见，查看原因委托回调返回tool。
- 截图main-light-1280.jpg、child-dark-390.jpg。夹具使用已存在的Vite配置启动：`vite --config dev-docs/session-orchestration/vite.config.ts --port 4350 --strictPort`，访问`/dev-docs/chat-review-cleanup-20261106/preview.html`。

- 本地 `vite build` 成功（35.48秒），保留已有chunk体积提示，不作为正式原生制品。

## 交付

代码待原desktop/sharedCI/main负责人01a12bc2-907a-7702-b6dd-788225c5dfe4独立审阅及集成发布。无版本分配、制品、安装或生产真实会话验收结论。负责人接入后在原生长会话复核footer消失、成果详情可用、普通输入反馈正常及状态不虚报完成。
