# MB-ORCH-20261022-01 适配修复独立复验

本轮未发现剩余阻断。仅只读审阅产品源码，未修改产品/夹具，未运行构建、CI、Provider、native App 或真实业务 API。

| 高度 | 原旅程与能力边界/中心检查 | 详情逐项滚动/中心检查 |
| --- | --- | --- |
| 1000 | 270/270 PASS | 84/84 PASS |
| 768 | 270/270 PASS | 84/84 PASS |

两高度各覆盖1280/390/320 × 明暗；每组均含原132旅程。原审批六组自动定位/中心命中通过；先正常关闭夹具队列编辑提示，无force。方案提示、三个方案操作、queue编辑/立即发送/取消、输入/附件/tools均可滚动并命中中心。范围/步骤/验收标准逐项滚动可达。零pageerror/业务/外网请求。

此前24项失败所涉中心已恢复。768窄屏卡片使用内部滚动：部分内容不能同时露出，明确滚回后的命中通过，不将DOM存在或被裁剪当可见。滚动前瞬时裁剪记录及旧失败全保留/tmp，未覆盖旧证据。

只读源评审：OrchestrationPlanCard以原container及data-chat-input-overlay测量可用高度，减去原queue/附件/toolbar/input后只限制新增卡片；原滚动owner未变。SimpleChatInput data标记/左组shrink0与ComposerToolbar flex-wrap修正320上下文槽覆盖tools。offsetParent fallback供无activity场景。随后仅定向补充supported-plan真实PlanCard夹具：1000/768 × 1280/390/320 × 明暗，336/336 PASS。目标、范围、步骤、验收标准、反馈框、提交调整意见按钮与外部queue三项/原输入/附件/tools均正常scroll后中心可达；原聊天草稿和附件保留。输入意见后确认禁用，提交意见按钮可达但未点击。切回unsupported后意见仍保留，意见框及全部方案操作禁用，仍待确认；未将ack当作成功。零pageerror/业务/外网请求。supported API和执行为本地模拟，无native证明。

证据：fit-1000-ui.json、fit-768-ui.json、两份detail-scroll JSON、2张768代表截图。完整72+截图及原始脚本在/tmp/moxbots-orchestration-ui-fit-fix-20261022/{1000,768}。复现：在本目录运行 ORCH_CHROMIUM_PATH=<Chromium可执行路径> ORCH_VIEWPORT_HEIGHT=768 node fit-journey.mjs；详情为fit-detail-scroll.mjs；高度改1000重跑。需repo node_modules/playwright，静态夹具4353。

边界：生产组件合成夹具，Agent/Chat发送/账本恢复/Inspector shell模拟，不证明完整Chat、真实Runtime动态gate、Provider或生产路径。用量未知。

最终supported补充证据：fit-supported.json（336PASS）、fit-supported.mjs（createRequire/ORCH_CHROMIUM_PATH）、fit-supported-768-320-light-feedback.png；全部12图在/tmp/moxbots-orchestration-supported-fit-20261022。浏览器均已关闭，不再扩大场景。总计1044断言（540旅程+168详情滚动+336supported）通过；两轮原失败仍另存。
