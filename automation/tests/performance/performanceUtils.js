/**
 * Performance Testing Utilities
 *
 * Helpers for measuring page load times and UI responsiveness.
 */

const TARGET_LOAD_TIME_MS = 1000;

/**
 * Measures time from navigation start to page idle
 * @param {Page} window - Playwright page/window
 * @param {Function} navigationAction - Async function that triggers navigation
 * @returns {Promise<number>} Load time in milliseconds
 */
async function measurePageLoadTime(window, navigationAction) {
  const startTime = Date.now();
  await navigationAction();
  await window.waitForLoadState('networkidle');
  return Date.now() - startTime;
}

/**
 * Measures time for a specific element to appear
 * @param {Page} window - Playwright page/window
 * @param {string} selector - Element selector to wait for
 * @param {Function} action - Async function that triggers the action
 * @returns {Promise<number>} Time in milliseconds
 */
async function measureElementAppearTime(window, selector, action) {
  const startTime = Date.now();
  await action();
  await window.waitForSelector(selector, { state: 'visible', timeout: 10000 });
  return Date.now() - startTime;
}

/**
 * Collects multiple performance samples
 * @param {Function} measureFn - Async function that returns a timing value
 * @param {number} samples - Number of samples to collect
 * @returns {Promise<{avg: number, min: number, max: number, p95: number, values: number[]}>}
 */
async function collectPerformanceSamples(measureFn, samples = 5) {
  const values = [];

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
 * @param {number} ms - Duration in milliseconds
 * @returns {string} Formatted duration
 */
function formatDuration(ms) {
  if (ms < 1000) {
    return `${Math.round(ms)}ms`;
  }
  return `${(ms / 1000).toFixed(2)}s`;
}

/**
 * Asserts load time is within threshold
 * @param {number} actualMs - Actual load time in milliseconds
 * @param {number} thresholdMs - Threshold in milliseconds
 * @param {string} pageName - Page name for error message
 */
function assertLoadTime(actualMs, thresholdMs, pageName) {
  const passed = actualMs <= thresholdMs;
  console.log(
    `${pageName}: ${formatDuration(actualMs)} - ${passed ? 'PASS' : 'FAIL'} (threshold: ${formatDuration(thresholdMs)})`,
  );
  return passed;
}

module.exports = {
  TARGET_LOAD_TIME_MS,
  measurePageLoadTime,
  measureElementAppearTime,
  collectPerformanceSamples,
  formatDuration,
  assertLoadTime,
};
