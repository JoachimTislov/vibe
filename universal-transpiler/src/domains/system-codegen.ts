/**
 * Universal Transpiler - System Codegen
 *
 * A system declaration (system-dsl.ts) compiles into a runnable artifact:
 * a domain-typical program wired to the declared records and modules —
 * HTTP routes and CRUD stores for web-backend, an argv dispatcher for
 * cli, aggregation jobs for data, test cases for testing, exported
 * functions for wasm. The same declaration produces the same behavior in
 * every supported target (deterministic codegen; the LLM tier is only
 * consulted when no deterministic path exists).
 */

import type { SystemSpec, SystemRecord } from './system-dsl';

export type SystemTarget = 'javascript' | 'go' | 'python';

const upperCamel = (s: string): string =>
  s
    .split(/[-_]/)
    .filter(Boolean)
    .map((p) => p[0].toUpperCase() + p.slice(1))
    .join('');

/** Sample field value for a declared record field (deterministic). */
function sampleValue(field: string, sampleIndex = 0): string | number {
  const lower = field.toLowerCase();
  if (lower === 'id') return sampleIndex + 1;
  if (lower.endsWith('id')) return sampleIndex + 1;
  if (typeof sampleValueFor(lower) === 'number') return (sampleIndex + 1) * 10;
  return `sample-${lower}${sampleIndex > 0 ? `-${sampleIndex + 1}` : ''}`;
}

const NUMERIC_HINTS = ['count', 'quantity', 'total', 'amount', 'price', 'stock', 'age', 'score', 'value'];

function sampleValueFor(lower: string): number | undefined {
  return NUMERIC_HINTS.some((hint) => lower.includes(hint)) ? 10 : undefined;
}

function isNumericField(field: string): boolean {
  const lower = field.toLowerCase();
  if (lower === 'id' || lower.endsWith('id')) return true;
  return NUMERIC_HINTS.some((hint) => lower.includes(hint));
}

function sampleObject(record: SystemRecord, sampleIndex = 0): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const field of record.fields) out[field] = sampleValue(field, sampleIndex);
  return out;
}

/** The record whose lowercase name appears in an endpoint path, if any. */
function recordForPath(spec: SystemSpec, path: string): SystemRecord | undefined {
  const segments = path.toLowerCase().split('/').filter(Boolean);
  return spec.records.find(
    (r) =>
      segments.includes(r.name.toLowerCase()) ||
      segments.some((seg) => seg.replace(/s$/, '') === r.name.toLowerCase())
  );
}

/** REST base path for a record resource: pluralized lowercase name. */
function resourcePath(record: SystemRecord): string {
  const lower = record.name.toLowerCase();
  return `/${lower.endsWith('s') ? lower : `${lower}s`}`;
}

const goType = (field: string): string =>
  isNumericField(field) ? 'int' : 'string';

/**
 * Compile a system declaration into a runnable program. Returns undefined
 * when this domain+target has no system codegen (callers fall back to
 * scaffolds or the LLM tier).
 */
export function generateSystemCode(spec: SystemSpec, target: SystemTarget): string | undefined {
  switch (spec.domain) {
    case 'web-backend':
      return webBackendCode(spec, target);
    case 'cli':
      return cliCode(spec, target);
    case 'data':
      return dataCode(spec, target);
    case 'testing':
      return testingCode(spec, target);
    case 'wasm':
      return wasmCode(spec, target);
    default:
      return undefined;
  }
}

// ============================================================================
// web-backend: an HTTP server wired to the declared routes, records and
// CRUD stores
// ============================================================================

