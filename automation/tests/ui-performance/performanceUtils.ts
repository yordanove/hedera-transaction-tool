/**
 * Performance Testing Utilities
 *
 * Helpers for measuring page load times and UI responsiveness.
 */

import { Page } from '@playwright/test';
import { DATA_VOLUMES, THRESHOLDS } from '../../k6/src/config/constants.js';

// Re-export k6 constants for UI perf tests (SSOT)
export { DATA_VOLUMES, THRESHOLDS };

// UI-specific constants
export const TARGET_LOAD_TIME_MS = THRESHOLDS.PAGE_LOAD_MS;
export const PAGE_SIZE = 50; // Max visible items per page in UI
export const ROW_WAIT_TIMEOUT_MS = 5000; // Default timeout for waitForRowCount
export const TRANSACTION_ROW_SELECTOR = '.table-custom tbody tr'; // Transaction table rows

export interface PerformanceSamples {
  avg: number;
  min: number;
  max: number;
  p95: number;
  values: number[];
}

/**
 * Measures time from navigation start to page idle
 */
export async function measurePageLoadTime(
  window: Page,
  navigationAction: () => Promise<void>,
): Promise<number> {
  const startTime = Date.now();
  await navigationAction();
  await window.waitForLoadState('networkidle');
  return Date.now() - startTime;
}

/**
 * Measures time for a specific element to appear
 */
export async function measureElementAppearTime(
  window: Page,
  selector: string,
  action: () => Promise<void>,
): Promise<number> {
  const startTime = Date.now();
  await action();
  await window.waitForSelector(selector, { state: 'visible', timeout: 10000 });
  return Date.now() - startTime;
}

/**
 * Collects multiple performance samples
 */
export async function collectPerformanceSamples(
  measureFn: () => Promise<number>,
  samples: number = 5,
): Promise<PerformanceSamples> {
  const values: number[] = [];

  for (let i = 0; i < samples; i++) {
    const time = await measureFn();
    values.push(time);
  }

  values.sort((a, b) => a - b);

  return {
    avg: values.reduce((a, b) => a + b, 0) / values.length,
    min: values[0],
    max: values[values.length - 1],
    p95: values[Math.floor(values.length * 0.95)],
    values,
  };
}

/**
 * Formats duration for display
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${Math.round(ms)}ms`;
  }
  return `${(ms / 1000).toFixed(2)}s`;
}

/**
 * Asserts load time is within threshold
 */
export function assertLoadTime(
  actualMs: number,
  thresholdMs: number,
  pageName: string,
): boolean {
  const passed = actualMs <= thresholdMs;
  console.log(
    `${pageName}: ${formatDuration(actualMs)} - ${passed ? 'PASS' : 'FAIL'} (threshold: ${formatDuration(thresholdMs)})`,
  );
  return passed;
}

/**
 * Wait for a minimum number of rows to appear in a list
 * Returns the actual count found
 */
export async function waitForRowCount(
  window: Page,
  rowSelector: string,
  minCount: number,
  timeout: number = ROW_WAIT_TIMEOUT_MS,
): Promise<number> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const rows = await window.$$(rowSelector);
    if (rows.length >= minCount) {
      return rows.length;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  // Return final count even if below threshold
  const finalRows = await window.$$(rowSelector);
  return finalRows.length;
}

/**
 * Measure list load time with row count verification
 * Waits for minCount rows and returns timing + actual count
 */
export async function measureListLoadTime(
  window: Page,
  navigationAction: () => Promise<void>,
  rowSelector: string,
  minCount: number,
  timeout: number = ROW_WAIT_TIMEOUT_MS,
): Promise<{ loadTime: number; rowCount: number }> {
  const startTime = Date.now();
  await navigationAction();

  const rowCount = await waitForRowCount(window, rowSelector, minCount, timeout);
  const loadTime = Date.now() - startTime;

  return { loadTime, rowCount };
}

/**
 * Set page size using the AppPager dropdown
 * @param window - Playwright page
 * @param size - Page size to select (5, 10, 20, or 50)
 * @returns true if page size was set, false if pager not found
 */
export async function setPageSize(window: Page, size: 5 | 10 | 20 | 50): Promise<boolean> {
  const dropdown = window.locator('.pager-per-page select');

  // Check if pager exists (some pages don't have it)
  const isVisible = await dropdown.isVisible().catch(() => false);
  if (!isVisible) {
    return false;
  }

  await dropdown.selectOption(String(size));
  await window.waitForLoadState('networkidle');
  return true;
}

/**
 * Get total items from AppPager "X-Y of Z items" text
 * @param window - Playwright page
 * @returns Total item count, or null if pager not found
 */
export async function getPagerTotal(window: Page): Promise<number | null> {
  const pagerText = await window.locator('.pager-shown-items').textContent().catch(() => null);
  if (!pagerText) return null;
  // Parse "1-50 of 200 items" → 200
  const match = pagerText.match(/of\s+(\d+)\s+items/);
  return match ? parseInt(match[1], 10) : null;
}
