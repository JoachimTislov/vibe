/**
 * IDE Integration for Universal Transpiler
 * 
 * Phase 3: Integration with popular IDEs and editors
 * 
 * Provides:
 * - Language Server Protocol (LSP) support
 * - VS Code extension APIs
 * - WebStorm/JetBrains integration
 * - Editor tooling (syntax highlighting, completion, diagnostics)
 */

import type { 
  ASTNode,
  Parser,
  TranspileOptions,
  TranspileResult,
  LLMClient,
  CacheManager,
} from '../core/universal-transpiler';

// ============================================================================
// Language Server Protocol (LSP) Types
// ============================================================================

/**
 * LSP message types
 */
export type LSPMessageType = 
  | 'initialize'
  | 'initialized'
  | 'shutdown'
  | 'exit'
  | 'textDocument/didOpen'
  | 'textDocument/didChange'
  | 'textDocument/didClose'
  | 'textDocument/completion'
  | 'textDocument/hover'
  | 'textDocument/definition'
  | 'textDocument/references'
  | 'textDocument/documentSymbol'
  | 'textDocument/formatting'
  | 'textDocument/rangeFormatting'
  | 'textDocument/onTypeFormatting'
  | 'textDocument/semanticTokens'
  | 'textDocument/diagnostic'
  | 'workspace/symbol'
  | 'workspace/executeCommand';

/**
 * LSP request/response types
 */
export interface LSPRequest {
  jsonrpc: string;
  id: number | string;
  method: LSPMessageType;
  params?: any;
}

export interface LSPResponse {
  jsonrpc: string;
  id: number | string;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

export interface LSPNotification {
  jsonrpc: string;
  method: LSPMessageType;
  params?: any;
}

// ============================================================================
// LSP Server
// ============================================================================

/**
 * Text document position
 */
export interface Position {
  line: number;
  character: number;
}

/**
 * Text document range
 */
export interface Range {
  start: Position;
  end: Position;
}

/**
 * Text document identifier
 */
export interface TextDocumentIdentifier {
  uri: string;
}

/**
 * Text document item
 */
export interface TextDocumentItem {
  uri: string;
  languageId: string;
  version: number;
  text: string;
}

/**
 * Versioned text document identifier
 */
export interface VersionedTextDocumentIdentifier extends TextDocumentIdentifier {
  version: number;
}

/**
 * Text document content change event
 */
export interface TextDocumentContentChangeEvent {
  range: Range;
  rangeLength: number;
  text: string;
}

export interface DidChangeTextDocumentParams {
  textDocument: VersionedTextDocumentIdentifier;
  contentChanges: TextDocumentContentChangeEvent[];
}

/**
 * Completion item
 */
export interface CompletionItem {
  label: string;
  kind?: CompletionItemKind;
  detail?: string;
  documentation?: string | MarkupContent;
  sortText?: string;
  filterText?: string;
  insertText?: string;
  insertTextFormat?: InsertTextFormat;
  textEdit?: TextEdit;
  additionalTextEdits?: TextEdit[];
  commitCharacters?: string[];
  command?: Command;
  data?: any;
}

export type CompletionItemKind = 
  | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20 | 21 | 22 | 23 | 24 | 25;

export type InsertTextFormat = 1 | 2;

export interface TextEdit {
  range: Range;
  newText: string;
}

export interface MarkupContent {
  kind: 'plaintext' | 'markdown';
  value: string;
}

export interface Command {
  title: string;
  command: string;
  arguments?: any[];
}

/**
 * Hover information
 */
export interface Hover {
  contents: string | MarkupContent | MarkupContent[];
  range?: Range;
}

/**
 * Location
 */
export interface Location {
  uri: string;
  range: Range;
}

/**
 * Definition result
 */
export type Definition = Location | Location[] | null;

/**
 * Reference context
 */
export interface ReferenceContext {
  includeDeclaration: boolean;
}

export interface ReferenceParams {
  textDocument: TextDocumentIdentifier;
  position: Position;
  context: ReferenceContext;
}

/**
 * Document symbol
 */
export interface DocumentSymbol {
  name: string;
  detail?: string;
  kind: SymbolKind;
  deprecated?: boolean;
  range: Range;
  selectionRange: Range;
  children?: DocumentSymbol[];
}

export type SymbolKind = 
  | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20 | 21 | 22 | 23 | 24 | 25 | 26;

/**
 * Formatting options
 */
export interface FormattingOptions {
  tabSize: number;
  insertSpaces: boolean;
  trimTrailingWhitespace: boolean;
  insertFinalNewline: boolean;
  trimFinalNewlines: boolean;
  [key: string]: any;
}

/**
 * Diagnostic
 */
export interface Diagnostic {
  range: Range;
  message: string;
  severity: DiagnosticSeverity;
  source?: string;
  code?: string | number;
  codeDescription?: {
    href: string;
  };
  relatedInformation?: DiagnosticRelatedInformation[];
  tags?: DiagnosticTag[];
}

export type DiagnosticSeverity = 1 | 2 | 3 | 4;

export interface DiagnosticRelatedInformation {
  location: Location;
  message: string;
}

export type DiagnosticTag = 1 | 2;

/**
 * Semantic token types
 */
export type SemanticTokenType = 
  | 'namespace'
  | 'type'
  | 'class'
  | 'enum'
  | 'interface'
  | 'struct'
  | 'typeParameter'
  | 'parameter'
  | 'variable'
  | 'property'
  | 'enumMember'
  | 'event'
  | 'function'
  | 'method'
  | 'macro'
  | 'keyword'
  | 'modifier'
  | 'comment'
  | 'string'
  | 'number'
  | 'regexp'
  | 'operator'
  | 'decorator'
  | 'builtin';

/**
 * Semantic token modifiers
 */
export type SemanticTokenModifier = 
  | 'declaration'
  | 'definition'
  | 'readonly'
  | 'static'
  | 'deprecated'
  | 'abstract'
  | 'virtual'
  | 'override'
  | 'async';

// ============================================================================
// Universal Transpiler LSP Server
// ============================================================================

/**
 * LSP server for Universal Transpiler
 * 
 * Provides language features for any language supported by the transpiler
 */
export class UniversalTranspilerLSPServer {
  private transpiler: any;
  private llm: LLMClient | null = null;
  private cache: CacheManager | null = null;
  private documents: Map<string, TextDocumentItem> = new Map();
  private nextRequestId = 1;
  private pendingRequests: Map<number, (result: any) => void> = new Map();
  private socket: WebSocket | null = null;
  private running = false;

  constructor(transpiler: any, llm?: LLMClient, cache?: CacheManager) {
    this.transpiler = transpiler;
    this.llm = llm || null;
    this.cache = cache || null;
  }

