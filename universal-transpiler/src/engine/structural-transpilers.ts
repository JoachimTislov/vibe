/**
 * Universal Transpiler - Structural Transpilers
 *
 * Deterministic, cached-by-construction structural converters for language
 * pairs that have no native transpiler. They cover a practical subset of the
 * source language and report exactly what they produced, so results are
 * reusable deterministically (same input -> same output).
 *
 * Supported pairs:
 * - rust -> go   (functions, structs, control flow, printing, basics)
 * - haskell -> javascript (module main, do-blocks, simple functions)
 */

// ============================================================================
// Rust -> Go
// ============================================================================

const RUST_TO_GO_TYPES: Record<string, string> = {
  i8: 'int8', i16: 'int16', i32: 'int32', i64: 'int64',
  u8: 'uint8', u16: 'uint16', u32: 'uint32', u64: 'uint64',
  usize: 'int', isize: 'int',
  f32: 'float32', f64: 'float64',
  bool: 'bool', str: 'string', String: 'string',
};

function mapRustType(rustType: string): string {
  let t = rustType.trim().replace(/&/g, '').replace(/&amp;/g, '').trim();
  t = t.replace(/mut\s+/g, '');
  if (RUST_TO_GO_TYPES[t]) return RUST_TO_GO_TYPES[t];
  // Vec<T> -> []T
  const vecMatch = t.match(/^Vec<(.+)>$/);
  if (vecMatch) return `[]${mapRustType(vecMatch[1])}`;
  // Option<T> -> *T (nil-able)
  const optMatch = t.match(/^Option<(.+)>$/);
  if (optMatch) return `*${mapRustType(optMatch[1])}`;
  return t; // custom types pass through
}

function mapRustParam(param: string): string {
  // "name: Type" or "mut name: Type"
  const m = param.match(/^(?:mut\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.+)$/);
  if (!m) return param;
  return `${m[1]} ${mapRustType(m[2])}`;
}

