/**
 * Performance Test: Accounts Page
 *
 * Requirement: 100 accounts in DB, page load (50 visible) in ≤ 1s
 * Data source: Local SQLite (HederaAccount model)
 *
 * Note: UI paginates at max 50 items per page.
 */

import { test, expect, ElectronApplication, Page } from '@playwright/test';
import { setupApp, closeApp } from '../../utils/util.js';
import { resetDbState } from '../../utils/databaseUtil.js';
import { RegistrationPage } from '../../pages/RegistrationPage.js';
import { seedLocalPerfData } from './seed-local-perf-data.js';
import {
  TARGET_LOAD_TIME_MS,
  collectPerformanceSamples,
  waitForRowCount,
  setPageSize,
  formatDuration,
} from './performanceUtils.js';

const DB_ITEM_COUNT = 100;
const PAGE_SIZE = 50;
const ACCOUNT_ROW_SELECTOR = '.table tbody tr';

let app: ElectronApplication;
let window: Page;
let registrationPage: RegistrationPage;
let testEmail: string;
let seededCount: number;

test.describe('Accounts Page Performance', () => {
  test.beforeAll(async () => {
    await resetDbState();
    ({ app, window } = await setupApp());
    registrationPage = new RegistrationPage(window);

    // Register and login
    testEmail = `perf-accounts-${Date.now()}@test.com`;
    const password = 'TestPassword123';
    await registrationPage.completeRegistration(testEmail, password);

    // Seed test data
    const result = await seedLocalPerfData(testEmail);
    seededCount = result.accounts;
    console.log(`Seeded ${seededCount} accounts for performance test`);
  });

  test.afterAll(async () => {
    await closeApp(app);
    await resetDbState();
  });

  test('Verify 100 accounts seeded to DB', async () => {
    expect(seededCount).toBeGreaterThanOrEqual(DB_ITEM_COUNT);
  });

  test('Accounts page should load in under 1 second (p95)', async () => {
    // Collect multiple samples for p95
    const samples = await collectPerformanceSamples(async () => {
      // Navigate away first
      await window.click('[data-testid="button-menu-transactions"]');
      await window.waitForLoadState('networkidle');

      // Measure page load time
      const startTime = Date.now();
      await window.click('[data-testid="button-menu-accounts"]');
      await window.waitForLoadState('networkidle');
      const loadTime = Date.now() - startTime;

      return loadTime;
    }, 5);

    console.log(`Accounts p95: ${formatDuration(samples.p95)}, avg: ${formatDuration(samples.avg)}`);
    console.log(`  Samples: ${samples.values.map((v) => formatDuration(v)).join(', ')}`);

    expect(samples.p95).toBeLessThan(TARGET_LOAD_TIME_MS);
  });
});
