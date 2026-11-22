import React, { useEffect, useState } from 'react';
import { Lock, Save, ShieldCheck, Trash2, UserPlus, Users } from 'lucide-react';
import toast from 'react-hot-toast';
import { EmptyState, SkeletonList } from '../ui';
import {
  AccountApiError,
  accountApi,
  FAMILY_RELATION_LABELS,
  formatDateId,
  type FamilyRelation,
  type PatientProfile
} from './accountApi';
import type { FamilyState } from './useFamily';

const inputClass =
  'w-full min-h-[44px] rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0B3D91]';
const primaryButton =
  'inline-flex items-center justify-center gap-2 min-h-[44px] px-4 rounded-xl bg-[#0B3D91] text-white text-sm font-bold cursor-pointer disabled:opacity-60';
const labelClass = 'block text-sm font-semibold text-slate-700 mb-1';

const ContactForm: React.FC<{ profile: PatientProfile; token: string | null; onSaved: (p: PatientProfile) => void }> = ({
  profile,
  token,
  onSaved
}) => {
  const [alamat, setAlamat] = useState(profile.alamat);
  const [email, setEmail] = useState(profile.email);
  const [kdNama, setKdNama] = useState(profile.kontak_darurat?.nama ?? '');
  const [kdHubungan, setKdHubungan] = useState(profile.kontak_darurat?.hubungan ?? '');
  const [kdHp, setKdHp] = useState(profile.kontak_darurat?.no_hp ?? '');
  const [saving, setSaving] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFieldError(null);
    const anyKd = kdNama.trim() || kdHubungan.trim() || kdHp.trim();
    setSaving(true);
    try {
      const res = await accountApi.updateProfile(
        {
          alamat: alamat.trim(),
          email: email.trim(),
          kontak_darurat: anyKd ? { nama: kdNama.trim(), hubungan: kdHubungan.trim(), no_hp: kdHp.trim() } : null
        },
        token
      );
      onSaved(res.profile);
      toast.success('Kontak berhasil diperbarui.');
    } catch (error) {
      const message = (error as Error).message;
      setFieldError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4" aria-labelledby="contact-heading">
      <h3 id="contact-heading" className="text-base font-extrabold text-slate-900">Kontak</h3>
      <div>
        <span className={labelClass}>Nomor HP (WhatsApp)</span>
        <div className="flex items-center gap-2 min-h-[44px] rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700">
          <Lock className="w-4 h-4 text-slate-500" aria-hidden="true" />
          <span className="font-mono">{profile.no_hp || '-'}</span>
        </div>
        <p className="text-xs text-slate-600 mt-1">{profile.no_hp_note}</p>
      </div>
      <div>
        <label htmlFor="pf-alamat" className={labelClass}>Alamat</label>
        <textarea id="pf-alamat" value={alamat} onChange={(e) => setAlamat(e.target.value)} rows={3} maxLength={500} className={inputClass} required minLength={5} />
      </div>
      <div>
        <label htmlFor="pf-email" className={labelClass}>Email</label>
        <input id="pf-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={254} className={inputClass} autoComplete="email" />
      </div>
      <fieldset className="space-y-3">
        <legend className="text-sm font-bold text-slate-800">Kontak darurat</legend>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor="pf-kd-nama" className={labelClass}>Nama</label>
            <input id="pf-kd-nama" value={kdNama} onChange={(e) => setKdNama(e.target.value)} maxLength={120} className={inputClass} />
          </div>
          <div>
            <label htmlFor="pf-kd-hub" className={labelClass}>Hubungan</label>
            <input id="pf-kd-hub" value={kdHubungan} onChange={(e) => setKdHubungan(e.target.value)} maxLength={40} className={inputClass} placeholder="mis. Istri, Ayah" />
          </div>
        </div>
        <div>
          <label htmlFor="pf-kd-hp" className={labelClass}>Nomor HP</label>
          <input id="pf-kd-hp" type="tel" inputMode="tel" value={kdHp} onChange={(e) => setKdHp(e.target.value)} maxLength={40} className={inputClass} placeholder="08xxxxxxxxxx" />
        </div>
      </fieldset>
      {fieldError && <p role="alert" className="text-sm text-rose-700">{fieldError}</p>}
      <button type="submit" disabled={saving} className={primaryButton}>
        <Save className="w-4 h-4" aria-hidden="true" /> {saving ? 'Menyimpan...' : 'Simpan Kontak'}
      </button>
    </form>
  );
};

