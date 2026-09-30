/**
 * Universal Transpiler - AI Features Test Suite
 * 
 * Tests for:
 * - Autonomous Code Understanding
 * - Cross-Repository Analysis
 * - Predictive Transpilation
 * - Self-Extending System
 * - Parser Generator
 * - Compiler Generator
 * - Transform Generator
 */

import { describe, it, expect, beforeAll } from '@jest/globals';

// Import the modules
import {
  AutonomousCodeUnderstanding,
  createAutonomousCodeUnderstanding,
} from '../src/ai/autonomous-code-understanding';

import {
  CrossRepositoryAnalyzer,
  createCrossRepositoryAnalyzer,
} from '../src/ai/cross-repository-analysis';

import {
  PredictiveTranspiler,
  createPredictiveTranspiler,
} from '../src/ai/predictive-transpilation';

import {
  ParserGenerator,
  createParserGenerator,
} from '../src/ai/parser-generator';

import {
  CompilerGenerator,
  createCompilerGenerator,
} from '../src/ai/compiler-generator';

import {
  TransformGenerator,
  createTransformGenerator,
  BUILTIN_TRANSFORMS,
} from '../src/ai/transform-generator';

import {
  SelfExtendingSystem,
  createSelfExtendingSystem,
} from '../src/ai/self-extending-system';

import { createMemoryCache } from '../src/cache/cache-manager';

// Mock LLM client for testing
class MockLLMClient {
  async generate(prompt: any, options?: any) {
    // Return mock responses based on prompt
    const user = prompt.user || '';
    
    if (user.includes('syntax')) {
      return {
        content: JSON.stringify({
          tokens: [{ type: 'KEYWORD', value: 'function', position: { line: 1, column: 0, offset: 0 }, location: { start: { line: 1, column: 0, offset: 0 }, end: { line: 1, column: 8, offset: 8 }, source: 'function' } }],
          ast: { type: 'Program', children: [], position: { line: 1, column: 0, offset: 0 }, location: { start: { line: 1, column: 0, offset: 0 }, end: { line: 1, column: 0, offset: 0 }, source: '' } },
        }),
        finishReason: 'stop',
        usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
      };
    }
    
    if (user.includes('semantics')) {
      return {
        content: JSON.stringify({
          types: { add: { type: 'function', confidence: 0.9 } },
          variables: { x: { name: 'x', type: { type: 'number', confidence: 0.8 }, kind: 'parameter' } },
          functions: { add: { name: 'add', kind: 'function', parameters: [] } },
        }),
        finishReason: 'stop',
        usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
      };
    }
    
    if (user.includes('intent')) {
      return {
        content: JSON.stringify({
          purpose: 'Test function',
          goals: ['Test addition'],
          algorithms: [],
          patterns: [],
          domain: 'general',
        }),
        finishReason: 'stop',
        usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
      };
    }
    
    if (user.includes('context')) {
      return {
        content: JSON.stringify({
          relatedCode: [],
          usagePatterns: [],
          evolution: { history: [], changes: [], trends: { growing: [], shrinking: [], stable: [] }, metrics: { complexity: { current: 0, trend: 0 }, size: { current: 0, trend: 0 }, dependencies: { current: 0, trend: 0 } } },
          documentation: { comments: [], docBlocks: [], examples: [] },
        }),
        finishReason: 'stop',
        usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
      };
    }
    
    if (user.includes('language') || user.includes('target')) {
      return {
        content: JSON.stringify([
          { value: 'javascript', confidence: 0.9, reason: 'JavaScript code detected' },
          { value: 'typescript', confidence: 0.8, reason: 'TypeScript possible' },
        ]),
        finishReason: 'stop',
        usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
      };
    }
    
    // Default response
    return {
      content: JSON.stringify({}),
      finishReason: 'stop',
      usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
    };
  }
  
  async analyzeCode(code: string, language: string, task: string) {
    return { analysis: 'mock' };
  }
  
