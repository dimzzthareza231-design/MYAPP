/// <reference types="@cloudflare/workers-types" />
// Bindings declared in wrangler.jsonc (top level = core worker).
declare namespace Cloudflare {
  interface Env {
    DB_CORE: D1Database;
    DB_HR: D1Database;
    DB_PUBLIC: D1Database;
  }
}

declare module 'cloudflare:node' {
  export function httpServerHandler(options: { port: number }): ExportedHandler;
}
