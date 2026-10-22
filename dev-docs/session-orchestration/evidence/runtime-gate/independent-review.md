# MB-ORCH-20261022-01 独立 UI 复审（短窗口修复前阶段）

当前最终证据以 fit-review.md 为准；本报告和三张原始图保留修复前阶段，不代表最终像素。

结论：本轮未发现阻断 UI 交付的实质问题。未修改产品或夹具源码，未运行构建、CI、Provider、native App 或真实业务 API。

- 独立 Chromium for Testing，127.0.0.1:4353，1280 / 390 / 320 × 明暗主题。
- `node independent-ui.mjs`：210/210 PASS（原 132 + 新能力不支持场景 78）；零 pageerror、业务请求、外网请求。六项原审批自动尾部定位及中心 hit-test 均通过。
- `node clean-unsupported.mjs`：6/6 方案说明中心无遮挡；补充 12 张清洁折叠/展开截图。原旅程截图中的队列编辑 toast 来自先前操作，清洁截图不含该层。
- unsupported-plan：保留 objective、工作范围、步骤、验收标准；明确不支持说明；确认、调整、讨论禁用。原 Composer 可编辑、草稿与附件保留，工具与排队编辑可达；前后模式切换不丢输入。无横向溢出。
- 原旅程：请求只进入 review 且仍 1/4；模拟验收后 4/4；返工只追加草稿并保留附件；原工具审批可操作且不变成成果验收。

静态复审：
- useSessionTaskOrchestration.ts:38-51：Runtime key 只使能力失效，scope epoch 覆盖会话及同会话 Runtime 变化；unknown/loading/stale 都关闭能力。
- 同文件:59-70,77-92：仅 REST 采用 planSupport，SSE 不授予且不清除 stale；能力变化不依赖 ledger revision 增长，账本仍保留最高 revision；旧 effect disposed。
- 同文件:94-108：POST 前检查当前能力，完成后核对 Session + epoch；只采用真实 snapshot，不将 ack 制造成 confirmed。
- OrchestrationPlanCard.tsx:39-49,78-89,256-305：能力变化不重建相同 proposal 的编辑状态；未发送意见保留并禁用；三个操作及提交均关闭。测试源码亦覆盖能力变化后恢复反馈。

证据边界：真实生产 Provider/ProcessRow association/Results/Composer 的浏览器合成夹具。Agent、发送、恢复账本及 Inspector 外壳为模拟，不证明完整 Chat、原生 Runtime gate、Provider 或生产真实路径。A/B/A、Runtime 在途切换等本轮为源码及已有定向测试审阅，未冒充浏览器 native 联调。主线程的 typecheck/lint/broad 结果不计为本审阅者独立执行。用量未知。

可复现：先构建 `incremental-preview/` 并将 dist 以127.0.0.1:4353静态服务；在本目录执行两份mjs脚本，必要时用 ORCH_CHROMIUM_PATH 指定本机已安装的官方测试Chromium。执行会重新生成全部截图。Git只保留3张代表性清洁截图、JSON及脚本，48张原始图完整保留于开发机本地output（runtime-gate-full-evidence）；SHA与选择见screenshot-index.json。没有把原始图文件缺省视为断言缺失。
