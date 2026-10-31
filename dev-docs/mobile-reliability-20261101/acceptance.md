# MOXBOT-MOBILE-20261101 手机消息与最近会话修复

当前：代码与本地回归通过，已具备源交接条件。共享 CI/main、正式手机制品及真实手机验收分别由既有负责人推进，本文不将浏览器夹具等同于真机。

## 改动与根因

1. 原发送仅 accepted 才清草稿，processing/未知时原文仍作为可编辑输入出现。现在提交编辑与输入框投影分离：待确认原文保留在本机原草稿/journal，未出现在 transcript 时显示待确认内容；同一操作只查回执。accepted 才结算，rejected 恢复编辑。发送前等待原本机草稿写入；迟到回执按同一编辑版本清理，保护后续编辑、其他Session与账号生命周期。
2. 原列表只读取当前Bot的30条会话。新增默认“最近会话”和“当前 Bot”切换，现有已授权目标以最多2个并发读各自最近30条，保持Bot/设备/Session来源，按更新时间排序、跨来源搜索。逐来源更新缓存，单个失败不清掉其他来源；缓存失败来源标暂不可用。这里不是全历史无限分页，离线设备历史不额外复制到新存储。
3. 原回执没有自动查询，初次snapshot失败时也没有可轮询snapshot。现在按原operationId/protocol自动只读查回执，退避1.5/3/6/12/15/15/15/15秒，自动最多8次；切回前台重置查询预算，人工仍可查询。初次失败也按原requestedSessionId恢复读取，保持精确owner门禁。
4. 目录暂时失败不清掉原会话和草稿，将旧目标标为暂不可用，并在前台每10秒经原account/targets链尝试恢复；实际账号变化或明确移除仍沿原权限清理。恢复后清除本次连接错误提示。
5. 原生accepted处理先经现有draft authority按原账户/设备/Agent/Session和提交文本匹配、CAS及读回确认清旧文，再结束pending journal，避免native已结算而JS崩溃/导航丢失旧草稿清理。失败则保留journal；无自动重发。pending投影仅对消息附submittedText，旧journal格式/账号/密钥/通道/执行owner不变。

## 本地验证

- Node24 `npm --prefix mobile/app run test:policy`：97 passed / 0 failed / 0 skipped。新增测试覆盖精确编辑、迟到accepted、重启后列表后台结算、已有草稿写入等待、native已清的CAS采纳、读取并发/缓存/旧账户隔离。
- `npm --prefix mobile/app run typecheck`、`npm --prefix mobile/app run lint`：通过。
- `CARGO_TARGET_DIR=/tmp/moxbots-mobile-connect-target-20261101 cargo test --manifest-path mobile/connection/Cargo.toml --lib`：133 passed / 0 failed / 1既有ignored。包含accepted前清草稿、四种消息、拒绝/未知不清、新文/异作用域不清、清理写丢弃保留journal、回执幂等、pending只读投影与损坏记录拒绝。
- `rustfmt --edition 2021 --check --config skip_children=true`对本次3个Rust文件：通过；`git diff --check`：通过。
- 整个 `cargo fmt --manifest-path mobile/connection/Cargo.toml --check` 仍报告主干已有 `src-tauri/src/agent_network/identity.rs` 的格式差异；该文件与基线e11完全一致，未为本任务改动。这不是本次格式全量通过声明，已交共享CI负责人核对。

原始无秘密测试日志位于交付工作区 `work/MOXBOT-MOBILE-20261101/`，不把构建缓存或node_modules提交到Git。

## 实际页面验收

环境：当前工作树的Expo开发服务 http://localhost:8197/ ，EXPO_PUBLIC_MOBILE_QA=1；内置IAB、合成账号/设备/消息，390×844与320×690。所有业务数据是夹具；未调用付费模型或真实Host业务。正式安装不启用该夹具。

