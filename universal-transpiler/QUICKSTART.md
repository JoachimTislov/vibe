# Quick Start Guide

Get started with the Universal Transpiler in just a few minutes!

## Prerequisites

- Node.js 18.0.0 or higher
- npm or yarn
- Optional: Mistral API key (for LLM features)

## Installation

```bash
# Clone the repository
git clone https://github.com/joachim/universal-transpiler.git
cd universal-transpiler

# Install dependencies
npm install

# Build the project
npm run build
```

## Your First Transpilation

### Using the CLI

```bash
# Transpile a JavaScript file
./bin/cli.js src/app.js --target es2020

# Or use the global command (after npm link)
universal-transpiler src/app.js --target es2020
```

### Using the API

Create a file `demo.ts`:

```typescript
import { createTranspiler } from './src/index';

async function main() {
  const transpiler = await createTranspiler();
  
  const code = `function greet(name) {
    return `Hello, ${name}!`;
  }`;
  
  const result = await transpiler.transpile(code, {
    sourceType: 'javascript',
    target: 'es2020',
  });
  
  console.log('Output:');
  console.log(result.code);
  console.log('\nStats:', result.stats);
}

main().catch(console.error);
```

Run it:
```bash
npx ts-node demo.ts
```

## Common Use Cases

### 1. Basic Transpilation

```typescript
const result = await transpiler.transpile(
  'const x = 1 + 2;',
  {
    sourceType: 'javascript',
    target: 'javascript',
  }
);
console.log(result.code);
```

### 2. Cross-Language Conversion

```typescript
const pythonCode = `def add(a, b): return a + b`;
const jsCode = await transpiler.transpile(pythonCode, {
  sourceType: 'python',
  target: 'javascript',
});
```

### 3. Domain-Specific Transformations

```typescript
const reactCode = `function MyComponent() { return <div>Hello</div>; }`;
const vueCode = await transpiler.transpile(reactCode, {
  sourceType: 'javascript',
  target: 'javascript',
  domain: 'web', // Apply web-specific transforms
});
```

### 4. With LLM Fallback

```typescript
const transpiler = await createTranspiler({
  llm: {
    provider: 'mistral',
    model: 'mistral-large-latest',
    apiKey: process.env.MISTRAL_API_KEY,
  },
});

// Parse unknown syntax
const customCode = `module MyApp { function main() { print "Hello"; } }`;
const result = await transpiler.transpile(customCode, {
  llmFallback: true,
  dynamic: true,
});
```

### 5. 5GL Abstraction Compilation

```typescript
const abstraction = {
  name: 'UserProfile',
  type: 'declaration',
  parameters: [
    { name: 'user', type: 'object', required: true },
  ],
  body: {
    type: 'Component',
    name: 'UserProfile',
    props: { user: 'object' },
  },
  semantics: 'A user profile component',
};

const reactCode = await transpiler.compile5GL(abstraction, 'web', 'react');
```

## Configuration Options

### Transpiler Options

```typescript
const transpiler = await createTranspiler({
  // Core options
  enableLLMFallback: true,    // Enable LLM fallback for unknown syntax
  enableCaching: true,       // Enable caching
  enableDynamic: true,       // Enable dynamic code generation
  defaultLanguage: 'javascript',
  debug: false,
  
  // LLM options
  llm: {
    provider: 'mistral',
    model: 'mistral-large-latest',
    apiKey: process.env.MISTRAL_API_KEY,
    endpoint: 'https://api.mistral.ai/v1/chat/completions',
    temperature: 0.7,
    maxTokens: 4096,
  },
  
  // Cache options
  cacheMemorySize: 1000,      // Max entries in memory cache
  cacheFilesystemPath: './cache',
  cacheDefaultTTL: 86400000,  // 24 hours
  
  // Domain options
  loadBuiltinDomains: true,
});
```

## CLI Reference

### Basic Usage

```bash
universal-transpiler <input> [options]
```

### Options

| Option | Description | Default |
|--------|-------------|---------|
| `-i, --input <file>` | Input file | - |
| `-o, --output <file>` | Output file | - |
| `-t, --target <lang>` | Target language | `javascript` |
| `-f, --from <lang>` | Source language | auto-detect |
| `-d, --domain <domain>` | Domain for transformations | - |
| `--interactive` | Start interactive mode | false |
| `--llm` | Enable LLM fallback | false |
| `--no-cache` | Disable caching | false |
| `--no-dynamic` | Disable dynamic generation | false |
| `--stats` | Show statistics | false |
| `--verbose` | Verbose output | false |
| `-h, --help` | Show help | - |
| `--version` | Show version | - |

### Examples

```bash
# Transpile TypeScript to JavaScript
universal-transpiler app.ts --target javascript

# Transpile with web domain
universal-transpiler Component.jsx --domain web --target vue

# Enable LLM for unknown syntax
universal-transpiler custom.code --llm

# Interactive mode
universal-transpiler --interactive

# Show statistics
universal-transpiler app.js --stats
```

## Interactive Mode

Start interactive mode:
```bash
universal-transpiler --interactive
```

### Commands

| Command | Description |
|---------|-------------|
| `:quit, :exit` | Exit interactive mode |
| `:help` | Show help |
| `:languages` | List supported languages |
| `:domains` | List supported domains |
| `:clear` | Clear cache |
| `<code>` | Transpile the given code |

### Example Session

```
> universal-transpiler --interactive
Universal Transpiler - Interactive Mode
Type :quit to exit, :help for commands

> function add(a, b) { return a + b; }

Result:
function add(a, b) { return a + b; }

> :languages
Supported Languages:
  - javascript
  - typescript
  - python
  - html
  - css

> :domains
Supported Domains:
  - web
  - data
  - ai
  - system
  - finance
  - game

> :quit
Goodbye!
```

## Troubleshooting

### Common Issues

1. **LLM not working**
   - Ensure you have a valid API key
   - Check your network connection
   - Verify the API endpoint is correct

2. **Slow performance**
   - Enable caching: `enableCaching: true`
   - Use memory cache for faster access
   - Reduce LLM calls by caching results

3. **Unknown language**
   - Try enabling LLM fallback
   - Add a custom language definition
   - Use `--from` to specify the language

4. **Parse errors**
   - Check the error message for line numbers
   - Enable debug mode for more details
   - Try simplifying the code

### Debug Mode

```typescript
const transpiler = await createTranspiler({
  debug: true,
});
```

Or via CLI:
```bash
universal-transpiler app.js --verbose
```

## Next Steps

1. **Explore Examples**: Check out the `examples/` directory
2. **Read Documentation**: See `README.md` for full details
3. **Try Different Languages**: Experiment with different source/target combinations
4. **Enable LLM**: Add your Mistral API key for advanced features
5. **Create Custom Domains**: Define your own domain-specific transformations
6. **Extend the System**: Add new languages and features

## Support

- **Issues**: Report bugs on GitHub
- **Documentation**: See `README.md` and `IMPLEMENTATION_SUMMARY.md`
- **Community**: Join the discussion (link coming soon)

---

**Happy Transpiling!** 🚀
