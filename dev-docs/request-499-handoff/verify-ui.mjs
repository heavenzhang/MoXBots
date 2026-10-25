import { chromium } from 'playwright';
import fs from 'node:fs/promises';
const out = process.argv[2];
if (!out) throw new Error('Provide an absolute evidence output directory');
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true,
  ...(process.env.MOXBOTS_QA_CHROMIUM ? { executablePath: process.env.MOXBOTS_QA_CHROMIUM } : {}) });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
try {
  await page.goto('http://127.0.0.1:4349/dev-docs/request-499-handoff/preview.html', { waitUntil: 'networkidle' });
  const summary = page.getByRole('button', { name: /任务编排/ });
  await summary.waitFor();
  await summary.click();
  if (!await page.getByText('正在验证停止与继续执行', { exact: true }).isVisible()) throw new Error('Running task missing');
  await page.screenshot({ path: out + '/running-1280.png' });
  await page.getByRole('button', { name: '模拟执行停止' }).click();
  await page.getByText('已中断', { exact: true }).waitFor();
  if ((await summary.textContent()).includes('执行中')) throw new Error('Stopped task still advertises executing');
  if (!await page.getByText('待验收', { exact: true }).isVisible()) throw new Error('Review state was lost');
  await page.screenshot({ path: out + '/stopped-1280.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) throw new Error('Horizontal viewport overflow');
  await page.screenshot({ path: out + '/stopped-390.png' });
  await page.getByRole('button', { name: '模拟新请求开始' }).click();
  await page.getByText('正在验证停止与继续执行', { exact: true }).waitFor();
  await page.getByRole('region', { name: '任务编排详情' }).press('Escape');
  if (await page.getByRole('region', { name: '任务编排详情' }).count()) throw new Error('Escape did not collapse details');
  if (errors.length) throw new Error(errors.join('\n'));
  const result = { scope: 'Synthetic transitions with production ExecutionStatusBar and task projection',
    viewports: [1280, 390], passed: true,
    checks: ['running activity', 'Stop shows interrupted', 'review preserved', 'new input activity', 'Escape collapses', 'no horizontal overflow', 'no browser errors'] };
  await fs.writeFile(out + '/result.json', JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify({ out, ...result }));
} finally { await browser.close(); }
