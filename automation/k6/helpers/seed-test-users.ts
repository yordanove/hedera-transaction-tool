/**
 * Seed Test Users for k6 Performance Tests
 *
 * Creates test users directly in PostgreSQL using argon2 hashing.
 * Run this before k6 tests in CI or local development.
 *
 * Usage:
 *   cd automation && npx tsx k6/helpers/seed-test-users.ts
 */

import { Client, QueryResult } from 'pg';
import argon2 from 'argon2';

interface TestUser {
  email: string;
  password: string;
  isAdmin: boolean;
}

interface UserRow {
  id: number;
}

const TEST_USER: TestUser = {
  email: 'admin@test.com',
  password: '1234567890',
  isAdmin: true,
};

async function hashPassword(password: string): Promise<string> {
  return await argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
  });
}

async function seedUsers(): Promise<void> {
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

    // Check if user exists
    const existing: QueryResult<UserRow> = await client.query(
      'SELECT id FROM "user" WHERE email = $1',
      [TEST_USER.email],
    );

    if (existing.rows.length > 0) {
      console.log(`User ${TEST_USER.email} already exists (id: ${existing.rows[0].id})`);
      console.log('\nYou can run k6 tests with:');
      console.log(
        `  k6 run -e USER_EMAIL='${TEST_USER.email}' -e USER_PASSWORD='${TEST_USER.password}' k6/scripts/tab-load-times.js`,
      );
      return;
    }

    // Hash password using argon2 (same as backend)
    const hashedPassword = await hashPassword(TEST_USER.password);

    // Insert user
    const result: QueryResult<UserRow> = await client.query(
      `INSERT INTO "user" (email, password, admin, status, "deletedAt")
       VALUES ($1, $2, $3, 'NONE', NULL)
       RETURNING id`,
      [TEST_USER.email, hashedPassword, TEST_USER.isAdmin],
    );

    console.log(`Created user: ${TEST_USER.email} (id: ${result.rows[0].id})`);
    console.log('\nYou can now run k6 tests with:');
    console.log(
      `  k6 run -e USER_EMAIL='${TEST_USER.email}' -e USER_PASSWORD='${TEST_USER.password}' k6/scripts/tab-load-times.js`,
    );
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === 'ECONNREFUSED') {
      console.error('Error: Cannot connect to PostgreSQL. Is Docker running?');
      console.log('\nStart the backend with: cd back-end && docker-compose up -d');
    } else {
      console.error('Error seeding users:', err.message);
    }
    process.exit(1);
  } finally {
    await client.end();
  }
}

seedUsers();
