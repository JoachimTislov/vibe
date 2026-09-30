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

    if (wantsScaffold || produce === 'scaffold' || produce === 'code') {
      const target = (request.codeTarget ?? 'javascript') as ScaffoldTarget;
      const code = generateScaffold(this.domain, target);

      // No deterministic scaffold for this domain/target: the LLM tier
      // generates the domain code on the fly (still under the resolved
      // standards; the judgment layer stays reserved for decisions).
      const finalCode =
        code ??
        (await this.generateViaLLM(target, interpretation, request)) ??
        undefined;

      if (finalCode === undefined) {
        notes.push(
          `no ${target} scaffold for domain "${this.domain}" and no LLM configured; executed the source instead`
        );
      } else {
        notes.push(
          code !== undefined
            ? `generated ${target} scaffold for domain "${this.domain}"`
            : `generated ${target} domain code for "${this.domain}" via the LLM tier`
        );
        // Standards of the produced artifact: the target language's
        // ecosystem standard, overridden by the scope's standards
        const scope = request.scope ? this.engine.getScope(request.scope) : undefined;
        const standards: CodeStandards = resolveStandards(target, scope?.codeStandards);
        const produced: DomainAgentProduced = {
          kind: code !== undefined ? 'scaffold' : 'generated-code',
          payload: {
            domain: this.domain,
            target,
            strategy: code !== undefined ? 'deterministic-scaffold' : 'llm-generated',
          },
          text: finalCode,
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

  /**
   * The LLM produce tier: generate domain-typical code for a target when
   * no deterministic scaffold exists. The prompt carries the structured
   * interpretation (domain, matched keywords, frameworks, platform,
   * standards) — machine-consumable evidence, not free-form intent.
   */
  private async generateViaLLM(
    target: string,
    interpretation: InterpretationReport,
    request: DomainAgentFlowRequest
  ): Promise<string | undefined> {
    const llm = this.engine.llm;
    if (!llm) return undefined;

    const scope = request.scope ? this.engine.getScope(request.scope) : undefined;
    const standards = resolveStandards(target, scope?.codeStandards);

    try {
      const response = await llm.generate(
        {
          system:
            `You are a code generator for the "${this.domain}" domain. Produce a ` +
            `minimal, runnable ${target} program that is representative of ` +
            `this domain: under 40 lines, using ONLY the ${target} standard ` +
            `library (no third-party packages or imports whatsoever), no ` +
            `large inline data (at most a handful of small literals), must ` +
            `execute standalone with exit code 0. Follow the ${standards.style} ` +
            `style. Return ONLY the code, no markdown fences, no explanations.`,
          user: JSON.stringify({
            domain: this.domain,
            targetLanguage: target,
            matchedKeywords: interpretation.analysis.matchedKeywords,
            frameworks: interpretation.analysis.frameworks,
            platform: interpretation.analysis.platform,
            sourceLanguage: interpretation.analysis.language,
            standards,
            requestContext: request.source.slice(0, 2000),
          }),
        },
        { maxTokens: 8192 }
      );

      if (!response.content || response.content.trim().length === 0) return undefined;
      let code = response.content.trim();
      // The model was told not to fence; strip anyway. Take the content of
      // the first fenced block when present — closed blocks drop any
      // trailing prose, truncated (token-limited) blocks keep everything
      // after the opening fence line.
      const fenced = code.match(/```[^\n]*\r?\n([\s\S]*?)(?:```|$)/);
      if (fenced) code = fenced[1].trim();
      return code.length > 0 ? code : undefined;
    } catch {
      return undefined;
    }
  }
}
