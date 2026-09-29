/**
 * Advanced Language Parsers for Universal Transpiler
 * 
 * Phase 2: Additional language parsers for Java, C#, Go, Rust, Ruby, PHP, etc.
 * 
 * This module provides:
 * - Token specifications for various languages
 * - Parser configurations
 * - Language detection patterns
 * - Dynamic parser generation helpers
 */

import type { Parser, ASTNode, Token, ParseResult } from '../core/universal-transpiler';

// ============================================================================
// Language Token Specifications
// ============================================================================

/**
 * Token specification for a programming language
 */
export interface TokenSpec {
  type: string;
  pattern: RegExp | string;
  ignore?: boolean;
  priority?: number;
}

/**
 * Parser configuration for a language
 */
export interface ParserConfig {
  name: string;
  extensions: string[];
  mimetypes: string[];
  tokenSpecs: TokenSpec[];
  keywords: string[];
  operators: string[];
  commentPatterns?: RegExp[];
  stringPatterns?: RegExp[];
  numberPatterns?: RegExp[];
  blockStart?: string[];
  blockEnd?: string[];
  lineComment?: string;
  blockComment?: { start: string; end: string };
}

// ============================================================================
// Language Token Specifications
// ============================================================================

/**
 * Java token specifications
 */
export const JAVA_TOKEN_SPECS: TokenSpec[] = [
  // Whitespace
  { type: 'WHITESPACE', pattern: /\s+/, ignore: true, priority: 0 },
  
  // Comments
  { type: 'COMMENT', pattern: /\/\/[^\n]*/, ignore: true, priority: 0 },
  { type: 'COMMENT', pattern: /\/\*[\s\S]*?\*\//, ignore: true, priority: 0 },
  
  // Strings
  { type: 'STRING', pattern: /"(?:[^"\\]|\\.)*"/, priority: 10 },
  { type: 'STRING', pattern: /'(?:[^'\\]|\\.)*'/, priority: 10 },
  
  // Numbers
  { type: 'NUMBER', pattern: /\b\d+(\.\d+)?([eE][+-]?\d+)?[LlFfDd]?\b/, priority: 10 },
  { type: 'NUMBER', pattern: /0x[0-9a-fA-F]+[Ll]?/, priority: 10 },
  { type: 'NUMBER', pattern: /0b[01]+[Ll]?/, priority: 10 },
  { type: 'NUMBER', pattern: /0[0-7]+[Ll]?/, priority: 10 },
  
  // Keywords (must come before IDENTIFIER)
  { type: 'KEYWORD', pattern: /\b(abstract|assert|boolean|break|byte|case|catch|char|class|const|continue|default|do|double|else|enum|extends|final|finally|float|for|goto|if|implements|import|instanceof|int|interface|long|native|new|package|private|protected|public|return|short|static|strictfp|super|switch|synchronized|this|throw|throws|transient|try|void|volatile|while)\b/, priority: 20 },
  
  // Identifiers
  { type: 'IDENTIFIER', pattern: /[a-zA-Z_$][a-zA-Z0-9_$]*/, priority: 15 },
  
  // Operators and punctuation
  { type: 'OPERATOR', pattern: /[+\-*/%=<>!&|^~?,.:;(){}[\]]/, priority: 5 },
  { type: 'PUNCTUATION', pattern: /\./, priority: 5 },
  
  // Annotations
  { type: 'ANNOTATION', pattern: /@[a-zA-Z_$][a-zA-Z0-9_$]*/, priority: 18 },
];

/**
 * C# token specifications
 */
