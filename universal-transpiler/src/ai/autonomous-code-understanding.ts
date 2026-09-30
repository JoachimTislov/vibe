/**
 * Universal Transpiler - Autonomous Code Understanding
 * 
 * A self-learning system that can understand code without prior knowledge
 */

import * as crypto from 'crypto';
import type {
  ASTNode,
  Token,
  Position,
} from '../core/universal-transpiler';
import type { LLMClient, CacheManager } from '../core/universal-transpiler';

// ============================================================================
// Types
// ============================================================================

export type UnderstandingLevel = 'none' | 'syntactic' | 'semantic' | 'intentional' | 'contextual';

export interface CodeUnderstanding {
  id: string;
  hash: string;
  source: string;
  language?: string;
  levels: {
    syntactic: boolean;
    semantic: boolean;
    intentional: boolean;
    contextual: boolean;
  };
  syntax?: {
    structure: string;
    tokens: Token[];
    ast?: ASTNode;
    pattern: string;
    grammar?: any;
  };
  semantics?: {
    types: Record<string, TypeInference>;
    variables: Record<string, VariableInfo>;
    functions: Record<string, FunctionInfo>;
    classes: Record<string, ClassInfo>;
    imports: ImportInfo[];
    exports: ExportInfo[];
    dependencies: DependencyInfo[];
  };
  intent?: {
    purpose: string;
    goals: string[];
    algorithms: AlgorithmInfo[];
    patterns: DesignPatternInfo[];
    domain: string;
  };
  context?: {
    relatedCode: RelatedCodeInfo[];
    usagePatterns: UsagePatternInfo[];
    evolution: EvolutionInfo;
    documentation: DocumentationInfo;
  };
  confidence: {
    syntactic: number;
    semantic: number;
    intentional: number;
    contextual: number;
    overall: number;
  };
  metadata: {
    createdAt: number;
    updatedAt: number;
    analyzedBy: string[];
    complexity: number;
    quality: number;
    maintainability: number;
  };
}

export interface TypeInference {
  type: string;
  literal?: any;
  inferredFrom?: string;
  possibleTypes?: string[];
  confidence: number;
  source?: string;
}

export interface VariableInfo {
  name: string;
  type: TypeInference;
  kind: 'let' | 'const' | 'var' | 'parameter' | 'property' | 'global';
  scope: string;
  declaration: Position;
  usages: Position[];
  initialValue?: any;
  isReassigned: boolean;
  isMutable: boolean;
}

export interface FunctionInfo {
  name: string;
  kind: 'function' | 'method' | 'arrow' | 'lambda' | 'constructor';
  parameters: ParameterInfo[];
  returnType: TypeInference;
  body: CodeBlockInfo;
  calls: FunctionCallInfo[];
  isAsync: boolean;
  isGenerator: boolean;
  complexity: number;
  cyclomaticComplexity: number;
  lines: { start: number; end: number };
}

export interface ParameterInfo {
  name: string;
  type: TypeInference;
  kind: 'parameter' | 'rest' | 'default';
  defaultValue?: any;
  position: Position;
}

export interface ClassInfo {
  name: string;
  kind: 'class' | 'interface' | 'abstract' | 'type';
  extends?: string[];
  implements?: string[];
  members: ClassMemberInfo[];
  methods: FunctionInfo[];
  staticMembers: ClassMemberInfo[];
  staticMethods: FunctionInfo[];
  generics?: GenericInfo[];
  isAbstract: boolean;
}

export interface ClassMemberInfo {
  name: string;
  kind: 'field' | 'property' | 'method';
  type: TypeInference;
  visibility: 'public' | 'private' | 'protected';
  isStatic: boolean;
  isReadonly: boolean;
  isOptional: boolean;
  initialValue?: any;
}

export interface GenericInfo {
  name: string;
  constraints?: string[];
  default?: string;
}

export interface CodeBlockInfo {
  statements: StatementInfo[];
  expressions: ExpressionInfo[];
  controlFlow: ControlFlowInfo;
  complexity: number;
}

export interface StatementInfo {
  type: string;
  kind: 'declaration' | 'expression' | 'control' | 'loop' | 'return' | 'throw' | 'import' | 'export';
  position: Position;
  children: any[];
}

export interface ExpressionInfo {
  type: string;
  kind: 'literal' | 'identifier' | 'call' | 'binary' | 'unary' | 'logical' | 'member' | 'new';
  value?: any;
  operator?: string;
  operands?: ExpressionInfo[];
  position: Position;
}

export interface ControlFlowInfo {
  entryPoints: Position[];
  exitPoints: Position[];
  branches: BranchInfo[];
  loops: LoopInfo[];
  exceptions: ExceptionInfo[];
  reachability: ReachabilityInfo;
}

export interface BranchInfo {
  condition: ExpressionInfo;
  trueBranch: Position[];
  falseBranch: Position[];
  complexity: number;
}

export interface LoopInfo {
  kind: 'for' | 'while' | 'do-while' | 'for-of' | 'for-in';
  condition?: ExpressionInfo;
  body: Position[];
  iterations?: number;
  complexity: number;
}

export interface ExceptionInfo {
  tryBlock: Position[];
  catchBlocks: CatchBlockInfo[];
  finallyBlock?: Position[];
  exceptionsThrown: ExceptionThrowInfo[];
}

export interface CatchBlockInfo {
  parameter?: string;
  type?: string;
  body: Position[];
}

