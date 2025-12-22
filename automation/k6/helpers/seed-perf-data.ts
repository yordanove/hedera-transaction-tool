/**
 * Seed Performance Test Data
 *
 * Creates test transactions in PostgreSQL for k6 performance tests.
 * Uses real Hedera SDK transactions so the /transactions/sign endpoint works.
 *
 * Usage:
 *   cd automation && npx tsx k6/helpers/seed-perf-data.ts
 *
 * Prerequisites:
 *   - Docker Postgres running (docker-compose up -d)
 *   - Test user created (npm run k6:seed)
 *
 * Environment variables:
 *   TEST_USER_EMAIL - Email of test user to link transactions to (required)
 */

import { Client, QueryResult } from 'pg';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import argon2 from 'argon2';
import {
  PrivateKey,
  Mnemonic,
  FileCreateTransaction,
  AccountId,
  Timestamp,
  Transaction,
} from '@hashgraph/sdk';
import { DATA_VOLUMES } from '../src/config/constants.js';
import type { SignatureMap } from '../src/types/api.types.js';

// ESM compatibility for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Seed marker for idempotency - used to identify and clean up seeded data
const SEED_MARKER = 'k6-perf-seed';

// Generated keypair for signing - stored in user_key table
let testPrivateKey: PrivateKey;
let testPublicKeyHex: string;
let testMnemonic: Mnemonic;
let testMnemonicHash: string;

// Data volume requirements - imported from single source of truth
const SIGN_COUNT = DATA_VOLUMES.READY_TO_SIGN;
const HISTORY_COUNT = DATA_VOLUMES.HISTORY;
const APPROVE_COUNT = DATA_VOLUMES.READY_FOR_REVIEW;
const GROUP_SIZE = DATA_VOLUMES.GROUP_SIZE;

interface UserRow {
  id: number;
}

interface UserKeyRow {
  id: number;
}

interface TransactionRow {
  id: number;
}

interface SignTransactionData {
  transactionId: string;
  unsignedBytes: Uint8Array;
}

const HISTORY_STATUSES = ['EXECUTED', 'FAILED', 'EXPIRED', 'CANCELED', 'ARCHIVED'] as const;

// Collect transaction data during seeding for signature generation
const signTransactionsData: SignTransactionData[] = [];

// Default test email (can be overridden via environment variable)
const DEFAULT_EMAIL = 'k6perf@test.com';

function getTestUserEmail(): string {
  return process.env.TEST_USER_EMAIL || DEFAULT_EMAIL;
}

async function initializeKeyPair(): Promise<void> {
  // Generate a mnemonic (24 words) so it can be imported during Account Setup
  testMnemonic = await Mnemonic.generate();
  // Derive the private key from the mnemonic
  testPrivateKey = await testMnemonic.toStandardEd25519PrivateKey('', 0);
  // Get public key in hex format (without DER prefix for storage)
  testPublicKeyHex = testPrivateKey.publicKey.toStringRaw();

  // Hash the mnemonic the same way front-end does: words.toString() (comma-separated)
  // This is required for accountSetupRequired() to return false
  const mnemonicWords = testMnemonic.toString().split(' ');
  testMnemonicHash = await argon2.hash(mnemonicWords.toString(), {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
  });

  console.log(`Generated test keypair from mnemonic: ${testPublicKeyHex.substring(0, 16)}...`);
  console.log(`Mnemonic hash: ${testMnemonicHash.substring(0, 30)}...`);
}

function generateTransactionId(index: number): string {
  const accountId = 1000 + index;
  const timestamp = Math.floor(Date.now() / 1000);
  return `0.0.${accountId}@${timestamp}.${index}`;
}

function generateTransactionHash(): string {
  return crypto.randomBytes(32).toString('hex');
}

