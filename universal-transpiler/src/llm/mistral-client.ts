/**
 * Mistral API Client for Universal Transpiler
 * 
 * Provides LLM-based code generation, analysis, and transformation
 * for the universal transpiler framework.
 */

import type {
  LLMClient,
  LLMOptions,
  LLMPrompt,
  LLMResponse,
  ASTNode,
  Parser,
  Transform,
  CacheManager,
} from '../core/universal-transpiler';

// ============================================================================
// Mistral API Types
// ============================================================================

export interface MistralOptions extends LLMOptions {
  apiKey?: string;
  endpoint?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  topK?: number;
  stop?: string[];
}

export interface MistralRequest {
  model: string;
  messages: Array<{
    role: 'user' | 'assistant' | 'system';
    content: string;
  }>;
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  top_k?: number;
  stop?: string[];
  stream?: boolean;
  random_seed?: number;
  safe_mode?: boolean;
  safe_prompt?: boolean;
}

export interface MistralResponse {
  output: {
    id: string;
    model: string;
    created: number;
    choices: Array<{
      index: number;
      message: {
        role: string;
        content: string;
      };
      finish_reason: string;
    }>;
    usage: {
      prompt_tokens: number;
      completion_tokens: number;
      total_tokens: number;
    };
  };
}

// ============================================================================
// Mistral Client Implementation
// ============================================================================

export class MistralClient implements LLMClient {
  private options: MistralOptions;
  private cache: CacheManager | null = null;
  private requestCount = 0;

  constructor(options: MistralOptions = {}) {
    this.options = {
      provider: 'mistral',
      model: options.model || 'mistral-large-latest',
      apiKey: options.apiKey || process.env.MISTRAL_API_KEY,
      endpoint: options.endpoint || 'https://api.mistral.ai/v1/chat/completions',
      temperature: options.temperature || 0.7,
      maxTokens: options.maxTokens || 4096,
      ...options,
    };
  }

  setCacheManager(cache: CacheManager): void {
    this.cache = cache;
  }

  private getCacheKey(prompt: LLMPrompt, type: string): string {
    const hash = this.hashObject({ prompt, type, model: this.options.model });
    return `llm:${type}:${hash}`;
  }

  private hashObject(obj: any): string {
    const str = JSON.stringify(obj);
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }

  async generate(prompt: LLMPrompt, options?: LLMOptions): Promise<LLMResponse> {
    this.requestCount++;
    
    const cacheKey = this.getCacheKey(prompt, 'generate');
    
    // Check cache
    if (this.cache && this.cache.has(cacheKey)) {
      const cached = this.cache.get<LLMResponse>(cacheKey);
      if (cached) {
        return cached;
      }
    }

    const request: MistralRequest = {
      model: options?.model || this.options.model,
      messages: [
        { role: 'system', content: prompt.system },
        { role: 'user', content: prompt.user },
      ],
      temperature: options?.temperature || this.options.temperature,
      max_tokens: options?.maxTokens || this.options.maxTokens,
      top_p: options?.topP,
      top_k: options?.topK,
      stop: options?.stop,
      stream: false,
    };

    try {
      const response = await this.fetchMistral(request);
      const result: LLMResponse = {
        content: response.output.choices[0]?.message?.content || '',
        finishReason: response.output.choices[0]?.finish_reason || 'error',
        usage: {
          promptTokens: response.output.usage.prompt_tokens,
          completionTokens: response.output.usage.completion_tokens,
          totalTokens: response.output.usage.total_tokens,
        },
      };

      // Cache response
      if (this.cache) {
        this.cache.set(cacheKey, result, 86400000); // 24 hour cache
      }

      return result;
    } catch (error) {
      console.error('Mistral API error:', error);
      return {
        content: '',
        finishReason: 'error',
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      };
    }
  }