export interface ExceptionThrowInfo {
  expression: ExpressionInfo;
  position: Position;
}

export interface ReachabilityInfo {
  reachable: Position[];
  unreachable: Position[];
  deadCode: Position[];
}

export interface ImportInfo {
  source: string;
  imports: ImportSpecifierInfo[];
  position: Position;
  kind: 'import' | 'require' | 'dynamic';
  resolved?: string;
}

export interface ImportSpecifierInfo {
  kind: 'named' | 'default' | 'namespace';
  name: string;
  as?: string;
  source: string;
}

export interface ExportInfo {
  kind: 'named' | 'default' | 'all';
  name: string;
  as?: string;
  source?: ExpressionInfo;
  position: Position;
}

export interface DependencyInfo {
  name: string;
  version?: string;
  kind: 'import' | 'require' | 'inheritance' | 'type' | 'runtime';
  usage: Position[];
  confidence: number;
}

export interface FunctionCallInfo {
  function: string;
  arguments: ExpressionInfo[];
  position: Position;
  resolved?: FunctionInfo;
  thisContext?: ExpressionInfo;
}

export interface AlgorithmInfo {
  name: string;
  kind: 'sorting' | 'searching' | 'dynamic-programming' | 'graph' | 'numeric' | 'cryptographic' | 'compression';
  complexity?: {
    time: string;
    space: string;
  };
  description: string;
  position: Position;
  confidence: number;
}

export interface DesignPatternInfo {
  name: string;
  kind: 'creational' | 'structural' | 'behavioral' | 'architectural';
  roles: Record<string, string[]>;
  description: string;
  position: Position[];
  confidence: number;
}

export interface RelatedCodeInfo {
  file: string;
  similarity: number;
  relationship: 'calls' | 'called-by' | 'extends' | 'implements' | 'uses' | 'used-by' | 'similar';
  positions: Position[];
}

export interface UsagePatternInfo {
  pattern: string;
  count: number;
  positions: Position[];
  contexts: string[];
  confidence: number;
}

export interface EvolutionInfo {
  history: CommitInfo[];
  changes: CodeChangeInfo[];
  trends: {
    growing: string[];
    shrinking: string[];
    stable: string[];
  };
  metrics: {
    complexity: { current: number; trend: number };
    size: { current: number; trend: number };
    dependencies: { current: number; trend: number };
  };
}

interface CommitInfo {
  hash: string;
  author: string;
  date: number;
  message: string;
  changes: FileChangeInfo[];
}

interface FileChangeInfo {
  file: string;
  kind: 'add' | 'modify' | 'delete' | 'rename';
  additions: number;
  deletions: number;
  changes: number;
}

export interface CodeChangeInfo {
  kind: 'add' | 'modify' | 'delete';
  entity: string;
  entityKind: 'function' | 'class' | 'variable' | 'type' | 'file';
  oldValue?: any;
  newValue?: any;
  position: Position;
  commit: string;
  date: number;
}

export interface DocumentationInfo {
  comments: CommentInfo[];
  docBlocks: DocBlockInfo[];
  markdown?: string;
  examples: ExampleInfo[];
}

export interface CommentInfo {
  kind: 'line' | 'block' | 'jsdoc';
  text: string;
  position: Position;
  associated?: Position[];
}

export interface DocBlockInfo {
  entity: string;
  entityKind: string;
  description: string;
  tags: Record<string, string | string[]>;
  parameters?: DocBlockParameterInfo[];
  returns?: DocBlockReturnInfo;
  examples?: string[];
  position: Position;
}

export interface DocBlockParameterInfo {
  name: string;
  type: string;
  description: string;
  optional?: boolean;
  default?: string;
}

export interface DocBlockReturnInfo {
  type: string;
  description: string;
}

export interface ExampleInfo {
  description: string;
  code: string;
  position: Position;
}

export interface CodeUnderstandingOptions {
  maxDepth?: number;
  maxComplexity?: number;
  maxIterations?: number;
  analyzeSyntax?: boolean;
  analyzeSemantics?: boolean;
  analyzeIntent?: boolean;
  analyzeContext?: boolean;
  timeout?: number;
  cache?: boolean;
  language?: string;
  domain?: string;
  relatedFiles?: string[];
  repository?: string;
  llmOptions?: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
  };
}

export interface CodeUnderstandingResult {
  understanding: CodeUnderstanding;
  ast?: ASTNode;
  tokens?: Token[];
  errors: UnderstandingError[];
  warnings: UnderstandingWarning[];
  stats: UnderstandingStats;
}

export interface UnderstandingError {
  code: string;
  message: string;
  position?: Position;
  severity: 'error' | 'fatal';
}

export interface UnderstandingWarning {
  code: string;
  message: string;
  position?: Position;
}

export interface UnderstandingStats {
  analysisTime: number;
  llmCalls: number;
  tokensAnalyzed: number;
  nodesVisited: number;
  complexity: number;
  confidence: number;
}

// ============================================================================
// Main Class
// ============================================================================

export class AutonomousCodeUnderstanding {
  private llm?: LLMClient;
  private understandingCache: Map<string, CodeUnderstanding> = new Map();
  private options: {
    enableCaching: boolean;
    enableLearning: boolean;
    enableLLM: boolean;
    maxCacheSize: number;
    debug: boolean;
  };