async function findOrCreateUserKey(
  client: Client,
  userId: number,
): Promise<number> {
  // Store the actual public key (raw hex) - must match what SDK's toStringRaw() returns
  // The backend compares user.keys against transaction's required keys using this format
  // IMPORTANT: Include mnemonicHash and index so accountSetupRequired() returns false
  // Without mnemonicHash, the Import flow gets stuck on Key Pairs screen
  const result: QueryResult<UserKeyRow> = await client.query(
    `INSERT INTO user_key ("userId", "publicKey", "mnemonicHash", "index", "deletedAt")
     VALUES ($1, $2, $3, $4, NULL)
     RETURNING id`,
    [userId, testPublicKeyHex, testMnemonicHash, 0],
  );

  console.log(`Created UserKey: ${result.rows[0].id} (publicKey: ${testPublicKeyHex.substring(0, 16)}..., mnemonicHash: present, index: 0)`);
  return result.rows[0].id;
}

async function cleanupPreviousSeed(client: Client, userId: number): Promise<void> {
  console.log('Cleaning up previous seed data...');

  // Delete transaction_group_item entries (FK constraint on transactions)
  await client.query(
    `DELETE FROM transaction_group_item
     WHERE "transactionId" IN (
       SELECT id FROM "transaction" WHERE description LIKE $1
     )`,
    [`${SEED_MARKER}%`],
  );

  // Delete transaction_group entries
  await client.query(
    `DELETE FROM transaction_group WHERE description LIKE $1`,
    [`${SEED_MARKER}%`],
  );

  // Delete transaction_signer entries first (FK constraint)
  await client.query(
    `DELETE FROM transaction_signer
     WHERE "transactionId" IN (
       SELECT id FROM "transaction" WHERE description LIKE $1
     )`,
    [`${SEED_MARKER}%`],
  );

  // Delete transaction_approver entries (FK constraint)
  await client.query(
    `DELETE FROM transaction_approver
     WHERE "transactionId" IN (
       SELECT id FROM "transaction" WHERE description LIKE $1
     )`,
    [`${SEED_MARKER}%`],
  );

  // Delete transactions
  const txResult = await client.query(
    `DELETE FROM "transaction" WHERE description LIKE $1`,
    [`${SEED_MARKER}%`],
  );

  console.log(`Deleted ${txResult.rowCount} previous seed transactions`);

  // Delete ALL user keys for this user (ensures clean state for Account Setup)
  // This is more aggressive but ensures the test user always needs Account Setup
  const keyResult = await client.query(
    `DELETE FROM user_key WHERE "userId" = $1`,
    [userId],
  );
  if (keyResult.rowCount && keyResult.rowCount > 0) {
    console.log(`Deleted ${keyResult.rowCount} user keys for test user`);
  }
}

/**
 * Create a real FileCreateTransaction with proper transaction bytes
 * IMPORTANT: Store UNSIGNED bytes so transactions appear in /transactions/sign
 */
function createFileCreateTransaction(index: number): {
  transactionBytes: Buffer;
  unsignedTransactionBytes: Buffer;
  transactionId: string;
  transactionHash: string;
  validStart: Date;
  signature: Buffer;
} {
  const now = new Date();

  // Create a FileCreateTransaction with the test public key as the file key
  // This means the transaction requires signing by our test key
  const tx = new FileCreateTransaction()
    .setKeys([testPrivateKey.publicKey])
    .setContents(`Performance test file ${index}`)
    .setNodeAccountIds([AccountId.fromString('0.0.3')])
    .setTransactionValidDuration(120)
    .freezeWith({
      // Minimal client-like object for freezing
      operatorAccountId: AccountId.fromString('0.0.2'),
      network: { '0.0.3': 'localhost:50211' },
    } as never);

  // Get unsigned transaction bytes - DO NOT SIGN
  // Storing unsigned bytes ensures transactions appear in /transactions/sign
  const unsignedBytes = tx.toBytes();

  // Use actual SDK transaction ID for consistency
  const txId = tx.transactionId?.toString() || `0.0.2@${Math.floor(now.getTime() / 1000)}.${index}`;

  // Generate transaction hash from unsigned bytes
  const txHash = crypto.createHash('sha256').update(unsignedBytes).digest('hex');

  // Empty signature - transaction is unsigned
  const signatureBytes = Buffer.alloc(0);

  return {
    // Store UNSIGNED bytes in both fields - transaction needs signing
    transactionBytes: Buffer.from(unsignedBytes),
    unsignedTransactionBytes: Buffer.from(unsignedBytes),
    transactionId: txId,
    transactionHash: txHash,
    validStart: now,
    signature: signatureBytes,
  };
}

