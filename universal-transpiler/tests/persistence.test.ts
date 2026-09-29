/**
 * Universal Transpiler - Persistence / Feedback / Learning Tests
 *
 * Verifies the self-extending persistent state layer end to end:
 * - keyword learning: candidate observations -> confirmed definitions,
 *   persisted to disk and reloaded by a fresh engine instance
 * - learned/promoted keywords steering domain analysis
 * - client feedback lifecycle: per-client records, upstream promotion
 *   (2 distinct clients, approve:true, or explicit promoteUpstream)
 * - progress goals + the self-going autoAdvance loop
 * - transpile statistics recorded on fallback routes
 * - full state round-trip through the JSON state file
 *
 * Every test gets its own temp state file (fs.mkdtempSync) so the suite is
 * hermetic and parallel-safe; the shared ~/.universal-transpiler state is
 * never touched.
 */

import { describe, it, expect, afterAll } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

import { UniversalEngine } from '../src/engine/universal-engine';
import type { LearnOptions } from '../src/engine/persistent-state';

// ============================================================================
// Fixtures
// ============================================================================

/**
 * Distinctive unknown identifier (fluxinator) co-occurring with known
 * web-backend keywords (server, handler, router, request, response).
 * No other domain's keywords appear as substrings, so the candidate's
 * dominance in web-backend is 1.0.
 */
const WEB_BACKEND_LEARNING_SOURCE = `server.handler({
  router: request,
  response: handler
});
fluxinator();
`;

/** web-backend signals, no framework imports, no other-domain noise */
const WEB_BACKEND_SOURCE = 'const handler = server.router(request, response);';

/** data-domain signals only (query/database/select/sql) */
const DATA_SOURCE = 'const query = database.select(sql);';

/** rust source with no native toolchain on this machine -> rust->go fallback */
const RUST_HELLO = `fn main() {
    let greeting = "hello from rust";
    let mut count = 2;
    count = count + 1;
    println!("{}", greeting);
    if count > 2 {
        println!("count is big");
    }
}
`;

const UNKNOWN_GOAL_TITLE = 'invent-a-new-syntax';

// ============================================================================
// Hermetic engine factory: one temp state file per test
// ============================================================================

const tempDirs: string[] = [];

function makeEngine(learn?: LearnOptions): UniversalEngine {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'univ-persistence-'));
  tempDirs.push(dir);
  return new UniversalEngine({
    statePath: path.join(dir, 'state.json'),
    learn,
    debug: false,
    timeoutMs: 60_000,
  });
}

/** A fresh engine instance pointed at an existing engine's state file. */
function reloadEngine(engine: UniversalEngine): UniversalEngine {
  return new UniversalEngine({ statePath: engine.state.statePath });
}

/** The state file contents as persisted on disk. */
function stateOnDisk(engine: UniversalEngine): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(engine.state.statePath, 'utf8')) as Record<string, unknown>;
}

