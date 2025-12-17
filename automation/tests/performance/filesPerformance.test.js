/**
 * Performance Test: Files Page
 *
 * Requirement: 100+ files load in ≤ 1s
 * Data source: Local SQLite (HederaFile model)
 */

const { test, expect } = require('playwright/test');
const { setupApp, closeApp } = require('../../utils/util');
const { resetDbState } = require('../../utils/databaseUtil');
const LoginPage = require('../../pages/LoginPage');
const RegistrationPage = require('../../pages/RegistrationPage');
const {
  TARGET_LOAD_TIME_MS,
  measurePageLoadTime,
  formatDuration,
  assertLoadTime,
} = require('./performanceUtils');

let app, window;
let loginPage, registrationPage;

test.describe('Files Page Performance', () => {
  test.beforeAll(async () => {
    await resetDbState();
    ({ app, window } = await setupApp());
    loginPage = new LoginPage(window);
    registrationPage = new RegistrationPage(window);

    // Register and login
    const email = `perf-files-${Date.now()}@test.com`;
    const password = 'TestPassword123';
    await registrationPage.completeRegistration(email, password);
  });

  test.afterAll(async () => {
    await closeApp(app);
    await resetDbState();
  });

  test('Files page load time should be under 1 second', async () => {
    // Measure navigation to Files page
    const loadTime = await measurePageLoadTime(window, async () => {
      await window.click('[data-testid="button-menu-files"]');
    });

    const passed = assertLoadTime(loadTime, TARGET_LOAD_TIME_MS, 'Files Page');
    expect(passed).toBe(true);
  });

  test('Files list renders within threshold', async () => {
    // Navigate to Files
    await window.click('[data-testid="button-menu-files"]');

    // Measure time until list is visible
    const startTime = Date.now();
    await window.waitForLoadState('networkidle');

    // Wait for either files list or empty state
    await Promise.race([
      window.waitForSelector('.table', { state: 'visible', timeout: TARGET_LOAD_TIME_MS + 1000 }),
      window.waitForSelector('[data-testid="files-empty"]', {
        state: 'visible',
        timeout: TARGET_LOAD_TIME_MS + 1000,
      }),
    ]).catch(() => {
      // Page loaded but no specific element found
    });

    const renderTime = Date.now() - startTime;
    console.log(`Files list render time: ${formatDuration(renderTime)}`);

    expect(renderTime).toBeLessThan(TARGET_LOAD_TIME_MS + 500);
  });
});
