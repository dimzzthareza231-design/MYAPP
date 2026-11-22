import { useEffect } from 'react';
import { HOSPITAL_PROFILE, PUBLIC_SITE_URL } from '../../data/hospitalPublicCatalog';

function upsertMeta(attr: 'name' | 'property', key: string, content: string): () => void {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  const created = !el;
  const previous = el?.getAttribute('content') ?? null;
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
  return () => {
    if (created) el?.remove();
    else if (previous !== null) el?.setAttribute('content', previous);
  };
}

/**
 * Set document.title, meta description, og:title/og:description, dan link kanonis per halaman.
 * Nilai sebelumnya dikembalikan saat halaman ditinggalkan.
 */
export function useDocumentMeta(title: string, description: string, options: { noindex?: boolean } = {}): void {
  const { noindex = false } = options;
  useEffect(() => {
    const fullTitle = title.includes(HOSPITAL_PROFILE.name) ? title : `${title} · ${HOSPITAL_PROFILE.name}`;
    const prevTitle = document.title;
    document.title = fullTitle;
    const restores = [
      upsertMeta('name', 'description', description),
      upsertMeta('property', 'og:title', fullTitle),
      upsertMeta('property', 'og:description', description)
    ];
    if (noindex) restores.push(upsertMeta('name', 'robots', 'noindex'));

    const canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    const prevCanonical = canonical?.getAttribute('href') ?? null;
    const url = `${PUBLIC_SITE_URL}${window.location.pathname === '/' ? '/' : window.location.pathname}`;
    canonical?.setAttribute('href', url);
    const restoreOgUrl = upsertMeta('property', 'og:url', url);

    return () => {
      document.title = prevTitle;
      restores.forEach((r) => r());
      restoreOgUrl();
      if (canonical && prevCanonical !== null) canonical.setAttribute('href', prevCanonical);
    };
  }, [title, description, noindex]);
}
