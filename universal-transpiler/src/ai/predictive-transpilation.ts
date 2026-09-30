/**
 * Universal Transpiler - Predictive Transpilation
 * 
 * Uses machine learning and pattern recognition to:
 * 1. Predict the most likely target language
 * 2. Predict required transformations
 * 3. Predict optimal compilation strategies
 * 4. Anticipate and prevent errors
 * 5. Suggest improvements and optimizations
 */

import * as crypto from 'crypto';
import type { LLMClient, CacheManager, TranspileOptions } from '../core/universal-transpiler';
import type { CrossRepositoryAnalyzer } from './cross-repository-analysis';

// ============================================================================
// Types
// ============================================================================

export interface PredictionOptions {
  source: string;
  sourceLanguage?: string;
  targetLanguage?: string;
  domain?: string;
  context?: PredictionContext;
  confidenceThreshold?: number;
  maxPredictions?: number;
  includeAlternatives?: boolean;
}

export interface PredictionContext {
  filePath?: string;
  repository?: string;
  relatedFiles?: string[];
  projectStructure?: any;
  userPreferences?: UserPreferences;
  historicalData?: HistoricalTranspilationData;
}

export interface UserPreferences {
  preferredLanguages?: string[];
  preferredDomains?: string[];
  stylePreferences?: {
    formatting?: string;
    namingConvention?: string;
    errorHandling?: string;
    asyncStyle?: string;
  };
  qualitySettings?: {
    optimizationLevel?: 'none' | 'basic' | 'aggressive';
    strictMode?: boolean;
    typeSafety?: 'none' | 'basic' | 'strict';
    testCoverage?: number;
  };
}

export interface HistoricalTranspilationData {
  sourceLanguage: string;
  targetLanguage: string;
  successRate: number;
  errorPatterns: ErrorPattern[];
  warningPatterns: WarningPattern[];
  performance: {
    averageTime: number;
    averageSizeChange: number;
    complexityChange: number;
  };
  timestamps: number[];
}

export interface ErrorPattern {
  code: string;
  message: string;
  count: number;
  lastOccurrence: number;
  context: string;
  severity: 'error' | 'warning';
  confidence?: number;
}

export interface WarningPattern {
  code: string;
  message: string;
  count: number;
  lastOccurrence: number;
}

export interface PredictionResult {
  predictions: Prediction[];
  alternatives: AlternativePrediction[];
  warnings: PredictionWarning[];
  statistics: PredictionStatistics;
  timestamp: number;
}

export interface Prediction {
  type: 'target' | 'transform' | 'strategy' | 'error' | 'optimization';
  category: string;
  value: any;
  confidence: number;
  reason: string;
  context: PredictionContext;
  dependencies: PredictionDependency[];
  alternatives?: AlternativePrediction[];
}

export interface AlternativePrediction {
  value: any;
  confidence: number;
  reason: string;
  tradeoffs: Tradeoff[];
}

export interface Tradeoff {
  aspect: string;
  improvement: string;
  cost: string;
  weight: number;
}

export interface PredictionDependency {
  type: 'language' | 'domain' | 'pattern' | 'library' | 'feature';
  name: string;
  required: boolean;
  confidence: number;
}

export interface PredictionWarning {
  code: string;
  message: string;
  severity: 'low' | 'medium' | 'high';
  context: PredictionContext;
  suggestedAction?: SuggestedAction;
}

export interface SuggestedAction {
  type: 'refactor' | 'configure' | 'install' | 'upgrade' | 'ignore';
  description: string;
  commands?: string[];
  estimatedImpact?: ImpactEstimate;
}

export interface ImpactEstimate {
  effort: 'low' | 'medium' | 'high';
  time: number; // in minutes
  risk: 'low' | 'medium' | 'high';
  benefit: 'low' | 'medium' | 'high';
}

export interface PredictionStatistics {
  totalPredictions: number;
  averageConfidence: number;
  highestConfidence: number;
  predictionTime: number;
  llmCalls: number;
  cachedPredictions: number;
}

export interface TranspilationPlan {
  id: string;
  source: string;
  sourceLanguage: string;
  targetLanguage: string;
  steps: TranspilationStep[];
  predictions: Prediction[];
  riskAssessment: RiskAssessment;
  optimizationOpportunities: OptimizationOpportunity[];
  estimatedTime: number;
  estimatedComplexity: number;
}

export interface TranspilationStep {
  id: string;
  type: 'parse' | 'transform' | 'compile' | 'optimize' | 'validate';
  description: string;
  dependencies: string[];
  estimatedTime: number;
  estimatedComplexity: number;
  status: 'pending' | 'in-progress' | 'completed' | 'failed';
  errors: string[];
  warnings: string[];
}

