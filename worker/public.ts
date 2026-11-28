/// <reference types="@cloudflare/workers-types" />
// Web publik: hanya assets. /api/* diteruskan ke Worker inti lewat service binding, jadi Worker ini tidak memegang database apa pun.
interface Env {
  CORE: Fetcher;
}

export default {
  fetch: (request, env) => env.CORE.fetch(request),
} satisfies ExportedHandler<Env>;
