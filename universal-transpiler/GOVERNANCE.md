# Governance: the user–system relation

This document defines who interprets, organizes, defines, creates and
produces — and exactly what each side may change. The model is deliberately
**open for revision**: every decision rule named here is data (a policy
value), not a hardcoded behavior.

## The relation

```
USER (per scope)                              SYSTEM (the interpreter)
──────────────────────                        ─────────────────────────────
sets up (mutable, owned):                     autonomously (within scope):
  scope          what domains are covered       interprets   every input token
  expected       declared functionality           compared against vault
  functionality    ("the workflow must produce a    history — nothing enters
  code standards   shopping list")                 uninterpreted
                (defaults to language /           organizes   domains, keywords,
  decision policy  ecosystem standards)            candidates, records
                                                defines     candidates ->
sends (input-only):                             definitions (corroboration)
  sources, requests, files                     creates     code, workflows,
                                                artifacts, transpilations
teaches (own namespace):                      produces    the platform-
  keyword definitions (within scope)             decided end result
  feedback: preferences, approvals,
    corrections                                reads (never mutates):
                                                its own history to iterate

CANNOT: alter internal state the system is
writing (learning, stats, progress). Their
control is exactly what they send in plus
the state they set up.
```

## Control points (all configurable)

| Decision | Default | Overridable by the user via |
|---|---|---|
| Which domain an input belongs to | system infers (keywords vs vault) | `expectedFunctionality.domain`, declared domain in a request |
| Target platform | declared > client feedback > framework > domain default | `DecisionPolicy.platformResolution`, or declaring a platform |
| When client feedback becomes global | 2 distinct clients corroborate | `DecisionPolicy.promotionThreshold` (any number, or `'agent-decides'`) |
| Whether unknown keywords are learned | on (candidates after corroboration) | `DecisionPolicy.learningMode: 'on' \| 'observe-only' \| 'off'` |
| Which judgment model makes typed decisions | `'heuristic'` (built-in, deterministic) | `DecisionPolicy.judgmentModel` — any registered provider's name |
| Code style of produced code | the target language's ecosystem standard | `CodeStandards.style` |
| Scope of teaching | user's declared scope domains | `ScopeSetup.domains` |

Defaults live in `DEFAULT_DECISION_POLICY` and `LANGUAGE_STANDARDS`
(`src/engine/user-contract.ts`) and are plain data — change them without
touching engine logic.

## Mutability tiers (the contract)

1. **User-mutable** — the state the user set up, and nothing else:
   - `ScopeSetup` for their scope (via `engine.updateScope`)
   - their own feedback records (via `engine.feedback`, their clientId)
   - their own keyword teachings **within their scope's domains**
     (outside the scope, teaching is recorded as a proposal the system may
     adopt on corroboration — never an immediate global definition)

2. **System-only-writable** — written exclusively by the system's own
   processes (learning, corroboration, execution statistics, progress):
   - learned keyword definitions and candidates
   - transpile statistics
   - upstream (promoted) preferences
   - the progress log

   The API exposes these through read-only views
   (`vault.list/lookup/stats`, `engine.progressLog`, `engine.state`). There
   is deliberately **no write path** for a user to modify them mid-flight:
   the system is stateful and writes its history as it interprets.

3. **Input-only** — what enters the interpreter (sources, request
   arguments, stdin). Inputs are compared against history and may trigger
   learning, but a user input never directly writes vault records: it
   influences them only through the system's own corroboration rules.

## The iteration contract

Every input is compared against the vault's history before anything else
happens. The comparison is visible: `engine.interpret(source)` returns a
`InterpretationReport` — what matched (and in which domains), which tokens
were new (now candidates), what was learned during this interpretation,
and the resulting domain/platform/route decision. Interpretation is how
the system iterates: yesterday's learned definitions change today's
interpretation of the same words.

## The judgment layer (open for Jev-style decision models)

Every "which/whether" decision inside the system is a typed question
consulted through a **judgment model**: machine-consumable state in, typed
choice out — scores, probabilities, confidence. No prose, no prompts:
the LLM tier stays reserved for tasks that need language, while routing,
ranking, promotion and escalation go through this silent decision layer.

The interface (`src/engine/judgment.ts`):

```ts
interface JudgmentModel {
  readonly name: string;
  decide<T extends string>(q: JudgmentQuestion<T>): Promise<Judgment<T>>;
}
// Question: { kind, state: structured state, options: [{value, score, ...}] }
// Answer:   { choice, scores?, probabilities?, confidence, model }
```

The provider is **selected by name in policy data**
(`DecisionPolicy.judgmentModel`, default `'heuristic'`); implementations
are registered on `engine.judgment`. Registering a Jev-style judgment
model and selecting it per scope is the entire integration:

```ts
engine.judgment.register(jevAdapter);          // once, in code
engine.setupScope({
  scopeId: 'my-scope',
  decisionPolicy: { judgmentModel: 'jev' },     // data, swappable anytime
});
```

Unknown names fall back to the default provider — a policy typo can never
deadlock the system. Decision sites today: `'select-domain-agent'`
(agent routing in `engine.dispatch`); the kinds `'select-platform'`,
`'promote-feedback'`, `'promote-candidate'` and `'retry-or-escalate'` are
reserved for the same pattern.

## The dispatch flow: a designated agent per domain

`engine.dispatch(source, request)` is the full flow through the universal
interpreter:

```
input (any syntax)
  -> interpret      every token vs vault history (InterpretationReport)
  -> judge          typed 'select-domain-agent' decision (policy-selected model)
  -> agent flow     the designated DomainAgent for the winning domain:
        interpret -> organize -> define -> create -> produce
```

Registered agents (`src/agents/`):

| Agent | Domain | Produces |
|---|---|---|
| `agent:food-tracking` | food-tracking | workflow result, shopping.v1 payloads, standalone code (js/ts/go/rust), DSL |
| `agent:recipes` | recipes (also food-tracking) | composed spec from recipes + schedule + inventory, then the full food-tracking output |
| `generic:generic` | every other domain | executes the source through the engine's routing |

Agent routing is not hardcoded: the dispatch site builds a typed question
(domain scores, matched keywords, input affinity) and the judgment model
decides. An agent that can structurally parse the input (DSL document,
recipes document) outranks one that merely shares vocabulary. The routing
decision is traced in the persistent progress log (`agent-dispatch`).

The agents honor the contract above end to end: they run under the
request's scope, produce under the resolved standards, ingest vocabulary
through the system's corroboration rules (persist-on-encounter), and never
expose a user write path into internal history.
