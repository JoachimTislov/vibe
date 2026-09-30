/**
 * Universal Transpiler - Domain Agents
 *
 * A designated agent per domain within the universal interpreter. Each
 * agent owns the full flow for its domain:
 *
 *   interpret  - compare every input token against vault history (the
 *                engine's interpret() report) before anything happens
 *   organize   - the vault vocabulary of this domain (records, stats)
 *   define     - teach/ingest new keyword definitions, persisted on
 *                encounter per the learning policy
 *   create     - compose the domain's artifacts (workflow results,
 *                generated code, service payloads, DSL)
 *   produce    - emit the end result honoring the scope setup, the code
 *                standards and the decision policy
 *
 * WHICH agent handles an input is itself a typed judgment decision
 * (kind 'select-domain-agent'), so agent routing is a policy-selectable
 * decision, never hardcoded.
 */

import type { UniversalEngine } from '../engine/universal-engine';
import type { InterpretationReport, CodeStandards } from '../engine/user-contract';
import type { Judgment } from '../engine/judgment';
import type { PlatformTarget } from '../toolchains/types';

// ============================================================================
// Flow request and result
// ============================================================================

export interface DomainAgentFlowRequest {
  /** The input source: DSL document, code, JSON — any syntax */
  source: string;
  /** The user scope this flow runs under (restricts domains, applies standards) */
  scope?: string;
  /** The client/subscriber identity (feedback attribution) */
  clientId?: string;
  /** Declared platform; otherwise the domain analysis decides */
  platform?: PlatformTarget;
  /**
   * What to produce:
   * - 'auto' (default): the agent decides from the input and its domain
   * - 'workflow-result': run the domain's reference implementation
   * - 'code': generate standalone code in `codeTarget`
   * - 'run': execute the source through the engine
   * - 'dsl': emit the 5GL DSL document for the input
   */
  produce?: 'auto' | 'workflow-result' | 'code' | 'run' | 'dsl';
  /** Target language for produce: 'code' */
  codeTarget?: string;
  /** The agent-selection judgment that dispatched this agent (trace) */
  judgment?: Judgment;
}

export interface DomainAgentProduced {
  kind: 'workflow-result' | 'generated-code' | 'engine-run' | 'dsl-document';
  /** Machine-readable payload when the kind carries one */
  payload?: unknown;
  /** Human-readable text output (code, DSL, program stdout) */
  text: string;
}

export interface DomainAgentFlowResult {
  /** The agent that ran */
  agent: string;
  /** The domain the flow served */
  domain: string;
  /** Step 1: the interpretation report (history comparison first, always) */
  interpretation: InterpretationReport;
  /** Step 5: what was produced */
  produced: DomainAgentProduced;
  /** Standards the produced output follows */
  standards: CodeStandards;
  /** The agent-selection judgment that dispatched this agent */
  judgment?: Judgment;
  notes: string[];
}

// ============================================================================
// The agent contract
// ============================================================================

export interface DomainAgent {
  readonly id: string;
  /** The primary domain this agent is designated for */
  readonly domain: string;
  /** Additional domains this agent may serve (e.g. recipes -> food-tracking) */
  readonly alsoHandles?: string[];
  /** True for the always-accepting fallback agent (registry last resort) */
  readonly acceptsAll?: boolean;
  /**
   * Structural affinity for the input itself (0..1): 1 when this agent's
   * parser fully accepts the source. Feeds the routing decision so an
   * agent that can actually parse the input outranks one that merely
   * scores well on shared vocabulary.
   */
  inputAffinity?(source: string): number;
  /**
   * Whether this agent accepts the request (given the interpretation).
   * The judgment model ranks candidates; canHandle breaks ties and
   * validates the winner.
   */
  canHandle(input: {
    source: string;
    domain: string;
    interpretation: InterpretationReport;
  }): boolean;
  /** Execute the full flow for the domain. */
  flow(request: DomainAgentFlowRequest): Promise<DomainAgentFlowResult>;
}

// ============================================================================
// Registry
// ============================================================================

export class DomainAgentRegistry {
  private readonly agents: DomainAgent[] = [];

  register(agent: DomainAgent): this {
    this.agents.push(agent);
    return this;
  }

  /** All registered agents. */
  all(): DomainAgent[] {
    return [...this.agents];
  }

  /** The designated agent for a domain (primary match first, fallback last). */
  forDomain(domain: string): DomainAgent | undefined {
    const lower = domain.toLowerCase();
    return (
      this.agents.find((a) => a.domain.toLowerCase() === lower) ||
      this.agents.find((a) => (a.alsoHandles ?? []).some((d) => d.toLowerCase() === lower)) ||
      this.agents.find((a) => a.acceptsAll)
    );
  }

  /**
   * Candidate agents that declare they can handle an input. Used to build
   * the 'select-domain-agent' judgment question; a generic fallback agent
   * should always accept.
   */
  candidates(input: { source: string; domain: string; interpretation: InterpretationReport }): DomainAgent[] {
    return this.agents.filter((a) => a.canHandle(input));
  }
}

// ============================================================================
// Generic fallback agent: any domain, engine-backed
// ============================================================================

/**
 * The fallback agent for domains without a designated specialist. It
 * still runs the full flow — interpret (history first), then produce by
 * executing the source through the engine's routing, under the request's
 * scope and the resolved standards.
 */
export class GenericDomainAgent implements DomainAgent {
  readonly id: string;
  readonly domain: string;
  readonly acceptsAll = true;

  constructor(
    private readonly engine: UniversalEngine,
    domain = 'generic'
  ) {
    this.id = `generic:${domain}`;
    this.domain = domain;
  }

  canHandle(): boolean {
    return true; // the fallback accepts everything
  }

  async flow(request: DomainAgentFlowRequest): Promise<DomainAgentFlowResult> {
    const notes: string[] = [];
    const interpretation = await this.engine.interpret(request.source, {
      scope: request.scope,
      clientId: request.clientId,
      platform: request.platform,
    });
    const domain = interpretation.analysis.domain.id;
    notes.push(`no designated agent for domain "${domain}"; generic agent executed the source`);

    const produce = request.produce === 'auto' || !request.produce ? 'run' : request.produce;
    if (produce === 'dsl') {
      const text = JSON.stringify(
        {
          domain,
          note: 'generic agent: no DSL composer for this domain; analysis follows',
          matchedKeywords: interpretation.analysis.matchedKeywords,
          platform: interpretation.analysis.platform,
        },
        null,
        2
      );
      return {
        agent: this.id,
        domain,
        interpretation,
        produced: { kind: 'dsl-document', text },
        standards: interpretation.standards,
        judgment: request.judgment,
        notes,
      };
    }

    const report = await this.engine.run(request.source, {
      scope: request.scope,
      clientId: request.clientId,
      language: interpretation.analysis.language,
      domain,
      platform: request.platform ?? interpretation.analysis.platform,
    });
    notes.push(`route: ${report.route} via ${report.executedLanguage}`);

    return {
      agent: this.id,
      domain,
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
