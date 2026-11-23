export type OperatingMode = 'SIMK' | 'SIMRS';

const SIMK_MODULES = new Set([
  'rekam-medis',
  'pendaftaran',
  'rawat-jalan',
  'patient-flow',
  'patient-portal',
  'apotek-ralan',
  'stok-obat',
  'laboratorium',
  'inventory',
  'kasir',
  'jkn-mobile',
  'bridging-hub',
  'satu-sehat',
  'mutu',
  'sdm',
  'pengaturan-klinik',
  'panduan',
  'notifikasi',
  'profile',
  'security',
  'audit',
  'backup',
  'monitoring',
  'blueprint'
]);

export function isModuleAvailableInMode(moduleId: string, mode: OperatingMode): boolean {
  return mode === 'SIMRS' || SIMK_MODULES.has(moduleId);
}
