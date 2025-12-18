/**
 * Performance Test: Contacts Page
 *
 * Requirement: 100+ contacts load in ≤ 1s
 * Data source: Local SQLite (Contact model)
 */

import { test, expect, ElectronApplication, Page } from '@playwright/test';
import * as dotenv from 'dotenv';
import { setupApp, closeApp } from '../../utils/util.js';
import { resetDbState, resetPostgresDbState } from '../../utils/databaseUtil.js';
import { RegistrationPage } from '../../pages/RegistrationPage.js';
import { OrganizationPage } from '../../pages/OrganizationPage.js';
import { ContactListPage } from '../../pages/ContactListPage.js';
import {
  TARGET_LOAD_TIME_MS,
  measurePageLoadTime,
  formatDuration,
  assertLoadTime,
} from './performanceUtils.js';

// Load environment variables from .env file
dotenv.config();

let app: ElectronApplication;
let window: Page;
let registrationPage: RegistrationPage;
let organizationPage: OrganizationPage;
let contactListPage: ContactListPage;

test.describe('Contacts Page Performance', () => {
  test.beforeAll(async () => {
    await resetDbState();
    await resetPostgresDbState();
    ({ app, window } = await setupApp());
    registrationPage = new RegistrationPage(window);
    organizationPage = new OrganizationPage(window);
    contactListPage = new ContactListPage(window);

    // Create test user in backend
    await organizationPage.createUsers(1);
    const testUser = organizationPage.getUser(0);

    // Register locally
    const password = 'TestPassword123';
    await registrationPage.completeRegistration(`perf-contacts-${Date.now()}@test.com`, password);

    // Upgrade test user to admin in backend
    await contactListPage.upgradeUserToAdmin(testUser.email);

    // Connect to organization and sign in
    await organizationPage.setupOrganization();

    // Wait for sign-in form to appear (organization connection may take time)
    await organizationPage.waitForElementToBeVisible(
      organizationPage.emailForOrganizationInputSelector,
    );

    await organizationPage.signInOrganization(testUser.email, testUser.password, password);
  });

  test.afterAll(async () => {
    await closeApp(app);
    await resetDbState();
    await resetPostgresDbState();
  });

  test('Contacts page load time should be under 1 second', async () => {
    // Measure navigation to Contacts page
    const loadTime = await measurePageLoadTime(window, async () => {
      await organizationPage.clickOnContactListButton();
    });

    const passed = assertLoadTime(loadTime, TARGET_LOAD_TIME_MS, 'Contacts Page');
    expect(passed).toBe(true);
  });

  test('Contacts list renders within threshold', async () => {
    // Navigate to Contacts
    await organizationPage.clickOnContactListButton();

    // Measure time until list is visible
    const startTime = Date.now();
    await window.waitForLoadState('networkidle');

    // Wait for either contacts list or empty state
    await Promise.race([
      window.waitForSelector('.table', { state: 'visible', timeout: TARGET_LOAD_TIME_MS + 1000 }),
      window.waitForSelector('[data-testid="contacts-empty"]', {
        state: 'visible',
        timeout: TARGET_LOAD_TIME_MS + 1000,
      }),
    ]).catch(() => {
      // Page loaded but no specific element found
    });

    const renderTime = Date.now() - startTime;
    console.log(`Contacts list render time: ${formatDuration(renderTime)}`);

    expect(renderTime).toBeLessThan(TARGET_LOAD_TIME_MS);
  });
});
