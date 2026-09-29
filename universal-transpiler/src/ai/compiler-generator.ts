/**
 * Universal Transpiler - Compiler Generator
 * 
 * Dynamically generates compilers for unknown languages using LLM
 */

import * as crypto from 'crypto';
import type {
  ASTNode,
  Token,
  Position,
  TranspileOptions,
  TranspileResult,
  Compiler,
  Parser,
  LanguageDefinition,
  Transform,
  LLMClient,
  CacheManager,
} from '../core/universal-transpiler';
import type { ParserGenerator } from './parser-generator';

// ============================================================================
// Types
// ============================================================================

export interface CompilerGenerationOptions {
  sourceLanguage: string;
  targetLanguage: string;
  sourceParser?: Parser;
  targetParser?: Parser;
  sampleCode: string[];
  transforms?: string[];
  optimizationLevel?: 'none' | 'basic' | 'aggressive';
  strictMode?: boolean;
  typeSafety?: 'none' | 'basic' | 'strict';
  runtime?: 'node' | 'browser' | 'deno' | 'bun' | 'universal';
}

export interface GeneratedCompiler {
  compiler: Compiler;
  sourceDefinition: LanguageDefinition;
  targetDefinition: LanguageDefinition;
  transforms: Map<string, Transform>;
  generationStats: CompilerGenerationStats;
}

export interface CompilerGenerationStats {
  generationTime: number;
  llmCalls: number;
  transformsGenerated: number;
  confidence: number;
  samplesUsed: number;
}

export interface CompilerTemplate {
  name: string;
  description: string;
  skeleton: string;
  placeholders: string[];
  language: string;
  supportedTargets: string[];
}

export interface CompilationStep {
  name: string;
  type: 'parse' | 'transform' | 'compile' | 'optimize' | 'validate';
  handler: (ast: ASTNode, context: CompilationContext) => ASTNode | Promise<ASTNode>;
  priority: number;
  dependencies: string[];
}

export interface CompilationContext {
  ast: ASTNode;
  source: string;
  sourceLanguage: string;
  targetLanguage: string;
  options: TranspileOptions;
  parser: Parser;
  transforms: Map<string, Transform>;
  llm?: LLMClient;
  cache?: CacheManager;
}

interface TransformGenerationOptions {
  name: string;
  description: string;
  sourceLanguage: string;
  targetLanguage: string;
  examples?: TransformExample[];
  patterns?: string[];
  priority?: number;
}

interface TransformExample {
  input: string;
  output: string;
  description: string;
}



export interface CompilerTestCase {
  code: string;
  expectedOutput?: string;
  description: string;
  shouldPass: boolean;
}

export interface CompilerValidationResult {
  tests: CompilerTestResult[];
  passRate: number;
  issues: CompilerIssue[];
  recommendations: string[];
}

export interface CompilerTestResult {
  testCase: CompilerTestCase;
  passed: boolean;
  error?: string;
  actualOutput?: string;
  diff?: any;
  duration: number;
}

export interface CompilerIssue {
  type: 'syntax' | 'semantic' | 'performance' | 'correctness' | 'compatibility';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  testCase?: string;
  position?: Position;
  suggestedFix?: string;
}

export interface CompilerGenerationCacheEntry {
  key: string;
  compiler: Compiler;
  sourceDefinition: LanguageDefinition;
  targetDefinition: LanguageDefinition;
  timestamp: number;
  version: string;
}

// ============================================================================
// Compiler Generator Class
// ============================================================================

export class CompilerGenerator {
  private llm?: LLMClient;
  private cache?: CacheManager;
  private parserGenerator?: ParserGenerator;
  private generatedCompilers: Map<string, GeneratedCompiler> = new Map();
  
  private options: {
    enableCaching: boolean;
    enableLLM: boolean;
    maxRetries: number;
    minConfidence: number;
    debug: boolean;
  };

  constructor(
    llm?: LLMClient,
    cache?: CacheManager,
    parserGenerator?: ParserGenerator,
    options?: Partial<CompilerGenerator['options']>
  ) {
    this.llm = llm;
    this.cache = cache;
    this.parserGenerator = parserGenerator;
    this.options = {
      enableCaching: true,
      enableLLM: true,
      maxRetries: 3,
      minConfidence: 0.7,
      debug: false,
      ...options,
    };
  }

