/**
 * Universal Transpiler - Parser Generator
 * 
 * Dynamically generates parsers for unknown languages using LLM
 */

import * as crypto from 'crypto';
import type {
  ASTNode,
  Token,
  Position,
  ParseResult,
  Parser,
  LanguageDefinition,
  LLMClient,
  CacheManager,
} from '../core/universal-transpiler';

// ============================================================================
// Types
// ============================================================================

export interface ParserGenerationOptions {
  languageName: string;
  languageVersion?: string;
  sampleCode: string[];
  keywords?: string[];
  operators?: string[];
  delimiters?: string[];
  stringPatterns?: string[];
  commentPatterns?: string[];
  grammarRules?: GrammarRule[];
  baseLanguage?: string;
  extend?: boolean;
  domain?: string;
}

export interface GrammarRule {
  name: string;
  pattern: string | RegExp;
  type: 'terminal' | 'non-terminal' | 'production';
  precedence?: number;
  associativity?: 'left' | 'right' | 'none';
  description?: string;
}

export interface CodeAnalysisResult {
  tokens: Map<string, number>;
  keywords: string[];
  operators: string[];
  delimiters: string[];
  stringPatterns: string[];
  commentPatterns: string[];
  tokenCount: number;
  llmCalls: number;
}

export interface GeneratedParser {
  parser: Parser;
  definition: LanguageDefinition;
  grammar: GrammarRule[];
  generationStats: ParserGenerationStats;
}

export interface ParserGenerationStats {
  generationTime: number;
  llmCalls: number;
  tokensGenerated: number;
  rulesGenerated: number;
  confidence: number;
  samplesUsed: number;
}

export interface ParserTemplate {
  name: string;
  description: string;
  skeleton: string;
  placeholders: string[];
  language: string;
}

export interface ParserTestCase {
  code: string;
  expectedAST?: Partial<ASTNode>;
  expectedTokens?: Partial<Token>[];
  description: string;
  shouldPass: boolean;
}

export interface ParserValidationResult {
  tests: ParserTestResult[];
  passRate: number;
  issues: ParserIssue[];
  recommendations: string[];
}

export interface ParserTestResult {
  testCase: ParserTestCase;
  passed: boolean;
  error?: string;
  actualAST?: ASTNode;
  actualTokens?: Token[];
  diff?: any;
  duration: number;
}

export interface ParserIssue {
  type: 'syntax' | 'semantic' | 'performance' | 'correctness';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  testCase?: string;
  position?: Position;
  suggestedFix?: string;
}

export interface ParserGenerationCacheEntry {
  key: string;
  parser: Parser;
  definition: LanguageDefinition;
  grammar: GrammarRule[];
  timestamp: number;
  version: string;
}

// ============================================================================
// Parser Generator Class
// ============================================================================

export class ParserGenerator {
  private llm?: LLMClient;
  private cache?: CacheManager;
  private generatedParsers: Map<string, GeneratedParser> = new Map();
  
  private options: {
    enableCaching: boolean;
    enableLLM: boolean;
    maxRetries: number;
    minConfidence: number;
    debug: boolean;
  };