  async generateParser(samples: string[], languageName: string) {
    return {
      parse: (source: string) => ({
        ast: { type: 'Program', children: [], position: { line: 1, column: 0, offset: 0 }, location: { start: { line: 1, column: 0, offset: 0 }, end: { line: 1, column: 0, offset: 0 }, source: '' } },
        tokens: [],
        errors: [],
        warnings: [],
      }),
      tokenize: (source: string) => [],
      canParse: () => true,
    };
  }
  
  async generateTransform(description: string, examples: any[]) {
    return {
      name: 'mock-transform',
      visitor: {
        Program: (node: any) => node,
      },
    };
  }
}

describe('AI Features', () => {
  let cache: any;
  let mockLLM: MockLLMClient;

  beforeAll(() => {
    cache = createMemoryCache();
    mockLLM = new MockLLMClient();
  });

  describe('Autonomous Code Understanding', () => {
    let codeUnderstanding: AutonomousCodeUnderstanding;

    beforeAll(() => {
      codeUnderstanding = createAutonomousCodeUnderstanding(mockLLM, cache);
    });

    it('should be initialized', () => {
      expect(codeUnderstanding).toBeDefined();
    });

    it('should understand simple code', async () => {
      const code = `function add(x, y) { return x + y; }`;
      const result = await codeUnderstanding.understand(code, {
        language: 'javascript',
        analyzeSyntax: true,
        analyzeSemantics: true,
        analyzeIntent: true,
        analyzeContext: true,
      });

      expect(result).toBeDefined();
      expect(result.understanding).toBeDefined();
      expect(result.understanding.source).toBe(code);
      expect(result.understanding.language).toBe('javascript');
      expect(result.stats).toBeDefined();
    });

    it('should analyze syntax', async () => {
      const code = `const x = 1;`;
      const result = await codeUnderstanding.understand(code, {
        language: 'javascript',
        analyzeSyntax: true,
      });

      expect(result.understanding.syntax).toBeDefined();
      expect(result.understanding.syntax?.tokens).toBeInstanceOf(Array);
    });

    it('should handle caching', async () => {
      const code = `const y = 2;`;
      
      // First call
      const result1 = await codeUnderstanding.understand(code, {
        language: 'javascript',
        analyzeSyntax: true,
      });
      
      // Second call should use cache
      const result2 = await codeUnderstanding.understand(code, {
        language: 'javascript',
        analyzeSyntax: true,
      });

      expect(result2.stats.analysisTime).toBeLessThan(result1.stats.analysisTime);
    });

    it('should calculate complexity', async () => {
      const code = `
function complex(a, b) {
  if (a > b) {
    return a;
  } else {
    return b;
  }
}
      `;
      const result = await codeUnderstanding.understand(code, {
        language: 'javascript',
      });

      expect(result.understanding.metadata.complexity).toBeGreaterThan(0);
    });

    it('should infer types', async () => {
      const code = `const num = 42;`;
      const result = await codeUnderstanding.understand(code, {
        language: 'javascript',
        analyzeSemantics: true,
      });

      expect(result.understanding.semantics?.variables).toBeDefined();
    });
  });

  describe('Cross-Repository Analysis', () => {
    let crossRepo: CrossRepositoryAnalyzer;

    beforeAll(() => {
      crossRepo = createCrossRepositoryAnalyzer(mockLLM, cache);
    });

    it('should be initialized', () => {
      expect(crossRepo).toBeDefined();
    });

    it('should add and retrieve repositories', async () => {
      const repoInfo = {
        id: 'test-repo',
        name: 'Test Repository',
        url: 'https://github.com/test/test',
        language: 'javascript',
        domain: 'web',
        size: 1000,
        fileCount: 10,
      };

      await crossRepo.addRepository(repoInfo);
      
      const retrieved = crossRepo.getRepository('test-repo');
      expect(retrieved).toBeDefined();
      expect(retrieved?.name).toBe('Test Repository');
    });

    it('should add files to repositories', async () => {
      const repoInfo = {
        id: 'test-repo-2',
        name: 'Test Repository 2',
        url: 'https://github.com/test/test2',
        language: 'typescript',
      };

      await crossRepo.addRepository(repoInfo);
      
      const file: any = {
        path: 'src/index.ts',
        content: 'export const x = 1;',
        size: 15,
        language: 'typescript',
      };

      await crossRepo.addFile('test-repo-2', file);
      
      const files = crossRepo.getRepositoryFiles('test-repo-2');
      expect(files).toBeDefined();
      expect(files?.size).toBe(1);
    });

    it('should analyze repository', async () => {
      const repoInfo = {
        id: 'test-repo-3',
        name: 'Test Repository 3',
        url: 'https://github.com/test/test3',
        language: 'javascript',
      };

      await crossRepo.addRepository(repoInfo, [
        { path: 'index.js', content: 'const x = 1;', size: 10, language: 'javascript' },
        { path: 'utils.js', content: 'export function add(a, b) { return a + b; }', size: 30, language: 'javascript' },
      ]);

      const analysis = await crossRepo.analyzeRepository('test-repo-3');
      expect(analysis).toBeDefined();
      expect(analysis?.statistics.totalFiles).toBe(2);
    });

    it('should calculate repository similarity', async () => {
      const repo1 = {
        id: 'repo-a',
        name: 'Repo A',
        url: 'https://github.com/test/repo-a',
      };

      const repo2 = {
        id: 'repo-b',
        name: 'Repo B',
        url: 'https://github.com/test/repo-b',
      };

      await crossRepo.addRepository(repo1, [
        { path: 'index.js', content: 'const x = 1;', size: 10, language: 'javascript' },
      ]);

      await crossRepo.addRepository(repo2, [
        { path: 'index.js', content: 'const y = 2;', size: 10, language: 'javascript' },
      ]);

      const similarity = await crossRepo.calculateRepositorySimilarity('repo-a', 'repo-b');
      expect(similarity).toBeGreaterThanOrEqual(0);
      expect(similarity).toBeLessThanOrEqual(1);
    });

    it('should query across repositories', async () => {
      const query: any = {
        repositories: ['test-repo', 'test-repo-2'],
        maxResults: 5,
      };

      const result = await crossRepo.query(query);
      expect(result).toBeDefined();
      expect(result.repositories).toBeInstanceOf(Array);
    });
  });

  describe('Predictive Transpilation', () => {
    let predictive: PredictiveTranspiler;

    beforeAll(() => {
      predictive = createPredictiveTranspiler(mockLLM, cache);
    });

    it('should be initialized', () => {
      expect(predictive).toBeDefined();
    });

    it('should predict target language', async () => {
      const options: any = {
        source: 'const x = 1;',
        sourceLanguage: 'javascript',
        maxPredictions: 5,
      };

      const result = await predictive.predict(options);
      expect(result).toBeDefined();
      expect(result.predictions).toBeInstanceOf(Array);
      expect(result.statistics).toBeDefined();
    });

    it('should create transpilation plan', async () => {
      const plan = await predictive.createTranspilationPlan(
        'const x = 1;',
        'javascript',
        'typescript'
      );

      expect(plan).toBeDefined();
      expect(plan.steps).toBeInstanceOf(Array);
      expect(plan.steps.length).toBeGreaterThan(0);
      expect(plan.sourceLanguage).toBe('javascript');
      expect(plan.targetLanguage).toBe('typescript');
    });

    it('should include risk assessment in plan', async () => {
      const plan = await predictive.createTranspilationPlan(
        'const x = 1;',
        'javascript',
        'python'
      );

      expect(plan.riskAssessment).toBeDefined();
      expect(plan.riskAssessment.overallRisk).toBeDefined();
    });

    it('should include optimization opportunities in plan', async () => {
      const plan = await predictive.createTranspilationPlan(
        'const x = 1; const y = 2;',
        'javascript',
        'javascript'
      );

      expect(plan.optimizationOpportunities).toBeInstanceOf(Array);
    });
  });

  describe('Parser Generator', () => {
    let parserGen: ParserGenerator;

    beforeAll(() => {
      parserGen = createParserGenerator(mockLLM, cache);
    });

    it('should be initialized', () => {
      expect(parserGen).toBeDefined();
    });

    it('should generate parser for new language', async () => {
      const options: any = {
        languageName: 'testlang',
        sampleCode: [
          'function test() { return 1; }',
          'const x = 2;',
        ],
      };

      const result = await parserGen.generateParser(options);
      expect(result).toBeDefined();
      expect(result.parser).toBeDefined();
      expect(result.definition).toBeDefined();
      expect(result.definition.name).toBe('testlang');
      expect(result.generationStats).toBeDefined();
    });

    it('should create language definition', async () => {
      const options: any = {
        languageName: 'testlang2',
        sampleCode: ['const y = 3;'],
      };

      const result = await parserGen.generateParser(options);
      expect(result.definition.extensions).toBeInstanceOf(Array);
      expect(result.definition.mimetypes).toBeInstanceOf(Array);
      expect(result.definition.parser).toBeDefined();
    });

    it('should validate generated parser', async () => {
      const options: any = {
        languageName: 'validationlang',
        sampleCode: ['function add(a, b) { return a + b; }'],
      };

      const result = await parserGen.generateParser(options);
      expect(result.generationStats.confidence).toBeGreaterThanOrEqual(0);
    });

    it('should handle missing LLM gracefully', async () => {
      const parserGenNoLLM = createParserGenerator(undefined, cache);
      
      const options: any = {
        languageName: 'nollm',
        sampleCode: ['const z = 4;'],
      };

      const result = await parserGenNoLLM.generateParser(options);
      expect(result).toBeDefined();
      expect(result.parser).toBeDefined();
    });
  });

  describe('Compiler Generator', () => {
    let compilerGen: CompilerGenerator;

    beforeAll(() => {
      const parserGen = createParserGenerator(mockLLM, cache);
      compilerGen = createCompilerGenerator(mockLLM, cache, parserGen);
    });

    it('should be initialized', () => {
      expect(compilerGen).toBeDefined();
    });

    it('should generate compiler for language pair', async () => {
      const options: any = {
        sourceLanguage: 'testlang',
        targetLanguage: 'javascript',
        sampleCode: ['const x = 1;'],
      };

      const result = await compilerGen.generateCompiler(options);
      expect(result).toBeDefined();
      expect(result.compiler).toBeDefined();
      expect(result.sourceDefinition).toBeDefined();
      expect(result.targetDefinition).toBeDefined();
      expect(result.generationStats).toBeDefined();
    });

    it('should create compiler with transforms', async () => {
      const options: any = {
        sourceLanguage: 'testlang2',
        targetLanguage: 'typescript',
        sampleCode: ['const y = 2;'],
        transforms: ['add-types'],
      };

      const result = await compilerGen.generateCompiler(options);
      expect(result.transforms).toBeInstanceOf(Map);
    });

    it('should validate generated compiler', async () => {
      const options: any = {
        sourceLanguage: 'validationlang',
        targetLanguage: 'javascript',
        sampleCode: ['function test() { return 1; }'],
      };

      const result = await compilerGen.generateCompiler(options);
      expect(result.generationStats.confidence).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Transform Generator', () => {
    let transformGen: TransformGenerator;

    beforeAll(() => {
      transformGen = createTransformGenerator(mockLLM, cache);
    });

    it('should be initialized', () => {
      expect(transformGen).toBeDefined();
    });

    it('should generate transform', async () => {
      const options: any = {
        name: 'test-transform',
        description: 'Test transformation',
        sourceLanguage: 'javascript',
      };

      const result = await transformGen.generateTransform(options);
      expect(result).toBeDefined();
      expect(result.transform).toBeDefined();
      expect(result.transform.name).toBe('test-transform');
      expect(result.metadata).toBeDefined();
    });

    it('should have built-in transforms', () => {
      expect(BUILTIN_TRANSFORMS).toBeDefined();
      expect(Object.keys(BUILTIN_TRANSFORMS).length).toBeGreaterThan(0);
    });

    it('should discover transforms from patterns', async () => {
      const result = await transformGen.discoverTransform({
        name: 'auto-transform',
        description: 'Auto-discovered transform',
        sourceLanguage: 'javascript',
        inputPatterns: [
          { type: 'code-pattern', value: 'const x =', description: 'Variable declaration' },
        ],
      });

      expect(result).toBeDefined();
      expect(result.transform).toBeDefined();
      expect(result.confidence).toBeGreaterThanOrEqual(0);
    });

    it('should validate transforms', async () => {
      const result = await transformGen.generateTransform({
        name: 'validation-transform',
        description: 'Transform for validation',
        sourceLanguage: 'javascript',
        examples: [
          { input: 'const x = 1;', output: 'const x = 1;', description: 'Simple assignment' },
        ],
      });

      expect(result.validation).toBeDefined();
      expect(result.validation.passRate).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Self-Extending System', () => {
    let selfExtending: SelfExtendingSystem;

    beforeAll(() => {
      selfExtending = createSelfExtendingSystem(mockLLM, cache);
    });

    it('should be initialized', () => {
      expect(selfExtending).toBeDefined();
    });

    it('should get stats', () => {
      const stats = selfExtending.getStats();
      expect(stats).toBeDefined();
      expect(stats.totalLanguages).toBeGreaterThan(0);
    });

    it('should get learning summary', () => {
      const summary = selfExtending.getLearningSummary();
      expect(summary).toBeDefined();
      expect(summary.languages).toBeInstanceOf(Array);
      expect(summary.compilers).toBeInstanceOf(Array);
      expect(summary.transforms).toBeInstanceOf(Array);
    });

    it('should add code examples', () => {
      selfExtending.addCodeExample('const x = 1;', 'javascript', {
        filePath: 'test.js',
        domain: 'general',
      });

      const summary = selfExtending.getLearningSummary();
      expect(summary.sampleCount).toBeGreaterThan(0);
    });

    it('should discover language', async () => {
      const samples = [
        'function test() { return 1; }',
        'const x = 2;',
      ];

      const result = await selfExtending.discoverLanguage('discoveredlang', samples);
      expect(result).toBeDefined();
      expect(result.language).toBeDefined();
      expect(result.language.name).toBe('discoveredlang');
      expect(result.parser).toBeDefined();
      expect(result.confidence).toBeGreaterThanOrEqual(0);
    });

    it('should discover compiler', async () => {
      const samples = ['const x = 1;'];

      const result = await selfExtending.discoverCompiler(
        'discoveredlang',
        'javascript',
        samples
      );

      expect(result).toBeDefined();
      expect(result.compiler).toBeDefined();
      expect(result.sourceLanguage).toBe('discoveredlang');
      expect(result.targetLanguage).toBe('javascript');
    });

    it('should discover transform', async () => {
      const result = await selfExtending.discoverTransform({
        name: 'discovered-transform',
        description: 'Discovered transformation',
        sourceLanguage: 'javascript',
      });

      expect(result).toBeDefined();
      expect(result.transform).toBeDefined();
      expect(result.name).toBe('discovered-transform');
    });

    it('should queue extensions', async () => {
      selfExtending.queueExtension({
        type: 'language',
        name: 'queuedlang',
        data: { source: 'const x = 1;' },
        priority: 1,
      });

      // Process queue
      await new Promise(resolve => setTimeout(resolve, 100));
    });

    it('should have event system', () => {
      const events: any[] = [];
      const listener = (event: any) => events.push(event);
      
      selfExtending.addEventListener(listener);
      
      // Trigger an event by adding a language
      selfExtending.addCodeExample('const x = 1;', 'eventtest', {
        domain: 'test',
      });

      expect(events.length).toBeGreaterThan(0);
      
      // Clean up
      selfExtending.removeEventListener(listener);
    });

    it('should get or create parser', async () => {
      const parser = await selfExtending.getParser('javascript', 'const x = 1;');
      expect(parser).toBeDefined();
      expect(parser.parse).toBeDefined();
      expect(parser.tokenize).toBeDefined();
    });

    it('should get or create compiler', async () => {
      const compiler = await selfExtending.getCompiler(
        'javascript',
        'typescript',
        'const x = 1;'
      );
      // May return null if no LLM or auto-discovery disabled
      // Just check it doesn't throw
      expect(compiler).toBeDefined();
    });

    it('should get or create transform', async () => {
      const transform = await selfExtending.getTransform('test-transform');
      expect(transform).toBeDefined();
    });
  });

  describe('Built-in Transform Library', () => {
    it('should have syntax transforms', () => {
      expect(BUILTIN_TRANSFORMS['arrow-to-function']).toBeDefined();
      expect(BUILTIN_TRANSFORMS['class-to-prototype']).toBeDefined();
    });

    it('should have module transforms', () => {
      expect(BUILTIN_TRANSFORMS['import-to-require']).toBeDefined();
      expect(BUILTIN_TRANSFORMS['require-to-import']).toBeDefined();
    });

    it('should have type transforms', () => {
      expect(BUILTIN_TRANSFORMS['add-types']).toBeDefined();
      expect(BUILTIN_TRANSFORMS['remove-types']).toBeDefined();
    });

    it('should have optimization transforms', () => {
      expect(BUILTIN_TRANSFORMS['loop-to-map']).toBeDefined();
      expect(BUILTIN_TRANSFORMS['promise-to-async-await']).toBeDefined();
    });

    it('should have naming transforms', () => {
      expect(BUILTIN_TRANSFORMS['camel-to-snake-case']).toBeDefined();
      expect(BUILTIN_TRANSFORMS['snake-to-camel-case']).toBeDefined();
    });

    it('should have language-specific transforms', () => {
      expect(BUILTIN_TRANSFORMS['js-to-python']).toBeDefined();
      expect(BUILTIN_TRANSFORMS['python-to-js']).toBeDefined();
    });

    it('should have framework transforms', () => {
      expect(BUILTIN_TRANSFORMS['react-to-vue']).toBeDefined();
      expect(BUILTIN_TRANSFORMS['vue-to-react']).toBeDefined();
    });
  });
});

describe('AI Integration Tests', () => {
  let cache: any;
  let mockLLM: MockLLMClient;

  beforeAll(() => {
    cache = createMemoryCache();
    mockLLM = new MockLLMClient();
  });

  it('should create all AI components together', async () => {
    // Create the full AI stack
    const parserGen = createParserGenerator(mockLLM, cache);
    const compilerGen = createCompilerGenerator(mockLLM, cache, parserGen);
    const transformGen = createTransformGenerator(mockLLM, cache);
    const codeUnderstanding = createAutonomousCodeUnderstanding(mockLLM, cache);
    const crossRepo = createCrossRepositoryAnalyzer(mockLLM, cache);
    const predictive = createPredictiveTranspiler(mockLLM, cache, crossRepo);
    const selfExtending = createSelfExtendingSystem(mockLLM, cache, crossRepo, predictive);

    expect(parserGen).toBeDefined();
    expect(compilerGen).toBeDefined();
    expect(transformGen).toBeDefined();
    expect(codeUnderstanding).toBeDefined();
    expect(crossRepo).toBeDefined();
    expect(predictive).toBeDefined();
    expect(selfExtending).toBeDefined();
  });

  it('should work with empty cache', async () => {
    const emptyCache = createMemoryCache();
    const selfExtending = createSelfExtendingSystem(mockLLM, emptyCache);

    expect(selfExtending).toBeDefined();
    
    const stats = selfExtending.getStats();
    expect(stats).toBeDefined();
  });

  it('should handle missing LLM gracefully', async () => {
    const selfExtending = createSelfExtendingSystem(undefined, cache);

    expect(selfExtending).toBeDefined();
    
    // Should still work with basic functionality
    const stats = selfExtending.getStats();
    expect(stats.totalLanguages).toBeGreaterThan(0);
  });
});
