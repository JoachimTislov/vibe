/**
 * Universal Transpiler - System DSL (generalized 5GL) Tests
 *
 * The declarative document form for any domain: parse a `system` block,
 * round-trip it through the emitter, and prove the compiled artifacts —
 * a web-backend server wired to the declared routes and records, a cli
 * dispatcher wired to the declared commands — are real programs (the cli
 * artifacts execute through the engine; servers are content-checked).
 */

import { describe, it, expect, beforeAll } from '@jest/globals';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { UniversalEngine } from '../src/engine/universal-engine';
import {
  parseSystemDsl,
  systemSpecToDsl,
  isSystemDocument,
  SystemDslError,
} from '../src/domains/system-dsl';
import { generateSystemCode } from '../src/domains/system-codegen';

let engine: UniversalEngine;

beforeAll(() => {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'univ-system-'));
  engine = new UniversalEngine({
    timeoutMs: 120_000,
    statePath: path.join(stateDir, 'state.json'),
  });
});

const ORDERS = `# The orders service, declared
system web-backend "Orders service" {
    platform native

    record Order {
        id
        customer
        total
    }

    module api {
        endpoint GET /health
        endpoint GET /orders
        endpoint POST /orders
    }
}
`;

const TOOL = `system cli "Shop tool" {
    module commands {
        command greet
        command inventory
    }
}
`;

describe('system DSL parsing', () => {
  it('parses a web-backend declaration into records, modules and endpoints', () => {
    const doc = parseSystemDsl(ORDERS);
    expect(doc.domain).toBe('web-backend');
    expect(doc.title).toBe('Orders service');
    expect(doc.warnings).toEqual([]);

    expect(doc.spec.platform).toBe('native');
    expect(doc.spec.records).toEqual([
      { name: 'Order', fields: ['id', 'customer', 'total'] },
    ]);
    expect(doc.spec.modules).toEqual([
      {
        name: 'api',
        endpoints: [
          { method: 'GET', path: '/health' },
          { method: 'GET', path: '/orders' },
          { method: 'POST', path: '/orders' },
        ],
        commands: [],
      },
    ]);
  });

  it('parses a cli declaration into commands', () => {
    const doc = parseSystemDsl(TOOL);
    expect(doc.spec.modules[0].commands).toEqual([
      { name: 'greet' },
      { name: 'inventory' },
    ]);
  });

  it('round-trips: emitted DSL parses back to the same spec', () => {
    const doc = parseSystemDsl(ORDERS);
    const emitted = systemSpecToDsl(doc.spec);
    expect(parseSystemDsl(emitted).spec).toEqual(doc.spec);
  });

  it('rejects unknown domains, unclosed blocks and stray content', () => {
    expect(() => parseSystemDsl('system no-such-domain "x" {\n}\n')).toThrow(SystemDslError);
    expect(() => parseSystemDsl('system cli "x" {\n')).toThrow(/not closed/);
    expect(() => parseSystemDsl('system cli "x" {\n}\nextra\n')).toThrow(/nothing may follow/);
    expect(() =>
      parseSystemDsl('system web-backend "x" {\n  module api {\n    nope\n  }\n}\n')
    ).toThrow(/invalid module item/);
    expect(() => parseSystemDsl('workflow food-tracking "x" {\n}\n')).toThrow(/must start with/);
  });

  it('isSystemDocument discriminates without throwing', () => {
    expect(isSystemDocument(ORDERS, 'web-backend')).toBe(true);
    expect(isSystemDocument(ORDERS, 'cli')).toBe(false);
    expect(isSystemDocument('console.log("hi")\n')).toBe(false);
  });
});

