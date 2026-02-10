/**
 * Structured logging with Pino
 * 
 * Provides a logger factory with configurable log levels, structured log format,
 * and log redaction for sensitive data.
 */

import { pino } from 'pino';
import type { Logger as PinoLogger } from 'pino';
import type { LogLevel } from '../types/index.js';

/**
 * Structured log context
 */
export interface LogContext {
  codebaseName?: string;
  filePath?: string;
  chunkCount?: number;
  durationMs?: number;
  [key: string]: unknown;
}

/**
 * Error information for logging
 */
export interface LogError {
  message: string;
  stack?: string;
  code?: string;
}

/**
 * Logger interface with component-specific context
 */
export interface Logger {
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, error?: Error | LogError, context?: LogContext): void;
  child(component: string, operation?: string): Logger;
}

/**
 * Pino logger wrapper implementing the Logger interface
 */
class PinoLoggerWrapper implements Logger {
  constructor(
    private readonly pinoLogger: PinoLogger,
    private readonly component?: string,
    private readonly operation?: string
  ) {}

  debug(message: string, context?: LogContext): void {
    this.pinoLogger.debug(
      {
        component: this.component,
        operation: this.operation,
        context,
      },
      message
    );
  }

  info(message: string, context?: LogContext): void {
    this.pinoLogger.info(
      {
        component: this.component,
        operation: this.operation,
        context,
      },
      message
    );
  }

  warn(message: string, context?: LogContext): void {
    this.pinoLogger.warn(
      {
        component: this.component,
        operation: this.operation,
        context,
      },
      message
    );
  }

  error(message: string, error?: Error | LogError, context?: LogContext): void {
    const errorInfo: LogError | undefined = error
      ? {
          message: error.message,
          stack: 'stack' in error ? error.stack : undefined,
          code: 'code' in error ? error.code : undefined,
        }
      : undefined;

    this.pinoLogger.error(
      {
        component: this.component,
        operation: this.operation,
        context,
        error: errorInfo,
      },
      message
    );
  }

  child(component: string, operation?: string): Logger {
    return new PinoLoggerWrapper(this.pinoLogger, component, operation);
  }
}

/**
 * Sensitive field paths to redact from logs
 */
const REDACT_PATHS = [
  'password',
  'token',
  'authorization',
  'apiKey',
  'api_key',
  'secret',
  'accessToken',
  'access_token',
  'refreshToken',
  'refresh_token',
];

/**
 * Create a root logger with the specified log level
 * 
 * @param level - Log level (debug, info, warn, error)
 * @param pretty - Enable pretty printing for development (default: false)
 * @returns Root logger instance
 */
export function createLogger(level: LogLevel = 'info', pretty: boolean = false): Logger {
  const pinoLogger = pino({
    level,
    // Use pino-pretty transport for development
    transport: pretty
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname',
          },
        }
      : undefined,
    // Structured format with timestamp
    formatters: {
      level: (label: string) => {
        return { level: label };
      },
    },
    // Redact sensitive fields
    redact: {
      paths: REDACT_PATHS,
      censor: '[REDACTED]',
    },
    // Include timestamp in ISO 8601 format
    timestamp: () => `,"timestamp":"${new Date().toISOString()}"`,
  });

  return new PinoLoggerWrapper(pinoLogger);
}

/**
 * Create a child logger for a specific component
 * 
 * @param rootLogger - Root logger instance
 * @param component - Component name (e.g., "IngestionService", "MCPServer")
 * @param operation - Optional operation name (e.g., "parseFile", "search")
 * @returns Child logger with component context
 */
export function createChildLogger(
  rootLogger: Logger,
  component: string,
  operation?: string
): Logger {
  return rootLogger.child(component, operation);
}
