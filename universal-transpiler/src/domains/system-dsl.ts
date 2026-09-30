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
 *           command <name>                (cli)
 *       }
 *   }
 *
 * Comments (#) and blank lines are free-form; unknown domain ids are
 * rejected against the domain catalog with a clear error.
 */

import { DOMAIN_CATALOG } from './domain-analyzer';

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

export interface SystemModule {
  name: string;
  endpoints: SystemEndpoint[];
  commands: SystemCommand[];
}

export interface SystemSpec {
  domain: string;
  title: string;
  platform?: string;
  records: SystemRecord[];
  modules: SystemModule[];
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
  type Block = 'root' | 'record' | 'module';
  let current: Block = 'root';
  let currentRecord: SystemRecord | undefined;
  let currentModule: SystemModule | undefined;
  let closed = false;

  for (let i = 1; i < lines.length; i++) {
    const { text, line } = lines[i];
    if (closed) {
      throw new SystemDslError('nothing may follow the closing } of the system block', line);
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
        currentModule = { name: moduleMatch[1], endpoints: [], commands: [] };
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
      const command = text.match(/^command\s+([a-z][a-z0-9-]*)$/);
      if (command) {
        currentModule.commands.push({ name: command[1] });
        continue;
      }
      throw new SystemDslError(
        `invalid module item "${text}" (expected endpoint <METHOD> <path> or command <name>)`,
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
    for (const command of module.commands) {
      out.push(`        command ${command.name}`);
    }
    out.push('    }');
  }
  out.push('}');
  return out.join('\n') + '\n';
}
