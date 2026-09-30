/**
 * Universal Transpiler - Cross-Repository Analysis
 * 
 * Analyzes code across multiple repositories to:
 * 1. Find similar code patterns
 * 2. Detect code duplication
 * 3. Track code evolution
 * 4. Understand dependencies between repos
 * 5. Enable large-scale code understanding
 */

import * as crypto from 'crypto';
import type { ASTNode, Position } from '../core/universal-transpiler';
import type { LLMClient, CacheManager } from '../core/universal-transpiler';
import type { CodeUnderstanding } from './autonomous-code-understanding';

// ============================================================================
// Types
// ============================================================================

export interface RepositoryInfo {
  id: string;
  name: string;
  url: string;
  description?: string;
  language?: string;
  domain?: string;
  size?: number;
  fileCount?: number;
  lastCommit?: string;
  metadata?: Record<string, any>;
}

export interface RepositoryFile {
  path: string;
  content: string;
  size: number;
  language?: string;
  hash?: string;
  ast?: ASTNode;
  understanding?: CodeUnderstanding;
  metadata?: Record<string, any>;
}

export interface RepositoryAnalysis {
  id: string;
  repository: string;
  files: RepositoryFile[];
  dependencies: RepositoryDependency[];
  patterns: RepositoryPattern[];
  statistics: RepositoryStatistics;
  relationships: RepositoryRelationship[];
  createdAt: number;
  updatedAt: number;
}

export interface RepositoryDependency {
  name: string;
  version?: string;
  kind: 'internal' | 'external' | 'dev' | 'peer' | 'optional';
  usage: CodeLocation[];
  confidence: number;
  resolved?: RepositoryInfo;
}

interface CodeLocation {
  file: string;
  line: number;
  column: number;
  offset: number;
  context?: string;
}

export interface RepositoryPattern {
  id: string;
  name: string;
  kind: 'creational' | 'structural' | 'behavioral' | 'architectural' | 'idiomatic';
  description: string;
  occurrences: PatternOccurrence[];
  relatedPatterns: string[];
  confidence: number;
}

export interface PatternOccurrence {
  file: string;
  position: Position;
  code: string;
  ast?: ASTNode;
  confidence: number;
}

export interface RepositoryStatistics {
  totalSize: number;
  totalFiles: number;
  totalLines: number;
  complexity: {
    average: number;
    min: number;
    max: number;
    distribution: Record<string, number>;
  };
  languages: Record<string, number>;
  domains: Record<string, number>;
  dependencies: {
    total: number;
    byType: Record<string, number>;
    top: RepositoryDependency[];
  };
  patterns: {
    total: number;
    byType: Record<string, number>;
    top: RepositoryPattern[];
  };
  quality: {
    average: number;
    byFile: Record<string, number>;
  };
}

export interface RepositoryRelationship {
  kind: 'dependency' | 'similarity' | 'inheritance' | 'fork' | 'mirror';
  target: string;
  strength: number;
  direction: 'in' | 'out' | 'bidirectional';
  details: any;
}

export interface CrossRepositoryQuery {
  repositories?: string[];
  languages?: string[];
  domains?: string[];
  patterns?: string[];
  minSimilarity?: number;
  maxResults?: number;
  include?: ('files' | 'ast' | 'understanding' | 'dependencies' | 'patterns')[];
  filters?: Record<string, any>;
}

export interface CrossRepositoryResult {
  query: CrossRepositoryQuery;
  repositories: RepositoryAnalysis[];
  comparisons: RepositoryComparison[];
  clusters: RepositoryCluster[];
  statistics: CrossRepositoryStatistics;
  timestamp: number;
}

export interface RepositoryComparison {
  repository1: string;
  repository2: string;
  similarity: number;
  commonPatterns: RepositoryPattern[];
  differences: RepositoryDifference[];
  dependencies: RepositoryDependency[];
  evolution: RepositoryEvolution;
}

export interface RepositoryDifference {
  kind: 'file' | 'pattern' | 'dependency' | 'structure';
  details: any;
  confidence: number;
}