  constructor(llm?: LLMClient, _cache?: CacheManager, options?: Partial<AutonomousCodeUnderstanding['options']>) {
    this.llm = llm;
    this.options = {
      enableCaching: true,
      enableLearning: true,
      enableLLM: true,
      maxCacheSize: 1000,
      debug: false,
      ...options,
    };
  }

  async understand(source: string, options: CodeUnderstandingOptions = {}): Promise<CodeUnderstandingResult> {
    // Sub-millisecond resolution so fast operations still report meaningful times
    const startTime = performance.now();
    const cacheKey = this.generateCacheKey(source, options);

    if (this.options.enableCaching && this.understandingCache.has(cacheKey)) {
      const cached = this.understandingCache.get(cacheKey)!;
      return {
        understanding: cached,
        stats: {
          analysisTime: 0,
          llmCalls: 0,
          tokensAnalyzed: 0,
          nodesVisited: 0,
          complexity: cached.metadata.complexity,
          confidence: cached.confidence.overall,
        },
        errors: [],
        warnings: [],
      };
    }

    let llmCalls = 0;
    let tokensAnalyzed = 0;
    let nodesVisited = 0;
    let ast: ASTNode | undefined;
    let tokens: Token[] = [];

    // Step 1: Syntax analysis
    if (options.analyzeSyntax !== false) {
      const result = await this.analyzeSyntax(source, options);
      tokens = result.tokens;
      ast = result.ast;
      tokensAnalyzed = tokens.length;
      llmCalls += result.llmCalls;
    } else {
      tokens = this.basicTokenize(source);
      ast = this.buildASTFromTokens(tokens);
    }

    // Step 2: Semantic analysis
    let semantics: CodeUnderstanding['semantics'] = { types: {}, variables: {}, functions: {}, classes: {}, imports: [], exports: [], dependencies: [] };
    if (options.analyzeSemantics !== false) {
      const result = await this.analyzeSemantics(source, ast || this.createEmptyAST(), tokens, options);
      Object.assign(semantics, result.semantics);
      nodesVisited = result.nodesVisited;
      llmCalls += result.llmCalls;
      this.inferTypes(semantics);
    }

    // Step 3: Intent analysis
    let intent: CodeUnderstanding['intent'] = { purpose: '', goals: [], algorithms: [], patterns: [], domain: options.domain || '' };
    if (options.analyzeIntent !== false) {
      const result = await this.analyzeIntent(source, ast || this.createEmptyAST(), options);
      Object.assign(intent, result.intent);
      llmCalls += result.llmCalls;
    }

    // Step 4: Context analysis
    let context: CodeUnderstanding['context'] = {
      relatedCode: [],
      usagePatterns: [],
      evolution: { history: [], changes: [], trends: { growing: [], shrinking: [], stable: [] }, metrics: { complexity: { current: 0, trend: 0 }, size: { current: 0, trend: 0 }, dependencies: { current: 0, trend: 0 } } },
      documentation: { comments: [], docBlocks: [], examples: [] },
    };
    if (options.analyzeContext !== false) {
      const result = await this.analyzeContext(source, ast || this.createEmptyAST(), options);
      Object.assign(context, result.context);
      llmCalls += result.llmCalls;
    }

    // Build understanding
    const understanding: CodeUnderstanding = {
      id: this.generateId(),
      hash: this.hashSource(source),
      source,
      language: options.language,
      levels: {
        syntactic: options.analyzeSyntax !== false,
        semantic: options.analyzeSemantics !== false,
        intentional: options.analyzeIntent !== false,
        contextual: options.analyzeContext !== false,
      },
      syntax: { structure: '', tokens, ast, pattern: '', grammar: undefined },
      semantics,
      intent,
      context,
      confidence: {
        syntactic: 0,
        semantic: 0,
        intentional: 0,
        contextual: 0,
        overall: 0,
      },
      metadata: {
        createdAt: Date.now(),
        updatedAt: Date.now(),
        analyzedBy: [],
        complexity: ast ? this.calculateComplexity(ast) : 0,
        quality: 0,
        maintainability: 0,
      },
    };

    // Calculate confidence scores
    understanding.confidence.overall = this.calculateOverallConfidence(understanding);

    // Cache
    if (this.options.enableCaching) {
      this.understandingCache.set(cacheKey, understanding);
      this.enforceCacheLimit();
    }

    const analysisTime = performance.now() - startTime;

    return {
      understanding,
      ast,
      tokens,
      errors: [],
      warnings: [],
      stats: {
        analysisTime,
        llmCalls,
        tokensAnalyzed,
        nodesVisited,
        complexity: understanding.metadata.complexity,
        confidence: understanding.confidence.overall,
      },
    };
  }

  private async analyzeSyntax(source: string, options: CodeUnderstandingOptions): Promise<{ tokens: Token[]; ast?: ASTNode; llmCalls: number }> {
    if (!this.llm) return { tokens: this.basicTokenize(source), ast: this.buildASTFromTokens(this.basicTokenize(source)), llmCalls: 0 };

    const prompt = {
      system: `You are an expert syntax analyst. Analyze the code and return a JSON object with tokens array and optional ast. Return ONLY the JSON.`,
      user: `Analyze syntax: ${source}\nLanguage: ${options.language || 'unknown'}`,
    };

    try {
      const response = await this.llm.generate(prompt);
      const parsed = JSON.parse(response.content) as { tokens?: any[]; ast?: any };
      return { tokens: parsed.tokens || this.basicTokenize(source), ast: this.normalizeAST(parsed.ast), llmCalls: 1 };
    } catch {
      return { tokens: this.basicTokenize(source), ast: this.buildASTFromTokens(this.basicTokenize(source)), llmCalls: 1 };
    }
  }

