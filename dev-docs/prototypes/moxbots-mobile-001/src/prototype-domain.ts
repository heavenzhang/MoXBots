export type Attachment={id:string;name:string;size:string;kind:'image'|'file';url?:string;preview?:string};
export type ResultFile={id:string;name:string;kind:'markdown'|'pdf'|'table'|'unsupported';size:string;version:string;created:string};
export const resultFiles:ResultFile[]=[
 {id:'weekly-md',name:'产品周报.md',kind:'markdown',size:'4.2 KB',version:'v1',created:'今天 10:24'},
 {id:'weekly-pdf',name:'产品周报.pdf',kind:'pdf',size:'128 KB',version:'v1',created:'今天 10:24'},
 {id:'meeting-table',name:'会议行动项.csv',kind:'table',size:'2.1 KB',version:'v1',created:'今天 10:20'},
 {id:'meeting-archive',name:'会议附件.zip',kind:'unsupported',size:'1.8 MB',version:'v1',created:'今天 10:20'},
];
export const models=[{id:'auto',name:'自动选择',detail:'按当前 Bot 的默认配置'},{id:'claude',name:'Claude Sonnet',detail:'示例 · 写作与复杂任务'},{id:'gpt',name:'GPT',detail:'示例 · 通用对话与分析'},{id:'kimi',name:'Kimi',detail:'示例 · 长文档整理'}];
export const modelName=(id:string)=>models.find(m=>m.id===id)?.name||'自动选择';
export type RequestState='pending'|'approved'|'denied'|'expired'|'handled';
export const requestStateText={pending:'等待你确认',approved:'已允许本次操作',denied:'已拒绝',expired:'请求已过期',handled:'已由另一端处理'};
export function suggestions(title:string,last:string){
 const context=title+' '+last;
 if(/接口|日志|错误|代码/.test(context))return ['列出复现步骤','补充验证结果','给出修复建议'];
 if(/周报|报告/.test(context))return ['精简成一页摘要','补充下周计划','按优先级排列'];
 if(/会议|负责人|行动项/.test(context))return ['按负责人分组','补充截止时间','列出待确认事项'];
 return ['总结目前的结论','列出待确认事项','继续细化下一步'];
}
