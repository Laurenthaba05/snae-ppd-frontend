import { defineConfig, loadEnv } from 'vite';
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  if (env.VITE_DATA_MODE === 'demo' && mode !== 'demo') throw new Error('La demonstration exige --mode demo.');
  const target = env.DEV_BACKEND_TARGET || 'http://127.0.0.1:8080';
  const parsed = new URL(target);
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error('DEV_BACKEND_TARGET invalide.');
  return {
    server: { port: 5173, strictPort: true, proxy: { '/api': { target, changeOrigin: true, secure: true } } },
    preview: { port: 4173, strictPort: true },
    build: { target: 'es2022', sourcemap: false },
    define: { __DEMO_BUILD__: JSON.stringify(mode === 'demo' && env.VITE_DEMO_BUILD === 'true') }
  };
});