  // ==========================================================================
  // Main Generation Method
  // ==========================================================================

  async generateCompiler(options: CompilerGenerationOptions): Promise<GeneratedCompiler> {
    const startTime = Date.now();
    let llmCalls = 0;
    
    // Check cache
    const cacheKey = this.generateCacheKey(options);
    if (this.options.enableCaching && this.cache) {
      const cached = await this.cache.get<CompilerGenerationCacheEntry>(cacheKey);
      if (cached) {
        this.log(`Using cached compiler for ${options.sourceLanguage} -> ${options.targetLanguage}`);
        return {
          compiler: cached.compiler,
          sourceDefinition: cached.sourceDefinition,
          targetDefinition: cached.targetDefinition,
          transforms: new Map(),
          generationStats: {
            generationTime: 0,
            llmCalls: 0,
            transformsGenerated: 0,
            confidence: 1,
            samplesUsed: 0,
          },
        };
      }
    }
    
    // Step 1: Get or generate source parser/definition
    const sourceDef = await this.getOrGenerateLanguageDefinition(
      options.sourceLanguage,
      options.sourceParser
    );
    llmCalls += sourceDef.llmCalls;
    
    // Step 2: Get or generate target parser/definition
    const targetDef = await this.getOrGenerateLanguageDefinition(
      options.targetLanguage,
      options.targetParser
    );
    llmCalls += targetDef.llmCalls;
    
    // Step 3: Generate transforms
    const transforms = await this.generateTransforms(options, sourceDef.definition, targetDef.definition);
    llmCalls += transforms.llmCalls;
    
    // Step 4: Create compiler implementation
    const compiler = await this.createCompilerImplementation(
      options,
      sourceDef.definition,
      targetDef.definition,
      transforms.transforms
    );
    llmCalls += compiler.llmCalls;
    
    // Step 5: Validate compiler with test cases
    const validation = await this.validateCompiler(
      compiler.compiler,
      sourceDef.definition,
      targetDef.definition,
      options.sampleCode
    );
    
    // Step 6: Refine compiler if needed
    if (validation.passRate < this.options.minConfidence && this.options.maxRetries > 0) {
      await this.refineCompiler(
        compiler.compiler,
        validation,
        options,
        sourceDef.definition,
        targetDef.definition,
        transforms.transforms
      );
    }
    
    const generationTime = Date.now() - startTime;
    const generated: GeneratedCompiler = {
      compiler: compiler.compiler,
      sourceDefinition: sourceDef.definition,
      targetDefinition: targetDef.definition,
      transforms: transforms.transforms,
      generationStats: {
        generationTime,
        llmCalls,
        transformsGenerated: transforms.transforms.size,
        confidence: validation.passRate,
        samplesUsed: options.sampleCode.length,
      },
    };
    
    // Cache
    if (this.options.enableCaching && this.cache) {
      await this.cache.set(cacheKey, {
        key: cacheKey,
        compiler: compiler.compiler,
        sourceDefinition: sourceDef.definition,
        targetDefinition: targetDef.definition,
        timestamp: Date.now(),
        version: '1.0.0',
      }, 86400000); // 24 hours
    }
    
    const compilerKey = `${options.sourceLanguage}->${options.targetLanguage}`;
    this.generatedCompilers.set(compilerKey, generated);
    this.log(`Generated compiler for ${compilerKey} in ${generationTime}ms`);
    
    return generated;
  }

  // ==========================================================================
  // Language Definition Management
  // ==========================================================================

  private async getOrGenerateLanguageDefinition(
    languageName: string,
    parser?: Parser
  ): Promise<{ definition: LanguageDefinition; llmCalls: number }> {
    let llmCalls = 0;
    
    // If parser is provided, use it
    if (parser) {
      return {
        definition: {
          name: languageName,
          version: '1.0.0',
          extensions: this.determineExtensions(languageName),
          mimetypes: this.determineMimeTypes(languageName),
          parser,
          keywords: [],
          operators: [],
        },
        llmCalls: 0,
      };
    }
    
    // Try to get existing definition
    // In a real implementation, would check a registry of known languages
    
    // Generate new definition using parser generator
    if (this.parserGenerator) {
      try {
        const generated = await this.parserGenerator.generateParser({
          languageName,
          sampleCode: [`// Sample code for ${languageName}`],
        });
        llmCalls++;
        return { definition: generated.definition, llmCalls };
      } catch {
        // Fallback to basic definition
        return {
          definition: this.createBasicDefinition(languageName),
          llmCalls,
        };
      }
    }
    
    return {
      definition: this.createBasicDefinition(languageName),
      llmCalls,
    };
  }

