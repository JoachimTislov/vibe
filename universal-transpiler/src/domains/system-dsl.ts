/**
 * Universal Transpiler - System DSL (the generalized 5GL layer)
 *
 * The declarative document form for ANY domain: a `system` block names a
 * domain, declares records and the modules that expose behavior (HTTP
 * endpoints for web-backend, commands for cli). A designated agent turns
 * the declaration into a runnable artifact in any supported target —
 * the "declaratively create advanced modular systems" chain, one domain
 * vocabulary at a time.
 *
 * Grammar:
 *
 *   system <domain> "<title>" {
 *       platform <platform>
 *
 *       record <Name> {
 *           <field>
 *           <field>
 *       }
 *
 *       module <name> {
 *           endpoint <METHOD> <path>     (web-backend)
 *           resource <Record>            (web-backend: CRUD store)
 *           command <name>                (cli)
 *           job <name> over <Record>      (data)
 *           case <name>                   (testing)
 *           export <f>(i32 i32) -> i32    (wasm)
 *           shopping-list                (food-tracking: needs a workflow)
 *       }
 *
 *       workflow "<title>" { ... }      (food-tracking: an embedded
 *                                        workflow DSL body; rules block
 *                                        follows the workflow grammar)
 *   }
 *
 * Comments (#) and blank lines are free-form; unknown domain ids are
 * rejected against the domain catalog with a clear error.
 */

import { DOMAIN_CATALOG } from './domain-analyzer';
import { parseWorkflowDsl, specToDsl } from './workflow-dsl';
import type { FoodWorkflowSpec } from './foodsavr';

// ============================================================================
// Types
// ============================================================================

export interface SystemRecord {
  name: string;
  fields: string[];
}

export interface SystemEndpoint {
  method: string;
  path: string;
}

export interface SystemCommand {
  name: string;
}

/** A CRUD resource over a declared record (web-backend). */
export interface SystemResource {
  /** The record name the store holds */
  record: string;
}

/** A data job run over a record's samples (data). */
export interface SystemJob {
  name: string;
  record: string;
}

/** A declared test case (testing). */
export interface SystemTestCase {
  name: string;
}

/** An exported wasm function (wasm). */
export interface SystemExport {
  name: string;
  /** Parameter types (i32 today) */
  params: string[];
  /** Result type (i32 today) */
  result: string;
}

/** A shopping-list endpoint item (food-tracking). */
export interface SystemShoppingList {
  record: string;
}

export interface SystemModule {
  name: string;
  endpoints: SystemEndpoint[];
  commands: SystemCommand[];
  resources: SystemResource[];
  jobs: SystemJob[];
  cases: SystemTestCase[];
  exports: SystemExport[];
  shoppingLists: SystemShoppingList[];
}

/** An embedded food workflow (the food-tracking bridge). */
export interface SystemWorkflow {
  title: string;
  /** The composed FoodWorkflowSpec, parsed by the workflow DSL grammar */
  spec: FoodWorkflowSpec;
}

export interface SystemSpec {
  domain: string;
  title: string;
  platform?: string;
  records: SystemRecord[];
  modules: SystemModule[];
  workflow?: SystemWorkflow;
}

export interface ParsedSystemDocument {
  domain: string;
  title: string;
  spec: SystemSpec;
  warnings: string[];
}

export class SystemDslError extends Error {
  constructor(
    message: string,
    public readonly line: number
  ) {
    super(`system DSL error (line ${line}): ${message}`);
    this.name = 'SystemDslError';
  }
}

// ============================================================================
// Parser
// ============================================================================

const REGISTERED_DOMAINS = new Set(DOMAIN_CATALOG.map((d) => d.id));

function stripComment(line: string): string {
  const hash = line.indexOf('#');
  return (hash >= 0 ? line.slice(0, hash) : line).trim();
}

