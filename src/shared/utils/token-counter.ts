/**
 * Token counting utility for chunk size management
 * Uses tiktoken for accurate token counting compatible with embedding models
 */

import { encoding_for_model } from 'tiktoken';
import { createLogger } from '../logging/logger.js';

const logger = createLogger('info').child('TokenCounter');

/**
 * Token counter service
 * Provides token counting for text chunks to ensure optimal embedding sizes
 */
export class TokenCounter {
  private encoder: ReturnType<typeof encoding_for_model>;

  constructor() {
    // Use cl100k_base encoding (used by most modern models including embeddings)
    // This is a good approximation for sentence transformers
    this.encoder = encoding_for_model('gpt-3.5-turbo');
    logger.debug('Initialized token counter with cl100k_base encoding');
  }

  /**
   * Count tokens in a text string
   * 
   * @param text - The text to count tokens for
   * @returns Number of tokens
   */
  countTokens(text: string): number {
    try {
      const tokens = this.encoder.encode(text);
      return tokens.length;
    } catch (error) {
      logger.error('Failed to count tokens', error as Error, { textLength: text.length });
      // Fallback: rough approximation (1 token ≈ 4 characters)
      return Math.ceil(text.length / 4);
    }
  }

  /**
   * Split text into chunks respecting token limits
   * Attempts to split on natural boundaries (newlines, sentences)
   * 
   * @param text - The text to split
   * @param maxTokens - Maximum tokens per chunk
   * @param overlapTokens - Number of tokens to overlap between chunks
   * @returns Array of text chunks
   */
  splitByTokens(text: string, maxTokens: number, overlapTokens: number = 0): string[] {
    const totalTokens = this.countTokens(text);
    
    // If text fits in one chunk, return as-is
    if (totalTokens <= maxTokens) {
      return [text];
    }

    const chunks: string[] = [];
    const lines = text.split('\n');
    let currentChunk: string[] = [];
    let currentTokens = 0;
    let overlapBuffer: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineTokens = this.countTokens(line + '\n');

      // If a single line exceeds maxTokens, split it by sentences
      if (lineTokens > maxTokens) {
        // Save current chunk if it has content
        if (currentChunk.length > 0) {
          chunks.push(currentChunk.join('\n'));
          overlapBuffer = this.getOverlapLines(currentChunk, overlapTokens);
          currentChunk = [...overlapBuffer];
          currentTokens = this.countTokens(currentChunk.join('\n'));
        }

        // Split the long line by sentences
        const sentenceChunks = this.splitLongLine(line, maxTokens);
        chunks.push(...sentenceChunks.slice(0, -1));
        
        // Start new chunk with last sentence chunk
        const lastSentenceChunk = sentenceChunks[sentenceChunks.length - 1];
        currentChunk = [lastSentenceChunk];
        currentTokens = this.countTokens(lastSentenceChunk);
        continue;
      }

      // Check if adding this line would exceed the limit
      if (currentTokens + lineTokens > maxTokens && currentChunk.length > 0) {
        // Save current chunk
        chunks.push(currentChunk.join('\n'));
        
        // Start new chunk with overlap
        overlapBuffer = this.getOverlapLines(currentChunk, overlapTokens);
        currentChunk = [...overlapBuffer, line];
        currentTokens = this.countTokens(currentChunk.join('\n'));
      } else {
        // Add line to current chunk
        currentChunk.push(line);
        currentTokens += lineTokens;
      }
    }

    // Add final chunk if it has content
    if (currentChunk.length > 0) {
      chunks.push(currentChunk.join('\n'));
    }

    return chunks;
  }

  /**
   * Split a long line by sentences
   * 
   * @param line - The line to split
   * @param maxTokens - Maximum tokens per chunk
   * @returns Array of sentence chunks
   */
  private splitLongLine(line: string, maxTokens: number): string[] {
    // Split by sentence boundaries
    const sentences = line.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [line];
    
    const chunks: string[] = [];
    let currentChunk = '';
    let currentTokens = 0;

    for (const sentence of sentences) {
      const sentenceTokens = this.countTokens(sentence);

      // If a single sentence exceeds maxTokens, split by words
      if (sentenceTokens > maxTokens) {
        if (currentChunk) {
          chunks.push(currentChunk.trim());
          currentChunk = '';
          currentTokens = 0;
        }
        chunks.push(...this.splitByWords(sentence, maxTokens));
        continue;
      }

      if (currentTokens + sentenceTokens > maxTokens && currentChunk) {
        chunks.push(currentChunk.trim());
        currentChunk = sentence;
        currentTokens = sentenceTokens;
      } else {
        currentChunk += sentence;
        currentTokens += sentenceTokens;
      }
    }

    if (currentChunk) {
      chunks.push(currentChunk.trim());
    }

    return chunks;
  }

  /**
   * Split text by words as a last resort
   * 
   * @param text - The text to split
   * @param maxTokens - Maximum tokens per chunk
   * @returns Array of word chunks
   */
  private splitByWords(text: string, maxTokens: number): string[] {
    const words = text.split(/\s+/);
    const chunks: string[] = [];
    let currentChunk: string[] = [];
    let currentTokens = 0;

    for (const word of words) {
      const wordTokens = this.countTokens(word + ' ');
      
      if (currentTokens + wordTokens > maxTokens && currentChunk.length > 0) {
        chunks.push(currentChunk.join(' '));
        currentChunk = [word];
        currentTokens = wordTokens;
      } else {
        currentChunk.push(word);
        currentTokens += wordTokens;
      }
    }

    if (currentChunk.length > 0) {
      chunks.push(currentChunk.join(' '));
    }

    return chunks;
  }

  /**
   * Get overlap lines from the end of a chunk
   * 
   * @param lines - Array of lines
   * @param overlapTokens - Target number of overlap tokens
   * @returns Array of overlap lines
   */
  private getOverlapLines(lines: string[], overlapTokens: number): string[] {
    if (overlapTokens === 0 || lines.length === 0) {
      return [];
    }

    const overlapLines: string[] = [];
    let tokens = 0;

    // Take lines from the end until we reach the overlap token count
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i];
      const lineTokens = this.countTokens(line + '\n');
      
      if (tokens + lineTokens > overlapTokens && overlapLines.length > 0) {
        break;
      }
      
      overlapLines.unshift(line);
      tokens += lineTokens;
    }

    return overlapLines;
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    this.encoder.free();
  }
}

// Singleton instance
let tokenCounterInstance: TokenCounter | null = null;

/**
 * Get the singleton token counter instance
 */
export function getTokenCounter(): TokenCounter {
  if (!tokenCounterInstance) {
    tokenCounterInstance = new TokenCounter();
  }
  return tokenCounterInstance;
}

/**
 * Dispose the singleton token counter instance
 */
export function disposeTokenCounter(): void {
  if (tokenCounterInstance) {
    tokenCounterInstance.dispose();
    tokenCounterInstance = null;
  }
}
