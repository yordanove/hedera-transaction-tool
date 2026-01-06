/**
 * UI Performance Test Selectors (SSOT)
 *
 * Centralized selectors for UI performance tests.
 * Separated for consistency with k6 structure (constants.ts, environments.ts, etc.)
 *
 * NOTE: Text/class selectors are fragile - frontend should add data-testid attributes.
 */

export const SELECTORS = {
  // Generic
  BODY: 'body',

  // Menu buttons (using data-testid - good)
  MENU_TRANSACTIONS: '[data-testid="button-menu-transactions"]',
  MENU_ACCOUNTS: '[data-testid="button-menu-accounts"]',
  MENU_FILES: '[data-testid="button-menu-files"]',

  // Transaction tabs (text-based - fragile, needs frontend data-testid)
  TAB_HISTORY: 'text=History',
  TAB_READY_TO_SIGN: 'text=Ready to Sign',
  TAB_READY_FOR_REVIEW: 'text=Ready for Review',
  TAB_IN_PROGRESS: 'text=In Progress',
  TAB_READY_FOR_EXECUTION: 'text=Ready for Execution',
  TAB_DRAFTS: 'text=Drafts',

  FILE_ROW: '[data-testid^="p-file-id-"]',
  ACCOUNT_ROW: '[data-testid^="p-account-id-"]',
  CONTACT_ROW: '.container-multiple-select',
  BUTTON_DRAFT_CONTINUE: '[data-testid^="button-draft-continue-"]',

  GROUP_ROW_ICON: 'i.bi-stack',
  BUTTON_DETAILS: 'button:has-text("Details")',
  BUTTON_SIGN_GROUP: '[data-testid="button-sign-group"]',
  BUTTON_CONFIRM: 'button:has-text("Confirm")',
  TOAST_SIGNED_SUCCESS: '.v-toast__text:has-text("Transactions signed successfully")',

  // Pager elements (class-based - fragile, needs frontend data-testid)
  PAGER_SELECT: '.pager-per-page select',
  PAGER_ITEMS: '.pager-shown-items',
};
