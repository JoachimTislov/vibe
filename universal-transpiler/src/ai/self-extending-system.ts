/**
 * Universal Transpiler - Self-Extending System
 * 
 * The core system that enables:
 * 1. Dynamic parser generation for unknown languages
 * 2. Dynamic compiler generation for new language pairs
 * 3. Dynamic transform generation for code transformations
 * 4. Self-learning from code examples
 * 5. Autonomous extension of language support
 * 
 * This is the main orchestrator that ties together:
 * - ParserGenerator: Creates parsers for new languages
 * - CompilerGenerator: Creates compilers for new language pairs
 * - TransformGenerator: Creates transforms for code manipulation
 */

import type {
  Token,
  Parser,
  Compiler,
  LanguageDefinition,
  Transform,
  LLMClient,
  CacheManager,
} from '../core/universal-transpiler';
import type { CodeUnderstanding } from './autonomous-code-understanding';
import type { RepositoryAnalysis } from './cross-repository-analysis';
import type { PredictiveTranspiler } from './predictive-transpilation';
import type { CrossRepositoryAnalyzer } from './cross-repository-analysis';

// Import the generators
import { ParserGenerator, createParserGenerator, type ParserGenerationOptions } from './parser-generator';
import { CompilerGenerator, createCompilerGenerator, type CompilerGenerationOptions } from './compiler-generator';
import { TransformGenerator, createTransformGenerator, type TransformGenerationOptions, type GeneratedTransform } from './transform-generator';

// ============================================================================
// Types
// ============================================================================

export interface SelfExtendingSystemOptions {
  // Core options
  enableLearning?: boolean;
  enableCaching?: boolean;
  enableLLM?: boolean;
  enableDynamic?: boolean;
  
  // Component options
  parserGeneratorOptions?: Partial<ParserGenerator['options']>;
  compilerGeneratorOptions?: Partial<CompilerGenerator['options']>;
  transformGeneratorOptions?: Partial<TransformGenerator['options']>;
  
  // Learning options
  minSamplesForLearning?: number;
  learningBatchSize?: number;
  learningInterval?: number; // in milliseconds
  
  // Discovery options
  autoDiscoverLanguages?: boolean;
  autoDiscoverPatterns?: boolean;
  discoveryThreshold?: number; // confidence threshold for auto-discovery
  
  // Debug
  debug?: boolean;
}

export interface LanguageDiscoveryResult {
  language: LanguageDefinition;
  parser: Parser;
  confidence: number;
  samplesUsed: number;
  generationTime: number;
}

export interface CompilerDiscoveryResult {
  compiler: Compiler;
  sourceLanguage: string;
  targetLanguage: string;
  confidence: number;
  generationTime: number;
}

export interface TransformDiscoveryResult {
  transform: GeneratedTransform;
  name: string;
  confidence: number;
  generationTime: number;
}

export interface CodeExample {
  source: string;
  language?: string;
  context?: {
    filePath?: string;
    repository?: string;
    domain?: string;
  };
  understanding?: CodeUnderstanding;
}

export interface LearningData {
  languages: Map<string, LanguageDefinition>;
  compilers: Map<string, Compiler>;
  transforms: Map<string, Transform>;
  patterns: Map<string, PatternAnalysis>;
  examples: CodeExample[];
}

export interface PatternAnalysis {
  pattern: string;
  regex?: RegExp;
  nodeTypes: string[];
  frequency: number;
  languages: string[];
  domains: string[];
  contexts: string[];
}

export interface SelfExtendingStats {
  totalLanguages: number;
  dynamicallyGeneratedLanguages: number;
  totalCompilers: number;
  dynamicallyGeneratedCompilers: number;
  totalTransforms: number;
  dynamicallyGeneratedTransforms: number;
  samplesProcessed: number;
  learningIterations: number;
  averageConfidence: number;
}

export interface ExtensionRequest {
  type: 'language' | 'compiler' | 'transform';
  name: string;
  data: any;
  priority?: number;
  callback?: (result: any) => void;
}

export interface SelfExtendingEvent {
  type: 'language-added' | 'compiler-added' | 'transform-added' | 'sample-added' | 'learning-started' | 'learning-completed' | 'error';
  timestamp: number;
  data: any;
  metadata?: Record<string, any>;
}

export interface SelfExtendingEventListener {
  (event: SelfExtendingEvent): void;
}

// ============================================================================
// Self-Extending System Class
// ============================================================================

export class SelfExtendingSystem {
  // Components
  private parserGenerator: ParserGenerator;
  private compilerGenerator: CompilerGenerator;
  private transformGenerator: TransformGenerator;
  
  // Dependencies
  private llm?: LLMClient;
  private predictiveTranspiler?: PredictiveTranspiler;
  
  // Learning data
  private learningData: LearningData = {
    languages: new Map(),
    compilers: new Map(),
    transforms: new Map(),
    patterns: new Map(),
    examples: [],
  };
  
  // Event listeners
  private listeners: Set<SelfExtendingEventListener> = new Set();
  
  // Extension queue
  private extensionQueue: ExtensionRequest[] = [];
  private isProcessingQueue: boolean = false;
  
  // Options
  private options: {
    enableLearning: boolean;
    enableCaching: boolean;
    enableLLM: boolean;
    enableDynamic: boolean;
    minSamplesForLearning: number;
    learningBatchSize: number;
    learningInterval: number;
    autoDiscoverLanguages: boolean;
    autoDiscoverPatterns: boolean;
    discoveryThreshold: number;
    debug: boolean;
  };
  
