/**
 * Node.js helper script for pre-signing transactions
 *
 * This runs in Node.js (not k6) because k6 cannot use @hashgraph/sdk.
 * Run this before k6 tests to generate signature files.
 *
 * Usage:
 *   npx tsx sign-transactions.ts <transaction.tx> <output.json> <privateKey1> [privateKey2] ...
 *
 * Or programmatically:
 *   import { signTransaction, signMultipleTransactions } from './sign-transactions';
 */

import fs from 'fs';
import path from 'path';
import { Transaction, PrivateKey } from '@hashgraph/sdk';

/** Signature map in V1 JSON format for API */
interface V1SignatureMap {
  [nodeAccountId: string]: {
    [publicKey: string]: string;
  };
}

/** Input for signing multiple transactions */
interface TransactionInput {
  txPath: string;
  privateKeys: string[];
  transactionId: string;
}

/** Output from signing multiple transactions */
interface SignedTransactionOutput {
  transactionId: string;
  signatures: V1SignatureMap[];
}

/** Output file format for k6 */
interface K6SignaturesOutput {
  generatedAt: string;
  count: number;
  transactions: SignedTransactionOutput[];
}

/**
 * Convert SDK signature map to V1 JSON format
 * Matches the format expected by POST /transactions/:id/signers
 */
function signatureMapToV1Json(signatureMap: Map<string, Map<string, Map<string, Uint8Array>>>): V1SignatureMap {
  const result: V1SignatureMap = {};
  for (const nodeAccountId of signatureMap.keys()) {
    result[nodeAccountId] = {};
    const txMap = signatureMap.get(nodeAccountId)!;
    for (const transactionId of txMap.keys()) {
      const pkMap = txMap.get(transactionId)!;
      for (const publicKey of pkMap.keys()) {
        const signature = pkMap.get(publicKey)!;
        result[nodeAccountId][publicKey] = Buffer.from(signature).toString('base64');
      }
    }
  }
  return result;
}

/**
 * Sign a transaction with a single private key
 * @param txBytes - Transaction bytes
 * @param privateKeyString - ED25519 private key string
 * @returns Signature in V1 JSON format
 */
export function signTransaction(txBytes: Buffer, privateKeyString: string): V1SignatureMap {
  const tx = Transaction.fromBytes(txBytes);
  const pk = PrivateKey.fromStringED25519(privateKeyString);
  const signatureMap = pk.signTransaction(tx);
  return signatureMapToV1Json(signatureMap as unknown as Map<string, Map<string, Map<string, Uint8Array>>>);
}

/**
 * Sign a transaction with multiple private keys
 * @param txBytes - Transaction bytes
 * @param privateKeys - Array of ED25519 private key strings
 * @returns Array of signatures in V1 JSON format
 */
export function signTransactionWithMultipleKeys(txBytes: Buffer, privateKeys: string[]): V1SignatureMap[] {
  const tx = Transaction.fromBytes(txBytes);
  return privateKeys.map(keyString => {
    const pk = PrivateKey.fromStringED25519(keyString);
    const signatureMap = pk.signTransaction(tx);
    return signatureMapToV1Json(signatureMap as unknown as Map<string, Map<string, Map<string, Uint8Array>>>);
  });
}

/**
 * Sign multiple transactions from files
 * @param transactions - Array of { txPath, privateKeys, transactionId }
 * @returns Array of { transactionId, signatures }
 */
export function signMultipleTransactions(transactions: TransactionInput[]): SignedTransactionOutput[] {
  return transactions.map(({ txPath, privateKeys, transactionId }) => {
    const txBytes = fs.readFileSync(txPath);
    const signatures = signTransactionWithMultipleKeys(txBytes, privateKeys);
    return {
      transactionId,
      signatures,
    };
  });
}

/**
 * Generate test signatures for k6 performance testing
 * Creates a JSON file that k6 can load
 * @param outputPath - Path to write signatures JSON
 * @param signedTransactions - Output from signMultipleTransactions
 */
export function writeSignaturesForK6(outputPath: string, signedTransactions: SignedTransactionOutput[]): void {
  const output: K6SignaturesOutput = {
    generatedAt: new Date().toISOString(),
    count: signedTransactions.length,
    transactions: signedTransactions,
  };
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
  console.log(`Wrote ${signedTransactions.length} transaction signatures to ${outputPath}`);
}

// CLI interface
const isMainModule = process.argv[1]?.includes('sign-transactions');

if (isMainModule) {
  const args = process.argv.slice(2);

  if (args.length < 3) {
    console.log(
      'Usage: npx tsx sign-transactions.ts <transaction.tx> <output.json> <privateKey1> [privateKey2] ...',
    );
    console.log('');
    console.log('Example:');
    console.log('  npx tsx sign-transactions.ts ./data/test.tx ./data/signatures.json 302e...key1 302e...key2');
    process.exit(1);
  }

  const [txPath, outputPath, ...privateKeys] = args;

  try {
    const txBytes = fs.readFileSync(txPath);
    const signatures = signTransactionWithMultipleKeys(txBytes, privateKeys);

    const output = {
      generatedAt: new Date().toISOString(),
      transactionFile: path.basename(txPath),
      signatureCount: signatures.length,
      signatures,
    };

    fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
    console.log(`Successfully signed transaction with ${signatures.length} key(s)`);
    console.log(`Output written to: ${outputPath}`);
  } catch (error) {
    const err = error as Error;
    console.error('Error:', err.message);
    process.exit(1);
  }
}
