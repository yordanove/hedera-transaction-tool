# k6 NPM Commands

All commands are run from the `automation/` directory.

---

## Quick Reference

| Command | Description | Duration |
|---------|-------------|----------|
| `npm run k6:baseline` | Quick verification (smoke + all tabs) | ~2.5 min |
| `npm run k6:load:all` | Full load tests (100 VUs per tab) | ~35 min |
| `npm run k6:sign-all` | Sign 200 transactions (destructive) | ~2 min |

---

## Command Details

### k6:baseline
Quick verification that all endpoints work correctly.
- Runs: smoke-test + tab-load-times
- VUs: 1
- Duration: ~2.5 minutes
- Use for: CI checks, quick sanity tests

### k6:load:all
Full load testing with 100 concurrent users per tab.
- Runs: ready-to-sign, ready-to-approve, history, notifications, all-transactions
- VUs: 100 (ramping)
- Duration: ~35 minutes (7 min per test)
- Use for: Performance validation before releases
- Note: Runs all tests even if one fails thresholds (uses `;` not `&&`)

### k6:sign-all
Tests signing 200 transactions in batch.
- Mode: PRE_SIGNED_BATCH (uses pre-generated signatures)
- Duration: ~2 minutes
- Note: Destructive - changes transaction state. Run separately from other tests.

---

## Individual Test Commands

| Command | Tab | Duration |
|---------|-----|----------|
| `npm run k6:smoke` | Health check | 30s |
| `npm run k6:tabs` | All tabs (baseline) | 2 min |
| `npm run k6:ready-to-sign` | Ready to Sign | 7 min |
| `npm run k6:ready-to-approve` | Ready to Approve | 7 min |
| `npm run k6:history` | History | 7 min |
| `npm run k6:notifications` | Notifications | 7 min |
| `npm run k6:all-transactions` | All Transactions | 7 min |

All individual commands include automatic seeding and building.

---

## Load Test Configuration

Located in `k6/src/config/load-profiles.ts`:

```
STANDARD_LOAD_STAGES (7 min total):
  1m → ramp to 50 VUs
  2m → hold at 100 VUs
  3m → hold at 100 VUs
  1m → ramp down to 0
```
