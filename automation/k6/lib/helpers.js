import http from 'k6/http';

/**
 * Multi-user support
 * Distribute test users across virtual users to prevent auth conflicts
 * Set via environment variables: TEST_EMAIL, TEST_EMAIL_1, TEST_EMAIL_2, etc.
 */
function getTestUsers() {
  const users = [];

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
    if (email) {
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
 * @returns {{ email: string, password: string } | null}
 */
export function getTestUser() {
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
export function login(baseUrl, email, password) {
  const payload = JSON.stringify({
    email: email,
    password: password,
  });

  const params = {
    headers: {
      'Content-Type': 'application/json',
    },
  };

  const res = http.post(`${baseUrl}/auth/login`, payload, params);

  if (res.status === 200 || res.status === 201) {
    try {
      const body = JSON.parse(res.body);
      return body.accessToken || body.token;
    } catch (e) {
      console.error(`Failed to parse login response: ${e.message}`);
      return null;
    }
  }

  console.error(`Login failed: ${res.status} - ${res.body}`);
  return null;
}

/**
 * Login with auto-selected test user for current VU
 */
export function loginAsTestUser(baseUrl) {
  const user = getTestUser();
  return login(baseUrl, user.email, user.password);
}

/**
 * Create authenticated request headers
 */
export function authHeaders(token) {
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
export function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

/**
 * Random sleep helper (returns seconds for k6 sleep)
 */
export function randomSleep(min, max) {
  return Math.random() * (max - min) + min;
}
