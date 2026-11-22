import React from 'react';
import { Link } from 'react-router-dom';
import { PhoneCall, Smartphone } from 'lucide-react';
import {
  HOSPITAL_PROFILE,
  NATIONAL_EMERGENCY_NUMBERS,
  PRIMARY_EMERGENCY_PHONE,
  VISITING_HOURS_INFO,
  toTelHref
} from '../../../data/hospitalPublicCatalog';

/** Strip informasi darurat di bagian paling atas halaman. */
export const TopInfoBar: React.FC = () => {
  const hasVisitingHours = Boolean(VISITING_HOURS_INFO.morningSession || VISITING_HOURS_INFO.eveningSession);
  const visitingLabel = [VISITING_HOURS_INFO.morningSession, VISITING_HOURS_INFO.eveningSession]
    .filter(Boolean)
    .join(' & ');

  return (
    <div className="bg-brand-strong text-white text-xs py-2 px-4 sm:px-6 lg:px-8 border-b border-white/10">
      <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-4">
          <span className="inline-flex items-center gap-2 font-semibold text-white whitespace-nowrap shrink-0">
            <span className="inline-flex items-center gap-1 bg-emergency px-2 py-0.5 rounded font-bold tracking-wide">
              <PhoneCall className="w-3 h-3" aria-hidden="true" /> DARURAT
            </span>
            {PRIMARY_EMERGENCY_PHONE && (
              <a
                href={toTelHref(PRIMARY_EMERGENCY_PHONE)}
                className="tabular-nums font-bold hover:text-red-200 transition"
              >
                IGD {PRIMARY_EMERGENCY_PHONE}
              </a>
            )}
            {NATIONAL_EMERGENCY_NUMBERS.map((em) => (
              <a
                key={em.number}
                href={toTelHref(em.number)}
                title={em.label}
                aria-label={`${em.label}: ${em.number}`}
                className="tabular-nums font-bold hover:text-red-200 transition"
              >
                {em.number}
              </a>
            ))}
          </span>
          {hasVisitingHours && (
            <span className="hidden md:inline text-blue-100">Jam Besuk Rawat Inap: {visitingLabel}</span>
          )}
          {HOSPITAL_PROFILE.customerServicePhone && (
            <a
              href={toTelHref(HOSPITAL_PROFILE.customerServicePhone)}
              className="hidden lg:inline text-blue-100 hover:text-white"
            >
              Layanan Pasien {HOSPITAL_PROFILE.customerServicePhone}
            </a>
          )}
        </div>

        <Link
          to="/mobile"
          className="inline-flex items-center gap-1.5 text-sky-100 hover:text-white font-semibold whitespace-nowrap shrink-0"
        >
          <Smartphone className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Buka Aplikasi Pasien</span>
        </Link>
      </div>
    </div>
  );
};
