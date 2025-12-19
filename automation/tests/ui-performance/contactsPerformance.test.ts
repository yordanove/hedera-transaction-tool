/**
 * Performance Test: Contacts Page
 *
 * Requirement: 100+ contacts load in ≤ 1s
 * Data source: Backend PostgreSQL (org users appear as contacts)
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
  collectPerformanceSamples,
  measureListLoadTime,
  formatDuration,
} from './performanceUtils.js';

// Load environment variables from .env file
dotenv.config();

const MIN_CONTACTS = 100;
const CONTACT_ROW_SELECTOR = '.table tbody tr';

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

    // Create 100+ test users in backend (they will appear as contacts)
    console.log(`Creating ${MIN_CONTACTS} users in backend...`);
    await organizationPage.createUsers(MIN_CONTACTS);
    const testUser = organizationPage.getUser(0);
    console.log(`Created ${MIN_CONTACTS} users`);

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

  test('Contacts page should load 100 items in under 1 second (p95)', async () => {
    // Collect multiple samples for p95
    const samples = await collectPerformanceSamples(async () => {
      // Navigate away then back to Contacts
      await window.click('[data-testid="button-menu-transactions"]');
      await window.waitForLoadState('networkidle');

      const { loadTime, rowCount } = await measureListLoadTime(
        window,
        async () => {
          await organizationPage.clickOnContactListButton();
        },
        CONTACT_ROW_SELECTOR,
        MIN_CONTACTS,
      );

      // Verify data volume on each sample
      expect(rowCount).toBeGreaterThanOrEqual(MIN_CONTACTS);

      return loadTime;
    }, 5);

    console.log(`Contacts p95: ${formatDuration(samples.p95)}, avg: ${formatDuration(samples.avg)}`);
    console.log(`  Samples: ${samples.values.map((v) => formatDuration(v)).join(', ')}`);

    expect(samples.p95).toBeLessThan(TARGET_LOAD_TIME_MS);
  });
});
