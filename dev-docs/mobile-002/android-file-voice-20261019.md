# Android 文件与语音验收 — 2026-10-19

任务：MOXBOTS-ANDROID-FILE-VOICE-20261019。当前聊天负责代码、隔离设备、集成与验收；原手机端聊天已交回重叠操作。PR：https://github.com/heavenzhang/MoXBots/pull/160。

## 验收范围与结论

在专用 MoxBotsMobile002 / API36 arm64 Android 模拟器、真实 Release 内测 App、已部署云服务和101上的隔离临时 Host 完成系统文件/图片选择与加密上传。临时 Host 使用已验收公开P4产品7e4bbdfa，独立设备身份、目录、UID和临时systemd单元；用户明确授权该测试设备及验收后的会话/授权撤销。最小测试Agent为受控种子配置，无模型或执行授权，不代表Agent创建流程验收。

原101 Host身份、密钥、配置与运行实例不作为写入或发布目标。日常Mac客户端、实体iPhone、生产云/Host二进制和公网端口均未操作。本次不发布商店或公众移动安装包。

用户明确答复“暂时没有，保留语音实机待验”。因此中文真实录音→离线识别→转写草稿及实体iPhone继续待设备可用后补验；本轮不以模拟器状态、手工输入或测试桩冒充识别成功。

## 复现与修复

- 会话页刷新原来只读取已有目标的会话；无目标时无法发现新开放的Bot。现在显式刷新重新读取账号和新鲜授权目录，保留当前错误并抑制已失效视图的晚回调。
- 系统picker返回早于Android窗口恢复焦点，立即上传被原生前台检查拒绝。现在在原owner/scope内等待真实AppState与focus，最长5秒；超时保留附件并显示可处理原因，原生前台检查不变。
- suspend清空目录后重新生成opaque target ID，前台元数据刷新使附件归属失效。现在只暂存ID连续性提示；新鲜设备/Agent目录通过原有账号、网络、Ready及权限检查后才复用ID。提示不参与RPC授权，目录失败、普通错误、超时、logout均清除；同一视图刷新保留草稿，真实导航/身份变化仍失效旧操作。
- picker取消不再显示通用远程错误。picker busy使用独立单飞Ref，并在任何原操作结束后释放，避免切换owner后无法再次选文件。
- 麦克风系统授权窗口触发后台取消，原来回到App后没有解释。保留后台取消和owner fence；仅原视图恢复前台时显示“已中断，请再次点按”，不推断权限状态、不自动开始录音或发送。

独立只读审查发现并修复picker busy问题，复核PASS；另对Rust alias权限边界、超时初始化、语音中断owner范围复核PASS。当前Agent负责实际设备与总体验收。

## 真实行为证据

