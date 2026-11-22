// Dipakai lewat alias wrangler: firebase-admin tidak berjalan di Workers. Cloudflare hanya mendukung AUTH_MODE=local + STORAGE_MODE=d1.
const unsupported = (): never => {
  throw new Error('firebase-admin is not available on Cloudflare Workers; use AUTH_MODE=local and STORAGE_MODE=d1.');
};
export const getApps = (): never[] => [];
export const cert = unsupported;
export const initializeApp = unsupported;
export const getAuth = unsupported;
export const getFirestore = unsupported;