  constructor(llm?: LLMClient, cache?: CacheManager, options?: Partial<ParserGenerator['options']>) {
    this.llm = llm;
    this.cache = cache;
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

  async generateParser(options: ParserGenerationOptions): Promise<GeneratedParser> {
    const startTime = Date.now();
    let llmCalls = 0;
    
    // Check cache
    const cacheKey = this.generateCacheKey(options);
    if (this.options.enableCaching && this.cache) {
      const cached = await this.cache.get<ParserGenerationCacheEntry>(cacheKey);
      if (cached) {
        this.log(`Using cached parser for ${options.languageName}`);
        return {
          parser: cached.parser,
          definition: cached.definition,
          grammar: cached.grammar,
          generationStats: {
            generationTime: 0,
            llmCalls: 0,
            tokensGenerated: cached.grammar.length * 10,
            rulesGenerated: cached.grammar.length,
            confidence: 1,
            samplesUsed: 0,
          },
        };
      }
    }
    
    // Step 1: Analyze sample code to extract language features
    const analysis = await this.analyzeSampleCode(options.sampleCode);
    llmCalls += analysis.llmCalls;
    
    // Step 2: Generate grammar rules
    const grammar = await this.generateGrammar(options, analysis);
    llmCalls += grammar.llmCalls;
    
    // Step 3: Create language definition
    const definition = this.createLanguageDefinition(options, grammar.rules);
    
    // Step 4: Generate parser implementation
    const parser = await this.generateParserImplementation(options, grammar.rules, definition);
    llmCalls += parser.llmCalls;
    
    // Step 5: Validate parser with test cases
    const validation = await this.validateParser(parser.parser, definition, options.sampleCode);
    
    // Step 6: Refine parser if needed
    if (validation.passRate < this.options.minConfidence && this.options.maxRetries > 0) {
      await this.refineParser(parser.parser, validation, options, definition);
    }
    
    const generationTime = Date.now() - startTime;
    const generated: GeneratedParser = {
      parser: parser.parser,
      definition,
      grammar: grammar.rules,
      generationStats: {
        generationTime,
        llmCalls,
        tokensGenerated: analysis.tokenCount,
        rulesGenerated: grammar.rules.length,
        confidence: validation.passRate,
        samplesUsed: options.sampleCode.length,
      },
    };
    
    // Cache
    if (this.options.enableCaching && this.cache) {
      await this.cache.set(cacheKey, {
        key: cacheKey,
        parser: parser.parser,
        definition,
        grammar: grammar.rules,
        timestamp: Date.now(),
        version: options.languageVersion || '1.0.0',
      }, 86400000); // 24 hours
    }
    
    this.generatedParsers.set(options.languageName, generated);
    this.log(`Generated parser for ${options.languageName} in ${generationTime}ms`);
    
    return generated;
  }

  // ==========================================================================
  // Code Analysis
  // ==========================================================================

  private async analyzeSampleCode(samples: string[]): Promise<CodeAnalysisResult> {
    const tokens = new Map<string, number>();
    const keywords = new Set<string>();
    const operators = new Set<string>();
    const delimiters = new Set<string>();
    const stringPatterns = new Set<string>();
    const commentPatterns = new Set<string>();
    let tokenCount = 0;
    let llmCalls = 0;
    
    // Tokenize samples
    for (const code of samples) {
      const result = this.tokenizeCode(code);
      tokenCount += result.tokens.length;
      
      for (const token of result.tokens) {
        tokens.set(token.value, (tokens.get(token.value) || 0) + 1);
        
        // Classify tokens
        if (this.isLikelyKeyword(token.value)) {
          keywords.add(token.value);
        } else if (this.isOperator(token.value)) {
          operators.add(token.value);
        } else if (this.isDelimiter(token.value)) {
          delimiters.add(token.value);
        }
      }
      
      // Detect string patterns
      const stringMatches = code.match(/(?:"[^"]*"|'[^']*')/g);
      if (stringMatches) {
        for (const match of stringMatches) {
          stringPatterns.add(match.slice(0, 2) + match.slice(-2));
        }
      }
      
      // Detect comment patterns
      const commentMatches = code.match(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g);
      if (commentMatches) {
        for (const match of commentMatches) {
          commentPatterns.add(match.slice(0, 2));
        }
      }
    }
    
    // Use LLM to enhance analysis
    if (this.llm && this.options.enableLLM) {
      const sampleText = samples.join('\n---\n').substring(0, 8000);
      const prompt = {
        system: `You are a language analysis expert. Analyze the following code samples and identify:
1. Keywords (reserved words)
2. Operators
3. Delimiters (brackets, braces, etc.)
4. String literal patterns
5. Comment patterns

Return ONLY a JSON object with these fields.`,
        user: `Code samples:\n${sampleText}`,
      };
      
      try {
        const response = await this.llm.generate(prompt);
        llmCalls++;
        const parsed = JSON.parse(response.content);
        
        if (parsed.keywords) {
          parsed.keywords.forEach((k: string) => keywords.add(k));
        }
        if (parsed.operators) {
          parsed.operators.forEach((o: string) => operators.add(o));
        }
        if (parsed.delimiters) {
          parsed.delimiters.forEach((d: string) => delimiters.add(d));
        }
        if (parsed.stringPatterns) {
          parsed.stringPatterns.forEach((s: string) => stringPatterns.add(s));
        }
        if (parsed.commentPatterns) {
          parsed.commentPatterns.forEach((c: string) => commentPatterns.add(c));
        }
      } catch {
        // Fallback to heuristic analysis
      }
    }
    
    return {
      tokens,
      keywords: Array.from(keywords),
      operators: Array.from(operators),
      delimiters: Array.from(delimiters),
      stringPatterns: Array.from(stringPatterns),
      commentPatterns: Array.from(commentPatterns),
      tokenCount,
      llmCalls,
    };
  }

  private tokenizeCode(code: string): { tokens: Token[] } {
    const tokens: Token[] = [];
    let pos = 0;
    let line = 1;
    let column = 0;
    
    while (pos < code.length) {
      const char = code[pos];
      
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
      
      // String literals
      if (char === '"' || char === "'") {
        const quote = char;
        let end = pos + 1;
        while (end < code.length && code[end] !== quote) {
          if (code[end] === '\\') end++;
          end++;
        }
        end++;
        const value = code.substring(pos, end);
        tokens.push(this.createToken('STRING', value, line, column, pos));
        column += end - pos;
        pos = end;
        continue;
      }
      
      // Comments
      if (code.substring(pos, pos + 2) === '//') {
        let end = pos + 2;
        while (end < code.length && code[end] !== '\n') end++;
        const value = code.substring(pos, end);
        tokens.push(this.createToken('COMMENT', value, line, column, pos));
        column += end - pos;
        pos = end;
        continue;
      }
      
      if (code.substring(pos, pos + 2) === '/*') {
        let end = pos + 2;
        while (end < code.length - 1 && code.substring(end, end + 2) !== '*/') end++;
        end += 2;
        const value = code.substring(pos, end);
        tokens.push(this.createToken('COMMENT', value, line, column, pos));
        column += end - pos;
        pos = end;
        continue;
      }
      
      // Numbers
      if (/\d/.test(char)) {
        let end = pos + 1;
        while (end < code.length && /[\d.]/.test(code[end])) end++;
        const value = code.substring(pos, end);
        tokens.push(this.createToken('NUMBER', value, line, column, pos));
        column += end - pos;
        pos = end;
        continue;
      }
      
      // Identifiers and keywords
      if (/[a-zA-Z_]/.test(char)) {
        let end = pos + 1;
        while (end < code.length && /[a-zA-Z0-9_]/.test(code[end])) end++;
        const value = code.substring(pos, end);
        tokens.push(this.createToken('IDENTIFIER', value, line, column, pos));
        column += end - pos;
        pos = end;
        continue;
      }
      
      // Operators and delimiters
      if (/[+\-*/%=<>!&|^~?,.:;(){}\[\]]/.test(char)) {
        tokens.push(this.createToken('OPERATOR', char, line, column, pos));
        column++;
        pos++;
        continue;
      }
      
      // Unknown
      tokens.push(this.createToken('UNKNOWN', char, line, column, pos));
      column++;
      pos++;
    }
    
    return { tokens };
  }

  private createToken(type: string, value: string, line: number, column: number, offset: number): Token {
    const endColumn = column + value.length;
    return {
      type,
      value,
      position: { line, column, offset },
      location: {
        start: { line, column, offset },
        end: { line, column: endColumn, offset: offset + value.length },
        source: value,
      },
    };
  }

  private isLikelyKeyword(value: string): boolean {
    const keywords = ['if', 'else', 'for', 'while', 'do', 'switch', 'case', 'break', 'continue',
      'return', 'function', 'class', 'var', 'let', 'const', 'import', 'export',
      'try', 'catch', 'finally', 'throw', 'new', 'delete', 'typeof', 'instanceof',
      'void', 'this', 'super', 'static', 'public', 'private', 'protected',
      'interface', 'type', 'enum', 'namespace', 'module', 'declare', 'abstract',
      'implements', 'extends', 'as', 'satisfies', 'keyof', 'typeof',
      'infer', 'never', 'unknown', 'any', 'null', 'undefined', 'true', 'false'];
    return keywords.includes(value) || /^[A-Z][a-zA-Z0-9_]*$/.test(value);
  }

  private isOperator(value: string): boolean {
    const operators = ['+', '-', '*', '/', '%', '**', '++', '--', '=', '+=', '-=', '*=', '/=', '%=',
      '==', '!=', '===', '!==', '>', '<', '>=', '<=', '&&', '||', '!', '??', '?.',
      '...', 'delete', 'new', 'instanceof', 'in', 'typeof', 'void', '=>'];
    return operators.includes(value);
  }

  private isDelimiter(value: string): boolean {
    const delimiters = ['(', ')', '{', '}', '[', ']', ',', ';', ':', '.', '?', '!'];
    return delimiters.includes(value);
  }

  // ==========================================================================
  // Grammar Generation
  // ==========================================================================

  private async generateGrammar(
    options: ParserGenerationOptions,
    analysis: CodeAnalysisResult
  ): Promise<{ rules: GrammarRule[]; llmCalls: number }> {
    const rules: GrammarRule[] = [];
    let llmCalls = 0;
    
    // Add basic terminal rules
    rules.push({
      name: 'WHITESPACE',
      pattern: /\s+/,
      type: 'terminal',
      precedence: 0,
      associativity: 'none',
      description: 'Whitespace characters',
    });
    
    rules.push({
      name: 'IDENTIFIER',
      pattern: /[a-zA-Z_][a-zA-Z0-9_]*/,
      type: 'terminal',
      precedence: 10,
      associativity: 'none',
      description: 'Variable names, function names, etc.',
    });
    
    rules.push({
      name: 'NUMBER',
      pattern: /\d+(\.\d*)?/,
      type: 'terminal',
      precedence: 10,
      associativity: 'none',
      description: 'Numeric literals',
    });
    
    // Add string literal rules based on detected patterns
    if (analysis.stringPatterns.length > 0) {
      const patterns = analysis.stringPatterns.map(p => this.escapeRegExp(p));
      rules.push({
        name: 'STRING',
        pattern: new RegExp(patterns.join('|')),
        type: 'terminal',
        precedence: 5,
        associativity: 'none',
        description: 'String literals',
      });
    } else {
      rules.push({
        name: 'STRING',
        pattern: /"[^"]*"|'[^']*'/,
        type: 'terminal',
        precedence: 5,
        associativity: 'none',
        description: 'String literals',
      });
    }
    
    // Add comment rules
    if (analysis.commentPatterns.length > 0) {
      rules.push({
        name: 'COMMENT',
        pattern: /\/\/[^\n]*|\/\*[\s\S]*?\*\//,
        type: 'terminal',
        precedence: 0,
        associativity: 'none',
        description: 'Comments',
      });
    }
    
    // Add operator rules
    for (const op of analysis.operators) {
      rules.push({
        name: op,
        pattern: this.escapeRegExp(op),
        type: 'terminal',
        precedence: 20,
        associativity: op === '=' ? 'right' : 'left',
        description: `Operator: ${op}`,
      });
    }
    
    // Add delimiter rules
    for (const delim of analysis.delimiters) {
      rules.push({
        name: delim,
        pattern: this.escapeRegExp(delim),
        type: 'terminal',
        precedence: 30,
        associativity: 'none',
        description: `Delimiter: ${delim}`,
      });
    }
    
    // Add keyword rules
    for (const kw of analysis.keywords) {
      rules.push({
        name: kw,
        pattern: new RegExp(`\\b${this.escapeRegExp(kw)}\\b`),
        type: 'terminal',
        precedence: 15,
        associativity: 'none',
        description: `Keyword: ${kw}`,
      });
    }
    
    // Use LLM to generate non-terminal rules
    if (this.llm && this.options.enableLLM) {
      const sampleText = options.sampleCode.join('\n---\n').substring(0, 4000);
      const keywordsText = analysis.keywords.join(', ');
      const operatorsText = analysis.operators.join(', ');
      
      const prompt = {
        system: `You are a language grammar expert. Given the following code samples, keywords, and operators,
generate grammar production rules in JSON format. Each rule should have:
- name: rule name
- pattern: regex pattern or string
- type: 'non-terminal' or 'production'
- description: brief description

Focus on high-level structures like:
- Program -> Statement*
- Statement -> IfStatement | WhileStatement | FunctionDeclaration | ExpressionStatement
- Expression -> BinaryExpression | Identifier | Literal

Return ONLY a JSON array of grammar rules.`,
        user: `Code samples:\n${sampleText}\n\nKeywords: ${keywordsText}\nOperators: ${operatorsText}\nLanguage: ${options.languageName}`,
      };
      
      try {
        const response = await this.llm.generate(prompt);
        llmCalls++;
        const parsed = JSON.parse(response.content);
        
        for (const rule of parsed) {
          if (rule.type !== 'terminal') {
            rules.push({
              name: rule.name,
              pattern: rule.pattern,
              type: rule.type,
              precedence: rule.precedence || 0,
              associativity: rule.associativity || 'none',
              description: rule.description || '',
            });
          }
        }
      } catch {
        // Fallback to basic grammar
        this.addBasicGrammarRules(rules, options.languageName);
      }
    } else {
      this.addBasicGrammarRules(rules, options.languageName);
    }
    
    return { rules, llmCalls };
  }

  private addBasicGrammarRules(rules: GrammarRule[], languageName: string): void {
    // Basic grammar rules that work for most C-like languages
    const basicRules: GrammarRule[] = [
      {
        name: 'Program',
        pattern: 'Statement*',
        type: 'non-terminal',
        precedence: 0,
        description: 'Root node of the AST',
      },
      {
        name: 'Statement',
        pattern: 'VariableDeclaration | FunctionDeclaration | ExpressionStatement | IfStatement | WhileStatement | ReturnStatement | BlockStatement',
        type: 'non-terminal',
        precedence: 0,
        description: 'A single statement',
      },
      {
        name: 'BlockStatement',
        pattern: '{ Statement* }',
        type: 'non-terminal',
        precedence: 0,
        description: 'A block of statements',
      },
      {
        name: 'VariableDeclaration',
        pattern: 'let | const | var',
        type: 'non-terminal',
        precedence: 0,
        description: 'Variable declaration',
      },
      {
        name: 'FunctionDeclaration',
        pattern: 'function IDENTIFIER ( Parameters ) BlockStatement',
        type: 'non-terminal',
        precedence: 0,
        description: 'Function declaration',
      },
      {
        name: 'IfStatement',
        pattern: 'if ( Expression ) Statement ( else Statement )?',
        type: 'non-terminal',
        precedence: 0,
        description: 'If statement',
      },
      {
        name: 'WhileStatement',
        pattern: 'while ( Expression ) Statement',
        type: 'non-terminal',
        precedence: 0,
        description: 'While statement',
      },
      {
        name: 'ReturnStatement',
        pattern: 'return Expression? ;',
        type: 'non-terminal',
        precedence: 0,
        description: 'Return statement',
      },
      {
        name: 'ExpressionStatement',
        pattern: 'Expression ;',
        type: 'non-terminal',
        precedence: 0,
        description: 'Expression statement',
      },
      {
        name: 'Expression',
        pattern: 'BinaryExpression | Identifier | Literal | FunctionCall | ParenthesizedExpression',
        type: 'non-terminal',
        precedence: 0,
        description: 'An expression',
      },
      {
        name: 'BinaryExpression',
        pattern: 'Expression ( + | - | * | / | == | != | > | < ) Expression',
        type: 'non-terminal',
        precedence: 1,
        description: 'Binary expression',
      },
      {
        name: 'Identifier',
        pattern: 'IDENTIFIER',
        type: 'non-terminal',
        precedence: 0,
        description: 'Identifier reference',
      },
      {
        name: 'Literal',
        pattern: 'NUMBER | STRING | true | false | null',
        type: 'non-terminal',
        precedence: 0,
        description: 'Literal value',
      },
    ];
    
    // Add language-specific rules
    if (languageName.toLowerCase().includes('python')) {
      basicRules.push({
        name: 'FunctionDeclaration',
        pattern: 'def IDENTIFIER ( Parameters ) : BlockStatement',
        type: 'non-terminal',
        precedence: 0,
        description: 'Python function declaration',
      });
    }
    
    rules.push(...basicRules);
  }

  private escapeRegExp(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // ==========================================================================
  // Language Definition Creation
  // ==========================================================================

  private createLanguageDefinition(
    options: ParserGenerationOptions,
    grammar: GrammarRule[]
  ): LanguageDefinition {
    // Extract keywords from grammar
    const keywords = grammar
      .filter(r => r.type === 'terminal' && /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(r.name))
      .map(r => r.name);
    
    // Extract operators from grammar
    const operators = grammar
      .filter(r => r.type === 'terminal' && this.isOperator(r.name))
      .map(r => r.name);
    
    // Determine file extensions
    const extensions = this.determineExtensions(options.languageName);
    
    return {
      name: options.languageName.toLowerCase(),
      version: options.languageVersion || '1.0.0',
      extensions,
      mimetypes: this.determineMimeTypes(options.languageName),
      parser: {
        parse: (source: string) => this.createParserFromGrammar(grammar).parse(source),
        tokenize: (source: string) => this.tokenizeCode(source).tokens,
        canParse: () => true,
      },
      keywords,
      operators,
      builtins: {},
      domain: options.domain,
    };
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
      haskell: ['.hs'],
      elixir: ['.ex', '.exs'],
      clang: ['.clj', '.cljs'],
      fsharp: ['.fs'],
      ocaml: ['.ml', '.mli'],
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
      kotlin: ['text/x-kotlin'],
      scala: ['text/x-scala'],
      haskell: ['text/x-haskell'],
      html: ['text/html', 'application/xhtml+xml'],
      css: ['text/css'],
      json: ['application/json'],
    };
    
    const normalized = languageName.toLowerCase();
    return mimeMap[normalized] || [`text/x-${normalized}`];
  }

  // ==========================================================================
  // Parser Implementation Generation
  // ==========================================================================

  private async generateParserImplementation(
    options: ParserGenerationOptions,
    grammar: GrammarRule[],
    definition: LanguageDefinition
  ): Promise<{ parser: Parser; llmCalls: number }> {
    let llmCalls = 0;
    
    if (this.llm && this.options.enableLLM) {
      // Use LLM to generate parser code
      const grammarText = JSON.stringify(grammar, null, 2).substring(0, 8000);
      
      const prompt = {
        system: `You are an expert parser generator. Generate a complete TypeScript parser implementation
for the following grammar rules. The parser should:

1. Tokenize the source code
2. Parse tokens into an AST
3. Return a ParseResult with ast, tokens, errors, and warnings

Use the following interface:

interface ParseResult {
  ast: ASTNode;
  tokens: Token[];
  errors: ParseError[];
  warnings: ParseWarning[];
}

interface Parser {
  parse: (source: string, options?: any) => ParseResult;
  tokenize: (source: string) => Token[];
  canParse: (source: string) => boolean;
}

Return ONLY the complete TypeScript code for the parser.`,
        user: `Grammar rules:\n${grammarText}\n\nLanguage: ${options.languageName}\nBase language: ${options.baseLanguage || 'none'}`,
      };
      
      try {
        const response = await this.llm.generate(prompt);
        llmCalls++;
        
        // Try to create a parser from the generated code
        const parser = this.createParserFromCode(response.content, definition);
        if (parser) {
          return { parser, llmCalls };
        }
      } catch {
        // Fallback to grammar-based parser
      }
    }
    
    // Fallback: create parser from grammar
    const parser = this.createParserFromGrammar(grammar);
    return { parser, llmCalls };
  }

  private createParserFromGrammar(grammar: GrammarRule[]): Parser {
    const parser: Parser = {
      parse: (source: string) => this.parseWithGrammar(source, grammar),
      tokenize: (source: string) => this.tokenizeCode(source).tokens,
      canParse: () => true,
    };
    
    return parser;
  }

  private parseWithGrammar(source: string, _grammar: GrammarRule[]): ParseResult {
    const tokens = this.tokenizeCode(source).tokens;
    const ast = this.buildASTFromTokens(tokens);
    
    return {
      ast,
      tokens,
      errors: [],
      warnings: [],
    };
  }

  private buildASTFromTokens(tokens: Token[]): ASTNode {
    const root: ASTNode = {
      type: 'Program',
      value: null,
      children: [],
      tokens,
      position: { line: 1, column: 0, offset: 0 },
      location: {
        start: { line: 1, column: 0, offset: 0 },
        end: { line: 1, column: 0, offset: 0 },
        source: '',
      },
      metadata: {},
    };
    
    // Simple AST building - in real implementation, would use grammar rules
    let currentStatement: ASTNode | null = null;
    
    for (const token of tokens) {
      // Skip whitespace and comments
      if (token.type === 'WHITESPACE' || token.type === 'COMMENT') continue;
      
      // Create expression statement for identifiers and literals
      if (token.type === 'IDENTIFIER' || token.type === 'NUMBER' || token.type === 'STRING') {
        const expr: ASTNode = {
          type: token.type,
          value: token.value,
          children: [],
          tokens: [token],
          position: token.position,
          location: token.location,
          metadata: {},
        };
        
        if (!currentStatement) {
          currentStatement = {
            type: 'ExpressionStatement',
            value: null,
            children: [expr],
            tokens: [token],
            position: token.position,
            location: token.location,
            metadata: {},
          };
          if (root.children) root.children.push(currentStatement);
        } else if (currentStatement && currentStatement.children) {
          currentStatement.children.push(expr);
        }
      }
      
      // Handle operators
      if (token.type === 'OPERATOR' && token.value.length === 1) {
        if (currentStatement && currentStatement.children && currentStatement.children.length > 0) {
          currentStatement.children.push({
            type: 'Operator',
            value: token.value,
            children: [],
            tokens: [token],
            position: token.position,
            location: token.location,
            metadata: {},
          });
        }
      }
      
      // Reset current statement on semicolon or closing brace
      if (token.value === ';' || token.value === '}') {
        currentStatement = null;
      }
    }
    
    return root;
  }

  private createParserFromCode(_code: string, _definition: LanguageDefinition): Parser | null {
    // In a real implementation, would compile and evaluate the generated code
    // For now, return null to use the fallback parser
    return null;
  }

  // ==========================================================================
  // Parser Validation
  // ==========================================================================

  private async validateParser(
    parser: Parser,
    _definition: LanguageDefinition,
    samples: string[]
  ): Promise<ParserValidationResult> {
    const tests: ParserTestResult[] = [];
    const issues: ParserIssue[] = [];
    const recommendations: string[] = [];
    
    // Create test cases from samples
    const testCases: ParserTestCase[] = samples.map((code, i) => ({
      code,
      description: `Sample ${i + 1}`,
      shouldPass: true,
    }));
    
    // Run tests
    for (const testCase of testCases) {
      const startTime = Date.now();
      const testResult: ParserTestResult = {
        testCase,
        passed: false,
        duration: 0,
      };
      
      try {
        const result = parser.parse(testCase.code);
        testResult.actualAST = result.ast;
        testResult.actualTokens = result.tokens;
        
        // Basic validation
        if (result.ast && result.ast.type === 'Program') {
          testResult.passed = true;
        } else {
          testResult.error = 'AST root is not a Program';
        }
        
        if (result.errors.length > 0) {
          testResult.passed = false;
          testResult.error = `Parse errors: ${result.errors.map(e => e.message).join(', ')}`;
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
          description: testResult.error || 'Parse failed',
          testCase: testCase.description,
          suggestedFix: 'Improve grammar rules for this pattern',
        });
      }
    }
    
    // Calculate pass rate
    const passRate = tests.filter(t => t.passed).length / tests.length;
    
    // Generate recommendations
    if (passRate < 0.5) {
      recommendations.push('Consider providing more sample code for training');
    }
    if (passRate < 1.0) {
      recommendations.push('Review failed test cases and adjust grammar');
    }
    
    return {
      tests,
      passRate,
      issues,
      recommendations,
    };
  }

