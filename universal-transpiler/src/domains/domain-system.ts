/**
 * Domain System for Universal Transpiler
 * 
 * Provides:
 * - Domain-specific language constructs
 * - Domain abstraction layers
 * - 5GL (Fifth-Generation Language) definitions
 * - Domain-specific transpilation rules
 * - Semantic analysis within domains
 */

import type {
  DomainDefinition,
  DomainPattern,
  DomainTransform,
  FifthGLDefinition,
  FifthGLAbstraction,
  FifthGLParameter,
  FifthGLCompiler,
  FifthGLInterpreter,
  ASTNode,
  TranspileOptions,
  Parser,
  LLMClient,
  CacheManager,
} from '../core/universal-transpiler';

// ============================================================================
// Domain Registry
// ============================================================================

export class DomainRegistry {
  private domains: Map<string, DomainDefinition> = new Map();
  private domainAliases: Map<string, string> = new Map();
  private fifthGL: Map<string, FifthGLDefinition> = new Map();
  
  private llm: LLMClient | null = null;
  private cache: CacheManager | null = null;

  constructor(llm?: LLMClient, cache?: CacheManager) {
    this.llm = llm || null;
    this.cache = cache || null;
  }

  setLLMClient(llm: LLMClient): void {
    this.llm = llm;
  }

  setCacheManager(cache: CacheManager): void {
    this.cache = cache;
  }

  // ==========================================================================
  // Domain Management
  // ==========================================================================

  register(domain: DomainDefinition): void {
    this.domains.set(domain.name, domain);
    
    // Register aliases
    if (domain.aliases) {
      for (const alias of domain.aliases) {
        this.domainAliases.set(alias, domain.name);
      }
    }
  }

  registerAlias(alias: string, domainName: string): void {
    this.domainAliases.set(alias, domainName);
  }

  get(name: string): DomainDefinition | undefined {
    const resolved = this.resolveName(name);
    return this.domains.get(resolved);
  }

  resolveName(name: string): string {
    return this.domainAliases.get(name) || name;
  }

  has(name: string): boolean {
    const resolved = this.resolveName(name);
    return this.domains.has(resolved);
  }

  list(): string[] {
    return Array.from(this.domains.keys());
  }

  listAllNames(): string[] {
    return [...this.domains.keys(), ...this.domainAliases.keys()];
  }

  remove(name: string): boolean {
    const resolved = this.resolveName(name);
    
    // Remove aliases
    const aliasesToRemove: string[] = [];
    for (const [alias, target] of this.domainAliases) {
      if (target === resolved) {
        aliasesToRemove.push(alias);
      }
    }
    for (const alias of aliasesToRemove) {
      this.domainAliases.delete(alias);
    }
    
    return this.domains.delete(resolved);
  }

  clear(): void {
    this.domains.clear();
    this.domainAliases.clear();
  }

  // ==========================================================================
  // 5GL Management
  // ==========================================================================

  register5GL(fifthGL: FifthGLDefinition): void {
    this.fifthGL.set(fifthGL.name, fifthGL);
  }

  get5GL(name: string): FifthGLDefinition | undefined {
    return this.fifthGL.get(name);
  }

  has5GL(name: string): boolean {
    return this.fifthGL.has(name);
  }

  list5GL(): string[] {
    return Array.from(this.fifthGL.keys());
  }

  remove5GL(name: string): boolean {
    return this.fifthGL.delete(name);
  }

  clear5GL(): void {
    this.fifthGL.clear();
  }

  // ==========================================================================
  // Domain Detection
  // ==========================================================================

  async detectFromCode(code: string, language: string): Promise<{ domain: string; confidence: number }[]> {
    const results: { domain: string; confidence: number }[] = [];
    
    for (const [name, domain] of this.domains) {
      const confidence = await this.calculateDomainConfidence(code, language, domain);
      if (confidence > 0) {
        results.push({ domain: name, confidence });
      }
    }
    
    // Sort by confidence
    results.sort((a, b) => b.confidence - a.confidence);
    
    return results;
  }

