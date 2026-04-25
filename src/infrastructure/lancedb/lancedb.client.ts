/**
 * LanceDB client wrapper with local file-based storage
 * Provides methods for collection management and vector operations
 */

import { connect, type Connection, type Table } from '@lancedb/lancedb';
import type { Config } from '../../shared/types/index.js';
import { createLogger, type Logger } from '../../shared/logging/index.js';
import { SCHEMA_VERSION } from '../../shared/config/config.js';

/**
 * Error thrown when LanceDB operations fail
 */
export class LanceDBError extends Error {
  constructor(message: string, public cause?: unknown) {
    super(message);
    this.name = 'LanceDBError';
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Collection (table) information with metadata
 */
export interface CollectionInfo {
  name: string;
  metadata?: Record<string, any>;
}

function parseStringArrayField(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string' && item.length > 0);
  }

  if (typeof value !== 'string' || value.length === 0) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed.filter((item): item is string => typeof item === 'string' && item.length > 0);
    }
  } catch {
    return [value];
  }

  return [value];
}

/**
 * LanceDB client wrapper with enhanced functionality
 */
export class LanceDBClientWrapper {
  private connection: Connection | null = null;
  private config: Config;
  private initialized: boolean = false;
  private logger: Logger;

  constructor(config: Config, logger?: Logger) {
    this.config = config;
    this.logger = logger ? logger.child('LanceDBClient') : createLogger('info').child('LanceDBClient');
  }

