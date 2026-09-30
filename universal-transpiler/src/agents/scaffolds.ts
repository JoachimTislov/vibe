/**
 * Universal Transpiler - Domain Scaffolds
 *
 * Deterministic, dependency-free project scaffolds per domain and target
 * language: what a designated agent emits for produce: 'scaffold'. Each
 * generated program is a minimal, runnable representative of its domain
 * (an HTTP server for web-backend, an argv-driven program for cli, a
 * test module for testing...). The same domain vocabulary the analyzer
 * scores becomes the shape of the produced system.
 */

export type ScaffoldTarget = 'javascript' | 'typescript' | 'go' | 'rust' | 'java' | 'python';

/** Domains that have scaffold generators (checked by RuntimeDomainAgent). */
export const SCAFFOLD_DOMAINS: string[] = [
  'web-backend',
  'web-frontend',
  'cli',
  'testing',
  'data',
  'systems',
];

export interface ScaffoldOptions {
  /** Name for the generated entry point / module (default: the domain id) */
  name?: string;
  /** Port for server scaffolds (default: 8080) */
  port?: number;
}

const upperCamel = (s: string): string =>
  s
    .split(/[-_]/)
    .filter(Boolean)
    .map((p) => p[0].toUpperCase() + p.slice(1))
    .join('');

/**
 * Generate a domain-typical scaffold for a target language. Returns
 * undefined when this domain has no scaffold for that target — callers
 * fall back to the engine's routing.
 */
export function generateScaffold(
  domain: string,
  target: ScaffoldTarget,
  options: ScaffoldOptions = {}
): string | undefined {
  const name = options.name ?? upperCamel(domain);
  const port = options.port ?? 8080;

  switch (domain) {
    case 'web-backend':
      return webBackend(target, name, port);
    case 'web-frontend':
      return webFrontend(target, name);
    case 'cli':
      return cli(target, name);
    case 'testing':
      return testing(target, name);
    case 'data':
      return data(target, name);
    case 'systems':
      return systems(target, name);
    default:
      return undefined;
  }
}

// ============================================================================
// web-backend: a minimal HTTP server
// ============================================================================

