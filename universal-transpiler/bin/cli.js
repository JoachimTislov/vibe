#!/usr/bin/env node

/**
 * Universal Transpiler CLI
 * 
 * Usage:
 *   universal-transpiler <input> [options]
 * 
 * Examples:
 *   universal-transpiler src/app.js --target es2020
 *   universal-transpiler src/app.ts --target javascript
 *   universal-transpiler src/app.py --target javascript --domain data
 *   universal-transpiler --interactive
 */

const fs = require('fs');
const path = require('path');
const { createTranspiler } = require('../dist/index.js');

async function main() {
  const args = process.argv.slice(2);
  
  // Parse command line arguments
  const options = parseArguments(args);
  
  if (options.help) {
    printHelp();
    process.exit(0);
  }
  
  if (options.version) {
    printVersion();
    process.exit(0);
  }
  
  // Create transpiler
  const transpiler = await createTranspiler({
    enableLLMFallback: options.llm,
    enableCaching: !options.noCache,
    enableDynamic: !options.noDynamic,
    defaultLanguage: options.from || 'javascript',
    debug: options.verbose,
    llm: options.llmConfig,
    cacheFilesystemPath: options.cachePath,
    cacheMemorySize: options.cacheSize,
  });
  
  if (options.interactive) {
    await runInteractiveMode(transpiler);
    return;
  }
  
  if (!options.input) {
    console.error('Error: No input file specified');
    printHelp();
    process.exit(1);
  }
  
  // Process input file
  try {
    const inputPath = path.resolve(options.input);
    const source = fs.readFileSync(inputPath, 'utf8');
    
    const result = await transpiler.transpile(source, {
      target: options.target || 'javascript',
      sourceType: options.from,
      domain: options.domain,
      dynamic: !options.noDynamic,
      cache: !options.noCache,
      llmFallback: options.llm,
    });
    
    if (result.errors.length > 0) {
      console.error('Errors:');
      for (const error of result.errors) {
        console.error(`  Line ${error.position.line}: ${error.message}`);
      }
      process.exit(1);
    }
    
    if (result.warnings.length > 0) {
      console.warn('Warnings:');
      for (const warning of result.warnings) {
        console.warn(`  Line ${warning.position?.line || 0}: ${warning}`);
      }
    }
    
    // Output result
    if (options.output) {
      const outputPath = path.resolve(options.output);
      fs.writeFileSync(outputPath, result.code);
      console.log(`Output written to: ${outputPath}`);
    } else {
      console.log(result.code);
    }
    
    if (options.stats) {
      console.log('\nStats:');
      console.log(`  Input size: ${result.stats.inputSize} bytes`);
      console.log(`  Output size: ${result.stats.outputSize} bytes`);
      console.log(`  Parse time: ${result.stats.parseTime}ms`);
      console.log(`  Transform time: ${result.stats.transformTime}ms`);
      console.log(`  Generate time: ${result.stats.generateTime}ms`);
      console.log(`  Total time: ${result.stats.parseTime + result.stats.transformTime + result.stats.generateTime}ms`);
      if (result.stats.cached) console.log('  Cached: yes');
      if (result.stats.dynamicallyGenerated) console.log('  Dynamically generated: yes');
      if (result.stats.llmCalls) console.log(`  LLM calls: ${result.stats.llmCalls}`);
    }
  } catch (error) {
    console.error('Error:', error.message);
    if (options.verbose) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

function parseArguments(args) {
  const options = {
    input: null,
    output: null,
    target: null,
    from: null,
    domain: null,
    interactive: false,
    help: false,
    version: false,
    verbose: false,
    llm: false,
    noCache: false,
    noDynamic: false,
    stats: false,
    llmConfig: null,
    cachePath: null,
    cacheSize: 1000,
  };
  
  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    
    switch (arg) {
      case '-i':
      case '--input':
        options.input = args[++i];
        break;
      case '-o':
      case '--output':
        options.output = args[++i];
        break;
      case '-t':
      case '--target':
        options.target = args[++i];
        break;
      case '-f':
      case '--from':
        options.from = args[++i];
        break;
      case '-d':
      case '--domain':
        options.domain = args[++i];
        break;
      case '--interactive':
        options.interactive = true;
        break;
      case '-h':
      case '--help':
        options.help = true;
        break;
      case '-v':
      case '--version':
        options.version = true;
        break;
      case '--verbose':
        options.verbose = true;
        break;
      case '--llm':
        options.llm = true;
        break;
      case '--no-cache':
        options.noCache = true;
        break;
      case '--no-dynamic':
        options.noDynamic = true;
        break;
      case '--stats':
        options.stats = true;
        break;
      case '--llm-config':
        options.llmConfig = JSON.parse(args[++i]);
        break;
      case '--cache-path':
        options.cachePath = args[++i];
        break;
      case '--cache-size':
        options.cacheSize = parseInt(args[++i], 10);
        break;
      default:
        if (arg.startsWith('-')) {
          console.error(`Unknown option: ${arg}`);
          process.exit(1);
        }
        if (!options.input) {
          options.input = arg;
        } else if (!options.output) {
          options.output = arg;
        } else if (!options.target) {
          options.target = arg;
        }
        break;
    }
    
    i++;
  }
  
  return options;
}

function printHelp() {
  console.log(`Universal Transpiler - A transpiler that can understand any syntax

Usage:
  universal-transpiler <input> [options]
  universal-transpiler [options]

Arguments:
  <input>                    Input file to transpile

Options:
  -i, --input <file>        Input file (alternative to positional argument)
  -o, --output <file>       Output file
  -t, --target <lang>       Target language (default: javascript)
  -f, --from <lang>         Source language (auto-detected if not specified)
  -d, --domain <domain>    Domain for domain-specific transformations
  --interactive            Start interactive mode
  --llm                    Enable LLM fallback for unknown syntax
  --no-cache               Disable caching
  --no-dynamic             Disable dynamic code generation
  --stats                  Show transpilation statistics
  --llm-config <json>      LLM configuration as JSON
  --cache-path <path>      Cache directory path
  --cache-size <number>    Cache maximum size (default: 1000)
  -v, --verbose            Verbose output
  -h, --help               Show this help message
  --version                Show version number

Examples:
  universal-transpiler src/app.js --target es2020
  universal-transpiler src/app.ts --target javascript
  universal-transpiler src/app.py --target javascript --domain data
  universal-transpiler --interactive
  universal-transpiler src/app.jsx --target vue --llm

Supported Languages:
  javascript, typescript, python, html, css

Supported Domains:
  web, data, ai, system, finance, game

Supported Targets:
  javascript, typescript, python, es2020, es2015, etc.

For more information, visit: https://github.com/joachim/universal-transpiler`);
}

function printVersion() {
  try {
    const packageJson = require('../package.json');
    console.log(`Universal Transpiler v${packageJson.version}`);
  } catch {
    console.log('Universal Transpiler v1.0.0');
  }
}

async function runInteractiveMode(transpiler) {
  console.log('Universal Transpiler - Interactive Mode');
  console.log('Type :quit to exit, :help for commands\n');
  
  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '> ',
  });
  
  rl.prompt();
  
  rl.on('line', async (line) => {
    line = line.trim();
    
    if (line === ':quit' || line === ':exit') {
      rl.close();
      return;
    }
    
    if (line === ':help') {
      console.log('\nInteractive Mode Commands:');
      console.log('  :quit, :exit       Exit interactive mode');
      console.log('  :help              Show this help');
      console.log('  :languages         List supported languages');
      console.log('  :domains           List supported domains');
      console.log('  :clear             Clear cache');
      console.log('  <code>             Transpile the given code');
      console.log('');
      rl.prompt();
      return;
    }
    
    if (line === ':languages') {
      const languages = transpiler.getSupportedLanguages();
      console.log('\nSupported Languages:');
      for (const lang of languages) {
        console.log(`  - ${lang}`);
      }
      console.log('');
      rl.prompt();
      return;
    }
    
    if (line === ':domains') {
      const domains = transpiler.getSupportedDomains();
      console.log('\nSupported Domains:');
      for (const domain of domains) {
        console.log(`  - ${domain}`);
      }
      console.log('');
      rl.prompt();
      return;
    }
    
    if (line === ':clear') {
      transpiler.clearCache();
      console.log('Cache cleared\n');
      rl.prompt();
      return;
    }
    
    if (line.startsWith(':')) {
      console.error(`Unknown command: ${line}`);
      rl.prompt();
      return;
    }
    
    // Transpile the code
    try {
      const result = await transpiler.transpile(line, {
        target: 'javascript',
        llmFallback: true,
        cache: true,
        dynamic: true,
      });
      
      if (result.errors.length > 0) {
        console.error('Errors:');
        for (const error of result.errors) {
          console.error(`  Line ${error.position.line}: ${error.message}`);
        }
      } else if (result.code) {
        console.log('\nResult:');
        console.log(result.code);
        console.log('');
      }
    } catch (error) {
      console.error('Error:', error.message);
    }
    
    rl.prompt();
  }).on('close', () => {
    console.log('\nGoodbye!');
    process.exit(0);
  });
}

// Start CLI
if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error.message);
    if (process.argv.includes('--verbose') || process.argv.includes('-v')) {
      console.error(error.stack);
    }
    process.exit(1);
  });
}

module.exports = { main, parseArguments, printHelp, printVersion, runInteractiveMode };