  private async calculateDomainConfidence(
    code: string,
    language: string,
    domain: DomainDefinition
  ): Promise<number> {
    let confidence = 0;
    
    // Check keywords
    if (domain.keywords) {
      const keywordMatches = domain.keywords.filter(kw => 
        code.toLowerCase().includes(kw.toLowerCase())
      );
      confidence += keywordMatches.length / domain.keywords.length * 0.3;
    }
    
    // Check for domain-specific patterns
    if (domain.patterns) {
      for (const pattern of domain.patterns) {
        try {
          const matches = this.matchPattern(code, pattern.pattern);
          if (matches) {
            confidence += pattern.priority * 0.01;
          }
        } catch {
          // Pattern matching failed
        }
      }
    }
    
    // Check types
    if (domain.types) {
      const typeMatches = Object.keys(domain.types).filter(type =>
        code.toLowerCase().includes(type.toLowerCase())
      );
      confidence += typeMatches.length / Object.keys(domain.types).length * 0.2;
    }
    
    // Use LLM for more sophisticated detection
    if (this.llm && domain.description) {
      try {
        const prompt = {
          system: `You are a domain detection expert. Determine if the following code belongs to the domain of "${domain.name}" (${domain.description}).
Return a confidence score between 0 and 1.`,
          user: `Code:\n${code}\n\nConfidence (0-1):`,
        };
        
        const response = await this.llm.generate(prompt);
        const score = parseFloat(response.content);
        if (!isNaN(score)) {
          confidence += score * 0.5;
        }
      } catch {
        // LLM call failed
      }
    }
    
    return Math.min(confidence, 1.0);
  }

  private matchPattern(source: string, pattern: any): boolean {
    if (typeof pattern === 'string') {
      return source.includes(pattern);
    }
    
    if (pattern instanceof RegExp) {
      return pattern.test(source);
    }
    
    if (typeof pattern === 'function') {
      // Try to create a mock AST for pattern matching
      const mockAst = this.createMockAST(source);
      return Boolean(pattern(mockAst));
    }
    
    if (typeof pattern === 'object' && pattern !== null) {
      if (pattern.type) {
        return source.includes(pattern.type);
      }
      if (pattern.value) {
        return source.includes(pattern.value);
      }
    }
    
    return false;
  }

  private createMockAST(source: string): ASTNode {
    return {
      type: 'Program',
      children: [],
      tokens: [],
      position: { line: 0, column: 0, offset: 0 },
      location: {
        start: { line: 0, column: 0, offset: 0 },
        end: { line: 0, column: source.length, offset: source.length },
        source,
      },
    };
  }

  // ==========================================================================
  // Domain Application
  // ==========================================================================

  async applyToAST(
    ast: ASTNode,
    domainName: string,
    options: TranspileOptions = {}
  ): Promise<ASTNode> {
    const domain = this.get(domainName);
    if (!domain) {
      throw new Error(`Unknown domain: ${domainName}`);
    }
    
    let result = ast;
    
    // Apply patterns
    if (domain.patterns) {
      for (const pattern of domain.patterns) {
        result = await this.applyPattern(result, pattern, domain);
      }
    }
    
    // Apply transforms
    if (domain.transforms) {
      for (const [name, transform] of Object.entries(domain.transforms)) {
        result = this.applyTransform(result, transform);
      }
    }
    
    return result;
  }

  private async applyPattern(
    ast: ASTNode,
    pattern: DomainPattern,
    domain: DomainDefinition
  ): Promise<ASTNode> {
    const matches = this.findMatches(ast, pattern.pattern);
    
    let result = ast;
    for (const match of matches) {
      const context = {
        node: match,
        path: this.findPath(ast, match),
        domain,
        pattern,
      };
      
      const handlerResult = pattern.handler(match, context);
      if (handlerResult) {
        result = this.replaceNode(result, match, handlerResult);
      }
    }
    
    return result;
  }

  private findMatches(ast: ASTNode, pattern: any): ASTNode[] {
    const results: ASTNode[] = [];
    
    const visit = (node: ASTNode) => {
      if (this.nodeMatchesPattern(node, pattern)) {
        results.push(node);
      }
      
      if (node.children) {
        for (const child of node.children) {
          visit(child);
        }
      }
    };
    
    visit(ast);
    return results;
  }

  private nodeMatchesPattern(node: ASTNode, pattern: any): boolean {
    if (typeof pattern === 'string') {
      return node.type === pattern;
    }
    
    if (pattern instanceof RegExp) {
      return pattern.test(node.type) || 
             pattern.test(node.value?.toString() || '');
    }
    
    if (typeof pattern === 'function') {
      return Boolean(pattern(node));
    }
    
    if (typeof pattern === 'object' && pattern !== null) {
      if (pattern.type && node.type !== pattern.type) return false;
      if (pattern.value && node.value !== pattern.value) return false;
      
      if (pattern.children) {
        if (!node.children) return false;
        if (pattern.children.length !== node.children.length) return false;
        
        for (let i = 0; i < pattern.children.length; i++) {
          if (!this.nodeMatchesPattern(node.children[i], pattern.children[i])) {
            return false;
          }
        }
      }
      
      return true;
    }
    
    return false;
  }

