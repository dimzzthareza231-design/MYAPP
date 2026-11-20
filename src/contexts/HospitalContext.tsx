import React, { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { collection, doc, getDocsFromServer, onSnapshot, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from './AuthContext';
import type { Pasien, Kunjungan, MasterDokter, MasterPoli, MasterPenjamin, MasterPerawat, BantuanArtikel, User } from '../types';
import { DEFAULT_HOSPITAL_INFO, type HospitalInfo } from '../types/document';
import type { CloudStatus } from '../lib/firestoreService';
interface HospitalContextType {
  activeUser: User; setActiveUser: (user: User) => void;
  pasien: Pasien[]; addPasien: (p: Pasien) => Promise<void>; updatePasien: (id: string, p: Partial<Pasien>) => Promise<void>;
  kunjungan: Kunjungan[]; addKunjungan: (k: Kunjungan) => Promise<void>; updateKunjunganStatus: (id: string, status: Kunjungan['status']) => Promise<void>;
  dokter: MasterDokter[]; addDokter: (d: MasterDokter) => Promise<void>; perawat: MasterPerawat[]; addPerawat: (n: MasterPerawat) => Promise<void>;
  poli: MasterPoli[]; penjamin: MasterPenjamin[]; artikelBantuan: BantuanArtikel[];
  isDarkMode: boolean; toggleDarkMode: () => void; isFirestoreSyncing: boolean; cloudStatus: CloudStatus;
  hospitalSettings: HospitalInfo & { logoUrl?: string }; updateHospitalSettings: (settings: Partial<HospitalInfo & { logoUrl?: string }>) => Promise<void>; syncAllData: () => Promise<void>;
}
// Empty master collections must be provisioned explicitly; never seed demo PHI.
export const MASTER_POLI_LIST: MasterPoli[] = [];
export const MASTER_DOKTER_LIST: MasterDokter[] = [];
export const MASTER_PERAWAT_LIST: MasterPerawat[] = [];
const Context = createContext<HospitalContextType | undefined>(undefined);
export function HospitalProvider({ children }: { children: ReactNode }) {
  const { currentUser } = useAuth();
  const [pasien, setPasien] = useState<Pasien[]>([]), [kunjungan, setKunjungan] = useState<Kunjungan[]>([]);
  const [dokter, setDokter] = useState<MasterDokter[]>([]), [perawat, setPerawat] = useState<MasterPerawat[]>([]);
  const [poli, setPoli] = useState<MasterPoli[]>([]), [penjamin, setPenjamin] = useState<MasterPenjamin[]>([]);
  const [hospitalSettings, setSettings] = useState<HospitalInfo & { logoUrl?: string }>(DEFAULT_HOSPITAL_INFO);
  const [isDarkMode, setDark] = useState(false);
  const [cloudStatus, setCloud] = useState<CloudStatus>({ isConnected: false, isSyncing: false, pendingWrites: 0, lastSync: null, syncedKeysCount: 0 });
  const activeUser = { id: currentUser?.id || '', name: currentUser?.nama || '', role: currentUser?.roleId || '' } as User;
  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDarkMode);
    const toggle = () => setDark(old => !old);
    window.addEventListener('toggle-theme', toggle);
    return () => window.removeEventListener('toggle-theme', toggle);
  }, [isDarkMode]);
  useEffect(() => {
    setPasien([]); setKunjungan([]); setDokter([]); setPerawat([]); setPoli([]); setPenjamin([]); setSettings(DEFAULT_HOSPITAL_INFO);
    setCloud(old => ({ ...old, isConnected: false, pendingWrites: 0, lastSync: null }));
    if (!db || !currentUser?.aktif || ['patient', 'viewer'].includes(currentUser.roleId)) return;
    const fail = () => setCloud(old => ({ ...old, isConnected: false, isSyncing: false }));
    const watch = (name: string, setter: (value: any[]) => void) => onSnapshot(collection(db, name), { includeMetadataChanges: true }, snapshot => {
      setter(snapshot.docs.map(item => ({ ...item.data(), id: item.id })));
      setCloud(old => ({ ...old, isConnected: !snapshot.metadata.fromCache, isSyncing: snapshot.metadata.hasPendingWrites, pendingWrites: snapshot.metadata.hasPendingWrites ? 1 : 0, lastSync: snapshot.metadata.fromCache ? old.lastSync : new Date() }));
    }, fail);
    const stops = [watch('pasien', setPasien), watch('kunjungan', setKunjungan), watch('dokter', setDokter), watch('perawat', setPerawat)];
    stops.push(onSnapshot(doc(db, 'hospital_settings', 'main'), snapshot => {
      if (snapshot.exists()) setSettings({ ...DEFAULT_HOSPITAL_INFO, ...snapshot.data() });
    }, fail));
    // Public master catalogs are stored separately from patient records.
    stops.push(onSnapshot(doc(db, 'system_data', 'hospital_poli_master'), snapshot => {
      if (snapshot.exists()) { try { const data = JSON.parse(snapshot.data().data); if (Array.isArray(data)) setPoli(data); } catch {} }
    }, () => setPoli([])));
    stops.push(onSnapshot(doc(db, 'system_data', 'hospital_penjamin_master'), snapshot => {
      if (snapshot.exists()) { try { const data = JSON.parse(snapshot.data().data); if (Array.isArray(data)) setPenjamin(data); } catch {} }
    }, () => setPenjamin([])));
    return () => stops.forEach(stop => stop());
  }, [currentUser?.id, currentUser?.roleId, currentUser?.aktif]);
  const write = async (name: string, id: string, data: any, update = false) => {
    if (!db || !currentUser?.aktif) throw new Error('Sesi terverifikasi diperlukan.');
    const clean = JSON.parse(JSON.stringify({ ...data, updatedAt: new Date().toISOString() }));
    setCloud(old => ({ ...old, isSyncing: true }));
    try {
      if (update) await updateDoc(doc(db, name, id), clean); else await setDoc(doc(db, name, id), clean, { merge: true });
      setCloud(old => ({ ...old, isSyncing: false, isConnected: true, lastSync: new Date() }));
    } catch (error) { setCloud(old => ({ ...old, isSyncing: false, isConnected: false })); throw error; }
  };
  const updateHospitalSettings = async (settings: Partial<HospitalInfo & { logoUrl?: string }>) => { await write('hospital_settings', 'main', settings); };
  // Refresh server state, not a bulk upload of local browser/demo datasets.
  const syncAllData = async () => { if (!db || !currentUser?.aktif) throw new Error('Login diperlukan.'); await Promise.all(['pasien', 'kunjungan', 'dokter', 'perawat'].map(name => getDocsFromServer(collection(db, name)))); };
  return <Context.Provider value={{ activeUser, setActiveUser: () => {}, pasien, addPasien: p => write('pasien', String(p.id), p), updatePasien: (id, data) => write('pasien', id, data, true), kunjungan, addKunjungan: k => write('kunjungan', String(k.id), k), updateKunjunganStatus: (id, status) => write('kunjungan', id, { status }, true), dokter, addDokter: d => write('dokter', String(d.id), d), perawat, addPerawat: n => write('perawat', String(n.id), n), poli, penjamin, artikelBantuan: [], isDarkMode, toggleDarkMode: () => setDark(old => !old), isFirestoreSyncing: cloudStatus.isSyncing, cloudStatus, hospitalSettings, updateHospitalSettings, syncAllData }}>{children}</Context.Provider>;
}
export function useHospital() { const value = useContext(Context); if (!value) throw new Error('HospitalProvider diperlukan.'); return value; }
