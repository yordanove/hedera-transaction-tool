/**
 * Performance Test: Accounts Page
 *
 * Requirement: 100+ accounts load in ≤ 1s
 * Data source: Local SQLite (HederaAccount model)
 */

import { test, expect, ElectronApplication, Page } from '@playwright/test';
import { setupApp, closeApp } from '../../utils/util.js';
import { resetDbState } from '../../utils/databaseUtil.js';
import { LoginPage } from '../../pages/LoginPage.js';
import { RegistrationPage } from '../../pages/RegistrationPage.js';
import {
  TARGET_LOAD_TIME_MS,
  measurePageLoadTime,
  formatDuration,
  assertLoadTime,
} from './performanceUtils.js';

let app: ElectronApplication;
let window: Page;
let loginPage: LoginPage;
let registrationPage: RegistrationPage;

test.describe('Accounts Page Performance', () => {
  test.beforeAll(async () => {
    await resetDbState();
    ({ app, window } = await setupApp());
    loginPage = new LoginPage(window);
    registrationPage = new RegistrationPage(window);

    // Register and login
    const email = `perf-accounts-${Date.now()}@test.com`;
    const password = 'TestPassword123';
    await registrationPage.completeRegistration(email, password);
  });

  test.afterAll(async () => {
    await closeApp(app);
    await resetDbState();
  });

  test('Accounts page load time should be under 1 second', async () => {
    // Measure navigation to Accounts page
    const loadTime = await measurePageLoadTime(window, async () => {
      await window.click('[data-testid="button-menu-accounts"]');
    });

    const passed = assertLoadTime(loadTime, TARGET_LOAD_TIME_MS, 'Accounts Page');
    expect(passed).toBe(true);
  });

  test('Accounts list renders within threshold', async () => {
    // Navigate to Accounts
    await window.click('[data-testid="button-menu-accounts"]');

    // Measure time until list is visible
    const startTime = Date.now();
    await window.waitForLoadState('networkidle');

    // Wait for either accounts list or empty state
    await Promise.race([
      window.waitForSelector('.table', { state: 'visible', timeout: TARGET_LOAD_TIME_MS + 1000 }),
      window.waitForSelector('[data-testid="accounts-empty"]', {
        state: 'visible',
        timeout: TARGET_LOAD_TIME_MS + 1000,
      }),
    ]).catch(() => {
      // Page loaded but no specific element found
    });

    const renderTime = Date.now() - startTime;
    console.log(`Accounts list render time: ${formatDuration(renderTime)}`);

    expect(renderTime).toBeLessThan(TARGET_LOAD_TIME_MS + 500);
  });
});
