import {
  CENTERS_OF_EXCELLENCE,
  HEALTH_ARTICLES,
  HOSPITAL_BRANCHES,
  HOSPITAL_PROMOS,
  HOSPITAL_SERVICES,
  INPATIENT_ROOMS,
  INSURANCE_PARTNERS,
  MCU_PACKAGES,
  PATIENT_STORIES,
  VISITING_HOURS_INFO
} from '../../data/hospitalPublicCatalog';
import { SECTION_IDS } from './portalShared';
import type { PortalNavItem } from './sections/SiteHeader';

/** Navigasi beranda: hanya section yang benar-benar dirender (data tidak kosong) + rute halaman. */
export function buildNavItems(): PortalNavItem[] {
  const items: PortalNavItem[] = [
    { target: SECTION_IDS.workspace, label: 'Jadwal Dokter', mobileLabel: 'Jadwal Dokter & Daftar Online', mode: 'daftar' },
    { target: SECTION_IDS.workspace, label: 'Cek Antrean', mobileLabel: 'Cek Nomor Antrean', mode: 'antrean' },
    { target: '', to: '/dokter', label: 'Cari Dokter', mobileLabel: 'Cari Dokter & Profil' }
  ];
  if (HOSPITAL_SERVICES.length > 0) items.push({ target: SECTION_IDS.services, label: 'Layanan Medis' });
  if (CENTERS_OF_EXCELLENCE.length > 0) items.push({ target: SECTION_IDS.centers, label: 'Pusat Unggulan' });
  if (INPATIENT_ROOMS.length > 0 || VISITING_HOURS_INFO.morningSession || VISITING_HOURS_INFO.eveningSession) {
    items.push({ target: SECTION_IDS.inpatient, label: 'Rawat Inap', mobileLabel: 'Rawat Inap & Jam Besuk' });
  }
  if (HOSPITAL_PROMOS.length > 0 || MCU_PACKAGES.length > 0) {
    items.push({ target: SECTION_IDS.promo, label: MCU_PACKAGES.length > 0 ? 'Paket MCU' : 'Promo' });
  }
  items.push({ target: SECTION_IDS.mobileApp, label: 'Aplikasi Pasien', desktop: false });
  if (INSURANCE_PARTNERS.length > 0) items.push({ target: SECTION_IDS.insurance, label: 'Mitra Penjamin', desktop: false });
  if (HEALTH_ARTICLES.length > 0) items.push({ target: '', to: '/artikel', label: 'Artikel', desktop: false });
  else if (PATIENT_STORIES.length > 0) items.push({ target: SECTION_IDS.articles, label: 'Kisah Pasien', desktop: false });
  items.push({ target: '', to: '/bpjs', label: 'Pasien BPJS', desktop: false });
  if (HOSPITAL_BRANCHES.length > 0) items.push({ target: SECTION_IDS.branches, label: 'Lokasi & Kontak' });
  return items;
}

export const HOME_NAV_ITEMS = buildNavItems();
export const SUBPAGE_NAV_ITEMS = HOME_NAV_ITEMS;
