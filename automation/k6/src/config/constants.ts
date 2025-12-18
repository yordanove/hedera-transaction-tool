/**
 * k6 Performance Testing Constants
 *
 * Centralized configuration values derived from performance requirements.
 */

/**
 * Performance thresholds (milliseconds)
 */
export const THRESHOLDS = {
  PAGE_LOAD_MS: 1000,
  SIGN_ALL_MS: 4000,
  P95_PERCENTILE: 'p(95)',
};

/**
 * Data volume requirements per page
 * Based on performance acceptance criteria
 */
export const DATA_VOLUMES = {
  SIGN_ALL_TRANSACTIONS: 200,
  READY_TO_SIGN: 200,
  DRAFTS: 100,
  READY_FOR_REVIEW: 100,
  CONTACTS: 100,
  ACCOUNTS: 100,
  FILES: 100,
  HISTORY: 500,
};

/**
 * Load testing configuration
 */
export const LOAD_TEST = {
  CONCURRENT_USERS: 100,
  MAX_ADDITIONAL_USERS: 10,
};

/**
 * Delays between operations (seconds)
 */
export const DELAYS = {
  BETWEEN_TABS: 0.5,
  BETWEEN_ITERATIONS: 1,
};

/**
 * HTTP status codes
 */
export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  UNAUTHORIZED: 401,
};

/**
 * Pagination defaults
 */
export const PAGINATION = {
  DEFAULT_PAGE: 1,
  DEFAULT_SIZE: 100,
  HISTORY_SIZE: 500,
};
