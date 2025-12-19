/**
 * Sign All Transactions Performance Test
 *
 * This test measures the API upload time for pre-signed transactions.
 * Signatures are generated beforehand using the Node.js helper:
 *   tsx k6/helpers/sign-transactions.ts
 *
 * Two modes:
 * 1. PRE_SIGNED_FILE - Load signatures from JSON file (recommended)
 * 2. API_ONLY - Fetch transactions and measure GET/POST without real signatures
 */

import http from 'k6/http';
import { check, group, fail } from 'k6';
import { Trend, Counter, Rate } from 'k6/metrics';
import { authHeaders, formatDuration } from '../lib/helpers';
import { standardSetup } from '../lib/setup';
import { getBaseUrlWithFallback } from '../config/credentials';
import { DATA_VOLUMES, THRESHOLDS, HTTP_STATUS, PAGINATION } from '../config/constants';
import type {
  K6Options,
  SetupData,
  SummaryData,
  SummaryOutput,
  Transaction,
  TransactionToSignDto,
  PaginatedResponse,
  PreSignedData,
} from '../types';

declare const __ENV: Record<string, string | undefined>;
declare function open(filePath: string): string;

// Debug mode - gate verbose logging
const DEBUG = __ENV.DEBUG === 'true';

// Custom metrics
const signAllDuration = new Trend('sign_all_duration');
const uploadSignatureDuration = new Trend('upload_signature_duration');
const transactionsProcessed = new Counter('transactions_processed');
const uploadSuccess = new Rate('upload_success_rate');

// Configuration from constants
const BASE_URL = getBaseUrlWithFallback();
const SIGNATURES_FILE = __ENV.SIGNATURES_FILE || '';

/**
 * k6 options configuration
 */
export const options: K6Options = {
  scenarios: {
    signAll: {
      executor: 'shared-iterations',
      vus: 1,
      iterations: 1,
      maxDuration: '5m',
    },
  },
  thresholds: {
    sign_all_duration: [`p(95)<${THRESHOLDS.SIGN_ALL_MS}`],
    upload_success_rate: ['rate>0.99'],
  },
};

// Load pre-signed signatures if file provided
let preSignedData: PreSignedData | null = null;
if (SIGNATURES_FILE) {
  try {
    preSignedData = JSON.parse(open(SIGNATURES_FILE)) as PreSignedData;
    console.log(
      `Loaded ${preSignedData.count || preSignedData.signatureCount} pre-signed transactions`,
    );
  } catch {
    console.warn(`Could not load signatures file: ${SIGNATURES_FILE}`);
    console.warn('Running in API_ONLY mode (no real signatures)');
  }
}

/**
 * Setup function - authenticates and returns token
 */
export function setup(): SetupData {
  const data = standardSetup(BASE_URL);
  if (data.token) {
    console.log('Authentication successful');
  }
  return data;
}

/**
 * Main test function - signs all transactions
 */
