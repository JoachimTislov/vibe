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
 * - python -> javascript (print, def, control flow, f-strings, basics)
 * - javascript/typescript -> python (console.log, function/arrow defs,
 *   if/elif/else, for-range/for-of/for-in, while, template literals ->
 *   f-strings, let/const/var, booleans/null, and/or/not, .length -> len(),
 *   object literals -> dicts, comments, returns)
 * - go -> java (package main, functions, var/short declarations, type
 *   mapping, fmt.Println space-joined printing, if/else, c-style for /
 *   for-cond / for-range, comments; goroutines, channels, defer, structs,
 *   interfaces, multiple returns, slice/map literals and closures are
 *   flagged as comments, never leaked as live Java)
 *
 * TypeScript input is lowered to JavaScript first by the native TS->JS step
 * (typescript compiler API) in the transpile matrix; jsToPython then runs
 * on the JavaScript.
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

// ============================================================================
// Python -> JavaScript
// ============================================================================

/**
 * Deterministic Python -> JavaScript structural transpiler (practical
 * subset): print, def, if/elif/else, for-range, for-in, while,
 * assignments, f-strings, comments, True/False/None, and/or/not, len,
 // arithmetic and comparisons. Indentation-based blocks become braces.
 */
export function pythonToJavaScript(source: string): StructuralTranspileResult {
  const rawLines = source.split('\n');
  const out: string[] = [];
  const converted: string[] = [];
  const unsupported: string[] = [];

  // Indent stack: each entry is the indent column that opened a block
  const indentStack: number[] = [];
  let pendingBlockOpener = false; // previous logical line ended with ':'

  const closeBlocks = (downTo: number): void => {
    while (indentStack.length > 0 && indentStack[indentStack.length - 1] >= downTo) {
      indentStack.pop();
      out.push('}');
    }
  };

  const mapExpr = (expr: string): string => {
    let e = expr.trim();
    // f-strings -> template literals
    const fstr = e.match(/^f"([^"]*)"$/);
    if (fstr) return `\`${fstr[1].replace(/\{/g, '${').replace(/\}/g, '')}\``;
    // Booleans / None
    e = e.replace(/\bTrue\b/g, 'true').replace(/\bFalse\b/g, 'false').replace(/\bNone\b/g, 'null');
    // and/or/not
    e = e.replace(/\band\b/g, '&&').replace(/\bor\b/g, '||').replace(/\bnot\s+/g, '!');
    // len(x) -> (x).length, only for simple arguments
    e = e.replace(/\blen\(([^()]+)\)/g, '($1).length');
    // string multiplication is unsupported
    if (/\*\s*["']/.test(e) || /["']\s*\*\s*\d/.test(e)) {
      unsupported.push(`string-multiplication: ${e}`);
    }
    return e;
  };

  for (const raw of rawLines) {
    // Blank lines and comments pass through
    if (raw.trim() === '') {
      out.push('');
      continue;
    }
    if (raw.trim().startsWith('#')) {
      out.push(raw.replace(/^\s*#/, (m) => m.replace('#', '//')));
      continue;
    }

    const indent = raw.length - raw.trimStart().length;
    const trimmed = raw.trim();
    const pad = ' '.repeat(indent);

    // Block openers end with ':'
    const isOpener = trimmed.endsWith(':');
    const head = isOpener ? trimmed.slice(0, -1).trim() : trimmed;

    // The __main__ guard: emit nothing (the condition is always true at
    // top level in the generated script); its body (main()) becomes a plain
    // top-level statement. Closing still applies: the guard sits at its own
    // indent, so any open block above ends here.
    if (trimmed === 'if __name__ == "__main__":' || trimmed === "if __name__ == '__main__':") {
      closeBlocks(indent);
      converted.push('main-guard');
      continue;
    }

    // elif / else continue the open if-construct at the same indent —
    // they must not trigger block closing.
    const elifMatch = head.match(/^elif\s+(.+)$/);
    if (elifMatch) {
      out.push(`${pad}} else if (${mapExpr(elifMatch[1])}) {`);
      converted.push('elif');
      continue;
    }
    if (head === 'else') {
      out.push(`${pad}} else {`);
      converted.push('else');
      continue;
    }

    // Any other line: close blocks whose indentation ended (a block ends
    // when indentation returns to the opener's own column or above it).
    closeBlocks(indent);

    // def f(args): -> function f(args) {
    const defMatch = head.match(/^def\s+([A-Za-z_][A-Za-z0-9_]*)\s*\((.*)\)$/);
    if (defMatch) {
      out.push(`${pad}function ${defMatch[1]}(${defMatch[2]}) {`);
      indentStack.push(indent);
      pendingBlockOpener = false;
      converted.push('def');
      continue;
    }

    // if / elif / else
    const ifMatch = head.match(/^if\s+(.+)$/);
    if (ifMatch) {
      out.push(`${pad}if (${mapExpr(ifMatch[1])}) {`);
      indentStack.push(indent);
      pendingBlockOpener = false;
      converted.push('if');
      continue;
    }
    // for i in range(n): / range(a, b) / range(a, b, step)
    const forRange = head.match(/^for\s+([A-Za-z_][A-Za-z0-9_]*)\s+in\s+range\((.+)\)$/);
    if (forRange) {
      const parts = forRange[2].split(',').map((p) => mapExpr(p.trim()));
      const v = forRange[1];
      if (parts.length === 1) {
        out.push(`${pad}for (let ${v} = 0; ${v} < ${parts[0]}; ${v}++) {`);
      } else if (parts.length === 2) {
        out.push(`${pad}for (let ${v} = ${parts[0]}; ${v} < ${parts[1]}; ${v}++) {`);
      } else {
        out.push(`${pad}for (let ${v} = ${parts[0]}; ${v} < ${parts[1]}; ${v} += ${parts[2]}) {`);
      }
      indentStack.push(indent);
      pendingBlockOpener = false;
      converted.push('for-range');
      continue;
    }

    // for x in list:
    const forIn = head.match(/^for\s+([A-Za-z_][A-Za-z0-9_]*)\s+in\s+(.+)$/);
    if (forIn) {
      out.push(`${pad}for (const ${forIn[1]} of ${mapExpr(forIn[2])}) {`);
      indentStack.push(indent);
      pendingBlockOpener = false;
      converted.push('for-in');
      continue;
    }

    // while cond:
    const whileMatch = head.match(/^while\s+(.+)$/);
    if (whileMatch) {
      out.push(`${pad}while (${mapExpr(whileMatch[1])}) {`);
      indentStack.push(indent);
      pendingBlockOpener = false;
      converted.push('while');
      continue;
    }

    // print(...)
    const printMatch = head.match(/^print\((.*)\)$/);
    if (printMatch) {
      const args = printMatch[1].split(/,(?![^(]*\))/).map((a) => mapExpr(a));
      out.push(`${pad}console.log(${args.join(', ')});`);
      converted.push('print');
      continue;
    }

    // Class definitions / imports / comprehensions / try-except: unsupported
    if (/^(class|import|from|try|except|finally|with|lambda|async|yield)\b/.test(head)) {
      unsupported.push(`python-construct: ${trimmed}`);
      out.push(`${pad}// [unsupported] ${trimmed}`);
      continue;
    }
    if (/\[[^\]]*\bfor\b[^\]]*\]/.test(head)) {
      unsupported.push(`list-comprehension: ${trimmed}`);
      out.push(`${pad}// [unsupported] ${trimmed}`);
      continue;
    }

    // Everything else (assignments, calls, returns, expressions) passes
    // through with expression mapping
    const mapped = head
      .split(/("[^"]*"|'[^']*')/) // keep string literals intact
      .map((seg) => (seg.startsWith('"') || seg.startsWith("'") ? seg : mapExpr(seg).replace(/;$/, '')))
      .join('');
    out.push(`${pad}${mapped};`.replace(/;;$/, ';'));
    if (/\/\*|\*\//.test(head)) unsupported.push(`comment-like: ${trimmed}`);

    // A non-opener line inside a pending block means the block was empty
    if (pendingBlockOpener) pendingBlockOpener = false;
  }

  // Close any remaining blocks at EOF
  closeBlocks(-1);

  // If a main() function exists, call it (python convention)
  if (out.some((l) => /^\s*function main\(/.test(l)) && !out.some((l) => /^\s*main\(\);/.test(l))) {
    out.push('', 'main();');
  }

  return {
    code: out.join('\n'),
    converted: Array.from(new Set(converted)),
    unsupported: Array.from(new Set(unsupported)),
  };
}

// ============================================================================
// JavaScript/TypeScript -> Python
// ============================================================================

/** Flag collector shared by the expression-conversion helpers. */
interface JsPyContext {
  converted: string[];
  unsupported: string[];
}

/** Split an expression into code / string-literal / template-literal parts. */
function tokenizeJs(expr: string): Array<{ kind: 'code' | 'str' | 'tpl'; text: string }> {
  const segs: Array<{ kind: 'code' | 'str' | 'tpl'; text: string }> = [];
  let code = '';
  let i = 0;
  while (i < expr.length) {
    const ch = expr[i];
    if (ch === '"' || ch === "'") {
      let j = i + 1;
      while (j < expr.length) {
        if (expr[j] === '\\') {
          j += 2;
          continue;
        }
        if (expr[j] === ch) {
          j++;
          break;
        }
        j++;
      }
      if (code) {
        segs.push({ kind: 'code', text: code });
        code = '';
      }
      segs.push({ kind: 'str', text: expr.slice(i, j) });
      i = j;
      continue;
    }
    if (ch === '`') {
      let j = i + 1;
      while (j < expr.length) {
        if (expr[j] === '\\') {
          j += 2;
          continue;
        }
        if (expr[j] === '`') {
          j++;
          break;
        }
        if (expr[j] === '$' && expr[j + 1] === '{') {
          let depth = 1;
          j += 2;
          while (j < expr.length && depth > 0) {
            if (expr[j] === '{') depth++;
            else if (expr[j] === '}') {
              depth--;
              if (depth === 0) {
                j++;
                break;
              }
            }
            j++;
          }
          continue;
        }
        j++;
      }
      if (code) {
        segs.push({ kind: 'code', text: code });
        code = '';
      }
      segs.push({ kind: 'tpl', text: expr.slice(i, j) });
      i = j;
      continue;
    }
    code += ch;
    i++;
  }
  if (code) segs.push({ kind: 'code', text: code });
  return segs;
}

/** Split at a separator character, ignoring strings and nested brackets. */
function splitTopLevel(text: string, sep: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let current = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      current += ch;
      if (ch === '\\') {
        current += text[i + 1] || '';
        i++;
        continue;
      }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch;
      current += ch;
      continue;
    }
    if (ch === '(' || ch === '[' || ch === '{') depth++;
    else if (ch === ')' || ch === ']' || ch === '}') depth--;
    if (ch === sep && depth === 0) {
      parts.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

/** Net brace delta of a line, ignoring braces inside strings. */
function netBraces(text: string): number {
  let depth = 0;
  let quote: string | null = null;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      if (ch === '\\') {
        i++;
        continue;
      }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch;
      continue;
    }
    if (ch === '{') depth++;
    else if (ch === '}') depth--;
  }
  return depth;
}

/** When text is exactly one balanced {...} (or [...]) group, return its inside. */
function balancedInner(text: string, open: string, close: string): string | null {
  if (!text.startsWith(open) || !text.endsWith(close)) return null;
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === open) depth++;
    else if (text[i] === close) {
      depth--;
      if (depth === 0) return i === text.length - 1 ? text.slice(1, -1) : null;
    }
  }
  return null;
}

