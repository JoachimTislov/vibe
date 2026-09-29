/**
 * Universal Transpiler - Framework Registry
 *
 * Ecosystem-wide knowledge base of frameworks across all supported
 * languages. Used to:
 * - detect frameworks from project markers and source imports
 * - infer domain (web-backend, web-frontend, systems, cli...)
 * - decide the default target platform for output
 */

import type { FrameworkSpec, PlatformTarget } from '../toolchains/types';
import { detectLanguage } from '../parsers/language-parsers';

// ============================================================================
// Framework Catalog
// ============================================================================

export const FRAMEWORK_CATALOG: FrameworkSpec[] = [
  // ------------------------------------------------------------------
  // JavaScript / TypeScript ecosystem
  // ------------------------------------------------------------------
  {
    id: 'react',
    name: 'React',
    ecosystem: 'jsts',
    markerFiles: ['package.json'],
    dependencyPatterns: ['"react"', "'react'", 'react-dom'],
    importPatterns: ["from 'react'", 'from "react"', "require('react')"],
    domains: ['web-frontend', 'spa'],
    defaultPlatform: 'browser',
  },
  {
    id: 'next.js',
    name: 'Next.js',
    ecosystem: 'jsts',
    markerFiles: ['package.json', 'next.config.js', 'next.config.mjs', 'next.config.ts'],
    dependencyPatterns: ['"next"', "'next'"],
    importPatterns: ["from 'next/", 'from "next/', 'next/app', 'next/link'],
    domains: ['web-frontend', 'fullstack', 'ssr'],
    defaultPlatform: 'node',
  },
  {
    id: 'vue',
    name: 'Vue',
    ecosystem: 'jsts',
    markerFiles: ['package.json'],
    dependencyPatterns: ['"vue"', "'vue'"],
    importPatterns: ["from 'vue'", 'from "vue"', 'createApp'],
    domains: ['web-frontend', 'spa'],
    defaultPlatform: 'browser',
  },
  {
    id: 'svelte',
    name: 'Svelte',
    ecosystem: 'jsts',
    markerFiles: ['package.json', 'svelte.config.js'],
    dependencyPatterns: ['"svelte"', "'svelte'"],
    importPatterns: ["from 'svelte", 'from "svelte'],
    domains: ['web-frontend', 'spa'],
    defaultPlatform: 'browser',
  },
  {
    id: 'angular',
    name: 'Angular',
    ecosystem: 'jsts',
    markerFiles: ['package.json', 'angular.json'],
    dependencyPatterns: ['@angular/core'],
    importPatterns: ["from '@angular/", 'from "@angular/'],
    domains: ['web-frontend', 'spa'],
    defaultPlatform: 'browser',
  },
  {
    id: 'express',
    name: 'Express',
    ecosystem: 'jsts',
    markerFiles: ['package.json'],
    dependencyPatterns: ['"express"', "'express'"],
    importPatterns: ["require('express')", "from 'express'", 'from "express"'],
    domains: ['web-backend', 'api'],
    defaultPlatform: 'node',
  },
  {
    id: 'nestjs',
    name: 'NestJS',
    ecosystem: 'jsts',
    markerFiles: ['package.json', 'nest-cli.json'],
    dependencyPatterns: ['@nestjs/core'],
    importPatterns: ["from '@nestjs/", 'from "@nestjs/'],
    domains: ['web-backend', 'api'],
    defaultPlatform: 'node',
  },
  {
    id: 'fastify',
    name: 'Fastify',
    ecosystem: 'jsts',
    markerFiles: ['package.json'],
    dependencyPatterns: ['"fastify"', "'fastify'"],
    importPatterns: ["require('fastify')", "from 'fastify'"],
    domains: ['web-backend', 'api'],
    defaultPlatform: 'node',
  },
  {
    id: 'astro',
    name: 'Astro',
    ecosystem: 'jsts',
    markerFiles: ['package.json', 'astro.config.mjs'],
    dependencyPatterns: ['"astro"', "'astro'"],
    importPatterns: ["from 'astro", 'from "astro'],
    domains: ['web-frontend', 'ssg'],
    defaultPlatform: 'node',
  },
  {
    id: 'vite',
    name: 'Vite',
    ecosystem: 'jsts',
    markerFiles: ['package.json', 'vite.config.ts'],
    dependencyPatterns: ['"vite"', "'vite'"],
    importPatterns: ["from 'vite'", 'from "vite"'],
    domains: ['build-tool'],
    defaultPlatform: 'browser',
  },
  {
    id: 'jest',
    name: 'Jest',
    ecosystem: 'jsts',
    markerFiles: ['package.json'],
    dependencyPatterns: ['"jest"', "'jest'"],
    importPatterns: ["require('jest')", '@jest/globals'],
    domains: ['testing'],
    defaultPlatform: 'node',
  },

  // ------------------------------------------------------------------
  // Java ecosystem
  // ------------------------------------------------------------------
  {
    id: 'spring-boot',
    name: 'Spring Boot',
    ecosystem: 'java',
    markerFiles: ['pom.xml', 'build.gradle', 'build.gradle.kts'],
    dependencyPatterns: ['org.springframework.boot', 'spring-boot-starter'],
    importPatterns: ['org.springframework.boot', '@SpringBootApplication', '@RestController'],
    domains: ['web-backend', 'api', 'enterprise'],
    defaultPlatform: 'jvm',
  },
  {
    id: 'quarkus',
    name: 'Quarkus',
    ecosystem: 'java',
    markerFiles: ['pom.xml', 'build.gradle'],
    dependencyPatterns: ['io.quarkus'],
    importPatterns: ['io.quarkus', '@QuarkusMain'],
    domains: ['web-backend', 'cloud-native'],
    defaultPlatform: 'jvm',
  },
  {
    id: 'micronaut',
    name: 'Micronaut',
    ecosystem: 'java',
    markerFiles: ['pom.xml', 'build.gradle'],
    dependencyPatterns: ['io.micronaut'],
    importPatterns: ['io.micronaut'],
    domains: ['web-backend', 'cloud-native'],
    defaultPlatform: 'jvm',
  },
  {
    id: 'jakarta-ee',
    name: 'Jakarta EE',
    ecosystem: 'java',
    markerFiles: ['pom.xml', 'build.gradle'],
    dependencyPatterns: ['jakarta.servlet', 'jakarta.enterprise'],
    importPatterns: ['jakarta.servlet', '@WebServlet'],
    domains: ['web-backend', 'enterprise'],
    defaultPlatform: 'jvm',
  },
  {
    id: 'hibernate',
    name: 'Hibernate',
    ecosystem: 'java',
    markerFiles: ['pom.xml', 'build.gradle'],
    dependencyPatterns: ['org.hibernate'],
    importPatterns: ['org.hibernate', '@Entity', '@Table'],
    domains: ['data', 'orm'],
    defaultPlatform: 'jvm',
  },
  {
    id: 'junit',
    name: 'JUnit 5',
    ecosystem: 'java',
    markerFiles: ['pom.xml', 'build.gradle'],
    dependencyPatterns: ['org.junit.jupiter'],
    importPatterns: ['org.junit.jupiter', '@Test'],
    domains: ['testing'],
    defaultPlatform: 'jvm',
  },
  {
    id: 'kafka',
    name: 'Apache Kafka client',
    ecosystem: 'java',
    markerFiles: ['pom.xml', 'build.gradle'],
    dependencyPatterns: ['org.apache.kafka'],
    importPatterns: ['org.apache.kafka', 'KafkaConsumer', 'KafkaProducer'],
    domains: ['streaming', 'data'],
    defaultPlatform: 'jvm',
  },

  // ------------------------------------------------------------------
  // Rust ecosystem
  // ------------------------------------------------------------------
  {
    id: 'actix',
    name: 'Actix Web',
    ecosystem: 'rust',
    markerFiles: ['Cargo.toml'],
    dependencyPatterns: ['actix-web'],
    importPatterns: ['use actix_web'],
    domains: ['web-backend', 'api'],
    defaultPlatform: 'native',
  },
  {
    id: 'axum',
    name: 'Axum',
    ecosystem: 'rust',
    markerFiles: ['Cargo.toml'],
    dependencyPatterns: ['axum'],
    importPatterns: ['use axum'],
    domains: ['web-backend', 'api'],
    defaultPlatform: 'native',
  },
  {
    id: 'rocket',
    name: 'Rocket',
    ecosystem: 'rust',
    markerFiles: ['Cargo.toml'],
    dependencyPatterns: ['rocket ='],
    importPatterns: ['#[macro_use] extern crate rocket', 'use rocket'],
    domains: ['web-backend', 'api'],
    defaultPlatform: 'native',
  },
  {
    id: 'tokio',
    name: 'Tokio (async runtime)',
    ecosystem: 'rust',
    markerFiles: ['Cargo.toml'],
    dependencyPatterns: ['tokio'],
    importPatterns: ['use tokio', '#[tokio::main]'],
    domains: ['async', 'systems'],
    defaultPlatform: 'native',
  },
  {
    id: 'bevy',
    name: 'Bevy (game engine)',
    ecosystem: 'rust',
    markerFiles: ['Cargo.toml'],
    dependencyPatterns: ['bevy'],
    importPatterns: ['use bevy'],
    domains: ['game', 'graphics'],
    defaultPlatform: 'native',
  },
  {
    id: 'wasm-bindgen',
    name: 'wasm-bindgen',
    ecosystem: 'rust',
    markerFiles: ['Cargo.toml'],
    dependencyPatterns: ['wasm-bindgen'],
    importPatterns: ['use wasm_bindgen'],
    domains: ['web-frontend', 'wasm'],
    defaultPlatform: 'wasm',
  },
  {
    id: 'tauri',
    name: 'Tauri',
    ecosystem: 'rust',
    markerFiles: ['Cargo.toml', 'tauri.conf.json'],
    dependencyPatterns: ['tauri'],
    importPatterns: ['use tauri'],
    domains: ['desktop', 'gui'],
    defaultPlatform: 'native',
  },
  {
    id: 'clap',
    name: 'clap (CLI)',
    ecosystem: 'rust',
    markerFiles: ['Cargo.toml'],
    dependencyPatterns: ['clap'],
    importPatterns: ['use clap'],
    domains: ['cli'],
    defaultPlatform: 'native',
  },

  // ------------------------------------------------------------------
  // Go ecosystem
  // ------------------------------------------------------------------
  {
    id: 'gin',
    name: 'Gin',
    ecosystem: 'go',
    markerFiles: ['go.mod'],
    dependencyPatterns: ['github.com/gin-gonic/gin'],
    importPatterns: ['"github.com/gin-gonic/gin"'],
    domains: ['web-backend', 'api'],
    defaultPlatform: 'native',
  },
  {
    id: 'echo',
    name: 'Echo',
    ecosystem: 'go',
    markerFiles: ['go.mod'],
    dependencyPatterns: ['github.com/labstack/echo'],
    importPatterns: ['"github.com/labstack/echo'],
    domains: ['web-backend', 'api'],
    defaultPlatform: 'native',
  },
  {
    id: 'fiber',
    name: 'Fiber',
    ecosystem: 'go',
    markerFiles: ['go.mod'],
    dependencyPatterns: ['github.com/gofiber/fiber'],
    importPatterns: ['"github.com/gofiber/fiber'],
    domains: ['web-backend', 'api'],
    defaultPlatform: 'native',
  },
  {
    id: 'kubernetes',
    name: 'Kubernetes client/operator',
    ecosystem: 'go',
    markerFiles: ['go.mod'],
    dependencyPatterns: ['k8s.io/client-go', 'k8s.io/apimachinery', 'sigs.k8s.io/controller-runtime'],
    importPatterns: ['"k8s.io/', '"sigs.k8s.io/'],
    domains: ['infrastructure', 'cloud-native', 'operators'],
    defaultPlatform: 'native',
  },
  {
    id: 'cobra',
    name: 'Cobra (CLI)',
    ecosystem: 'go',
    markerFiles: ['go.mod'],
    dependencyPatterns: ['github.com/spf13/cobra'],
    importPatterns: ['"github.com/spf13/cobra"'],
    domains: ['cli'],
    defaultPlatform: 'native',
  },
  {
    id: 'gorm',
    name: 'GORM (ORM)',
    ecosystem: 'go',
    markerFiles: ['go.mod'],
    dependencyPatterns: ['gorm.io/gorm'],
    importPatterns: ['"gorm.io/gorm"'],
    domains: ['data', 'orm'],
    defaultPlatform: 'native',
  },

  // ------------------------------------------------------------------
  // Haskell ecosystem
  // ------------------------------------------------------------------
  {
    id: 'yesod',
    name: 'Yesod',
    ecosystem: 'haskell',
    markerFiles: ['stack.yaml', '*.cabal', 'package.yaml'],
    dependencyPatterns: ['yesod', 'yesod-core'],
    importPatterns: ['Yesod', 'import Yesod'],
    domains: ['web-backend', 'fullstack'],
    defaultPlatform: 'native',
  },
  {
    id: 'servant',
    name: 'Servant',
    ecosystem: 'haskell',
    markerFiles: ['stack.yaml', '*.cabal', 'package.yaml'],
    dependencyPatterns: ['servant', 'servant-server'],
    importPatterns: ['Servant', 'import Servant'],
    domains: ['web-backend', 'api'],
    defaultPlatform: 'native',
  },
  {
    id: 'snap-server',
    name: 'Snap',
    ecosystem: 'haskell',
    markerFiles: ['stack.yaml', '*.cabal', 'package.yaml'],
    dependencyPatterns: ['snap-core', 'snap-server'],
    importPatterns: ['Snap'],
    domains: ['web-backend', 'api'],
    defaultPlatform: 'native',
  },
  {
    id: 'aeson',
    name: 'Aeson (JSON)',
    ecosystem: 'haskell',
    markerFiles: ['stack.yaml', '*.cabal', 'package.yaml'],
    dependencyPatterns: ['aeson'],
    importPatterns: ['Data.Aeson'],
    domains: ['data', 'serialization'],
    defaultPlatform: 'native',
  },
  {
    id: 'quickcheck',
    name: 'QuickCheck',
    ecosystem: 'haskell',
    markerFiles: ['stack.yaml', '*.cabal', 'package.yaml'],
    dependencyPatterns: ['QuickCheck'],
    importPatterns: ['Test.QuickCheck'],
    domains: ['testing'],
    defaultPlatform: 'native',
  },
  {
    id: 'lens',
    name: 'Lens',
    ecosystem: 'haskell',
    markerFiles: ['stack.yaml', '*.cabal', 'package.yaml'],
    dependencyPatterns: ['lens'],
    importPatterns: ['Control.Lens'],
    domains: ['utility'],
    defaultPlatform: 'native',
  },
];

