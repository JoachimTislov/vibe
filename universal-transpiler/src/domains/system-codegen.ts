/**
 * Universal Transpiler - System Codegen
 *
 * A system declaration (system-dsl.ts) compiles into a runnable artifact:
 * a domain-typical program wired to the declared records and modules —
 * HTTP routes for web-backend endpoints, an argv dispatcher for cli
 * commands. The same declaration produces the same behavior in every
 * supported target (deterministic codegen; the LLM tier is only consulted
 * when no deterministic path exists).
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
function sampleValue(field: string): string | number {
  const lower = field.toLowerCase();
  if (lower.endsWith('id')) return 1;
  if (lower.includes('count') || lower.includes('quantity') || lower.includes('total')) return 0;
  return `sample-${lower}`;
}

function sampleObject(record: SystemRecord): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const field of record.fields) out[field] = sampleValue(field);
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
    default:
      return undefined;
  }
}

// ============================================================================
// web-backend: an HTTP server wired to the declared routes and records
// ============================================================================

function webBackendCode(spec: SystemSpec, target: SystemTarget): string | undefined {
  const routes = spec.modules.flatMap((m) => m.endpoints);
  if (routes.length === 0) return undefined;
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
        `function json(res, body) {`,
        `  res.writeHead(200, { 'content-type': 'application/json' });`,
        `  res.end(JSON.stringify(body));`,
        `}`,
        ``,
        `const routes = [`,
        ...routes.flatMap((r) => {
          const record = recordForPath(spec, r.path);
          const body = r.path === '/health'
            ? `{ ok: true, service: ${JSON.stringify(spec.title)} }`
            : record
              ? `${record.name}Sample`
              : '{ ok: true }';
          return [
            `  { method: ${JSON.stringify(r.method)}, path: ${JSON.stringify(r.path)}, respond: (req, res) => json(res, ${body}) },`,
          ];
        }),
        `];`,
        ``,
        `const server = http.createServer((req, res) => {`,
        `  const url = (req.url || '/').split('?')[0];`,
        `  for (const route of routes) {`,
        `    if (route.method === req.method && route.path === url) {`,
        `      return route.respond(req, res);`,
        `    }`,
        `  }`,
        `  res.writeHead(404, { 'content-type': 'text/plain' });`,
        `  res.end('not found');`,
        `});`,
        ``,
        `server.listen(${port}, () => {`,
        `  console.log('${spec.title} listening on http://localhost:${port}');`,
        `});`,
        ``,
      ];
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
        `)`,
        ``,
        ...spec.records.flatMap((r) => [
          `type ${upperCamel(r.name)} struct {`,
          ...r.fields.map(
            (f) =>
              `\t${upperCamel(f)} ${
                typeof sampleValue(f) === 'number' ? 'int' : 'string'
              } \`json:"${f}"\``,
          ),
          `}`,
          ``,
        ]),
        `func json(w http.ResponseWriter, body interface{}) {`,
        `	w.Header().Set("Content-Type", "application/json")`,
        `	json.NewEncoder(w).Encode(body)`,
        `}`,
        ``,
        `func main() {`,
        ...routes.flatMap((r) => {
          const record = recordForPath(spec, r.path);
          const handler = r.path === '/health'
            ? `json(w, map[string]bool{"ok": true})`
            : record
              ? `json(w, ${upperCamel(record.name)}{${record.fields
                  .map((f) => `${upperCamel(f)}: ${JSON.stringify(sampleValue(f))}`)
                  .join(', ')}})`
              : `json(w, map[string]bool{"ok": true})`;
          return [
            `\thttp.HandleFunc("${r.path}", func(w http.ResponseWriter, req *http.Request) {`,
            `\t\tif req.Method != "${r.method}" {`,
            `\t\t\tw.WriteHeader(http.StatusMethodNotAllowed)`,
            `\t\t\treturn`,
            `\t\t}`,
            `\t\t${handler}`,
            `\t})`,
          ];
        }),
        `	fmt.Println("${spec.title} listening on http://localhost:${port}")`,
        `	http.ListenAndServe(":${port}", nil)`,
        `}`,
        ``,
      ];
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
                    sampleObject(
                      recordForPath(spec, r.path) ?? { name: 'ok', fields: ['ok'] }
                    )
                  )
            },`,
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