  private async analyzeSemantics(source: string, ast: ASTNode, _tokens: Token[], options: CodeUnderstandingOptions): Promise<{ semantics: CodeUnderstanding['semantics']; llmCalls: number; nodesVisited: number }> {
    const semantics: CodeUnderstanding['semantics'] = { types: {}, variables: {}, functions: {}, classes: {}, imports: [], exports: [], dependencies: [] };
    let llmCalls = 0;
    let nodesVisited = 0;

    nodesVisited = this.extractSemanticsFromAST(ast, semantics);

    if (this.llm && this.options.enableLLM) {
      const prompt = {
        system: `Analyze code semantics and return JSON with types, variables, functions, classes, imports, exports, dependencies. Return ONLY JSON.`,
        user: `Source: ${source}\nAST: ${JSON.stringify(ast)}\nLanguage: ${options.language || ''}`,
      };
      try {
        const response = await this.llm.generate(prompt);
        llmCalls++;
        const parsed = JSON.parse(response.content);
        if (parsed.types) Object.assign(semantics.types, this.normalizeTypes(parsed.types));
        if (parsed.variables) Object.assign(semantics.variables, this.normalizeVariables(parsed.variables));
        if (parsed.functions) Object.assign(semantics.functions, this.normalizeFunctions(parsed.functions));
        if (parsed.classes) Object.assign(semantics.classes, this.normalizeClasses(parsed.classes));
        if (parsed.imports) semantics.imports = this.normalizeImports(parsed.imports);
        if (parsed.exports) semantics.exports = this.normalizeExports(parsed.exports);
        if (parsed.dependencies) semantics.dependencies = this.normalizeDependencies(parsed.dependencies);
      } catch {}
    }

    return { semantics, llmCalls, nodesVisited };
  }

  private async analyzeIntent(source: string, ast: ASTNode, options: CodeUnderstandingOptions): Promise<{ intent: CodeUnderstanding['intent']; llmCalls: number }> {
    const intent: CodeUnderstanding['intent'] = { purpose: '', goals: [], algorithms: [], patterns: [], domain: options.domain || '' };
    let llmCalls = 0;

    if (this.llm && this.options.enableLLM) {
      const prompt = {
        system: `Analyze code intent and return JSON with purpose, goals, algorithms, patterns, domain. Return ONLY JSON.`,
        user: `Source: ${source}\nAST: ${JSON.stringify(ast)}\nLanguage: ${options.language || ''}\nDomain: ${options.domain || ''}`,
      };
      try {
        const response = await this.llm.generate(prompt);
        llmCalls++;
        const parsed = JSON.parse(response.content);
        if (parsed.purpose) intent.purpose = parsed.purpose;
        if (parsed.goals) intent.goals = parsed.goals;
        if (parsed.algorithms) intent.algorithms = this.normalizeAlgorithms(parsed.algorithms);
        if (parsed.patterns) intent.patterns = this.normalizePatterns(parsed.patterns);
        if (parsed.domain) intent.domain = parsed.domain;
      } catch {}
    }

    if (!intent.purpose) intent.purpose = this.inferPurposeFromAST(ast);
    if (intent.goals.length === 0) intent.goals = [intent.purpose];
    if (!intent.domain) intent.domain = this.inferDomainFromAST(ast);

    return { intent, llmCalls };
  }

  private async analyzeContext(source: string, ast: ASTNode, options: CodeUnderstandingOptions): Promise<{ context: CodeUnderstanding['context']; llmCalls: number }> {
    const context: CodeUnderstanding['context'] = {
      relatedCode: [],
      usagePatterns: [],
      evolution: { history: [], changes: [], trends: { growing: [], shrinking: [], stable: [] }, metrics: { complexity: { current: 0, trend: 0 }, size: { current: 0, trend: 0 }, dependencies: { current: 0, trend: 0 } } },
      documentation: { comments: [], docBlocks: [], examples: [] },
    };
    let llmCalls = 0;

    this.extractDocumentation(ast, context);
    this.analyzeUsagePatterns(ast, context);

    if (this.llm && this.options.enableLLM) {
      const prompt = {
        system: `Analyze code context and return JSON with relatedCode, usagePatterns, evolution, documentation. Return ONLY JSON.`,
        user: `Source: ${source}\nLanguage: ${options.language || ''}\nRelated files: ${options.relatedFiles?.join(', ') || ''}`,
      };
      try {
        const response = await this.llm.generate(prompt);
        llmCalls++;
        const parsed = JSON.parse(response.content);
        if (parsed.relatedCode) context.relatedCode = this.normalizeRelatedCode(parsed.relatedCode);
        if (parsed.usagePatterns) context.usagePatterns = this.normalizeUsagePatterns(parsed.usagePatterns);
        if (parsed.evolution) context.evolution = this.normalizeEvolution(parsed.evolution);
        if (parsed.documentation) context.documentation = this.normalizeDocumentation(parsed.documentation);
      } catch {}
    }

    return { context, llmCalls };
  }

