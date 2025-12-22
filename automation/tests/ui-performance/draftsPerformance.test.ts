/**
 * Performance Test: Draft Transactions
 *
 * Requirement: 100 drafts in DB, page load (50 visible) in ≤ 1s
 * Data source: Local SQLite (TransactionDraft model)
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
  getPagerTotal,
  PAGE_SIZE,
  DATA_VOLUMES,
} from './performanceUtils.js';

// Volume requirement from k6 constants (SSOT)
const DB_ITEM_COUNT = DATA_VOLUMES.DRAFTS;
const REQUIRED_TOTAL = DATA_VOLUMES.DRAFTS;
const DRAFT_ROW_SELECTOR = '[data-testid^="button-draft-continue-"]'; // One per row

let app: ElectronApplication;
let window: Page;
let registrationPage: RegistrationPage;
let testEmail: string;
let seededCount: number;

test.describe('Drafts Page Performance', () => {
  test.beforeAll(async () => {
    await resetDbState();
    ({ app, window } = await setupApp());
    registrationPage = new RegistrationPage(window);

    // Register and login
    testEmail = `perf-drafts-${Date.now()}@test.com`;
    const password = 'TestPassword123';
    await registrationPage.completeRegistration(testEmail, password);

    // Seed test data
    const result = await seedLocalPerfData(testEmail);
    seededCount = result.drafts;
    console.log(`Seeded ${seededCount} drafts for performance test`);
  });

  test.afterAll(async () => {
    await closeApp(app);
    await resetDbState();
  });

  test('Verify 100 drafts seeded to DB', async () => {
    expect(seededCount).toBeGreaterThanOrEqual(DB_ITEM_COUNT);
  });

  test('Drafts tab should load in under 1 second (p95)', async () => {
    // Navigate to Transactions page and Drafts tab first
    await window.click('[data-testid="button-menu-transactions"]');
    await window.waitForLoadState('networkidle');
    await window.click('text=Drafts');
    await window.waitForLoadState('networkidle');

    // Try to set page size
    await setPageSize(window, PAGE_SIZE);

    // Validate pager shows sufficient total items (volume enforcement - STRICT)
    // BUG: Drafts.vue:207-212 overwrites totalItems with group count instead of drafts+groups
    // This test will fail until the front-end bug is fixed
    const pagerTotal = await getPagerTotal(window);
    expect(pagerTotal, 'Pager not found - volume enforcement failed').not.toBeNull();
    expect(pagerTotal!, `Pager shows only ${pagerTotal} items, need >= ${REQUIRED_TOTAL}`).toBeGreaterThanOrEqual(REQUIRED_TOTAL);
    console.log(`Pager total: ${pagerTotal} items`);

    // Collect multiple samples for p95
    const samples = await collectPerformanceSamples(async () => {
      // Navigate away first
      await window.click('text=History');
      await window.waitForLoadState('networkidle');

      // Navigate to Drafts and measure load time
      const startTime = Date.now();
      await window.click('text=Drafts');
      await window.waitForLoadState('networkidle');
      const loadTime = Date.now() - startTime;

      // Verify some drafts rendered (hard fail if empty)
      const rowCount = await waitForRowCount(window, DRAFT_ROW_SELECTOR, 1, 5000);
      expect(rowCount, 'No drafts rendered - check seeding').toBeGreaterThan(0);

      return loadTime;
    }, 5);

    console.log(`Drafts p95: ${formatDuration(samples.p95)}, avg: ${formatDuration(samples.avg)}`);
    console.log(`  Samples: ${samples.values.map((v) => formatDuration(v)).join(', ')}`);

    expect(samples.p95).toBeLessThan(TARGET_LOAD_TIME_MS);
  });
});
