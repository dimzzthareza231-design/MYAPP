// Dipakai lewat alias wrangler: Vite dev server hanya untuk `npm run dev`, tidak pernah di Worker.
export const createServer = (): never => {
  throw new Error('Vite dev server is not available on Cloudflare Workers.');
};