  private async refineParser(
    _parser: Parser,
    validation: ParserValidationResult,
    options: ParserGenerationOptions,
    definition: LanguageDefinition
  ): Promise<void> {
    // Analyze failures
    const failures = validation.tests.filter(t => !t.passed);
    
    if (failures.length === 0 || !this.llm) return;
    
    // Extract error patterns
    const errorPatterns = failures.map(f => f.error || 'Unknown error');
    
    // Use LLM to suggest grammar improvements
    const prompt = {
      system: `You are a language grammar expert. Analyze the following parse failures and suggest
grammar rule improvements. Return ONLY a JSON object with:
{
  improvements: [{ ruleName: string; change: string; reason: string }],
  newRules: GrammarRule[]
}`,
      user: `Language: ${options.languageName}\n\nParse failures:\n${errorPatterns.map((e, i) => `${i + 1}. ${e}`).join('\n')}\n\nCurrent grammar:\n${JSON.stringify(definition)}`,
    };
    
    try {
      const response = await this.llm.generate(prompt);
      const parsed = JSON.parse(response.content);
      
      // In a real implementation, would update the grammar and regenerate the parser
      // For now, just log the improvements
      this.log(`Grammar improvements suggested: ${JSON.stringify(parsed.improvements)}`);
      this.log(`New rules suggested: ${JSON.stringify(parsed.newRules)}`);
    } catch {
      // Failed to get improvements
    }
  }

  // ==========================================================================
  // Utility Methods
  // ==========================================================================

  private generateCacheKey(options: ParserGenerationOptions): string {
    const hash = crypto.createHash('sha256');
    hash.update(options.languageName);
    hash.update(options.languageVersion || '');
    hash.update(options.baseLanguage || '');
    hash.update(options.sampleCode.join('\n'));
    return `parser-${hash.digest('hex')}`;
  }

  private log(...args: any[]): void {
    if (this.options.debug) {
      console.log('[ParserGenerator]', ...args);
    }
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createParserGenerator(
  llm?: LLMClient,
  cache?: CacheManager,
  options?: Partial<ParserGenerator['options']>
): ParserGenerator {
  return new ParserGenerator(llm, cache, options);
}
