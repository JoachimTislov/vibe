/**
 * Self-Hosted LLM Support for Universal Transpiler
 * 
 * Phase 3: Support for local/self-hosted LLMs
 * 
 * Supports:
 * - Ollama (https://ollama.ai)
 * - LM Studio (https://lmstudio.ai)
 * - Local OpenAI-compatible servers
 * - Custom endpoints
 */

import type { LLMClient, LLMPrompt, LLMResponse, LLMOptions } from '../core/universal-transpiler';

// ============================================================================
// Self-Hosted LLM Types
// ============================================================================

export interface SelfHostedLLMOptions extends LLMOptions {
  // Provider type
  provider?: 'ollama' | 'lmstudio' | 'openai-compatible' | 'custom';
  
  // Base URL for the server
  baseUrl?: string;
  
  // Model name
  model?: string;
  
  // Authentication
  apiKey?: string;
  
  // Ollama-specific options
  ollama?: {
    keepAlive?: boolean;
    numKeep?: number;
    seed?: number;
    numPredict?: number;
    topK?: number;
    topP?: number;
    temperature?: number;
    repeatLastN?: number;
    repeatPenalty?: number;
  };
  
  // LM Studio-specific options
  lmstudio?: {
    workspace?: string;
    useStream?: boolean;
  };
  
  // Timeout settings
  timeout?: number;
  
  // Retry settings
  maxRetries?: number;
  retryDelay?: number;
}

// ============================================================================
// Ollama Client
// ============================================================================

/**
 * Ollama API response types
 */
export interface OllamaResponse {
  model: string;
  response: string;
  done: boolean;
  context: number[];
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  eval_count?: number;
}

export interface OllamaRequest {
  model: string;
  prompt: string;
  system?: string;
  template?: string;
  context?: number[];
  options?: {
    num_predict?: number;
    temperature?: number;
    top_k?: number;
    top_p?: number;
    repeat_last_n?: number;
    repeat_penalty?: number;
    seed?: number;
    num_ctx?: number;
  };
  stream?: boolean;
}

/**
 * Client for Ollama (https://ollama.ai)
 * 
 * Ollama provides local LLM execution with models like:
 * - llama2
 * - mistral
 * - phi
 * - gemma
 * - qwen
 * - and many more
 */
export class OllamaClient implements LLMClient {
  private options: SelfHostedLLMOptions;
  private requestCount = 0;

  constructor(options: SelfHostedLLMOptions = { provider: 'ollama' }) {
    this.options = {
      provider: 'ollama',
      baseUrl: options.baseUrl || 'http://localhost:11434',
      model: options.model || 'llama2',
      timeout: options.timeout || 120000, // 2 minutes
      maxRetries: options.maxRetries || 3,
      retryDelay: options.retryDelay || 1000,
      ollama: {
        keepAlive: true,
        numPredict: 4096,
        temperature: 0.7,
        topK: 40,
        topP: 0.9,
        ...options.ollama,
      },
      ...options,
    };
  }

