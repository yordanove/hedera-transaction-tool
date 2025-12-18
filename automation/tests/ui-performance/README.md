# UI Performance Tests (Playwright)

Frontend performance testing using Playwright - measures Electron app responsiveness.

## Purpose

These tests measure **frontend/UI performance**:
- App startup time
- Page load and render times
- UI responsiveness under data load

**Target:** All pages load in < 1 second with 100+ items

## Key Difference from k6 Tests

| This folder (`tests/ui-performance/`) | `k6/` |
|---------------------------------------|-------|
| Tests the **Electron UI** | Tests the **backend API** directly |
| Runs in Playwright/Node.js | Runs in k6 runtime |
| Single user, measures render times | Simulates 100+ concurrent users |
| Launches actual Electron app | No browser/UI involved |

## Test Files

| Test | What It Measures | Threshold |
|------|------------------|-----------|
| `appStartupPerformance.test.ts` | Time to launch Electron app | < 3 seconds |
| `draftsPerformance.test.ts` | Drafts tab load time | < 1 second |
| `accountsPerformance.test.ts` | Accounts page load time | < 1 second |
| `contactsPerformance.test.ts` | Contacts page load time | < 1 second |
| `filesPerformance.test.ts` | Files page load time | < 1 second |

## Running Tests

```bash
cd automation

# List all UI performance tests
npx playwright test tests/ui-performance/ --list

# Run all UI performance tests
npx playwright test tests/ui-performance/

# Run a specific test
npx playwright test tests/ui-performance/appStartupPerformance.test.ts
```

## Requirements

- Built Electron app binary
- Set `EXECUTABLE_PATH` environment variable to app location
- Dependencies installed (`pnpm install`)

## Utilities

`performanceUtils.ts` provides:
- `measurePageLoadTime()` - Measure navigation time
- `measureElementAppearTime()` - Measure element render time
- `collectPerformanceSamples()` - Gather multiple timing samples
- `formatDuration()` - Format milliseconds for display
- `assertLoadTime()` - Assert against threshold
