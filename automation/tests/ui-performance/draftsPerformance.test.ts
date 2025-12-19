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
} from './performanceUtils.js';

const DB_ITEM_COUNT = 100; // Items seeded to DB
const PAGE_SIZE = 50; // Max items per page in UI
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

  test('Drafts tab should load 50 items (max page) in under 1 second (p95)', async () => {
    // Navigate to Transactions page first
    await window.click('[data-testid="button-menu-transactions"]');
    await window.waitForLoadState('networkidle');

    // Collect multiple samples for p95
    const samples = await collectPerformanceSamples(async () => {
      // Navigate away first
      await window.click('text=History');
      await window.waitForLoadState('networkidle');

      // Navigate to Drafts
      await window.click('text=Drafts');
      await window.waitForLoadState('networkidle');

      // Set page size to 50 (must do this after navigating - resets on nav)
      await setPageSize(window, PAGE_SIZE);

      // Now measure the time to render 50 rows
      const startTime = Date.now();
      const rowCount = await waitForRowCount(window, DRAFT_ROW_SELECTOR, PAGE_SIZE, 5000);
      const loadTime = Date.now() - startTime;

      // Verify page shows max items
      expect(rowCount).toBeGreaterThanOrEqual(PAGE_SIZE);

      return loadTime;
    }, 5);

    console.log(`Drafts p95: ${formatDuration(samples.p95)}, avg: ${formatDuration(samples.avg)}`);
    console.log(`  Samples: ${samples.values.map((v) => formatDuration(v)).join(', ')}`);

    expect(samples.p95).toBeLessThan(TARGET_LOAD_TIME_MS);
  });
});