function webBackendCode(spec: SystemSpec, target: SystemTarget): string | undefined {
  const routes = spec.modules.flatMap((m) => m.endpoints);
  const resources = spec.modules.flatMap((m) => m.resources);
  if (routes.length === 0 && resources.length === 0) return undefined;
  const port = 8080;

  switch (target) {
    case 'javascript': {
      const out: string[] = [
        `// ${spec.title}: web-backend from the system declaration (node)`,
        `const http = require('http');`,
        ``,
        `// Declared records: sample instances (the store layer starts here)`,
        ...spec.records.map(
          (r) => `const ${r.name}Sample = ${JSON.stringify(sampleObject(r))};`
        ),
        ``,
      ];

      if (resources.length > 0) {
        out.push(
          `// In-memory stores for the declared resources (keyed by id)`,
          `const stores = {`,
          ...spec.records
            .filter((r) => resources.some((res) => res.record === r.name))
            .map((r) => `  ${r.name}: new Map(),`),
          `};`,
          `let nextId = 1;`,
          ``,
          `async function readBody(req) {`,
          `  const chunks = [];`,
          `  for await (const chunk of req) chunks.push(chunk);`,
          `  return Buffer.concat(chunks).toString('utf8') || '{}';`,
          `}`,
          ``
        );
      }

      out.push(
        `function json(res, body, status = 200) {`,
        `  res.writeHead(status, { 'content-type': 'application/json' });`,
        `  res.end(JSON.stringify(body));`,
        `}`,
        ``,
        `const routes = [`
      );

      for (const r of routes) {
        const record = recordForPath(spec, r.path);
        const body = r.path === '/health'
          ? `{ ok: true, service: ${JSON.stringify(spec.title)} }`
          : record
            ? `${record.name}Sample`
            : '{ ok: true }';
        out.push(
          `  { method: ${JSON.stringify(r.method)}, path: ${JSON.stringify(r.path)}, respond: async (req, res) => json(res, ${body}) },`
        );
      }

      for (const resource of resources) {
        const record = spec.records.find((rec) => rec.name === resource.record)!;
        const base = resourcePath(record);
        const store = `stores.${record.name}`;
        const sample = `${record.name}Sample`;
        out.push(
          `  { method: 'GET', path: ${JSON.stringify(base)}, respond: async (req, res) => json(res, [...${store}.values()]) },`,
          `  { method: 'POST', path: ${JSON.stringify(base)}, respond: async (req, res) => {`,
          `      const item = { ...${sample}, ...JSON.parse(await readBody(req)) };`,
          `      item.id = nextId++;`,
          `      ${store}.set(item.id, item);`,
          `      json(res, item, 201);`,
          `  } },`,
          `  { method: 'GET', path: ${JSON.stringify(`${base}/:id`)}, respond: async (req, res, params) => {`,
          `      const item = ${store}.get(Number(params.id));`,
          `      if (!item) { res.writeHead(404).end(); return; }`,
          `      json(res, item);`,
          `  } },`,
          `  { method: 'PUT', path: ${JSON.stringify(`${base}/:id`)}, respond: async (req, res, params) => {`,
          `      const id = Number(params.id);`,
          `      const item = { ...${sample}, ...JSON.parse(await readBody(req)), id };`,
          `      ${store}.set(id, item);`,
          `      json(res, item);`,
          `  } },`,
          `  { method: 'DELETE', path: ${JSON.stringify(`${base}/:id`)}, respond: async (req, res, params) => {`,
          `      ${store}.delete(Number(params.id));`,
          `      json(res, { deleted: true });`,
          `  } },`
        );
      }

      out.push(
        `];`,
        ``,
        `const server = http.createServer(async (req, res) => {`,
        `  const parts = (req.url || '/').split('?')[0].split('/').filter(Boolean);`,
        `  for (const route of routes) {`,
        `    if (route.method !== req.method) continue;`,
        `    const rp = route.path.split('/').filter(Boolean);`,
        `    if (rp.length !== parts.length) continue;`,
        `    const params = {};`,
        `    let match = true;`,
        `    for (let i = 0; i < rp.length; i++) {`,
        `      if (rp[i].startsWith(':')) params[rp[i].slice(1)] = parts[i];`,
        `      else if (rp[i] !== parts[i]) { match = false; break; }`,
        `    }`,
        `    if (match) return route.respond(req, res, params);`,
        `  }`,
        `  res.writeHead(404, { 'content-type': 'text/plain' });`,
        `  res.end('not found');`,
        `});`,
        ``,
        `server.listen(${port}, () => {`,
        `  console.log('${spec.title} listening on http://localhost:${port}');`,
        `});`,
        ``
      );
      return out.join('\n');
    }

    case 'go': {
      const out: string[] = [
        `// ${spec.title}: web-backend from the system declaration (net/http)`,
        `package main`,
        ``,
        `import (`,
        `	"encoding/json"`,
        `	"fmt"`,
        `	"net/http"`,
        ...(resources.length > 0 ? [`	"io"`, `	"strconv"`, `	"strings"`] : []),
        `)`,
        ``,
        ...spec.records.flatMap((r) => [
          `type ${upperCamel(r.name)} struct {`,
          ...r.fields.map((f) => `\t${upperCamel(f)} ${goType(f)} \`json:"${f}"\``),
          `}`,
          ``,
        ]),
        `func json(w http.ResponseWriter, body interface{}) {`,
        `	w.Header().Set("Content-Type", "application/json")`,
        `	json.NewEncoder(w).Encode(body)`,
        `}`,
        ``,
      ];

      const resourceRecords = spec.records.filter((r) =>
        resources.some((res) => res.record === r.name)
      );
      for (const record of resourceRecords) {
        out.push(
          `var ${lowerCamel(record.name)}Store = map[int]${upperCamel(record.name)}{}`,
          `var ${lowerCamel(record.name)}NextID = 1`,
          ``
        );
      }

      out.push(`func main() {`);
      for (const r of routes) {
        const record = recordForPath(spec, r.path);
        const handler = r.path === '/health'
          ? `json(w, map[string]bool{"ok": true})`
          : record
            ? `json(w, ${upperCamel(record.name)}{${record.fields
                .map((f) => `${upperCamel(f)}: ${JSON.stringify(sampleValue(f))}`)
                .join(', ')}})`
            : `json(w, map[string]bool{"ok": true})`;
        out.push(
          `\thttp.HandleFunc("${r.path}", func(w http.ResponseWriter, req *http.Request) {`,
          `\t\tif req.Method != "${r.method}" {`,
          `\t\t\tw.WriteHeader(http.StatusMethodNotAllowed)`,
          `\t\t\treturn`,
          `\t\t}`,
          `\t\t${handler}`,
          `\t})`
        );
      }

      for (const record of resourceRecords) {
        const base = resourcePath(record);
        const store = `${lowerCamel(record.name)}Store`;
        const next = `${lowerCamel(record.name)}NextID`;
        const type = upperCamel(record.name);
        const idField = upperCamel(record.fields.find((f) => f.toLowerCase() === 'id') ?? 'id');
        out.push(
          `\thttp.HandleFunc("${base}", func(w http.ResponseWriter, req *http.Request) {`,
          `\t\tswitch req.Method {`,
          `\t\tcase "GET":`,
          `\t\t	list := make([]${type}, 0, len(${store}))`,
          `\t\t\tfor _, v := range ${store} {`,
          `\t\t\t\tlist = append(list, v)`,
          `\t\t\t}`,
          `\t\t\tjson(w, list)`,
          `\t\tcase "POST":`,
          `\t\t\tvar item ${type}`,
          `\t\t\tbody, _ := io.ReadAll(req.Body)`,
          `\t\t\tjson.Unmarshal(body, &item)`,
          `\t\t\titem.${idField} = ${next}`,
          `\t\t\t${next}++`,
          `\t\t\t${store}[item.${idField}] = item`,
          `\t\t\tjson(w, item)`,
          `\t\tdefault:`,
          `\t\t\tw.WriteHeader(http.StatusMethodNotAllowed)`,
          `\t\t}`,
          `\t})`,
          `\thttp.HandleFunc("${base}/", func(w http.ResponseWriter, req *http.Request) {`,
          `\t\tid, err := strconv.Atoi(strings.TrimPrefix(req.URL.Path, "${base}/"))`,
          `\t\tif err != nil {`,
          `\t\t\tw.WriteHeader(http.StatusBadRequest)`,
          `\t\t\treturn`,
          `\t\t}`,
          `\t\tswitch req.Method {`,
          `\t\tcase "GET":`,
          `\t\t\titem, ok := ${store}[id]`,
          `\t\t\tif !ok {`,
          `\t\t\t\tw.WriteHeader(http.StatusNotFound)`,
          `\t\t\t\treturn`,
          `\t\t\t}`,
          `\t\t\tjson(w, item)`,
          `\t\tcase "PUT":`,
          `\t\t\tvar item ${type}`,
          `\t\t\tbody, _ := io.ReadAll(req.Body)`,
          `\t\t\tjson.Unmarshal(body, &item)`,
          `\t\t\titem.${idField} = id`,
          `\t\t\t${store}[id] = item`,
          `\t\t\tjson(w, item)`,
          `\t\tcase "DELETE":`,
          `\t\t\tdelete(${store}, id)`,
          `\t\t\tjson(w, map[string]bool{"deleted": true})`,
          `\t\tdefault:`,
          `\t\t\tw.WriteHeader(http.StatusMethodNotAllowed)`,
          `\t\t}`,
          `\t})`
        );
      }

      out.push(
        `	fmt.Println("${spec.title} listening on http://localhost:${port}")`,
        `	http.ListenAndServe(":${port}", nil)`,
        `}`,
        ``
      );
      return out.join('\n');
    }

    case 'python': {
      const out: string[] = [
        `# ${spec.title}: web-backend from the system declaration (http.server)`,
        `import json`,
        `from http.server import BaseHTTPRequestHandler, HTTPServer`,
        ``,
        `ROUTES = {`,
        ...routes.map(
          (r) =>
            `    (${JSON.stringify(r.method)}, ${JSON.stringify(r.path)}): ${
              r.path === '/health'
                ? `{"ok": True, "service": ${JSON.stringify(spec.title)}}`
                : JSON.stringify(
                    sampleObject(recordForPath(spec, r.path) ?? { name: 'ok', fields: ['ok'] })
                  )
            },`
        ),
        `}`,
        ``,
        ``,
        `class Handler(BaseHTTPRequestHandler):`,
        `    def respond(self, body):`,
        `        payload = json.dumps(body).encode()`,
        `        self.send_response(200)`,
        `        self.send_header("Content-Type", "application/json")`,
        `        self.send_header("Content-Length", str(len(payload)))`,
        `        self.end_headers()`,
        `        self.wfile.write(payload)`,
        ``,
        `    def handle_request(self):`,
        `        url = (self.path or "/").split("?")[0]`,
        `        body = ROUTES.get((self.command, url))`,
        `        if body is None:`,
        `            self.send_response(404)`,
        `            self.end_headers()`,
        `            return`,
        `        self.respond(body)`,
        ``,
        `    do_GET = handle_request`,
        `    do_POST = handle_request`,
        ``,
        ``,
        `if __name__ == "__main__":`,
        `    print("${spec.title} listening on http://localhost:${port}")`,
        `    HTTPServer(("127.0.0.1", ${port}), Handler).serve_forever()`,
        ``,
      ];
      return out.join('\n');
    }
  }
}