// ============================================================================
// Detection
// ============================================================================

export interface FrameworkDetectionResult {
  frameworks: FrameworkSpec[];
  language: string;
  languageConfidence: number;
  domains: string[];
  suggestedPlatform: PlatformTarget;
}

/** Detect frameworks referenced directly in source code imports. */
export function detectFrameworksInSource(
  source: string,
  languageHint?: string
): FrameworkDetectionResult {
  const language = languageHint || detectLanguage(source)[0]?.language || 'unknown';

  const frameworks = FRAMEWORK_CATALOG.filter(
    (fw) =>
      fw.importPatterns.some((pattern) => source.includes(pattern)) ||
      fw.dependencyPatterns.some((pattern) => source.includes(pattern))
  );

  const domains = Array.from(new Set(frameworks.flatMap((fw) => fw.domains)));

  // Framework default platforms take priority; otherwise infer by domain
  let suggestedPlatform: PlatformTarget = 'auto';
  for (const fw of frameworks) {
    suggestedPlatform = fw.defaultPlatform;
    break;
  }

  if (suggestedPlatform === 'auto') {
    // Domain heuristics for platform selection
    if (domains.includes('web-frontend') || domains.includes('spa')) suggestedPlatform = 'browser';
    else if (domains.includes('web-backend') || domains.includes('api')) suggestedPlatform = 'node';
    else if (language === 'java' || language === 'kotlin' || language === 'scala') suggestedPlatform = 'jvm';
    else if (domains.includes('wasm')) suggestedPlatform = 'wasm';
    else suggestedPlatform = 'native';
  }

  return {
    frameworks,
    language,
    languageConfidence: languageHint ? 1 : detectLanguage(source)[0]?.confidence || 0,
    domains,
    suggestedPlatform,
  };
}

/** Get a framework spec by id. */
export function getFramework(id: string): FrameworkSpec | undefined {
  return FRAMEWORK_CATALOG.find((fw) => fw.id === id);
}

/** List all frameworks for an ecosystem. */
export function frameworksForEcosystem(ecosystem: string): FrameworkSpec[] {
  return FRAMEWORK_CATALOG.filter((fw) => fw.ecosystem === ecosystem);
}