interface InsertTransactionOptions {
  client: Client;
  index: number;
  status: string;
  creatorKeyId: number;
  executedAt?: Date | null;
  useRealTx?: boolean;
  name?: string;
  descriptionSuffix?: string;
}

interface InsertTransactionResult {
  id: number;
  signData?: SignTransactionData;
}

async function insertTransaction(
  options: InsertTransactionOptions,
): Promise<InsertTransactionResult> {
  const {
    client,
    index,
    status,
    creatorKeyId,
    executedAt = null,
    useRealTx = false,
    name = `Perf Test ${index}`,
    descriptionSuffix = `${index}`,
  } = options;

  let transactionBytes: Buffer;
  let unsignedTransactionBytes: Buffer;
  let transactionId: string;
  let transactionHash: string;
  let validStart: Date;
  let signature: Buffer;

  if (useRealTx) {
    // Create real Hedera transaction bytes
    const txData = createFileCreateTransaction(index);
    transactionBytes = txData.transactionBytes;
    unsignedTransactionBytes = txData.unsignedTransactionBytes;
    transactionId = txData.transactionId;
    transactionHash = txData.transactionHash;
    validStart = txData.validStart;
    signature = txData.signature;
  } else {
    // Use dummy bytes for history (no signing required)
    transactionId = generateTransactionId(index);
    transactionHash = generateTransactionHash();
    validStart = new Date();
    transactionBytes = Buffer.from('dummy-tx-bytes');
    unsignedTransactionBytes = Buffer.from('dummy-unsigned-bytes');
    signature = Buffer.from('dummy-signature');
  }

  const result: QueryResult<TransactionRow> = await client.query(
    `INSERT INTO "transaction" (
       name, type, description, "transactionId", "transactionHash",
       "transactionBytes", "unsignedTransactionBytes", status,
       "creatorKeyId", signature, "validStart", "mirrorNetwork",
       "isManual", "executedAt", "createdAt", "updatedAt"
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW(), NOW())
     RETURNING id`,
    [
      name,
      'FILE CREATE',
      `${SEED_MARKER}-${Date.now()}-${descriptionSuffix}`,
      transactionId,
      transactionHash,
      transactionBytes,
      unsignedTransactionBytes,
      status,
      creatorKeyId,
      signature,
      validStart,
      'mainnet',
      false,
      executedAt,
    ],
  );

  const insertResult: InsertTransactionResult = { id: result.rows[0].id };

  // Return transaction data for signature generation when using real transactions
  if (useRealTx) {
    insertResult.signData = {
      transactionId,
      unsignedBytes: unsignedTransactionBytes,
    };
  }

  return insertResult;
}

async function seedSignTransactions(
  client: Client,
  userKeyId: number,
): Promise<void> {
  console.log(`\nSeeding ${SIGN_COUNT} transactions for /transactions/sign...`);
  console.log('  (Using real Hedera SDK transactions - this may take a moment)');

  // Clear any previous data
  signTransactionsData.length = 0;

  for (let i = 0; i < SIGN_COUNT; i++) {
    const result = await insertTransaction({
      client,
      index: i,
      status: 'WAITING FOR SIGNATURES',
      creatorKeyId: userKeyId,
      useRealTx: true,
    });

    // Collect for signature generation
    if (result.signData) {
      signTransactionsData.push(result.signData);
    }

    // NOTE: transaction_signer rows are NOT needed for /transactions/sign
    // The endpoint uses required keys from transaction bytes + user_key matching

    if ((i + 1) % 50 === 0) {
      console.log(`  Created ${i + 1}/${SIGN_COUNT} sign transactions`);
    }
  }

  console.log(`  Completed: ${SIGN_COUNT} sign transactions`);
}

