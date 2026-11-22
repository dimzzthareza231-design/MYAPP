import React from 'react';
import { CheckCircle2 } from 'lucide-react';
import { motion } from 'motion/react';
import { SectionHeading } from './SectionHeading';
import { EASE_OUT_EXPO, SECTION_IDS, VIEWPORT_CONFIG, formatRupiah } from '../portalShared';
import type { HospitalPromo, MCUPackage } from '../../../data/hospitalPublicCatalog';

interface PromoMcuSectionProps {
  promos: HospitalPromo[];
  packages: MCUPackage[];
  onBook: (poliKode: string, note: string) => void;
}

/** Promo resmi & paket Medical Check-Up. Tidak dirender bila keduanya kosong. */
export const PromoMcuSection: React.FC<PromoMcuSectionProps> = ({ promos, packages, onBook }) => {
  if (promos.length === 0 && packages.length === 0) return null;

  return (
    <section
      id={SECTION_IDS.promo}
      aria-label="Promo dan paket Medical Check-Up"
      className="py-16 sm:py-20 bg-slate-50 border-b border-slate-200 overflow-hidden scroll-mt-20"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-14">
        {promos.length > 0 && (
          <div className="space-y-8">
            <SectionHeading eyebrow="PROMO & PROGRAM LAYANAN" title="Program Layanan yang Sedang Berlaku" />
            <ul className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
              {promos.map((promo, idx) => (
                <motion.li
                  key={promo.id}
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={VIEWPORT_CONFIG}
                  transition={{ duration: 0.4, delay: idx * 0.06, ease: EASE_OUT_EXPO }}
                  className="bg-white rounded-2xl border border-slate-200 hover:border-brand/40 p-5 flex flex-col justify-between transition shadow-xs hover:shadow-md"
                >
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-brand">
                      {[promo.tag, promo.validUntil].filter(Boolean).join(' · ')}
                    </p>
                    <h3 className="text-base font-extrabold text-slate-900 mt-1.5 leading-snug">{promo.title}</h3>
                    <p className="text-sm text-slate-600 mt-2 leading-relaxed">{promo.subtitle}</p>
                    {promo.benefit && (
                      <p className="text-xs font-semibold text-emerald-700 mt-3 pt-3 border-t border-slate-100">
                        {promo.benefit}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => onBook(promo.poliKode, promo.presetNote)}
                    className="mt-4 w-full py-2.5 rounded-xl bg-slate-100 hover:bg-brand text-slate-900 hover:text-white font-bold text-xs transition cursor-pointer"
                  >
                    Daftar Program Ini<span className="sr-only">: {promo.title}</span>
                  </button>
                </motion.li>
              ))}
            </ul>
          </div>
        )}

        {packages.length > 0 && (
          <div>
            <SectionHeading
              className="max-w-2xl mb-8"
              eyebrow="PAKET PEMERIKSAAN KESEHATAN"
              title="Paket Medical Check-Up"
              description="Hasil pemeriksaan yang telah divalidasi dapat dilihat di Aplikasi Pasien."
            />
            <ul className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {packages.map((pkg, idx) => (
                <motion.li
                  key={pkg.id}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={VIEWPORT_CONFIG}
                  transition={{ duration: 0.45, delay: idx * 0.08, ease: EASE_OUT_EXPO }}
                  className="rounded-2xl p-6 sm:p-7 flex flex-col justify-between bg-white border border-slate-200 shadow-xs transition hover:shadow-lg"
                >
                  <div>
                    <div className="flex items-center justify-between text-xs font-semibold text-brand">
                      <span>{pkg.tier}</span>
                      <span className="tabular-nums text-slate-600">{pkg.duration}</span>
                    </div>
                    <h3 className="text-xl font-extrabold text-slate-900 mt-2">{pkg.name}</h3>
                    {pkg.price > 0 && (
                      <p className="text-2xl font-extrabold text-brand tabular-nums mt-3">{formatRupiah(pkg.price)}</p>
                    )}
                    <p className="text-xs text-slate-600 mt-1">
                      {[pkg.recommendedFor, pkg.fastingRequired ? 'Perlu puasa' : 'Tanpa puasa']
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                    <ul className="mt-5 pt-5 border-t border-slate-100 space-y-2.5">
                      {pkg.highlights.map((item) => (
                        <li key={item} className="text-sm text-slate-700 flex items-start gap-2.5">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" aria-hidden="true" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <button
                    type="button"
                    onClick={() => onBook('MCU', `Pendaftaran ${pkg.name}`)}
                    className="mt-6 w-full py-3 rounded-xl font-bold text-sm transition cursor-pointer min-h-[44px] bg-slate-100 hover:bg-brand hover:text-white text-slate-900"
                  >
                    Pesan Paket<span className="sr-only">: {pkg.name}</span>
                  </button>
                </motion.li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
};
