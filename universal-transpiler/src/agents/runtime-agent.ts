/**
 * Universal Transpiler - Runtime Domain Agents
 *
 * The designated agent for every code-execution domain in the catalog
 * (web-frontend, web-backend, cli, systems, data, game, ml, mobile, wasm,
 * testing, script): it owns the domain's flow — interpret, then produce
 * either a domain-typical scaffold (deterministic, dependency-free) or
 * an engine-routed execution of the source, always under the resolved
 * scope and standards.
 */

import type { UniversalEngine } from '../engine/universal-engine';
import type { InterpretationReport } from '../engine/user-contract';
import { resolveStandards, type CodeStandards } from '../engine/user-contract';
import {
  DomainAgent,
  type DomainAgentFlowRequest,
  type DomainAgentFlowResult,
  type DomainAgentProduced,
} from './domain-agent';
import {
  generateScaffold,
  SCAFFOLD_DOMAINS,
  type ScaffoldTarget,
} from './scaffolds';

export class RuntimeDomainAgent implements DomainAgent {
  readonly id: string;
  readonly domain: string;

  constructor(
    private readonly engine: UniversalEngine,
    domain: string
  ) {
    this.domain = domain;
    this.id = `agent:${domain}`;
  }

  canHandle(input: { source: string; domain: string; interpretation: InterpretationReport }): boolean {
    return input.domain.toLowerCase() === this.domain.toLowerCase();
  }

  async flow(request: DomainAgentFlowRequest): Promise<DomainAgentFlowResult> {
    // 1. Interpret: history comparison before anything else
    const interpretation = await this.engine.interpret(request.source, {
      scope: request.scope,
      clientId: request.clientId,
      platform: request.platform,
    });

    const notes: string[] = [];

    // 2. Decide the artifact: scaffold when the domain has one and the
    //    request asks for it (or nothing else was asked and the source
    //    isn't executable in this domain); otherwise execute the source.
    const wantsScaffold =
      request.produce === 'scaffold' ||
      (request.produce === 'code' && SCAFFOLD_DOMAINS.includes(this.domain));
    const produce = !request.produce || request.produce === 'auto' ? 'run' : request.produce;

    if (wantsScaffold || produce === 'scaffold') {
      const target = (request.codeTarget ?? 'javascript') as ScaffoldTarget;
      const code = generateScaffold(this.domain, target);
      if (code === undefined) {
        notes.push(`no ${target} scaffold for domain "${this.domain}"; executed the source instead`);
      } else {
        notes.push(`generated ${target} scaffold for domain "${this.domain}"`);
        // Standards of the produced artifact: the target language's
        // ecosystem standard, overridden by the scope's standards
        const scope = request.scope ? this.engine.getScope(request.scope) : undefined;
        const standards: CodeStandards = resolveStandards(target, scope?.codeStandards);
        const produced: DomainAgentProduced = {
          kind: 'scaffold',
          payload: { domain: this.domain, target },
          text: code,
        };
        return {
          agent: this.id,
          domain: this.domain,
          interpretation,
          produced,
          standards,
          judgment: request.judgment,
          notes,
        };
      }
    }

    if (produce === 'dsl') {
      const text = JSON.stringify(
        {
          domain: this.domain,
          matchedKeywords: interpretation.analysis.matchedKeywords,
          frameworks: interpretation.analysis.frameworks,
          platform: interpretation.analysis.platform,
          route: interpretation.route,
        },
        null,
        2
      );
      return {
        agent: this.id,
        domain: this.domain,
        interpretation,
        produced: { kind: 'dsl-document', text },
        standards: interpretation.standards,
        judgment: request.judgment,
        notes,
      };
    }

    // 3. Execute the source through the engine's routing
    const report = await this.engine.run(request.source, {
      scope: request.scope,
      clientId: request.clientId,
      language: interpretation.analysis.language,
      domain: this.domain,
      platform: request.platform ?? interpretation.analysis.platform,
    });
    notes.push(`route: ${report.route} via ${report.executedLanguage}`);

    return {
      agent: this.id,
      domain: this.domain,
      interpretation,
      produced: {
        kind: 'engine-run',
        payload: {
          ok: report.result.ok,
          route: report.route,
          sourceLanguage: report.sourceLanguage,
          executedLanguage: report.executedLanguage,
        },
        text: report.result.ok ? report.result.stdout : report.result.stderr,
      },
      standards: interpretation.standards,
      judgment: request.judgment,
      notes,
    };
  }
}
