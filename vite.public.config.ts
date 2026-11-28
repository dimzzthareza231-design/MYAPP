// Build web publik: entry sama (index.html -> src/main.tsx), hanya flag VITE_APP_TARGET=public dan outDir dist/public.
process.env.VITE_APP_TARGET = 'public';
export { default } from './vite.config';
