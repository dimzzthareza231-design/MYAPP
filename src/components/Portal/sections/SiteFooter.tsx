import React from 'react';
import { Link } from 'react-router-dom';
import { BrandLogo } from '../../Common/BrandLogo';
import { SystemCopyrightFooterBadge } from '../../AboutCopyrightModal';
import {
  HOSPITAL_PROFILE,
  NATIONAL_EMERGENCY_NUMBERS,
  PRIMARY_EMERGENCY_PHONE,
  toTelHref,
  toWhatsAppHref
} from '../../../data/hospitalPublicCatalog';
import type { PortalNavItem } from './SiteHeader';

interface SiteFooterProps {
  navItems: PortalNavItem[];
  onNavigate: (item: PortalNavItem) => void;
}

export const SiteFooter: React.FC<SiteFooterProps> = ({ navItems, onNavigate }) => (
  <footer className="bg-brand-deep text-white pt-14 pb-10">
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="grid grid-cols-1 md:grid-cols-12 gap-8 pb-10 border-b border-white/15">
        <div className="md:col-span-5 space-y-3">
          <div className="flex items-center gap-2.5">
            <BrandLogo alt="" className="w-9 h-9 rounded-xl object-cover" />
            <span className="font-extrabold text-lg tracking-tight">{HOSPITAL_PROFILE.name}</span>
          </div>
          <p className="text-sm text-blue-100 leading-relaxed max-w-md">
            Portal informasi pasien: jadwal dokter, pendaftaran poliklinik online, cek nomor antrean, dan akses
            Aplikasi Pasien.
          </p>
        </div>

        <nav aria-label="Navigasi footer" className="md:col-span-4 space-y-2.5 text-sm">
          <p className="text-xs font-bold uppercase tracking-wider text-sky-200">Navigasi Layanan</p>
          <ul className="grid grid-cols-2 gap-2 text-blue-100">
            {navItems.map((item) => (
              <li key={`f-${item.target}-${item.label}`}>
                <a href={`#${item.target}`} onClick={() => onNavigate(item)} className="hover:text-white hover:underline">
                  {item.label}
                </a>
              </li>
            ))}
            <li>
              <Link to="/mobile" className="hover:text-white hover:underline">
                Aplikasi Pasien
              </Link>
            </li>
          </ul>
        </nav>

        <div className="md:col-span-3 space-y-2.5 text-sm">
          <p className="text-xs font-bold uppercase tracking-wider text-sky-200">Kontak Darurat &amp; Info</p>
          {PRIMARY_EMERGENCY_PHONE && (
            <p className="tabular-nums text-base font-extrabold text-white">
              IGD 24 Jam:{' '}
              <a href={toTelHref(PRIMARY_EMERGENCY_PHONE)} className="hover:underline">
                {PRIMARY_EMERGENCY_PHONE}
              </a>
            </p>
          )}
          <p className="tabular-nums text-base font-extrabold text-white">
            Darurat:{' '}
            {NATIONAL_EMERGENCY_NUMBERS.map((em, i) => (
              <React.Fragment key={em.number}>
                {i > 0 && ' / '}
                <a href={toTelHref(em.number)} className="hover:underline" title={em.label}>
                  {em.number}
                </a>
              </React.Fragment>
            ))}
          </p>
          {HOSPITAL_PROFILE.customerServicePhone && (
            <p className="text-blue-100">
              Pendaftaran Telepon:{' '}
              <a href={toTelHref(HOSPITAL_PROFILE.customerServicePhone)} className="hover:text-white hover:underline">
                {HOSPITAL_PROFILE.customerServicePhone}
              </a>
            </p>
          )}
          {HOSPITAL_PROFILE.whatsappPhone && (
            <p className="text-blue-100">
              WhatsApp:{' '}
              <a
                href={toWhatsAppHref(HOSPITAL_PROFILE.whatsappPhone)}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-white hover:underline"
              >
                {HOSPITAL_PROFILE.whatsappPhone}
              </a>
            </p>
          )}
          {HOSPITAL_PROFILE.address && (
            <address className="not-italic text-blue-100">{HOSPITAL_PROFILE.address}</address>
          )}
        </div>
      </div>

      <div className="pt-6 flex flex-wrap items-center justify-between gap-3 text-xs text-blue-100">
        <span>
          © {new Date().getFullYear()} {HOSPITAL_PROFILE.name}
        </span>
        <SystemCopyrightFooterBadge />
      </div>
    </div>
  </footer>
);
