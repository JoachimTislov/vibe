import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { fileURLToPath } from 'node:url';

// allow importing the TypeScript chess engine from ../chess during dev
const enginesRoot = fileURLToPath(new URL('..', import.meta.url));

export default defineConfig({
  plugins: [svelte()],
  server: {
    fs: { allow: [enginesRoot] },
  },
  build: {
    target: 'es2022',
  },
});
