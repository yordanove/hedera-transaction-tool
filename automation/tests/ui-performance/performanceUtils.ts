/**
 * Performance Testing Utilities
 *
 * Helpers for measuring page load times and UI responsiveness.
 */

import { Page } from '@playwright/test';

export const TARGET_LOAD_TIME_MS = 1000;

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
