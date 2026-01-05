/**
 * SQLite Performance Data Seeder
 *
 * Seeds local SQLite database with test data for UI performance tests.
 * Call after user registration to populate:
 * - 100 TransactionDrafts
 * - 100 HederaAccounts
 * - 100 HederaFiles
 */

import sqlite3 from 'sqlite3';
import crypto from 'node:crypto';
import { getDatabasePath } from '../../utils/databaseUtil.js';
import { DATA_VOLUMES } from '../../k6/src/config/constants.js';

// Use DATA_VOLUMES for SSOT - drafts/accounts/files all share same count
const TARGET_COUNT = DATA_VOLUMES.DRAFTS;

interface SeedResult {
  drafts: number;
  accounts: number;
  files: number;
}

/**
 * Get the user ID from SQLite by email
 */
export async function getUserIdByEmail(email: string): Promise<string | null> {
  const dbPath = getDatabasePath();

  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
      if (err) {
        reject(err);
        return;
      }
    });

    db.get<{ id: string }>(
      'SELECT id FROM User WHERE email = ?',
      [email],
      (err, row) => {
        db.close();
        if (err) {
          reject(err);
        } else {
          resolve(row?.id || null);
        }
      },
    );
  });
}

async function seedDrafts(db: sqlite3.Database, userId: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const stmt = db.prepare(`
      INSERT INTO TransactionDraft (id, created_at, updated_at, user_id, type, transactionBytes, description, isTemplate)
      VALUES (?, datetime('now'), datetime('now'), ?, ?, ?, ?, 0)
    `);

    let inserted = 0;
    for (let i = 0; i < TARGET_COUNT; i++) {
      const id = crypto.randomUUID();
      const type = 'CRYPTO_TRANSFER';
      const transactionBytes = Buffer.from(`perf-test-draft-${i}`).toString('base64');
      const description = `Performance test draft ${i + 1}`;

      stmt.run([id, userId, type, transactionBytes, description], function (err) {
        if (err) {
          console.error(`Error inserting draft ${i}:`, err.message);
        } else {
          inserted++;
        }
      });
    }

    stmt.finalize((err) => {
      if (err) {
        reject(err);
      } else {
        resolve(inserted);
      }
    });
  });
}

async function seedAccounts(db: sqlite3.Database, userId: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const stmt = db.prepare(`
      INSERT INTO HederaAccount (id, user_id, account_id, nickname, network, created_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
    `);

    let inserted = 0;
    for (let i = 0; i < TARGET_COUNT; i++) {
      const id = crypto.randomUUID();
      const accountId = `0.0.${1000 + i}`;
      const nickname = `Perf Test Account ${i + 1}`;
      const network = 'mainnet';

      stmt.run([id, userId, accountId, nickname, network], function (err) {
        if (err) {
          console.error(`Error inserting account ${i}:`, err.message);
        } else {
          inserted++;
        }
      });
    }

    stmt.finalize((err) => {
      if (err) {
        reject(err);
      } else {
        resolve(inserted);
      }
    });
  });
}

async function seedFiles(db: sqlite3.Database, userId: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const stmt = db.prepare(`
      INSERT INTO HederaFile (id, user_id, file_id, network, created_at, nickname, description)
      VALUES (?, ?, ?, ?, datetime('now'), ?, ?)
    `);

    let inserted = 0;
    for (let i = 0; i < TARGET_COUNT; i++) {
      const id = crypto.randomUUID();
      const fileId = `0.0.${2000 + i}`;
      const network = 'mainnet';
      const nickname = `Perf Test File ${i + 1}`;
      const description = `Performance test file ${i + 1}`;

      stmt.run([id, userId, fileId, network, nickname, description], function (err) {
        if (err) {
          console.error(`Error inserting file ${i}:`, err.message);
        } else {
          inserted++;
        }
      });
    }

    stmt.finalize((err) => {
      if (err) {
        reject(err);
      } else {
        resolve(inserted);
      }
    });
  });
}

export async function seedLocalPerfData(userEmail: string): Promise<SeedResult> {
  const userId = await getUserIdByEmail(userEmail);

  if (!userId) {
    throw new Error(`User not found: ${userEmail}`);
  }

  const dbPath = getDatabasePath();

  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READWRITE, async (err) => {
      if (err) {
        reject(err);
        return;
      }

      try {
        const drafts = await seedDrafts(db, userId);
        const accounts = await seedAccounts(db, userId);
        const files = await seedFiles(db, userId);

        db.close((closeErr) => {
          if (closeErr) {
            console.error('Error closing database:', closeErr.message);
          }
          resolve({ drafts, accounts, files });
        });
      } catch (seedErr) {
        db.close();
        reject(seedErr);
      }
    });
  });
}
