import { readFile } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { defineConfig } from 'vite';
import type { Plugin } from 'vite';
import vue from '@vitejs/plugin-vue';

const root = fileURLToPath(new URL('.', import.meta.url));
const repository = resolve(root, '../../..');
const cacheDir = existsSync(resolve(repository, '.git'))
  ? resolve(repository, 'temp/uml-studio-vite')
  : resolve(tmpdir(), 'uml-studio', createHash('sha256').update(root.replace(/[\\/]$/, '')).digest('hex').slice(0, 12), 'vite');
function standaloneAssets(): Plugin {
  const install = (server: { middlewares: { use: (handler: (request: IncomingMessage, response: ServerResponse, next: () => void) => void) => unknown } }) => {
    server.middlewares.use((request, response, next) => {
      const path = request.url?.split('?')[0];
      if (path !== '/assets/viewer.js' && path !== '/assets/viewer.css') { next(); return; }
      const name = path.endsWith('.js') ? 'viewer.js' : 'viewer.css';
      void readFile(new URL(`./assets/${name}`, import.meta.url)).then(content => {
        response.setHeader('Content-Type', name.endsWith('.js') ? 'text/javascript; charset=utf-8' : 'text/css; charset=utf-8');
        response.setHeader('Cache-Control', 'no-cache');
        response.end(content);
      }).catch(() => {
        response.statusCode = 404;
        response.setHeader('Content-Type', 'text/plain; charset=utf-8');
        response.end('Standalone runtime not found. Run npm run build first.');
      });
    });
  };
  return { name: 'uml-studio-standalone-assets', configureServer: install, configurePreviewServer: install };
}

export default defineConfig({
  root: fileURLToPath(new URL('./demo', import.meta.url)),
  base: './',
  cacheDir,
  publicDir: false,
  plugins: [vue(), standaloneAssets()],
  resolve: { alias: { '/studio-entry': fileURLToPath(new URL('./src/viewer.ts', import.meta.url)) } },
  server: { host: '127.0.0.1', fs: { allow: [root] } },
  preview: { host: '127.0.0.1' },
  build: { outDir: fileURLToPath(new URL('./demo-dist', import.meta.url)), emptyOutDir: true, target: 'es2022' },
});
