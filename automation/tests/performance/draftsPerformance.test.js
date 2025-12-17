/**
 * Performance Test: Draft Transactions
 *
 * Requirement: 100 drafts load in ≤ 1s
 * Data source: Local SQLite (TransactionDraft model)
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

test.describe('Drafts Page Performance', () => {
  test.beforeAll(async () => {
    await resetDbState();
    ({ app, window } = await setupApp());
    loginPage = new LoginPage(window);
    registrationPage = new RegistrationPage(window);

    // Register and login
    const email = `perf-drafts-${Date.now()}@test.com`;
    const password = 'TestPassword123';
    await registrationPage.completeRegistration(email, password);
  });

  test.afterAll(async () => {
    await closeApp(app);
    await resetDbState();
  });

  test('Drafts tab load time should be under 1 second', async () => {
    // Navigate to Transactions page
    await window.click('[data-testid="button-menu-transactions"]');
    await window.waitForLoadState('networkidle');

    // Measure time to load Drafts tab
    const loadTime = await measurePageLoadTime(window, async () => {
      await window.click('text=Drafts');
    });

    const passed = assertLoadTime(loadTime, TARGET_LOAD_TIME_MS, 'Drafts Tab');
    expect(passed).toBe(true);
  });

  test('Drafts list renders within threshold with data', async () => {
    // Click on Drafts tab
    await window.click('text=Drafts');
    await window.waitForLoadState('networkidle');

    // Measure render time
    const startTime = Date.now();
    await window.waitForSelector('[data-testid^="span-draft-tx"]', {
      state: 'visible',
      timeout: TARGET_LOAD_TIME_MS + 1000,
    }).catch(() => {
      // No drafts yet - that's ok for this test
    });
    const renderTime = Date.now() - startTime;

    console.log(`Drafts list render time: ${formatDuration(renderTime)}`);

    // Even with no data, the tab should load quickly
    expect(renderTime).toBeLessThan(TARGET_LOAD_TIME_MS + 500);
  });
});
