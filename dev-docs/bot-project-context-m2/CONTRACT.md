# M2：项目、Bot与会话契约

用户已批准项目工作台/成员/项目内会话/固定上下文这一轮。不是新增执行系统或第二个持久化writer。

## 产品关系

- Bot = 已有AgentConfig稳定ID与能力配置，可被多个项目引用；原物理Project（workspace）仍是Bot原工作目录，唯一身份规则不改。
- 项目 = ProjectSpace（config.projectSpaces）：目标/说明/指令、Bot成员ID、文本资料和关联目录引用；目录是资料资源引用，不隐式改Bot的执行cwd或授予文件权限。
- 会话 = 原SessionStore中的Session，出生时冻结ProjectSpaceSessionSnapshot，含projectId/name/revision、botId/name/icon、workspacePath及所选项目配置快照。workspacePath仍是该Bot原目录。
- 同项目不同Bot可以读取同一项目的可见桌面历史；A/B项目、逻辑项目/旧目录会话双向排除。固定配置取birth快照；动态历史只在首次真实发送和首轮原mutation retry内按冻结projectId读取。
- 文件/工具访问仍受原Bot与Runtime权限约束，相同目录不是文件沙盒。项目上下文不写AGENTS.md、Bot记忆或共享workspace配置。全局工具显式读取能力不被此UI组织关系改变。
- 配置变更作用于以后创建的会话。改名、移除成员、归档不重写已有快照。归档停止新建与新的自动历史汇聚，旧会话保留自身快照和历史。
- Fork继承原快照，不提供跨项目改归属。重开只用Session自己的快照；“新对话”要重新走同项目出生，不能只在Tab上保留标签。

## Authority 与兼容

ConfigStore/config.json在原锁内修改projectSpaces，revision compare防陈旧保存；不改projects.json的旧关系。SessionStore/既有product-session-binding拥有出生、落盘、不可变性与fork；App/Tab只是原导航和出生事务调用方。服务端只接选择ID，读取最新Config和Projects校验成员/目录/版本并生成快照，拒绝客户端注入任意snapshot。逻辑项目入口包括builtin都显式prepare→rekey→commit；未知结果仍保留原意图与记录，不盲重发。

没有projectSpace字段的旧会话保持旧语义，不按路径猜迁入。无效字段、scope冲突和不健康来源fail closed，不回退成跨项目workspace历史。Task/Goal账本、跨端完成归档和群组角色不在本轮重新定义；M3再接真正群组与交接。

## Shared schema（Root拥有src/shared/projectSpaces.ts）

- ProjectSpace: id/name/description/instructions/memberBotIds/materials[{id,title,content}]/resources[{id,label,path}]/revision/createdAt/updatedAt/archivedAt?。
- ProjectSpaceSelection: projectId/botId/projectRevision，出生唯一客户端输入。
- ProjectSpaceSessionSnapshot: schemaVersion=1/projectId/projectName/projectRevision/botId/botName/botIcon?/workspacePath/capturedAt/description/instructions/materials/resources。
- AppConfig.projectSpaces?: ProjectSpace[]；server/renderer SessionMetadata.projectSpace?: ProjectSpaceSessionSnapshot。
- new birth option：projectSpaceSelection?: ProjectSpaceSelection。普通SessionSnapshotPatch不可修改该身份。

## UI方向与原型假设

复用M1 sidebar、品牌Logo、年轻Bot头像、既有Theme token/CustomSelect/OverlayBackdrop；面向笔记本日常工作，安静、紧凑、可读。一个项目首页：顶部目标与新对话；主体对话列表；右侧成员/资料概览；成员/资料在同页子页签编辑。项目首页与旧目录工作看板分开，避免覆盖并发看板任务。新建对话先选项目/成员Bot，明确项目资料与Bot工作目录；当前会话头展示冻结归属。

原型只使用合成项目/历史/回调，不调用模型、不写真实配置。正式实现复用页面组件再接原配置/Session API；原型通过不代替真实持久化。目标视口1440×900、768×1024、390×844，深浅主题与键盘/空/加载/失败/重试/陈旧保存均覆盖。

## 验收样例

同一分析Bot加入产品A与经营B，仍只有一个Bot身份和一个原工作目录。A出生并保存说明/资料快照；B出生不自动注入A的资料或历史。更改A配置后重开A旧会话仍显示原revision与资料；新A会话使用新revision。冷重启读回、fork、原会话恢复、prepared失败/未知回执、归档/成员移除、旧目录新会话不读A/B都要有原owner路径证据。目录/全局工具读取不声称安全隔离。