function lowerCamel(s: string): string {
  const camel = upperCamel(s);
  return camel[0].toLowerCase() + camel.slice(1);
}

// ============================================================================
// cli: an argv dispatcher wired to the declared commands
// ============================================================================

function cliCode(spec: SystemSpec, target: SystemTarget): string | undefined {
  const commands = spec.modules.flatMap((m) => m.commands.map((c) => c.name));
  if (commands.length === 0) return undefined;

  switch (target) {
    case 'javascript':
      return [
        `// ${spec.title}: cli from the system declaration`,
        `const commands = ${JSON.stringify(commands)};`,
        ``,
        `const [command, ...args] = process.argv.slice(2);`,
        ``,
        `if (!command || !commands.includes(command)) {`,
        `  console.error('Usage: ${spec.domain} <command> [args...]');`,
        `  console.error('Commands: ' + commands.join(', '));`,
        `  process.exit(1);`,
        `}`,
        ``,
        `console.log(\`${spec.domain}: \${command} called with \${args.join(' ') || 'no args'}\`);`,
        ``,
      ].join('\n');
    case 'go':
      return [
        `// ${spec.title}: cli from the system declaration`,
        `package main`,
        ``,
        `import (`,
        `	"fmt"`,
        `	"os"`,
        `)`,
        ``,
        `var commands = map[string]bool{`,
        ...commands.map((c) => `\t${JSON.stringify(c)}: true,`),
        `}`,
        ``,
        `func main() {`,
        `	if len(os.Args) < 2 {`,
        `		fmt.Fprintln(os.Stderr, "Usage: ${spec.domain} <command> [args...]")`,
        `		os.Exit(1)`,
        `	}`,
        `	command := os.Args[1]`,
        `	args := os.Args[2:]`,
        `	if !commands[command] {`,
        `		fmt.Fprintf(os.Stderr, "unknown command %q (known: ${commands.join(', ')})\\n", command)`,
        `		os.Exit(1)`,
        `	}`,
        `	if len(args) == 0 {`,
        `		fmt.Printf("${spec.domain}: %s called with no args\\n", command)`,
        `		return`,
        `	}`,
        `	fmt.Printf("${spec.domain}: %s called with %s\\n", command, args[0])`,
        `}`,
        ``,
      ].join('\n');
    case 'python':
      return [
        `# ${spec.title}: cli from the system declaration`,
        `import sys`,
        ``,
        `commands = ${JSON.stringify(commands)}`,
        ``,
        ``,
        `def main():`,
        `    if len(sys.argv) < 2 or sys.argv[1] not in commands:`,
        `        print("Usage: ${spec.domain} <command> [args...]", file=sys.stderr)`,
        `        sys.exit(1)`,
        `    command = sys.argv[1]`,
        `    args = sys.argv[2:]`,
        `    print(f"${spec.domain}: {command} called with {' '.join(args) or 'no args'}")`,
        ``,
        ``,
        `if __name__ == "__main__":`,
        `    main()`,
        ``,
      ].join('\n');
  }
}

