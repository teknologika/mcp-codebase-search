/**
 * ChromaDB client wrapper with local persistence configuration
 * Provides methods for collection management and metadata queries
 */

import { ChromaClient, type CollectionMetadata, DefaultEmbeddingFunction } from 'chromadb';
import type { Config } from '../../shared/types/index.js';
import { createLogger } from '../../shared/logging/index.js';
import { SCHEMA_VERSION } from '../../shared/config/config.js';

const rootLogger = createLogger('info');
const logger = rootLogger.child('ChromaDBClient');

/**
 * Error thrown when ChromaDB operations fail
 */
export class ChromaDBError extends Error {
  constructor(message: string, public cause?: unknown) {
    super(message);
    this.name = 'ChromaDBError';
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Collection information with metadata
 */
export interface CollectionInfo {
  name: string;
  id: string;
  metadata?: CollectionMetadata;
}

/**
 * ChromaDB client wrapper with enhanced functionality
 */
export class ChromaDBClientWrapper {
  private client: ChromaClient;
  private config: Config;
  private initialized: boolean = false;
  private defaultEmbeddingFunction: DefaultEmbeddingFunction;

  constructor(config: Config) {
    this.config = config;
    // ChromaDB uses 'path' for the server URL, but for local persistence
    // we need to use the file:// protocol or just the path
    this.client = new ChromaClient({ 
      path: `http://localhost:8000` // Default ChromaDB server
    });
    this.defaultEmbeddingFunction = new DefaultEmbeddingFunction();
  }

  /**
   * Initialize the ChromaDB client and verify connection
   */
  async initialize(): Promise<void> {
    try {
      logger.info('Initializing ChromaDB client', { 
        persistPath: this.config.chromadb.persistPath,
        schemaVersion: SCHEMA_VERSION
      });
      
      // Test connection by getting heartbeat or listing collections
      await this.client.heartbeat();
      
      this.initialized = true;
      logger.info('ChromaDB client initialized successfully', {
        persistPath: this.config.chromadb.persistPath,
        schemaVersion: SCHEMA_VERSION
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(
        'Failed to initialize ChromaDB client',
        error instanceof Error ? error : new Error(errorMessage),
        { persistPath: this.config.chromadb.persistPath }
      );
      throw new ChromaDBError(
        `Failed to initialize ChromaDB client: ${errorMessage}`,
        error
      );
    }
  }

  /**
   * Ensure client is initialized before operations
   */
  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new ChromaDBError('ChromaDB client not initialized. Call initialize() first.');
    }
  }

  /**
   * Generate collection name following the pattern: codebase_{name}_{schemaVersion}
   */
  public static getCollectionName(codebaseName: string): string {
    // Replace any characters that might not be valid in collection names
    const sanitizedName = codebaseName.replace(/[^a-zA-Z0-9_-]/g, '_');
    return `codebase_${sanitizedName}_${SCHEMA_VERSION.replace(/\./g, '_')}`;
  }

  /**
   * Create a new collection for a codebase
   */
  async createCollection(codebaseName: string, metadata?: CollectionMetadata): Promise<void> {
    this.ensureInitialized();

    const collectionName = ChromaDBClientWrapper.getCollectionName(codebaseName);
    
    try {
      logger.info('Creating ChromaDB collection', {
        codebaseName,
        collectionName,
      });

      const collectionMetadata: CollectionMetadata = {
        ...metadata,
        codebaseName,
        schemaVersion: SCHEMA_VERSION,
        createdAt: new Date().toISOString(),
      };

      await this.client.createCollection({
        name: collectionName,
        metadata: collectionMetadata,
        embeddingFunction: this.defaultEmbeddingFunction,
      });

      logger.info('Collection created successfully', {
        codebaseName,
        collectionName,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(
        'Failed to create collection',
        error instanceof Error ? error : new Error(errorMessage),
        { codebaseName, collectionName }
      );
      throw new ChromaDBError(
        `Failed to create collection for codebase '${codebaseName}': ${errorMessage}`,
        error
      );
    }
  }

  /**
   * Get or create a collection for a codebase
   */
  async getOrCreateCollection(codebaseName: string, metadata?: CollectionMetadata): Promise<void> {
    this.ensureInitialized();

    const collectionName = ChromaDBClientWrapper.getCollectionName(codebaseName);
    
    try {
      logger.debug('Getting or creating ChromaDB collection', {
        codebaseName,
        collectionName,
      });

      const collectionMetadata: CollectionMetadata = {
        ...metadata,
        codebaseName,
        schemaVersion: SCHEMA_VERSION,
        createdAt: new Date().toISOString(),
      };

      await this.client.getOrCreateCollection({
        name: collectionName,
        metadata: collectionMetadata,
        embeddingFunction: this.defaultEmbeddingFunction,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(
        'Failed to get or create collection',
        error instanceof Error ? error : new Error(errorMessage),
        { codebaseName, collectionName }
      );
      throw new ChromaDBError(
        `Failed to get or create collection for codebase '${codebaseName}': ${errorMessage}`,
        error
      );
    }
  }

  /**
   * Get an existing collection by codebase name
   * Returns true if collection exists, false otherwise
   */
  async collectionExists(codebaseName: string): Promise<boolean> {
    this.ensureInitialized();

    const collectionName = ChromaDBClientWrapper.getCollectionName(codebaseName);
    
    try {
      logger.debug('Checking if collection exists', {
        codebaseName,
        collectionName,
      });

      await this.client.getCollection({
        name: collectionName,
        embeddingFunction: this.defaultEmbeddingFunction,
      });

      return true;
    } catch (error) {
      // ChromaDB throws an error if collection doesn't exist
      logger.debug('Collection not found', {
        codebaseName,
        collectionName,
      });
      return false;
    }
  }

  /**
   * Delete a collection by codebase name
   */
  async deleteCollection(codebaseName: string): Promise<void> {
    this.ensureInitialized();

    const collectionName = ChromaDBClientWrapper.getCollectionName(codebaseName);
    
    try {
      logger.info('Deleting ChromaDB collection', {
        codebaseName,
        collectionName,
      });

      await this.client.deleteCollection({ name: collectionName });

      logger.info('Collection deleted successfully', {
        codebaseName,
        collectionName,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(
        'Failed to delete collection',
        error instanceof Error ? error : new Error(errorMessage),
        { codebaseName, collectionName }
      );
      throw new ChromaDBError(
        `Failed to delete collection for codebase '${codebaseName}': ${errorMessage}`,
        error
      );
    }
  }

  /**
   * List all collections
   */
  async listCollections(): Promise<CollectionInfo[]> {
    this.ensureInitialized();

    try {
      logger.debug('Listing all collections');

      const collections = await this.client.listCollectionsAndMetadata();

      logger.debug('Collections listed successfully', {
        count: collections.length,
      });

      return collections;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(
        'Failed to list collections',
        error instanceof Error ? error : new Error(errorMessage)
      );
      throw new ChromaDBError(
        `Failed to list collections: ${errorMessage}`,
        error
      );
    }
  }

  /**
   * Get collection metadata
   */
  async getCollectionMetadata(codebaseName: string): Promise<CollectionMetadata | null> {
    const collectionName = ChromaDBClientWrapper.getCollectionName(codebaseName);
    
    try {
      const collections = await this.client.listCollectionsAndMetadata();
      const collection = collections.find(c => c.name === collectionName);
      
      return collection?.metadata || null;
    } catch (error) {
      logger.debug('Failed to get collection metadata', {
        codebaseName,
        collectionName,
      });
      return null;
    }
  }

  /**
   * Check schema version of a collection
   */
  async checkSchemaVersion(codebaseName: string): Promise<{ 
    matches: boolean; 
    collectionVersion?: string; 
    currentVersion: string;
  }> {
    const metadata = await this.getCollectionMetadata(codebaseName);
    
    if (!metadata) {
      return {
        matches: false,
        currentVersion: SCHEMA_VERSION,
      };
    }

    const collectionVersion = metadata.schemaVersion as string | undefined;
    
    return {
      matches: collectionVersion === SCHEMA_VERSION,
      collectionVersion,
      currentVersion: SCHEMA_VERSION,
    };
  }

  /**
   * Get the underlying ChromaClient instance
   * Use with caution - prefer using wrapper methods
   */
  getClient(): ChromaClient {
    this.ensureInitialized();
    return this.client;
  }

  /**
   * Get current schema version
   */
  static getSchemaVersion(): string {
    return SCHEMA_VERSION;
  }
}
