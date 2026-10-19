import { expect, test, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// Isolated, synthetic Web prototype checks; never uses the daily desktop client.
const runId = process.env.EXECUTION_TRACE_RUN_ID ?? new Date().toISOString().replace(/[:.]/g, '-');
const evidence = fileURLToPath(new URL(`../evidence/execution-trace-independent-${runId}/`, import.meta.url));
test.use({ channel: 'chrome', viewport: { width: 1100, height: 1200 } });

async function measure(page: Page) {
  return page.evaluate(() => {
    const get = (selector: string) => document.querySelector<HTMLElement>(selector)!;
    const box = (el: HTMLElement) => {
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom,
        clientWidth: el.clientWidth, scrollWidth: el.scrollWidth };
    };
    const trace = get('.execution-trace');
    const viewport = get('.chat-scroll');
    const title = get('.execution-summary strong');
    return {
      screen: box(get('[data-testid="device-screen"]')),
      viewport: box(viewport), composer: box(get('.composer-wrap')),
      trace: box(trace), toggle: box(get('.execution-toggle')),
      marker: { ...box(get('.execution-marker')), flex: getComputedStyle(get('.execution-marker')).flex },
      summary: { ...box(get('.execution-summary')), flex: getComputedStyle(get('.execution-summary')).flex },
      title: { ...box(title), text: title.textContent },
      status: { ...box(get('.execution-state')), flex: getComputedStyle(get('.execution-state')).flex },
      state: trace.dataset.state,
      accessibleName: get('.execution-toggle').getAttribute('aria-label'),
      reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
      steps: Array.from(trace.querySelectorAll<HTMLElement>('li')).map(el => ({
        ...box(el), state: el.dataset.state, current: el.getAttribute('aria-current'),
        title: el.querySelector('strong')?.textContent,
        animationNames: Array.from(el.querySelectorAll('i')).map(bar => getComputedStyle(bar).animationName),
      })),
    };
  });
}

for (const device of ['iphone', 'pixel-10'] as const) {
  for (const motion of ['no-preference', 'reduce'] as const) {
    test(`${device}: pending label, compact width and running steps (${motion})`, async ({ page, browser }) => {
      await mkdir(evidence, { recursive: true });
      const errors: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('console', message => { if (message.type() === 'error') errors.push(`${message.location().url}: ${message.text()}`); });
      await page.emulateMedia({ reducedMotion: motion });
      await page.goto('/');
      if (device === 'pixel-10') {
        await page.getByTestId('device-picker').click();
        await page.getByTestId('device-option-pixel-10').click();
      }
      await expect(page.getByTestId('device-screen')).toHaveAttribute('data-device', device);
      const results: Record<string, unknown> = { device, motion, browser: browser.version(), scope: 'local-synthetic-web-only' };
      const capture = async (state: string) => {
        await page.screenshot({ path: `${evidence}/${device}-${motion}-${state}.png` });
        const metrics = await measure(page);
        results[state] = metrics;
        expect(metrics.screen.width).toBe(device === 'iphone' ? 393 : 427);
        expect(metrics.screen.height).toBe(device === 'iphone' ? 852 : 952);
        expect(metrics.marker.width).toBeCloseTo(20, 0);
        expect(metrics.status.width).toBeLessThan(50);
        expect(metrics.summary.width).toBeGreaterThan(170);
        expect(metrics.title.scrollWidth).toBeLessThanOrEqual(metrics.title.clientWidth + 1);
        expect(metrics.trace.x).toBeGreaterThanOrEqual(metrics.viewport.x);
        expect(metrics.trace.right).toBeLessThanOrEqual(metrics.viewport.right);
        expect(metrics.trace.y).toBeGreaterThanOrEqual(metrics.viewport.y);
        expect(metrics.trace.bottom).toBeLessThanOrEqual(metrics.viewport.bottom + 1);
        expect(metrics.viewport.bottom).toBeLessThanOrEqual(metrics.composer.y + 1);
        expect(metrics.steps.every(step => step.scrollWidth <= step.clientWidth + 1)).toBe(true);
        return metrics;
      };
      try {
        await page.getByRole('button', { name: '打开会话：接口联调', exact: true }).click();
        const toggle = page.locator('.execution-toggle');
        await expect(toggle).toHaveAccessibleName('查看执行步骤：正在处理你的要求');
        await capture('running-collapsed');
        await toggle.click();
        await expect(page.locator('.trace-steps li')).toHaveCount(4);
        const running = page.locator('.trace-steps li[aria-current="step"]');
        await expect(running).toHaveCount(1);
        await expect(running).toHaveAttribute('data-state', 'running');
        await expect(running.locator('strong')).toHaveText('处理当前要求');
        await expect(running.locator('.piano-roll')).toHaveAttribute('aria-hidden', 'true');
        await expect(running.locator('i')).toHaveCount(12);
        const active = await capture('running-expanded');
        expect(active.steps.map(step => step.state)).toEqual(['done', 'done', 'running', 'pending']);
        expect(active.steps[2].animationNames.every(name => name === (motion === 'reduce' ? 'none' : 'piano-key'))).toBe(true);
        await page.getByRole('button', { name: '返回会话列表', exact: true }).click();
        await page.getByRole('button', { name: '打开会话：产品周报', exact: true }).click();
        await expect(toggle).toHaveAccessibleName('查看执行步骤：等待确认后继续');
        const pending = await capture('pending-collapsed');
        expect(pending.state).toBe('pending');
        await toggle.click();
        await expect(toggle).toHaveAccessibleName('收起执行步骤：等待确认后继续');
        const waiting = await capture('pending-expanded');
        expect(waiting.steps.map(step => step.state)).toEqual(['done', 'done', 'pending', 'pending']);
        await expect(page.locator('.trace-steps [aria-current="step"]')).toHaveCount(0);
        await expect(page.locator('.piano-roll')).toHaveCount(0);
        // Chrome requests an optional favicon even though this prototype declares none.
        // Retain that 404 in evidence; application/resource errors remain failures.
        expect(errors.filter(error => !/^http:\/\/127\.0\.0\.1:\d+\/favicon\.ico: Failed to load resource:.*404/.test(error))).toEqual([]);
      } finally {
        results.consoleErrors = errors;
        await writeFile(`${evidence}/${device}-${motion}-metrics.json`, JSON.stringify(results, null, 2) + '\n');
      }
    });
  }
}
