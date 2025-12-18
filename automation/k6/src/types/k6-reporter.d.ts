/**
 * Type declaration for k6-reporter remote module
 *
 * k6 supports remote HTTP imports which TypeScript doesn't understand.
 * This declaration provides types for the htmlReport function.
 */

declare module 'https://raw.githubusercontent.com/benc-uk/k6-reporter/main/dist/bundle.js' {
  import type { SummaryData } from './k6.types';

  /**
   * Generate an HTML report from k6 summary data
   */
  export function htmlReport(data: SummaryData, options?: {
    title?: string;
    debugMode?: boolean;
  }): string;
}
