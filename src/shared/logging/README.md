# Structured Logging with Pino

This module provides structured logging capabilities using Pino with configurable log levels, automatic sensitive data redaction, and component-specific child loggers.

## Features

- **Structured Log Format**: All logs include timestamp, level, component, operation, and context
- **Configurable Log Levels**: debug, info, warn, error
- **Sensitive Data Redaction**: Automatically redacts passwords, tokens, and other sensitive fields
- **Child Loggers**: Create component-specific loggers with contextual information
- **Pretty Printing**: Optional pretty printing for development environments
- **Error Logging**: Comprehensive error logging with stack traces

## Usage

### Creating a Root Logger

```typescript
import { createLogger } from './shared/logging/index.js';

// Create logger with default 'info' level
const logger = createLogger();

// Create logger with specific level
const debugLogger = createLogger('debug');

// Create logger with pretty printing for development
const devLogger = createLogger('info', true);
```

### Basic Logging

```typescript
// Log messages at different levels
logger.debug('Debug information');
logger.info('Application started');
logger.warn('Deprecated API usage detected');
logger.error('Failed to connect to database');
```

### Logging with Context

```typescript
logger.info('Processing codebase', {
  codebaseName: 'my-project',
  filePath: '/src/index.ts',
  chunkCount: 42,
  durationMs: 1234,
});
```

### Error Logging

```typescript
try {
  // Some operation
} catch (error) {
  logger.error('Operation failed', error, {
    operation: 'parseFile',
    filePath: '/path/to/file.ts',
  });
}
```

### Creating Child Loggers

Child loggers inherit the parent logger's configuration and add component-specific context:

```typescript
import { createLogger, createChildLogger } from './shared/logging/index.js';

const rootLogger = createLogger('info');

// Create child logger for a specific component
const ingestionLogger = rootLogger.child('IngestionService');
ingestionLogger.info('Starting ingestion');

// Create child logger with operation context
const parsingLogger = rootLogger.child('ParsingService', 'parseFile');
parsingLogger.info('Parsing file', { filePath: '/src/index.ts' });

// Alternative using helper function
const searchLogger = createChildLogger(rootLogger, 'SearchService', 'search');
searchLogger.info('Executing search', { query: 'authentication' });
```

## Log Format

All logs follow this structured format:

```json
{
  "level": "info",
  "timestamp": "2026-02-10T11:23:09.244Z",
  "component": "IngestionService",
  "operation": "parseFile",
  "context": {
    "codebaseName": "my-project",
    "filePath": "/src/index.ts",
    "chunkCount": 42
  },
  "msg": "File parsed successfully"
}
```

Error logs include additional error information:

```json
{
  "level": "error",
  "timestamp": "2026-02-10T11:23:09.247Z",
  "component": "ParsingService",
  "operation": "parseFile",
  "context": {
    "filePath": "/src/broken.ts"
  },
  "error": {
    "message": "Unexpected token",
    "stack": "Error: Unexpected token\n    at ...",
    "code": "ERR_PARSE"
  },
  "msg": "Failed to parse file"
}
```

## Sensitive Data Redaction

The following fields are automatically redacted from logs:

- `password`
- `token`
- `authorization`
- `apiKey` / `api_key`
- `secret`
- `accessToken` / `access_token`
- `refreshToken` / `refresh_token`

Example:

```typescript
logger.info('User login', {
  username: 'john',
  password: 'secret123', // Will be redacted
});

// Output:
// { ..., "context": { "username": "john", "password": "[REDACTED]" }, ... }
```

## Log Levels

Log levels control which messages are output:

- **debug**: All messages (debug, info, warn, error)
- **info**: Info, warn, and error messages
- **warn**: Warn and error messages only
- **error**: Error messages only

```typescript
const logger = createLogger('warn');

logger.debug('Not logged'); // Filtered out
logger.info('Not logged');  // Filtered out
logger.warn('Logged');      // ✓
logger.error('Logged');     // ✓
```

## Integration with Services

Typical usage pattern in a service:

```typescript
import { createLogger, type Logger } from './shared/logging/index.js';

export class IngestionService {
  private readonly logger: Logger;

  constructor(rootLogger: Logger) {
    this.logger = rootLogger.child('IngestionService');
  }

  async ingestCodebase(path: string, name: string): Promise<void> {
    const operationLogger = this.logger.child('IngestionService', 'ingestCodebase');
    
    operationLogger.info('Starting ingestion', { path, name });
    
    try {
      // Perform ingestion
      operationLogger.info('Ingestion completed', {
        codebaseName: name,
        chunkCount: 1234,
        durationMs: 5000,
      });
    } catch (error) {
      operationLogger.error('Ingestion failed', error, {
        codebaseName: name,
        path,
      });
      throw error;
    }
  }
}
```

## Requirements Satisfied

This implementation satisfies **Requirement 11.5**:
- Configurable log levels (debug, info, warn, error)
- Structured log format with timestamp, level, component, operation, context
- Log redaction for sensitive data
- Child logger factory for component-specific logging
