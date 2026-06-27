/**
 * Language Detection Service
 * 
 * Provides language detection from file extensions and maps to Tree-sitter grammar names.
 * Supports: C#, Go, Java, JavaScript, TypeScript, Python, Swift, Zig, JSON, Markdown, YAML, Apple/Xcode project files, XAML, Dockerfile, and plain text
 */

import { Language } from '../../shared/types/index.js';
import path from 'node:path';

/**
 * Mapping of file extensions to supported languages
 */
export const LANGUAGE_SUPPORT: Record<string, Language> = {
  // Programming languages (AST-parsed)
  '.cs': 'csharp',
  '.java': 'java',
  '.go': 'go',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.py': 'python',
  '.swift': 'swift',
  '.zig': 'zig',
  
  // Web framework files (plain text for now)
  '.svelte': 'svelte',
  '.vue': 'vue',
  '.html': 'html',
  '.htm': 'html',
  '.xaml': 'plaintext',
  '.axaml': 'plaintext',
  '.pbxproj': 'plaintext',
  '.xcworkspacedata': 'plaintext',
  '.xcscheme': 'plaintext',
  '.xcconfig': 'plaintext',
  '.plist': 'plaintext',
  '.entitlements': 'plaintext',
  '.storyboard': 'plaintext',
  '.xib': 'plaintext',
  
  // Styling files (plain text)
  '.css': 'css',
  '.scss': 'scss',
  '.sass': 'scss',
  '.less': 'css',
  
  // Configuration and data files (plain text)
  '.json': 'json',
  '.jsonc': 'json',
  
  // Documentation files (plain text)
  '.md': 'markdown',
  '.markdown': 'markdown',
  
  // YAML files (plain text)
  '.yml': 'yaml',
  '.yaml': 'yaml',
  
  // Plain text files
  '.txt': 'plaintext',
  '.text': 'plaintext',
  '.log': 'plaintext',
  '.env': 'plaintext',
  '.env.example': 'plaintext',
  '.env.local': 'plaintext',
  '.env.development': 'plaintext',
  '.env.production': 'plaintext',
  '.gitignore': 'plaintext',
  '.dockerignore': 'plaintext',
  '.editorconfig': 'plaintext',
  '.prettierrc': 'plaintext',
  '.eslintrc': 'plaintext',
};

/**
 * Special filename patterns that should be treated as specific languages
 * Checked before extension-based detection
 */
export const FILENAME_PATTERNS: Array<{ pattern: RegExp; language: Language }> = [
  { pattern: /^Dockerfile$/i, language: 'dockerfile' },
  { pattern: /^Dockerfile\./i, language: 'dockerfile' }, // Dockerfile.dev, etc.
  { pattern: /^\.env(\.|$)/i, language: 'plaintext' }, // .env, .env.local, etc.
  { pattern: /^package\.json$/i, language: 'json' },
  { pattern: /^Package\.swift$/i, language: 'swift' },
  { pattern: /^tsconfig.*\.json$/i, language: 'json' },
  { pattern: /^\.eslintrc\.json$/i, language: 'json' },
  { pattern: /^README/i, language: 'markdown' },
  { pattern: /^CHANGELOG/i, language: 'markdown' },
  { pattern: /^CONTRIBUTING/i, language: 'markdown' },
  { pattern: /^LICENSE/i, language: 'plaintext' },
];

/**
 * Mapping of languages to Tree-sitter grammar package names
 * Only for languages that support AST parsing
 */
export const TREE_SITTER_GRAMMARS: Partial<Record<Language, string>> = {
  csharp: 'tree-sitter-c-sharp',
  java: 'tree-sitter-java',
  go: 'tree-sitter-go',
  javascript: 'tree-sitter-javascript',
  typescript: 'tree-sitter-typescript',
  python: 'tree-sitter-python',
  swift: '@sengac/tree-sitter-swift',
  zig: '@tree-sitter-grammars/tree-sitter-zig',
  // Non-code languages don't have Tree-sitter grammars
};

/**
 * Language Detection Service
 */
export class LanguageDetectionService {
  /**
   * Detect the language of a file based on its filename and extension
   * 
   * @param filePath - Path to the file
   * @returns The detected language, or null if unsupported
   */
  detectLanguage(filePath: string): Language | null {
    const basename = path.basename(filePath);
    
    // Check filename patterns first (e.g., Dockerfile, package.json)
    for (const { pattern, language } of FILENAME_PATTERNS) {
      if (pattern.test(basename)) {
        return language;
      }
    }
    
    // Fall back to extension-based detection
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
   * @returns The Tree-sitter grammar package name, or null if not applicable
   */
  getGrammarName(language: Language): string | null {
    return TREE_SITTER_GRAMMARS[language] || null;
  }
  
  /**
   * Check if a language requires AST parsing with Tree-sitter
   * 
   * @param language - The language
   * @returns True if the language should be parsed with Tree-sitter
   */
  requiresAstParsing(language: Language): boolean {
    return TREE_SITTER_GRAMMARS[language] !== undefined;
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
