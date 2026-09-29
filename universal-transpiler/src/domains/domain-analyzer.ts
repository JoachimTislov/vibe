/**
 * Universal Transpiler - Domain Analyzer
 *
 * Resolves: source keywords + declared domain + framework hints
 *        -> concrete domain -> target platform -> output mode
 *
 * This is the piece that makes "any syntax in, platform-decided output out"
 * work: the same source run with domain=wasm produces a wasm module,
 * domain=cli produces a native binary, domain=web-backend produces a
 * server bundle on the appropriate runtime.
 */

import type { OutputMode, PlatformTarget } from '../toolchains/types';
import { detectFrameworksInSource } from '../frameworks/framework-registry';

// ============================================================================
// Domain catalog
// ============================================================================

export interface DomainSpec {
  id: string;
  name: string;
  /** Keywords (lowercase identifiers) that signal this domain */
  keywords: string[];
  /** Default platform when this domain is chosen */
  defaultPlatform: PlatformTarget;
  /** Default output mode */
  defaultOutputMode: OutputMode;
  /** Description used for LLM prompting when extending */
  description: string;
}

export const DOMAIN_CATALOG: DomainSpec[] = [
  {
    id: 'web-frontend',
    name: 'Web Frontend',
    keywords: [
      'react', 'component', 'render', 'jsx', 'tsx', 'dom', 'html', 'css',
      'browser', 'onclick', 'usestate', 'useeffect', 'props', 'vue', 'svelte',
      'angular', 'hook', 'virtualdom',
    ],
    defaultPlatform: 'browser',
    defaultOutputMode: 'compile',
    description: 'UI components and browser applications',
  },
  {
    id: 'web-backend',
    name: 'Web Backend',
    keywords: [
      'server', 'app.listen', 'router', 'handler', 'middleware', 'http',
      'rest', 'api', 'endpoint', 'get(', 'post(', 'controller', 'request',
      'response', 'res.send', 'axum', 'actix', 'gin', 'echo', 'springboot',
      'servlet', 'yesod', 'servant', 'grpc',
    ],
    defaultPlatform: 'native',
    defaultOutputMode: 'compile',
    description: 'HTTP servers and API backends',
  },
  {
    id: 'cli',
    name: 'Command Line Tool',
    keywords: [
      'main', 'argv', 'args', 'flag', 'command', 'cli', 'stdin', 'stdout',
      'stderr', 'println', 'printf', 'clap', 'cobra', 'getopts',
    ],
    defaultPlatform: 'native',
    defaultOutputMode: 'compile',
    description: 'Terminal/command-line programs',
  },
  {
    id: 'systems',
    name: 'Systems Programming',
    keywords: [
      'unsafe', 'pointer', 'malloc', 'free', 'memory', 'syscall', 'mmap',
      'thread', 'async', 'await', 'spawn', 'mutex', 'atomic', 'channel',
      'arc', 'rc', 'borrow', 'lifetime', 'unsafe impl',
    ],
    defaultPlatform: 'native',
    defaultOutputMode: 'compile',
    description: 'Low-level systems code',
  },
  {
    id: 'data',
    name: 'Data Processing',
    keywords: [
      'sql', 'query', 'database', 'db', 'select', 'insert', 'json', 'csv',
      'parse', 'serialize', 'deserialize', 'orm', 'migration', 'schema',
      'dataframe', 'dataset', 'etl',
    ],
    defaultPlatform: 'native',
    defaultOutputMode: 'run',
    description: 'Data transformation and storage',
  },
  {
    id: 'game',
    name: 'Game / Graphics',
    keywords: [
      'sprite', 'mesh', 'texture', 'shader', 'window', 'opengl', 'vulkan',
      'dx12', 'game', 'scene', 'camera', 'physics', 'bevy', 'ggez', 'canvas',
      'framerate', 'renderer',
    ],
    defaultPlatform: 'native',
    defaultOutputMode: 'compile',
    description: 'Games and graphical applications',
  },
  {
    id: 'ml',
    name: 'Machine Learning',
    keywords: [
      'model', 'train', 'predict', 'tensor', 'neural', 'gradient', 'loss',
      'optimizer', 'inference', 'dataset', 'epoch', 'layer', 'embedding',
      'transformer', 'regression',
    ],
    defaultPlatform: 'native',
    defaultOutputMode: 'run',
    description: 'ML training and inference',
  },
  {
    id: 'mobile',
    name: 'Mobile',
    keywords: [
      'android', 'ios', 'activity', 'fragment', 'swiftui', 'uikit',
      'jetpack', 'compose', 'recyclerview', 'intent',
    ],
    defaultPlatform: 'native',
    defaultOutputMode: 'compile',
    description: 'Mobile applications',
  },
  {
    id: 'wasm',
    name: 'WebAssembly',
    keywords: [
      'wasm', 'wasm_bindgen', 'webassembly', 'wasi', 'wasm_pack',
      'extern "wasm"', 'wasm32',
    ],
    defaultPlatform: 'wasm',
    defaultOutputMode: 'compile',
    description: 'WebAssembly modules',
  },
  {
    id: 'testing',
    name: 'Testing',
    keywords: [
      'test', 'assert', 'expect', 'describe', 'it(', 'suite', 'mock',
      'fixture', 'quickcheck', 'hspec', 'junit', 'testify',
    ],
    defaultPlatform: 'native',
    defaultOutputMode: 'run',
    description: 'Test suites',
  },
  {
    id: 'script',
    name: 'Scripting / Utility',
    keywords: ['#!/', 'import os', 'import sys', 'path', 'file', 'read', 'write'],
    defaultPlatform: 'native',
    defaultOutputMode: 'run',
    description: 'General purpose scripts',
  },
  {
    id: 'food-tracking',
    name: 'Food Tracking / Shopping Lists (foodSavr)',
    keywords: [
      'food', 'pantry', 'fridge', 'freezer', 'grocery', 'groceries',
      'shopping list', 'shoppinglist', 'expiration', 'expirationdate',
      'expiry', 'expiring', 'expired', 'spoil', 'foodwaste', 'mealplan',
      'recipe', 'consumptionrate', 'openfoodfacts', 'foodsavr',
    ],
    defaultPlatform: 'native',
    defaultOutputMode: 'run',
    description:
      'Food inventory tracking synchronized with meal planning and ' +
      'consumption rates, producing shopping lists and waste alerts ' +
      '(modeled on github.com/JoachimTislov/foodsavr)',
  },
];