/** Split a line into its code part and its trailing // comment. */
function stripLineComment(line: string): { code: string; comment: string | null } {
  let quote: string | null = null;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quote) {
      if (ch === '\\') {
        i++;
        continue;
      }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch;
      continue;
    }
    if (ch === '/' && line[i + 1] === '/') {
      return { code: line.slice(0, i).trim(), comment: line.slice(i + 2).trim() };
    }
  }
  return { code: line.trim(), comment: null };
}

/** Remove string-literal contents so leak scans do not match inside strings. */
function stripStringsForScan(line: string): string {
  let outScan = '';
  let quote: string | null = null;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quote) {
      if (ch === '\\') {
        i++;
        continue;
      }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    outScan += ch;
  }
  return outScan;
}

/** True when the code has a top-level ternary `?` (not `?.` / `??`). */
function hasTopLevelQuestion(code: string): boolean {
  let depth = 0;
  for (let i = 0; i < code.length; i++) {
    const ch = code[i];
    if ('([{'.includes(ch)) depth++;
    else if (')]}'.includes(ch)) depth--;
    else if (
      ch === '?' &&
      depth === 0 &&
      code[i + 1] !== '.' &&
      code[i + 1] !== '?' &&
      code[i - 1] !== '?'
    ) {
      return true;
    }
  }
  return false;
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Convert a single top-level ternary; null when there is none. */
function convertTernary(code: string, ctx: JsPyContext): string | null {
  let depth = 0;
  let qPos = -1;
  for (let i = 0; i < code.length; i++) {
    const ch = code[i];
    if ('([{'.includes(ch)) depth++;
    else if (')]}'.includes(ch)) depth--;
    else if (
      ch === '?' &&
      depth === 0 &&
      code[i + 1] !== '.' &&
      code[i + 1] !== '?' &&
      code[i - 1] !== '?'
    ) {
      qPos = i;
      break;
    }
  }
  if (qPos < 0) return null;

  let cPos = -1;
  depth = 0;
  for (let i = qPos + 1; i < code.length; i++) {
    const ch = code[i];
    if ('([{'.includes(ch)) depth++;
    else if (')]}'.includes(ch)) depth--;
    else if (ch === ':' && depth === 0) {
      cPos = i;
      break;
    }
  }
  if (cPos < 0) {
    ctx.unsupported.push(`ternary: ${code.trim().slice(0, 50)}`);
    return null;
  }

  const cond = code.slice(0, qPos).trim();
  const a = code.slice(qPos + 1, cPos).trim();
  const b = code.slice(cPos + 1).trim();
  if (hasTopLevelQuestion(cond) || hasTopLevelQuestion(a) || hasTopLevelQuestion(b)) {
    ctx.unsupported.push(`chained-ternary: ${code.trim().slice(0, 60)}`);
    return null;
  }
  ctx.converted.push('ternary');
  return `(${convertCode(a, ctx)} if ${convertCode(cond, ctx)} else ${convertCode(b, ctx)})`;
}

const JS_PY_KEYWORDS =
  /\b(new|this|typeof|instanceof|delete|void|await|yield|throw|function)\b/;
const JS_PY_GLOBALS =
  /\b(Math|JSON|Object|Array|Number|String|Boolean|Promise|Date|Map|Set|WeakMap|WeakSet|Symbol|globalThis|window|document|module|exports|require|process|console)\b/;

/**
 * Convert a code segment (no string/template literals inside) to Python:
 * ===/!== -> ==/!=, &&/|| -> and/or, ! -> not (parenthesized so Python
 * precedence cannot change meaning), true/false/null -> True/False/None,
 * x.length -> len(x) for simple receivers, member access -> subscripts.
 * Anything outside the subset is flagged, never silently converted.
 */
function convertCode(code: string, ctx: JsPyContext): string {
  const tern = convertTernary(code, ctx);
  if (tern !== null) return tern;

  let c = code;

  // equality and logical operators
  c = c.replace(/===/g, '==').replace(/!==/g, '!=');
  c = c.replace(/&&/g, ' and ').replace(/\|\|/g, ' or ');

  // ! -> not; !(...) keeps its parentheses, !atom becomes (not atom) so
  // `!x == y` cannot silently change meaning under Python precedence.
  if (/!(?!=)/.test(c)) {
    ctx.converted.push('not-operator');
    c = c.replace(/!(?!=)\s*(?=\()/g, 'not ');
    c = c.replace(
      /!(?!=)\s*([A-Za-z_$][\w$]*(?:\s*\([^()]*\))?(?:\s*\[[^\][]*\])*)/g,
      (_all: string, atom: string) => `(not ${atom})`
    );
    c = c.replace(/!(?!=)\s*(\d+(?:\.\d+)?)/g, (_all: string, num: string) => `(not ${num})`);
    if (/!(?!=)/.test(c)) {
      ctx.unsupported.push(`negation: ${c.trim().slice(0, 50)}`);
      c = c.replace(/!(?!=)/g, 'not ');
    }
  }

  // booleans and null
  if (/\b(true|false|null|undefined)\b/.test(c)) {
    ctx.converted.push('boolean-literals');
    c = c
      .replace(/\btrue\b/g, 'True')
      .replace(/\bfalse\b/g, 'False')
      .replace(/\bnull\b/g, 'None')
      .replace(/\bundefined\b/g, 'None');
  }

  // x.length -> len(x) for simple receivers (identifier / call / index)
  if (/\.length\b/.test(c)) {
    c = c.replace(
      /([A-Za-z_$][\w$]*(?:\s*\([^()]*\))?(?:\s*\[[^\][]*\])*)\s*\.length\b/g,
      (_all: string, base: string) => `len(${base.trim()})`
    );
    if (/\.length\b/.test(c)) {
      ctx.unsupported.push(`member-length: ${c.trim().slice(0, 50)}`);
    } else {
      ctx.converted.push('length-to-len');
    }
  }

  // constructs the subset cannot express -> flagged
  const kw = c.match(JS_PY_KEYWORDS);
  if (kw) ctx.unsupported.push(`js-keyword: ${kw[0]}`);
  const global = c.match(JS_PY_GLOBALS);
  if (global) ctx.unsupported.push(`js-global: ${global[0]}`);
  if (c.includes('...')) ctx.unsupported.push(`spread: ${c.trim().slice(0, 50)}`);
  if (c.includes('=>')) ctx.unsupported.push(`arrow-function: ${c.trim().slice(0, 50)}`);
  if (/\+\+/.test(c)) ctx.unsupported.push(`increment-in-expression: ${c.trim().slice(0, 50)}`);
  if (/\?\?|\?\./.test(c)) {
    ctx.unsupported.push(`nullish/optional-chaining: ${c.trim().slice(0, 50)}`);
  }
  const method = c.match(/\.\s*[A-Za-z_$][\w$]*\s*\(/);
  if (method) ctx.unsupported.push(`js-method-call: ${method[0]}`);
  if (/[{}]/.test(c)) ctx.unsupported.push(`inline object/block literal: ${c.trim().slice(0, 50)}`);
  if (c.includes(';')) ctx.unsupported.push(`multiple-statements: ${c.trim().slice(0, 50)}`);

  // remaining member access -> subscript (dict-style access)
  if (/\.\s*[A-Za-z_$]/.test(c)) {
    ctx.converted.push('member-access');
    c = c.replace(/\.\s*([A-Za-z_$][\w$]*)/g, (_all: string, name: string) => `["${name}"]`);
  }

  return c;
}

/** Convert a template literal to a Python f-string (or plain string). */
function convertTemplate(raw: string, ctx: JsPyContext): string {
  const body = raw.slice(1, -1);
  const parts: Array<{ kind: 'lit' | 'expr'; text: string }> = [];
  let lit = '';
  let i = 0;
  while (i < body.length) {
    const ch = body[i];
    if (ch === '\\') {
      lit += body.slice(i, i + 2);
      i += 2;
      continue;
    }
    if (ch === '$' && body[i + 1] === '{') {
      let depth = 1;
      let j = i + 2;
      while (j < body.length && depth > 0) {
        if (body[j] === '{') depth++;
        else if (body[j] === '}') {
          depth--;
          if (depth === 0) {
            j++;
            break;
          }
        }
        j++;
      }
      parts.push({ kind: 'lit', text: lit });
      lit = '';
      parts.push({ kind: 'expr', text: body.slice(i + 2, j - 1) });
      i = j;
      continue;
    }
    lit += ch;
    i++;
  }
  parts.push({ kind: 'lit', text: lit });

  const literalText = parts.filter((p) => p.kind === 'lit').join('');
  if (literalText.includes('\n')) ctx.unsupported.push('multiline template literal');
  let quote = '"';
  if (literalText.includes('"')) quote = "'";
  if (literalText.includes("'")) ctx.unsupported.push(`template quote conflict: ${raw.slice(0, 40)}`);

  const hasExpr = parts.some((p) => p.kind === 'expr');
  let inner = '';
  for (const part of parts) {
    if (part.kind === 'lit') {
      inner += hasExpr ? part.text.replace(/\{/g, '{{').replace(/\}/g, '}}') : part.text;
      continue;
    }
    if (!part.text.trim()) ctx.unsupported.push('empty template interpolation');
    const conv = convertExpression(part.text, ctx);
    if (conv.includes('\\') || conv.includes(quote)) {
      ctx.unsupported.push(`template expression quotes: ${part.text.trim().slice(0, 40)}`);
    }
    inner += `{${conv}}`;
  }

  ctx.converted.push('template-literal');
  return `${hasExpr ? 'f' : ''}${quote}${inner}${quote}`;
}

/** Convert a whole expression (strings and templates stay intact). */
function convertExpression(expr: string, ctx: JsPyContext): string {
  return tokenizeJs(expr.trim())
    .map((seg) => {
      if (seg.kind === 'str') return seg.text;
      if (seg.kind === 'tpl') return convertTemplate(seg.text, ctx);
      return convertCode(seg.text, ctx);
    })
    .join('');
}

/** Convert an object literal body to a Python dict; null when unsupported. */
function convertObjectLiteral(inner: string, ctx: JsPyContext): string | null {
  const items = splitTopLevel(inner, ',').filter(Boolean);
  if (items.length === 0) return '{}';
  const parts: string[] = [];
  for (const item of items) {
    const ident = item.match(/^([A-Za-z_$][\w$]*)\s*:\s*([\s\S]+)$/);
    if (ident) {
      parts.push(`"${ident[1]}": ${convertValue(ident[2], ctx)}`);
      continue;
    }
    const strKey = item.match(/^("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')\s*:\s*([\s\S]+)$/);
    if (strKey) {
      parts.push(`${strKey[1]}: ${convertValue(strKey[2], ctx)}`);
      continue;
    }
    const shorthand = item.match(/^([A-Za-z_$][\w$]*)$/);
    if (shorthand) {
      parts.push(`"${shorthand[1]}": ${shorthand[1]}`);
      continue;
    }
    ctx.unsupported.push(`object-literal-entry: ${item.slice(0, 50)}`);
    return null;
  }
  ctx.converted.push('object-literal');
  return `{${parts.join(', ')}}`;
}

/** Convert a value position (nested object literals become dicts). */
function convertValue(value: string, ctx: JsPyContext): string {
  const v = value.trim();
  if (v.startsWith('{')) {
    const nested = balancedInner(v, '{', '}');
    if (nested !== null) {
      const dict = convertObjectLiteral(nested, ctx);
      if (dict !== null) return dict;
    }
  }
  return convertExpression(v, ctx);
}

/** Parse a parameter list; null when a parameter is outside the subset. */
function parseParams(text: string, ctx: JsPyContext): string[] | null {
  const t = text.trim();
  if (!t) return [];
  const out: string[] = [];
  for (const p of splitTopLevel(t, ',')) {
    const m = p.trim().match(/^([A-Za-z_$][\w$]*)\s*(?:=\s*([\s\S]+))?$/);
    if (!m) {
      ctx.unsupported.push(`parameter: ${p.trim().slice(0, 40)}`);
      return null;
    }
    out.push(m[2] !== undefined ? `${m[1]}=${convertExpression(m[2], ctx)}` : m[1]);
  }
  return out;
}

const JS_PY_LEAK =
  /console\.log|=>|\bfunction\b|\bconst\b|\blet\b|\bvar\b|&&|\|\||===|!==|`|\btrue\b|\bfalse\b|\bnull\b|\bundefined\b|\.length\b|\+\+|\?/;

/**
 * Deterministic JavaScript -> Python structural transpiler (practical
 * subset). Brace blocks become indentation; console.log becomes print;
 * template literals become f-strings; function and arrow declarations
 * become def; for/while/if/else keep their meaning; let/const/var become
 * plain assignments. Anything the subset cannot express (classes, async,
 * try/catch, destructuring, spread, method calls, chained ternaries,
 * closures capturing mutation...) is flagged in `unsupported` and emitted
 * as a comment - never as live Python.
 */
export function jsToPython(source: string): StructuralTranspileResult {
  const lines = source.split('\n');
  const out: string[] = [];
  const converted: string[] = [];
  const unsupported: string[] = [];
  const ctx: JsPyContext = { converted, unsupported };

  // Function scopes (assigned names) for closure-mutation detection.
  const scopes: Array<Set<string>> = [new Set()];
  // Open blocks; `filled` drives `pass` insertion for empty bodies.
  const blocks: Array<{ filled: boolean; fnScope: boolean }> = [];
  let consumeDepth = 0; // > 0 while an unsupported block construct is skipped
  let blockComment = false;

  const pad = (depth: number) => ' '.repeat(4 * depth);
  const curPad = () => pad(blocks.length);

  /** Emit live Python; marks the innermost open block as non-empty. */
  const emit = (text: string) => {
    out.push(text);
    if (blocks.length > 0) blocks[blocks.length - 1].filled = true;
  };
  const pushBlock = (fnScope: boolean) => {
    blocks.push({ filled: false, fnScope });
  };
  const closeBlock = () => {
    const depth = blocks.length;
    const blk = blocks.pop();
    if (!blk) {
      unsupported.push('unbalanced-brace');
      return;
    }
    if (blk.fnScope) scopes.pop();
    if (!blk.filled) out.push(`${pad(depth)}pass`);
  };
  /** Flag a whole block construct; its body is consumed as comments. */
  const flagBlock = (kind: string, text: string) => {
    unsupported.push(`${kind}: ${text.slice(0, 60)}`);
    out.push(`${curPad()}# [unsupported: ${kind}] ${text}`);
    consumeDepth = 1;
  };
  /** Comment a statement out (flags were already pushed). */
  const commentStatement = (code: string) => {
    out.push(`${curPad()}# [unsupported] ${code}`);
  };
  const flagStatement = (kind: string, code: string) => {
    unsupported.push(`${kind}: ${code.slice(0, 60)}`);
    commentStatement(code);
  };
  const declare = (name: string) => {
    scopes[scopes.length - 1].add(name);
  };
  /** Assignments must target a name bound in the current scope. */
  const mutationAllowed = (name: string): boolean => {
    if (scopes[scopes.length - 1].has(name)) return true;
    for (let i = 0; i < scopes.length - 1; i++) {
      if (scopes[i].has(name)) {
        unsupported.push(`closure-mutation: ${name}`);
        return false;
      }
    }
    unsupported.push(`undeclared-assignment: ${name}`);
    return false;
  };

  for (const raw of lines) {
    const trimmed = raw.trim();

    // Inside an unsupported block construct: everything becomes a comment
    if (consumeDepth > 0) {
      if (trimmed !== '') out.push(`${curPad()}    # [unsupported] ${trimmed}`);
      else out.push('');
      consumeDepth += netBraces(trimmed);
      if (consumeDepth <= 0) consumeDepth = 0;
      continue;
    }

    // Block comments (multi-line /* */) pass through as Python comments
    if (blockComment) {
      const t = trimmed.replace(/^\*+\s?/, '').replace(/\*\//, '').trim();
      if (t) out.push(`${curPad()}# ${t}`);
      if (trimmed.includes('*/')) blockComment = false;
      continue;
    }

    // Blank lines and comments pass through
    if (trimmed === '') {
      out.push('');
      continue;
    }
    if (trimmed.startsWith('//')) {
      out.push(`${curPad()}# ${trimmed.replace(/^\/\/\s?/, '')}`);
      continue;
    }
    if (trimmed.startsWith('/*')) {
      const t = trimmed.replace(/^\/\*+\s?/, '').replace(/\s?\*+\/$/, '').trim();
      if (t) out.push(`${curPad()}# ${t}`);
      if (!trimmed.includes('*/')) blockComment = true;
      continue;
    }

    // ---- closers and else-continuations ----
    if (/^\}\s*;?$/.test(trimmed)) {
      closeBlock();
      continue;
    }
    const elseIfMatch = trimmed.match(/^(?:}\s*)?else\s+if\s*\((.*)\)\s*\{$/);
    if (elseIfMatch) {
      if (trimmed.startsWith('}')) closeBlock();
      emit(`${curPad()}elif ${convertExpression(elseIfMatch[1], ctx)}:`);
      pushBlock(false);
      converted.push('elif');
      continue;
    }
    if (/^(?:}\s*)?else\s*\{$/.test(trimmed)) {
      if (trimmed.startsWith('}')) closeBlock();
      emit(`${curPad()}else:`);
      pushBlock(false);
      converted.push('else');
      continue;
    }

    // ---- openers (lines ending with `{`) ----
    if (/\{$/.test(trimmed)) {
      if (/^async\b/.test(trimmed) || /^function\s*\*/.test(trimmed)) {
        flagBlock(trimmed.startsWith('async') ? 'async-function' : 'generator-function', trimmed);
        continue;
      }
      const fnMatch = trimmed.match(/^function\s*([A-Za-z_$][\w$]*)\s*\(([^()]*)\)\s*\{$/);
      if (fnMatch) {
        const before = ctx.unsupported.length;
        const params = parseParams(fnMatch[2], ctx);
        if (params === null || ctx.unsupported.length > before) {
          flagBlock('function-parameters', trimmed);
          continue;
        }
        declare(fnMatch[1]);
        scopes.push(new Set(params.map((p) => p.split('=')[0].trim())));
        emit(`${curPad()}def ${fnMatch[1]}(${params.join(', ')}):`);
        pushBlock(true);
        converted.push('function');
        continue;
      }
      const arrowDef = trimmed.match(
        /^(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s+)?(?:\(([^()]*)\)|([A-Za-z_$][\w$]*))\s*=>\s*\{$/
      );
      if (arrowDef) {
        if (/=\s*async\b/.test(trimmed)) {
          flagBlock('async-arrow-function', trimmed);
          continue;
        }
        const before = ctx.unsupported.length;
        const params = parseParams(arrowDef[2] ?? arrowDef[3] ?? '', ctx);
        if (params === null || ctx.unsupported.length > before) {
          flagBlock('arrow-parameters', trimmed);
          continue;
        }
        declare(arrowDef[1]);
        scopes.push(new Set(params.map((p) => p.split('=')[0].trim())));
        emit(`${curPad()}def ${arrowDef[1]}(${params.join(', ')}):`);
        pushBlock(true);
        converted.push('arrow-function');
        continue;
      }
      const ifMatch = trimmed.match(/^if\s*\((.*)\)\s*\{$/);
      if (ifMatch) {
        emit(`${curPad()}if ${convertExpression(ifMatch[1], ctx)}:`);
        pushBlock(false);
        converted.push('if');
        continue;
      }
      const whileMatch = trimmed.match(/^while\s*\((.*)\)\s*\{$/);
      if (whileMatch) {
        emit(`${curPad()}while ${convertExpression(whileMatch[1], ctx)}:`);
        pushBlock(false);
        converted.push('while');
        continue;
      }
      const forMatch = trimmed.match(/^for\s*\((.*)\)\s*\{$/);
      if (forMatch) {
        const head = forMatch[1];
        const forEach = head.match(/^(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s+(of|in)\s+(.+)$/);
        if (forEach) {
          declare(forEach[1]);
          emit(`${curPad()}for ${forEach[1]} in ${convertExpression(forEach[3], ctx)}:`);
          pushBlock(false);
          converted.push(forEach[2] === 'of' ? 'for-of' : 'for-in');
          continue;
        }
        const cFor = head.match(
          /^(?:let|const|var)\s+([A-Za-z_$][\w$]*)\s*=\s*([^;]+);\s*([^;]+);\s*(.+)$/
        );
        if (cFor) {
          const v = cFor[1];
          const vRe = escapeRegExp(v);
          const start = convertExpression(cFor[2], ctx);
          const cond = cFor[3].trim();
          const upd = cFor[4].trim();
          const condLt = cond.match(new RegExp(`^${vRe}\\s*(<=?)\\s*(.+)$`));
          const condGt = cond.match(new RegExp(`^${vRe}\\s*(>=?)\\s*(.+)$`));
          const updInc = upd.match(new RegExp(`^${vRe}\\s*(?:\\+\\+|\\+=\\s*(.+))$`));
          const updDec = upd.match(new RegExp(`^${vRe}\\s*(?:--|-=\\s*(.+))$`));
          const stepRaw = updInc
            ? updInc[1] !== undefined
              ? convertExpression(updInc[1], ctx)
              : '1'
            : updDec
              ? updDec[1] !== undefined
                ? convertExpression(updDec[1], ctx)
                : '1'
              : null;
          const adjust = (stop: string, delta: number) => {
            if (/^-?\d+$/.test(stop)) return String(parseInt(stop, 10) + delta);
            return `(${stop} ${delta > 0 ? '+' : '-'} ${Math.abs(delta)})`;
          };
          let range: string | null = null;
          if (condLt && updInc && stepRaw) {
            const stop = convertExpression(condLt[2], ctx);
            const stopAdj = condLt[1] === '<=' ? adjust(stop, 1) : stop;
            range =
              stepRaw === '1'
                ? `range(${start}, ${stopAdj})`
                : `range(${start}, ${stopAdj}, ${stepRaw})`;
          } else if (condGt && updDec && stepRaw) {
            const stop = convertExpression(condGt[2], ctx);
            const stopAdj = condGt[1] === '>=' ? adjust(stop, -1) : stop;
            range =
              stepRaw === '1'
                ? `range(${start}, ${stopAdj}, -1)`
                : `range(${start}, ${stopAdj}, -${stepRaw})`;
          }
          if (range) {
            declare(v);
            emit(`${curPad()}for ${v} in ${range}:`);
            pushBlock(false);
            converted.push('for-range');
            continue;
          }
        }
        flagBlock('for-loop', trimmed);
        continue;
      }
      if (/^(class|try|switch|do)\b/.test(trimmed)) {
        flagBlock(
          trimmed.startsWith('class')
            ? 'class'
            : trimmed.startsWith('try')
              ? 'try-catch'
              : trimmed.startsWith('switch')
                ? 'switch'
                : 'do-while',
          trimmed
        );
        continue;
      }
      flagBlock('block-construct', trimmed);
      continue;
    }

    // ---- statements ----
    const { code: rawCode, comment } = stripLineComment(trimmed);
    const code = rawCode.replace(/;+$/, '').trim();
    const commentSuffix = comment ? `  # ${comment}` : '';
    if (code === '') {
      out.push(`${curPad()}# ${comment ?? ''}`);
      continue;
    }

    // brace-less or inline control-flow forms stay outside the subset
    if (/^(if|else|for|while|do|switch|try|catch|finally|class|function|async)\b/.test(code)) {
      flagStatement('brace-less or inline block', code);
      continue;
    }

    // module system
    if (/^(import|export)\b/.test(code) || /\brequire\s*\(/.test(code)) {
      flagStatement('module-system', code);
      continue;
    }

    // declarations: let / const / var
    const declMatch = code.match(/^(?:const|let|var)\s+([^=;]+?)\s*(?:=\s*([\s\S]+))?$/);
    if (declMatch) {
      const target = declMatch[1].trim();
      if (/^[{[]/.test(target)) {
        flagStatement('destructuring', code);
        continue;
      }
      const nameMatch = target.match(/^([A-Za-z_$][\w$]*)$/);
      if (!nameMatch) {
        flagStatement('declaration', code);
        continue;
      }
      const name = nameMatch[1];
      declare(name);
      const rhs = declMatch[2] !== undefined ? declMatch[2].trim() : undefined;

      if (rhs === undefined) {
        emit(`${curPad()}${name} = None`);
        converted.push('declaration');
        continue;
      }

      const before = ctx.unsupported.length;

      // const f = (a) => expr; / const f = x => expr;
      const arrow = rhs.match(/^(?:\(([^()]*)\)|([A-Za-z_$][\w$]*))\s*=>\s*([\s\S]+)$/);
      if (arrow) {
        if (/^async\b/.test(rhs)) {
          flagStatement('async-arrow-function', code);
          continue;
        }
        const params = parseParams(arrow[1] ?? arrow[2] ?? '', ctx);
        if (params === null || ctx.unsupported.length > before) {
          flagStatement('arrow-parameters', code);
          continue;
        }
        const body = convertExpression(arrow[3], ctx);
        if (ctx.unsupported.length > before) {
          flagStatement('arrow-function', code);
          continue;
        }
        scopes.push(new Set(params.map((p) => p.split('=')[0].trim())));
        emit(`${curPad()}def ${name}(${params.join(', ')}):`);
        pushBlock(true);
        emit(`${curPad()}return ${body}`);
        closeBlock();
        converted.push('arrow-function');
        continue;
      }

      // object literal -> dict
      if (rhs.startsWith('{')) {
        const inner = balancedInner(rhs, '{', '}');
        const dict = inner !== null ? convertObjectLiteral(inner, ctx) : null;
        if (dict !== null && ctx.unsupported.length === before) {
          emit(`${curPad()}${name} = ${dict}${commentSuffix}`);
          continue;
        }
        flagStatement('object-literal', code);
        continue;
      }

      const value = convertExpression(rhs, ctx);
      if (ctx.unsupported.length > before) {
        flagStatement('expression', code);
        continue;
      }
      emit(`${curPad()}${name} = ${value}${commentSuffix}`);
      converted.push('declaration');
      continue;
    }

    // return
    const retMatch = code.match(/^return\b\s*([\s\S]*)$/);
    if (retMatch) {
      const before = ctx.unsupported.length;
      const val = retMatch[1].trim();
      if (!val) {
        emit(`${curPad()}return None`);
        converted.push('return');
        continue;
      }
      const conv = convertExpression(val, ctx);
      if (ctx.unsupported.length > before) {
        flagStatement('return', code);
        continue;
      }
      emit(`${curPad()}return ${conv}${commentSuffix}`);
      converted.push('return');
      continue;
    }

    // break / continue
    if (code === 'break' || code === 'continue') {
      emit(`${curPad()}${code}`);
      continue;
    }

    // i++ / i--
    const incMatch = code.match(/^([A-Za-z_$][\w$]*)\s*(\+\+|--)$/);
    if (incMatch) {
      if (!mutationAllowed(incMatch[1])) {
        commentStatement(code);
        continue;
      }
      emit(`${curPad()}${incMatch[1]} ${incMatch[2] === '++' ? '+=' : '-='} 1`);
      converted.push('increment');
      continue;
    }

    // assignments (plain and compound)
    const assignMatch = code.match(/^([A-Za-z_$][\w$]*)\s*(\+=|-=|\*=|\/=|%=|\*\*=|=)\s*([\s\S]+)$/);
    if (assignMatch) {
      if (!mutationAllowed(assignMatch[1])) {
        commentStatement(code);
        continue;
      }
      const before = ctx.unsupported.length;
      const rhs = assignMatch[3].trim();
      let value: string | null;
      if (rhs.startsWith('{')) {
        const inner = balancedInner(rhs, '{', '}');
        value = inner !== null ? convertObjectLiteral(inner, ctx) : null;
      } else {
        value = convertExpression(rhs, ctx);
      }
      if (value === null || ctx.unsupported.length > before) {
        flagStatement('assignment', code);
        continue;
      }
      emit(`${curPad()}${assignMatch[1]} ${assignMatch[2]} ${value}${commentSuffix}`);
      converted.push('assignment');
      continue;
    }

    // console.log -> print
    const logMatch = code.match(/^console\.log\s*\((.*)\)$/);
    if (logMatch) {
      const before = ctx.unsupported.length;
      const args = splitTopLevel(logMatch[1], ',').map((a) => convertExpression(a, ctx));
      if (ctx.unsupported.length > before) {
        flagStatement('console.log', code);
        continue;
      }
      emit(`${curPad()}print(${args.join(', ')})${commentSuffix}`);
      converted.push('console.log');
      continue;
    }
    if (/^console\./.test(code)) {
      flagStatement('console-other', code);
      continue;
    }

    // bare expression statements (calls, etc.)
    const before = ctx.unsupported.length;
    const conv = convertExpression(code, ctx);
    if (ctx.unsupported.length > before) {
      flagStatement('expression', code);
      continue;
    }
    emit(`${curPad()}${conv}${commentSuffix}`);
    converted.push('expression-statement');
  }

  // Close any blocks left open at EOF
  while (blocks.length > 0) closeBlock();

  // Leak scan: any JS-ism that survived conversion is reported, never
  // silently emitted as if it were valid Python.
  for (const emitted of out) {
    const t = emitted.trim();
    if (!t || t.startsWith('#')) continue;
    const m = stripStringsForScan(emitted).match(JS_PY_LEAK);
    if (m) {
      unsupported.push(`unconverted js syntax "${m[0]}" in: ${t.slice(0, 60)}`);
    }
  }

  return {
    code: out.join('\n'),
    converted: Array.from(new Set(converted)),
    unsupported: Array.from(new Set(unsupported)),
  };
}

// ============================================================================
// Go -> Java
// ============================================================================

const GO_TO_JAVA_TYPES: Record<string, string> = {
  int: 'int',
  int64: 'long',
  float64: 'double',
  string: 'String',
  bool: 'boolean',
  rune: 'char',
};

/**
 * Go-isms that must never survive into live Java. The final leak scan and
 * every statement-level conversion both use this: if anything matches, the
 * line is reported as unsupported and emitted as a comment instead.
 */
const GO_JAVA_LEAK =
  /:=|\bfmt\.\w|\bfunc\b|\bpackage\b|\bimport\b|<-|\bchan\b|\bdefer\b|\bgo\s+\w|\brange\b|\bnil\b|\bappend\(|\bmake\(|\bstruct\b|\binterface\b|\btype\b|\bswitch\b|\bselect\b|\bpanic\b|\bgoto\b|\bmap\[|\bstrconv\.|\bstrings\.|\bos\.|\btime\.|\bmath\.|\bsort\.|\berrors\.|\bsync\.|`|\[[^\]\[]*:[^\]\[]*\]|\}\s*\(/;

/** Identifiers mapGoExpr must not flag (Java keywords it can emit itself). */
const GO_JAVA_IDENT_SKIP = new Set([
  'int', 'long', 'double', 'float', 'boolean', 'char', 'byte', 'short',
  'String', 'void', 'new', 'true', 'false', 'null', 'length', 'args',
]);

/** Shared collector for the Go -> Java conversion helpers. */
interface GoJavaContext {
  /** function name -> mapped Java return type */
  fnTypes: Map<string, string>;
  /** variable name -> mapped Java type (approximate lexical scope) */
  varTypes: Map<string, string>;
  converted: string[];
  unsupported: string[];
}

/** Map a Go type to its Java counterpart; null when outside the subset. */
function mapGoType(goType: string): string | null {
  const t = goType.trim();
  const arr = t.match(/^\[\d*\](.+)$/); // [3]int (array) / []int (slice)
  if (arr) {
    const el = mapGoType(arr[1]);
    return el ? `${el}[]` : null;
  }
  if (t.startsWith('[')) return null; // map[K]V, [N]T literals, etc.
  return GO_TO_JAVA_TYPES[t] ?? null;
}

/** Split a Go parameter list into Java parameters; null when unsupported. */
function mapGoParams(paramList: string, ctx: GoJavaContext): string[] | null {
  const parts = paramList.trim() === '' ? [] : splitTopLevel(paramList, ',');
  const outParams: string[] = [];
  const pending: string[] = [];
  for (const part of parts) {
    const m = part.match(/^([A-Za-z_]\w*)\s+(.+)$/);
    if (m) {
      // Go groups params: "a, b int" - pending names share the type
      const jt = mapGoType(m[2]);
      if (!jt) {
        ctx.unsupported.push(`unsupported-type: ${m[2].trim()}`);
        return null;
      }
      for (const name of [...pending, m[1]]) outParams.push(`${jt} ${name}`);
      pending.length = 0;
      continue;
    }
    if (/^[A-Za-z_]\w*$/.test(part)) {
      pending.push(part);
      continue;
    }
    return null;
  }
  if (pending.length > 0) return null;
  return outParams;
}

/** Infer the Java type of a Go expression; null when it cannot be determined. */
function inferGoType(expr: string, ctx: GoJavaContext): string | null {
  let e = expr.trim();
  while (e.startsWith('(') && balancedInner(e, '(', ')') !== null) {
    e = e.slice(1, -1).trim();
  }
  if (e === '') return null;
  if (e.startsWith('"')) return 'String';
  if (/^'(?:\\.|[^\\'])'$/.test(e)) return 'char';
  if (e === 'true' || e === 'false') return 'boolean';
  if (/^-?\d+$/.test(e)) return 'int';
  if (/^-?\d+\.\d/.test(e)) return 'double';
  if (e.startsWith('[')) return null; // slice/map/array literals: never inferred
  const call = e.match(/^([A-Za-z_]\w*)\s*\(.*\)$/);
  if (call) {
    if (call[1] === 'int') return 'int';
    if (call[1] === 'int64') return 'long';
    if (call[1] === 'float64') return 'double';
    if (call[1] === 'rune') return 'char';
    return ctx.fnTypes.get(call[1]) ?? null;
  }
  if (/^[A-Za-z_]\w*$/.test(e)) return ctx.varTypes.get(e) ?? null;
  if (/[<>]=?|==|!=|&&|\|\||^!\s*/.test(e)) return 'boolean';
  if (e.includes('"') || e.includes('`')) return 'String';
  if (/\d\.\d/.test(e)) return 'double';
  if (/^-?[\d\s+\-*/%()&|^<>=!]+$/.test(e)) return 'int';
  return null;
}

/**
 * Convert a Go expression to Java and honestly flag what the subset cannot
 * express: unknown function calls and undeclared identifiers (variables
 * whose declaration was flagged) are pushed to ctx.unsupported so callers
 * can demote the whole statement to a comment.
 */
function mapGoExpr(expr: string, ctx: GoJavaContext): string {
  let e = expr.trim();
  // len(x) -> x.length (simple identifier argument)
  e = e.replace(/\blen\(\s*([A-Za-z_]\w*)\s*\)/g, (_all: string, name: string) => `${name}.length`);
  // numeric casts
  e = e.replace(/\bint\(/g, '(int) (').replace(/\bint64\(/g, '(long) (');
  e = e.replace(/\bfloat64\(/g, '(double) (').replace(/\brune\(/g, '(char) (');
  // whole-slice expression x[:] -> x (Java arrays are the slice carrier)
  e = e.replace(/\b([A-Za-z_]\w*)\s*\[:\]/g, (_all: string, name: string) => name);

  const stripped = stripStringsForScan(e);
  // unknown calls: only transpiled functions (fnTypes) and builtins may run
  for (const m of stripped.matchAll(/\b([A-Za-z_]\w*)\s*\(/g)) {
    if (['len', 'int', 'int64', 'float64', 'rune'].includes(m[1])) continue;
    if (!ctx.fnTypes.has(m[1])) ctx.unsupported.push(`unknown-function-call: ${m[1]}`);
  }
  // undeclared identifiers: never let a flagged declaration be used silently
  for (const m of stripped.matchAll(/\b([A-Za-z_]\w*)\b/g)) {
    const name = m[1];
    if (GO_JAVA_IDENT_SKIP.has(name)) continue;
    const idx = m.index ?? 0;
    if (idx > 0 && stripped.slice(0, idx).trimEnd().endsWith('.')) continue;
    if (ctx.fnTypes.has(name) || ctx.varTypes.has(name)) continue;
    ctx.unsupported.push(`undeclared-variable: ${name}`);
  }
  return e;
}

/**
 * Deterministic Go -> Java structural transpiler (practical subset).
 *
 * package main -> public class Main with public static void main; funcs ->
 * static methods; := / var / const -> typed declarations; fmt.Println ->
 * System.out.println with Go-style space-joined arguments; if/else,
 * c-style for, for-cond, for-range -> Java equivalents; fixed-size array
 * literals -> new T[]{...}. Goroutines, channels, defer, structs,
 * interfaces, methods with receivers, multiple return values, slice/map
 * literals, closures and anything the subset cannot express are flagged in
 * `unsupported` and emitted as comments - never as live Java.
 */
export function goToJava(source: string): StructuralTranspileResult {
  const lines = source.split('\n');
  const out: string[] = [];
  const converted: string[] = [];
  const unsupported: string[] = [];
  const fnTypes = new Map<string, string>();
  const varTypes = new Map<string, string>();
  const ctx: GoJavaContext = { fnTypes, varTypes, converted, unsupported };
  const INDENT = '    ';

  // Pre-scan all function signatures: Go allows calls before declaration.
  // A signature only becomes "known" when its parameters map as well, so a
  // function whose conversion was flagged can never be called silently.
  const probeCtx: GoJavaContext = { fnTypes, varTypes, converted: [], unsupported: [] };
  for (const raw of lines) {
    const t = raw.trim();
    if (/^func\s*\(/.test(t)) continue; // method receiver: out of subset
    const m = t.match(/^func\s+([A-Za-z_]\w*)\s*\(([^()]*)\)\s*(.*?)\s*\{$/);
    if (!m) continue;
    if (mapGoParams(m[2], probeCtx) === null) continue;
    let ret = m[3].trim();
    if (ret.startsWith('(') && ret.endsWith(')')) ret = ret.slice(1, -1).trim();
    if (ret.includes(',')) continue; // multiple return values: unsupported
    if (ret === '') {
      fnTypes.set(m[1], 'void');
      continue;
    }
    const jt = mapGoType(ret);
    if (jt) fnTypes.set(m[1], jt);
  }

  // Lexical context: every open block contributes +1 to depth; a context
  // pops when depth returns to the value it was opened at.
  let depth = 0;
  const stack: Array<{
    kind: 'fn' | 'flagged';
    depth: number;
    params: string[];
    savedVars?: Map<string, string>;
  }> = [];
  const innermost = () => (stack.length ? stack[stack.length - 1].kind : null);

  const leak = (text: string): string | null => {
    const m = stripStringsForScan(text).match(GO_JAVA_LEAK);
    return m ? m[0] : null;
  };

  const popContexts = () => {
    while (stack.length > 0 && depth === stack[stack.length - 1].depth) {
      const popped = stack.pop()!;
      if (popped.savedVars) {
        varTypes.clear();
        for (const [k, v] of popped.savedVars) varTypes.set(k, v);
      }
      for (const p of popped.params) varTypes.delete(p);
    }
  };

  /** Flag a line and comment it out; opens a flagged context for blocks. */
  const flagLine = (raw: string): void => {
    const t = raw.trim();
    const pad = raw.slice(0, raw.length - raw.trimStart().length);
    out.push(`${pad}// [unsupported] ${t}`);
    const nb = netBraces(raw);
    depth += nb;
    if (nb > 0) stack.push({ kind: 'flagged', depth: depth - nb, params: [] });
    popContexts();
  };

  /** Emit `line` unless it leaks Go-isms or gained unsupported flags. */
  const emitChecked = (
    line: string,
    raw: string,
    before: number,
    fallbackTag: string
  ): boolean => {
    const leakMatch = leak(line);
    if (unsupported.length === before && leakMatch === null) {
      out.push(line);
      return true;
    }
    if (leakMatch !== null) {
      unsupported.push(`${fallbackTag}: ${raw.trim().slice(0, 50)}`);
    }
    flagLine(raw);
    return false;
  };

  /**
   * Convert a declaration ("x := e", "x T = e", "var x T", "x = e", with an
   * optional var/const prefix already stripped by the caller for the latter
   * forms). Returns the Java statement or null after flagging the reason.
   */
  const convertDecl = (stmt: string, isConst: boolean): string | null => {
    const assign = stmt.match(/^(?:var\s+|const\s+)?([A-Za-z_]\w*)\s*:=\s*(.+)$/);
    if (assign) {
      const name = assign[1];
      let rhs = mapGoExpr(assign[2], ctx);
      if (/\bfunc\s*\(/.test(rhs)) {
        unsupported.push('closure');
        return null;
      }
      if (/\bmake\(/.test(rhs)) {
        unsupported.push('make');
        return null;
      }
      if (/\bappend\(/.test(rhs)) {
        unsupported.push('append');
        return null;
      }
      if (rhs.includes('<-') || /\bchan\b/.test(rhs)) {
        unsupported.push('channel');
        return null;
      }
      // fixed-size array literal [N]T{...} -> new T[]{...}
      const arr = rhs.match(/^\[(\d+)\]\s*([A-Za-z_]\w*)\s*\{(.*)\}$/);
      if (arr) {
        const el = mapGoType(arr[2]);
        if (!el) {
          unsupported.push(`unsupported-type: ${arr[2]}`);
          return null;
        }
        varTypes.set(name, `${el}[]`);
        converted.push('array-literal');
        return `${el}[] ${name} = new ${el}[]{${arr[3]}};`;
      }
      if (/^\[\]/.test(rhs)) {
        unsupported.push('slice-literal');
        return null;
      }
      if (/^map\[/.test(rhs)) {
        unsupported.push('map-literal');
        return null;
      }
      const structLit = rhs.match(/^[A-Za-z_]\w*\{.*\}$/);
      if (structLit) {
        unsupported.push('struct-literal');
        return null;
      }
      const type = inferGoType(rhs, ctx);
      if (!type) {
        unsupported.push(`declaration-type-inference: ${stmt.slice(0, 50)}`);
        return null;
      }
      varTypes.set(name, type);
      converted.push('short-decl');
      return `${type} ${name} = ${rhs};`;
    }

    const rest = stmt.replace(/^(?:var\s+|const\s+)/, '');
    if (rest.split('=')[0].includes(',')) {
      unsupported.push('multi-var-declaration');
      return null;
    }
    const vd = rest.match(/^([A-Za-z_]\w*)\s+([^=]+?)\s*(?:=\s*(.+))?$/);
    if (vd) {
      const jt = mapGoType(vd[2].trim());
      if (!jt) {
        unsupported.push(`unsupported-type: ${vd[2].trim()}`);
        return null;
      }
      const name = vd[1];
      varTypes.set(name, jt);
      if (vd[3] !== undefined) {
        converted.push('var-decl');
        return `${isConst ? 'final ' : ''}${jt} ${name} = ${mapGoExpr(vd[3], ctx)};`;
      }
      // zero value
      const zero: Record<string, string> = {
        int: '0', long: '0', double: '0.0', boolean: 'false',
        char: "'\\u0000'", String: '""',
      };
      converted.push('var-decl-zero');
      return `${isConst ? 'final ' : ''}${jt} ${name} = ${zero[jt] ?? 'null'};`;
    }
    const plain = rest.match(/^([A-Za-z_]\w*)\s*=\s*(.+)$/);
    if (plain) {
      const type = inferGoType(plain[2], ctx);
      if (!type) {
        unsupported.push(`declaration-type-inference: ${stmt.slice(0, 50)}`);
        return null;
      }
      varTypes.set(plain[1], type);
      converted.push('var-decl');
      return `${isConst ? 'final ' : ''}${type} ${plain[1]} = ${mapGoExpr(plain[2], ctx)};`;
    }
    unsupported.push(`declaration: ${stmt.slice(0, 50)}`);
    return null;
  };

  let inImportBlock = false;

  for (const raw of lines) {
    const trimmed = raw.trim();
    const pad = raw.slice(0, raw.length - raw.trimStart().length);

    // Blank lines and comments pass through
    if (trimmed === '') {
      out.push('');
      continue;
    }
    if (trimmed.startsWith('//') || trimmed.startsWith('/*')) {
      out.push(raw);
      continue;
    }

    // Multi-line import block
    if (inImportBlock) {
      if (trimmed === ')') {
        inImportBlock = false;
        converted.push('import-dropped');
      }
      continue;
    }
    if (/^import\s*\(/.test(trimmed)) {
      inImportBlock = true;
      continue;
    }

    // Inside a flagged construct: everything is commented out. Specific
    // unsupported constructs still get their tag for the report.
    if (innermost() === 'flagged') {
      if (/^defer\b/.test(trimmed)) unsupported.push('defer');
      else if (/^go\s+\S/.test(trimmed)) unsupported.push('goroutine');
      else if (trimmed.includes('<-') || /\bchan\b/.test(trimmed)) unsupported.push('channel');
      out.push(`${pad}// [unsupported] ${trimmed}`);
      depth += netBraces(raw);
      popContexts();
      continue;
    }

    // Closing brace: pops the innermost context at its boundary
    if (trimmed === '}') {
      depth -= 1;
      popContexts();
      out.push(raw);
      continue;
    }

    // ------------------------------------------------------------------
    // Top level (class members)
    // ------------------------------------------------------------------
    if (stack.length === 0) {
      const pkg = trimmed.match(/^package\s+([\w.]+)\s*$/);
      if (pkg) {
        if (pkg[1] === 'main') {
          converted.push('package-main');
        } else {
          unsupported.push(`non-main-package: ${pkg[1]}`);
          out.push(`// [unsupported: package ${pkg[1]}]`);
        }
        continue;
      }
      if (/^import\s/.test(trimmed)) {
        converted.push('import-dropped');
        continue;
      }

      if (/^func\s/.test(trimmed)) {
        if (/^func\s*\(/.test(trimmed)) {
          unsupported.push('method-receiver');
          flagLine(raw);
          continue;
        }
        if (/^func\s+main\s*\(\s*\)\s*\{$/.test(trimmed)) {
          out.push(`${INDENT}public static void main(String[] args) {`);
          varTypes.set('args', 'String[]');
          stack.push({ kind: 'fn', depth, params: ['args'], savedVars: new Map(varTypes) });
          depth += 1;
          converted.push('func-main');
          continue;
        }
        const fm = trimmed.match(/^func\s+([A-Za-z_]\w*)\s*\(([^()]*)\)\s*(.*?)\s*\{$/);
        if (!fm) {
          unsupported.push(`func-declaration: ${trimmed.slice(0, 50)}`);
          flagLine(raw);
          continue;
        }
        const before = unsupported.length;
        const params = mapGoParams(fm[2], ctx);
        let ret = fm[3].trim();
        if (ret.startsWith('(') && ret.endsWith(')')) ret = ret.slice(1, -1).trim();
        const multi = ret.includes(',');
        const retJava = ret === '' ? 'void' : mapGoType(ret);
        if (params === null || multi || !retJava) {
          if (multi) unsupported.push('multiple-return-values');
          if (!retJava && ret !== '' && !multi) unsupported.push(`unsupported-type: ${ret}`);
          if (params === null && unsupported.length === before) {
            unsupported.push(`func-signature: ${trimmed.slice(0, 50)}`);
          }
          flagLine(raw);
          continue;
        }
        const paramNames = params.map((p) => p.split(' ')[1]);
        out.push(`${INDENT}static ${retJava} ${fm[1]}(${params.join(', ')}) {`);
        fnTypes.set(fm[1], retJava);
        for (let i = 0; i < params.length; i++) {
          varTypes.set(paramNames[i], params[i].split(' ')[0]);
        }
        stack.push({ kind: 'fn', depth, params: paramNames, savedVars: new Map(varTypes) });
        depth += 1;
        converted.push('func');
        continue;
      }

      const tm = trimmed.match(/^type\s+([A-Za-z_]\w*)\s+(struct|interface)\s*\{$/);
      if (tm) {
        unsupported.push(tm[2]);
        flagLine(raw);
        continue;
      }
      if (/^type\s/.test(trimmed)) {
        unsupported.push(`type-declaration: ${trimmed.slice(0, 50)}`);
        flagLine(raw);
        continue;
      }

      // Top-level var/const -> static fields
      const vm = trimmed.match(/^(var|const)\s+(.+)$/);
      if (vm) {
        const before = unsupported.length;
        const decl = convertDecl(vm[2], vm[1] === 'const');
        if (decl === null || unsupported.length > before || leak(decl) !== null) {
          flagLine(raw);
          continue;
        }
        out.push(`${INDENT}static ${decl}`);
        converted.push('static-field');
        continue;
      }

      unsupported.push(`top-level: ${trimmed.slice(0, 50)}`);
      flagLine(raw);
      continue;
    }

    // ------------------------------------------------------------------
    // Statements inside a function
    // ------------------------------------------------------------------

    if (/^defer\b/.test(trimmed)) {
      unsupported.push('defer');
      flagLine(raw);
      continue;
    }
    if (/^go\s+\S/.test(trimmed)) {
      unsupported.push('goroutine');
      flagLine(raw);
      continue;
    }
    if (/\bmake\(/.test(trimmed)) {
      unsupported.push('make');
      flagLine(raw);
      continue;
    }
    if (/\bappend\(/.test(trimmed)) {
      unsupported.push('append');
      flagLine(raw);
      continue;
    }
    if (trimmed.includes('<-') || /\bchan\b/.test(trimmed)) {
      unsupported.push('channel');
      flagLine(raw);
      continue;
    }

    // x, y := f() -> multiple return values
    if (/^[A-Za-z_]\w*\s*,/.test(trimmed) && trimmed.includes(':=')) {
      unsupported.push('multiple-return-values');
      flagLine(raw);
      continue;
    }

    // x := expr (short declaration)
    const sd = trimmed.match(/^[A-Za-z_]\w*\s*:=\s(.+)$/);
    if (sd) {
      const before = unsupported.length;
      const decl = convertDecl(trimmed, false);
      if (decl === null || unsupported.length > before || leak(decl) !== null) {
        if (decl !== null) unsupported.push(`declaration: ${trimmed.slice(0, 50)}`);
        flagLine(raw);
        continue;
      }
      out.push(`${pad}${decl}`);
      continue;
    }

    // var x T = e / var x T / const x = e (local)
    const lm = trimmed.match(/^(var|const)\s+(.+)$/);
    if (lm) {
      const before = unsupported.length;
      const decl = convertDecl(lm[2], lm[1] === 'const');
      if (decl === null || unsupported.length > before || leak(decl) !== null) {
        if (decl !== null) unsupported.push(`declaration: ${trimmed.slice(0, 50)}`);
        flagLine(raw);
        continue;
      }
      out.push(`${pad}${decl}`);
      continue;
    }

    // if / else if / else
    const ifM = trimmed.match(/^if\s+(.+?)\s*\{$/);
    if (ifM) {
      if (ifM[1].includes(':=')) {
        unsupported.push('if-init-statement');
        flagLine(raw);
        continue;
      }
      const before = unsupported.length;
      const cond = mapGoExpr(ifM[1], ctx);
      if (emitChecked(`${pad}if (${cond}) {`, raw, before, 'if-condition')) {
        depth += 1;
        converted.push('if');
      }
      continue;
    }
    const elifM = trimmed.match(/^\}\s*else\s+if\s+(.+?)\s*\{$/);
    if (elifM) {
      if (elifM[1].includes(':=')) {
        unsupported.push('if-init-statement');
        flagLine(raw);
        continue;
      }
      const before = unsupported.length;
      const cond = mapGoExpr(elifM[1], ctx);
      if (emitChecked(`${pad}} else if (${cond}) {`, raw, before, 'else-if-condition')) {
        converted.push('else-if');
      }
      continue;
    }
    if (/^\}\s*else\s*\{$/.test(trimmed)) {
      out.push(`${pad}} else {`);
      converted.push('else');
      continue;
    }

    // for
    const forM = trimmed.match(/^for\s+(.*?)\s*\{$/);
    if (forM) {
      const head = forM[1];
      const range2 = head.match(/^([A-Za-z_]\w*)\s*,\s*([A-Za-z_]\w*)\s*:=\s*range\s+(.+)$/);
      const range1 = head.match(/^([A-Za-z_]\w*)\s*:=\s*range\s+(.+)$/);

      if (range2) {
        const idx = range2[1];
        const val = range2[2];
        const before = unsupported.length;
        const coll = mapGoExpr(range2[3], ctx);
        const collType = varTypes.get(coll);
        if (unsupported.length > before || !collType || !collType.endsWith('[]')) {
          unsupported.push(`range-target: ${range2[3].trim().slice(0, 50)}`);
          flagLine(raw);
          continue;
        }
        const elem = collType.slice(0, -2);
        if (idx === '_') {
          varTypes.set(val, elem);
          out.push(`${pad}for (${elem} ${val} : ${coll}) {`);
          converted.push('for-range');
        } else {
          varTypes.set(idx, 'int');
          varTypes.set(val, elem);
          out.push(`${pad}for (int ${idx} = 0; ${idx} < ${coll}.length; ${idx}++) {`);
          out.push(`${pad}${INDENT}${elem} ${val} = ${coll}[${idx}];`);
          converted.push('for-range-indexed');
        }
        depth += 1;
        continue;
      }

      if (range1) {
        const idx = range1[1];
        const before = unsupported.length;
        const coll = mapGoExpr(range1[2], ctx);
        const collType = varTypes.get(coll);
        const intBound =
          collType === 'int' || collType === 'long'
            ? collType
            : collType === undefined
              ? inferGoType(coll, ctx)
              : null;
        if (unsupported.length > before || (collType !== undefined && !collType.endsWith('[]') && intBound === null)) {
          unsupported.push(`range-target: ${range1[2].trim().slice(0, 50)}`);
          flagLine(raw);
          continue;
        }
        if (intBound === 'int' || intBound === 'long') {
          // Go 1.22 range over an int
          varTypes.set(idx, intBound);
          out.push(`${pad}for (${intBound} ${idx} = 0; ${idx} < ${coll}; ${idx}++) {`);
          converted.push('for-range-int');
        } else {
          // single variable over a slice/array: the variable is the index
          varTypes.set(idx, 'int');
          out.push(`${pad}for (int ${idx} = 0; ${idx} < ${coll}.length; ${idx}++) {`);
          converted.push('for-range-index');
        }
        depth += 1;
        continue;
      }

      if (head.includes(';')) {
        // c-style: for i := 0; i < n; i++
        const parts = splitTopLevel(head, ';');
        const im = parts.length === 3 ? parts[0].match(/^([A-Za-z_]\w*)\s*:=\s*(.+)$/) : null;
        if (im) {
          const type = inferGoType(im[2], ctx) ?? 'int';
          varTypes.set(im[1], type);
          const before = unsupported.length;
          const cond = mapGoExpr(parts[1], ctx);
          const post = mapGoExpr(parts[2], ctx);
          if (
            emitChecked(
              `${pad}for (${type} ${im[1]} = ${im[2]}; ${cond}; ${post}) {`,
              raw,
              before,
              'for-header'
            )
          ) {
            depth += 1;
            converted.push('for-c-style');
          }
          continue;
        }
        unsupported.push(`for-header: ${head.slice(0, 50)}`);
        flagLine(raw);
        continue;
      }

      if (head === '') {
        out.push(`${pad}while (true) {`);
        depth += 1;
        converted.push('for-infinite');
        continue;
      }

      // for cond { -> while (cond) {
      const before = unsupported.length;
      const cond = mapGoExpr(head, ctx);
      if (emitChecked(`${pad}while (${cond}) {`, raw, before, 'for-condition')) {
        depth += 1;
        converted.push('for-cond');
      }
      continue;
    }

    // fmt.Println(...) -> System.out.println with space-joined args
    const pm = trimmed.match(/^fmt\.Println\((.*)\)$/);
    if (pm) {
      const inner = pm[1].trim();
      const before = unsupported.length;
      const args = inner === '' ? [] : splitTopLevel(inner, ',').map((a) => mapGoExpr(a, ctx));
      for (const a of args) {
        // printing an array diverges (Go "[1 2 3]" vs Java "[I@..."); flag it
        if (varTypes.get(a)?.endsWith('[]')) unsupported.push(`println-array: ${a}`);
      }
      // Go prints runes as their numeric code; Java would print the character
      const printed = args.map((a) => {
        if (varTypes.get(a) === 'char') return `(int) ${a}`;
        if (/^'(?:\\.|[^\\'])'$/.test(a)) return `(int) ${a}`;
        return a;
      });
      const line = `${pad}System.out.println(${printed.join(' + " " + ')});`;
      if (emitChecked(line, raw, before, 'println-arguments')) {
        converted.push('println');
      }
      continue;
    }
    if (/^fmt\./.test(trimmed)) {
      unsupported.push(`fmt-call: ${trimmed.slice(0, 50)}`);
      flagLine(raw);
      continue;
    }

    // return / break / continue
    if (trimmed === 'return') {
      out.push(`${pad}return;`);
      converted.push('return');
      continue;
    }
    const rm = trimmed.match(/^return\s+(.+)$/);
    if (rm) {
      const before = unsupported.length;
      const mapped = mapGoExpr(rm[1], ctx);
      if (emitChecked(`${pad}return ${mapped};`, raw, before, 'return-expression')) {
        converted.push('return');
      }
      continue;
    }
    if (trimmed === 'break' || trimmed === 'continue') {
      out.push(`${pad}${trimmed};`);
      converted.push('break-continue');
      continue;
    }

    // i++ / i--
    const incm = trimmed.match(/^([A-Za-z_]\w*)\s*(\+\+|--)$/);
    if (incm) {
      out.push(`${pad}${incm[1]}${incm[2]};`);
      converted.push('increment');
      continue;
    }

    // assignments (plain and compound); "_" is Go's blank identifier and
    // is not a valid Java variable
    const am = trimmed.match(/^([A-Za-z_]\w*(?:\[[^\]\[]*\])?)\s*(\+=|-=|\*=|\/=|%=|&=|\|=|=)\s*(.+)$/);
    if (am) {
      if (am[1] === '_') {
        unsupported.push('blank-identifier');
        flagLine(raw);
        continue;
      }
      const before = unsupported.length;
      const mapped = mapGoExpr(am[3], ctx);
      if (emitChecked(`${pad}${am[1]} ${am[2]} ${mapped};`, raw, before, 'assignment')) {
        converted.push('assignment');
      }
      continue;
    }

    // bare expression statements (calls, etc.)
    const before = unsupported.length;
    const mapped = mapGoExpr(trimmed.replace(/;$/, ''), ctx);
    if (emitChecked(`${pad}${mapped};`, raw, before, 'statement')) {
      converted.push('expression-statement');
    }
    continue;
  }

  // Leak scan: any Go-ism that survived conversion is reported, never
  // silently emitted as if it were valid Java.
  for (const emitted of out) {
    const t = emitted.trim();
    if (!t || t.startsWith('//')) continue;
    const m = stripStringsForScan(emitted).match(GO_JAVA_LEAK);
    if (m) {
      unsupported.push(`unconverted go syntax "${m[0]}" in: ${t.slice(0, 60)}`);
    }
  }

  return {
    code: ['public class Main {', ...out, '}'].join('\n'),
    converted: Array.from(new Set(converted)),
    unsupported: Array.from(new Set(unsupported)),
  };
}