  /**
   * Start the LSP server
   */
  async start(port: number = 3000): Promise<void> {
    if (this.running) return;
    
    // Try to use WebSocket server
    try {
      const WebSocketServer = (await import('ws')).WebSocketServer;
      const wss = new WebSocketServer({ port });
      
      wss.on('connection', (ws: WebSocket) => {
        this.socket = ws;
        this.setupSocket(ws);
      });
      
      this.running = true;
      console.log(`LSP server started on ws://localhost:${port}`);
    } catch (error) {
      console.error('Failed to start WebSocket server:', error);
      // Try to use stdio
      this.startStdio();
    }
  }

  /**
   * Start LSP server on stdio
   */
  private startStdio(): void {
    if (this.running) return;
    
    this.running = true;
    
    // Read from stdin
    process.stdin.on('data', (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString()) as LSPRequest | LSPNotification;
        this.handleMessage(message);
      } catch (error) {
        console.error('Error parsing LSP message:', error);
      }
    });
    
    console.log('LSP server started on stdio');
  }

  /**
   * Stop the LSP server
   */
  stop(): void {
    if (!this.running) return;
    
    this.running = false;
    
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    
    this.documents.clear();
    this.pendingRequests.clear();
    
    console.log('LSP server stopped');
  }

  /**
   * Setup WebSocket connection
   */
  private setupSocket(ws: WebSocket): void {
    ws.on('message', (data: any) => {
      try {
        const message = JSON.parse(data.toString()) as LSPRequest | LSPNotification;
        this.handleMessage(message);
      } catch (error) {
        console.error('Error parsing LSP message:', error);
      }
    });
    
    ws.on('close', () => {
      if (this.socket === ws) {
        this.socket = null;
      }
    });
    
    ws.on('error', (error: Error) => {
      console.error('WebSocket error:', error.message);
    });
  }

  /**
   * Handle incoming LSP message
   */
  private handleMessage(message: LSPRequest | LSPNotification): void {
    if ('id' in message) {
      // It's a request
      const request = message as LSPRequest;
      this.handleRequest(request);
    } else {
      // It's a notification
      const notification = message as LSPNotification;
      this.handleNotification(notification);
    }
  }

  /**
   * Handle LSP request
   */
  private handleRequest(request: LSPRequest): void {
    const method = request.method;
    const params = request.params;
    const id = request.id;
    
    // Process request
    this.processRequest(method, params)
      .then((result: any) => {
        const response: LSPResponse = {
          jsonrpc: '2.0',
          id,
          result,
        };
        this.sendResponse(response);
      })
      .catch((error: any) => {
        const response: LSPResponse = {
          jsonrpc: '2.0',
          id,
          error: {
            code: error.code || -32603,
            message: error.message || 'Internal error',
            data: error.data,
          },
        };
        this.sendResponse(response);
      });
  }

  /**
   * Handle LSP notification
   */
  private handleNotification(notification: LSPNotification): void {
    const method = notification.method;
    const params = notification.params;
    
    this.processNotification(method, params);
  }

  /**
   * Process LSP request
   */
  private async processRequest(method: LSPMessageType, params: any): Promise<any> {
    switch (method) {
      case 'initialize':
        return this.handleInitialize(params);
      
      case 'shutdown':
        return this.handleShutdown();
      
      case 'textDocument/didOpen':
        return this.handleDidOpen(params);
      
      case 'textDocument/didChange':
        return this.handleDidChange(params);
      
      case 'textDocument/didClose':
        return this.handleDidClose(params);
      
      case 'textDocument/completion':
        return this.handleCompletion(params);
      
      case 'textDocument/hover':
        return this.handleHover(params);
      
      case 'textDocument/definition':
        return this.handleDefinition(params);
      
      case 'textDocument/references':
        return this.handleReferences(params);
      
      case 'textDocument/documentSymbol':
        return this.handleDocumentSymbol(params);
      
      case 'textDocument/formatting':
        return this.handleFormatting(params);
      
      case 'textDocument/semanticTokens':
        return this.handleSemanticTokens(params);
      
      case 'workspace/symbol':
        return this.handleWorkspaceSymbol(params);
      
      case 'workspace/executeCommand':
        return this.handleExecuteCommand(params);
      
      default:
        throw new Error(`Unknown method: ${method}`);
    }
  }

  /**
   * Process LSP notification
   */
  private processNotification(method: LSPMessageType, params: any): void {
    switch (method) {
      case 'initialized':
        this.handleInitialized();
        break;
      case 'exit':
        this.handleExit();
        break;
      default:
        console.warn(`Unknown notification: ${method}`);
    }
  }

  /**
   * Send LSP response
   */
  private sendResponse(response: LSPResponse): void {
    const message = JSON.stringify(response);
    
    if (this.socket) {
      this.socket.send(message);
    } else {
      // Stdio
      process.stdout.write(message + '\n\n');
      process.stdout.write('Content-Length: ' + Buffer.byteLength(message) + '\r\n\r\n');
    }
  }

  // ============================================================================
  // LSP Request Handlers
  // ============================================================================

  /**
   * Handle initialize request
   */
  private async handleInitialize(params: any): Promise<any> {
    return {
      capabilities: {
        textDocumentSync: {
          openClose: true,
          change: 1, // Incremental
          willSave: false,
          willSaveWaitUntil: false,
          save: false,
        },
        completionProvider: {
          resolveProvider: false,
          triggerCharacters: ['.', '(', '[', '{', ' ', '\t', '\n'],
        },
        hoverProvider: true,
        definitionProvider: true,
        referencesProvider: true,
        documentSymbolProvider: true,
        workspaceSymbolProvider: true,
        formattingProvider: true,
        semanticTokensProvider: {
          documentSelector: null,
          range: false,
          full: {
            delta: false,
          },
        },
      },
      serverInfo: {
        name: 'universal-transpiler-lsp',
        version: '1.0.0',
      },
    };
  }

  /**
   * Handle initialized notification
   */
  private handleInitialized(): void {
    // Server is ready
    console.log('LSP initialized');
  }

  /**
   * Handle shutdown request
   */
  private async handleShutdown(): Promise<any> {
    // Clean up
    return null;
  }

  /**
   * Handle exit notification
   */
  private handleExit(): void {
    this.stop();
    process.exit(0);
  }

  /**
   * Handle textDocument/didOpen notification
   */
  private async handleDidOpen(params: any): Promise<void> {
    const textDocument = params.textDocument as TextDocumentItem;
    this.documents.set(textDocument.uri, textDocument);
    
    // Analyze document
    await this.analyzeDocument(textDocument);
  }

  /**
   * Handle textDocument/didChange notification
   */
  private async handleDidChange(params: DidChangeTextDocumentParams): Promise<void> {
    const uri = params.textDocument.uri;
    const document = this.documents.get(uri);
    
    if (document) {
      // Apply changes
      let text = document.text;
      
      for (const change of params.contentChanges) {
        const start = this.offsetAtPosition(text, change.range.start);
        const end = this.offsetAtPosition(text, change.range.end);
        text = text.substring(0, start) + change.text + text.substring(end);
      }
      
      // Update document
      document.text = text;
      document.version = params.textDocument.version;
      this.documents.set(uri, document);
      
      // Re-analyze
      await this.analyzeDocument(document);
    }
  }

  /**
   * Handle textDocument/didClose notification
   */
  private async handleDidClose(params: any): Promise<void> {
    const uri = params.textDocument.uri;
    this.documents.delete(uri);
  }

  // ============================================================================
  // Language Features
  // ============================================================================

  /**
   * Handle completion request
   */
  private async handleCompletion(params: any): Promise<CompletionItem[]> {
    const uri = params.textDocument.uri;
    const position = params.position;
    const document = this.documents.get(uri);
    
    if (!document) {
      return [];
    }
    
    const text = document.text;
    const offset = this.offsetAtPosition(text, position);
    const line = this.getLine(text, position.line);
    
    // Get completions based on context
    const context = this.getCompletionContext(text, offset, position);
    
    // Try to get completions from transpiler
    if (this.llm) {
      try {
        const completions = await this.llm.suggestSyntax(
          context.prefix,
          context.language || 'javascript',
          context.context
        );
        
        return completions.map((completion, index) => ({
          label: completion,
          kind: 1, // Text
          sortText: index.toString().padStart(4, '0'),
          insertText: completion,
        }));
      } catch {
        // Fallback to basic completions
      }
    }
    
    // Basic completions based on language
    const language = this.detectLanguage(document);
    return this.getBasicCompletions(language, context);
  }

  /**
   * Get completion context
   */
  private getCompletionContext(text: string, offset: number, position: Position): {
    prefix: string;
    suffix: string;
    line: string;
    language: string;
    context: string;
  } {
    const line = this.getLine(text, position.line);
    const prefix = line.substring(0, position.character);
    const suffix = line.substring(position.character);
    
    // Get language from document
    const document = Array.from(this.documents.values()).find(d => d.text === text);
    const language = document?.languageId || this.detectLanguageFromText(text);
    
    // Determine context
    let context = 'code';
    if (prefix.includes('import') || prefix.includes('from')) {
      context = 'import';
    } else if (prefix.includes('function') || prefix.includes('def')) {
      context = 'function';
    } else if (prefix.includes('class')) {
      context = 'class';
    }
    
    return { prefix, suffix, line, language, context };
  }

  /**
   * Get basic completions for a language
   */
  private getBasicCompletions(language: string, context: any): CompletionItem[] {
    const keywords = this.getLanguageKeywords(language);
    const completions: CompletionItem[] = [];
    
    // Add keywords
    for (const keyword of keywords) {
      completions.push({
        label: keyword,
        kind: 14, // Keyword
        sortText: '0' + keyword,
        insertText: keyword,
      });
    }
    
    // Add common snippets
    const snippets = this.getLanguageSnippets(language, context.context);
    for (const snippet of snippets) {
      completions.push({
        label: snippet.label,
        kind: 8, // Snippet
        documentation: snippet.description,
        insertText: snippet.body,
        insertTextFormat: 2, // Snippet
      });
    }
    
    return completions;
  }

  /**
   * Get keywords for a language
   */
  private getLanguageKeywords(language: string): string[] {
    const languageDef = this.transpiler.getLanguage(language);
    return languageDef?.keywords || [];
  }

  /**
   * Get snippets for a language and context
   */
  private getLanguageSnippets(language: string, context: string): Array<{
    label: string;
    description: string;
    body: string;
  }> {
    const snippets: any[] = [];
    
    // Common snippets
    switch (context) {
      case 'import':
        snippets.push({
          label: 'import from module',
          description: 'Import a module',
          body: 'import { $1 } from \'$2\';',
        });
        break;
      case 'function':
        snippets.push({
          label: 'function declaration',
          description: 'Function declaration',
          body: 'function $1($2) {\n  $3\n}',
        });
        break;
      case 'class':
        snippets.push({
          label: 'class declaration',
          description: 'Class declaration',
          body: 'class $1 {\n  constructor($2) {\n    $3\n  }\n}',
        });
        break;
    }
    
    return snippets;
  }

  /**
   * Handle hover request
   */
  private async handleHover(params: any): Promise<Hover | null> {
    const uri = params.textDocument.uri;
    const position = params.position;
    const document = this.documents.get(uri);
    
    if (!document) {
      return null;
    }
    
    const text = document.text;
    const offset = this.offsetAtPosition(text, position);
    const word = this.getWordAtPosition(text, offset);
    
    // Try to get hover information
    const language = this.detectLanguage(document);
    const languageDef = this.transpiler.getLanguage(language);
    
    if (languageDef?.builtins?.[word]) {
      return {
        contents: languageDef.builtins[word],
        range: this.rangeAtOffsets(text, offset - word.length, offset),
      };
    }
    
    // Try to use LLM for hover
    if (this.llm) {
      try {
        const code = document.text;
        const analysis = await this.llm.analyzeCode(
          code,
          language,
          `hover information for symbol at position ${position.line}:${position.character}`
        );
        
        if (analysis.hover) {
          return {
            contents: analysis.hover,
            range: this.rangeAtOffsets(text, offset - word.length, offset),
          };
        }
      } catch {
        // Ignore errors
      }
    }
    
    return null;
  }

  /**
   * Handle definition request
   */
  private async handleDefinition(params: any): Promise<Definition> {
    const uri = params.textDocument.uri;
    const position = params.position;
    const document = this.documents.get(uri);
    
    if (!document) {
      return null;
    }
    
    const text = document.text;
    const offset = this.offsetAtPosition(text, position);
    const word = this.getWordAtPosition(text, offset);
    
    // Try to find definition
    // This would parse the document and find the symbol definition
    
    return null;
  }

  /**
   * Handle references request
   */
  private async handleReferences(params: any): Promise<Location[]> {
    const uri = params.textDocument.uri;
    const position = params.position;
    const document = this.documents.get(uri);
    
    if (!document) {
      return [];
    }
    
    // Find all references to the symbol at position
    // This would parse the document and find all uses
    
    return [];
  }

  /**
   * Handle document symbol request
   */
  private async handleDocumentSymbol(params: any): Promise<DocumentSymbol[]> {
    const uri = params.textDocument.uri;
    const document = this.documents.get(uri);
    
    if (!document) {
      return [];
    }
    
    // Parse document and extract symbols
    try {
      const result = await this.transpiler.transpile(document.text, {
        sourceType: document.languageId,
        target: document.languageId,
      });
      
      return this.extractSymbolsFromAST(result.ast, document.text);
    } catch {
      return [];
    }
  }

  /**
   * Extract symbols from AST
   */
  private extractSymbolsFromAST(ast: ASTNode, text: string): DocumentSymbol[] {
    const symbols: DocumentSymbol[] = [];
    
    const visit = (node: ASTNode, parent?: DocumentSymbol) => {
      // Identify symbol types
      let symbolKind: SymbolKind | undefined;
      
      switch (node.type) {
        case 'FunctionDeclaration':
        case 'MethodDeclaration':
          symbolKind = 6; // Function
          break;
        case 'ClassDeclaration':
        case 'InterfaceDeclaration':
        case 'StructDeclaration':
          symbolKind = 5; // Class
          break;
        case 'VariableDeclaration':
        case 'VariableDeclarator':
          symbolKind = 13; // Variable
          break;
        case 'Identifier':
          if (parent && parent.kind === 5) {
            symbolKind = 13; // Field
          }
          break;
      }
      
      if (symbolKind !== undefined && node.location) {
        const symbol: DocumentSymbol = {
          name: node.value?.toString() || node.type,
          kind: symbolKind,
          range: this.lspRangeFromASTRange(node.location),
          selectionRange: this.lspRangeFromASTRange(node.location),
          children: [],
        };
        
        if (parent) {
          parent.children.push(symbol);
        } else {
          symbols.push(symbol);
        }
        
        // Visit children
        if (node.children) {
          for (const child of node.children) {
            visit(child, symbol);
          }
        }
      } else if (parent) {
        // Visit children without creating symbol
        if (node.children) {
          for (const child of node.children) {
            visit(child, parent);
          }
        }
      }
    };
    
    visit(ast);
    
    return symbols;
  }

  /**
   * Handle formatting request
   */
  private async handleFormatting(params: any): Promise<TextEdit[]> {
    const uri = params.textDocument.uri;
    const options = params.options as FormattingOptions;
    const document = this.documents.get(uri);
    
    if (!document) {
      return [];
    }
    
    // Try to format using transpiler
    try {
      const result = await this.transpiler.transpile(document.text, {
        sourceType: document.languageId,
        target: document.languageId,
      });
      
      if (result.code !== document.text) {
        return [{
          range: this.fullDocumentRange(document.text),
          newText: result.code,
        }];
      }
    } catch {
      // Ignore formatting errors
    }
    
    return [];
  }

  /**
   * Handle semantic tokens request
   */
  private async handleSemanticTokens(params: any): Promise<any> {
    const uri = params.textDocument.uri;
    const document = this.documents.get(uri);
    
    if (!document) {
      return { data: [] };
    }
    
    // Parse and tokenize
    try {
      const result = await this.transpiler.transpile(document.text, {
        sourceType: document.languageId,
        target: document.languageId,
      });
      
      const tokens = result.tokens || [];
      const semanticTokens: number[] = [];
      
      for (const token of tokens) {
        const tokenType = this.getSemanticTokenType(token.type, document.languageId);
        const modifiers = this.getSemanticTokenModifiers(token.type, document.languageId);
        
        semanticTokens.push(
          this.offsetAtPosition(document.text, token.position),
          tokenType,
          modifiers
        );
      }
      
      return { data: semanticTokens };
    } catch {
      return { data: [] };
    }
  }

  /**
   * Get semantic token type
   */
  private getSemanticTokenType(tokenType: string, language: string): number {
    const tokenTypes: Record<string, number> = {
      'keyword': 1,
      'operator': 2,
      'string': 3,
      'number': 4,
      'comment': 5,
      'function': 6,
      'variable': 7,
      'type': 8,
      'class': 9,
      'identifier': 10,
    };
    
    return tokenTypes[tokenType.toLowerCase()] || 0;
  }

  /**
   * Get semantic token modifiers
   */
  private getSemanticTokenModifiers(tokenType: string, language: string): number {
    return 0; // No modifiers for now
  }

  /**
   * Handle workspace symbol request
   */
  private async handleWorkspaceSymbol(params: any): Promise<DocumentSymbol[]> {
    const symbols: DocumentSymbol[] = [];
    
    for (const document of this.documents.values()) {
      const docSymbols = await this.handleDocumentSymbol({ textDocument: document });
      symbols.push(...docSymbols);
    }
    
    return symbols;
  }

  /**
   * Handle execute command request
   */
  private async handleExecuteCommand(params: any): Promise<any> {
    const command = params.command;
    const arguments_ = params.arguments || [];
    
    // Handle known commands
    switch (command) {
      case 'universal-transpiler.transpile':
        return this.handleTranspileCommand(arguments_);
      
      case 'universal-transpiler.detectLanguage':
        return this.handleDetectLanguageCommand(arguments_);
      
      default:
        throw new Error(`Unknown command: ${command}`);
    }
  }

  /**
   * Handle transpile command
   */
  private async handleTranspileCommand(args: any[]): Promise<TranspileResult | null> {
    const [source, options] = args;
    
    if (!source) {
      throw new Error('Source code is required');
    }
    
    return this.transpiler.transpile(source, options || {});
  }

  /**
   * Handle detect language command
   */
  private async handleDetectLanguageCommand(args: any[]): Promise<string[] | null> {
    const [source] = args;
    
    if (!source) {
      throw new Error('Source code is required');
    }
    
    return this.transpiler.detectLanguage(source);
  }

  // ============================================================================
  // Document Analysis
  // ============================================================================

  /**
   * Analyze document and provide diagnostics
   */
  private async analyzeDocument(document: TextDocumentItem): Promise<void> {
    // Parse document
    try {
      const result = await this.transpiler.transpile(document.text, {
        sourceType: document.languageId,
        target: document.languageId,
      });
      
      // Store AST for later use
      // Could emit diagnostics, etc.
    } catch (error: any) {
      // Could emit error diagnostics
    }
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  /**
   * Detect language from document
   */
  private detectLanguage(document: TextDocumentItem): string {
    if (document.languageId) {
      return document.languageId;
    }
    
    return this.detectLanguageFromText(document.text);
  }

  /**
   * Detect language from text
   */
  private detectLanguageFromText(text: string): string {
    // Use transpiler's language detection
    return this.transpiler.detectLanguage(text).then((langs) => langs[0] || 'javascript');
  }

  /**
   * Get line from text
   */
  private getLine(text: string, line: number): string {
    return text.split('\n')[line];
  }

  /**
   * Get offset at position
   */
  private offsetAtPosition(text: string, position: Position): number {
    const lines = text.split('\n');
    let offset = 0;
    
    for (let i = 0; i < Math.min(position.line, lines.length); i++) {
      offset += lines[i].length + 1; // +1 for newline
    }
    
    offset += position.character;
    
    return Math.min(offset, text.length);
  }

  /**
   * Get word at position
   */
  private getWordAtPosition(text: string, offset: number): string {
    const start = text.lastIndexOf(/\w/, offset);
    const end = text.indexOf(/\W/, offset);
    
    return text.substring(start, end === -1 ? text.length : end);
  }

  /**
   * Get range at offsets
   */
  private rangeAtOffsets(text: string, startOffset: number, endOffset: number): Range {
    let line = 0;
    let character = 0;
    let currentOffset = 0;
    
    // Find start
    for (let i = 0; i < text.length && currentOffset < startOffset; i++) {
      if (text[i] === '\n') {
        line++;
        character = 0;
      } else {
        character++;
      }
      currentOffset++;
    }
    
    const start: Position = { line, character };
    
    // Find end
    while (currentOffset < endOffset && currentOffset < text.length) {
      if (text[currentOffset] === '\n') {
        line++;
        character = 0;
      } else {
        character++;
      }
      currentOffset++;
    }
    
    const end: Position = { line, character };
    
    return { start, end };
  }

  /**
   * LSP range from AST range
   */
  private lspRangeFromASTRange(location: any): Range {
    if (location?.start && location?.end) {
      return {
        start: {
          line: location.start.line - 1,
          character: location.start.column,
        },
        end: {
          line: location.end.line - 1,
          character: location.end.column,
        },
      };
    }
    
    return {
      start: { line: 0, character: 0 },
      end: { line: 0, character: 0 },
    };
  }

  /**
   * Full document range
   */
  private fullDocumentRange(text: string): Range {
    const lineCount = text.split('\n').length - 1;
    const lastLineLength = text.split('\n').pop()?.length || 0;
    
    return {
      start: { line: 0, character: 0 },
      end: { line: lineCount, character: lastLineLength },
    };
  }
}