// ============================================================================
// Analysis
// ============================================================================

export interface DomainAnalysisRequest {
  source: string;
  /** Explicitly declared domain (wins over detection) */
  declaredDomain?: string;
  /** Explicitly declared platform (wins over everything) */
  declaredPlatform?: PlatformTarget;
  /** Language hint; detection used when absent */
  language?: string;
  /**
   * Learned keyword definitions (persisted by the engine's state).
   * Each keyword found in the source adds its domain to the score,
   * weighted by learned confidence — so newly taught keywords
   * immediately affect future analysis.
   */
  learnedKeywords?: Record<string, { domain: string; confidence: number }>;
  /**
   * Upstreamed platform preferences per domain (promoted from client
   * feedback). Applied when no platform was declared.
   */
  platformOverrides?: Record<string, PlatformTarget>;
}

export interface DomainAnalysisResult {
  /** The winning domain */
  domain: DomainSpec;
  /** All matching domains with scores */
  scores: { domainId: string; score: number }[];
  /** Keywords found that drove the decision */
  matchedKeywords: string[];
  /** Frameworks detected in source */
  frameworks: string[];
  /** The resolved platform: declared > framework default > domain default > native */
  platform: PlatformTarget;
  /** The resolved output mode */
  outputMode: OutputMode;
  /** Language detected/declared */
  language: string;
}

