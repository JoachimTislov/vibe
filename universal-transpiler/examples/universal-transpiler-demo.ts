/**
 * Universal Transpiler Demo
 * 
 * This example demonstrates the capabilities of the universal transpiler:
 * 1. Parsing and transpiling existing languages
 * 2. Dynamic syntax understanding via LLM
 * 3. Domain-specific transformations
 * 4. 5GL abstraction compilation
 */

import { createTranspiler } from '../src/index';
import type { UniversalTranspiler } from '../src/core/universal-transpiler';

// ============================================================================
// Demo: Basic Transpilation
// ============================================================================

async function demoBasicTranspilation(transpiler: UniversalTranspiler) {
  console.log('\n=== Demo 1: Basic Transpilation ===\n');
  
  // JavaScript to ES2020
  const jsCode = `
function greet(name) {
  return `Hello, ${name}!`;
}

const result = greet('World');
console.log(result);
  `;
  
  console.log('Input (JavaScript):');
  console.log(jsCode);
  
  const result1 = await transpiler.transpile(jsCode, {
    target: 'es2020',
    sourceType: 'javascript',
  });
  
  console.log('\nOutput (ES2020):');
  console.log(result1.code);
  console.log(`\nStats: ${result1.stats.inputSize} -> ${result1.stats.outputSize} bytes, ${result1.stats.parseTime + result1.stats.transformTime + result1.stats.generateTime}ms`);
}

// ============================================================================
// Demo: Language Detection
// ============================================================================

async function demoLanguageDetection(transpiler: UniversalTranspiler) {
  console.log('\n\n=== Demo 2: Language Detection ===\n');
  
  const codeSamples = [
    {
      code: `function add(a, b) { return a + b; }`,
      expected: 'javascript',
    },
    {
      code: `def add(a, b): return a + b`,
      expected: 'python',
    },
    {
      code: `<div className="app">{props.children}</div>`,
      expected: 'html',
    },
    {
      code: `interface User { name: string; age: number; }`,
      expected: 'typescript',
    },
  ];
  
  for (const sample of codeSamples) {
    const detected = await transpiler.detectLanguage(sample.code);
    console.log(`Code: ${sample.code.substring(0, 50)}${sample.code.length > 50 ? '...' : ''}`);
    console.log(`Expected: ${sample.expected}`);
    console.log(`Detected: [${detected.join(', ')}]`);
    console.log('');
  }
}

// ============================================================================
// Demo: Domain-Specific Transformations
// ============================================================================

async function demoDomainTransformations(transpiler: UniversalTranspiler) {
  console.log('\n\n=== Demo 3: Domain-Specific Transformations ===\n');
  
  // React component in JavaScript
  const reactCode = `
import React, { useState } from 'react';

function Counter() {
  const [count, setCount] = useState(0);
  
  return (
    <div>
      <button onClick={() => setCount(count + 1)}>Increment</button>
      <span>Count: {count}</span>
    </div>
  );
}

export default Counter;
  `;
  
  console.log('Input (React Component):');
  console.log(reactCode);
  
  // Transpile with web domain
  const result1 = await transpiler.transpile(reactCode, {
    target: 'javascript',
    sourceType: 'javascript',
    domain: 'web',
  });
  
  console.log('\nOutput (with web domain transformations):');
  console.log(result1.code);
  
  // Data processing pipeline
  const dataCode = `
const data = [1, 2, 3, 4, 5];
const result = data
  .map(x => x * 2)
  .filter(x => x > 5)
  .reduce((a, b) => a + b, 0);

console.log(result);
  `;
  
  console.log('\n\nInput (Data Pipeline):');
  console.log(dataCode);
  
  const result2 = await transpiler.transpile(dataCode, {
    target: 'javascript',
    sourceType: 'javascript',
    domain: 'data',
  });
  
  console.log('\nOutput (with data domain transformations):');
  console.log(result2.code);
}