export function parseSystemDsl(source: string): ParsedSystemDocument {
  const warnings: string[] = [];
  const lines = source
    .split(/\r?\n/)
    .map((text, index) => ({ text: stripComment(text), line: index + 1 }))
    .filter((l) => l.text.length > 0);

  // ---- Header: system <domain> "<title>" { ----
  const header = lines[0];
  if (!header || !header.text.startsWith('system ')) {
    throw new SystemDslError('a document must start with: system <domain> "<title>" {', header?.line ?? 1);
  }
  const headerMatch = header.text.match(/^system\s+([a-z][a-z0-9-]*)\s+"([^"]*)"\s+\{$/);
  if (!headerMatch) {
    throw new SystemDslError(
      'expected: system <domain> "<title>" { (domain is a registered domain id)',
      header.line
    );
  }
  const domain = headerMatch[1];
  if (!REGISTERED_DOMAINS.has(domain)) {
    throw new SystemDslError(`unknown domain "${domain}" (not in the domain catalog)`, header.line);
  }

  const spec: SystemSpec = {
    domain,
    title: headerMatch[2],
    records: [],
    modules: [],
  };

  // ---- Body: a small block-structured walk ----
  type Block = 'root' | 'record' | 'module' | 'raw';
  let current: Block = 'root';
  let currentRecord: SystemRecord | undefined;
  let currentModule: SystemModule | undefined;
  let closed = false;

  // Raw capture for the embedded workflow block (food-tracking): its body
  // is parsed by the workflow DSL grammar after this walk
  let workflowTitle: string | undefined;
  const workflowBody: string[] = [];
  const rulesBody: string[] = [];
  let rawTarget: 'workflow' | 'rules' | null = null;
  let rawDepth = 0;

  for (let i = 1; i < lines.length; i++) {
    const { text, line } = lines[i];
    if (closed) {
      throw new SystemDslError('nothing may follow the closing } of the system block', line);
    }
    if (current === 'raw' && rawTarget) {
      // Raw capture: count braces; the workflow body nests collections,
      // so depth tracking decides where the block ends
      const opens = (text.match(/{/g) || []).length;
      const closes = (text.match(/}/g) || []).length;
      if (closes > 0 && rawDepth + opens - closes === 0) {
        current = 'root';
        rawTarget = null;
        rawDepth = 0;
        continue;
      }
      rawDepth += opens - closes;
      (rawTarget === 'workflow' ? workflowBody : rulesBody).push(text);
      continue;
    }

    if (text === '}') {
      if (current === 'root') {
        closed = true;
        continue;
      }
      current = 'root';
      currentRecord = undefined;
      currentModule = undefined;
      continue;
    }

    if (current === 'root') {
      const workflowMatch = text.match(/^workflow\s+"([^"]*)"\s+\{$/);
      if (workflowMatch) {
        if (domain !== 'food-tracking') {
          throw new SystemDslError(
            'an embedded workflow block is only valid in the food-tracking domain',
            line
          );
        }
        if (workflowTitle !== undefined) {
          throw new SystemDslError('only one workflow block may be declared', line);
        }
        workflowTitle = workflowMatch[1];
        rawTarget = 'workflow';
        rawDepth = 1;
        current = 'raw';
        continue;
      }
      if (text === 'rules {') {
        if (domain !== 'food-tracking') {
          throw new SystemDslError('a rules block is only valid in the food-tracking domain', line);
        }
        rawTarget = 'rules';
        rawDepth = 1;
        current = 'raw';
        continue;
      }
      const platformMatch = text.match(/^platform\s+([a-z-]+)$/);
      if (platformMatch) {
        spec.platform = platformMatch[1];
        continue;
      }
      const recordMatch = text.match(/^record\s+([A-Za-z_][A-Za-z0-9_]*)\s+\{$/);
      if (recordMatch) {
        current = 'record';
        currentRecord = { name: recordMatch[1], fields: [] };
        spec.records.push(currentRecord);
        continue;
      }
      const moduleMatch = text.match(/^module\s+([a-z][a-z0-9-]*)\s+\{$/);
      if (moduleMatch) {
        current = 'module';
        currentModule = {
          name: moduleMatch[1],
          endpoints: [],
          commands: [],
          resources: [],
          jobs: [],
          cases: [],
          exports: [],
          shoppingLists: [],
        };
        spec.modules.push(currentModule);
        continue;
      }
      throw new SystemDslError(
        'expected: platform <p>, record <Name> {, module <name> { or }',
        line
      );
    }

    if (current === 'record' && currentRecord) {
      const field = text.match(/^[a-z][a-z0-9_]*$/);
      if (!field) {
        throw new SystemDslError(`invalid record field "${text}" (expected a plain field name)`, line);
      }
      currentRecord.fields.push(field[0]);
      continue;
    }

    if (current === 'module' && currentModule) {
      const endpoint = text.match(/^endpoint\s+([A-Z]+)\s+(\/[^\s]*)$/);
      if (endpoint) {
        currentModule.endpoints.push({ method: endpoint[1], path: endpoint[2] });
        continue;
      }
      const resource = text.match(/^resource\s+([A-Za-z_][A-Za-z0-9_]*)$/);
      if (resource) {
        currentModule.resources.push({ record: resource[1] });
        continue;
      }
      const command = text.match(/^command\s+([a-z][a-z0-9-]*)$/);
      if (command) {
        currentModule.commands.push({ name: command[1] });
        continue;
      }
      const job = text.match(/^job\s+([a-z][a-z0-9-]*)\s+over\s+([A-Za-z_][A-Za-z0-9_]*)$/);
      if (job) {
        currentModule.jobs.push({ name: job[1], record: job[2] });
        continue;
      }
      const testCase = text.match(/^case\s+([a-z][a-z0-9-]*)$/);
      if (testCase) {
        currentModule.cases.push({ name: testCase[1] });
        continue;
      }
      if (text === 'shopping-list') {
        currentModule.shoppingLists.push({ record: '' });
        continue;
      }
      const wasmExport = text.match(/^export\s+([a-z][a-z0-9_]*)\(([^)]*)\)\s*->\s*(i32)$/);
      if (wasmExport) {
        const params = wasmExport[2]
          .split(/[\s,]+/)
          .filter(Boolean);
        if (params.length === 0 || params.some((p) => p !== 'i32')) {
          throw new SystemDslError('export parameters must be i32 (the only wasm type this layer emits)', line);
        }
        currentModule.exports.push({ name: wasmExport[1], params, result: wasmExport[3] });
        continue;
      }
      throw new SystemDslError(
        'invalid module item (expected endpoint, resource, command, job, case or export)',
        line
      );
    }
  }

  if (!closed) {
    throw new SystemDslError('the system block is not closed (missing })', lines[0]?.line ?? 1);
  }
  if (spec.modules.length === 0 && spec.records.length === 0) {
    warnings.push('document declares no modules and no records; the produced artifact is minimal');
  }

  // The embedded workflow: synthesize a standalone workflow document and
  // parse it with the workflow DSL grammar (the 5GL bridge — a system
  // declaration that carries domain logic)
  if (workflowTitle !== undefined) {
    const synthesized =
      `workflow food-tracking "${workflowTitle}" {\n${workflowBody.join('\n')}\n}\n` +
      (rulesBody.length > 0 ? `rules {\n${rulesBody.join('\n')}\n}\n` : '');
    try {
      const workflowDoc = parseWorkflowDsl(synthesized);
      spec.workflow = { title: workflowTitle, spec: workflowDoc.spec };
    } catch (err) {
      throw new SystemDslError(
        `embedded workflow: ${(err as Error).message}`,
        header.line
      );
    }
  }

  // shopping-list endpoints require the embedded workflow
  for (const module of spec.modules) {
    if (module.shoppingLists.length > 0 && !spec.workflow) {
      throw new SystemDslError(
        `module "${module.name}" declares shopping-list but the document declares no workflow block`,
        header.line
      );
    }
  }

  // Reference integrity: resources and jobs must point at declared records;
  // a resource store keys by the record's id field
  const recordNames = new Set(spec.records.map((r) => r.name));
  for (const module of spec.modules) {
    for (const resource of module.resources) {
      const record = spec.records.find((r) => r.name === resource.record);
      if (!record) {
        throw new SystemDslError(
          `resource "${resource.record}" references an undeclared record (declare it with: record ${resource.record} { ... })`,
          header.line
        );
      }
      if (!record.fields.some((f) => f.toLowerCase() === 'id')) {
        throw new SystemDslError(
          `record ${resource.record} is used as a resource but has no id field (stores key by id)`,
          header.line
        );
      }
    }
    for (const job of module.jobs) {
      if (!recordNames.has(job.record)) {
        throw new SystemDslError(
          `job "${job.name}" references an undeclared record "${job.record}"`,
          header.line
        );
      }
    }
  }

  return { domain, title: spec.title, spec, warnings };
}

