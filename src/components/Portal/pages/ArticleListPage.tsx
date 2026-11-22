import React, { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { FileText } from 'lucide-react';
import { HEALTH_ARTICLES } from '../../../data/hospitalPublicCatalog';
import { PublicPageLayout } from '../PublicPageLayout';
import { useDocumentMeta } from '../useDocumentMeta';
import { articleSlug } from '../publicDirectory';

export default function ArticleListPage() {
  useDocumentMeta('Artikel Kesehatan', 'Artikel edukasi kesehatan yang ditinjau tenaga medis untuk pasien dan keluarga.');
  const [params, setParams] = useSearchParams();
  const category = params.get('kategori') || '';
  const categories = useMemo(
    () => Array.from(new Set(HEALTH_ARTICLES.map((a) => a.category).filter(Boolean))),
    []
  );
  const list = category ? HEALTH_ARTICLES.filter((a) => a.category === category) : HEALTH_ARTICLES;

  return (
    <PublicPageLayout
      width="wide"
      eyebrow="EDUKASI PASIEN"
      title="Artikel Kesehatan"
      intro="Informasi kesehatan untuk pasien dan keluarga. Artikel bukan pengganti konsultasi dengan dokter."
      breadcrumbs={[{ label: 'Artikel' }]}
    >
      {HEALTH_ARTICLES.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-10 text-center space-y-2">
          <FileText className="w-10 h-10 text-slate-400 mx-auto" aria-hidden="true" />
          <p className="font-bold text-slate-800">Belum ada artikel yang dipublikasikan.</p>
          <p className="text-sm text-slate-600">Artikel edukasi akan tampil di sini setelah ditinjau tenaga medis.</p>
        </div>
      ) : (
        <>
          {categories.length > 1 && (
            <div role="group" aria-label="Filter kategori artikel" className="flex flex-wrap gap-2 mb-6">
              {['', ...categories].map((c) => (
                <button
                  key={c || 'all'}
                  type="button"
                  aria-pressed={category === c}
                  onClick={() => {
                    const next = new URLSearchParams(params);
                    if (c) next.set('kategori', c);
                    else next.delete('kategori');
                    setParams(next, { replace: true, preventScrollReset: true });
                  }}
                  className={`px-3.5 rounded-xl text-sm font-semibold min-h-[44px] cursor-pointer ${
                    category === c ? 'bg-brand text-white' : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {c || 'Semua'}
                </button>
              ))}
            </div>
          )}
          <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {list.map((a) => (
              <li key={a.id}>
                <article className="h-full rounded-2xl border border-slate-200 bg-white p-5 flex flex-col gap-2">
                  <p className="text-xs font-bold text-brand">
                    {[a.category, a.readMinutes ? `${a.readMinutes} menit baca` : ''].filter(Boolean).join(' · ')}
                  </p>
                  <h2 className="font-bold text-slate-900 leading-snug">
                    <Link to={`/artikel/${articleSlug(a)}`} className="hover:text-brand underline-offset-2 hover:underline rounded">
                      {a.title}
                    </Link>
                  </h2>
                  <p className="text-sm text-slate-600 leading-relaxed flex-1">{a.summary}</p>
                  {(a.author || a.date) && (
                    <p className="text-xs text-slate-600">{[a.author, a.date].filter(Boolean).join(' · ')}</p>
                  )}
                </article>
              </li>
            ))}
          </ul>
        </>
      )}
    </PublicPageLayout>
  );
}