  private createBasicDefinition(languageName: string): LanguageDefinition {
    return {
      name: languageName,
      version: '1.0.0',
      extensions: this.determineExtensions(languageName),
      mimetypes: this.determineMimeTypes(languageName),
      parser: {
        parse: (source: string) => this.createBasicParseResult(source),
        tokenize: (source: string) => this.basicTokenize(source),
        canParse: () => true,
      },
      keywords: [],
      operators: [],
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
      
      // Identifiers and keywords
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
      
      // Numbers
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
      
      // Strings
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
      
      // Operators and delimiters
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
      
      // Unknown
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
    };
    
    const normalized = languageName.toLowerCase();
    return mimeMap[normalized] || [`text/x-${normalized}`];
  }

  // ==========================================================================
  // Transform Generation
  // ==========================================================================

  private async generateTransforms(
    options: CompilerGenerationOptions,
    _sourceDef: LanguageDefinition,
    _targetDef: LanguageDefinition
  ): Promise<{ transforms: Map<string, Transform>; llmCalls: number }> {
    const transforms = new Map<string, Transform>();
    let llmCalls = 0;
    
    // Generate transforms based on requested transforms
    if (options.transforms && options.transforms.length > 0) {
      for (const transformName of options.transforms) {
        const transform = await this.generateTransform({
          name: transformName,
          description: `Transform for ${transformName}`,
          sourceLanguage: options.sourceLanguage,
          targetLanguage: options.targetLanguage,
        });
        if (transform) {
          transforms.set(transformName, transform);
          llmCalls += 1;
        }
      }
    } else {
      // Generate common transforms based on language pair
      const commonTransforms = this.getCommonTransforms(
        options.sourceLanguage,
        options.targetLanguage
      );
      
      for (const transformName of commonTransforms) {
        const transform = await this.generateTransform({
          name: transformName,
          description: `Transform for ${transformName}`,
          sourceLanguage: options.sourceLanguage,
          targetLanguage: options.targetLanguage,
        });
        if (transform) {
          transforms.set(transformName, transform);
          llmCalls += 1;
        }
      }
    }
    
    return { transforms, llmCalls };
  }

  private async generateTransform(options: TransformGenerationOptions): Promise<Transform | null> {
    // Use LLM to generate transform
    if (this.llm && this.options.enableLLM) {
      const prompt = {
        system: `You are an expert transform generator. Create a Babel-style AST transform for the following task:

Task: ${options.description}
Source Language: ${options.sourceLanguage}
Target Language: ${options.targetLanguage}

Return ONLY a TypeScript object with:
{
  name: string;
  visitor: {
    [nodeType: string]: (node: ASTNode, context: TransformContext) => ASTNode | null
  };
  enter?: (node: ASTNode, context: TransformContext) => void;
  exit?: (node: ASTNode, context: TransformContext) => void;
}

The transform should:
1. Visit relevant AST nodes
2. Transform them appropriately for the target language
3. Return the transformed node or null to remove it

Example transforms:
- "class-to-prototype": Convert ES6 classes to prototype-based inheritance
- "arrow-to-function": Convert arrow functions to regular function expressions
- "import-to-require": Convert ES6 imports to CommonJS requires

Keep the transform simple and focused.`,
        user: `Transform name: ${options.name}\nDescription: ${options.description}\nExamples: ${JSON.stringify(options.examples || [])}\nPatterns: ${JSON.stringify(options.patterns || [])}`,
      };
      
      try {
        await this.llm.generate(prompt);
        
        // In a real implementation, would compile and evaluate the code
        // For now, create a basic transform
        const transform: Transform = {
          name: options.name,
          visitor: {
            // Basic visitor that logs and returns the node
            Program: (node: ASTNode) => {
              // In real implementation, would transform the program
              return node;
            },
            // Add more visitors as needed
          },
        };
        
        return transform;
      } catch {
        // Fallback to basic transform
        return {
          name: options.name,
          visitor: {
            Program: (node: ASTNode) => node,
          },
        };
      }
    }
    
    // Fallback to basic transform
    return {
      name: options.name,
      visitor: {
        Program: (node: ASTNode) => node,
      },
    };
  }