/** True when a source parses as a system document for the given domain. */
export function isSystemDocument(source: string, domain?: string): boolean {
  try {
    const doc = parseSystemDsl(source);
    return domain === undefined || doc.domain === domain.toLowerCase();
  } catch {
    return false;
  }
}

// ============================================================================
// Emission: spec -> DSL text (round-trip)
// ============================================================================

export function systemSpecToDsl(spec: SystemSpec): string {
  const out: string[] = [];
  out.push(`system ${spec.domain} "${spec.title}" {`);
  if (spec.platform) out.push(`    platform ${spec.platform}`);
  for (const record of spec.records) {
    out.push(`    record ${record.name} {`);
    for (const field of record.fields) out.push(`        ${field}`);
    out.push('    }');
  }
  for (const module of spec.modules) {
    out.push(`    module ${module.name} {`);
    for (const endpoint of module.endpoints) {
      out.push(`        endpoint ${endpoint.method} ${endpoint.path}`);
    }
    for (const resource of module.resources) {
      out.push(`        resource ${resource.record}`);
    }
    for (const command of module.commands) {
      out.push(`        command ${command.name}`);
    }
    for (const job of module.jobs) {
      out.push(`        job ${job.name} over ${job.record}`);
    }
    for (const testCase of module.cases) {
      out.push(`        case ${testCase.name}`);
    }
    for (const exported of module.exports) {
      out.push(`        export ${exported.name}(${exported.params.join(' ')}) -> ${exported.result}`);
    }
    for (const _ of module.shoppingLists) {
      out.push('        shopping-list');
    }
    out.push('    }');
  }
  if (spec.workflow) {
    // The embedded workflow, re-emitted with the workflow DSL grammar
    // (indented into the system block) so the document round-trips
    const workflowDoc = specToDsl(spec.workflow.spec, spec.workflow.title);
    const docLines = workflowDoc.split('\n');
    const closeIdx = docLines.indexOf('}');
    out.push('');
    out.push(`    workflow "${spec.workflow.title}" {`);
    for (const bodyLine of docLines.slice(1, closeIdx)) {
      out.push(`    ${bodyLine}`);
    }
    out.push('    }');
    const rulesLines = docLines.slice(closeIdx + 1).filter((l) => l.length > 0);
    if (rulesLines.length > 0) {
      out.push('');
      for (const rulesLine of rulesLines) {
        out.push(`    ${rulesLine}`);
      }
    }
  }
  out.push('}');
  return out.join('\n') + '\n';
}
