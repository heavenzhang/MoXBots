import {useState} from 'react';
import {CheckCircledIcon,ChevronDownIcon,ClockIcon,StopIcon} from '@radix-ui/react-icons';

type StepState='pending'|'running'|'done'|'closed';

type TraceStep={
 title:string;
 detail:string;
 state:StepState;
};

const pianoBars=Array.from({length:12},(_,index)=>index);

function stateLabel(state:StepState){
 return state==='running'?'进行中':state==='pending'?'待确认':state==='done'?'已完成':'已关闭';
}

export function ExecutionTrace({status,context,hasResult,request}:{status:string;context:string;hasResult:boolean;request?:string}){
 const [expanded,setExpanded]=useState(false);
 const closed=request==='denied'||request==='expired'||request==='handled';
 const summary=request==='denied'?'请求已拒绝，未执行':request==='expired'?'授权已过期':request==='handled'?'请求已由另一端处理':request==='pending'?'等待确认后继续':status==='running'?'正在处理你的要求':status==='stopped'?'本轮执行已停止':'本轮执行已完成';
 const operationState:StepState=closed||status==='stopped'?'closed':request==='pending'?'pending':status==='running'?'running':'done';
 const deliveryState:StepState=closed||status==='stopped'?'closed':status==='running'||request==='pending'?'pending':'done';
 const steps:TraceStep[]=[
  {title:'接收要求',detail:'消息已进入当前会话',state:'done'},
  {title:'整理工作上下文',detail:context,state:'done'},
  {
   title:closed?'请求已关闭':request==='pending'?'等待你确认操作':status==='running'?'处理当前要求':status==='stopped'?'本轮已停止':'本轮处理结束',
   detail:closed?'请查看原会话中的授权记录':request==='pending'?'请先查看操作对象与影响范围':status==='running'?'在原 Bot 设备执行（本地演示）':status==='stopped'?'会话和未发送的消息均已保留':'结果已回到原会话',
   state:operationState
  },
  {title:'交付结果',detail:hasResult?'成果文件已关联，可直接预览':'文字结果保留在会话记录中',state:deliveryState}
 ];
 const summaryState=steps.find(step=>step.state==='running')?.state||steps.find(step=>step.state==='pending')?.state||steps[steps.length-1].state;
 const toggleLabel=expanded?'收起执行步骤':'查看执行步骤';

 return <section className="execution-trace" data-state={summaryState} aria-label="本轮执行轨迹">
  <button className="execution-toggle" aria-label={`${toggleLabel}：${summary}`} aria-expanded={expanded} onClick={()=>setExpanded(value=>!value)}>
   <span className="execution-marker" aria-hidden="true">{status==='running'||request==='pending'?<ClockIcon/>:status==='stopped'?<StopIcon/>:<CheckCircledIcon/>}</span>
   <span className="execution-summary"><strong>{request==='pending'?'等待确认后继续':summary}</strong><small>{toggleLabel}</small></span>
   <span className="execution-state">{stateLabel(summaryState)}</span>
   <ChevronDownIcon className={expanded?'rotated':''} aria-hidden="true"/>
  </button>
  {expanded&&<ol className="trace-steps">
   {steps.map((step,index)=><li key={step.title} data-state={step.state} aria-current={step.state==='running'?'step':undefined}>
    <span className="trace-index" aria-hidden="true">{step.state==='done'?<CheckCircledIcon/>:index+1}</span>
    <div className="trace-copy"><strong>{step.title}</strong><p>{step.detail}</p></div>
    {step.state==='running'&&<span className="piano-roll" aria-hidden="true">{pianoBars.map(bar=><i key={bar}/>)}</span>}
    <span className="trace-status">{stateLabel(step.state)}{step.state==='running'&&<span className="sr-only">，当前步骤</span>}</span>
   </li>)}
  </ol>}
 </section>;
}
