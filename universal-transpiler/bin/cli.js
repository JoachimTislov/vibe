#!/usr/bin/env node
'use strict';

/**
 * Universal Transpiler CLI entry point (shim).
 *
 * The CLI implementation lives in TypeScript (bin/cli.ts) so it can import
 * the engine directly from the live sources in src/. This shim registers
 * ts-node (transpile-only, CommonJS) and then requires the real CLI.
 *
 * See bin/README.md for the full rationale.
 */

const path = require('path');

const root = path.resolve(__dirname, '..');

let tsNode;
try {
  // Resolve against the project so the CLI works from any cwd and via
  // `npm start` without depending on global installs.
  tsNode = require(require.resolve('ts-node', { paths: [root] }));
} catch (err) {
  process.stderr.write(
    'universal-transpiler: ts-node is required to run the CLI from sources. ' +
      'Install dev dependencies with `npm install`.\n'
  );
  process.exit(1);
}

tsNode.register({
  // No type-checking: the CLI is exercised by jest and verify-cli.sh.
  transpileOnly: true,
  // Compile the project's own tsconfig, but override the module settings:
  // the require hook must emit CommonJS regardless of NodeNext in tsconfig.
  project: path.join(root, 'tsconfig.json'),
  compilerOptions: {
    module: 'commonjs',
    moduleResolution: 'node',
    target: 'es2022',
    esModuleInterop: true,
    allowSyntheticDefaultImports: true,
    skipLibCheck: true,
    sourceMap: false,
    declaration: false,
    strict: false,
    experimentalDecorators: true,
    emitDecoratorMetadata: true,
    noUnusedLocals: false,
    noUnusedParameters: false,
    noImplicitReturns: false,
    noFallthroughCasesInSwitch: false,
  },
});

require('./cli.ts');
