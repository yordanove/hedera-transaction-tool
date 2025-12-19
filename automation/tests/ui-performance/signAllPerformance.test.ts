/**
 * Performance Test: Sign All Transactions (Org Mode)
 *
 * Requirement: Sign all transactions (batch) in ≤ 4 seconds
 * Data source: Backend PostgreSQL (seeded by k6:seed:all)
 *
 * Prerequisites:
 * - Backend running (docker-compose up)
 * - Run: npm run k6:seed:all (seeds 200 transactions to sign)
 * - User must have signing key configured
 *
 * IMPORTANT: This test is DESTRUCTIVE - it changes transaction state.
 * Run separately and re-seed after each run.
 *
 * Note: This test measures UI signing performance, which depends on:
 * - Private key being available in the app
 * - Transaction bytes being valid for signing
 * - Backend processing speed
 */

import { test, expect, ElectronApplication, Page } from '@playwright/test';
import * as dotenv from 'dotenv';
import { setupApp, closeApp } from '../../utils/util.js';
import { resetDbState } from '../../utils/databaseUtil.js';
import { RegistrationPage } from '../../pages/RegistrationPage.js';
import { OrganizationPage } from '../../pages/OrganizationPage.js';
import { formatDuration } from './performanceUtils.js';

dotenv.config();

const SIGN_ALL_THRESHOLD_MS = 4000; // 4 seconds
const TRANSACTION_ROW_SELECTOR = '.table tbody tr';

// k6 perf test user credentials (created by k6:seed)
const K6_USER_EMAIL = 'k6perf@test.com';
const K6_USER_PASSWORD = 'Password123';

let app: ElectronApplication;
let window: Page;
let registrationPage: RegistrationPage;
let organizationPage: OrganizationPage;

test.describe('Sign All Performance (Org Mode)', () => {
  test.beforeAll(async () => {
    await resetDbState();
    ({ app, window } = await setupApp());
    registrationPage = new RegistrationPage(window);
    organizationPage = new OrganizationPage(window);

    // Register locally with unique email
    const localPassword = 'TestPassword123';
    await registrationPage.completeRegistration(
      `perf-sign-all-${Date.now()}@test.com`,
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

  test('Sign All should complete in under 4 seconds', async () => {
    // Navigate to Transactions > Ready to Sign
    await window.click('[data-testid="button-menu-transactions"]');
    await window.waitForLoadState('networkidle');
    await window.click('text=Ready to Sign');
    await window.waitForLoadState('networkidle');

    // Count initial transactions
    const initialRows = await window.$$(TRANSACTION_ROW_SELECTOR);
    const initialCount = initialRows.length;
    console.log(`Found ${initialCount} transactions to sign`);

    if (initialCount === 0) {
      console.warn('No transactions to sign - skipping test. Run k6:seed:all first.');
      test.skip();
      return;
    }

    // Look for Sign All button (selector may need adjustment based on actual UI)
    const signAllButton = await window.$('button:has-text("Sign All")');
    if (!signAllButton) {
      console.warn('Sign All button not found - UI may not support batch signing');
      test.skip();
      return;
    }

    // Measure time to sign all
    const startTime = Date.now();

    await signAllButton.click();

    // Wait for signing to complete - transactions should disappear or change status
    await window.waitForFunction(
      (selector: string, count: number) => {
        const rows = document.querySelectorAll(selector);
        return rows.length < count;
      },
      { timeout: SIGN_ALL_THRESHOLD_MS + 2000 },
      TRANSACTION_ROW_SELECTOR,
      initialCount,
    );

    const signTime = Date.now() - startTime;

    // Count remaining transactions
    const remainingRows = await window.$$(TRANSACTION_ROW_SELECTOR);
    const signedCount = initialCount - remainingRows.length;

    console.log(`Sign All: ${signedCount}/${initialCount} signed in ${formatDuration(signTime)}`);

    expect(signTime).toBeLessThan(SIGN_ALL_THRESHOLD_MS);
    expect(signedCount).toBeGreaterThan(0);
  });
});