function webBackend(target: ScaffoldTarget, name: string, port: number): string | undefined {
  switch (target) {
    case 'javascript':
    case 'typescript':
      return [
        `// ${name}: web-backend scaffold (node)`,
        `const http = require('http');`,
        ``,
        `const server = http.createServer((req, res) => {`,
        `  if (req.url === '/health') {`,
        `    res.writeHead(200, { 'content-type': 'application/json' });`,
        `    res.end(JSON.stringify({ ok: true, service: '${name}' }));`,
        `    return;`,
        `  }`,
        `  res.writeHead(200, { 'content-type': 'text/plain' });`,
        `  res.end('${name} web-backend scaffold\\n');`,
        `});`,
        ``,
        `server.listen(${port}, () => {`,
        `  console.log('${name} listening on http://localhost:${port}');`,
        `});`,
        ``,
      ].join('\n');
    case 'go':
      return [
        `// ${name}: web-backend scaffold (net/http)`,
        `package main`,
        ``,
        `import (`,
        `	"encoding/json"`,
        `	"fmt"`,
        `	"net/http"`,
        `)`,
        ``,
        `func main() {`,
        `	http.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {`,
        `		w.Header().Set("Content-Type", "application/json")`,
        `		json.NewEncoder(w).Encode(map[string]bool{"ok": true})`,
        `	})`,
        `	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {`,
        `		fmt.Fprintf(w, "${name} web-backend scaffold\\n")`,
        `	})`,
        `	fmt.Println("${name} listening on http://localhost:${port}")`,
        `	http.ListenAndServe(":${port}", nil)`,
        `}`,
        ``,
      ].join('\n');
    case 'rust':
      return [
        `// ${name}: web-backend scaffold (std TCP + minimal HTTP)`,
        `use std::io::{BufRead, BufReader, Write};`,
        `use std::net::TcpListener;`,
        ``,
        `fn main() {`,
        `    let listener = TcpListener::bind("127.0.0.1:${port}").expect("bind");`,
        `    println!("${name} listening on http://localhost:${port}");`,
        `    for stream in listener.incoming() {`,
        `        let mut stream = stream.expect("accept");`,
        `        let reader = BufReader::new(&stream);`,
        `        let request_line = reader.lines().next().and_then(|l| l.ok());`,
        `        let (status, body) = match request_line.as_deref() {`,
        `            Some(line) if line.contains("/health") => ("200 OK", format!(r#"{"ok":true,"service":"${name}"}"#)),`,
        `            _ => ("200 OK", "${name} web-backend scaffold\\n".to_string()),`,
        `        };`,
        `        let response = format!(`,
        `            "HTTP/1.1 {}\\r\\nContent-Type: text/plain\\r\\nContent-Length: {}\\r\\nConnection: close\\r\\n\\r\\n{}",`,
        `            status,`,
        `            body.len(),`,
        `            body`,
        `        );`,
        `        stream.write_all(response.as_bytes()).expect("write");`,
        `    }`,
        `}`,
        ``,
      ].join('\n');
    case 'java':
      return [
        `// ${name}: web-backend scaffold (jdk httpserver)`,
        `import com.sun.net.httpserver.HttpServer;`,
        `import java.io.OutputStream;`,
        `import java.net.InetSocketAddress;`,
        ``,
        `public class Main {`,
        `    public static void main(String[] args) throws Exception {`,
        `        HttpServer server = HttpServer.create(new InetSocketAddress(${port}), 0);`,
        `        server.createContext("/health", exchange -> {`,
        `            byte[] body = "{\\"ok\\":true}".getBytes();`,
        `            exchange.getResponseHeaders().set("Content-Type", "application/json");`,
        `            exchange.sendResponseHeaders(200, body.length);`,
        `            try (OutputStream out = exchange.getResponseBody()) {`,
        `                out.write(body);`,
        `            }`,
        `        });`,
        `        server.createContext("/", exchange -> {`,
        `            byte[] body = "${name} web-backend scaffold".getBytes();`,
        `            exchange.sendResponseHeaders(200, body.length);`,
        `            try (OutputStream out = exchange.getResponseBody()) {`,
        `                out.write(body);`,
        `            }`,
        `        });`,
        `        server.start();`,
        `        System.out.println("${name} listening on http://localhost:${port}");`,
        `    }`,
        `}`,
        ``,
      ].join('\n');
    case 'python':
      return [
        `# ${name}: web-backend scaffold (http.server)`,
        `import json`,
        `from http.server import BaseHTTPRequestHandler, HTTPServer`,
        ``,
        ``,
        `class Handler(BaseHTTPRequestHandler):`,
        `    def do_GET(self):`,
        `        if self.path == "/health":`,
        `            body = json.dumps({"ok": True, "service": "${name}"}).encode()`,
        `            self.send_response(200)`,
        `            self.send_header("Content-Type", "application/json")`,
        `        else:`,
        `            body = "${name} web-backend scaffold".encode()`,
        `            self.send_response(200)`,
        `            self.send_header("Content-Type", "text/plain")`,
        `        self.send_header("Content-Length", str(len(body)))`,
        `        self.end_headers()`,
        `        self.wfile.write(body)`,
        ``,
        ``,
        `if __name__ == "__main__":`,
        `    print("${name} listening on http://localhost:${port}")`,
        `    HTTPServer(("127.0.0.1", ${port}), Handler).serve_forever()`,
        ``,
      ].join('\n');
  }
}

// ============================================================================
// web-frontend: an HTML page with a browser module
// ============================================================================

