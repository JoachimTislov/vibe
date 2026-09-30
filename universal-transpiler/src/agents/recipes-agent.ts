/**
 * Universal Transpiler - Recipes Domain Agent
 *
 * The designated agent for the recipes domain. It composes recipes, a
 * meal schedule and pantry inventory into a complete food-tracking
 * workflow spec (composeIntoFoodSpec), then hands the spec to the
 * food-tracking flow: reference run, generated code, service payloads.
 *
 * Input shape: a JSON document { recipes, schedule, inventory, options }
 * (see domains/recipes.ts types). Non-JSON input falls back to the
 * generic execution path.
 */

import type { UniversalEngine } from '../engine/universal-engine';
import type { InterpretationReport } from '../engine/user-contract';
import {
  DomainAgent,
  type DomainAgentFlowRequest,
  type DomainAgentFlowResult,
  type DomainAgentProduced,
} from './domain-agent';
import {
  composeIntoFoodSpec,
  type Recipe,
  type RecipeSchedule,
  type RecipeComposeOptions,
} from '../domains/recipes';
import type { FoodCollection } from '../domains/foodsavr';
import { FoodTrackingWorkflow, generateWorkflowCode, type WorkflowTarget } from '../domains/foodsavr';
import { generateShoppingListServicePayloads } from '../domains/foodsavr-integration';
import { specToDsl } from '../domains/workflow-dsl';

interface RecipesDocument {
  recipes: Recipe[];
  schedule: RecipeSchedule;
  inventory?: FoodCollection[];
  options?: RecipeComposeOptions;
}

export class RecipesAgent implements DomainAgent {
  readonly id = 'agent:recipes';
  readonly domain = 'recipes';
  readonly alsoHandles = ['food-tracking'];

  constructor(private readonly engine: UniversalEngine) {}

  canHandle(input: { source: string; domain: string; interpretation: InterpretationReport }): boolean {
    if (['recipes', 'food-tracking'].includes(input.domain.toLowerCase())) return true;
    return this.inputAffinity(input.source) > 0;
  }

  /** 1 when the input is a recipes document this agent can compose. */
  inputAffinity(source: string): number {
    const doc = parseRecipesDocument(source);
    return doc && doc.recipes.length > 0 ? 1 : 0;
  }

  async flow(request: DomainAgentFlowRequest): Promise<DomainAgentFlowResult> {
    // 1. Interpret: history comparison before anything else
    const interpretation = await this.engine.interpret(request.source, {
      scope: request.scope,
      clientId: request.clientId,
      platform: request.platform,
    });

    const notes: string[] = [];
    const doc = parseRecipesDocument(request.source);

    if (!doc || doc.recipes.length === 0) {
      // Not a recipes document: this agent still serves the domain, so
      // execute the source through the engine
      const report = await this.engine.run(request.source, {
        scope: request.scope,
        clientId: request.clientId,
        language: interpretation.analysis.language,
        platform: request.platform ?? interpretation.analysis.platform,
      });
      notes.push('input is not a recipes document; executed as source');
      const produced: DomainAgentProduced = {
        kind: 'engine-run',
        payload: { ok: report.result.ok, route: report.route },
        text: report.result.ok ? report.result.stdout : report.result.stderr,
      };
      return {
        agent: this.id,
        domain: 'recipes',
        interpretation,
        produced,
        standards: interpretation.standards,
        judgment: request.judgment,
        notes,
      };
    }

    // 2. Compose: recipes + schedule + inventory -> complete workflow spec
    const spec = composeIntoFoodSpec(doc.recipes, doc.schedule, doc.inventory ?? [], doc.options);
    notes.push(
      `composed ${doc.recipes.length} recipes x ${doc.schedule.length} scheduled meals ` +
        `into a food-tracking spec (horizon ${spec.horizonDays}d)` +
        (spec.referenceDate ? ` from ${spec.referenceDate}` : '')
    );

    // 3. Organize: persist the composed vocabulary (persist-on-encounter)
    const ingested = this.engine.ingestSpecVocabulary(spec, 'food-tracking', {
      clientId: request.clientId,
      title: 'Composed recipes',
    });
    notes.push(`ingested ${ingested.length} vocabulary definitions into the vault`);

    // 4. Create: reference run + service payloads
    const workflow = new FoodTrackingWorkflow(spec);
    const workflowResult = workflow.run();
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
      produced = {
        kind: 'generated-code',
        payload: { target, servicePayloads: payloads },
        text: generateWorkflowCode(spec, target),
      };
      notes.push(`generated standalone ${target} program for the composed spec`);
    } else if (produce === 'dsl') {
      produced = {
        kind: 'dsl-document',
        payload: { servicePayloads: payloads },
        text: specToDsl(spec, 'Composed recipes'),
      };
    } else {
      produced = {
        kind: 'workflow-result',
        payload: { workflowResult, servicePayloads: payloads },
        text: JSON.stringify(
          { shoppingList: workflowResult.shoppingList, servicePayloads: payloads },
          null,
          2
        ),
      };
    }

    return {
      agent: this.id,
      domain: 'recipes',
      interpretation,
      produced,
      standards: interpretation.standards,
      judgment: request.judgment,
      notes,
    };
  }
}

/** Parse a recipes document; returns undefined when the input is not one. */
function parseRecipesDocument(source: string): RecipesDocument | undefined {
  const trimmed = source.trim();
  if (!trimmed.startsWith('{')) return undefined;
  try {
    const parsed = JSON.parse(trimmed) as Partial<RecipesDocument>;
    if (!Array.isArray(parsed.recipes) || !Array.isArray(parsed.schedule)) return undefined;
    return {
      recipes: parsed.recipes,
      schedule: parsed.schedule,
      inventory: Array.isArray(parsed.inventory) ? parsed.inventory : [],
      options: parsed.options,
    };
  } catch {
    return undefined;
  }
}
