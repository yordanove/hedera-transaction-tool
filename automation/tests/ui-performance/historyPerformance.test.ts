/**
 * Performance Test: History Tab (Org Mode)
 *
 * Requirement: 500 transactions load in ≤ 1s
 * Data source: Backend PostgreSQL (seeded by k6:seed:all)
 *
 * Prerequisites:
 * - Backend running (docker-compose up)
 * - Run: npm run k6:seed:all
 *
 * Note: History may be paginated. This test measures initial page load time.
 * If pagination is used, it verifies at least the first page loads quickly.
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
  measureListLoadTime,
  formatDuration,
} from './performanceUtils.js';

dotenv.config();

// History has 500 items but UI may paginate - test initial load
const MIN_TRANSACTIONS = 100; // First page minimum
const TRANSACTION_ROW_SELECTOR = '.table tbody tr';

// k6 perf test user credentials (created by k6:seed)
const K6_USER_EMAIL = 'k6perf@test.com';
const K6_USER_PASSWORD = 'Password123';

let app: ElectronApplication;
let window: Page;
let registrationPage: RegistrationPage;
let organizationPage: OrganizationPage;

test.describe('History Performance (Org Mode)', () => {
  test.beforeAll(async () => {
    await resetDbState();
    ({ app, window } = await setupApp());
    registrationPage = new RegistrationPage(window);
    organizationPage = new OrganizationPage(window);

    // Register locally with unique email
    const localPassword = 'TestPassword123';
    await registrationPage.completeRegistration(
      `perf-history-${Date.now()}@test.com`,
      localPassword,
    );

    // Connect to organization and sign in as k6 perf user
    await organizationPage.setupOrganization();
    await organizationPage.waitForElementToBeVisible(
      organizationPage.emailForOrganizationInputSelector,
    );
    await organizationPage.signInOrganization(K6_USER_EMAIL, K6_USER_PASSWORD, localPassword);

    console.log('Signed into organization as k6perf@test.com');
  });

  test.afterAll(async () => {
    await closeApp(app);
    await resetDbState();
  });

  test('History tab should load in under 1 second (p95)', async () => {
    // Navigate to Transactions page first
    await window.click('[data-testid="button-menu-transactions"]');
    await window.waitForLoadState('networkidle');

    // Collect multiple samples for p95
    const samples = await collectPerformanceSamples(async () => {
      // Navigate away then back to History
      await window.click('text=Ready to Sign');
      await window.waitForLoadState('networkidle');

      const { loadTime, rowCount } = await measureListLoadTime(
        window,
        async () => {
          await window.click('text=History');
        },
        TRANSACTION_ROW_SELECTOR,
        MIN_TRANSACTIONS,
      );

      // Verify data volume on each sample (at least first page)
      expect(rowCount).toBeGreaterThanOrEqual(MIN_TRANSACTIONS);

      return loadTime;
    }, 5);

    console.log(`History p95: ${formatDuration(samples.p95)}, avg: ${formatDuration(samples.avg)}`);
    console.log(`  Samples: ${samples.values.map((v) => formatDuration(v)).join(', ')}`);

    expect(samples.p95).toBeLessThan(TARGET_LOAD_TIME_MS);
  });
});
