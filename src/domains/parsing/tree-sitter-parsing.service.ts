/**
 * Tree-sitter Parsing Service
 * 
 * Provides AST-based code parsing using Tree-sitter to extract semantic chunks
 * from source files. Supports C#, Java, JavaScript, TypeScript, and Python.
 */

import Parser from 'tree-sitter';
import TreeSitterCSharp from 'tree-sitter-c-sharp';
import TreeSitterJava from 'tree-sitter-java';
import TreeSitterJavaScript from 'tree-sitter-javascript';
import TreeSitterTypeScript from 'tree-sitter-typescript';
import TreeSitterPython from 'tree-sitter-python';
import { readFile } from 'node:fs/promises';
import { Language, Chunk, ChunkType, Config } from '../../shared/types/index.js';
import { createLogger } from '../../shared/logging/logger.js';
import { getTokenCounter } from '../../shared/utils/token-counter.js';

const logger = createLogger('info').child('TreeSitterParsingService');

/**
 * Node type mappings for each language
 * Maps Tree-sitter node types to our ChunkType
 */
const NODE_TYPE_MAPPINGS: Record<Language, Record<string, ChunkType>> = {
  csharp: {
    class_declaration: 'class',
    method_declaration: 'method',
    property_declaration: 'property',
    interface_declaration: 'interface',
  },
  java: {
    class_declaration: 'class',
    method_declaration: 'method',
    field_declaration: 'field',
    interface_declaration: 'interface',
  },
  javascript: {
    function_declaration: 'function',
    arrow_function: 'function',
    class_declaration: 'class',
    method_definition: 'method',
  },
  typescript: {
    function_declaration: 'function',
    arrow_function: 'function',
    class_declaration: 'class',
    method_definition: 'method',
    interface_declaration: 'interface',
  },
  python: {
    function_definition: 'function',
    class_definition: 'class',
  },
};

/**
 * Tree-sitter Parsing Service
 */
export class TreeSitterParsingService {
  private parsers: Map<Language, Parser> = new Map();
  private config: Config;

  constructor(config: Config) {
    this.config = config;
    this.initializeParsers();
  }

  /**
   * Initialize Tree-sitter parsers for all supported languages
   */
  private initializeParsers(): void {
    const languageConfigs: Record<Language, any> = {
      csharp: TreeSitterCSharp,
      java: TreeSitterJava,
      javascript: TreeSitterJavaScript,
      typescript: TreeSitterTypeScript.typescript,
      python: TreeSitterPython,
    };

    for (const [language, grammarModule] of Object.entries(languageConfigs)) {
      try {
        const parser = new Parser();
        parser.setLanguage(grammarModule);
        this.parsers.set(language as Language, parser);
        logger.debug('Initialized Tree-sitter parser', { language });
      } catch (error) {
        logger.error(
          'Failed to initialize Tree-sitter parser',
          error as Error,
          { language }
        );
        throw error;
      }
    }
  }

  /**
   * Parse a file and extract semantic chunks
   * 
   * @param filePath - Path to the file to parse
   * @param language - The language of the file
   * @returns Array of extracted chunks
   */
  async parseFile(filePath: string, language: Language): Promise<Chunk[]> {
    try {
      // Read file content
      const content = await readFile(filePath, 'utf-8');
      
      // Get parser for language
      const parser = this.parsers.get(language);
      if (!parser) {
        throw new Error(`No parser available for language: ${language}`);
      }

      // Parse the file
      const tree = parser.parse(content);
      
      // Extract chunks from AST
      const chunks = this.extractChunks(tree.rootNode, content, filePath, language);
      
      // Apply token-based splitting for large chunks
      const processedChunks = this.splitOversizedChunks(chunks);
      
      logger.debug(
        'Extracted chunks from file',
        { 
          filePath, 
          language, 
          rawChunkCount: chunks.length,
          processedChunkCount: processedChunks.length 
        }
      );

      return processedChunks;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(
        'Failed to parse file',
        error as Error,
        { filePath, language }
      );
      
      // Provide more context in the error message
      throw new Error(
        `Failed to parse ${language} file '${filePath}': ${errorMessage}`
      );
    }
  }