// ============================================================================
// VS Code Extension
// ============================================================================

/**
 * VS Code extension APIs
 * 
 * This would be used in a VS Code extension package.json:
 * {
 *   "activationEvents": ["onLanguage:javascript", "onCommand:universal-transpiler.transpile"],
 *   "contributes": {
 *     "languages": [{"id": "universal-transpiler", "aliases": ["Universal", "universal"], "extensions": [".ut"]}],
 *     "grammars": [],
 *     "commands": [{"command": "universal-transpiler.transpile", "title": "Transpile"}]
 *   }
 * }
 */
export class VSCodeExtension {
  private transpiler: any;
  private llm: LLMClient | null = null;

  constructor(transpiler: any, llm?: LLMClient) {
    this.transpiler = transpiler;
    this.llm = llm || null;
  }

  /**
   * Register extension commands
   */
  registerCommands(context: any): void {
    // Register transpile command
    const transpileCommand = this.createTranspileCommand();
    context.subscriptions.push(
      vscode.commands.registerCommand('universal-transpiler.transpile', transpileCommand)
    );

    // Register detect language command
    const detectCommand = this.createDetectLanguageCommand();
    context.subscriptions.push(
      vscode.commands.registerCommand('universal-transpiler.detectLanguage', detectCommand)
    );

    // Register completion provider
    const completionProvider = this.createCompletionProvider();
    context.subscriptions.push(
      vscode.languages.registerCompletionItemProvider(
        '*', // All languages
        completionProvider,
        ...['.', '(', '[', '{', ' ', '\t', '\n']
      )
    );

    // Register hover provider
    context.subscriptions.push(
      vscode.languages.registerHoverProvider('*', this.createHoverProvider())
    );

    // Register document symbol provider
    context.subscriptions.push(
      vscode.languages.registerDocumentSymbolProvider(
        '*',
        this.createDocumentSymbolProvider(),
        { label: 'Universal Transpiler Symbols' }
      )
    );

    // Register formatting provider
    context.subscriptions.push(
      vscode.languages.registerDocumentFormattingEditProvider(
        '*',
        this.createFormattingProvider()
      )
    );
  }

