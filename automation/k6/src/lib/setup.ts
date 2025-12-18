/**
 * k6 Setup Functions
 *
 * Shared setup and teardown functions for k6 tests.
 */

import { login, loginAsTestUser } from './helpers';
import { getCredentials, getBaseUrlWithFallback } from '../config/credentials';
import type { SetupData } from '../types/k6.types';

/**
 * Standard setup function for k6 tests.
 * Authenticates using USER_EMAIL and USER_PASSWORD environment variables.
 *
 * @param baseUrl - API base URL (defaults to BASE_URL env var or localhost)
 * @returns SetupData with auth token
 */
export function standardSetup(baseUrl?: string): SetupData {
  const url = baseUrl || getBaseUrlWithFallback();
  const { email, password } = getCredentials();
  const token = login(url, email, password);

  if (!token) {
    console.error('Authentication failed - check USER_EMAIL and USER_PASSWORD');
  }

  return { token };
}

/**
 * Multi-user setup function for load tests.
 * Uses VU-distributed credentials for concurrent user simulation.
 *
 * @param baseUrl - API base URL (defaults to BASE_URL env var or localhost)
 * @returns SetupData with auth token
 */
export function multiUserSetup(baseUrl?: string): SetupData {
  const url = baseUrl || getBaseUrlWithFallback();
  const token = loginAsTestUser(url);

  if (!token) {
    console.error('Authentication failed for VU user');
  }

  return { token };
}
