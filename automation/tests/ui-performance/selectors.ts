/**
 * UI Performance Test Selectors (SSOT)
 *
 * Centralized selectors for UI performance tests.
 * Separated for consistency with k6 structure (constants.ts, environments.ts, etc.)
 *
 * NOTE: Text/class selectors are fragile - frontend should add data-testid attributes.
 */

export const SELECTORS = {
  // Menu buttons (using data-testid - good)
  MENU_TRANSACTIONS: '[data-testid="button-menu-transactions"]',

  // Transaction tabs (text-based - fragile, needs frontend data-testid)
  TAB_HISTORY: 'text=History',
  TAB_READY_TO_SIGN: 'text=Ready to Sign',
  TAB_READY_FOR_REVIEW: 'text=Ready for Review',
  TAB_DRAFTS: 'text=Drafts',

  // Pager elements (class-based - fragile, needs frontend data-testid)
  PAGER_SELECT: '.pager-per-page select',
  PAGER_ITEMS: '.pager-shown-items',
};
