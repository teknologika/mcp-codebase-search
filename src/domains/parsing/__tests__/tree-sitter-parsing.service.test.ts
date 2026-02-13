/**
 * Unit tests for Tree-sitter Parsing Service
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { TreeSitterParsingService } from '../tree-sitter-parsing.service.js';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DEFAULT_CONFIG } from '../../../shared/config/config.js';

describe('TreeSitterParsingService', () => {
  let service: TreeSitterParsingService;
  let testDir: string;

  beforeEach(async () => {
    service = new TreeSitterParsingService(DEFAULT_CONFIG);
    testDir = join(tmpdir(), `tree-sitter-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
  });

  describe('JavaScript parsing', () => {
    it('should extract a simple function', async () => {
      const filePath = join(testDir, 'test.js');
      const code = `function greet(name) {
  return 'Hello, ' + name;
}`;
      await writeFile(filePath, code);

      const chunks = await service.parseFile(filePath, 'javascript');

      expect(chunks).toHaveLength(1);
      expect(chunks[0].chunkType).toBe('function');
      expect(chunks[0].content).toContain('function greet');
      expect(chunks[0].startLine).toBe(1);
      expect(chunks[0].language).toBe('javascript');
    });

    it('should extract a class with methods', async () => {
      const filePath = join(testDir, 'test.js');
      const code = `class Calculator {
  add(a, b) {
    return a + b;
  }

  subtract(a, b) {
    return a - b;
  }
}`;
      await writeFile(filePath, code);

      const chunks = await service.parseFile(filePath, 'javascript');

      expect(chunks.length).toBeGreaterThanOrEqual(3); // class + 2 methods
      
      const classChunk = chunks.find(c => c.chunkType === 'class');
      expect(classChunk).toBeDefined();
      expect(classChunk?.content).toContain('class Calculator');

      const methodChunks = chunks.filter(c => c.chunkType === 'method');
      expect(methodChunks.length).toBe(2);
    });

    it('should extract arrow functions', async () => {
      const filePath = join(testDir, 'test.js');
      const code = `const multiply = (a, b) => {
  return a * b;
};`;
      await writeFile(filePath, code);

      const chunks = await service.parseFile(filePath, 'javascript');

      expect(chunks.length).toBeGreaterThanOrEqual(1);
      const arrowFunc = chunks.find(c => c.chunkType === 'function');
      expect(arrowFunc).toBeDefined();
    });

    it('should include preceding comments', async () => {
      const filePath = join(testDir, 'test.js');
      const code = `// This is a greeting function
function greet(name) {
  return 'Hello, ' + name;
}`;
      await writeFile(filePath, code);

      const chunks = await service.parseFile(filePath, 'javascript');

      expect(chunks).toHaveLength(1);
      expect(chunks[0].content).toContain('// This is a greeting function');
      expect(chunks[0].startLine).toBe(1); // Should start at comment line
    });
  });

  describe('TypeScript parsing', () => {
    it('should extract functions and interfaces', async () => {
      const filePath = join(testDir, 'test.ts');
      const code = `interface User {
  name: string;
  age: number;
}

function createUser(name: string, age: number): User {
  return { name, age };
}`;
      await writeFile(filePath, code);

      const chunks = await service.parseFile(filePath, 'typescript');

      expect(chunks.length).toBeGreaterThanOrEqual(2);
      
      const interfaceChunk = chunks.find(c => c.chunkType === 'interface');
      expect(interfaceChunk).toBeDefined();
      expect(interfaceChunk?.content).toContain('interface User');

      const functionChunk = chunks.find(c => c.chunkType === 'function');
      expect(functionChunk).toBeDefined();
      expect(functionChunk?.content).toContain('function createUser');
    });

    it('should extract class with methods', async () => {
      const filePath = join(testDir, 'test.ts');
      const code = `class Service {
  private data: string[];

  constructor() {
    this.data = [];
  }

  add(item: string): void {
    this.data.push(item);
  }
}`;
      await writeFile(filePath, code);

      const chunks = await service.parseFile(filePath, 'typescript');

      const classChunk = chunks.find(c => c.chunkType === 'class');
      expect(classChunk).toBeDefined();

      const methodChunks = chunks.filter(c => c.chunkType === 'method');
      expect(methodChunks.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Python parsing', () => {
    it('should extract a simple function', async () => {
      const filePath = join(testDir, 'test.py');
      const code = `def greet(name):
    return f"Hello, {name}"`;
      await writeFile(filePath, code);

      const chunks = await service.parseFile(filePath, 'python');

      expect(chunks).toHaveLength(1);
      expect(chunks[0].chunkType).toBe('function');
      expect(chunks[0].content).toContain('def greet');
      expect(chunks[0].language).toBe('python');
    });

    it('should extract class with methods', async () => {
      const filePath = join(testDir, 'test.py');
      const code = `class Calculator:
    def add(self, a, b):
        return a + b

    def subtract(self, a, b):
        return a - b`;
      await writeFile(filePath, code);

      const chunks = await service.parseFile(filePath, 'python');

      expect(chunks.length).toBeGreaterThanOrEqual(3); // class + 2 methods
      
      const classChunk = chunks.find(c => c.chunkType === 'class');
      expect(classChunk).toBeDefined();

      const methodChunks = chunks.filter(c => c.chunkType === 'method');
      expect(methodChunks.length).toBe(2);
    });

    it('should include docstrings', async () => {
      const filePath = join(testDir, 'test.py');
      const code = `def greet(name):
    """
    Greet a person by name.
    
    Args:
        name: The person's name
    
    Returns:
        A greeting string
    """
    return f"Hello, {name}"`;
      await writeFile(filePath, code);

      const chunks = await service.parseFile(filePath, 'python');

      expect(chunks).toHaveLength(1);
      // Note: Docstrings in Python are inside the function, not preceding it
      expect(chunks[0].content).toContain('def greet');
    });
  });

  describe('Java parsing', () => {
    it('should extract class with methods', async () => {
      const filePath = join(testDir, 'Test.java');
      const code = `public class Calculator {
    public int add(int a, int b) {
        return a + b;
    }

    public int subtract(int a, int b) {
        return a - b;
    }
}`;
      await writeFile(filePath, code);

      const chunks = await service.parseFile(filePath, 'java');

      expect(chunks.length).toBeGreaterThanOrEqual(3);
      
      const classChunk = chunks.find(c => c.chunkType === 'class');
      expect(classChunk).toBeDefined();

      const methodChunks = chunks.filter(c => c.chunkType === 'method');
      expect(methodChunks.length).toBe(2);
    });

    it('should extract interface', async () => {
      const filePath = join(testDir, 'Test.java');
      const code = `public interface Calculable {
    int add(int a, int b);
    int subtract(int a, int b);
}`;
      await writeFile(filePath, code);

      const chunks = await service.parseFile(filePath, 'java');

      const interfaceChunk = chunks.find(c => c.chunkType === 'interface');
      expect(interfaceChunk).toBeDefined();
      expect(interfaceChunk?.content).toContain('interface Calculable');
    });

    it('should extract field declarations', async () => {
      const filePath = join(testDir, 'Test.java');
      const code = `public class Config {
    private static final String VERSION = "1.0.0";
    private int maxRetries = 3;
}`;
      await writeFile(filePath, code);

      const chunks = await service.parseFile(filePath, 'java');

      const fieldChunks = chunks.filter(c => c.chunkType === 'field');
      expect(fieldChunks.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('C# parsing', () => {
    it('should extract class with methods', async () => {
      const filePath = join(testDir, 'Test.cs');
      const code = `public class Calculator
{
    public int Add(int a, int b)
    {
        return a + b;
    }

    public int Subtract(int a, int b)
    {
        return a - b;
    }
}`;
      await writeFile(filePath, code);

      const chunks = await service.parseFile(filePath, 'csharp');

      expect(chunks.length).toBeGreaterThanOrEqual(3);
      
      const classChunk = chunks.find(c => c.chunkType === 'class');
      expect(classChunk).toBeDefined();

      const methodChunks = chunks.filter(c => c.chunkType === 'method');
      expect(methodChunks.length).toBe(2);
    });

    it('should extract properties', async () => {
      const filePath = join(testDir, 'Test.cs');
      const code = `public class Person
{
    public string Name { get; set; }
    public int Age { get; set; }
}`;
      await writeFile(filePath, code);

      const chunks = await service.parseFile(filePath, 'csharp');

      const propertyChunks = chunks.filter(c => c.chunkType === 'property');
      expect(propertyChunks.length).toBeGreaterThanOrEqual(1);
    });

    it('should extract interfaces', async () => {
      const filePath = join(testDir, 'Test.cs');
      const code = `public interface ICalculator
{
    int Add(int a, int b);
    int Subtract(int a, int b);
}`;
      await writeFile(filePath, code);

      const chunks = await service.parseFile(filePath, 'csharp');

      const interfaceChunk = chunks.find(c => c.chunkType === 'interface');
      expect(interfaceChunk).toBeDefined();
      expect(interfaceChunk?.content).toContain('interface ICalculator');
    });
  });

  describe('Edge cases', () => {
    it('should handle empty files', async () => {
      const filePath = join(testDir, 'empty.js');
      await writeFile(filePath, '');

      const chunks = await service.parseFile(filePath, 'javascript');

      expect(chunks).toHaveLength(0);
    });

    it('should handle files with only comments', async () => {
      const filePath = join(testDir, 'comments.js');
      const code = `// This is a comment
// Another comment
/* Block comment */`;
      await writeFile(filePath, code);

      const chunks = await service.parseFile(filePath, 'javascript');

      expect(chunks).toHaveLength(0);
    });

    it('should handle deeply nested structures', async () => {
      const filePath = join(testDir, 'nested.js');
      const code = `class Outer {
  method1() {
    class Inner {
      method2() {
        return 42;
      }
    }
  }
}`;
      await writeFile(filePath, code);

      const chunks = await service.parseFile(filePath, 'javascript');

      // Should extract both outer and inner classes and their methods
      expect(chunks.length).toBeGreaterThanOrEqual(2);
      
      const classChunks = chunks.filter(c => c.chunkType === 'class');
      expect(classChunks.length).toBeGreaterThanOrEqual(2); // Outer and Inner
    });

    it('should handle malformed code gracefully', async () => {
      const filePath = join(testDir, 'malformed.js');
      const code = `function broken( {
  // Missing closing brace and parameter
  return "oops"`;
      await writeFile(filePath, code);

      // Should not throw, but may return empty or partial results
      const chunks = await service.parseFile(filePath, 'javascript');
      expect(Array.isArray(chunks)).toBe(true);
    });
  });

  describe('Line number tracking', () => {
    it('should track correct line numbers', async () => {
      const filePath = join(testDir, 'lines.js');
      const code = `// Line 1
// Line 2
function first() {
  return 1;
}

function second() {
  return 2;
}`;
      await writeFile(filePath, code);

      const chunks = await service.parseFile(filePath, 'javascript');

      expect(chunks.length).toBe(2);
      
      const firstFunc = chunks[0];
      // Should include preceding comment
      expect(firstFunc.startLine).toBe(2);
      expect(firstFunc.endLine).toBe(5);

      const secondFunc = chunks[1];
      expect(secondFunc.startLine).toBe(7);
      expect(secondFunc.endLine).toBe(9);
    });

    it('should include comment lines in start line', async () => {
      const filePath = join(testDir, 'comment-lines.js');
      const code = `// Line 1
// Line 2: Comment for function
function test() {
  return true;
}`;
      await writeFile(filePath, code);

      const chunks = await service.parseFile(filePath, 'javascript');

      expect(chunks).toHaveLength(1);
      // Should start at the comment line
      expect(chunks[0].startLine).toBe(2);
    });
  });

  describe('Chunk splitting for large functions', () => {
    it('should split oversized functions into multiple chunks', async () => {
      const filePath = join(testDir, 'large.js');
      // Create a very large function that exceeds token limits
      const largeFunction = `function processData(data) {
  // This is a very large function with lots of code
  ${Array(100).fill('  console.log("Processing step");').join('\n')}
  ${Array(100).fill('  const result = data.map(x => x * 2);').join('\n')}
  ${Array(100).fill('  if (result.length > 0) { return result; }').join('\n')}
  return [];
}`;
      await writeFile(filePath, largeFunction);

      const chunks = await service.parseFile(filePath, 'javascript');

      // Should split the large function into multiple parts
      expect(chunks.length).toBeGreaterThan(1);
      
      // Each chunk should be within token limits (512 tokens)
      const tokenCounter = (await import('../../../shared/utils/token-counter.js')).getTokenCounter();
      for (const chunk of chunks) {
        const tokens = tokenCounter.countTokens(chunk.content);
        expect(tokens).toBeLessThanOrEqual(512);
      }
    });

    it('should keep small functions as single chunks', async () => {
      const filePath = join(testDir, 'small.js');
      const smallFunction = `function add(a, b) {
  return a + b;
}`;
      await writeFile(filePath, smallFunction);

      const chunks = await service.parseFile(filePath, 'javascript');

      // Should not split small functions
      expect(chunks).toHaveLength(1);
      expect(chunks[0].chunkType).toBe('function');
    });

    it('should maintain metadata when splitting chunks', async () => {
      const filePath = join(testDir, 'metadata.ts');
      const largeClass = `class DataProcessor {
  process() {
    ${Array(200).fill('    console.log("step");').join('\n')}
  }
}`;
      await writeFile(filePath, largeClass);

      const chunks = await service.parseFile(filePath, 'typescript');

      // All chunks should maintain language and file path
      for (const chunk of chunks) {
        expect(chunk.language).toBe('typescript');
        expect(chunk.filePath).toBe(filePath);
        expect(chunk.startLine).toBeGreaterThan(0);
        expect(chunk.endLine).toBeGreaterThanOrEqual(chunk.startLine);
      }
    });
  });

  // Cleanup
  afterEach(async () => {
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });
});