  /**
   * Create transpile command handler
   */
  private createTranspileCommand(): () => Promise<void> {
    return async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showErrorMessage('No active editor');
        return;
      }

      const document = editor.document;
      const text = document.getText();
      const language = document.languageId;

      // Show quick pick for target language
      const target = await vscode.window.showQuickPick(
        ['javascript', 'typescript', 'python', 'es2020', 'es2015'],
        { placeHolder: 'Select target language' }
      );

      if (!target) return;

      try {
        const result = await this.transpiler.transpile(text, {
          sourceType: language,
          target,
        });

        if (result.errors.length > 0) {
          vscode.window.showErrorMessage(
            `Transpilation errors: ${result.errors.map(e => e.message).join('; ')}`
          );
          return;
        }

        // Show result in new document
        const resultDocument = await vscode.workspace.openTextDocument({
          content: result.code,
          language: target,
        });

        await vscode.window.showTextDocument(resultDocument);
      } catch (error: any) {
        vscode.window.showErrorMessage(`Transpilation failed: ${error.message}`);
      }
    };
  }

  /**
   * Create detect language command handler
   */
  private createDetectLanguageCommand(): () => Promise<void> {
    return async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showErrorMessage('No active editor');
        return;
      }

      const document = editor.document;
      const text = document.getText();

      try {
        const languages = await this.transpiler.detectLanguage(text);
        
        if (languages.length === 0) {
          vscode.window.showInformationMessage('Could not detect language');
          return;
        }

        const selected = await vscode.window.showQuickPick(languages, {
          placeHolder: 'Detected languages',
        });

        if (selected) {
          vscode.window.showInformationMessage(
            `Language detected: ${selected}`
          );
        }
      } catch (error: any) {
        vscode.window.showErrorMessage(`Detection failed: ${error.message}`);
      }
    };
  }

  /**
   * Create completion provider
   */
  private createCompletionProvider(): any {
    return {
      provideCompletionItems: async (document: any, position: any) => {
        const text = document.getText();
        const line = document.lineAt(position.line).text;
        const prefix = line.substring(0, position.character);
        
        try {
          if (this.llm) {
            const completions = await this.llm.suggestSyntax(
              prefix,
              document.languageId,
              'completion'
            );
            
            return completions.map((completion: string, index: number) => {
              const item = new vscode.CompletionItem(completion);
              item.sortText = index.toString().padStart(4, '0');
              return item;
            });
          }
        } catch {
          // Ignore errors
        }
        
        return [];
      },
    };
  }

  /**
   * Create hover provider
   */
  private createHoverProvider(): any {
    return {
      provideHover: async (document: any, position: any) => {
        const wordRange = document.getWordRangeAtPosition(position);
        const word = document.getText(wordRange);
        
        if (!word) return null;
        
        const language = document.languageId;
        const languageDef = this.transpiler.getLanguage(language);
        
        if (languageDef?.builtins?.[word]) {
          return new vscode.Hover(languageDef.builtins[word]);
        }
        
        return null;
      },
    };
  }

  /**
   * Create document symbol provider
   */
  private createDocumentSymbolProvider(): any {
    return {
      provideDocumentSymbols: async (document: any) => {
        const text = document.getText();
        
        try {
          const result = await this.transpiler.transpile(text, {
            sourceType: document.languageId,
            target: document.languageId,
          });
          
          // Convert AST to document symbols
          return this.convertToVSCodeSymbols(result.ast);
        } catch {
          return [];
        }
      },
    };
  }

  /**
   * Create formatting provider
   */
  private createFormattingProvider(): any {
    return {
      provideDocumentFormattingEdits: async (document: any) => {
        const text = document.getText();
        
        try {
          const result = await this.transpiler.transpile(text, {
            sourceType: document.languageId,
            target: document.languageId,
          });
          
          if (result.code !== text) {
            const start = new vscode.Position(0, 0);
            const end = new vscode.Position(
              document.lineCount - 1,
              document.lineAt(document.lineCount - 1).text.length
            );
            
            return [new vscode.TextEdit(
              new vscode.Range(start, end),
              result.code
            )];
          }
        } catch {
          // Ignore errors
        }
        
        return [];
      },
    };
  }

  /**
   * Convert AST to VS Code symbols
   */
  private convertToVSCodeSymbols(ast: ASTNode): any[] {
    const symbols: any[] = [];
    
    const visit = (node: ASTNode, parent: any = null) => {
      let kind: number | undefined;
      
      switch (node.type) {
        case 'FunctionDeclaration':
          kind = vscode.SymbolKind.Function;
          break;
        case 'ClassDeclaration':
          kind = vscode.SymbolKind.Class;
          break;
        case 'VariableDeclaration':
          kind = vscode.SymbolKind.Variable;
          break;
        case 'InterfaceDeclaration':
          kind = vscode.SymbolKind.Interface;
          break;
      }
      
      if (kind !== undefined && node.location) {
        const symbol = new vscode.DocumentSymbol(
          node.value?.toString() || node.type,
          node.type,
          kind,
          this.vscodeRangeFromAST(node.location),
          this.vscodeRangeFromAST(node.location)
        );
        
        if (parent) {
          parent.children.push(symbol);
        } else {
          symbols.push(symbol);
        }
        
        if (node.children) {
          for (const child of node.children) {
            visit(child, symbol);
          }
        }
      } else if (parent && node.children) {
        for (const child of node.children) {
          visit(child, parent);
        }
      }
    };
    
    visit(ast);
    
    return symbols;
  }

  /**
   * Convert AST range to VS Code range
   */
  private vscodeRangeFromAST(location: any): vscode.Range {
    if (location?.start && location?.end) {
      return new vscode.Range(
        new vscode.Position(location.start.line - 1, location.start.column),
        new vscode.Position(location.end.line - 1, location.end.column)
      );
    }
    
    return new vscode.Range(0, 0, 0, 0);
  }
}

