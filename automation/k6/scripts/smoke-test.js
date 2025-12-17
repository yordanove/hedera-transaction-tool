import http from 'k6/http';
import { check, sleep } from 'k6';

// Smoke test configuration - single user, quick validation
export const options = {
  vus: 1,
  duration: '30s',
  thresholds: {
    http_req_duration: ['p(95)<2000'], // 95% of requests under 2s
    checks: ['rate>0.99'],              // 99% of checks must pass
  },
};

// Staging URL pending from Hedera (use -e BASE_URL=... to override)
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001';

export default function () {
  // Test API is responding (users endpoint requires no auth for basic check)
  const apiRes = http.get(`${BASE_URL}/users`);

  check(apiRes, {
    'API responds (even if 401)': (r) => r.status === 200 || r.status === 401,
    'response time < 500ms': (r) => r.timings.duration < 500,
  });

  sleep(1);
}

export function handleSummary(data) {
  return {
    'k6/reports/smoke-test-summary.json': JSON.stringify(data, null, 2),
  };
}
