## MOXBOTS-LOGIN-RETURN-02 — 标准 OAuth 登录与原 Air 验收

2026-10-22 用户明确保留 OAuth，按成熟标准流程收敛、减少自定义环节并简化登录。新任务记录 `.agent-sync/tasks/codex-login-oauth-standard-20261022-544dc4b5.md`；本分支从远端 main 263b1cf5 隔离开始。标准交付、UI、验证及主干发布状态以新记录为准。

旧 replay/ACK 修复已 PR180 合入 main 2adf5c1d，云端已发布；516.5 为已签名候选，原 Air 登录/重开验收未完成。不能将旧候选或其他 Mac 在线视为本次完成。516.8 既有冻结批次不混入尚未提交的新范围。

部署单元沿用：desktop client（src-tauri/renderer）及 combined CI/版本由 `01a12bc2-907a-7702-b6dd-788225c5dfe4` 唯一负责；owned cloud auth（services/agentnet）由 `01a12b99-7b38-78b1-831f-9c60257d386a` 唯一负责。云端兼容接口先发布，桌面后发布；保留旧 Host/手机/客户端接口及会话，独立回滚程序/客户端，不回滚原业务数据库或凭据。开发会话不触发共享 CI、正式构建或生产切换。

完成必须同时具备源码/测试/main 远端核验、两单元发布/制品对应和原 Air 真正登录、正常退出重开状态保留。用户已同意新包就绪后按链接操作，真实 Air 验收仍待进行。

## MOXBOTS-AUTO-ROUTING-20261021 — 自动选模型 P0–P3

每个新用户轮次由小分类模型判断难度档位并选出模型与推理强度（桌面、IM、定时任务同一条准入路径），界面只露「自动」、三档设置卡片与可纠正路由标签，P3 提供「先问我」的请外援。任务 `.agent-sync/tasks/codex-auto-routing-20261019.md`，交付记录 `dev-docs/auto-routing/acceptance.md`。源码已 rebase 到 `2adf5c1d2` 并推送 main（`c21b013bf` 源码，60 文件 +3744/−38；记录后 main 为 `ba97a22b4`），本地 unit/dom/integration、tsc、ESLint、depcruise 全绿；共享 CI（run `39563706378`，`ba97a22b4`，success）、真实 Provider 联调、真实换模型耗时、原生安装与发布分别追踪。桌面 CI/构建/发布仍由唯一 owner `01a12bc2-907a-7702-b6dd-788225c5dfe4` 负责。

## MOXBOTS-USER-INTERRUPT-409-20261021 — 原生输入交接的请求归属

原40ef用户中断后新输入409，已只读确认B先stdin-yield、随后A原生终态；历史HTTP lease精确scope未记录，不把合成复现说成原生根因已闭环。最小修复沿已有FIFO原生执行owner绑定Bridge scope，在原owner pop前退休其MF/Context binding，恢复/同轮续接不得越过真人B；隐藏provider-text retry仅凭原scheduler的对象来源链+精确root允许沿原FIFO恢复。任务 `.agent-sync/tasks/codex-user-interrupt-409-20261021-0e92d344.md`。两种pin时序/反向隔离红及新增10case、受影响64case/类型/lint/分类本地通过，源已冻结待独审/feature交接；未重跑旧全suite。MF/QueryGuard/ledger/cause/Stop/预算无改动。desktop builtin单元仍由01a12bc2-907a-7702-b6dd-788225c5dfe4唯一负责后续CI/main/版本/发布，既有5164/5165候选与原业务不动，真实native验收待其组织。

## MOXBOTS-NATIVE-GOAL-CONTINUE-20261021 — 安全首因可见性

原生case5正式Continue已入新Query/RC，随后response.failed后SDK重请求409；具体上游原因未知。下一批仅保留受限首因类别与固定提示，exactscope/attempt/request，沿现有有界registry，不改变恢复或执行权限。独立分支codex/native-goal-continue-20261021，任务记录见.agent-sync/tasks/codex-native-goal-continue-20261021-a040b693.md；root独审，desktop统一CI/发布仍由01a12bc2-907a-7702-b6dd-788225c5dfe4负责。源码已冻结并完成作者全integration（125files，1404PASS/32SKIP/0FAIL）及Bridge370unit；独审/主干/实际native验收分开记录，不操作冻结5163或原业务。

## MOXBOTS-SETTLED-STREAM-CONTINUE-20261021 — 已结清后台中断的原owner续接

原Query native result边界仅在清洁ledger、逐request零工具外溢证明、全root稳定manifest、nonambient背景精确结清及原owner/Stop/CAS一致时，沿原SameTurnStreamContinuation/SessionModelRecovery接续。任务 `.agent-sync/tasks/codex-settled-stream-continue-20261021-08946322.md`。缺证据failclosed，不增等待owner/队列/预算、不修改旧unknown或冻结5162；代码与本地合成验证开发中，native/业务验收另追踪。沿用desktop builtin唯一CI/发布owner01a12bc2-907a-7702-b6dd-788225c5dfe4，由root总审后交下一批。

## MOXBOTS-STREAM-RESUME-20261020-01 — 原 turn 断流续跑

普通 builtin API 会话及 Goal 沿原 Query/SessionModelRecovery、ContextRecovery 台账、Product/FIFO 与 Goal claim 自动接续；原 HTTP 与完成工具不重放，Stop 撤销后不恢复，质量参考持久记录恢复事实。代码与本地/合成 SDK 验收已完成，任务 `.agent-sync/tasks/codex-stream-resume-20261020-f5ea3680.md`，证据 `dev-docs/stream-continuation/acceptance.md`。精确 head 共享 CI、正常 main 合入/远端核验、签名客户端/真实 Provider 和用户验收分别追踪。

涉及部署单元 **desktop builtin client**：`src/server/agent-session.ts`、builtin-session/openai-bridge 与相应 renderer/shared 持久化 UI，仓库 heavenzhang/MoXBots、任务分支正常合 main。沿用唯一 CI/部署会话 **01a12bc2-907a-7702-b6dd-788225c5dfe4 / MoxBots桌面端统一打包负责人**；依据为用户最新部署单元规则及本任务明确交该统一发布会话安排发布。版本/构建号和下一未冻结候选由该 owner 分配，开发会话不启动共享 CI、正式构建、发布或客户端重启。当前开发成果待精确 SHA 交接，预登记已发送；不自动纳入已冻结批次。不涉及独立云服务/Host 部署。

## MOXBOTS-MOBILE-001 — 执行轨迹原型交付

按用户“改完了就提交到远端”的要求，把独立移动 Web 原型纳入 `dev-docs/prototypes/moxbots-mobile-001/`，包含左侧执行步骤、状态与 CSS piano-roll；本地合成数据，不改变 `mobile/app/`。任务记录 `.agent-sync/tasks/codex-mobile-001-execution-trace-20261019-e6514cfc.md`，验收与运行说明在原型目录 `acceptance.md`、`README.md`。构建、独立审阅、Git/CI/main 与原生/生产阶段分开追踪，未授权或执行部署。

## MOXBOTS-BACKGROUND-CONTINUATION-20261019 — 后台接续确认

沿原 SessionEngine/builtin lifecycle 提供精确task/run/Query实例确认与撤销。原客户端修复会话因反复断流终止，当前主Agent接续同一工作分支完成；不重复新建或唤醒并发writer。所有非ambient默认阻挡，原Goal/用户等待/队列与commit门禁保持。验收 `dev-docs/background-continuation/acceptance.md`，任务 `.agent-sync/tasks/codex-background-continuation-20261019-bc43f0fb.md`。主干/CI、签名候选、安装/真实模型与薪资业务生产分别追踪；唯一桌面publisher和原薪资/CI owner不变，不修改冻结制品或重启客户端。

## Deployment coordination — MOXBOTS-NATIVE-PASSWORD-CLOUD-20261019

- **Deployment chat:**01a12b99-7b38-78b1-831f-9c60257d386a, existing140 owned service/auth only; original101 connector temporarily paused/resumed with identity/config unchanged. Existing human cloud/101 takeover and source-owner explicit handoff remain authoritative; native consent replacement was directly approved in human01a14fd2-aca4-7e70-81c2-652eeaa679a3. Phone source01a1488b owns phone-only acceptance; no parallel production writes.
- **Pinned/current release:** main929b984e7334cb9b01100e0df421158043da6bf7 exactCI39185508608/39185508693, service27754480B/SHAf82ff9d6166b69d5a875ba54ecd7f0bcf4dfc19342dc837a5df001f6e797f7a8. Maintenance started2026-10-19 16:21CST, QA password/originalPKCE/session/revoke, original browser consent/callback and samePID101 disconnect recovery accepted. Original101 session handle/expiry/authority retained; physical phone remains unobserved; original101 natural production rotation0→1 and fresh Ready were accepted by the17:35 read-only observation (auth-renewal-natural-20261019.json).
- **Runbook/rollback:**dev-docs/native-password-cloud-20261019.md. Four nonblocking locks, fresh idle/pins, private consistent backup, manifest-owned config/unit CAS and exact process checks; no DB/token/key rollback. Original web consent remains false skipApprovalScreen. No dailyMac, installer/updater/website/Nginx/TLS/model/notification rollout;17:35 followup must record intervening service929 while keeping original session baseline.

## Host installer delivery checkpoint (2026-10-19)

Root01a12b99 is the human-authorized sole integration/static-publication owner after original01a13320 handed back. P4 source7e4bbdfa/R20261019083714-7e4bbdfaa693 built in39223945533 and passed full local ZIP/strict nested consumer/CRC. Same-artifact actual standard39225566407, natural lab renewal39226095343 and trueKVM39226946194 passed; new boot ID and original identity/ciphertext retained, Ready recovered in4.35s. P2's three real boot failures and P3's mobile-dependency failure remain history, never promoted. Final current-main CI/containment and anonymous public fullGET/promotion remain separate delivery receipts in PR137 and private execution-status.json; no cloud/101 binary upgrade or dailyMac operation belongs to this installer lane. Separate cloud929 production login/API/browser/101 recovery is accepted; physical phone and production24h natural observation are separate gates. Exact closed hashes: dev-docs/host-init-001/P4-acceptance.json.

## MOXBOTS-HOST-INIT-001 — fresh-install repair, 2026-10-18

The human requested a fix for first-install registry initialization, full acceptance before main integration, then handoff to the existing unified deployment chat; the daily Mac client is excluded. Source/integration and publication owner: `01a12b99-7b38-78b1-831f-9c60257d386a` (human-authorized takeover2026-10-18; original01a13320 explicitly handed back and remains read-only); existing bounded initializer worker: `codex/host-registry-bootstrap-20261018`; isolated Linux/browser acceptance and later `/host` publication owner: `01a12b99-7b38-78b1-831f-9c60257d386a`. One implementation and one integration lane; no competing production writer. Current delivery task: `.agent-sync/tasks/codex-host-init-delivery-20261018-50e7aad8.md`; original source record is historical.

- [x] Original actual Ubuntu/Dex/browser failure identified: `config.json` and `projects.json` absent through exit, `catalog → NETWORK_CATALOG_INVALID → stopped`; real authentication/join/WebSocket succeeded. Existing strict catalog regression: primary 7/7 passed.
- [x] Implement original Host startup-owned first creation and bounded interrupted-initialization recovery, retaining the original configuration lock domains and strict established-authority checks.
- [x] Independently review and verify first start/repeat/crash/concurrent/partial/corrupt/lost authority, plus real fresh browser/join/Ready, renewal and reboot with exact P4 artifacts.
- [ ] Pass required CI, integrate current main normally and verify remote containment before formal publication handoff.

The staged old dcf immutable release is preserved and stable remains unavailable. It is not a successful fresh-install release. New repair candidates use a new source/release identity; pre-merge acceptance stays isolated. No backend/101 redeployment or daily Mac operation is included.
## MOXBOTS-READ-LOOP-20261019 — 2026-10-19

builtin 执行会话"反复读同一内容、反复表态开始修改、始终不产生编辑"的有界进展检查。根因按观察证据判定为模型行为不收敛并被自动压缩放大（同轮94工具、0编辑、同一文件24次读取、精确命令重复0），未发现工具重放或bridge截断，不虚构历史重放类修复。实现只在单轮内容证据成立时（阶段表态/用户执行意图、同文件重叠区间重读、连续只读、0编辑、非只读研究、非等待用户）经`PostToolUse`注入可忽略提示；不停止、不切换模型、不重放工具、不写业务数据，不按固定超时或工具次数判死锁。任务 `.agent-sync/tasks/codex-read-loop-20261019-b7c02346.md`，验收 `dev-docs/read-loop/acceptance.md`，结果与脱敏证据见观察目录`/Users/zhangshaohua/Documents/Codex/2026-10-19/moxbots-execution-observation/`。定向13项、原builtin 153项、tsc与ESLint通过；真实模型收敛、构建/安装/原生验收未做。与并发`MOXBOTS-RUNTIME-REPAIR-20261019`在`src/server/agent-session.ts`有文件交集但改动区间不重叠，交接文件`read-loop-handoff.txt`；不向其他会话发送消息、不改薪资业务/会话/配置。

## MOXBOTS-MODEL-RECOVERY-001 — 2026-10-19

普通 builtin API Session 与 Goal 的模型故障进入持久等待，沿原native history/动作ledger安全续接；暂停/停止撤销代次并写持久fence，避免重启复活或重复已完成操作。主Agent统一集成，原Rust Goal/Query/SessionStore owner保持。代码、受控真实SDK、UI、CI/main、签名候选及真实Provider验收分开追踪：`.agent-sync/tasks/codex-model-recovery-001-20261019-868cb89a.md`、`dev-docs/model-recovery/acceptance.md`。用户已明确授权测试后正常合main并交唯一publisher `01a12bc2-907a-7702-b6dd-788225c5dfe4`安排下一未冻结桌面版本；不操作日常App或另建发行。无新依赖/配置迁移/公网入口。恢复范围及回退边界见`specs/tech_docs/model_recovery.md`。

## MOXBOTS-REQUEST-499-20261018

Fix normal background inference and streams incorrectly cancelled by parent turn completion; exact Query/route revocation and Stop remain authoritative. Availability failures get an original call plus three bounded, cancellable pre-delivery retries, independent of optional backup configuration. Never re-enqueue tasks or replay partial output/uncertain writes. Task `.agent-sync/tasks/codex-request-499-20261018-3f1bac55.md`; implementation/paired-loopback/native SDK verification and main delivery evidence `dev-docs/request-499-20261018-acceptance.md`. User explicitly authorized main integration and notifying the registered release owner for the next unfrozen repair. Daily client/task interruption excluded; queued/candidate/published/native-accepted states remain distinct.

## BG-TASK-LOG-001 — 2026-10-18

用户要求修复后台任务行点击无响应，并直接查看状态/执行日志。既有Exact Query/run registry经SessionEngine提供只读受限64KiB日志；任务详情不依赖原工具卡片，终态/断网/记录释放保留已读日志，键盘与窄屏适配。范围及分项验收 `.agent-sync/tasks/codex-bg-task-log-001-20261018-3fcc9f5f.md`、`dev-docs/bg-task-log/acceptance.md`。source/模拟联调/CI/main/原生发行分别追踪；用户明确授权修复验收后发送给既定唯一桌面发布owner01a12bc2-907a-7702-b6dd-788225c5dfe4安排下一未冻结版本。本聊天不重启日常App、不打断活动任务、不改既有冻结包/稳定更新源，无配置或业务数据迁移。

## Deployment coordination — MOXBOTS-HOST-PUBLICATION-20261018