// ============================================================================
// JetBrains/WebStorm Integration
// ============================================================================

/**
 * Integration with JetBrains IDEs (WebStorm, IntelliJ, etc.)
 * 
 * Uses the IntelliJ Platform Plugin API
 */
export class JetBrainsIntegration {
  private transpiler: any;

  constructor(transpiler: any) {
    this.transpiler = transpiler;
  }

  /**
   * Register as an IntelliJ plugin
   */
  registerPlugin(): void {
    // This would be called from plugin initialization
    
    // Register file type
    this.registerFileType();
    
    // Register language
    this.registerLanguage();
    
    // Register parser
    this.registerParser();
    
    // Register actions
    this.registerActions();
  }

  /**
   * Register custom file type
   */
  private registerFileType(): void {
    // In IntelliJ plugin:
    // FileTypeFactory factory = new FileTypeFactory() {
    //   @Override
    //   public FileType createFileType() {
    //     return new UniversalTranspilerFileType();
    //   }
    // };
    // FileTypeRegistry.getInstance().registerFileType(factory, new FileTypeIdentifiableExtensionDeserializer<UniversalTranspilerFileType>("universal"));
  }

  /**
   * Register custom language
   */
  private registerLanguage(): void {
    // In IntelliJ plugin:
    // LanguageRegistry.registerLanguage(UniversalTranspilerLanguage.INSTANCE);
  }