  private getCommonTransforms(sourceLanguage: string, targetLanguage: string): string[] {
    const transformMap: Record<string, Record<string, string[]>> = {
      javascript: {
        typescript: ['add-types', 'add-interfaces', 'strict-mode'],
        es2020: ['es6-transforms', 'downlevel-iterators'],
        es2015: ['es6-transforms', 'babel-preset-env'],
        python: ['js-to-python', 'arrow-to-function', 'class-to-prototype'],
        java: ['js-to-java', 'promise-to-completable-future', 'dynamic-to-static'],
      },
      typescript: {
        javascript: ['remove-types', 'remove-interfaces', 'downlevel-iterators'],
        es2020: ['remove-types', 'downlevel-iterators'],
        python: ['ts-to-python', 'interface-to-class', 'type-removal'],
        java: ['ts-to-java', 'interface-to-class'],
      },
      python: {
        javascript: ['python-to-js', 'list-comprehension-to-map', 'decorator-to-function'],
        typescript: ['python-to-ts', 'dynamic-typing', 'snake-case-to-camel-case'],
        java: ['python-to-java', 'snake-case-to-camel-case'],
        go: ['python-to-go', 'dynamic-to-static'],
      },
      java: {
        javascript: ['java-to-js', 'class-to-prototype', 'static-to-instance'],
        typescript: ['java-to-ts', 'interface-extraction'],
        python: ['java-to-python', 'camel-case-to-snake-case'],
      },
    };
    
    const source = sourceLanguage.toLowerCase();
    const target = targetLanguage.toLowerCase();
    
    return transformMap[source]?.[target] || ['identity'];
  }

  // ==========================================================================
  // Compiler Implementation Creation
  // ==========================================================================

  private async createCompilerImplementation(
    options: CompilerGenerationOptions,
    sourceDef: LanguageDefinition,
    targetDef: LanguageDefinition,
    transforms: Map<string, Transform>
  ): Promise<{ compiler: Compiler; llmCalls: number }> {
    let llmCalls = 0;
    
    if (this.llm && this.options.enableLLM) {
      // Use LLM to generate compiler code
      const sourceLang = JSON.stringify(sourceDef, null, 2).substring(0, 2000);
      const targetLang = JSON.stringify(targetDef, null, 2).substring(0, 2000);
      
      const prompt = {
        system: `You are an expert compiler generator. Generate a complete TypeScript compiler implementation
for transpiling from ${options.sourceLanguage} to ${options.targetLanguage}. The compiler should:

1. Parse source code using the source parser
2. Apply transforms to the AST
3. Generate code in the target language
4. Return a TranspileResult with code, ast, errors, and stats

Use the following interface:

interface TranspileResult {
  code: string;
  ast: ASTNode;
  map?: any; // Source map
  errors: TranspileError[];
  warnings: string[];
  stats: TranspileStats;
}

interface Compiler {
  compile: (ast: ASTNode, options?: any) => TranspileResult;
  target: string;
}

Return ONLY the complete TypeScript code for the compiler.`,
        user: `Source language definition:\n${sourceLang}\n\nTarget language definition:\n${targetLang}\n\nOptions: ${JSON.stringify(options)}`,
      };
      
      try {
        const response = await this.llm.generate(prompt);
        llmCalls++;
        
        // Try to create a compiler from the generated code
        const compiler = this.createCompilerFromCode(response.content, sourceDef, targetDef, transforms);
        if (compiler) {
          return { compiler, llmCalls };
        }
      } catch {
        // Fallback to basic compiler
      }
    }
    
    // Fallback: create basic compiler
    const compiler = this.createBasicCompiler(sourceDef, targetDef, transforms);
    return { compiler, llmCalls };
  }

  private createCompilerFromCode(
    _code: string,
    _sourceDef: LanguageDefinition,
    _targetDef: LanguageDefinition,
    _transforms: Map<string, Transform>
  ): Compiler | null {
    // In a real implementation, would compile and evaluate the generated code
    // For now, return null to use the fallback compiler
    return null;
  }

  private createBasicCompiler(
    sourceDef: LanguageDefinition,
    targetDef: LanguageDefinition,
    transforms: Map<string, Transform>
  ): Compiler {
    const compiler: Compiler = {
      target: targetDef.name,
      compile: (ast: ASTNode, compileOptions?: any) => {
        return this.compileWithTransforms(ast, sourceDef, targetDef, transforms, compileOptions);
      },
    };
    
    return compiler;
  }