- **Deployment chat:** `01a12b99-7b38-78b1-831f-9c60257d386a`, exclusively the existing140 HTTPS `/host` static software distribution for the frozen Ubuntu24/x86_64 release below. This is a separate lane from the already closed cloud/101 binary release; no backend/101 re-upgrade, `/download`, updater, desktop, daily Mac or new listener.
- **Designation:** Original human instruction `01a14c7c-05eb-7780-9fcc-7fbe938ee0a9` in source chat01a13320 requested one-command Ubuntu installation/browser enrollment/renewal after tests. The current human explicitly designated this chat to take over cloud/101 publication after handoff. Primary personally read both authorities. Earlier exclusion of public installer from the auth-only release was an agent's scope interpretation, not a human prohibition. This lane completes the original request through the existing HTTPS service.
- **Handoff/admission:** Original Host source/request owner01a13320 has explicitly withdrawn its earlier unaccepted Host-installer/Nginx requests to the desktop publisher and reports no active/queued writes, leases or locks. Original source/historical cloud operator01a13320 explicitly confirmed no known accepted /host task or shared-ingress transaction was omitted, withdrew all old unaccepted Host/static/Nginx requests and released its own zero-write/zero-queue/zero-lease state. The desktop publisher has not answered the separate occupancy inquiry; that is not an ACK, refusal or lease. This new target follows the direct human cloud takeover and original one-command request, not a transfer inferred from silence. Fresh target config/process/lock/lease checks under all four original nonblocking maintenance locks remain the actual short-window admission; stop on a real conflicting writer. No `/host` production write has occurred.
- **Pinned release:** Actual clean main `dcf8d9a60976c160e2b2aca33313c668c071132c`, release `20261018032115-dcf8d9a60976`; bundle171501596B SHA256 `304be176df11f9d4a952dab560160e7bdbe7af0c92dfa9eeeba6435cff037ae2`. Reuse exact candidate bytes, never regenerate/overwrite this release ID. Primary strict full-bundle/nested-Host/source/ELF verification passed. Transport trust is verified HTTPS plus SHA256, without a publisher signature.
- **Runbook/rollback:** `dev-docs/host-publication-20261018.md`, task `.agent-sync/tasks/codex-host-publication-20261018-2c80baff.md`. Immutable files first, stable unavailable until real fresh isolated Ubuntu/Dex/browser gates pass; shared stable script/index atomic pair, retained old pair and ownership-checked ingress/pointer rollback. No auth-state rollback. Existing maintenance locks serialize only the actual short write window; do not hold them while CI runs.
- **Current release:** Immutable-only staged under four original locks with backup/CAS/ownership rollback readiness; stable remains exact unavailable. Sole full normal-TLS public GET and real browser/expiry/reboot CI pending. Public install command must remain unavailable until required acceptance. Existing network-disabled systemd10phase and isolated AuthStore renewal are separate evidence. Real VM reboot, native daily-Mac UI and natural24h production rotation are not inferred.

## Deployment coordination — MOXBOTS-AUTH-RENEWAL-20261018 scoped transfer

- **Deployment chat:** `01a12b99-7b38-78b1-831f-9c60257d386a`, only the existing owned AgentNet service on140.143.183.232 and existing MoX Node/connector pair on101.42.11.29 for this authentication and recovery release.
- **Designation:** On2026-10-18 the human explicitly authorized: “授权本聊天接管云服务和 101 的发布，先与原发布方完成交接，避免双写。保留原设备身份、密钥和配置，部署后验证登录、Bots Ready、自动续期和断线恢复，不要动我日常用的 Mac 客户端。” This replaces the old publisher for these two targets only, after its explicit handoff.
- **Handoff/admission:** Completed with original actual cloud/101 publisher01a13320-dbf9-7c03-b7f3-37e30d15de48: no active/queued writes, leases or unfinished transactions; old unaccepted requests to the desktop publisher were withdrawn and that publisher notified. Fresh original target locks and idle/consistent-backup checks passed. Desktop, Windows, website, public installer pointers, updater, Nginx/TLS and daily Mac are excluded.
- **Pinned release:** Accepted main `dcf8d9a60976c160e2b2aca33313c668c071132c`, tree `e689d190488ddf2935c867c364810914ac3bc819`, PR118+119. Actual main Test39093243865 and Owned39093243842 passed; artifacts independently verified against actual source-commit.txt and SHA256SUMS. Later main commits do not join this release.
- **Runbook/state:** Preserve original AuthStore, device/private key, Host configuration, provider ciphertext, finite grants and production86400s TTL. Cloud binary first, then same-source paired Node+connector on101 after fresh idle/lock/consistent backup checks. Follow `dev-docs/auth-renewal-production-20261018.md`; keep secrets/runtime state private. Roll back program/pointers with ownership checks; never overwrite a committed token rotation or revocation with old auth state.
- **Current release:** Cloud and101 paired Node/connector deployed from pinned dcf; normal HTTPS270s start/cancel, actual original-principal PKCE/wait, management renewal, connector Ready/durable cloud catalog, exact TCP disconnect and connector restart recovery passed. Original identity/key/config/grants preserved; daily Mac untouched. Native UI/authenticated HTTP pagination and natural24h production rotation are not observed. Actual-main60s real AuthStore renewal passed separately. Detailed publication/failure-and-rollback receipts: `dev-docs/auth-renewal-production-20261018.md`.

## MOXBOTS-HOST-ONBOARD-001 — 2026-10-18

用户启动Ubuntu24.04/x86_64一条命令安装、浏览器授权自动入网与有效会话自动续期；代码/测试/main由01a13320-dbf9-7c03-b7f3-37e30d15de48负责，发行交既定统一部署聊天01a12bc2-907a-7702-b6dd-788225c5dfe4。任务 `.agent-sync/tasks/codex-host-onboard-001-20261018-b8d67c5d.md`。新public installer必须验证正式元数据可用后才展示命令，复用原身份/加密存储/撤销owner；没有新模型授权或生产操作。对日常Mac不安装、不更新、不重启。source/CI/main与正式bundle/服务发布/真实生产按门禁分开，发布请求仅排队不改变当前冻结发行。

## SIDEBAR-ORDER-20261019 — 固定项目顺序

用户要求点击任务不改变项目位置。侧栏持久保存项目 fallback 顺序，已有拖拽/置顶规则继续优先，新项目追加；Launcher 最近使用独立保留。102项定向测试、全量TypeScript、ESLint、1440/900px四组实际renderer交互已通过，CI/main/原生发行分开追踪。任务 `.agent-sync/tasks/codex-sidebar-order-20261019-66662e4b.md`，证据 `dev-docs/sidebar-order/acceptance.md`。本聊天不并发覆盖已有发行owner或用户日常App。

## MOXBOTS-PIN-001 — 2026-10-18

用户反馈侧栏点击置顶后位置不变。现有organization投影优先应用pinnedAt，统一工作区/根列表/自定义分区/拖拽源，保留手工顺序用于取消置顶恢复。92项定向回归、类型/lint、默认Web构建及MoXBots实际Chromium两尺寸4组通过；CI/main以PR132为准。任务`.agent-sync/tasks/codex-pin-order-001-20261018.md`，验收和发布请求`dev-docs/pin-order/acceptance.md`。下一未冻结桌面发布由既定唯一owner01a12bc2-907a-7702-b6dd-788225c5dfe4串行执行；用户已明确授权合入后通知既定发布会话并安排下一未冻结版本及不打断任务的原生验收；本聊天不并发安装/重启日常App或回写冻结包。

## MOXBOTS-UI-ZOOM-002 — 2026-10-16

修复Ctrl+后文本域水平滚动条；仅改输入/建议的横轴策略和grid收缩约束。真实组件Chromium/WebKit各60组、相关107测试、类型/lint及MoXBots web构建通过；CI/main以PR76与任务记录继续追踪。源码任务`.agent-sync/tasks/codex-ui-zoom-scrollbar-20261016-d37165e0.md`，验收`dev-docs/ui-zoom-scrollbar-acceptance.md`；queued发布请求由既有统一部署聊天处理下一未冻结批次，不操作日常/QA客户端、不回写055/056。

## MOXBOTS-UI-ZOOM-001 — 2026-10-15

主窗口Ctrl/Command加减与0缩放；75%–200%，成功后记忆，设置页快捷键说明。独立分支`codex/ui-zoom-20261015`，32项相关测试、类型/lint和MoXBots web构建通过；浏览器、CI/main、原生发布各自追踪。任务`.agent-sync/tasks/codex-ui-zoom-20261015-698c789d.md`；原生验证由统一发布窗口承接，不并发操作日常App。

## MOXBOTS-AUTH-HOST-20261014 — current continuation

Root owns integration. Human-approved29 is installed; owned account restoration, bottom-left account entry, actual k3/model-directory save, disabled Agent creation and desktop plus both Host services restart persistence pass without a new keychain prompt. Read-only extended Agent list is repaired with three regressions. Latest main model-center source is being incorporated with cloud_models remaining disabled. Final combined tests/candidate/CI and PR14/main/public download delivery remain open. See `.agent-sync/tasks/codex-mah-auth-host-acceptance-20261014-0bfff75a.md`.

## MAH-CREDENTIAL-PUBLISHER-ROUTES-20261014 — current desktop gate

5f1a8feb 七CI、两个完整候选签名与资源验证通过；用户后来明确要求安装/官网上架，直接从a838更新5f并真实启动，84fd未运行。官网下载公开版本7/source7da419c，实际下载ZIP大小与SHA和安装原包相同。试用包未公证，公开不等于全部Native/业务验收。看板owner已完成真实受控任务与持久化路径；当前云会话 OWNED_SESSION_INVALID，凭据迁移/免提示冷启动/远程配置仍开放，UI遇用户操作冲突后停止。PR14仍草稿，未主干交付。下一步及精确证据见 `.agent-sync/tasks/feat-mah-credential-publisher-routes-20261014.md`。

## MAH-CREDENTIAL-PARENT-BUDGET-20261013 — native recovery continuation (historical)

Root owns integration, packaging, installation and acceptance. Exact 6ac native migration validated the old account/key but failed before routing-ledger commit; cause remains unknown. a8 sidebar native moves/section persistence passed independently. Parent-only budget/closed diagnostics candidate bae611a0 retains frozen reader v1 and has been integrated with accepted main cf741f at 4a513ec7. Parent41, AgentNet148, packaging13 and default/MoX production checks passed before this latest-main combination; combined checks and native recovery are still required. Do not repeat OS authorization automatically or declare network acceptance from synthetic probes. Record: `.agent-sync/tasks/feat-mah-credential-parent-budget-20261013.md`.
# BOTS-MODEL-CENTER-001

2026-10-14：模型中心、Bot builtin/API 模型分配和调用监控已由 PR38 合入 main 并发布现有统一 `/admin`；源码与主干七项 CI 全通过，运行二进制/资源来源以及真实管理员配置、分配、重启持久化和监控路径已复验。用户明确后续自行填写供应商，本次不导入已有配置、不调用模型，不改变实际 Host 委派权限。发布/验收与协作证据见 `dev-docs/bots-model-center-production-acceptance.md`；后续供应商/Host/付费路径与已发布的管理功能分开追踪。

# Development Plan

## MOXBOTS-HOST-CONFIG-20261013

当前Agent按用户明确授权实现Host管理复用Settings模型配置、一键应用当前桌面主Agent来源、远端受限目录选择。交付记录 `.agent-sync/tasks/codex-host-config-delivery-20261013-5d88db02.md`（开发阶段旧记录保留），合同 `specs/tech_docs/host_configuration_reuse.md`。Node/Rust/来源及共享UI已实现，独立审查与合成IAB通过；af725700六项CI及Linux目录用例通过，已同步会话恢复main20e89b6f，组合源CI/main待核验。Host基础已由PR24交main fb92ce9c，交付分支已从其独立创建；开发冻结依赖9149753c及Mac凭据实验不进入交付；原凭据聊天负责基础拆分和统一安装，用户已授权协调。本任务未操作安装包，当前运行版本按统一安装owner回执另行核验。

- [x] 实际仓库/主干/原Host分支核验和隔离任务记录。
- [x] Provider元数据封闭合同、独立版本、凭据绑定与目录owner实现及本地相称回归。
- [x] 共享Settings UI/独立审查修复、合成IAB关键交互验收（真实Host待统一包）。
- [ ] Linux目录/完整CI、验证后的Host基础集成、远端main包含成果。
- [ ] 统一候选安装、真实Host和旧Host兼容、真实主Agent来源应用及用户路径复验。

## 当前目标和范围

用户已于2026-10-13启动 **BOTS-CLOUD-ADMIN-001** 真实实现，覆盖此前仅原型限制。基于现有 owned AgentNet 的统一管理员后台；本地鉴权、私有管理登记持久化与同源UI已验收，PR20已交付main be48a22b并发布现网，真实OIDC/admin API路径通过。独立标签页登录修复BOTS-ADMIN-LOGIN-002已由PR22交付main并发布，真实IAB登录及管理路径通过；有限Host执行BOTS-CLOUD-EXEC-001已由PR23/main75bb0269发布并完成单Bot真实六项生命周期验收；跨用户共享与收费模型调用仍为后续范围。详细状态见 `services/agentnet/planning/BOTS-CLOUD-ADMIN-IMPLEMENTATION.md`。

### 已完成的规划/原型阶段（历史范围）

将 Bots Net 多用户架构前提与 Bot 共享第一版规划保存到 MoXBots 源码仓库，附平台管理员 Bots 管理可交互原型、任务清单和接续记录；当前扩展Bot新建、配置、启停、归属/Host分配与逻辑删除。真实共享服务暂不开发；不改账号、业务数据、Host 配置、安装包或生产服务。

本共享计划于 2026-10-13 随 Git 协作结构首次接入，仅纳入本次任务；既有远程管理、身份、客户端和品牌工作继续由 `codex-handoff.md` 及其原 owner 负责，不在此推断完成状态。

## 里程碑

| 里程碑 | 状态 | 完成标准与证据 |
| --- | --- | --- |
| 仓库更名 heavenzhang/MoXBots | 已核验 | GitHub repository ID 1414574754 不变；origin 与远端 main 使用新地址 |
| AN-MULTIUSER-001 多用户隔离规划 | 已整理，待实现 | `services/agentnet/planning/AGENTNETS-ROADMAP.md` |
| AN-BOT-SHARE-001 第一版共享权限 | 已整理，待实现 | 同目录 `AGENTNETS-BOT-SHARING-V1.md` |
| AN-SHARE-PROTOTYPE-20261013 原型与同步 | 已交付main，后续实现另开任务 | 同目录 `TODO.md`、`dev-docs/prototypes/agentnets-bot-sharing-v1/`；UI 验收与远端 main 均须核验 |
| BOT-ADMIN-LIFECYCLE-PROTOTYPE-20261013 生命周期原型 | 已交付main，真实实现另开任务 | 新建/配置/启停/归属Host分配/逻辑删除及独立验收，真实实现另开任务 |
| 真实共享服务 | 待另行启动 | 先明确身份/网络、Bot 映射、Host 隔离与授权撤销；再真实多账号联调 |

## 当前实现和依赖

当前隔离分支 `codex/bots-cloud-admin`，base main `2796b13eeb1ad69c1b9bd529b7108ecf534a4f7a`。主Agent负责前端、集成与发布；后台worker独占Rust并已交回ownership；独立UI reviewer完成三个fixture gate。保留现网04fa的四个服务文件修复，避免main升级回退；不触碰其他Host/桌面任务文件。首位现网测试管理员已由用户明确授权并配置；实际OIDC/admin API及Browser fallback发布、登录UI均通过。

- [x] 本地管理权限、登记API、SQLite/CAS/幂等审计、同源UI与独立验收。
- [x] PR20 exact-head CI/main与远端包含成果核验。
- [x] 现网权限确认、备份回滚、串行升级、真实OIDC/admin API验收。
- [x] BOTS-ADMIN-LOGIN-002浏览器fallback CI/main/发布/真实登录UI复验（main1cfa2f85；下方实际发布记录）。
- [x] 有限单Bot Host委派、真实Session启停、删除/新授权恢复、原请求/CAS、重启及有效撤销验收。
- [ ] 共享执行、第二真实用户和收费模型路径（后续范围）。

### 前轮原型任务和依赖

当前任务分支 `codex/bots-admin-lifecycle-prototype`，base main `5ee8f862`；前次 `codex/agentnets-sharing-v1` 已完成。当前主 Agent 负责文档、接续、集成和 Git 交付。原型 worker 只写本原型 HTML；独立 reviewer 只做 UI 验收并写自己的记录。文件所有权互斥，不操作其他工作树。

原型不依赖后端上线；真实共享依赖 Host 执行隔离、资源级授权、可撤销调用授权、并发用量预占和持久化。设备入网与同账号管理不能替代跨用户共享验收。

## 交付门槛

- [x] 两份规划、TODO、综合和分支接续记录在同一提交链中可定位。
- [x] 原型邀请、接受、使用、审批、撤销、委派边界、用量和审计完成连贯模拟。
- [x] 独立视觉、交互、响应式验收与主 Agent 复核完成；范围仅限合成原型。
- [x] 同步最新 main，处理并发改动，遵守保护与必需 CI；核验远端主干包含成果。

本次无生产发布门槛：用户要求规划同步与原型，真实共享服务暂不开发。后续保留真实账号、业务持久化、运行版本和回滚验收项。

## 下一步

管理员版原型与规划已由 PR #17 交付 main；合并锚点 `421718d6756cb73dfffaf54e94344a5e497caf8c`，源头七项CI通过，合并树一致。客户端个人网络入口后续命名为 Bots Net。管理员生命周期原型与规划也已由PR #18交付main，合并锚点 `5652048579f776c5eebe9faebdbde212ce2b93c7`；其后由用户启动真实统一后台实现；当前以BOTS-CLOUD-ADMIN-001接续，不凭原型直接发布。

## 管理员生命周期扩展的当前门槛

- [x] 权威仓库、main和前轮CI已核验，当前start/task-init gate成功。
- [x] 生命周期、成对部署授权与删除/归属影响规划和验收合同。
- [x] 生命周期完整模拟、共享受保护操作和审批预留回归。
- [x] 独立视觉/交互/三视口验收及主复核。
- [x] 规划/任务/接续与原型、证据同提交链保存，当前头部CI与main交付核验。

