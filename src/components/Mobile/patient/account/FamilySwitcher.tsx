import React, { useState } from 'react';
import { ArrowLeftRight, Check, MessageSquareHeart, UserCog, Users } from 'lucide-react';
import toast from 'react-hot-toast';
import { Modal } from '../ui';
import { accountApi, FAMILY_RELATION_LABELS } from './accountApi';
import type { FamilyState } from './useFamily';

const iconButtonClass =
  'relative rounded-xl bg-white/10 hover:bg-white/20 transition cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center disabled:opacity-60';

/** Tombol header: pilih akun (diri sendiri / tanggungan) + pintasan profil & masukan. */
export const FamilySwitcher: React.FC<{
  token: string | null;
  familyState: FamilyState;
  currentRm?: string;
  onSwitched: (token: string) => void;
  onOpenProfile: () => void;
  onOpenFeedback: () => void;
}> = ({ token, familyState, currentRm, onSwitched, onOpenProfile, onOpenFeedback }) => {
  const [open, setOpen] = useState(false);
  const [busyRm, setBusyRm] = useState<string | null>(null);
  const { family } = familyState;
  const accounts = family
    ? [
        { no_rm: family.owner.no_rm, nama: family.owner.nama || 'Akun saya', label: 'Akun saya' },
        ...family.dependents.map((d) => ({ no_rm: d.no_rm, nama: d.nama, label: FAMILY_RELATION_LABELS[d.hubungan] }))
      ]
    : [];
  const activeRm = family?.acting_as?.no_rm ?? family?.owner.no_rm ?? currentRm;

  const switchTo = async (rm: string) => {
    if (rm === activeRm) return;
    setBusyRm(rm);
    try {
      const res = await accountApi.switchTo(rm, token);
      setOpen(false);
      onSwitched(res.token);
      toast.success(res.acting_as_guardian ? `Mengakses akun ${res.patient?.nama ?? rm} sebagai wali` : 'Kembali ke akun Anda');
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusyRm(null);
    }
  };

  const go = (fn: () => void) => {
    setOpen(false);
    fn();
  };

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label="Akun & keluarga" className={iconButtonClass}>
        <Users className="w-5 h-5" aria-hidden="true" />
        {family?.acting_as && (
          <span aria-hidden="true" className="absolute top-2 right-2 w-2 h-2 rounded-full bg-amber-300 ring-2 ring-[#0B3D91]" />
        )}
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Akun & Keluarga" closeLabel="Tutup pilihan akun">
        <div className="space-y-4">
          {accounts.length > 1 ? (
            <ul className="space-y-2" aria-label="Pilih akun">
              {accounts.map((a) => {
                const isActive = a.no_rm === activeRm;
                return (
                  <li key={a.no_rm}>
                    <button
                      type="button"
                      onClick={() => switchTo(a.no_rm)}
                      disabled={busyRm !== null}
                      aria-current={isActive ? 'true' : undefined}
                      className={`w-full min-h-[52px] rounded-xl border px-3.5 py-2 flex items-center justify-between gap-3 text-left cursor-pointer disabled:opacity-60 ${
                        isActive ? 'border-[#0B3D91] bg-blue-50' : 'border-slate-200 hover:border-[#0B3D91]'
                      }`}
                    >
                      <span className="min-w-0">
                        <span className="block text-sm font-bold text-slate-900 truncate">{a.nama}</span>
                        <span className="block text-xs text-slate-600 font-mono">
                          {a.label} · {a.no_rm}
                        </span>
                      </span>
                      {isActive ? (
                        <Check className="w-5 h-5 text-[#0B3D91] shrink-0" aria-label="Akun aktif" />
                      ) : (
                        <ArrowLeftRight className={`w-4 h-4 text-slate-500 shrink-0 ${busyRm === a.no_rm ? 'animate-pulse' : ''}`} aria-hidden="true" />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-slate-600">
              Tautkan akun anak atau orang tua di halaman Profil untuk mengelola janji temu dan hasil mereka.
            </p>
          )}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => go(onOpenProfile)}
              className="min-h-[48px] rounded-xl border border-slate-200 hover:border-[#0B3D91] text-sm font-bold text-slate-800 flex items-center justify-center gap-2 cursor-pointer"
            >
              <UserCog className="w-4 h-4" aria-hidden="true" /> Profil
            </button>
            <button
              type="button"
              onClick={() => go(onOpenFeedback)}
              className="min-h-[48px] rounded-xl border border-slate-200 hover:border-[#0B3D91] text-sm font-bold text-slate-800 flex items-center justify-center gap-2 cursor-pointer"
            >
              <MessageSquareHeart className="w-4 h-4" aria-hidden="true" /> Masukan
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
};

/** Pita peringatan saat wali sedang mengakses akun tanggungan. */
export const GuardianBanner: React.FC<{
  familyState: FamilyState;
  token: string | null;
  onSwitched: (token: string) => void;
}> = ({ familyState, token, onSwitched }) => {
  const [busy, setBusy] = useState(false);
  const family = familyState.family;
  if (!family?.acting_as) return null;
  const back = async () => {
    setBusy(true);
    try {
      const res = await accountApi.switchTo(family.owner.no_rm, token);
      onSwitched(res.token);
      toast.success('Kembali ke akun Anda');
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div role="status" className="rounded-2xl border border-amber-300 bg-amber-50 text-amber-950 p-3.5 flex flex-wrap items-center justify-between gap-2 text-sm">
      <p>
        Anda mengakses akun <strong>{family.acting_as.nama}</strong> sebagai wali ({family.owner.nama}). Semua aktivitas tercatat atas nama Anda.
      </p>
      <button
        type="button"
        onClick={back}
        disabled={busy}
        className="min-h-[40px] px-3 rounded-xl bg-amber-900 text-white text-sm font-bold cursor-pointer disabled:opacity-60"
      >
        Kembali ke akun saya
      </button>
    </div>
  );
};
