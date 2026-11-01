# 第一批统一规则

|事实|主源|两端表达/本批动作|
|---|---|---|
|Session running / waiting_user_action|既有执行owner实时快照|执行中 / 等待处理；打开只进入原会话|
|Session idle|既有活动观测|可继续；不建立完成或验收事实|
|Turn terminal complete|本轮回执|本轮已结束，不等于任务验收|
|Task verifying / running且明确idle|TaskStore + 有效活动观测|需要我/待验收；不能通过归档写done|
|Task done|TaskStore现有显式状态|已完成；仅独立归档/恢复，不增加验收写操作|
|Goal complete|Goal owner显式终态|目标已完成；不从idle推断Goal结束|
|近期时间/全部TODO完成/有成果|索引或步骤记录|不代替Task/Goal终态|
|读取失效/部分失败|现有快照|待核实，不显示已完成|

归档不参与完成结算。Task已有协议只允许Done归档，本批保留该协议：待验收任务先回原会话核验，不能暗中完成后归档。会话归档仍独立修改archived。恢复保持原ID且不调用run/rerun。

手机目录没有TaskStore/Goal验收快照，不能凭“本轮已结束”声称任务已完成。本批显示这个边界，并把操作文案设为查看进展/查看请求/核对状态/打开原会话；不新增第二套持久状态。