详细需求见 services/agentnet/planning/BOT-ADMIN-LIFECYCLE-V1.md，阶段状态见同目录TODO.md；该历史轮次未启动真实服务开发；当前实现以本文件开头新任务为准。

## MOXBOTS-CHAT-ARCHIVE-20261013

当前Agent开发左侧聊天任务归档/列表/恢复（用户2026-10-13已明确），本条不启动真实Bot共享服务。Task record见 .agent-sync/tasks/codex-chat-task-archive-delivery-20261013-6fc6d567.md。目标为持久化/UI回归、原生可控聊天验收、远端main和保留既有Host试用能力的本机安装，归档实现已由PR #19合远端main，156项回归/CI及原生独立/重启/恢复保全验收通过。试用33992eb0在实际接受的b116404e上叠加归档并可逆安装；归档候选AgentNet凭据自动恢复回归未通过；用户选择回退原在线b116404e，已恢复并核验两设备在线，无系统密码请求。联合更新等待原凭据任务修复并同步main，整包发布验收按用户选择延期。详细分项证据见dev-docs/chat-task-archive-delivery.md。


## BOTS-CLOUD-EXEC-001 (approved execution continuation)

User approved finite Bot delegation on2026-10-13. New isolated codex/bots-cloud-execution-v1 starts from canonical main b421b759; registry PR20 tracked in its own branch. Current implementation contract services/agentnet/planning/BOTS-CLOUD-EXECUTION-CONTRACT.md. Primary owns cloud gate/queue/UI/integration, Sol/high requested worker owns closed execution-core+typed signer, Luna/medium requested worker owns new Host-local Bot modules; runtime model/effort unverified. No AIRouter calls or shared cache; compact owned interface and parity fixtures prevent duplicated context. Staged tests, actual Host, CI/main and release remain open. First deployment requires actual role/Host opt-in authority; original Host task source remains untouched.
## MOXBOTS-ASK-QUESTION-FIX-20261013

用户已明确由当前Agent修复AskUserQuestion输入校验/错误语义、并发提问覆盖与畸形选项渲染问题，完成回归、main和当前客户端验收。范围为既有SDK/Runtime与Tab请求链路，不启动Bot共享服务。任务记录 `.agent-sync/tasks/codex-ask-question-fix-20261013-626513cf.md`。本机安装由现有Host/钥匙串任务统一提供包，双方已获用户明确跨聊天协调授权；本任务不并发换包、退出或重启。实现/回归/独立审阅/main/统一包/真实caller验收分别追踪，不以模拟回传代替真实客户端结果。

该问答修复代码已由PR #21交付main `d9749998f743707074d6d42dc5344bcb724d55a8`，源头六项CI通过且merge tree一致；统一客户端安装/原生caller验收仍开放，详见任务记录。

### 2026-10-13 — administrator release and real browser acceptance

PR20 plus PR22 are in remote main. Login source `60e3a52c08bf79d3985e1453449719269a35fb1a` passed seven exact-head checks; PR22 merge `1cfa2f85dc6c936c02b86f1f40945961665608a7` passed Owned AgentNet run38396057654. Its CI artifact11812672883 has verified API archive digest5198fa3f… and binary SHA256 `9b9320f57685a938cee53492eec412567df8076a273e7ef72a12a461ca5f06bc`; complete source tree matches that accepted main commit. Subsequent main documentation changes do not alter the deployed service.

The user explicitly authorized the existing integration test account as this instance's first platform administrator. The binary-only release preserved exact existing role/config and ingress hashes, stopped only the dedicated network service, created consistent private SQLite/state backups and retained the previous binary and rollback. Dex, Mori and Linux Host were not restarted. Runtime executable/source/hash and health were independently verified.

Real OIDC PKCE login through the in-app browser's independent sign-in tab succeeded. Authenticated UI create/configure and approved owner/Host selection succeeded, revisions persisted, and disconnected start was truthfully rejected. Actual API verification also passed original mutation replay, reload persistence, recoverable delete/restore and logout token revocation. Controlled drafts only; no model calls. Real ordinary-user production login and actual Host execution remain unverified; fixture ordinary403 is not substituted for production evidence. Private production evidence is under `/Users/zhangshaohua/Documents/Codex/2026-10-13/moxbots-cloud-admin-evidence/deployment/`; raw accounts, tokens, credentials and Host identifiers remain outside Git.

BOTS-CLOUD-EXEC-001 continues separately: protected owner opt-in, current Host source preservation, Linux gates and true Session lifecycle release are open. Shared usage remains future planning.

## RESUME-BOUNDARY-20261013

用户确认当前 Agent 在 MoXBots 仓库修复实际 MyAgents 的 native resume 拒绝/重复提示。代码保持原边界和历史，阻断确定性自动重试，使用现有独立 native prefix Fork 恢复；旧 user stamp 只在唯一完整纯文本证据下修正新分支。任务/验收见 `.agent-sync/tasks/codex-resume-boundary-fix-20261013-4a93836a.md`、`dev-docs/resume-boundary-recovery.md`。本机恢复分支已由实际客户端 API 和零发送的隔离 native 启动核对，原文件未改。代码 main/CI 和客户端安装分别追踪；原签名团队不在本机且其它任务活跃，永久安装尚未完成；恢复分支的首次真实输入已进入 native/model 执行，原业务任务结果不在本修复范围，不代替 Host 或其它发布任务。
### BOTS-CLOUD-EXEC-001 integration update

Accepted Host foundation PR24 main fb92ce9c is incorporated into the execution continuation, preserving existing owner results. Synthetic UI and local Host/native regression gates passed; Linux exact-head CI and three-artifact provenance remain required. Production Host read-only scope preflight passed; a private single-Bot 24-hour lifecycle-only opt-in proposal is prepared but neither authorized nor installed. Protected account-binding UUID pin, exact opt-in authority, serial backup/rollback, real Session birth/exit and original receipt recovery remain open. No inference or model fees are claimed.


## MOXBOTS-SIDEBAR-ORG-001

用户明确由当前Agent为桌面端实现任务/Agent拖拽与Codex风格自定义分区。范围为本机侧栏偏好、排序与展示归属，不改变Session执行身份或真实工作目录。任务记录 `.agent-sync/tasks/codex-sidebar-organization-20261013-964955f1.md`，要求数据回归、实际嵌套拖拽/菜单/导航/刷新/rail及独立审阅、CI和远端main。原生安装与当前Host/凭据统一更新owner协调，独立追踪，不能把fixture验收当生产验收。

SIDEBAR-ORG阶段更新：PR25已交付远端main c21e9f43，源头9d879a6e六项CI与独立23项实际UI通过；原生安装仍开放。用户已授权跨聊天协调，唯一本机安装owner“Bots 网络 可用”已确认旧6ac包不含sidebar，正准备联合候选；以实际制品/签名/运行回执和原生重启验收关闭。

SIDEBAR-ORG原生更新：a8具体包已由用户许可并串行安装；主Agent实际App拖Task/Agent进分区、菜单恢复、分区管理和正常重启保留完成，详见dev-docs/sidebar-organization-native.md的覆盖限制。临时分区已清理；凭据slot保存仍失败，由原owner修复，统一更新未全部验收。

## MOXBOTS-PROJECT-BOARD-001

用户已确认MoXBots仓库并批准PB-002实现。当前Agent负责隔离分支codex/project-board-20261014及集成/主干交付；TaskStore/Session owner不变，工作区看板只读投影真实数据，有限activity快照明确新鲜度。原生更新与既有owner串行；无需新增付费模型任务。进度/门禁见`.agent-sync/tasks/codex-project-board-20261014-da9bc0a5.md`。 2026-10-14：PR31已入远端main；统一包5f1a8feb已安装，CUA原生看板关键路径验收通过，官网公开完整下载件大小/SHA与候选ZIP一致，ZIP完整性通过。PR35已修复NSIS供应门禁并以6项CI合main；受控冷启动、Task恢复/历史/文档hash保留、最终再次归档及原生800 CSS px/键盘补验通过。原生≤700/第二工作窗口不在客户端支持范围，未公证及范围外路径见任务记录与`dev-docs/project-board-native-acceptance.md`。
### 2026-10-14 — finite lifecycle release gate

BOTS-CLOUD-EXEC-001 source is delivered by PR23/main75bb0269 with all required CI successful. Linux Node/native default-off upgrade is accepted, preserving prior management/credential/source ownership. The user has now authorized the concrete single-Bot finite whitelist; it is installed with account-capped expiry. Cloud runtime switch and real owner/admin lifecycle acceptance are still pending; no model inference or shared usage is claimed. Current gate/evidence are maintained in `.agent-sync/tasks/codex-bots-cloud-execution-v1-b0a0c425.md`.

### 2026-10-14 — accepted lifecycle and one cloud console

BOTS-CLOUD-EXEC-001 is released/accepted at runtime source75bb0269. Current source/artifacts/CI, primary actual user-path and rollback boundaries are in `services/agentnet/validation/BOTS-CLOUD-EXEC-001-LINUX-ACCEPTANCE.md`; the task record is complete. Final controlled Bot is restored, stopped/admission closed, both grants effectively revoked and all receipts ACKed; no model invocation.

User requires a single MoXBots cloud administrator console for users, Hosts, Bots, permissions and audit. Existing auth components remain internal dependencies, not separate back offices. Client sign-in is retained; personal product surface is Bots Net. Current registered-user query does not imply IAM write capabilities: expand account/login/role administration in this same platform, never fork another admin system.

## TITLE-001 — 2026-10-14 概要性任务标题

当前Agent修改后端自动命名：首个成功人类问答后异步概括对象和动作，扩大有界上下文并保留尾部需求，拒绝认证错误/失败终态。手动命名不覆盖；不批量修改历史。任务记录 `.agent-sync/tasks/codex-title-summary-20261014-7b0a1e0a.md`。自动测试、真实存储重载及DOM回归通过；当前源CI/main、统一包和真实模型/原生侧栏验收分开追踪。

## MAH-CREDENTIAL-OFFICIAL-PUBLISHER-20261014

- [x] Closed formal-publisher reader release, source a8387448, signed/extracted desktop artifact and seven CI checks.
- [x] Paired Linux cf741f upgrade with backup and preserved identity/config/credential/policy evidence.
- [ ] Exact package installation confirmation and actual migration/restart/update acceptance.
- [ ] Real desktop remote configuration and disabled Agent persistence, then PR14/main delivery.

Owner: root. Record: .agent-sync/tasks/feat-mah-credential-official-publisher-20261014.md. Do not overwrite frozen package worktrees or retry old OS authorization automatically.

## MAH-HOST-DAEMON-STATUS-20261014

- [x] Explicit owned boot option and additive doctor status, source79c25045; actual MoX enablement and restart/reconnect acceptance passed.
- [x] PR32 all six checks passed; merged main d86f7505f641ecbe6d136142c11422ef063ea0e5 has the exact reviewed tree. Desktop PR14 native gates remain pending separately.

Owner root; record .agent-sync/tasks/fix-mah-host-daemon-status-20261014.md. No paid calls, other namespace or machine reboot.


### BOTS-ADMIN-LOGIN-UX-001（2026-10-14）

用户反馈管理员网页登录双窗口割裂。独立任务 `codex/bots-admin-login-ux-001` 基线 d86f7505，改为当前标签页 OIDC 登录、固定 /admin 返回、短期 tab-scoped PKCE 事务恢复，bearer仍只在内存。中文 Dex 品牌模板保持原 POST/同意授权语义；不改变账号、权限、客户端身份、Host或模型调用。服务端与loopback浏览器回归已通过，独立只读审阅与CI/生产真实路径待完成。详细任务见 `.agent-sync/tasks/codex-bots-admin-login-ux-001-2ebc1db3.md`。此条覆盖历史弹窗/独立标签页fallback的产品方向。


### BOTS-ADMIN-LOGIN-UX-001 最终交付（2026-10-14）

已交付PR33/main1ece497d并发布现有统一云后台：当前标签页中文OIDC登录及固定后台返回替代旧弹窗/独立标签页fallback，错误/取消/过期可恢复。代码七项CI通过，Linux制品及Dex资源manifest/运行源对应已核实；真实受控管理员登录→中文确认→Bots目录→退出204，以及callback400恢复通过。仅两个既有云服务更新展示和回跳，原身份与权限不变，101 Host及模型未操作。备份标记 moxbots-login-ux-backup-20261014T101958，恢复原unit+Dex配置即可回滚且保留业务状态。详细最终验收和后续状态见 `.agent-sync/tasks/codex-bots-admin-login-ux-001-2ebc1db3.md`；现网维护窗口已释放，后续无本任务云端写入。

## MOXBOTS-UPDATER-20261014

接通MoxBots独立更新地址/签名、后台检查下载、用户确认且任务安全的重启安装；官网服务器静态不可变release/原子stable，Linux及无正式包平台不自动升级。源实现/确定性测试、独立UI、真实A→B更新、Apple分发包、主干/部署各自跟踪，详见specs/tech_docs/auto_update.md与scripts/moxbot-updates/README.md和对应task record。MOXBOTS-MIGRATE-001迁移已完成，保留迁移后数据。真实更新窗口与官网聊天串行协调，正式包包含已合入main的账号/Host成果。

### MOXBOTS-AUTH-HOST-20261014 actual29 acceptance

User specifically approved29 update; native owned-account recovery, bottom-left menu, remote Kimi Code/k3 save, disabled Agent creation and client+Host service restart persistence now pass without a new keychain prompt or model call. Extended Host resources had a display gap; a read-only registered-Agent list and three regressions are added. Final latest-main integration, combined candidate/CI, PR14 merge and public trial refresh remain open. Authoritative current scope/evidence/next step: `.agent-sync/tasks/codex-mah-auth-host-acceptance-20261014-0bfff75a.md`; old114/29 pending-approval notes are historical.


### MOXBOTS-AUTH-HOST-20261014 final native acceptance

Approved combined27 is installed; actual owned account/device recovery, k3/directory and registered-disabled-Agent list readback passed. Final Linux dd7192d4 upgrade preserved config/projects/unit bytes and finite permissions; all seven exact source checks passed. Task final evidence is updated; PR14 merge/public release remain, original mailxf Site update separately awaits restored connector access (404 in current zshedu account). Migration owner completed local8-project/34-history merge; never restore pre-migration data backups.

## REMOTE-SESSION-IMPLEMENTATION-20261015

同账号远程Agent直接会话；实现/验收状态和后续门禁见 `.agent-sync/tasks/codex-remote-session-20261015-bba594f8.md`。复用SessionEngine/Store与owned管理传输，首版为有界snapshot同步。生产原生包与真实双端、Provider验收单独记录，不能用组件模拟代替。

## FEEDBACK-001 — 2026-10-15

把MoXBots小助理并入设置下方个人菜单，通知保持原功能。新增同源云端反馈页：用户提交和查看自己的反馈，管理员回复及处理；既有账号权限/PKCE登录、幂等/CAS和私有存储。记录 `.agent-sync/tasks/codex-feedback-center-20261015-3b6a3c97.md`；代码、fixture、main、云发布和客户端真实路径独立追踪。

FEEDBACK-001候选：个人菜单合并小助理/反馈与云端本人提单/管理员处理已实现，代码/本地/独立UI验证通过；CI/main、生产与安装包验收分开，状态见任务记录。

### MOXBOTS-PROJECT-BOARD-002 会话时长与直达

用户要求在项目看板看当前会话执行时长并一击打开原会话。SessionEngine当前turn只读投影、独立卡片/列表快捷入口、明确最近更新、过期冻结/刷新已实现；154项组合unit、typecheck/lint、生产web和14组合成React UI通过。PR42六CI/main58b6720f、原生补验记录main80faaab7；隔离B3卡片/列表/详情与原会话/草稿、回看状态、idle过期未知及刷新通过。真实running计时无合法模型样本仍未覆盖。原生窗口已释放，后续按各owner授权串行；记录见 `.agent-sync/tasks/codex-project-board-session-time-20261015-c5ba72da.md`。

### MOXBOTS-UPDATER-20261014 final0.5.4 delivery

Sourcee5a05f76/PR46 main0c85b571，六CI及main3351运行文件blob等同；已整合统一官网PR47 main16ab3dbd/看板记录80faaab7，无客户端重建。独立QA真实A3→B3、编辑/realPTY拒绝不中断、cancel、signed install/nativecleanup/exactdraft&Record恢复和Root实际UI复看通过。App/DMG AppleAccepted/stapled/Gatekeeper，ZIP/TAR/DMG全清单/签名门禁通过。Own官网stable0.5.4及独立ownkey签名生效；sameSHA TAR复用自有Repo CDN（官网URL和公钥不变，服务器原件保留），完整实际HTTPS343281849bytes/37.19s/9.23MBps、signature/range/privacy通过；网站新设计当前源hash已对齐、其它Nginxbase保全/cloudPID不变。正式文件WPS output/updater-20261014/final-e5a05f76/，最终交接 dev-docs/moxbots-updater-054-delivery.md。paidProvider/realissuer/Host/runningtimer不是本native覆盖；remote-session安全更新证明未就绪明确阻止安装。Root/children、board与unified均停止GUI，remoteowner后续只按其自己的授权安装/联调。已公开0.5.4不可变，下一源码变更发0.5.5。

