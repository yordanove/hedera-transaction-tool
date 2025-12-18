/**
 * Browser Test - All Transactions (Proof of Concept)
 *
 * Demonstrates k6 browser module for actual browser-based testing.
 * This is a POC - not intended for production use yet.
 */

import { browser } from 'k6/browser';
import { Trend } from 'k6/metrics';
import type { K6Options } from '../types';

const totalIdleTime = new Trend('browser_total_time_to_idle');

/**
 * k6 options configuration with browser scenario
 */
export const options: K6Options = {
  scenarios: {
    browser_test: {
      executor: 'constant-vus',
      vus: 1,
      duration: '10s',
      // Note: browser options are handled by k6 runtime
    },
  },
};

/**
 * Main test function - browser-based test
 */
export default async function (): Promise<void> {
  const page = await browser.newPage();

  const startTime = Date.now();
  await page.goto('https://test.k6.io/browser.php');

  // Example of locator usage (not used in this POC)
  const _checkbox = page.locator('#checkbox1');
  void _checkbox; // Acknowledge unused variable

  await page.waitForLoadState('networkidle');

  const timeToIdle = Date.now() - startTime;
  totalIdleTime.add(timeToIdle);

  console.log(`Total Idle: ${timeToIdle}ms`);
}
