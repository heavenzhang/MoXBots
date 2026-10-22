import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)('playwright');
import {writeFile} from 'node:fs/promises';
const browser=await chromium.launch({headless:true,...(process.env.ORCH_CHROMIUM_PATH?{executablePath:process.env.ORCH_CHROMIUM_PATH}:{})});
const result={boundary:'Real PlanCard/Composer; synthetic SDK capability, ledger, Chat and Inspector. No submit action, native Runtime or Provider.',checks:[],errors:[],businessRequests:[],blockedRequests:[]};
const check=(key,name,pass,details)=>{result.checks.push({key,name,pass:!!pass,...(details?{details}:{})});if(!pass)throw Error(name)};
try{for(const height of [1000,768])for(const width of [1280,390,320])for(const theme of ['light','dark']){
 const key=`${width}-${height}-${theme}`;const c=await browser.newContext({viewport:{width,height}});const p=await c.newPage();
 p.on('pageerror',e=>result.errors.push({key,message:e.message}));p.on('request',r=>{if(/\/(api|chat)\//.test(new URL(r.url()).pathname)||r.url().includes('prototype-disabled'))result.businessRequests.push({key,url:r.url()})});
 await c.route('**/*',r=>{const u=new URL(r.request().url());if(u.hostname==='127.0.0.1'&&u.port==='4353'||['data:','blob:'].includes(u.protocol))return r.continue();result.blockedRequests.push({key,url:u.href});return r.abort()});
 try{
 await p.goto('http://127.0.0.1:4353/',{waitUntil:'networkidle'});if(theme==='dark')await p.getByRole('button',{name:'深色',exact:true}).click();
 const pane=p.locator('[data-pane="after"]');const input=pane.locator('textarea[aria-label]');await input.fill('原聊天草稿，不发送');await p.getByRole('button',{name:'加入示例附件',exact:true}).click();const images=await pane.locator('img').count();
 await p.getByRole('combobox',{name:'演示场景'}).selectOption('supported-plan');await p.waitForTimeout(350);
 const objective=pane.getByText('先核对方案范围，再确认继续执行',{exact:true});const card=objective.locator('xpath=..');
 const hit=async(loc,name)=>{await loc.scrollIntoViewIfNeeded();await p.waitForTimeout(80);const d=await loc.evaluate(el=>{const r=el.getBoundingClientRect();return {rect:r.toJSON(),hit:el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))}});check(key,name,d.hit,d)};
 await hit(objective,'objective reachable');if(!await card.locator('details').evaluate(el=>el.open))await card.locator('summary').click();
 for(const t of ['仅模拟支持确认的方案编辑与布局；原输入、草稿、附件及队列均保留，不发送真实消息或运行任务。','核对并继续下一步任务','原输入、方案详情和调整意见可正常访问；本地演示不执行真实任务。'])await hit(card.getByText(t,{exact:true}),`detail ${t}`);
 check(key,'confirm enabled before feedback',await card.getByRole('button',{name:'确认并开始',exact:true}).isEnabled());await card.getByRole('button',{name:'调整方案',exact:true}).click();
 const feedback=card.getByRole('textbox',{name:'希望调整哪些内容？'});await feedback.fill('先保留原工具和附件，再核对验收标准。');await p.waitForTimeout(200);
 await hit(feedback,'feedback input reachable');await hit(card.getByRole('button',{name:'提交调整意见',exact:true}),'feedback submit reachable');check(key,'submit enabled without being clicked',await card.getByRole('button',{name:'提交调整意见',exact:true}).isEnabled());check(key,'confirm closed while unsent feedback',await card.getByRole('button',{name:'确认并开始',exact:true}).isDisabled());
 for(const name of ['编辑','立即发送','取消排队'])await hit(pane.getByRole('button',{name,exact:true}),`queue ${name}`);
 await hit(input,'original input');await hit(pane.locator('[data-composer-owner] img').first(),'attachment');await hit(pane.locator('button:has(svg.app-icon-wrench)'),'tools');check(key,'original draft retained',await input.inputValue()==='原聊天草稿，不发送');check(key,'attachment retained',await pane.locator('img').count()===images);check(key,'unsent feedback retained',await feedback.inputValue()==='先保留原工具和附件，再核对验收标准。');
 await hit(objective,'objective reachable after feedback');await hit(feedback,'feedback reachable after scrolling');await p.screenshot({path:`supported-${key}.png`,fullPage:true});
 await p.getByRole('combobox',{name:'演示场景'}).selectOption('unsupported-plan');await p.waitForTimeout(350);
 const recovered=pane.getByText('恢复已有方案，核对运行时的确认能力',{exact:true}).locator('xpath=..');const preserved=recovered.getByRole('textbox',{name:'希望调整哪些内容？'});
 check(key,'unsupported keeps unsent feedback',await preserved.inputValue()==='先保留原工具和附件，再核对验收标准。');check(key,'unsupported disables feedback',await preserved.isDisabled());check(key,'unsupported disables submit',await recovered.getByRole('button',{name:'提交调整意见',exact:true}).isDisabled());
 for(const name of ['确认并开始','取消调整','继续讨论'])check(key,`unsupported disables ${name}`,await recovered.getByRole('button',{name,exact:true}).isDisabled());check(key,'unsupported keeps original draft and attachment',await input.inputValue()==='原聊天草稿，不发送'&&await pane.locator('img').count()===images);check(key,'scenario stayed awaiting confirmation',await recovered.getByRole('status').innerText()==='待确认');
 }catch(e){result.checks.push({key,name:'journey',pass:false,error:e.message});await p.screenshot({path:`supported-${key}-failure.png`,fullPage:true})}finally{await c.close()}
}}finally{await browser.close();await writeFile('fit-supported.json',JSON.stringify(result,null,2));console.log(JSON.stringify({passed:result.checks.filter(c=>c.pass).length,failed:result.checks.filter(c=>!c.pass),errors:result.errors,businessRequests:result.businessRequests,blockedRequests:result.blockedRequests},null,2))}