## MOXBOTS-NEXT-PROMPT-002

用户要求扩展Codex/Claude Code/DSH下一步建议、真实模型生成验收与客户端更新。仅文本utility不执行工具/不改原对话，保持Runtime身份及冻结模型。分阶段状态见.agent-sync/tasks/codex-next-prompt-runtimes-20261015-2fee4eac.md；普通0.5.4发布不代表本任务已实现。

### MOXBOTS-055-UNIFIED-ACCEPTANCE

Unified owner builds a distinct real-model utility acceptance environment, coordinates NEXT-PROMPT/TITLE/Host and brand/community serial native acceptance, then freezes all accepted mainline work for signed/notarized 0.5.5 and idle-only actual client update. Existing updaterqa stays model-disabled; daily work is preserved. Source/tests/runtime/production/mainline gates and ownership: `dev-docs/unified-055-acceptance.md`; task `.agent-sync/tasks/codex-unified-055-modelqa-20261015-38fa9c79.md`. Not a claim of completed 0.5.5 release.
FEEDBACK-001阶段交付：PR44/main d7264a43已核验，7 CI通过；云端已发布并通过受控真实账号闭环5/5。统一原生候选尚未纳入该提交，收包已登记，当前安装入口不算通过；接续见任务记录及dev-docs/feedback-production-validation.md。

FEEDBACK-001 2026-10-15 07:14 UTC+8 接续：已安装正式0.5.4/e5a05f76包含PR44，实际binary/源码/远端main c7bab285对应通过；按新增人类授权同步给统一客户端负责人并登记FEEDBACK/TITLE原生待验队列。现有非实现者原生入口/布局证据复用；实际issuer/退出恢复及Provider标题生成待当前窗口owner明确交接，未抢占GUI或重复发布。任务保持in-progress。

FEEDBACK-001 原生补验完成：主Agent在明确串行窗口交接后使用正式0.5.4完成个人菜单/助手/正确issuer反馈入口、同账号真实Dex/PKCE退出恢复、8原标签及App/Sidecar PID保留、独立铃铛入口。实际联网状态不作为Host/通知通过。GUI已token校验释放，非秘密摘要dev-docs/feedback-native-acceptance.md。TITLE待独立modelqa，后续统一0.5.5由发布负责人处理。

## MOXBOTS-PROJECT-BOARD-004 — 四阶段与可信执行状态

用户批准PB-003 v3落实际看板：待开始→执行中→待确认→已完成；历史仅主动归档，恢复不执行。当前分支codex/project-board-state-20261015，任务记录 `.agent-sync/tasks/codex-project-board-state-20261015-5b2d05d2.md`。实现renderer与现有owner观察链路，SDK当前Query后台子任务纳入running；Sidecar非健康/恢复不可伪idle。主Agent负责集成，state_review独立检查UI；不碰统一0.5.5工作区，不并发退出/换包。代码、CI/main与统一原生安装/真实HRM复验分开记录。

- [x] 四阶段/细原因、历史归档恢复、可见页有界刷新与失败保留快照。
- [x] 相关161项unit/DOM，web/server构建。
- [x] 完整类型/lint、Rust Task82/owner2及独立UI审阅。
- [x] main20593924/PR56已交付六CI通过，用户直接授权纳入统一0.5.5。
- [ ] 统一原生安装与真实HRM复验；由统一负责人串行处理，不另起安装或付费模型任务。
## MOXBOTS-BRAND-COMMUNITY-001 — 2026-10-15

用户要求清理可见MyAgents名称/介绍，并重建社区到现有云服务体系。隔离分支`codex/brand-community-20261015`，基线c7bab285；桌面品牌/导航、同云账号社区及后台管理已由PR50交main b5b9c9c4；7CI、151云回归、独立UI和生产真实OIDC/只读路径通过。云已安全发布并释放维护hold，原生0.5.5由统一负责人继续。最终证据见`dev-docs/brand-community-delivery.md`。合同`services/agentnet/COMMUNITY.md`，任务`.agent-sync/tasks/codex-brand-community-20261015-5872226e.md`。云服务和桌面分别追踪发布；统一桌面0.5.5打包owner正在工作，本任务不并发安装或重启日常应用。不得把合成OIDC、本地fixture或主干合入称为生产/原生完成。


## MOXBOTS-PLAN-REVIEW-001

2026-10-15 用户确认 MoXBots 目标仓库，当前Agent直接修复方案审核空卡。仅当前 Session 专用 Markdown 写入例外；无完整正文时返回模型可修复错误，UI旧空卡禁用批准。任务及分项验收见 `.agent-sync/tasks/codex-plan-review-content-20261015-0fd5aae0.md`。代码/模拟/UI/main与原生安装分别追踪；不操作现有业务审核或并发替换统一055客户端。


## MOXBOTS-PROJECT-BOARD-TODO-001

在四阶段看板增量接入原会话TODO和子Agent真实进度。卡片/列表摘要、详情三态清单/子Agent状态，复用共享reducer与既有只读activity owner；历史/过期不冒充实时，TODO全勾不推导Task完成。代码、251项相关unit/DOM、类型/lint、MoXBots web/server构建、6组合成UI及独立代码/视觉审阅已通过；PR58六项CI通过并合入main7346499b（产品树与CI head一致），统一原生纳入仍待负责人队列。验收 `dev-docs/project-board-todo-acceptance.md`，任务 `.agent-sync/tasks/codex-project-board-todo-20261015-06d8ff2b.md`。


## MOXBOTS-OUTPUT-001 — 阶段化聊天输出

2026-10-15，用户确认截图评审方向并指定本仓库。连续阶段、工具/思考真实状态、结果统计及动作归属、默认折叠/回折已实现；91项unit/169项DOM、类型/lint与MoXBots web构建通过，主审及独立React浅深色/380窄窗/英文验收通过；PR/CI/main和统一原生发布分别追踪。任务`.agent-sync/tasks/codex-output-display-20261015-03caa522.md`，证据`dev-docs/output-display/acceptance.md`。不把工具返回称业务验收，不操作日常App或真实Provider。

## MOXBOTS-PROJECT-BOARD-006 — Goal-aware grouping

截图反馈由独立任务`codex/project-board-goal-20261015`修复：看板只读Rust Goal lifecycle，active覆盖旧done Task及turn idle；未知/暂停/阻塞保留待确认，归档重新核对Goal。实现/合成React/44回归/typecheck/lint/web已通过；CI/main及客户端发布/真实任务复验分开追踪。记录`.agent-sync/tasks/codex-project-board-goal-20261015-0d453018.md`。不碰现有统一0.5.5冻结源或执行中的日常App。

## 2026-10-15：055冻结发行 / 056接续

用户要求先发布冻结0.5.5，后续改动进入0.5.6。055源码main52bf6160已正式签名、公证并完成不可变服务器归档；公网完整GET/原子stable门禁和实际客户端安装分别追踪。main5ebf字体缩放PR59及以后改动属于056；各开发版本元数据推进056。当前发行与精确验收边界见 `dev-docs/releases/moxbots-0.5.5.md`、`dev-docs/releases/moxbots-0.5.6-handoff.md`，后续记录覆盖旧统一055任务的历史状态。

## 2026-10-15 16:39：055正式更新已发布，056继续开发

MOXBOTS-055-RELEASE-FREEZE已完成既有own updater stable055发布及正常TLS/完整GET/实际stat+SHA/签名独审/CAS/公开路由/054回滚核验；源main52bf6160及远端tag v0.5.5不可变。055整包平均119030B/s、全GET约47分钟，不证明云带宽上限。本机054未安装或重启：HRM16:26仍busy，须fresh完整代次准入、有效一致备份及用户确认。未把Host/IME/带数据原生UI算通过；测试network服务ACCOUNT_SESSION_EXPIRED失败明确留056。

开发主干已056（版本PR61/main6d1f8912），包含之后的PR59缩放/PR60 Goal/PR62输出/PR63 Bots Ready；均不回写055。源码交付/验收边界见dev-docs/releases/moxbots-0.5.5.md、moxbots-0.5.6-handoff.md，私有制品与README/DELIVERY/SHA256SUMS在指针output/updater-055-20261015/final-52bf6160。官网下载手动ZIP由原官网owner在其新增授权下串行发布，Root不操作该asset或日常客户端。


## MOXBOTS-RESTART-001 — 用户确认后允许中断并重启

2026-10-15 用户明确确认目标仓库并要求运行任务也能手动重启。056候选改为明确停止/保存确认；后台下载不安装，取消无副作用。Rust验包/签名、精确代次DispatchLease、SessionEngine全会话停止和writer落盘依次完成，运行中Task按用户Stop记为Stopped，空闲调度保留；安装失败恢复文档/语音准入，迟到响应不能复活旧token。当前Agent负责实现/集成/原生门禁，restart_safety_review独立只读审查。代码、回归、CI/main及签名原生发行分别追踪，见 `.agent-sync/tasks/codex-restart-001-20261015-35044beb.md` 和 `dev-docs/restart-001-acceptance.md`。不回写不可变055，未操作日常客户端。

## MOXBOTS-BOARD-DEDUP-001 — shared Session presentation

多个Task复用同一Session时只选一个当前进度代表卡片，历史任务按自身状态保留，不再把同一TODO/计时/Goal复制成多个执行。renderer限定修复，零业务数据写入；代码/React合成验证/main与056原生发布分别追踪于 `.agent-sync/tasks/codex-project-board-dedup-20261015-d944a599.md`。

## Deployment coordination — Host101 scoped operation 2026-10-16

- **Deployment chat:** `01a13320-dbf9-7c03-b7f3-37e30d15de48`（Bots 管理控制台），仅本次101.42.11.29既有MoX Host安装/网络恢复。
- **Designation:** 用户在本聊天直接要求“在101.42.11.29上面安装host程序，并配置到moxbots网络”，并提供专用SSH附件。该具体目标由当前聊天负责，不接管下方桌面updater发布owner或其目标。
- **Targets and runbook:** 仅101的moxbot-host-test及moxbot-host-network-test；沿用`scripts/host/network-control.py`，先检查维护冲突/无activeSession、备份身份/配置/加密state，原身份恢复登录/run，不重置或覆盖身份，不更改模型执行授权。旧myagents服务、140backend与日常Mac保留。
- **Current release:** `MOXBOTS-HOST-101-20261016` accepted（运行/入网）；原83e48946安装复用，正式登录+同principal管理绑定续接后ready，重启及原配置/身份保全通过；PR85记录交付另核。任务 `.agent-sync/tasks/codex-host-101-network-20261016-810cf816.md`；验收 `dev-docs/host101-network-recovery-20261016.md`。既有会话24h，本次到期2026-10-17 14:14:14 +08:00，自动续期未实现；不宣称永久在线或真实模型调用通过。窗口已结束，无后续目标写入计划。

## Deployment coordination

### MOXBOTS-WINDOWS-DOWNLOAD-059 — 2026-10-17

- **Deployment designation:** 用户在当前任务明确要求“同步发一个 Windows 的包到下载页面”；当前任务 `MOXBOTS-059-WINDOWS-DOWNLOAD-20261017` 负责这一次受限网站发布。该委托仅覆盖本任务下的 Windows 0.5.9 下载页变更。
- **Targets and limits:** 仅官网静态下载页 `https://140.143.183.232/download/`、其 `/download/packages/` 下的不可变 Windows 安装包，以及页面 HTML/CSS/JS/内容寻址版本清单。冻结源码为 `v0.5.9` / `9f93b3304ee6f06434d8d09754d3e59d4d676d0d`。Actions 私有短期 artifact 只作传输，不创建 GitHub Release；页面须显示实际 Authenticode 状态和 Windows 自动更新暂不支持。
- **Runbook and exclusions:** 复用官网现有维护锁、备份、不可变 release 目录、symlink CAS 原子切换及选择性回滚。不得改 `/updates/*`、updater manifest/stable、Nginx/TLS、auth、Host、其他网站服务、macOS 下载资产或日常客户端；不扩大权限或中断任务。
- **Current state:** PR #110 的 Windows 0.5.9 metadata 已经六项常规 CI 通过并正常合入 `main`，合并 SHA 为 `54456225412e892a6ad15704cdf6dc4acffce8e1`；冻结源码、页面文案与移动/桌面本地验收记录见 `.agent-sync/tasks/codex-moxbots-windows-download-20261017.md` 和 `dev-docs/moxbots-059-windows-download.md`。线上页面经正常 TLS 复核仍只有 macOS 0.5.6，Windows 包尚未上传。用户确认本机没有服务器 SSH Host alias，仓库也没有现存部署身份；下一步须先配置安全授权的上传通道，再按既有官网锁、备份、不可变目录和 symlink CAS runbook 发布并复验。GitHub 一日传输 artifact 已过期，本地已校验安装包保存在私有任务工作区。Windows 未签名、自动更新不支持，未作 Windows 安装/运行验收。

### MOXBOTS-DOWNLOAD-0510 — 2026-10-18

- **Deployment designation:** The current release owner is responsible for the user-authorized MoXBots 0.5.10 desktop download channel at the existing site. This covers macOS and Windows public downloads and page metadata only; the own-updater stable feed remains a separate target with its own package/QA gates.
- **Targets and limits:** Only `https://140.143.183.232/download/`, immutable macOS/Windows files below `/download/packages/`, and immutable release notes below `/download/notes/`. Both packages use frozen app tag `v0.5.10` / `400b746a4841bab8e4b99d8f83479fd54925c205`. Windows is manual-only; disclose `NotSigned` and SmartScreen risk. Do not upload a binary to GitHub Releases.
- **Runbook and exclusions:** Reuse `services/website/README.md` and existing website maintenance locks, backup, immutable release directory and current-pointer CAS. Preserve every old release, manifest and asset. Do not change `/updates/*`, updater stable, Nginx/TLS/auth/Host or other site services. The updater key is never a website deployment credential.
- **Current state:** Source metadata and content-addressed page assets are being prepared on `codex/moxbots-0510-download-page-20261018`. The verified Windows installer is `339637031` bytes / SHA-256 `d0c9d526b7c1e0c18702d6d224848549c5be61d35e433d7e59f69acb73fdd848` and is unsigned; Windows runtime was not tested. The macOS ZIP is `352465403` bytes / SHA-256 `48f6a563fc5dd29762c20e1a175bb56096d20e4b800f245a0b4337fc82ba8ced`, signed and notarized; exact-package native QA remains pending. The public page still serves only macOS 0.5.6. The user confirmed no website SSH Host alias exists and no website upload identity is configured; do not write to the public server until an approved least-privilege route exists. Page disclosure states 0.5.10 does not include the pending production web-login-return protocol.
- **Task record:** `.agent-sync/tasks/codex-moxbots-0510-download-page-20261018-8dca6bc9.md`; evidence `dev-docs/moxbots-0510-download-acceptance.md`.

- **Deployment chat:** `01a12bc2-907a-7702-b6dd-788225c5dfe4`，MoxBots桌面端统一打包负责人。
- **Designation:** 既定唯一发布owner仍为本聊天。最新用户于2026-10-16在修复聊天`01a1420f-245b-7f22-8a0f-4caaaf31b91b`明确回复“授权发送并安排修复版”；Root实际核读human message`01a142d4-9285-7c93-a968-52d61de5ab7d`，覆盖下一未冻结修复版及任务空闲后启用、不中断任务。原056授权和交付保持其发行记录，不将开发者转述自身当新增授权。
- **Targets and runbook:** 本次仅既有macOS arm64 MoXBots own updater `https://140.143.183.232/updates/stable/darwin-aarch64.json`、`/srv/moxbots/updates`及其不可变归档/原子stable；流程`scripts/moxbot-updates/README.md`与`release.mjs`。复用原Developer ID、公证profile、正式Reader和自有签名根。允许确认任务空闲、Mac手动解锁且启用前兼容配置备份就绪后，在本机启用新版并验证已有授权账号；不主动停止运行任务。不扩展路径/端口，不部署auth/Host/网站服务，不扩大External Calls/模型权限。
- **Release record / concurrency:** `dev-docs/releases/moxbots-0.5.7.md`及本任务记录维护状态；仍用既有`.release-lock`及owner核验，Git计划不是原子锁。Release workflow仅特殊分支push filter、不触发main/tag；Test CI只验证。开发聊天可正常源码/CI/main交付，后来提交不自动进入冻结包，不能并发发布或切换本目标。
- **Current release:** `MOXBOTS-LOGIN-FIX-0511-20261018`，`published-and-distribution-verified / daily-installation-not-upgraded`。冻结source/tag `15be9d6fda17c464afa54ee675d10f1d7fd4507f` / `v0.5.11`；正式签名、公证、Reader、自有更新签名、原生及独立UI验收通过。用户当前Mac维护窗口内，精确正式候选真实网页登录、原账号/设备恢复、原网络设置冷启动、本机在线/0/10目录、认证社区读取通过；日常磁盘0.5.9未替换，未做本版本A-to-B安装。TAR294768547B / SHA0572512d，外部完整正常TLS GET/实际stat+hash/17原件独审、原子promotion、stable/Range/private404/unsupported204、发布后独审及own-lock finish均通过；stable SHAee5d8b48，旧0.5.9精确stable及完整包回退保留。后来main不进入此二进制；Host管理、模型、Windows及自然续期边界保留。详见 `dev-docs/releases/moxbots-0.5.11.md`，历史0.5.8/0.5.9发行按各自记录保留。
- **Acceptance boundary:** 分别报告源码、签名制品/服务器分发、启用安装、真实账号session/identity/membership/relay/目录/可调用路径。只在fresh完整活动准入确认空闲、Mac手动解锁及兼容配置备份/回退就绪后启用；不强退、不stop运行任务、未知则保持pending。真实Provider/Host/薪资看板等原生边界不得因构建/CI/HTTP200而关闭；其他服务不因本次指定获得新部署授权。

