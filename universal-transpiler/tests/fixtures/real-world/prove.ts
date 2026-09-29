/**
 * Real-world proof script for the UniversalEngine.
 *
 * Loads each fixture from tests/fixtures/real-world/ (fetched via curl from
 * raw.githubusercontent.com, see manifest.json), runs it through the engine
 * and prints a per-file report:
 *
 *   - detected language (+ candidates)
 *   - detected domain, domain scores, frameworks
 *   - platform decision and routing (native-run vs transpile-then-run)
 *   - actual execution result (stdout/stderr) for runnable files
 *   - structural transpile capability report (converted / unsupported)
 *     for the structural tier (rust -> go, haskell -> javascript)
 *
 * Run with:
 *   npx ts-node --compilerOptions '{"module":"CommonJS","moduleResolution":"node"}' \
 *     tests/fixtures/real-world/prove.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { UniversalEngine } from '../../../src/engine/universal-engine';

interface ManifestEntry {
  file: string;
  language: string;
  sourceUrl: string;
  project: string;
  license?: string;
  expectedBehavior: string;
  /** structural transpile pair to demonstrate explicitly (optional) */
  transpile?: { from: string; to: string };
}

const LINE = '='.repeat(78);
const THIN = '-'.repeat(78);

function indent(text: string, n = 2): string {
  const pad = ' '.repeat(n);
  return text
    .split('\n')
    .map((l) => pad + l)
    .join('\n');
}

function trunc(text: string, max = 1200): string {
  if (text.length <= max) return text;
  return text.slice(0, max) + `\n... [truncated, ${text.length - max} more chars]`;
}

function printResultField(name: string, value: string): void {
  console.log(`  ${name}:`);
  if (value.trim().length === 0) {
    console.log('    (empty)');
  } else {
    console.log(indent(value.trimRight(), 4));
  }
}

async function main(): Promise<void> {
  const engine = new UniversalEngine({ timeoutMs: 120000 });
  await engine.toolchains.probeAll();

  console.log(LINE);
  console.log('TOOLCHAIN STATUS (engine.status())');
  console.log(LINE);
  const status = await engine.status();
  for (const tc of status) {
    const state = tc.available ? 'available' : 'NOT AVAILABLE';
    console.log(`  ${state.padEnd(14)} ${tc.id.padEnd(10)} languages: ${tc.languages.join(', ')}`);
  }

  const fixtureDir = __dirname;
  const manifest = JSON.parse(
    fs.readFileSync(path.join(fixtureDir, 'manifest.json'), 'utf8')
  ) as { files: ManifestEntry[] };

  for (const entry of manifest.files) {
    const source = fs.readFileSync(path.join(fixtureDir, entry.file), 'utf8');

    console.log('\n' + LINE);
    console.log(`FILE: ${entry.file}`);
    console.log(`SOURCE: ${entry.sourceUrl}`);
    console.log(`PROJECT: ${entry.project}`);
    console.log(LINE);

    // ------------------------------------------------------------------
    // 1. Analysis: language + domain + frameworks + platform + routing
    //    (auto-detection, no hints - reports the honest outcome)
    // ------------------------------------------------------------------
    const report = await engine.analyze(source);
    console.log('DETECTED LANGUAGE (content): ' + report.language);
    console.log(
      'LANGUAGE CANDIDATES (content): ' +
        report.languageCandidates.map((c) => `${c.language} (${c.confidence})`).join(', ')
    );
    const byExtension = engine.detect(source, entry.file);
    console.log(
      'DETECTED LANGUAGE (filename): ' +
        byExtension.map((c) => `${c.language} (${c.confidence})`).join(', ')
    );
    console.log('DETECTED DOMAIN: ' + report.analysis.domain.id);
    console.log(
      'DOMAIN SCORES: ' +
        report.analysis.scores
          .filter((s) => s.score > 0)
          .map((s) => `${s.domainId}=${s.score}`)
          .join(', ')
    );
    console.log('FRAMEWORKS: ' + (report.analysis.frameworks.join(', ') || '(none)'));
    console.log('PLATFORM DECISION: ' + report.analysis.platform);
    console.log('ROUTE: ' + report.route);
    if (report.fallbackTarget) console.log('FALLBACK TARGET: ' + report.fallbackTarget);
    if (report.analysis.matchedKeywords.length) {
      console.log('MATCHED KEYWORDS: ' + report.analysis.matchedKeywords.join(', '));
    }
    for (const note of report.notes) console.log('NOTE: ' + note);

    // ------------------------------------------------------------------
    // 2. Run with the manifest's declared language (real-world usage:
    //    the toolchain consumer knows the source language), and report
    //    the actual execution output.
    // ------------------------------------------------------------------
    const run = await engine.run(source, { language: entry.language });
    console.log(THIN);
    console.log(
      `RUN: route=${run.route} executedLanguage=${run.executedLanguage} ` +
        `ok=${run.result.ok} exitCode=${run.result.exitCode} ` +
        `durationMs=${run.result.durationMs}`
    );
    printResultField('stdout', run.result.stdout);
    printResultField('stderr', trunc(run.result.stderr, 600));
    if (run.transpilation) {
      console.log(
        `TRANSPILE: ${run.transpilation.from} -> ${run.transpilation.to} ` +
          `strategy=${run.transpilation.strategy} via=${run.transpilation.via}`
      );
      if (run.transpilation.structuralReport) {
        const sr = run.transpilation.structuralReport;
        console.log(
          `STRUCTURAL REPORT: converted=[${sr.converted.join(', ')}] ` +
            `unsupported=[${sr.unsupported.join(', ')}]`
        );
      }
    }

    // ------------------------------------------------------------------
    // 3. Explicit structural transpile demo (rust -> go, haskell -> js)
    // ------------------------------------------------------------------
    if (entry.transpile) {
      console.log(THIN);
      const t = await engine.transpile(source, entry.transpile.from, entry.transpile.to);
      console.log(
        `EXPLICIT TRANSPILE ${entry.transpile.from} -> ${entry.transpile.to}: ` +
          `strategy=${t.strategy} via=${t.via} identity=${t.identity}`
      );
      if (t.structuralReport) {
        console.log(`  converted: [${t.structuralReport.converted.join(', ')}]`);
        console.log(`  unsupported: [${t.structuralReport.unsupported.join(', ')}]`);
      }
      console.log('  generated code:');
      console.log(indent(trunc(t.code, 2000), 4));
    }
  }

  console.log('\n' + LINE);
  console.log('PROOF COMPLETE');
  console.log(LINE);
}

main().catch((err) => {
  console.error('prove.ts failed:', err);
  process.exit(1);
});
