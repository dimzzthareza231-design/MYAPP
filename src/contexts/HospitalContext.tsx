import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { MASTER_POLIKLINIK, SEMUA_DOKTER, SEMUA_PERAWAT } from "../data/seedData";
import { useAuth } from './AuthContext';
import { Pasien, Kunjungan, MasterDokter, MasterPoli, MasterPenjamin, MasterPerawat, BantuanArtikel, User } from '../types';
import { HospitalInfo, DEFAULT_HOSPITAL_INFO } from '../types/document';
import { storage } from '../utils/storage';
import { 
  CloudStatus, 
  subscribeCloudStatus, 
  savePasienCloud, 
  updatePasienCloud, 
  batchSeedPasienCloud,
  saveKunjunganCloud, 
  updateKunjunganCloud, 
  batchSeedKunjunganCloud,
  saveDokterCloud,
  batchSeedDokterCloud,
  savePerawatCloud,
  batchSeedPerawatCloud,
  saveHospitalSettingsCloud,
  saveSystemDataCloud,
  SystemDataConflictError,
  ApiError,
  fetchRecords,
  getSystemDataCloud,
  startPolling,
  RecordCollection
} from '../lib/firestoreService';

interface HospitalContextType {
  activeUser: User;
  setActiveUser: (user: User) => void;
  pasien: Pasien[];
  addPasien: (p: Pasien) => Promise<void>;
  updatePasien: (id: string, p: Partial<Pasien>) => Promise<void>;
  kunjungan: Kunjungan[];
  addKunjungan: (k: Kunjungan) => Promise<void>;
  updateKunjunganStatus: (id: string, status: Kunjungan['status']) => Promise<void>;
  dokter: MasterDokter[];
  addDokter: (d: MasterDokter) => Promise<void>;
  perawat: MasterPerawat[];
  addPerawat: (n: MasterPerawat) => Promise<void>;
  poli: MasterPoli[];
  penjamin: MasterPenjamin[];
  artikelBantuan: BantuanArtikel[];
  isDarkMode: boolean;
  toggleDarkMode: () => void;
  isFirestoreSyncing: boolean;
  cloudStatus: CloudStatus;
  hospitalSettings: HospitalInfo & { logoUrl?: string };
  updateHospitalSettings: (settings: Partial<HospitalInfo & { logoUrl?: string }>) => Promise<void>;
  syncAllData: () => Promise<void>;
}

const defaultUser: User = { id: 'U1', name: 'dr. Andi Pratama, Sp.PD', role: 'Dokter', spesialisasi: 'Penyakit Dalam' };

export const MASTER_POLI_LIST: MasterPoli[] = MASTER_POLIKLINIK.map(p => ({
  id: p.id,
  nama: p.nama,
  kode: p.kode,
  kapasitas: p.kapasitas,
  kategori: p.kategori,
  icon: p.icon,
  deskripsi: p.deskripsi
}));

export const MASTER_DOKTER_LIST: MasterDokter[] = SEMUA_DOKTER.map(d => ({
  id: d.id,
  nip: d.nip,
  sip: d.sip,
  str: d.str,
  nama: d.nama,
  spesialisasi: d.spesialis,
  subspesialis: d.subspesialis,
  poli_id: d.poli_id,
  poli_nama: d.poli,
  penempatan: d.penempatan,
  jadwal: d.jadwal,
  hari: d.hari,
  jam: d.jam,
  shift: d.shift,
  ruangan: d.ruangan,
  kuota: d.kuota,
  pasien_terlayani: d.pasien_terlayani,
  status_jaga: d.status_jaga,
  kontak: d.kontak,
  email: d.email,
  status: d.status
}));

export const MASTER_PERAWAT_LIST: MasterPerawat[] = SEMUA_PERAWAT.map(n => ({
  id: n.id,
  nip: n.nip,
  nama: n.nama,
  jabatan: n.jabatan,
  unit: n.unit,
  shift: n.shift,
  status: n.status
}));

const dummyPenjamin: MasterPenjamin[] = [
  { id: 'PJ-01', nama: 'Umum / Mandiri', tipe: 'Umum' },
  { id: 'PJ-02', nama: 'BPJS Kesehatan (PBI & Non-PBI)', tipe: 'BPJS' },
  { id: 'PJ-03', nama: 'Asuransi Mandiri Inhealth', tipe: 'Asuransi' },
  { id: 'PJ-04', nama: 'Asuransi Allianz Care', tipe: 'Asuransi' },
  { id: 'PJ-05', nama: 'Asuransi Prudential Health', tipe: 'Asuransi' },
  { id: 'PJ-06', nama: 'PT Pertamina (Persero)', tipe: 'Perusahaan' },
  { id: 'PJ-07', nama: 'PT PLN Indonesia', tipe: 'Perusahaan' },
];

