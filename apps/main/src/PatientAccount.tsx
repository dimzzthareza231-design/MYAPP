import React, { useEffect, useState } from 'react';
import { useAuth } from '../../../src/contexts/AuthContext';
export default function PatientAccount() {
  const { currentUser, logout } = useAuth();
  const [dossier, setDossier] = useState<any>(null), [message, setMessage] = useState('Memuat data terverifikasi…');
  useEffect(() => {
    const controller = new AbortController(); setDossier(null);
    void fetch('/api/patient/dossier', { signal: controller.signal }).then(async response => {
      const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Data belum tersedia.');
      setDossier(data.dossier); setMessage('');
    }).catch(error => { if (!controller.signal.aborted) setMessage(error.message); });
    return () => controller.abort();
  }, [currentUser?.id]);
  return <main className="max-w-3xl mx-auto p-6"><header className="flex justify-between gap-4 mb-8"><h1 className="text-2xl font-bold">Portal pasien</h1><button onClick={() => void logout()} className="border rounded p-2">Keluar</button></header><p>Selamat datang, {currentUser?.nama}.</p><p role="status" className="my-4">{message}</p>{dossier && <section className="bg-white border rounded-xl p-5 my-5"><h2 className="font-bold">{dossier.patient.nama}</h2><p>No. RM: {dossier.patient.no_rm}</p><h3 className="font-bold mt-5">Kunjungan</h3>{dossier.visits.length ? <ul>{dossier.visits.map((visit: any) => <li key={visit.id} className="border-t py-3">{visit.tanggal} · {visit.status}</li>)}</ul> : <p>Belum ada kunjungan yang tersedia.</p>}</section>}<p className="text-sm text-slate-500">Data hanya diambil berdasarkan hubungan akun–pasien yang ditetapkan administrator, bukan email atau No. RM yang dikirim pengguna.</p></main>;
}
