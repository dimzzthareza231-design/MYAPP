import React from 'react';
import { ArrowRight, CheckCircle2, HeartPulse } from 'lucide-react';
import { motion } from 'motion/react';
import { SectionHeading } from './SectionHeading';
import { EASE_OUT_EXPO, SECTION_IDS, VIEWPORT_CONFIG } from '../portalShared';
import type { CenterOfExcellence } from '../../../data/hospitalPublicCatalog';
import excellenceImg from '../../../assets/images/myitaru_center_of_excellence.webp';

interface CentersSectionProps {
  centers: CenterOfExcellence[];
  onBook: (poliKode: string, note: string) => void;
}

/** Pusat layanan unggulan. Tidak dirender bila daftar kosong. */
export const CentersSection: React.FC<CentersSectionProps> = ({ centers, onBook }) => {
  if (centers.length === 0) return null;

  return (
    <section
      id={SECTION_IDS.centers}
      aria-labelledby="centers-title"
      className="py-16 sm:py-20 bg-slate-50 border-b border-slate-200 overflow-hidden scroll-mt-20"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center mb-14">
          <SectionHeading
            id="centers-title"
            className="lg:col-span-6"
            eyebrow="PUSAT LAYANAN UNGGULAN"
            title="Pusat Unggulan Spesialis"
            description="Program layanan terpadu yang melibatkan tim multidisiplin."
          />
          <div className="lg:col-span-6">
            <div className="rounded-2xl overflow-hidden border border-slate-200 shadow-md bg-white aspect-[16/9]">
              <img
                src={excellenceImg}
                alt="Ruang layanan diagnostik MYITARU"
                width={1376}
                height={768}
                loading="lazy"
                decoding="async"
                className="w-full h-full object-cover"
              />
            </div>
          </div>
        </div>

        <ul className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          {centers.map((center, idx) => (
            <motion.li
              key={center.id}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={VIEWPORT_CONFIG}
              transition={{ duration: 0.45, delay: Math.min(idx * 0.05, 0.25), ease: EASE_OUT_EXPO }}
              className="group bg-white rounded-2xl border border-slate-200 hover:border-brand/40 p-5 flex flex-col justify-between transition shadow-xs hover:shadow-md"
            >
              <div>
                <div className="flex items-center justify-between gap-2 text-xs font-semibold text-brand mb-2">
                  <span>{center.highlightMetric}</span>
                  <HeartPulse className="w-4 h-4 text-brand shrink-0" aria-hidden="true" />
                </div>
                <h3 className="text-base font-extrabold text-slate-900">{center.title}</h3>
                <p className="text-xs font-medium text-slate-600 mt-0.5">{center.subtitle}</p>
                <p className="text-sm text-slate-600 mt-3 leading-relaxed">{center.description}</p>
                {center.services.length > 0 && (
                  <ul className="mt-4 space-y-1.5 border-t border-slate-100 pt-3">
                    {center.services.map((srv) => (
                      <li key={srv} className="text-xs text-slate-700 flex items-start gap-2">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" aria-hidden="true" />
                        <span>{srv}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {center.poliKode && (
                <div className="mt-5 pt-4 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => onBook(center.poliKode, `Konsultasi ${center.title}`)}
                    className="text-xs font-bold text-brand hover:text-brand-hover inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <span>Daftar Layanan Ini</span>
                    <span className="sr-only">: {center.title}</span>
                    <ArrowRight
                      className="w-3.5 h-3.5 transition-transform duration-300 group-hover:translate-x-1"
                      aria-hidden="true"
                    />
                  </button>
                </div>
              )}
            </motion.li>
          ))}
        </ul>
      </div>
    </section>
  );
};
