# MOXBOTS-0521-UNIFIED-BATCH-20261024

原桌面/macOS/updater/combined CI/main owner `01a12bc2-907a-7702-b6dd-788225c5dfe4` 统一交付。用户在原实现聊天明确要求整批统一0.5.21；当前日常App仍遵守“保留当前任务运行，稍后维护”。

## 候选范围与来源

从远端main `185f8fa22eee0e1a6523923bc078185c6536e948` 集成原实现最终head `ca49dc92202d3364f10a74c2b458387f3e76abff`。原实现base fda与并发Host PR198不存在路径交集，普通merge保留双方全部成果。原独立备用清理三依赖已经在ca49历史中，不重复集成。

包含原主干未发布的计划生命周期，以及普通行动闭环、同档模型池/恢复、受约束的原生后台任务包、首发归属与执行状态。Host/mobile/cloud/Windows不在本次桌面部署范围。remote-state/projection、remote-ui-smooth、remote-content-completeness、session-stall及title/queue等尚未通过本批根审的独立请求不静默混入；它们保留在原intake记录。

0.5.21/build521.1由唯一owner分配；源版本同步package/lock、两Tauri配置、App与Document Worker Cargo/lock。Media Worker保持自身独立版本。已发布519.2及冻结未发布520.1原字节、签名、AppleID和制品不变，不改标成21。

## 根审追加修复

在最终ca49并集上新增有意义的完成态负向回归：根Bash已返回后台启动回执、根Read读取中间结果并提交accept，但原生阻塞后台仍运行。原源码实跑错误进入completed（原RED留在owner工作目录）。追加原生Query incarnation/后台revision证据，根Pre/Post/terminal必须同代次；后台在Read期间或之后完成都会使旧Read失去验证资格，但不改写Read真实成功事实。明确ambient任务在原lifecycle记录时保留分类，不因可缺省run_id永久毒化验证；未知writer缺身份仍拒绝。根owner仅在这一边界延后accept，保留原pending continuation，后台结束后fresh queue Read/验收才能completed；明确nonblocking detached工作仍允许完成。

原作者1070项/61文件、SDK四模式/chain/Stop和独审原件复用，不盲重跑。根追加完成态/跨后台epoch/旧Read跨queue/原生生命周期等针对性回归，两个受影响模块共73项通过；类型和增量lint通过。最终源文件上实际SDK默认闭环和后台包模式均退出零，输入一次、Write/Read各一次并持久completed（evidence/root-native-single.json、root-native-package.json）。新增回归与原1070有重叠，不能把这些数字直接累加。原native收据上游均合成、可信输入由harness登记，不等于签名Rust首发或真实Provider验收。

## 分阶段状态

- 源码：并集及根追加修复完成，精确候选提交与CI见本任务记录。
- 本地/合成SDK：原作者证据与根增量日志分别保留，不能替代正式客户端。
- 主干/CI：由本owner沿精确候选首次自动CI和正常merge处理；未通过不宣布交付。
- 制品：只在精确CI/main闭包后一次编译/签名/单公证/归档，正常nice0；新tag与摘要不复用旧版。
- 原生/真实Provider：按原开发交付runbook的专用Session/工作区执行普通网站一次交付、受控返工、并行、Stop/新输入/重启未知不重放；不重放MoX Curriculum/薪资业务。
- 本地安装/正式通道：未完成；有效维护窗口、现场精确恢复、备份/回滚及必要真实路径门禁后同包晋级。

当前没有App退出/安装、Host部署或正式通道变更。维护前Mox/Sales主动设置及Mino顺序待原维护记录精确恢复；blocked记忆任务7ed4执行计数100保持暂停，不能用开启master瞬时重新排队。


首次精确CI的全unit层仅一项旧prompt文案断言失败（640文件/7039项；7033通过、1失败、5跳过）。只更新提示词合同测试，原Task/Cron/Goal权限断言保留，并增明确行动免提案、显式讨论或新scope仍确认的回归；产品源码字节不变。原失败日志与后续精确候选CI分别保留，不能用首次局部PASS冒充整套通过。
