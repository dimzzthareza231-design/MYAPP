import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';
const repository = fileURLToPath(new URL('../..', import.meta.url));
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  envDir: repository,
  publicDir: fileURLToPath(new URL('../../public', import.meta.url)),
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': repository } },
  build: { outDir: '../../dist/main', emptyOutDir: true, sourcemap: false },
  server: { fs: { allow: [repository] } },
});
