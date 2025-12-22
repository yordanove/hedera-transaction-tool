/**
 * Org Mode Performance Data Seeder
 *
 * Seeds PostgreSQL database with test data for org-mode UI performance tests.
 * Wraps the k6 seed scripts to run them automatically from Playwright tests.
 *
 * This avoids the need to run `npm run k6:seed:all` manually before tests.
 */

import { execSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';
import { createClient } from 'redis';
import { Page } from '@playwright/test';
import { TEST_CREDENTIALS, TEST_USER_POOL } from '../../k6/src/config/constants.js';
import { RegistrationPage } from '../../pages/RegistrationPage.js';
import { OrganizationPage } from '../../pages/OrganizationPage.js';
import { DEBUG } from './performanceUtils.js';
import { isDestructiveAllowed, isLocalHost } from '../../utils/databaseUtil.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Re-export credentials for backward compatibility (SSOT: k6 constants)
export const K6_USER_EMAIL = TEST_CREDENTIALS.EMAIL;
export const K6_USER_PASSWORD = TEST_CREDENTIALS.PASSWORD;

/**
 * Get a test user from the pool based on test name.
 * Distributes tests across users to avoid rate limiting (3 logins/min per email).
 * Uses simple hash of test name for consistent user assignment.
 *
 * @param testName - Unique test identifier (e.g., 'perf-history', 'perf-sign-all')
 * @returns User credentials from the pool
 */
export function getPooledTestUser(testName: string): { email: string; password: string } {
  // Simple hash: sum of char codes mod pool size
  const hash = testName.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const index = hash % TEST_USER_POOL.length;
  return TEST_USER_POOL[index];
}

interface SeedResult {
  userCreated: boolean;
  transactionsSeeded: boolean;
  mnemonicPath: string | null;
}

/**
 * Flush Redis rate limiter keys for the test user.
 * This prevents "too many requests" errors when running multiple org-mode tests.
 * Backend limits logins to 3/minute per email (ANONYMOUS_MINUTE_LIMIT=3).
 *
 * Staging-safe: On non-localhost, skips flush to avoid affecting other users.
 * Uses strict URL hostname parsing (not substring match) for safety.
 */
async function flushRateLimiter(): Promise<void> {
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6380';

  // Strict hostname check - parse URL instead of substring match
  // This prevents false positives like 'localhost-prod.example.com'
  let redisHost: string;
  try {
    redisHost = new URL(redisUrl).hostname;
  } catch {
    // Invalid URL format, assume local for backward compatibility
    redisHost = 'localhost';
  }

  const isLocalRedis = isLocalHost(redisHost);
  if (!isLocalRedis && !isDestructiveAllowed()) {
    if (DEBUG) console.log(`  Skipping Redis flush (${redisHost} is non-localhost, staging-safe mode)`);
    return;
  }

  const redis = createClient({ url: redisUrl });

  try {
    await redis.connect();
    // Delete all throttler keys (pattern: {hash:throttler-name}:hits)
    const keys = await redis.keys('*:hits');
    if (keys.length > 0) {
      await redis.del(keys);
      if (DEBUG) console.log(`  Flushed ${keys.length} rate limiter keys from Redis`);
    } else {
      if (DEBUG) console.log('  No rate limiter keys to flush');
    }
  } catch (error) {
    // Redis might not be running - log but don't fail
    console.warn('  Warning: Could not flush Redis rate limiter:', (error as Error).message);
  } finally {
    await redis.disconnect();
  }
}

/**
 * Seed the PostgreSQL database with k6 test user and transactions.
 * Equivalent to running: npm run k6:seed:all
 *
 * This function:
 * 1. Creates the k6 test user if not exists
 * 2. Seeds transactions (sign, history, approve)
 * 3. Generates mnemonic for Account Setup import
 */
export async function seedOrgPerfData(): Promise<SeedResult> {
  const automationDir = path.resolve(__dirname, '../..');
  const mnemonicPath = path.join(__dirname, '../../k6/data/test-mnemonic.txt');

  if (DEBUG) console.log('Seeding org-mode performance test data...');

  try {
    // Step 0: Flush rate limiter to prevent "too many requests" errors
    await flushRateLimiter();

    // Step 1: Create all pool users (for rate limiting avoidance)
    if (DEBUG) console.log('  Step 1: Creating pool users...');
    execSync('npx tsx k6/helpers/seed-test-users.ts', {
      cwd: automationDir,
      stdio: 'inherit',
      env: {
        ...process.env,
        SEED_POOL: 'true',
      },
    });

    // Step 2: Seed transactions for all pool users and generate mnemonic
    if (DEBUG) console.log('  Step 2: Seeding transactions for all pool users...');
    execSync('npx tsx k6/helpers/seed-perf-data.ts', {
      cwd: automationDir,
      stdio: 'inherit',
      env: {
        ...process.env,
        SEED_POOL: 'true',
      },
    });

    // Verify mnemonic was generated
    if (!fs.existsSync(mnemonicPath)) {
      throw new Error(`Mnemonic file not found at ${mnemonicPath}`);
    }

    if (DEBUG) console.log('  Org-mode data seeding complete!');

    return {
      userCreated: true,
      transactionsSeeded: true,
      mnemonicPath,
    };
  } catch (error) {
    console.error('Error seeding org-mode data:', error);
    throw error;
  }
}

/**
 * Read the mnemonic generated by the seed script.
 * Returns array of 24 words.
 */
export function readSeedMnemonic(): string[] {
  const mnemonicPath = path.join(__dirname, '../../k6/data/test-mnemonic.txt');

  if (!fs.existsSync(mnemonicPath)) {
    throw new Error(
      `Mnemonic file not found. Run seedOrgPerfData() first or: npm run k6:seed:all`,
    );
  }

  const mnemonic = fs.readFileSync(mnemonicPath, 'utf-8').trim();
  const words = mnemonic.split(' ');

  if (words.length !== 24) {
    throw new Error(`Invalid mnemonic: expected 24 words, got ${words.length}`);
  }

  return words;
}

/**
 * Check if org-mode seed data exists (quick check without re-seeding)
 */
export function isOrgDataSeeded(): boolean {
  const mnemonicPath = path.join(__dirname, '../../k6/data/test-mnemonic.txt');
  return fs.existsSync(mnemonicPath);
}

/**
 * Import the seed mnemonic via the Recovery Phrase import flow.
 * Extracts duplicated mnemonic import logic from org-mode tests (DRY).
 */
export async function importSeedMnemonic(
  window: Page,
  registrationPage: RegistrationPage,
): Promise<void> {
  await registrationPage.waitForElementToBeVisible(registrationPage.createNewTabSelector);
  if (DEBUG) console.log('Account Setup screen visible, importing seed mnemonic...');

  const words = readSeedMnemonic();
  if (DEBUG) console.log(`Read mnemonic with ${words.length} words`);

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
  if (DEBUG) console.log('On Key Pairs screen');

  // Wait for toast to disappear before clicking Next
  await registrationPage.waitForElementToDisappear(registrationPage.toastMessageSelector);

  // Click final Next button with retry
  await registrationPage.clickOnFinalNextButtonWithRetry();
  if (DEBUG) console.log('Account Setup completed');
}

/**
 * Full org-mode test environment setup.
 * Extracts duplicated setup logic from org-mode tests (DRY).
 *
 * This function:
 * 1. Seeds org data (user + transactions + mnemonic)
 * 2. Registers locally with unique email
 * 3. Connects to organization and signs in as k6 user
 * 4. Imports the seed mnemonic to complete Account Setup
 */
export async function setupOrgModeTestEnvironment(
  window: Page,
  registrationPage: RegistrationPage,
  organizationPage: OrganizationPage,
  testNamePrefix: string,
): Promise<void> {
  // Step 1: Seed org-mode test data
  await seedOrgPerfData();

  // Step 2: Register locally with unique email
  const localPassword = 'TestPassword123';
  await registrationPage.completeRegistration(
    `${testNamePrefix}-${Date.now()}@test.com`,
    localPassword,
  );

  // Step 3: Connect to organization and sign in as pooled user
  // Uses different email per test to avoid backend rate limiting (3 logins/min per email)
  const pooledUser = getPooledTestUser(testNamePrefix);
  await organizationPage.setupOrganization();
  await organizationPage.waitForElementToBeVisible(
    organizationPage.emailForOrganizationInputSelector,
  );
  await organizationPage.signInOrganization(pooledUser.email, pooledUser.password, localPassword);

  // Step 4: Import the seed mnemonic
  await importSeedMnemonic(window, registrationPage);
}