export const CSHARP_TOKEN_SPECS: TokenSpec[] = [
  { type: 'WHITESPACE', pattern: /\s+/, ignore: true, priority: 0 },
  { type: 'COMMENT', pattern: /\/\/[^\n]*/, ignore: true, priority: 0 },
  { type: 'COMMENT', pattern: /\/\*[\s\S]*?\*\//, ignore: true, priority: 0 },
  { type: 'STRING', pattern: /"(?:[^"\\]|\\.)*"/, priority: 10 },
  { type: 'STRING', pattern: /@"(?:[^"\\]|\\.)*"/, priority: 10 }, // Verbatim string
  { type: 'NUMBER', pattern: /\b\d+(\.\d+)?([eE][+-]?\d+)?[mMuUlLfFdD]?\b/, priority: 10 },
  { type: 'NUMBER', pattern: /0x[0-9a-fA-F]+[uUlL]?/, priority: 10 },
  { type: 'KEYWORD', pattern: /\b(abstract|as|base|bool|break|byte|case|catch|char|checked|class|const|continue|decimal|default|delegate|do|double|else|enum|event|explicit|extern|false|finally|fixed|float|for|foreach|goto|if|implicit|in|int|interface|internal|is|lock|long|namespace|new|null|object|operator|out|override|params|private|protected|public|readonly|ref|return|sbyte|sealed|short|sizeof|stackalloc|static|string|struct|switch|this|throw|true|try|typeof|uint|ulong|unchecked|unsafe|ushort|using|virtual|void|volatile|while)\b/, priority: 20 },
  { type: 'IDENTIFIER', pattern: /@?[a-zA-Z_][a-zA-Z0-9_]*/, priority: 15 },
  { type: 'OPERATOR', pattern: /[+\-*/%=<>!&|^~?,.:;(){}[\]]/, priority: 5 },
  { type: 'PUNCTUATION', pattern: /[.,;:]/, priority: 5 },
  { type: 'PREPROCESSOR', pattern: /#\w+/, priority: 25 },
];

/**
 * Go token specifications
 */
