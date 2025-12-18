# k6 API/Load Performance Tests

Backend performance testing using [k6](https://k6.io/) - tests API response times under load.

## Purpose

These tests measure **backend/API performance**:
- API response times under concurrent user load
- Transaction signing throughput
- Database query performance via API

**Target:** 100+ concurrent users, all API responses < 1 second

## Key Difference from UI Performance Tests

| This folder (`k6/`) | `tests/ui-performance/` |
|---------------------|-------------------------|
| Tests the **backend API** directly | Tests the **Electron UI** |
| Runs in k6 runtime (not Node.js) | Runs in Playwright/Node.js |
| Simulates 100+ concurrent users | Single user, measures render times |
| No browser/UI involved | Launches actual Electron app |

## Quick Start

```bash
cd automation

# Seed test user (required once)
npm run k6:seed

# Run smoke test
npm run k6:smoke

# Run all tab load times
npm run k6:tabs

# Run with Grafana dashboards
npm run grafana:start
npm run k6:tabs:grafana
```

## Test Scripts

| Script | Purpose | Threshold |
|--------|---------|-----------|
| `smoke-test.js` | Health check | API responds |
| `tab-load-times.js` | All 7 tabs | < 1 second each |
| `sign-all.js` | Sign 100 transactions | < 4 seconds |
| Individual tab scripts | Focused testing | < 1 second |

## Requirements

- k6 installed (`brew install k6`)
- Backend running (`docker-compose up` in back-end/)
- Test user seeded (`npm run k6:seed`)
