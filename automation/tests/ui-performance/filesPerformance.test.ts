/**
 * Performance Test: Files Page
 *
 * Requirement: 100 files in DB, page load (50 visible) in ≤ 1s
 * Data source: Local SQLite (HederaFile model)
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
  formatDuration,
  DATA_VOLUMES,
} from './performanceUtils.js';

// Volume requirement from k6 constants (SSOT)
const DB_ITEM_COUNT = DATA_VOLUMES.FILES;
const MIN_ROWS = 50; // Strict: require at least 50 rows rendered
const FILE_ROW_SELECTOR = '[data-testid^="p-file-id-"]';

let app: ElectronApplication;
let window: Page;
let registrationPage: RegistrationPage;
let testEmail: string;
let seededCount: number;

test.describe('Files Page Performance', () => {
  test.beforeAll(async () => {
    await resetDbState();
    ({ app, window } = await setupApp());
    registrationPage = new RegistrationPage(window);

    // Register and login
    testEmail = `perf-files-${Date.now()}@test.com`;
    const password = 'TestPassword123';
    await registrationPage.completeRegistration(testEmail, password);

    // Seed test data
    const result = await seedLocalPerfData(testEmail);
    seededCount = result.files;
    console.log(`Seeded ${seededCount} files for performance test`);
  });

  test.afterAll(async () => {
    await closeApp(app);
    await resetDbState();
  });

  test('Verify 100 files seeded to DB', async () => {
    expect(seededCount).toBeGreaterThanOrEqual(DB_ITEM_COUNT);
  });

  test('Files page should load in under 1 second (p95)', async () => {
    // Collect multiple samples for p95
    const samples = await collectPerformanceSamples(async () => {
      // Navigate away first
      await window.click('[data-testid="button-menu-transactions"]');
      await window.waitForLoadState('networkidle');

      // Measure page load time
      const startTime = Date.now();
      await window.click('[data-testid="button-menu-files"]');
      await window.waitForLoadState('networkidle');
      const loadTime = Date.now() - startTime;

      // Verify rows rendered (STRICT: require minimum volume)
      const rowCount = await waitForRowCount(window, FILE_ROW_SELECTOR, MIN_ROWS, 5000);
      expect(rowCount, `Only ${rowCount} files rendered, need >= ${MIN_ROWS}`).toBeGreaterThanOrEqual(MIN_ROWS);

      return loadTime;
    }, 5);

    console.log(`Files p95: ${formatDuration(samples.p95)}, avg: ${formatDuration(samples.avg)}`);
    console.log(`  Samples: ${samples.values.map((v) => formatDuration(v)).join(', ')}`);

    expect(samples.p95).toBeLessThan(TARGET_LOAD_TIME_MS);
  });
});
