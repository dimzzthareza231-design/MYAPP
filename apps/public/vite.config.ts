import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  envDir: fileURLToPath(new URL('../..', import.meta.url)),
  publicDir: false,
  plugins: [react()],
  build: { outDir: '../../dist/public', emptyOutDir: true, sourcemap: false },
  server: { host: '127.0.0.1', port: 5174, strictPort: true },
});