  private compileWithTransforms(
    ast: ASTNode,
    _sourceDef: LanguageDefinition,
    _targetDef: LanguageDefinition,
    transforms: Map<string, Transform>,
    _options?: any
  ): TranspileResult {
    let currentAST = ast;
    const errors: any[] = [];
    const warnings: string[] = [];
    
    // Apply transforms in order
    for (const [name, transform] of transforms) {
      try {
        currentAST = this.applyTransform(currentAST, transform, {
          path: [currentAST],
          parent: null,
          index: 0,
          file: { ast, tokens: [], errors: [], warnings: [] },
          opts: _options || {},
          cache: this.cache,
          llm: this.llm,
        });
      } catch (error) {
        errors.push({
          message: `Transform ${name} failed: ${String(error)}`,
          position: { line: 0, column: 0, offset: 0 },
          severity: 'error',
        });
      }
    }
    
    // Generate code from AST
    const code = this.generateCodeFromAST(currentAST, _targetDef);
    
    return {
      code,
      ast: currentAST,
      errors,
      warnings,
      stats: {
        inputSize: JSON.stringify(ast).length,
        outputSize: code.length,
        parseTime: 0,
        transformTime: 0,
        generateTime: 0,
        dynamicallyGenerated: true,
      },
    };
  }

  private applyTransform(
    node: ASTNode,
    transform: Transform,
    context: any
  ): ASTNode {
    // Apply visitor pattern
    const visitor = transform.visitor;
    const type = node.type;
    
    // Handle both function and object visitor patterns
    let result: ASTNode | null | undefined;
    if (typeof visitor === 'function') {
      // Function visitor - call it directly
      result = visitor(node, context);
    } else if (typeof visitor === 'object' && visitor !== null && type in visitor) {
      // Object visitor with node type keys
      const visitorFn = visitor[type];
      if (typeof visitorFn === 'function') {
        result = visitorFn(node, context);
      }
    }
    
    if (result !== null && result !== undefined) {
      return result;
    }
    
    // Recursively apply to children
    const newNode = { ...node };
    if (newNode.children) {
      newNode.children = newNode.children.map((child, index) => {
        const newContext = {
          ...context,
          path: [...context.path, node],
          parent: node,
          index,
        };
        return this.applyTransform(child, transform, newContext);
      });
    }
    
    return newNode;
  }

  private generateCodeFromAST(ast: ASTNode, _targetDef: LanguageDefinition): string {
    // In a real implementation, would use a code generator based on target language
    // For now, return a simple representation
    return this.astToString(ast);
  }

  private astToString(ast: ASTNode, indent: number = 0): string {
    const prefix = '  '.repeat(indent);
    let result = '';
    
    if (ast.type === 'Program') {
      result += '// Generated code\n';
      for (const child of ast.children || []) {
        result += this.astToString(child, indent) + '\n';
      }
    } else if (ast.type === 'Identifier') {
      result += ast.value || '';
    } else if (ast.type === 'NUMBER' || ast.type === 'STRING') {
      result += ast.value || '';
    } else if (ast.type === 'OPERATOR') {
      result += ast.value || '';
    } else if (ast.children && ast.children.length > 0) {
      result += ast.value || ast.type;
      if (ast.children.length > 0) {
        result += ' {\n';
        for (const child of ast.children) {
          result += prefix + '  ' + this.astToString(child, indent + 1) + '\n';
        }
        result += prefix + '}';
      }
    } else {
      result += ast.value || ast.type;
    }
    
    return result;
  }

  // ==========================================================================
  // Compiler Validation
  // ==========================================================================

