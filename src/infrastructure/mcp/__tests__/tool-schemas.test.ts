/**
 * Unit tests for MCP tool schemas
 * 
 * Validates that all tool schemas are properly defined with correct structure,
 * descriptions, and validation rules.
 */

import { describe, it, expect } from 'vitest';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import {
  LIST_CODEBASES_SCHEMA,
  SEARCH_CODEBASES_SCHEMA,
  GET_CODEBASE_STATS_SCHEMA,
  OPEN_CODEBASE_MANAGER_SCHEMA,
  ALL_TOOL_SCHEMAS,
} from '../tool-schemas.js';

describe('MCP Tool Schemas', () => {
  const ajv = new Ajv({ allErrors: true, strict: true });
  addFormats(ajv);

  describe('LIST_CODEBASES_SCHEMA', () => {
    it('should have correct name and description', () => {
      expect(LIST_CODEBASES_SCHEMA.name).toBe('list_codebases');
      expect(LIST_CODEBASES_SCHEMA.description).toBeTruthy();
      expect(LIST_CODEBASES_SCHEMA.description.length).toBeGreaterThan(10);
    });

    it('should have empty input schema', () => {
      expect(LIST_CODEBASES_SCHEMA.inputSchema.type).toBe('object');
      expect(LIST_CODEBASES_SCHEMA.inputSchema.properties).toEqual({});
      expect(LIST_CODEBASES_SCHEMA.inputSchema.additionalProperties).toBe(false);
    });

    it('should validate empty input', () => {
      const validate = ajv.compile(LIST_CODEBASES_SCHEMA.inputSchema);
      expect(validate({})).toBe(true);
    });

    it('should reject input with extra properties', () => {
      const validate = ajv.compile(LIST_CODEBASES_SCHEMA.inputSchema);
      expect(validate({ extra: 'property' })).toBe(false);
    });

    it('should have valid output schema with codebases array', () => {
      expect(LIST_CODEBASES_SCHEMA.outputSchema.type).toBe('object');
      expect(LIST_CODEBASES_SCHEMA.outputSchema.properties.codebases).toBeDefined();
      expect(LIST_CODEBASES_SCHEMA.outputSchema.properties.codebases.type).toBe('array');
    });

    it('should validate correct output', () => {
      const validate = ajv.compile(LIST_CODEBASES_SCHEMA.outputSchema);
      const output = {
        codebases: [
          {
            name: 'test-project',
            path: '/path/to/project',
            chunkCount: 100,
            fileCount: 20,
            lastIngestion: '2024-01-01T00:00:00Z',
            languages: ['typescript', 'javascript'],
          },
        ],
      };
      expect(validate(output)).toBe(true);
    });

    it('should reject output with missing required fields', () => {
      const validate = ajv.compile(LIST_CODEBASES_SCHEMA.outputSchema);
      const output = {
        codebases: [
          {
            name: 'test-project',
            // Missing other required fields
          },
        ],
      };
      expect(validate(output)).toBe(false);
    });

    it('should reject output with negative counts', () => {
      const validate = ajv.compile(LIST_CODEBASES_SCHEMA.outputSchema);
      const output = {
        codebases: [
          {
            name: 'test-project',
            path: '/path/to/project',
            chunkCount: -1,
            fileCount: 20,
            lastIngestion: '2024-01-01T00:00:00Z',
            languages: ['typescript'],
          },
        ],
      };
      expect(validate(output)).toBe(false);
    });
  });

  describe('SEARCH_CODEBASES_SCHEMA', () => {
    it('should have correct name and description', () => {
      expect(SEARCH_CODEBASES_SCHEMA.name).toBe('search_codebases');
      expect(SEARCH_CODEBASES_SCHEMA.description).toBeTruthy();
      expect(SEARCH_CODEBASES_SCHEMA.description.length).toBeGreaterThan(10);
    });

    it('should require query parameter', () => {
      expect(SEARCH_CODEBASES_SCHEMA.inputSchema.required).toContain('query');
    });

    it('should validate input with only query', () => {
      const validate = ajv.compile(SEARCH_CODEBASES_SCHEMA.inputSchema);
      expect(validate({ query: 'authentication function' })).toBe(true);
    });

    it('should validate input with all optional parameters', () => {
      const validate = ajv.compile(SEARCH_CODEBASES_SCHEMA.inputSchema);
      const input = {
        query: 'database connection',
        codebaseName: 'my-project',
        language: 'typescript',
        maxResults: 25,
      };
      expect(validate(input)).toBe(true);
    });

    it('should reject empty query', () => {
      const validate = ajv.compile(SEARCH_CODEBASES_SCHEMA.inputSchema);
      expect(validate({ query: '' })).toBe(false);
    });

    it('should reject invalid language', () => {
      const validate = ajv.compile(SEARCH_CODEBASES_SCHEMA.inputSchema);
      const input = {
        query: 'test',
        language: 'ruby', // Not in enum
      };
      expect(validate(input)).toBe(false);
    });

    it('should reject maxResults below minimum', () => {
      const validate = ajv.compile(SEARCH_CODEBASES_SCHEMA.inputSchema);
      const input = {
        query: 'test',
        maxResults: 0,
      };
      expect(validate(input)).toBe(false);
    });

    it('should reject maxResults above maximum', () => {
      const validate = ajv.compile(SEARCH_CODEBASES_SCHEMA.inputSchema);
      const input = {
        query: 'test',
        maxResults: 201,
      };
      expect(validate(input)).toBe(false);
    });

    it('should validate correct output', () => {
      const validate = ajv.compile(SEARCH_CODEBASES_SCHEMA.outputSchema);
      const output = {
        results: [
          {
            filePath: 'src/auth.ts',
            startLine: 10,
            endLine: 25,
            language: 'typescript',
            chunkType: 'function',
            content: 'function authenticate() { ... }',
            similarityScore: 0.95,
            codebaseName: 'my-project',
          },
        ],
        totalResults: 1,
        queryTime: 45,
      };
      expect(validate(output)).toBe(true);
    });

    it('should reject output with invalid similarity score', () => {
      const validate = ajv.compile(SEARCH_CODEBASES_SCHEMA.outputSchema);
      const output = {
        results: [
          {
            filePath: 'src/auth.ts',
            startLine: 10,
            endLine: 25,
            language: 'typescript',
            chunkType: 'function',
            content: 'function authenticate() { ... }',
            similarityScore: 1.5, // Above maximum
            codebaseName: 'my-project',
          },
        ],
        totalResults: 1,
        queryTime: 45,
      };
      expect(validate(output)).toBe(false);
    });

    it('should reject output with invalid line numbers', () => {
      const validate = ajv.compile(SEARCH_CODEBASES_SCHEMA.outputSchema);
      const output = {
        results: [
          {
            filePath: 'src/auth.ts',
            startLine: 0, // Below minimum
            endLine: 25,
            language: 'typescript',
            chunkType: 'function',
            content: 'function authenticate() { ... }',
            similarityScore: 0.95,
            codebaseName: 'my-project',
          },
        ],
        totalResults: 1,
        queryTime: 45,
      };
      expect(validate(output)).toBe(false);
    });
  });

  describe('GET_CODEBASE_STATS_SCHEMA', () => {
    it('should have correct name and description', () => {
      expect(GET_CODEBASE_STATS_SCHEMA.name).toBe('get_codebase_stats');
      expect(GET_CODEBASE_STATS_SCHEMA.description).toBeTruthy();
      expect(GET_CODEBASE_STATS_SCHEMA.description.length).toBeGreaterThan(10);
    });

    it('should require name parameter', () => {
      expect(GET_CODEBASE_STATS_SCHEMA.inputSchema.required).toContain('name');
    });

    it('should validate input with name', () => {
      const validate = ajv.compile(GET_CODEBASE_STATS_SCHEMA.inputSchema);
      expect(validate({ name: 'my-project' })).toBe(true);
    });

    it('should reject empty name', () => {
      const validate = ajv.compile(GET_CODEBASE_STATS_SCHEMA.inputSchema);
      expect(validate({ name: '' })).toBe(false);
    });

    it('should reject input with extra properties', () => {
      const validate = ajv.compile(GET_CODEBASE_STATS_SCHEMA.inputSchema);
      expect(validate({ name: 'test', extra: 'property' })).toBe(false);
    });

    it('should validate correct output', () => {
      const validate = ajv.compile(GET_CODEBASE_STATS_SCHEMA.outputSchema);
      const output = {
        name: 'my-project',
        path: '/path/to/project',
        chunkCount: 100,
        fileCount: 20,
        lastIngestion: '2024-01-01T00:00:00Z',
        languages: [
          {
            language: 'typescript',
            fileCount: 15,
            chunkCount: 75,
          },
          {
            language: 'javascript',
            fileCount: 5,
            chunkCount: 25,
          },
        ],
        chunkTypes: [
          {
            type: 'function',
            count: 50,
          },
          {
            type: 'class',
            count: 30,
          },
          {
            type: 'method',
            count: 20,
          },
        ],
        sizeBytes: 50000,
      };
      expect(validate(output)).toBe(true);
    });

    it('should reject output with missing required fields', () => {
      const validate = ajv.compile(GET_CODEBASE_STATS_SCHEMA.outputSchema);
      const output = {
        name: 'my-project',
        path: '/path/to/project',
        // Missing other required fields
      };
      expect(validate(output)).toBe(false);
    });

    it('should reject output with invalid chunk type', () => {
      const validate = ajv.compile(GET_CODEBASE_STATS_SCHEMA.outputSchema);
      const output = {
        name: 'my-project',
        path: '/path/to/project',
        chunkCount: 100,
        fileCount: 20,
        lastIngestion: '2024-01-01T00:00:00Z',
        languages: [],
        chunkTypes: [
          {
            type: 'invalid-type', // Not in enum
            count: 50,
          },
        ],
        sizeBytes: 50000,
      };
      expect(validate(output)).toBe(false);
    });
  });

  describe('OPEN_CODEBASE_MANAGER_SCHEMA', () => {
    it('should have correct name and description', () => {
      expect(OPEN_CODEBASE_MANAGER_SCHEMA.name).toBe('open_codebase_manager');
      expect(OPEN_CODEBASE_MANAGER_SCHEMA.description).toBeTruthy();
      expect(OPEN_CODEBASE_MANAGER_SCHEMA.description.length).toBeGreaterThan(10);
    });

    it('should have empty input schema', () => {
      expect(OPEN_CODEBASE_MANAGER_SCHEMA.inputSchema.type).toBe('object');
      expect(OPEN_CODEBASE_MANAGER_SCHEMA.inputSchema.properties).toEqual({});
      expect(OPEN_CODEBASE_MANAGER_SCHEMA.inputSchema.additionalProperties).toBe(false);
    });

    it('should validate empty input', () => {
      const validate = ajv.compile(OPEN_CODEBASE_MANAGER_SCHEMA.inputSchema);
      expect(validate({})).toBe(true);
    });

    it('should reject input with extra properties', () => {
      const validate = ajv.compile(OPEN_CODEBASE_MANAGER_SCHEMA.inputSchema);
      expect(validate({ extra: 'property' })).toBe(false);
    });

    it('should validate correct output', () => {
      const validate = ajv.compile(OPEN_CODEBASE_MANAGER_SCHEMA.outputSchema);
      const output = {
        url: 'http://localhost:8008',
        message: 'Manager UI opened in default browser',
      };
      expect(validate(output)).toBe(true);
    });

    it('should reject output with missing required fields', () => {
      const validate = ajv.compile(OPEN_CODEBASE_MANAGER_SCHEMA.outputSchema);
      const output = {
        url: 'http://localhost:8008',
        // Missing message
      };
      expect(validate(output)).toBe(false);
    });
  });

  describe('ALL_TOOL_SCHEMAS', () => {
    it('should export all four tool schemas', () => {
      expect(ALL_TOOL_SCHEMAS).toHaveLength(4);
    });

    it('should have unique tool names', () => {
      const names = ALL_TOOL_SCHEMAS.map((schema) => schema.name);
      const uniqueNames = new Set(names);
      expect(uniqueNames.size).toBe(names.length);
    });

    it('should have all schemas with required properties', () => {
      for (const schema of ALL_TOOL_SCHEMAS) {
        expect(schema.name).toBeTruthy();
        expect(schema.description).toBeTruthy();
        expect(schema.inputSchema).toBeDefined();
        expect(schema.outputSchema).toBeDefined();
        expect(schema.inputSchema.type).toBe('object');
        expect(schema.outputSchema.type).toBe('object');
      }
    });

    it('should have all schemas with descriptions longer than 10 characters', () => {
      for (const schema of ALL_TOOL_SCHEMAS) {
        expect(schema.description.length).toBeGreaterThan(10);
      }
    });

    it('should have all input schemas with additionalProperties set to false', () => {
      for (const schema of ALL_TOOL_SCHEMAS) {
        expect(schema.inputSchema.additionalProperties).toBe(false);
      }
    });

    it('should have all output schemas with additionalProperties set to false', () => {
      for (const schema of ALL_TOOL_SCHEMAS) {
        expect(schema.outputSchema.additionalProperties).toBe(false);
      }
    });
  });

  describe('Schema Validation with AJV', () => {
    it('should compile all input schemas without errors', () => {
      for (const schema of ALL_TOOL_SCHEMAS) {
        expect(() => ajv.compile(schema.inputSchema)).not.toThrow();
      }
    });

    it('should compile all output schemas without errors', () => {
      for (const schema of ALL_TOOL_SCHEMAS) {
        expect(() => ajv.compile(schema.outputSchema)).not.toThrow();
      }
    });
  });

  describe('Parameter Descriptions', () => {
    it('should have descriptions for all input parameters', () => {
      for (const schema of ALL_TOOL_SCHEMAS) {
        const properties = schema.inputSchema.properties;
        for (const [key, value] of Object.entries(properties)) {
          expect(value).toHaveProperty('description');
          expect((value as any).description).toBeTruthy();
          expect((value as any).description.length).toBeGreaterThan(5);
        }
      }
    });

    it('should have descriptions for all output properties', () => {
      for (const schema of ALL_TOOL_SCHEMAS) {
        const properties = schema.outputSchema.properties;
        for (const [key, value] of Object.entries(properties)) {
          expect(value).toHaveProperty('description');
          expect((value as any).description).toBeTruthy();
          expect((value as any).description.length).toBeGreaterThan(5);
        }
      }
    });
  });

  describe('Validation Rules', () => {
    it('should enforce minLength on query parameter', () => {
      const validate = ajv.compile(SEARCH_CODEBASES_SCHEMA.inputSchema);
      expect(validate({ query: '' })).toBe(false);
      expect(validate({ query: 'a' })).toBe(true);
    });

    it('should enforce minLength on name parameter', () => {
      const validate = ajv.compile(GET_CODEBASE_STATS_SCHEMA.inputSchema);
      expect(validate({ name: '' })).toBe(false);
      expect(validate({ name: 'a' })).toBe(true);
    });

    it('should enforce minimum values on numeric fields', () => {
      const validate = ajv.compile(LIST_CODEBASES_SCHEMA.outputSchema);
      const output = {
        codebases: [
          {
            name: 'test',
            path: '/test',
            chunkCount: -1,
            fileCount: 0,
            lastIngestion: '2024-01-01T00:00:00Z',
            languages: [],
          },
        ],
      };
      expect(validate(output)).toBe(false);
    });

    it('should enforce enum values on language parameter', () => {
      const validate = ajv.compile(SEARCH_CODEBASES_SCHEMA.inputSchema);
      expect(validate({ query: 'test', language: 'typescript' })).toBe(true);
      expect(validate({ query: 'test', language: 'ruby' })).toBe(false);
    });

    it('should enforce enum values on chunkType in output', () => {
      const validate = ajv.compile(SEARCH_CODEBASES_SCHEMA.outputSchema);
      const output = {
        results: [
          {
            filePath: 'test.ts',
            startLine: 1,
            endLine: 10,
            language: 'typescript',
            chunkType: 'invalid',
            content: 'test',
            similarityScore: 0.5,
            codebaseName: 'test',
          },
        ],
        totalResults: 1,
        queryTime: 10,
      };
      expect(validate(output)).toBe(false);
    });

    it('should enforce range on similarityScore', () => {
      const validate = ajv.compile(SEARCH_CODEBASES_SCHEMA.outputSchema);
      const createOutput = (score: number) => ({
        results: [
          {
            filePath: 'test.ts',
            startLine: 1,
            endLine: 10,
            language: 'typescript',
            chunkType: 'function',
            content: 'test',
            similarityScore: score,
            codebaseName: 'test',
          },
        ],
        totalResults: 1,
        queryTime: 10,
      });

      expect(validate(createOutput(-0.1))).toBe(false);
      expect(validate(createOutput(0))).toBe(true);
      expect(validate(createOutput(0.5))).toBe(true);
      expect(validate(createOutput(1))).toBe(true);
      expect(validate(createOutput(1.1))).toBe(false);
    });

    it('should enforce range on maxResults', () => {
      const validate = ajv.compile(SEARCH_CODEBASES_SCHEMA.inputSchema);
      expect(validate({ query: 'test', maxResults: 0 })).toBe(false);
      expect(validate({ query: 'test', maxResults: 1 })).toBe(true);
      expect(validate({ query: 'test', maxResults: 50 })).toBe(true);
      expect(validate({ query: 'test', maxResults: 200 })).toBe(true);
      expect(validate({ query: 'test', maxResults: 201 })).toBe(false);
    });
  });
});
