import { build } from 'esbuild';
await build({ entryPoints: ['server.ts'], bundle: true, platform: 'node', format: 'cjs', target: 'node22', packages: 'external', outfile: 'dist/server/index.cjs', sourcemap: false });