export interface RepositoryEvolution {
  commonHistory: CommitInfo[];
  divergencePoint?: string;
  divergenceDate?: number;
  divergenceReason?: string;
}

export interface RepositoryCluster {
  id: string;
  repositories: string[];
  center?: string;
  similarity: number;
  patterns: RepositoryPattern[];
  size: number;
}

export interface CrossRepositoryStatistics {
  totalRepositories: number;
  totalFiles: number;
  totalSize: number;
  averageSimilarity: number;
  largestCluster: RepositoryCluster | null;
  mostCommonPatterns: RepositoryPattern[];
  mostCommonDependencies: RepositoryDependency[];
}

export interface CommitInfo {
  hash: string;
  author: string;
  date: number;
  message: string;
  repository: string;
  changes: FileChangeInfo[];
}

export interface FileChangeInfo {
  file: string;
  kind: 'add' | 'modify' | 'delete' | 'rename';
  additions: number;
  deletions: number;
  hashBefore?: string;
  hashAfter?: string;
}

export interface CrossRepositoryOptions {
  enableCaching?: boolean;
  enableLLM?: boolean;
  maxRepositories?: number;
  maxFilesPerRepo?: number;
  similarityThreshold?: number;
  debug?: boolean;
}

// ============================================================================
// Cross Repository Analyzer Class
// ============================================================================

export class CrossRepositoryAnalyzer {
  private repositories: Map<string, RepositoryInfo> = new Map();
  private files: Map<string, Map<string, RepositoryFile>> = new Map();
  private analysis: Map<string, RepositoryAnalysis> = new Map();
  private relationships: Map<string, RepositoryRelationship[]> = new Map();
  
  private llm?: LLMClient;
  
  private options: {
    enableCaching: boolean;
    enableLLM: boolean;
    maxRepositories: number;
    maxFilesPerRepo: number;
    similarityThreshold: number;
    debug: boolean;
  };

  constructor(llm?: LLMClient, _cache?: CacheManager, options?: Partial<CrossRepositoryAnalyzer['options']>) {
    this.llm = llm;
    this.options = {
      enableCaching: true,
      enableLLM: true,
      maxRepositories: 100,
      maxFilesPerRepo: 1000,
      similarityThreshold: 0.7,
      debug: false,
      ...options,
    };
  }

  // ==========================================================================
  // Repository Management
  // ==========================================================================

  async addRepository(info: RepositoryInfo, files: RepositoryFile[] = []): Promise<string> {
    const id = info.id || this.generateId();
    const repoInfo: RepositoryInfo = { ...info, id };
    
    this.repositories.set(id, repoInfo);
    this.files.set(id, new Map());
    
    // Add files
    for (const file of files) {
      await this.addFile(id, file);
    }
    
    this.log(`Added repository: ${repoInfo.name} (${id})`);
    return id;
  }

  async addFile(repositoryId: string, file: RepositoryFile): Promise<void> {
    const repoFiles = this.files.get(repositoryId);
    if (!repoFiles) return;
    
    const fileHash = this.hashFile(file);
    const fileInfo: RepositoryFile = {
      ...file,
      hash: fileHash,
    };
    
    repoFiles.set(file.path, fileInfo);
    this.log(`Added file: ${repositoryId}/${file.path}`);
  }

  async removeRepository(repositoryId: string): Promise<void> {
    this.repositories.delete(repositoryId);
    this.files.delete(repositoryId);
    this.analysis.delete(repositoryId);
    this.relationships.delete(repositoryId);
    this.log(`Removed repository: ${repositoryId}`);
  }

  getRepository(repositoryId: string): RepositoryInfo | undefined {
    return this.repositories.get(repositoryId);
  }

  getRepositoryFiles(repositoryId: string): Map<string, RepositoryFile> | undefined {
    return this.files.get(repositoryId);
  }

  // ==========================================================================
  // Analysis
  // ==========================================================================

