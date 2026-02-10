/**
 * Ingestion Domain
 * 
 * Exports file scanning services for codebase ingestion
 */

export { FileScannerService } from './file-scanner.service.js';
export type {
  ScanStatistics,
  ScannedFile,
  ScanOptions,
} from './file-scanner.service.js';