async function seedHistoryTransactions(
  client: Client,
  userKeyId: number,
): Promise<void> {
  console.log(`\nSeeding ${HISTORY_COUNT} transactions for /transactions/history...`);

  for (let i = 0; i < HISTORY_COUNT; i++) {
    const status = HISTORY_STATUSES[i % HISTORY_STATUSES.length];
    const executedAt = status === 'EXECUTED' ? new Date() : null;

    await insertTransaction({
      client,
      index: SIGN_COUNT + i, // Offset to avoid transactionId collisions
      status,
      creatorKeyId: userKeyId,
      executedAt,
      useRealTx: true, // Dummy bytes cause "invalid wire type" protobuf errors
    });

    if ((i + 1) % 100 === 0) {
      console.log(`  Created ${i + 1}/${HISTORY_COUNT} history transactions`);
    }
  }

  console.log(`  Completed: ${HISTORY_COUNT} history transactions`);
}

async function seedApproveTransactions(
  client: Client,
  userId: number,
  userKeyId: number,
): Promise<void> {
  console.log(`\nSeeding ${APPROVE_COUNT} transactions for /transactions/approve...`);
  console.log('  (Using real Hedera SDK transactions)');

  for (let i = 0; i < APPROVE_COUNT; i++) {
    const result = await insertTransaction({
      client,
      index: SIGN_COUNT + HISTORY_COUNT + i,
      status: 'WAITING FOR SIGNATURES',
      creatorKeyId: userKeyId,
      useRealTx: true,
    });

    // Collect for signature generation (approve transactions also appear in /transactions/sign)
    if (result.signData) {
      signTransactionsData.push(result.signData);
    }

    // Create transaction_approver entry with approved = NULL
    await client.query(
      `INSERT INTO transaction_approver (
         "transactionId", "userId", approved, "createdAt", "updatedAt"
       )
       VALUES ($1, $2, NULL, NOW(), NOW())`,
      [result.id, userId],
    );

    if ((i + 1) % 25 === 0) {
      console.log(`  Created ${i + 1}/${APPROVE_COUNT} approve transactions`);
    }
  }

  console.log(`  Completed: ${APPROVE_COUNT} approve transactions`);
}

interface GroupRow {
  id: number;
}

/**
 * Seed a transaction group for Sign All button testing
 * Creates one group with GROUP_SIZE transactions linked to it
 */
async function seedTransactionGroups(
  client: Client,
  userKeyId: number,
): Promise<void> {
  console.log(`\nSeeding transaction group with ${GROUP_SIZE} transactions for Sign All...`);
  console.log('  (Using real Hedera SDK transactions)');

  // Calculate offset to avoid ID collisions with other seeded transactions
  const indexOffset = SIGN_COUNT + HISTORY_COUNT + APPROVE_COUNT;

  // 1. Create the transaction group
  const groupResult: QueryResult<GroupRow> = await client.query(
    `INSERT INTO "transaction_group" (description, atomic, sequential, "createdAt")
     VALUES ($1, $2, $3, NOW())
     RETURNING id`,
    [`${SEED_MARKER}-group`, false, false],
  );
  const groupId = groupResult.rows[0].id;
  console.log(`  Created transaction_group: ${groupId}`);

  // 2. Create transactions and collect their IDs
  const transactionIds: number[] = [];

  for (let i = 0; i < GROUP_SIZE; i++) {
    const result = await insertTransaction({
      client,
      index: indexOffset + i,
      status: 'WAITING FOR SIGNATURES',
      creatorKeyId: userKeyId,
      useRealTx: true,
      name: `Group Tx ${i + 1}`,
      descriptionSuffix: `group-item-${i}`,
    });

    transactionIds.push(result.id);

    // Collect for signature generation (group transactions also need signing)
    if (result.signData) {
      signTransactionsData.push(result.signData);
    }
  }

  // 3. Link transactions to group via transaction_group_item
  for (let i = 0; i < transactionIds.length; i++) {
    await client.query(
      `INSERT INTO "transaction_group_item" (seq, "transactionId", "groupId")
       VALUES ($1, $2, $3)`,
      [i, transactionIds[i], groupId],
    );
  }

  console.log(`  Completed: 1 group with ${GROUP_SIZE} transactions (IDs: ${transactionIds[0]}-${transactionIds[transactionIds.length - 1]})`);
}

