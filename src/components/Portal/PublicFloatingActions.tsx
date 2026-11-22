import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { MessageCircle, PhoneCall, Siren } from 'lucide-react';
import {
  HOSPITAL_PROFILE,
  PRIMARY_EMERGENCY_PHONE,
  PUBLIC_PRIVACY_SETTINGS,
  toTelHref,
  toWhatsAppHref
} from '../../data/hospitalPublicCatalog';
import { readPrivacyChoice, savePrivacyChoice, type PrivacyChoice } from './privacyConsent';

const WA_GREETING = 'Halo, saya ingin bertanya mengenai layanan rumah sakit.';

/** Pemberitahuan privasi minimal. Mode persetujuan hanya bila analitik/penyimpanan non-esensial dipakai. */
const PrivacyNotice: React.FC<{ onDone: (c: PrivacyChoice) => void }> = ({ onDone }) => {
  const consentMode = PUBLIC_PRIVACY_SETTINGS.usesAnalytics;
  return (
    <section
      aria-label="Pemberitahuan privasi"
      className="pointer-events-auto mx-4 lg:mx-0 lg:max-w-sm rounded-2xl border border-slate-200 bg-white shadow-xl p-4 text-sm text-slate-700 space-y-3"
    >
      <p className="leading-relaxed">
        {consentMode
          ? 'Kami ingin memakai analitik untuk memahami penggunaan situs. Analitik hanya aktif bila Anda setuju.'
          : 'Situs ini tidak memakai cookie iklan atau pelacak pihak ketiga. Penyimpanan di perangkat hanya untuk fungsi yang Anda gunakan (mis. riwayat tiket antrean).'}{' '}
        <Link to="/kebijakan-privasi" className="font-semibold text-brand underline rounded">
          Kebijakan Privasi
        </Link>
      </p>
      <div className="flex flex-wrap justify-end gap-2">
        {consentMode && (
          <button
            type="button"
            onClick={() => onDone('denied')}
            className="px-4 py-2 rounded-xl border border-slate-300 text-slate-800 font-semibold hover:bg-slate-50 cursor-pointer min-h-[44px]"
          >
            Tolak
          </button>
        )}
        <button
          type="button"
          onClick={() => onDone(consentMode ? 'granted' : 'acknowledged')}
          className="px-4 py-2 rounded-xl bg-brand hover:bg-brand-hover text-white font-semibold cursor-pointer min-h-[44px]"
        >
          {consentMode ? 'Setuju' : 'Mengerti'}
        </button>
      </div>
    </section>
  );
};

/**
 * Tombol WhatsApp mengambang, bar "Telepon IGD" (mobile), dan pemberitahuan privasi.
 * Semuanya ditumpuk dalam satu wadah tetap di bawah layar sehingga tidak saling menutupi
 * dan menghormati safe-area (notch/home indicator).
 */
export const PublicFloatingActions: React.FC = () => {
  const [noticeOpen, setNoticeOpen] = useState(() => readPrivacyChoice() === null);
  const waHref = HOSPITAL_PROFILE.whatsappPhone
    ? `${toWhatsAppHref(HOSPITAL_PROFILE.whatsappPhone)}?text=${encodeURIComponent(WA_GREETING)}`
    : '';
  const hospitalEr = toTelHref(PRIMARY_EMERGENCY_PHONE);

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 pointer-events-none flex flex-col items-stretch lg:items-end gap-3 lg:pr-6 lg:pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
      {noticeOpen && (
        <PrivacyNotice
          onDone={(c) => {
            savePrivacyChoice(c);
            setNoticeOpen(false);
          }}
        />
      )}

      {waHref && (
        <div className="flex justify-end px-4 lg:px-0">
          <a
            href={waHref}
            target="_blank"
            rel="noopener noreferrer"
            className="pointer-events-auto inline-flex items-center gap-2 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-lg px-4 min-h-[52px] text-sm"
          >
            <MessageCircle className="w-5 h-5" aria-hidden="true" />
            <span className="hidden sm:inline">Chat WhatsApp</span>
            <span className="sr-only sm:hidden">Chat WhatsApp layanan pasien</span>
            <span className="sr-only">(terbuka di aplikasi/tab baru)</span>
          </a>
        </div>
      )}

      <nav
        aria-label="Telepon darurat"
        className="pointer-events-auto lg:hidden bg-white/95 backdrop-blur border-t border-slate-200 shadow-[0_-4px_16px_rgba(15,23,42,0.08)] px-4 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))]"
      >
        <ul className="flex gap-2">
          {hospitalEr && (
            <li className="flex-1">
              <a
                href={hospitalEr}
                className="flex items-center justify-center gap-2 rounded-xl bg-emergency hover:bg-red-700 text-white font-bold text-sm min-h-[44px] px-3"
              >
                <Siren className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>Telepon IGD</span>
                <span className="sr-only">{PRIMARY_EMERGENCY_PHONE}</span>
              </a>
            </li>
          )}
          <li className="flex-1">
            <a
              href="tel:119"
              className={`flex items-center justify-center gap-2 rounded-xl font-bold text-sm min-h-[44px] px-3 ${
                hospitalEr ? 'border-2 border-emergency text-emergency bg-white' : 'bg-emergency hover:bg-red-700 text-white'
              }`}
            >
              <PhoneCall className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>{hospitalEr ? 'Ambulans 119' : 'Telepon Darurat 119'}</span>
            </a>
          </li>
        </ul>
      </nav>
    </div>
  );
};

export default PublicFloatingActions;
