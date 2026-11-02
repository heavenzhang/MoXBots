import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {writeFile} from 'node:fs/promises';
export async function runJourneys(page,out) {
 const root=page.locator('.project-board');
 const overview=root.locator('.pb-project-overview');
 await overview.waitFor();
 const counts=await overview.innerText();
 await root.getByRole('button',{name:'列表',exact:true}).click();
 await root.getByRole('searchbox').fill('no matching work');
 assert.equal(await overview.innerText(),counts);
 await root.getByRole('searchbox').fill('');
 const results=[];
 for(const width of [1440,1024,768,540]) {
  await page.setViewportSize({width,height:1000});
  await page.screenshot({path:resolve(out,`overview-list-${width}.png`)});
  assert(await root.evaluate(el=>el.scrollWidth<=el.clientWidth+1),'board must not overflow horizontally');
  results.push({width,passed:true});
 }
 await page.setViewportSize({width:1440,height:1000});
 await root.locator('.pb-row-menu summary').first().click();
 assert(await root.locator('.pb-row-menu[open]').count()>0);
 await page.screenshot({path:resolve(out,'overview-actions.png')});
 await writeFile(resolve(out,'overview-results.json'),JSON.stringify({synthetic:true,overviewStable:true,menuAccessible:true,viewports:results},null,2));
}