  /**
   * Register custom parser
   */
  private registerParser(): void {
    // In IntelliJ plugin:
    // ParserDefinition parserDefinition = new UniversalTranspilerParserDefinition();
    // LanguageParserDefinitions.INSTANCE.addDefinition(parserDefinition);
  }

  /**
   * Register actions
   */
  private registerActions(): void {
    // In IntelliJ plugin:
    // AnAction transpileAction = new AnAction("Transpile", "Transpile with Universal Transpiler", null) {
    //   @Override
    //   public void actionPerformed(AnActionEvent e) {
    //     new TranspileAction().execute(e);
    //   }
    // };
    // ActionManager.getInstance().registerAction("universal-transpiler.transpile", transpileAction);
  }
}

// ============================================================================
// Editor Tooling
// ============================================================================

/**
 * Editor tooling utilities
 */
export class EditorTooling {
  private transpiler: any;
  private llm: LLMClient | null = null;

  constructor(transpiler: any, llm?: LLMClient) {
    this.transpiler = transpiler;
    this.llm = llm || null;
  }

  /**
   * Syntax highlighting configuration
   */
  getSyntaxHighlighting(language: string): any {
    const languageDef = this.transpiler.getLanguage(language);
    
    if (!languageDef) {
      return this.getDefaultSyntaxHighlighting();
    }

    // Generate syntax highlighting rules from keywords and operators
    return {
      keywords: languageDef.keywords || [],
      operators: languageDef.operators || [],
      builtins: Object.keys(languageDef.builtins || {}),
      comments: ['//', '/*', '*/'],
      strings: ['"', "'", '`'],
      numbers: [/\b\d+(\.\d+)?\b/, /0x[0-9a-fA-F]+/, /0b[01]+/],
    };
  }

  /**
   * Default syntax highlighting
   */
  private getDefaultSyntaxHighlighting(): any {
    return {
      keywords: ['function', 'if', 'else', 'for', 'while', 'return', 'const', 'let', 'var'],
      operators: ['+', '-', '*', '/', '=', '==', '!==', '<', '>', '&&', '||', '!'],
      builtins: ['console', 'log', 'require', 'module', 'exports'],
      comments: ['//', '/*', '*/'],
      strings: ['"', "'", '`'],
      numbers: [/\b\d+(\.\d+)?\b/],
    };
  }