  private findPath(root: ASTNode, node: ASTNode): ASTNode[] {
    const path: ASTNode[] = [];
    
    const visit = (current: ASTNode, parentPath: ASTNode[]): boolean => {
      const currentPath = [...parentPath, current];
      
      if (current === node) {
        Object.assign(path, currentPath);
        return true;
      }
      
      if (current.children) {
        for (const child of current.children) {
          if (visit(child, currentPath)) {
            return true;
          }
        }
      }
      
      return false;
    };
    
    visit(root, []);
    return path;
  }

  private replaceNode(root: ASTNode, oldNode: ASTNode, newNode: ASTNode): ASTNode {
    const visit = (node: ASTNode): ASTNode => {
      if (node === oldNode) {
        return newNode;
      }
      
      if (node.children) {
        return {
          ...node,
          children: node.children.map(visit),
        };
      }
      
      return node;
    };
    
    return visit(root);
  }

  private applyTransform(ast: ASTNode, transform: DomainTransform): ASTNode {
    return transform.apply(ast, { domain: this.get(transform.name.split(':')[0]) });
  }

  // ==========================================================================
  // Domain-Specific Parsing
  // ==========================================================================

  createDomainParser(domainName: string, baseParser: Parser): Parser {
    const domain = this.get(domainName);
    if (!domain) {
      throw new Error(`Unknown domain: ${domainName}`);
    }
    
    return {
      parse: (source: string, options?: any) => {
        const baseResult = baseParser.parse(source, options);
        
        // Apply domain-specific post-processing
        if (domain.patterns || domain.transforms) {
          const ast = this.applyToAST(baseResult.ast, domainName, options);
          return { ...baseResult, ast };
        }
        
        return baseResult;
      },
      tokenize: baseParser.tokenize,
      canParse: baseParser.canParse,
    };
  }

  // ==========================================================================
  // 5GL Compilation and Execution
  // ==========================================================================

  async compile5GL(
    abstraction: FifthGLAbstraction,
    domainName: string,
    targetLanguage: string,
    options: any = {}
  ): Promise<string> {
    const domain = this.get(domainName);
    if (!domain) {
      throw new Error(`Unknown domain: ${domainName}`);
    }
    
    // Find 5GL definition for this domain
    const fifthGLDef = Array.from(this.fifthGL.values())
      .find(f => f.domain === domainName);
    
    if (fifthGLDef) {
      return fifthGLDef.compiler.compile(abstraction, targetLanguage);
    }
    
    // Dynamic 5GL compilation using LLM
    if (this.llm) {
      return this.dynamicCompile5GL(abstraction, domainName, targetLanguage);
    }
    
    throw new Error(`No 5GL compiler available for domain: ${domainName}`);
  }

  async dynamicCompile5GL(
    abstraction: FifthGLAbstraction,
    domainName: string,
    targetLanguage: string
  ): Promise<string> {
    if (!this.llm) {
      throw new Error('LLM client is required for dynamic 5GL compilation');
    }
    
    const domain = this.get(domainName);
    const prompt = {
      system: `You are a 5GL compiler expert. Compile the following fifth-generation language abstraction to ${targetLanguage}.

The abstraction is from the domain of "${domainName}" (${domain?.description || 'unknown'}).

Guidelines:
1. Understand the semantics of the high-level abstraction
2. Generate idiomatic, efficient code in the target language
3. Handle all parameters and constraints correctly
4. Preserve the intent and behavior of the abstraction

Return ONLY the generated source code without any explanation.`,
      user: `Domain: ${domainName}\nTarget: ${targetLanguage}\n\nAbstraction:\n${JSON.stringify(abstraction, null, 2)}\n\nGenerated code:`,
    };
    
    const response = await this.llm.generate(prompt);
    return response.content;
  }

  async execute5GL(
    abstraction: FifthGLAbstraction,
    domainName: string,
    input: any,
    options: any = {}
  ): Promise<any> {
    const domain = this.get(domainName);
    if (!domain) {
      throw new Error(`Unknown domain: ${domainName}`);
    }
    
    // Find 5GL definition for this domain
    const fifthGLDef = Array.from(this.fifthGL.values())
      .find(f => f.domain === domainName);
    
    if (fifthGLDef) {
      return fifthGLDef.interpreter.execute(abstraction, input);
    }
    
    // Dynamic 5GL execution using LLM
    if (this.llm) {
      return this.dynamicExecute5GL(abstraction, domainName, input);
    }
    
    throw new Error(`No 5GL interpreter available for domain: ${domainName}`);
  }