## MOXBOTS-MODEL-FAILOVER-001 — 2026-10-16

内置API模型一主一备，当前Session主模型不变，在原Query token推理请求边界有限重试/备用接管，保留native历史及工具结果，指纹/SSE终态防止隐式重放。默认关闭，设置复用原配置writer；订阅/DSH/external与真实供应商另验。合同`specs/tech_docs/model_failover.md`、验收`dev-docs/model-failover-001-acceptance.md`，任务`.agent-sync/tasks/codex-model-failover-001-6b96c57f.md`。当前Agent负责源码/CI/main，发行请求排入统一owner下一未冻结批次，不改变已有056冻结源码或操作日常客户端；代码、模拟/真实SDK loopback与原生/生产分别追踪。

## MOXBOTS-PROJECT-CONTEXT-001 — 2026-10-16

用户授权同项目新会话自动带入近期重要进展/决策，测试并main交付，发布交统一发布会话。只读原对话摘录、零新增模型请求、6000 UTF-8 bytes body；typed来源、独立开关和首轮重试刷新。开发/main/发布分别追踪于 `.agent-sync/tasks/codex-project-context-20261016-b1d6cb74.md`。不自动加入已冻结056候选，不操作日常App或生产。

### PROJECT-CONTEXT-001 / 0.5.7真实Provider补验（2026-10-16）

用户明确指定纳入0.5.7。已有功能PR68/main c225acd8；本轮真实Kimi/k3源会话+同项目/异项目/关闭开关4请求200/complete、wire/持久化/回答三层与独立复核通过。全部合成数据，不操作日常App。普通文本摘录，代码块仍省略；Native/HTTP/Rust circuit及其他Runtime真实Provider不在通过范围。脱敏证据dev-docs/project-context-validation/provider-acceptance.md与provider-results.json；当前分支task为codex-project-context-provider-057-20261016-44d995ec.md。功能及材料queued给既定统一发布owner的0.5.7，冻结056不变，无并发发布或版本推进。

## MOXBOTS-HOST-INSTALL-82-20261016 — Host capability compatibility

User requested the new Linux Host reuse of current desktop main-Agent model and actual task execution. A real desktop/Host probe exposed a 13-method advertisement against the deployed v1 12-method limit. Task branch `codex/host-capabilities-compat-20261016` removes only the redundant host.snapshot advertisement while preserving its callable fallback and modern model/remote Session methods. Code/IPC regression, CI/main, controlled target-only Host package update, source-model/credential application and real task acceptance remain individually tracked in `.agent-sync/tasks/codex-host-capabilities-compat-20261016-cfb52e68.md`. No daily desktop restart/replacement or shared cloud release.

后续独立批次0.5.7（来源聊天最新用户要求，由该聊天报告）：`MOXBOTS-PROJECT-CONTEXT-001`源码已由PR68交main c225acd8，来源聊天报告真实Kimi Provider隔离补验通过（PR71，最终main及边界以其任务记录为准），签名原生与下一版本冻结仍待验；Token与预算接续在原任务记录；未纳入冻结056，不因排队信息获得新的部署授权。

## MOXBOTS-OUTPUT-002 — 2026-10-16

用户接受输出区六项优化并要求结果/进度优先、逐项具体时间与低干扰质量信息。独立分支codex/output-results-20261016；原transcript owner新增可选观测时间，UI移除默认工具/方法名，连续同文件聚合，明确操作累计，TODO当前项，质量无主观评分。代码、158项定向/172项消息输入回归/25项持久化及实际IAB与独立审阅分别记录 `dev-docs/output-results/acceptance.md`；CI/main待本任务最终核验。桌面发布queued给既定统一owner下一未冻结批次（0.5.7队列），不改冻结056、不并发操作日常App或服务器，未向其他聊天发送消息。任务 `.agent-sync/tasks/codex-output-results-20261016-6853845f.md`。

### 0.5.7 入网修复发布授权（2026-10-16）

用户在原修复聊天`01a1420f-245b-7f22-8a0f-4caaaf31b91b`对“发送给既定统一打包负责人、安排下一未冻结修复版、任务空闲后启用且不中断任务”的问题明确回复“授权发送并安排修复版”。Root已实际核读human message `01a142d4-9285-7c93-a968-52d61de5ab7d`。复用既有own updater及唯一发布owner；允许在确认空闲、Mac手动解锁、启用前兼容配置私有备份和回滚就绪后启用候选，真实入网逐项验收，不扩大云/Host/模型/External Calls权限。旧056服务器accepted记录见dev-docs/releases/moxbots-0.5.6.md，已发布字节不改。新sessionBound配置回退旧版必须恢复启用前兼容配置且保留当前业务数据与所有旧身份/凭据槽，禁止回滚旧业务库。

## MOXBOTS-OUTPUT-003 — 2026-10-16

用户接受展开区复审并要求实际展开验收。单条直接结果行，多条展开隐藏重复摘要/时间，无实际正文无箭头；执行耗时仅runtime报告，观测跨度/等待/未知分开。独立代码/截图审阅关闭Bash内部重复duration和JSON空结果两项P2，reviewer IAB不可用，实际点击由主Agent补全。用户追加的用户气泡已纳入：紧凑内边距、普通正文400字重、浮动复制/回退及窄栏预留，长文和失败态保留，主Agent实际页面和独立静态复核完成。范围/源码/合成UI/CI/main/原生发行分别见 `.agent-sync/tasks/codex-output-expanded-20261016-f48054da.md` 和 `dev-docs/output-expanded/acceptance.md`；桌面变更queued给唯一owner下一未冻结批次，不修改已冻结包或操作日常App，不向其它聊天发送消息。


## MOXBOTS-NEXT-PROMPT-003 — 正式下一步建议接口

用户要求修复正式下一步建议404、补正式路由回归、main交付并纳入下一未冻结桌面更新，在不打断任务的前提下验收正式客户端任务结束出现建议与Enter仅采纳为草稿。精确Session路径登记，组合测试先红后绿及189项通过；源码/CI/main/签名发行/安全启用/真实用户路径分别记录。任务 `.agent-sync/tasks/codex-next-prompt-route-003-20261016-e9554c98.md`，验收 `dev-docs/next-prompt-route-003-acceptance.md`。唯一发布owner仍为01a12bc2-907a-7702-b6dd-788225c5dfe4；本聊天不修改已冻结058源码或并发发布/重启。

## MOXBOTS-CONTEXT-RECOVERY-20261017

Builtin API operational compaction budget, native compact failure correction, inference-only bounded recovery, private archives and durable business-action replay ledger; Rust pauses/resumes original Goal instead of blind10 retries. Contract `specs/tech_docs/context_recovery.md`, acceptance `dev-docs/context-recovery-20261017/acceptance.md`, task `.agent-sync/tasks/codex-context-recovery-20261017-4895668c.md`. Real SDK manual/auto compact and Query restart counter=1 passed; source/CI/main and next unfrozen signed release tracked separately. Sole existing deployment owner remains unchanged; do not alter frozen058 or interrupt daily tasks.

## MOXBOTS-UPSTREAM-INTEGRATION-20261017

User authorized nine upstream repairs and consumed-settings-navigation state only; preserve existing MoXBots menu/sidebar and context recovery safeguards. Source integration includes protocol1.2 client with legacy owned relay negotiation, DSH6.2 contracts/paired release selector0.1.18, MCP/Goal/history/plugin/QR/build repairs. Combined test/main delivery tracked in `.agent-sync/tasks/codex-upstream-integration-20261017-ff567bc3.md` and `dev-docs/upstream-integration-20261017/acceptance.md`. No product version/changelog copy and no new cloud authority. Desktop release request queued to the existing sole owner for the next unfrozen batch; this source task does not install, publish, restart or message another chat.


## MOXBOTS-BACKEND-RECOVERY-20261017

User authorized owned relay terminal recovery first, then DSH child approval guidance, real-chain acceptance and main delivery. Existing metadata/relay owners enforce explicit same-account mount policy, fresh permits and bounded return recovery with immutable original admission epochs; clients preserve management and never replay original operations. Independent review repaired deadline, identity, management cleanup/late-control and busy-pair retry defects. Source31 return-state tests and6 actual AuthStore/DPoP/HTTP/WebSocket/mTLS socket tests pass. DSH source9f98b281 preserves two original lock authorities and105 accepted native packages; exact reproduction, full source871 unit passes/2 conditional skips and four-platform native/aggregate CI pass. Fixed resources atdsh-v0.1.18-moxbots.1 (recipe713958e1) are published, all nine asset digests verified and four archives anonymously reacquired. Exact CI and public-release-source Host17/2 each pass; formal selector source9f98 and24 resource tests are accepted. Current mainfa63b5d4 is normally merged. Final head CI, normal PR101/main integration and remote inclusion proof remain tracked in `.agent-sync/tasks/codex-backend-recovery-20261017-f4ab0756.md` and `dev-docs/backend-recovery-20261017/acceptance.md`; those premerge records defer subsequent merge/check state to PR101/canonical refs. Signed App/deployed-service acceptance remains separate; existing deployment ownership is preserved.

## MOXBOTS-BROWSER-001 — 2026-10-17

补齐可自动发现的产品浏览器Skill（系统同步v61），让对话工具菜单在未安装/全局未开启时也能定位浏览器资源卡片；明确资源、选择与实际连接，增加读失败重查与事件/查询竞态保护。CLI project browser选择与UI共用互斥规则，不修改全局peer。531项定向回归、实际合成IAB交互与真实Kimi k3→生产SessionEngine/SDK→Browser Host/Registry→锁定Chromium中文表单/截图及新Session合成Cookie恢复通过；Rust authority为测试替身、headless，不冒充原生生产验收。任务 `.agent-sync/tasks/codex-browser-001-20261017-ef4fc5b6.md`；证据 `dev-docs/browser-001/acceptance.md`。主干/CI与下一未冻结桌面发行分别追踪，唯一既定发布owner不变，不并发操作日常App或通知其它聊天。

## MOXBOTS-QUEUE-UI-001 — 2026-10-17

排队卡片独立编辑/取消、32px常驻操作区、真实撤回拒绝与网络错误反馈，保留原Runtime裁决。日志确认SDK not-cancelled/409被UI吞掉；不假删已接收项，不隐式停止任务。源码/125项定向/完整类型和MoXBots web构建已通过；实际IAB、CI/main与下一未冻结原生发布分别追踪。任务 `.agent-sync/tasks/codex-queued-message-controls-20261017-99ad1762.md`，验收 `dev-docs/queued-message-controls/acceptance.md`。发布仍由既定统一owner串行，不回写已发布0.5.9、不向其它聊天发送消息。


## GOAL-TODO-UI-20261018

目标模式与待办视觉/交互改造：中性目标状态条、状态与正文分层、全文展开、明确动作；紧凑待办摘要、当前项优先、完成项折叠与键盘/有界滚动。规范 `specs/tech_docs/goal_todo_interaction.md`，验收 `dev-docs/goal-todo-ui/acceptance.md`，任务 `.agent-sync/tasks/codex-goal-todo-ui-20261018-e7f5543d.md`。不改执行/持久化 owner。代码/main/合成组件和正式签名包/原生真实路径分别跟踪；发布仍交既定唯一 owner 下一未冻结版本，不进入已冻结0510，不并发发布或重启日常任务。图标补充 GOAL-ICON-20261018：草稿/执行态/任务中心目标标记统一共享 TargetIcon，任务 `.agent-sync/tasks/codex-goal-icon-20261018-a96f71e6.md`。用户已明确授权向既定统一发布会话发送整批改动和原生验收要求；发送回执与正式包验收分别记录。

## MOXBOTS-SESSION-WINDOWS-001 — 2026-10-17

按用户要求移除全局浏览器式TabBar，以当前会话页面/侧栏为导航；沿原Chat保存与后台继续owner做12页FIFO有界回收，保护输入/录音和活动页面。验收与发布请求见 `dev-docs/session-windows/acceptance.md`，分支任务 `.agent-sync/tasks/codex-session-windows-20261017-31ed5a11.md`。156项定向回归、实际renderer三尺寸与独立代码/截图审阅通过；CI/main以PR为准，原生包/真实会话仍待既定唯一发布owner下一未冻结候选，不操作日常App，不把main合并当已发布。


## MOXBOTS-MOBILE-002 — 2026-10-18

User approved RN/TS/Expo custom native builds plus a portable Rust controller SDK, existing AgentNet/Host/Session owners, first internal trial then store preparation. Full daily-use delivery and three real gates are tracked at `dev-docs/mobile-002/plan.md` and `.agent-sync/tasks/codex-mobile-002-20261018-75c72088.md`. No mock/local validation closes actual iOS/Android, push, Host execution or signing gates. Existing sole desktop updater deployment remains unchanged; new mobile/shared-service target deployments require scoped owner/target, backup and rollback. Current root owns mobile code/integration; no parallel production action.

Actual simulator native runtime follow-up: `dev-docs/mobile-002/ios-native-runtime.md`, task `.agent-sync/tasks/codex-mobile-ios-native-validation-20261018-cb18ae57.md`. Original Swift/C ABI/Release Rust, actual iOS Keychain and attachment ImageIO/multichunk acceptance passed; explicit original deployed-service start/cancel passed. Native UI, physical phones, full SSO/Host, push/ASR and signing remain open; no production deployment.

## MOXBOTS-AUTH-RENEWAL-20261018

用户明确要求修复浏览器已登录而客户端登录失败，并为101 Host增加安全续期/断线恢复，保留原设备、测试/main并部署101，不动日常Mac。登录工作分支codex/auth-renewal-20261018拥有owned_login.rs的时钟边界/严格session检查及server.rs start的保守270s旧版兼容；匿名真实HTTPS复现TTL300被1秒钟差判为301拒绝，测试事务均已取消。续期核心复用并行MOXBOTS-HOST-ONBOARD-001唯一owner，禁止双写AuthStore/account/transport/connector。先合登录修复，再由续期方吸收做组合CI及真实部署；沿当前唯一统一部署聊天串行，未授予开发worker生产权限，不以Git合入当安装/续期完成。任务记录.agent-sync/tasks/codex-auth-renewal-20261018-cffb1f19.md维护真实验收和未完成边界。

## MODEL-PICKER-CATALOG-20261018

备用模型搜索名称/ID/供应商，按供应商及密钥配置筛选，保留持久选择及原writer。OpenRouter改为账号过滤目录，OpenCode Go目录及三协议路由更新为当前官方路径；历史用户模型和自定义URL不删除、不覆盖。任务 `.agent-sync/tasks/codex-model-picker-catalog-20261018-834707ac.md`，验证 `dev-docs/model-picker-catalog-20261018/`。源码/回归/CI/main与统一桌面发行及真实供应商推理分别追踪；本任务不调用付费推理、不替换日常包，不接管登记的唯一发布owner。

## MOXBOTS-0510-WINDOWS-EIGEN-CACHE-20261018

The first private Windows 0.5.10 run (`39086981403`) stopped before NSIS when Node Fetch received HTTP 406 for the exact Eigen 5.0.1 URL in the frozen app resource lock. A normal-TLS full GET from the same GitLab URL matched the lock's 2,967,272-byte size and SHA-256 `e9c326dc8c05cd1e044c71f30f1b2e34a6161a3b6ecf445d56b53ff1669e3dec`; the exact bytes also passed the repository cache validator on macOS. Task branch `codex/moxbots-win-eigen-cache-0510-20261018` adds a fail-closed Windows workflow step to read the frozen lock, retrieve through standard `curl.exe` TLS, verify the pinned size/hash, and seed only the content-addressed cache. The app tag/source/resource lock remain unchanged. PR CI and a merged-main Windows build must pass before artifact use. Website upload still requires a separate least-privilege identity; do not reuse updater credentials. Details: `.agent-sync/tasks/codex-moxbots-win-eigen-cache-0510-20261018-a9d25de0.md`.

