import React, { useMemo, useState } from 'react';
import { SectionHeading } from './SectionHeading';
import { SECTION_IDS } from '../portalShared';
import type { InsurancePartner } from '../../../data/hospitalPublicCatalog';

type Filter = 'Semua' | InsurancePartner['type'];

/** Mitra penjamin. Tidak dirender bila daftar kosong. */
export const InsuranceSection: React.FC<{ partners: InsurancePartner[] }> = ({ partners }) => {
  const [filter, setFilter] = useState<Filter>('Semua');
  const types = useMemo<Filter[]>(() => ['Semua', ...Array.from(new Set(partners.map((p) => p.type)))], [partners]);
  const filtered = filter === 'Semua' ? partners : partners.filter((p) => p.type === filter);

  if (partners.length === 0) return null;

  return (
    <section
      id={SECTION_IDS.insurance}
      aria-labelledby="insurance-title"
      className="py-14 sm:py-16 bg-slate-50 border-b border-slate-200 scroll-mt-20"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <SectionHeading
            id="insurance-title"
            eyebrow="PENJAMINAN & KEMITRAAN"
            title="Mitra Penjamin & Asuransi"
            description="Penjamin yang bekerja sama. Eligibilitas diverifikasi di loket pendaftaran."
          />
          {types.length > 2 && (
            <div className="flex flex-wrap gap-2" role="group" aria-label="Filter jenis penjamin">
              {types.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setFilter(t)}
                  aria-pressed={filter === t}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold transition cursor-pointer whitespace-nowrap shrink-0 ${
                    filter === t ? 'bg-brand text-white' : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          )}
        </div>

        <ul className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {filtered.map((partner) => (
            <li
              key={partner.id}
              className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-col justify-between gap-2"
            >
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-brand">{partner.type}</p>
                <h3 className="font-extrabold text-sm text-slate-900 mt-1">{partner.name}</h3>
              </div>
              {partner.coverageNote && (
                <p className="text-xs text-slate-600 pt-2 border-t border-slate-100">{partner.coverageNote}</p>
              )}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
};
