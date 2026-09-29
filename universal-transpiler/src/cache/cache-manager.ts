/**
 * Cache Manager for Universal Transpiler
 * 
 * Provides caching for:
 * - Parsed ASTs
 * - Generated parsers
 * - Generated transforms
 * - Compilation results
 * - LLM responses
 * - Type inferences
 * - Domain-specific definitions
 * 
 * Supports multiple backends: memory, filesystem, Redis
 */

import type { CacheEntry, CacheManager } from '../core/universal-transpiler';
import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// Cache Backend Types
// ============================================================================

export interface CacheBackend {
  get: <T>(key: string) => Promise<T | null>;
  set: (key: string, value: any, ttl?: number) => Promise<void>;
  has: (key: string) => Promise<boolean>;
  delete: (key: string) => Promise<void>;
  clear: () => Promise<void>;
  list: (pattern?: string) => Promise<CacheEntry[]>;
  close?: () => Promise<void>;
}

// ============================================================================
// Memory Cache Backend
// ============================================================================

export class MemoryCache implements CacheBackend {
  private store: Map<string, CacheEntry> = new Map();
  private timers: Map<string, NodeJS.Timeout> = new Map();

  constructor(private maxSize: number = 1000, private defaultTTL: number = 86400000) {}

  async get<T>(key: string): Promise<T | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    
    if (entry.ttl > 0 && Date.now() - entry.timestamp > entry.ttl) {
      this.store.delete(key);
      if (this.timers.has(key)) {
        clearTimeout(this.timers.get(key));
        this.timers.delete(key);
      }
      return null;
    }
    
    return entry.value as T;
  }

  async set(key: string, value: any, ttl: number = this.defaultTTL): Promise<void> {
    // Evict if at max size
    if (this.store.size >= this.maxSize) {
      const oldestKey = Array.from(this.store.keys())[0];
      this.store.delete(oldestKey);
      if (this.timers.has(oldestKey)) {
        clearTimeout(this.timers.get(oldestKey));
        this.timers.delete(oldestKey);
      }
    }

    const entry: CacheEntry = {
      key,
      value,
      timestamp: Date.now(),
      ttl,
      metadata: {
        sourceHash: '',
        language: '',
        version: '1.0.0',
        dependencies: [],
      },
    };

    this.store.set(key, entry);

    // Set expiration timer
    if (ttl > 0) {
      const timer = setTimeout(() => {
        this.store.delete(key);
        this.timers.delete(key);
      }, ttl);
      this.timers.set(key, timer);
    }
  }

  async has(key: string): Promise<boolean> {
    const entry = this.store.get(key);
    if (!entry) return false;
    
    if (entry.ttl > 0 && Date.now() - entry.timestamp > entry.ttl) {
      this.store.delete(key);
      if (this.timers.has(key)) {
        clearTimeout(this.timers.get(key));
        this.timers.delete(key);
      }
      return false;
    }
    
    return true;
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
    if (this.timers.has(key)) {
      clearTimeout(this.timers.get(key));
      this.timers.delete(key);
    }
  }

  async clear(): Promise<void> {
    this.store.clear();
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
  }

  async list(pattern?: string): Promise<CacheEntry[]> {
    const entries = Array.from(this.store.values());
    if (!pattern) return entries;
    
    const regex = new RegExp(pattern);
    return entries.filter(e => regex.test(e.key));
  }

  close(): Promise<void> {
    this.clear();
    return Promise.resolve();
  }
}

// ============================================================================
// Filesystem Cache Backend
// ============================================================================

export class FilesystemCache implements CacheBackend {
  private basePath: string;
  private defaultTTL: number;

  constructor(basePath: string = '.universal-transpiler-cache', defaultTTL: number = 86400000) {
    this.basePath = path.resolve(basePath);
    this.defaultTTL = defaultTTL;
    
    // Ensure cache directory exists
    if (!fs.existsSync(this.basePath)) {
      fs.mkdirSync(this.basePath, { recursive: true });
    }
  }

  private getKeyPath(key: string): string {
    // Sanitize key for filesystem
    const safeKey = key.replace(/[^a-zA-Z0-9-_./]/g, '_');
    return path.join(this.basePath, `${safeKey}.json`);
  }

  private async readEntry(filePath: string): Promise<CacheEntry | null> {
    try {
      const data = await fs.promises.readFile(filePath, 'utf8');
      const entry: CacheEntry & { expiresAt?: number } = JSON.parse(data);
      
      // Check expiration
      if (entry.expiresAt && Date.now() > entry.expiresAt) {
        await fs.promises.unlink(filePath);
        return null;
      }
      
      return entry;
    } catch {
      return null;
    }
  }

  private async writeEntry(filePath: string, entry: CacheEntry): Promise<void> {
    const data: CacheEntry & { expiresAt?: number } = {
      ...entry,
      expiresAt: entry.ttl > 0 ? Date.now() + entry.ttl : undefined,
    };
    
    await fs.promises.writeFile(filePath, JSON.stringify(data, null, 2));
  }

