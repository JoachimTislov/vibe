# Universal Transpiler

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node-%3E%3D18.0.0-green.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)

**A self-extending, self-learning compiler infrastructure that can digest any syntax.**

## Overview

The Universal Transpiler is a revolutionary approach to code transformation that:

1. **Reuses Existing Transpilers** - Integrates with Babel, TypeScript, Acorn, Espree, and other parsers
2. **Dynamically Understands New Syntax** - Uses LLM (Mistral, OpenAI, etc.) to parse and understand unknown syntax
3. **Generates Code On-the-Fly** - Creates parsers, transforms, and compilers dynamically when needed
4. **Caches Definitions** - Stores generated code and definitions for deterministic reuse
5. **Domain-Specific Abstractions** - Provides 5GL (Fifth-Generation Language) capabilities for declarative programming
6. **Self-Extending** - Continuously learns and improves as it encounters new syntax

## Features

### Core Capabilities

- **Universal Parsing** - Parse any programming language, known or unknown
- **Cross-Language Transpilation** - Transform code between different languages
- **Dynamic Code Generation** - Generate parsers and compilers on demand
- **Intelligent Caching** - Multi-level cache system for performance
- **Domain Awareness** - Understand and transform domain-specific constructs

### Supported Languages

**Built-in:**
- JavaScript (ES2025)
- TypeScript
- Python
- HTML
- CSS

**Extensible:**
- Any language can be added via configuration
- Dynamic language support via LLM
- Custom language definitions

### Supported Domains

**Built-in:**
- **Web** - HTML, CSS, JavaScript, React, Vue, etc.
- **Data** - Data processing, ETL, pipelines
- **AI/ML** - Machine learning, neural networks
- **System** - System programming, file I/O, networking
- **Finance** - Financial calculations, trading
- **Game** - Game development, 3D graphics

**Extensible:**
- Create custom domains with domain-specific patterns and transforms
- Define domain-specific 5GL abstractions

### LLM Integration

- **Mistral API** - Primary LLM provider
- **OpenAI API** - Alternative provider support
- **Local LLMs** - Support for locally hosted models
- **Fallback Mechanism** - Graceful degradation when LLM is unavailable

## Installation

```bash
# Clone the repository
git clone https://github.com/joachim/universal-transpiler.git
cd universal-transpiler

# Install dependencies
npm install

# Build the project
npm run build

# Install globally (optional)
npm link
```

## Usage

### Command Line Interface

```bash
# Basic transpilation
universal-transpiler src/app.js --target es2020

# Specify source language
universal-transpiler src/app.ts --from typescript --target javascript

# Use domain-specific transformations
universal-transpiler src/app.jsx --domain web --target vue

# Enable LLM fallback for unknown syntax
universal-transpiler src/custom.code --llm

# Interactive mode
universal-transpiler --interactive

# Show statistics
universal-transpiler src/app.js --stats
```

### Programmatic Usage

```typescript
import { createTranspiler } from 'universal-transpiler';

async function transpileCode() {
  const transpiler = await createTranspiler({
    enableLLMFallback: true,
    enableCaching: true,
    enableDynamic: true,
    llm: {
      provider: 'mistral',
      model: 'mistral-large-latest',
      apiKey: process.env.MISTRAL_API_KEY,
    },
  });

  // Transpile code
  const result = await transpiler.transpile(
    'function add(a, b) { return a + b; }',
    {
      target: 'es2020',
      sourceType: 'javascript',
      domain: 'web',
    }
  );

  console.log(result.code);
}
```

### With Domain-Specific Features

