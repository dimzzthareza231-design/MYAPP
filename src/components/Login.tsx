import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
export function Login({ embedded = false }: { embedded?: boolean }) {
  const { login, signInWithGoogle, loading } = useAuth();
  const [email, setEmail] = useState(''), [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const submit = async (google = false) => {
    setBusy(true); setMessage('');
    try { const result = google ? await signInWithGoogle() : await login(email, password); if (!result.success) setMessage(result.message); }
    finally { setBusy(false); setPassword(''); }
  };
  return <main className={`${embedded ? '' : 'min-h-screen'} grid place-items-center bg-slate-100 p-6`}><section className="w-full max-w-md rounded-2xl bg-white p-8 shadow-sm border border-slate-200">
    <p className="text-xs font-bold tracking-widest text-blue-800">MYITARU · AKSES TERLINDUNGI</p><h1 className="text-2xl font-bold my-3">Masuk aplikasi klinik</h1><p className="text-sm text-slate-600 mb-6">Gunakan akun dengan email terverifikasi dan hak akses yang sudah diaktifkan administrator.</p>
    <form onSubmit={event => { event.preventDefault(); void submit(); }} className="space-y-4"><label className="block text-sm">Email<input className="mt-1 block w-full border rounded-lg p-3" type="email" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)} /></label><label className="block text-sm">Kata sandi<input className="mt-1 block w-full border rounded-lg p-3" type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} /></label><button disabled={busy || loading} className="w-full rounded-lg bg-blue-900 text-white p-3 disabled:opacity-50">{busy ? 'Memverifikasi…' : 'Masuk'}</button></form>
    <button onClick={() => void submit(true)} disabled={busy || loading} className="w-full border rounded-lg p-3 my-4 disabled:opacity-50">Masuk dengan Google</button><p role="alert" className="text-sm text-red-700">{message}</p><p className="text-xs text-slate-500 mt-4">Akun bawaan, login berdasarkan No. RM/tanggal lahir, dan OTP demo tidak didukung.</p>
  </section></main>;
}
