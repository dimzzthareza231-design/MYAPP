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
import { PortalNavLink, type PortalNavItem } from './SiteHeader';

interface SiteFooterProps {
  navItems: PortalNavItem[];
  onNavigate: (item: PortalNavItem) => void;
  onSubpage?: boolean;
}

const INFO_LINKS = [
  { to: '/dokter', label: 'Cari Dokter' },
  { to: '/artikel', label: 'Artikel Kesehatan' },
  { to: '/bpjs', label: 'Alur Pasien BPJS' },
  { to: '/faq', label: 'Tanya Jawab (FAQ)' },
  { to: '/hak-pasien', label: 'Hak & Kewajiban Pasien' },
  { to: '/pengaduan', label: 'Pengaduan & Masukan' }
];

const LEGAL_LINKS = [
  { to: '/kebijakan-privasi', label: 'Kebijakan Privasi' },
  { to: '/syarat-layanan', label: 'Syarat Layanan' }
];

const linkClass = 'hover:text-white underline-offset-2 hover:underline rounded';

export const SiteFooter: React.FC<SiteFooterProps> = ({ navItems, onNavigate, onSubpage = false }) => (
  <footer className="bg-brand-deep text-white pt-14 pb-10">
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="grid grid-cols-1 md:grid-cols-12 gap-8 pb-10 border-b border-white/15">
        <div className="md:col-span-3 space-y-3">
          <div className="flex items-center gap-2.5">
            <BrandLogo alt="" className="w-9 h-9 rounded-xl object-cover" />
            <span className="font-extrabold text-lg tracking-tight">{HOSPITAL_PROFILE.name}</span>
          </div>
          <p className="text-sm text-blue-100 leading-relaxed max-w-md">
            Portal informasi pasien: jadwal dokter, pendaftaran poliklinik online, cek nomor antrean, dan akses
            Aplikasi Pasien.
          </p>
        </div>

        <nav aria-label="Navigasi layanan" className="md:col-span-3 space-y-2.5 text-sm">
          <h2 className="text-xs font-bold uppercase tracking-wider text-sky-200">Layanan</h2>
          <ul className="space-y-2 text-blue-100">
            {navItems
              .filter((item) => !item.to)
              .map((item) => (
                <li key={`f-${item.target}-${item.label}`}>
                  <PortalNavLink item={item} onSubpage={onSubpage} onNavigate={onNavigate} className={linkClass}>
                    {item.label}
                  </PortalNavLink>
                </li>
              ))}
            <li>
              <Link to="/mobile" className={linkClass}>
                Aplikasi Pasien
              </Link>
            </li>
          </ul>
        </nav>

        <nav aria-label="Informasi pasien" className="md:col-span-3 space-y-2.5 text-sm">
          <h2 className="text-xs font-bold uppercase tracking-wider text-sky-200">Informasi Pasien</h2>
          <ul className="space-y-2 text-blue-100">
            {INFO_LINKS.map((l) => (
              <li key={l.to}>
                <Link to={l.to} className={linkClass}>
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="md:col-span-3 space-y-2.5 text-sm">
          <h2 className="text-xs font-bold uppercase tracking-wider text-sky-200">Kontak Darurat &amp; Info</h2>
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
          {HOSPITAL_PROFILE.email && (
            <p className="text-blue-100">
              Email:{' '}
              <a href={`mailto:${HOSPITAL_PROFILE.email}`} className={`${linkClass} break-all`}>
                {HOSPITAL_PROFILE.email}
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
        <nav aria-label="Tautan legal">
          <ul className="flex flex-wrap gap-x-4 gap-y-1">
            {LEGAL_LINKS.map((l) => (
              <li key={l.to}>
                <Link to={l.to} className={linkClass}>
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <SystemCopyrightFooterBadge />
      </div>
    </div>
  </footer>
);