const dummyArtikel: BantuanArtikel[] = [
  { id: 'H1', kategori: 'Poliklinik', judul: 'Panduan Penggunaan AI Scribe Talk-to-Text', konten: 'Tekan tombol "Mulai Rekaman" pada form SOAP, dokter berbicara secara alami, dan AI otomatis mengekstrak Subjective, Objective, Diagnosis ICD-10, dan Resep Obat.', tags: ['talk-to-text', 'ai', 'soap', 'poliklinik'] },
  { id: 'H2', kategori: 'Pendaftaran', judul: 'Cara Mendaftarkan Pasien ke Poliklinik Spesialis', konten: 'Pilih poli tujuan spesialis yang dituju (misalnya Obgyn, Jantung, Anak, Saraf, Bedah, MCU) lalu pilih dokter penanggung jawab spesialis.', tags: ['pendaftaran', 'poli', 'spesialis'] },
  { id: 'H3', kategori: 'Rekam Medis', judul: 'Integrasi Standar ICD-10 & Diagnosis Pintar', konten: 'Sistem mendukung pencarian dan validasi ICD-10 klinis otomatis terintegrasi BPJS VClaim dan SatuSehat.', tags: ['icd10', 'rme', 'bpjs'] },
  { id: 'H4', kategori: 'Farmasi', judul: 'E-Prescribing & Interaksi Obat Terpadu', konten: 'Resep yang diinput dari Form SOAP Poliklinik langsung terkirim secara real-time ke modul Apotek Ralan.', tags: ['farmasi', 'resep', 'apotek'] },
  { id: 'H5', kategori: 'SDM', judul: 'Sinkronisasi Jadwal Dokter & Perawat', konten: 'Seluruh data dokter dan perawat untuk 24 poliklinik tersinkronisasi otomatis dengan modul Manajemen SDM & Shift.', tags: ['sdm', 'dokter', 'perawat'] },
];

const HospitalContext = createContext<HospitalContextType | undefined>(undefined);

