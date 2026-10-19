# Execution Trace 独立定向复核

结论：原两项 P2 已修复，本次定向范围无阻断发现。已实际执行系统 Google Chrome 155.0.8059.84，独立隔离 headless Playwright Context，4/4 测试通过；未操作日常客户端。

## 修复复核

- pending 的 summary 显式为“等待确认后继续”；初始产品周报折叠/展开按钮可访问名称分别为“查看执行步骤：等待确认后继续”和“收起执行步骤：等待确认后继续”。
- 旧 flex 规则已限定到 `.execution-toggle .execution-summary`。两设备实测图标栏20px、摘要栏226px、轨迹338px；摘要无截断，状态未抢占摘要空间。

## 浏览器测量

| 设备 | CSS屏幕 | 消息视口高度 | 轨迹宽度 | 图标宽度 | 摘要宽度 |
| --- | --- | --- | --- | --- | --- |
| iPhone | 393×852 | 640px | 338px | 20px | 226px |
| Pixel 10 | 427×952 | 726px | 338px | 20px | 226px |

两设备均测试 no-preference/reduce 两种动效偏好，每组检查 running/pending 折叠与展开。运行态四步骤为 done/done/running/pending，只有操作步骤具备 `aria-current="step"`，12根 piano bars 为装饰性 `aria-hidden`。普通动效为 `piano-key`；reduced-motion 下为 `none`，当前状态文字与 ARIA 保留。待授权四步骤为 done/done/pending/pending，无运行标记或 piano bars。

测得轨迹及步骤无水平溢出，完整轨迹位于消息视口内，消息视口底部不超出composer顶部。已人工查看两设备 running-expanded 与 pending-expanded 截图。iPhone待授权展开后需正常滚动才能访问下方授权按钮；不以此声称按钮被永久遮挡，也未扩大为全流程重验。

## 非阻断与运行历史

Chrome 自动请求未声明的可选 `/favicon.ico` 时出现404。首次和第二次运行的轨迹断言全部通过，最后的零控制台错误断言因此失败；第二次明确定位URL。最终测试保留原始控制台记录，只豁免该favicon404，其他console/page错误仍失败，最终4/4通过。前两次证据保留在相邻 `execution-trace-independent-20261020/`，无需纳入本次Git提交。

最终机器结果为本目录 result.json、playwright-report.json 和四份 *-metrics.json；源码及测试 SHA256 已记录在 result.json。16张截图保留本地，建议Git仅选本目录以下4张：

- iphone-no-preference-running-expanded.png
- iphone-reduce-pending-expanded.png
- pixel-10-no-preference-running-expanded.png
- pixel-10-reduce-pending-expanded.png

新增测试：`tests/execution-trace.spec.ts`。使用现有配置启动服务后，可运行 `EXECUTION_TRACE_RUN_ID=<新证据标识> ./node_modules/.bin/playwright test tests/execution-trace.spec.ts --workers=1 --output=evidence/<新证据目录>/playwright-results`；测试使用系统Chrome，不安装浏览器。此次localhost服务绑定127.0.0.1:4174，完成后已停止。

## 边界

仅本地合成Web原型独立定向验收；28项保护运行文件检查通过。未重跑完整runtime suite、未执行native app、真实Provider/Host/账号、真机、CI、commit或生产发布。其余源码、文档、提交与CI由主Agent处理。
