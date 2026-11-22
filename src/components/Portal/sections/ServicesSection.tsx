import React, { useMemo, useState } from 'react';
import { Activity, ArrowRight, CheckCircle2 } from 'lucide-react';
import { motion } from 'motion/react';
import { SectionHeading } from './SectionHeading';
import { EASE_OUT_EXPO, SECTION_IDS, VIEWPORT_CONFIG } from '../portalShared';
import type { HospitalServiceItem } from '../../../data/hospitalPublicCatalog';

interface ServicesSectionProps {
  services: HospitalServiceItem[];
  onBook: (poliKode: string, note: string) => void;
}

type CategoryFilter = 'Semua' | HospitalServiceItem['category'];

/** Direktori unit layanan. Tidak dirender bila daftar layanan kosong. */
export const ServicesSection: React.FC<ServicesSectionProps> = ({ services, onBook }) => {
  const [filter, setFilter] = useState<CategoryFilter>('Semua');

  const categories = useMemo<CategoryFilter[]>(
    () => ['Semua', ...Array.from(new Set(services.map((s) => s.category)))],
    [services]
  );
  const filtered = useMemo(
    () => (filter === 'Semua' ? services : services.filter((s) => s.category === filter)),
    [services, filter]
  );

  if (services.length === 0) return null;

  return (
    <section
      id={SECTION_IDS.services}
      aria-labelledby="services-title"
      className="py-16 sm:py-20 bg-white border-b border-slate-200 scroll-mt-20"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-10">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
          <SectionHeading
            id="services-title"
            className="max-w-2xl"
            eyebrow="DIREKTORI LAYANAN KESEHATAN"
            title="Unit Pelayanan Medis & Penunjang"
            description="Daftar unit layanan yang tersedia beserta jam operasionalnya."
          />

          {categories.length > 2 && (
            <div className="flex flex-wrap gap-2" role="group" aria-label="Filter kategori layanan">
              {categories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setFilter(cat)}
                  aria-pressed={filter === cat}
                  className={`px-4 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer whitespace-nowrap shrink-0 ${
                    filter === cat ? 'bg-brand text-white shadow-xs' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                  }`}
                >
                  {cat === 'Semua' ? `Semua Layanan (${services.length})` : cat}
                </button>
              ))}
            </div>
          )}
        </div>

        <ul className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map((srv, idx) => (
            <motion.li
              key={srv.id}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={VIEWPORT_CONFIG}
              transition={{ duration: 0.4, delay: Math.min(idx * 0.04, 0.2), ease: EASE_OUT_EXPO }}
              className="group rounded-2xl border border-slate-200 bg-slate-50/60 hover:bg-white hover:border-brand/40 hover:shadow-md p-6 flex flex-col justify-between transition"
            >
              <div>
                <div className="flex items-center justify-between gap-2 text-xs text-brand font-semibold">
                  <span>{srv.category}</span>
                  <Activity className="w-4 h-4 text-brand" aria-hidden="true" />
                </div>
                <h3 className="text-base font-extrabold text-slate-900 mt-2">{srv.title}</h3>
                {srv.availability && <p className="text-xs text-slate-600 mt-1">{srv.availability}</p>}
                <p className="text-sm text-slate-600 mt-3 leading-relaxed">{srv.summary}</p>

                {srv.highlights.length > 0 && (
                  <ul className="mt-4 pt-3 border-t border-slate-200/80 space-y-1.5">
                    {srv.highlights.map((item) => (
                      <li key={item} className="text-xs text-slate-700 flex items-center gap-2">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" aria-hidden="true" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {srv.poliKode && (
                <div className="mt-5 pt-4 border-t border-slate-200/80">
                  <button
                    type="button"
                    onClick={() => onBook(srv.poliKode, `Pendaftaran Layanan: ${srv.title}`)}
                    className="text-xs font-bold text-brand hover:text-brand-hover inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <span>Jadwalkan Layanan Ini</span>
                    <span className="sr-only">: {srv.title}</span>
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
