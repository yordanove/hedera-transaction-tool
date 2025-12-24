/**
 * Smoke Test
 *
 * Quick health check to verify API is responding.
 * Single user, short duration, basic validation.
 */

import http, { setResponseCallback, expectedStatuses } from 'k6/http';
import { check, sleep } from 'k6';
import { getBaseUrlWithFallback } from '../config/credentials';
import { DELAYS, HTTP_STATUS } from '../config/constants';
import { generateReport } from '../lib/reporter';
import { formatDataMetrics, needed_properties } from '../lib/utils';
import type { K6Options, SummaryData, SummaryOutput } from '../types';

// Tell k6 that 200 and 401 are both acceptable responses for this test
// (401 is expected since we don't authenticate - we just check the API is responding)
setResponseCallback(expectedStatuses(200, 401));

/**
 * k6 options - smoke test configuration
 */
export const options: K6Options = {
  vus: 1,
  duration: '30s',
  thresholds: {
    http_req_duration: ['p(95)<2000'],
    checks: ['rate>0.99'],
  },
};

const BASE_URL = getBaseUrlWithFallback();

/**
 * Main test function - runs for each VU iteration
 */
export default function (): void {
  // Test API is responding (users endpoint requires no auth for basic check)
  const apiRes = http.get(`${BASE_URL}/users`);

  check(apiRes, {
    'API responds (even if 401)': (r) =>
      r.status === HTTP_STATUS.OK || r.status === HTTP_STATUS.UNAUTHORIZED,
    'response time < 500ms': (r) => r.timings.duration < 500,
  });

  sleep(DELAYS.BETWEEN_ITERATIONS);
}

/**
 * Generate summary report
 */
export function handleSummary(data: SummaryData): SummaryOutput {
  formatDataMetrics(data, needed_properties);
  return generateReport(data, 'smoke-test', 'Smoke Test');
}