  async analyzeRepository(repositoryId: string, _options: { includeFiles?: boolean } = {}): Promise<RepositoryAnalysis | null> {
    const repoInfo = this.repositories.get(repositoryId);
    if (!repoInfo) return null;
    
    const repoFiles = this.files.get(repositoryId);
    if (!repoFiles) return null;
    
    const analysis: RepositoryAnalysis = {
      id: this.generateId(),
      repository: repositoryId,
      files: Array.from(repoFiles.values()),
      dependencies: [],
      patterns: [],
      statistics: this.calculateRepositoryStatistics(repoFiles),
      relationships: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    
    // Extract dependencies
    analysis.dependencies = await this.extractDependencies(repositoryId, repoFiles);
    
    // Find patterns
    analysis.patterns = await this.findPatterns(repositoryId, repoFiles);
    
    // Find relationships with other repos
    analysis.relationships = await this.findRelationships(repositoryId, analysis);
    
    this.analysis.set(repositoryId, analysis);
    return analysis;
  }

  async analyzeAllRepositories(): Promise<RepositoryAnalysis[]> {
    const results: RepositoryAnalysis[] = [];
    
    for (const [id] of this.repositories) {
      const analysis = await this.analyzeRepository(id);
      if (analysis) results.push(analysis);
    }
    
    return results;
  }

  private calculateRepositoryStatistics(files: Map<string, RepositoryFile>): RepositoryStatistics {
    const stats: RepositoryStatistics = {
      totalSize: 0,
      totalFiles: files.size,
      totalLines: 0,
      complexity: { average: 0, min: Infinity, max: 0, distribution: {} },
      languages: {},
      domains: {},
      dependencies: { total: 0, byType: {}, top: [] },
      patterns: { total: 0, byType: {}, top: [] },
      quality: { average: 0, byFile: {} },
    };
    
    for (const file of files.values()) {
      stats.totalSize += file.size;
      stats.totalLines += file.content.split('\n').length;
      
      if (file.language) {
        stats.languages[file.language] = (stats.languages[file.language] || 0) + 1;
      }
      if (file.metadata?.domain) {
        stats.domains[file.metadata.domain] = (stats.domains[file.metadata.domain] || 0) + 1;
      }
    }
    
    return stats;
  }

  private async extractDependencies(repositoryId: string, files: Map<string, RepositoryFile>): Promise<RepositoryDependency[]> {
    const dependencies: Map<string, RepositoryDependency> = new Map();
    
    for (const file of files.values()) {
      // Extract from AST
      if (file.ast) {
        this.extractDependenciesFromAST(file.ast, repositoryId, file.path, dependencies);
      }
      
      // Extract from understanding
      if (file.understanding?.semantics?.dependencies) {
        for (const dep of file.understanding.semantics.dependencies) {
          const key = `${dep.name}@${dep.version || ''}`;
          if (!dependencies.has(key)) {
            dependencies.set(key, {
              name: dep.name,
              version: dep.version,
              // Import-derived dependencies: type/inheritance links are internal
              // to the codebase, runtime imports are external modules.
              kind: dep.kind === 'type' || dep.kind === 'inheritance' ? 'internal' : 'external',
              usage: [],
              confidence: dep.confidence,
            });
          }
          const existing = dependencies.get(key)!;
          existing.usage.push({ file: file.path, ...dep.usage[0] });
          existing.confidence = Math.max(existing.confidence, dep.confidence);
        }
      }
      
      // Use LLM to extract additional dependencies
      if (this.llm && this.options.enableLLM) {
        const deps = await this.extractDependenciesWithLLM(file.content, file.path);
        for (const dep of deps) {
          const key = `${dep.name}@${dep.version || ''}`;
          if (!dependencies.has(key)) {
            dependencies.set(key, dep);
          } else {
            const existing = dependencies.get(key)!;
            existing.usage = [...existing.usage, ...dep.usage];
            existing.confidence = Math.max(existing.confidence, dep.confidence);
          }
        }
      }
    }
    
    return Array.from(dependencies.values());
  }

  private extractDependenciesFromAST(ast: ASTNode, _repositoryId: string, filePath: string, dependencies: Map<string, RepositoryDependency>): void {
    const visit = (node: ASTNode) => {
      if (node.type === 'ImportDeclaration') {
        const source = String(node.value?.source || '');
        const name = this.extractPackageName(source);
        
        const key = name;
        if (!dependencies.has(key)) {
          dependencies.set(key, {
            name,
            kind: 'external',
            usage: [],
            confidence: 0.8,
          });
        }
        
        const existing = dependencies.get(key)!;
        existing.usage.push({
          file: filePath,
          line: node.position.line,
          column: node.position.column,
          offset: node.position.offset,
        });
      }
      
      for (const child of node.children || []) {
        visit(child);
      }
    };
    
    visit(ast);
  }

  private extractPackageName(source: string): string {
    // Simple extraction - in real implementation, would handle various formats
    if (source.startsWith('.')) return source; // Relative import
    if (source.startsWith('@')) {
      // Scoped package
      const parts = source.split('/');
      return parts[0] + '/' + parts[1];
    }
    return source.split('/')[0];
  }

  private async extractDependenciesWithLLM(content: string, filePath: string): Promise<RepositoryDependency[]> {
    if (!this.llm) return [];
    
    const prompt = {
      system: `You are an expert dependency analyzer. Extract all dependencies from the following code. Return ONLY a JSON array of { name, version, kind, usage: [{ file, line, column, offset }], confidence }.`,
      user: `Code from ${filePath}:
${content}`,
    };
    
    try {
      const response = await this.llm.generate(prompt);
      const parsed = JSON.parse(response.content);
      return parsed.map((d: any) => ({
        name: d.name,
        version: d.version,
        kind: d.kind || 'external',
        usage: d.usage || [],
        confidence: d.confidence || 0.7,
      }));
    } catch {
      return [];
    }
  }

  private async findPatterns(_repositoryId: string, files: Map<string, RepositoryFile>): Promise<RepositoryPattern[]> {
    const patternMap: Map<string, RepositoryPattern> = new Map();
    
    for (const file of files.values()) {
      // Find patterns in AST
      if (file.ast) {
        const filePatterns = this.findPatternsInAST(file.ast, file.path);
        for (const pattern of filePatterns) {
          const key = pattern.name;
          if (!patternMap.has(key)) {
            patternMap.set(key, pattern);
          } else {
            const existing = patternMap.get(key)!;
            existing.occurrences.push(...pattern.occurrences);
            existing.confidence = Math.max(existing.confidence, pattern.confidence);
          }
        }
      }
      
      // Find patterns from understanding
      if (file.understanding?.intent?.patterns) {
        for (const pattern of file.understanding.intent.patterns) {
          const repoPattern: RepositoryPattern = {
            id: this.generateId(),
            name: pattern.name,
            kind: pattern.kind,
            description: pattern.description,
            occurrences: [{
              file: file.path,
              position: pattern.position[0] || { line: 0, column: 0, offset: 0 },
              code: '',
              confidence: pattern.confidence,
            }],
            relatedPatterns: [],
            confidence: pattern.confidence,
          };
          
          const key = pattern.name;
          if (!patternMap.has(key)) {
            patternMap.set(key, repoPattern);
          } else {
            const existing = patternMap.get(key)!;
            existing.occurrences.push(...repoPattern.occurrences);
          }
        }
      }
      
      // Use LLM to find patterns
      if (this.llm && this.options.enableLLM) {
        const patterns = await this.findPatternsWithLLM(file.content, file.path);
        for (const pattern of patterns) {
          const key = pattern.name;
          if (!patternMap.has(key)) {
            patternMap.set(key, pattern);
          } else {
            const existing = patternMap.get(key)!;
            existing.occurrences.push(...pattern.occurrences);
          }
        }
      }
    }
    
    // Filter and sort patterns
    const patterns = Array.from(patternMap.values());
    patterns.sort((a, b) => b.occurrences.length - a.occurrences.length);
    
    return patterns.slice(0, 50); // Top 50 patterns
  }

  private findPatternsInAST(ast: ASTNode, filePath: string): RepositoryPattern[] {
    const patterns: RepositoryPattern[] = [];
    const patternCounts: Record<string, { node: ASTNode; count: number }> = {};
    
    const visit = (node: ASTNode, _parent?: ASTNode) => {
      // Detect design patterns based on AST structure
      
      // Singleton pattern
      if (node.type === 'ClassDeclaration') {
        const hasPrivateConstructor = node.children?.some(c => 
          c.type === 'MethodDefinition' && 
          String(c.value?.name) === 'constructor' &&
          String(c.value?.visibility) === 'private'
        );
        const hasStaticInstance = node.children?.some(c => 
          c.type === 'ClassProperty' &&
          String(c.value?.name) === 'instance' &&
          c.value?.isStatic
        );
        
        if (hasPrivateConstructor && hasStaticInstance) {
          const key = 'Singleton';
          if (!patternCounts[key]) {
            patternCounts[key] = { node, count: 0 };
          }
          patternCounts[key].count++;
        }
      }
      
      // Factory pattern
      if (node.type === 'FunctionDeclaration') {
        const funcName = String(node.value?.name || '');
        if (funcName.toLowerCase().includes('factory') || funcName.toLowerCase().includes('create')) {
          const returnsObject = node.children?.some(c => 
            c.type === 'ReturnStatement' &&
            c.children?.some(cc => cc.type === 'ObjectExpression')
          );
          
          if (returnsObject) {
            const key = 'Factory';
            if (!patternCounts[key]) {
              patternCounts[key] = { node, count: 0 };
            }
            patternCounts[key].count++;
          }
        }
      }
      
      for (const child of node.children || []) {
        visit(child, node);
      }
    };
    
    visit(ast);
    
    // Convert to repository patterns
    for (const [name, info] of Object.entries(patternCounts)) {
      patterns.push({
        id: this.generateId(),
        name,
        kind: 'architectural',
        description: `${name} pattern`,
        occurrences: [{
          file: filePath,
          position: info.node.position,
          code: '',
          confidence: 0.8,
        }],
        relatedPatterns: [],
        confidence: 0.8,
      });
    }
    
    return patterns;
  }

  private async findPatternsWithLLM(content: string, filePath: string): Promise<RepositoryPattern[]> {
    if (!this.llm) return [];
    
    const prompt = {
      system: `You are an expert pattern detector. Identify all design patterns and architectural patterns in the code. Return ONLY a JSON array of { name, kind, description, occurrences: [{ file, position, code, confidence }], confidence }.`,
      user: `Code from ${filePath}:
${content}`,
    };
    
    try {
      const response = await this.llm.generate(prompt);
      const parsed = JSON.parse(response.content);
      return parsed.map((p: any) => ({
        id: this.generateId(),
        name: p.name,
        kind: p.kind || 'architectural',
        description: p.description || '',
        occurrences: p.occurrences || [],
        relatedPatterns: p.relatedPatterns || [],
        confidence: p.confidence || 0.7,
      }));
    } catch {
      return [];
    }
  }

  private async findRelationships(
    repositoryId: string,
    currentAnalysis: RepositoryAnalysis
  ): Promise<RepositoryRelationship[]> {
    const relationships: RepositoryRelationship[] = [];
    const repoInfo = this.repositories.get(repositoryId);
    if (!repoInfo) return relationships;
    
    // Compare with all other repositories
    for (const [otherId, otherInfo] of this.repositories) {
      if (otherId === repositoryId) continue;
      
      const similarity = await this.calculateRepositorySimilarity(repositoryId, otherId);
      if (similarity > this.options.similarityThreshold) {
        relationships.push({
          kind: 'similarity',
          target: otherId,
          strength: similarity,
          direction: 'bidirectional',
          details: { similarity },
        });
      }
      
      // Check for dependency relationships
      const repoFiles = this.files.get(repositoryId);
      const otherFiles = this.files.get(otherId);
      
      if (repoFiles && otherFiles) {
        for (const dep of currentAnalysis.dependencies) {
          if (dep.name === otherInfo.name || dep.resolved?.id === otherId) {
            relationships.push({
              kind: 'dependency',
              target: otherId,
              strength: dep.confidence,
              direction: 'out',
              details: dep,
            });
          }
        }
      }
    }
    
    return relationships;
  }

  async calculateRepositorySimilarity(repoId1: string, repoId2: string): Promise<number> {
    const files1 = this.files.get(repoId1);
    const files2 = this.files.get(repoId2);
    
    if (!files1 || !files2) return 0;
    
    let totalSimilarity = 0;
    let totalPairs = 0;
    
    // Compare all pairs of files
    for (const file1 of files1.values()) {
      for (const file2 of files2.values()) {
        const similarity = await this.calculateFileSimilarity(file1, file2);
        totalSimilarity += similarity;
        totalPairs++;
      }
    }
    
    // Calculate average similarity
    return totalPairs > 0 ? totalSimilarity / totalPairs : 0;
  }

  private async calculateFileSimilarity(file1: RepositoryFile, file2: RepositoryFile): Promise<number> {
    // Compare by hash
    if (file1.hash === file2.hash) return 1;
    
    // Compare by content
    if (file1.content === file2.content) return 1;
    
    // Use LLM to compare
    if (this.llm && this.options.enableLLM) {
      const prompt = {
        system: `Compare two code files and return a similarity score between 0 and 1. Consider structure, logic, and intent. Return ONLY a JSON object { similarity: number }.`,
        user: `File 1 (${file1.path}):
${file1.content}

File 2 (${file2.path}):
${file2.content}`,
      };
      
      try {
        const response = await this.llm.generate(prompt);
        const parsed = JSON.parse(response.content);
        return parsed.similarity || 0;
      } catch {
        // Fallback to content similarity
        return this.calculateContentSimilarity(file1.content, file2.content);
      }
    }
    
    return this.calculateContentSimilarity(file1.content, file2.content);
  }

  private calculateContentSimilarity(content1: string, content2: string): number {
    // Simple similarity based on common tokens
    const tokens1 = this.tokenizeForSimilarity(content1);
    const tokens2 = this.tokenizeForSimilarity(content2);
    
    const common = tokens1.filter(t => tokens2.includes(t)).length;
    const total = Math.max(tokens1.length, tokens2.length);
    
    return total > 0 ? common / total : 0;
  }

  private tokenizeForSimilarity(content: string): string[] {
    // Remove whitespace and comments, then tokenize
    const cleaned = content
      .replace(/\/\/[^\n]*/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\s+/g, ' ')
      .trim();
    
    // Split into tokens
    const tokens: string[] = [];
    let current = '';
    
    for (const char of cleaned) {
      if (/[a-zA-Z0-9_]/.test(char)) {
        current += char;
      } else {
        if (current) {
          tokens.push(current);
          current = '';
        }
        if (!/\s/.test(char)) {
          tokens.push(char);
        }
      }
    }
    
    if (current) tokens.push(current);
    
    return tokens;
  }

  // ==========================================================================
  // Cross-Repository Queries
  // ==========================================================================

  async query(query: CrossRepositoryQuery): Promise<CrossRepositoryResult> {
    // Filter repositories
    let repositories = Array.from(this.repositories.values());
    
    if (query.repositories) {
      repositories = repositories.filter(r => query.repositories!.includes(r.id));
    }
    
    if (query.languages) {
      repositories = repositories.filter(r => query.languages!.includes(r.language || ''));
    }
    
    if (query.domains) {
      repositories = repositories.filter(r => query.domains!.includes(r.domain || ''));
    }
    
    // Analyze matching repositories
    const analyses: RepositoryAnalysis[] = [];
    for (const repo of repositories) {
      const analysis = await this.analyzeRepository(repo.id);
      if (analysis) analyses.push(analysis);
    }
    
    // Filter patterns if specified
    let allPatterns: RepositoryPattern[] = [];
    for (const analysis of analyses) {
      allPatterns.push(...analysis.patterns);
    }
    
    if (query.patterns) {
      allPatterns = allPatterns.filter(p => query.patterns!.includes(p.name));
    }
    
    // Find comparisons
    const comparisons: RepositoryComparison[] = [];
    for (let i = 0; i < analyses.length; i++) {
      for (let j = i + 1; j < analyses.length; j++) {
        const comparison = await this.compareRepositories(analyses[i].repository, analyses[j].repository);
        if (comparison.similarity >= (query.minSimilarity || 0)) {
          comparisons.push(comparison);
        }
      }
    }
    
    // Find clusters
    const clusters = await this.findClusters(analyses);
    
    // Calculate statistics
    const statistics = this.calculateCrossRepositoryStatistics(analyses, comparisons, clusters);
    
    return {
      query,
      repositories: analyses.slice(0, query.maxResults || analyses.length),
      comparisons: comparisons.slice(0, query.maxResults || comparisons.length),
      clusters: clusters.slice(0, query.maxResults || clusters.length),
      statistics,
      timestamp: Date.now(),
    };
  }

  private async compareRepositories(repoId1: string, repoId2: string): Promise<RepositoryComparison> {
    const similarity = await this.calculateRepositorySimilarity(repoId1, repoId2);
    
    const analysis1 = await this.analyzeRepository(repoId1);
    const analysis2 = await this.analyzeRepository(repoId2);
    
    // Find common patterns
    const commonPatterns: RepositoryPattern[] = [];
    const patternMap1 = new Map(analysis1?.patterns.map(p => [p.name, p]) || []);
    const patternMap2 = new Map(analysis2?.patterns.map(p => [p.name, p]) || []);
    
    for (const [name, pattern1] of patternMap1) {
      if (patternMap2.has(name)) {
        const pattern2 = patternMap2.get(name)!;
        commonPatterns.push({
          ...pattern1,
          occurrences: [...pattern1.occurrences, ...pattern2.occurrences],
        });
      }
    }
    
    // Find differences
    const differences: RepositoryDifference[] = [];
    
    // Differences in files
    const files1 = this.files.get(repoId1);
    const files2 = this.files.get(repoId2);
    
    if (files1 && files2) {
      const paths1 = new Set(files1.keys());
      const paths2 = new Set(files2.keys());
      
      // Files only in repo1
      for (const path of paths1) {
        if (!paths2.has(path)) {
          differences.push({
            kind: 'file',
            details: { file: path, repository: repoId1, status: 'only-in-first' },
            confidence: 1,
          });
        }
      }
      
      // Files only in repo2
      for (const path of paths2) {
        if (!paths1.has(path)) {
          differences.push({
            kind: 'file',
            details: { file: path, repository: repoId2, status: 'only-in-second' },
            confidence: 1,
          });
        }
      }
    }
    
    // Differences in dependencies
    const deps1 = new Set((analysis1?.dependencies || []).map(d => d.name));
    const deps2 = new Set((analysis2?.dependencies || []).map(d => d.name));
    
    for (const dep of deps1) {
      if (!deps2.has(dep)) {
        differences.push({
          kind: 'dependency',
          details: { dependency: dep, repository: repoId1 },
          confidence: 0.9,
        });
      }
    }
    
    for (const dep of deps2) {
      if (!deps1.has(dep)) {
        differences.push({
          kind: 'dependency',
          details: { dependency: dep, repository: repoId2 },
          confidence: 0.9,
        });
      }
    }
    
    // Evolution analysis
    const evolution: RepositoryEvolution = {
      commonHistory: [],
      divergencePoint: undefined,
      divergenceDate: undefined,
      divergenceReason: undefined,
    };
    
    return {
      repository1: repoId1,
      repository2: repoId2,
      similarity,
      commonPatterns,
      differences,
      dependencies: [...(analysis1?.dependencies || []), ...(analysis2?.dependencies || [])],
      evolution,
    };
  }

  private async findClusters(analyses: RepositoryAnalysis[]): Promise<RepositoryCluster[]> {
    const clusters: RepositoryCluster[] = [];
    const usedRepos = new Set<string>();
    
    // Simple clustering: start with each repo as a potential cluster
    for (const analysis of analyses) {
      if (usedRepos.has(analysis.repository)) continue;
      
      const cluster: RepositoryCluster = {
        id: this.generateId(),
        repositories: [analysis.repository],
        center: analysis.repository,
        similarity: 1,
        patterns: [...analysis.patterns],
        size: 1,
      };
      
      // Find similar repositories
      for (const otherAnalysis of analyses) {
        if (otherAnalysis.repository === analysis.repository) continue;
        if (usedRepos.has(otherAnalysis.repository)) continue;
        
        const similarity = await this.calculateRepositorySimilarity(
          analysis.repository,
          otherAnalysis.repository
        );
        
        if (similarity >= this.options.similarityThreshold) {
          cluster.repositories.push(otherAnalysis.repository);
          cluster.size++;
          cluster.patterns.push(...otherAnalysis.patterns);
          cluster.similarity = Math.min(cluster.similarity, similarity);
          usedRepos.add(otherAnalysis.repository);
        }
      }
      
      if (cluster.size > 1) {
        clusters.push(cluster);
      }
      
      usedRepos.add(analysis.repository);
    }
    
    return clusters;
  }

  private calculateCrossRepositoryStatistics(
    analyses: RepositoryAnalysis[],
    comparisons: RepositoryComparison[],
    clusters: RepositoryCluster[]
  ): CrossRepositoryStatistics {
    const stats: CrossRepositoryStatistics = {
      totalRepositories: analyses.length,
      totalFiles: 0,
      totalSize: 0,
      averageSimilarity: 0,
      largestCluster: null,
      mostCommonPatterns: [],
      mostCommonDependencies: [],
    };
    
    // Calculate totals
    for (const analysis of analyses) {
      stats.totalFiles += analysis.statistics.totalFiles;
      stats.totalSize += analysis.statistics.totalSize;
    }
    
    // Calculate average similarity
    if (comparisons.length > 0) {
      const totalSimilarity = comparisons.reduce((sum, c) => sum + c.similarity, 0);
      stats.averageSimilarity = totalSimilarity / comparisons.length;
    }
    
    // Find largest cluster
    if (clusters.length > 0) {
      const largest = clusters.reduce((max, c) => c.size > max.size ? c : max, clusters[0]);
      stats.largestCluster = largest;
    }
    
    // Find most common patterns
    const patternCounts: Record<string, number> = {};
    for (const analysis of analyses) {
      for (const pattern of analysis.patterns) {
        patternCounts[pattern.name] = (patternCounts[pattern.name] || 0) + 1;
      }
    }
    
    stats.mostCommonPatterns = Object.entries(patternCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)
      .map((pc) => ({
        id: this.generateId(),
        name: pc.name,
        kind: 'architectural',
        description: '',
        occurrences: [],
        relatedPatterns: [],
        confidence: pc.count / analyses.length,
      }));
    
    // Find most common dependencies
    const depCounts: Record<string, number> = {};
    for (const analysis of analyses) {
      for (const dep of analysis.dependencies) {
        depCounts[dep.name] = (depCounts[dep.name] || 0) + 1;
      }
    }
    
    stats.mostCommonDependencies = Object.entries(depCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)
      .map((dc) => ({
        name: dc.name,
        kind: 'external',
        usage: [],
        confidence: dc.count / analyses.length,
      }));
    
    return stats;
  }

  // ==========================================================================
  // Evolution Tracking
  // ==========================================================================

  async addCommit(repositoryId: string, commit: CommitInfo): Promise<void> {
    const repoInfo = this.repositories.get(repositoryId);
    if (!repoInfo) return;
    
    // In a real implementation, would track commits and calculate evolution
    this.log(`Added commit to ${repositoryId}: ${commit.hash}`);
  }

  async trackEvolution(_repositoryId: string): Promise<RepositoryEvolution | null> {
    // In a real implementation, would analyze commit history
    // and calculate evolution metrics
    return null;
  }

  // ==========================================================================
  // Utility Methods
  // ==========================================================================

  private hashFile(file: RepositoryFile): string {
    const hash = crypto.createHash('sha256');
    hash.update(file.path);
    hash.update(file.content);
    return hash.digest('hex');
  }

  private generateId(): string {
    return crypto.randomBytes(16).toString('hex');
  }

  private log(...args: any[]): void {
    if (this.options.debug) {
      console.log('[CrossRepositoryAnalyzer]', ...args);
    }
  }
}

export function createCrossRepositoryAnalyzer(
  llm?: LLMClient,
  cache?: CacheManager,
  options?: Partial<CrossRepositoryAnalyzer['options']>
): CrossRepositoryAnalyzer {
  return new CrossRepositoryAnalyzer(llm, cache, options);
}
