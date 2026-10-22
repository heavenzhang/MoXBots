import {chromium} from 'playwright';
import {writeFile} from 'node:fs/promises';
const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{})});
const results={boundary:'Production Provider/ProcessRow association/Results/Composer components; synthetic Agent, chat sending and Inspector shell. No full Chat/native/Provider acceptance.',checks:[],errors:[],blockedRequests:[],businessRequests:[],screenshots:[]};
const check=(name,condition,details)=>{results.checks.push({name,pass:!!condition,...(details?{details}:{})});if(!condition)throw Error(name)};
const screenshot=async(page,name)=>{const path=`evidence/independent-${name}.png`;await page.screenshot({path,fullPage:true});results.screenshots.push(path)};
try {
for(const width of [1280,390,320])for(const theme of ['light','dark']){
 const context=await browser.newContext({viewport:{width,height:1000},deviceScaleFactor:1});
 const page=await context.newPage();const key=`${width}-${theme}`;
 page.on('pageerror',error=>results.errors.push({key,error:error.message}));
 page.on('request',request=>{if(/\/(api|chat)\//.test(new URL(request.url()).pathname)||request.url().includes('prototype-disabled'))results.businessRequests.push({key,url:request.url()})});
 await context.route('**/*',async route=>{const u=new URL(route.request().url());if(u.protocol==='http:'&&u.hostname==='127.0.0.1'&&u.port==='4352')return route.continue();if(['data:','blob:'].includes(u.protocol))return route.continue();results.blockedRequests.push({key,url:u.href});return route.abort()});
 try {
 await page.goto((process.env.ORCHESTRATION_PREVIEW_URL??'http://127.0.0.1:4352/'),{waitUntil:'networkidle'});
 if(theme==='dark')await page.getByRole('button',{name:'深色',exact:true}).click();
 const pane=page.locator('[data-pane="after"]');const input=pane.locator('textarea');
 await input.waitFor({state:'visible'});await page.waitForTimeout(250);
 check(`${key}: native associations`,await pane.locator('[data-session-task-association]').count()===2);
 const overflow=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,width:innerWidth}));
 check(`${key}: no horizontal overflow`,overflow.scroll<=overflow.width,overflow);
 const box=await input.boundingBox();check(`${key}: composer visible`,box&&box.x>=0&&box.y>=0&&box.x+box.width<=width+1&&box.y+box.height<=1000,box);
 check(`${key}: task count before review`,(await pane.innerText()).includes('任务编排 1/4'));
 await screenshot(page,`${key}-returned`);
 await pane.getByRole('button',{name:'查看成果',exact:true}).last().click();
 check(`${key}: simulated Inspector shell opens`,await page.getByRole('dialog',{name:'原子 Agent 详情'}).isVisible());
 await page.keyboard.press('Escape');
 check(`${key}: Inspector shell Escape`,await page.getByRole('dialog',{name:'原子 Agent 详情'}).count()===0);
 await input.fill('保留原草稿');await page.getByRole('button',{name:'加入示例附件',exact:true}).click();
 const attachmentCount=await pane.locator('img').count();
 await pane.getByRole('button',{name:'提出返工意见',exact:true}).click();
 check(`${key}: rework appends draft`,(await input.inputValue()).startsWith('保留原草稿')&&(await input.inputValue()).includes('返工'));
 check(`${key}: rework keeps attachment`,await pane.locator('img').count()===attachmentCount,{attachmentCount});
 check(`${key}: rework focuses composer`,await input.evaluate(el=>el===document.activeElement));
 check(`${key}: rework does not mutate phase`,await page.evaluate(()=>window.comparisonState().stage)==='returned');
 const draft=await input.inputValue();
 await pane.getByRole('button',{name:'编辑',exact:true}).click();
 check(`${key}: queue edit preserves occupied composer`,await input.inputValue()===draft&&await pane.locator('img').count()===attachmentCount);
 check(`${key}: native tools control retained`,await pane.locator('button:has(svg.app-icon-wrench)').count()===1&&await pane.locator('button:has(svg.app-icon-wrench)').isVisible());
 await page.getByRole('button',{name:'增强前',exact:true}).click();
 check(`${key}: before keeps draft`,await page.locator('[data-pane="before"] textarea').inputValue()===draft);
 await page.getByRole('button',{name:'增强后',exact:true}).click();
 check(`${key}: after keeps draft and attachments`,await input.inputValue()===draft&&await pane.locator('img').count()===attachmentCount);
 await pane.getByRole('button',{name:'让主 Agent 验收',exact:true}).click();
 check(`${key}: request only enters review`,await page.evaluate(()=>window.comparisonState().stage)==='review');
 check(`${key}: request is not acceptance`,(await pane.innerText()).includes('任务编排 1/4'));
 await screenshot(page,`${key}-review`);
 await page.getByRole('button',{name:'推进模拟事件',exact:true}).click();
 check(`${key}: simulated completion is 4/4`,(await pane.innerText()).includes('任务编排 4/4'));
 await screenshot(page,`${key}-accepted`);
 await page.getByRole('combobox',{name:'演示场景'}).selectOption('approval');
 const allow=pane.getByRole('button',{name:'允许一次',exact:true});await allow.scrollIntoViewIfNeeded();
 await page.waitForTimeout(300);
 const beforeHit=await allow.evaluate(el=>{const r=el.getBoundingClientRect();return {rect:r.toJSON(),hit:el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))}});
 results.checks.push({name:`${key}: fixture automatic approval tail positioning`,pass:beforeHit.hit,details:beforeHit,boundary:'Fixture scrollToIndex LAST; not a full production Chat scroll-controller test.'});
 if(!beforeHit.hit){await pane.locator('.chat-live').hover({position:{x:Math.min(130,width-30),y:120}});await page.mouse.wheel(0,2500);await page.waitForTimeout(300)}
 const actualHit=await allow.evaluate(el=>{const r=el.getBoundingClientRect();return {rect:r.toJSON(),hit:el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))}});
 check(`${key}: original approval reachable and unobscured after native scroll`,actualHit.hit,actualHit);
 check(`${key}: original deny reachable`,await pane.getByRole('button',{name:'拒绝',exact:true}).isVisible());
 await screenshot(page,`${key}-approval`);
 await allow.click();
 check(`${key}: tool approval not acceptance`,await page.evaluate(()=>!window.comparisonState().permission&&window.comparisonState().stage==='approval'));
 await page.getByRole('combobox',{name:'演示场景'}).selectOption('rework');
 check(`${key}: rework keeps accepted task`,(await pane.innerText()).includes('任务编排 2/4'));
 await screenshot(page,`${key}-rework`);
 await context.close();
 }catch(error){results.checks.push({name:`${key}: fixture journey`,pass:false,error:error.message});await screenshot(page,`${key}-failure`);await context.close()}
}
}finally{await browser.close();await writeFile('evidence/independent-ui.json',JSON.stringify(results,null,2));console.log(JSON.stringify({passed:results.checks.filter(x=>x.pass).length,failed:results.checks.filter(x=>!x.pass),errors:results.errors,blockedRequests:results.blockedRequests,businessRequests:results.businessRequests},null,2))}
