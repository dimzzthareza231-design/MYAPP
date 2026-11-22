import { PUBLIC_PRIVACY_SETTINGS } from '../../data/hospitalPublicCatalog';

export const PRIVACY_NOTICE_KEY = 'myitaru_public_privacy_notice_v1';
export type PrivacyChoice = 'acknowledged' | 'granted' | 'denied';

export function readPrivacyChoice(): PrivacyChoice | null {
  try {
    const v = localStorage.getItem(PRIVACY_NOTICE_KEY);
    return v === 'acknowledged' || v === 'granted' || v === 'denied' ? v : null;
  } catch {
    return null;
  }
}

export function savePrivacyChoice(choice: PrivacyChoice): void {
  try {
    localStorage.setItem(PRIVACY_NOTICE_KEY, choice);
  } catch {
    // Penyimpanan diblokir (mode privat): pemberitahuan cukup ditutup untuk sesi ini.
  }
}

/** true hanya bila analitik dipakai DAN pengunjung menyetujui. Pasang skrip analitik di balik fungsi ini. */
export function hasAnalyticsConsent(): boolean {
  return PUBLIC_PRIVACY_SETTINGS.usesAnalytics && readPrivacyChoice() === 'granted';
}
