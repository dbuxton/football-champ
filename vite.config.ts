import { defineConfig } from 'vitest/config';
import type { Connect, Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

// The game is served from https://<user>.github.io/football-champ/ when deployed to
// GitHub Pages, but from / during local development.
const base = process.env.GITHUB_ACTIONS ? '/football-champ/' : '/';

/** Absolute path to one of the site's pages. */
const page = (path: string) => fileURLToPath(new URL(path, import.meta.url));

/**
 * Two games share this build: Superstar (you are the footballer) at the root, and the original
 * management game under /manager/. Vite's dev and preview servers only find a nested index.html
 * when the address ends in a slash; without one they quietly serve the root page instead. Redirect
 * to the slashed address. (GitHub Pages already does this for real visitors.)
 */
function trailingSlash(paths: string[]): Plugin {
  const redirect: Connect.NextHandleFunction = (req, res, next) => {
    const [path, query] = (req.url ?? '').split('?');
    if (!paths.includes(path)) return next();
    res.statusCode = 301;
    res.setHeader('Location', `${path}/${query ? `?${query}` : ''}`);
    res.end();
  };
  return {
    name: 'trailing-slash',
    configureServer: (server) => {
      server.middlewares.use(redirect);
    },
    configurePreviewServer: (server) => {
      server.middlewares.use(redirect);
    },
  };
}

export default defineConfig({
  base,
  plugins: [react(), trailingSlash([`${base}manager`])],
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      input: {
        index: page('./index.html'),
        manager: page('./manager/index.html'),
      },
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    testTimeout: 120_000,
  },
});