// ============================================================================
// Demo: Dynamic Code Generation (LLM Fallback)
// ============================================================================

async function demoDynamicGeneration(transpiler: UniversalTranspiler) {
  console.log('\n\n=== Demo 4: Dynamic Code Generation (LLM Fallback) ===\n');
  
  // This will try to parse unknown syntax and generate a parser
  // Note: This requires LLM API access
  
  const unknownCode = `
// Hypothetical custom language
module MyApp {
  entrypoint: main
  
  function main() {
    print "Hello, World!"
  }
}
  `;
  
  console.log('Input (Hypothetical Custom Language):');
  console.log(unknownCode);
  
  console.log('\nAttempting to parse with LLM fallback...');
  
  try {
    const result = await transpiler.transpile(unknownCode, {
      target: 'javascript',
      llmFallback: true,
      dynamic: true,
    });
    
    console.log('\nParsed and transpiled result:');
    console.log(result.code);
    console.log(`\nDynamically generated: ${result.stats.dynamicallyGenerated ? 'Yes' : 'No'}`);
  } catch (error) {
    console.log('\nNote: LLM fallback requires API access to Mistral or other LLM provider');
    console.log('Error:', (error as Error).message);
  }
}

// ============================================================================
// Demo: 5GL Abstraction Compilation
// ============================================================================

async function demo5GLCompilation(transpiler: UniversalTranspiler) {
  console.log('\n\n=== Demo 5: 5GL Abstraction Compilation ===\n');
  
  // Create a 5GL abstraction for a web component
  const componentAbstraction = {
    name: 'UserProfile',
    type: 'declaration' as const,
    parameters: [
      { name: 'user', type: 'object', required: true },
      { name: 'editable', type: 'boolean', required: false, default: false },
    ],
    body: {
      type: 'Component',
      name: 'UserProfile',
      props: { user: 'object', editable: 'boolean' },
      render: {
        type: 'Block',
        children: [
          { type: 'Heading', value: 'User Profile' },
          { type: 'Text', value: '{user.name}' },
          { type: 'Text', value: '{user.email}' },
        ],
      },
    },
    semantics: 'A component that displays user profile information',
  };
  
  console.log('5GL Abstraction (UserProfile Component):');
  console.log(JSON.stringify(componentAbstraction, null, 2));
  
  console.log('\nCompiling to React:');
  try {
    const code = await transpiler.compile5GL(
      componentAbstraction,
      'web',
      'react'
    );
    console.log(code);
  } catch (error) {
    console.log('Note: 5GL compilation may require domain-specific compilers');
    console.log('Error:', (error as Error).message);
  }
  
  // Data pipeline abstraction
  const pipelineAbstraction = {
    name: 'SalesPipeline',
    type: 'transformation' as const,
    parameters: [
      { name: 'sources', type: 'DataSource[]', required: true },
      { name: 'transforms', type: 'Transform[]', required: true },
    ],
    body: {
      type: 'Pipeline',
      sources: '{sources}',
      transforms: '{transforms}',
      sink: { type: 'ConsoleSink' },
    },
    semantics: 'A data pipeline for processing sales data',
  };
  
  console.log('\n\n5GL Abstraction (Sales Pipeline):');
  console.log(JSON.stringify(pipelineAbstraction, null, 2));
  
  console.log('\nCompiling to JavaScript:');
  try {
    const code = await transpiler.compile5GL(
      pipelineAbstraction,
      'data',
      'javascript'
    );
    console.log(code);
  } catch (error) {
    console.log('Error:', (error as Error).message);
  }
}

// ============================================================================
// Demo: Cross-Language Transpilation
// ============================================================================