  /**
   * Code folding configuration
   */
  getCodeFoldingRules(language: string): any {
    return {
      // Fold blocks
      start: /\{|\$/,
      end: /\}|^\s*\}/,
      // Fold comments
      start: /\/\*/,
      end: /\*\//,
      // Fold functions
      start: /function\s+\w+\s*\([^)]*\)\s*\{|def\s+\w+\s*\([^)]*\)\s*:/,
      end: /^\s*\}|^\s*$/,
    };
  }

  /**
   * Auto-indentation rules
   */
  getAutoIndentationRules(language: string): any {
    return {
      increaseIndent: /\{|\:|\->/,
      decreaseIndent: /\}|^\s*$/,
      bracketIndent: true,
      tabSize: 2,
      useTabs: false,
    };
  }

  /**
   * Code lens providers
   */
  getCodeLensProviders(language: string): any {
    return {
      // Show transpile options
      transpile: {
        title: 'Transpile to...',
        command: 'universal-transpiler.transpile',
        arguments: [],
      },
      // Show language detection
      detectLanguage: {
        title: 'Detect Language',
        command: 'universal-transpiler.detectLanguage',
        arguments: [],
      },
    };
  }

  /**
   * Snippets
   */
  getSnippets(language: string): Record<string, any> {
    return {
      'Function': {
        prefix: 'fn',
        body: 'function ${1:name}(${2:params}) {\n  ${3:body}\n}',
        description: 'Function declaration',
      },
      'Class': {
        prefix: 'class',
        body: 'class ${1:name} {\n  constructor(${2:params}) {\n    ${3:body}\n  }\n}',
        description: 'Class declaration',
      },
      'Import': {
        prefix: 'imp',
        body: 'import ${1:module} from\'${2:path}\';',
        description: 'Import statement',
      },
      'Export': {
        prefix: 'exp',
        body: 'export ${1:name};',
        description: 'Export statement',
      },
    };
  }

  /**
   * Linting rules
   */
  getLintingRules(language: string): any {
    return {
      // Use ESLint-like rules
      rules: {
        'no-unused-vars': 'warn',
        'no-undefined': 'error',
        'no-dupe-keys': 'error',
      },
      // Parse with transpiler
      parser: async (code: string) => {
        try {
          const result = await this.transpiler.transpile(code, {
            sourceType: language,
            target: language,
          });
          
          return {
            ast: result.ast,
            errors: result.errors,
            warnings: result.warnings,
          };
        } catch (error: any) {
          return {
            errors: [{ message: error.message }],
          };
        }
      },
    };
  }

  /**
   * Refactoring actions
   */
  getRefactoringActions(language: string): any {
    return {
      // Rename symbol
      rename: {
        title: 'Rename Symbol',
        command: 'universal-transpiler.rename',
        applicable: (node: any) => node.type === 'Identifier',
      },
      // Extract function
      extractFunction: {
        title: 'Extract Function',
        command: 'universal-transpiler.extractFunction',
        applicable: (node: any) => node.type === 'Block',
      },
      // Inline variable
      inlineVariable: {
        title: 'Inline Variable',
        command: 'universal-transpiler.inlineVariable',
        applicable: (node: any) => node.type === 'VariableDeclarator',
      },
    };
  }
}

// ============================================================================
// Self-Optimizing System
// ============================================================================

/**
 * Self-optimizing system for the Universal Transpiler
 * 
 * Phase 3: System that learns and optimizes itself over time
 */
export class SelfOptimizingSystem {
  private transpiler: any;
  private llm: LLMClient | null = null;
  private cache: CacheManager | null = null;
  private statistics: Map<string, any> = new Map();
  private optimizations: Map<string, any> = new Map();

  constructor(transpiler: any, llm?: LLMClient, cache?: CacheManager) {
    this.transpiler = transpiler;
    this.llm = llm || null;
    this.cache = cache || null;
    
    // Load stored optimizations
    this.loadOptimizations();
  }

  /**
   * Record transpilation statistics
   */
  recordTranspilation(source: string, options: TranspileOptions, result: TranspileResult): void {
    const key = `${options.sourceType || 'unknown'}:${options.target || 'javascript'}`;
    
    const stats = this.statistics.get(key) || {
      count: 0,
      totalTime: 0,
      avgTime: 0,
      minTime: Infinity,
      maxTime: 0,
      successCount: 0,
      errorCount: 0,
    };
    
    stats.count++;
    stats.totalTime += result.stats.parseTime + result.stats.transformTime + result.stats.generateTime;
    stats.avgTime = stats.totalTime / stats.count;
    stats.minTime = Math.min(stats.minTime, stats.totalTime);
    stats.maxTime = Math.max(stats.maxTime, stats.totalTime);
    
    if (result.errors.length === 0) {
      stats.successCount++;
    } else {
      stats.errorCount++;
    }
    
    this.statistics.set(key, stats);
    
    // Apply optimizations if needed
    this.applyDynamicOptimizations(key, stats, result);
  }

  /**
   * Apply dynamic optimizations
   */
  private applyDynamicOptimizations(
    key: string,
    stats: any,
    result: TranspileResult
  ): void {
    // If error rate is high, try to improve
    if (stats.errorCount > stats.count * 0.3) {
      this.optimizeForErrors(key);
    }
    
    // If performance is slow, try to optimize
    if (stats.avgTime > 1000) {
      this.optimizeForPerformance(key);
    }
  }

  /**
   * Optimize for reducing errors
   */
  private async optimizeForErrors(key: string): Promise<void> {
    const [sourceLang, targetLang] = key.split(':');
    
    // Get error patterns
    const errors = this.getCommonErrors(key);
    
    if (errors.length > 0 && this.llm) {
      // Use LLM to analyze errors and suggest fixes
      const prompt = {
        system: `You are an optimization expert. Analyze the following errors that occur when transpiling from ${sourceLang} to ${targetLang} and suggest optimizations to prevent them.`,
        user: `Common errors:\n${errors.join('\n')}\n\nSuggested optimizations:`,
      };
      
      try {
        const response = await this.llm.generate(prompt);
        const optimization = JSON.parse(response.content);
        
        this.optimizations.set(`errors:${key}`, optimization);
        this.saveOptimizations();
      } catch {
        // Ignore errors
      }
    }
  }

  /**
   * Optimize for performance
   */
  private async optimizeForPerformance(key: string): Promise<void> {
    const [sourceLang, targetLang] = key.split(':');
    
    if (this.llm) {
      // Use LLM to suggest performance optimizations
      const prompt = {
        system: `You are a performance optimization expert. Suggest optimizations for transpiling from ${sourceLang} to ${targetLang} to improve speed.`,
        user: `Current performance: average ${this.statistics.get(key)?.avgTime || 0}ms\n\nSuggested optimizations:`,
      };
      
      try {
        const response = await this.llm.generate(prompt);
        const optimization = JSON.parse(response.content);
        
        this.optimizations.set(`performance:${key}`, optimization);
        this.saveOptimizations();
      } catch {
        // Ignore errors
      }
    }
  }

  /**
   * Get common errors for a language pair
   */
  private getCommonErrors(key: string): string[] {
    // This would track errors from transpilation results
    // For now, return empty array
    return [];
  }

