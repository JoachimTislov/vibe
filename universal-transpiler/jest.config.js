/** Jest configuration for the universal transpiler test suite. */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: {
        // Test files are excluded from the main tsconfig; give ts-jest its own
        // settings so `import type` and strict mode behave identically.
        target: 'ES2022',
        module: 'CommonJS',
        moduleResolution: 'node',
        esModuleInterop: true,
        strict: true,
        skipLibCheck: true,
        noUnusedLocals: false,
        noUnusedParameters: false,
      },
    }],
  },
  testMatch: ['**/tests/**/*.test.ts'],
  // Native toolchain wrappers spawn real compilers (go, javac, node...);
  // these tests are integration tests by design.
  testTimeout: 120000,
};
