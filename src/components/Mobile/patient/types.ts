import type { PatientDossierPayload } from '../../../server/patientPortalService';

export type { PatientDossierPayload };

export type MobileTab = 'beranda' | 'jadwal' | 'hasil' | 'tagihan';
export type ResultSubTab = 'resume' | 'lab' | 'obat';

export const TAB_ORDER: MobileTab[] = ['beranda', 'jadwal', 'hasil', 'tagihan'];
export const SUBTAB_ORDER: ResultSubTab[] = ['resume', 'lab', 'obat'];

export const MOBILE_BASE_PATH = '/mobile';

export function tabPath(tab: MobileTab, sub?: ResultSubTab): string {
  if (tab === 'hasil' && sub) return `${MOBILE_BASE_PATH}/hasil/${sub}`;
  return `${MOBILE_BASE_PATH}/${tab}`;
}

/** Dokter seperti yang dipublikasikan oleh GET /api/public/hospital-catalog. */
export interface PublicDoctor {
  id: string;
  nama: string;
  spesialis: string;
  subspesialis?: string;
  poli: string;
  poli_id: string;
  hari?: string;
  jam?: string;
  jadwal?: string;
  ruangan?: string;
  kuota_tersisa?: number;
}

export interface PublicPoliklinik {
  id: string;
  nama: string;
}

export type LoadStatus = 'loading' | 'ready' | 'error';