/** Score a source string against every domain's keyword list. */
export function analyzeDomain(request: DomainAnalysisRequest): DomainAnalysisResult {
  const { source, declaredDomain, declaredPlatform, language } = request;

  // Keyword scoring
  const normalized = source.toLowerCase();
  const scores: { domainId: string; score: number }[] = [];
  const matchedKeywords: string[] = [];

  for (const domain of DOMAIN_CATALOG) {
    let score = 0;
    for (const keyword of domain.keywords) {
      if (normalized.includes(keyword)) {
        score += keyword.length > 6 ? 2 : 1; // longer keywords are stronger signals
        matchedKeywords.push(keyword);
      }
    }
    // Learned (persisted) keyword definitions score alongside builtins
    if (request.learnedKeywords) {
      for (const [keyword, def] of Object.entries(request.learnedKeywords)) {
        if (def.domain === domain.id && normalized.includes(keyword)) {
          score += Math.max(1, Math.round(def.confidence * 2));
          matchedKeywords.push(`${keyword} (learned)`);
        }
      }
    }
    if (score > 0) scores.push({ domainId: domain.id, score });
  }
  scores.sort((a, b) => b.score - a.score);

  // Declared domain wins, then highest-scoring, then script fallback
  let domain = declaredDomain
    ? DOMAIN_CATALOG.find((d) => d.id === declaredDomain)
    : undefined;
  if (!domain && scores.length > 0) {
    domain = DOMAIN_CATALOG.find((d) => d.id === scores[0].domainId);
  }
  if (!domain) {
    domain = DOMAIN_CATALOG.find((d) => d.id === 'script')!;
  }

  // Frameworks refine the decision
  const frameworkResult = detectFrameworksInSource(source, language);
  const frameworks = frameworkResult.frameworks.map((fw) => fw.id);

  // Platform resolution: declared > framework > upstream override > domain default > native
  let platform: PlatformTarget;
  if (declaredPlatform && declaredPlatform !== 'auto') {
    platform = declaredPlatform;
  } else if (frameworks.length > 0 && frameworkResult.suggestedPlatform !== 'auto') {
    platform = frameworkResult.suggestedPlatform;
  } else if (request.platformOverrides && request.platformOverrides[domain.id]) {
    // Promoted upstream from client feedback: applies to every client
    platform = request.platformOverrides[domain.id];
  } else if (domain.defaultPlatform) {
    platform = domain.defaultPlatform;
  } else {
    platform = 'native';
  }

  // JVM languages force jvm unless wasm was declared
  const lang = (language || frameworkResult.language).toLowerCase();
  if (
    (lang === 'java' || lang === 'kotlin' || lang === 'scala') &&
    platform !== 'jvm' &&
    (!declaredPlatform || declaredPlatform === 'auto')
  ) {
    platform = 'jvm';
  }

  return {
    domain,
    scores,
    matchedKeywords: Array.from(new Set(matchedKeywords)),
    frameworks,
    platform,
    outputMode: domain.defaultOutputMode,
    language: lang,
  };
}

/** Platform capabilities: which platform each language family can emit. */
export const PLATFORM_CAPABILITIES: Record<string, PlatformTarget[]> = {
  rust: ['native', 'wasm', 'wasi', 'docker'],
  go: ['native', 'wasm', 'wasi', 'docker'],
  java: ['jvm', 'docker'],
  haskell: ['native', 'wasm'],
  // node is the native runtime for JS/TS, so 'native' is a valid target
  jsts: ['native', 'node', 'browser', 'wasm', 'deno'],
  python: ['native'],
  'native-c': ['native', 'wasm'],
  ruby: ['native'],
  php: ['native'],
};

/** Normalize any language name/alias to its capability key. */
const CAPABILITY_ALIASES: Record<string, string> = {
  rust: 'rust', rs: 'rust',
  go: 'go', golang: 'go',
  java: 'java', jvm: 'java', kotlin: 'java', kt: 'java', scala: 'java',
  haskell: 'haskell', hs: 'haskell', ghc: 'haskell',
  jsts: 'jsts', javascript: 'jsts', js: 'jsts', typescript: 'jsts',
  ts: 'jsts', tsx: 'jsts', jsx: 'jsts', node: 'jsts', deno: 'jsts',
  python: 'python', py: 'python', python3: 'python',
  'native-c': 'native-c', c: 'native-c', cpp: 'native-c', 'c++': 'native-c',
  ruby: 'ruby', rb: 'ruby',
  php: 'php',
};

/** Can a given language/toolchain emit for the requested platform? */
export function canTargetPlatform(language: string, platform: PlatformTarget): boolean {
  const key = CAPABILITY_ALIASES[language.toLowerCase()];
  const caps = key ? PLATFORM_CAPABILITIES[key] : undefined;
  if (!caps) return platform === 'native';
  return caps.includes(platform) || platform === 'auto';
}

/** Default platform for a language when nothing else decides. */
export function defaultPlatformFor(language: string): PlatformTarget {
  const lang = language.toLowerCase();
  if (lang === 'java' || lang === 'kotlin' || lang === 'scala') return 'jvm';
  if (lang === 'javascript' || lang === 'typescript') return 'node';
  return 'native';
}
