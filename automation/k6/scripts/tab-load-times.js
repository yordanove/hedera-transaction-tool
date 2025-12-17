import { htmlReport } from 'https://raw.githubusercontent.com/benc-uk/k6-reporter/main/dist/bundle.js';
import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Trend, Rate } from 'k6/metrics';
import { login, authHeaders, formatDuration } from '../lib/helpers.js';
import { formatDataMetrics, needed_properties } from '../helpers/utils.js';
import { endpoints } from '../config/environments.js';

/*
 * Tab Load Times Performance Test
 *
 * Baseline test for all main UI tabs.
 */

// Custom metrics per tab
const readyToSignDuration = new Trend('tab_ready_to_sign_duration');
const readyToApproveDuration = new Trend('tab_ready_to_approve_duration');
const inProgressDuration = new Trend('tab_in_progress_duration');
const readyForExecutionDuration = new Trend('tab_ready_for_execution_duration');
const allTransactionsDuration = new Trend('tab_all_transactions_duration');
const historyDuration = new Trend('tab_history_duration');
const notificationsDuration = new Trend('tab_notifications_duration');

const tabLoadSuccess = new Rate('tab_load_success');

export const options = {
  scenarios: {
    // Single user baseline
    baseline: {
      executor: 'constant-vus',
      vus: 1,
      duration: '2m',
      tags: { scenario: 'baseline' },
    },
  },
  thresholds: {
    tab_ready_to_sign_duration: ['p(95)<1000'],
    tab_ready_to_approve_duration: ['p(95)<1000'],
    tab_in_progress_duration: ['p(95)<1000'],
    tab_ready_for_execution_duration: ['p(95)<1000'],
    tab_all_transactions_duration: ['p(95)<1000'],
    tab_history_duration: ['p(95)<1000'],
    tab_notifications_duration: ['p(95)<1000'],
    tab_load_success: ['rate>0.99'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001';
const USER_EMAIL = __ENV.USER_EMAIL || 'admin@test.com';
const USER_PASSWORD = __ENV.USER_PASSWORD || '1234567890';

const TABS = [
  {
    name: 'Ready to Sign',
    endpoint: endpoints['ready-to-sign'],
    metric: readyToSignDuration,
    tag: 'ready-to-sign',
  },
  {
    name: 'Ready to Approve',
    endpoint: endpoints['ready-to-approve'],
    metric: readyToApproveDuration,
    tag: 'ready-to-approve',
  },
  {
    name: 'In Progress',
    endpoint: endpoints['in-progress'],
    metric: inProgressDuration,
    tag: 'in-progress',
  },
  {
    name: 'Ready for Execution',
    endpoint: endpoints['ready-for-execution'],
    metric: readyForExecutionDuration,
    tag: 'ready-for-execution',
  },
  {
    name: 'All Transactions',
    endpoint: endpoints['all-transactions'],
    metric: allTransactionsDuration,
    tag: 'all-transactions',
  },
  {
    name: 'History',
    endpoint: endpoints['history'],
    metric: historyDuration,
    tag: 'history',
  },
  {
    name: 'Notifications',
    endpoint: endpoints['notifications'],
    metric: notificationsDuration,
    tag: 'notifications',
  },
];

export function setup() {
  const token = login(BASE_URL, USER_EMAIL, USER_PASSWORD);
  if (!token) {
    console.error('Failed to authenticate - check credentials');
    return { token: null };
  }
  console.log('Authentication successful');
  return { token };
}

export default function (data) {
  const { token } = data;
  if (!token) {
    console.error('No auth token - skipping iteration');
    return;
  }

  const headers = authHeaders(token);

  // Test each tab
  TABS.forEach(tab => {
    group(tab.name, () => {
      const res = http.get(`${BASE_URL}${tab.endpoint}`, {
        ...headers,
        tags: { name: tab.tag },
      });

      const success = res.status === 200;
      tabLoadSuccess.add(success);
      tab.metric.add(res.timings.duration);

      check(res, {
        [`${tab.name} status 200`]: r => r.status === 200,
        [`${tab.name} response < 1s`]: r => r.timings.duration < 1000,
      });

      if (!success) {
        console.warn(`${tab.name} failed: ${res.status} - ${res.body}`);
      }
    });

    sleep(0.5); // Small delay between tabs
  });

  sleep(1); // Delay between iterations
}

export function handleSummary(data) {
  const summary = generateTextSummary(data);
  formatDataMetrics(data, needed_properties);

  return {
    'k6/reports/tab-load-times-report.html': htmlReport(data),
    'k6/reports/tab-load-times-summary.json': JSON.stringify(data, null, 2),
    stdout: summary,
  };
}

function generateTextSummary(data) {
  let output = '\n=== Tab Load Times Summary ===\n\n';

  const tabMetrics = [
    { name: 'Ready to Sign', key: 'tab_ready_to_sign_duration' },
    { name: 'Ready to Approve', key: 'tab_ready_to_approve_duration' },
    { name: 'In Progress', key: 'tab_in_progress_duration' },
    { name: 'Ready for Exec', key: 'tab_ready_for_execution_duration' },
    { name: 'All Transactions', key: 'tab_all_transactions_duration' },
    { name: 'History', key: 'tab_history_duration' },
    { name: 'Notifications', key: 'tab_notifications_duration' },
  ];

  output += '| Tab                | Avg      | P95      | Max      |\n';
  output += '|--------------------|----------|----------|----------|\n';

  tabMetrics.forEach(tab => {
    const metric = data.metrics[tab.key];
    if (metric && metric.values) {
      const v = metric.values;
      output += `| ${tab.name.padEnd(18)} | ${formatDuration(v.avg).padEnd(8)} | ${formatDuration(v['p(95)']).padEnd(8)} | ${formatDuration(v.max).padEnd(8)} |\n`;
    }
  });

  const successRate = data.metrics.tab_load_success;
  if (successRate && successRate.values) {
    output += `\nSuccess Rate: ${(successRate.values.rate * 100).toFixed(2)}%\n`;
  }

  return output;
}
