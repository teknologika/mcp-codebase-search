/**
 * Unit tests for Language Detection Service
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { LanguageDetectionService, LANGUAGE_SUPPORT, TREE_SITTER_GRAMMARS } from '../language-detection.service.js';

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

    it('should detect markdown, json, css, and yaml files', () => {
      expect(service.detectLanguage('README.md')).toBe('markdown');
      expect(service.detectLanguage('config.json')).toBe('json');
      expect(service.detectLanguage('styles.css')).toBe('css');
      expect(service.detectLanguage('config.yaml')).toBe('yaml');
      expect(service.detectLanguage('MainWindow.xaml')).toBe('plaintext');
      expect(service.detectLanguage('App.axaml')).toBe('plaintext');
    });

    it('should detect filename-based formats', () => {
      expect(service.detectLanguage('Dockerfile')).toBe('dockerfile');
      expect(service.detectLanguage('package.json')).toBe('json');
      expect(service.detectLanguage('CHANGELOG.md')).toBe('markdown');
    });

    it('should return null for unsupported files', () => {
      expect(service.detectLanguage('data.xml')).toBeNull();
      expect(service.detectLanguage('notes.foo')).toBeNull();
      expect(service.detectLanguage('Makefile')).toBeNull();
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
      expect(service.isSupported('README.md')).toBe(true);
      expect(service.isSupported('config.json')).toBe(true);
      expect(service.isSupported('styles.css')).toBe(true);
      expect(service.isSupported('config.yaml')).toBe(true);
      expect(service.isSupported('MainWindow.xaml')).toBe(true);
      expect(service.isSupported('Dockerfile')).toBe(true);
    });

    it('should return false for unsupported extensions', () => {
      expect(service.isSupported('file.xml')).toBe(false);
      expect(service.isSupported('file.foo')).toBe(false);
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
      expect(extensions).toEqual(expect.arrayContaining(Object.keys(LANGUAGE_SUPPORT)));
      expect(extensions).toHaveLength(Object.keys(LANGUAGE_SUPPORT).length);
    });
  });

  describe('getSupportedLanguages', () => {
    it('should return all supported languages without duplicates', () => {
      const languages = service.getSupportedLanguages();
      const uniqueLanguages = [...new Set(Object.values(LANGUAGE_SUPPORT))];

      expect(languages).toEqual(expect.arrayContaining(uniqueLanguages));
      expect(languages).toHaveLength(uniqueLanguages.length);
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

    it('should classify XAML files as supported plaintext', () => {
      const result = service.classifyFile('MainWindow.xaml');
      expect(result.supported).toBe(true);
      expect(result.language).toBe('plaintext');
      expect(result.extension).toBe('.xaml');
    });

    it('should classify filename-based files correctly', () => {
      const result = service.classifyFile('Dockerfile');
      expect(result.supported).toBe(true);
      expect(result.language).toBe('dockerfile');
      expect(result.extension).toBe('');
    });

    it('should classify unsupported files correctly', () => {
      const result = service.classifyFile('data.xml');
      expect(result.supported).toBe(false);
      expect(result.language).toBeNull();
      expect(result.extension).toBe('.xml');
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
      expect(LANGUAGE_SUPPORT['.md']).toBe('markdown');
      expect(LANGUAGE_SUPPORT['.json']).toBe('json');
      expect(LANGUAGE_SUPPORT['.css']).toBe('css');
      expect(LANGUAGE_SUPPORT['.yaml']).toBe('yaml');
      expect(LANGUAGE_SUPPORT['.xaml']).toBe('plaintext');
      expect(LANGUAGE_SUPPORT['.txt']).toBe('plaintext');
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
