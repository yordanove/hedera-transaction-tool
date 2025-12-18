/**
 * API Response Types
 *
 * Types for backend API responses used in k6 performance tests.
 */

/**
 * Authentication response from /auth/login
 */
export interface AuthResponse {
  accessToken: string;
  refreshToken?: string;
  user?: {
    id: number;
    email: string;
    admin: boolean;
  };
}

/**
 * Test user credentials
 */
export interface TestUser {
  email: string;
  password: string;
}

/**
 * Transaction entity from API
 */
export interface Transaction {
  id: number;
  transactionId?: string;
  name: string;
  description?: string;
  status: TransactionStatus;
  transactionBytes?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Transaction status enum values
 */
export type TransactionStatus =
  | 'NEW'
  | 'WAITING FOR SIGNATURES'
  | 'WAITING FOR EXECUTION'
  | 'EXECUTED'
  | 'FAILED'
  | 'EXPIRED'
  | 'CANCELED';

/**
 * Paginated API response wrapper
 */
export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    page: number;
    size: number;
    total: number;
    totalPages: number;
  };
}

/**
 * HTTP request headers with authorization
 */
export interface AuthHeaders {
  headers: {
    'Content-Type': string;
    Authorization: string;
  };
}

/**
 * Pre-signed transaction from signature helper
 */
export interface PreSignedTransaction {
  signatures: unknown[];
}

/**
 * Pre-signed data loaded from signatures file
 */
export interface PreSignedData {
  count?: number;
  signatureCount?: number;
  signatures?: unknown[];
  transactions?: PreSignedTransaction[];
}