function webFrontend(target: ScaffoldTarget, name: string): string | undefined {
  if (target !== 'javascript' && target !== 'typescript') return undefined;
  return [
    `<!doctype html>`,
    `<!-- ${name}: web-frontend scaffold -->`,
    `<html lang="en">`,
    `  <head>`,
    `    <meta charset="utf-8" />`,
    `    <meta name="viewport" content="width=device-width, initial-scale=1" />`,
    `    <title>${name}</title>`,
    `  </head>`,
    `  <body>`,
    `    <main id="app">`,
    `      <h1>${name}</h1>`,
    `      <p>web-frontend scaffold</p>`,
    `    </main>`,
    `    <script>`,
    `      document.querySelector('#app').addEventListener('click', () => {`,
    `        console.log('${name} interacted');`,
    `      });`,
    `    </script>`,
    `  </body>`,
    `</html>`,
    ``,
  ].join('\n');
}

// ============================================================================
// cli: an argv-driven program
// ============================================================================

function cli(target: ScaffoldTarget, name: string): string | undefined {
  switch (target) {
    case 'javascript':
    case 'typescript':
      return [
        `// ${name}: cli scaffold`,
        `const args = process.argv.slice(2);`,
        ``,
        `if (args.includes('--help')) {`,
        `  console.log('Usage: ${name.toLowerCase()} [--help] [--name <name>]');`,
        `  process.exit(0);`,
        `}`,
        ``,
        `const nameIndex = args.indexOf('--name');`,
        `const who = nameIndex >= 0 ? args[nameIndex + 1] : 'world';`,
        `console.log(\`${name.toLowerCase()}: hello \${who}\`);`,
        ``,
      ].join('\n');
    case 'go':
      return [
        `// ${name}: cli scaffold`,
        `package main`,
        ``,
        `import (`,
        `	"flag"`,
        `	"fmt"`,
        `)`,
        ``,
        `func main() {`,
        `	name := flag.String("name", "world", "who to greet")`,
        `	flag.Parse()`,
        `	fmt.Println("${name.toLowerCase()}: hello", *name)`,
        `}`,
        ``,
      ].join('\n');
    case 'rust':
      return [
        `// ${name}: cli scaffold`,
        `fn main() {`,
        `    let mut who = "world".to_string();`,
        `    let args: Vec<String> = std::env::args().collect();`,
        `    if let Some(pos) = args.iter().position(|a| a == "--name") {`,
        `        if let Some(value) = args.get(pos + 1) {`,
        `            who = value.clone();`,
        `        }`,
        `    }`,
        `    if args.iter().any(|a| a == "--help") {`,
        `        println!("Usage: ${name.toLowerCase()} [--help] [--name <name>]");`,
        `        return;`,
        `    }`,
        `    println!("${name.toLowerCase()}: hello {}", who);`,
        `}`,
        ``,
      ].join('\n');
    case 'java':
      return [
        `// ${name}: cli scaffold`,
        `public class Main {`,
        `    public static void main(String[] args) {`,
        `        String who = "world";`,
        `        for (int i = 0; i < args.length - 1; i++) {`,
        `            if ("--name".equals(args[i])) {`,
        `                who = args[i + 1];`,
        `            }`,
        `        }`,
        `        System.out.println("${name.toLowerCase()}: hello " + who);`,
        `    }`,
        `}`,
        ``,
      ].join('\n');
    case 'python':
      return [
        `# ${name}: cli scaffold`,
        `import argparse`,
        ``,
        ``,
        `def main():`,
        `    parser = argparse.ArgumentParser(prog="${name.toLowerCase()}")`,
        `    parser.add_argument("--name", default="world", help="who to greet")`,
        `    args = parser.parse_args()`,
        `    print(f"\${name.lower()}: hello {args.name}")`,
        ``,
        ``,
        `if __name__ == "__main__":`,
        `    main()`,
        ``,
      ].join('\n');
  }
}

// ============================================================================
// testing: a runnable test module
// ============================================================================