async function demoCrossLanguageTranspilation(transpiler: UniversalTranspiler) {
  console.log('\n\n=== Demo 6: Cross-Language Transpilation ===\n');
  
  // Python to JavaScript
  // Note: This requires proper Python parser integration
  const pythonCode = `
def factorial(n):
    if n <= 1:
        return 1
    return n * factorial(n - 1)

result = factorial(5)
print(result)
  `;
  
  console.log('Input (Python):');
  console.log(pythonCode);
  
  try {
    const result = await transpiler.transpile(pythonCode, {
      sourceType: 'python',
      target: 'javascript',
    });
    
    console.log('\nOutput (JavaScript):');
    console.log(result.code);
  } catch (error) {
    console.log('\nNote: Cross-language transpilation may require additional parsers');
    console.log('Error:', (error as Error).message);
  }
}

// ============================================================================
// Demo: Interpretation
// ============================================================================

async function demoInterpretation(transpiler: UniversalTranspiler) {
  console.log('\n\n=== Demo 7: Interpretation ===\n');
  
  const code = `
function add(a, b) {
  return a + b;
}

const result = add(2, 3);
result;
  `;
  
  console.log('Input (JavaScript):');
  console.log(code);
  
  try {
    const result = await transpiler.interpret(code, {
      sourceType: 'javascript',
    });
    
    console.log('\nInterpretation result:');
    console.log(result);
  } catch (error) {
    console.log('\nNote: Interpretation may require LLM for dynamic execution');
    console.log('Error:', (error as Error).message);
  }
}

// ============================================================================
// Demo: Cache System
// ============================================================================

async function demoCacheSystem(transpiler: UniversalTranspiler) {
  console.log('\n\n=== Demo 8: Cache System ===\n');
  
  const code = `function test() { return 'cached'; }`;
  
  console.log('Transpiling for the first time...');
  const result1 = await transpiler.transpile(code, {
    target: 'javascript',
    cache: true,
  });
  console.log(`Cached: ${result1.stats.cached ? 'Yes' : 'No'}`);
  
  console.log('\nTranspiling the same code again...');
  const result2 = await transpiler.transpile(code, {
    target: 'javascript',
    cache: true,
  });
  console.log(`Cached: ${result2.stats.cached ? 'Yes' : 'No'}`);
  
  console.log('\nCache statistics:');
  const cacheStats = await transpiler.cache.getStats();
  console.log(`Entries: ${cacheStats.size}`);
  
  console.log('\nClearing cache...');
  transpiler.clearCache();
  
  console.log('\nTranspiling after cache clear...');
  const result3 = await transpiler.transpile(code, {
    target: 'javascript',
    cache: true,
  });
  console.log(`Cached: ${result3.stats.cached ? 'Yes' : 'No'}`);
}

// ============================================================================
// Main Demo Runner
// ============================================================================

async function runAllDemos() {
  console.log('Universal Transpiler - Full Demo Suite');
  console.log('='.repeat(60));
  
  // Create transpiler with LLM disabled by default for demos
  const transpiler = await createTranspiler({
    enableLLMFallback: false, // Set to true if you have LLM API access
    enableCaching: true,
    enableDynamic: true,
    debug: true,
  });
  
  try {
    // Run all demos
    await demoBasicTranspilation(transpiler);
    await demoLanguageDetection(transpiler);
    await demoDomainTransformations(transpiler);
    await demoDynamicGeneration(transpiler);
    await demo5GLCompilation(transpiler);
    await demoCrossLanguageTranspilation(transpiler);
    await demoInterpretation(transpiler);
    await demoCacheSystem(transpiler);
    
    console.log('\n\n' + '='.repeat(60));
    console.log('All demos completed!');
    console.log('='.repeat(60));
  } catch (error) {
    console.error('\n\nDemo failed:', error);
  }
}

// ============================================================================
// Advanced: Custom Domain Definition
// ============================================================================

