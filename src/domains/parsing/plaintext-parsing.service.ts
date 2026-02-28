/**
 * Plain Text Parsing Service
 * 
 * Provides simple text-based parsing for non-code files like JSON, Markdown,
 * YAML, Dockerfiles, and configuration files. These files are treated as
 * single file-level chunks without AST parsing.
 */

import { readFile } from 'node:fs/promises';
import { Language, Chunk, Config } from '../../shared/types/index.js';
import { createLogger } from '../../shared/logging/logger.js';
import { getTokenCounter } from '../../shared/utils/token-counter.js';

const logger = createLogger('info').child('PlainTextParsingService');

/**
 * Plain Text Parsing Service
 */
export class PlainTextParsingService {
  private config: Config;

  constructor(config: Config) {
    this.config = config;
  }

  /**
   * Parse a plain text file and create chunks
   * 
   * For non-code files, we create a single file-level chunk containing
   * the entire file content. If the file is too large, it will be split
   * into multiple chunks with overlap.
   * 
   * @param filePath - Path to the file to parse
   * @param language - The language/type of the file
   * @returns Array of chunks (usually just one, unless file is very large)
   */
  async parseFile(filePath: string, language: Language): Promise<Chunk[]> {
    try {
      // Read file content
      const content = await readFile(filePath, 'utf-8');
      
      // Create base chunk
      const baseChunk: Chunk = {
        content,
        startLine: 1,
        endLine: content.split('\n').length,
        chunkType: 'file',
        language,
        filePath,
      };

      // Check if we need to split due to token limits
      const tokenCounter = getTokenCounter();
      const tokenCount = tokenCounter.countTokens(content);
      const maxTokens = this.config.ingestion.maxChunkTokens;

      if (tokenCount <= maxTokens) {
        // File fits in one chunk
        logger.debug(
          'Created single chunk for plain text file',
          { filePath, language, tokens: tokenCount }
        );
        return [baseChunk];
      }

      // File is too large, split it
      logger.debug(
        'Splitting large plain text file',
        { 
          filePath, 
          language, 
          tokens: tokenCount,
          maxTokens 
        }
      );

      const overlapTokens = this.config.ingestion.chunkOverlapTokens;
      const splitTexts = tokenCounter.splitByTokens(
        content,
        maxTokens,
        overlapTokens
      );

      // Create chunks with line number tracking
      const chunks: Chunk[] = [];
      let currentLine = 1;

      for (let i = 0; i < splitTexts.length; i++) {
        const splitText = splitTexts[i];
        const splitLines = splitText.split('\n').length;

        chunks.push({
          ...baseChunk,
          content: splitText,
          startLine: currentLine,
          endLine: currentLine + splitLines - 1,
        });

        currentLine += splitLines;
      }

      logger.debug(
        'Split plain text file into chunks',
        { 
          filePath, 
          language, 
          originalTokens: tokenCount,
          chunkCount: chunks.length 
        }
      );

      return chunks;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(
        'Failed to parse plain text file',
        error as Error,
        { filePath, language }
      );
      
      throw new Error(
        `Failed to parse ${language} file '${filePath}': ${errorMessage}`
      );
    }
  }
}
