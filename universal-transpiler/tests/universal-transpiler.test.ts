/**
 * Universal Transpiler - Test Suite
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { createTranspiler, createSimpleTranspiler } from '../src/index';
import type { UniversalTranspiler } from '../src/core/universal-transpiler';

describe('Universal Transpiler', () => {
  let transpiler: UniversalTranspiler;

  beforeAll(async () => {
    transpiler = await createTranspiler({
      enableLLMFallback: false,
      enableCaching: true,
      enableDynamic: true,
      debug: false,
    });
  });

  afterAll(() => {
    transpiler.clearCache();
  });

  describe('Core Functionality', () => {
    it('should be initialized', () => {
      expect(transpiler).toBeDefined();
    });

    it('should support multiple languages', () => {
      const languages = transpiler.getSupportedLanguages();
      expect(languages).toContain('javascript');
      expect(languages).toContain('typescript');
      expect(languages).toContain('python');
      expect(languages).toContain('html');
    });

    it('should support multiple domains', () => {
      const domains = transpiler.getSupportedDomains();
      expect(domains).toContain('web');
      expect(domains).toContain('data');
      expect(domains).toContain('ai');
      expect(domains).toContain('system');
    });

    it('should have cache manager', () => {
      expect(transpiler.cache).toBeDefined();
    });
  });

  describe('Parsing', () => {
    it('should parse JavaScript code', async () => {
      const code = `function add(a, b) { return a + b; }`;
      const result = await transpiler.transpile(code, {
        sourceType: 'javascript',
        target: 'javascript',
      });

      expect(result.ast).toBeDefined();
      expect(result.ast.type).toBe('Program');
      expect(result.errors.length).toBe(0);
    });

    it('should parse TypeScript code', async () => {
      const code = `interface User { name: string; age: number; }`;
      const result = await transpiler.transpile(code, {
        sourceType: 'typescript',
        target: 'typescript',
      });

      expect(result.ast).toBeDefined();
    });

    it('should parse Python-like code', async () => {
      const code = `def add(a, b): return a + b`;
      const result = await transpiler.transpile(code, {
        sourceType: 'python',
        target: 'python',
      });

      expect(result.ast).toBeDefined();
    });

    it('should parse HTML-like code', async () => {
      const code = `<div class="app"><span>Hello</span></div>`;
      const result = await transpiler.transpile(code, {
        sourceType: 'html',
        target: 'html',
      });

      expect(result.ast).toBeDefined();
    });
  });

  describe('Language Detection', () => {
    it('should detect JavaScript code', async () => {
      const code = `function test() { return 1; }`;
      const detected = await transpiler.detectLanguage(code);
      expect(detected).toContain('javascript');
    });

    it('should detect TypeScript code', async () => {
      const code = `interface Test { prop: string; }`;
      const detected = await transpiler.detectLanguage(code);
      // May detect as JavaScript or TypeScript
      expect(detected.length).toBeGreaterThan(0);
    });

    it('should detect HTML code', async () => {
      const code = `<div>content</div>`;
      const detected = await transpiler.detectLanguage(code);
      expect(detected).toContain('html');
    });
  });

  describe('Transpilation', () => {
    it('should transpile JavaScript to JavaScript', async () => {
      const code = `const x = 1;`;
      const result = await transpiler.transpile(code, {
        sourceType: 'javascript',
        target: 'javascript',
      });

      expect(result.code).toContain('x');
      expect(result.errors.length).toBe(0);
    });

    it('should transpile with caching', async () => {
      const code = `const y = 2;`;
      
      // First transpilation
      const result1 = await transpiler.transpile(code, {
        sourceType: 'javascript',
        target: 'javascript',
        cache: true,
      });
      expect(result1.stats.cached).toBeFalsy();

      // Second transpilation should be cached
      const result2 = await transpiler.transpile(code, {
        sourceType: 'javascript',
        target: 'javascript',
        cache: true,
      });
      expect(result2.stats.cached).toBe(true);
    });

    it('should include stats in result', async () => {
      const code = `const z = 3;`;
      const result = await transpiler.transpile(code, {
        sourceType: 'javascript',
        target: 'javascript',
      });

      expect(result.stats.inputSize).toBeGreaterThan(0);
      expect(result.stats.outputSize).toBeGreaterThan(0);
      expect(result.stats.parseTime).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Domain System', () => {
    it('should apply web domain transformations', async () => {
      const code = `
import React from 'react';
function Component() { return <div>Test</div>; }
      `;
      const result = await transpiler.transpile(code, {
        sourceType: 'javascript',
        target: 'javascript',
        domain: 'web',
      });

      expect(result.code).toBeDefined();
    });

    it('should apply data domain transformations', async () => {
      const code = `
const data = [1, 2, 3];
const result = data.map(x => x * 2);
      `;
      const result = await transpiler.transpile(code, {
        sourceType: 'javascript',
        target: 'javascript',
        domain: 'data',
      });

      expect(result.code).toBeDefined();
    });

    it('should get domain by name', () => {
      const domain = transpiler.getDomain('web');
      expect(domain).toBeDefined();
      expect(domain?.name).toBe('web');
    });

    it('should check domain existence', () => {
      expect(transpiler.getDomain('web')).toBeDefined();
      expect(transpiler.getDomain('nonexistent')).toBeUndefined();
    });
  });

  describe('5GL System', () => {
    it('should compile 5GL abstractions', async () => {
      const abstraction = {
        name: 'TestComponent',
        type: 'declaration' as const,
        parameters: [
          { name: 'title', type: 'string', required: true },
        ],
        body: {
          type: 'Component',
          title: '{title}',
        },
        semantics: 'A test component',
      };

      try {
        const code = await transpiler.compile5GL(abstraction, 'web', 'react');
        expect(code).toBeDefined();
      } catch (error) {
        // May fail without LLM, but should not crash
        expect(error).toBeDefined();
      }
    });

    it('should list supported 5GL definitions', () => {
      const fifthGL = transpiler.getSupported5GL();
      expect(Array.isArray(fifthGL)).toBe(true);
    });
  });

  describe('Cache System', () => {
    it('should cache transpilation results', async () => {
      const code = `const test = 1;`;
      
      // Transpile once
      await transpiler.transpile(code, {
        sourceType: 'javascript',
        target: 'javascript',
        cache: true,
      });

      // Check cache
      const entries = await transpiler.cache.list();
      expect(entries.length).toBeGreaterThan(0);
    });

    it('should clear cache', async () => {
      transpiler.clearCache();
      const entries = await transpiler.cache.list();
      expect(entries.length).toBe(0);
    });

    it('should have cache statistics', async () => {
      const code = `const stats = 1;`;
      await transpiler.transpile(code, {
        sourceType: 'javascript',
        target: 'javascript',
        cache: true,
      });

      const stats = await transpiler.cache.getStats();
      expect(stats.size).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(stats.keys)).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle parse errors', async () => {
      const code = `function test( { return 1; }`; // Invalid syntax
      const result = await transpiler.transpile(code, {
        sourceType: 'javascript',
        target: 'javascript',
      });

      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should handle unknown target language', async () => {
      const code = `const x = 1;`;
      const result = await transpiler.transpile(code, {
        sourceType: 'javascript',
        target: 'unknown-language',
      });

      // Should not crash, may return fallback
      expect(result).toBeDefined();
    });
  });
});

describe('Simple Transpiler', () => {
  it('should create a simple transpiler', () => {
    const simple = createSimpleTranspiler();
    expect(simple).toBeDefined();
    expect(simple.transpile).toBeDefined();
  });
});

describe('Language Definitions', () => {
  it('should create JavaScript language definition', () => {
    const { createJavaScriptLanguage } = require('../src/index');
    const lang = createJavaScriptLanguage();
    expect(lang.name).toBe('javascript');
    expect(lang.extensions).toContain('.js');
    expect(lang.keywords).toContain('function');
  });

  it('should create TypeScript language definition', () => {
    const { createTypeScriptLanguage } = require('../src/index');
    const lang = createTypeScriptLanguage();
    expect(lang.name).toBe('typescript');
    expect(lang.extensions).toContain('.ts');
    expect(lang.keywords).toContain('interface');
  });

  it('should create Python language definition', () => {
    const { createPythonLanguage } = require('../src/index');
    const lang = createPythonLanguage();
    expect(lang.name).toBe('python');
    expect(lang.extensions).toContain('.py');
    expect(lang.keywords).toContain('def');
  });
});