export interface RiskAssessment {
  overallRisk: 'low' | 'medium' | 'high' | 'critical';
  risks: Risk[];
  mitigations: Mitigation[];
}

export interface Risk {
  type: 'compatibility' | 'syntax' | 'semantic' | 'performance' | 'security';
  description: string;
  likelihood: 'low' | 'medium' | 'high';
  impact: 'low' | 'medium' | 'high' | 'critical';
  severity: 'low' | 'medium' | 'high' | 'critical';
  confidence: number;
}

export interface Mitigation {
  type: 'automatic' | 'manual' | 'configurable';
  description: string;
  action?: SuggestedAction;
  effectiveness: number;
}

export interface OptimizationOpportunity {
  type: 'performance' | 'readability' | 'maintainability' | 'size';
  description: string;
  potentialBenefit: number; // percentage
  effort: 'low' | 'medium' | 'high';
  confidence: number;
  suggestedChanges: SuggestedChange[];
}

export interface SuggestedChange {
  type: 'code' | 'configuration' | 'dependency';
  description: string;
  location?: CodeLocation;
  oldValue?: string;
  newValue?: string;
  commands?: string[];
}

export interface CodeLocation {
  file?: string;
  line: number;
  column: number;
  offset: number;
  length: number;
}

export interface PredictionCacheEntry {
  key: string;
  value: PredictionResult;
  timestamp: number;
  ttl: number;
  metadata: {
    sourceHash: string;
    contextHash: string;
    modelVersion?: string;
  };
}

export interface PredictiveTranspilationOptions {
  enableCaching?: boolean;
  enableLearning?: boolean;
  enableLLM?: boolean;
  maxCacheSize?: number;
  minConfidence?: number;
  debug?: boolean;
}

// ============================================================================
// Predictive Transpiler Class
// ============================================================================

export class PredictiveTranspiler {
  private llm?: LLMClient;
  
  private predictionCache: Map<string, PredictionCacheEntry> = new Map();
  private historicalData: Map<string, HistoricalTranspilationData> = new Map();
  private patternLibrary: Map<string, PatternAnalysis> = new Map();
  private optimizationLibrary: Map<string, OptimizationPattern> = new Map();
  
  private options: {
    enableCaching: boolean;
    enableLearning: boolean;
    enableLLM: boolean;
    maxCacheSize: number;
    minConfidence: number;
    debug: boolean;
  };

  constructor(
    llm?: LLMClient,
    _cache?: CacheManager,
    _crossRepoAnalyzer?: CrossRepositoryAnalyzer,
    options?: Partial<PredictiveTranspiler['options']>
  ) {
    this.llm = llm;
    
    this.options = {
      enableCaching: true,
      enableLearning: true,
      enableLLM: true,
      maxCacheSize: 1000,
      minConfidence: 0.5,
      debug: false,
      ...options,
    };
    
    // Initialize with built-in patterns and optimizations
    this.initializeLibraries();
  }

  // ==========================================================================
  // Initialization
  // ==========================================================================

