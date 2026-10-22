const viewportHeight=Number(process.env.ORCH_VIEWPORT_HEIGHT||768);
import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)('playwright');
import {writeFile} from 'node:fs/promises';
const browser=await chromium.launch({headless:true,...(process.env.ORCH_CHROMIUM_PATH?{executablePath:process.env.ORCH_CHROMIUM_PATH}:{})});
const checks=[];
for(const width of [1280,390,320])for(const theme of ['light','dark']){
 const c=await browser.newContext({viewport:{width,height:viewportHeight}});const p=await c.newPage();
 await c.route('**/*',r=>{const u=new URL(r.request().url());return (u.hostname==='127.0.0.1'&&u.port==='4353'||['data:','blob:'].includes(u.protocol))?r.continue():r.abort()});
 await p.goto('http://127.0.0.1:4353/',{waitUntil:'networkidle'});
 if(theme==='dark')await p.getByRole('button',{name:'深色',exact:true}).click();
 await p.getByRole('combobox',{name:'演示场景'}).selectOption('unsupported-plan');await p.waitForTimeout(300);
 const pane=p.locator('[data-pane="after"]');await pane.locator('textarea').fill('原输入草稿保持可编辑');await p.getByRole('button',{name:'加入示例附件',exact:true}).click();
 const objective=pane.getByText('恢复已有方案，核对运行时的确认能力',{exact:true});const card=objective.locator('xpath=..');
 const hit=async(loc,label,scroll=false)=>{if(scroll)await loc.scrollIntoViewIfNeeded();const d=await loc.evaluate(el=>{const r=el.getBoundingClientRect();const h=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return {rect:r.toJSON(),hit:el.contains(h),topElement:h?.tagName+':'+h?.className}});checks.push({width,theme,name:label,pass:d.hit,details:d})};
 await hit(pane.getByText(/此运行时暂不支持确认或调整任务方案/),'collapsed hint after card scroll',true);
 await p.screenshot({path:`fit-detail-${viewportHeight}-${width}-${theme}-collapsed.png`,fullPage:true});
 await card.locator('summary').click();await p.waitForTimeout(200);
 await hit(pane.getByText(/此运行时暂不支持确认或调整任务方案/),'expanded hint after card scroll',true);
 for(const text of ['原任务、历史成果、附件及草稿全部保留。当前场景模拟切换至不支持强确认的运行时。','核对并继续下一步任务','切换至支持的运行时后再确认；本地演示不执行真实任务。'])await hit(card.getByText(text,{exact:true}),`detail ${text}`,true);
 for(const label of ['确认并开始','调整方案','继续讨论'])await hit(card.getByRole('button',{name:label,exact:true}),label,true);
 for(const label of ['编辑','立即发送','取消排队'])await hit(pane.getByRole('button',{name:label,exact:true}),`queue ${label}`,true);
 await hit(pane.locator('textarea'),'input',true);await hit(pane.locator('[data-composer-owner] img').first(),'attachment',true);await hit(pane.locator('button:has(svg.app-icon-wrench)'),'tools',true);
 await p.screenshot({path:`fit-detail-${viewportHeight}-${width}-${theme}-expanded.png`,fullPage:true});
 checks.push({width,theme,name:'card geometry',details:await card.evaluate(el=>({rect:el.getBoundingClientRect().toJSON(),scrollTop:el.scrollTop,scrollHeight:el.scrollHeight,clientHeight:el.clientHeight}))});
 await c.close();
}
await browser.close();await writeFile(`fit-${viewportHeight}-detail-scroll.json`,JSON.stringify(checks,null,2));console.log(JSON.stringify(checks));