function testing(target: ScaffoldTarget, name: string): string | undefined {
  switch (target) {
    case 'javascript':
    case 'typescript':
      return [
        `// ${name}: testing scaffold (node:test)`,
        `const test = require('node:test');`,
        `const assert = require('node:assert');`,
        ``,
        `function add(a, b) {`,
        `  return a + b;`,
        `}`,
        ``,
        `test('${name.toLowerCase()} adds integers', () => {`,
        `  assert.strictEqual(add(2, 3), 5);`,
        `});`,
        ``,
        `test('${name.toLowerCase()} adds floats', () => {`,
        `  assert.strictEqual(add(0.1, 0.2), 0.30000000000000004);`,
        `});`,
        ``,
      ].join('\n');
    case 'go':
      return [
        `// ${name}: testing scaffold`,
        `package main`,
        ``,
        `import "testing"`,
        ``,
        `func add(a, b int) int { return a + b }`,
        ``,
        `func TestAdd(t *testing.T) {`,
        `	if got := add(2, 3); got != 5 {`,
        `		t.Errorf("add(2, 3) = %d, want 5", got)`,
        `	}`,
        `}`,
        ``,
      ].join('\n');
    case 'rust':
      return [
        `// ${name}: testing scaffold`,
        `fn add(a: i32, b: i32) -> i32 {`,
        `    a + b`,
        `}`,
        ``,
        `#[cfg(test)]`,
        `mod tests {`,
        `    use super::*;`,
        ``,
        `    #[test]`,
        `    fn it_adds() {`,
        `        assert_eq!(add(2, 3), 5);`,
        `    }`,
        `}`,
        ``,
      ].join('\n');
    case 'java':
      return [
        `// ${name}: testing scaffold (plain assertions)`,
        `public class Main {`,
        `    static int add(int a, int b) { return a + b; }`,
        ``,
        `    public static void main(String[] args) throws Exception {`,
        `        if (add(2, 3) != 5) {`,
        `            throw new AssertionError("add(2, 3) != 5");`,
        `        }`,
        `        System.out.println("${name.toLowerCase()}: all tests passed");`,
        `    }`,
        `}`,
        ``,
      ].join('\n');
    case 'python':
      return [
        `# ${name}: testing scaffold (unittest)`,
        `import unittest`,
        ``,
        ``,
        `def add(a, b):`,
        `    return a + b`,
        ``,
        ``,
        `class TestAdd(unittest.TestCase):`,
        `    def test_adds(self):`,
        `        self.assertEqual(add(2, 3), 5)`,
        ``,
        ``,
        `if __name__ == "__main__":`,
        `    unittest.main()`,
        ``,
      ].join('\n');
  }
}

// ============================================================================
// data: a JSON records pipeline
// ============================================================================

function data(target: ScaffoldTarget, name: string): string | undefined {
  switch (target) {
    case 'javascript':
    case 'typescript':
      return [
        `// ${name}: data scaffold`,
        `const records = [`,
        `  { id: 1, value: 10 },`,
        `  { id: 2, value: 32 },`,
        `  { id: 3, value: 7 },`,
        `];`,
        ``,
        `const total = records.reduce((sum, r) => sum + r.value, 0);`,
        `const mean = total / records.length;`,
        `console.log(JSON.stringify({ count: records.length, total, mean }, null, 2));`,
        ``,
      ].join('\n');
    case 'go':
      return [
        `// ${name}: data scaffold`,
        `package main`,
        ``,
        `import "fmt"`,
        ``,
        `func main() {`,
        `	records := []struct {`,
        `		id    int`,
        `		value int`,
        `	}{`,
        `		{1, 10}, {2, 32}, {3, 7},`,
        `	}`,
        `	total := 0`,
        `	for _, r := range records {`,
        `		total += r.value`,
        `	}`,
        `	fmt.Printf("count=%d total=%d mean=%.2f\\n", len(records), total, float64(total)/float64(len(records)))`,
        `}`,
        ``,
      ].join('\n');
    case 'rust':
      return [
        `// ${name}: data scaffold`,
        `fn main() {`,
        `    let records = [(1, 10), (2, 32), (3, 7)];`,
        `    let total: i32 = records.iter().map(|r| r.1).sum();`,
        `    let mean = total as f64 / records.len() as f64;`,
        `    println!("count={} total={} mean={:.2}", records.len(), total, mean);`,
        `}`,
        ``,
      ].join('\n');
    case 'java':
      return [
        `// ${name}: data scaffold`,
        `public class Main {`,
        `    public static void main(String[] args) {`,
        `        int[] values = {10, 32, 7};`,
        `        int total = 0;`,
        `        for (int v : values) {`,
        `            total += v;`,
        `        }`,
        `        double mean = (double) total / values.length;`,
        `        System.out.printf("count=%d total=%d mean=%.2f%n", values.length, total, mean);`,
        `    }`,
        `}`,
        ``,
      ].join('\n');
    case 'python':
      return [
        `# ${name}: data scaffold`,
        `records = [{"id": 1, "value": 10}, {"id": 2, "value": 32}, {"id": 3, "value": 7}]`,
        `total = sum(r["value"] for r in records)`,
        `mean = total / len(records)`,
        `print(f"count={len(records)} total={total} mean={mean:.2f}")`,
        ``,
      ].join('\n');
  }
}