  async get<T>(key: string): Promise<T | null> {
    const filePath = this.getKeyPath(key);
    const entry = await this.readEntry(filePath);
    return entry ? entry.value as T : null;
  }

  async set(key: string, value: any, ttl: number = this.defaultTTL): Promise<void> {
    const filePath = this.getKeyPath(key);
    const entry: CacheEntry = {
      key,
      value,
      timestamp: Date.now(),
      ttl,
      metadata: {
        sourceHash: '',
        language: '',
        version: '1.0.0',
        dependencies: [],
      },
    };
    
    await this.writeEntry(filePath, entry);
  }

  async has(key: string): Promise<boolean> {
    const filePath = this.getKeyPath(key);
    return fs.existsSync(filePath);
  }

  async delete(key: string): Promise<void> {
    const filePath = this.getKeyPath(key);
    try {
      await fs.promises.unlink(filePath);
    } catch {
      // Ignore errors
    }
  }

  async clear(): Promise<void> {
    try {
      const files = await fs.promises.readdir(this.basePath);
      await Promise.all(
        files
          .filter(f => f.endsWith('.json'))
          .map(f => fs.promises.unlink(path.join(this.basePath, f)))
      );
    } catch {
      // Ignore errors
    }
  }

  async list(pattern?: string): Promise<CacheEntry[]> {
    try {
      const files = await fs.promises.readdir(this.basePath);
      const entries: CacheEntry[] = [];
      
      await Promise.all(
        files
          .filter(f => f.endsWith('.json'))
          .map(async f => {
            const filePath = path.join(this.basePath, f);
            const entry = await this.readEntry(filePath);
            if (entry) {
              entries.push(entry);
            }
          })
      );
      
      if (pattern) {
        const regex = new RegExp(pattern);
        return entries.filter(e => regex.test(e.key));
      }
      
      return entries;
    } catch {
      return [];
    }
  }

  async close(): Promise<void> {
    // Nothing to close for filesystem
  }
}

// ============================================================================
// Multi-level Cache (L1: Memory, L2: Filesystem)
// ============================================================================

export class MultiLevelCache implements CacheBackend {
  private l1: CacheBackend;
  private l2: CacheBackend;

  constructor(l1: CacheBackend, l2: CacheBackend) {
    this.l1 = l1;
    this.l2 = l2;
  }

  async get<T>(key: string): Promise<T | null> {
    // Try L1 first
    const l1Value = await this.l1.get<T>(key);
    if (l1Value !== null) return l1Value;
    
    // Try L2
    const l2Value = await this.l2.get<T>(key);
    if (l2Value !== null) {
      // Cache in L1
      await this.l1.set(key, l2Value);
      return l2Value;
    }
    
    return null;
  }

  async set(key: string, value: any, ttl?: number): Promise<void> {
    await this.l1.set(key, value, ttl);
    await this.l2.set(key, value, ttl);
  }

  async has(key: string): Promise<boolean> {
    return (await this.l1.has(key)) || (await this.l2.has(key));
  }

  async delete(key: string): Promise<void> {
    await this.l1.delete(key);
    await this.l2.delete(key);
  }

  async clear(): Promise<void> {
    await this.l1.clear();
    await this.l2.clear();
  }

  async list(pattern?: string): Promise<CacheEntry[]> {
    const l1Entries = await this.l1.list(pattern);
    const l2Entries = await this.l2.list(pattern);
    
    // Deduplicate by key
    const keys = new Set<string>();
    const result: CacheEntry[] = [];
    
    for (const entry of [...l2Entries, ...l1Entries]) {
      if (!keys.has(entry.key)) {
        keys.add(entry.key);
        result.push(entry);
      }
    }
    
    return result;
  }

  async close(): Promise<void> {
    if (this.l1.close) await this.l1.close();
    if (this.l2.close) await this.l2.close();
  }
}

// ============================================================================
// Cache Manager Implementation
// ============================================================================

export class AdvancedCacheManager implements CacheManager {
  private backend: CacheBackend;
  private defaults: {
    ttl: number;
    metadata: CacheEntry['metadata'];
  };

  constructor(
    backend: CacheBackend,
    defaults: Partial<AdvancedCacheManager['defaults']> = {}
  ) {
    this.backend = backend;
    this.defaults = {
      ttl: 86400000, // 24 hours
      metadata: {
        sourceHash: '',
        language: '',
        version: '1.0.0',
        dependencies: [],
      },
      ...defaults,
    };
  }

  async get<T>(key: string): Promise<T | null> {
    return this.backend.get<T>(key);
  }

  async set(
    key: string,
    value: any,
    ttl: number = this.defaults.ttl,
    metadata: Partial<CacheEntry['metadata']> = {}
  ): Promise<void> {
    await this.backend.set(key, value, ttl);
  }

  async has(key: string): Promise<boolean> {
    return this.backend.has(key);
  }

  async delete(key: string): Promise<void> {
    await this.backend.delete(key);
  }

  async clear(): Promise<void> {
    await this.backend.clear();
  }

