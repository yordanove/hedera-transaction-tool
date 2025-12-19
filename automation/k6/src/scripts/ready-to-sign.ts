/**
 * Ready to Sign Performance Test
 *
 * Requirements:
 * - Ready to Sign page load < 1 second (200 items)
 * - 100+ concurrent users
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Trend, Rate } from 'k6/metrics';
import { authHeaders, formatDuration } from '../lib/helpers';
import { multiUserSetup, getTokenForVU } from '../lib/setup';
import { formatDataMetrics, needed_properties, textSummary } from '../lib/utils';
import { getBaseUrlWithFallback } from '../config/credentials';
import { DATA_VOLUMES, THRESHOLDS, DELAYS, HTTP_STATUS, PAGINATION } from '../config/constants';
import { STANDARD_LOAD_STAGES, TAB_LOAD_THRESHOLDS } from '../config/load-profiles';
import type {
  K6Options,
  MultiUserSetupData,
  SummaryData,
  SummaryOutput,
  PaginatedResponse,
  TransactionToSignDto,
} from '../types';

// Custom metrics
const totalDurationTrend = new Trend('ready_to_sign_total_duration');
const dataVolumeOk = new Rate('ready_to_sign_data_volume_ok');

declare const __ENV: Record<string, string | undefined>;
const DEBUG = __ENV.DEBUG === 'true';

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
    ready_to_sign_total_duration: [`${THRESHOLDS.P95_PERCENTILE}<${THRESHOLDS.PAGE_LOAD_MS}`],
    ready_to_sign_data_volume_ok: ['rate==1'], // Must fetch target volume
    ...TAB_LOAD_THRESHOLDS,
  },
};

const BASE_URL = getBaseUrlWithFallback();

/**
 * Setup function - authenticates all configured test users
 */
export function setup(): MultiUserSetupData {
  return multiUserSetup(BASE_URL);
}

/**
 * Main test function
 * Fetches 200 items across 2 pages (100 items per page due to backend limit)
 */
export default function (data: MultiUserSetupData): void {
  const token = getTokenForVU(data);
  if (!token) return;

  const headers = authHeaders(token);

  group('Ready to Sign Page', () => {
    const startTime = Date.now();
    let totalItems = 0;
    const targetCount = DATA_VOLUMES.READY_TO_SIGN; // 200
    const pagesNeeded = Math.ceil(targetCount / PAGINATION.MAX_SIZE); // 2

    for (let page = 1; page <= pagesNeeded; page++) {
      const res = http.get(
        `${BASE_URL}/transactions/sign?page=${page}&size=${PAGINATION.MAX_SIZE}`,
        { ...headers, tags: { name: 'ready-to-sign' } },
      );

      check(res, {
        [`ready-to-sign page ${page} status 200`]: (r) => r.status === HTTP_STATUS.OK,
      });

      if (res.status !== HTTP_STATUS.OK) {
        break;
      }

      try {
        const body = JSON.parse(res.body as string) as PaginatedResponse<TransactionToSignDto>;
        totalItems += body.items.length;

        // Stop if no more data
        if (body.items.length < PAGINATION.MAX_SIZE) break;
      } catch {
        break;
      }
    }

    const totalDuration = Date.now() - startTime;
    totalDurationTrend.add(totalDuration);
    dataVolumeOk.add(totalItems >= targetCount);

    check(null, {
      'ready-to-sign total time < 1s': () => totalDuration < THRESHOLDS.PAGE_LOAD_MS,
      [`fetched ${targetCount}+ items`]: () => totalItems >= targetCount,
    });

    if (DEBUG)
      console.log(`Ready to Sign: ${totalItems} items in ${formatDuration(totalDuration)}`);
  });

  sleep(DELAYS.BETWEEN_ITERATIONS);
}

/**
 * Generate summary report
 */
export function handleSummary(data: SummaryData): SummaryOutput {
  formatDataMetrics(data, needed_properties);

  return {
    'k6/reports/ready-to-sign.json': JSON.stringify(data, null, 2),
    stdout: textSummary(data, 'Ready to Sign'),
  };
}
