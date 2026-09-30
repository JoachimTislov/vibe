/**
 * Universal Transpiler - Food Tracking Domain Agent
 *
 * The designated agent for the food-tracking domain: the autonomous
 * workflow that tracks food stock and produces a shopping list
 * (github.com/JoachimTislov/foodsavr).
 *
 * Flow:
 *   1. interpret   - engine.interpret(): vault history first
 *   2. organize    - ingest the document's vocabulary into the vault
 *                    (persist-on-encounter: products/categories/meals
 *                    become domain definitions reusable later)
 *   3. define      - the workflow spec IS the domain's definition layer
 *   4. create      - reference implementation (FoodTrackingWorkflow),
 *                    generated standalone code (js/ts/go/rust) and the
 *                    shopping.v1 service payloads
 *   5. produce      - the requested artifact, under the scope's standards
 */

import type { UniversalEngine } from '../engine/universal-engine';
import type { InterpretationReport } from '../engine/user-contract';
import {
  DomainAgent,
  type DomainAgentFlowRequest,
  type DomainAgentFlowResult,
  type DomainAgentProduced,
} from './domain-agent';
import { parseWorkflowDsl, specToDsl } from '../domains/workflow-dsl';
import {
  FoodTrackingWorkflow,
  generateWorkflowCode,
  type FoodWorkflowSpec,
  type WorkflowTarget,
  type WorkflowResult,
} from '../domains/foodsavr';
import { generateShoppingListServicePayloads } from '../domains/foodsavr-integration';

export class FoodTrackingAgent implements DomainAgent {
  readonly id = 'agent:food-tracking';
  readonly domain = 'food-tracking';

  constructor(private readonly engine: UniversalEngine) {}

  canHandle(input: { source: string; domain: string; interpretation: InterpretationReport }): boolean {
    if (input.domain.toLowerCase() === 'food-tracking') return true;
    // DSL documents declaring this domain are ours even when the keyword
    // analysis scored a different domain higher
    return this.inputAffinity(input.source) > 0;
  }

  /** 1 when the input is a workflow DSL document for this domain. */
  inputAffinity(source: string): number {
    try {
      return parseWorkflowDsl(source).domain === 'food-tracking' ? 1 : 0;
    } catch {
      return 0;
    }
  }

  async flow(request: DomainAgentFlowRequest): Promise<DomainAgentFlowResult> {
    // 1. Interpret: history comparison before anything else
    const interpretation = await this.engine.interpret(request.source, {
      scope: request.scope,
      clientId: request.clientId,
      platform: request.platform,
    });

    const notes: string[] = [];

    // 2. Parse the 5GL document; non-DSL input falls back to execution
    let spec: FoodWorkflowSpec | undefined;
    try {
      const doc = parseWorkflowDsl(request.source);
      if (doc.domain === 'food-tracking') {
        spec = doc.spec;
        notes.push(`parsed workflow document "${doc.title}"`);
        if (doc.warnings.length > 0) notes.push(...doc.warnings.map((w) => `warning: ${w}`));
      }
    } catch (err) {
      notes.push(`not a workflow DSL document (${(err as Error).message}); executing as source`);
    }

    if (!spec) {
      const report = await this.engine.run(request.source, {
        scope: request.scope,
        clientId: request.clientId,
        language: interpretation.analysis.language,
        platform: request.platform ?? interpretation.analysis.platform,
      });
      const produced: DomainAgentProduced = {
        kind: 'engine-run',
        payload: { ok: report.result.ok, route: report.route },
        text: report.result.ok ? report.result.stdout : report.result.stderr,
      };
      return {
        agent: this.id,
        domain: 'food-tracking',
        interpretation,
        produced,
        standards: interpretation.standards,
        judgment: request.judgment,
        notes,
      };
    }

    // 3. Organize: ingest the vocabulary so future inputs match history
    const ingested = this.engine.ingestDocumentVocabulary(request.source, {
      clientId: request.clientId,
    });
    notes.push(`ingested ${ingested.length} vocabulary definitions into the vault`);

    // 4. Create: run the reference implementation
    const workflow = new FoodTrackingWorkflow(spec);
    const workflowResult = workflow.run();
    notes.push(
      `workflow: ${workflowResult.shoppingList.length} shopping-list items, ` +
        `${workflowResult.wasteAlerts.length} waste alerts, ` +
        `${workflowResult.inventory.length} tracked products`
    );

    const payloads = generateShoppingListServicePayloads(workflowResult, {
      referenceDate: spec.referenceDate,
    });
    notes.push(`${payloads.length} shopping.v1 AddItemRequest payloads ready`);

    // 5. Produce the requested artifact (default: the workflow result)
    const produce =
      !request.produce || request.produce === 'auto' ? 'workflow-result' : request.produce;

    let produced: DomainAgentProduced;
    if (produce === 'code') {
      const target = (request.codeTarget ?? 'javascript') as WorkflowTarget;
      const code = generateWorkflowCode(spec, target);
      produced = {
        kind: 'generated-code',
        payload: { target, servicePayloads: payloads },
        text: code,
      };
      notes.push(`generated standalone ${target} program for the spec`);
    } else if (produce === 'dsl') {
      produced = {
        kind: 'dsl-document',
        payload: { servicePayloads: payloads },
        text: specToDsl(spec, 'Food tracking workflow'),
      };
    } else {
      produced = {
        kind: 'workflow-result',
        payload: {
          workflowResult: workflowResult as unknown as WorkflowResult,
          servicePayloads: payloads,
        },
        text: JSON.stringify(
          {
            shoppingList: workflowResult.shoppingList,
            wasteAlerts: workflowResult.wasteAlerts,
            servicePayloads: payloads,
          },
          null,
          2
        ),
      };
    }

    return {
      agent: this.id,
      domain: 'food-tracking',
      interpretation,
      produced,
      standards: interpretation.standards,
      judgment: request.judgment,
      notes,
    };
  }
}