## CLOUD-NETWORK-RECOVERY-20261018

区分登录/凭据授权、连接超时/不可用与Ready网络内的设备离线；失联时设备缓存为状态未知。源分支codex/cloud-network-recovery-20261018，记录`.agent-sync/tasks/codex-cloud-network-recovery-20261018-cc874b4b.md`，验收`dev-docs/cloud-network-recovery/acceptance.md`。用户已授权协调既定桌面及云发布聊天；不接管其targets或中断活动任务。云/101只读确认原设备当前Ready，桌面原账号恢复和修复版原生验收仍单独开放。

## Deployment coordination — MOXBOTS-RELEASE-NOTES-001 (2026-10-18)

- **Deployment chat:** `01a12bc2-907a-7702-b6dd-788225c5dfe4`, current unified desktop release owner, solely this static history overlay.
- **Designation:** User explicitly requested “总结一下更新记录，放到下载页面可以链接查看”. This authorizes a cumulative public history page and a link in the existing download page. It does not authorize candidate installer promotion.
- **Targets and runbook:** Existing `https://140.143.183.232/download/` index link and embedded `#release-history` section plus its scoped `download.<hash>.css`. Reuse authenticated cloud SSH configuration for this exact static overlay; no updater signing identity is used for website access. Read fresh pointer/index, hold all four existing maintenance locks, back up, copy the live immutable tree, apply only two files, CAS-switch the symlink, verify public navigation, keep owned rollback. Details: `dev-docs/releases/website-release-history.md`.
- **Current release:** Accepted: initial unsupported standalone path404 was owned-rolled-back, then corrected PR135 source1bf1a489 passed nine applicable CI/normal mainbaa1a637. Existing-route `/download/#release-history` two-file overlay is live; normal browser raw hashes and actual desktop/320/390 navigation passed, with independent prepublication review; separate postpublication independent review unavailable due to account usage limit. Final receipts and limits are in the task/release record. Preserve the live 0.5.6 manual manifest, download scripts and packages; own updater 0.5.11 remains separate. Historical 0.5.10 installer upload-route limitation is not a claim that the candidate was released and remains outside this overlay.
- **Exclusions:** No binary upload/build, stable feed write, desktop operation, Nginx/TLS/auth/Host change, service restart or new permission. Other deployment lanes and their owners remain unchanged.


## MOXBOTS-UPDATER-RESUME-20261018 — next unfrozen desktop release

PR138 adds partial-file streaming, strict manifest/Range identity, bounded retry/resume, pinned-signature readiness and a persistent About download state/error/retry panel. Existing install confirmation and busy/unknown task admission are unchanged; downloads never stop or restart work. Root owns code/CI/main, real native signed A-to-B remains with existing desktop publisher `01a12bc2-907a-7702-b6dd-788225c5dfe4`. User explicitly authorized notification and scheduling; publisher acknowledged queueing, pending final main/CI receipt, without changing0.5.11 or touching daily tasks. Task `.agent-sync/tasks/codex-updater-resume-20261018-27c04aa3.md`; source/loopback/UI/native boundaries and bootstrap requirement for old0.5.9 are in `dev-docs/updater-resume/acceptance.md`. Final PR/remote refs define integration status; generated resources/cache are excluded.

## MOXBOTS-SESSION-AUDIT-20261018

用户要求梳理未归档会话、跟进已改完未入主干的成果。43个root快照与实际工作树/PR/main交叉核对；组合模型原任务定位到MoXBots自身SDK会话5025b9bb，39文件未提交且仍预览；不可再与已交付PR73主备切换混为一谈。PR133、Host聚合137（吸收129）、mobile136、updater-resume分别由原owner继续；已消息跟进，不冒称完成。PR104七文件blob已与main/v0.5.11相同，避免重复合并。置顶132/网络134已main，下一未冻结候选另验。逐会话证据/下一步见`dev-docs/delivery/session-audit-20261018.md`；本轮不归档聊天、不启动发布、不操作客户端。

## GOAL-PAUSE-001 — 2026-10-18

运行Goal条新增暂停，与既有继续/取消并列，复用原Rust暂停/停止/持久化owner。局部UI由主Agent自验，DOM86项与浏览器10组通过；CI/main、正式包/真实任务分别追踪。任务记录 `.agent-sync/tasks/codex-goal-pause-001-20261018-3d82257d.md`，验收 `dev-docs/goal-pause-001-acceptance.md`。保留唯一桌面发布owner和下一未冻结版本边界，不重启日常App、不改既有冻结包。

## Deployment coordination — MOXBOTS-0512-UPDATE-RECOVERY-20261018

- **Deployment chat:** 01a12bc2-907a-7702-b6dd-788225c5dfe4, existing unified desktop updater owner.
- **Designation:** User source01a14f82 authorized next-unfrozen release; human later explicitly transferred ordinary144 main integration to this publisher. Source150 conveyed its human-authorized next-unfrozen release handoff. Existing desktop signing scope retained.
- **Targets/runbook:** macOS arm64 own updater on existing140 only; final candidate-owned reviewed scripts. Preserve immutable0511. No backend/Host/mobile/Windows/website changes or daily interruption authority inferred.
- **Current release:** Preparing0.5.12, not frozen/built/published. Accepted138/142/145/144 main plus sidebar885 and accepted149 main51db53b0/150 main4dcb3d7c deliberately included before freeze. Exact141/08bc aggregated into143 by source agreement. BothToast suites,141 stop function/interrupt regression and144 Query guard modules preserved. Current combined source requires normalCI/main and actual remote containment before freeze.
- **Native ownership:** Daily0511 may be active; Root has no fresh maintenance window. Prepare concrete signed/notarized/stapled candidate first, then request only the missing window. No launch/quit/stop/replace or force/counter-reset workaround.
- **Acceptance:** Actual updater resume/stop/durable install, Goal pause/continue/cancel, original-session explicit continuation, background request/retry/Stop, sidebar pointer/zoom, error-banner resend/reopen without rewind, and recorded Task status. Controlled/local/SDK/native/external-model evidence stay separate.
- **Record:** dev-docs/releases/moxbots-0.5.12.md and current branch task; private evidence work/release-0512-20261018/owner/. Uncommitted team mode and unfinished mobile/Host remain outside release claims.

## SESSION-CACHE-002 — 2026-10-19

已缓存Chat保留挂载、草稿、阅读位置；冷历史经既有Global SessionStore reader先显示最后80条，后台原owner与REST/SSE恢复独占执行authority。连接失败保留Chat并在原Tab重试，不自动续接。PR #147；合同 `specs/tech_docs/session_architecture.md`，验收 `dev-docs/session-cache/acceptance.md`，接续 `.agent-sync/tasks/codex-session-cache-002-20261019-9b06b88b.md`。合并后236定向DOM/41unit、类型/lint、实际App合成传输和独立复核通过；main/CI以PR状态和Git回执为准。下一未冻结桌面候选queued给既定唯一发布owner；未安装或重启日常App、未向其它聊天发送消息。原生真实路径与源码/模拟UI分开验收。

## SUBAGENT-UI-001 — 聊天内子 Agent 查看

用户确认方案后实施：输入框上方持久入口、本轮/已加载历史、同会话右侧详情，复用transcript与现有状态投影；不新增执行owner或模型请求。记录 `.agent-sync/tasks/codex-subagent-ui-001-20261018-c8f40bcc.md`，验收 `dev-docs/subagent-ui/acceptance.md`。代码与52项回归/构建通过，独立代码复核完成；真实渲染因Work本地浏览器关闭尚待验，先保存草稿PR，不把构建替代UI验收。保持唯一桌面发布owner与下一未冻结候选边界，不换包或打断活动任务。
## Deployment coordination — MOXBOTS-0513-STABILITY-RELEASE-20261019

- **Deployment chat:** `01a12bc2-907a-7702-b6dd-788225c5dfe4`, sole desktop integration/updater publisher.
- **Designation:** Human directly requested0.5.13 incorporating prior desktop changes, superseding unpublished0512. Safe-idle backup/native/release/finalApplications installation is already authorized. Source151 also conveyed human authorization for real-model ordinarySession/Goal recovery/pause/Stop acceptance before publication.
- **Source/status:** Base main23efc877 includes143/all0512+151; exact146/147/148 integrated in the0513 task branch, version synchronized.414 related tests, type/lint/Web and actual synthetic IAB component/fullApp review passed; exactheadCI/main, new signature/notary/archive and native/real Provider/distribution/daily gates remain open. Old0512 source/candidates stay sealed and will not be published or relabelled.
- **Targets/runbook:** Existing macOSarm64 updater140 only; preserve0511immutable rollback. No Host/backend/mobile/Windows/website rollout. Active/due/unknown business blocks maintenance; normalquit only after fresh authoritativeidle/durable/full-window schedule and consistent backup. No counter/token hacks, forcekill, userChrome or system dialogs.
- **Record:** `dev-docs/releases/moxbots-0.5.13.md`, current task record and private `work/release-0513-20261019/owner/`. Source/artifact/native/real Provider/distribution/daily/finalmain remain distinct; this newer record supersedes historical0512 preparation and pending-window instructions.

## MOXBOTS-RUNTIME-REPAIR-20261019 — Goal busy 日志与上游 408 恢复

用户在诊断授权后明确要求"发现执行中需要修复的问题直接开新会话修复"。隔离 worktree 分支 `codex/runtime-repair-20261019`，基于 main `556b1633d`，提交 `32f6fd5e4`、`eb75e1430`，已 fast-forward 推送 main 并经 `git ls-remote` 核实。修复：busy 期 Goal 探测在 dispatch 前预检并聚合为 deferral 状态日志（不再逐次 raw/parsed INFO + perf error），真实失败分类/5s 唤醒/失败记账不变；bridge 30s headers timeout 改为按请求 getter，仅在 `fastRecoveryAuthorized()` 时武装，恢复被 fence 时回退 300s 通用边界，超时带 `upstream_headers_timeout` code。Node 93 项定向、tsc、ESLint、Rust 32+7 项通过。未创建 PR/未跑 CI；未安装、未重启日常客户端、未做真实 Provider/原生验收，安装须等待原薪资任务安全结束。验收 `dev-docs/runtime-repair-20261019/acceptance.md`，任务记录 `.agent-sync/tasks/codex-runtime-repair-20261019-2c377900.md`。

## MOXBOTS-MODEL-RECOVERY-001 — 日志驱动稳定性增强 2026-10-19

用户新增授权当前聊天持续只读跟进后台稳定性日志、发现可复现缺陷直接修复并增强偶发模型中断后的安全完成。本轮基于main90e1，复用原bridge_recovery做只读审阅，修复Chat/Responses缺失完成证据、半SSE帧错误分类及非流式Stop传播；21文件378项与隔离真实SDK/MCP counter=1通过。任务`.agent-sync/tasks/codex-model-recovery-hardening-20261019-cb711978.md`，验收`dev-docs/model-recovery/hardening-20261019.md`。正常PR/精确CI/main与唯一publisher新pin/签名/真实Provider/原生发布分别追踪，不混入冻结2ff、不停止活动任务或扩大权限。当前聊天heartbeat增量诊断并对照实际安装版本及最新源码，避免反复修复旧客户端同一日志；无新异常保持安静。

## CONVERGENCE-SCOPE — 2026-10-19

修复 read-loop 收敛检查的只读意图范围缺陷：整轮"不要修改代码"保持豁免，但"不要修改生产数据/凭据/配置/其他模块"等对象受限禁令不再压制执行意图。仅改 `progress-convergence.ts` 与其单测，原 13 项测试保留；独立复核后补充只读属性、限定语泛化对象、引号对象、具名禁令与裸"不修改"边界，48/48 通过，`builtin-session` 188/188、typecheck/ESLint 通过。未改 409/408、薪资源码或并发任务占用的 `agent-session.ts`。记录 `.agent-sync/tasks/codex-convergence-scope-20261019-e3f04522.md`，验收 `dev-docs/convergence-scope/acceptance.md`。真实模型联调与客户端安装未验证。


## MOXBOTS-MOBILE-CATALOG-001 — native login to usable Bot discovery (2026-10-19)

PR157 corrects the reproduced CATALOG_STALE failure caused by querying historical joined offline peers as if their Agent catalogs were Ready. Ready Bots remain usable; paired strict projection separates unavailable peers from pagination. Current directory errors clear stale selectable targets; confirmed logout/account changes clear old errors. Original Rust123/App57, strict Clippy/type/lint, Direct and Release512KiB C ABI original Host chains pass. Actual clean4e50 native original-cloud QA login/list/restart/logout/second restart pass with original101 unchanged; UI-only22737f5e Done/drag retest passes without another login/identity. Signed iPhone and test-key Android227 candidates are separately preserved. Host owner returned the main window after PR137→2c2efd06; normal sync/shared-input review and combined Rust125/strict Clippy pass, combined native/Release C ABI and exact-head CI/main follow remote refs. Task `.agent-sync/tasks/codex-mobile-catalog-20261019-5ce214f8.md` and dev-docs/mobile-002/catalog-20261019.md distinguish evidence and physical gates. Root owns mobile integration; cloud publication remains01a12b99-7b38-78b1-831f-9c60257d386a. Physical human-admin iPhone is unavailable/unaccepted; APNs preparation separately reached mainaaed91342 via PR155, no real provider enabled.

## MOXBOTS-MOBILE-APNS-001 — internal push environment scope (2026-10-19)

Continue MOXBOTS-MOBILE-002 with explicit sandbox/production/both selection in the existing optional APNs provider. Registration must match the actual key environment; omitted scope preserves legacy behavior. Existing endpoint authority, fixed HTTPS origins, generic payload and source proof remain. Root owns code/CI/main; actual publication stays with cloud owner01a12b99-7b38-78b1-831f-9c60257d386a after credentials/configuration and existing release gates resolve. No new key/project, production enablement or phone acceptance is implied. Task `.agent-sync/tasks/codex-mobile-apns-scope-20261019-988baa72.md`; existing runbook `services/agentnet/MOBILE-NOTIFICATIONS.md`.

## REMOTE-SESSION-1019 — remote history read diagnosis

Native 0.5.11 reproduction found pair conflict and invalid-response failures while both devices appeared online. A bounded renderer repair preserves validated management owner errors; 18 unit and 15 DOM tests passed. The original timeout, target version and dual-device recovery remain open. Task: `.agent-sync/tasks/codex-remote-session-1019-c5d4dad7.md`; evidence: `dev-docs/remote-session/timeout-1019.md`. No daily App replacement or cloud deployment by this task.

## MOXBOTS-ANDROID-FILE-VOICE-20261019 — real picker and isolated Host acceptance

Actual Android system file/image selection, complete encrypted Host upload with exact size/SHA, empty/oversize rejection, foreground recovery and draft preservation passed. Repairs retain fresh permission discovery and native foreground/background gates; explicit microphone interruption feedback passed without auto-record/send. Original101 identity/config/12 witnesses and runtime PIDs remain unchanged; isolated temporary grants/sessions/units were cleaned. Human explicitly deferred unavailable physical Chinese ASR and iPhone. Evidence and source/package distinctions: `dev-docs/mobile-002/android-file-voice-20261019.md`; task `codex-android-file-voice-20261019-6a6c159c.md`. Code/main delivery follows PR160 final exact-head CI/ordinary-merge receipt; no mobile public store release or original101/dailyMac upgrade belongs to this lane.


## MOXBOTS-IPHONE-ACCEPTANCE-20261019 — chat layout follow-up (2026-10-20)

Human confirmed the installed physical iPhone app works, then requested conversation text/Markdown/code/image layout repair and broader bug verification. Root01a12b99-7b38-78b1-831f-9c60257d386a remains sole internal phone build/install/acceptance owner after explicit human transfer; daily Mac, original101 and cloud excluded. Integration/release branch remains main; current internal mobile version0.1.0/build1 retained; future build identity assigned by the unified CI/release owner below, exact SHA and immutable archive digest required before installation. Structured native message rendering and reading-position policy follow task `.agent-sync/tasks/codex-mobile-chat-layout-20261020-130c5173.md`; feature branch prechecks are separate from main integration CI and phone release. Existing desktop/cloud publication owners and versions remain unchanged. Actual TARGET_RECEIPT_INVALID on a historical target is separately pending, not closed by Markdown QA.


## Unified project CI and deployment coordination — 2026-10-20