/**
 * Convert SDK SignatureMap to backend JSON format using public iterators
 * Backend expects: { nodeAccountId: { transactionId: { derPublicKey: "0x" + signatureHex }}}
 */
function signatureMapToBackendFormat(signatureMap: Iterable<[unknown, unknown]>): SignatureMap {
  const result: SignatureMap = {};

  for (const [nodeAccountId, nodeMap] of signatureMap) {
    const nodeId = String(nodeAccountId);
    result[nodeId] = {};
    for (const [transactionId, pkMap] of nodeMap as Iterable<[unknown, unknown]>) {
      const txId = String(transactionId);
      result[nodeId][txId] = {};
      for (const [publicKey, signature] of pkMap as Iterable<[unknown, Uint8Array]>) {
        const pk = String(publicKey);
        result[nodeId][txId][pk] = '0x' + Buffer.from(signature).toString('hex');
      }
    }
  }

  return result;
}

/**
 * Generate signatures.json for sign-all.ts PRE_SIGNED mode
 * Uses PrivateKey.signTransaction() and public iterators (no internal SDK access)
 */
function generateSignaturesFile(): void {
  if (signTransactionsData.length === 0) {
    console.log('\nNo sign transactions to generate signatures for');
    return;
  }

  console.log(`\nGenerating signatures for ${signTransactionsData.length} transactions...`);

  const signaturesByTxId: Record<string, SignatureMap> = {};

  for (const { transactionId, unsignedBytes } of signTransactionsData) {
    const tx = Transaction.fromBytes(unsignedBytes);
    const signatureMap = testPrivateKey.signTransaction(tx);
    signaturesByTxId[transactionId] = signatureMapToBackendFormat(signatureMap);
  }

  // Ensure data directory exists
  const dataDir = path.join(__dirname, '../data');
  fs.mkdirSync(dataDir, { recursive: true });

  // Write signatures file
  const signaturesPath = path.join(dataDir, 'signatures.json');
  fs.writeFileSync(
    signaturesPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        count: Object.keys(signaturesByTxId).length,
        signaturesByTxId,
      },
      null,
      2,
    ),
  );

  console.log(`  Saved signatures to: ${signaturesPath}`);
}

/**
 * Save the test private key and mnemonic for Account Setup import
 */
function savePrivateKey(): void {
  const dataDir = path.join(__dirname, '../data');
  fs.mkdirSync(dataDir, { recursive: true });

  const keyPath = path.join(dataDir, 'test-private-key.txt');
  fs.writeFileSync(keyPath, testPrivateKey.toStringRaw());
  console.log(`  Saved private key to: ${keyPath}`);

  // Save mnemonic for Account Setup import during UI tests
  const mnemonicPath = path.join(dataDir, 'test-mnemonic.txt');
  fs.writeFileSync(mnemonicPath, testMnemonic.toString());
  console.log(`  Saved mnemonic to: ${mnemonicPath}`);
}

interface CountRow {
  count: string;
}

/**
 * Validate that seeded data matches expected volumes
 * Helps catch partial failures and volume mismatches
 */
