import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export type AppTarget = 'core' | 'public';

// Dua aplikasi dari satu codebase: 'public' (portal pasien, public.html) dan 'core' (SIMK/RME, index.html).
export function makeConfig(target: AppTarget) {
  const isPublic = target === 'public';
  return defineConfig({
    define: {
      'import.meta.env.VITE_APP_TARGET': JSON.stringify(target),
    },
    // Dua server Vite dev berjalan bersamaan; cache terpisah agar optimasi dependensi tidak saling membatalkan (504 Outdated Optimize Dep).
    cacheDir: isPublic ? 'node_modules/.vite-public' : 'node_modules/.vite',
    build: {
      outDir: isPublic ? 'dist/public' : 'dist/core',
      emptyOutDir: true,
      rollupOptions: { input: path.resolve(__dirname, isPublic ? 'public.html' : 'index.html') },
    },
    plugins: [
      react(),
      tailwindcss(),
      // PWA hanya untuk aplikasi pasien.
      isPublic && VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.ico', 'logo-myitaru.png', 'icon.svg', 'apple-touch-icon.png', 'pwa-192x192.png', 'pwa-512x512.png', 'pwa-maskable-512x512.png'],
        manifest: {
          id: '/',
          name: 'MYITARU SIMK · App Pasien',
          short_name: 'MYITARU',
          description: 'Portal resmi layanan kesehatan MYITARU SIMK dan aplikasi mobile pasien untuk cek antrean, jadwal dokter, hasil lab, dan rekam medis.',
          theme_color: '#0B3D91',
          background_color: '#ffffff',
          display: 'standalone',
          orientation: 'portrait-primary',
          start_url: '/mobile',
          scope: '/',
          icons: [
            {
              src: '/pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-maskable-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          navigateFallback: 'public.html',
          navigateFallbackDenylist: [/^\/api\//],
          maximumFileSizeToCacheInBytes: 12 * 1024 * 1024,
          globPatterns: ['**/*.{js,css,html,ico,png,jpg,svg,woff,woff2}'],
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'gstatic-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              urlPattern: /\/api\/public\/.*/i,
              handler: 'NetworkFirst',
              options: {
                cacheName: 'myitaru-public-api-cache',
                expiration: {
                  maxEntries: 20,
                  maxAgeSeconds: 60 * 60 * 24,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
          ],
        },
        devOptions: {
          enabled: true,
          type: 'module',
        },
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  });
}

export default makeConfig('core');
