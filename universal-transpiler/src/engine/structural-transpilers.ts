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
