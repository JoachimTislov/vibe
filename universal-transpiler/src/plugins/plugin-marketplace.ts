/**
 * Universal Transpiler - Plugin Marketplace System
 * 
 * A self-managing plugin marketplace that enables:
 * 1. Plugin discovery, installation, and management
 * 2. Collaborative learning between plugins
 * 3. Plugin versioning and dependency resolution
 * 4. Marketplace server for sharing plugins
 * 5. Plugin packaging and distribution
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import type {
  Parser,
  Compiler,
  Interpreter,
  Transform,
  LanguageDefinition,
  DomainDefinition,
  FifthGLDefinition,
  LLMClient,
  CacheManager,
} from '../core/universal-transpiler';

// ============================================================================
// Plugin Types
// ============================================================================

/**
 * Plugin metadata manifest
 */
export interface PluginManifest {
  name: string;
  version: string;
  description: string;
  author: string;
  license?: string;
  homepage?: string;
  repository?: string;
  keywords?: string[];
  
  // Plugin capabilities
  provides?: {
    languages?: string[];
    parsers?: string[];
    compilers?: string[];
    interpreters?: string[];
    transforms?: string[];
    domains?: string[];
    fifthGL?: string[];
  };
  
  // Dependencies
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  
  // Compatibility
  transpilerVersion?: string;
  engines?: {
    node?: string;
    npm?: string;
  };
  
  // Files included
  main?: string;
  files?: string[];
  
  // Marketplace metadata
  marketplace?: {
    id?: string;
    publishedAt?: string;
    updatedAt?: string;
    downloads?: number;
    rating?: number;
    tags?: string[];
    category?: string;
  };
}

/**
 * Plugin package content
 */
export interface PluginPackage {
  manifest: PluginManifest;
  files: Record<string, string>;
  checksum: string;
}

/**
 * Installed plugin information
 */
export interface InstalledPlugin {
  manifest: PluginManifest;
  path: string;
  enabled: boolean;
  loaded: boolean;
  loadError?: string;
  dependencies: Map<string, InstalledPlugin>;
  dependents: Set<InstalledPlugin>;
}

/**
 * Plugin loading result
 */
export interface PluginLoadResult {
  plugin: InstalledPlugin;
  success: boolean;
  error?: string;
  exports?: any;
}

/**
 * Plugin registry for efficient lookup
 */
export interface PluginRegistry {
  byName: Map<string, InstalledPlugin>;
  byCapability: {
    languages: Map<string, Set<InstalledPlugin>>;
    parsers: Map<string, Set<InstalledPlugin>>;
    compilers: Map<string, Set<InstalledPlugin>>;
    interpreters: Map<string, Set<InstalledPlugin>>;
    transforms: Map<string, Set<InstalledPlugin>>;
    domains: Map<string, Set<InstalledPlugin>>;
    fifthGL: Map<string, Set<InstalledPlugin>>;
  };
  loadOrder: InstalledPlugin[];
}

/**
 * Marketplace client for remote operations
 */
export interface MarketplaceClient {
  baseUrl: string;
  apiKey?: string;
  
  search: (query: MarketplaceSearchQuery) => Promise<MarketplaceSearchResult>;
  getPlugin: (pluginId: string) => Promise<PluginPackage | null>;
  publishPlugin: (pluginPackage: PluginPackage) => Promise<PluginPackage>;
  updatePlugin: (pluginId: string, pluginPackage: PluginPackage) => Promise<PluginPackage>;
  deletePlugin: (pluginId: string) => Promise<void>;
  ratePlugin: (pluginId: string, rating: number) => Promise<void>;
  downloadPlugin: (pluginId: string, version?: string) => Promise<PluginPackage>;
}

/**
 * Marketplace search query
 */
export interface MarketplaceSearchQuery {
  query?: string;
  keywords?: string[];
  category?: string;
  author?: string;
  tags?: string[];
  page?: number;
  pageSize?: number;
  sortBy?: 'downloads' | 'rating' | 'updated' | 'published';
  sortOrder?: 'asc' | 'desc';
}

/**
 * Marketplace search result
 */
export interface MarketplaceSearchResult {
  total: number;
  page: number;
  pageSize: number;
  results: {
    manifest: PluginManifest;
    score: number;
  }[];
}

/**
 * Plugin sandbox for safe execution
 */
export interface PluginSandbox {
  context: any;
  module: any;
  require: (id: string) => any;
  exports: Record<string, any>;
  console: {
    log: (...args: any[]) => void;
    warn: (...args: any[]) => void;
    error: (...args: any[]) => void;
  };
}

/**
 * Plugin hook types
 */
export type PluginHook = 
  | 'before:parse'
  | 'after:parse'
  | 'before:transform'
  | 'after:transform'
  | 'before:compile'
  | 'after:compile'
  | 'before:transpile'
  | 'after:transpile'
  | 'language:detected'
  | 'domain:detected'
  | 'error'
  | 'cache:miss'
  | 'cache:hit'
  | 'llm:call';

/**
 * Plugin hook handler
 */
export interface PluginHookHandler {
  hook: PluginHook;
  priority: number;
  handler: (context: PluginHookContext) => Promise<any> | any;
}

/**
 * Context passed to plugin hooks
 */
export interface PluginHookContext {
  transpiler: any;
  source?: string;
  language?: string;
  target?: string;
  ast?: any;
  result?: any;
  error?: Error;
  cacheKey?: string;
  llmPrompt?: any;
  llmResponse?: any;
  [key: string]: any;
}