```typescript
import { createTranspiler } from 'universal-transpiler';

async function useDomains() {
  const transpiler = await createTranspiler({
    enableLLMFallback: true,
    loadBuiltinDomains: true,
  });

  // Transpile with web domain
  const webResult = await transpiler.transpile(reactCode, {
    domain: 'web',
    target: 'vue',
  });

  // Transpile with data domain
  const dataResult = await transpiler.transpile(dataCode, {
    domain: 'data',
    target: 'javascript',
  });

  // Compile 5GL abstraction
  const code = await transpiler.compile5GL(
    userProfileAbstraction,
    'web',
    'react'
  );
}
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Universal Transpiler                       │
├─────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐      │
│  │   Parser     │    │  Transformer │    │  Generator   │      │
│  │             │    │             │    │             │      │
│  │ - Babel     │    │ - Tree      │    │ - JavaScript│      │
│  │ - TypeScript │    │   Visitors  │    │ - TypeScript │      │
│  │ - Acorn     │    │ - Domain    │    │ - Python    │      │
│  │ - Dynamic   │    │   Transforms│    │ - Dynamic   │      │
│  └─────────────┘    └─────────────┘    └─────────────┘      │
│           │                 │                   │                │
│           └─────────────────┬───────────────────┘                │
│                             ▼                                     │
│                  ┌─────────────────────┐                         │
│                  │      AST (Abstract   │                         │
│                  │    Syntax Tree)      │                         │
│                  └─────────────────────┘                         │
│                             ▼                                     │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │                      LLM Integration                        │  │
│  │  - Mistral API                                        │  │
│  │  - OpenAI API                                         │  │
│  │  - Local LLMs                                         │  │
│  │  - Code Generation                                    │  │
│  │  - Parser Generation                                  │  │
│  │  - Transform Generation                               │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │                      Cache System                          │  │
│  │  - Memory Cache          │  │
│  │  - Filesystem Cache      │  │
│  │  - Multi-level Cache     │  │
│  │  - TTL-based Eviction    │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │                      Domain System                         │  │
│  │  - Web Domain           │  │
│  │  - Data Domain          │  │
│  │  - AI Domain            │  │
│  │  - System Domain        │  │
│  │  - Finance Domain       │  │
│  │  - Game Domain          │  │
│  │  - Custom Domains       │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                                  │
└─────────────────────────────────────────────────────────────┘
```

## 5GL (Fifth-Generation Language) Support

The Universal Transpiler includes support for Fifth-Generation Languages, which are high-level, declarative languages that focus on **what** to compute rather than **how** to compute it.

### Creating 5GL Abstractions

```typescript
import { createTranspiler } from 'universal-transpiler';

const transpiler = await createTranspiler();

// Define a 5GL abstraction for a user interface
const userInterfaceAbstraction = {
  name: 'UserDashboard',
  type: 'declaration',
  parameters: [
    { name: 'user', type: 'object', required: true },
    { name: 'theme', type: 'string', required: false, default: 'light' },
  ],
  body: {
    type: 'Dashboard',
    components: [
      { type: 'UserProfile', user: '{user}' },
      { type: 'Navigation' },
      { type: 'ContentArea' },
    ],
    theme: '{theme}',
  },
  semantics: 'A user dashboard with profile, navigation, and content',
};

// Compile to React
const reactCode = await transpiler.compile5GL(
  userInterfaceAbstraction,
  'web',
  'react'
);

// Compile to Vue
const vueCode = await transpiler.compile5GL(
  userInterfaceAbstraction,
  'web',
  'vue'
);
```

### Built-in 5GL Abstractions

The Universal Transpiler comes with built-in 5GL abstractions for various domains:

#### Web Domain
- **Component** - Declarative UI components
- **Page** - Complete web pages
- **DataSource** - Data fetching and management

#### Data Domain
- **Pipeline** - Data processing pipelines
- **Transform** - Data transformation steps
- **Aggregation** - Data aggregation operations

#### AI Domain
- **Model** - Machine learning model declarations
- **Training** - Model training processes
- **Prediction** - Model prediction operations

## LLM Configuration

### Mistral API

```typescript
import { createTranspiler } from 'universal-transpiler';

const transpiler = await createTranspiler({
  llm: {
    provider: 'mistral',
    model: 'mistral-large-latest',
    apiKey: process.env.MISTRAL_API_KEY,
    endpoint: 'https://api.mistral.ai/v1/chat/completions',
    temperature: 0.7,
    maxTokens: 4096,
  },
});
```

### OpenAI API

```typescript
const transpiler = await createTranspiler({
  llm: {
    provider: 'openai',
    model: 'gpt-4',
    apiKey: process.env.OPENAI_API_KEY,
    endpoint: 'https://api.openai.com/v1/chat/completions',
  },
});
```