  async dynamicExecute5GL(
    abstraction: FifthGLAbstraction,
    domainName: string,
    input: any
  ): Promise<any> {
    if (!this.llm) {
      throw new Error('LLM client is required for dynamic 5GL execution');
    }
    
    const domain = this.get(domainName);
    const prompt = {
      system: `You are a 5GL interpreter. Execute the following fifth-generation language abstraction with the given input.

The abstraction is from the domain of "${domainName}" (${domain?.description || 'unknown'}).

Guidelines:
1. Understand the intent and semantics of the abstraction
2. Apply the abstraction to the input data
3. Follow all constraints and rules
4. Return the final result in JSON format

Return ONLY a JSON object with the result: { "result": <value>, "type": <type>, "explanation": <brief explanation> }`,
      user: `Domain: ${domainName}\n\nAbstraction:\n${JSON.stringify(abstraction, null, 2)}\n\nInput:\n${JSON.stringify(input, null, 2)}\n\nResult:`,
    };
    
    const response = await this.llm.generate(prompt);
    
    try {
      const parsed = JSON.parse(response.content);
      return parsed.result;
    } catch {
      return response.content;
    }
  }

  // ==========================================================================
  // 5GL Definition Helpers
  // ==========================================================================

  create5GLDefinition(
    name: string,
    domain: string,
    abstractions: Record<string, FifthGLAbstraction>,
    compiler?: Partial<FifthGLCompiler>,
    interpreter?: Partial<FifthGLInterpreter>
  ): FifthGLDefinition {
    const fullCompiler: FifthGLCompiler = {
      compile: compiler?.compile || ((abstraction, target) => {
        throw new Error(`No compiler for ${name} to ${target}`);
      }),
    };
    
    const fullInterpreter: FifthGLInterpreter = {
      execute: interpreter?.execute || ((abstraction, input) => {
        throw new Error(`No interpreter for ${name}`);
      }),
    };
    
    return {
      name,
      domain,
      abstractions,
      compiler: fullCompiler,
      interpreter: fullInterpreter,
    };
  }

  createAbstraction(
    name: string,
    type: FifthGLAbstraction['type'],
    parameters: FifthGLParameter[] = [],
    body: any = null,
    semantics: string = ''
  ): FifthGLAbstraction {
    return {
      name,
      type,
      parameters,
      body,
      semantics,
    };
  }

  createParameter(
    name: string,
    type: string,
    required: boolean = true,
    defaultValue?: any
  ): FifthGLParameter {
    return {
      name,
      type,
      required,
      default: defaultValue,
    };
  }

  // ==========================================================================
  // Domain Definition Helpers
  // ==========================================================================

  createDomain(
    name: string,
    description: string,
    options: Partial<DomainDefinition> = {}
  ): DomainDefinition {
    return {
      name,
      description,
      keywords: [],
      operators: [],
      types: {},
      patterns: [],
      transforms: {},
      aliases: [],
      ...options,
    };
  }

  createPattern(
    name: string,
    pattern: any,
    handler: (node: ASTNode, context: any) => any,
    priority: number = 1
  ): DomainPattern {
    return {
      name,
      pattern,
      handler,
      priority,
    };
  }

  createDomainTransform(
    name: string,
    description: string,
    apply: (ast: ASTNode, context: any) => ASTNode
  ): DomainTransform {
    return {
      name,
      description,
      apply,
    };
  }

  // ==========================================================================
  // Built-in Domains
  // ==========================================================================