  /**
   * Extract chunks from an AST node
   * 
   * @param node - The AST node to traverse
   * @param sourceCode - The full source code
   * @param filePath - Path to the file
   * @param language - The language of the file
   * @returns Array of extracted chunks
   */
  private extractChunks(
    node: Parser.SyntaxNode,
    sourceCode: string,
    filePath: string,
    language: Language
  ): Chunk[] {
    const chunks: Chunk[] = [];
    const nodeTypeMappings = NODE_TYPE_MAPPINGS[language];

    // Check if this node is a semantic chunk we want to extract
    const chunkType = nodeTypeMappings[node.type];
    
    if (chunkType) {
      // For Python, handle methods specially (function_definition inside class_definition)
      if (language === 'python' && node.type === 'function_definition') {
        // Check if this function is inside a class (making it a method)
        const isMethod = this.isInsideClass(node);
        const actualChunkType = isMethod ? 'method' : 'function';
        
        chunks.push(this.createChunk(node, sourceCode, filePath, language, actualChunkType));
      } else {
        chunks.push(this.createChunk(node, sourceCode, filePath, language, chunkType));
      }
    }

    // Recursively process child nodes to handle nested structures
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child) {
        chunks.push(...this.extractChunks(child, sourceCode, filePath, language));
      }
    }

    return chunks;
  }

  /**
   * Check if a node is inside a class definition (for Python method detection)
   * 
   * @param node - The node to check
   * @returns True if the node is inside a class
   */
  private isInsideClass(node: Parser.SyntaxNode): boolean {
    let current = node.parent;
    while (current) {
      if (current.type === 'class_definition') {
        return true;
      }
      current = current.parent;
    }
    return false;
  }

  /**
   * Create a chunk from an AST node
   * 
   * @param node - The AST node
   * @param sourceCode - The full source code
   * @param filePath - Path to the file
   * @param language - The language of the file
   * @param chunkType - The type of chunk
   * @returns The created chunk
   */
  private createChunk(
    node: Parser.SyntaxNode,
    sourceCode: string,
    filePath: string,
    language: Language,
    chunkType: ChunkType
  ): Chunk {
    // Get the node with surrounding context (comments, docstrings)
    const nodeWithContext = this.getNodeWithContext(node, sourceCode, language);
    
    return {
      content: nodeWithContext.text,
      startLine: nodeWithContext.startLine,
      endLine: nodeWithContext.endLine,
      chunkType,
      language,
      filePath,
    };
  }

  /**
   * Get a node's text with surrounding context (comments, docstrings)
   * 
   * @param node - The AST node
   * @param sourceCode - The full source code
   * @param language - The language of the file
   * @returns Object with text, start line, and end line
   */
  private getNodeWithContext(
    node: Parser.SyntaxNode,
    sourceCode: string,
    language: Language
  ): { text: string; startLine: number; endLine: number } {
    let startByte = node.startIndex;
    const endByte = node.endIndex;
    let startLine = node.startPosition.row + 1; // Convert to 1-based
    const endLine = node.endPosition.row + 1;

    // Look for preceding comments or docstrings
    const precedingContext = this.getPrecedingContext(node, sourceCode, language);
    if (precedingContext) {
      startByte = precedingContext.startIndex;
      startLine = precedingContext.startPosition.row + 1;
    }

    // Extract the text
    const text = sourceCode.substring(startByte, endByte);

    return { text, startLine, endLine };
  }

  /**
   * Get preceding context (comments, docstrings) for a node
   * 
   * @param node - The AST node
   * @param _sourceCode - The full source code (unused but kept for interface consistency)
   * @param language - The language of the file
   * @returns The preceding context node, or null if none
   */
  private getPrecedingContext(
    node: Parser.SyntaxNode,
    _sourceCode: string,
    language: Language
  ): Parser.SyntaxNode | null {
    if (!node.parent) {
      return null;
    }

    // Find the index of this node in its parent's children
    const siblings = [];
    for (let i = 0; i < node.parent.childCount; i++) {
      const child = node.parent.child(i);
      if (child) {
        siblings.push(child);
      }
    }
    
    const nodeIndex = siblings.indexOf(node);
    if (nodeIndex <= 0) {
      return null;
    }

    // Look at the previous sibling
    const previousSibling = siblings[nodeIndex - 1];
    
    // Check if it's a comment or docstring
    if (this.isCommentOrDocstring(previousSibling, language)) {
      return previousSibling;
    }

    return null;
  }

  /**
   * Check if a node is a comment or docstring
   * 
   * @param node - The node to check
   * @param language - The language
   * @returns True if the node is a comment or docstring
   */
  private isCommentOrDocstring(node: Parser.SyntaxNode, language: Language): boolean {
    const commentTypes: Record<Language, string[]> = {
      csharp: ['comment', 'documentation_comment'],
      java: ['comment', 'line_comment', 'block_comment'],
      javascript: ['comment'],
      typescript: ['comment'],
      python: ['comment', 'expression_statement'], // Python docstrings are expression_statements
    };

    const types = commentTypes[language] || [];
    
    // For Python, check if expression_statement contains a string (docstring)
    if (language === 'python' && node.type === 'expression_statement') {
      const firstChild = node.child(0);
      return firstChild?.type === 'string';
    }

    return types.includes(node.type);
  }

  /**
   * Split oversized chunks that exceed token limits
   * Maintains semantic boundaries while respecting model constraints
   * 
   * @param chunks - Array of chunks to process
   * @returns Array of chunks with large chunks split
   */
  private splitOversizedChunks(chunks: Chunk[]): Chunk[] {
    const tokenCounter = getTokenCounter();
    const maxTokens = this.config.ingestion.maxChunkTokens;
    const overlapTokens = this.config.ingestion.chunkOverlapTokens;
    const processedChunks: Chunk[] = [];

    for (const chunk of chunks) {
      const tokenCount = tokenCounter.countTokens(chunk.content);

      // If chunk is within limits, keep as-is
      if (tokenCount <= maxTokens) {
        processedChunks.push(chunk);
        continue;
      }

      // Split large chunk while preserving metadata
      logger.debug(
        'Splitting oversized chunk',
        { 
          filePath: chunk.filePath, 
          chunkType: chunk.chunkType,
          tokens: tokenCount,
          maxTokens 
        }
      );

      const splitTexts = tokenCounter.splitByTokens(
        chunk.content,
        maxTokens,
        overlapTokens
      );

      // Create sub-chunks with adjusted line numbers
      let currentLine = chunk.startLine;

      for (let i = 0; i < splitTexts.length; i++) {
        const splitText = splitTexts[i];
        const splitLines = splitText.split('\n').length;

        processedChunks.push({
          ...chunk,
          content: splitText,
          startLine: currentLine,
          endLine: currentLine + splitLines - 1,
          // Mark as split chunk in the type (e.g., "class_part_1")
          chunkType: splitTexts.length > 1 
            ? `${chunk.chunkType}_part_${i + 1}` as ChunkType
            : chunk.chunkType,
        });

        currentLine += splitLines;
      }
    }

    return processedChunks;
  }
}