### Local LLMs

```typescript
const transpiler = await createTranspiler({
  llm: {
    provider: 'local',
    model: 'llama-7b',
    endpoint: 'http://localhost:11434/v1/chat/completions',
  },
});
```

## Custom Language Definition

```typescript
import { createTranspiler } from 'universal-transpiler';

const transpiler = await createTranspiler();

// Define a custom language
transpiler.registerLanguage({
  name: 'my-language',
  version: '1.0',
  extensions: ['.mylang'],
  mimetypes: ['text/x-my-language'],
  parser: {
    parse: (source: string) => {
      // Your custom parser implementation
      return { ast, tokens, errors, warnings };
    },
    tokenize: (source: string) => {
      // Your custom tokenizer
      return tokens;
    },
    canParse: (source: string) => {
      // Check if source is in your language
      return isMyLanguage(source);
    },
  },
  keywords: ['print', 'function', 'if', 'else'],
  operators: ['+', '-', '*', '/', '=', '=='],
  builtins: {
    print: 'Print a value to console',
  },
});
```

## Custom Domain Definition

```typescript
import { createTranspiler } from 'universal-transpiler';

const transpiler = await createTranspiler();

// Define a custom domain
transpiler.registerDomain({
  name: 'my-domain',
  description: 'Custom domain for my specific use case',
  keywords: ['entity', 'component', 'system'],
  operators: [],
  types: {
    Entity: 'A custom entity type',
    Component: 'A reusable component',
  },
  patterns: [
    {
      name: 'entity-pattern',
      pattern: (node) => node.type === 'EntityDeclaration',
      handler: (node, context) => {
        // Transform entity declarations
        return transformedNode;
      },
      priority: 10,
    },
  ],
  transforms: {
    'my-optimization': {
      name: 'my-domain:optimization',
      description: 'Custom optimization for my domain',
      apply: (ast, context) => {
        // Apply custom transformations
        return transformedAst;
      },
    },
  },
});
```

## Cache Configuration

```typescript
import { createTranspiler } from 'universal-transpiler';

const transpiler = await createTranspiler({
  // Memory cache with 1000 entries
  cacheMemorySize: 1000,
  
  // Filesystem cache in custom directory
  cacheFilesystemPath: './my-cache',
  
  // Default TTL of 24 hours
  cacheDefaultTTL: 86400000,
});

// Clear cache
transpiler.clearCache();

// Get cache statistics
const stats = await transpiler.cache.getStats();
console.log(`Cache entries: ${stats.size}`);
```

## Performance Considerations

1. **Caching** - Enable caching for better performance with repeated transpilations
2. **LLM Usage** - LLM calls add latency; use caching to minimize them
3. **Memory** - The memory cache is fast but limited in size
4. **Filesystem** - The filesystem cache is slower but persistent
5. **Multi-level** - The default is a multi-level cache (memory + filesystem)

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run `npm test` to ensure all tests pass
5. Submit a pull request

## License

MIT License - See [LICENSE](LICENSE) for details.

## Roadmap

### v1.0 (Current)
- Core transpilation engine
- LLM integration (Mistral, OpenAI)
- Basic caching system
- Built-in language support (JS, TS, Python, HTML, CSS)
- Built-in domain support (Web, Data, AI, System, Finance, Game)

### v1.1
- More built-in language parsers
- Improved LLM prompt engineering
- Better error handling and recovery
- Performance optimizations

### v1.2
- Advanced 5GL features
- More domain-specific abstractions
- Custom domain and language marketplace
- Plugin system

### v2.0
- Self-hosted LLM support
- Collaborative learning between instances
- Distributed transpilation network
- IDE integration

## Support

- **Documentation** - See [docs/](docs/) for detailed documentation
- **Issues** - Report bugs and request features on GitHub
- **Discussions** - Join the discussion on GitHub Discussions
- **Community** - Join our Discord server (link coming soon)

## Acknowledgments

- Mistral AI for their powerful LLM technology
- The TypeScript team for their excellent type system
- The Babel team for their parser and transpiler infrastructure
- All contributors who have helped make this project possible

---

**Universal Transpiler - The future of code transformation.**
