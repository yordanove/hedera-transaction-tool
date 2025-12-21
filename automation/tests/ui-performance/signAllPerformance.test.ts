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
import { formatDuration, waitForRowCount } from './performanceUtils.js';
import {
  seedOrgPerfData,
  readSeedMnemonic,
  K6_USER_EMAIL,
  K6_USER_PASSWORD,
} from './seed-org-perf-data.js';

dotenv.config();

const SIGN_ALL_THRESHOLD_MS = 4000; // 4 seconds
const TRANSACTION_ROW_SELECTOR = '.table-custom tbody tr';

let app: ElectronApplication;
let window: Page;
let registrationPage: RegistrationPage;
let organizationPage: OrganizationPage;

test.describe('Sign All Performance (Org Mode)', () => {
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
      `perf-sign-all-${Date.now()}@test.com`,
      localPassword,
    );

    // Connect to organization and sign in as k6 perf user
    await organizationPage.setupOrganization();
    await organizationPage.waitForElementToBeVisible(
      organizationPage.emailForOrganizationInputSelector,
    );
    await organizationPage.signInOrganization(K6_USER_EMAIL, K6_USER_PASSWORD, localPassword);

    // Complete Account Setup by IMPORTING the mnemonic from seed
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

  test('Sign All should complete in under 4 seconds', async () => {
    // Navigate to Transactions > Ready to Sign
    await window.click('[data-testid="button-menu-transactions"]');
    await window.waitForLoadState('networkidle');
    await window.click('text=Ready to Sign');

    // Wait for the transaction API response
    await window.waitForResponse(
      (res) => res.url().includes('/transactions/sign') || res.url().includes('/transaction-nodes'),
      { timeout: 10000 }
    );
    await window.waitForLoadState('networkidle');

    // Wait for transaction groups to appear
    const groupRowCount = await waitForRowCount(window, TRANSACTION_ROW_SELECTOR, 1, 5000);
    console.log(`Found ${groupRowCount} transaction groups`);

    // Click Details on the group row to navigate to group details page
    // Try both selector patterns - data-testid or text content
    let detailsButton = await window.$('[data-testid^="button-transaction-node-details-"]');
    if (!detailsButton) {
      detailsButton = await window.$('button:has-text("Details")');
    }
    expect(detailsButton, 'Details button not found on group row').not.toBeNull();
    await detailsButton!.click();

    // Wait for group details page to load
    await window.waitForLoadState('networkidle');

    // Wait for Sign All button to appear on the group details page
    const signAllButton = await window.waitForSelector('[data-testid="button-sign-group"]', { timeout: 10000 });
    expect(signAllButton, 'Sign All button not found on group details page').not.toBeNull();
    console.log('Found Sign All button on group details page');

    // Count transactions in the group
    const initialCount = await waitForRowCount(window, TRANSACTION_ROW_SELECTOR, 1, 5000);
    expect(initialCount, 'No transactions in group').toBeGreaterThan(0);
    console.log(`Group has ${initialCount} transactions to sign`);

    // Measure time to sign all
    const startTime = Date.now();

    await signAllButton.click();

    // Wait for confirmation modal and confirm
    const confirmButton = await window.waitForSelector('button:has-text("Confirm")', {
      timeout: 10000,
    });
    await confirmButton.click();

    // Wait for success toast to confirm completion
    await window.waitForSelector('.v-toast__text:has-text("Transactions signed successfully")', {
      timeout: 20000,
    });

    const signTime = Date.now() - startTime;

    console.log(`Sign All completed in ${formatDuration(signTime)}`);

    expect(signTime).toBeLessThan(SIGN_ALL_THRESHOLD_MS);
  });
});
