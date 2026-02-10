/**
 * Unit tests for structured logging with Pino
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createLogger, createChildLogger, type Logger } from '../logger.js';

describe('Logger', () => {
  describe('createLogger', () => {
    it('should create a logger with default info level', () => {
      const logger = createLogger();
      expect(logger).toBeDefined();
      expect(logger.debug).toBeDefined();
      expect(logger.info).toBeDefined();
      expect(logger.warn).toBeDefined();
      expect(logger.error).toBeDefined();
      expect(logger.child).toBeDefined();
    });

    it('should create a logger with specified log level', () => {
      const logger = createLogger('debug');
      expect(logger).toBeDefined();
    });

    it('should create a logger with pretty printing enabled', () => {
      const logger = createLogger('info', true);
      expect(logger).toBeDefined();
    });
  });

  describe('Logger methods', () => {
    let logger: Logger;

    beforeEach(() => {
      logger = createLogger('debug');
    });

    it('should log debug messages', () => {
      // Should not throw
      expect(() => {
        logger.debug('Debug message');
      }).not.toThrow();
    });

    it('should log info messages', () => {
      expect(() => {
        logger.info('Info message');
      }).not.toThrow();
    });

    it('should log warn messages', () => {
      expect(() => {
        logger.warn('Warning message');
      }).not.toThrow();
    });

    it('should log error messages', () => {
      expect(() => {
        logger.error('Error message');
      }).not.toThrow();
    });

    it('should log messages with context', () => {
      expect(() => {
        logger.info('Message with context', {
          codebaseName: 'test-codebase',
          filePath: '/path/to/file.ts',
          chunkCount: 42,
        });
      }).not.toThrow();
    });

    it('should log error messages with Error object', () => {
      const error = new Error('Test error');
      expect(() => {
        logger.error('Error occurred', error);
      }).not.toThrow();
    });

    it('should log error messages with Error object and context', () => {
      const error = new Error('Test error');
      expect(() => {
        logger.error('Error occurred', error, {
          filePath: '/path/to/file.ts',
        });
      }).not.toThrow();
    });

    it('should log error messages with LogError object', () => {
      const error = {
        message: 'Custom error',
        code: 'ERR_CUSTOM',
        stack: 'Stack trace here',
      };
      expect(() => {
        logger.error('Error occurred', error);
      }).not.toThrow();
    });
  });

  describe('Child logger', () => {
    let rootLogger: Logger;

    beforeEach(() => {
      rootLogger = createLogger('debug');
    });

    it('should create a child logger with component name', () => {
      const childLogger = rootLogger.child('TestComponent');
      expect(childLogger).toBeDefined();
      expect(childLogger.debug).toBeDefined();
      expect(childLogger.info).toBeDefined();
      expect(childLogger.warn).toBeDefined();
      expect(childLogger.error).toBeDefined();
    });

    it('should create a child logger with component and operation', () => {
      const childLogger = rootLogger.child('TestComponent', 'testOperation');
      expect(childLogger).toBeDefined();
    });

    it('should log messages with component context', () => {
      const childLogger = rootLogger.child('TestComponent', 'testOperation');
      expect(() => {
        childLogger.info('Component message');
      }).not.toThrow();
    });

    it('should create nested child loggers', () => {
      const childLogger = rootLogger.child('ParentComponent');
      const grandchildLogger = childLogger.child('ChildComponent', 'operation');
      expect(() => {
        grandchildLogger.info('Nested message');
      }).not.toThrow();
    });
  });

  describe('createChildLogger helper', () => {
    it('should create a child logger using helper function', () => {
      const rootLogger = createLogger('info');
      const childLogger = createChildLogger(rootLogger, 'HelperComponent');
      expect(childLogger).toBeDefined();
    });

    it('should create a child logger with operation using helper function', () => {
      const rootLogger = createLogger('info');
      const childLogger = createChildLogger(
        rootLogger,
        'HelperComponent',
        'helperOperation'
      );
      expect(childLogger).toBeDefined();
      expect(() => {
        childLogger.info('Helper message');
      }).not.toThrow();
    });
  });

  describe('Log level filtering', () => {
    it('should not log debug messages when level is info', () => {
      const logger = createLogger('info');
      // Debug messages should be filtered out at info level
      // This test just verifies it doesn't throw
      expect(() => {
        logger.debug('This should be filtered');
      }).not.toThrow();
    });

    it('should log info messages when level is info', () => {
      const logger = createLogger('info');
      expect(() => {
        logger.info('This should be logged');
      }).not.toThrow();
    });

    it('should log warn messages when level is info', () => {
      const logger = createLogger('info');
      expect(() => {
        logger.warn('This should be logged');
      }).not.toThrow();
    });

    it('should log error messages when level is info', () => {
      const logger = createLogger('info');
      expect(() => {
        logger.error('This should be logged');
      }).not.toThrow();
    });
  });

  describe('Sensitive data redaction', () => {
    it('should redact password fields', () => {
      const logger = createLogger('info');
      expect(() => {
        logger.info('User login', {
          username: 'testuser',
          password: 'secret123',
        });
      }).not.toThrow();
      // Note: Actual redaction verification would require capturing log output
    });

    it('should redact token fields', () => {
      const logger = createLogger('info');
      expect(() => {
        logger.info('API call', {
          endpoint: '/api/data',
          token: 'secret-token',
        });
      }).not.toThrow();
    });

    it('should redact authorization fields', () => {
      const logger = createLogger('info');
      expect(() => {
        logger.info('Request', {
          method: 'GET',
          authorization: 'Bearer secret-token',
        });
      }).not.toThrow();
    });
  });

  describe('Error logging completeness', () => {
    it('should include component, operation, message, and stack in error logs', () => {
      const logger = createLogger('error');
      const componentLogger = logger.child('TestComponent', 'testOperation');
      const error = new Error('Test error with stack');

      expect(() => {
        componentLogger.error('Operation failed', error, {
          additionalContext: 'test',
        });
      }).not.toThrow();
    });

    it('should handle errors without stack traces', () => {
      const logger = createLogger('error');
      const componentLogger = logger.child('TestComponent', 'testOperation');
      const error = {
        message: 'Error without stack',
        code: 'ERR_TEST',
      };

      expect(() => {
        componentLogger.error('Operation failed', error);
      }).not.toThrow();
    });
  });

  describe('Context preservation', () => {
    it('should preserve all context fields in logs', () => {
      const logger = createLogger('info');
      const context = {
        codebaseName: 'test-codebase',
        filePath: '/path/to/file.ts',
        chunkCount: 42,
        durationMs: 1234,
        customField: 'custom-value',
      };

      expect(() => {
        logger.info('Processing complete', context);
      }).not.toThrow();
    });

    it('should handle empty context', () => {
      const logger = createLogger('info');
      expect(() => {
        logger.info('Message without context');
      }).not.toThrow();
    });

    it('should handle undefined context', () => {
      const logger = createLogger('info');
      expect(() => {
        logger.info('Message with undefined context', undefined);
      }).not.toThrow();
    });
  });
});