  private extractSemanticsFromAST(ast: ASTNode, semantics: NonNullable<CodeUnderstanding['semantics']>): number {
    let count = 0;
    const visit = (node: ASTNode) => {
      count++;
      if (node.type === 'ImportDeclaration') this.extractImport(node, semantics);
      if (node.type === 'VariableDeclaration') this.extractVariable(node, semantics);
      if (/Function/.test(node.type)) this.extractFunction(node, semantics);
      if (/Class/.test(node.type)) this.extractClass(node, semantics);
      for (const child of node.children || []) visit(child);
    };
    visit(ast);
    return count;
  }

  private extractImport(node: ASTNode, semantics: NonNullable<CodeUnderstanding['semantics']>): void {
    const source = String(node.value?.source || '');
    const imports: ImportSpecifierInfo[] = (node.children || []).map(c => ({
      kind: String(c.value?.kind || 'named') as ImportSpecifierInfo['kind'],
      name: String(c.value?.name || ''),
      as: c.value?.as ? String(c.value.as) : undefined,
      source,
    }));
    semantics.imports.push({ source, imports, position: node.position, kind: 'import' });
    for (const imp of imports) {
      semantics.dependencies.push({ name: imp.name, kind: 'import', usage: [node.position], confidence: 0.9 });
    }
  }

  private extractVariable(node: ASTNode, semantics: NonNullable<CodeUnderstanding['semantics']>): void {
    const name = String(node.value?.name || node.children?.[0]?.value || '');
    semantics.variables[name] = {
      name,
      type: { type: 'unknown', confidence: 0.3 },
      kind: String(node.value?.kind || 'let') as VariableInfo['kind'],
      scope: '',
      declaration: node.position,
      usages: [],
      isReassigned: false,
      isMutable: true,
    };
  }

  private extractFunction(node: ASTNode, semantics: NonNullable<CodeUnderstanding['semantics']>): void {
    const name = String(node.value?.name || node.children?.[0]?.value || '');
    semantics.functions[name] = {
      name,
      kind: node.type.replace(/Declaration|Expression/g, '') as FunctionInfo['kind'],
      parameters: [],
      returnType: { type: 'unknown', confidence: 0.3 },
      body: { statements: [], expressions: [], controlFlow: { entryPoints: [], exitPoints: [], branches: [], loops: [], exceptions: [], reachability: { reachable: [], unreachable: [], deadCode: [] } }, complexity: 0 },
      calls: [],
      isAsync: Boolean(node.value?.async),
      isGenerator: Boolean(node.value?.generator),
      complexity: 0,
      cyclomaticComplexity: 1,
      lines: { start: node.position.line, end: node.location.end.line },
    };
  }

  private extractClass(node: ASTNode, semantics: NonNullable<CodeUnderstanding['semantics']>): void {
    const name = String(node.value?.name || node.children?.[0]?.value || '');
    semantics.classes[name] = {
      name,
      kind: String(node.value?.kind || 'class') as ClassInfo['kind'],
      extends: [],
      implements: [],
      members: [],
      methods: [],
      staticMembers: [],
      staticMethods: [],
      isAbstract: Boolean(node.value?.abstract),
    };
  }

  private extractDocumentation(ast: ASTNode, context: NonNullable<CodeUnderstanding['context']>): void {
    const visit = (node: ASTNode) => {
      if (node.type === 'Comment') {
        context.documentation.comments.push({ kind: String(node.value?.kind || 'line') as 'line' | 'block' | 'jsdoc', text: String(node.value?.text || ''), position: node.position });
      }
      for (const child of node.children || []) visit(child);
    };
    visit(ast);
  }

  private analyzeUsagePatterns(ast: ASTNode, context: NonNullable<CodeUnderstanding['context']>): void {
    const usage: Record<string, { count: number; positions: Position[] }> = {};
    const visit = (node: ASTNode) => {
      if (node.type === 'CallExpression') {
        const name = String(node.value?.callee || node.children?.[0]?.value || '');
        if (!usage[`call:${name}`]) usage[`call:${name}`] = { count: 0, positions: [] };
        usage[`call:${name}`].count++;
        usage[`call:${name}`].positions.push(node.position);
      }
      for (const child of node.children || []) visit(child);
    };
    visit(ast);
    for (const [pattern, info] of Object.entries(usage)) {
      context.usagePatterns.push({ pattern, count: info.count, positions: info.positions, contexts: [], confidence: Math.min(1, info.count / 10) });
    }
  }

  private inferTypes(semantics: NonNullable<CodeUnderstanding['semantics']>): void {
    for (const [_name, varInfo] of Object.entries(semantics.variables)) {
      if (varInfo.type.type === 'unknown' && varInfo.initialValue !== undefined) {
        varInfo.type = this.inferTypeFromValue(varInfo.initialValue);
      }
    }
    for (const [_name, funcInfo] of Object.entries(semantics.functions)) {
      if (funcInfo.returnType.type === 'unknown') {
        funcInfo.returnType = { type: 'any', confidence: 0.5 };
      }
    }
  }

  private inferTypeFromValue(value: any): TypeInference {
    if (value === null) return { type: 'null', confidence: 1 };
    if (typeof value === 'string') return { type: 'string', literal: value, confidence: 1 };
    if (typeof value === 'number') return { type: 'number', literal: value, confidence: 1 };
    if (typeof value === 'boolean') return { type: 'boolean', literal: value, confidence: 1 };
    if (Array.isArray(value)) return { type: 'array', confidence: 1 };
    if (typeof value === 'object') return { type: 'object', confidence: 1 };
    return { type: 'unknown', confidence: 0.5 };
  }