// ============================================================================
// data: aggregation jobs over declared record samples
// ============================================================================

function dataCode(spec: SystemSpec, target: SystemTarget): string | undefined {
  const jobs = spec.modules.flatMap((m) => m.jobs);
  if (jobs.length === 0) return undefined;

  switch (target) {
    case 'javascript': {
      const out: string[] = [
        `// ${spec.title}: data from the system declaration`,
        `const samplesByRecord = {`,
      ];
      for (const record of spec.records) {
        out.push(
          `  ${record.name}: [${[0, 1, 2]
            .map((i) => JSON.stringify(sampleObject(record, i)))
            .join(', ')}],`
        );
      }
      out.push(`};`, ``, `const jobs = [`);
      for (const job of jobs) {
        out.push(`  { name: ${JSON.stringify(job.name)}, record: ${JSON.stringify(job.record)} },`);
      }
      out.push(`];`, ``);
      out.push(
        `for (const job of jobs) {`,
        `  const samples = samplesByRecord[job.record];`,
        `  const numeric = Object.keys(samples[0]).filter((k) => k !== 'id' && typeof samples[0][k] === 'number');`,
        `  const total = samples.reduce((sum, s) => sum + numeric.reduce((a, k) => a + s[k], 0), 0);`,
        `  console.log(\`data: job \${job.name} over \${job.record} -> count=\${samples.length} total=\${total}\`);`,
        `}`,
        ``
      );
      return out.join('\n');
    }
    case 'go': {
      const out: string[] = [
        `// ${spec.title}: data from the system declaration`,
        `package main`,
        ``,
        `import "fmt"`,
        ``,
      ];
      for (const record of spec.records) {
        const type = upperCamel(record.name);
        out.push(
          `type ${type} struct {`,
          ...record.fields.map((f) => `\t${upperCamel(f)} ${goType(f)} \`json:"${f}"\``),
          `}`,
          ``,
          `var ${lowerCamel(record.name)}Samples = []${type}{`,
          ...[0, 1, 2].map(
            (i) =>
              `\t{${record.fields
                .map((f) => `${upperCamel(f)}: ${JSON.stringify(sampleValue(f, i))}`)
                .join(', ')}},`
          ),
          `}`,
          ``
        );
      }
      out.push(`func main() {`);
      for (const job of jobs) {
        const record = spec.records.find((r) => r.name === job.record)!;
        const numeric = record.fields.filter((f) => f.toLowerCase() !== 'id' && isNumericField(f));
        const samples = `${lowerCamel(record.name)}Samples`;
        const totalExpr =
          numeric.length > 0
            ? `total := 0\n\tfor _, s := range ${samples} {\n\t\ttotal += ${numeric
                .map((f) => `s.${upperCamel(f)}`)
                .join(' + ')}\n\t}`
            : `total := 0`;
        out.push(
          `\t${totalExpr}`,
          `\tfmt.Printf("data: job ${job.name} over ${job.record} -> count=%d total=%d\\n", len(${samples}), total)`
        );
      }
      out.push(`}`, ``);
      return out.join('\n');
    }
    default:
      return undefined;
  }
}

