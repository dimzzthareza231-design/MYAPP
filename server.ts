import express from 'express';
import path from 'node:path';
import { existsSync } from 'node:fs';
import dotenv from 'dotenv';
import { createApp } from './src/server/app';
dotenv.config();

async function start() {
  const port = Number(process.env.PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT tidak valid.');
  const app = createApp();
  if (process.env.NODE_ENV === 'production') {
    const main = path.resolve('dist/main');
    if (!existsSync(path.join(main, 'index.html'))) throw new Error('Build aplikasi utama belum tersedia.');
    // Never expose dist/server, server bundles/maps, or the repository root.
    app.use(express.static(main, { dotfiles: 'deny', index: false, maxAge: '1h' }));
    app.get('*', (req, res) => {
      if (path.extname(req.path) || req.path.startsWith('/api')) return res.status(404).end();
      res.setHeader('Cache-Control', 'no-store');
      return res.sendFile(path.join(main, 'index.html'));
    });
  } else {
    // Vite is only loaded in development, never required by the runtime image.
    const { createServer } = await import('vite');
    const vite = await createServer({ configFile: 'apps/main/vite.config.ts', server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
  }
  const server = app.listen(port, '0.0.0.0', () => console.log(`MYITARU main listening on ${port}`));
  for (const signal of ['SIGTERM', 'SIGINT'] as const) process.once(signal, () => server.close(() => process.exit(0)));
}
start().catch(() => { console.error('Server gagal dimulai. Periksa build dan konfigurasi runtime.'); process.exitCode = 1; });