  private inferPurposeFromAST(ast: ASTNode): string {
    const counts: Record<string, number> = {};
    const visit = (node: ASTNode) => {
      const type = node.type.replace(/Declaration|Expression|Statement/g, '');
      counts[type] = (counts[type] || 0) + 1;
      for (const child of node.children || []) visit(child);
    };
    visit(ast);
    if (counts.Function > 3) return 'Utility functions';
    if (counts.Class > 0) return 'Class definitions';
    if (counts.Import > 2) return 'Module imports';
    return 'Code implementation';
  }

  private inferDomainFromAST(ast: ASTNode): string {
    const keywords = new Set<string>();
    const visit = (node: ASTNode) => {
      if (node.type === 'Identifier') {
        const v = String(node.value || '').toLowerCase();
        if (['http', 'request', 'response', 'api'].includes(v)) keywords.add('web');
        if (['data', 'database', 'query'].includes(v)) keywords.add('data');
        if (['model', 'train', 'predict'].includes(v)) keywords.add('ai');
      }
      for (const child of node.children || []) visit(child);
    };
    visit(ast);
    if (keywords.has('web')) return 'web';
    if (keywords.has('ai')) return 'ai';
    if (keywords.has('data')) return 'data';
    return 'general';
  }

  private calculateComplexity(ast: ASTNode): number {
    let complexity = 0;
    let cyclomatic = 1;
    const visit = (node: ASTNode) => {
      complexity++;
      switch (node.type) {
        case 'IfStatement': cyclomatic++; complexity += 2; break;
        case 'ForStatement': case 'WhileStatement': cyclomatic++; complexity += 2; break;
        case 'SwitchStatement': const cases = (node.children || []).filter(c => c.type === 'CaseStatement').length; cyclomatic += cases; complexity += cases * 2; break;
        case 'FunctionDeclaration': complexity += 5; break;
        case 'ClassDeclaration': complexity += 10; break;
      }
      for (const child of node.children || []) visit(child);
    };
    visit(ast);
    return complexity + cyclomatic * 2;
  }

  private calculateOverallConfidence(understanding: CodeUnderstanding): number {
    const weights = { syntactic: 0.3, semantic: 0.4, intentional: 0.2, contextual: 0.1 };
    let total = 0; let sum = 0;
    for (const [level, weight] of Object.entries(weights)) {
      const w = weight as number;
      const c = understanding.confidence[level as keyof typeof understanding.confidence];
      if (understanding.levels[level as keyof typeof understanding.levels]) { sum += c * w; total += w; }
    }
    return total > 0 ? sum / total : 0;
  }

  // Normalization helpers
  private normalizeAST(ast: any): ASTNode | undefined {
    if (!ast) return undefined;
    return {
      type: ast.type || 'Unknown',
      value: ast.value,
      children: ast.children?.map(this.normalizeAST) || [],
      tokens: ast.tokens,
      position: ast.position || { line: 0, column: 0, offset: 0 },
      location: ast.location || { start: { line: 0, column: 0, offset: 0 }, end: { line: 0, column: 0, offset: 0 }, source: '' },
      metadata: ast.metadata,
    };
  }

  private normalizeTypes(types: any): Record<string, TypeInference> {
    const result: Record<string, TypeInference> = {};
    for (const [k, v] of Object.entries(types || {}) as Array<[string, any]>) {
      result[k] = { type: v.type || 'unknown', literal: v.literal, inferredFrom: v.inferredFrom || '', possibleTypes: v.possibleTypes || [], confidence: v.confidence || 0.5, source: v.source };
    }
    return result;
  }

  private normalizeVariables(vars: any): Record<string, VariableInfo> {
    const result: Record<string, VariableInfo> = {};
    for (const [k, v] of Object.entries(vars || {}) as Array<[string, any]>) {
      result[k] = {
        name: k,
        type: this.normalizeTypeInference(v.type || {}),
        kind: v.kind || 'let',
        scope: v.scope || '',
        declaration: v.declaration || { line: 0, column: 0, offset: 0 },
        usages: v.usages || [],
        initialValue: v.initialValue,
        isReassigned: v.isReassigned || false,
        isMutable: v.isMutable !== false,
      };
    }
    return result;
  }

  private normalizeTypeInference(t: any): TypeInference {
    return { type: t.type || 'unknown', literal: t.literal, inferredFrom: t.inferredFrom || '', possibleTypes: t.possibleTypes || [], confidence: t.confidence || 0.5, source: t.source };
  }

  private normalizeFunctions(funcs: any): Record<string, FunctionInfo> {
    const result: Record<string, FunctionInfo> = {};
    for (const [k, v] of Object.entries(funcs || {}) as Array<[string, any]>) {
      result[k] = {
        name: k,
        kind: v.kind || 'function',
        parameters: v.parameters?.map(this.normalizeParameterInfo) || [],
        returnType: this.normalizeTypeInference(v.returnType || {}),
        body: { statements: [], expressions: [], controlFlow: { entryPoints: [], exitPoints: [], branches: [], loops: [], exceptions: [], reachability: { reachable: [], unreachable: [], deadCode: [] } }, complexity: 0 },
        calls: [],
        isAsync: v.isAsync || false,
        isGenerator: v.isGenerator || false,
        complexity: v.complexity || 0,
        cyclomaticComplexity: v.cyclomaticComplexity || 1,
        lines: v.lines || { start: 0, end: 0 },
      };
    }
    return result;
  }