export default function (data: SetupData): void {
  const { token } = data;
  if (!token) {
    console.error('No auth token - aborting test');
    return;
  }

  const headers = authHeaders(token);

  group('Sign All Transactions', () => {
    // Step 1: Fetch transactions to sign (with pagination for 200 txns)
    if (DEBUG) console.log('Fetching transactions to sign...');

    let transactions: Transaction[] = [];
    const targetCount = DATA_VOLUMES.SIGN_ALL_TRANSACTIONS;
    const pagesNeeded = Math.ceil(targetCount / PAGINATION.MAX_SIZE);

    for (let page = 1; page <= pagesNeeded; page++) {
      const listRes = http.get(
        `${BASE_URL}/transactions/sign?page=${page}&size=${PAGINATION.MAX_SIZE}`,
        { ...headers, tags: { name: 'list-to-sign' } },
      );

      const listSuccess = check(listRes, {
        [`list transactions page ${page} status 200`]: (r) => r.status === HTTP_STATUS.OK,
      });

      if (!listSuccess) {
        console.error(`Failed to list transactions page ${page}: ${listRes.status}`);
        break;
      }

      try {
        // Response contains TransactionToSignDto[] - extract Transaction from each wrapper
        const body = JSON.parse(listRes.body as string) as PaginatedResponse<TransactionToSignDto>;
        const txItems = body.items.map((item) => item.transaction);
        transactions = [...transactions, ...txItems];

        // Stop if we have enough or no more pages
        if (transactions.length >= targetCount || body.items.length < PAGINATION.MAX_SIZE) {
          break;
        }
      } catch (e) {
        const error = e as Error;
        console.error(`Failed to parse response: ${error.message}`);
        break;
      }
    }

    const txCount = Math.min(transactions.length, targetCount);
    if (DEBUG) console.log(`Found ${transactions.length} transactions, processing ${txCount}`);

    if (txCount === 0) {
      console.warn('No transactions to sign - need to seed data first');
      return;
    }

    // Step 2: Upload signatures using batch endpoint
    const startTime = Date.now();
    let successCount = 0;

    if (preSignedData) {
      // Batch mode - build payloads and send single request
      // Use transactionId string key (not numeric id) with fallback to legacy array format
      interface SignaturePayload {
        id: number;
        signatureMap: Record<string, unknown>;
      }
      const payloads: SignaturePayload[] = [];

      for (let i = 0; i < Math.min(transactions.length, txCount); i++) {
        const tx = transactions[i];
        // Key by transactionId (Hedera string), fallback to stringified id
        const key = tx.transactionId ?? String(tx.id);
        const signatureMap =
          preSignedData.signaturesByTxId?.[key] ||
          preSignedData.signatures?.[i] ||
          preSignedData.transactions?.[i]?.signatureMap;

        if (!signatureMap || Object.keys(signatureMap).length === 0) {
          if (DEBUG) console.warn(`No signature found for tx ${tx.id} (key: ${key})`);
          continue; // Skip, don't submit empty signatureMap
        }

        payloads.push({ id: tx.id, signatureMap });
      }

      if (payloads.length < txCount) {
        fail(
          `Missing signatures: ${payloads.length}/${txCount}. ` +
            `Ensure signaturesByTxId keys match tx.transactionId`,
        );
      }

      if (DEBUG) console.log(`Submitting ${payloads.length} signatures`);

      const batchRes = http.post(`${BASE_URL}/transactions/signers`, JSON.stringify(payloads), {
        ...headers,
        tags: { name: 'batch-sign' },
      });

      const batchSuccess =
        batchRes.status === HTTP_STATUS.OK || batchRes.status === HTTP_STATUS.CREATED;
      uploadSuccess.add(batchSuccess);
      uploadSignatureDuration.add(batchRes.timings.duration);

      if (batchSuccess) {
        successCount = payloads.length;
        transactionsProcessed.add(payloads.length);
      } else {
        console.error(`Batch upload failed: ${batchRes.status}`);
        if (DEBUG) console.error(`Response: ${batchRes.body}`);
      }
    } else {
      // API_ONLY mode - just measure GET requests (no real signatures)
      for (let i = 0; i < txCount; i++) {
        const tx = transactions[i];
        const getRes = http.get(`${BASE_URL}/transactions/${tx.id}`, {
          ...headers,
          tags: { name: 'get-transaction' },
        });
        uploadSignatureDuration.add(getRes.timings.duration);
        if (getRes.status === HTTP_STATUS.OK) {
          successCount++;
          transactionsProcessed.add(1);
          uploadSuccess.add(true);
        } else {
          uploadSuccess.add(false);
        }
      }
    }

    const totalDuration = Date.now() - startTime;
    signAllDuration.add(totalDuration);

    // Results (always log summary)
    const mode = preSignedData ? 'PRE_SIGNED_BATCH' : 'API_ONLY';
    console.log('\n--- Sign All Results ---');
    console.log(`Mode: ${mode}`);
    console.log(`Transactions: ${successCount}/${txCount}`);
    console.log(`Total time: ${formatDuration(totalDuration)}`);
    console.log(`Target: ${formatDuration(THRESHOLDS.SIGN_ALL_MS)}`);
    console.log(`Status: ${totalDuration <= THRESHOLDS.SIGN_ALL_MS ? 'PASS' : 'FAIL'}`);

    check(null, {
      [`process ${txCount} transactions under ${THRESHOLDS.SIGN_ALL_MS}ms`]: () =>
        totalDuration <= THRESHOLDS.SIGN_ALL_MS,
      'all transactions processed successfully': () => successCount === txCount,
    });
  });
}

/**
 * Generate text summary for console output
 */
function generateTextSummary(data: SummaryData): string {
  let output = '\n=== Sign All Transactions Summary ===\n\n';

  const signAll = data.metrics.sign_all_duration;
  if (signAll?.values) {
    output += `Total Batch Duration:\n`;
    output += `  Value: ${formatDuration(signAll.values.avg)}\n`;
    output += `  Target: ${formatDuration(THRESHOLDS.SIGN_ALL_MS)}\n`;
    output += `  Status: ${signAll.values.avg <= THRESHOLDS.SIGN_ALL_MS ? 'PASS' : 'FAIL'}\n\n`;
  }

  const uploadDur = data.metrics.upload_signature_duration;
  if (uploadDur?.values) {
    output += `Per-Transaction Duration:\n`;
    output += `  Avg: ${formatDuration(uploadDur.values.avg)}\n`;
    output += `  P95: ${formatDuration(uploadDur.values['p(95)'])}\n`;
    output += `  Max: ${formatDuration(uploadDur.values.max)}\n\n`;
  }

  const processed = data.metrics.transactions_processed;
  if (processed?.values) {
    output += `Transactions Processed: ${processed.values.count}\n`;
  }

  const successRate = data.metrics.upload_success_rate;
  if (successRate?.values) {
    output += `Success Rate: ${(successRate.values.rate! * 100).toFixed(2)}%\n`;
  }

  return output;
}

/**
 * Generate summary report
 */
export function handleSummary(data: SummaryData): SummaryOutput {
  const summary = generateTextSummary(data);

  return {
    'k6/reports/sign-all-summary.json': JSON.stringify(data, null, 2),
    stdout: summary,
  };
}
