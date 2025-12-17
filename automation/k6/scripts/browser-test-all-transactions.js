// Proof of concept - k6 browser module

import { browser } from 'k6/browser';
import { Trend } from 'k6/metrics';
import { check } from 'k6';

const totalIdleTime = new Trend('browser_total_time_to_idle');

export const options = {
  scenarios: {
    browser_test: {
      executor: 'constant-vus',
      vus: 1,
      duration: '10s',
      options: {
        browser: { type: 'chromium' },
      },
    },
  },
};

export default async function () {
  const page = await browser.newPage();

  const startTime = Date.now();
  await page.goto('https://test.k6.io/browser.php');

  const checkbox = page.locator('#checkbox1');

  await page.waitForLoadState('networkidle');

  const timeToIdle = Date.now() - startTime;
  totalIdleTime.add(timeToIdle);

  console.log(`Total Idle: ${timeToIdle}ms`);
}
