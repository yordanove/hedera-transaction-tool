# k6 Performance Tests

Performance testing suite for Hedera Transaction Tool using k6.

## Requirements

| Requirement | Target | Notes |
|-------------|--------|-------|
| Concurrent users | 100+ | Minimum for load testing |
| Test type | Load + Stress | Prioritize load testing |
| Page load time | < 1 second | All tabs |
| Sign all | < 4 seconds | Transaction GROUP with 100 txns, signed at once |
| Key structure | Complex nested thresholds | Like account 0.0.2 (16-of-29 with nested keys) |

### Tabs to Test
- Ready to Sign
- Ready to Approve
- All Transactions
- History
- Notifications

### Environment
- Staging environment: Pending from Hedera
- Test credentials: Will be provided with staging

## Setup

```bash
# Install k6 (macOS)
brew install k6

# Start Grafana stack (optional, for real-time dashboards)
npm run grafana:start

# Run smoke test
npm run k6:smoke

# Run with Grafana output
npm run k6:smoke:grafana

# View dashboard at http://localhost:3030
```

## Project Structure

```
k6/
├── config/
│   ├── environments.js  # Multi-env URLs
│   └── options.js       # Load profiles (smoke, load, stress, spike)
├── scripts/
│   ├── smoke-test.js    # Health check
│   ├── tab-load-times.js # All tabs performance
│   ├── ready-to-sign.js # Single tab focus
│   └── sign-all.js      # 100 txn signing benchmark
├── helpers/
│   └── sign-transactions.js # Node.js signing utility
├── lib/
│   └── helpers.js       # Auth, multi-user, formatting
├── grafana/             # InfluxDB + Grafana dashboards
├── data/                # Test data
├── docs/                # API reference
└── reports/             # Output (gitignored)
```

## npm Scripts

```bash
# Grafana management
npm run grafana:start    # Start InfluxDB + Grafana
npm run grafana:stop     # Stop stack
npm run grafana:logs     # View logs

# k6 tests
npm run k6:smoke         # Quick health check
npm run k6:tabs          # All tabs load times
npm run k6:ready-to-sign # Ready to Sign focus
npm run k6:sign-all      # 100 txn signing benchmark

# With Grafana output (add :grafana suffix)
npm run k6:smoke:grafana
npm run k6:tabs:grafana
```