const AddFamilyForm: React.FC<{ token: string | null; onLinked: () => void; onCancel: () => void }> = ({ token, onLinked, onCancel }) => {
  const [noRm, setNoRm] = useState('');
  const [hubungan, setHubungan] = useState<FamilyRelation>('anak');
  const [request, setRequest] = useState<{ id: string; maskedPhone: string; message: string } | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendCode = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await accountApi.requestLink(noRm.trim(), hubungan, token);
      setRequest({ id: res.request_id, maskedPhone: res.masked_phone, message: res.message });
      setCode('');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const verify = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!request) return;
    setError(null);
    setBusy(true);
    try {
      const res = await accountApi.verifyLink(request.id, code.trim(), token);
      toast.success(`${res.dependent.nama} berhasil ditautkan.`);
      onLinked();
    } catch (err) {
      const apiErr = err as AccountApiError;
      setError(apiErr.message);
      if (apiErr.code === 'OTP_LOCKED' || apiErr.code === 'FAMILY_REQUEST_EXPIRED') setRequest(null);
    } finally {
      setBusy(false);
    }
  };

  if (!request) {
    return (
      <form onSubmit={sendCode} className="rounded-xl border border-slate-200 p-4 space-y-3">
        <p className="text-sm text-slate-700">
          Kode verifikasi akan dikirim via WhatsApp ke <strong>nomor HP yang terdaftar atas nama anggota keluarga</strong> di rumah sakit.
          Bila nomor itu milik Anda (mis. anak), kode sampai ke Anda; bila tidak, mintalah kode dari pemiliknya.
        </p>
        <div>
          <label htmlFor="fam-rm" className={labelClass}>No. RM anggota keluarga</label>
          <input id="fam-rm" value={noRm} onChange={(e) => setNoRm(e.target.value)} className={`${inputClass} font-mono uppercase`} required minLength={3} maxLength={64} autoComplete="off" />
        </div>
        <div>
          <label htmlFor="fam-hub" className={labelClass}>Hubungan</label>
          <select id="fam-hub" value={hubungan} onChange={(e) => setHubungan(e.target.value as FamilyRelation)} className={inputClass}>
            {(Object.keys(FAMILY_RELATION_LABELS) as FamilyRelation[]).map((key) => (
              <option key={key} value={key}>{FAMILY_RELATION_LABELS[key]}</option>
            ))}
          </select>
        </div>
        {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
        <div className="flex flex-wrap gap-2">
          <button type="submit" disabled={busy} className={primaryButton}>{busy ? 'Mengirim...' : 'Kirim Kode'}</button>
          <button type="button" onClick={onCancel} className="min-h-[44px] px-4 rounded-xl border border-slate-200 text-sm font-bold text-slate-700 cursor-pointer">Batal</button>
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={verify} className="rounded-xl border border-slate-200 p-4 space-y-3">
      <p className="text-sm text-slate-700">{request.message}</p>
      <p className="text-sm text-slate-700">Tujuan: <span className="font-mono font-bold">{request.maskedPhone}</span></p>
      <div>
        <label htmlFor="fam-code" className={labelClass}>Kode verifikasi (6 digit)</label>
        <input
          id="fam-code"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          inputMode="numeric"
          autoComplete="one-time-code"
          className={`${inputClass} font-mono tracking-[0.4em] text-center text-lg`}
          required
          pattern="\d{6}"
        />
      </div>
      {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={busy || code.length !== 6} className={primaryButton}>{busy ? 'Memverifikasi...' : 'Tautkan'}</button>
        <button type="button" onClick={() => setRequest(null)} className="min-h-[44px] px-4 rounded-xl border border-slate-200 text-sm font-bold text-slate-700 cursor-pointer">Ubah data</button>
      </div>
    </form>
  );
};

const FamilySection: React.FC<{ token: string | null; familyState: FamilyState; onSwitched: (token: string) => void }> = ({
  token,
  familyState,
  onSwitched
}) => {
  const { family, status, reload } = familyState;
  const [adding, setAdding] = useState(false);
  const [busyRm, setBusyRm] = useState<string | null>(null);

  const unlink = async (rm: string, nama: string, asGuardian: boolean) => {
    const question = asGuardian
      ? `Lepas tautan akun ${nama}? Anda tidak lagi dapat mengakses akunnya.`
      : `Cabut akses wali ${nama} ke akun Anda?`;
    if (!window.confirm(question)) return;
    setBusyRm(rm);
    try {
      await accountApi.unlink(rm, token);
      toast.success('Tautan keluarga dilepas.');
      await reload();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusyRm(null);
    }
  };

  const switchTo = async (rm: string) => {
    setBusyRm(rm);
    try {
      const res = await accountApi.switchTo(rm, token);
      onSwitched(res.token);
      toast.success(`Mengakses akun ${res.patient?.nama ?? rm} sebagai wali`);
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusyRm(null);
    }
  };

  return (
    <section className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4" aria-labelledby="family-heading">
      <div className="flex items-center justify-between gap-2">
        <h3 id="family-heading" className="text-base font-extrabold text-slate-900 flex items-center gap-2">
          <Users className="w-5 h-5 text-[#0B3D91]" aria-hidden="true" /> Akun Keluarga
        </h3>
        {family?.can_manage && !adding && family.dependents.length < family.max_dependents && (
          <button type="button" onClick={() => setAdding(true)} className="inline-flex items-center gap-1.5 min-h-[40px] px-3 rounded-xl border border-[#0B3D91] text-[#0B3D91] text-sm font-bold cursor-pointer">
            <UserPlus className="w-4 h-4" aria-hidden="true" /> Tambah
          </button>
        )}
      </div>

      {status === 'loading' && !family ? (
        <SkeletonList rows={1} label="Memuat akun keluarga..." />
      ) : status === 'error' && !family ? (
        <EmptyState tone="error" title="Akun keluarga belum dapat dimuat" action={<button type="button" onClick={reload} className={primaryButton}>Coba Lagi</button>} />
      ) : family ? (
        <>
          {!family.can_manage && (
            <p className="text-sm text-amber-900 bg-amber-50 rounded-xl p-3">Kembali ke akun Anda sendiri untuk menambah atau melepas anggota keluarga.</p>
          )}
          {adding && family.can_manage && (
            <AddFamilyForm
              token={token}
              onCancel={() => setAdding(false)}
              onLinked={() => {
                setAdding(false);
                void reload();
              }}
            />
          )}
          {family.dependents.length === 0 && !adding ? (
            <p className="text-sm text-slate-600">Belum ada anggota keluarga yang ditautkan.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {family.dependents.map((d) => (
                <li key={d.no_rm} className="py-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-900 truncate">{d.nama}</p>
                    <p className="text-xs text-slate-600 font-mono">{FAMILY_RELATION_LABELS[d.hubungan]} · {d.no_rm} · sejak {formatDateId(d.linked_at)}</p>
                  </div>
                  <div className="flex gap-2">
                    {family.acting_as?.no_rm !== d.no_rm && (
                      <button type="button" disabled={busyRm !== null} onClick={() => switchTo(d.no_rm)} className="min-h-[40px] px-3 rounded-xl bg-blue-50 text-[#0B3D91] text-sm font-bold cursor-pointer disabled:opacity-60">
                        Buka akun
                      </button>
                    )}
                    {family.can_manage && (
                      <button type="button" disabled={busyRm !== null} onClick={() => unlink(d.no_rm, d.nama, true)} aria-label={`Lepas tautan ${d.nama}`} className="min-h-[40px] min-w-[40px] rounded-xl border border-rose-200 text-rose-700 flex items-center justify-center cursor-pointer disabled:opacity-60">
                        <Trash2 className="w-4 h-4" aria-hidden="true" />
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
          {family.guardians.length > 0 && (
            <div className="pt-2 border-t border-slate-100 space-y-2">
              <p className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-600" aria-hidden="true" /> Wali yang dapat mengakses akun Anda
              </p>
              <ul className="space-y-2">
                {family.guardians.map((g) => (
                  <li key={g.no_rm} className="flex items-center justify-between gap-2 text-sm">
                    <span className="text-slate-700">{g.nama} <span className="text-xs text-slate-500">(sejak {formatDateId(g.linked_at)})</span></span>
                    <button type="button" disabled={busyRm !== null} onClick={() => unlink(g.no_rm, g.nama, false)} className="min-h-[40px] px-3 rounded-xl border border-rose-200 text-rose-700 text-sm font-bold cursor-pointer disabled:opacity-60">
                      Cabut akses
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      ) : null}
    </section>
  );
};

export const ProfileScreen: React.FC<{
  token: string | null;
  familyState: FamilyState;
  onSwitched: (token: string) => void;
}> = ({ token, familyState, onSwitched }) => {
  const [profile, setProfile] = useState<PatientProfile | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  const load = async () => {
    setStatus('loading');
    try {
      const res = await accountApi.profile(token);
      setProfile(res.profile);
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  };

  useEffect(() => {
    void load();
  }, [token]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
      <div className="lg:col-span-7 space-y-4">
        {status === 'loading' ? (
          <SkeletonList rows={2} label="Memuat profil..." />
        ) : status === 'error' || !profile ? (
          <EmptyState tone="error" title="Profil belum dapat dimuat" action={<button type="button" onClick={load} className={primaryButton}>Coba Lagi</button>} />
        ) : (
          <>
            <section className="bg-white rounded-2xl border border-slate-200 p-5 space-y-2" aria-labelledby="identity-heading">
              <h3 id="identity-heading" className="text-base font-extrabold text-slate-900">Identitas</h3>
              <dl className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-1.5 text-sm text-slate-700">
                <dt>Nama</dt><dd className="font-bold text-slate-900">{profile.nama}</dd>
                <dt>No. RM</dt><dd className="font-mono font-bold text-slate-900">{profile.no_rm}</dd>
                <dt>Tanggal lahir</dt><dd>{profile.tanggal_lahir ? formatDateId(profile.tanggal_lahir) : '-'}</dd>
                <dt>Penjamin</dt><dd>{profile.penjamin || '-'}</dd>
              </dl>
              <p className="text-xs text-slate-600">Perubahan identitas (nama, tanggal lahir, NIK, nomor HP) dilakukan di loket pendaftaran.</p>
            </section>
            <ContactForm key={profile.no_rm} profile={profile} token={token} onSaved={setProfile} />
          </>
        )}
      </div>
      <div className="lg:col-span-5 space-y-4">
        <FamilySection token={token} familyState={familyState} onSwitched={onSwitched} />
      </div>
    </div>
  );
};