/**
 * Collaborative learning data
 */
export interface CollaborativeLearningData {
  pluginId: string;
  capability: string;
  input: any;
  output: any;
  metadata: {
    language?: string;
    domain?: string;
    timestamp: number;
    hash: string;
  };
}

/**
 * Learning database for sharing knowledge between instances
 */
export interface LearningDatabase {
  add: (data: CollaborativeLearningData) => Promise<string>;
  get: (id: string) => Promise<CollaborativeLearningData | null>;
  query: (query: any) => Promise<CollaborativeLearningData[]>;
  share: (peerId: string, data: CollaborativeLearningData[]) => Promise<void>;
  sync: (peerId: string) => Promise<CollaborativeLearningData[]>;
}

// ============================================================================
// Plugin Marketplace Class
// ============================================================================

/**
 * Main Plugin Marketplace class
 * Manages plugins, marketplace operations, and collaborative learning
 */
export class PluginMarketplace {
  private plugins: Map<string, InstalledPlugin>;
  private registry: PluginRegistry;
  private pluginPaths: string[];
  private loadedPlugins: Set<string>;
  
  private llm?: LLMClient;
  private cache?: CacheManager;
  private marketplaceClients: Map<string, MarketplaceClient>;
  private learningDatabase?: LearningDatabase;
  
  private hooks: Map<PluginHook, PluginHookHandler[]>;
  private collaborativeLearningEnabled: boolean;
  
  private options: {
    pluginDir: string;
    autoLoad: boolean;
    enableSandbox: boolean;
    enableCollaborativeLearning: boolean;
    debug: boolean;
  };

  constructor(options: Partial<PluginMarketplace['options']> = {}) {
    this.plugins = new Map();
    this.registry = this.createEmptyRegistry();
    this.pluginPaths = [];
    this.loadedPlugins = new Set();
    this.marketplaceClients = new Map();
    this.hooks = new Map();
    this.collaborativeLearningEnabled = true;
    
    this.options = {
      pluginDir: path.join(__dirname, '..', '..', 'plugins'),
      autoLoad: true,
      enableSandbox: true,
      enableCollaborativeLearning: true,
      debug: false,
      ...options,
    };
    
    // Initialize hooks
    this.initializeHooks();
  }

  // ==========================================================================
  // Initialization
  // ==========================================================================

  async initialize(llm?: LLMClient, cache?: CacheManager): Promise<void> {
    this.llm = llm;
    this.cache = cache;
    
    // Ensure plugin directory exists
    await this.ensurePluginDirectory();
    
    // Discover and load plugins
    await this.discoverPlugins();
    
    if (this.options.autoLoad) {
      await this.loadAllPlugins();
    }
    
    // Initialize learning database
    if (this.options.enableCollaborativeLearning) {
      this.learningDatabase = this.createLearningDatabase();
    }
    
    this.log('PluginMarketplace initialized');
  }

  private createEmptyRegistry(): PluginRegistry {
    return {
      byName: new Map(),
      byCapability: {
        languages: new Map(),
        parsers: new Map(),
        compilers: new Map(),
        interpreters: new Map(),
        transforms: new Map(),
        domains: new Map(),
        fifthGL: new Map(),
      },
      loadOrder: [],
    };
  }

  private async ensurePluginDirectory(): Promise<void> {
    try {
      await fs.promises.mkdir(this.options.pluginDir, { recursive: true });
    } catch (error) {
      console.error('Failed to create plugin directory:', error);
    }
  }

  private async discoverPlugins(): Promise<void> {
    try {
      const entries = await fs.promises.readdir(this.options.pluginDir, {
        withFileTypes: true,
      });
      
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const pluginPath = path.join(this.options.pluginDir, entry.name);
          const manifestPath = path.join(pluginPath, 'package.json');
          
          try {
            const manifest = await this.readManifest(manifestPath);
            if (manifest) {
              const installed: InstalledPlugin = {
                manifest,
                path: pluginPath,
                enabled: true,
                loaded: false,
                dependencies: new Map(),
                dependents: new Set(),
              };
              
              this.plugins.set(manifest.name, installed);
              this.pluginPaths.push(pluginPath);
              this.registerPlugin(installed);
              
              this.log(`Discovered plugin: ${manifest.name}@${manifest.version}`);
            }
          } catch (error) {
            console.warn(`Failed to read manifest for ${entry.name}:`, error);
          }
        }
      }
      