  private async fetchMistral(request: MistralRequest): Promise<MistralResponse> {
    // Check for API key
    const apiKey = this.options.apiKey || process.env.MISTRAL_API_KEY;
    if (!apiKey) {
      throw new Error('Mistral API key is required. Set MISTRAL_API_KEY environment variable.');
    }

    const response = await fetch(this.options.endpoint!, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Mistral API error: ${response.status} - ${error}`);
    }

    return response.json() as Promise<MistralResponse>;
  }

  // ============================================================================
  // Code Analysis
  // ============================================================================

  async analyzeCode(
    code: string,
    language: string,
    task: string
  ): Promise<any> {
    const cacheKey = this.getCacheKey({ system: '', user: `analyze:${language}:${task}:${code.substring(0, 100)}` }, 'analyze');
    
    if (this.cache && this.cache.has(cacheKey)) {
      return this.cache.get<any>(cacheKey);
    }

    const prompt: LLMPrompt = {
      system: `You are a code analysis expert. Your task is to analyze the given code and provide insights based on the requested task.

Return your analysis as a JSON object with the following structure:
{
  "analysis": "your analysis",
  "language": "detected or confirmed language",
  "syntaxValid": true/false,
  "constructs": ["list of syntax constructs"],
  "complexity": "low|medium|high",
  "recommendations": ["list of recommendations"]
}

Return ONLY valid JSON.`,
      user: `Analyze the following code for the task: "${task}"

Code:
${code}

Analysis:`,
    };

    const response = await this.generate(prompt);
    
    try {
      const result = JSON.parse(response.content);
      if (this.cache) {
        this.cache.set(cacheKey, result, 86400000);
      }
      return result;
    } catch {
      return {
        analysis: response.content,
        language,
        syntaxValid: true,
        constructs: [],
        complexity: 'unknown',
        recommendations: [],
      };
    }
  }

  // ============================================================================
  // Parser Generation
  // ============================================================================

  async generateParser(
    samples: string[],
    languageName: string
  ): Promise<Parser> {
    const cacheKey = `parser:${languageName}:${this.hashObject(samples)}`;
    
    // Check cache for existing parser
    if (this.cache && this.cache.has(cacheKey)) {
      return this.cache.get<Parser>(cacheKey)!;
    }

    // Generate parser using LLM
    const prompt: LLMPrompt = {
      system: `You are a parser generation expert. Your task is to create a parser configuration for a custom language based on code samples.

You must return a JSON object with the following structure:
{
  "tokenSpecs": [
    {
      "type": "TOKEN_TYPE",
      "pattern": "regex pattern",
      "ignore": true/false
    }
  ],
  "parseRules": {
    "Program": ["Statement*"],
    "Statement": ["Assignment", "FunctionDeclaration", "ExpressionStatement"],
    "Assignment": ["Identifier", "=", "Expression", ";"],
    ...
  },
  "precedence": [
    ["or"],
    ["and"],
    ["equality"],
    ...
  ]
}

The parser should handle the syntax shown in the samples. Be comprehensive but keep patterns simple.

Return ONLY valid JSON.`,
      user: `Create a parser configuration for a language called "${languageName}" based on these code samples:

${samples.map((s, i) => `Sample ${i + 1}:
${s}
`).join('\n\n')}

Parser configuration:`,
    };

    const response = await this.generate(prompt);
    
    try {
      const config = JSON.parse(response.content);
      const parser = this.createParserFromConfig(config, languageName);
      
      // Cache the parser
      if (this.cache) {
        this.cache.set(cacheKey, parser, 86400000);
      }
      
      return parser;
    } catch (error) {
      console.error('Failed to parse parser config:', error);
      // Return a fallback parser
      return this.createFallbackParser(languageName);
    }
  }

  private createParserFromConfig(config: any, languageName: string): Parser {
    const tokenSpecs = config.tokenSpecs || [];
    const parseRules = config.parseRules || {};
    const precedence = config.precedence || [];

    return {
      parse: (source: string) => {
        const tokens = this.tokenizeWithSpecs(source, tokenSpecs);
        const ast = this.buildASTFromTokens(tokens, parseRules, precedence);
        
        return {
          ast,
          tokens,
          errors: [],
          warnings: [],
        };
      },
      tokenize: (source: string) => {
        return this.tokenizeWithSpecs(source, tokenSpecs);
      },
      canParse: (source: string) => {
        try {
          const tokens = this.tokenizeWithSpecs(source, tokenSpecs);
          // Check if we can build a reasonable AST
          return tokens.some(t => t.type !== 'UNKNOWN' && t.type !== 'WHITESPACE');
        } catch {
          return false;
        }
      },
    };
  }

  private tokenizeWithSpecs(source: string, specs: any[]): any[] {
    const tokens: any[] = [];
    let pos = 0;
    let line = 1;
    let column = 0;

    while (pos < source.length) {
      let matched = false;

      for (const spec of specs) {
        if (spec.ignore) continue;
        
        try {
          const regex = new RegExp(spec.pattern, 'y');
          regex.lastIndex = pos;
          const match = regex.exec(source);
          
          if (match && match.index === pos) {
            const value = match[0];
            tokens.push({
              type: spec.type,
              value,
              position: { line, column, offset: pos },
              location: {
                start: { line, column, offset: pos },
                end: {
                  line: line + (value.match(/\n/g)?.length || 0),
                  column: value.match(/\n/g) ? 
                    value.length - value.lastIndexOf('\n') - 1 : 
                    column + value.length,
                  offset: pos + value.length,
                },
                source: value,
              },
            });
            
            // Update position
            for (let i = 0; i < match[0].length; i++) {
              if (match[0][i] === '\n') {
                line++;
                column = 0;
              } else {
                column++;
              }
            }
            
            pos += match[0].length;
            matched = true;
            break;
          }
        } catch {
          // Invalid regex
        }
      }

      if (!matched) {
        // Whitespace
        if (/\\s/.test(source[pos])) {
          const match = /\s+/.exec(source.substring(pos));
          if (match) {
            const value = match[0];
            for (let i = 0; i < value.length; i++) {
              if (value[i] === '\n') {
                line++;
                column = 0;
              } else {
                column++;
              }
            }
            pos += value.length;
            continue;
          }
        }

        // Unknown token
        const char = source[pos];
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

        if (char === '\n') {
          line++;
          column = 0;
        } else {
          column++;
        }
        pos++;
      }
    }

    return tokens;
  }

  private buildASTFromTokens(
    tokens: any[],
    parseRules: Record<string, any>,
    precedence: any[]
  ): any {
    // Simple AST builder - would use a proper parser generator in real implementation
    const ast: any = {
      type: 'Program',
      children: [],
      tokens,
      position: tokens[0]?.position || { line: 0, column: 0, offset: 0 },
      location: {
        start: tokens[0]?.position || { line: 0, column: 0, offset: 0 },
        end: tokens[tokens.length - 1]?.location?.end || { line: 0, column: 0, offset: 0 },
        source: tokens.map((t: any) => t.value).join(''),
      },
    };

    // Group tokens into statements/blocks
    let current: any = ast;
    let stack: any[] = [ast];

    for (const token of tokens) {
      if (token.type === 'WHITESPACE' || token.type === 'COMMENT') continue;

      if (token.value === '{' || token.value === '(' || token.value === '[') {
        const node = {
          type: 'Block',
          value: token.value,
          tokens: [token],
          children: [],
          position: token.position,
          location: token.location,
        };
        current.children.push(node);
        stack.push(node);
        current = node;
      } else if (token.value === '}' || token.value === ')' || token.value === ']') {
        if (stack.length > 1) {
          stack.pop();
          current = stack[stack.length - 1];
        }
      } else {
        const node = {
          type: token.type === 'KEYWORD' ? token.value : 'Identifier',
          value: token.value,
          tokens: [token],
          children: [],
          position: token.position,
          location: token.location,
        };
        current.children.push(node);
      }
    }

    return ast;
  }

  private createFallbackParser(languageName: string): Parser {
    return {
      parse: (source: string) => {
        return {
          ast: {
            type: 'Program',
            children: [],
            tokens: [],
            position: { line: 0, column: 0, offset: 0 },
            location: {
              start: { line: 0, column: 0, offset: 0 },
              end: { line: 0, column: source.length, offset: source.length },
              source,
            },
          },
          tokens: [],
          errors: [{
            message: `No parser available for ${languageName}. Using fallback.`,
            position: { line: 0, column: 0, offset: 0 },
            severity: 'warning',
            code: 'FALLBACK_PARSER',
          }],
          warnings: [],
        };
      },
      tokenize: (source: string) => [],
      canParse: () => true,
    };
  }

  // ============================================================================
  // Transform Generation
  // ============================================================================

  async generateTransform(
    description: string,
    examples: any[] = []
  ): Promise<Transform> {
    const cacheKey = `transform:${this.hashObject({ description, examples })}`;
    
    if (this.cache && this.cache.has(cacheKey)) {
      return this.cache.get<Transform>(cacheKey)!;
    }

    const prompt: LLMPrompt = {
      system: `You are a code transformation expert. Your task is to create a tree visitor transform based on a description and examples.

You must return a JSON object with the following structure:
{
  "name": "transform name",
  "visitor": {
    "enter": "function code as string",
    "exit": "function code as string",
    "visitor": "function code as string"
  }
}

The transform will be applied to an AST (Abstract Syntax Tree). Use the visitor pattern to traverse and modify the tree.

Return ONLY valid JSON.`,
      user: `Create a tree visitor transform with the following description:

Description: ${description}

${examples.length > 0 ? `Examples:
${examples.map((e, i) => `Example ${i + 1}:
Input: ${JSON.stringify(e.input)}
Output: ${JSON.stringify(e.output)}
`).join('\n')}
` : ''}

Transform configuration:`,
    };

    const response = await this.generate(prompt);
    
    try {
      const config = JSON.parse(response.content);
      const transform = this.createTransformFromConfig(config);
      
      if (this.cache) {
        this.cache.set(cacheKey, transform, 86400000);
      }
      
      return transform;
    } catch (error) {
      console.error('Failed to parse transform config:', error);
      return {
        name: `dynamic-${Date.now()}`,
        visitor: (node) => node,
      };
    }
  }

  private createTransformFromConfig(config: any): Transform {
    return {
      name: config.name || `dynamic-${Date.now()}`,
      visitor: this.createVisitorFunction(config.visitor?.visitor),
      enter: config.visitor?.enter ? this.createVisitorFunction(config.visitor.enter) : undefined,
      exit: config.visitor?.exit ? this.createVisitorFunction(config.visitor.exit) : undefined,
    };
  }

  private createVisitorFunction(code: string): (node: ASTNode, context: any) => ASTNode | null {
    // In real implementation, would use Function constructor or eval
    // For now, return a simple visitor
    return (node, context) => {
      console.log(`Applying dynamic transform to ${node.type}`);
      return node;
    };
  }

  // ============================================================================
  // AST to Code Generation
  // ============================================================================

  async generateCodeFromAST(
    ast: ASTNode,
    targetLanguage: string,
    sourceLanguage?: string
  ): Promise<string> {
    const cacheKey = `generate:${this.hashObject({ ast, targetLanguage, sourceLanguage })}`;
    
    if (this.cache && this.cache.has(cacheKey)) {
      return this.cache.get<string>(cacheKey)!;
    }

    const prompt: LLMPrompt = {
      system: `You are a code generation expert. Your task is to generate source code from an Abstract Syntax Tree (AST).

You must return ONLY the generated source code without any explanation, comments, or metadata.

Guidelines:
1. Generate valid, idiomatic code in the target language
2. Preserve the structure and semantics of the AST
3. Format the code properly
4. Handle all node types correctly
5. Include necessary imports and declarations

Return ONLY the source code.`,
      user: `Generate ${targetLanguage} code from the following AST:

${sourceLanguage ? `Source language: ${sourceLanguage}\n` : ''}Target language: ${targetLanguage}
AST:
${JSON.stringify(ast, null, 2)}

Generated code:`,
    };

    const response = await this.generate(prompt);
    
    if (this.cache) {
      this.cache.set(cacheKey, response.content, 86400000);
    }
    
    return response.content;
  }

  // ============================================================================
  // Type Inference
  // ============================================================================

  async inferTypes(ast: ASTNode, language: string): Promise<Record<string, string>> {
    const prompt: LLMPrompt = {
      system: `You are a type inference expert. Your task is to infer types for all identifiers in the given AST.

Return a JSON object mapping identifier names to their inferred types:
{
  "identifier1": "type1",
  "identifier2": "type2",
  ...
}

Return ONLY valid JSON.`,
      user: `Infer types for identifiers in the following ${language} code represented as AST:

AST:
${JSON.stringify(ast, null, 2)}

Types:`,
    };

    const response = await this.generate(prompt);
    
    try {
      return JSON.parse(response.content);
    } catch {
      return {};
    }
  }

  // ============================================================================
  // Syntax Suggestion
  // ============================================================================

  async suggestSyntax(
    partialCode: string,
    language: string,
    context: string
  ): Promise<string[]> {
    const prompt: LLMPrompt = {
      system: `You are a code completion expert. Your task is to suggest possible completions for partial code.

Return a JSON array of up to 5 suggestions:
[
  "suggestion1",
  "suggestion2",
  ...
]

Return ONLY valid JSON.`,
      user: `Suggest completions for the following partial ${language} code:

Context: ${context}
Partial code: ${partialCode}

Suggestions:`,
    };

    const response = await this.generate(prompt);
    
    try {
      return JSON.parse(response.content);
    } catch {
      return [];
    }
  }

  // ============================================================================
  // Documentation Generation
  // ============================================================================

  async generateDocumentation(
    ast: ASTNode,
    language: string,
    format: 'markdown' | 'html' | 'json' = 'markdown'
  ): Promise<string> {
    const prompt: LLMPrompt = {
      system: `You are a documentation generator. Your task is to create documentation for code represented as an AST.

Return documentation in the specified format. Be comprehensive but concise.

Guidelines:
1. Document all functions, classes, and important constructs
2. Include parameter descriptions
3. Include return type information
4. Include examples where helpful
5. Format according to the requested format

Return ONLY the documentation.`,
      user: `Generate ${format} documentation for the following ${language} code:

AST:
${JSON.stringify(ast, null, 2)}

Format: ${format}
Documentation:`,
    };

    const response = await this.generate(prompt);
    return response.content;
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  getRequestCount(): number {
    return this.requestCount;
  }

  resetRequestCount(): void {
    this.requestCount = 0;
  }

  getOptions(): MistralOptions {
    return { ...this.options };
  }

  setOptions(options: Partial<MistralOptions>): void {
    this.options = { ...this.options, ...options };
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export const createMistralClient = (options?: MistralOptions) => {
  return new MistralClient(options);
};

export default MistralClient;
