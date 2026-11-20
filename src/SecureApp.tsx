import React, { useEffect, useState } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { Login } from './components/Login';
import './secure-app.css';
const staffRoles = ['super_admin', 'admin', 'direksi', 'dokter', 'perawat', 'bidan', 'apoteker', 'kasir', 'pendaftaran', 'rekam_medis', 'laboran', 'radiografer', 'manajemen_mutu', 'gizi', 'rehab_medik', 'it_support'];
async function request(path: string, init?: RequestInit) {
  const response = await fetch(path, init);
  const value = await response.json();
  if (!response.ok) throw new Error(value.error || 'Permintaan gagal.');
  return value;
}
function Account() {
  const { currentUser: user, loading, logout } = useAuth();
  const [patients, setPatients] = useState<any[]>([]), [dossier, setDossier] = useState<any>(null);
  const [nextPage, setNextPage] = useState<string | null>(null);
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const [name, setName] = useState(''), [rm, setRm] = useState('');
  const staff = !!user && staffRoles.includes(user.roleId);
  async function load(page?: string) {
    setBusy(true); setError('');
    try {
      if (staff) {
        const value = await request('/api/v1/patients' + (page ? `?pageToken=${encodeURIComponent(page)}` : ''));
        setPatients(previous => page ? [...previous, ...value.data] : value.data); setNextPage(value.nextPageToken);
      } else { const value = await request('/api/patient/dossier'); setDossier(value.dossier); }
    } catch (e) { setError(e instanceof Error ? e.message : 'Data tidak tersedia.'); }
    finally { setBusy(false); }
  }
  useEffect(() => {
    setPatients([]); setDossier(null); setNextPage(null); setError('');
    if (user) void load();
  }, [user?.id, user?.roleId]);
  if (loading) return <main className="account"><p role="status">Memverifikasi sesi…</p></main>;
  if (!user) return <Login />;
  const canRegister = ['super_admin', 'admin', 'pendaftaran', 'dokter', 'perawat', 'bidan', 'rekam_medis'].includes(user.roleId);
  return <><header className="account-header"><strong>MYITARU · Aplikasi utama</strong><div>{user.nama} · {user.roleId} <button className="secondary" onClick={() => void logout()}>Keluar</button></div></header>
    <main className="account"><h1>{staff ? 'Area operasional terverifikasi' : 'Portal pasien'}</h1>
      <p className="notice">Tahap keamanan awal: data di bawah berasal dari Firestore, bukan data contoh. Modul lama, AI klinis, integrasi eksternal, dan backup otomatis belum dinyatakan siap produksi.</p>
      {error && <p role="alert" className="error">{error}</p>}
      {staff ? <section className="card"><div className="row"><h2>Daftar pasien</h2><button disabled={busy} onClick={() => void load()}>Muat ulang</button></div>
        {busy && <p role="status">Memuat…</p>}
        {!busy && !patients.length && !error && <p>Belum ada data pasien pada database yang dikonfigurasi.</p>}
        {!!patients.length && <table><thead><tr><th>No. RM</th><th>Nama pasien</th></tr></thead><tbody>{patients.map(patient => <tr key={patient.id}><td>{patient.no_rm}</td><td>{patient.nama}</td></tr>)}</tbody></table>}
        {nextPage && <button disabled={busy} onClick={() => void load(nextPage)}>Muat berikutnya</button>}
      </section> : dossier && <section className="card"><h2>Data pasien Anda</h2><p><strong>{dossier.patient.nama}</strong> · {dossier.patient.no_rm}</p><h3>Kunjungan</h3>{dossier.visits.length ? <ul>{dossier.visits.map((visit: any) => <li key={visit.id}>{visit.tanggal} · {visit.status}</li>)}</ul> : <p>Belum ada kunjungan yang tersedia.</p>}</section>}
      {canRegister && <section className="card"><h2>Pendaftaran dasar</h2><p>Nomor RM harus berasal dari proses penomoran resmi klinik. Form ini tidak menghasilkan nomor atau keberhasilan simulasi.</p><form onSubmit={async event => {
        event.preventDefault(); setBusy(true); setError('');
        try { await request('/api/v1/patients', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nama: name, no_rm: rm }) }); setName(''); setRm(''); await load(); }
        catch (e) { setError(e instanceof Error ? e.message : 'Penyimpanan gagal.'); } finally { setBusy(false); }
      }}><label>Nama pasien<input value={name} maxLength={160} required onChange={event => setName(event.target.value)}/></label><label>Nomor RM<input value={rm} maxLength={40} required onChange={event => setRm(event.target.value)}/></label><button disabled={busy}>Simpan ke Firestore</button></form></section>}
      <section className="card"><h2>Status layanan lanjutan</h2><ul><li>BPJS / SATUSEHAT: belum dikonfigurasi.</li><li>Backup otomatis: belum aktif; perlu uji pemulihan.</li><li>AI klinis: dinonaktifkan sampai validasi dan kebijakan data disetujui.</li><li>Modul lama: hanya tersedia dalam mode pratinjau pengembangan yang eksplisit.</li></ul></section>
      {['admin', 'super_admin'].includes(user.roleId) && <section className="card"><h2>Pengelolaan identitas</h2><p>Buat akun melalui Firebase Authentication. Tetapkan role, status aktif, dan tautan pasien pada dokumen <code>users/UID</code> melalui proses administrasi tepercaya. Aplikasi tidak membuat akun lokal atau memberikan role administrator secara otomatis.</p></section>}
    </main></>;
}
export default function SecureApp() { return <AuthProvider><Account /></AuthProvider>; }