| 场景 | 观察结果 | 证据 |
| --- | --- | --- |
| 已有会话send→processing→accepted | 输入框原文移出，消息只显示一条；自动accepted后恢复空输入 | evidence/accepted-390.jpg |
| 新会话start→processing→accepted | 已绑定真实返回Session；再开新会话时原null草稿槽为空 | evidence/new-session-processing-320.jpg、evidence/new-session-draft-cleared-320.jpg |
| processing→rejected | 确认前原文在待确认卡，确认拒绝后原文恢复可编辑 | evidence/processing-390.jpg、evidence/rejected-390.jpg |
| 首发响应丢失、回执读取连续两次失败后恢复 | 只查询同一操作，无新发送；重开原会话草稿为空 | evidence/disconnect-recovered-390.jpg |
| 首发响应延迟3.5秒后throw，期间立即返回列表 | 超时后列表仍出现pending，确认后重开旧草稿为空；DOM原文消息计数1 | evidence/navigation-pending-390.jpg、evidence/navigation-recovered-390.jpg |
| 首次snapshot失败 | 未创建替代会话，自动恢复同一会话内容 | evidence/snapshot-first-failure-390.jpg、evidence/snapshot-auto-recovered-390.jpg |
| 跨Bot最近列表、长标题、搜索、信息→继续 | 390/320无横向溢出；第二Bot条目在原Bot打开，搜索仅显示匹配来源 | evidence/recent-390.jpg、evidence/recent-320.jpg、evidence/recent-original-bot-320.jpg、evidence/recent-search-320.jpg |
| 目录瞬断 | 已有列表保留、目标显示离线，之后自动恢复在线；最终版本连接提示修复另按本次source记录 | evidence/directory-offline-320.jpg、evidence/directory-recovered-320.jpg |

视觉、交互、响应式在上述模拟范围通过；前后台系统事件、真实网络与执行链、真实手机号账号/Host权限、后台/杀进程/重启、真机键盘与新native+JS制品仍是手机owner的真实验收门。

## 审阅与修复轮次

主Agent审查最近UI和native改动并承担整体验收。`recent_sessions` 子Agent独立审查其未实现的JS发送/恢复与DraftPersistence，发现3条P1：列表accepted漏清旧文、查询回执中导航丢结算、首发未知错误中导航漏pending。三条均修复并复核关闭，见 core-review.md；本人实现部分不冒称独立验收。另修最近刷新等待旧flight时缺少及时重试及恢复后连接错误提示残留。

仅1名有界子Agent，按互斥文件复用三个阶段；请求gpt-6.1-sol/medium，实际服务端模型/推理用量不可见。主Agent未切模型；未外部AIRouter调用。没有推算费用、节省率或产品稳定性概率。

## 发布及真机验收交接

- shared CI/main：原01a12bc2-907a-7702-b6dd-788225c5dfe4统一候选集成与精确远端main证明，本会话不另建PR/触发共享CI。
- mobile CI/build/sign/install/rollback：原01a12b99-7b38-78b1-831f-9c60257d386a。需新native+JS同一制品；只更新JS不能获得原生清草稿保护。负责人预备0.1.0/build7，原build6保留；正式版本/tag/制品摘要由其冻结后记录。
- 身份/构建元信息bf56c1a6等该负责人原成果不在本分支复制；由原owner与此源码一起整合，处理runtime/index冲突后重新验证组合候选。无服务协议/数据库/desktop/cloud部署变更。
- 原owner已报告目标Kevin iPhone未连接，且在其会话用户选择先准备包、暂不安装；该设备条件不影响提交/组合验证/签名准备，影响安装及真实验收。不能代选另一iPhone。
- 真机必验：正常send；快速连点仅一次；processing/accepted/rejected及原文回流；提交后断网→回执查询恢复；提交中返回/切会话；锁屏后台→前台；杀进程重启后pending恢复及已接收旧草稿不回流；最近会话跨Bot原Session打开；原账号/历史/草稿保留。仅用授权可控测试消息，记录目标设备、完整source、native+JS制品摘要、回执ID及实际结果，不回放未知原业务写入。

限制：旧journal未保存草稿revision/writeId，原生补偿可精确分账户/设备/Agent/Session及文本，不能仅由旧数据区分后来重输完全相同的文本；JS当前生命周期使用editRevision保护，待确认提交的输入禁止重复编辑/发送。该协议边界及实际弱网长任务仍须真机验证，不宣称端到端稳定性全部解决。