async function validateSeededData(client: Client): Promise<void> {
  console.log('\nValidating seeded data...');

  const checks: Array<{ name: string; query: string; params: string[]; expected: number }> = [
    {
      name: 'Sign transactions',
      query: `SELECT COUNT(*) as count FROM "transaction" WHERE description LIKE $1 AND status = 'WAITING FOR SIGNATURES' AND description NOT LIKE $2`,
      params: [`${SEED_MARKER}%`, `${SEED_MARKER}-group%`],
      expected: SIGN_COUNT + APPROVE_COUNT, // Both types are WAITING FOR SIGNATURES
    },
    {
      name: 'History transactions',
      query: `SELECT COUNT(*) as count FROM "transaction" WHERE description LIKE $1 AND status IN ('EXECUTED', 'FAILED', 'EXPIRED', 'CANCELED', 'ARCHIVED')`,
      params: [`${SEED_MARKER}%`],
      expected: HISTORY_COUNT,
    },
    {
      name: 'Approve transactions',
      query: `SELECT COUNT(*) as count FROM transaction_approver WHERE "transactionId" IN (SELECT id FROM "transaction" WHERE description LIKE $1)`,
      params: [`${SEED_MARKER}%`],
      expected: APPROVE_COUNT,
    },
    {
      name: 'Group transactions',
      query: `SELECT COUNT(*) as count FROM "transaction" WHERE description LIKE $1`,
      params: [`${SEED_MARKER}%-group-item%`],
      expected: GROUP_SIZE,
    },
    {
      name: 'Transaction groups',
      query: `SELECT COUNT(*) as count FROM transaction_group WHERE description LIKE $1`,
      params: [`${SEED_MARKER}%`],
      expected: 1,
    },
  ];

  let allPassed = true;
  for (const { name, query, params, expected } of checks) {
    const result: QueryResult<CountRow> = await client.query(query, params);
    const actual = parseInt(result.rows[0].count);
    const passed = actual >= expected;
    const status = passed ? '✓' : '✗';
    console.log(`  ${status} ${name}: ${actual}/${expected}`);
    if (!passed) allPassed = false;
  }

  if (!allPassed) {
    console.warn('\n⚠️  Some volume checks failed. Tests may not have enough data.');
  }
}

async function seedData(): Promise<void> {
  const email = getTestUserEmail();

  // Initialize keypair for signing transactions
  await initializeKeyPair();

  const client = new Client({
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5432'),
    database: process.env.POSTGRES_DATABASE || 'postgres',
    user: process.env.POSTGRES_USERNAME || 'postgres',
    password: process.env.POSTGRES_PASSWORD || 'postgres',
  });

  try {
    await client.connect();
    console.log('Connected to PostgreSQL');

    // Find test user
    const userResult: QueryResult<UserRow> = await client.query(
      'SELECT id FROM "user" WHERE email = $1',
      [email],
    );

    if (userResult.rows.length === 0) {
      console.error(`Error: User ${email} not found`);
      console.log('\nCreate the test user first:');
      console.log(
        `  TEST_USER_EMAIL='${email}' TEST_USER_PASSWORD='yourpassword' npx tsx k6/helpers/seed-test-users.ts`,
      );
      process.exit(1);
    }

    const userId = userResult.rows[0].id;
    console.log(`Found user: ${email} (id: ${userId})`);

    // Clean up previous seed data (must happen before creating new user key)
    await cleanupPreviousSeed(client, userId);

    // Create new user key with the generated keypair
    const userKeyId = await findOrCreateUserKey(client, userId);

    // Seed transactions
    await seedSignTransactions(client, userKeyId);
    await seedHistoryTransactions(client, userKeyId);
    await seedApproveTransactions(client, userId, userKeyId);
    await seedTransactionGroups(client, userKeyId);

    // Generate signatures.json for PRE_SIGNED mode
    generateSignaturesFile();

    // Save private key for debugging/manual signing
    savePrivateKey();

    // Validate seeded data
    await validateSeededData(client);

    // Summary
    const total = SIGN_COUNT + HISTORY_COUNT + APPROVE_COUNT + GROUP_SIZE;
    console.log('\n=== Seeding Complete ===');
    console.log(`Total transactions created: ${total}`);
    console.log(`  /transactions/sign: ${SIGN_COUNT}`);
    console.log(`  /transactions/history: ${HISTORY_COUNT}`);
    console.log(`  /transactions/approve: ${APPROVE_COUNT}`);
    console.log(`  Transaction group: 1 group with ${GROUP_SIZE} transactions`);
    console.log('\nRun k6 tests with:');
    console.log(
      `  k6 run -e USER_EMAIL='${email}' -e USER_PASSWORD='yourpassword' k6/dist/tab-load-times.js`,
    );
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === 'ECONNREFUSED') {
      console.error('Error: Cannot connect to PostgreSQL. Is Docker running?');
      console.log('\nStart the backend with: cd back-end && docker-compose up -d');
    } else {
      console.error('Error seeding data:', err.message);
    }
    process.exit(1);
  } finally {
    await client.end();
  }
}

seedData();