// ============================================================================
// systems: threads, channels and counters
// ============================================================================

function systems(target: ScaffoldTarget, name: string): string | undefined {
  switch (target) {
    case 'javascript':
    case 'typescript':
      return [
        `// ${name}: systems scaffold (worker thread)`,
        `const { Worker, isMainThread } = require('node:worker_threads');`,
        ``,
        `if (isMainThread) {`,
        `  const worker = new Worker(__filename);`,
        `  worker.on('message', (total) => {`,
        `    console.log(\`${name.toLowerCase()}: worker computed total=\${total}\`);`,
        `  });`,
        `} else {`,
        `  let total = 0;`,
        `  for (let i = 0; i < 1_000_000; i++) {`,
        `    total += i;`,
        `  }`,
        `  require('node:worker_threads').parentPort.postMessage(total);`,
        `}`,
        ``,
      ].join('\n');
    case 'go':
      return [
        `// ${name}: systems scaffold (goroutines + channel)`,
        `package main`,
        ``,
        `import "fmt"`,
        ``,
        `func main() {`,
        `	results := make(chan int, 4)`,
        `	for i := 0; i < 4; i++ {`,
        `		go func(n int) { results <- n * n }(i)`,
        `	}`,
        `	total := 0`,
        `	for i := 0; i < 4; i++ {`,
        `		total += <-results`,
        `	}`,
        `	fmt.Println("${name.toLowerCase()}: goroutine total =", total)`,
        `}`,
        ``,
      ].join('\n');
    case 'rust':
      return [
        `// ${name}: systems scaffold (std threads)`,
        `use std::thread;`,
        ``,
        `fn main() {`,
        `    let handles: Vec<_> = (0..4)`,
        `        .map(|n| thread::spawn(move || n * n))`,
        `        .collect();`,
        `    let total: i32 = handles.into_iter().map(|h| h.join().unwrap()).sum();`,
        `    println!("${name.toLowerCase()}: thread total = {}", total);`,
        `}`,
        ``,
      ].join('\n');
    case 'java':
      return [
        `// ${name}: systems scaffold (executor)`,
        `import java.util.concurrent.*;`,
        ``,
        `public class Main {`,
        `    public static void main(String[] args) throws Exception {`,
        `        ExecutorService pool = Executors.newFixedThreadPool(4);`,
        `        int total = 0;`,
        `        for (int i = 0; i < 4; i++) {`,
        `            final int n = i;`,
        `            total += pool.submit(() -> n * n).get();`,
        `        }`,
        `        pool.shutdown();`,
        `        System.out.println("${name.toLowerCase()}: thread total = " + total);`,
        `    }`,
        `}`,
        ``,
      ].join('\n');
    case 'python':
      return [
        `# ${name}: systems scaffold (multiprocessing)`,
        `from multiprocessing import Pool`,
        ``,
        ``,
        `def square(n):`,
        `    return n * n`,
        ``,
        ``,
        `if __name__ == "__main__":`,
        `    with Pool(4) as pool:`,
        `        total = sum(pool.map(square, range(4)))`,
        `    print(f"{name.lower()}: process total = {total}")`,
        ``,
      ].join('\n');
  }
}
