/**
 * k6 Test Helpers
 *
 * Authentication, HTTP utilities, and multi-user support for k6 tests.
 */

import http, { Response } from 'k6/http';
import type { TestUser, AuthHeaders, AuthResponse } from '../types';

// k6 environment variables
declare const __ENV: Record<string, string | undefined>;
declare const __VU: number;

/**
 * Multi-user support
 * Distribute test users across virtual users to prevent auth conflicts
 * Set via environment variables: TEST_EMAIL, TEST_EMAIL_1, TEST_EMAIL_2, etc.
 */
function getTestUsers(): TestUser[] {
  const users: TestUser[] = [];

  // Primary user
  if (__ENV.TEST_EMAIL && __ENV.TEST_PASSWORD) {
    users.push({
      email: __ENV.TEST_EMAIL,
      password: __ENV.TEST_PASSWORD,
    });
  }

  // Additional users (TEST_EMAIL_1, TEST_EMAIL_2, etc.)
  for (let i = 1; i <= 10; i++) {
    const email = __ENV[`TEST_EMAIL_${i}`];
    const password = __ENV[`TEST_PASSWORD_${i}`] || __ENV.TEST_PASSWORD;
    if (email && password) {
      users.push({ email, password });
    }
  }

  return users;
}

// Cache test users
const TEST_USERS = getTestUsers();

/**
 * Get test user for current VU
 * Distributes users evenly across VUs to prevent auth conflicts
 */
export function getTestUser(): TestUser {
  if (TEST_USERS.length === 0) {
    return {
      email: __ENV.USER_EMAIL || 'test@example.com',
      password: __ENV.USER_PASSWORD || 'password',
    };
  }

  // Distribute users across VUs: VU 1 gets user 0, VU 2 gets user 1, etc.
  const userIndex = (__VU - 1) % TEST_USERS.length;
  return TEST_USERS[userIndex];
}

/**
 * Authenticate and return auth token
 */
export function login(
  baseUrl: string,
  email: string,
  password: string,
): string | null {
  const payload = JSON.stringify({
    email: email,
    password: password,
  });

  const params = {
    headers: {
      'Content-Type': 'application/json',
    },
  };

  const res: Response = http.post(`${baseUrl}/auth/login`, payload, params);

  if (res.status === 200 || res.status === 201) {
    try {
      const body = JSON.parse(res.body as string) as AuthResponse;
      return body.accessToken || null;
    } catch (e) {
      const error = e as Error;
      console.error(`Failed to parse login response: ${error.message}`);
      return null;
    }
  }

  console.error(`Login failed: ${res.status} - ${res.body}`);
  return null;
}

/**
 * Login with auto-selected test user for current VU
 */
export function loginAsTestUser(baseUrl: string): string | null {
  const user = getTestUser();
  return login(baseUrl, user.email, user.password);
}

/**
 * Create authenticated request headers
 */
export function authHeaders(token: string): AuthHeaders {
  return {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
  };
}

/**
 * Format duration for logging
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

/**
 * Random sleep helper (returns seconds for k6 sleep)
 */
export function randomSleep(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}