  async list(pattern?: string): Promise<CacheEntry[]> {
    return this.backend.list(pattern);
  }

  async save(): Promise<void> {
    // For filesystem backend, it's already persistent
    if (this.backend.close) {
      await this.backend.close();
    }
  }

  async load(): Promise<void> {
    // For filesystem backend, entries are loaded on demand
  }

  // Additional utility methods

  async getOrSet<T>(
    key: string,
    generator: () => Promise<T>,
    ttl?: number
  ): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) {
      return cached;
    }
    
    const value = await generator();
    await this.set(key, value, ttl);
    return value;
  }

  async invalidate(pattern: string): Promise<void> {
    const entries = await this.list(pattern);
    await Promise.all(entries.map(e => this.delete(e.key)));
  }

  async getStats(): Promise<{
    size: number;
    keys: string[];
    oldest: CacheEntry | null;
    newest: CacheEntry | null;
  }> {
    const entries = await this.list();
    return {
      size: entries.length,
      keys: entries.map(e => e.key),
      oldest: entries.length > 0 ? entries.reduce((a, b) => 
        a.timestamp < b.timestamp ? a : b) : null,
      newest: entries.length > 0 ? entries.reduce((a, b) => 
        a.timestamp > b.timestamp ? a : b) : null,
    };
  }

  setBackend(backend: CacheBackend): void {
    this.backend = backend;
  }

  getBackend(): CacheBackend {
    return this.backend;
  }
}

// ============================================================================
// Cache Key Strategies
// ============================================================================

export class CacheKeyGenerator {
  static forParse(source: string, language: string): string {
    return `parse:${this.hash(source)}:${language}`;
  }

  static forCompile(source: string, sourceLanguage: string, targetLanguage: string): string {
    return `compile:${this.hash(source)}:${sourceLanguage}:${targetLanguage}`;
  }

  static forTransform(source: string, transform: string): string {
    return `transform:${this.hash(source)}:${transform}`;
  }

  static forAST(ast: any, language: string): string {
    return `ast:${this.hash(JSON.stringify(ast))}:${language}`;
  }

  static forLLM(prompt: any, model: string): string {
    return `llm:${this.hash(JSON.stringify(prompt))}:${model}`;
  }

  static forDomain(domain: string, construct: string): string {
    return `domain:${domain}:${construct}`;
  }

  static for5GL(abstraction: any, domain: string): string {
    return `5gl:${this.hash(JSON.stringify(abstraction))}:${domain}`;
  }

  private static hash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }
}

// ============================================================================
// Specialized Caches
// ============================================================================

/**
 * Cache specifically for parsers
 */
export class ParserCache {
  private cache: CacheManager;

  constructor(cache: CacheManager) {
    this.cache = cache;
  }

  async get(language: string): Promise<any | null> {
    return this.cache.get(`parser:${language}`);
  }

  async set(language: string, parser: any): Promise<void> {
    await this.cache.set(`parser:${language}`, parser);
  }

  async clear(): Promise<void> {
    await this.cache.invalidate('parser:*');
  }
}

/**
 * Cache specifically for transforms
 */
export class TransformCache {
  private cache: CacheManager;

  constructor(cache: CacheManager) {
    this.cache = cache;
  }

  async get(name: string): Promise<any | null> {
    return this.cache.get(`transform:${name}`);
  }

  async set(name: string, transform: any): Promise<void> {
    await this.cache.set(`transform:${name}`, transform);
  }

  async clear(): Promise<void> {
    await this.cache.invalidate('transform:*');
  }
}

/**
 * Cache specifically for compilation results
 */
export class CompilationCache {
  private cache: CacheManager;

  constructor(cache: CacheManager) {
    this.cache = cache;
  }

  async get(sourceHash: string, sourceLang: string, targetLang: string): Promise<any | null> {
    return this.cache.get(`compile:${sourceHash}:${sourceLang}:${targetLang}`);
  }

  async set(sourceHash: string, sourceLang: string, targetLang: string, result: any): Promise<void> {
    await this.cache.set(
      `compile:${sourceHash}:${sourceLang}:${targetLang}`,
      result
    );
  }

  async clear(): Promise<void> {
    await this.cache.invalidate('compile:*');
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

export function createMemoryCache(maxSize?: number, defaultTTL?: number): CacheManager {
  const backend = new MemoryCache(maxSize, defaultTTL);
  return new AdvancedCacheManager(backend);
}

export function createFilesystemCache(
  basePath?: string,
  defaultTTL?: number
): CacheManager {
  const backend = new FilesystemCache(basePath, defaultTTL);
  return new AdvancedCacheManager(backend);
}

export function createMultiLevelCache(
  memoryMaxSize?: number,
  filesystemPath?: string,
  defaultTTL?: number
): CacheManager {
  const memory = new MemoryCache(memoryMaxSize, defaultTTL);
  const filesystem = new FilesystemCache(filesystemPath, defaultTTL);
  const backend = new MultiLevelCache(memory, filesystem);
  return new AdvancedCacheManager(backend);
}

export default AdvancedCacheManager;
