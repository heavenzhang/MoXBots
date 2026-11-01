'use strict';
const $ = s => document.querySelector(s);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const KEY='moxbots:prototype:bot-r2:v2';
const seed=()=>({
 projects:[{id:'p1',name:'请假统计',goal:'完成请假统计与异常联动，提供可核验的交付。',path:'~/Documents/销售业绩提升',members:['sales','mino','xiaoba']},{id:'p2',name:'MoXBots',goal:'让 Bot 身份清楚、项目进展与交付可追踪。',path:'~/Documents/MoxBot',members:['mino','xiaoba']}],
 bots:[
  {id:'sales',name:'销售业绩提升',avatar:'mox',role:'业务分析与交付协调',path:'~/Documents/销售业绩提升',memory:['汇报结论时附上依据。'],sessions:[{id:'sales-1',title:'请假统计与异常联动',project:'p1',messages:[{by:'sales',text:'统计方案已整理。需要研发和复核配合的部分，可以在群组中共同推进。'}]}]},
  {id:'mino',name:'Mino',avatar:'spark',role:'实现与文件处理',path:'~/Documents/Mino',memory:['修改后说明验证结果。'],sessions:[{id:'mino-1',title:'实现方案讨论',project:'p1',messages:[{by:'mino',text:'我会保留自己的工作上下文；群组里的任务会显示同一个负责人身份。'}]}]},
  {id:'xiaoba',name:'小八 (MyAgents)',avatar:'moss',role:'复核与质量检查',path:'~/Documents/小八',memory:['未验证的结果标明待核实。'],sessions:[{id:'xiaoba-1',title:'交付复核',project:'p1',messages:[{by:'xiaoba',text:'请把任务目标和验收要求一起给我，我会按同一份任务记录反馈。'}]}]}
 ],
 groups:[{id:'g1',project:'p1',name:'请假统计交付群',members:['sales','mino','xiaoba'],messages:[{by:'user',text:'请协作完成请假统计方案。先实现，再独立复核。'},{by:'sales',text:'我来协调交付。实现由 Mino 负责，复核交给小八；每项任务分别记录负责人和验收要求。'},{by:'mino',text:'第一版已回报，等待验收。以下为模拟交互示例，不代表实际代码已经执行。',task:'T01'}]},{id:'g2',project:'p2',name:'MoXBots 产品协作',members:['mino','xiaoba'],messages:[{by:'system',text:'Mino 和小八参与这个项目；原 Bot 的身份保持，项目资料与会话分别组织。'}]}],
 tasks:[{id:'T01',group:'g1',title:'实现请假统计与异常联动',owner:'mino',status:'review',attempt:1,reportAttempt:1,reportOwner:'mino',criteria:'统计口径清楚；异常有依据；说明验证范围。',report:'演示回报：已整理统计方案与异常清单。实际接口和完整业务验证仍需在真实环境执行。',history:['Mino 接受任务 · 第 1 次尝试','Mino 提交演示回报 · 待验收']},{id:'T02',group:'g1',title:'复核统计口径与异常说明',owner:'xiaoba',status:'queued',attempt:1,depends:'T01',criteria:'核对实现回报、统计口径和异常说明；列出未验证项。',history:['等待 T01 验收通过']}],view:{kind:'group',id:'g1'},selectedTask:null,tab:'tasks',light:false
});
let state;try{state=JSON.parse(localStorage.getItem(KEY));if(!state?.bots||!state?.groups||!state?.tasks)state=seed();}catch{state=seed();}
let returnFocus=null, toastTimer;
const bot=id=>state.bots.find(b=>b.id===id);
const project=id=>state.projects.find(p=>p.id===id);
const contextProject=()=>state.view.kind==='project'?project(state.view.id):state.view.kind==='group'?project(group(state.view.id).project):project((bot(state.view.id).sessions.find(s=>s.id===state.view.session)||bot(state.view.id).sessions[0]).project);
const group=id=>state.groups.find(g=>g.id===id);
const task=id=>state.tasks.find(t=>t.id===id);
const avatar=(id,size=28)=>{const b=bot(id);return b?`<img class="avatar" style="width:${size}px;height:${size}px" src="assets/${esc(b.avatar)}.png" alt="${esc(b.name)}">`:'';};
const labels={queued:'待开始',working:'进行中',review:'待验收',accepted:'已验收'};
const scope=()=>state.view.kind==='group'?group(state.view.id):state.view.kind==='project'?project(state.view.id):bot(state.view.id);
function save(){try{localStorage.setItem(KEY,JSON.stringify(state));}catch{toast('浏览器无法保存，本次变更仅保留在当前页面。');}}
function toast(text){clearTimeout(toastTimer);$('#toast').textContent=text;$('#toast').style.display='block';toastTimer=setTimeout(()=>$('#toast').style.display='none',2600);}
function commit(){save();render();}
function openModal(html){returnFocus=document.activeElement;$('#modalBody').innerHTML=html;if(!$('#modal').open)$('#modal').showModal();}
function closeModal(){$('#modal').close();returnFocus?.focus();}
$('#closeModal').onclick=closeModal;
$('#modal').addEventListener('cancel',()=>setTimeout(()=>returnFocus?.focus(),0));
function navigate(kind,id,session){state.view={kind,id,session};state.selectedTask=null;if(kind==='project')state.tab='workspace';$('#sidebar').classList.remove('open');commit();}
function render(){
 document.documentElement.classList.toggle('light',state.light);$('#theme').textContent=state.light?'切换深色':'切换浅色';
 $('#projects').innerHTML=state.projects.map(p=>`<button class="session ${state.view.kind==='project'&&state.view.id===p.id?'selected':''}" data-project="${p.id}">▱ ${esc(p.name)}</button>`).join('');
 $('#bots').innerHTML=state.bots.map(b=>`<button class="botRow ${state.view.kind==='bot'&&state.view.id===b.id?'selected':''}" data-bot="${b.id}">${avatar(b.id)}<span>${esc(b.name)}</span><span class="tag">Bot</span></button>${state.view.kind==='bot'&&state.view.id===b.id?`<div class="sessions">${b.sessions.map(s=>`<button class="session ${(state.view.session||b.sessions[0].id)===s.id?'selected':''}" data-session="${s.id}">${esc(s.title)}</button>`).join('')}</div>`:''}`).join('');
 $('#groups').innerHTML=state.groups.map(g=>`<button class="groupRow ${state.view.kind==='group'&&state.view.id===g.id?'selected':''}" data-group="${g.id}"><span class="stack">${g.members.map(id=>avatar(id,23)).join('')}</span>${esc(g.name)}</button>`).join('');
 const v=state.view, obj=scope();
 const session=v.kind==='bot'?(obj.sessions.find(s=>s.id===v.session)||obj.sessions[0]):null;
 $('#chatHeader').innerHTML=v.kind==='group'?`<button class="identity" id="groupInfo"><span class="stack">${obj.members.map(id=>avatar(id,23)).join('')}</span>${esc(obj.name)}</button><span class="tag">群组 · ${obj.members.length} Bots</span>`:v.kind==='project'?`<strong>▱ ${esc(obj.name)}</strong><span class="tag">项目</span>`:`<button class="identity" data-profile="${obj.id}">${avatar(obj.id)}${esc(obj.name)}<span class="tag">Bot</span></button><span class="muted">/</span><span class="title">${esc(session.title)}</span>`;
 if(v.kind==='project'){renderProject(obj);return;}
 const cp=contextProject();
 if(cp)$('#chatHeader').insertAdjacentHTML('beforeend',`<span class="grow"></span><button class="projectTag" data-project="${cp.id}">▱ ${esc(cp.name)}</button>`);
 $('#composer').hidden=false;
 const messages=v.kind==='group'?obj.messages:session.messages;
 $('#conversation').innerHTML=`<div class="date">本地演示 · ${v.kind==='group'?'协作在群里，身份和记忆归各自 Bot':'会话属于当前 Bot'}</div>`+messages.map(m=>`<article class="message ${m.by==='user'?'user':m.by==='system'?'system':''}">${m.by==='system'?'':`<div class="messageHead">${m.by==='user'?'<strong>你</strong>':`<button data-profile="${m.by}">${avatar(m.by,26)}${esc(bot(m.by)?.name)}</button>`}<small>${m.by==='user'?'':v.kind==='group'?'群组消息':'Bot 会话'}</small></div>`}<p>${esc(m.text)}</p>${m.task?taskCard(task(m.task)):''}${m.approval?`<button class="primary" data-approval="${m.approval}">确认本次演示范围</button>`:''}</article>`).join('');
 $('#targetRow').innerHTML=v.kind==='group'?`<label for="target">发送给</label><select id="target"><option value="all">@所有成员</option>${obj.members.map(id=>`<option value="${id}">@${esc(bot(id).name)}</option>`).join('')}</select>`:`${avatar(obj.id,20)}<span>与 ${esc(obj.name)} 对话</span>`;
 $('#composeHint').textContent=v.kind==='group'?'群内消息仅在当前群组显示':'输入“请记住：…”可演示 Bot 的长期记忆';
 $('#taskTab').classList.toggle('active',state.tab==='tasks');$('#workspaceTab').classList.toggle('active',state.tab==='workspace');
 renderDetails();
}
function renderProject(p){
 $('#composer').hidden=true;
 const gs=state.groups.filter(g=>g.project===p.id),ts=state.tasks.filter(t=>group(t.group).project===p.id);
 $('#conversation').innerHTML=`<p class="caption">项目概览</p><h1>${esc(p.name)}</h1><p>${esc(p.goal)}</p><div class="projectSummary"><span><strong>${ts.length}</strong> 项任务</span><span><strong>${ts.filter(t=>t.status==='accepted').length}</strong> 已验收</span><span><strong>${p.members.length}</strong> 个 Bot</span></div><hr class="divider"><h3>参与的 Bots</h3><div class="projectMembers">${p.members.map(id=>`<button data-profile="${id}">${avatar(id,36)}<span>${esc(bot(id).name)}<small>${esc(bot(id).role)}</small></span></button>`).join('')}</div><h3>项目群组</h3>${gs.map(g=>`<button class="taskLink" data-group="${g.id}"><span class="stack">${g.members.map(id=>avatar(id,23)).join('')}</span><strong>${esc(g.name)}</strong><span class="grow"></span>↗</button>`).join('')}<button data-new-project-group="${p.id}">＋ 新建项目群组</button><h3>任务与成果</h3>${ts.map(taskCard).join('')||'<p class="note">这个项目还没有任务。</p>'}<h3>项目会话</h3>${state.bots.flatMap(b=>b.sessions.filter(s=>s.project===p.id).map(s=>`<button class="file" data-open-bot="${b.id}" data-open-session="${s.id}">${avatar(b.id,22)}${esc(b.name)} / ${esc(s.title)} ↗</button>`)).join('')||'<p class="note">在 Bot 中新建会话时，可以选择此项目。</p>'}`;
 $('#taskTab').classList.toggle('active',state.tab==='tasks');$('#workspaceTab').classList.toggle('active',state.tab==='workspace');renderDetails();
}
function taskCard(t){return `<button class="taskLink" data-task="${t.id}">${avatar(t.owner,28)}<span class="grow"><small>${esc(t.id)} · ${esc(bot(t.owner).name)}</small><strong>${esc(t.title)}</strong></span><span class="status">${labels[t.status]}</span><span>›</span></button>`;}
function tasksInScope(){return state.tasks.filter(t=>state.view.kind==='group'?t.group===state.view.id:state.view.kind==='project'?group(t.group).project===state.view.id:t.owner===state.view.id);}
function renderDetails(){
 if(state.tab==='workspace'){
  const b=state.view.kind==='bot'?scope():bot(state.selectedTask?task(state.selectedTask).owner:scope().members[0]);
  const cp=contextProject(),resourceName=cp?.name||b.name,resourcePath=cp?.path||b.path;
  $('#details').innerHTML=`<p class="caption">资源环境</p><h3>项目工作区 · ${esc(resourceName)}</h3><p class="note">${esc(resourcePath)}</p><hr class="divider"><button class="file" data-file="CLAUDE.md">▾ 项目说明</button><div class="tree"><button class="file" data-file="CLAUDE.md">▤ CLAUDE.md</button><button class="file" data-file="acceptance.md">▤ acceptance.md</button></div><button class="file" data-file="report.md">▤ report.md</button><hr class="divider"><p class="note">此处展示当前项目的文件环境。Bot 身份、项目资料和项目会话分别保留；参与其他项目时切换相应上下文。</p>`;return;
 }
 const t=task(state.selectedTask);
 if(!t){const list=tasksInScope();$('#details').innerHTML=`<p class="caption">${state.view.kind==='group'?'当前群组的任务':state.view.kind==='project'?'当前项目的任务':'当前 Bot 负责的任务'}</p><div class="row"><h3>${list.length} 项任务</h3><span class="grow"></span><button id="createTask">＋ 新建</button></div>${list.map(t=>`<button class="taskRow" data-task="${t.id}"><strong>${esc(t.id)} · ${esc(t.title)}</strong><div class="row">${avatar(t.owner,21)}<small>${esc(bot(t.owner).name)}</small><span class="grow"></span><span class="status">${labels[t.status]}</span></div></button>`).join('')||'<p class="note">还没有任务。可在群组中创建并指定负责人。</p>'}<hr class="divider"><p class="note">回报后进入待验收。验收通过的任务才计入完成，返工保留原任务编号。</p>`;return;}
 const blocked=t.depends&&task(t.depends)?.status!=='accepted';
 $('#details').innerHTML=`<button id="backTasks">‹ 全部任务</button><p class="caption">${t.id} · 第 ${t.attempt} 次尝试</p><h2>${esc(t.title)}</h2><span class="status">${labels[t.status]}</span><hr class="divider"><p class="caption">当前负责人</p><button data-profile="${t.owner}">${avatar(t.owner,32)}${esc(bot(t.owner).name)}</button><button id="handoff" ${t.status==='accepted'?'disabled':''}>交接…</button><p class="caption">归属群组</p><button data-group="${t.group}">${esc(group(t.group).name)} ↗</button><h3>验收要求</h3><p class="note">${esc(t.criteria)}</p>${t.depends?`<p class="note">依赖 ${t.depends}：${blocked?'等待验收':'已满足'}</p>`:''}${t.report?`<h3>最近回报</h3><p class="caption">${esc(bot(t.reportOwner||t.owner).name)} · 第 ${t.reportAttempt||1} 次尝试</p><p class="note">${esc(t.report)}</p><button data-file="report.md">▤ 查看演示回报</button>`:''}<div class="actions">${t.status==='queued'?`<button id="startTask" class="primary" ${blocked?'disabled':''}>开始演示任务</button>`:t.status==='working'?'<button id="reportTask" class="primary">提交演示回报</button>':t.status==='review'?'<button id="acceptTask" class="primary">验收通过</button><button id="reworkTask">要求返工</button>':'<span class="note">已验收 · 记录已保留</span>'}</div><h3>流转记录</h3><ol class="history">${t.history.map(h=>`<li>${esc(h)}</li>`).join('')}</ol>`;
}
function profile(id){const b=bot(id);openModal(`<div class="profile">${avatar(id,100)}<h2>${esc(b.name)}</h2><p class="note">${esc(b.role)}</p><input id="botName" aria-label="Bot 名称" value="${esc(b.name)}"><div class="choices">${['mox','moss','spark'].map((a,i)=>`<button data-avatar="${a}" data-for="${id}" aria-pressed="${b.avatar===a}"><img class="avatar" src="assets/${a}.png" alt="">${['小墨','青芽','火花'][i]}</button>`).join('')}</div><button class="primary" id="saveName" data-for="${id}">保存名称</button><button id="openPrivate" data-for="${id}">打开 Bot 会话 ↗</button></div><hr class="divider"><p class="caption">此 Bot 的记忆 · 本地模拟</p>${b.memory.map(x=>`<p class="note">${esc(x)}</p>`).join('')}<p class="caption">参与项目</p>${state.projects.filter(p=>p.members.includes(id)).map(p=>`<button class="file" data-profile-project="${p.id}">▱ ${esc(p.name)} ↗</button>`).join('')}<p class="caption">默认工作区</p><p class="note">${esc(b.path)}</p>`);}
function newChat(){const b=state.view.kind==='bot'?scope():bot(scope().members[0]);openModal(`<h2>与 ${esc(b.name)} 新建会话</h2><p class="note">名称、形象和记忆继续属于同一个 Bot。</p><form id="newChatForm" data-for="${b.id}"><label>项目<select name="project" aria-label="会话项目"><option value="">个人会话</option>${state.projects.filter(p=>p.members.includes(b.id)).map(p=>`<option value="${p.id}" ${contextProject()?.id===p.id?'selected':''}>${esc(p.name)}</option>`).join('')}</select></label><input name="title" aria-label="会话标题" placeholder="会话标题" required maxlength="80"><button class="primary">创建会话</button></form>`);}
function newGroup(){openModal(`<h2>新建群组</h2><p class="note">选择 2–6 个已有 Bot，继续使用其原有身份。</p><form id="groupForm" data-project="${contextProject()?.id||'p1'}"><p class="note">所属项目：${esc(contextProject()?.name||project('p1').name)}</p><input name="name" aria-label="群组名称" placeholder="群组名称" required maxlength="60">${state.bots.map(b=>`<label><input type="checkbox" name="member" value="${b.id}">${avatar(b.id,25)}${esc(b.name)}</label>`).join('')}<p id="formError" class="warning" role="alert"></p><button class="primary">创建群组</button></form>`);}
function createTask(){const g=state.view.kind==='group'?scope():state.view.kind==='project'?state.groups.find(g=>g.project===state.view.id):state.groups.find(g=>g.members.includes(state.view.id));if(!g){toast('请先将此 Bot 加入群组。');return;}openModal(`<h2>新建任务</h2><form id="taskForm" data-group="${g.id}"><input name="title" aria-label="任务名称" placeholder="任务名称" required maxlength="100"><label>负责人<select name="owner" aria-label="任务负责人">${g.members.map(id=>`<option value="${id}">${esc(bot(id).name)}</option>`).join('')}</select></label><textarea name="criteria" aria-label="验收要求" placeholder="验收要求" required></textarea><button class="primary">创建任务</button></form>`);}
function taskAction(action){const t=task(state.selectedTask);if(!t)return;
 if(action==='startTask'&&t.status==='queued'&&(!t.depends||task(t.depends)?.status==='accepted')){t.status='working';t.history.push(`${bot(t.owner).name} 开始第 ${t.attempt} 次演示`);}
 else if(action==='reportTask'&&t.status==='working'){t.status='review';t.reportOwner=t.owner;t.reportAttempt=t.attempt;t.report=`第 ${t.attempt} 次演示回报：已按要求整理结果，等待核对。此为模拟内容。`;t.history.push(`${bot(t.owner).name} 提交回报 · 第 ${t.attempt} 次尝试`);group(t.group).messages.push({by:t.owner,text:t.report,task:t.id});}
 else if(action==='acceptTask'&&t.status==='review'){t.status='accepted';t.history.push(`你验收通过 · 第 ${t.attempt} 次尝试`);group(t.group).messages.push({by:'system',text:`${t.id} 已验收通过。`,task:t.id});}
 else if(action==='reworkTask'&&t.status==='review'){openModal(`<h2>要求返工 · ${t.id}</h2><form id="reworkForm"><textarea name="reason" aria-label="返工要求" placeholder="明确需要修正的内容" required></textarea><button class="primary">发送返工要求</button></form>`);return;}
 else if(action==='handoff'&&t.status!=='accepted'){openModal(`<h2>交接任务 · ${t.id}</h2><form id="handoffForm"><select name="owner" aria-label="新负责人">${group(t.group).members.filter(id=>id!==t.owner).map(id=>`<option value="${id}">${esc(bot(id).name)}</option>`).join('')}</select><textarea name="reason" aria-label="交接说明" placeholder="交接原因与下一步" required></textarea><button class="primary">确认交接</button></form>`);return;}
 commit();
}
document.addEventListener('click',e=>{
 const el=e.target.closest('button');if(!el)return;
 if(el.dataset.profileProject){closeModal();navigate('project',el.dataset.profileProject);}
 if(el.dataset.project)navigate('project',el.dataset.project);
 if(el.dataset.openBot)navigate('bot',el.dataset.openBot,el.dataset.openSession);
 if(el.dataset.newProjectGroup)newGroup();
 if(el.dataset.bot)navigate('bot',el.dataset.bot);
 if(el.dataset.session)navigate('bot',state.view.id,el.dataset.session);
 if(el.dataset.group)navigate('group',el.dataset.group);
 if(el.dataset.profile)profile(el.dataset.profile);
 if(el.dataset.avatar){bot(el.dataset.for).avatar=el.dataset.avatar;commit();profile(el.dataset.for);}
 if(el.id==='saveName'){const name=$('#botName').value.trim();if(!name){toast('请输入 Bot 名称。');return;}bot(el.dataset.for).name=name;commit();closeModal();}
 if(el.id==='openPrivate'){closeModal();navigate('bot',el.dataset.for);}
 if(el.dataset.task){state.selectedTask=el.dataset.task;state.tab='tasks';render();$('#inspector').classList.add('open');}
 if(el.id==='backTasks'){state.selectedTask=null;renderDetails();}
 if(['startTask','reportTask','acceptTask','reworkTask','handoff'].includes(el.id))taskAction(el.id);
 if(el.id==='createTask')createTask();
 if(el.dataset.file)openModal(`<h2>${esc(el.dataset.file)}</h2><p class="caption">原型内的演示文件</p><pre>${esc(el.dataset.file==='report.md'?(task(state.selectedTask)?.report||'尚未提交回报。'):'# 示例项目\n\n仅用于演示文件入口与工作区归属。\n没有读取或修改你的业务文件。')}</pre>`);
 if(el.id==='groupInfo'){const g=scope();openModal(`<h2>${esc(g.name)}</h2><p class="note">这些是已有 Bot 的群组身份。</p>${g.members.map(id=>`<button class="wide" data-profile="${id}">${avatar(id,38)}${esc(bot(id).name)} ↗</button>`).join('')}<hr class="divider"><p class="note">审批和登录等个人确认，进入相应 Bot 的独立会话处理。</p><button id="privateApproval" class="primary">演示个人确认入口</button>`);}
 if(el.id==='privateApproval'){const b=bot(scope().members[0]);let s=b.sessions.find(s=>s.id==='approval-demo');if(!s){s={id:'approval-demo',title:'待你确认',messages:[{by:b.id,text:'群组协作需要你确认本次演示范围。确认只更新本地演示状态。',approval:b.id}]};b.sessions.push(s);}closeModal();navigate('bot',b.id,s.id);}
 if(el.dataset.approval){const b=bot(el.dataset.approval),s=b.sessions.find(s=>s.id==='approval-demo');s.messages=s.messages.map(m=>({...m,approval:undefined}));s.messages.push({by:'system',text:'本次演示确认已记录。'});commit();}
 if(el.classList.contains('closeInspector'))$('#inspector').classList.remove('open');
});
document.addEventListener('submit',e=>{
 const f=e.target;if(f.id==='composer')return;e.preventDefault();const data=new FormData(f);
 if(f.id==='newChatForm'){const b=bot(f.dataset.for),s={id:`session-${Date.now()}`,title:data.get('title').trim(),project:data.get('project')||undefined,messages:[]};if(!s.title)return;b.sessions.push(s);closeModal();navigate('bot',b.id,s.id);}
 if(f.id==='groupForm'){const members=data.getAll('member');if(members.length<2||members.length>6){$('#formError').textContent='请选择 2–6 个 Bot。';return;}const name=data.get('name').trim();if(!name)return;const g={id:`group-${Date.now()}`,name,members,project:f.dataset.project,messages:[]};state.groups.push(g);project(g.project).members=[...new Set([...project(g.project).members,...members])];closeModal();navigate('group',g.id);}
 if(f.id==='taskForm'){const title=data.get('title').trim(),criteria=data.get('criteria').trim();if(!title||!criteria)return;const t={id:`T${String(state.tasks.length+1).padStart(2,'0')}`,group:f.dataset.group,title,owner:data.get('owner'),status:'queued',attempt:1,criteria,history:['你创建任务并指定负责人']};state.tasks.push(t);group(t.group).messages.push({by:'system',text:'新任务已分配。',task:t.id});state.selectedTask=t.id;closeModal();commit();}
 if(f.id==='reworkForm'||f.id==='handoffForm'){const t=task(state.selectedTask),reason=data.get('reason').trim();if(!reason)return;const prev=t.owner;if(f.id==='handoffForm')t.owner=data.get('owner');t.status='working';t.attempt+=1;t.history.push(`${f.id==='handoffForm'?`${bot(prev).name} → ${bot(t.owner).name} 交接`:'你要求返工'}：${reason} · 第 ${t.attempt} 次尝试`);group(t.group).messages.push({by:'system',text:`${t.id} ${f.id==='handoffForm'?'已交接':'需返工'}：${reason}`,task:t.id});closeModal();commit();}
});
$('#composer').onsubmit=e=>{e.preventDefault();const text=$('#message').value.trim();if(!text)return;const obj=scope();if(state.view.kind==='group'){const target=$('#target').value;obj.messages.push({by:'user',text:`${target==='all'?'@所有成员':'@'+bot(target).name} ${text}`});}else{const s=obj.sessions.find(s=>s.id===state.view.session)||obj.sessions[0];s.messages.push({by:'user',text});if(text.startsWith('请记住：')){const memory=text.slice(4).trim();if(memory){obj.memory.push(memory);s.messages.push({by:obj.id,text:'已保存到此 Bot 的演示记忆。'});}}}$('#message').value='';commit();$('#conversation').scrollTop=$('#conversation').scrollHeight;};
$('#projectNav').onclick=()=>navigate('project','p1');
$('#newChat').onclick=newChat;$('#newGroup').onclick=newGroup;
$('#taskTab').onclick=()=>{state.tab='tasks';commit();};$('#workspaceTab').onclick=()=>{state.tab='workspace';commit();};
$('#allTasks').onclick=()=>{state.selectedTask=null;state.tab='tasks';commit();$('#inspector').classList.add('open');};
$('#theme').onclick=()=>{state.light=!state.light;commit();};$('#reset').onclick=()=>{state=seed();commit();toast('演示已重置。');};
$('#navToggle').onclick=()=>$('#sidebar').classList.toggle('open');$('#inspectToggle').onclick=()=>$('#inspector').classList.toggle('open');
render();
