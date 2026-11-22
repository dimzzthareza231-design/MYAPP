// Rute SPA web publik yang dikenal server. Path lain tetap menerima halaman SPA (yang merender
// NotFoundPage), tetapi dengan status HTTP 404 agar mesin pencari dan klien tahu halaman tidak ada.
// Jaga daftar ini selaras dengan <Routes> di src/PublicApp.tsx.
const EXACT_PUBLIC_ROUTES = new Set([
  '/',
  '/portal',
  '/mobile',
  '/dokter',
  '/artikel',
  '/bpjs',
  '/faq',
  '/hak-pasien',
  '/kebijakan-privasi',
  '/syarat-layanan',
  '/pengaduan'
]);

// Prefiks dengan sub-rute dinamis (mis. /mobile/beranda, /dokter/:id, /artikel/:slug).
const PREFIX_PUBLIC_ROUTES = ['/mobile/', '/dokter/', '/artikel/', '/portal/'];

export function isKnownPublicSpaPath(pathname: string): boolean {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') || '/' : pathname;
  if (EXACT_PUBLIC_ROUTES.has(path)) return true;
  return PREFIX_PUBLIC_ROUTES.some((prefix) => path.startsWith(prefix) && path.length > prefix.length);
}

/** Status HTTP untuk navigasi SPA web publik. */
export function publicSpaStatus(pathname: string): 200 | 404 {
  return isKnownPublicSpaPath(pathname) ? 200 : 404;
}