async function demoCustomDomain() {
  console.log('\n\n=== Advanced: Custom Domain Definition ===\n');
  
  const transpiler = await createTranspiler();
  
  // Define a custom domain for game development
  transpiler.registerDomain({
    name: 'my-game',
    description: 'Custom game development domain',
    keywords: ['entity', 'component', 'system', 'scene', 'asset'],
    operators: [],
    types: {
      Entity: 'A game entity',
      Component: 'A reusable game component',
      System: 'A game system',
    },
    patterns: [],
    transforms: {
      'game-optimization': {
        name: 'my-game:optimization',
        description: 'Optimize game code',
        apply: (ast) => {
          console.log('Applying custom game optimization');
          return ast;
        },
      },
    },
  });
  
  console.log('Registered custom domain: my-game');
  console.log('Supported domains:', transpiler.getSupportedDomains().join(', '));
  
  // Test the custom domain
  const code = `
class Player extends Entity {
  constructor() {
    super();
    this.health = 100;
  }
}
  `;
  
  const result = await transpiler.transpile(code, {
    domain: 'my-game',
  });
  
  console.log('\nTranspiled with custom domain:');
  console.log(result.code);
}

// ============================================================================
// Advanced: Custom Language Definition
// ============================================================================

async function demoCustomLanguage() {
  console.log('\n\n=== Advanced: Custom Language Definition ===\n');
  
  const transpiler = await createTranspiler();
  
  // Define a simple custom language
  transpiler.registerLanguage({
    name: 'miniscript',
    version: '1.0',
    extensions: ['.ms'],
    mimetypes: ['text/x-miniscript'],
    parser: {
      parse: (source: string) => {
        // Simple parser that creates a basic AST
        const ast = {
          type: 'Program',
          children: [],
          tokens: [],
          position: { line: 0, column: 0, offset: 0 },
          location: {
            start: { line: 0, column: 0, offset: 0 },
            end: { line: 0, column: source.length, offset: source.length },
            source,
          },
        };
        
        // Split into lines and create statement nodes
        const lines = source.split('\n');
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;
          
          const statement = {
            type: 'Statement',
            value: line,
            children: [],
            tokens: [],
            position: { line: i + 1, column: 0, offset: source.substring(0, i * (i + 1) / 2).length },
            location: {
              start: { line: i + 1, column: 0, offset: source.substring(0, i * (i + 1) / 2).length },
              end: { line: i + 1, column: line.length, offset: source.substring(0, i * (i + 1) / 2).length + line.length },
              source: line,
            },
          };
          
          ast.children.push(statement);
        }
        
        return {
          ast,
          tokens: [],
          errors: [],
          warnings: [],
        };
      },
      tokenize: (source: string) => [],
      canParse: (source: string) => true, // Always try to parse
    },
    keywords: ['print', 'function', 'if', 'else', 'while', 'return'],
    operators: ['+', '-', '*', '/', '=', '==', '!=', '<', '>'],
    builtins: {
      print: 'Print a value',
    },
  });
  
  console.log('Registered custom language: miniscript');
  console.log('Supported languages:', transpiler.getSupportedLanguages().join(', '));
  
  // Test the custom language
  const miniScriptCode = `
print "Hello, World!"
x = 5 + 3
print x
  `;
  
  const result = await transpiler.transpile(miniScriptCode, {
    sourceType: 'miniscript',
    target: 'javascript',
  });
  
  console.log('\nMiniscript code:');
  console.log(miniScriptCode);
  console.log('\nParsed AST:');
  console.log(JSON.stringify(result.ast, null, 2));
}

// ============================================================================
// Run Specific Demos
// ============================================================================

// Uncomment the demos you want to run:

// Basic demos
// runAllDemos();

// Advanced demos
demoCustomDomain().catch(console.error);
demoCustomLanguage().catch(console.error);

// Or run a specific demo:
// demoBasicTranspilation(createSimpleTranspiler()).catch(console.error);
// demoLanguageDetection(createSimpleTranspiler()).catch(console.error);
// demoDomainTransformations(createSimpleTranspiler()).catch(console.error);

console.log('\nNote: Run "npm run build" first to compile TypeScript files.');
console.log('Then run: node dist/examples/universal-transpiler-demo.js');