  private normalizeParameterInfo(p: any): ParameterInfo {
    return { name: p.name || '', type: this.normalizeTypeInference(p.type || {}), kind: p.kind || 'parameter', defaultValue: p.defaultValue, position: p.position || { line: 0, column: 0, offset: 0 } };
  }

  private normalizeClasses(classes: any): Record<string, ClassInfo> {
    const result: Record<string, ClassInfo> = {};
    for (const [k, v] of Object.entries(classes || {}) as Array<[string, any]>) {
      result[k] = {
        name: k,
        kind: v.kind || 'class',
        extends: v.extends || [],
        implements: v.implements || [],
        members: [],
        methods: [],
        staticMembers: [],
        staticMethods: [],
        isAbstract: v.isAbstract || false,
      };
    }
    return result;
  }

  private normalizeImports(imports: any[]): ImportInfo[] {
    return (imports || []).map(i => ({
      source: i.source || '',
      imports: i.imports?.map(this.normalizeImportSpecifier) || [],
      position: i.position || { line: 0, column: 0, offset: 0 },
      kind: i.kind || 'import',
      resolved: i.resolved,
    }));
  }

  private normalizeImportSpecifier(s: any): ImportSpecifierInfo {
    return { kind: s.kind || 'named', name: s.name || '', as: s.as, source: s.source || '' };
  }

  private normalizeExports(exp: any[]): ExportInfo[] {
    return (exp || []).map(e => ({ kind: e.kind || 'named', name: e.name || '', as: e.as, position: e.position || { line: 0, column: 0, offset: 0 } }));
  }

  private normalizeDependencies(deps: any[]): DependencyInfo[] {
    return (deps || []).map(d => ({ name: d.name || '', version: d.version, kind: d.kind || 'import', usage: d.usage || [], confidence: d.confidence || 0.5 }));
  }

  private normalizeAlgorithms(algs: any[]): AlgorithmInfo[] {
    return (algs || []).map(a => ({
      name: a.name || '',
      kind: a.kind || 'unknown',
      complexity: a.complexity || { time: '', space: '' },
      description: a.description || '',
      position: a.position || { line: 0, column: 0, offset: 0 },
      confidence: a.confidence || 0.7,
    }));
  }

  private normalizePatterns(pats: any[]): DesignPatternInfo[] {
    return (pats || []).map(p => ({
      name: p.name || '',
      kind: p.kind || 'unknown',
      roles: p.roles || {},
      description: p.description || '',
      position: p.position || [],
      confidence: p.confidence || 0.7,
    }));
  }

  private normalizeRelatedCode(rc: any[]): RelatedCodeInfo[] {
    return (rc || []).map(r => ({ file: r.file || '', similarity: r.similarity || 0, relationship: r.relationship || 'similar', positions: r.positions || [] }));
  }

  private normalizeUsagePatterns(up: any[]): UsagePatternInfo[] {
    return (up || []).map(u => ({ pattern: u.pattern || '', count: u.count || 0, positions: u.positions || [], contexts: u.contexts || [], confidence: u.confidence || 0.7 }));
  }

  private normalizeEvolution(e: any): EvolutionInfo {
    return {
      history: e.history?.map(this.normalizeCommit) || [],
      changes: e.changes?.map(this.normalizeCodeChange) || [],
      trends: { growing: e.trends?.growing || [], shrinking: e.trends?.shrinking || [], stable: e.trends?.stable || [] },
      metrics: {
        complexity: e.metrics?.complexity || { current: 0, trend: 0 },
        size: e.metrics?.size || { current: 0, trend: 0 },
        dependencies: e.metrics?.dependencies || { current: 0, trend: 0 },
      },
    };
  }

  private normalizeCommit(c: any): CommitInfo {
    return { hash: c.hash || '', author: c.author || '', date: c.date || 0, message: c.message || '', changes: c.changes?.map(this.normalizeFileChange) || [] };
  }

  private normalizeFileChange(fc: any): FileChangeInfo {
    return { file: fc.file || '', kind: fc.kind || 'modify', additions: fc.additions || 0, deletions: fc.deletions || 0, changes: fc.changes || 0 };
  }

  private normalizeCodeChange(cc: any): CodeChangeInfo {
    return { kind: cc.kind || 'modify', entity: cc.entity || '', entityKind: cc.entityKind || 'function', oldValue: cc.oldValue, newValue: cc.newValue, position: cc.position || { line: 0, column: 0, offset: 0 }, commit: cc.commit || '', date: cc.date || 0 };
  }

  private normalizeDocumentation(d: any): DocumentationInfo {
    return {
      comments: d.comments?.map(this.normalizeComment) || [],
      docBlocks: d.docBlocks?.map(this.normalizeDocBlock) || [],
      markdown: d.markdown,
      examples: d.examples?.map(this.normalizeExample) || [],
    };
  }

  private normalizeComment(c: any): CommentInfo {
    return { kind: c.kind || 'line', text: c.text || '', position: c.position || { line: 0, column: 0, offset: 0 }, associated: c.associated || [] };
  }

  private normalizeDocBlock(db: any): DocBlockInfo {
    return {
      entity: db.entity || '',
      entityKind: db.entityKind || '',
      description: db.description || '',
      tags: db.tags || {},
      parameters: db.parameters?.map(this.normalizeDocBlockParam) || [],
      returns: db.returns ? { type: db.returns.type || '', description: db.returns.description || '' } : undefined,
      examples: db.examples || [],
      position: db.position || { line: 0, column: 0, offset: 0 },
    };
  }

