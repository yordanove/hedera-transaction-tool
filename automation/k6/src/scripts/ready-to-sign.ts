/**
 * Ready to Sign Performance Test
 *
 * Requirements:
 * - Sign all < 4 seconds with 100 transactions
 * - Ready to Sign page load < 1 second
 * - 100+ concurrent users
 * - Complex nested threshold keys
 */

import { htmlReport } from 'https://raw.githubusercontent.com/benc-uk/k6-reporter/main/dist/bundle.js';
import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { authHeaders, formatDuration } from '../lib/helpers';
import { standardSetup } from '../lib/setup';
import { formatDataMetrics, needed_properties, textSummary } from '../lib/utils';
import { getBaseUrlWithFallback } from '../config/credentials';
import { endpoints } from '../config/environments';
import { THRESHOLDS, DELAYS, HTTP_STATUS } from '../config/constants';
import { STANDARD_LOAD_STAGES, TAB_LOAD_THRESHOLDS } from '../config/load-profiles';
import type { K6Options, SetupData, SummaryData, SummaryOutput } from '../types';

/**
 * k6 options configuration
 */
export const options: K6Options = {
  scenarios: {
    load: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: STANDARD_LOAD_STAGES,
      tags: { scenario: 'load' },
    },
  },
  thresholds: {
    'http_req_duration{name:ready-to-sign}': [`${THRESHOLDS.P95_PERCENTILE}<${THRESHOLDS.PAGE_LOAD_MS}`],
    'http_req_duration{name:sign-transaction}': [`${THRESHOLDS.P95_PERCENTILE}<${THRESHOLDS.SIGN_ALL_MS}`],
    ...TAB_LOAD_THRESHOLDS,
  },
};

const BASE_URL = getBaseUrlWithFallback();

/**
 * Setup function - authenticates and returns token
 */
export function setup(): SetupData {
  return standardSetup(BASE_URL);
}

/**
 * Main test function
 */
export default function (data: SetupData): void {
  const { token } = data;
  if (!token) return;

  const headers = authHeaders(token);

  group('Ready to Sign Page', () => {
    const res = http.get(`${BASE_URL}${endpoints['ready-to-sign']}`, {
      ...headers,
      tags: { name: 'ready-to-sign' },
    });

    check(res, {
      'ready-to-sign status 200': (r) => r.status === HTTP_STATUS.OK,
      'ready-to-sign response < 1s': (r) => r.timings.duration < THRESHOLDS.PAGE_LOAD_MS,
    });

    console.log(`Ready to Sign load time: ${formatDuration(res.timings.duration)}`);
  });

  sleep(DELAYS.BETWEEN_ITERATIONS);
}

/**
 * Generate summary report
 */
export function handleSummary(data: SummaryData): SummaryOutput {
  formatDataMetrics(data, needed_properties);

  return {
    'k6/reports/ready-to-sign-report.html': htmlReport(data),
    'k6/reports/ready-to-sign.json': JSON.stringify(data, null, 2),
    stdout: textSummary(data, 'Ready to Sign'),
  };
}
