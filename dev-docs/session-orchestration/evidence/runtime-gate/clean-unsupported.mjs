import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)('playwright');
import {writeFile} from 'node:fs/promises';
const browser=await chromium.launch({headless:true,...(process.env.ORCH_CHROMIUM_PATH?{executablePath:process.env.ORCH_CHROMIUM_PATH}:{})});
const checks=[];
for(const width of [1280,390,320])for(const theme of ['light','dark']){
 const c=await browser.newContext({viewport:{width,height:1000}});const p=await c.newPage();
 await c.route('**/*',r=>{const u=new URL(r.request().url());return (u.hostname==='127.0.0.1'&&u.port==='4353'||['data:','blob:'].includes(u.protocol))?r.continue():r.abort()});
 await p.goto('http://127.0.0.1:4353/',{waitUntil:'networkidle'});
 if(theme==='dark')await p.getByRole('button',{name:'深色',exact:true}).click();
 await p.getByRole('combobox',{name:'演示场景'}).selectOption('unsupported-plan');await p.waitForTimeout(300);
 const pane=p.locator('[data-pane="after"]');await pane.locator('textarea').fill('原输入草稿保持可编辑');await p.getByRole('button',{name:'加入示例附件',exact:true}).click();
 const hint=pane.getByText(/此运行时暂不支持确认或调整任务方案/);
 const visible=await hint.evaluate(el=>{const r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))});
 checks.push({width,theme,name:'unsupported hint center unobscured',pass:visible});
 await p.screenshot({path:`independent-${width}-${theme}-unsupported-clean.png`,fullPage:true});
 await pane.locator('summary').filter({hasText:'方案详情'}).click();
 await p.screenshot({path:`independent-${width}-${theme}-unsupported-details-clean.png`,fullPage:true});await c.close();
}
await browser.close();await writeFile('clean-unsupported.json',JSON.stringify(checks,null,2));console.log(JSON.stringify(checks));
