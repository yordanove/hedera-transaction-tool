/**
 * Node.js helper script for pre-signing transactions
 *
 * This runs in Node.js (not k6) because k6 cannot use @hashgraph/sdk.
 * Run this before k6 tests to generate signature files.
 *
 * Usage:
 *   node sign-transactions.js <transaction.tx> <output.json> <privateKey1> [privateKey2] ...
 *
 * Or programmatically:
 *   const { signTransaction, signMultipleTransactions } = require('./sign-transactions');
 */

const fs = require('fs');
const path = require('path');
const { Transaction, PrivateKey } = require('@hashgraph/sdk');

/**
 * Convert SDK signature map to V1 JSON format
 * Matches the format expected by POST /transactions/:id/signers
 */
function signatureMapToV1Json(signatureMap) {
  const result = {};
  for (const nodeAccountId of signatureMap.keys()) {
    result[nodeAccountId] = {};
    const txMap = signatureMap.get(nodeAccountId);
    for (const transactionId of txMap.keys()) {
      const pkMap = txMap.get(transactionId);
      for (const publicKey of pkMap.keys()) {
        const signature = pkMap.get(publicKey);
        result[nodeAccountId][publicKey] = Buffer.from(signature).toString('base64');
      }
    }
  }
  return result;
}

/**
 * Sign a transaction with a single private key
 * @param {Buffer} txBytes - Transaction bytes
 * @param {string} privateKeyString - ED25519 private key string
 * @returns {object} Signature in V1 JSON format
 */
function signTransaction(txBytes, privateKeyString) {
  const tx = Transaction.fromBytes(txBytes);
  const pk = PrivateKey.fromStringED25519(privateKeyString);
  const signatureMap = pk.signTransaction(tx);
  return signatureMapToV1Json(signatureMap);
}

/**
 * Sign a transaction with multiple private keys
 * @param {Buffer} txBytes - Transaction bytes
 * @param {string[]} privateKeys - Array of ED25519 private key strings
 * @returns {object[]} Array of signatures in V1 JSON format
 */
function signTransactionWithMultipleKeys(txBytes, privateKeys) {
  const tx = Transaction.fromBytes(txBytes);
  return privateKeys.map((keyString) => {
    const pk = PrivateKey.fromStringED25519(keyString);
    const signatureMap = pk.signTransaction(tx);
    return signatureMapToV1Json(signatureMap);
  });
}

/**
 * Sign multiple transactions from files
 * @param {object[]} transactions - Array of { txPath, privateKeys, transactionId }
 * @returns {object[]} Array of { transactionId, signatures }
 */
function signMultipleTransactions(transactions) {
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
 * @param {string} outputPath - Path to write signatures JSON
 * @param {object[]} signedTransactions - Output from signMultipleTransactions
 */
function writeSignaturesForK6(outputPath, signedTransactions) {
  const output = {
    generatedAt: new Date().toISOString(),
    count: signedTransactions.length,
    transactions: signedTransactions,
  };
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
  console.log(`Wrote ${signedTransactions.length} transaction signatures to ${outputPath}`);
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length < 3) {
    console.log('Usage: node sign-transactions.js <transaction.tx> <output.json> <privateKey1> [privateKey2] ...');
    console.log('');
    console.log('Example:');
    console.log('  node sign-transactions.js ./data/test.tx ./data/signatures.json 302e...key1 302e...key2');
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
    console.error('Error:', error.message);
    process.exit(1);
  }
}

module.exports = {
  signTransaction,
  signTransactionWithMultipleKeys,
  signMultipleTransactions,
  writeSignaturesForK6,
  signatureMapToV1Json,
};
