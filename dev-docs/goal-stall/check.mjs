import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const browser = await chromium.launch({ headless: true, ...(process.env.GOAL_STALL_CHROMIUM ? { executablePath: process.env.GOAL_STALL_CHROMIUM } : {}) });
const evidence = fileURLToPath(new URL('./evidence/', import.meta.url));
await mkdir(evidence, { recursive: true });
const results = [];
try {
  for (const width of [1280, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 850 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('http://127.0.0.1:5194/dev-docs/goal-stall/preview.html');
    await page.getByText('响应超时（10 分钟无活动），目标需恢复，进度已保留。请核对执行结果后继续。', { exact: true }).waitFor();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    if (overflow || errors.length) throw new Error(JSON.stringify({ width, overflow, errors }));
    await page.screenshot({ path: `${evidence}/paused-${width}.png` });
    await page.getByRole('button', { name: '继续', exact: true }).click();
    await page.getByText('resume:1', { exact: true }).waitFor();
    await page.getByRole('button', { name: '取消目标', exact: true }).click();
    await page.getByText('cancel:1', { exact: true }).waitFor();
    results.push({ width, reasonVisible: true, resume: 1, cancel: 1, overflow, errors });
    await page.close();
  }
  await writeFile(`${evidence}/ui-results.json`, JSON.stringify({ synthetic: true, independentReview: false, results }, null, 2));
  console.log(JSON.stringify(results));
} finally { await browser.close(); }
