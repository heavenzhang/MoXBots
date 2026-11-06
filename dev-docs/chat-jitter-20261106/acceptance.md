# MB-CHAT-JITTER-20261106：聊天持续跳动修复

2026-11-06。已在真实MessageList/Virtuoso中确定复现“跳到未测量内容、范围变空、回退、再次跳转”的循环并完成源码修复。源端验证与安装后的原会话验收分别追踪；日常窗口短时停稳不作为修复依据。

## 根因与失败证据

React先提交更高的正文，原生scrollHeight随之增长，但ResizeObserver尚未把新行高交给Virtuoso。旧useChatFollowMotion按原生底部跟随，越过列表已测量的范围；Virtuoso提交空range，待测消息卸载；原生高度缩小并钳制位置，消息又挂载并撑高页面。跟随再次越界，形成逐帧循环。没有碰到该交付窗口的静止采样会完全稳定，不能据此排除问题。

新增scripts/verify-chat-task-footer.mjs使用真实MessageList、控制器、SessionTaskResults、CSS与任务投影，合成80条历史和已验收6项任务。仅延迟列表自身ResizeObserver的交付8帧，暴露“DOM已变、模型未变”窗口；不执行真实请求或业务工具。

- 未修复motion、已含Footer边界修正时仍确定失败：scrollTop在37896与42801间逐帧交替，tailMounted在true/false间交替；模型extent保持38645，自然内容底部达43549.9375。Footer修正单独不能解决此循环。
- 修复后的同一用例要求测量交付前尾消息始终挂载、不越过模型；交付后真正到底；再覆盖缩短尾消息、失活恢复、静置快照刷新及手动阅读。
- 较早全套基线偶发的real row shrink:6301→6064曾被列为未关联现象。补充诊断在同阶段读到了空range和仍为327.765625px的尾行缓存，符合该机制；不修改或降低旧断言。

## 原窗口实际确认的几何缺陷

原日常0.5.42/542.2、110%缩放下，SessionTaskResults的section.my-4顶部外边距折叠到Footer测量容器之外：

| 本次实际读取 | 修正前 | 临时flow-root对照后 |
| --- | ---: | ---: |
| 自然内容底部 | 69462.992889 | 69462.992798 |
| Virtuoso投影底部 | 69447 | 69462.992188 |
| Footer测量高度 | 307.684662 | 323.678955 |

自然内容未改变，漏算的约15.994px被纳入模型。临时style已恢复空串，诊断面板关闭。新回归未修正Footer时同样失败：自然底部38613、模型38597，少16px。

## 修复

- useChatFollowMotion沿用Virtuoso已有的extent，将目标限制在已提交模型和原生overflow的较小者。未测量正文不再成为提前跳转依据；不新增高度模型、定时重试、跟随意图或直接scrollTop写入。
- 同一个ResizeObserver同时观察scroller与其自身extent，模型投影实际提交后继续结算。仅依赖预提交的totalListHeightChanged/单帧RAF会让Chromium漏掉后续底部变化，已通过实测补齐。
- overflow确实改变时，通过原像素API安全接管，即使同位置也取消旧index事务；稳定窗口不因此新增写入。
- Footer内容根使用与消息行一致的flow-root，外边距包含在测量盒中，不裁切内容或改变业务呈现。

## 验证

- 修复前：Footer漏16px和受控测量延迟下的4905px连续往返分别确定失败；原失败证据保留。
- 新增WebKit回归通过：完成卡展开/折叠、fractional spacer、任务卡出现/移除、受控测量延迟、长尾缩短、失活恢复、6.5秒静置刷新、阅读不被接管及显式回底。
- 新增Chromium回归通过，使用既有隔离headless二进制。首次默认1212缺少浏览器，随后使用现有1234；早期修订曾在展开后留下148px gap，已补齐投影提交观察并重跑通过。
- 定向DOM共68项通过：useChatFollowMotion、useChatScrollController、SessionTaskResults，包含StrictMode、嵌套列表作用域、测量窗口、取消及生命周期撤销。
- TypeScript、定向ESLint和diff --check在最终修订及同步main后均通过。
- 现有完整verify-chat-scroll WebKit和Chromium均通过，包含smooth/rapid follow、pixel/index接管、阅读/搜索/恢复、长尾回收与Footer几何；未降低旧断言。
- 原生WKWebView 110%反事实对照：旧motion在37798/42577间逐帧往返，交付后160帧尾消息仍缺失；新motion的待测8帧top37797固定且尾行全在，测量后160帧top42576固定且到底。此隔离夹具不替代日常安装版验收。

可复核合成摘要见同目录evidence.json。本机原始证据和机器结果在工作区work/MB-CHAT-JITTER-20261106/。新回归输出临时geometry.json、录像和合成截图；历史正文与原窗口截图不入Git。

## 旧证据边界

此前21组开发WebKit、6组生产WebKit和原生WK隔离对照未覆盖真实任务Footer及测量交付延迟，不能证明此缺陷不存在。原窗口Q4完整窗口20秒（68714/69463/749、零滚动/布局变化）仅说明当时未进入循环。另一既有排错任务新增了纯文本验收消息，改变了原尾部场景；本任务未发送消息或重试失败发送。

## To Do与发布归属

- [x] 核实仓库、分支、main与日常版本，保持隔离分支。
- [x] 原窗口观察与有界对照；临时设置还原。
- [x] 确定复现循环，新增退回旧逻辑会失败的实际组件回归。
- [x] 修复同一滚动owner与Footer测量边界，完成定向回归。
- [x] 最终全滚动双引擎基线、原生110%反事实对照及类型/lint检查。
- [x] 源码修复提交062c2f6fe4091309e6b5ce126b65fc894f05c270已推送并核实远端；本次补齐交接记录。
- [ ] 桌面owner接收分支，统一main/共享CI/候选构建与原会话验收。

沿用desktop/macOS-arm64/updater/sharedCI/main唯一负责人01a12bc2-907a-7702-b6dd-788225c5dfe4。本会话不触发PR/共享CI、正式构建、安装、版本分配或发布，不假定冻结候选包含修复。代码检查、主干集成和日常版本验收分别追踪。

安装后必测：原会话冷打开、110%缩放、原JSON长回复和任务汇总；静置至少30秒，完成手动阅读/回底、展开/折叠、切换再返回。保留草稿与失败发送，不向旧会话发送或重放业务操作。若仍跳动，同步保存画面、模型extent、原生overflow及尾行挂载，不用短时停稳收口。

当前Agent直接实现和主审，零子Agent；独立安装验收由原桌面owner负责。未切模型/费用策略，用量未知。

## Root独立审阅与最终候选

既有桌面owner从实际main66f clean初始化新Root任务后整支FF接收producerC3，保留前序诊断记录。Root完整审阅motion、Footer、既有Virtuoso投影和同owner清理边界；同一真实组件WebKit夹具仅退回旧motion，稳定出现待测尾行卸载断言失败；当前实现通过全部Footer/测量交付/阅读/恢复/静置零写入检查。Root合并后94项DOM（含滚动条/模板保存回归）、完整TypeScript、scopedESLint通过。原数据、业务会话、权限与模型不在此源码修改范围。

最终候选预留0.5.42/build542.6，明确保留滚动条MB-FORM-SCROLLBARS-20261106（producerbacd/source0d/main66f）及已main的Playwright/Codex metadata修复；不默认旧542.5包含抖动修复，也不把其签名/Apple完成当正式发布。既有冻结包和原始证据保持。后续独立功能进入下一批，不继续追加本候选。新精确CI/main、一次正式制品、本地安全更新、101通道和安装版原会话验收仍待完成。
