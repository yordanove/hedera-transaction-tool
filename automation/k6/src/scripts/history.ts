/**
 * History Load Test
 *
 * Requirements:
 * - Page load < 1 second
 * - 100+ concurrent users
 */

import { htmlReport } from 'https://raw.githubusercontent.com/benc-uk/k6-reporter/main/dist/bundle.js';
import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { login, authHeaders, formatDuration } from '../lib/helpers';
import { formatDataMetrics, needed_properties, textSummary } from '../lib/utils';
import { endpoints } from '../config/environments';
import type { K6Options, SetupData, SummaryData, SummaryOutput } from '../types';

declare const __ENV: Record<string, string | undefined>;

/**
 * k6 options configuration
 */
export const options: K6Options = {
  scenarios: {
    load: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '1m', target: 50 },
        { duration: '2m', target: 100 },
        { duration: '3m', target: 100 },
        { duration: '1m', target: 0 },
      ],
      tags: { scenario: 'load' },
    },
  },
  thresholds: {
    'http_req_duration{name:history}': ['p(95)<1000'],
    http_req_failed: ['rate<0.01'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001';
const USER_EMAIL = __ENV.USER_EMAIL || 'admin@test.com';
const USER_PASSWORD = __ENV.USER_PASSWORD || '1234567890';

/**
 * Setup function - authenticates and returns token
 */
export function setup(): SetupData {
  const token = login(BASE_URL, USER_EMAIL, USER_PASSWORD);
  if (!token) {
    console.error('Failed to authenticate');
  }
  return { token };
}

/**
 * Main test function
 */
export default function (data: SetupData): void {
  const { token } = data;
  if (!token) return;

  const headers = authHeaders(token);

  group('History Page', () => {
    const res = http.get(`${BASE_URL}${endpoints['history']}`, {
      ...headers,
      tags: { name: 'history' },
    });

    check(res, {
      'history status 200': (r) => r.status === 200,
      'history response < 1s': (r) => r.timings.duration < 1000,
    });

    console.log(`History load time: ${formatDuration(res.timings.duration)}`);
  });

  sleep(1);
}

/**
 * Generate summary report
 */
export function handleSummary(data: SummaryData): SummaryOutput {
  formatDataMetrics(data, needed_properties);

  return {
    'k6/reports/history-report.html': htmlReport(data),
    'k6/reports/history.json': JSON.stringify(data, null, 2),
    stdout: textSummary(data, 'History'),
  };
}