- Repository: https://github.com/heavenzhang/MoXBots.git. Existing canonical branch main; task worktrees remain supported.
- Sole project CI/release coordinator:01a12bc2-907a-7702-b6dd-788225c5dfe4 (MoxBots桌面端统一打包负责人). Human directly answered "由桌面统一打包负责人统筹" in implementation chat01a12b99-7b38-78b1-831f-9c60257d386a after requiring one project-level CI/deployment session. This supersedes historical per-chat independent CI/build publication for future actions.
- Development chats provide exact remote SHA, task records, local prechecks and dependencies. Coordinator reconciles existing automatic CI and organizes shared CI/results, integration according to existing Git strategy, release version/build allocation, frozen artifacts, serial target deployment and rollback. This designation does not expand target permissions or authorize daily Mac interruption.
- Version policy: preserve current component/version conventions; owner assigns next official version/candidate/build. Immutable tag/source/artifact/CI/included tasks/rollback remain linked; changed artifact needs a new identity. No feature-branch artifact is implicitly approved for production.
- Current intake: mobile conversation layout local tests pass; central CI/main/internal phone release pending. Current human phone account and installed build1 remain; earlier build2 suggestion is not an allocated published version. Source92658f3b1 is the first implementation checkpoint, superseded by subsequent handoff-record commits.
- Targets retain explicit task authorization: internal Xu iPhone repair is requested; daily Mac, original101 identity/config and cloud are excluded from this mobile batch. Existing desktop/cloud queues are reconciled by the coordinator, not concurrently changed by this chat. Active release SHA/build/locks and CI evidence must be verified by coordinator before any target change.

## Mobile batch priority — human update 2026-10-20

Human explicitly defers unresolved speech to avoid blocking core conversations. Current batch is mobile layout/Bot-switch fixes from codex/mobile-chat-layout-20261020 plus independently reviewed compatible core conversation changes; exclude speech branch ba578a5ea until a later batch. Keep actual voice FAIL visible but not a gate for current main/build/install. Priority acceptance: session open/history, Markdown/code/table/image presentation, history scroll stability, target isolation, draft preservation and existing send/receipt authority. Task MOXBOTS-IOS-SPEECH-FAILURE-20261020 remains deferred with two real failures preserved. Per-unit owner for this current mobile batch remains human-selected01a12bc2; implementation/phone evidence01a12b99. No daily Mac/101 changes or parallel shared CI/build/install.



## GOAL-STALL-001 — Goal watchdog 结算与可见恢复原因

沿原 builtin/Goal lifecycle 修复 timeout abort 丢失 observer/authority 的问题；可见输入 turn_conflict 显式反馈，暂停原因显示在原状态栏。任务 `.agent-sync/tasks/codex-goal-stall-20261020-3d1bab4d.md`，验收 `dev-docs/goal-stall/acceptance.md`。代码、合成回归、实际组件与签名原生/真实模型分开；唯一 CI/桌面发布会话仍为01a12bc2-907a-7702-b6dd-788225c5dfe4，依赖PR168的遗留进程治理后做当前真实任务恢复。


## Deployment unit coordination —0.5.14 build2 (2026-10-20)

Latest direct human AGENTS scopes unique CI/release ownership per deployable unit, retaining task branches and existing component versions. Desktop/updater macOSarm64 owner01a12bc2-907a-7702-b6dd-788225c5dfe4 owns this batch, under explicit human current-changes→0.5.14 online-update request. Internal mobile layout was also explicitly handed to this coordinator, but remains a separate0.1.0/internal build and physical-phone window; no mobile installation in this desktop batch. Existing owned-cloud deployment remains with01a12b99-7b38-78b1-831f-9c60257d386a and its prior target authority; no Host/cloud/Windows or website-design rollout is inferred. Cross-unit Test/Owned checks for this source union are coordinated once by desktop owner; workflow per-ref concurrency is not a global deployment lock.

Desktop source batch:163/login and165/history already main;164/statusbar,166/watcher,168/final4f47eda6,REMOTE-UI d00f5ee3,STREAM502 ebf0ea95,GOAL-STALL8169f3b8 and REMOTE-SESSION-1020-BUSY285659c7 explicitly selected before integration CI/freeze. Do not conflate synthetic/native/actual Provider/remote business acceptance. Old local014 artifact is retained; new0.5.14/build2 uses CFBundleVersion514.2 and a distinct immutable tag/artifact. Final main exact SHA, CI and source containment must pass before one signed build. Promotion reuses verified bytes; later commits never silently enter a frozen candidate. Online stable currently013, retained with immutable011 rollback.

Release record `dev-docs/releases/moxbots-0.5.14-build2.md`; task record `.agent-sync/tasks/codex-release-0514-build2-20261020-24823a0a.md`. Private release evidence lives outside Git. Current phase:integration checks passed; latest-main sync/final exact CI/main/native/signature/distribution gates pending. Only owned serial publication controls can admit target changes.
## REMOTE-SESSION-1020-BUSY — scoped channel contention

Latest human instructions designate existing desktop publisher01a12bc2-907a-7702-b6dd-788225c5dfe4 as sole desktop-unit CI/deployment coordinator for this lane. Repository https://github.com/heavenzhang/MoXBots.git, existing main/task-branch strategy retained; owner allocates next unified version and frozen main candidate, macOSarm64 target, existing signed0514 rollback/release history preserved. This developer owns local checks/commits/handoff only, with no shared CI dispatch/rerun/cancel or build/install. Native Pairs/controller source is reused by the headless connector; it retains the same wire/API, supports independent rollback and has no Host/cloud deployment request in this desktop intake. Cross-unit integration checks are coordinated once by the desktop CI owner; any headless publication stays with that deployment unit’s existing owner. Cloud target remains under its existing separate owner.

Task `.agent-sync/tasks/codex-remote-channel-busy-1020-f881d00e.md` fixes cross-device pending-offer busy and distinguishes channel conflict from execution status. Same-peer profile isolation and unknown admission evidence remain. Source/local/sharedCI/installed/real-read states are separate; latest human original window still fails HOST_MANAGEMENT_TARGET_BUSY, so remote acceptance remains open. Login PR163 is in base main8e4c25928 but is not in installed0514. No new protocol mode or automatic channel close is included.

Mobile queue steering: human explicitly deferred speech ba578a5e; core layout/Bot-switch current source c24c37f8 (runtime unchanged from1d67241b) retains67policy checks and current iOS Hermes export. Separate internal mobile batch, no desktop delay or speech success claim.

## Deployment unit coordination — MOXBOTS-0515-RELEASE-20261020

Latest direct human request advances the desktop/macOSarm64/updater batch to0.5.15after current improvements complete and requires ONLINE stable to latest plus localinstallation. Same existing owner01a12bc2-907a-7702-b6dd-788225c5dfe4. Retain original014local and013/011online immutable rollback; unpublished014build2is superseded, its already-running compiler collected without another stage/sign/notary/publication. Its inactive cache/unsigned validatedresources may be cloned once into a new015build target; normalpriority/jobs4, fixedReaderunchanged.

Selectedsource: reviewedPR169desktopunion/a2dd plus STREAM-RESUME e9ba90839, integratednormally with typed-terminal/continuation safety retained. Current combined404tests/tsc/classification/scopedlint/version and actualSDK synthetic ordinary/Goal/Stop pass. ExistingPR169owned branch is fast-forwarded to this015union and retitled to avoid an extra integrationPR/mainCIround; final exact automaticCI/main/source/tree proof still required. Sourcefreezes after selected completeinputs; later changes defer. No new CI/deploymentowner.

Release record dev-docs/releases/moxbots-0.5.15.md; branch codex/release-0515-20261020 and task .agent-sync/tasks/codex-release-0515-20261020-dd8c4bbe.md. Currentphase preparing; version015/build515.1/tagv0.5.15planned, artifact notyet built. Signature/notary/native/productiongates remainopen. ONLINEpublication through existing140lock/immutableupload/normalTLSfullGET/hash/atomicpromote/postcheck is required, not an optionalpostscript. Client013mustdetectanddownload015. Mobile/cloud/Host/Windowsunits keep their existing owners and componentversions; no publication there inferred.

## MOXBOTS-0515 build515.2 native-startup repair

Same desktop/updater owner01a12bc2-907a-7702-b6dd-788225c5dfe4 and explicit015ONLINE+local delivery. First signed015build515.1 passed sourceCI/main/Apple but failed actual native startup (duplicate React Hook dispatcher), so it is sealed/unpublished; online013 and installed014 unchanged. Branchcodex/release-0515-renderer-20261020 fixes React/react-dom singleton resolution and adds real production-built linked-dependency Hook regression. Newbundle515.2 avoids same-build artifact reuse. Laterunselectedsource remains deferred. ExactCI/main/newartifact/native/stable015/local gates still required; no independent component deployment.

## Mobile core conversation checkpoint — 2026-10-21

MOXBOTS-IPHONE-ACCEPTANCE-20261019 continues in existing branch/task. Added matching-snapshot send guard/read-only retry, earlier-message pagination with stable reading view and live authority separation, recovered-read notice cleanup, folded read-only tool results. Source integrated current main4206eb2ef;73policy/type/lint plus core90-message and rich-text responsive browser checks PASS. Physical original TARGET_RECEIPT_INVALID remains separately unclosed; no daily Mac workaround. Registered mobile CI/build/version/install owner01a12bc2 was asked to confirm batch/delegate execution; no parallel formalCI/build/install. Root01a12b99 owns implementation/physical evidence; current index/renderer/history QA files remain its exclusive writing scope until handoff. Independent visual work uses isolated pure components; no device or shared writer takeover.

Full MOBILE-002 backlog remains separately open: login/consent/recovery; original Session approvals/late-generation rejection; actual system picker/Host complete bytes and result return; speech after current core batch per direct human deferral; real APNs/FCM background and cold-start delivery. Original chat's private handoff is retained outside Git, not authorization to alter original101/dailyMac/account or new credentials/providers. Local code, synthetic tests, remote main, immutable candidate and actual phone acceptance are distinct gates.


## Mobile Codex conversation presentation — 2026-10-21

Stable task MOXBOTS-MOBILE-PARITY-20261020, isolated branch codex/mobile-prototype-parity-20261020. Human latest direction selects Codex mobile conversation display as baseline, with approved V6 prototype for functional reference. Changes are actual React Native presentation: compact list/search/date groups, full-identity-bound info/continue, one toolbar/resting composer, on-demand popover, direct artifact entry, consistent neutral Markdown/tool/account theme. No fake management metadata or prototype transport replaces real owners.

Existing owner01a12b99 explicitly authorized combining exact8128596dbdebb031dd4a6c057107ff2b6ee80d9b into this isolated developer branch after saving UI stageb8b9a2eb27a5aebdebabddfe34d2d31939c110c4. Original snapshot/history/receipt/foreground/draft/approval/safe-media guards are preserved; speechba578 excluded. Source developer may normal commit/push after local acceptance and workflow trigger verification. Main/shared CI/formal native builds/version/install stay with registered coordinator01a12bc2-907a-7702-b6dd-788225c5dfe4; owner01a12b99 independently reviews frozen SHA and retains repair/physical evidence. This record grants no parallel production action or takeover.

Local Web QA is explicitly synthetic and cannot close MOBILE-002 real phone login/approval/files/voice/push. Task record `.agent-sync/tasks/codex-mobile-prototype-parity-20261020-6969939a.md`, design/combination/acceptance details `dev-docs/mobile-002/codex-conversation-parity-20261020.md`. Mainline/source intake, candidate/version, phone installation and real daily acceptance remain separate open states.

## Mobile unit ownership transfer — 2026-10-21 (current)

- Human explicitly answered “是，手机端交给 Bots手机端开发2” in chat01a1488b-c673-79f1-abd5-018938f2ee92 to transfer the independent mobile unit's CI, signing/install and physical acceptance. Receiving owner01a12b99 verified the actual reply via read_thread (question call_d8a3bad06a134a95b799db81d583772a). This supersedes historical coordinator entries for mobile only, not a transfer inferred from silence.
- Unit: mobile iOS/Android app, SDK/native modules and internal artifacts. Sole CI/build/version/sign/install/verify/rollback chat01a12b99-7b38-78b1-831f-9c60257d386a. Desktop/updater stays01a12bc2-907a-7702-b6dd-788225c5dfe4; cloud/Host permissions retain prior boundaries. Source chat01a1488b holds no device/release writes. No new provider/account/private key/public port is authorized by this transfer.
- Activity audit: no mobile xcodebuild/native build/install process, no PR or run for frozen presentation branch. Both other chats notified to stop new mobile target actions and report existing jobs. Cross-unit Test executes once through this mobile PR; do not cancel desktop jobs or use their results as mobile evidence.
- Current core batch MOXBOTS-IPHONE-ACCEPTANCE-20261019: accepted combination2b976bd288ea07e8ae118fe21c122a7aa22271c2, runtimefreezeec78f6d68, contains core8128596 and presentationb8b9a2e. Independent77policy/type/lint/history5/layout5/navigation6 and QA-disabled Hermes PASS; native closure3f13255e Swift device/simulator and Rust iOS preflight PASS. Re-fetch main before normal protected merge and prove remote inclusion/tree, no force/admin. Later product changes enter a reviewed next batch.
- Allocate internal iOS0.1.0/build2, tag moxbots-mobile-internal-v0.1.0-build2 (absent at allocation). Preserve signed build1/source18e13ce8 and account/data as rollback baseline; no uninstall/reset. Build verified integrated main in isolated non-WPS checkout, fresh affected framework and QA-disabled offline JS, existing developer team/profile/key. Record source/tag/archive SHA, signature/entitlements, installed version and real paths.
- Core conversation opens/history/layout/draft/scope precede deferred speech and APNs/FCM. Actual TARGET_RECEIPT_INVALID remains open until native/Host evidence resolves it. Full MOBILE-002 backlog retained; synthetic/browser gates do not close real login/approval/files/speech/provider delivery. No daily Mac or original101 identity/config changes in this mobile batch.
- State: preparing source PR/CI; main/new immutable artifact/install/real acceptance pending. Release/checklist dev-docs/mobile-002/internal-build2-20261021.md. Existing root branch/task carries intake; mobile formal actions now belong solely to receiving owner.

### Mobile internal acceptance scheduling refinement

Same human-designated mobile owner01a12b99 and build2. User explicitly authorized internal iPhone installation/real bug acceptance. An exact reviewed feature candidate may be signed and installed only as an unaccepted internal test artifact while hosted CI/main are pending, retaining source/tag/digests and build1/data rollback. This replaces the owner-imposed main-before-any-test-build scheduling restriction; it does not replace main/CI/final acceptance. First build2 sourceabc822ce (current main4206 included); CI-pool/document-only subsequent commits may promote the same tested bytes only after exact mobile/native build-input equality to actual remote main is proved. Product changes require the next build identity and reacceptance. No daily Mac, original101 or provider configuration changes.

## Mobile core physical acceptance — 2026-10-21

Sole mobile owner01a12b99 completed internal build2/sourceabc822ce in-place install and qualified controlled physical login/history/presentation/draft checks; all temporary Host grants/sessions/units cleaned, original101 identity/config and daily Mac untouched. Evidence and remaining business gates: `dev-docs/mobile-002/iphone-core-acceptance-20261021.md`. Final main remains pending exact-head CI. Repeated hosted ARM no-runner cancellations are not PASS; explicit Intel15 Mac-only supplement retains full commands and actual iOS native SDK checks, regular PR/push/default remains full ARM. This changes CI environment coverage only, not desktop ownership or formal release scope.


## REMOTE-UI-20261020 — common conversation rendering follow-up

User explicitly requires remote and ordinary conversation architecture/presentation parity. Follow-up baseline main4206eb2ef, previous remote-tool projection already integrated. Common MessageList/Message/ProcessRow/ToolUse, content trust policy, shared composer and shared scroll model/controller replace the independent remote renderer. Prepend anchors now survive asynchronous row measurements in both ordinary and remote consumers; fresh-only pagination and session/generation geometry isolation remain.

Desktop renderer/Sidecar is the existing inseparable macOS desktop/updater deployment unit; CI/build/version/publication/rollback owner remains `01a12bc2-907a-7702-b6dd-788225c5dfe4`. The developer branch owns local code/regressions and exact-SHA intake only. No shared CI/official build/deployment was dispatched here. This is a subsequent unfrozen source batch, excluded from already-frozen015 artifacts. Owner assigns the next semantic version/candidate under existing main/branch flow, macOSarm64 targets and immutable rollback rules; no Host/cloud/mobile/Windows release is included. Local339 distinct tests across26 files, full typecheck, changed-file lint and24 actual-component browser cases are tracked separately from exact-head CI/main, signed client and authenticated dual-device acceptance. Evidence and next gates: `dev-docs/remote-session/ui-unification-20261020.md`; branch task record retains precise remote head.

## MOXBOTS-0515 build515.3 next unfrozen desktop batch