  // Stats
  private stats: SelfExtendingStats = {
    totalLanguages: 0,
    dynamicallyGeneratedLanguages: 0,
    totalCompilers: 0,
    dynamicallyGeneratedCompilers: 0,
    totalTransforms: 0,
    dynamicallyGeneratedTransforms: 0,
    samplesProcessed: 0,
    learningIterations: 0,
    averageConfidence: 0,
  };

  constructor(
    llm?: LLMClient,
    _cache?: CacheManager,
    _repositoryAnalyzer?: CrossRepositoryAnalyzer,
    predictiveTranspiler?: PredictiveTranspiler,
    options?: SelfExtendingSystemOptions
  ) {
    this.llm = llm;
    this.predictiveTranspiler = predictiveTranspiler;
    
    this.options = {
      enableLearning: true,
      enableCaching: true,
      enableLLM: true,
      enableDynamic: true,
      minSamplesForLearning: 5,
      learningBatchSize: 100,
      learningInterval: 300000, // 5 minutes
      autoDiscoverLanguages: true,
      autoDiscoverPatterns: true,
      discoveryThreshold: 0.8,
      debug: false,
      ...options,
    };
    
    // Initialize generators
    this.parserGenerator = createParserGenerator(llm, _cache, options?.parserGeneratorOptions);
    this.compilerGenerator = createCompilerGenerator(llm, _cache, this.parserGenerator, options?.compilerGeneratorOptions);
    this.transformGenerator = createTransformGenerator(llm, _cache, options?.transformGeneratorOptions);
    
    // Set up dependencies
    this.compilerGenerator = createCompilerGenerator(llm, _cache, this.parserGenerator, options?.compilerGeneratorOptions);
    
    // Initialize with built-in languages
    this.initializeBuiltinLanguages();
    
    // Start learning loop if enabled
    if (this.options.enableLearning) {
      this.startLearningLoop();
    }
    
    this.log('Self-extending system initialized');
  }

  // ==========================================================================
  // Initialization
  // ==========================================================================

  private initializeBuiltinLanguages(): void {
    // Register known languages
    const builtinLanguages = [
      'javascript',
      'typescript',
      'python',
      'java',
      'csharp',
      'go',
      'rust',
      'ruby',
      'php',
      'swift',
      'kotlin',
      'scala',
      'html',
      'css',
      'json',
    ];
    
    for (const lang of builtinLanguages) {
      this.registerKnownLanguage(lang);
    }
    
    this.stats.totalLanguages = builtinLanguages.length;
  }

  private registerKnownLanguage(name: string): void {
    // Create a basic definition for known languages
    const definition: LanguageDefinition = {
      name,
      version: '1.0.0',
      extensions: this.determineExtensions(name),
      mimetypes: this.determineMimeTypes(name),
      parser: this.createBasicParser(),
      keywords: [],
      operators: [],
    };
    
    this.learningData.languages.set(name, definition);
  }

  private determineExtensions(languageName: string): string[] {
    const extensionMap: Record<string, string[]> = {
      javascript: ['.js', '.jsx', '.mjs', '.cjs'],
      typescript: ['.ts', '.tsx'],
      python: ['.py', '.pyw', '.pyi'],
      java: ['.java'],
      csharp: ['.cs'],
      go: ['.go'],
      rust: ['.rs'],
      ruby: ['.rb'],
      php: ['.php'],
      swift: ['.swift'],
      kotlin: ['.kt'],
      scala: ['.scala'],
      html: ['.html', '.htm'],
      css: ['.css'],
      json: ['.json'],
    };
    
    const normalized = languageName.toLowerCase();
    return extensionMap[normalized] || [`.${normalized}`];
  }

  private determineMimeTypes(languageName: string): string[] {
    const mimeMap: Record<string, string[]> = {
      javascript: ['text/javascript', 'application/javascript'],
      typescript: ['text/typescript'],
      python: ['text/x-python', 'application/x-python'],
      java: ['text/x-java-source'],
      csharp: ['text/x-csharp'],
      go: ['text/x-go'],
      rust: ['text/x-rustsrc'],
      ruby: ['text/x-ruby', 'application/x-ruby'],
      php: ['text/x-php', 'application/x-php'],
      swift: ['text/x-swift'],
      html: ['text/html', 'application/xhtml+xml'],
      css: ['text/css'],
      json: ['application/json'],
    };
    
    const normalized = languageName.toLowerCase();
    return mimeMap[normalized] || [`text/x-${normalized}`];
  }

  private createBasicParser(): Parser {
    return {
      parse: (source: string) => this.createBasicParseResult(source),
      tokenize: (source: string) => this.basicTokenize(source),
      canParse: () => true,
    };
  }

  private createBasicParseResult(source: string): any {
    const tokens = this.basicTokenize(source);
    return {
      ast: {
        type: 'Program',
        children: [],
        position: { line: 1, column: 0, offset: 0 },
        location: {
          start: { line: 1, column: 0, offset: 0 },
          end: { line: 1, column: 0, offset: 0 },
          source: '',
        },
      },
      tokens,
      errors: [],
      warnings: [],
    };
  }

