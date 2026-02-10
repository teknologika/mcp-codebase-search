/**
 * Language Detection Service
 * 
 * Provides language detection from file extensions and maps to Tree-sitter grammar names.
 * Supports: C#, Java, JavaScript, TypeScript, Python
 */

import { Language } from '../../shared/types/index.js';
import path from 'node:path';

/**
 * Mapping of file extensions to supported languages
 */
export const LANGUAGE_SUPPORT: Record<string, Language> = {
  '.cs': 'csharp',
  '.java': 'java',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.py': 'python',
};

/**
 * Mapping of languages to Tree-sitter grammar package names
 */
export const TREE_SITTER_GRAMMARS: Record<Language, string> = {
  csharp: 'tree-sitter-c-sharp',
  java: 'tree-sitter-java',
  javascript: 'tree-sitter-javascript',
  typescript: 'tree-sitter-typescript',
  python: 'tree-sitter-python',
};

/**
 * Language Detection Service
 */
export class LanguageDetectionService {
  /**
   * Detect the language of a file based on its extension
   * 
   * @param filePath - Path to the file
   * @returns The detected language, or null if unsupported
   */
  detectLanguage(filePath: string): Language | null {
    const ext = path.extname(filePath).toLowerCase();
    return LANGUAGE_SUPPORT[ext] || null;
  }

  /**
   * Check if a file extension is supported
   * 
   * @param filePath - Path to the file
   * @returns True if the file extension is supported
   */
  isSupported(filePath: string): boolean {
    return this.detectLanguage(filePath) !== null;
  }

  /**
   * Get the Tree-sitter grammar name for a language
   * 
   * @param language - The language
   * @returns The Tree-sitter grammar package name
   */
  getGrammarName(language: Language): string {
    return TREE_SITTER_GRAMMARS[language];
  }

  /**
   * Get all supported file extensions
   * 
   * @returns Array of supported file extensions (e.g., ['.cs', '.java', ...])
   */
  getSupportedExtensions(): string[] {
    return Object.keys(LANGUAGE_SUPPORT);
  }

  /**
   * Get all supported languages
   * 
   * @returns Array of supported languages
   */
  getSupportedLanguages(): Language[] {
    return Object.values(LANGUAGE_SUPPORT).filter(
      (value, index, self) => self.indexOf(value) === index
    );
  }

  /**
   * Classify a file as supported or unsupported
   * 
   * @param filePath - Path to the file
   * @returns Object with classification result
   */
  classifyFile(filePath: string): {
    supported: boolean;
    language: Language | null;
    extension: string;
  } {
    const extension = path.extname(filePath).toLowerCase();
    const language = this.detectLanguage(filePath);

    return {
      supported: language !== null,
      language,
      extension,
    };
  }
}