  private initializeLibraries(): void {
    // Initialize pattern library with common patterns
    this.patternLibrary.set('Promise', {
      pattern: 'Promise-based async code',
      languagePatterns: {
        javascript: { then: true, catch: true, finally: true },
        typescript: { then: true, catch: true, finally: true, asyncAwait: true },
        python: { asyncio: true, await: true },
        java: { CompletableFuture: true },
        csharp: { Task: true, async: true, await: true },
      },
      commonTransforms: ['promise-to-async-await', 'callback-to-promise'],
      confidence: 0.9,
    });
    
    this.patternLibrary.set('Class', {
      pattern: 'Class-based OOP',
      languagePatterns: {
        javascript: { class: true, constructor: true, extends: true },
        typescript: { class: true, interface: true, implements: true },
        python: { class: true, def: true, __init__: true },
        java: { class: true, interface: true, implements: true },
        csharp: { class: true, interface: true },
      },
      commonTransforms: ['class-to-prototype', 'prototype-to-class'],
      confidence: 0.95,
    });
    
    this.patternLibrary.set('Functional', {
      pattern: 'Functional programming patterns',
      languagePatterns: {
        javascript: { map: true, filter: true, reduce: true },
        typescript: { map: true, filter: true, reduce: true },
        python: { map: true, filter: true, reduce: true, lambda: true },
        haskell: { map: true, filter: true, fold: true },
      },
      commonTransforms: ['imperative-to-functional', 'loop-to-map'],
      confidence: 0.85,
    });
    
    // Initialize optimization library
    this.optimizationLibrary.set('Promise.all', {
      type: 'performance',
      description: 'Replace sequential async operations with Promise.all for parallel execution',
      pattern: /await\s+[^;]+;\s*await\s+[^;]+/,
      replacement: 'Promise.all([...])',
      benefit: 'Reduced execution time',
      effort: 'low',
      confidence: 0.9,
      languages: ['javascript', 'typescript'],
    });
    
    this.optimizationLibrary.set('Map-filter-reduce', {
      type: 'readability',
      description: 'Use map/filter/reduce instead of for loops',
      pattern: /for\s*\([^)]*\)\s*\{[^}]*\}/,
      replacement: 'array.map/filter/reduce',
      benefit: 'More declarative code',
      effort: 'medium',
      confidence: 0.8,
      languages: ['javascript', 'typescript', 'python'],
    });
    
    this.optimizationLibrary.set('Optional chaining', {
      type: 'safety',
      description: 'Use optional chaining instead of manual null checks',
      pattern: /if\s*\([^)]*\.\w+\s*!==\s*null\s*&&\s*[^)]*\.\w+\)/,
      replacement: '?.',
      benefit: 'Prevents null reference errors',
      effort: 'low',
      confidence: 0.95,
      languages: ['javascript', 'typescript'],
    });
  }

  // ==========================================================================
  // Main Prediction Methods
  // ==========================================================================

  async predict(options: PredictionOptions): Promise<PredictionResult> {
    const startTime = Date.now();
    let llmCalls = 0;
    
    // Generate cache key
    const cacheKey = this.generatePredictionCacheKey(options);
    
    // Check cache
    if (this.options.enableCaching && this.predictionCache.has(cacheKey)) {
      const cached = this.predictionCache.get(cacheKey)!;
      return {
        ...cached.value,
        statistics: {
          ...cached.value.statistics,
          cachedPredictions: 1,
        },
      };
    }
    
    const predictions: Prediction[] = [];
    const alternatives: AlternativePrediction[] = [];
    const warnings: PredictionWarning[] = [];
    
    // Step 1: Predict target language
    const targetPredictions = await this.predictTargetLanguage(options);
    predictions.push(...targetPredictions);
    
    // Step 2: Predict required transforms
    const transformPredictions = await this.predictTransforms(options);
    predictions.push(...transformPredictions);
    
    // Step 3: Predict compilation strategy
    const strategyPredictions = await this.predictStrategy(options);
    predictions.push(...strategyPredictions);
    
    // Step 4: Predict potential errors
    const errorPredictions = await this.predictErrors(options);
    predictions.push(...errorPredictions);
    
    // Step 5: Predict optimizations
    const optimizationPredictions = await this.predictOptimizations(options);
    predictions.push(...optimizationPredictions);
    
    // Collect alternatives
    for (const prediction of predictions) {
      if (prediction.alternatives) {
        alternatives.push(...prediction.alternatives);
      }
    }
    
    // Sort predictions by confidence
    predictions.sort((a, b) => b.confidence - a.confidence);
    alternatives.sort((a, b) => b.confidence - a.confidence);
    
    // Apply confidence threshold
    const filteredPredictions = predictions.filter(p => p.confidence >= this.options.minConfidence);
    const filteredAlternatives = alternatives.filter(a => a.confidence >= this.options.minConfidence);
    
    // Calculate statistics
    const totalPredictions = predictions.length;
    const averageConfidence = totalPredictions > 0 
      ? predictions.reduce((sum, p) => sum + p.confidence, 0) / totalPredictions 
      : 0;
    const highestConfidence = totalPredictions > 0 
      ? Math.max(...predictions.map(p => p.confidence)) 
      : 0;
    const predictionTime = Date.now() - startTime;
    
    const result: PredictionResult = {
      predictions: filteredPredictions.slice(0, options.maxPredictions || 20),
      alternatives: filteredAlternatives.slice(0, options.maxPredictions || 10),
      warnings,
      statistics: {
        totalPredictions,
        averageConfidence,
        highestConfidence,
        predictionTime,
        llmCalls,
        cachedPredictions: 0,
      },
      timestamp: Date.now(),
    };
    
    // Cache result
    if (this.options.enableCaching) {
      this.predictionCache.set(cacheKey, {
        key: cacheKey,
        value: result,
        timestamp: Date.now(),
        ttl: 86400000, // 24 hours
        metadata: {
          sourceHash: this.hashSource(options.source),
          contextHash: this.hashContext(options.context || {}),
        },
      });
      this.enforceCacheLimit();
    }
    
    // Learn from this prediction
    if (this.options.enableLearning) {
      await this.learnFromPrediction(options, result);
    }
    
    return result;
  }

  // ==========================================================================
  // Target Language Prediction
  // ==========================================================================

  private async predictTargetLanguage(options: PredictionOptions): Promise<Prediction[]> {
    const predictions: Prediction[] = [];
    let llmCalls = 0;
    
    // Use LLM to predict target language
    if (this.llm && this.options.enableLLM) {
      const prompt = {
        system: `You are an expert transpiler. Given the source code and context, predict the most likely target language. Return ONLY a JSON array of { value: language_name, confidence: 0.0-1.0, reason: "explanation", context: {} }.`,
        user: `Source code:\n${options.source}\n\nContext:\n${JSON.stringify(options.context || {})}\n\nCurrent source language: ${options.sourceLanguage || 'unknown'}\nUser preferences: ${JSON.stringify(options.context?.userPreferences || {})}`,
      };
      
      try {
        const response = await this.llm.generate(prompt);
        llmCalls++;
        const parsed = JSON.parse(response.content);
        
        for (const p of parsed) {
          predictions.push({
            type: 'target',
            category: 'language',
            value: p.value,
            confidence: p.confidence,
            reason: p.reason || 'LLM prediction',
            context: options.context || {},
            dependencies: [],
            alternatives: p.alternatives || [],
          });
        }
      } catch (error) {
        console.error('Failed to predict target language:', error);
      }
    }
    
    // Fallback: use user preferences
    if (predictions.length === 0 && options.context?.userPreferences?.preferredLanguages) {
      for (const lang of options.context.userPreferences.preferredLanguages) {
        predictions.push({
          type: 'target',
          category: 'language',
          value: lang,
          confidence: 0.7,
          reason: 'User preference',
          context: options.context || {},
          dependencies: [],
        });
      }
    }
    
    // Fallback: detect from source language patterns
    if (predictions.length === 0) {
      const detected = this.detectCommonTargets(options.sourceLanguage || '');
      for (const lang of detected) {
        predictions.push({
          type: 'target',
          category: 'language',
          value: lang,
          confidence: 0.6,
          reason: 'Common target for source language',
          context: options.context || {},
          dependencies: [],
        });
      }
    }
    
    return predictions;
  }

  private detectCommonTargets(sourceLanguage: string): string[] {
    const targetMap: Record<string, string[]> = {
      javascript: ['typescript', 'es2020', 'es2015', 'python', 'java'],
      typescript: ['javascript', 'es2020', 'es2015', 'python', 'java'],
      python: ['javascript', 'typescript', 'java', 'go', 'rust'],
      java: ['javascript', 'typescript', 'python', 'kotlin', 'csharp'],
      csharp: ['javascript', 'typescript', 'java', 'python', 'fsharp'],
      go: ['javascript', 'typescript', 'python', 'java'],
      rust: ['javascript', 'typescript', 'python', 'java'],
      html: ['jsx', 'pug', 'handlebars', 'vue'],
      css: ['scss', 'sass', 'less', 'stylus'],
    };
    
    return targetMap[sourceLanguage] || ['javascript', 'typescript', 'python', 'java'];
  }

  // ==========================================================================
  // Transform Prediction
  // ==========================================================================

  private async predictTransforms(options: PredictionOptions): Promise<Prediction[]> {
    const predictions: Prediction[] = [];
    let llmCalls = 0;
    
    // Use pattern library to predict transforms
    for (const [patternName, patternInfo] of this.patternLibrary) {
      const matches = this.matchPattern(options.source, patternInfo);
      if (matches > 0) {
        const confidence = Math.min(0.95, patternInfo.confidence * (matches / 10));
        
        for (const transform of patternInfo.commonTransforms || []) {
          predictions.push({
            type: 'transform',
            category: 'pattern-based',
            value: transform,
            confidence,
            reason: `Pattern '${patternName}' detected ${matches} times`,
            context: options.context || {},
            dependencies: [
              { type: 'pattern', name: patternName, required: true, confidence: patternInfo.confidence },
            ],
          });
        }
      }
    }
    
    // Use LLM to predict additional transforms
    if (this.llm && this.options.enableLLM) {
      const prompt = {
        system: `You are an expert transpiler. Given the source code, predict required transforms. Return ONLY a JSON array of { value: transform_name, confidence: 0.0-1.0, reason: "explanation", category: "transform_type" }.`,
        user: `Source code:\n${options.source}\n\nSource language: ${options.sourceLanguage || 'unknown'}\nTarget language: ${options.targetLanguage || 'unknown'}\nDomain: ${options.domain || 'general'}`,
      };
      
      try {
        const response = await this.llm.generate(prompt);
        llmCalls++;
        const parsed = JSON.parse(response.content);
        
        for (const p of parsed) {
          predictions.push({
            type: 'transform',
            category: p.category || 'unknown',
            value: p.value,
            confidence: p.confidence,
            reason: p.reason || 'LLM prediction',
            context: options.context || {},
            dependencies: [],
          });
        }
      } catch (error) {
        console.error('Failed to predict transforms:', error);
      }
    }
    
    return predictions;
  }

  private matchPattern(source: string, patternInfo: PatternAnalysis): number {
    let count = 0;
    
    // Check for language-specific patterns
    if (patternInfo.languagePatterns) {
      const sourceLang = patternInfo.languagePatterns;
      
      for (const [_lang, keywords] of Object.entries(sourceLang)) {
        for (const [keyword, isPresent] of Object.entries(keywords || {})) {
          if (isPresent && source.includes(keyword)) {
            count++;
          }
        }
      }
    }
    
    return count;
  }

  // ==========================================================================
  // Strategy Prediction
  // ==========================================================================

  private async predictStrategy(options: PredictionOptions): Promise<Prediction[]> {
    const predictions: Prediction[] = [];
    let llmCalls = 0;
    
    // Predict based on source and target
    if (options.sourceLanguage && options.targetLanguage) {
      const strategies = this.getCommonStrategies(options.sourceLanguage, options.targetLanguage);
      
      for (const strategy of strategies) {
        predictions.push({
          type: 'strategy',
          category: 'compilation',
          value: strategy,
          confidence: 0.8,
          reason: `Common strategy for ${options.sourceLanguage} -> ${options.targetLanguage}`,
          context: options.context || {},
          dependencies: [
            { type: 'language', name: options.sourceLanguage, required: true, confidence: 1 },
            { type: 'language', name: options.targetLanguage, required: true, confidence: 1 },
          ],
        });
      }
    }
    
    // Use LLM to predict strategy
    if (this.llm && this.options.enableLLM) {
      const prompt = {
        system: `You are an expert transpiler. Given the source and target, predict the best compilation strategy. Return ONLY a JSON array of { value: strategy, confidence: 0.0-1.0, reason: "explanation" }.`,
        user: `Source language: ${options.sourceLanguage || 'unknown'}\nTarget language: ${options.targetLanguage || 'unknown'}\nSource code:\n${options.source.substring(0, 2000)}\nContext: ${JSON.stringify(options.context || {})}`,
      };
      
      try {
        const response = await this.llm.generate(prompt);
        llmCalls++;
        const parsed = JSON.parse(response.content);
        
        for (const p of parsed) {
          predictions.push({
            type: 'strategy',
            category: 'compilation',
            value: p.value,
            confidence: p.confidence,
            reason: p.reason || 'LLM prediction',
            context: options.context || {},
            dependencies: [],
          });
        }
      } catch (error) {
        console.error('Failed to predict strategy:', error);
      }
    }
    
    return predictions;
  }

  private getCommonStrategies(sourceLanguage: string, targetLanguage: string): string[] {
    const strategyMap: Record<string, Record<string, string[]>> = {
      javascript: {
        typescript: ['add-types', 'strict-mode', 'es6-to-typescript'],
        es2020: ['es6-transforms', 'polyfills'],
        es2015: ['es6-transforms', 'babel-preset-env'],
        python: ['js-to-python', 'async-await-conversion'],
        java: ['js-to-java', 'promise-to-completable-future'],
      },
      typescript: {
        javascript: ['remove-types', 'downlevel-iterators'],
        es2020: ['remove-types', 'downlevel-iterators'],
        python: ['ts-to-python', 'type-removal'],
        java: ['ts-to-java', 'interface-to-class'],
      },
      python: {
        javascript: ['python-to-js', 'list-comprehension-to-map'],
        typescript: ['python-to-ts', 'dynamic-typing'],
        java: ['python-to-java', 'snake-case-to-camel-case'],
        go: ['python-to-go', 'dynamic-to-static'],
      },
    };
    
    return strategyMap[sourceLanguage]?.[targetLanguage] || ['direct-translation', 'pattern-matching'];
  }

  // ==========================================================================
  // Error Prediction
  // ==========================================================================

  private async predictErrors(options: PredictionOptions): Promise<Prediction[]> {
    const predictions: Prediction[] = [];
    let llmCalls = 0;
    
    // Check historical data for error patterns
    const historyKey = `${options.sourceLanguage || 'unknown'}:${options.targetLanguage || 'unknown'}`;
    const historical = this.historicalData.get(historyKey);
    
    if (historical?.errorPatterns) {
      for (const pattern of historical.errorPatterns) {
        // Check if pattern might occur in current source
        if (this.checkErrorPattern(options.source, pattern)) {
          predictions.push({
            type: 'error',
            category: 'historical',
            value: {
              code: pattern.code,
              message: pattern.message,
              severity: pattern.severity,
            },
            confidence: Math.min(0.8, pattern.confidence || 0.7),
            reason: `Historical pattern: ${pattern.message}`,
            context: options.context || {},
            dependencies: [],
          });
        }
      }
    }
    
    // Use LLM to predict potential errors
    if (this.llm && this.options.enableLLM) {
      const prompt = {
        system: `You are an expert transpiler. Analyze the source code and predict potential errors when transpiling. Return ONLY a JSON array of { code: error_code, message: error_message, severity: 'error'|'warning', confidence: 0.0-1.0, reason: "explanation" }.`,
        user: `Source code:\n${options.source}\n\nSource language: ${options.sourceLanguage || 'unknown'}\nTarget language: ${options.targetLanguage || 'unknown'}\nDomain: ${options.domain || 'general'}`,
      };
      
      try {
        const response = await this.llm.generate(prompt);
        llmCalls++;
        const parsed = JSON.parse(response.content);
        
        for (const p of parsed) {
          predictions.push({
            type: 'error',
            category: 'predicted',
            value: {
              code: p.code || 'UNKNOWN',
              message: p.message,
              severity: p.severity || 'warning',
            },
            confidence: p.confidence,
            reason: p.reason || 'LLM prediction',
            context: options.context || {},
            dependencies: [],
          });
        }
      } catch (error) {
        console.error('Failed to predict errors:', error);
      }
    }
    
    return predictions;
  }

  private checkErrorPattern(source: string, pattern: ErrorPattern): boolean {
    // Simple check - in real implementation, would do more sophisticated pattern matching
    return source.includes(pattern.message.split(' ')[0]) || 
           source.includes(pattern.code);
  }

  // ==========================================================================
  // Optimization Prediction
  // ==========================================================================

  private async predictOptimizations(options: PredictionOptions): Promise<Prediction[]> {
    const predictions: Prediction[] = [];
    let llmCalls = 0;
    
    // Use optimization library to find opportunities
    for (const [optId, optInfo] of this.optimizationLibrary) {
      if (optInfo.languages?.includes(options.sourceLanguage || '') ||
          optInfo.languages?.includes(options.targetLanguage || '')) {
        
        const matches = this.matchOptimizationPattern(options.source, optInfo);
        if (matches > 0) {
          predictions.push({
            type: 'optimization',
            category: optInfo.type,
            value: {
              name: optId,
              description: optInfo.description,
              replacement: optInfo.replacement,
              benefit: optInfo.benefit,
              effort: optInfo.effort,
            },
            confidence: Math.min(0.95, optInfo.confidence * (matches / 5)),
            reason: `Optimization pattern '${optId}' detected ${matches} times`,
            context: options.context || {},
            dependencies: [],
          });
        }
      }
    }
    
    // Use LLM to predict optimizations
    if (this.llm && this.options.enableLLM) {
      const prompt = {
        system: `You are an expert code optimizer. Analyze the source code and suggest optimizations for the target language. Return ONLY a JSON array of { type: optimization_type, description: "...", replacement: "...", benefit: "...", effort: "low|medium|high", confidence: 0.0-1.0 }.`,
        user: `Source code:\n${options.source}\n\nSource language: ${options.sourceLanguage || 'unknown'}\nTarget language: ${options.targetLanguage || 'unknown'}`,
      };
      
      try {
        const response = await this.llm.generate(prompt);
        llmCalls++;
        const parsed = JSON.parse(response.content);
        
        for (const p of parsed) {
          predictions.push({
            type: 'optimization',
            category: p.type || 'performance',
            value: {
              name: `llm-${Date.now()}`,
              description: p.description,
              replacement: p.replacement,
              benefit: p.benefit,
              effort: p.effort || 'medium',
            },
            confidence: p.confidence,
            reason: 'LLM prediction',
            context: options.context || {},
            dependencies: [],
          });
        }
      } catch (error) {
        console.error('Failed to predict optimizations:', error);
      }
    }
    
    return predictions;
  }

  private matchOptimizationPattern(source: string, optInfo: OptimizationPattern): number {
    if (!optInfo.pattern) return 0;
    
    const pattern = optInfo.pattern;
    if (typeof pattern === 'string') {
      const regex = new RegExp(pattern, 'g');
      const matches = source.match(regex);
      return matches ? matches.length : 0;
    }
    
    if (pattern instanceof RegExp) {
      const matches = source.match(pattern);
      return matches ? matches.length : 0;
    }
    
    return 0;
  }

  // ==========================================================================
  // Transpilation Planning
  // ==========================================================================

  async createTranspilationPlan(
    source: string,
    sourceLanguage: string,
    targetLanguage: string,
    options: Partial<TranspileOptions> = {}
  ): Promise<TranspilationPlan> {
    // Create prediction options
    const predictionOptions: PredictionOptions = {
      source,
      sourceLanguage,
      targetLanguage,
      context: {
        filePath: options.sourceType,
        ...options,
      },
    };
    
    // Get predictions
    const predictions = await this.predict(predictionOptions);
    
    // Build steps based on predictions
    const steps: TranspilationStep[] = [];
    
    // Always start with parsing
    steps.push({
      id: 'step-parse',
      type: 'parse',
      description: `Parse ${sourceLanguage} source code`,
      dependencies: [],
      estimatedTime: 50, // ms
      estimatedComplexity: 5,
      status: 'pending',
      errors: [],
      warnings: [],
    });
    
    // Add transform steps
    const transformSteps = predictions.predictions
      .filter(p => p.type === 'transform')
      .map((p, i) => ({
        id: `step-transform-${i}`,
        type: 'transform' as const,
        description: `Apply transform: ${p.value}`,
        dependencies: ['step-parse'],
        estimatedTime: 100 + Math.random() * 500,
        estimatedComplexity: 10 + Math.floor(Math.random() * 20),
        status: 'pending' as const,
        errors: [],
        warnings: [],
      }));
    
    steps.push(...transformSteps);
    
    // Add compile step
    steps.push({
      id: 'step-compile',
      type: 'compile',
      description: `Compile to ${targetLanguage}`,
      dependencies: transformSteps.length > 0 
        ? transformSteps.map(s => s.id)
        : ['step-parse'],
      estimatedTime: 200 + Math.random() * 1000,
      estimatedComplexity: 20 + Math.floor(Math.random() * 30),
      status: 'pending',
      errors: [],
      warnings: [],
    });
    
    // Add optimization steps if predictions exist
    const optimizationSteps = predictions.predictions
      .filter(p => p.type === 'optimization')
      .map((p, i) => ({
        id: `step-optimize-${i}`,
        type: 'optimize' as const,
        description: `Apply optimization: ${p.value.description || p.value.name}`,
        dependencies: ['step-compile'],
        estimatedTime: 50 + Math.random() * 200,
        estimatedComplexity: 5 + Math.floor(Math.random() * 15),
        status: 'pending' as const,
        errors: [],
        warnings: [],
      }));
    
    steps.push(...optimizationSteps);
    
    // Add validation step
    steps.push({
      id: 'step-validate',
      type: 'validate',
      description: 'Validate transpiled code',
      dependencies: optimizationSteps.length > 0
        ? optimizationSteps.map(s => s.id)
        : ['step-compile'],
      estimatedTime: 100,
      estimatedComplexity: 10,
      status: 'pending',
      errors: [],
      warnings: [],
    });
    
    // Build risk assessment
    const risks: Risk[] = [];
    const mitigations: Mitigation[] = [];
    
    // Check for error predictions
    const errorPredictions = predictions.predictions.filter(p => p.type === 'error');
    for (const errorPred of errorPredictions) {
      risks.push({
        type: 'semantic',
        description: errorPred.value.message,
        likelihood: errorPred.confidence > 0.7 ? 'high' : errorPred.confidence > 0.5 ? 'medium' : 'low',
        impact: errorPred.value.severity === 'error' ? 'high' : 'medium',
        severity: errorPred.value.severity,
        confidence: errorPred.confidence,
      });
    }
    
    // Add mitigations
    if (risks.length > 0) {
      mitigations.push({
        type: 'automatic',
        description: 'Enable LLM fallback for error recovery',
        effectiveness: 0.8,
      });
    }
    
    // Build optimization opportunities
    const optimizationOpportunities: OptimizationOpportunity[] = predictions.predictions
      .filter(p => p.type === 'optimization')
      .map(p => ({
        type: p.category as 'performance' | 'readability' | 'maintainability' | 'size',
        description: p.value.description || p.value.name,
        potentialBenefit: p.value.benefit === 'Reduced execution time' ? 0.5 : 
                       p.value.benefit === 'More declarative code' ? 0.3 : 0.2,
        effort: p.value.effort || 'medium',
        confidence: p.confidence,
        suggestedChanges: [{
          type: 'code',
          description: p.value.replacement || 'Apply optimization',
        }],
      }));
    
    // Calculate estimates
    const totalTime = steps.reduce((sum, s) => sum + s.estimatedTime, 0);
    const totalComplexity = steps.reduce((sum, s) => sum + s.estimatedComplexity, 0);
    
    const plan: TranspilationPlan = {
      id: this.generateId(),
      source,
      sourceLanguage,
      targetLanguage,
      steps,
      predictions: predictions.predictions,
      riskAssessment: {
        overallRisk: risks.length === 0 ? 'low' : 
                    risks.some(r => r.severity === 'critical') ? 'critical' :
                    risks.some(r => r.severity === 'high') ? 'high' :
                    risks.some(r => r.severity === 'medium') ? 'medium' : 'low',
        risks,
        mitigations,
      },
      optimizationOpportunities,
      estimatedTime: totalTime,
      estimatedComplexity: totalComplexity,
    };
    
    return plan;
  }

  // ==========================================================================
  // Learning System
  // ==========================================================================

  private async learnFromPrediction(
    options: PredictionOptions,
    result: PredictionResult
  ): Promise<void> {
    // Update historical data
    if (options.sourceLanguage && options.targetLanguage) {
      const historyKey = `${options.sourceLanguage}:${options.targetLanguage}`;
      let historical = this.historicalData.get(historyKey);
      
      if (!historical) {
        historical = {
          sourceLanguage: options.sourceLanguage,
          targetLanguage: options.targetLanguage,
          successRate: 0,
          errorPatterns: [],
          warningPatterns: [],
          performance: {
            averageTime: 0,
            averageSizeChange: 0,
            complexityChange: 0,
          },
          timestamps: [],
        };
      }
      
      historical.timestamps.push(Date.now());
      this.historicalData.set(historyKey, historical);
    }
    
    // Learn from warnings
    for (const warning of result.warnings) {
      // Update error patterns
      if (options.sourceLanguage && options.targetLanguage) {
        const historyKey = `${options.sourceLanguage}:${options.targetLanguage}`;
        const historical = this.historicalData.get(historyKey);
        
        if (historical) {
          const existingPattern = historical.warningPatterns.find(p => p.code === warning.code);
          
          if (existingPattern) {
            existingPattern.count++;
            existingPattern.lastOccurrence = Date.now();
          } else {
            historical.warningPatterns.push({
              code: warning.code,
              message: warning.message,
              count: 1,
              lastOccurrence: Date.now(),
            });
          }
        }
      }
    }
    
    // Learn from predictions
    for (const prediction of result.predictions) {
      if (prediction.type === 'error') {
        // Add to error patterns
        if (options.sourceLanguage && options.targetLanguage) {
          const historyKey = `${options.sourceLanguage}:${options.targetLanguage}`;
          const historical = this.historicalData.get(historyKey);
          
          if (historical) {
            const errorInfo = prediction.value as { code: string; message: string; severity: string };
            const existingPattern = historical.errorPatterns.find(p => p.code === errorInfo.code);
            
            if (existingPattern) {
              existingPattern.count++;
              existingPattern.lastOccurrence = Date.now();
            } else {
              historical.errorPatterns.push({
                code: errorInfo.code,
                message: errorInfo.message,
                count: 1,
                lastOccurrence: Date.now(),
                context: prediction.reason,
                severity: errorInfo.severity as 'error' | 'warning',
              });
            }
          }
        }
      }
    }
  }

  // ==========================================================================
  // Utility Methods
  // ==========================================================================

  private generateId(): string {
    return crypto.randomBytes(16).toString('hex');
  }

  private hashSource(source: string): string {
    return crypto.createHash('sha256').update(source).digest('hex').substring(0, 16);
  }

  private hashContext(context: PredictionContext): string {
    return crypto.createHash('sha256').update(JSON.stringify(context)).digest('hex').substring(0, 8);
  }

  private generatePredictionCacheKey(options: PredictionOptions): string {
    return crypto.createHash('sha256')
      .update(`prediction|${this.hashSource(options.source)}|${options.sourceLanguage || ''}|${options.targetLanguage || ''}|${this.hashContext(options.context || {})}`)
      .digest('hex');
  }

  private enforceCacheLimit(): void {
    if (this.predictionCache.size > this.options.maxCacheSize) {
      const keys = Array.from(this.predictionCache.keys());
      for (let i = 0; i < keys.length * 0.2; i++) {
        this.predictionCache.delete(keys[i]);
      }
    }
  }
}

// ============================================================================
// Supporting Types
// ============================================================================

interface PatternAnalysis {
  pattern: string;
  languagePatterns?: Record<string, Record<string, boolean>>;
  commonTransforms?: string[];
  confidence: number;
}

interface OptimizationPattern {
  type: 'performance' | 'readability' | 'maintainability' | 'safety';
  description: string;
  pattern: string | RegExp;
  replacement: string;
  benefit: string;
  effort: 'low' | 'medium' | 'high';
  confidence: number;
  languages?: string[];
}

// ============================================================================
// Factory Functions
// ============================================================================

export function createPredictiveTranspiler(
  llm?: LLMClient,
  cache?: CacheManager,
  crossRepoAnalyzer?: CrossRepositoryAnalyzer,
  options?: Partial<PredictiveTranspiler['options']>
): PredictiveTranspiler {
  return new PredictiveTranspiler(llm, cache, crossRepoAnalyzer, options);
}
