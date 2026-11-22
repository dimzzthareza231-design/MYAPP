import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, FileText } from 'lucide-react';
import { SectionHeading } from './SectionHeading';
import { SECTION_IDS } from '../portalShared';
import { articleSlug } from '../publicDirectory';
import type { HealthArticle, PatientStory } from '../../../data/hospitalPublicCatalog';
import consultImg from '../../../assets/images/myitaru_poli_consult.webp';

interface ArticlesSectionProps {
  articles: HealthArticle[];
  stories: PatientStory[];
}

const LANDING_ARTICLE_LIMIT = 4;

/** Artikel edukasi & kisah pasien (berizin). Tidak dirender bila keduanya kosong. */
export const ArticlesSection: React.FC<ArticlesSectionProps> = ({ articles, stories }) => {
  if (articles.length === 0 && stories.length === 0) return null;

  const [featured, ...rest] = articles.slice(0, LANDING_ARTICLE_LIMIT);

  return (
    <section
      id={SECTION_IDS.articles}
      aria-label="Edukasi kesehatan"
      className="py-16 sm:py-20 bg-white border-b border-slate-200 overflow-hidden scroll-mt-20"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
          {featured && (
            <div className={`${stories.length > 0 ? 'lg:col-span-7' : 'lg:col-span-12'} space-y-6`}>
              <SectionHeading eyebrow="EDUKASI & PANDUAN PASIEN" title="Informasi Kesehatan" />

              <article className="grid grid-cols-1 sm:grid-cols-12 gap-6 items-center rounded-2xl border border-slate-200 p-4 bg-slate-50">
                <div className="sm:col-span-5 aspect-[4/3] rounded-xl overflow-hidden">
                  <img
                    src={consultImg}
                    alt=""
                    width={1376}
                    height={768}
                    loading="lazy"
                    decoding="async"
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="sm:col-span-7 space-y-2">
                  <p className="text-xs font-bold text-brand">
                    {featured.category} · {featured.readMinutes} Menit Baca
                  </p>
                  <h3 className="text-lg font-bold text-slate-900 leading-snug">{featured.title}</h3>
                  <p className="text-sm text-slate-600">{featured.summary}</p>
                  <Link
                    to={`/artikel/${articleSlug(featured)}`}
                    className="inline-flex items-center gap-1.5 text-sm font-bold text-brand pt-1 rounded"
                  >
                    <span>Baca Selengkapnya</span>
                    <span className="sr-only">: {featured.title}</span>
                    <ArrowRight className="w-4 h-4" aria-hidden="true" />
                  </Link>
                </div>
              </article>

              {rest.length > 0 && (
                <ul className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {rest.map((article) => (
                    <li
                      key={article.id}
                      className="rounded-2xl border border-slate-200 p-5 bg-white flex flex-col justify-between"
                    >
                      <div>
                        <p className="text-xs font-semibold text-brand">
                          {article.category} · {article.readMinutes} Mnt
                        </p>
                        <h3 className="font-bold text-sm text-slate-900 mt-1.5 leading-snug">{article.title}</h3>
                        <p className="text-sm text-slate-600 mt-2 leading-relaxed">{article.summary}</p>
                      </div>
                      <Link
                        to={`/artikel/${articleSlug(article)}`}
                        className="mt-4 inline-flex items-center gap-1 text-xs font-bold text-brand rounded"
                      >
                        <FileText className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Baca Artikel</span>
                        <span className="sr-only">: {article.title}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              <Link
                to="/artikel"
                className="inline-flex items-center gap-1.5 text-sm font-bold text-brand rounded"
              >
                <span>Lihat semua artikel</span>
                <ArrowRight className="w-4 h-4" aria-hidden="true" />
              </Link>
            </div>
          )}

          {stories.length > 0 && (
            <div className={`${featured ? 'lg:col-span-5' : 'lg:col-span-12'} space-y-5`}>
              <SectionHeading eyebrow="PENGALAMAN PASIEN" title="Kisah Pasien" />
              <ul className="space-y-4">
                {stories.map((story) => (
                  <li key={story.id}>
                    <figure className="rounded-2xl border border-slate-200 bg-slate-50 p-5 space-y-2.5">
                      <figcaption className="text-xs font-bold text-brand">
                        {story.unit} · {story.patientInitials}
                      </figcaption>
                      <blockquote className="text-sm text-slate-700 leading-relaxed">“{story.quote}”</blockquote>
                      {story.outcome && <p className="text-xs font-semibold text-emerald-700">{story.outcome}</p>}
                    </figure>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

    </section>
  );
};