  /**
   * Initialize the LanceDB client and verify connection
   */
  async initialize(): Promise<void> {
    try {
      this.logger.debug('Initializing LanceDB client', { 
        persistPath: this.config.lancedb.persistPath,
        schemaVersion: SCHEMA_VERSION
      });
      
      // Connect to local database
      this.connection = await connect(this.config.lancedb.persistPath);
      
      this.initialized = true;
      this.logger.debug('LanceDB client initialized successfully', {
        persistPath: this.config.lancedb.persistPath,
        schemaVersion: SCHEMA_VERSION
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(
        'Failed to initialize LanceDB client',
        error instanceof Error ? error : new Error(errorMessage),
        { persistPath: this.config.lancedb.persistPath }
      );
      throw new LanceDBError(
        `Failed to initialize LanceDB client: ${errorMessage}`,
        error
      );
    }
  }

  /**
   * Ensure client is initialized before operations
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  /**
   * Generate table name following the pattern: codebase_{name}_{schemaVersion}
   */
  public static getTableName(codebaseName: string): string {
    // Replace any characters that might not be valid in table names
    const sanitizedName = codebaseName.replace(/[^a-zA-Z0-9_-]/g, '_');
    return `codebase_${sanitizedName}_${SCHEMA_VERSION.replace(/\./g, '_')}`;
  }

  /**
   * Create a new table for a codebase
   */
  async createTable(codebaseName: string, data: any[], metadata?: Record<string, any>): Promise<void> {
    await this.ensureInitialized();

    const tableName = LanceDBClientWrapper.getTableName(codebaseName);
    
    try {
      this.logger.info('Creating LanceDB table', {
        codebaseName,
        tableName,
      });

      // Add metadata to the first record
      const dataWithMetadata = data.map(record => ({
        ...record,
        _codebaseName: codebaseName,
        _schemaVersion: SCHEMA_VERSION,
        _createdAt: new Date().toISOString(),
        ...metadata,
      }));

      await this.connection!.createTable(tableName, dataWithMetadata);

      this.logger.info('Table created successfully', {
        codebaseName,
        tableName,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(
        'Failed to create table',
        error instanceof Error ? error : new Error(errorMessage),
        { codebaseName, tableName }
      );
      throw new LanceDBError(
        `Failed to create table for codebase '${codebaseName}': ${errorMessage}`,
        error
      );
    }
  }

  /**
   * Get or create a table for a codebase
   * Returns null if table doesn't exist (caller should create it with actual data)
   */
  async getOrCreateTable(codebaseName: string): Promise<Table | null> {
    await this.ensureInitialized();

    const tableName = LanceDBClientWrapper.getTableName(codebaseName);
    
    try {
      this.logger.debug('Getting LanceDB table', {
        codebaseName,
        tableName,
      });

      // Check if table exists
      const tableNames = await this.connection!.tableNames();
      
      if (tableNames.includes(tableName)) {
        return await this.connection!.openTable(tableName);
      }

      // Return null - caller should create table with actual data
      this.logger.debug('Table does not exist, returning null', {
        codebaseName,
        tableName,
      });
      return null;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(
        'Failed to get table',
        error instanceof Error ? error : new Error(errorMessage),
        { codebaseName, tableName }
      );
      throw new LanceDBError(
        `Failed to get table for codebase '${codebaseName}': ${errorMessage}`,
        error
      );
    }
  }

  /**
   * Create a table with initial data
   */
  async createTableWithData(codebaseName: string, data: any[]): Promise<Table> {
    await this.ensureInitialized();

    const tableName = LanceDBClientWrapper.getTableName(codebaseName);
    
    try {
      this.logger.info('Creating LanceDB table with data', {
        codebaseName,
        tableName,
        rowCount: data.length,
      });

      await this.connection!.createTable(tableName, data);
      const table = await this.connection!.openTable(tableName);

      this.logger.info('Table created successfully', {
        codebaseName,
        tableName,
      });

      return table;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(
        'Failed to create table with data',
        error instanceof Error ? error : new Error(errorMessage),
        { codebaseName, tableName }
      );
      throw new LanceDBError(
        `Failed to create table for codebase '${codebaseName}': ${errorMessage}`,
        error
      );
    }
  }

  /**
   * Check if a table exists
   */
  async tableExists(codebaseName: string): Promise<boolean> {
    await this.ensureInitialized();

    const tableName = LanceDBClientWrapper.getTableName(codebaseName);
    
    try {
      this.logger.debug('Checking if table exists', {
        codebaseName,
        tableName,
      });

      const tableNames = await this.connection!.tableNames();
      return tableNames.includes(tableName);
    } catch (_error) {
      this.logger.debug('Table check failed', {
        codebaseName,
        tableName,
      });
      return false;
    }
  }

  /**
   * Delete a table by codebase name
   */
  async deleteTable(codebaseName: string): Promise<void> {
    await this.ensureInitialized();

    const tableName = LanceDBClientWrapper.getTableName(codebaseName);
    
    try {
      const tableNames = await this.connection!.tableNames();

      if (!tableNames.includes(tableName)) {
        this.logger.debug('Table does not exist, skipping delete', {
          codebaseName,
          tableName,
        });
        return;
      }

      this.logger.info('Deleting LanceDB table', {
        codebaseName,
        tableName,
      });

      await this.connection!.dropTable(tableName);

      this.logger.info('Table deleted successfully', {
        codebaseName,
        tableName,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(
        'Failed to delete table',
        error instanceof Error ? error : new Error(errorMessage),
        { codebaseName, tableName }
      );
      throw new LanceDBError(
        `Failed to delete table for codebase '${codebaseName}': ${errorMessage}`,
        error
      );
    }
  }

  /**
   * List all tables
   */
  async listTables(): Promise<CollectionInfo[]> {
    await this.ensureInitialized();

    try {
      this.logger.debug('Listing all tables');

      const tableNames = await this.connection!.tableNames();
      
      // Filter to only codebase tables and extract metadata
      const collections: CollectionInfo[] = [];
      
      for (const tableName of tableNames) {
        if (tableName.startsWith('codebase_')) {
          // Extract codebase name from table name
          const match = tableName.match(/^codebase_(.+)_\d+_\d+_\d+$/);
          const codebaseName = match ? match[1].replace(/_/g, '-') : tableName;
          
          collections.push({
            name: tableName,
            metadata: {
              codebaseName,
              schemaVersion: SCHEMA_VERSION,
            },
          });
        }
      }

      this.logger.debug('Tables listed successfully', {
        count: collections.length,
      });

      return collections;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(
        'Failed to list tables',
        error instanceof Error ? error : new Error(errorMessage)
      );
      throw new LanceDBError(
        `Failed to list tables: ${errorMessage}`,
        error
      );
    }
  }

  /**
   * Get the underlying Connection instance
   */
  getConnection(): Connection {
    if (!this.connection) {
      throw new LanceDBError('LanceDB client not initialized');
    }
    return this.connection;
  }

  /**
   * Get current schema version
   */
  static getSchemaVersion(): string {
    return SCHEMA_VERSION;
  }
  /**
   * Close the LanceDB connection and cleanup resources
   */
  async close(): Promise<void> {
    if (this.connection) {
      try {
        this.logger.debug('Closing LanceDB connection');
        // LanceDB connections are automatically cleaned up, but we set to null
        this.connection = null;
        this.initialized = false;
        this.logger.debug('LanceDB connection closed successfully');
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.error(
          'Failed to close LanceDB connection',
          error instanceof Error ? error : new Error(errorMessage)
        );
        throw new LanceDBError(
          `Failed to close LanceDB connection: ${errorMessage}`,
          error
        );
      }
    }
  }
  /**
   * Get or create the metadata table (lazy initialization)
   */
  private async getOrCreateMetadataTable(): Promise<Table> {
    if (this.metadataTable) {
      return this.metadataTable;
    }

    await this.ensureInitialized();

    try {
      const tableNames = await this.connection!.tableNames();

      if (tableNames.includes(LanceDBClientWrapper.METADATA_TABLE_NAME)) {
        this.metadataTable = await this.connection!.openTable(LanceDBClientWrapper.METADATA_TABLE_NAME);
        this.logger.debug('Opened existing metadata table');
      } else {
        // Create metadata table with initial empty data
        const initialData = [{
          name: '_init',
          path: '',
          createdAt: new Date().toISOString(),
          lastIngested: new Date().toISOString(),
          lastModified: new Date().toISOString(),
          lastRescanChangedAt: '',
          lastRescanFilesChanged: 0,
          lastRescanFilesAdded: 0,
          lastRescanFilesModified: 0,
          lastRescanFilesDeleted: 0,
          lastRescanChangedFilePaths: JSON.stringify([]),
          chunkCount: 0,
          fileCount: 0,
          sizeBytes: 0,
          languages: JSON.stringify([]),
          chunkTypes: JSON.stringify([]),
          schemaVersion: SCHEMA_VERSION,
          tableName: '_init',
          status: 'active',
        }];

        this.metadataTable = await this.connection!.createTable(
          LanceDBClientWrapper.METADATA_TABLE_NAME,
          initialData
        );

        // Delete the initialization row
        await this.metadataTable.delete(`name = '_init'`);

        this.logger.info('Created new metadata table');
      }

      return this.metadataTable;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(
        'Failed to get or create metadata table',
        error instanceof Error ? error : new Error(errorMessage)
      );
      throw new LanceDBError(
        `Failed to get or create metadata table: ${errorMessage}`,
        error
      );
    }
  }

  /**
   * Get metadata for a specific codebase
   */
  async getMetadata(codebaseName: string): Promise<any | null> {
    try {
      const table = await this.getOrCreateMetadataTable();
      const escapedName = codebaseName.replace(/'/g, "''");

      const rows = await table
        .query()
        .where(`name = '${escapedName}'`)
        .limit(1)
        .toArray();

      if (rows.length === 0) {
        return null;
      }

      const row = rows[0];

      // Parse JSON fields
      return {
        ...row,
        languages: JSON.parse(row.languages || '[]'),
        chunkTypes: JSON.parse(row.chunkTypes || '[]'),
        lastRescanChangedFilePaths: parseStringArrayField(row.lastRescanChangedFilePaths),
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(
        'Failed to get metadata',
        error instanceof Error ? error : new Error(errorMessage),
        { codebaseName }
      );
      throw new LanceDBError(
        `Failed to get metadata for codebase '${codebaseName}': ${errorMessage}`,
        error
      );
    }
  }

  /**
   * Set or update metadata for a codebase
   */
  async setMetadata(metadata: any): Promise<void> {
    try {
      const table = await this.getOrCreateMetadataTable();

      // Check if metadata already exists
      const existing = await this.getMetadata(metadata.name);

      // Prepare row data with JSON serialization
      const row = {
        name: metadata.name,
        path: metadata.path,
        createdAt: metadata.createdAt || new Date().toISOString(),
        lastIngested: metadata.lastIngested,
        lastModified: metadata.lastModified || new Date().toISOString(),
        chunkCount: metadata.chunkCount,
        fileCount: metadata.fileCount,
        sizeBytes: metadata.sizeBytes,
        languages: JSON.stringify(metadata.languages || []),
        chunkTypes: JSON.stringify(metadata.chunkTypes || []),
        schemaVersion: metadata.schemaVersion || SCHEMA_VERSION,
        tableName: metadata.tableName || LanceDBClientWrapper.getTableName(metadata.name),
        status: metadata.status || 'active',
        lastError: metadata.lastError || null,
        lastRescanChangedAt: metadata.lastRescanChangedAt || '',
        lastRescanFilesChanged: metadata.lastRescanFilesChanged || 0,
        lastRescanFilesAdded: metadata.lastRescanFilesAdded || 0,
        lastRescanFilesModified: metadata.lastRescanFilesModified || 0,
        lastRescanFilesDeleted: metadata.lastRescanFilesDeleted || 0,
        lastRescanChangedFilePaths: JSON.stringify(metadata.lastRescanChangedFilePaths || []),
      };

      if (existing) {
        // Update existing metadata
        const escapedName = metadata.name.replace(/'/g, "''");
        await table.delete(`name = '${escapedName}'`);
        await table.add([row]);

        this.logger.debug('Updated metadata', { codebaseName: metadata.name });
      } else {
        // Insert new metadata
        await table.add([row]);

        this.logger.debug('Inserted new metadata', { codebaseName: metadata.name });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(
        'Failed to set metadata',
        error instanceof Error ? error : new Error(errorMessage),
        { codebaseName: metadata.name }
      );
      throw new LanceDBError(
        `Failed to set metadata for codebase '${metadata.name}': ${errorMessage}`,
        error
      );
    }
  }

  /**
   * Delete metadata for a codebase
   */
  async deleteMetadata(codebaseName: string): Promise<void> {
    try {
      const table = await this.getOrCreateMetadataTable();
      const escapedName = codebaseName.replace(/'/g, "''");

      await table.delete(`name = '${escapedName}'`);

      this.logger.debug('Deleted metadata', { codebaseName });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(
        'Failed to delete metadata',
        error instanceof Error ? error : new Error(errorMessage),
        { codebaseName }
      );
      throw new LanceDBError(
        `Failed to delete metadata for codebase '${codebaseName}': ${errorMessage}`,
        error
      );
    }
  }

  /**
   * List all codebase metadata
   */
  async listAllMetadata(): Promise<any[]> {
    try {
      const table = await this.getOrCreateMetadataTable();
      const rows = await table.query().toArray();

      // Parse JSON fields for each row
      return rows.map(row => ({
        ...row,
        languages: JSON.parse(row.languages || '[]'),
        chunkTypes: JSON.parse(row.chunkTypes || '[]'),
        lastRescanChangedFilePaths: parseStringArrayField(row.lastRescanChangedFilePaths),
      }));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(
        'Failed to list all metadata',
        error instanceof Error ? error : new Error(errorMessage)
      );
      throw new LanceDBError(
        `Failed to list all metadata: ${errorMessage}`,
        error
      );
    }
  }


    // Metadata table name constant
    private static readonly METADATA_TABLE_NAME = '_codebase_metadata';
    private metadataTable: Table | null = null;

}
