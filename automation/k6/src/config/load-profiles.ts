/**
 * k6 Load Test Profiles
 *
 * Reusable load stages and threshold configurations.
 */

import { LOAD_TEST, THRESHOLDS } from './constants';

/**
 * Stage configuration for k6 options
 */
export interface LoadStage {
  duration: string;
  target: number;
}

/**
 * Standard load test stages
 * Ramps up to 100 concurrent users, sustains, then ramps down
 */
export const STANDARD_LOAD_STAGES: LoadStage[] = [
  { duration: '1m', target: 50 },
  { duration: '2m', target: LOAD_TEST.CONCURRENT_USERS },
  { duration: '3m', target: LOAD_TEST.CONCURRENT_USERS },
  { duration: '1m', target: 0 },
];

/**
 * Quick smoke test stages
 * Light load for basic validation
 */
export const SMOKE_STAGES: LoadStage[] = [
  { duration: '30s', target: 5 },
  { duration: '30s', target: 0 },
];

/**
 * Stress test stages
 * Pushes beyond normal load to find breaking points
 */
export const STRESS_STAGES: LoadStage[] = [
  { duration: '2m', target: 100 },
  { duration: '5m', target: 200 },
  { duration: '2m', target: 300 },
  { duration: '5m', target: 300 },
  { duration: '2m', target: 0 },
];

/**
 * Spike test stages
 * Sudden traffic bursts
 */
export const SPIKE_STAGES: LoadStage[] = [
  { duration: '1m', target: 10 },
  { duration: '10s', target: 200 },
  { duration: '1m', target: 200 },
  { duration: '10s', target: 10 },
  { duration: '1m', target: 0 },
];

/**
 * Standard thresholds for tab/page loading
 * p(95) < 1 second, < 1% failure rate
 */
export const TAB_LOAD_THRESHOLDS: Record<string, string[]> = {
  http_req_duration: [`${THRESHOLDS.P95_PERCENTILE}<${THRESHOLDS.PAGE_LOAD_MS}`],
  http_req_failed: ['rate<0.01'],
};

/**
 * Sign-all specific thresholds
 * Bulk signing: p(95) < 4 seconds
 */
export const SIGN_ALL_THRESHOLDS: Record<string, string[]> = {
  http_req_duration: [`${THRESHOLDS.P95_PERCENTILE}<${THRESHOLDS.PAGE_LOAD_MS}`],
  sign_all_duration: [`${THRESHOLDS.P95_PERCENTILE}<${THRESHOLDS.SIGN_ALL_MS}`],
  http_req_failed: ['rate<0.01'],
};

/**
 * Build threshold entry for a specific tab
 */
export function buildTabThreshold(tabName: string): Record<string, string[]> {
  return {
    [`http_req_duration{name:${tabName}}`]: [
      `${THRESHOLDS.P95_PERCENTILE}<${THRESHOLDS.PAGE_LOAD_MS}`,
    ],
  };
}