  private async fetchOllama(request: OllamaRequest): Promise<OllamaResponse> {
    const url = `${this.options.baseUrl}/api/generate`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: request.model,
        prompt: request.prompt,
        system: request.system,
        context: request.context,
        options: request.options,
        stream: false,
      }),
      signal: AbortSignal.timeout(this.options.timeout!),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Ollama API error: ${response.status} - ${error}`);
    }

    return response.json();
  }

  async generate(prompt: LLMPrompt, options?: LLMOptions): Promise<LLMResponse> {
    this.requestCount++;
    
    const request: OllamaRequest = {
      model: options?.model || this.options.model!,
      prompt: prompt.user,
      system: prompt.system,
      options: {
        num_predict: this.options.ollama?.numPredict,
        temperature: options?.temperature || this.options.ollama?.temperature,
        top_k: this.options.ollama?.topK,
        top_p: this.options.ollama?.topP,
        seed: this.options.ollama?.seed,
      },
      stream: false,
    };

    let lastError: Error | undefined;
    
    for (let attempt = 0; attempt < this.options.maxRetries!; attempt++) {
      try {
        const response = await this.fetchOllama(request);
        
        return {
          content: response.response,
          finishReason: response.done ? 'stop' : 'length',
          usage: {
            promptTokens: response.prompt_eval_count || 0,
            completionTokens: response.eval_count || 0,
            totalTokens: (response.prompt_eval_count || 0) + (response.eval_count || 0),
          },
        };
      } catch (error) {
        lastError = error as Error;
        if (attempt < this.options.maxRetries! - 1) {
          await new Promise(resolve => setTimeout(resolve, this.options.retryDelay!));
        }
      }
    }

    throw lastError || new Error('Ollama request failed');
  }

  async analyzeCode(code: string, language: string, task: string): Promise<any> {
    const prompt: LLMPrompt = {
      system: `You are a code analysis expert. Analyze the following ${language} code for the task: "${task}". Return your analysis as JSON.`,
      user: `Code:\n${code}\n\nAnalysis:`,
    };

    const response = await this.generate(prompt);
    
    try {
      return JSON.parse(response.content);
    } catch {
      return { analysis: response.content };
    }
  }

  async generateParser(samples: string[], languageName: string): Promise<any> {
    const prompt: LLMPrompt = {
      system: `You are a parser generation expert. Create a parser configuration for a language called "${languageName}" based on these code samples. Return JSON with tokenSpecs, parseRules, and precedence.`,
      user: `Samples:\n${samples.join('\n\n')}\n\nParser configuration:`,
    };

    const response = await this.generate(prompt);
    return JSON.parse(response.content);
  }

  async generateTransform(description: string, examples: any[]): Promise<any> {
    const prompt: LLMPrompt = {
      system: `You are a code transformation expert. Create a tree visitor transform based on this description: "${description}". Return JSON with name, visitor, enter, and exit functions.`,
      user: `Examples:\n${JSON.stringify(examples)}\n\nTransform configuration:`,
    };

    const response = await this.generate(prompt);
    return JSON.parse(response.content);
  }

  // Ollama-specific methods
  
  async listModels(): Promise<string[]> {
    try {
      const response = await fetch(`${this.options.baseUrl}/api/tags`);
      if (!response.ok) {
        throw new Error(`Failed to list models: ${response.status}`);
      }
      const data = await response.json();
      return data.models || [];
    } catch {
      return [];
    }
  }

  async checkModel(model: string): Promise<boolean> {
    const models = await this.listModels();
    return models.includes(model);
  }

  async pullModel(model: string): Promise<void> {
    // Ollama pull endpoint
    const response = await fetch(`${this.options.baseUrl}/api/pull`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: model }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to pull model: ${error}`);
    }

    await response.text(); // Stream response
  }

  getRequestCount(): number {
    return this.requestCount;
  }

  resetRequestCount(): void {
    this.requestCount = 0;
  }
}

// ============================================================================
// LM Studio Client
// ============================================================================

/**
 * Client for LM Studio (https://lmstudio.ai)
 * 
 * LM Studio provides a local GUI for running LLMs with support for:
 * - Llama
 * - Mistral
 * - Phi
 * - Gemma
 * - And many more
 */
export class LMStudioClient implements LLMClient {
  private options: SelfHostedLLMOptions;
  private requestCount = 0;

  constructor(options: SelfHostedLLMOptions = { provider: 'lmstudio' }) {
    this.options = {
      provider: 'lmstudio',
      baseUrl: options.baseUrl || 'http://localhost:1234',
      model: options.model || 'default',
      timeout: options.timeout || 120000,
      maxRetries: options.maxRetries || 3,
      retryDelay: options.retryDelay || 1000,
      lmstudio: {
        workspace: options.lmstudio?.workspace,
        useStream: options.lmstudio?.useStream !== false,
      },
      ...options,
    };
  }