  loadBuiltinDomains(): void {
    // Web Domain
    this.register(this.createDomain(
      'web',
      'Web development with HTML, CSS, JavaScript, and frameworks like React',
      {
        keywords: [
          'html', 'css', 'javascript', 'typescript', 'react', 'vue', 'angular',
          'component', 'element', 'props', 'state', 'hook', 'jsx', 'virtual',
          'dom', 'browser', 'frontend', 'ui', 'ux',
        ],
        operators: [],
        types: {
          Component: 'A reusable UI component',
          Element: 'A DOM element or virtual DOM node',
          Props: 'Properties passed to a component',
          State: 'Mutable state within a component',
          Hook: 'A React hook or lifecycle function',
          JSXElement: 'A JSX element',
          HTML: 'HTML markup',
          CSS: 'Cascading Style Sheets',
        },
        aliases: ['frontend', 'ui', 'react', 'webdev'],
        patterns: [
          this.createPattern(
            'jsx-element',
            (node: ASTNode) => node.type === 'JSXElement' || 
                               node.type === 'JSXSelfClosingElement' ||
                               node.value?.toString().startsWith('<'),
            (node) => ({
              ...node,
              metadata: {
                ...node.metadata,
                isJSX: true,
                domain: 'web',
              },
            })
          ),
          this.createPattern(
            'react-hook',
            (node: ASTNode) => node.type === 'CallExpression' &&
                               /^use[A-Z]/.test(node.value?.toString() || ''),
            (node) => ({
              ...node,
              metadata: {
                ...node.metadata,
                isReactHook: true,
                domain: 'web',
              },
            })
          ),
          this.createPattern(
            'component-declaration',
            (node: ASTNode) => node.type === 'FunctionDeclaration' &&
                               /^[A-Z]/.test(node.id?.name || ''),
            (node) => ({
              ...node,
              metadata: {
                ...node.metadata,
                isReactComponent: true,
                domain: 'web',
              },
            })
          ),
        ],
        transforms: {
          'jsx-to-function': this.createDomainTransform(
            'web:jsx-to-function',
            'Transform JSX to React.createElement calls',
            (ast) => {
              console.log('Applying JSX to function transform');
              return ast;
            }
          ),
          'optimize-react': this.createDomainTransform(
            'web:optimize-react',
            'Optimize React component tree',
            (ast) => {
              console.log('Applying React optimization');
              return ast;
            }
          ),
        },
      }
    ));

    // Data Domain
    this.register(this.createDomain(
      'data',
      'Data processing, transformation, and analysis',
      {
        keywords: [
          'data', 'array', 'list', 'map', 'filter', 'reduce', 'transform',
          'aggregate', 'query', 'database', 'sql', 'pipeline', 'stream',
          'csv', 'json', 'xml', 'parquet', 'table', 'row', 'column',
        ],
        operators: ['->', '|>', '>>', '<<', '->>', '|', '&', '::'],
        types: {
          DataFrame: 'A tabular data structure with columns',
          Series: 'A one-dimensional labeled array',
          Pipeline: 'A sequence of data transformations',
          Query: 'A data query specification',
          Transformation: 'A data transformation operation',
          Aggregation: 'A data aggregation operation',
        },
        aliases: ['etl', 'analytics', 'database', 'sql', 'pandas'],
        patterns: [
          this.createPattern(
            'data-pipeline',
            (node: ASTNode) => node.type === 'ChainExpression' ||
                               node.type === 'CallExpression' &&
                               (node.value?.toString().includes('.map') ||
                                node.value?.toString().includes('.filter') ||
                                node.value?.toString().includes('.reduce')),
            (node) => ({
              ...node,
              metadata: {
                ...node.metadata,
                isDataPipeline: true,
                domain: 'data',
              },
            })
          ),
          this.createPattern(
            'sql-query',
            (node: ASTNode) => node.value?.toString().toLowerCase().includes('select'),
            (node) => ({
              ...node,
              metadata: {
                ...node.metadata,
                isSQLQuery: true,
                domain: 'data',
              },
            })
          ),
        ],
        transforms: {
          'pipeline-optimization': this.createDomainTransform(
            'data:pipeline-optimization',
            'Optimize data processing pipelines',
            (ast) => {
              console.log('Applying data pipeline optimization');
              return ast;
            }
          ),
          'query-optimization': this.createDomainTransform(
            'data:query-optimization',
            'Optimize data queries',
            (ast) => {
              console.log('Applying query optimization');
              return ast;
            }
          ),
        },
      }
    ));

    // AI/ML Domain
    this.register(this.createDomain(
      'ai',
      'Artificial intelligence and machine learning',
      {
        keywords: [
          'ai', 'ml', 'machine', 'learning', 'neural', 'network', 'model',
          'train', 'predict', 'inference', 'tensor', 'gradient', 'loss',
          'accuracy', 'dataset', 'feature', 'label', 'classification',
          'regression', 'clustering', 'embedding', 'transformer',
        ],
        operators: [],
        types: {
          Model: 'A trained machine learning model',
          Dataset: 'A collection of training data',
          Tensor: 'A multi-dimensional array for numerical computation',
          Layer: 'A neural network layer',
          Neuron: 'A single unit in a neural network',
          Embedding: 'A vector representation of data',
          Prediction: 'The output of a model',
        },
        aliases: ['ml', 'machine-learning', 'neural-networks', 'deep-learning'],
        patterns: [
          this.createPattern(
            'model-training',
            (node: ASTNode) => node.type === 'CallExpression' &&
                               node.value?.toString().toLowerCase().includes('fit') ||
                               node.value?.toString().toLowerCase().includes('train'),
            (node) => ({
              ...node,
              metadata: {
                ...node.metadata,
                isModelTraining: true,
                domain: 'ai',
              },
            })
          ),
          this.createPattern(
            'model-prediction',
            (node: ASTNode) => node.type === 'CallExpression' &&
                               node.value?.toString().toLowerCase().includes('predict') ||
                               node.value?.toString().toLowerCase().includes('infer'),
            (node) => ({
              ...node,
              metadata: {
                ...node.metadata,
                isModelPrediction: true,
                domain: 'ai',
              },
            })
          ),
        ],
        transforms: {
          'model-optimization': this.createDomainTransform(
            'ai:model-optimization',
            'Optimize model architecture and training',
            (ast) => {
              console.log('Applying model optimization');
              return ast;
            }
          ),
        },
      }
    ));

    // System Domain
    this.register(this.createDomain(
      'system',
      'System programming, operating systems, and low-level operations',
      {
        keywords: [
          'system', 'process', 'thread', 'memory', 'file', 'io', 'network',
          'socket', 'buffer', 'stream', 'binary', 'pointer', 'address',
          'kernel', 'os', 'shell', 'command', 'script', 'automation',
        ],
        operators: [],
        types: {
          Process: 'A running program instance',
          Thread: 'A unit of execution within a process',
          Memory: 'System memory allocation',
          File: 'A filesystem object',
          Socket: 'A network communication endpoint',
          Buffer: 'A binary data container',
        },
        aliases: ['os', 'sysadmin', 'devops', 'low-level'],
        patterns: [
          this.createPattern(
            'file-operation',
            (node: ASTNode) => node.type === 'CallExpression' &&
                               /\.(read|write|open|close|delete)/.test(node.value?.toString() || ''),
            (node) => ({
              ...node,
              metadata: {
                ...node.metadata,
                isFileOperation: true,
                domain: 'system',
              },
            })
          ),
          this.createPattern(
            'network-operation',
            (node: ASTNode) => node.type === 'CallExpression' &&
                               /\.(connect|send|receive|bind|listen)/.test(node.value?.toString() || ''),
            (node) => ({
              ...node,
              metadata: {
                ...node.metadata,
                isNetworkOperation: true,
                domain: 'system',
              },
            })
          ),
        ],
        transforms: {
          'security-check': this.createDomainTransform(
            'system:security-check',
            'Add security checks to system operations',
            (ast) => {
              console.log('Applying security checks');
              return ast;
            }
          ),
        },
      }
    ));

    // Financial Domain
    this.register(this.createDomain(
      'finance',
      'Financial systems, trading, and economic modeling',
      {
        keywords: [
          'finance', 'money', 'currency', 'stock', 'trade', 'portfolio',
          'investment', 'bank', 'account', 'transaction', 'ledger',
          'interest', 'rate', 'price', 'value', 'asset', 'liability',
        ],
        operators: [],
        types: {
          Transaction: 'A financial transaction',
          Account: 'A financial account',
          Portfolio: 'A collection of investments',
          Asset: 'A financial asset',
          Currency: 'A monetary currency',
          Price: 'The price of an asset',
        },
        aliases: ['banking', 'trading', 'economics', 'investment'],
        patterns: [
          this.createPattern(
            'financial-calculation',
            (node: ASTNode) => node.type === 'CallExpression' &&
                               /\.(calculate|compute|price|value|rate)/.test(node.value?.toString() || ''),
            (node) => ({
              ...node,
              metadata: {
                ...node.metadata,
                isFinancialCalculation: true,
                domain: 'finance',
              },
            })
          ),
        ],
        transforms: {
          'financial-validation': this.createDomainTransform(
            'finance:financial-validation',
            'Validate financial calculations and transactions',
            (ast) => {
              console.log('Applying financial validation');
              return ast;
            }
          ),
        },
      }
    ));

    // Game Development Domain
    this.register(this.createDomain(
      'game',
      'Game development and interactive media',
      {
        keywords: [
          'game', 'unity', 'unreal', 'engine', 'render', 'graphics', '3d',
          '2d', 'sprite', 'texture', 'mesh', 'shader', 'animation',
          'physics', 'collision', 'input', 'controller', 'player',
        ],
        operators: [],
        types: {
          GameObject: 'An object in a game world',
          Component: 'A modular part of a game object',
          Scene: 'A collection of game objects',
          Mesh: 'A 3D geometry',
          Texture: 'A 2D image for surfaces',
          Shader: 'A program for rendering graphics',
          Animation: 'A sequence of changes over time',
        },
        aliases: ['gamedev', 'unity', 'unreal', '3d', '2d'],
        patterns: [
          this.createPattern(
            'game-object',
            (node: ASTNode) => node.type === 'ClassDeclaration' &&
                               /Component|MonoBehaviour/.test(node.superClass?.toString() || ''),
            (node) => ({
              ...node,
              metadata: {
                ...node.metadata,
                isGameObject: true,
                domain: 'game',
              },
            })
          ),
        ],
        transforms: {
          'game-optimization': this.createDomainTransform(
            'game:game-optimization',
            'Optimize game performance',
            (ast) => {
              console.log('Applying game optimization');
              return ast;
            }
          ),
        },
      }
    ));

    // Load built-in 5GL definitions
    this.loadBuiltin5GL();
  }

