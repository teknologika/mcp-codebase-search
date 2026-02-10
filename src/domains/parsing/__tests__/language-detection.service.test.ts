/**
 * Unit tests for Language Detection Service
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { LanguageDetectionService, LANGUAGE_SUPPORT, TREE_SITTER_GRAMMARS } from '../language-detection.service.js';
import type { Language } from '../../../shared/types/index.js';

describe('LanguageDetectionService', () => {
  let service: LanguageDetectionService;

  beforeEach(() => {
    service = new LanguageDetectionService();
  });

  describe('detectLanguage', () => {
    it('should detect C# from .cs extension', () => {
      expect(service.detectLanguage('Program.cs')).toBe('csharp');
      expect(service.detectLanguage('/path/to/MyClass.cs')).toBe('csharp');
    });

    it('should detect Java from .java extension', () => {
      expect(service.detectLanguage('Main.java')).toBe('java');
      expect(service.detectLanguage('/src/com/example/App.java')).toBe('java');
    });

    it('should detect JavaScript from .js extension', () => {
      expect(service.detectLanguage('index.js')).toBe('javascript');
      expect(service.detectLanguage('/src/utils/helper.js')).toBe('javascript');
    });

    it('should detect JavaScript from .jsx extension', () => {
      expect(service.detectLanguage('Component.jsx')).toBe('javascript');
      expect(service.detectLanguage('/src/components/Button.jsx')).toBe('javascript');
    });

    it('should detect TypeScript from .ts extension', () => {
      expect(service.detectLanguage('app.ts')).toBe('typescript');
      expect(service.detectLanguage('/src/services/api.ts')).toBe('typescript');
    });

    it('should detect TypeScript from .tsx extension', () => {
      expect(service.detectLanguage('App.tsx')).toBe('typescript');
      expect(service.detectLanguage('/src/components/Layout.tsx')).toBe('typescript');
    });

    it('should detect Python from .py extension', () => {
      expect(service.detectLanguage('main.py')).toBe('python');
      expect(service.detectLanguage('/src/utils/helpers.py')).toBe('python');
    });

    it('should return null for unsupported extensions', () => {
      expect(service.detectLanguage('README.md')).toBeNull();
      expect(service.detectLanguage('config.json')).toBeNull();
      expect(service.detectLanguage('styles.css')).toBeNull();
      expect(service.detectLanguage('data.xml')).toBeNull();
    });

    it('should return null for files without extensions', () => {
      expect(service.detectLanguage('Makefile')).toBeNull();
      expect(service.detectLanguage('Dockerfile')).toBeNull();
    });

    it('should handle case-insensitive extensions', () => {
      expect(service.detectLanguage('Program.CS')).toBe('csharp');
      expect(service.detectLanguage('Main.JAVA')).toBe('java');
      expect(service.detectLanguage('App.TS')).toBe('typescript');
    });

    it('should handle paths with multiple dots', () => {
      expect(service.detectLanguage('file.test.ts')).toBe('typescript');
      expect(service.detectLanguage('component.spec.js')).toBe('javascript');
    });
  });

  describe('isSupported', () => {
    it('should return true for supported extensions', () => {
      expect(service.isSupported('file.cs')).toBe(true);
      expect(service.isSupported('file.java')).toBe(true);
      expect(service.isSupported('file.js')).toBe(true);
      expect(service.isSupported('file.jsx')).toBe(true);
      expect(service.isSupported('file.ts')).toBe(true);
      expect(service.isSupported('file.tsx')).toBe(true);
      expect(service.isSupported('file.py')).toBe(true);
    });

    it('should return false for unsupported extensions', () => {
      expect(service.isSupported('file.md')).toBe(false);
      expect(service.isSupported('file.json')).toBe(false);
      expect(service.isSupported('file.txt')).toBe(false);
      expect(service.isSupported('Makefile')).toBe(false);
    });
  });

  describe('getGrammarName', () => {
    it('should return correct Tree-sitter grammar for C#', () => {
      expect(service.getGrammarName('csharp')).toBe('tree-sitter-c-sharp');
    });

    it('should return correct Tree-sitter grammar for Java', () => {
      expect(service.getGrammarName('java')).toBe('tree-sitter-java');
    });

    it('should return correct Tree-sitter grammar for JavaScript', () => {
      expect(service.getGrammarName('javascript')).toBe('tree-sitter-javascript');
    });

    it('should return correct Tree-sitter grammar for TypeScript', () => {
      expect(service.getGrammarName('typescript')).toBe('tree-sitter-typescript');
    });

    it('should return correct Tree-sitter grammar for Python', () => {
      expect(service.getGrammarName('python')).toBe('tree-sitter-python');
    });
  });

  describe('getSupportedExtensions', () => {
    it('should return all supported extensions', () => {
      const extensions = service.getSupportedExtensions();
      expect(extensions).toContain('.cs');
      expect(extensions).toContain('.java');
      expect(extensions).toContain('.js');
      expect(extensions).toContain('.jsx');
      expect(extensions).toContain('.ts');
      expect(extensions).toContain('.tsx');
      expect(extensions).toContain('.py');
      expect(extensions).toHaveLength(7);
    });
  });

  describe('getSupportedLanguages', () => {
    it('should return all supported languages without duplicates', () => {
      const languages = service.getSupportedLanguages();
      expect(languages).toContain('csharp');
      expect(languages).toContain('java');
      expect(languages).toContain('javascript');
      expect(languages).toContain('typescript');
      expect(languages).toContain('python');
      expect(languages).toHaveLength(5);
    });

    it('should not have duplicate languages', () => {
      const languages = service.getSupportedLanguages();
      const uniqueLanguages = [...new Set(languages)];
      expect(languages).toEqual(uniqueLanguages);
    });
  });

  describe('classifyFile', () => {
    it('should classify supported files correctly', () => {
      const result = service.classifyFile('Program.cs');
      expect(result.supported).toBe(true);
      expect(result.language).toBe('csharp');
      expect(result.extension).toBe('.cs');
    });

    it('should classify unsupported files correctly', () => {
      const result = service.classifyFile('README.md');
      expect(result.supported).toBe(false);
      expect(result.language).toBeNull();
      expect(result.extension).toBe('.md');
    });

    it('should handle files without extensions', () => {
      const result = service.classifyFile('Makefile');
      expect(result.supported).toBe(false);
      expect(result.language).toBeNull();
      expect(result.extension).toBe('');
    });

    it('should handle case-insensitive extensions', () => {
      const result = service.classifyFile('App.TS');
      expect(result.supported).toBe(true);
      expect(result.language).toBe('typescript');
      expect(result.extension).toBe('.ts');
    });
  });

  describe('LANGUAGE_SUPPORT constant', () => {
    it('should have correct mapping for all extensions', () => {
      expect(LANGUAGE_SUPPORT['.cs']).toBe('csharp');
      expect(LANGUAGE_SUPPORT['.java']).toBe('java');
      expect(LANGUAGE_SUPPORT['.js']).toBe('javascript');
      expect(LANGUAGE_SUPPORT['.jsx']).toBe('javascript');
      expect(LANGUAGE_SUPPORT['.ts']).toBe('typescript');
      expect(LANGUAGE_SUPPORT['.tsx']).toBe('typescript');
      expect(LANGUAGE_SUPPORT['.py']).toBe('python');
    });
  });

  describe('TREE_SITTER_GRAMMARS constant', () => {
    it('should have correct grammar names for all languages', () => {
      expect(TREE_SITTER_GRAMMARS.csharp).toBe('tree-sitter-c-sharp');
      expect(TREE_SITTER_GRAMMARS.java).toBe('tree-sitter-java');
      expect(TREE_SITTER_GRAMMARS.javascript).toBe('tree-sitter-javascript');
      expect(TREE_SITTER_GRAMMARS.typescript).toBe('tree-sitter-typescript');
      expect(TREE_SITTER_GRAMMARS.python).toBe('tree-sitter-python');
    });
  });

  describe('edge cases', () => {
    it('should handle empty string', () => {
      expect(service.detectLanguage('')).toBeNull();
    });

    it('should handle hidden files that are actually just extension', () => {
      // A file named ".ts" is a hidden file, not a TypeScript file
      // This is expected behavior - we need a filename before the extension
      expect(service.detectLanguage('.ts')).toBeNull();
    });

    it('should handle hidden files with supported extensions', () => {
      expect(service.detectLanguage('.config.ts')).toBe('typescript');
    });

    it('should handle Windows-style paths', () => {
      expect(service.detectLanguage('C:\\Users\\Project\\src\\Main.java')).toBe('java');
    });

    it('should handle Unix-style paths', () => {
      expect(service.detectLanguage('/home/user/project/src/main.py')).toBe('python');
    });
  });
});