  private normalizeDocBlockParam(p: any): DocBlockParameterInfo {
    return { name: p.name || '', type: p.type || '', description: p.description || '', optional: p.optional || false, default: p.default };
  }

  private normalizeExample(e: any): ExampleInfo {
    return { description: e.description || '', code: e.code || '', position: e.position || { line: 0, column: 0, offset: 0 } };
  }

  // Utility methods
  private basicTokenize(source: string): Token[] {
    const tokens: Token[] = [];
    let pos = 0; let line = 1; let column = 0;
    while (pos < source.length) {
      const char = source[pos];
      if (/\s/.test(char)) { if (char === '\n') { line++; column = 0; } else { column++; } pos++; continue; }
      if (/[a-zA-Z_$]/.test(char)) {
        let end = pos + 1; while (end < source.length && /[a-zA-Z0-9_$]/.test(source[end])) end++;
        const value = source.substring(pos, end);
        tokens.push({ type: /^[A-Z]/.test(value) ? 'KEYWORD' : 'IDENTIFIER', value, position: { line, column, offset: pos }, location: { start: { line, column, offset: pos }, end: { line, column: column + (end - pos), offset: end }, source: value } });
        column += end - pos; pos = end; continue;
      }
      if (/\d/.test(char)) {
        let end = pos + 1; while (end < source.length && /[\d.]/.test(source[end])) end++;
        const value = source.substring(pos, end);
        tokens.push({ type: 'NUMBER', value, position: { line, column, offset: pos }, location: { start: { line, column, offset: pos }, end: { line, column: column + (end - pos), offset: end }, source: value } });
        column += end - pos; pos = end; continue;
      }
      if (char === '"' || char === "'") {
        const quote = char; let end = pos + 1; while (end < source.length && source[end] !== quote) { if (source[end] === '\\') end++; end++; }
        end++; const value = source.substring(pos, end);
        tokens.push({ type: 'STRING', value, position: { line, column, offset: pos }, location: { start: { line, column, offset: pos }, end: { line, column: column + (end - pos), offset: end }, source: value } });
        column += end - pos; pos = end; continue;
      }
      if (/[+\-*/%=<>!&|^~?,.:;(){}\[\]]/.test(char)) {
        tokens.push({ type: 'OPERATOR', value: char, position: { line, column, offset: pos }, location: { start: { line, column, offset: pos }, end: { line, column: column + 1, offset: pos + 1 }, source: char } });
        column++; pos++; continue;
      }
      tokens.push({ type: 'UNKNOWN', value: char, position: { line, column, offset: pos }, location: { start: { line, column, offset: pos }, end: { line, column: column + 1, offset: pos + 1 }, source: char } });
      column++; pos++;
    }
    return tokens;
  }

  private buildASTFromTokens(tokens: Token[]): ASTNode {
    const root: ASTNode = { type: 'Program', children: [], tokens, position: { line: 0, column: 0, offset: 0 }, location: { start: { line: 0, column: 0, offset: 0 }, end: { line: 0, column: 0, offset: 0 }, source: '' } };
    let current = root; const stack: ASTNode[] = [root];
    for (const token of tokens) {
      if (['{', '(', '['].includes(String(token.value))) {
        const block: ASTNode = { type: 'Block', value: token.value, tokens: [token], position: token.position, location: token.location, children: [] };
        (current.children ??= []).push(block); stack.push(block); current = block;
      } else if (['}', ')', ']'].includes(String(token.value))) {
        if (stack.length > 1) { stack.pop(); current = stack[stack.length - 1]; }
      } else {
        (current.children ??= []).push({ type: this.getNodeTypeFromToken(token), value: token.value, tokens: [token], position: token.position, location: token.location, children: [] });
      }
    }
    return root;
  }

  private getNodeTypeFromToken(token: Token): string {
    if (token.type === 'KEYWORD') return String(token.value);
    if (token.type === 'IDENTIFIER') return 'Identifier';
    if (token.type === 'NUMBER') return 'NumericLiteral';
    if (token.type === 'STRING') return 'StringLiteral';
    return token.type;
  }

  private createEmptyAST(): ASTNode {
    return { type: 'Program', children: [], tokens: [], position: { line: 0, column: 0, offset: 0 }, location: { start: { line: 0, column: 0, offset: 0 }, end: { line: 0, column: 0, offset: 0 }, source: '' } };
  }

  private generateId(): string { return Math.random().toString(36).substring(2) + Date.now().toString(36); }
  private hashSource(source: string): string { return crypto.createHash('sha256').update(source).digest('hex').substring(0, 16); }
  private generateCacheKey(source: string, options: CodeUnderstandingOptions): string {
    return crypto.createHash('sha256').update(`understanding|${this.hashSource(source)}|${options.language || ''}|${options.domain || ''}`).digest('hex');
  }
  private enforceCacheLimit(): void { if (this.understandingCache.size > this.options.maxCacheSize) { const keys = Array.from(this.understandingCache.keys()); for (let i = 0; i < keys.length * 0.2; i++) this.understandingCache.delete(keys[i]); } }
}

export function createAutonomousCodeUnderstanding(llm?: LLMClient, cache?: CacheManager, options?: Partial<AutonomousCodeUnderstanding['options']>): AutonomousCodeUnderstanding {
  return new AutonomousCodeUnderstanding(llm, cache, options);
}
