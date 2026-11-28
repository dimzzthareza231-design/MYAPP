import type { D1Database } from '@cloudflare/workers-types';

export type { D1Database };

// One D1 per area: public portal, employee (HR), core clinical data.
export interface Databases {
  core: D1Database;
  hr: D1Database;
  public: D1Database;
}
