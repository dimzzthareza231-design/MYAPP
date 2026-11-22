import React from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, CalendarCheck } from 'lucide-react';
import { HEALTH_ARTICLES } from '../../../data/hospitalPublicCatalog';
import { PublicPageLayout } from '../PublicPageLayout';
import { useDocumentMeta } from '../useDocumentMeta';
import { articleSlug, slugify } from '../publicDirectory';
import { SECTION_IDS } from '../portalShared';

export default function ArticleDetailPage() {
  const { slug = '' } = useParams();
  const article = HEALTH_ARTICLES.find((a) => articleSlug(a) === slugify(slug));
  useDocumentMeta(
    article ? article.title : 'Artikel tidak ditemukan',
    article ? article.summary : 'Artikel kesehatan.',
    { noindex: !article }
  );

  if (!article) {
    return (
      <PublicPageLayout title="Artikel tidak ditemukan" breadcrumbs={[{ label: 'Artikel', to: '/artikel' }, { label: 'Tidak ditemukan' }]}>
        <p className="text-sm text-slate-700 mb-4">Artikel ini tidak tersedia atau sudah dihapus.</p>
        <Link to="/artikel" className="inline-flex items-center gap-2 text-sm font-bold text-brand underline rounded min-h-[44px]">
          <ArrowLeft className="w-4 h-4" aria-hidden="true" /> Kembali ke daftar artikel
        </Link>
      </PublicPageLayout>
    );
  }

  const others = HEALTH_ARTICLES.filter((a) => a.id !== article.id).slice(0, 3);

  return (
    <PublicPageLayout
      eyebrow={[article.category, article.readMinutes ? `${article.readMinutes} menit baca` : ''].filter(Boolean).join(' · ')}
      title={article.title}
      intro={article.summary}
      breadcrumbs={[{ label: 'Artikel', to: '/artikel' }, { label: article.title }]}
    >
      <article className="space-y-6">
        {(article.author || article.date || article.reviewedBy) && (
          <p className="text-sm text-slate-600">
            {[article.author && `Penulis: ${article.author}`, article.reviewedBy && `Ditinjau: ${article.reviewedBy}`, article.date]
              .filter(Boolean)
              .join(' · ')}
          </p>
        )}
        <div className="space-y-4 text-base text-slate-800 leading-relaxed">
          {article.body.map((para, i) => (
            <p key={i}>{para}</p>
          ))}
        </div>
        <p className="text-xs text-slate-600 border-t border-slate-200 pt-4">
          Artikel ini bersifat edukasi dan bukan pengganti diagnosis atau saran medis langsung dari dokter.
          Dalam keadaan darurat, segera hubungi 119 atau datang ke IGD terdekat.
        </p>
        <Link
          to={`/#${SECTION_IDS.workspace}`}
          className="inline-flex items-center gap-2 rounded-xl bg-brand hover:bg-brand-hover text-white text-sm font-bold px-4 min-h-[44px]"
        >
          <CalendarCheck className="w-4 h-4" aria-hidden="true" /> Buat Janji Dokter
        </Link>
      </article>

      {others.length > 0 && (
        <aside aria-labelledby="artikel-lain" className="mt-12 space-y-3">
          <h2 id="artikel-lain" className="text-lg font-extrabold text-slate-900">
            Artikel lainnya
          </h2>
          <ul className="space-y-2">
            {others.map((a) => (
              <li key={a.id}>
                <Link to={`/artikel/${articleSlug(a)}`} className="text-sm font-semibold text-brand underline-offset-2 hover:underline rounded">
                  {a.title}
                </Link>
              </li>
            ))}
          </ul>
        </aside>
      )}
    </PublicPageLayout>
  );
}