Same desktop/macOSarm64/updater owner01a12bc2-907a-7702-b6dd-788225c5dfe4, repository https://github.com/heavenzhang/MoXBots.git, normal protectedmain/PR strategy. Human verified instruction in remote UI chat requires main integration, next release and post-release real remote-session acceptance. Root integrates exactremoteUIfunctional8db1a86bc/deliveryfe9fda914 into branchcodex/release-0515-5153-20261020 with Theme static guard owner repair and distinctbundle515.3. PR171failedsource/rawretained; obsolete remainder stopped before replacement exact-sourceCI. Frozen515.2sealed unchanged; online014/source200/main18e/tagv0.5.14andoriginal013/011rollback retained. Current phase preparing, source/main/CI/build/native/publication/install are separate gates. Auto-route/team-mode/remove-restore WIP excluded; independentmobile/Host/cloud/Windows units unchanged. Release contract dev-docs/releases/moxbots-0.5.15.md and task .agent-sync/tasks/codex-release-0515-5153-20261020-00cf0770.md.


## UPDATE-20261020-01 intake into reserved515.3

Existing sole desktop/updater owner integrates committed d63d9fee update admission with remoteUI8db/fe9 in PR172 before first515.3compile. Shared textcomposer/IME/ref and original remote draft/operation/checkpoint owners retained. Exact133CI failure preserved and fixed at the Stop fixture schedule boundary; a separate deterministic early-timer test justifies same-permit re-arm until durable due time. Local127focused tests/type/scopedlint pass, new exact-source CI/main/frozenartifact/native/dual-device/publication/install remain separate. Reserved515.3has no binary; prepared133revision remains sealed. See dev-docs/releases/moxbots-0.5.15.md. Online014immutable and013/011rollback retained; other deployment units and unfinished features excluded.


## Urgent stability build515.4

Verifiedhuman recovery incident request routes exactlocal55aa5781e/8a65040e through sole desktop/updater owner01a12bc2. Branchcodex/release-0515-5154-20261020 beginsactualmain4206, retains normallymerged e341remoteUI/updateadmission and directly integrates bothcommittedcriticalfixes without modifying developer worktree/ref. Version0.5.15/build515.4, oldsigned515.3sealed/unpublished, online014rollback plus013/011 intact. Scope: freshbusiness recoverybudget, progresswatchdog, compactStop, epoch/guard revocation and bounded durable Stop acknowledgment. Current phase combinedverification; exactCI/main/frozenartifact/native/actualProvider/realdual-device/publication/local are separate. CurrentHRM andsalaryCI stillrequirefreshnormalmaintenance admission; neverforce/replay. Unfinishedfeatures andotherdeploymentunits excluded. Task .agent-sync/tasks/codex-release-0515-5154-20261020-2fdce2d8.md.


## Desktop release batch — MOXBOTS-0515 build515.7 (2026-10-21)

- Deployment unit/soleCI-build-version-publisher remains macOSarm64 desktop/updater, owner01a12bc2-907a-7702-b6dd-788225c5dfe4. Human0.5.15online/local request and normal maintenance approval remain effective. Independentmobile/Host/cloud/Windows deployment is outside this batch.
- Current installed client is verified0.5.15/build515.6/source1edf; online stable is0.5.14. Newimmutable build515.7 is reserved; source/tree/CI/artifact/native/distribution receipts are pinned under WPSrelease0515owner after this source commit, avoiding a self-referential SHA here.
- Accepted inputs: preservedPR173 Cuse/body-admission repair1edf; LoginReturn1cff; Bridge body idle/payload-semantic follow-upc4b274ea; independently accepted watchdog metadatac9cb20b5.517scoped Node24 cases/fulltsc/scopedlint passed. Original62da empty-delta P1 was reproduced5red and fixed; no unknown-action canRetry bypass or nativehistory reset.
- Later batch: source-accepted reconciliationMVP5a+b759 has nativeUI/capability/restart acceptance remaining and actual4historicalcases stillblocked; defer its larger scope to keep urgent delivery bounded. CHATINFO and independentmobile changes do not enter this frozen desktop batch silently.
- Current gates: prior exact1edfCI39462592025+oneMacjob retry failed to allocate hostedARMrunner (other8PASS/1skip). New exact combinedhead must run its own normalautomaticCI; no waived check, blindthirdretry or forcedmain. Static build/local-first preparation may proceed within existing approval, but main/online remain gated separately. No015tag/publication yet.
- Once source frozen, one normalnice0/jobs4 build in a new persistent root/inactivecacheclone; fixedReaderunchanged, one originalApple submission/log exactZIP proof, strict/staple/Gatekeeper/TAR/signature. Focused signednative long-run/Stop/login originalaccount acceptance remains required, not inherited from supplier/CI.
- Recovery coordinator01a159a6-a73e-7a01-8715-061657e10af2 owns currentnativeUI/originalactive tasks; checkpoint/preciseowner/durablegeneration/schedule/consistentbackup/normalquit handback before replacement. Preserve5156local and014/013/011immutable rollback. No forcekill/taskreplay/credentialrollback. Existing TLS/ownedpublication transaction and exactfullGET/signature review apply before stablepromotion.

### Desktop urgent5158: exhausted stream-body budget
5157/source915ff89a sealed and excluded from install/publication after real LinuxCI failure. Root fix51394b4d preserves retry/ledger/Stop/progress/suspension boundaries and adds two deterministic red/green subinterval cases.313Bridge unit+127integration/type/scopedlintPASS onNode24. Existing source inputs remain unchanged; no deferredMVP/mobile/warmGoal-route changes. Same unique desktop owner, new immutablebuild515.8, existingPR173/newexactCI required. LocalApplications5156 remains verified.


### Mobile concurrent main integration
PR173 advanced main to a487b5d353780fef4b624b42dd01d7d0ad4958d3 during mobile final CI. Same sole mobile owner integrates latest main, preserves desktop records and ARM environment check alongside the explicit Intel-only supplement. No mobile/native/root dependency product input changed; installed internal build2 retained. New combined-head ordinary CI/main/immutable-tag proof remain required; old dac ARM success and its separate Intel run are historical, not the new tree result. No daily Mac/101 action or deferred002 scope expansion.

## MOXBOTS-GOAL-CONFIG-RESTORE-20261021 — next unfrozen desktop intake

Fix warm builtin Goal continuation to adopt the owning Session's current saved provider/model/reasoning at the original admission boundary. Preserve Goal/native identity, permission, compatibility, background work and Stop/claim fences; no provider auto-selection or old input replay. Task record `.agent-sync/tasks/codex-goal-config-restore-20261021-366d1666.md` distinguishes local regression evidence from actual native acceptance. Base is fetched remote main4206eb2ef; separately verify compatibility with frozen515.7/source915ff89a without editing that checkout. Existing sole desktop/updater CI/build/version/install/publish owner remains01a12bc2-907a-7702-b6dd-788225c5dfe4; this lane delivers local commits only for its next batch.515.7signing/install is independent and unchanged. Reconcile commits5a928679/b759372e are separate intake, not part of this task diff.


## Desktop stability0.5.16 — 2026-10-21

Same sole owner01a12bc2-907a-7702-b6dd-788225c5dfe4, semantic0.5.16/build516.1 after immutable015online/local completed. Combined settlement backoff/native memory blocking isolation/tool-admission evidence/warmGoal config restore; source and independent365Node/31Rust/type/lintPASS, native and original-business acceptance remainopen. Task `.agent-sync/tasks/codex-post0515-stability-20261021-8526d64d.md`. Existing5158tag/artifact are unchanged; no historical unknown clearing/forced exit. NewexactCI/main/artifact/native and safe local replacement/onlinepromotion are separately required. Mobile/Host/cloud/Windows/website not deployed. NativeUI remains coordinator01a159a6-owned; lockedMac/uncertaindispatch checkpoint must be resolved through normal owner before app replacement.


## Desktop516.2 parallel tool repair — 2026-10-21

Same sole desktop/macOS/updater owner01a12bc2-907a-7702-b6dd-788225c5dfe4.516.1 sealed for confirmed parallel argument/block lifecycle defect; installed/online015 unchanged. Full seven-commit95d2318 source onactualmain32821 is reviewed for complete ordered tool blocks and strictterminal/error/EOF plus hidden realprogress/query/attempt/cancel fences. Newbuild516.2 under unpublisheduntagged0.5.16, no original artifactoverwrite. Task `.agent-sync/tasks/codex-release-0516-5162-20261021-c3f33106.md`. Primary523Node andrealSDKconsumer synthetic evidence accepted; exactCI/newartifact/nativeparallelRead/Goal/Stop/ownercheckpoint/unlock and production remain required. Originalsixbusiness notcomplete; MVP/a0WIP excluded. NativeUI stays coordinator-owned; no App action without freshhandback.


## Desktop516.3 settled stream continuation — 2026-10-21

Same sole desktop/macOS/updater owner01a12bc2-907a-7702-b6dd-788225c5dfe4. Normally integrates complete7f85 settled-stream repair on actualmaine7, preserving parallelTool95. Only exact originalQuery/root and authoritative settledbackground/request/tool evidence+cleanledger+zero interruptedtoolspill permit sameowner/sameid/earliestdeadline continuation; Stop/CAS/route andlive-onlyv2/cold/oldreader refusal preserved. Primary791Node+9localHTTPcause probes/TS/lint andindependent overlapping458+219 review accepted, notnativeproof. Newimmutablebuild516.3 underunpublisheduntagged0.5.16;5162 originals retained uninstalled/unpublished. Task `.agent-sync/tasks/codex-release-0516-5163-20261021-1218d09a.md`. ExistingUIunlock/checkpoint/backup/normalexit handback andgenuine native checks remain required; currentlocal/online015/5158. NoMVP/a0WIP/otherdeploymentunit release orhistoricalunknownclear.


### 516.3 verification-only CI fixture followup
Originalproducerc20/516.3 signednotarizedbytes retained unchanged afterCI39521879223 failed4oldmanualfixture cases. Complete648 followup changes only testfixture/task docs: realhandler/registry+ephemeralHTTP validSSE and4negative cases; original43expectstartlines/8cases retained. Primary fullintegration1397PASS/32skip/0fail andTS/lint/peer12PASS are local synthetic. Root retains build516.3 without recompilation because everyproduction source/config/lock/buildinput file is unchanged; originalembeddedbuildidentity remainsc20, newverificationSHA/CI/main recorded separately. OldCI failure stays immutable; no claim artifactwasbuiltfromnewtestcommit. ExistingPR178 gets one exactnewheadCI, strictnormalmain thenfreshnative/maintenance/local/online gates. No newreleaseversion/tag orotherunitdeployment.


## Mobile original business Bot acceptance — 2026-10-21

Existing sole mobile owner01a12b99 continues MOXBOTS-IPHONE-ACCEPTANCE-20261019 in codex/mobile-business-e2e-20261021 from main29cb959d. The human selected the current Mac's existing Bot in source chat01a1488b; this lane's latest direct request prioritizes real iPhone create/continue send/receive and system-picker file upload, keeps speech for later, preserves original101 identity/config and excludes daily Mac client changes. Existing desktop owner01a12bc2 supplies read-only identity/readiness/activity and retains all desktop operations. Do not replace this target with101's unrelated QA account or reset/migrate identities. Prior PR174/build2 controlled history/presentation acceptance is retained but does not close these business gates. Private evidence stays in pointer output/mobile-business-e2e-20261021; source task .agent-sync/tasks/codex-mobile-business-e2e-20261021-b8d5ee2f.md. Full002 approval/speech/notification/other unfinished paths remain separately open.


## Original Mac mobile production route repair — 2026-10-21

Existing mobile owner01a12b99 reproduced actual CodexLocal catalog TARGET_RECEIPT_INVALID while original directory/list/history worked. Three missing production Sidecar exact-route registrations blocked the inner mobile/asset handlers before credential admission. Minimal source repair and RED/GREEN185 relevant local cases plus type/lint/classification are recorded in dev-docs/mobile-002/original-mac-business-acceptance-20261021.md and the existing business-e2e task. This changes desktop server routing;01a12bc2 retains sole shared CI/build/version/deploy/rollback intake. Current516.4 candidate remains immutable and excludes this later fix. Internal phone build2 inputs remain unchanged; real new/continued send, system-picker upload and complete Host digest remain OPEN until next desktop artifact and safe physical reacceptance. Original101/dailyMac settings are preserved; no task model/upload was admitted; speech remains deferred in this lane.

## Deployment coordination — MOXBOTS-0516-5165 LOGIN PRIORITY

Human instruction in login owner chat prioritizes actual Air login and restart persistence. Root01a12bc2-907a-7702-b6dd-788225c5dfe4 remains sole desktop and combinedCI/main owner; cloud01a12b99-7b38-78b1-831f-9c60257d386a publishes additive service support first. Newunpublished0.5.16/build516.5 deliberately includes loginbe0679dc plus mobile exactroute4014 onmain9c01. Frozen516.4 remains preserved; no tag, artifact or public manifest is overwritten. Existing automatic Test and Owned AgentNet PR workflows execute once at the combined pinned head; no developer manual dispatch. Local5158/online015 remain until actual acceptance and owned rollout. Native business maintenance requires fresh owner/schedule/drafts/backup and normalexit. Air accepts the actual newdownload via original human, then real sign-in and normalexit/restart persistence; Macmini and tests cannot substitute. Later source changes belong to another unfrozen batch.


## Deployment coordination — MOXBOTS-0516-5166 FIFO RECOVERY
Same sole desktop/macOSarm64/updater owner01a12bc2-907a-7702-b6dd-788225c5dfe4 explicitly selects fullactualmainc237 auto-routing batch plus complete1b16 nativeFIFO ownership repair after exactsource review. Newimmutablebuild516.6, semantic0.5.16, includesPR180 login+mobile3routes ancestry. Onlyplan insertion conflict resolved byretaining both entries; no uncommittedteam/background WIP copied. Experimental4e4bc2 tool-only repair excluded. Frozen5165 Aircanary9ae1/public releasepath remains unchanged; newartifact namespace mustbe distinct, stable015/rollback intact. CombinedCI/main/build/native/Applications/stable andoriginalAir/mobiledevice acceptance tracked separately. Currentbusinessrunning cannotuseoldpaused/backup/window. Task .agent-sync/tasks/codex-release-0516-5166-20261021-21e47a60.md.


## MOXBOTS-0516-CREDENTIAL-ROUTE-CI-20261021 — child failure evidence

Existing sole desktop/updater owner01a12bc2 investigates distinct mainpush39570124070 Linux concurrency failure after PR181. Test-only child--nocapture preserves20rounds/4processes/15sdeadline/assertions, exposing actual panic discarded by libtest capture into nullstdout. Exact RootRust1.92 output probe confirms diagnostic behavior, not actual route rootcause. Frozen516.6 producer97/App/TAR71bcd remain immutable; no rebuild or false native acceptance. Task `.agent-sync/tasks/codex-credential-route-ci-diagnostic-20261021-830fd6cc.md`; subsequent rootcause repair and exactCI/main/native gates separate.


## Desktop516.7 legacy restore entry removal — 2026-10-22
Same sole desktop/macOSarm64/updater owner01a12bc2-907a-7702-b6dd-788225c5dfe4 continues MOXBOTS-0516-RELEASE-20261021. Explicit human request removes obsolete titlebar restore UI while retaining history and exact-scope update drafts. New immutablebuild516.7 follows base85981 with renderer-only startup/draft protection changes; no additional feature intake. Existing516.6 execution/QA evidence is retained for unchanged server paths, with only affected startup/history/draft/nativeinstallation checks added. NormalCI/main/newartifact/Apple/TLSstable/localidentity and rollback remain required. Task .agent-sync/tasks/codex-release-0516-5167-20261022-12f12a58.md.

## Desktop5168 current batch
Owner01a12bc2 integrates human-authorized old entry removal plus exactblank/scroll repairc5eee9fe/5caeec2. Newbuild5168 preserves5167 originals. Productsettings/orchestration/notification requests remain nextbatch. Code/CI/static/native/local/stable separate; current Applications/stable5158. See taskcodex-release-0516-5168-20261022-00262d3b.md.


## Mobile TestFlight and selected wireless phone — 2026-10-22

MOXBOTS-MOBILE-TESTFLIGHT-20261022 remains within the existing sole mobile CI/build/sign/distribution/install/acceptance owner01a12b99-7b38-78b1-831f-9c60257d386a. Human in source chat01a1488b explicitly chose TestFlight via the existing Apple account, a usable invite for their second iPhone, then selected Kevin and requested fresh install with the new icon after personally deleting the old App. This transfers no desktop/updater or101 authority; source chat remains read-only preparation/review. Original mobile0.1.0/build2 retained unchanged; fresh development internal build3 is allocated for the explicitly selected Kevin, with the separate TestFlight upload build pending actual ASC inventory. Current batch preparing account/device/distribution gates and canonical launcher repair, not uploaded/installed/published. The launcher reuses the existing canonical blue M and its actual Expo-generated opaque1024px output has been viewed; final archive/home-screen still pending. Task .agent-sync/tasks/codex-mobile-testflight-20261022-2937e67c.md; gate details dev-docs/mobile-002/testflight-distribution-20261022.md. Small self-use invite only, no unrelated internal roles/email/marketing; missing Apple verification is handled precisely, not by account switching or invented metadata.