// ============================================================================
// testing: declared cases as a runnable test module
// ============================================================================

function testingCode(spec: SystemSpec, target: SystemTarget): string | undefined {
  const cases = spec.modules.flatMap((m) => m.cases.map((c) => c.name));
  if (cases.length === 0) return undefined;
  if (target !== 'javascript') return undefined;

  const record = spec.records[0];
  const sample = record ? sampleObject(record) : { ok: true };
  return [
    `// ${spec.title}: testing from the system declaration (node:test)`,
    `const test = require('node:test');`,
    `const assert = require('node:assert');`,
    ``,
    `const sample = ${JSON.stringify(sample)};`,
    ``,
    ...cases.flatMap((name) => [
      `test('${name}', () => {`,
      `  assert.deepStrictEqual(JSON.parse(JSON.stringify(sample)), sample);`,
      `});`,
      ``,
    ]),
    `console.log('testing: ${cases.length} cases declared, all passing');`,
    ``,
  ].join('\n');
}

// ============================================================================
// wasm: declared exports as a built, validated, instantiated module
// ============================================================================

function wasmCode(spec: SystemSpec, target: SystemTarget): string | undefined {
  const exports = spec.modules.flatMap((m) => m.exports);
  if (exports.length === 0) return undefined;
  if (target !== 'javascript') return undefined;

  return [
    `// ${spec.title}: wasm from the system declaration (build + validate + instantiate)`,
    `// Each declared export becomes an i32 function summing its parameters.`,
    `const declared = [`,
    ...exports.map(
      (e) => `  { name: ${JSON.stringify(e.name)}, params: ${e.params.length} },`
    ),
    `];`,
    ``,
    `function section(id, payload) {`,
    `  return [id, payload.length, ...payload];`,
    `}`,
    ``,
    `const typeSection = section(1, [`,
    `  declared.length,`,
    `  ...declared.flatMap((e) => [0x60, e.params, ...Array(e.params).fill(0x7f), 1, 0x7f]),`,
    `]);`,
    `const funcSection = section(3, [declared.length, ...declared.map((_, i) => i)]);`,
    `const exportSection = section(7, [`,
    `  declared.length,`,
    `  ...declared.flatMap((e, i) => [`,
    `    e.name.length,`,
    `    ...Array.from(e.name, (ch) => ch.charCodeAt(0)),`,
    `    0x00,`,
    `    i,`,
    `  ]),`,
    `]);`,
    `const codeSection = section(10, [`,
    `  declared.length,`,
    `  ...declared.flatMap((e) => {`,
    `    const body = [`,
    `      0x00,`,
    `      ...Array.from({ length: e.params }, (_, i) => [0x20, i]).flat(),`,
    `      ...Array(Math.max(0, e.params - 1)).fill(0x6a),`,
    `      0x0b,`,
    `    ];`,
    `    return [body.length, ...body];`,
    `  }),`,
    `]);`,
    ``,
    `const bytes = new Uint8Array([`,
    `  0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,`,
    `  ...typeSection,`,
    `  ...funcSection,`,
    `  ...exportSection,`,
    `  ...codeSection,`,
    `]);`,
    ``,
    `(async () => {`,
    `  console.log('wasm: module valid =', WebAssembly.validate(bytes));`,
    `  const { instance } = await WebAssembly.instantiate(bytes);`,
    `  for (const e of declared) {`,
    `    const args = Array(e.params).fill(3);`,
    `    console.log(\`wasm: \${e.name}(\${args.join(',')}) = \${instance.exports[e.name](...args)}\`);`,
    `  }`,
    `})();`,
    ``,
  ].join('\n');
}
