import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// The game is served from https://<user>.github.io/football-champ/ when deployed to
// GitHub Pages, but from / during local development.
const base = process.env.GITHUB_ACTIONS ? '/football-champ/' : '/';

export default defineConfig({
  base,
  plugins: [react()],
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 2000,
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    testTimeout: 120_000,
  },
});