/** Split a println!/print! macro invocation into format string + args. */
function parseRustPrint(line: string): { fmt: string; args: string[] } | null {
  const m = line.match(/^\s*(println|print|eprintln|eprint)!\s*\((.*)\)\s*;?\s*$/);
  if (!m) return null;
  const inner = m[2].trim();
  // Split args at top level (respect quotes, parens, angle brackets)
  const args: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let current = '';
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (quote) {
      current += ch;
      if (ch === quote && inner[i - 1] !== '\\') quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      current += ch;
      continue;
    }
    if (ch === '(' || ch === '[' || ch === '{') depth++;
    if (ch === ')' || ch === ']' || ch === '}') depth--;
    if (ch === ',' && depth === 0) {
      args.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  if (current.trim()) args.push(current.trim());
  return { fmt: m[1], args };
}

/** Convert Rust raw string literals (r#"..."# / r"...") to Go strings. */
function convertRustRawStrings(text: string): string {
  const escape = (content: string) =>
    content
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\n')
      .replace(/\t/g, '\\t');

  // r#"content"# (single-hash form, the common one)
  let result = text.replace(/r#"([\s\S]*?)"#/g, (_all: string, content: string) => `"${escape(content)}"`);
  // r"content" (unhashed form; no escapes allowed inside in Rust)
  result = result.replace(/\br"([^"\n]*)"/g, (_all: string, content: string) => `"${escape(content)}"`);
  return result;
}

/** Convert a println!("...{}...", args) to Go. */
function rustPrintToGo(line: string): string | null {
  const parsed = parseRustPrint(line);
  if (!parsed) return null;
  const { fmt, args } = parsed;
  const target = fmt.startsWith('e') ? 'fmt.Fprintln(os.Stderr' : 'fmt.Println(';
  const needsOs = fmt.startsWith('e');

  if (args.length === 0) {
    // println!() with no arguments prints an empty line
    return needsOs ? `${target})` : 'fmt.Println()';
  }
  const fmtStr = args[0];
  const rest = args.slice(1);

  const hasPlaceholders = /\{\s*\}/.test(fmtStr);
  if (!hasPlaceholders) {
    // constant string(s) - join them all
    const all = args.join(' + ');
    return needsOs ? `${target}, ${all})` : `fmt.Println(${all})`;
  }

  if (rest.length === 0) return null;
  if (rest.length === 1) {
    return needsOs ? `${target}, ${rest[0]})` : `fmt.Println(${rest[0]})`;
  }
  // Multiple args: Println joins with spaces, matching {} {} formatting
  return needsOs ? `${target}, ${rest.join(', ')})` : `fmt.Println(${rest.join(', ')})`;
}

export interface StructuralTranspileResult {
  code: string;
  /** Which constructs were converted */
  converted: string[];
  /** Constructs the transpiler did not understand (left as comments) */
  unsupported: string[];
}

/** Deterministic Rust -> Go structural transpiler (practical subset). */
export function rustToGo(source: string): StructuralTranspileResult {
  const lines = source.split('\n');
  const out: string[] = [];
  const converted: string[] = [];
  const unsupported: string[] = [];
  let needsFmt = false;
  let needsOs = false;

  // Depth-based context tracking: every emitted line contributes its net
  // brace delta to `depth`. Struct fields convert only while a struct is
  // the innermost open context; everything else inside functions passes
  // through untouched.
  let depth = 0;
  const contextStack: Array<{ kind: 'fn' | 'struct'; depth: number }> = [];

  const pushContext = (kind: 'fn' | 'struct') => {
    contextStack.push({ kind, depth });
    depth += 1; // the emitted line opens one block
  };
  const innermost = () =>
    contextStack.length > 0 ? contextStack[contextStack.length - 1].kind : null;
  const netBraces = (text: string) =>
    (text.match(/{/g) || []).length - (text.match(/}/g) || []).length;

  for (const raw of lines) {
    let line = raw;
    const trimmed = line.trim();
    const indent = /^\s/.test(line) ? (line.match(/^\s*/) || [''])[0] : '';

    // Comments pass through
    if (trimmed.startsWith('//')) {
      out.push(line);
      continue;
    }

    // Raw string literals r#"..."# (and r"...") become escaped Go strings
    line = convertRustRawStrings(line);

    // Attribute macros (#[...]) - emit as comments
    if (trimmed.startsWith('#[')) {
      out.push(`${indent}// ${trimmed}`);
      continue;
    }

    // use statements: Go imports are emitted in the header; drop rust use lines
    if (/^use\s+/.test(trimmed)) {
      converted.push('use-statement');
      continue;
    }

    // fn main
    if (/^fn\s+main\s*\(\s*\)\s*\{?$/.test(trimmed)) {
      out.push('func main() {');
      pushContext('fn');
      converted.push('fn-main');
      continue;
    }

    // generic fn with optional return type
    const fnMatch = trimmed.match(/^fn\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*)\)\s*(?:->\s*([^{]+))?\s*\{?$/);
    if (fnMatch) {
      const name = fnMatch[1];
      const params = fnMatch[2].trim()
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean)
        .map(mapRustParam)
        .join(', ');
      const ret = fnMatch[3] ? mapRustType(fnMatch[3]) : '';
      out.push(`func ${name}(${params})${ret ? ` ${ret}` : ''} {`);
      pushContext('fn');
      converted.push('fn');
      continue;
    }

    // struct
    const structMatch = trimmed.match(/^struct\s+([A-Za-z_][A-Za-z0-9_]*)\s*\{?$/);
    if (structMatch) {
      out.push(`type ${structMatch[1]} struct {`);
      pushContext('struct');
      converted.push('struct');
      continue;
    }

    // struct field: "name: Type," - only inside a struct context
    const fieldMatch = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*([A-Za-z0-9_<>.\[\]&\s]+),?\s*$/);
    if (fieldMatch && innermost() === 'struct') {
      out.push(`\t${fieldMatch[1]} ${mapRustType(fieldMatch[2])}`);
      converted.push('struct-field');
      continue;
    }

    // println family
    if (/^\s*(println|print|eprintln|eprint)!/.test(line)) {
      const go = rustPrintToGo(line);
      if (go) {
        if (go.includes('os.Stderr')) needsOs = true;
        if (go.includes('fmt.')) needsFmt = true;
        out.push(`${indent}${go}`);
        converted.push('println');
        continue;
      }
    }

    // let / let mut with initializer
    const letMatch = trimmed.match(/^let\s+(mut\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*(?::\s*[^=]+)?=\s*(.+);?$/);
    if (letMatch) {
      const isMut = !!letMatch[1];
      const name = letMatch[2];
      const value = letMatch[3].replace(/;$/, '');
      if (isMut) {
        out.push(`${indent}var ${name} = ${value}`);
      } else {
        out.push(`${indent}${name} := ${value}`);
      }
      converted.push('let');
      continue;
    }

    // let x: T; declarations
    const declMatch = trimmed.match(/^let\s+(mut\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*:\s*([^=]+);?$/);
    if (declMatch) {
      const name = declMatch[2];
      const type = mapRustType(declMatch[3]);
      out.push(`${indent}var ${name} ${type}`);
      converted.push('let-decl');
      continue;
    }

    // for i in a..b { -> for i := a; i < b; i++ {
    const forRangeMatch = trimmed.match(/^for\s+([A-Za-z_][A-Za-z0-9_]*)\s+in\s+([^\s]+)\s*\.\.\s*([^{]+?)\s*\{?$/);
    if (forRangeMatch) {
      const v = forRangeMatch[1];
      out.push(`for ${v} := ${forRangeMatch[2]}; ${v} < ${forRangeMatch[3].trim()}; ${v}++ {`);
      depth += 1;
      converted.push('for-range');
      continue;
    }

    // while cond { -> for cond {
    if (/^while\s+/.test(trimmed)) {
      out.push(`${indent}for ${trimmed.replace(/^while\s+/, '')}`);
      depth += 1;
      converted.push('while');
      continue;
    }

    // loop { -> for {
    if (/^loop\s*\{?$/.test(trimmed)) {
      out.push(`${indent}for {`);
      depth += 1;
      converted.push('loop');
      continue;
    }

    // match expressions - unsupported in the subset
    if (/^match\s+/.test(trimmed)) {
      unsupported.push('match-expression');
      out.push(`${indent}// [unsupported: match] ${trimmed}`);
      continue;
    }

    // impl blocks - unsupported; contents must be handled manually
    if (/^impl\b/.test(trimmed)) {
      unsupported.push('impl-block');
      out.push(`${indent}// [unsupported: impl] ${trimmed}`);
      continue;
    }

    // closing brace: pops the innermost context when back at its depth
    if (trimmed === '}') {
      depth -= 1;
      if (contextStack.length > 0 && depth === contextStack[contextStack.length - 1].depth) {
        contextStack.pop();
      }
      out.push(line);
      continue;
    }

    // empty lines
    if (trimmed === '') {
      out.push('');
      continue;
    }

    // Bare expression statements (Rust implicit returns) inside functions
    // cannot pass through to Go; mark them instead of emitting invalid code.
    if (
      innermost() === 'fn' &&
      !/[=;{}]\s*$/.test(trimmed) &&
      !/^(return|break|continue|if|else|for|while|defer|go)\b/.test(trimmed) &&
      !/\(.*\)\s*;?\s*$/.test(trimmed)
    ) {
      unsupported.push(`implicit-return: ${trimmed}`);
      out.push(`${indent}// [unsupported: bare expression] ${trimmed}`);
      continue;
    }

    // Everything else passes through (if/else and assignments are shared syntax)
    out.push(line);
    depth += netBraces(line);
  }

  // Build the final file with a header
  const imports: string[] = [];
  if (needsFmt) imports.push('"fmt"');
  if (needsOs) imports.push('"os"');

  const header = ['package main', ''];
  if (imports.length > 0) {
    header.push('import (');
    for (const imp of imports) header.push(`\t${imp}`);
    header.push(')');
    header.push('');
  }

  // Leak scan: any Rust-ism that survived conversion is reported, never
  // silently emitted as if it were valid Go.
  const rustIsms = /!\(|r#"|\blet\s|\bfn\s|->|&str|\bmut\b|::</;
  for (const emitted of out) {
    const m = emitted.match(rustIsms);
    if (m) {
      unsupported.push(`unconverted rust syntax "${m[0]}" in: ${emitted.trim().slice(0, 60)}`);
    }
  }

  return {
    code: [...header, ...out].join('\n'),
    converted: Array.from(new Set(converted)),
    unsupported: Array.from(new Set(unsupported)),
  };
}

// ============================================================================
// Haskell -> JavaScript
// ============================================================================

/** Deterministic Haskell -> JavaScript structural transpiler (basic subset). */
export function haskellToJavaScript(source: string): StructuralTranspileResult {
  const lines = source.split('\n');
  const out: string[] = [];
  const converted: string[] = [];
  const unsupported: string[] = [];
  let inDoBlock = false;

  for (const line of lines) {
    const trimmed = line.trim();
    const indent = line.slice(0, line.length - line.trimStart().length);

    // module declaration - dropped
    if (/^module\s+/.test(trimmed) && trimmed.includes('where')) {
      converted.push('module-decl');
      continue;
    }

    // imports dropped (JS globals assumed)
    if (/^import\s+/.test(trimmed)) {
      converted.push('import-dropped');
      continue;
    }

    // comments
    if (trimmed.startsWith('--')) {
      out.push(`${indent}// ${trimmed.replace(/^--\s*/, '')}`);
      converted.push('comment');
      continue;
    }

    // main = do  /  main :: IO () \n main = do
    const mainDoMatch = trimmed.match(/^main\s*=\s*do\s*$/);
    const mainExprMatch = trimmed.match(/^main\s*=\s*(.+)$/);
    const mainSig = /^main\s*::/.test(trimmed);

    if (mainSig) {
      converted.push('main-signature-dropped');
      continue;
    }
    if (mainDoMatch) {
      out.push('async function main() {');
      inDoBlock = true;
      converted.push('main-do');
      continue;
    }
    if (mainExprMatch) {
      const expr = mainExprMatch[1];
      out.push(`async function main() {`);
      out.push(`  ${haskellExprToJs(expr)};`);
      out.push(`}`);
      converted.push('main-expr');
      continue;
    }

    // inside a do-block
    if (inDoBlock && trimmed.length > 0) {
      // putStrLn "str" -> console.log("str")
      const putStrLn = trimmed.match(/^putStrLn\s+(.+)$/);
      if (putStrLn) {
        const expr = haskellExprToJs(putStrLn[1]);
        if (hasResidualHaskellSyntax(expr)) {
          unsupported.push(`do-line (putStrLn): ${trimmed}`);
          out.push(`  // [unsupported] ${trimmed}`);
        } else {
          out.push(`  console.log(${expr});`);
          converted.push('putStrLn');
        }
        continue;
      }
      const putStr = trimmed.match(/^putStr\s+(.+)$/);
      if (putStr) {
        const expr = haskellExprToJs(putStr[1]);
        if (hasResidualHaskellSyntax(expr)) {
          unsupported.push(`do-line (putStr): ${trimmed}`);
          out.push(`  // [unsupported] ${trimmed}`);
        } else {
          out.push(`  process.stdout.write(String(${expr}));`);
          converted.push('putStr');
        }
        continue;
      }

      // let x = expr
      const letMatch = trimmed.match(/^let\s+([A-Za-z_][A-Za-z0-9_']*)\s*=\s*(.+)$/);
      if (letMatch) {
        out.push(`  const ${letMatch[1].replace(/'/g, '_')} = ${haskellExprToJs(letMatch[2])};`);
        converted.push('let-binding');
        continue;
      }

      // return expr
      const returnMatch = trimmed.match(/^return\s+(.+)$/);
      if (returnMatch) {
        out.push(`  return ${haskellExprToJs(returnMatch[1])};`);
        converted.push('return');
        continue;
      }

      // function call statement
      if (/^[a-z][A-Za-z0-9_']*\s+/.test(trimmed) || /^[a-z][A-Za-z0-9_']*$/.test(trimmed)) {
        const expr = haskellExprToJs(trimmed);
        if (hasResidualHaskellSyntax(expr)) {
          unsupported.push(`do-line: ${trimmed}`);
          out.push(`  // [unsupported] ${trimmed}`);
        } else {
          out.push(`  await ${expr};`);
          converted.push('call-statement');
        }
        continue;
      }

      unsupported.push(`do-line: ${trimmed}`);
      out.push(`  // [unsupported] ${trimmed}`);
      continue;
    }

    // top-level function: name args = body
    const fnMatch = trimmed.match(/^([a-z][A-Za-z0-9_']*)\s+([A-Za-z0-9_'\s]*)=\s*(.+)$/);
    if (fnMatch) {
      const fname = fnMatch[1].replace(/'/g, '_');
      const args = fnMatch[2].trim().split(/\s+/).filter(Boolean).map((a) => a.replace(/'/g, '_'));
      const body = haskellExprToJs(fnMatch[3]);
      out.push(`function ${fname}(${args.join(', ')}) {`);
      out.push(`  return ${body};`);
      out.push(`}`);
      converted.push('function');
      continue;
    }

    // type signatures dropped
    if (/^[a-z][A-Za-z0-9_']*\s*::/.test(trimmed)) {
      converted.push('type-signature-dropped');
      continue;
    }

    if (trimmed === '') {
      out.push('');
      continue;
    }

    unsupported.push(`line: ${trimmed}`);
    out.push(`// [unsupported] ${line}`);
  }

  // Close an unterminated do-block (Haskell blocks end at EOF, not at a brace)
  if (inDoBlock) {
    out.push('}');
    inDoBlock = false;
  }

  // Call main() if defined
  if (out.some((l) => l.startsWith('async function main()'))) {
    out.push('', 'main().catch((e) => { console.error(e); process.exit(1); });');
  }

  return {
    code: out.join('\n'),
    converted: Array.from(new Set(converted)),
    unsupported: Array.from(new Set(unsupported)),
  };
}

/** True when the converted expression still contains Haskell-only syntax. */
function hasResidualHaskellSyntax(expr: string): boolean {
  return /\$|\bshow\b|::|\s->\s|\|\s*\w+\s*==/.test(expr);
}

/** Convert a Haskell expression to a JS expression (best-effort subset). */
function haskellExprToJs(expr: string): string {
  let e = expr.trim();

  // Haskell list/string concatenation (++) becomes JS +
  e = e.replace(/\+\+/g, '+');

  // String literal
  const strMatch = e.match(/^"(.*)"$/);
  if (strMatch) return `"${strMatch[1]}"`;

  // Char literal
  const charMatch = e.match(/^'(.+)'$/);
  if (charMatch) return charMatch[1];

  // show x -> String(x)
  const showMatch = e.match(/^show\s+(.+)$/);
  if (showMatch) return `String(${haskellExprToJs(showMatch[1])})`;

  // numeric literals with :: annotations (5 :: Int)
  e = e.replace(/(\d+)\s*::\s*[A-Za-z][A-Za-z0-9_]*/g, '$1');

  // Integer division and modulo
  e = e.replace(/\bdiv\b/g, '/').replace(/\bmod\b/g, '%');

  // Infix operators are mostly shared: + - * / ==
  // Function application: f x y -> f(x, y). Only when every argument
  // starts with an atom (identifier/number/literal/paren) - never for
  // infix operator tails like "x * 2".
  const appMatch = e.match(/^([a-z][A-Za-z0-9_']*)\s+([A-Za-z0-9_"(].*)$/);
  if (appMatch && !['if', 'then', 'else', 'let', 'in', 'case', 'of'].includes(appMatch[1])) {
    const args = appMatch[2].split(/\s+/).map(haskellExprToJs);
    return `${appMatch[1].replace(/'/g, '_')}(${args.join(', ')})`;
  }

  // if a then b else c -> (a ? b : c)
  const ifMatch = e.match(/^if\s+(.+?)\s+then\s+(.+?)\s+else\s+(.+)$/);
  if (ifMatch) {
    return `(${haskellExprToJs(ifMatch[1])} ? ${haskellExprToJs(ifMatch[2])} : ${haskellExprToJs(ifMatch[3])})`;
  }

  return e;
}