  // ==========================================================================
  // Built-in 5GL Definitions
  // ==========================================================================

  loadBuiltin5GL(): void {
    // Web 5GL
    this.register5GL(this.create5GLDefinition(
      'web-5gl',
      'web',
      {
        // Declarative UI component
        component: this.createAbstraction(
          'Component',
          'declaration',
          [
            this.createParameter('name', 'string', true),
            this.createParameter('props', 'object', false, {}),
            this.createParameter('state', 'object', false, {}),
          ],
          {
            type: 'Component',
            name: '{name}',
            props: '{props}',
            state: '{state}',
            render: 'function() { return null; }',
          },
          'Declares a reusable UI component with props and state'
        ),
        
        // Page declaration
        page: this.createAbstraction(
          'Page',
          'declaration',
          [
            this.createParameter('title', 'string', true),
            this.createParameter('components', 'Component[]', true),
            this.createParameter('layout', 'string', false, 'vertical'),
          ],
          {
            type: 'Page',
            title: '{title}',
            components: '{components}',
            layout: '{layout}',
          },
          'Declares a web page with components and layout'
        ),
        
        // Data fetching
        dataSource: this.createAbstraction(
          'DataSource',
          'declaration',
          [
            this.createParameter('url', 'string', true),
            this.createParameter('method', 'string', false, 'GET'),
            this.createParameter('transform', 'function', false),
          ],
          {
            type: 'DataSource',
            url: '{url}',
            method: '{method}',
            transform: '{transform}',
          },
          'Declares a data source for fetching remote data'
        ),
      },
      {
        compile: (abstraction, target) => {
          if (target === 'react') {
            return this.compile5GLToReact(abstraction);
          }
          if (target === 'vue') {
            return this.compile5GLToVue(abstraction);
          }
          return JSON.stringify(abstraction, null, 2);
        },
      },
      {
        execute: (abstraction, input) => {
          // Execute the abstraction with input
          return { result: `Executed ${abstraction.name} with input`, input };
        },
      }
    ));

    // Data 5GL
    this.register5GL(this.create5GLDefinition(
      'data-5gl',
      'data',
      {
        // Pipeline declaration
        pipeline: this.createAbstraction(
          'Pipeline',
          'transformation',
          [
            this.createParameter('sources', 'DataSource[]', true),
            this.createParameter('transforms', 'Transform[]', true),
            this.createParameter('sink', 'DataSink', true),
          ],
          {
            type: 'Pipeline',
            sources: '{sources}',
            transforms: '{transforms}',
            sink: '{sink}',
          },
          'Declares a data processing pipeline'
        ),
        
        // Data transformation
        transform: this.createAbstraction(
          'Transform',
          'transformation',
          [
            this.createParameter('operation', 'string', true),
            this.createParameter('fields', 'string[]', false, []),
            this.createParameter('filter', 'function', false),
          ],
          {
            type: 'Transform',
            operation: '{operation}',
            fields: '{fields}',
            filter: '{filter}',
          },
          'Declares a data transformation step'
        ),
        
        // Aggregation
        aggregation: this.createAbstraction(
          'Aggregation',
          'constraint',
          [
            this.createParameter('groupBy', 'string[]', true),
            this.createParameter('metrics', 'Metric[]', true),
          ],
          {
            type: 'Aggregation',
            groupBy: '{groupBy}',
            metrics: '{metrics}',
          },
          'Declares data aggregation with grouping and metrics'
        ),
      },
      {
        compile: (abstraction, target) => {
          if (target === 'javascript') {
            return this.compile5GLToJavascript(abstraction);
          }
          if (target === 'python') {
            return this.compile5GLToPython(abstraction);
          }
          return JSON.stringify(abstraction, null, 2);
        },
      }
    ));

    // AI 5GL
    this.register5GL(this.create5GLDefinition(
      'ai-5gl',
      'ai',
      {
        // Model declaration
        model: this.createAbstraction(
          'Model',
          'declaration',
          [
            this.createParameter('type', 'string', true), // 'neural', 'svm', 'random-forest', etc.
            this.createParameter('layers', 'Layer[]', false, []),
            this.createParameter('inputShape', 'number[]', true),
            this.createParameter('outputShape', 'number[]', true),
          ],
          {
            type: 'Model',
            modelType: '{type}',
            layers: '{layers}',
            inputShape: '{inputShape}',
            outputShape: '{outputShape}',
          },
          'Declares a machine learning model'
        ),
        
        // Training process
        training: this.createAbstraction(
          'Training',
          'rule',
          [
            this.createParameter('model', 'Model', true),
            this.createParameter('dataset', 'Dataset', true),
            this.createParameter('epochs', 'number', false, 10),
            this.createParameter('batchSize', 'number', false, 32),
          ],
          {
            type: 'Training',
            model: '{model}',
            dataset: '{dataset}',
            epochs: '{epochs}',
            batchSize: '{batchSize}',
          },
          'Declares a model training process'
        ),
        
        // Prediction
        prediction: this.createAbstraction(
          'Prediction',
          'query',
          [
            this.createParameter('model', 'Model', true),
            this.createParameter('input', 'any', true),
          ],
          {
            type: 'Prediction',
            model: '{model}',
            input: '{input}',
          },
          'Declares a model prediction operation'
        ),
      },
      {
        compile: (abstraction, target) => {
          if (target === 'python') {
            return this.compileAI5GLToPython(abstraction);
          }
          return JSON.stringify(abstraction, null, 2);
        },
      }
    ));
  }

