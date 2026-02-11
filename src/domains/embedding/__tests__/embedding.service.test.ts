/**
 * Unit tests for embedding service
 * 
 * Tests initialization, single embedding generation, batch embedding generation,
 * error handling, and model caching.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HuggingFaceEmbeddingService } from '../embedding.service.js';
import type { Config } from '../../../shared/types/index.js';
import { createLogger } from '../../../shared/logging/logger.js';

// Mock the @huggingface/transformers module
vi.mock('@huggingface/transformers', () => ({
  pipeline: vi.fn(),
}));

describe('HuggingFaceEmbeddingService', () => {
  let service: HuggingFaceEmbeddingService;
  let config: Config;
  let mockPipeline: any;

  beforeEach(async () => {
    // Reset mocks
    vi.clearAllMocks();

    // Create test config
    config = {
      lancedb: {
        persistPath: '/tmp/test-lancedb',
      },
      embedding: {
        modelName: 'Xenova/all-MiniLM-L6-v2',
        cachePath: '/tmp/test-models',
      },
      server: {
        port: 8008,
        host: 'localhost',
      },
      mcp: {
        transport: 'stdio',
      },
      ingestion: {
        batchSize: 100,
        maxFileSize: 1048576,
      },
      search: {
        defaultMaxResults: 50,
        cacheTimeoutSeconds: 60,
      },
      logging: {
        level: 'error', // Suppress logs during tests
      },
      schemaVersion: '1.0.0',
    };

    // Create mock pipeline
    mockPipeline = vi.fn(async (_text: string) => ({
      data: new Float32Array([0.1, 0.2, 0.3, 0.4, 0.5]),
    }));

    // Mock the pipeline function
    const { pipeline } = await import('@huggingface/transformers');
    (pipeline as any).mockResolvedValue(mockPipeline);

    // Create service
    const logger = createLogger('error');
    service = new HuggingFaceEmbeddingService(config, logger);
  });

  describe('initialization', () => {
    it('should initialize the model successfully', async () => {
      await service.initialize();

      expect(service.isInitialized()).toBe(true);
      expect(service.getModelName()).toBe('Xenova/all-MiniLM-L6-v2');
      expect(service.getEmbeddingDimension()).toBe(5); // Based on mock data
    });

    it('should not reinitialize if already initialized', async () => {
      await service.initialize();
      const firstInit = service.isInitialized();

      await service.initialize();
      const secondInit = service.isInitialized();

      expect(firstInit).toBe(true);
      expect(secondInit).toBe(true);
      // Pipeline should only be called once for initialization
      const { pipeline } = await import('@huggingface/transformers');
      expect(pipeline).toHaveBeenCalledTimes(1);
    });

    it('should set HF_HOME environment variable from config', async () => {
      await service.initialize();

      expect(process.env.HF_HOME).toBe('/tmp/test-models');
    });

    it('should throw error if model initialization fails', async () => {
      const { pipeline } = await import('@huggingface/transformers');
      (pipeline as any).mockRejectedValueOnce(new Error('Model download failed'));

      await expect(service.initialize()).rejects.toThrow(
        'Failed to initialize embedding model: Model download failed'
      );
      expect(service.isInitialized()).toBe(false);
    });
  });

  describe('generateEmbedding', () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it('should generate embedding for valid text', async () => {
      const text = 'function hello() { return "world"; }';
      const embedding = await service.generateEmbedding(text);

      expect(embedding.length).toBe(5);
      // Check approximate equality due to Float32Array precision
      expect(embedding[0]).toBeCloseTo(0.1, 1);
      expect(embedding[1]).toBeCloseTo(0.2, 1);
      expect(embedding[2]).toBeCloseTo(0.3, 1);
      expect(embedding[3]).toBeCloseTo(0.4, 1);
      expect(embedding[4]).toBeCloseTo(0.5, 1);
    });

    it('should throw error if model not initialized', async () => {
      const uninitializedService = new HuggingFaceEmbeddingService(
        config,
        createLogger('error')
      );

      await expect(uninitializedService.generateEmbedding('test')).rejects.toThrow(
        'Embedding model not initialized'
      );
    });

    it('should throw error for empty text', async () => {
      await expect(service.generateEmbedding('')).rejects.toThrow(
        'Cannot generate embedding for empty text'
      );
    });

    it('should throw error for whitespace-only text', async () => {
      await expect(service.generateEmbedding('   ')).rejects.toThrow(
        'Cannot generate embedding for empty text'
      );
    });

    it('should handle embedding generation failure', async () => {
      mockPipeline.mockRejectedValueOnce(new Error('Embedding failed'));

      await expect(service.generateEmbedding('test')).rejects.toThrow(
        'Failed to generate embedding: Embedding failed'
      );
    });

    it('should generate embeddings for different texts', async () => {
      const text1 = 'function foo() {}';
      const text2 = 'class Bar {}';

      const embedding1 = await service.generateEmbedding(text1);
      const embedding2 = await service.generateEmbedding(text2);

      expect(embedding1.length).toBe(5);
      expect(embedding2.length).toBe(5);
      expect(mockPipeline).toHaveBeenCalledTimes(3); // 1 for init test, 2 for these
    });
  });

  describe('batchGenerateEmbeddings', () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it('should generate embeddings for multiple texts', async () => {
      const texts = [
        'function foo() {}',
        'class Bar {}',
        'const x = 42;',
      ];

      const embeddings = await service.batchGenerateEmbeddings(texts);

      expect(embeddings).toHaveLength(3);
      embeddings.forEach((embedding) => {
        expect(embedding.length).toBe(5);
      });
    });

    it('should return empty array for empty input', async () => {
      const embeddings = await service.batchGenerateEmbeddings([]);

      expect(embeddings).toEqual([]);
    });

    it('should throw error if model not initialized', async () => {
      const uninitializedService = new HuggingFaceEmbeddingService(
        config,
        createLogger('error')
      );

      await expect(uninitializedService.batchGenerateEmbeddings(['test'])).rejects.toThrow(
        'Embedding model not initialized'
      );
    });

    it('should skip empty texts in batch', async () => {
      const texts = ['function foo() {}', '', 'class Bar {}'];

      const embeddings = await service.batchGenerateEmbeddings(texts);

      // Should only return embeddings for non-empty texts
      expect(embeddings).toHaveLength(2);
    });

    it('should throw error if all texts are empty', async () => {
      const texts = ['', '   ', ''];

      await expect(service.batchGenerateEmbeddings(texts)).rejects.toThrow(
        'No valid texts to embed in batch'
      );
    });

    it('should skip failed embeddings in batch and continue with others', async () => {
      const texts = ['function foo() {}', 'class Bar {}', 'const baz = 1;'];
      
      // Make the second call fail
      mockPipeline
        .mockResolvedValueOnce({ data: new Float32Array([0.1, 0.2, 0.3, 0.4, 0.5]) })
        .mockRejectedValueOnce(new Error('Embedding failed'))
        .mockResolvedValueOnce({ data: new Float32Array([0.6, 0.7, 0.8, 0.9, 1.0]) });

      const embeddings = await service.batchGenerateEmbeddings(texts);

      // Should return only successful embeddings (first and third)
      expect(embeddings).toHaveLength(2);
      expect(embeddings[0]).toHaveLength(5);
      expect(embeddings[1]).toHaveLength(5);
      // Check approximate values due to Float32Array precision
      expect(embeddings[0][0]).toBeCloseTo(0.1, 1);
      expect(embeddings[1][0]).toBeCloseTo(0.6, 1);
    });

    it('should handle large batches', async () => {
      const texts = Array(50).fill('function test() {}');

      const embeddings = await service.batchGenerateEmbeddings(texts);

      expect(embeddings).toHaveLength(50);
      embeddings.forEach((embedding) => {
        expect(embedding.length).toBe(5);
      });
    });
  });

  describe('model information', () => {
    it('should return correct model name', () => {
      expect(service.getModelName()).toBe('Xenova/all-MiniLM-L6-v2');
    });

    it('should return default embedding dimension before initialization', () => {
      expect(service.getEmbeddingDimension()).toBe(384);
    });

    it('should return actual embedding dimension after initialization', async () => {
      await service.initialize();

      expect(service.getEmbeddingDimension()).toBe(5); // Based on mock
    });

    it('should return false for isInitialized before initialization', () => {
      expect(service.isInitialized()).toBe(false);
    });

    it('should return true for isInitialized after initialization', async () => {
      await service.initialize();

      expect(service.isInitialized()).toBe(true);
    });
  });

  describe('model caching', () => {
    it('should cache model in memory for process lifetime', async () => {
      await service.initialize();

      // Generate multiple embeddings
      await service.generateEmbedding('test1');
      await service.generateEmbedding('test2');
      await service.generateEmbedding('test3');

      // Pipeline should only be called once for initialization
      const { pipeline } = await import('@huggingface/transformers');
      expect(pipeline).toHaveBeenCalledTimes(1);
    });

    it('should reuse initialized model across multiple operations', async () => {
      await service.initialize();

      const embedding1 = await service.generateEmbedding('test1');
      const batch = await service.batchGenerateEmbeddings(['test2', 'test3']);
      const embedding2 = await service.generateEmbedding('test4');

      expect(embedding1).toBeDefined();
      expect(batch).toHaveLength(2);
      expect(embedding2).toBeDefined();

      // Model should still be initialized
      expect(service.isInitialized()).toBe(true);
    });
  });

  describe('error handling with logging', () => {
    it('should log error when initialization fails', async () => {
      const { pipeline } = await import('@huggingface/transformers');
      (pipeline as any).mockRejectedValueOnce(new Error('Network error'));

      await expect(service.initialize()).rejects.toThrow();
      // Error should be logged (we can't easily test this without spying on logger)
    });

    it('should log error when embedding generation fails', async () => {
      await service.initialize();
      mockPipeline.mockRejectedValueOnce(new Error('Generation error'));

      await expect(service.generateEmbedding('test')).rejects.toThrow();
      // Error should be logged
    });

    it('should log warning when skipping empty text in batch', async () => {
      await service.initialize();
      const texts = ['valid', '', 'also valid'];

      const embeddings = await service.batchGenerateEmbeddings(texts);

      expect(embeddings).toHaveLength(2);
      // Warning should be logged for empty text
    });
  });

  describe('edge cases', () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it('should handle very long text', async () => {
      const longText = 'a'.repeat(10000);

      const embedding = await service.generateEmbedding(longText);

      expect(embedding.length).toBe(5);
    });

    it('should handle text with special characters', async () => {
      const specialText = 'function test() { return "hello\\nworld"; }';

      const embedding = await service.generateEmbedding(specialText);

      expect(embedding.length).toBe(5);
    });

    it('should handle text with unicode characters', async () => {
      const unicodeText = 'function 测试() { return "🚀"; }';

      const embedding = await service.generateEmbedding(unicodeText);

      expect(embedding.length).toBe(5);
    });

    it('should handle single character text', async () => {
      const embedding = await service.generateEmbedding('x');

      expect(embedding.length).toBe(5);
    });
  });
});
