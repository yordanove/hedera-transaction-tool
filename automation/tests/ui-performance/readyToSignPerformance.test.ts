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
} from './performanceUtils.js';
import {
  seedOrgPerfData,
  readSeedMnemonic,
  K6_USER_EMAIL,
  K6_USER_PASSWORD,
} from './seed-org-perf-data.js';

dotenv.config();

const PAGE_SIZE = 50;
const TRANSACTION_ROW_SELECTOR = '.table-custom tbody tr';

let app: ElectronApplication;
let window: Page;
let registrationPage: RegistrationPage;
let organizationPage: OrganizationPage;

test.describe('Ready to Sign Performance (Org Mode)', () => {
  test.beforeAll(async () => {
    // Seed org-mode test data (creates k6 user + transactions + mnemonic)
    await seedOrgPerfData();

    await resetDbState();
    ({ app, window } = await setupApp());
    registrationPage = new RegistrationPage(window);
    organizationPage = new OrganizationPage(window);

    // Register locally with unique email
    const localPassword = 'TestPassword123';
    await registrationPage.completeRegistration(
      `perf-ready-to-sign-${Date.now()}@test.com`,
      localPassword,
    );

    // Connect to organization and sign in as k6 perf user
    await organizationPage.setupOrganization();
    await organizationPage.waitForElementToBeVisible(
      organizationPage.emailForOrganizationInputSelector,
    );
    await organizationPage.signInOrganization(K6_USER_EMAIL, K6_USER_PASSWORD, localPassword);

    // Complete Account Setup by IMPORTING the mnemonic from seed
    // This ensures the user's local key matches the key used for seeded transactions
    await registrationPage.waitForElementToBeVisible(registrationPage.createNewTabSelector);
    console.log('Account Setup screen visible, importing seed mnemonic...');

    // Read the mnemonic saved by seedOrgPerfData
    const words = readSeedMnemonic();
    console.log(`Read mnemonic with ${words.length} words`);

    // Use Import tab to import the mnemonic
    await registrationPage.clickOnImportTab();

    // Fill all 24 recovery phrase words
    for (let i = 0; i < 24; i++) {
      await registrationPage.fillRecoveryPhraseWord(i + 1, words[i]);
    }

    // Complete import flow
    await registrationPage.scrollToNextImportButton();
    await registrationPage.clickOnNextImportButton();

    // Wait for Key Pairs screen (button-next-import disappears)
    await window.waitForSelector('[data-testid="button-next-import"]', { state: 'hidden', timeout: 10000 });
    console.log('On Key Pairs screen');

    // Wait for toast to disappear before clicking Next
    await registrationPage.waitForElementToDisappear(registrationPage.toastMessageSelector);

    // Click final Next button with retry - waits for settings link (same pattern as working tests)
    await registrationPage.clickOnFinalNextButtonWithRetry();
    console.log('Account Setup completed');
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

      return loadTime;
    }, 5);

    console.log(
      `Ready to Sign p95: ${formatDuration(samples.p95)}, avg: ${formatDuration(samples.avg)}`,
    );
    console.log(`  Samples: ${samples.values.map((v) => formatDuration(v)).join(', ')}`);

    expect(samples.p95).toBeLessThan(TARGET_LOAD_TIME_MS);
  });
});