  // ==========================================================================
  // 5GL Compilation Helpers
  // ==========================================================================

  private compile5GLToReact(abstraction: FifthGLAbstraction): string {
    switch (abstraction.type) {
      case 'declaration':
        if (abstraction.name === 'Component') {
          const name = (abstraction.body as any).name || 'Component';
          const props = (abstraction.body as any).props || {};
          const state = (abstraction.body as any).state || {};
          
          return `import React, { useState } from 'react';

function ${name}(props) {
  const [state, setState] = useState(${JSON.stringify(state)});
  
  return (
    <div>
      {/* Component implementation */}
    </div>
  );
}

export default ${name};`;
        }
        break;
      case 'constraint':
        break;
    }
    
    return JSON.stringify(abstraction, null, 2);
  }

  private compile5GLToVue(abstraction: FifthGLAbstraction): string {
    switch (abstraction.type) {
      case 'declaration':
        if (abstraction.name === 'Component') {
          const name = (abstraction.body as any).name || 'Component';
          const props = (abstraction.body as any).props || {};
          const state = (abstraction.body as any).state || {};
          
          return `<template>
  <div>
    <!-- Component implementation -->
  </div>
</template>

<script>
export default {
  name: '${name}',
  props: ${JSON.stringify(props)},
  data() {
    return ${JSON.stringify(state)};
  }
};
</script>`;
        }
        break;
    }
    
    return JSON.stringify(abstraction, null, 2);
  }