export function HospitalProvider({ children }: { children: ReactNode }) {
  const [activeUser, setActiveUser] = useState<User>(defaultUser);
  const [isFirestoreSyncing, setIsFirestoreSyncing] = useState(false);
  const [cloudStatus, setLocalCloudStatus] = useState<CloudStatus>({
    isConnected: true,
    isSyncing: false,
    pendingWrites: 0,
    lastSync: null,
    syncedKeysCount: 0
  });

  // Track cloud status in real time
  useEffect(() => {
    return subscribeCloudStatus((status) => {
      setLocalCloudStatus(status);
      setIsFirestoreSyncing(status.isSyncing);
    });
  }, []);

  const normalizeClinicSettings = (raw: Partial<HospitalInfo & { logoUrl?: string }> | null): HospitalInfo & { logoUrl?: string } => {
    if (!raw) return DEFAULT_HOSPITAL_INFO;
    const rawName = (raw.name || '').trim();
    const isLegacyName =
      !rawName ||
      rawName === 'MYITARU RS' ||
      rawName === 'MYITARU Klinik' ||
      rawName.includes('SEHAT UTAMA') ||
      rawName.includes('Smart Medika') ||
      rawName.toUpperCase().includes('RUMAH SAKIT');
    const rawSubname = (raw.subname || '').trim();
    const isLegacySubname =
      !rawSubname ||
      rawSubname.toUpperCase().includes('RUMAH SAKIT') ||
      rawSubname.includes('KLINIK UMUM PENDIDIKAN');
    const rawType = (raw.hospitalType || '').trim();
    const isLegacyType =
      !rawType ||
      rawType.includes('Kelas B') ||
      rawType.toLowerCase().includes('rumah sakit') ||
      rawType === 'Klinik Umum (Kelas B Pendidikan)';

    return {
      ...DEFAULT_HOSPITAL_INFO,
      ...raw,
      name: isLegacyName ? DEFAULT_HOSPITAL_INFO.name : rawName,
      subname: isLegacySubname ? DEFAULT_HOSPITAL_INFO.subname : rawSubname,
      hospitalType: isLegacyType ? DEFAULT_HOSPITAL_INFO.hospitalType : rawType
    };
  };

  const [hospitalSettings, setHospitalSettings] = useState<HospitalInfo & { logoUrl?: string }>(() => {
    const saved = storage.get('hospital_settings', null);
    return normalizeClinicSettings(saved);
  });

  const updateHospitalSettings = async (settings: Partial<HospitalInfo & { logoUrl?: string }>) => {
    const updated = { ...hospitalSettings, ...settings };
    setHospitalSettings(updated);
    storage.set('hospital_settings', updated);
    try {
      await saveHospitalSettingsCloud(updated);
    } catch (err) {
      if (err instanceof SystemDataConflictError) {
        const latest = normalizeClinicSettings(err.latestValue);
        setHospitalSettings(latest);
        storage.set('hospital_settings', latest);
      }
      throw err;
    }
  };

  // 1. PASIEN STATE
  const [pasien, setPasien] = useState<Pasien[]>(() => {
    const saved = storage.get('hospital_pasien', null);
    return Array.isArray(saved) ? saved : [];
  });

  // 2. DOKTER STATE
  const [dokter, setDokter] = useState<MasterDokter[]>(() => {
    const saved = storage.get('hospital_dokter', null);
    if (Array.isArray(saved) && saved.length > 0) return saved;
    return MASTER_DOKTER_LIST;
  });

  // 3. PERAWAT STATE
  const [perawat, setPerawat] = useState<MasterPerawat[]>(() => {
    const saved = storage.get('hospital_perawat', null);
    if (Array.isArray(saved) && saved.length > 0) return saved;
    return MASTER_PERAWAT_LIST;
  });

  // 4. POLI STATE
  const [poli] = useState<MasterPoli[]>(MASTER_POLI_LIST);

  // 5. PENJAMIN STATE
  const [penjamin] = useState<MasterPenjamin[]>(dummyPenjamin);

  // 6. KUNJUNGAN STATE
  const [kunjungan, setKunjungan] = useState<Kunjungan[]>(() => {
    const saved = storage.get('hospital_kunjungan', null);
    return Array.isArray(saved) ? saved : [];
  });

  // 7. DARK MODE
  const [isDarkMode, setIsDarkMode] = useState(() => {
    return storage.get<string>('hospital_theme', 'light') === 'dark';
  });

  useEffect(() => {
    storage.set('hospital_theme', isDarkMode ? 'dark' : 'light');
    if (typeof document !== 'undefined') {
      if (isDarkMode) document.documentElement.classList.add('dark');
      else document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  useEffect(() => {
    const handleToggleTheme = () => {
      setIsDarkMode(prev => !prev);
    };
    window.addEventListener('toggle-theme', handleToggleTheme);
    return () => window.removeEventListener('toggle-theme', handleToggleTheme);
  }, []);

  // Sync kunjungan & pasien when interline modules (e.g. Kasir payment or Registration) update storage
  useEffect(() => {
    const handleInterlineSync = (evt: Event) => {
      const action = (evt as CustomEvent)?.detail?.action;
      if (action === 'BILLING_PAID' || action === 'NEW_REGISTRATION' || action === 'SOAP_INTEGRATED') {
        const savedVisits = storage.get<Kunjungan[] | null>('hospital_kunjungan', null);
        if (Array.isArray(savedVisits) && savedVisits.length > 0) {
          setKunjungan(savedVisits);
        }
        const savedPatients = storage.get<Pasien[] | null>('hospital_pasien', null);
        if (Array.isArray(savedPatients) && savedPatients.length > 0) {
          setPasien(savedPatients);
        }
      }
    };
    window.addEventListener('simrs-interline-sync', handleInterlineSync);
    return () => window.removeEventListener('simrs-interline-sync', handleInterlineSync);
  }, []);

  // Pull core collections from the Core REST API while a staff session is active.
  const { currentUser } = useAuth();
  const sessionUserId = currentUser?.id || null;

  useEffect(() => {
    if (!sessionUserId) return;
    const since: Partial<Record<RecordCollection, string>> = {};
    const forbidden = new Set<string>();
    let stopped = false;

    const pull = async <T extends { id: string | number }>(
      col: RecordCollection,
      setter: React.Dispatch<React.SetStateAction<T[]>>,
      cacheKey: string
    ) => {
      if (forbidden.has(col)) return;
      try {
        const cursor = since[col];
        const rows = await fetchRecords<T & { updated_at?: string; updatedAt?: string }>(col, cursor);
        if (stopped) return;
        const newest = rows.reduce<string | undefined>((max, r) => {
          const ts = r.updated_at || r.updatedAt;
          return ts && (!max || ts > max) ? ts : max;
        }, cursor);
        if (newest) since[col] = newest;
        if (cursor && rows.length === 0) return;
        // shortcut: ?since only returns upserts, so deletions show up after a reload; add tombstones if deletes become common.
        setter(prev => {
          let next: T[];
          if (!cursor) {
            next = rows;
          } else {
            const byId = new Map(prev.map(p => [String(p.id), p]));
            rows.forEach(r => byId.set(String(r.id), r));
            next = Array.from(byId.values());
          }
          storage.set(cacheKey, next);
          return next;
        });
      } catch (err) {
        // Roles without read access (e.g. pasien for non-clinical staff) stop polling that collection.
        if (err instanceof ApiError && (err.status === 401 || err.status === 403)) forbidden.add(col);
        else console.warn(`[Sync] ${col} pull failed:`, err);
      }
    };

    const pullSettings = async () => {
      try {
        const value = await getSystemDataCloud('hospital_settings');
        if (stopped || !value) return;
        setHospitalSettings(prev => {
          const merged = normalizeClinicSettings({ ...prev, ...value });
          storage.set('hospital_settings', merged);
          return merged;
        });
      } catch (err) {
        console.warn('[Sync] hospital_settings pull failed:', err);
      }
    };

    const stopPolling = startPolling(async () => {
      await Promise.all([
        pull<Pasien>('pasien', setPasien, 'hospital_pasien'),
        pull<Kunjungan>('kunjungan', setKunjungan, 'hospital_kunjungan'),
        pull<MasterDokter>('dokter', setDokter, 'hospital_dokter'),
        pull<MasterPerawat>('perawat', setPerawat, 'hospital_perawat'),
        pullSettings()
      ]);
    });

    return () => {
      stopped = true;
      stopPolling();
    };
  }, [sessionUserId]);

  const toggleDarkMode = () => setIsDarkMode(prev => !prev);

  // Direct Cloud Write Handlers
  const addPasien = async (p: Pasien) => {
    const docId = p.id || `P-${Date.now()}`;
    const newPasien = { ...p, id: docId };
    setPasien(prev => {
      const next = [newPasien, ...prev];
      storage.set('hospital_pasien', next);
      return next;
    });
    await savePasienCloud(newPasien);
  };

  const updatePasien = async (id: string, updated: Partial<Pasien>) => {
    setPasien(prev => {
      const next = prev.map(p => p.id === id ? { ...p, ...updated } : p);
      storage.set('hospital_pasien', next);
      return next;
    });
    await updatePasienCloud(id, updated);
  };

  const addDokter = async (d: MasterDokter) => {
    setDokter(prev => {
      const next = [d, ...prev];
      storage.set('hospital_dokter', next);
      return next;
    });
    await saveDokterCloud(d);
  };

  const addPerawat = async (n: MasterPerawat) => {
    setPerawat(prev => {
      const next = [n, ...prev];
      storage.set('hospital_perawat', next);
      return next;
    });
    await savePerawatCloud(n);
  };

  const addKunjungan = async (k: Kunjungan) => {
    const docId = k.id || `K-${Date.now()}`;
    const newKunjungan = { ...k, id: docId };
    setKunjungan(prev => {
      const next = [newKunjungan, ...prev];
      storage.set('hospital_kunjungan', next);
      return next;
    });
    await saveKunjunganCloud(newKunjungan);
  };

  const updateKunjunganStatus = async (id: string, status: Kunjungan['status']) => {
    setKunjungan(prev => {
      const next = prev.map(k => k.id === id ? { ...k, status } : k);
      storage.set('hospital_kunjungan', next);
      return next;
    });
    await updateKunjunganCloud(id, { status });
  };

  // Full manual cloud synchronization
  const syncAllData = async () => {
    await Promise.all([
      batchSeedPasienCloud(pasien),
      batchSeedKunjunganCloud(kunjungan),
      batchSeedDokterCloud(dokter),
      batchSeedPerawatCloud(perawat),
      saveHospitalSettingsCloud(hospitalSettings),
      saveSystemDataCloud('hospital_poli_master', MASTER_POLI_LIST)
    ]);
  };

  return (
    <HospitalContext.Provider value={{
      activeUser, setActiveUser,
      pasien, addPasien, updatePasien,
      kunjungan, addKunjungan, updateKunjunganStatus,
      dokter, addDokter,
      perawat, addPerawat,
      poli,
      penjamin,
      artikelBantuan: dummyArtikel,
      isDarkMode, toggleDarkMode,
      isFirestoreSyncing,
      cloudStatus,
      hospitalSettings,
      updateHospitalSettings,
      syncAllData
    }}>
      {children}
    </HospitalContext.Provider>
  );
}

export function useHospital() {
  const context = useContext(HospitalContext);
  if (context === undefined) {
    throw new Error('useHospital must be used within a HospitalProvider');
  }
  return context;
}