describe('system codegen: web-backend', () => {
  it('wires go code to the declared routes and records', () => {
    const code = generateSystemCode(parseSystemDsl(ORDERS).spec, 'go')!;
    expect(code).toContain('package main');
    expect(code).toContain('type Order struct {');
    expect(code).toContain('http.HandleFunc("/health"');
    expect(code).toContain('http.HandleFunc("/orders"');
    expect(code).toContain('req.Method != "POST"');
  });

  it('wires javascript code to the declared routes', () => {
    const code = generateSystemCode(parseSystemDsl(ORDERS).spec, 'javascript')!;
    expect(code).toContain('http.createServer');
    expect(code).toContain(`method: "GET", path: "/health"`);
    expect(code).toContain('OrderSample');
    expect(code).toContain('Orders service listening');
  });

  it('wires python code to the declared routes', () => {
    const code = generateSystemCode(parseSystemDsl(ORDERS).spec, 'python')!;
    expect(code).toContain('http.server');
    expect(code).toContain('("GET", "/health")');
    expect(code).toContain('serve_forever');
  });

  it('yields undefined for domains and targets without codegen', () => {
    expect(generateSystemCode(parseSystemDsl(ORDERS).spec, 'rust' as never)).toBeUndefined();
    expect(generateSystemCode(parseSystemDsl(TOOL).spec, 'go')).toBeDefined();
  });
});

describe('system codegen: cli executes through the engine', () => {
  it('javascript dispatcher routes a declared command', async () => {
    const code = generateSystemCode(parseSystemDsl(TOOL).spec, 'javascript')!;
    const report = await engine.run(code, { language: 'javascript', args: ['greet', 'hi'] });
    expect(report.result.ok).toBe(true);
    expect(report.result.stdout).toContain('greet called with hi');
  });

  it('javascript dispatcher rejects an undeclared command', async () => {
    const code = generateSystemCode(parseSystemDsl(TOOL).spec, 'javascript')!;
    const report = await engine.run(code, { language: 'javascript', args: ['explode'] });
    expect(report.result.ok).toBe(false);
    expect(report.result.stderr).toContain('Commands:');
  });

  it('go dispatcher routes a declared command', async () => {
    const go = engine.toolchains.forLanguage('go');
    await go?.probe();
    if (!go?.info.available) return console.warn('skipping: go unavailable');

    const code = generateSystemCode(parseSystemDsl(TOOL).spec, 'go')!;
    const report = await engine.run(code, { language: 'go', args: ['inventory'] });
    expect(report.result.ok).toBe(true);
    expect(report.result.stdout).toContain('inventory called with no args');
  });

  it('python dispatcher routes a declared command', async () => {
    const python = engine.toolchains.forLanguage('python');
    await python?.probe();
    if (!python?.info.available) return console.warn('skipping: python unavailable');

    const code = generateSystemCode(parseSystemDsl(TOOL).spec, 'python')!;
    const report = await engine.run(code, { language: 'python', args: ['greet', 'world'] });
    expect(report.result.ok).toBe(true);
    expect(report.result.stdout).toContain('greet called with world');
  });
});

describe('dispatch: a system document flows through its designated agent', () => {
  it('web-backend system declaration -> go server code', async () => {
    const result = await engine.dispatch(ORDERS, { produce: 'code', codeTarget: 'go' });
    expect(result.agent).toBe('agent:web-backend');
    expect(result.produced.kind).toBe('generated-code');
    expect((result.produced.payload as { strategy: string }).strategy).toBe('system-dsl');
    expect(result.produced.text).toContain('http.HandleFunc("/orders"');
    expect(result.standards.style).toBe('gofmt');
  });

  it('cli system declaration executes the compiled dispatcher', async () => {
    const result = await engine.dispatch(TOOL, { produce: 'code', codeTarget: 'go' });
    expect(result.agent).toBe('agent:cli');
    expect((result.produced.payload as { strategy: string }).strategy).toBe('system-dsl');
    expect(result.produced.text).toContain('greet');

    // The compiled artifact is a real program: run it through the engine
    const run = await engine.run(result.produced.text, { language: 'go', args: ['greet', 'there'] });
    expect(run.result.ok).toBe(true);
    expect(run.result.stdout).toContain('greet called with there');
  });

  it('produce dsl re-emits the canonical system document', async () => {
    const result = await engine.dispatch(ORDERS, { produce: 'dsl' });
    expect(result.produced.kind).toBe('dsl-document');
    expect(result.produced.text).toContain('system web-backend "Orders service"');
    // Round-trip: the emitted text parses to the same declaration
    expect(parseSystemDsl(result.produced.text).spec).toEqual(parseSystemDsl(ORDERS).spec);
  });
});