  private compile5GLToJavascript(abstraction: FifthGLAbstraction): string {
    switch (abstraction.type) {
      case 'transformation':
        if (abstraction.name === 'Pipeline') {
          const body = abstraction.body as any;
          
          return `const pipeline = {
  sources: ${JSON.stringify(body.sources)},
  transforms: ${JSON.stringify(body.transforms)},
  sink: ${JSON.stringify(body.sink)},
  
  execute: function() {
    let data = this.sources;
    
    for (const transform of this.transforms) {
      data = this.applyTransform(data, transform);
    }
    
    return this.sink(data);
  },
  
  applyTransform: function(data, transform) {
    // Apply transformation logic
    return data;
  }
};`;
        }
        break;
    }
    
    return JSON.stringify(abstraction, null, 2);
  }

  private compile5GLToPython(abstraction: FifthGLAbstraction): string {
    switch (abstraction.type) {
      case 'transformation':
        if (abstraction.name === 'Pipeline') {
          const body = abstraction.body as any;
          
          return `class Pipeline:
    def __init__(self, sources, transforms, sink):
        self.sources = sources
        self.transforms = transforms
        self.sink = sink
    
    def execute(self):
        data = self.sources
        
        for transform in self.transforms:
            data = self.apply_transform(data, transform)
        
        return self.sink(data)
    
    def apply_transform(self, data, transform):
        # Apply transformation logic
        return data

# Usage
pipeline = Pipeline(
    sources=${JSON.stringify(body.sources)},
    transforms=${JSON.stringify(body.transforms)},
    sink=${JSON.stringify(body.sink)}
)
result = pipeline.execute()`;
        }
        break;
    }
    
    return JSON.stringify(abstraction, null, 2);
  }

  private compileAI5GLToPython(abstraction: FifthGLAbstraction): string {
    switch (abstraction.type) {
      case 'declaration':
        if (abstraction.name === 'Model') {
          const body = abstraction.body as any;
          
          return `from tensorflow.keras.models import Sequential
from tensorflow.keras.layers import Dense

# Model declaration
model = Sequential([
    # Layers would be defined here
])

# Compile the model
model.compile(optimizer='adam', loss='categorical_crossentropy', metrics=['accuracy'])

# Model information
print(f"Model type: {body.modelType}")
print(f"Input shape: {body.inputShape}")
print(f"Output shape: {body.outputShape}")`;
        }
        break;
    }
    
    return JSON.stringify(abstraction, null, 2);
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export const createDomainRegistry = (llm?: LLMClient, cache?: CacheManager) => {
  const registry = new DomainRegistry(llm, cache);
  registry.loadBuiltinDomains();
  return registry;
};

export default DomainRegistry;
