import { defineConfig, loadEnv, type Plugin } from 'vite';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { validateFrontendEnvironment } from './scripts/environment-policy.mjs';

// Serve the same PDF decoder resources locally in development and production.
function pdfResources(): Plugin {
  const resources = new Map<string, Buffer>();
  resources.set('pdfjs/LICENSE', readFileSync(new URL('./node_modules/pdfjs-dist/LICENSE', import.meta.url)));
  for (const directory of ['cmaps', 'standard_fonts', 'wasm', 'iccs']) {
    const root = new URL('./node_modules/pdfjs-dist/' + directory + '/', import.meta.url);
    for (const name of readdirSync(fileURLToPath(root))) {
      if (/\.(bcmap|pfb|ttf|wasm|icc)$/.test(name)) resources.set('pdfjs/' + directory + '/' + name, readFileSync(new URL(name, root)));
      if (name.startsWith('LICENSE') || name.endsWith('.js')) resources.set('pdfjs/' + directory + '/' + name, readFileSync(new URL(name, root)));
    }
  }
  return {
    name: 'local-pdf-resources',
    configureServer(server: import('vite').ViteDevServer) {
      server.middlewares.use((request, response, next) => {
        const path = request.url?.split('?')[0]?.replace(/^\//, '') ?? '';
        const data = resources.get(path);
        if (!data) return next();
        response.setHeader('Content-Type', path.endsWith('.wasm') ? 'application/wasm' : path.endsWith('.js') ? 'text/javascript' : 'application/octet-stream');
        response.end(data);
      });
    },
    generateBundle() {
      for (const [fileName, source] of resources) this.emitFile({ type: 'asset', fileName, source });
    }
  };
}
export default defineConfig(({ mode, command }) => {
  const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env };
  const target = validateFrontendEnvironment(env, mode, command);
  return {
    plugins: [pdfResources()],
    server: { host: '127.0.0.1', port: Number(env.DEV_SERVER_PORT) || 5173, strictPort: true, proxy: { '/api': { target, changeOrigin: true, secure: true } } },
    preview: { port: 4173, strictPort: true },
    build: { target: 'es2022', sourcemap: false },
    define: { __DEMO_BUILD__: JSON.stringify(mode === 'demo' && env.VITE_DEMO_BUILD === 'true') }
  };
});