  async generate(prompt: LLMPrompt, options?: LLMOptions): Promise<LLMResponse> {
    this.requestCount++;
    
    const request = {
      model: options?.model || this.options.model!,
      messages: [
        { role: 'system', content: prompt.system },
        { role: 'user', content: prompt.user },
      ],
      temperature: options?.temperature || 0.7,
      max_tokens: options?.maxTokens || 4096,
      stream: false,
    };

    let lastError: Error | undefined;
    
    for (let attempt = 0; attempt < this.options.maxRetries!; attempt++) {
      try {
        const response = await fetch(`${this.options.baseUrl}/v1/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(request),
          signal: AbortSignal.timeout(this.options.timeout!),
        });

        if (!response.ok) {
          const error = await response.text();
          throw new Error(`LM Studio API error: ${response.status} - ${error}`);
        }

        const data = await response.json();
        const choice = data.choices?.[0];
        
        return {
          content: choice?.message?.content || '',
          finishReason: choice?.finish_reason || 'error',
          usage: data.usage || {
            promptTokens: 0,
            completionTokens: 0,
            totalTokens: 0,
          },
        };
      } catch (error) {
        lastError = error as Error;
        if (attempt < this.options.maxRetries! - 1) {
          await new Promise(resolve => setTimeout(resolve, this.options.retryDelay!));
        }
      }
    }

    throw lastError || new Error('LM Studio request failed');
  }

  async analyzeCode(code: string, language: string, task: string): Promise<any> {
    const prompt: LLMPrompt = {
      system: `Analyze the following ${language} code for: ${task}. Return JSON.`,
      user: `Code:\n${code}\n\nAnalysis:`,
    };

    const response = await this.generate(prompt);
    
    try {
      return JSON.parse(response.content);
    } catch {
      return { analysis: response.content };
    }
  }

  async generateParser(samples: string[], languageName: string): Promise<any> {
    const prompt: LLMPrompt = {
      system: `Create a parser configuration for "${languageName}" from these samples. Return JSON.`,
      user: `Samples:\n${samples.join('\n\n')}\n\nParser:`,
    };

    const response = await this.generate(prompt);
    return JSON.parse(response.content);
  }

  async generateTransform(description: string, examples: any[]): Promise<any> {
    const prompt: LLMPrompt = {
      system: `Create a transform for: ${description}. Return JSON with visitor functions.`,
      user: `Examples:\n${JSON.stringify(examples)}\n\nTransform:`,
    };

    const response = await this.generate(prompt);
    return JSON.parse(response.content);
  }

  getRequestCount(): number {
    return this.requestCount;
  }

  resetRequestCount(): void {
    this.requestCount = 0;
  }
}

// ============================================================================
// OpenAI-Compatible Client
// ============================================================================

/**
 * Client for OpenAI-compatible local servers
 * 
 * Compatible with:
 * - LocalAI (https://github.com/go-skynet/LocalAI)
 * - OpenAI-compatible wrappers
 * - Any OpenAI API-compatible server
 */
export class OpenAICompatibleClient implements LLMClient {
  private options: SelfHostedLLMOptions;
  private requestCount = 0;

  constructor(options: SelfHostedLLMOptions = { provider: 'openai-compatible' }) {
    this.options = {
      provider: 'openai-compatible',
      baseUrl: options.baseUrl || 'http://localhost:8080',
      model: options.model || 'gpt-3.5-turbo',
      apiKey: options.apiKey || 'not-required',
      timeout: options.timeout || 120000,
      maxRetries: options.maxRetries || 3,
      retryDelay: options.retryDelay || 1000,
      ...options,
    };
  }

  async generate(prompt: LLMPrompt, options?: LLMOptions): Promise<LLMResponse> {
    this.requestCount++;
    
    const request = {
      model: options?.model || this.options.model!,
      messages: [
        { role: 'system', content: prompt.system },
        { role: 'user', content: prompt.user },
      ],
      temperature: options?.temperature || 0.7,
      max_tokens: options?.maxTokens || 4096,
      stream: false,
    };

    let lastError: Error | undefined;
    
    for (let attempt = 0; attempt < this.options.maxRetries!; attempt++) {
      try {
        const response = await fetch(`${this.options.baseUrl}/v1/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.options.apiKey}`,
          },
          body: JSON.stringify(request),
          signal: AbortSignal.timeout(this.options.timeout!),
        });

        if (!response.ok) {
          const error = await response.text();
          throw new Error(`API error: ${response.status} - ${error}`);
        }

        const data = await response.json();
        const choice = data.choices?.[0];
        
        return {
          content: choice?.message?.content || '',
          finishReason: choice?.finish_reason || 'error',
          usage: data.usage || {
            promptTokens: 0,
            completionTokens: 0,
            totalTokens: 0,
          },
        };
      } catch (error) {
        lastError = error as Error;
        if (attempt < this.options.maxRetries! - 1) {
          await new Promise(resolve => setTimeout(resolve, this.options.retryDelay!));
        }
      }
    }

    throw lastError || new Error('OpenAI-compatible request failed');
  }

  async analyzeCode(code: string, language: string, task: string): Promise<any> {
    const prompt: LLMPrompt = {
      system: `Analyze ${language} code for ${task}. Return JSON.`,
      user: `Code:\n${code}\n\nAnalysis:`,
    };

    const response = await this.generate(prompt);
    
    try {
      return JSON.parse(response.content);
    } catch {
      return { analysis: response.content };
    }
  }

  async generateParser(samples: string[], languageName: string): Promise<any> {
    const prompt: LLMPrompt = {
      system: `Create parser for "${languageName}" from samples. Return JSON.`,
      user: `Samples:\n${samples.join('\n\n')}\n\nParser:`,
    };

    const response = await this.generate(prompt);
    return JSON.parse(response.content);
  }

  async generateTransform(description: string, examples: any[]): Promise<any> {
    const prompt: LLMPrompt = {
      system: `Create transform: ${description}. Return JSON.`,
      user: `Examples:\n${JSON.stringify(examples)}\n\nTransform:`,
    };

    const response = await this.generate(prompt);
    return JSON.parse(response.content);
  }

  getRequestCount(): number {
    return this.requestCount;
  }

  resetRequestCount(): void {
    this.requestCount = 0;
  }
}

// ============================================================================
// Custom Endpoint Client
// ============================================================================

/**
 * Client for completely custom LLM endpoints
 */
export class CustomLLMClient implements LLMClient {
  private options: SelfHostedLLMOptions;
  private requestCount = 0;

  constructor(options: SelfHostedLLMOptions) {
    if (!options.baseUrl) {
      throw new Error('baseUrl is required for custom LLM client');
    }
    
    this.options = {
      provider: 'custom',
      baseUrl: options.baseUrl,
      model: options.model || 'default',
      timeout: options.timeout || 120000,
      maxRetries: options.maxRetries || 3,
      retryDelay: options.retryDelay || 1000,
      ...options,
    };
  }

  async generate(prompt: LLMPrompt, options?: LLMOptions): Promise<LLMResponse> {
    this.requestCount++;
    
    // Custom endpoints may have different API formats
    // This is a generic implementation that tries common formats
    
    const request = {
      model: options?.model || this.options.model!,
      prompt: prompt.user,
      system: prompt.system,
      temperature: options?.temperature || 0.7,
      max_tokens: options?.maxTokens || 4096,
    };

    let lastError: Error | undefined;
    
    for (let attempt = 0; attempt < this.options.maxRetries!; attempt++) {
      try {
        const response = await fetch(`${this.options.baseUrl}/generate`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(request),
          signal: AbortSignal.timeout(this.options.timeout!),
        });

        if (!response.ok) {
          const error = await response.text();
          throw new Error(`Custom API error: ${response.status} - ${error}`);
        }

        const data = await response.json();
        
        // Try different response formats
        let content = '';
        let finishReason = 'stop';
        
        if (typeof data === 'string') {
          content = data;
        } else if (data.response) {
          content = data.response;
        } else if (data.choices?.[0]?.text) {
          content = data.choices[0].text;
        } else if (data.choices?.[0]?.message?.content) {
          content = data.choices[0].message.content;
        } else if (data.output) {
          content = data.output;
        }

        return {
          content,
          finishReason,
          usage: {
            promptTokens: 0,
            completionTokens: 0,
            totalTokens: 0,
          },
        };
      } catch (error) {
        lastError = error as Error;
        if (attempt < this.options.maxRetries! - 1) {
          await new Promise(resolve => setTimeout(resolve, this.options.retryDelay!));
        }
      }
    }

    throw lastError || new Error('Custom LLM request failed');
  }

  async analyzeCode(code: string, language: string, task: string): Promise<any> {
    const prompt: LLMPrompt = {
      system: `Analyze ${language} code for ${task}. Return JSON.`,
      user: `Code:\n${code}\n\nAnalysis:`,
    };

    const response = await this.generate(prompt);
    
    try {
      return JSON.parse(response.content);
    } catch {
      return { analysis: response.content };
    }
  }

  async generateParser(samples: string[], languageName: string): Promise<any> {
    const prompt: LLMPrompt = {
      system: `Create parser for "${languageName}". Return JSON.`,
      user: `Samples:\n${samples.join('\n\n')}\n\nParser:`,
    };

    const response = await this.generate(prompt);
    return JSON.parse(response.content);
  }

  async generateTransform(description: string, examples: any[]): Promise<any> {
    const prompt: LLMPrompt = {
      system: `Create transform: ${description}. Return JSON.`,
      user: `Examples:\n${JSON.stringify(examples)}\n\nTransform:`,
    };

    const response = await this.generate(prompt);
    return JSON.parse(response.content);
  }

  getRequestCount(): number {
    return this.requestCount;
  }

  resetRequestCount(): void {
    this.requestCount = 0;
  }
}

// ============================================================================
// Self-Hosted LLM Factory
// ============================================================================

/**
 * Create the appropriate self-hosted LLM client based on options
 */
export function createSelfHostedLLMClient(options: SelfHostedLLMOptions): LLMClient {
  switch (options.provider) {
    case 'ollama':
      return new OllamaClient(options);
    case 'lmstudio':
      return new LMStudioClient(options);
    case 'openai-compatible':
      return new OpenAICompatibleClient(options);
    case 'custom':
      return new CustomLLMClient(options);
    default:
      // Try to auto-detect
      if (options.baseUrl?.includes('ollama') || options.baseUrl?.includes('11434')) {
        return new OllamaClient(options);
      }
      if (options.baseUrl?.includes('1234')) {
        return new LMStudioClient(options);
      }
      return new OpenAICompatibleClient(options);
  }
}

/**
 * Detect available self-hosted LLM servers
 */
export async function detectSelfHostedLLMs(): Promise<{
  provider: string;
  baseUrl: string;
  available: boolean;
  models?: string[];
}[]> {
  const results: any[] = [];
  
  // Check Ollama
  try {
    const ollama = new OllamaClient({});
    const models = await ollama.listModels();
    results.push({
      provider: 'ollama',
      baseUrl: 'http://localhost:11434',
      available: models.length > 0,
      models,
    });
  } catch {
    results.push({
      provider: 'ollama',
      baseUrl: 'http://localhost:11434',
      available: false,
    });
  }
  
  // Check LM Studio
  try {
    new LMStudioClient({});
    results.push({
      provider: 'lmstudio',
      baseUrl: 'http://localhost:1234',
      available: true, // LM Studio doesn't have a list models endpoint
    });
  } catch {
    results.push({
      provider: 'lmstudio',
      baseUrl: 'http://localhost:1234',
      available: false,
    });
  }
  
  return results;
}

// ============================================================================
// Improved LLM Prompt Engineering
// ============================================================================

/**
 * Enhanced prompt templates for better code generation
 */
export const PROMPT_TEMPLATES = {
  // Code generation
  codeGeneration: {
    system: `You are an expert software engineer with deep knowledge of multiple programming languages. Your task is to generate high-quality, idiomatic code based on the given requirements.

Guidelines:
1. Always generate valid, syntactically correct code
2. Use idiomatic patterns and conventions for the target language
3. Include proper error handling
4. Add appropriate comments and documentation
5. Handle edge cases
6. Optimize for readability and maintainability

Return ONLY the generated code without any explanation or metadata.`,
    user: (context: any) => `Generate ${context.targetLanguage} code that:
${context.requirements}

Code:`,
  },
  
  // Parser generation
  parserGeneration: {
    system: `You are a compiler engineer specializing in parser design. Your task is to create a comprehensive parser configuration for a custom programming language based on code samples.

Return a JSON object with the following structure:
{
  "name": "language name",
  "tokenSpecs": [
    {
      "type": "TOKEN_TYPE",
      "pattern": "regex pattern",
      "ignore": true/false,
      "priority": number
    }
  ],
  "parseRules": {
    "Program": ["Statement*"],
    "Statement": ["Assignment", "FunctionDeclaration", "ExpressionStatement"],
    ...
  },
  "blockStart": ["{", "(", "["],
  "blockEnd": ["}", ")", "]"],
  "keywords": ["list of keywords"],
  "operators": ["list of operators"]
}

Be comprehensive but keep patterns simple and efficient.`,
    user: (context: any) => `Create a parser for a language called "${context.languageName}" based on these code samples:

${context.samples.map((s: string, i: number) => `Sample ${i + 1}:
${s}
`).join('\n')}

Parser configuration:`,
  },
  
  // Transform generation
  transformGeneration: {
    system: `You are a code transformation expert. Your task is to create AST transformation rules based on a description and examples.

Return a JSON object with:
{
  "name": "transform name",
  "description": "transform description",
  "visitor": {
    "enter": "function(node, context) { ... }",
    "exit": "function(node, context) { ... }",
    "visitor": "function(node, context) { return node; }"
  },
  "patterns": [
    {
      "match": "AST pattern to match",
      "replace": "replacement pattern"
    }
  ]
}

The transform should be applied to an AST and can modify nodes, add nodes, or remove nodes.`,
    user: (context: any) => `Create a transform with the following description:

Description: ${context.description}

${context.examples ? `Examples:
${context.examples.map((e: any, i: number) => `Example ${i + 1}:
Input: ${JSON.stringify(e.input)}
Output: ${JSON.stringify(e.output)}
`).join('\n')}
` : ''}

Transform configuration:`,
  },
  
  // Code analysis
  codeAnalysis: {
    system: `You are a senior code analyst with expertise in multiple programming languages. Your task is to analyze code and provide deep insights.

Return a JSON object with:
{
  "language": "detected or confirmed language",
  "syntaxValid": true/false,
  "constructs": ["list of identified constructs"],
  "complexity": "low|medium|high",
  "quality": "low|medium|high",
  "patterns": ["list of patterns found"],
  "issues": ["list of potential issues"],
  "recommendations": ["list of recommendations"]
}

Be thorough and accurate in your analysis.`,
    user: (context: any) => `Analyze the following code for: ${context.task}

Language: ${context.language}
Code:
${context.code}

Analysis:`,
  },
  
  // AST to code
  astToCode: {
    system: `You are a code generator specializing in converting Abstract Syntax Trees (AST) to source code. Your task is to generate clean, idiomatic code from an AST representation.

Guidelines:
1. Reconstruct the original code structure accurately
2. Use proper formatting and indentation
3. Handle all node types correctly
4. Generate valid, compilable code
5. Preserve comments if present

Return ONLY the generated source code without any explanation or comments.`,
    user: (context: any) => `Generate ${context.targetLanguage} code from the following AST:

Source language: ${context.sourceLanguage || 'unknown'}
Target language: ${context.targetLanguage}
AST:
${JSON.stringify(context.ast, null, 2)}

Generated code:`,
  },
  
  // Domain detection
  domainDetection: {
    system: `You are a domain expert with knowledge of various technical domains. Your task is to determine which domain(s) a piece of code belongs to.

Return a JSON array of domain matches:
[
  {
    "domain": "domain name",
    "confidence": 0-1,
    "evidence": ["reasons for this domain"]
  }
]

Consider domains like: web, data, ai, system, finance, game, mobile, embedded, etc.`,
    user: (context: any) => `Determine the domain(s) for the following code:

Code:
${context.code}

Domains:`,
  },
  
  // 5GL compilation
  fifthGLCompilation: {
    system: `You are a 5GL (Fifth-Generation Language) compiler expert. Your task is to compile high-level declarative abstractions to target languages.

Guidelines:
1. Understand the semantics of the abstraction
2. Generate idiomatic code in the target language
3. Handle all parameters and constraints
4. Preserve the intent and behavior
5. Include necessary imports and declarations

Return ONLY the generated code without explanation.`,
    user: (context: any) => `Compile the following 5GL abstraction to ${context.targetLanguage}:

Domain: ${context.domain}
Abstraction:
${JSON.stringify(context.abstraction, null, 2)}

Generated code:`,
  },
};

/**
 * Enhanced LLM client with improved prompt engineering
 */
export class EnhancedLLMClient implements LLMClient {
  private client: LLMClient;

  constructor(client: LLMClient, _options: SelfHostedLLMOptions = {}) {
    this.client = client;
  }

  async generate(prompt: LLMPrompt, options?: LLMOptions): Promise<LLMResponse> {
    // Enhance the prompt based on the user request
    const enhancedPrompt = this.enhancePrompt(prompt);
    return this.client.generate(enhancedPrompt, options);
  }

  private enhancePrompt(prompt: LLMPrompt): LLMPrompt {
    // Analyze the user request and apply appropriate template
    const userLower = prompt.user.toLowerCase();
    
    // Check for code generation patterns
    if (userLower.includes('generate') && userLower.includes('code')) {
      return {
        system: PROMPT_TEMPLATES.codeGeneration.system,
        user: PROMPT_TEMPLATES.codeGeneration.user({
          targetLanguage: this.extractLanguage(prompt.user),
          requirements: prompt.user,
        }),
      };
    }
    
    // Check for parser generation
    if (userLower.includes('parser') || userLower.includes('parse')) {
      return {
        system: PROMPT_TEMPLATES.parserGeneration.system,
        user: PROMPT_TEMPLATES.parserGeneration.user({
          languageName: this.extractLanguage(prompt.user),
          samples: this.extractSamples(prompt.user),
        }),
      };
    }
    
    // Check for transform generation
    if (userLower.includes('transform') || userLower.includes('visitor')) {
      return {
        system: PROMPT_TEMPLATES.transformGeneration.system,
        user: PROMPT_TEMPLATES.transformGeneration.user({
          description: prompt.user,
          examples: [],
        }),
      };
    }
    
    // Check for code analysis
    if (userLower.includes('analyze') || userLower.includes('analysis')) {
      return {
        system: PROMPT_TEMPLATES.codeAnalysis.system,
        user: PROMPT_TEMPLATES.codeAnalysis.user({
          task: 'analyze',
          language: this.extractLanguage(prompt.user),
          code: this.extractCode(prompt.user),
        }),
      };
    }
    
    // Check for AST to code
    if (userLower.includes('ast') && userLower.includes('code')) {
      return {
        system: PROMPT_TEMPLATES.astToCode.system,
        user: PROMPT_TEMPLATES.astToCode.user({
          sourceLanguage: this.extractLanguage(prompt.user),
          targetLanguage: this.extractLanguage(prompt.user, true),
          ast: this.extractJSON(prompt.user),
        }),
      };
    }
    
    // Default: use original prompt
    return prompt;
  }

  private extractLanguage(text: string, second?: boolean): string {
    const matches = text.match(/\b(javascript|typescript|python|java|csharp|c#|go|rust|ruby|php|swift|kotlin|html|css)\b/gi);
    if (matches) {
      if (second && matches.length > 1) {
        return matches[1].toLowerCase();
      }
      return matches[0].toLowerCase();
    }
    return 'javascript';
  }

  private extractSamples(text: string): string[] {
    // Try to extract code samples from the text
    const samples: string[] = [];
    const lines = text.split('\n');
    let inSample = false;
    let currentSample = '';
    
    for (const line of lines) {
      if (line.includes('Sample') || line.includes('Example')) {
        inSample = true;
        continue;
      }
      
      if (inSample) {
        if (line.trim() === '') {
          if (currentSample) {
            samples.push(currentSample);
            currentSample = '';
          }
          inSample = false;
        } else {
          currentSample += line + '\n';
        }
      }
    }
    
    if (currentSample) {
      samples.push(currentSample);
    }
    
    return samples.length > 0 ? samples : [text];
  }

  private extractCode(text: string): string {
    // Simple code extraction - look for code blocks
    const codeBlockMatch = text.match(/```[\s\S]*?```/);
    if (codeBlockMatch) {
      return codeBlockMatch[0].replace(/```[\s\S]*?```/g, '');
    }
    
    // Try to find the longest code-like substring
    const codeMatch = text.match(/[\w\s={}\[\]();:.,"'\n-]+/);
    return codeMatch ? codeMatch[0] : text;
  }

  private extractJSON(text: string): any {
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch {
      // Ignore parse errors
    }
    return null;
  }

  async analyzeCode(code: string, language: string, task: string): Promise<any> {
    return this.client.analyzeCode(code, language, task);
  }

  async generateParser(samples: string[], languageName: string): Promise<any> {
    return this.client.generateParser(samples, languageName);
  }

  async generateTransform(description: string, examples: any[]): Promise<any> {
    return this.client.generateTransform(description, examples);
  }
}

export default createSelfHostedLLMClient;
