import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { isFirebaseConfigured } from '../lib/firebase';
export function Login({ embedded = false }: { embedded?: boolean }) {
  const { login, signInWithGoogle, loading, authError } = useAuth();
  const [email, setEmail] = useState(''), [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const disabled = busy || loading || !isFirebaseConfigured;
  return <section className={embedded ? 'login-card' : 'login-page'}><div className="login-card">
    <p className="eyebrow">MYITARU · APLIKASI UTAMA</p><h1>Masuk ke akun Anda</h1>
    <p>Gunakan akun Firebase yang sudah diverifikasi dan diaktifkan pengelola. Tidak ada akun bawaan atau kata sandi demo.</p>
    <form onSubmit={async event => { event.preventDefault(); setBusy(true); setMessage(''); try { const result = await login(email, password); if (!result.success) setMessage(result.message); } finally { setBusy(false); setPassword(''); } }}>
      <label>Email<input type="email" autoComplete="username" required value={email} onChange={event => setEmail(event.target.value)} disabled={disabled}/></label>
      <label>Kata sandi<input type="password" autoComplete="current-password" required value={password} onChange={event => setPassword(event.target.value)} disabled={disabled}/></label>
      <button disabled={disabled} type="submit">{busy ? 'Memverifikasi…' : 'Masuk'}</button>
    </form>
    <button className="secondary" disabled={disabled} onClick={async () => { setBusy(true); setMessage(''); try { const result = await signInWithGoogle(); if (!result.success) setMessage(result.message); } finally { setBusy(false); } }}>Masuk dengan Google</button>
    {(message || authError) && <p role="alert" className="error">{message || authError}</p>}
    <small>Akun yang belum diaktifkan tidak memperoleh akses operasional otomatis.</small>
  </div></section>;
}