| 路径 | 实际结果 |
| --- | --- |
| 升级内部APK后账号恢复 | 原Android测试账号恢复，无需重新输入凭据；测试Host可见 |
| 临时Agent关闭/开启后刷新 | 关闭后无可用Bot；重新开启后同账号直接刷新发现，不重新登录 |
| 系统文件picker取消 | 回到同一草稿，无取消错误提示；可继续选择 |
| 中文名UTF8文件 | 原系统DocumentsUI选择，168000B、多24KiB分片，App显示已就绪；Host最终大小/完整SHA相同 |
| 图片picker | 原系统image/*筛选，仅显示PNG；16736B，App显示已就绪；Host完整SHA相同 |
| 空文件/20MiB+1文件 | 导入拒绝并显示明确原因；原草稿和两个ready附件保留，Host资产仍恰好两个 |
| 前后台切换与第二次picker | 原附件及手工编辑后的草稿保留，Host没有新增上传或未知重放 |
| 麦克风拒绝/授予 | 真实OS权限对话框；返回后明确提示重新开始，草稿保留，不自动录音 |
| 已授权后明确再次点语音 | 实际on-device provider返回中文模型未就绪；显示可理解提示及可编辑面板，无线上识别降级 |
| 语音面板手工编辑 | 手工测试文字同步主输入框，不自动发送；仅证明编辑路径，不证明ASR |
| 会话/模型执行 | 未发送第一条消息、未创建真实Session、未执行收费模型 |

| 完整文件 | 字节数 | SHA-256 |
| --- | ---: | --- |
| android-avf-中文.txt | 168000 | 5dc8d57881c7249125744ae80ccd912e5ac19880191f06c9009e5514c718fb1f |
| android-avf-image.png | 16736 | 57c307d3d47e45515470cacbf6016e10ad24a913049a3b2cf1304aa5d5233d1a |

主Agent已实际复看双附件ready、中断提示、模型未就绪和编辑草稿截图；文字、按钮与错误区域可读，无非预期横向溢出。完整匿名安装包发布或真实手机麦克风不在这些截图的证明范围内。

## 源码、制品及测试

文件/图片实际上传验收包来源345961f5ff90bf9daf6bfab7d74aa2e7393898c3，APK50308748B / SHA37b46b5698376bfa1868afcdc0d0d873bccd2920f5da4fc747acda099634569d。

最终语音中断提示包来源e042e1208ea310f542183d6b4d6aded8dff15536，APK50308940B / SHA13b9972bcae9bcdadd22b6a2a2754ea9994fcac53fdaf8f242ed27988dc61bcb；相对文件验收版本只增加该提示的owner生命周期逻辑，上传、picker、Rust/JNI源未变。最终包再次真实验证拒绝、授予、明确重试、中文模型失败和保留草稿。

Rust库由df867b53583ea4caf04c866ca40f403011d8c600的干净共享源码重建；native source digest48be5b39d9b141891a85901abf097c81114e2fa4e416b366e2a1517520efd2f4与最终源码闭包完全相同。库SHA5fbbba4c70cafafb8922ecd30cf23846b94683055c68faad90cfc594aab9b045。实际APK验证匹配其NDK strip变换、arm64 ELF/ZIP16KiB、签名及内嵌JS。签名为Android内部测试key，不代表商店签名。

本地App typecheck/lint、61策略测试通过；Rust connection129通过/1显式忽略，严格Clippy通过。真实设备原生instrumentation共34项，33通过/1显式跳过（未启用live-login探测），无失败；含调度、持久化、权限拒绝、晚回调和语音模型只读元数据，不替代中文识别成功。

首轮综合CI在新增timeout声明处被root ESLint prefer-const拦截，已在345961f5修复，仍保留同步subscribe回调清理测试；不使用旧CI替代最终组合提交的检查。最终CI/main收尾以PR远端回执为准。

## 清理、原101见证与交付

临时Agent已CAS关闭（enableRevision4），临时Host已退出网络（membershipRevision4）；原生DPoP回执复读确认。五个本任务QA登录会话均在只读服务数据库见证中确认revoked，包括Android、临时Host和测试控制器；没有批量撤销其他会话。临时Node/connector已按精确unit、PID和startTicks确认后正常停止，仅新建测试OS账号被移除，临时状态封存在root0700目录。Android通过真实二次确认退出，麦克风测试权限已撤销，四个外部测试文件已移除；仅本任务无窗口模拟器正常退出并确认PID消失。

最终只读见证2026-10-19T13:02:31Z：原101设备仍fresh Ready，原12项身份/密钥/配置见证全部不变，Node3502751、connector14604未变。设备审计行保留，未删除数据库记录。首次非产品QA控制器的Bearer-only请求被401拒绝且未写；一次原生QA读取网络失败后按fail-closed撤销临时授权和会话，随后只对临时连接器重新显式入网，未重启原101。

本分支记录为合入前checkpoint；最终required CI、普通merge及远端main包含验收head/tree的回执保存于PR160最终评论和私有execution-status.json。若PR已merged，应读取其最终merge SHA，禁止再次部署或重传。私有证据在项目pointer的output/android-file-voice-20261019，包括受控原始截图/XML、完整Host大小/SHA回执、APK/native provenance、测试日志和非秘密会话撤销回执。凭据、令牌、密钥、构建产物及数据库不进入Git。