export const GO_TOKEN_SPECS: TokenSpec[] = [
  { type: 'WHITESPACE', pattern: /\s+/, ignore: true, priority: 0 },
  { type: 'COMMENT', pattern: /\/\/[^\n]*/, ignore: true, priority: 0 },
  { type: 'COMMENT', pattern: /\/\*[\s\S]*?\*\//, ignore: true, priority: 0 },
  { type: 'STRING', pattern: /"(?:[^"\\]|\\.)*"/, priority: 10 },
  { type: 'STRING', pattern: /`[^`]*`/, priority: 10 }, // Raw string
  { type: 'NUMBER', pattern: /\b\d+(\.\d+)?([eE][+-]?\d+)?[iu]?\b/, priority: 10 },
  { type: 'NUMBER', pattern: /0x[0-9a-fA-F]+/, priority: 10 },
  { type: 'NUMBER', pattern: /0[0-7]+/, priority: 10 },
  { type: 'KEYWORD', pattern: /\b(break|case|chan|const|continue|default|defer|else|fallthrough|for|func|go|goto|if|import|interface|map|package|range|return|select|struct|switch|type|var)\b/, priority: 20 },
  { type: 'IDENTIFIER', pattern: /[a-zA-Z_][a-zA-Z0-9_]*/, priority: 15 },
  { type: 'OPERATOR', pattern: /[+\-*/%=<>!&|^~?,.:;(){}[\]]/, priority: 5 },
  { type: 'PUNCTUATION', pattern: /[.,;:]/, priority: 5 },
  { type: 'OPERATOR', pattern: /:==|\.<-|<-|->|\.\./, priority: 20 },
];

/**
 * Rust token specifications
 */
export const RUST_TOKEN_SPECS: TokenSpec[] = [
  { type: 'WHITESPACE', pattern: /\s+/, ignore: true, priority: 0 },
  { type: 'COMMENT', pattern: /\/\/[^\n]*/, ignore: true, priority: 0 },
  { type: 'COMMENT', pattern: /\/\*[\s\S]*?\*\//, ignore: true, priority: 0 },
  { type: 'STRING', pattern: /r#*"(?:[^"\\]|\\.)*"#*|r#*'(?:[^'\\]|\\.)*'#*/, priority: 10 }, // Raw strings
  { type: 'STRING', pattern: /"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/, priority: 10 },
  { type: 'NUMBER', pattern: /\b\d+(\.\d+)?([eE][+-]?\d+)?([uif](8|16|32|64|128|size))?\b/, priority: 10 },
  { type: 'NUMBER', pattern: /0x[0-9a-fA-F]+[uif]?/, priority: 10 },
  { type: 'NUMBER', pattern: /0o[0-7]+[uif]?/, priority: 10 },
  { type: 'NUMBER', pattern: /0b[01]+[uif]?/, priority: 10 },
  { type: 'KEYWORD', pattern: /\b(as|async|await|break|const|continue|crate|dyn|else|enum|extern|false|fn|for|if|impl|in|let|loop|match|mod|move|mut|pub|ref|return|Self|self|Self|static|struct|super|trait|true|type|unsafe|use|where|while|yield)\b/, priority: 20 },
  { type: 'IDENTIFIER', pattern: /[a-zA-Z_][a-zA-Z0-9_]*/, priority: 15 },
  { type: 'OPERATOR', pattern: /[+\-*/%=<>!&|^~?,.:;(){}[\]]/, priority: 5 },
  { type: 'LIFETIME', pattern: /'[a-zA-Z_][a-zA-Z0-9_]*/, priority: 25 },
  { type: 'MACRO', pattern: /![a-zA-Z_][a-zA-Z0-9_]*/, priority: 25 },
];

/**
 * Ruby token specifications
 */
export const RUBY_TOKEN_SPECS: TokenSpec[] = [
  { type: 'WHITESPACE', pattern: /\s+/, ignore: true, priority: 0 },
  { type: 'COMMENT', pattern: /#.*/, ignore: true, priority: 0 },
  { type: 'COMMENT', pattern: /^=begin[\s\S]*?=end$/, ignore: true, priority: 0 },
  { type: 'STRING', pattern: /"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/, priority: 10 },
  { type: 'STRING', pattern: /%[qQwWx]?\([^)]*\)|%[qQwWx]?\[[^\]]*\]|%[qQwWx]?\{[^}]*\}|%[qQwWx]?<[^>]*>/, priority: 10 },
  { type: 'SYMBOL', pattern: /:[a-zA-Z_][a-zA-Z0-9_]*/, priority: 18 },
  { type: 'NUMBER', pattern: /\b\d+(\.\d+)?([eE][+-]?\d+)?\b/, priority: 10 },
  { type: 'KEYWORD', pattern: /\b(alias|and|BEGIN|break|case|class|def|defined\?|do|else|elsif|end|ensure|false|for|if|in|module|next|nil|not|or|redo|rescue|retry|return|self|super|then|true|undef|unless|until|when|while|yield)\b/, priority: 20 },
  { type: 'IDENTIFIER', pattern: /[a-zA-Z_][a-zA-Z0-9_]*/, priority: 15 },
  { type: 'OPERATOR', pattern: /[+\-*/%=<>!&|^~?,.:;(){}[\]]/, priority: 5 },
  { type: 'HEREDOC', pattern: /<<[-~]?[a-zA-Z_][a-zA-Z0-9_]*/, priority: 25 },
];

/**
 * PHP token specifications
 */
export const PHP_TOKEN_SPECS: TokenSpec[] = [
  { type: 'PHPTAG', pattern: /<\?php|<\?=|<\?|\?>/, priority: 30 },
  { type: 'WHITESPACE', pattern: /\s+/, ignore: true, priority: 0 },
  { type: 'COMMENT', pattern: /\/\/[^\n]*/, ignore: true, priority: 0 },
  { type: 'COMMENT', pattern: /\/\*[\s\S]*?\*\//, ignore: true, priority: 0 },
  { type: 'COMMENT', pattern: /#.*/, ignore: true, priority: 0 },
  { type: 'STRING', pattern: /"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/, priority: 10 },
  { type: 'STRING', pattern: /<<<'[a-zA-Z_][a-zA-Z0-9_]*\n.*\n'[a-zA-Z_][a-zA-Z0-9_]*|<<<"[a-zA-Z_][a-zA-Z0-9_]*\n.*\n"[a-zA-Z_][a-zA-Z0-9_]*/, priority: 10 }, // HEREDOC
  { type: 'NUMBER', pattern: /\b\d+(\.\d+)?([eE][+-]?\d+)?\b/, priority: 10 },
  { type: 'NUMBER', pattern: /0x[0-9a-fA-F]+/, priority: 10 },
  { type: 'VARIABLE', pattern: /\$[a-zA-Z_][a-zA-Z0-9_]*/, priority: 18 },
  { type: 'KEYWORD', pattern: /\b(abstract|and|array|as|break|callable|case|catch|class|clone|const|continue|declare|default|die|do|echo|else|elseif|empty|enddeclare|endfor|endforeach|endif|endswitch|endwhile|eval|exit|extends|final|finally|for|foreach|function|global|goto|if|implements|include|include_once|instanceof|interface|isset|list|namespace|new|or|print|private|protected|public|require|require_once|return|static|switch|throw|trait|try|unset|use|var|while|xor|yield|yield from)\b/, priority: 20 },
  { type: 'IDENTIFIER', pattern: /[a-zA-Z_][a-zA-Z0-9_]*/, priority: 15 },
  { type: 'OPERATOR', pattern: /[+\-*/%=<>!&|^~?,.:;(){}[\]]/, priority: 5 },
  { type: 'DOLLAR', pattern: /\$/, priority: 25 },
];

/**
 * Swift token specifications
 */
export const SWIFT_TOKEN_SPECS: TokenSpec[] = [
  { type: 'WHITESPACE', pattern: /\s+/, ignore: true, priority: 0 },
  { type: 'COMMENT', pattern: /\/\/[^\n]*/, ignore: true, priority: 0 },
  { type: 'COMMENT', pattern: /\/\*[\s\S]*?\*\//, ignore: true, priority: 0 },
  { type: 'STRING', pattern: /"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/, priority: 10 },
  { type: 'STRING', pattern: /"""(?:[^"\\]|\\.)*"""|'''(?:[^'\\]|\\.)*'''/, priority: 10 },
  { type: 'NUMBER', pattern: /\b\d+(\.\d+)?([eE][+-]?\d+)?\b/, priority: 10 },
  { type: 'NUMBER', pattern: /0x[0-9a-fA-F]+/, priority: 10 },
  { type: 'NUMBER', pattern: /0o[0-7]+/, priority: 10 },
  { type: 'NUMBER', pattern: /0b[01]+/, priority: 10 },
  { type: 'KEYWORD', pattern: /\b(associatedtype|break|case|catch|class|continue|default|defer|deinit|do|else|enum|extension|fallthrough|false|fileprivate|for|func|guard|if|import|in|init|inout|internal|is|let|lazy|nil|operator|private|protocol|public|repeat|return|self|Self|static|struct|subscript|super|switch|throw|throws|true|try|typealias|var|where|while|wildcard)\b/, priority: 20 },
  { type: 'IDENTIFIER', pattern: /[a-zA-Z_][a-zA-Z0-9_]*/, priority: 15 },
  { type: 'OPERATOR', pattern: /[+\-*/%=<>!&|^~?,.:;(){}[\]]/, priority: 5 },
  { type: 'ATTRIBUTE', pattern: /@[a-zA-Z_][a-zA-Z0-9_]*/, priority: 25 },
];

/**
 * Kotlin token specifications
 */
export const KOTLIN_TOKEN_SPECS: TokenSpec[] = [
  { type: 'WHITESPACE', pattern: /\s+/, ignore: true, priority: 0 },
  { type: 'COMMENT', pattern: /\/\/[^\n]*/, ignore: true, priority: 0 },
  { type: 'COMMENT', pattern: /\/\*[\s\S]*?\*\//, ignore: true, priority: 0 },
  { type: 'STRING', pattern: /"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/, priority: 10 },
  { type: 'STRING', pattern: /"""(?:[^"\\]|\\.)*"""|'''(?:[^'\\]|\\.)*'''/, priority: 10 },
  { type: 'NUMBER', pattern: /\b\d+(\.\d+)?([eE][+-]?\d+)?([LlFfUu])\b/, priority: 10 },
  { type: 'NUMBER', pattern: /0x[0-9a-fA-F]+[LlUu]?/, priority: 10 },
  { type: 'NUMBER', pattern: /0b[01]+[LlUu]?/, priority: 10 },
  { type: 'KEYWORD', pattern: /\b(abstract|actual|annotation|as|break|by|catch|class|companion|const|constructor|continue|crossinline|data|do|dynamic|else|enum|expect|external|false|field|file|finally|for|fun|get|if|import|in|infix|init|inline|inner|interface|internal|is|lateinit|lazy|noinline|null|object|open|operator|out|override|package|private|protected|public|receiver|reified|return|sealed|set|super|suspend|tailrec|this|throw|true|try|typealias|typeof|val|var|vararg|when|where|while|with)\b/, priority: 20 },
  { type: 'IDENTIFIER', pattern: /`[a-zA-Z_][a-zA-Z0-9_]*`/, priority: 15 }, // Backtick identifiers
  { type: 'IDENTIFIER', pattern: /[a-zA-Z_][a-zA-Z0-9_]*/, priority: 15 },
  { type: 'OPERATOR', pattern: /[+\-*/%=<>!&|^~?,.:;(){}[\]]/, priority: 5 },
];

// ============================================================================
// Parser Factory
// ============================================================================

/**
 * Create a parser from token specifications
 */
export function createParserFromTokenSpecs(
  name: string,
  tokenSpecs: TokenSpec[],
  options: {
    blockStart?: string[];
    blockEnd?: string[];
    lineComment?: string;
    blockComment?: { start: string; end: string };
  } = {}
): Parser {
  const blockStart = options.blockStart || ['{', '(', '['];
  const blockEnd = options.blockEnd || ['}', ')', ']'];
  
  const tokenize = (source: string): Token[] => {
    const tokens: Token[] = [];
    let pos = 0;
    let line = 1;
    let column = 0;
    
    while (pos < source.length) {
      let matched = false;
      
      // Try to match token specs in priority order
      const specs = [...tokenSpecs].sort((a, b) => (b.priority || 0) - (a.priority || 0));
      
      for (const spec of specs) {
        if (spec.ignore) continue;
        
        const regex = typeof spec.pattern === 'string' 
          ? new RegExp(spec.pattern, 'y') 
          : new RegExp(spec.pattern, 'y');
        
        regex.lastIndex = pos;
        const match = regex.exec(source);
        
        if (match && match.index === pos && match[0].length > 0) {
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
          for (let i = 0; i < value.length; i++) {
            if (value[i] === '\n') {
              line++;
              column = 0;
            } else {
              column++;
            }
          }
          
          pos += value.length;
          matched = true;
          break;
        }
      }
      
      // Handle whitespace
      if (!matched && /\s/.test(source[pos])) {
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
      
      // Handle unknown tokens
      if (!matched) {
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
  };
  
  const parse = (source: string): ParseResult => {
    const tokens = tokenize(source);
    const ast: ASTNode = {
      type: 'Program',
      children: [],
      tokens,
      position: tokens[0]?.position || { line: 0, column: 0, offset: 0 },
      location: {
        start: tokens[0]?.position || { line: 0, column: 0, offset: 0 },
        end: tokens[tokens.length - 1]?.location?.end || { line: 0, column: source.length, offset: source.length },
        source,
      },
    };
    
    // Build AST from tokens
    const stack: { node: ASTNode; blockType: string | null }[] = [{ node: ast, blockType: null }];
    let current = ast;
    
    for (const token of tokens) {
      if (token.type === 'WHITESPACE' || token.type === 'COMMENT') continue;
      
      // Handle block starts
      if (blockStart.includes(token.value)) {
        const blockNode: ASTNode = {
          type: 'Block',
          value: token.value,
          tokens: [token],
          children: [],
          position: token.position,
          location: token.location,
        };
        if (current.children) current.children.push(blockNode);
        stack.push({ node: blockNode, blockType: token.value });
        current = blockNode;
        continue;
      }
      
      // Handle block ends
      if (blockEnd.includes(token.value)) {
        if (stack.length > 1) {
          stack.pop();
          current = stack[stack.length - 1].node;
        }
        continue;
      }
      
      // Handle keywords
      if (token.type === 'KEYWORD') {
        const keywordNode: ASTNode = {
          type: token.value,
          value: token.value,
          tokens: [token],
          children: [],
          position: token.position,
          location: token.location,
          metadata: { isKeyword: true, language: name },
        };
        if (current.children) current.children.push(keywordNode);
        
        // Special handling for certain keywords
        if (['if', 'else', 'for', 'while', 'switch', 'function', 'def', 'class'].includes(token.value)) {
          stack.push({ node: keywordNode, blockType: null });
          current = keywordNode;
        }
        continue;
      }
      
      // Handle identifiers, literals, operators
      const node: ASTNode = {
        type: token.type === 'IDENTIFIER' ? 'Identifier' : 
              token.type === 'STRING' || token.type === 'NUMBER' ? 'Literal' : 
              'Token',
        value: token.value,
        tokens: [token],
        children: [],
        position: token.position,
        location: token.location,
        metadata: { language: name },
      };
      if (current.children) current.children.push(node);
    }
    
    // Add warnings for unknown tokens
    const warnings = tokens
      .filter(t => t.type === 'UNKNOWN')
      .map(t => ({
        message: `Unknown token: '${t.value}'`,
        position: t.position,
        code: 'UNKNOWN_TOKEN',
      }));
    
    return {
      ast,
      tokens,
      errors: [],
      warnings,
    };
  };
  
  return {
    parse,
    tokenize,
    canParse: (source: string) => {
      // Simple heuristic: check if the source contains known patterns
      try {
        const result = parse(source);
        return result.warnings.length === 0 || 
               result.tokens.some(t => t.type !== 'UNKNOWN' && t.type !== 'WHITESPACE');
      } catch {
        return false;
      }
    },
  };
}

// ============================================================================
// Language Parser Registry
// ============================================================================

/**
 * Pre-configured language parsers
 */
export const LANGUAGE_PARSERS: Record<string, () => Parser> = {
  java: () => createParserFromTokenSpecs('java', JAVA_TOKEN_SPECS, {
    blockStart: ['{', '(', '['],
    blockEnd: ['}', ')', ']'],
    lineComment: '//',
    blockComment: { start: '/*', end: '*/' },
  }),
  
  csharp: () => createParserFromTokenSpecs('csharp', CSHARP_TOKEN_SPECS, {
    blockStart: ['{', '(', '['],
    blockEnd: ['}', ')', ']'],
    lineComment: '//',
    blockComment: { start: '/*', end: '*/' },
  }),
  
  go: () => createParserFromTokenSpecs('go', GO_TOKEN_SPECS, {
    blockStart: ['{', '(', '['],
    blockEnd: ['}', ')', ']'],
    lineComment: '//',
    blockComment: { start: '/*', end: '*/' },
  }),
  
  rust: () => createParserFromTokenSpecs('rust', RUST_TOKEN_SPECS, {
    blockStart: ['{', '(', '[', '('],
    blockEnd: ['}', ')', ']', ')'],
    lineComment: '//',
    blockComment: { start: '/*', end: '*/' },
  }),
  
  ruby: () => createParserFromTokenSpecs('ruby', RUBY_TOKEN_SPECS, {
    blockStart: ['{', '(', '['],
    blockEnd: ['}', ')', ']'],
    lineComment: '#',
    blockComment: { start: '=begin', end: '=end' },
  }),
  
  php: () => createParserFromTokenSpecs('php', PHP_TOKEN_SPECS, {
    blockStart: ['{', '(', '['],
    blockEnd: ['}', ')', ']'],
    lineComment: '//',
    blockComment: { start: '/*', end: '*/' },
  }),
  
  swift: () => createParserFromTokenSpecs('swift', SWIFT_TOKEN_SPECS, {
    blockStart: ['{', '(', '['],
    blockEnd: ['}', ')', ']'],
    lineComment: '//',
    blockComment: { start: '/*', end: '*/' },
  }),
  
  kotlin: () => createParserFromTokenSpecs('kotlin', KOTLIN_TOKEN_SPECS, {
    blockStart: ['{', '(', '['],
    blockEnd: ['}', ')', ']'],
    lineComment: '//',
    blockComment: { start: '/*', end: '*/' },
  }),
};

// ============================================================================
// Language Detection
// ============================================================================

/**
 * Language detection patterns
 */
export interface LanguagePattern {
  language: string;
  patterns: RegExp[];
  extensions: string[];
  priority: number;
}

/**
 * Language detection patterns for various languages
 */
export const LANGUAGE_PATTERNS: LanguagePattern[] = [
  {
    language: 'javascript',
    patterns: [
      /function\s+\w+\s*\(/,
      /const\s+\w+\s*=/,
      /let\s+\w+\s*=/,
      /var\s+\w+\s*=/,
      /class\s+\w+\s*\{/,
      /=>/,
      /\/\*[\s\S]*?\*\//,
      /\/\/[^\n]*/,
    ],
    extensions: ['.js', '.jsx', '.mjs', '.cjs'],
    priority: 10,
  },
  {
    language: 'typescript',
    patterns: [
      /interface\s+\w+\s*\{/,
      /type\s+\w+\s*=/,
      /enum\s+\w+\s*\{/,
      /<\w+>/,
      /:\s*\w+/, // Type annotations
    ],
    extensions: ['.ts', '.tsx'],
    priority: 10,
  },
  {
    language: 'python',
    patterns: [
      /def\s+\w+\s*\(/,
      /class\s+\w+\s*:/,
      /import\s+\w+/,
      /from\s+\w+\s+import/,
      /lambda\s*:/,
      /self\./,
      /print\s*\(/,
    ],
    extensions: ['.py', '.pyw', '.pyi'],
    priority: 10,
  },
  {
    language: 'java',
    patterns: [
      /public\s+class\s+\w+\s*\{/,
      /import\s+\w+\.\w+/,
      /System\.out\.println/,
      /public\s+static\s+void\s+main/,
    ],
    extensions: ['.java'],
    priority: 10,
  },
  {
    language: 'csharp',
    patterns: [
      /using\s+\w+/,
      /namespace\s+\w+\s*\{/,
      /public\s+class\s+\w+\s*\{/,
      /Console\.WriteLine/,
    ],
    extensions: ['.cs'],
    priority: 10,
  },
  {
    language: 'go',
    patterns: [
      /package\s+\w+/,
      /import\s*\(/,
      /func\s+\w+\s*\(/,
      /:=/,
      /chan\s+\w+/,
      /goroutine/,
    ],
    extensions: ['.go'],
    priority: 10,
  },
  {
    language: 'rust',
    patterns: [
      /fn\s+\w+\s*\(/,
      /impl\s+\w+\s*\{/,
      /let\s+\w+\s*=/,
      /pub\s+fn/,
      /->/,
      /:==/,
    ],
    extensions: ['.rs'],
    priority: 10,
  },
  {
    language: 'ruby',
    patterns: [
      /def\s+\w+\s*$/,
      /end$/,
      /class\s+\w+\s*$/,
      /do\s*\|/,
      /\.each\s*do/,
    ],
    extensions: ['.rb', '.ruby'],
    priority: 10,
  },
  {
    language: 'php',
    patterns: [
      /<\?php/,
      /function\s+\w+\s*\(/,
      /echo\s+/,
      /\$\w+/,
      /class\s+\w+\s*\{/,
    ],
    extensions: ['.php', '.phtml'],
    priority: 10,
  },
  {
    language: 'swift',
    patterns: [
      /import\s+\w+/,
      /func\s+\w+\s*\(/,
      /class\s+\w+\s*:/,
      /var\s+\w+\s*:/,
      /let\s+\w+\s*:/,
    ],
    extensions: ['.swift'],
    priority: 10,
  },
  {
    language: 'kotlin',
    patterns: [
      /package\s+\w+/,
      /fun\s+\w+\s*\(/,
      /class\s+\w+\s*\{/,
      /val\s+\w+\s*:/,
      /var\s+\w+\s*:/,
    ],
    extensions: ['.kt', '.kts'],
    priority: 10,
  },
  {
    language: 'html',
    patterns: [
      /<[a-zA-Z][^>]*>/,
      /<\/[a-zA-Z][^>]*>/,
      /<!DOCTYPE/,
      /<!--/,
    ],
    extensions: ['.html', '.htm', '.xhtml'],
    priority: 10,
  },
  {
    language: 'css',
    patterns: [
      /\w+\s*\{/,
      /\w+\s*:/,
      /\.[a-zA-Z][^\s{]*\s*\{/,
      /@media/,
      /@keyframes/,
    ],
    extensions: ['.css', '.scss', '.sass', '.less'],
    priority: 10,
  },
];

/**
 * Detect language from source code
 */
export function detectLanguage(source: string, filename?: string): { language: string; confidence: number }[] {
  const results: { language: string; confidence: number }[] = [];
  
  // Check filename extension first
  if (filename) {
    const ext = filename.split('.').pop()?.toLowerCase();
    if (ext) {
      for (const pattern of LANGUAGE_PATTERNS) {
        if (pattern.extensions.some(e => e === `.${ext}` || e === ext)) {
          results.push({ language: pattern.language, confidence: 0.9 });
        }
      }
    }
  }
  
  // Check source content patterns
  for (const pattern of LANGUAGE_PATTERNS) {
    let confidence = 0;
    
    for (const regex of pattern.patterns) {
      if (regex.test(source)) {
        confidence += 0.1;
      }
    }
    
    // Normalize confidence
    confidence = Math.min(confidence, 0.8);
    
    if (confidence > 0) {
      // Avoid duplicates
      if (!results.some(r => r.language === pattern.language)) {
        results.push({ language: pattern.language, confidence });
      }
    }
  }
  
  // Sort by confidence
  results.sort((a, b) => b.confidence - a.confidence);
  
  return results;
}

// ============================================================================
// Dynamic Parser Improvements
// ============================================================================

/**
 * Improved parser generation using LLM with better prompts
 */
export function createImprovedParserFromSamples(
  languageName: string,
  _samples: string[],
  existingSpecs?: TokenSpec[]
): Parser {
  // This would use LLM to generate a better parser based on samples
  // For now, return a basic parser
  
  const tokenSpecs = existingSpecs || JAVA_TOKEN_SPECS;
  
  return createParserFromTokenSpecs(languageName, tokenSpecs, {
    blockStart: ['{', '(', '['],
    blockEnd: ['}', ')', ']'],
  });
}

// ============================================================================
// Parser Registry
// ============================================================================

/**
 * Parser registry for easy access
 */
export class ParserRegistry {
  private parsers: Map<string, Parser> = new Map();
  private lazyParsers: Map<string, () => Parser> = new Map();
  
  constructor() {
    // Register lazy parsers
    for (const [name, factory] of Object.entries(LANGUAGE_PARSERS)) {
      this.lazyParsers.set(name, factory);
    }
  }
  
  get(language: string): Parser | undefined {
    // Check if already instantiated
    if (this.parsers.has(language)) {
      return this.parsers.get(language);
    }
    
    // Check lazy parsers
    if (this.lazyParsers.has(language)) {
      const parser = this.lazyParsers.get(language)!();
      this.parsers.set(language, parser);
      return parser;
    }
    
    return undefined;
  }
  
  register(language: string, parser: Parser): void {
    this.parsers.set(language, parser);
  }
  
  registerLazy(language: string, factory: () => Parser): void {
    this.lazyParsers.set(language, factory);
  }
  
  list(): string[] {
    return Array.from(this.parsers.keys());
  }
  
  listAll(): string[] {
    return [...Array.from(this.parsers.keys()), ...Array.from(this.lazyParsers.keys())];
  }
  
  detect(source: string, filename?: string): string[] {
    return detectLanguage(source, filename).map(r => r.language);
  }
}

// ============================================================================
// Exports
// ============================================================================

export default ParserRegistry;
