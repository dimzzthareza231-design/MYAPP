// Node dev/prod server. API routes live in src/server/app.ts; data in local SQLite files shaped like the D1 databases.
import express from 'express';
import http from 'http';
import path from 'path';
import dotenv from 'dotenv';
import { createApp } from './src/server/app';
import { openLocalDatabases } from './src/server/localD1';

dotenv.config();

async function startServer() {
  const app = createApp(openLocalDatabases());
  const httpServer = http.createServer(app);
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
  const distPath = path.join(process.cwd(), 'dist');
  const serveStatic = () => {
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'), (err) => {
        if (err && !res.headersSent) res.status(500).send('Gagal memuat index.html. Silakan build ulang aplikasi.');
      });
    });
  };

  if (process.env.NODE_ENV === 'production') {
    serveStatic();
  } else {
    try {
      const { createServer: createViteServer } = await import('vite');
      const vite = await createViteServer({
        server: {
          middlewareMode: true,
          hmr: { server: httpServer },
          watch: process.env.DISABLE_HMR === 'true' ? null : {},
        },
        appType: 'spa',
      });
      app.use(vite.middlewares);
    } catch (err) {
      console.error('Vite dev server failed to start, falling back to static:', err);
      serveStatic();
    }
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log('Server running on port ' + PORT);
  });
}

startServer().catch(console.error);