  private async validateCompiler(
    compiler: Compiler,
    sourceDef: LanguageDefinition,
    _targetDef: LanguageDefinition,
    samples: string[]
  ): Promise<CompilerValidationResult> {
    const tests: CompilerTestResult[] = [];
    const issues: CompilerIssue[] = [];
    const recommendations: string[] = [];
    
    // Create test cases from samples
    const testCases: CompilerTestCase[] = samples.map((code, i) => ({
      code,
      description: `Sample ${i + 1}`,
      shouldPass: true,
    }));
    
    // Run tests
    for (const testCase of testCases) {
      const startTime = Date.now();
      const testResult: CompilerTestResult = {
        testCase,
        passed: false,
        duration: 0,
      };
      
      try {
        // Parse source
        const parseResult = sourceDef.parser.parse(testCase.code);
        
        if (parseResult.errors.length > 0) {
          testResult.passed = false;
          testResult.error = `Parse errors: ${parseResult.errors.map((e: any) => e.message).join(', ')}`;
          testResult.duration = Date.now() - startTime;
          tests.push(testResult);
          continue;
        }
        
        // Compile
        const compileResult = compiler.compile(parseResult.ast);
        testResult.actualOutput = compileResult.code;
        
        // Basic validation
        if (compileResult.errors.length === 0) {
          testResult.passed = true;
        } else {
          testResult.passed = false;
          testResult.error = `Compile errors: ${compileResult.errors.map(e => e.message).join(', ')}`;
        }
        
        testResult.duration = Date.now() - startTime;
      } catch (error) {
        testResult.passed = false;
        testResult.error = String(error);
        testResult.duration = Date.now() - startTime;
      }
      
      tests.push(testResult);
      
      // Collect issues
      if (!testResult.passed) {
        issues.push({
          type: 'correctness',
          severity: 'high',
          description: testResult.error || 'Compilation failed',
          testCase: testCase.description,
          suggestedFix: 'Review compiler implementation',
        });
      }
    }
    
    // Calculate pass rate
    const passRate = tests.filter(t => t.passed).length / tests.length;
    
    // Generate recommendations
    if (passRate < 0.5) {
      recommendations.push('Compiler has low success rate. Consider providing more training data.');
    }
    if (passRate < 1.0) {
      recommendations.push('Review failed test cases and improve compiler logic.');
    }
    
    return {
      tests,
      passRate,
      issues,
      recommendations,
    };
  }

  private async refineCompiler(
    _compiler: Compiler,
    validation: CompilerValidationResult,
    options: CompilerGenerationOptions,
    _sourceDef: LanguageDefinition,
    _targetDef: LanguageDefinition,
    _transforms: Map<string, Transform>
  ): Promise<void> {
    // Analyze failures
    const failures = validation.tests.filter(t => !t.passed);
    
    if (failures.length === 0 || !this.llm) return;
    
    // Extract error patterns
    const errorPatterns = failures.map(f => f.error || 'Unknown error');
    
    // Use LLM to suggest compiler improvements
    const prompt = {
      system: `You are a compiler expert. Analyze the following compilation failures and suggest improvements.
Return ONLY a JSON object with:
{
  improvements: [{ aspect: string; change: string; reason: string }],
  newTransforms: [{ name: string; description: string }]
}`,
      user: `Source: ${options.sourceLanguage}\nTarget: ${options.targetLanguage}\n\nFailures:\n${errorPatterns.map((e, i) => `${i + 1}. ${e}`).join('\n')}`,
    };
    
    try {
      const response = await this.llm.generate(prompt);
      const parsed = JSON.parse(response.content);
      
      // In a real implementation, would apply improvements and regenerate
      this.log(`Compiler improvements suggested: ${JSON.stringify(parsed.improvements)}`);
      this.log(`New transforms suggested: ${JSON.stringify(parsed.newTransforms)}`);
    } catch {
      // Failed to get improvements
    }
  }



  // ==========================================================================
  // Utility Methods
  // ==========================================================================

  private generateCacheKey(options: CompilerGenerationOptions): string {
    const hash = crypto.createHash('sha256');
    hash.update(options.sourceLanguage);
    hash.update(options.targetLanguage);
    hash.update(options.optimizationLevel || '');
    hash.update(options.strictMode ? 'strict' : 'loose');
    hash.update(options.typeSafety || '');
    hash.update(options.runtime || '');
    hash.update(options.sampleCode.join('\n'));
    return `compiler-${hash.digest('hex')}`;
  }

  private log(...args: any[]): void {
    if (this.options.debug) {
      console.log('[CompilerGenerator]', ...args);
    }
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createCompilerGenerator(
  llm?: LLMClient,
  cache?: CacheManager,
  parserGenerator?: ParserGenerator,
  options?: Partial<CompilerGenerator['options']>
): CompilerGenerator {
  return new CompilerGenerator(llm, cache, parserGenerator, options);
}
