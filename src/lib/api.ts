import { auth } from './firebase';
let installed = false;
// Existing modules can keep using fetch('/api/...'). Tokens never leave the
// main application's own origin, and no patient or employee session is forged.
export function installAuthenticatedFetch() {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  const original = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input), window.location.origin);
    if (url.origin !== window.location.origin || !url.pathname.startsWith('/api/')) return original(input, init);
    const headers = new Headers(input instanceof Request ? input.headers : undefined);
    new Headers(init?.headers).forEach((value, key) => headers.set(key, value));
    const user = auth?.currentUser;
    if (user) headers.set('Authorization', `Bearer ${await user.getIdToken()}`);
    else headers.delete('Authorization');
    return original(input, { ...init, headers, cache: 'no-store' });
  };
}
