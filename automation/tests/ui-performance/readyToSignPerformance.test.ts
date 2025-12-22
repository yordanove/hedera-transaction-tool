/**
 * Performance Test: Ready to Sign Tab (Org Mode)
 *
 * Requirement: 200 transactions load in ≤ 1s
 * Data source: Backend PostgreSQL (seeded by k6:seed:all)
 *
 * Prerequisites:
 * - Backend running (docker-compose up)
 * - Run: npm run k6:seed:all
 */

import { test, expect, ElectronApplication, Page } from '@playwright/test';
import * as dotenv from 'dotenv';
import { setupApp, closeApp } from '../../utils/util.js';
import { resetDbState } from '../../utils/databaseUtil.js';
import { RegistrationPage } from '../../pages/RegistrationPage.js';
import { OrganizationPage } from '../../pages/OrganizationPage.js';
import {
  TARGET_LOAD_TIME_MS,
  collectPerformanceSamples,
  formatDuration,
  setPageSize,
  waitForRowCount,
  getPagerTotal,
  PAGE_SIZE,
  TRANSACTION_ROW_SELECTOR,
  DATA_VOLUMES,
} from './performanceUtils.js';
import { setupOrgModeTestEnvironment } from './seed-org-perf-data.js';

dotenv.config();

// Volume requirement from k6 constants (SSOT)
const REQUIRED_TOTAL = DATA_VOLUMES.READY_TO_SIGN;

let app: ElectronApplication;
let window: Page;
let registrationPage: RegistrationPage;
let organizationPage: OrganizationPage;

test.describe('Ready to Sign Performance (Org Mode)', () => {
  test.beforeAll(async () => {
    await resetDbState();
    ({ app, window } = await setupApp());
    registrationPage = new RegistrationPage(window);
    organizationPage = new OrganizationPage(window);

    // Setup org-mode test environment (seed, register, sign in, import mnemonic)
    await setupOrgModeTestEnvironment(window, registrationPage, organizationPage, 'perf-ready-to-sign');
  });

  test.afterAll(async () => {
    await closeApp(app);
    await resetDbState();
  });

  test('Ready to Sign tab should load in under 1 second (p95)', async () => {
    // Navigate to Transactions page and Ready to Sign first
    await window.click('[data-testid="button-menu-transactions"]');
    await window.waitForLoadState('networkidle');
    await window.click('text=Ready to Sign');

    // Wait for the transaction API response (not just networkidle)
    // This is critical - the page may render before API data arrives
    await window.waitForResponse(
      (res) => res.url().includes('/transactions/sign') || res.url().includes('/transaction-nodes'),
      { timeout: 10000 }
    );
    await window.waitForLoadState('networkidle');

    // Try to set page size if pager exists
    await setPageSize(window, PAGE_SIZE);

    // Validate pager shows sufficient total items (volume enforcement - STRICT)
    const pagerTotal = await getPagerTotal(window);
    expect(pagerTotal, 'Pager not found - volume enforcement failed').not.toBeNull();
    expect(pagerTotal!, `Pager shows only ${pagerTotal} items, need >= ${REQUIRED_TOTAL}`).toBeGreaterThanOrEqual(REQUIRED_TOTAL);
    console.log(`Pager total: ${pagerTotal} items`);

    // Verify data is visible before measuring
    const initialRowCount = await waitForRowCount(window, TRANSACTION_ROW_SELECTOR, 1, 5000);
    expect(initialRowCount, 'No transactions visible - check k6:seed:all and network').toBeGreaterThan(0);
    console.log(`Found ${initialRowCount} transactions on Ready to Sign tab`);

    // Collect multiple samples for p95
    const samples = await collectPerformanceSamples(async () => {
      // Navigate away first
      await window.click('text=History');
      await window.waitForLoadState('networkidle');

      // Measure page load time
      const startTime = Date.now();
      await window.click('text=Ready to Sign');
      await window.waitForLoadState('networkidle');
      const loadTime = Date.now() - startTime;

      // Verify rows rendered during sample (consistency with local-mode tests)
      const rowCount = await waitForRowCount(window, TRANSACTION_ROW_SELECTOR, 1, 5000);
      expect(rowCount, 'No rows rendered during sample').toBeGreaterThan(0);

      return loadTime;
    }, 5);

    console.log(
      `Ready to Sign p95: ${formatDuration(samples.p95)}, avg: ${formatDuration(samples.avg)}`,
    );
    console.log(`  Samples: ${samples.values.map((v) => formatDuration(v)).join(', ')}`);

    expect(samples.p95).toBeLessThan(TARGET_LOAD_TIME_MS);
  });
});
