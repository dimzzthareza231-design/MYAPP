import React, { useState } from 'react';
import { ExternalLink, Map, MapPin } from 'lucide-react';
import { SectionHeading } from './SectionHeading';
import { SECTION_IDS } from '../portalShared';
import {
  buildMapsDirectionsUrl,
  buildMapsEmbedUrl,
  NATIONAL_EMERGENCY_NUMBERS,
  toTelHref,
  toWhatsAppHref,
  type HospitalBranch
} from '../../../data/hospitalPublicCatalog';

/**
 * Peta tersemat hanya bila koordinat dikonfigurasi, dan baru dimuat setelah pengguna menekan tombol
 * (Google Maps memasang cookie pihak ketiga; tidak dimuat otomatis).
 */
const BranchMapEmbed: React.FC<{ branch: HospitalBranch }> = ({ branch }) => {
  const [show, setShow] = useState(false);
  const embedUrl = buildMapsEmbedUrl(branch);
  if (!embedUrl) return null;
  if (!show) {
    return (
      <button
        type="button"
        onClick={() => setShow(true)}
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-700 underline hover:text-brand cursor-pointer rounded min-h-[44px]"
      >
        <Map className="w-4 h-4" aria-hidden="true" />
        Tampilkan peta (memuat Google Maps)
      </button>
    );
  }
  return (
    <div className="aspect-[4/3] rounded-xl overflow-hidden border border-slate-200">
      <iframe
        src={embedUrl}
        title={`Peta lokasi ${branch.name}`}
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
        className="w-full h-full border-0"
      />
    </div>
  );
};

/** Lokasi & kontak cabang. Tidak dirender bila daftar kosong. */
export const BranchesSection: React.FC<{ branches: HospitalBranch[] }> = ({ branches }) => {
  if (branches.length === 0) return null;

  return (
    <section
      id={SECTION_IDS.branches}
      aria-labelledby="branches-title"
      className="py-14 sm:py-16 bg-slate-50 border-b border-slate-200 scroll-mt-20"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
        <SectionHeading id="branches-title" eyebrow="LOKASI & KONTAK" title="Lokasi, Kontak & Jam Layanan" />

        <ul className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {branches.map((branch) => (
            <li key={branch.id} className="bg-white rounded-2xl border border-slate-200 p-6 space-y-3 shadow-xs">
              <p className="text-xs font-bold uppercase tracking-wider text-brand">
                {[branch.city, branch.accreditation].filter(Boolean).join(' · ')}
              </p>
              <h3 className="font-bold text-base text-slate-900">{branch.name}</h3>
              {branch.address && (
                <address className="not-italic text-sm text-slate-600 flex items-start gap-2 leading-relaxed">
                  <MapPin className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" aria-hidden="true" />
                  <span>{branch.address}</span>
                </address>
              )}
              {(() => {
                const directions = buildMapsDirectionsUrl(branch);
                return directions ? (
                  <a
                    href={directions}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm font-bold text-brand underline-offset-2 hover:underline rounded min-h-[44px]"
                  >
                    <ExternalLink className="w-4 h-4" aria-hidden="true" />
                    Petunjuk arah (Google Maps)
                    <span className="sr-only">, {branch.name}, terbuka di tab baru</span>
                  </a>
                ) : null;
              })()}
              <BranchMapEmbed branch={branch} />
              <div className="pt-3 border-t border-slate-100 space-y-1.5 text-sm text-slate-700">
                {branch.hours && <p>{branch.hours}</p>}
                {branch.appointmentPhone && (
                  <p className="tabular-nums">
                    Janji temu:{' '}
                    <a href={toTelHref(branch.appointmentPhone)} className="font-semibold underline hover:text-brand">
                      {branch.appointmentPhone}
                    </a>
                  </p>
                )}
                {branch.whatsappPhone && (
                  <p className="tabular-nums">
                    WhatsApp:{' '}
                    <a
                      href={toWhatsAppHref(branch.whatsappPhone)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-semibold underline hover:text-emerald-700"
                    >
                      {branch.whatsappPhone}
                    </a>
                  </p>
                )}
                {branch.emergencyPhone && (
                  <p className="tabular-nums font-bold text-emergency">
                    IGD &amp; Ambulans:{' '}
                    <a href={toTelHref(branch.emergencyPhone)} className="underline">
                      {branch.emergencyPhone}
                    </a>
                  </p>
                )}
                <p className="tabular-nums font-bold text-emergency">
                  Darurat nasional:{' '}
                  {NATIONAL_EMERGENCY_NUMBERS.map((em, i) => (
                    <React.Fragment key={em.number}>
                      {i > 0 && ' / '}
                      <a href={toTelHref(em.number)} className="underline" title={em.label}>
                        {em.number}
                      </a>
                    </React.Fragment>
                  ))}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
};
