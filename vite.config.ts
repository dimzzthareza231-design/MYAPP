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
      rollupOptions: {
        input: path.resolve(__dirname, isPublic ? 'public.html' : 'index.html'),
        // Web publik: seedData (mis. initSeedData() yang menulis data master ke localStorage) hanya boleh
        // ikut bila export-nya benar-benar dipakai (aplikasi pasien), bukan karena di-import tidak langsung
        // oleh katalog publik di halaman landing.
        ...(isPublic && {
          treeshake: {
            moduleSideEffects: (id: string) => !/[\\/]src[\\/]data[\\/]seedData\.ts$/.test(id),
          },
        }),
      },
    },
    plugins: [
      react(),
      tailwindcss(),
      // PWA hanya untuk aplikasi pasien.
      isPublic && VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.ico', 'logo-myitaru.png', 'icon.svg', 'apple-touch-icon.png', 'pwa-192x192.png', 'pwa-512x512.png', 'pwa-maskable-512x512.png', 'robots.txt', 'sitemap.xml'],
        manifest: {
          id: '/',
          name: 'MYITARU · Aplikasi Pasien',
          short_name: 'MYITARU',
          description: 'Aplikasi pasien MYITARU untuk melihat jadwal dokter, memantau nomor antrean, dan melihat hasil pemeriksaan.',
          lang: 'id',
          dir: 'ltr',
          categories: ['medical', 'health'],
          theme_color: '#0B3D91',
          background_color: '#ffffff',
          display: 'standalone',
          orientation: 'portrait-primary',
          start_url: '/mobile',
          scope: '/',
          shortcuts: [
            {
              name: 'Jadwal Dokter',
              short_name: 'Jadwal',
              description: 'Lihat jadwal dokter dan buat janji temu',
              url: '/mobile/jadwal',
              icons: [{ src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' }],
            },
            {
              name: 'Antrean Saya',
              short_name: 'Antrean',
              description: 'Pantau nomor antrean kunjungan Anda',
              url: '/mobile/beranda',
              icons: [{ src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' }],
            },
            {
              name: 'Hasil Pemeriksaan',
              short_name: 'Hasil',
              description: 'Lihat hasil laboratorium, resume medis, dan obat',
              url: '/mobile/hasil/lab',
              icons: [{ src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' }],
            },
          ],
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
          navigateFallbackDenylist: [/^\/api\//, /^\/(robots\.txt|sitemap\.xml)$/],
          maximumFileSizeToCacheInBytes: 12 * 1024 * 1024,
          globPatterns: ['**/*.{js,css,html,ico,png,jpg,webp,svg,woff,woff2}'],
          // Jangan precache gambar sosial (hanya untuk crawler).
          globIgnores: ['**/og-image.jpg'],
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
