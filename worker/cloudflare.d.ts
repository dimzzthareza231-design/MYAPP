// Minimal declarations for the Workers runtime modules used by worker/index.ts.
// shortcut: avoids loading @cloudflare/workers-types globally (clashes with DOM lib); switch to `wrangler types` if the Worker grows.
declare module 'cloudflare:workers' {
  export const env: Record<string, unknown>;
}
declare module 'cloudflare:node' {
  export function handleAsNodeRequest(port: number, request: Request): Promise<Response>;
}