  private basicTokenize(source: string): Token[] {
    const tokens: Token[] = [];
    let pos = 0;
    let line = 1;
    let column = 0;
    
    while (pos < source.length) {
      const char = source[pos];
      
      if (/\s/.test(char)) {
        if (char === '\n') {
          line++;
          column = 0;
        } else {
          column++;
        }
        pos++;
        continue;
      }
      
      if (/[a-zA-Z_]/.test(char)) {
        let end = pos + 1;
        while (end < source.length && /[a-zA-Z0-9_]/.test(source[end])) end++;
        const value = source.substring(pos, end);
        tokens.push({
          type: /^[A-Z]/.test(value) ? 'KEYWORD' : 'IDENTIFIER',
          value,
          position: { line, column, offset: pos },
          location: {
            start: { line, column, offset: pos },
            end: { line, column: column + (end - pos), offset: end },
            source: value,
          },
        });
        column += end - pos;
        pos = end;
        continue;
      }
      
      if (/\d/.test(char)) {
        let end = pos + 1;
        while (end < source.length && /[\d.]/.test(source[end])) end++;
        const value = source.substring(pos, end);
        tokens.push({
          type: 'NUMBER',
          value,
          position: { line, column, offset: pos },
          location: {
            start: { line, column, offset: pos },
            end: { line, column: column + (end - pos), offset: end },
            source: value,
          },
        });
        column += end - pos;
        pos = end;
        continue;
      }
      
      if (char === '"' || char === "'") {
        const quote = char;
        let end = pos + 1;
        while (end < source.length && source[end] !== quote) {
          if (source[end] === '\\') end++;
          end++;
        }
        end++;
        const value = source.substring(pos, end);
        tokens.push({
          type: 'STRING',
          value,
          position: { line, column, offset: pos },
          location: {
            start: { line, column, offset: pos },
            end: { line, column: column + (end - pos), offset: end },
            source: value,
          },
        });
        column += end - pos;
        pos = end;
        continue;
      }
      
      if (/[+\-*/%=<>!&|^~?,.:;(){}\[\]]/.test(char)) {
        tokens.push({
          type: 'OPERATOR',
          value: char,
          position: { line, column, offset: pos },
          location: {
            start: { line, column, offset: pos },
            end: { line, column: column + 1, offset: pos + 1 },
            source: char,
          },
        });
        column++;
        pos++;
        continue;
      }
      
      tokens.push({
        type: 'UNKNOWN',
        value: char,
        position: { line, column, offset: pos },
        location: {
          start: { line, column, offset: pos },
          end: { line, column: column + 1, offset: pos + 1 },
          source: char,
        },
      });
      column++;
      pos++;
    }
    
    return tokens;
  }

  // ==========================================================================
  // Language Discovery and Extension
  // ==========================================================================

  /**
   * Discover a new language from code samples
   */
  async discoverLanguage(
    name: string,
    samples: string[],
    options?: {
      version?: string;
      domain?: string;
      keywords?: string[];
      operators?: string[];
    }
  ): Promise<LanguageDiscoveryResult> {
    this.log(`Discovering language: ${name}`);
    
    const startTime = Date.now();
    
    // Generate parser
    const parserOptions: ParserGenerationOptions = {
      languageName: name,
      languageVersion: options?.version,
      sampleCode: samples,
      keywords: options?.keywords,
      operators: options?.operators,
      domain: options?.domain,
    };
    
    const generated = await this.parserGenerator.generateParser(parserOptions);
    
    // Create language definition with domain
    const definition: LanguageDefinition = {
      ...generated.definition,
      domain: options?.domain || this.inferDomainFromSamples(samples),
    };
    
    // Register the language
    this.learningData.languages.set(name, definition);
    this.stats.dynamicallyGeneratedLanguages++;
    this.stats.totalLanguages++;
    
    // Emit event
    this.emit({
      type: 'language-added',
      timestamp: Date.now(),
      data: { name, definition, parser: generated.parser },
    });
    
    // Store samples
    for (const sample of samples) {
      this.addCodeExample(sample, name, { domain: options?.domain });
    }
    
    // Update average confidence
    this.updateAverageConfidence(generated.generationStats.confidence);
    
    this.log(`Discovered language ${name} in ${Date.now() - startTime}ms`);
    
    return {
      language: definition,
      parser: generated.parser,
      confidence: generated.generationStats.confidence,
      samplesUsed: samples.length,
      generationTime: Date.now() - startTime,
    };
  }

  /**
   * Auto-discover language from code
   */
  async autoDiscoverLanguage(
    code: string,
    hints?: {
      fileExtension?: string;
      filePath?: string;
      repository?: string;
      domain?: string;
    }
  ): Promise<LanguageDiscoveryResult | null> {
    if (!this.options.autoDiscoverLanguages || !this.llm) {
      return null;
    }
    
    // Use LLM to detect language
    const prompt = {
      system: `You are an expert language detector. Analyze the following code and identify:
1. The programming language
2. Any distinguishing features
3. Keywords and syntax patterns

Return ONLY a JSON object with:
{
  language: string;
  confidence: 0.0-1.0;
  features: string[];
  keywords: string[];
  patterns: string[];
}`,
      user: `Code:\n${code.substring(0, 4000)}\n\nHints:\nExtension: ${hints?.fileExtension || 'unknown'}\nPath: ${hints?.filePath || 'unknown'}`,
    };
    
    try {
      const response = await this.llm.generate(prompt);
      const parsed = JSON.parse(response.content);
      
      if (parsed.confidence >= this.options.discoveryThreshold) {
        const languageName = parsed.language.toLowerCase();
        
        // Check if already known
        if (this.learningData.languages.has(languageName)) {
          return null;
        }
        
        // Generate samples from the code
        const samples = this.extractSamplesFromCode(code);
        
        // Discover the language
        return await this.discoverLanguage(languageName, samples, {
          domain: hints?.domain || parsed.keywords.join(' '),
          keywords: parsed.keywords,
        });
      }
    } catch {
      // Failed to detect
    }
    
    return null;
  }

