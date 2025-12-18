/**
 * Environment Configuration
 *
 * Defines available environments for k6 performance tests.
 */

import type { Environment, EnvironmentMap, Endpoints } from '../types';

declare const __ENV: Record<string, string | undefined>;

/**
 * Available environments for testing
 */
export const ENVIRONMENTS: EnvironmentMap = {
  local: {
    baseUrl: 'http://localhost:3001',
    name: 'Local Development',
  },
  staging: {
    baseUrl: 'https://staging-transaction-tool.swirldslabs-devops.com',
    name: 'Staging',
  },
  prod: {
    baseUrl: 'TBD', // Update when production URL available
    name: 'Production',
  },
};

// Cache to ensure we only log once
let _logged = false;

/**
 * Get environment configuration based on ENV variable
 */
export function getEnvironment(): Environment {
  const envName = __ENV.ENV || 'local';
  const env = ENVIRONMENTS[envName];

  if (!env) {
    console.error(
      `Unknown environment: ${envName}. Available: ${Object.keys(ENVIRONMENTS).join(', ')}`,
    );
    return ENVIRONMENTS.local;
  }

  return env;
}

/**
 * Log environment info (only once per test run)
 */
export function logEnvironment(): void {
  if (!_logged) {
    const env = getEnvironment();
    console.log(`Running against: ${env.name} (${env.baseUrl})`);
    _logged = true;
  }
}

/**
 * Base URL - supports direct override or environment selection
 */
export const BASE_URL: string = __ENV.BASE_URL || getEnvironment().baseUrl;

/**
 * API endpoints for page load tests
 */
export const endpoints: Endpoints = {
  'all-transactions': '/transactions?page=1&size=100',
  'history': '/transactions/history?page=1&size=100',
  'in-progress': '/transactions?page=1&size=100&filter=status:in:WAITING FOR SIGNATURES',
  'notifications': '/notifications?page=1&size=100',
  'ready-for-execution': '/transactions?page=1&size=100&filter=status:in:WAITING FOR EXECUTION',
  'ready-to-approve': '/transactions/approve?page=1&size=100',
  'ready-to-sign': '/transactions/sign?page=1&size=100',
};