      // Build dependency graph
      this.buildDependencyGraph();
    } catch (error) {
      console.error('Failed to discover plugins:', error);
    }
  }

  private async readManifest(manifestPath: string): Promise<PluginManifest | null> {
    try {
      const content = await fs.promises.readFile(manifestPath, 'utf-8');
      const manifest: PluginManifest = JSON.parse(content);
      
      // Validate manifest
      if (!manifest.name || !manifest.version) {
        console.warn(`Invalid plugin manifest at ${manifestPath}: missing name or version`);
        return null;
      }
      
      return manifest;
    } catch (error) {
      return null;
    }
  }

  private registerPlugin(plugin: InstalledPlugin): void {
    // Register by name
    this.registry.byName.set(plugin.manifest.name, plugin);
    
    // Register by capabilities
    const manifest = plugin.manifest;
    
    if (manifest.provides) {
      if (manifest.provides.languages) {
        for (const lang of manifest.provides.languages) {
          let set = this.registry.byCapability.languages.get(lang);
          if (!set) {
            set = new Set();
            this.registry.byCapability.languages.set(lang, set);
          }
          set.add(plugin);
        }
      }
      
      if (manifest.provides.parsers) {
        for (const parser of manifest.provides.parsers) {
          let set = this.registry.byCapability.parsers.get(parser);
          if (!set) {
            set = new Set();
            this.registry.byCapability.parsers.set(parser, set);
          }
          set.add(plugin);
        }
      }
      
      if (manifest.provides.compilers) {
        for (const compiler of manifest.provides.compilers) {
          let set = this.registry.byCapability.compilers.get(compiler);
          if (!set) {
            set = new Set();
            this.registry.byCapability.compilers.set(compiler, set);
          }
          set.add(plugin);
        }
      }
      
      if (manifest.provides.interpreters) {
        for (const interpreter of manifest.provides.interpreters) {
          let set = this.registry.byCapability.interpreters.get(interpreter);
          if (!set) {
            set = new Set();
            this.registry.byCapability.interpreters.set(interpreter, set);
          }
          set.add(plugin);
        }
      }
      
      if (manifest.provides.transforms) {
        for (const transform of manifest.provides.transforms) {
          let set = this.registry.byCapability.transforms.get(transform);
          if (!set) {
            set = new Set();
            this.registry.byCapability.transforms.set(transform, set);
          }
          set.add(plugin);
        }
      }
      
      if (manifest.provides.domains) {
        for (const domain of manifest.provides.domains) {
          let set = this.registry.byCapability.domains.get(domain);
          if (!set) {
            set = new Set();
            this.registry.byCapability.domains.set(domain, set);
          }
          set.add(plugin);
        }
      }
      
      if (manifest.provides.fifthGL) {
        for (const fg of manifest.provides.fifthGL) {
          let set = this.registry.byCapability.fifthGL.get(fg);
          if (!set) {
            set = new Set();
            this.registry.byCapability.fifthGL.set(fg, set);
          }
          set.add(plugin);
        }
      }
    }
  }

  private buildDependencyGraph(): void {
    for (const [name, plugin] of this.plugins) {
      const manifest = plugin.manifest;
      
      if (manifest.dependencies) {
        for (const [depName, depVersion] of Object.entries(manifest.dependencies)) {
          const depPlugin = this.plugins.get(depName);
          if (depPlugin) {
            plugin.dependencies.set(depName, depPlugin);
            depPlugin.dependents.add(plugin);
          }
        }
      }
    }
  }

  // ==========================================================================
  // Plugin Loading
  // ==========================================================================

  async loadAllPlugins(): Promise<void> {
    // Sort by dependency order (load dependencies first)
    const sortedPlugins = this.getLoadOrder();
    
    for (const plugin of sortedPlugins) {
      await this.loadPlugin(plugin.manifest.name);
    }
  }

  private getLoadOrder(): InstalledPlugin[] {
    const visited = new Set<string>();
    const order: InstalledPlugin[] = [];
    
    const visit = (name: string) => {
      if (visited.has(name)) return;
      visited.add(name);
      
      const plugin = this.plugins.get(name);
      if (!plugin) return;
      
      // Visit dependencies first
      for (const [depName] of plugin.dependencies) {
        visit(depName);
      }
      
      order.push(plugin);
    };
    
    // Start with all plugins
    for (const [name] of this.plugins) {
      visit(name);
    }
    
    return order;
  }

  async loadPlugin(name: string): Promise<PluginLoadResult> {
    const plugin = this.plugins.get(name);
    
    if (!plugin) {
      return {
        plugin: {
          manifest: { name, version: '0.0.0' },
          path: '',
          enabled: false,
          loaded: false,
          loadError: `Plugin not found: ${name}`,
          dependencies: new Map(),
          dependents: new Set(),
        },
        success: false,
        error: `Plugin not found: ${name}`,
      };
    }
    
    if (plugin.loaded) {
      return { plugin, success: true };
    }
    
    if (!plugin.enabled) {
      return {
        plugin,
        success: false,
        error: 'Plugin is disabled',
      };
    }
    
    try {
      // Check dependencies
      for (const [depName] of plugin.dependencies) {
        const depPlugin = this.plugins.get(depName);
        if (depPlugin && !depPlugin.loaded) {
          const depResult = await this.loadPlugin(depName);
          if (!depResult.success) {
            throw new Error(`Dependency ${depName} failed to load: ${depResult.error}`);
          }
        }
      }
      
      // Load the plugin module
      const moduleExports = await this.loadPluginModule(plugin);
      
      // Register plugin exports
      await this.registerPluginExports(plugin, moduleExports);
      
      plugin.loaded = true;
      this.loadedPlugins.add(name);
      
      this.log(`Loaded plugin: ${plugin.manifest.name}@${plugin.manifest.version}`);
      
      return { plugin, success: true, exports: moduleExports };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      plugin.loadError = errorMessage;
      plugin.loaded = false;
      
      console.error(`Failed to load plugin ${name}:`, error);
      
      return {
        plugin,
        success: false,
        error: errorMessage,
      };
    }
  }

  async loadPluginModule(plugin: InstalledPlugin): Promise<any> {
    const mainFile = plugin.manifest.main || 'index.js';
    const mainPath = path.join(plugin.path, mainFile);
    
    if (this.options.enableSandbox) {
      return this.loadInSandbox(plugin, mainPath);
    } else {
      return this.loadDirectly(mainPath);
    }
  }

  private async loadDirectly(mainPath: string): Promise<any> {
    // In Node.js, would use require() or dynamic import
    // For this implementation, we'll simulate it
    try {
      // Check if file exists
      await fs.promises.access(mainPath);
      
      // Simulate loading - in real implementation, use require() or import()
      // For TypeScript, would need to compile or use ts-node
      return { default: {}, __esModule: true };
    } catch (error) {
      throw new Error(`Cannot load module at ${mainPath}: ${error}`);
    }
  }

  private async loadInSandbox(plugin: InstalledPlugin, mainPath: string): Promise<any> {
    // Create a sandboxed environment for plugin execution
    // This would use Node.js vm module or similar
    
    try {
      const content = await fs.promises.readFile(mainPath, 'utf-8');
      
      // Simple sandbox - in real implementation, use vm module
      const sandbox: PluginSandbox = {
        context: {},
        module: { exports: {} },
        require: this.createSandboxRequire(plugin),
        exports: {},
        console: {
          log: (...args: any[]) => this.log(`[${plugin.manifest.name}]`, ...args),
          warn: (...args: any[]) => console.warn(`[${plugin.manifest.name}]`, ...args),
          error: (...args: any[]) => console.error(`[${plugin.manifest.name}]`, ...args),
        },
      };
      
      // In real implementation, would use vm.runInNewContext
      // For now, just return the module
      return sandbox.module.exports;
    } catch (error) {
      throw new Error(`Sandbox load failed for ${plugin.manifest.name}: ${error}`);
    }
  }

  private createSandboxRequire(plugin: InstalledPlugin): (id: string) => any {
    return (id: string) => {
      // Allow plugins to require their own files
      if (id.startsWith('.') || id.startsWith('..')) {
        const filePath = path.resolve(plugin.path, id);
        if (filePath.startsWith(plugin.path)) {
          // Allow relative imports within plugin directory
          return this.loadDirectly(filePath);
        }
      }
      
      // Allow specific built-in modules
      const allowedModules = ['path', 'fs', 'util', 'events'];
      if (allowedModules.includes(id)) {
        return require(id);
      }
      
      // Block other requires for security
      throw new Error(`Module ${id} is not allowed in sandbox`);
    };
  }

  private async registerPluginExports(
    plugin: InstalledPlugin,
    moduleExports: any
  ): Promise<void> {
    // Register languages
    if (moduleExports.languages) {
      for (const langDef of Object.values(moduleExports.languages)) {
        this.registerLanguageFromPlugin(plugin, langDef);
      }
    }
    
    // Register parsers
    if (moduleExports.parsers) {
      for (const [name, parser] of Object.entries(moduleExports.parsers)) {
        this.registerParserFromPlugin(plugin, name, parser);
      }
    }
    
    // Register compilers
    if (moduleExports.compilers) {
      for (const [name, compiler] of Object.entries(moduleExports.compilers)) {
        this.registerCompilerFromPlugin(plugin, name, compiler);
      }
    }
    
    // Register interpreters
    if (moduleExports.interpreters) {
      for (const [name, interpreter] of Object.entries(moduleExports.interpreters)) {
        this.registerInterpreterFromPlugin(plugin, name, interpreter);
      }
    }
    
    // Register transforms
    if (moduleExports.transforms) {
      for (const [name, transform] of Object.entries(moduleExports.transforms)) {
        this.registerTransformFromPlugin(plugin, name, transform);
      }
    }
    
    // Register domains
    if (moduleExports.domains) {
      for (const [name, domain] of Object.entries(moduleExports.domains)) {
        this.registerDomainFromPlugin(plugin, name, domain);
      }
    }
    
    // Register fifthGL
    if (moduleExports.fifthGL) {
      for (const [name, fg] of Object.entries(moduleExports.fifthGL)) {
        this.registerFifthGLFromPlugin(plugin, name, fg);
      }
    }
    
    // Register hooks
    if (moduleExports.hooks) {
      for (const hook of moduleExports.hooks) {
        this.registerHook(hook);
      }
    }
  }

  // ==========================================================================
  // Plugin Registration Helpers
  // ==========================================================================

  private registerLanguageFromPlugin(
    plugin: InstalledPlugin,
    langDef: LanguageDefinition
  ): void {
    // Add plugin metadata to the language definition
    const augmentedLangDef: LanguageDefinition = {
      ...langDef,
      plugin: plugin.manifest.name,
      pluginVersion: plugin.manifest.version,
    };
    
    // In a real implementation, would register with the transpiler
    this.log(`Registered language ${langDef.name} from plugin ${plugin.manifest.name}`);
  }

  private registerParserFromPlugin(
    plugin: InstalledPlugin,
    name: string,
    parser: Parser
  ): void {
    // In a real implementation, would register with the transpiler
    this.log(`Registered parser ${name} from plugin ${plugin.manifest.name}`);
  }

  private registerCompilerFromPlugin(
    plugin: InstalledPlugin,
    name: string,
    compiler: Compiler
  ): void {
    this.log(`Registered compiler ${name} from plugin ${plugin.manifest.name}`);
  }

  private registerInterpreterFromPlugin(
    plugin: InstalledPlugin,
    name: string,
    interpreter: Interpreter
  ): void {
    this.log(`Registered interpreter ${name} from plugin ${plugin.manifest.name}`);
  }

  private registerTransformFromPlugin(
    plugin: InstalledPlugin,
    name: string,
    transform: Transform
  ): void {
    this.log(`Registered transform ${name} from plugin ${plugin.manifest.name}`);
  }

  private registerDomainFromPlugin(
    plugin: InstalledPlugin,
    name: string,
    domain: DomainDefinition
  ): void {
    this.log(`Registered domain ${name} from plugin ${plugin.manifest.name}`);
  }

  private registerFifthGLFromPlugin(
    plugin: InstalledPlugin,
    name: string,
    fg: FifthGLDefinition
  ): void {
    this.log(`Registered 5GL ${name} from plugin ${plugin.manifest.name}`);
  }

  // ==========================================================================
  // Hook System
  // ==========================================================================

  private initializeHooks(): void {
    // Initialize all hook types
    const hookTypes: PluginHook[] = [
      'before:parse',
      'after:parse',
      'before:transform',
      'after:transform',
      'before:compile',
      'after:compile',
      'before:transpile',
      'after:transpile',
      'language:detected',
      'domain:detected',
      'error',
      'cache:miss',
      'cache:hit',
      'llm:call',
    ];
    
    for (const hook of hookTypes) {
      this.hooks.set(hook, []);
    }
  }

  registerHook(hook: PluginHookHandler): void {
    const handlers = this.hooks.get(hook.hook) || [];
    handlers.push(hook);
    handlers.sort((a, b) => b.priority - a.priority);
    this.hooks.set(hook.hook, handlers);
  }

  async triggerHook(hook: PluginHook, context: PluginHookContext): Promise<any[]> {
    const handlers = this.hooks.get(hook) || [];
    const results: any[] = [];
    
    for (const handler of handlers) {
      try {
        const result = await Promise.resolve(handler.handler(context));
        results.push(result);
      } catch (error) {
        console.error(`Error in hook handler for ${hook}:`, error);
      }
    }
    
    return results;
  }

  // ==========================================================================
  // Marketplace Operations
  // ==========================================================================

  addMarketplaceClient(name: string, client: MarketplaceClient): void {
    this.marketplaceClients.set(name, client);
  }

  getMarketplaceClient(name?: string): MarketplaceClient | undefined {
    if (name) {
      return this.marketplaceClients.get(name);
    }
    // Return the first available client
    return this.marketplaceClients.values().next().value;
  }

  async searchMarketplace(
    query: MarketplaceSearchQuery,
    marketplace?: string
  ): Promise<MarketplaceSearchResult> {
    const client = this.getMarketplaceClient(marketplace);
    if (!client) {
      throw new Error('No marketplace client configured');
    }
    
    return client.search(query);
  }

  async installPlugin(pluginId: string, marketplace?: string): Promise<InstalledPlugin | null> {
    const client = this.getMarketplaceClient(marketplace);
    if (!client) {
      throw new Error('No marketplace client configured');
    }
    
    try {
      // Download plugin
      const pluginPackage = await client.downloadPlugin(pluginId);
      
      // Install locally
      return await this.installPluginPackage(pluginPackage);
    } catch (error) {
      console.error(`Failed to install plugin ${pluginId}:`, error);
      return null;
    }
  }

  async installPluginPackage(pluginPackage: PluginPackage): Promise<InstalledPlugin | null> {
    try {
      const manifest = pluginPackage.manifest;
      const pluginDir = path.join(this.options.pluginDir, manifest.name);
      
      // Create plugin directory
      await fs.promises.mkdir(pluginDir, { recursive: true });
      
      // Write all files
      for (const [filePath, content] of Object.entries(pluginPackage.files)) {
        const fullPath = path.join(pluginDir, filePath);
        await fs.promises.writeFile(fullPath, content);
      }
      
      // Write manifest
      const manifestPath = path.join(pluginDir, 'package.json');
      await fs.promises.writeFile(manifestPath, JSON.stringify(manifest, null, 2));
      
      // Create installed plugin record
      const installed: InstalledPlugin = {
        manifest,
        path: pluginDir,
        enabled: true,
        loaded: false,
        dependencies: new Map(),
        dependents: new Set(),
      };
      
      // Register plugin
      this.plugins.set(manifest.name, installed);
      this.pluginPaths.push(pluginDir);
      this.registerPlugin(installed);
      
      // Rebuild dependency graph
      this.buildDependencyGraph();
      
      this.log(`Installed plugin: ${manifest.name}@${manifest.version}`);
      
      return installed;
    } catch (error) {
      console.error('Failed to install plugin package:', error);
      return null;
    }
  }

  async publishPlugin(
    pluginPackage: PluginPackage,
    marketplace?: string
  ): Promise<PluginPackage | null> {
    const client = this.getMarketplaceClient(marketplace);
    if (!client) {
      throw new Error('No marketplace client configured');
    }
    
    try {
      return await client.publishPlugin(pluginPackage);
    } catch (error) {
      console.error('Failed to publish plugin:', error);
      return null;
    }
  }

  async createPluginPackage(
    pluginDir: string,
    options: {
      name?: string;
      version?: string;
      description?: string;
      author?: string;
    } = {}
  ): Promise<PluginPackage | null> {
    try {
      const manifestPath = path.join(pluginDir, 'package.json');
      let manifest: PluginManifest;
      
      // Read existing manifest or create new one
      if (await this.fileExists(manifestPath)) {
        const content = await fs.promises.readFile(manifestPath, 'utf-8');
        manifest = JSON.parse(content);
      } else {
        manifest = {
          name: options.name || path.basename(pluginDir),
          version: options.version || '1.0.0',
          description: options.description || '',
          author: options.author || '',
          main: 'index.js',
        };
      }
      
      // Read all files
      const files: Record<string, string> = {};
      const entries = await fs.promises.readdir(pluginDir, {
        withFileTypes: true,
        recursive: true,
      });
      
      for (const entry of entries) {
        if (entry.isFile()) {
          const filePath = path.join(entry.path, entry.name);
          const relativePath = path.relative(pluginDir, filePath);
          const content = await fs.promises.readFile(filePath, 'utf-8');
          files[relativePath] = content;
        }
      }
      
      // Calculate checksum
      const checksum = this.calculateChecksum(files);
      
      return {
        manifest,
        files,
        checksum,
      };
    } catch (error) {
      console.error('Failed to create plugin package:', error);
      return null;
    }
  }

  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.promises.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  private calculateChecksum(files: Record<string, string>): string {
    const hash = crypto.createHash('sha256');
    
    // Sort files for consistent checksum
    const sortedFiles = Object.entries(files).sort(([a], [b]) => a.localeCompare(b));
    
    for (const [filePath, content] of sortedFiles) {
      hash.update(filePath);
      hash.update(content);
    }
    
    return hash.digest('hex');
  }

  // ==========================================================================
  // Collaborative Learning
  // ==========================================================================

  private createLearningDatabase(): LearningDatabase {
    // Simple in-memory learning database
    // In production, would use a persistent database
    const store = new Map<string, CollaborativeLearningData>();
    
    return {
      add: async (data: CollaborativeLearningData): Promise<string> => {
        const id = this.generateLearningId(data);
        store.set(id, data);
        return id;
      },
      get: async (id: string): Promise<CollaborativeLearningData | null> => {
        return store.get(id) || null;
      },
      query: async (query: any): Promise<CollaborativeLearningData[]> => {
        // Simple query implementation
        const results: CollaborativeLearningData[] = [];
        
        for (const data of store.values()) {
          if (this.matchQuery(data, query)) {
            results.push(data);
          }
        }
        
        return results;
      },
      share: async (peerId: string, data: CollaborativeLearningData[]): Promise<void> => {
        // In real implementation, would send to peer
        this.log(`Sharing ${data.length} learning entries with peer ${peerId}`);
      },
      sync: async (peerId: string): Promise<CollaborativeLearningData[]> => {
        // In real implementation, would receive from peer
        this.log(`Syncing learning data with peer ${peerId}`);
        return [];
      },
    };
  }

  private generateLearningId(data: CollaborativeLearningData): string {
    const hash = crypto.createHash('sha256');
    hash.update(data.pluginId);
    hash.update(data.capability);
    hash.update(JSON.stringify(data.input));
    hash.update(JSON.stringify(data.output));
    return hash.digest('hex');
  }

  private matchQuery(data: CollaborativeLearningData, query: any): boolean {
    // Simple query matching
    if (query.pluginId && data.pluginId !== query.pluginId) return false;
    if (query.capability && data.capability !== query.capability) return false;
    if (query.language && data.metadata.language !== query.language) return false;
    if (query.domain && data.metadata.domain !== query.domain) return false;
    
    return true;
  }

  async addLearningData(data: CollaborativeLearningData): Promise<string | null> {
    if (!this.learningDatabase) {
      return null;
    }
    
    try {
      return await this.learningDatabase.add(data);
    } catch (error) {
      console.error('Failed to add learning data:', error);
      return null;
    }
  }

  async queryLearningData(query: any): Promise<CollaborativeLearningData[]> {
    if (!this.learningDatabase) {
      return [];
    }
    
    try {
      return await this.learningDatabase.query(query);
    } catch (error) {
      console.error('Failed to query learning data:', error);
      return [];
    }
  }

  // ==========================================================================
  // Dynamic Plugin Generation
  // ==========================================================================

  /**
   * Generate a plugin dynamically using LLM
   */
  async generatePlugin(
    requirements: {
      name: string;
      description: string;
      capabilities: string[];
      examples?: string[];
    }
  ): Promise<PluginPackage | null> {
    if (!this.llm) {
      throw new Error('LLM client not configured');
    }
    
    try {
      const prompt = this.createPluginGenerationPrompt(requirements);
      const response = await this.llm.generate(prompt);
      
      // Parse the generated plugin
      return this.parseGeneratedPlugin(response.content, requirements);
    } catch (error) {
      console.error('Failed to generate plugin:', error);
      return null;
    }
  }

  private createPluginGenerationPrompt(
    requirements: {
      name: string;
      description: string;
      capabilities: string[];
      examples?: string[];
    }
  ): { system: string; user: string } {
    return {
      system: `You are an expert plugin developer. Your task is to create a complete plugin package for the Universal Transpiler.

The plugin should:
1. Have a valid package.json manifest
2. Include all necessary source files
3. Implement the required capabilities
4. Follow best practices for Node.js plugins
5. Be self-contained and ready to use

Return a complete plugin package as a JSON object with the following structure:
{
  "manifest": { ...package.json content... },
  "files": {
    "index.js": "...main module content...",
    "...other files...": "...content..."
  }
}

Do not include any explanations or comments outside the JSON object.`,
      
      user: `Create a plugin with the following requirements:
Name: ${requirements.name}
Description: ${requirements.description}
Capabilities: ${requirements.capabilities.join(', ')}

${requirements.examples ? `Examples:
${requirements.examples.join('\n')}
` : ''}
Generate the complete plugin package:`,
    };
  }

  private parseGeneratedPlugin(
    content: string,
    requirements: {
      name: string;
      description: string;
      capabilities: string[];
      examples?: string[];
    }
  ): PluginPackage | null {
    try {
      // Try to parse as JSON
      const parsed = JSON.parse(content) as {
        manifest?: PluginManifest;
        files?: Record<string, string>;
      };
      
      if (!parsed.manifest || !parsed.files) {
        console.error('Invalid plugin package format');
        return null;
      }
      
      // Ensure manifest has required fields
      parsed.manifest.name = parsed.manifest.name || requirements.name;
      parsed.manifest.description = parsed.manifest.description || requirements.description;
      parsed.manifest.version = parsed.manifest.version || '1.0.0';
      
      // Calculate checksum
      const checksum = this.calculateChecksum(parsed.files);
      
      return {
        manifest: parsed.manifest,
        files: parsed.files,
        checksum,
      };
    } catch (error) {
      console.error('Failed to parse generated plugin:', error);
      return null;
    }
  }

  // ==========================================================================
  // Plugin Statistics and Monitoring
  // ==========================================================================

  getPluginStats(): {
    total: number;
    loaded: number;
    enabled: number;
    disabled: number;
    byCapability: Record<string, number>;
  } {
    const stats = {
      total: this.plugins.size,
      loaded: Array.from(this.loadedPlugins).length,
      enabled: 0,
      disabled: 0,
      byCapability: {
        languages: this.registry.byCapability.languages.size,
        parsers: this.registry.byCapability.parsers.size,
        compilers: this.registry.byCapability.compilers.size,
        interpreters: this.registry.byCapability.interpreters.size,
        transforms: this.registry.byCapability.transforms.size,
        domains: this.registry.byCapability.domains.size,
        fifthGL: this.registry.byCapability.fifthGL.size,
      },
    };
    
    for (const plugin of this.plugins.values()) {
      if (plugin.enabled) {
        stats.enabled++;
      } else {
        stats.disabled++;
      }
    }
    
    return stats;
  }

  getLoadedPlugins(): string[] {
    return Array.from(this.loadedPlugins);
  }

  // ==========================================================================
  // Utility Methods
  // ==========================================================================

  private log(...args: any[]): void {
    if (this.options.debug) {
      console.log('[PluginMarketplace]', ...args);
    }
  }

  setDebug(enabled: boolean): void {
    this.options.debug = enabled;
  }

  setCollaborativeLearning(enabled: boolean): void {
    this.collaborativeLearningEnabled = enabled;
  }

  setLLM(llm: LLMClient): void {
    this.llm = llm;
  }

  setCache(cache: CacheManager): void {
    this.cache = cache;
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a plugin marketplace instance
 */
export function createPluginMarketplace(
  options?: Partial<PluginMarketplace['options']>
): PluginMarketplace {
  return new PluginMarketplace(options);
}

/**
 * Create a marketplace client for a remote server
 */
export function createMarketplaceClient(
  baseUrl: string,
  apiKey?: string
): MarketplaceClient {
  return {
    baseUrl,
    apiKey,
    search: async (query: MarketplaceSearchQuery) => {
      // In real implementation, would call the API
      console.log('Marketplace search:', JSON.stringify(query, null, 2));
      return {
        total: 0,
        page: query.page || 1,
        pageSize: query.pageSize || 20,
        results: [],
      };
    },
    getPlugin: async (pluginId: string) => {
      console.log('Marketplace get plugin:', pluginId);
      return null;
    },
    publishPlugin: async (pluginPackage: PluginPackage) => {
      console.log('Marketplace publish plugin:', pluginPackage.manifest.name);
      return pluginPackage;
    },
    updatePlugin: async (pluginId: string, pluginPackage: PluginPackage) => {
      console.log('Marketplace update plugin:', pluginId);
      return pluginPackage;
    },
    deletePlugin: async (pluginId: string) => {
      console.log('Marketplace delete plugin:', pluginId);
    },
    ratePlugin: async (pluginId: string, rating: number) => {
      console.log('Marketplace rate plugin:', pluginId, rating);
    },
    downloadPlugin: async (pluginId: string, version?: string) => {
      console.log('Marketplace download plugin:', pluginId, version);
      return {
        manifest: { name: pluginId, version: version || '1.0.0' },
        files: {},
        checksum: '',
      };
    },
  };
}

// ============================================================================
// Plugin Templates
// ============================================================================

/**
 * Generate a plugin template for language support
 */
export function generateLanguagePluginTemplate(
  languageName: string,
  description: string
): PluginPackage {
  const name = `universal-transpiler-${languageName}`;
  
  return {
    manifest: {
      name,
      version: '1.0.0',
      description: `Universal Transpiler plugin for ${languageName} support - ${description}`,
      author: 'Universal Transpiler Team',
      license: 'MIT',
      homepage: 'https://github.com/universal-transpiler/universal-transpiler',
      repository: {
        type: 'git',
        url: `https://github.com/universal-transpiler/${name}.git`,
      },
      keywords: ['universal-transpiler', 'language', languageName],
      provides: {
        languages: [languageName],
        parsers: [`${languageName}-parser`],
        compilers: [`${languageName}-compiler`],
        interpreters: [`${languageName}-interpreter`],
      },
      main: 'index.js',
      files: ['index.js', 'parser.js', 'compiler.js', 'interpreter.js'],
      marketplace: {
        category: 'languages',
        tags: ['language', languageName],
      },
    },
    files: {
      'index.js': `/**
 * ${languageName} plugin for Universal Transpiler
 */

const { create${languageName.toUpperCase()}Parser } = require('./parser');
const { create${languageName.toUpperCase()}Compiler } = require('./compiler');
const { create${languageName.toUpperCase()}Interpreter } = require('./interpreter');

const language = {
  name: '${languageName}',
  version: '1.0',
  extensions: ['.${languageName}'],
  parser: create${languageName.toUpperCase()}Parser(),
  compiler: create${languageName.toUpperCase()}Compiler(),
  interpreter: create${languageName.toUpperCase()}Interpreter(),
};

module.exports = {
  languages: { ${languageName}: language },
  parsers: { '${languageName}-parser': create${languageName.toUpperCase()}Parser() },
  compilers: { '${languageName}-compiler': create${languageName.toUpperCase()}Compiler() },
  interpreters: { '${languageName}-interpreter': create${languageName.toUpperCase()}Interpreter() },
};
`,
      'parser.js': `/**
 * ${languageName} parser
 */

function create${languageName.toUpperCase()}Parser() {
  return {
    parse: (source, options) => {
      // TODO: Implement ${languageName} parser
      return {
        ast: { type: 'Program', children: [], position: { line: 0, column: 0, offset: 0 }, location: { start: { line: 0, column: 0, offset: 0 }, end: { line: 0, column: 0, offset: 0 }, source: '' } },
        tokens: [],
        errors: [{ message: 'Parser not yet implemented', position: { line: 0, column: 0, offset: 0 }, severity: 'error' }],
        warnings: [],
      };
    },
    tokenize: (source) => {
      // TODO: Implement tokenizer
      return [];
    },
    canParse: (source) => {
      // TODO: Implement language detection
      return false;
    },
  };
}

module.exports = { create${languageName.toUpperCase()}Parser };
`,
      'compiler.js': `/**
 * ${languageName} compiler
 */

function create${languageName.toUpperCase()}Compiler() {
  return {
    compile: (ast, options) => {
      // TODO: Implement compiler
      return {
        code: '// Compiled code',
        ast,
        errors: [{ message: 'Compiler not yet implemented', position: ast.position, severity: 'error' }],
        warnings: [],
        stats: { inputSize: 0, outputSize: 0, parseTime: 0, transformTime: 0, generateTime: 0 },
      };
    },
    target: '${languageName}',
  };
}

module.exports = { create${languageName.toUpperCase()}Compiler };
`,
      'interpreter.js': `/**
 * ${languageName} interpreter
 */

function create${languageName.toUpperCase()}Interpreter() {
  return {
    execute: (ast, context) => {
      // TODO: Implement interpreter
      return null;
    },
    evaluate: (node, context) => {
      // TODO: Implement evaluator
      return null;
    },
    createContext: () => {
      return {};
    },
  };
}

module.exports = { create${languageName.toUpperCase()}Interpreter };
`,
    },
    checksum: '',
  };
}

/**
 * Generate a plugin template for domain support
 */
export function generateDomainPluginTemplate(
  domainName: string,
  description: string
): PluginPackage {
  const name = `universal-transpiler-domain-${domainName}`;
  
  return {
    manifest: {
      name,
      version: '1.0.0',
      description: `Universal Transpiler plugin for ${domainName} domain - ${description}`,
      author: 'Universal Transpiler Team',
      license: 'MIT',
      homepage: 'https://github.com/universal-transpiler/universal-transpiler',
      keywords: ['universal-transpiler', 'domain', domainName],
      provides: {
        domains: [domainName],
        transforms: [`${domainName}-transforms`],
      },
      main: 'index.js',
      files: ['index.js', 'domain.js', 'transforms.js'],
      marketplace: {
        category: 'domains',
        tags: ['domain', domainName],
      },
    },
    files: {
      'index.js': `/**
 * ${domainName} domain plugin for Universal Transpiler
 */

const { create${domainName.toUpperCase()}Domain } = require('./domain');
const { create${domainName.toUpperCase()}Transforms } = require('./transforms');

module.exports = {
  domains: { ${domainName}: create${domainName.toUpperCase()}Domain() },
  transforms: create${domainName.toUpperCase()}Transforms(),
};
`,
      'domain.js': `/**
 * ${domainName} domain definition
 */

function create${domainName.toUpperCase()}Domain() {
  return {
    name: '${domainName}',
    description: '${description}',
    keywords: [],
    operators: [],
    types: {},
    patterns: [],
    transforms: {},
    validator: (ast) => {
      return true;
    },
  };
}

module.exports = { create${domainName.toUpperCase()}Domain };
`,
      'transforms.js': `/**
 * ${domainName} domain transforms
 */

function create${domainName.toUpperCase()}Transforms() {
  return {
    // TODO: Add domain-specific transforms
  };
}

module.exports = { create${domainName.toUpperCase()}Transforms };
`,
    },
    checksum: '',
  };
}

// ============================================================================
// Exports
// ============================================================================

// All exports are already declared with the export keyword above
