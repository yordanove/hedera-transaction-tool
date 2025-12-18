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
import { check, group } from 'k6';
import { Trend, Counter, Rate } from 'k6/metrics';
import { authHeaders, formatDuration } from '../lib/helpers';
import { standardSetup } from '../lib/setup';
import { getBaseUrlWithFallback } from '../config/credentials';
import { DATA_VOLUMES, THRESHOLDS, HTTP_STATUS } from '../config/constants';
import type {
  K6Options,
  SetupData,
  SummaryData,
  SummaryOutput,
  Transaction,
  PaginatedResponse,
  PreSignedData,
} from '../types';

declare const __ENV: Record<string, string | undefined>;
declare function open(filePath: string): string;

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
    // Step 1: Get transactions to sign
    console.log('Fetching transactions to sign...');
    const listRes = http.get(`${BASE_URL}/transactions/sign`, {
      ...headers,
      tags: { name: 'list-to-sign' },
    });

    const listSuccess = check(listRes, {
      'list transactions status 200': (r) => r.status === 200,
    });

    if (!listSuccess) {
      console.error(`Failed to list transactions: ${listRes.status}`);
      return;
    }

    let transactions: Transaction[];
    try {
      const body = JSON.parse(listRes.body as string) as
        | PaginatedResponse<Transaction>
        | Transaction[];
      transactions = Array.isArray(body) ? body : body.data;
    } catch (e) {
      const error = e as Error;
      console.error(`Failed to parse response: ${error.message}`);
      return;
    }

    const txCount = Math.min(transactions.length, DATA_VOLUMES.SIGN_ALL_TRANSACTIONS);
    console.log(`Found ${transactions.length} transactions, processing ${txCount}`);

    if (txCount === 0) {
      console.warn('No transactions to sign - need to seed data first');
      return;
    }

    // Step 2: Upload signatures and measure total time
    const startTime = Date.now();
    let successCount = 0;

    for (let i = 0; i < txCount; i++) {
      const tx = transactions[i];
      const txId = tx.id || tx.transactionId;

      // Get signature payload
      let signaturePayload: { id: number | string; signatureMap: unknown } | null = null;

      if (preSignedData?.signatures?.[i]) {
        // Use pre-signed signature from file
        signaturePayload = {
          id: txId!,
          signatureMap: preSignedData.signatures[i],
        };
      } else if (preSignedData?.transactions?.[i]) {
        // Alternative format from signMultipleTransactions
        signaturePayload = {
          id: txId!,
          signatureMap: preSignedData.transactions[i].signatures[0],
        };
      } else {
        // No pre-signed data - just measure GET (API_ONLY mode)
        const getRes = http.get(`${BASE_URL}/transactions/${txId}`, {
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
        continue;
      }

      // POST signature to API
      const uploadRes = http.post(
        `${BASE_URL}/transactions/${txId}/signers`,
        JSON.stringify(signaturePayload),
        {
          ...headers,
          tags: { name: 'upload-signature' },
        },
      );

      const success = uploadRes.status === HTTP_STATUS.OK || uploadRes.status === HTTP_STATUS.CREATED;
      uploadSuccess.add(success);
      uploadSignatureDuration.add(uploadRes.timings.duration);

      if (success) {
        successCount++;
        transactionsProcessed.add(1);
      } else {
        console.warn(`Failed to upload signature for tx ${txId}: ${uploadRes.status}`);
      }
    }

    const totalDuration = Date.now() - startTime;
    signAllDuration.add(totalDuration);

    // Results
    const mode = preSignedData ? 'PRE_SIGNED' : 'API_ONLY';
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
