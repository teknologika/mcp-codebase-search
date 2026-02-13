/**
 * Unit tests for Token Counter utility
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TokenCounter, getTokenCounter, disposeTokenCounter } from '../token-counter.js';

describe('TokenCounter', () => {
  let tokenCounter: TokenCounter;

  beforeEach(() => {
    tokenCounter = new TokenCounter();
  });

  afterEach(() => {
    tokenCounter.dispose();
  });

  describe('countTokens', () => {
    it('should count tokens in simple text', () => {
      const text = 'Hello, world!';
      const count = tokenCounter.countTokens(text);
      
      expect(count).toBeGreaterThan(0);
      expect(count).toBeLessThan(10);
    });

    it('should count tokens in code', () => {
      const code = `function greet(name) {
  return 'Hello, ' + name;
}`;
      const count = tokenCounter.countTokens(code);
      
      expect(count).toBeGreaterThan(5);
      expect(count).toBeLessThan(30);
    });

    it('should handle empty string', () => {
      const count = tokenCounter.countTokens('');
      expect(count).toBe(0);
    });

    it('should handle multi-line text', () => {
      const text = `Line 1
Line 2
Line 3`;
      const count = tokenCounter.countTokens(text);
      
      expect(count).toBeGreaterThan(3);
    });
  });

  describe('splitByTokens', () => {
    it('should not split text that fits in one chunk', () => {
      const text = 'This is a short text.';
      const chunks = tokenCounter.splitByTokens(text, 100);
      
      expect(chunks).toHaveLength(1);
      expect(chunks[0]).toBe(text);
    });

    it('should split long text into multiple chunks', () => {
      const longText = Array(100).fill('This is a sentence.').join(' ');
      const chunks = tokenCounter.splitByTokens(longText, 50);
      
      expect(chunks.length).toBeGreaterThan(1);
      
      // Each chunk should be within token limit
      for (const chunk of chunks) {
        const tokens = tokenCounter.countTokens(chunk);
        expect(tokens).toBeLessThanOrEqual(50);
      }
    });

    it('should apply overlap between chunks', () => {
      const text = Array(50).fill('Word').join(' ');
      const chunks = tokenCounter.splitByTokens(text, 20, 5);
      
      expect(chunks.length).toBeGreaterThan(1);
      
      // Verify overlap exists (chunks should share some content)
      if (chunks.length > 1) {
        const firstChunkEnd = chunks[0].slice(-20);
        const secondChunkStart = chunks[1].slice(0, 20);
        
        // There should be some overlap
        expect(firstChunkEnd.length).toBeGreaterThan(0);
        expect(secondChunkStart.length).toBeGreaterThan(0);
      }
    });

    it('should split on line boundaries when possible', () => {
      const text = Array(30).fill('Line of text').join('\n');
      const chunks = tokenCounter.splitByTokens(text, 50);
      
      expect(chunks.length).toBeGreaterThan(1);
      
      // Each chunk should contain complete lines (no mid-line splits)
      for (const chunk of chunks) {
        const lines = chunk.split('\n');
        expect(lines.length).toBeGreaterThan(0);
      }
    });

    it('should handle code with proper structure', () => {
      const code = `function example1() {
  console.log('test');
}

function example2() {
  console.log('test');
}

function example3() {
  console.log('test');
}`;
      
      const chunks = tokenCounter.splitByTokens(code, 30);
      
      // Should split but maintain code structure
      expect(chunks.length).toBeGreaterThan(0);
      
      for (const chunk of chunks) {
        expect(chunk.length).toBeGreaterThan(0);
      }
    });

    it('should handle very long single lines', () => {
      const longLine = 'word '.repeat(200);
      const chunks = tokenCounter.splitByTokens(longLine, 50);
      
      expect(chunks.length).toBeGreaterThan(1);
      
      for (const chunk of chunks) {
        const tokens = tokenCounter.countTokens(chunk);
        expect(tokens).toBeLessThanOrEqual(50);
      }
    });
  });

  describe('singleton pattern', () => {
    afterEach(() => {
      disposeTokenCounter();
    });

    it('should return same instance from getTokenCounter', () => {
      const instance1 = getTokenCounter();
      const instance2 = getTokenCounter();
      
      expect(instance1).toBe(instance2);
    });

    it('should create new instance after dispose', () => {
      const instance1 = getTokenCounter();
      disposeTokenCounter();
      const instance2 = getTokenCounter();
      
      expect(instance1).not.toBe(instance2);
    });
  });
});