afterAll(() => {
  for (const dir of tempDirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ============================================================================
// 1. Keyword learning: candidate -> definition transition
// ============================================================================

describe('Keyword learning from source', () => {
  it('promotes a repeated candidate into a persistent definition', async () => {
    // minEncounters: 2 so two observations of the same source suffice
    const engine = makeEngine({ minEncounters: 2, minDominance: 0.6 });

    // First encounter: fluxinator is only a candidate attributed to web-backend
    await engine.analyze(WEB_BACKEND_LEARNING_SOURCE);
    expect(engine.state.data.candidates.fluxinator).toBeDefined();
    expect(engine.state.data.candidates.fluxinator['web-backend']).toBeGreaterThanOrEqual(1);
    expect(engine.state.data.keywords.fluxinator).toBeUndefined();

    // Second encounter: evidence threshold met -> persistent definition
    await engine.analyze(WEB_BACKEND_LEARNING_SOURCE);
    const def = engine.state.data.keywords.fluxinator;
    expect(def).toBeDefined();
    expect(def!.domain).toBe('web-backend');
    expect(def!.source).toBe('learned');
    expect(engine.state.data.candidates.fluxinator).toBeUndefined();

    // The definition is persisted to the state file on disk
    const onDisk = stateOnDisk(engine) as { keywords: Record<string, { domain: string }> };
    expect(onDisk.keywords.fluxinator).toBeDefined();
    expect(onDisk.keywords.fluxinator.domain).toBe('web-backend');

    // A brand new engine on the same path loads the learned definition
    const reborn = reloadEngine(engine);
    expect(reborn.state.learnedKeywordMap().fluxinator).toBeDefined();
    expect(reborn.state.learnedKeywordMap().fluxinator!.domain).toBe('web-backend');

    // The promotion was noted in the progress log
    const learnedEntries = engine
      .progressLog(200)
      .filter((e) => e.kind === 'keyword-learned' && e.detail.includes('fluxinator'));
    expect(learnedEntries.length).toBeGreaterThanOrEqual(1);
  }, 120_000);
});

// ============================================================================
// 2. Learned keywords affect analysis
// ============================================================================

describe('Learned keyword definitions steer domain analysis', () => {
  it('resolves a weakly-signaled source to the taught domain', async () => {
    const engine = makeEngine();
    engine.state.defineKeyword('acme_widget', 'web-backend');

    // Counterfactual: without the definition the sql signal wins.
    // (The source avoids a call like `acme_widget(...)`: the trailing
    // `get(` is itself a web-backend catalog keyword and would tie the
    // scores, resolving to web-backend by catalog order.)
    const naive = makeEngine();
    const before = await naive.analyze('const acme_widget = sql_row;');
    expect(before.analysis.domain.id).toBe('data');

    // With the taught definition, web-backend outscored data
    const report = await engine.analyze('const acme_widget = sql_row;');
    expect(report.analysis.domain.id).toBe('web-backend');
    expect(report.analysis.scores[0].domainId).toBe('web-backend');
    expect(report.analysis.matchedKeywords).toContain('acme_widget (learned)');
  }, 120_000);
});

// ============================================================================
// 3. Client feedback lifecycle: per-client until promoted upstream
// ============================================================================

describe('Client feedback lifecycle (platform-preference)', () => {
  it('stays client-local after one client and promotes upstream after two', async () => {
    const engine = makeEngine();

    // First client records the preference: not yet upstream
    engine.feedback('client-a', 'platform-preference', 'web-backend=wasm');
    expect(engine.state.upstreamPlatformFor('web-backend')).toBeUndefined();
    expect(engine.state.data.upstream.platformPreferences['web-backend']).toBeUndefined();

    // A second client is unaffected by client-a's un-promoted feedback
    const bReport = await engine.analyze(WEB_BACKEND_SOURCE, { clientId: 'client-b' });
    expect(bReport.analysis.domain.id).toBe('web-backend');
    expect(bReport.analysis.platform).toBe('native'); // domain default, not 'wasm'

    // The same feedback from a second, different client promotes upstream
    engine.feedback('client-b', 'platform-preference', 'web-backend=wasm');
    expect(engine.state.upstreamPlatformFor('web-backend')).toBe('wasm');

    // Both originating records are now marked promoted
    const clients = engine.clients();
    expect(clients['client-a'].feedback[0].promoted).toBe(true);
    expect(clients['client-b'].feedback[0].promoted).toBe(true);

    // A third client benefits without declaring anything: wasm wins
    const cReport = await engine.analyze(WEB_BACKEND_SOURCE, { clientId: 'client-c' });
    expect(cReport.analysis.domain.id).toBe('web-backend');
    expect(cReport.analysis.platform).toBe('wasm');
    expect(engine.clients()['client-c']).toBeDefined();
  }, 120_000);
});

// ============================================================================
// 4. Immediate promotion: approve + explicit promoteUpstream
// ============================================================================

describe('Immediate promotion', () => {
  it('promotes from a single client with approve: true', async () => {
    const engine = makeEngine();

    engine.feedback('solo', 'platform-preference', 'data=docker', { approve: true });
    expect(engine.state.upstreamPlatformFor('data')).toBe('docker');
    expect(engine.clients()['solo'].feedback[0].promoted).toBe(true);

    // output-style feedback promotes the same way
    engine.feedback('solo', 'output-style', 'go=explicit-types', { approve: true });
    expect(engine.state.upstreamOutputStyleFor('go')).toBe('explicit-types');

    // An approved preference steers analysis for every (undeclared) client
    const report = await engine.analyze(DATA_SOURCE);
    expect(report.analysis.domain.id).toBe('data');
    expect(report.analysis.platform).toBe('docker');
  }, 120_000);

  it('promotes a pending single-client record via promoteUpstream', () => {
    const engine = makeEngine();

    engine.feedback('other', 'platform-preference', 'cli=wasi');
    expect(engine.state.upstreamPlatformFor('cli')).toBeUndefined();

    engine.promoteUpstream('platform-preference', 'cli=wasi');
    expect(engine.state.upstreamPlatformFor('cli')).toBe('wasi');
    expect(engine.clients()['other'].feedback[0].promoted).toBe(true);
  });
});

// ============================================================================
// 5. keyword-domain feedback
// ============================================================================

describe('keyword-domain feedback', () => {
  it('defines a keyword once promoted, steering analysis and surviving restart', async () => {
    const engine = makeEngine();

    // One client alone does not promote (same contract as preferences)
    engine.feedback('x', 'keyword-domain', 'shardkey=data');
    expect(engine.state.getKeywordDefinition('shardkey')).toBeUndefined();

    // A second distinct client promotes it into a keyword definition
    engine.feedback('y', 'keyword-domain', 'shardkey=data');
    const def = engine.state.getKeywordDefinition('shardkey');
    expect(def).toBeDefined();
    expect(def!.domain).toBe('data');
    expect(def!.source).toBe('client-promoted');
    expect(engine.state.learnedKeywordMap().shardkey!.domain).toBe('data');
    expect(engine.clients()['x'].feedback[0].promoted).toBe(true);
    expect(engine.clients()['y'].feedback[0].promoted).toBe(true);

    // The promoted keyword now wins domain analysis on its own
    const report = await engine.analyze('const shardkey = 42;');
    expect(report.analysis.domain.id).toBe('data');
    expect(report.analysis.scores[0].domainId).toBe('data');

    // And it is still there for a fresh engine on the same state file
    const reborn = reloadEngine(engine);
    expect(reborn.state.getKeywordDefinition('shardkey')!.domain).toBe('data');
    expect(reborn.state.learnedKeywordMap().shardkey!.domain).toBe('data');
  }, 120_000);
});

// ============================================================================
// 6. Goals + autoAdvance
// ============================================================================

describe('Progress goals and autoAdvance', () => {
  it('advances the goals it knows and leaves unknown ones alone', async () => {
    const engine = makeEngine();
    engine.defineGoal('run-hello-world-per-language');
    engine.defineGoal('verify-transpile-pairs');
    engine.defineGoal(UNKNOWN_GOAL_TITLE); // no automated strategy exists

    const result = await engine.autoAdvance();

    // Known goals were advanced
    expect(result.advanced).toEqual(
      expect.arrayContaining(['run-hello-world-per-language', 'verify-transpile-pairs'])
    );
    // The unknown goal was not advanced
    expect(result.stillPlanned).toContain(UNKNOWN_GOAL_TITLE);

    const goals = engine.goals();
    expect(goals.length).toBe(3);
    const byTitle = (title: string) => goals.find((g) => g.title === title)!;
    expect(byTitle('run-hello-world-per-language').status).toBe('done');
    expect(byTitle('verify-transpile-pairs').status).toBe('done');
    // Not 'done' (and not advanced): left for the caller to handle
    expect(byTitle(UNKNOWN_GOAL_TITLE).status).not.toBe('done');

    // The progress log recorded the completions
    const doneEntries = engine.progressLog(500).filter((e) => e.kind === 'goal-done');
    expect(doneEntries.length).toBeGreaterThanOrEqual(2);
    expect(doneEntries.map((e) => e.detail)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('run-hello-world-per-language'),
        expect.stringContaining('verify-transpile-pairs'),
      ])
    );
  }, 180_000);
});

// ============================================================================
// 7. Transpile statistics on fallback routes
// ============================================================================

describe('Transpile statistics', () => {
  it('records uses/successes for the rust->go fallback route', async () => {
    const engine = makeEngine();
    const rust = engine.toolchains.get('rust')!;
    const go = engine.toolchains.get('go')!;
    await rust.probe();
    await go.probe();

    const report = await engine.run(RUST_HELLO, { language: 'rust' });

    if (rust.info.available) {
      // rustc exists: the run was native, so no transpile pair stats exist
      expect(report.route).toBe('native-run');
      expect(report.result.ok).toBe(true);
      return;
    }

    // rustc absent: structural rust->go, executed with the go toolchain
    expect(report.route).toBe('transpile-then-run');
    expect(report.transpilation?.strategy).toBe('structural');
    expect(report.executedLanguage).toBe('go');
    expect(report.result.ok).toBe(true);
    expect(report.result.stdout).toContain('hello from rust');

    if (!go.info.available) {
      console.warn('skipping stats assertions: go toolchain unavailable');
      return;
    }

    const stats = engine.state.data.transpileStats['rust->go'];
    expect(stats).toBeDefined();
    expect(stats!.uses).toBeGreaterThanOrEqual(1);
    expect(stats!.successes).toBeGreaterThanOrEqual(1);
    expect(stats!.strategy).toBe('structural');

    // The empirical evidence is persisted
    const onDisk = stateOnDisk(engine) as {
      transpileStats: Record<string, { uses: number; successes: number }>;
    };
    expect(onDisk.transpileStats['rust->go'].uses).toBeGreaterThanOrEqual(1);
    expect(onDisk.transpileStats['rust->go'].successes).toBeGreaterThanOrEqual(1);
  }, 180_000);
});

// ============================================================================
// 8. Full persistence round-trip
// ============================================================================

describe('State round-trip', () => {
  it('reloads keywords, upstream preferences, clients and goals from disk', async () => {
    const engine = makeEngine();

    // Definitions
    engine.state.defineKeyword('persist_widget', 'web-backend');
    // Feedback promoted upstream by two distinct clients
    engine.feedback('alpha', 'platform-preference', 'web-backend=wasm');
    engine.feedback('beta', 'platform-preference', 'web-backend=wasm');
    // Goals through their lifecycle
    const goal = engine.defineGoal('persist-round-trip');
    engine.startGoal(goal.id);
    engine.completeGoal(goal.id, 'verified by test');
    // Client activity (request counting) alongside everything else
    await engine.analyze('server handler router request response', { clientId: 'alpha' });

    const reborn = reloadEngine(engine);

    // Keywords survived
    expect(reborn.state.getKeywordDefinition('persist_widget')!.domain).toBe('web-backend');
    expect(reborn.state.learnedKeywordMap().persist_widget!.domain).toBe('web-backend');

    // Upstream preferences survived
    expect(reborn.state.upstreamPlatformFor('web-backend')).toBe('wasm');

    // Client profiles (and their promoted feedback) survived
    const clients = reborn.state.data.clients;
    expect(clients.alpha).toBeDefined();
    expect(clients.beta).toBeDefined();
    expect(clients.alpha!.feedback.length).toBe(1);
    expect(clients.alpha!.feedback[0].promoted).toBe(true);
    expect(clients.beta!.feedback[0].promoted).toBe(true);
    expect(clients.alpha!.requests).toBeGreaterThan(0);

    // Goals survived with their status and notes
    const loadedGoal = reborn.state.goalByTitle('persist-round-trip');
    expect(loadedGoal).toBeDefined();
    expect(loadedGoal!.status).toBe('done');
    expect(loadedGoal!.notes).toContain('verified by test');

    // The in-memory snapshot matches the file on disk exactly
    expect(reborn.state.snapshot()).toEqual(stateOnDisk(engine));
  }, 120_000);
});