  /**
   * Extract representative samples from code
   */
  private extractSamplesFromCode(code: string): string[] {
    const samples: string[] = [];
    const lines = code.split('\n');
    
    // Extract first few non-empty lines
    for (let i = 0; i < Math.min(lines.length, 10) && samples.length < 5; i++) {
      const line = lines[i].trim();
      if (line && !line.startsWith('//') && !line.startsWith('/*')) {
        samples.push(line);
      }
    }
    
    // Extract function definitions
    const functionMatches = code.match(/function\s+\w+\s*\([^)]*\)\s*\{[^}]*\}/g);
    if (functionMatches) {
      samples.push(...functionMatches.slice(0, 3));
    }
    
    // Extract class definitions
    const classMatches = code.match(/class\s+\w+\s*\{[^}]*\}/g);
    if (classMatches) {
      samples.push(...classMatches.slice(0, 2));
    }
    
    return samples.slice(0, 10);
  }

  /**
   * Infer domain from code samples
   */
  private inferDomainFromSamples(samples: string[]): string {
    const domainKeywords: Record<string, string> = {
      'http': 'web',
      'request': 'web',
      'response': 'web',
      'api': 'web',
      'database': 'data',
      'query': 'data',
      'model': 'ai',
      'train': 'ai',
      'predict': 'ai',
      'neural': 'ai',
      'tensor': 'ai',
      'react': 'web',
      'component': 'web',
      'html': 'web',
      'css': 'web',
      'server': 'web',
      'client': 'web',
      'fs': 'system',
      'file': 'system',
      'process': 'system',
    };
    
    const code = samples.join('\n');
    const detectedDomains = new Set<string>();
    
    for (const [keyword, domain] of Object.entries(domainKeywords)) {
      if (code.toLowerCase().includes(keyword)) {
        detectedDomains.add(domain);
      }
    }
    
    return detectedDomains.size > 0 ? Array.from(detectedDomains)[0] : 'general';
  }

  // ==========================================================================
  // Compiler Discovery and Extension
  // ==========================================================================

  /**
   * Discover a new compiler for a language pair
   */
  async discoverCompiler(
    sourceLanguage: string,
    targetLanguage: string,
    samples: string[],
    options?: {
      optimizationLevel?: 'none' | 'basic' | 'aggressive';
      strictMode?: boolean;
      typeSafety?: 'none' | 'basic' | 'strict';
      runtime?: 'node' | 'browser' | 'deno' | 'bun' | 'universal';
    }
  ): Promise<CompilerDiscoveryResult> {
    this.log(`Discovering compiler: ${sourceLanguage} -> ${targetLanguage}`);
    
    const startTime = Date.now();
    
    // Check if already exists
    const compilerKey = `${sourceLanguage}->${targetLanguage}`;
    if (this.learningData.compilers.has(compilerKey)) {
      return {
        compiler: this.learningData.compilers.get(compilerKey)!,
        sourceLanguage,
        targetLanguage,
        confidence: 1,
        generationTime: 0,
      };
    }
    
    // Generate compiler
    const compilerOptions: CompilerGenerationOptions = {
      sourceLanguage,
      targetLanguage,
      sampleCode: samples,
      optimizationLevel: options?.optimizationLevel,
      strictMode: options?.strictMode,
      typeSafety: options?.typeSafety,
      runtime: options?.runtime,
    };
    
    const generated = await this.compilerGenerator.generateCompiler(compilerOptions);
    
    // Register the compiler
    this.learningData.compilers.set(compilerKey, generated.compiler);
    this.stats.dynamicallyGeneratedCompilers++;
    this.stats.totalCompilers++;
    
    // Emit event
    this.emit({
      type: 'compiler-added',
      timestamp: Date.now(),
      data: { sourceLanguage, targetLanguage, compiler: generated.compiler },
    });
    
    // Update average confidence
    this.updateAverageConfidence(generated.generationStats.confidence);
    
    this.log(`Discovered compiler ${compilerKey} in ${Date.now() - startTime}ms`);
    
    return {
      compiler: generated.compiler,
      sourceLanguage,
      targetLanguage,
      confidence: generated.generationStats.confidence,
      generationTime: Date.now() - startTime,
    };
  }

  /**
   * Auto-discover compiler based on context
   */
  async autoDiscoverCompiler(
    sourceCode: string,
    sourceLanguage: string,
    hints?: {
      targetRuntime?: string;
      domain?: string;
    }
  ): Promise<CompilerDiscoveryResult | null> {
    if (!this.options.enableDynamic || !this.llm) {
      return null;
    }
    
    // Use predictive transpiler if available
    if (this.predictiveTranspiler) {
      try {
        const predictions = await this.predictiveTranspiler.predict({
          source: sourceCode,
          sourceLanguage,
          context: {
            filePath: hints?.targetRuntime ? `index.${hints.targetRuntime}` : undefined,
          },
        });
        
        // Find target language predictions
        const targetPredictions = predictions.predictions.filter((p: any) => p.type === 'target');
        if (targetPredictions.length > 0) {
          const targetLanguage = targetPredictions[0].value as string;
          
          // Discover compiler
          return await this.discoverCompiler(sourceLanguage, targetLanguage, [sourceCode]);
        }
      } catch {
        // Fallback to LLM-based detection
      }
    }
    
    // Use LLM to predict target language
    const prompt = {
      system: `You are an expert compiler designer. Given source code in ${sourceLanguage},
predict the most likely target language(s) for compilation. Return ONLY a JSON array of:
["language1", "language2", ...]`,
      user: `Source code:\n${sourceCode.substring(0, 4000)}\n\nContext:\nRuntime: ${hints?.targetRuntime || 'universal'}\nDomain: ${hints?.domain || 'general'}`,
    };
    
    try {
      const response = await this.llm.generate(prompt);
      const parsed = JSON.parse(response.content) as string[];
      
      if (parsed.length > 0) {
        const targetLanguage = parsed[0];
        return await this.discoverCompiler(sourceLanguage, targetLanguage, [sourceCode]);
      }
    } catch {
      // Failed to predict
    }
    
    return null;
  }

  // ==========================================================================
  // Transform Discovery and Extension
  // ==========================================================================

  /**
   * Discover a new transform
   */
  async discoverTransform(
    options: TransformGenerationOptions
  ): Promise<TransformDiscoveryResult> {
    this.log(`Discovering transform: ${options.name}`);
    
    const startTime = Date.now();
    
    // Check if already exists
    if (this.learningData.transforms.has(options.name)) {
      return {
        transform: {
          transform: this.learningData.transforms.get(options.name)!,
          metadata: {
            name: options.name,
            description: options.description || '',
            sourceLanguage: options.sourceLanguage,
            targetLanguage: options.targetLanguage,
            categories: options.categories || [],
            priority: options.priority || 0,
            confidence: 1,
            dependencies: [],
            createdAt: 0,
            updatedAt: 0,
          },
          validation: {
            tests: [],
            passRate: 1,
            issues: [],
            coverage: {
              nodeTypes: { covered: [], total: [], percentage: 0 },
              patterns: { covered: [], total: [], percentage: 0 },
            },
          },
        },
        name: options.name,
        confidence: 1,
        generationTime: 0,
      };
    }
    
    // Generate transform
    const generated = await this.transformGenerator.generateTransform(options);
    
    // Register the transform
    this.learningData.transforms.set(options.name, generated.transform);
    this.stats.dynamicallyGeneratedTransforms++;
    this.stats.totalTransforms++;
    
    // Emit event
    this.emit({
      type: 'transform-added',
      timestamp: Date.now(),
      data: { name: options.name, transform: generated.transform, metadata: generated.metadata },
    });
    
    // Update average confidence
    this.updateAverageConfidence(generated.metadata.confidence);
    
    this.log(`Discovered transform ${options.name} in ${Date.now() - startTime}ms`);
    
    return {
      transform: generated,
      name: options.name,
      confidence: generated.metadata.confidence,
      generationTime: Date.now() - startTime,
    };
  }

  /**
   * Auto-discover transforms based on code patterns
   */
  async autoDiscoverTransforms(
    code: string,
    sourceLanguage: string,
    targetLanguage?: string
  ): Promise<TransformDiscoveryResult[]> {
    const results: TransformDiscoveryResult[] = [];
    
    if (!this.options.autoDiscoverPatterns || !this.llm) {
      return results;
    }
    
    // Use LLM to identify potential transforms
    const prompt = {
      system: `You are an expert code analyst. Analyze the following code and identify potential
transformations that could be applied. Return ONLY a JSON array of:
[
  {
    name: string;           // Transform name
    description: string;    // What it does
    patterns: string[];     // Code patterns it applies to
    priority: number;       // 0-10
  },
  ...
]`,
      user: `Code:\n${code.substring(0, 4000)}\n\nSource Language: ${sourceLanguage}\nTarget Language: ${targetLanguage || 'same'}`,
    };
    
    try {
      const response = await this.llm.generate(prompt);
      const parsed = JSON.parse(response.content) as Array<{
        name: string;
        description: string;
        patterns: string[];
        priority: number;
      }>;
      
      // Filter and sort by priority
      const filtered = parsed
        .filter(p => !this.learningData.transforms.has(p.name))
        .sort((a, b) => b.priority - a.priority)
        .slice(0, 5); // Top 5 transforms
      
      // Discover each transform
      for (const item of filtered) {
        try {
          const result = await this.discoverTransform({
            name: item.name,
            description: item.description,
            sourceLanguage,
            targetLanguage,
            inputPatterns: item.patterns.map(p => ({
              type: 'code-pattern' as const,
              value: p,
            })),
          });
          results.push(result);
        } catch {
          // Failed to discover this transform
        }
      }
    } catch {
      // Failed to analyze
    }
    
    return results;
  }

  // ==========================================================================
  // Learning System
  // ==========================================================================

  /**
   * Add a code example for learning
   */
  addCodeExample(
    source: string,
    language?: string,
    context?: {
      filePath?: string;
      repository?: string;
      domain?: string;
    },
    understanding?: CodeUnderstanding
  ): void {
    this.learningData.examples.push({
      source,
      language,
      context,
      understanding,
    });
    
    this.stats.samplesProcessed++;
    
    this.emit({
      type: 'sample-added',
      timestamp: Date.now(),
      data: {
        language,
        context,
        sampleCount: this.learningData.examples.length,
      },
    });
    
    // Check if we have enough samples for learning
    if (this.learningData.examples.length >= this.options.minSamplesForLearning) {
      this.queueLearningIteration();
    }
  }

  /**
   * Add multiple code examples
   */
  addCodeExamples(examples: CodeExample[]): void {
    for (const example of examples) {
      this.addCodeExample(
        example.source,
        example.language,
        example.context,
        example.understanding
      );
    }
  }

  /**
   * Start the learning loop
   */
  private startLearningLoop(): void {
    // In a real implementation, would set up a timer
    // For now, we'll process learning iterations on demand
    this.log('Learning loop started');
  }

  /**
   * Queue a learning iteration
   */
  private queueLearningIteration(): void {
    if (this.isProcessingQueue) {
      return;
    }
    
    // Process in the background
    setTimeout(async () => {
      await this.processLearningQueue();
    }, 0);
  }

  /**
   * Process the learning queue
   */
  private async processLearningQueue(): Promise<void> {
    if (this.isProcessingQueue) {
      return;
    }
    
    this.isProcessingQueue = true;
    this.emit({
      type: 'learning-started',
      timestamp: Date.now(),
      data: { sampleCount: this.learningData.examples.length },
    });
    
    try {
      // Process batches
      while (this.learningData.examples.length >= this.options.learningBatchSize) {
        const batch = this.learningData.examples.splice(0, this.options.learningBatchSize);
        await this.learnFromBatch(batch);
        this.stats.learningIterations++;
      }
      
      this.emit({
        type: 'learning-completed',
        timestamp: Date.now(),
        data: { iterations: this.stats.learningIterations },
      });
    } catch (error) {
      this.emit({
        type: 'error',
        timestamp: Date.now(),
        data: { error: String(error), context: 'learning' },
      });
    } finally {
      this.isProcessingQueue = false;
    }
  }

  /**
   * Learn from a batch of code examples
   */
  private async learnFromBatch(batch: CodeExample[]): Promise<void> {
    this.log(`Learning from batch of ${batch.length} examples`);
    
    // Group examples by language
    const byLanguage = new Map<string, CodeExample[]>();
    for (const example of batch) {
      const lang = example.language || 'unknown';
      if (!byLanguage.has(lang)) {
        byLanguage.set(lang, []);
      }
      byLanguage.get(lang)!.push(example);
    }
    
    // Analyze patterns in each language
    for (const [language, examples] of byLanguage) {
      await this.analyzeLanguagePatterns(language, examples);
    }
    
    // Cross-language analysis
    if (byLanguage.size > 1) {
      await this.analyzeCrossLanguagePatterns(byLanguage);
    }
    
    this.log(`Finished learning from batch`);
  }

  /**
   * Analyze patterns in a specific language
   */
  private async analyzeLanguagePatterns(language: string, examples: CodeExample[]): Promise<void> {
    // Extract code snippets
    const codeSnippets = examples.map(e => e.source);
    
    // Analyze for patterns
    const patterns = await this.extractPatternsFromCode(codeSnippets, language);
    
    // Store patterns
    for (const [pattern, analysis] of Object.entries(patterns)) {
      const key = `${language}:${pattern}`;
      if (!this.learningData.patterns.has(key)) {
        this.learningData.patterns.set(key, analysis);
      } else {
        // Merge analyses
        const existing = this.learningData.patterns.get(key)!;
        existing.frequency += analysis.frequency;
        existing.languages.push(...analysis.languages);
        existing.domains.push(...analysis.domains);
        existing.contexts.push(...analysis.contexts);
      }
    }
  }

  /**
   * Extract patterns from code
   */
  private async extractPatternsFromCode(codeSnippets: string[], language: string): Promise<Record<string, PatternAnalysis>> {
    const patterns: Record<string, PatternAnalysis> = {};
    
    // Use LLM to extract patterns
    if (this.llm) {
      const codeText = codeSnippets.join('\n---\n').substring(0, 8000);
      const prompt = {
        system: `You are an expert pattern analyst. Analyze the following code snippets and identify
repeating patterns. For each pattern, provide:
- The pattern string
- A regex that matches it
- Node types it involves
- How frequently it appears

Return ONLY a JSON object with:
{
  "pattern1": { pattern: string; regex: string; nodeTypes: string[]; frequency: number },
  "pattern2": { ... },
  ...
}`,
        user: `Code snippets (Language: ${language}):\n${codeText}`,
      };
      
      try {
        const response = await this.llm.generate(prompt);
        const parsed = JSON.parse(response.content);
        
        for (const [name, analysis] of Object.entries(parsed as Record<string, any>)) {
          patterns[name] = {
            pattern: analysis.pattern,
            regex: analysis.regex ? new RegExp(analysis.regex) : undefined,
            nodeTypes: analysis.nodeTypes || [],
            frequency: analysis.frequency || 1,
            languages: [language],
            domains: [],
            contexts: codeSnippets.map(() => language),
          };
        }
      } catch {
        // Fallback to simple pattern extraction
      }
    }
    
    // Simple pattern extraction
    const simplePatterns = this.extractSimplePatterns(codeSnippets);
    for (const [name, analysis] of Object.entries(simplePatterns)) {
      patterns[name] = {
        ...analysis,
        languages: [language],
        domains: [],
        contexts: codeSnippets.map(() => language),
      };
    }
    
    return patterns;
  }

  /**
   * Extract simple patterns without LLM
   */
  private extractSimplePatterns(codeSnippets: string[]): Record<string, PatternAnalysis> {
    const patterns: Record<string, PatternAnalysis> = {};
    
    // Count function declarations
    const functionCount = codeSnippets.reduce((count, code) => {
      return count + (code.match(/function\s+\w+/g)?.length || 0);
    }, 0);
    
    if (functionCount > 0) {
      patterns['function-declaration'] = {
        pattern: 'function <name>(...) { ... }',
        nodeTypes: ['FunctionDeclaration'],
        frequency: functionCount,
        languages: [],
        domains: [],
        contexts: [],
      };
    }
    
    // Count class declarations
    const classCount = codeSnippets.reduce((count, code) => {
      return count + (code.match(/class\s+\w+/g)?.length || 0);
    }, 0);
    
    if (classCount > 0) {
      patterns['class-declaration'] = {
        pattern: 'class <name> { ... }',
        nodeTypes: ['ClassDeclaration'],
        frequency: classCount,
        languages: [],
        domains: [],
        contexts: [],
      };
    }
    
    // Count arrow functions
    const arrowCount = codeSnippets.reduce((count, code) => {
      return count + (code.match(/=>/g)?.length || 0);
    }, 0);
    
    if (arrowCount > 0) {
      patterns['arrow-function'] = {
        pattern: '(...) => { ... }',
        nodeTypes: ['ArrowFunctionExpression'],
        frequency: arrowCount,
        languages: [],
        domains: [],
        contexts: [],
      };
    }
    
    // Count import statements
    const importCount = codeSnippets.reduce((count, code) => {
      return count + (code.match(/import\s+/g)?.length || code.match(/require\(/g)?.length || 0);
    }, 0);
    
    if (importCount > 0) {
      patterns['import-statement'] = {
        pattern: 'import ... from ... or require(...)',
        nodeTypes: ['ImportDeclaration'],
        frequency: importCount,
        languages: [],
        domains: [],
        contexts: [],
      };
    }
    
    return patterns;
  }

  /**
   * Analyze patterns across languages
   */
  private async analyzeCrossLanguagePatterns(byLanguage: Map<string, CodeExample[]>): Promise<void> {
    // Find common patterns across languages
    const allPatterns = new Map<string, { pattern: PatternAnalysis; languages: string[] }>();
    
    for (const [language, examples] of byLanguage) {
      const patterns = await this.extractPatternsFromCode(examples.map(e => e.source), language);
      
      for (const [name, analysis] of Object.entries(patterns)) {
        if (!allPatterns.has(name)) {
          allPatterns.set(name, { pattern: analysis, languages: [language] });
        } else {
          const existing = allPatterns.get(name)!;
          existing.languages.push(language);
        }
      }
    }
    
    // Identify cross-language patterns
    const crossLanguagePatterns = Array.from(allPatterns.values())
      .filter(p => p.languages.length > 1);
    
    if (crossLanguagePatterns.length > 0 && this.llm) {
      // Use LLM to suggest cross-language transforms
      const prompt = {
        system: `You are an expert cross-language analyst. Given the following patterns that appear in multiple languages,
suggest transforms to convert between them. Return ONLY a JSON array of:
[
  {
    name: string;
    description: string;
    sourceLanguage: string;
    targetLanguage: string;
    pattern: string;
  },
  ...
]`,
        user: `Cross-language patterns:\n${JSON.stringify(crossLanguagePatterns.map(p => ({
          pattern: p.pattern.pattern,
          languages: p.languages,
          frequency: p.pattern.frequency,
        })), null, 2)}`,
      };
      
      try {
        const response = await this.llm.generate(prompt);
        const parsed = JSON.parse(response.content);
        
        // Queue transforms for discovery
        for (const item of parsed) {
          this.queueExtension({
            type: 'transform',
            name: item.name,
            data: {
              description: item.description,
              sourceLanguage: item.sourceLanguage,
              targetLanguage: item.targetLanguage,
              inputPatterns: [{ type: 'code-pattern', value: item.pattern }],
            },
          });
        }
      } catch {
        // Failed to suggest transforms
      }
    }
  }

  // ==========================================================================
  // Extension Queue Management
  // ==========================================================================

  /**
   * Queue an extension request
   */
  queueExtension(request: ExtensionRequest): void {
    // Check priority and position in queue
    const priority = request.priority || 0;
    
    if (priority > 5) {
      // High priority: insert at front
      this.extensionQueue.unshift(request);
    } else {
      // Normal priority: add to end
      this.extensionQueue.push(request);
    }
    
    // Process queue if not already processing
    this.processExtensionQueue();
  }

  /**
   * Process the extension queue
   */
  private async processExtensionQueue(): Promise<void> {
    if (this.isProcessingQueue) {
      return;
    }
    
    this.isProcessingQueue = true;
    
    while (this.extensionQueue.length > 0) {
      const request = this.extensionQueue.shift()!;
      
      try {
        switch (request.type) {
          case 'language':
            await this.discoverLanguage(
              request.name,
              [request.data.source],
              request.data.options
            );
            break;
          
          case 'compiler':
            await this.discoverCompiler(
              request.data.sourceLanguage,
              request.data.targetLanguage,
              [request.data.source],
              request.data.options
            );
            break;
          
          case 'transform':
            await this.discoverTransform(request.data);
            break;
        }
        
        // Call callback if provided
        if (request.callback) {
          request.callback({ success: true });
        }
      } catch (error) {
        // Call callback with error
        if (request.callback) {
          request.callback({ success: false, error: String(error) });
        }
      }
    }
    
    this.isProcessingQueue = false;
  }

  // ==========================================================================
  // Integration with Other Components
  // ==========================================================================

  /**
   * Set the predictive transpiler for prediction-based extension
   */
  setPredictiveTranspiler(transpiler: PredictiveTranspiler): void {
    this.predictiveTranspiler = transpiler;
  }

  /**
   * Learn from repository analysis
   */
  async learnFromRepository(analysis: RepositoryAnalysis): Promise<void> {
    if (!this.options.enableLearning) {
      return;
    }
    
    // Add code examples from the repository
    for (const file of analysis.files) {
      this.addCodeExample(file.content, file.language, {
        filePath: file.path,
        repository: analysis.repository,
      });
    }
  }

  /**
   * Learn from autonomous code understanding
   */
  async learnFromUnderstanding(understanding: CodeUnderstanding): Promise<void> {
    if (!this.options.enableLearning || !understanding.source) {
      return;
    }
    
    this.addCodeExample(understanding.source, understanding.language, {
      domain: understanding.intent?.domain,
    }, understanding);
  }

  // ==========================================================================
  // Event System
  // ==========================================================================

  /**
   * Add an event listener
   */
  addEventListener(listener: SelfExtendingEventListener): void {
    this.listeners.add(listener);
  }

  /**
   * Remove an event listener
   */
  removeEventListener(listener: SelfExtendingEventListener): void {
    this.listeners.delete(listener);
  }

  /**
   * Emit an event
   */
  private emit(event: SelfExtendingEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // Listener error, don't break others
      }
    }
    
    this.log(`Event: ${event.type}`, event.data);
  }

  // ==========================================================================
  // Statistics and Monitoring
  // ==========================================================================

  /**
   * Get current statistics
   */
  getStats(): SelfExtendingStats {
    return { ...this.stats };
  }

  /**
   * Get learning data summary
   */
  getLearningSummary(): {
    languages: string[];
    compilers: string[];
    transforms: string[];
    patternCount: number;
    sampleCount: number;
  } {
    return {
      languages: Array.from(this.learningData.languages.keys()),
      compilers: Array.from(this.learningData.compilers.keys()),
      transforms: Array.from(this.learningData.transforms.keys()),
      patternCount: this.learningData.patterns.size,
      sampleCount: this.learningData.examples.length,
    };
  }

  /**
   * Update average confidence
   */
  private updateAverageConfidence(newConfidence: number): void {
    const currentTotal = this.stats.averageConfidence * this.stats.dynamicallyGeneratedLanguages;
    const newTotal = currentTotal + newConfidence;
    const newCount = this.stats.dynamicallyGeneratedLanguages + 1;
    this.stats.averageConfidence = newTotal / newCount;
  }

  // ==========================================================================
  // Utility Methods
  // ==========================================================================

  /**
   * Get or create a parser for a language
   */
  async getParser(language: string, code: string): Promise<Parser> {
    // Check if already have parser
    if (this.learningData.languages.has(language)) {
      const def = this.learningData.languages.get(language)!;
      return def.parser;
    }
    
    // Try to auto-discover
    const result = await this.autoDiscoverLanguage(code, {
      filePath: `test.${language}`,
    });
    
    if (result) {
      return result.parser;
    }
    
    // Fallback to basic parser
    return this.createBasicParser();
  }

  /**
   * Get or create a compiler for a language pair
   */
  async getCompiler(
    sourceLanguage: string,
    targetLanguage: string,
    code: string
  ): Promise<Compiler | null> {
    const compilerKey = `${sourceLanguage}->${targetLanguage}`;
    
    // Check if already have compiler
    if (this.learningData.compilers.has(compilerKey)) {
      return this.learningData.compilers.get(compilerKey)!;
    }
    
    // Try to auto-discover
    const result = await this.autoDiscoverCompiler(code, sourceLanguage);
    
    if (result) {
      return result.compiler;
    }
    
    return null;
  }

  /**
   * Get or create a transform
   */
  async getTransform(name: string, options?: Partial<TransformGenerationOptions>): Promise<Transform | null> {
    // Check if already have transform
    if (this.learningData.transforms.has(name)) {
      return this.learningData.transforms.get(name)!;
    }
    
    // Try to discover
    const defaultOptions: TransformGenerationOptions = {
      name,
      description: `Transform: ${name}`,
      sourceLanguage: 'javascript',
      ...options,
    };
    
    const result = await this.discoverTransform(defaultOptions);
    
    if (result) {
      return result.transform.transform;
    }
    
    return null;
  }

  private log(...args: any[]): void {
    if (this.options.debug) {
      console.log('[SelfExtendingSystem]', ...args);
    }
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createSelfExtendingSystem(
  llm?: LLMClient,
  _cache?: CacheManager,
  _repositoryAnalyzer?: CrossRepositoryAnalyzer,
  predictiveTranspiler?: PredictiveTranspiler,
  options?: SelfExtendingSystemOptions
): SelfExtendingSystem {
  return new SelfExtendingSystem(
    llm,
    _cache,
    _repositoryAnalyzer,
    predictiveTranspiler,
    options
  );
}

// ============================================================================
// Type Exports
// ============================================================================

export type {
  ParserGenerator,
  CompilerGenerator,
  TransformGenerator,
  GeneratedTransform,
};
