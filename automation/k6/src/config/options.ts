/**
 * Load Test Options
 *
 * Reusable k6 load test profiles and configurations.
 */

import type { K6Options } from '../types';

// Re-export environment utilities
export { BASE_URL, getEnvironment, logEnvironment, ENVIRONMENTS, endpoints } from './environments';

/**
 * Smoke test - quick health check
 */
export const smokeOptions: K6Options = {
  vus: 1,
  duration: '30s',
  thresholds: {
    http_req_duration: ['p(95)<500'],
    http_req_failed: ['rate<0.01'],
  },
};

/**
 * Load test - normal expected traffic
 */
export const loadOptions: K6Options = {
  stages: [
    { duration: '1m', target: 50 },
    { duration: '3m', target: 50 },
    { duration: '1m', target: 100 },
    { duration: '3m', target: 100 },
    { duration: '2m', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<1000', 'p(99)<2000'],
    http_req_failed: ['rate<0.05'],
  },
};

/**
 * Stress test - find breaking point
 */
export const stressOptions: K6Options = {
  stages: [
    { duration: '2m', target: 100 },
    { duration: '5m', target: 200 },
    { duration: '2m', target: 300 },
    { duration: '5m', target: 300 },
    { duration: '5m', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<2000'],
    http_req_failed: ['rate<0.1'],
  },
};

/**
 * Spike test - sudden burst of traffic
 */
export const spikeOptions: K6Options = {
  stages: [
    { duration: '10s', target: 10 },
    { duration: '1m', target: 500 },
    { duration: '10s', target: 500 },
    { duration: '3m', target: 10 },
    { duration: '1m', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<3000'],
    http_req_failed: ['rate<0.15'],
  },
};

/**
 * Sign-all specific - batch operation test
 */
export const signAllOptions: K6Options = {
  scenarios: {
    signAll: {
      executor: 'shared-iterations',
      vus: 1,
      iterations: 1,
      maxDuration: '5m',
    },
  },
  thresholds: {
    sign_all_duration: ['p(95)<4000'], // 100 txns in < 4s
    upload_success_rate: ['rate>0.99'],
  },
};
