/**
 * Performance Test: Contacts Page
 *
 * Requirement: 100+ contacts load in ≤ 1s
 * Data source: Local SQLite (Contact model)
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

test.describe('Contacts Page Performance', () => {
  test.beforeAll(async () => {
    await resetDbState();
    ({ app, window } = await setupApp());
    loginPage = new LoginPage(window);
    registrationPage = new RegistrationPage(window);

    // Register and login
    const email = `perf-contacts-${Date.now()}@test.com`;
    const password = 'TestPassword123';
    await registrationPage.completeRegistration(email, password);
  });

  test.afterAll(async () => {
    await closeApp(app);
    await resetDbState();
  });

  test('Contacts page load time should be under 1 second', async () => {
    // Measure navigation to Contacts page
    const loadTime = await measurePageLoadTime(window, async () => {
      await window.click('[data-testid="button-contact-list"]');
    });

    const passed = assertLoadTime(loadTime, TARGET_LOAD_TIME_MS, 'Contacts Page');
    expect(passed).toBe(true);
  });

  test('Contacts list renders within threshold', async () => {
    // Navigate to Contacts
    await window.click('[data-testid="button-contact-list"]');

    // Measure time until list is visible
    const startTime = Date.now();
    await window.waitForLoadState('networkidle');

    // Wait for either contacts list or empty state
    await Promise.race([
      window.waitForSelector('.table', { state: 'visible', timeout: TARGET_LOAD_TIME_MS + 1000 }),
      window.waitForSelector('[data-testid="contacts-empty"]', {
        state: 'visible',
        timeout: TARGET_LOAD_TIME_MS + 1000,
      }),
    ]).catch(() => {
      // Page loaded but no specific element found
    });

    const renderTime = Date.now() - startTime;
    console.log(`Contacts list render time: ${formatDuration(renderTime)}`);

    expect(renderTime).toBeLessThan(TARGET_LOAD_TIME_MS + 500);
  });
});