  /**
   * Apply stored optimizations
   */
  applyOptimizations(source: string, options: TranspileOptions): TranspileOptions {
    const key = `${options.sourceType || 'unknown'}:${options.target || 'javascript'}`;
    
    // Apply error optimizations
    const errorOpt = this.optimizations.get(`errors:${key}`);
    if (errorOpt) {
      // Apply error-specific optimizations
      options = this.applyErrorOptimizations(options, errorOpt);
    }
    
    // Apply performance optimizations
    const perfOpt = this.optimizations.get(`performance:${key}`);
    if (perfOpt) {
      // Apply performance-specific optimizations
      options = this.applyPerformanceOptimizations(options, perfOpt);
    }
    
    return options;
  }

  /**
   * Apply error optimizations
   */
  private applyErrorOptimizations(options: TranspileOptions, optimization: any): TranspileOptions {
    // Modify options based on optimization
    if (optimization.preprocess) {
      options.plugins = options.plugins || [];
      options.plugins.push('error-preprocessor');
    }
    
    return options;
  }

  /**
   * Apply performance optimizations
   */
  private applyPerformanceOptimizations(options: TranspileOptions, optimization: any): TranspileOptions {
    // Modify options based on optimization
    if (optimization.cache) {
      options.cache = true;
    }
    
    if (optimization.simplify) {
      options.plugins = options.plugins || [];
      options.plugins.push('simplifier');
    }
    
    return options;
  }

  /**
   * Learn from transpilation results
   */
  learnFromResult(source: string, options: TranspileOptions, result: TranspileResult): void {
    // Store successful transpilations for future reference
    const key = `${options.sourceType || 'unknown'}:${options.target || 'javascript'}:${this.hashSource(source)}`;
    
    if (result.errors.length === 0) {
      this.cache?.set(key, {
        source,
        options,
        result,
        timestamp: Date.now(),
      });
    }
    
    // Learn patterns from successful transpilations
    this.learnPatterns(source, result);
  }

  /**
   * Learn patterns from transpilation
   */
  private async learnPatterns(source: string, result: TranspileResult): Promise<void> {
    if (!this.llm) return;
    
    try {
      // Use LLM to identify patterns in the code
      const prompt = {
        system: 'Identify patterns in the following code and suggest how to handle similar code in the future.',
        user: `Source code:\n${source}\n\nAST:\n${JSON.stringify(result.ast)}\n\nPatterns:`,
      };
      
      const response = await this.llm.generate(prompt);
      const patterns = JSON.parse(response.content);
      
      this.optimizations.set(`patterns:${Date.now()}`, patterns);
      this.saveOptimizations();
    } catch {
      // Ignore errors
    }
  }

  /**
   * Adapt to new languages
   */
  async adaptToLanguage(language: string, samples: string[]): Promise<void> {
    if (!this.llm) return;
    
    try {
      // Use LLM to generate parser for new language
      const parser = await this.llm.generateParser(samples, language);
      
      this.optimizations.set(`parser:${language}`, parser);
      this.saveOptimizations();
      
      // Register the parser
      this.transpiler.registerLanguage({
        name: language,
        version: '1.0',
        extensions: [`.${language}`],
        parser,
      });
    } catch {
      // Ignore errors
    }
  }

  /**
   * Optimize transpilation based on statistics
   */
  getOptimizedOptions(source: string, options: TranspileOptions): TranspileOptions {
    // Apply learned optimizations
    options = this.applyOptimizations(source, options);
    
    // Use statistics to guide optimization
    const key = `${options.sourceType || 'unknown'}:${options.target || 'javascript'}`;
    const stats = this.statistics.get(key);
    
    if (stats && stats.avgTime > 500) {
      // For slow transpilations, enable caching
      options.cache = true;
    }
    
    return options;
  }

  /**
   * Get optimization suggestions
   */
  getOptimizationSuggestions(): Array<{ type: string; description: string; impact: number }> {
    const suggestions: any[] = [];
    
    for (const [key, stats] of this.statistics) {
      if (stats.errorCount > 0) {
        suggestions.push({
          type: 'error-reduction',
          description: `Reduce errors for ${key} (${stats.errorCount} errors)`,
          impact: stats.errorCount,
        });
      }
      
      if (stats.avgTime > 500) {
        suggestions.push({
          type: 'performance',
          description: `Improve performance for ${key} (${stats.avgTime}ms avg)`,
          impact: stats.avgTime,
        });
      }
    }
    
    return suggestions.sort((a, b) => b.impact - a.impact);
  }

  /**
   * Save optimizations to persistent storage
   */
  private saveOptimizations(): void {
    if (this.cache) {
      this.cache.set('self-optimizing:optimizations', Array.from(this.optimizations.entries()));
      this.cache.set('self-optimizing:statistics', Array.from(this.statistics.entries()));
    }
  }

  /**
   * Load optimizations from persistent storage
   */
  private loadOptimizations(): void {
    if (this.cache) {
      const optimizations = this.cache.get<[string, any][]>('self-optimizing:optimizations');
      if (optimizations) {
        this.optimizations = new Map(optimizations);
      }
      
      const statistics = this.cache.get<[string, any][]>('self-optimizing:statistics');
      if (statistics) {
        this.statistics = new Map(statistics);
      }
    }
  }

  /**
   * Hash source for cache key
   */
  private hashSource(source: string): string {
    return crypto.createHash('sha256').update(source).digest('hex').substring(0, 16);
  }

  /**
   * Get statistics
   */
  getStatistics(): Map<string, any> {
    return this.statistics;
  }

  /**
   * Clear statistics
   */
  clearStatistics(): void {
    this.statistics.clear();
  }

  /**
   * Get optimizations
   */
  getOptimizations(): Map<string, any> {
    return this.optimizations;
  }

  /**
   * Clear optimizations
   */
  clearOptimizations(): void {
    this.optimizations.clear();
  }
}

// ============================================================================
// Exports
// ============================================================================

export {
  UniversalTranspilerLSPServer,
  VSCodeExtension,
  JetBrainsIntegration,
  EditorTooling,
  SelfOptimizingSystem,
};

export type {
  Position,
  Range,
  TextDocumentIdentifier,
  TextDocumentItem,
  VersionedTextDocumentIdentifier,
  TextDocumentContentChangeEvent,
  DidChangeTextDocumentParams,
  CompletionItem,
  CompletionItemKind,
  InsertTextFormat,
  TextEdit,
  MarkupContent,
  Command,
  Hover,
  Location,
  Definition,
  ReferenceContext,
  ReferenceParams,
  DocumentSymbol,
  SymbolKind,
  FormattingOptions,
  Diagnostic,
  DiagnosticSeverity,
  DiagnosticRelatedInformation,
  DiagnosticTag,
  SemanticTokenType,
  SemanticTokenModifier,
  LSPRequest,
  LSPResponse,
  LSPNotification,
  LSPMessageType,
};

export default {
  UniversalTranspilerLSPServer,
  VSCodeExtension,
  JetBrainsIntegration,
  EditorTooling,
  SelfOptimizingSystem,
};
