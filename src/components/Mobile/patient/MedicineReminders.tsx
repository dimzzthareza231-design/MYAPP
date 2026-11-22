import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlarmClock, BellOff, BellRing, Info, Plus, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { Modal } from './ui';
import {
  dosesPerDay,
  loadReminders,
  MED_REMINDER_CHANGED_EVENT,
  MED_REMINDER_STORAGE_KEY,
  safeLocalStorage,
  saveReminders,
  sortTimes,
  suggestReminderTimes,
  upcomingReminders,
  type MedicineReminder
} from './reminders';

export interface ReminderMedSource {
  name: string;
  dose: string;
  instruction: string;
}

export function reminderIdFor(name: string): string {
  return `med-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60)}`;
}

type NotifPermission = NotificationPermission | 'unsupported';

function currentPermission(): NotifPermission {
  try {
    return typeof Notification === 'undefined' ? 'unsupported' : Notification.permission;
  } catch {
    return 'unsupported';
  }
}

async function showLocalNotification(title: string, body: string, tag: string): Promise<boolean> {
  if (currentPermission() !== 'granted') return false;
  const options: NotificationOptions = { body, tag, icon: '/pwa-192x192.png', badge: '/pwa-192x192.png' };
  try {
    const reg = await navigator.serviceWorker?.getRegistration?.();
    if (reg) {
      await reg.showNotification(title, options);
      return true;
    }
  } catch {
    // lanjut ke Notification API biasa
  }
  try {
    new Notification(title, options);
    return true;
  } catch {
    return false;
  }
}

function emitChanged() {
  try {
    window.dispatchEvent(new Event(MED_REMINDER_CHANGED_EVENT));
  } catch {
    // abaikan
  }
}

/**
 * Penjadwal pengingat obat selama aplikasi terbuka (termasuk tab di latar belakang).
 * Tidak ada push dari server: bila aplikasi/peramban ditutup, pengingat tidak berbunyi.
 */
export const MedicineReminderRunner: React.FC<{ owner: string | null | undefined }> = ({ owner }) => {
  const [version, setVersion] = useState(0);
  const firedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const bump = () => setVersion((v) => v + 1);
    const onStorage = (e: StorageEvent) => {
      if (e.key === MED_REMINDER_STORAGE_KEY) bump();
    };
    window.addEventListener(MED_REMINDER_CHANGED_EVENT, bump);
    window.addEventListener('storage', onStorage);
    document.addEventListener('visibilitychange', bump);
    return () => {
      window.removeEventListener(MED_REMINDER_CHANGED_EVENT, bump);
      window.removeEventListener('storage', onStorage);
      document.removeEventListener('visibilitychange', bump);
    };
  }, []);

  useEffect(() => {
    if (!owner) return;
    const reminders = loadReminders(safeLocalStorage(), owner);
    const next = upcomingReminders(reminders, new Date())[0];
    if (!next) return;
    const delay = next.at.getTime() - Date.now();
    // Batasi 30 menit agar jadwal dihitung ulang bila perangkat sempat tidur.
    const timer = window.setTimeout(() => {
      const now = Date.now();
      if (Math.abs(now - next.at.getTime()) <= 5 * 60 * 1000) {
        const due = upcomingReminders(reminders, new Date(next.at.getTime() - 1000), 60 * 1000);
        for (const item of due) {
          const key = `${item.reminder.id}@${item.at.getTime()}`;
          if (firedRef.current.has(key)) continue;
          firedRef.current.add(key);
          const body = [item.reminder.dose, item.reminder.instruction].filter(Boolean).join(' · ') || 'Sesuai resep dokter';
          showLocalNotification(`Waktunya minum ${item.reminder.medName}`, body, key);
          toast(`Waktunya minum ${item.reminder.medName}`, { icon: '💊', duration: 10_000 });
        }
      }
      setVersion((v) => v + 1);
    }, Math.max(1000, Math.min(delay, 30 * 60 * 1000)));
    return () => window.clearTimeout(timer);
  }, [owner, version]);

  return null;
};

/* ────────────────────────────── Dialog atur jam ────────────────────────────── */

const ReminderEditor: React.FC<{
  med: ReminderMedSource;
  existing: MedicineReminder | null;
  onSave: (times: string[]) => void;
  onCancel: () => void;
}> = ({ med, existing, onSave, onCancel }) => {
  const suggested = useMemo(() => suggestReminderTimes(med.instruction), [med.instruction]);
  const [times, setTimes] = useState<string[]>(() =>
    existing?.times.length ? existing.times : suggested.length ? suggested : ['07:00']
  );
  const valid = sortTimes(times);
  const doses = dosesPerDay(med.instruction);

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid.length > 0) onSave(valid);
      }}
    >
      <div className="rounded-xl bg-slate-50 border border-slate-200 p-3.5 text-sm space-y-0.5">
        <p className="font-bold text-slate-900">{med.name}</p>
        <p className="text-slate-700">
          {[med.dose, med.instruction].filter(Boolean).join(' · ') || 'Aturan pakai tidak tercatat'}
        </p>
        <p className="text-slate-600">
          {doses
            ? `Usulan ${doses} jam per hari berdasarkan aturan pakai. Sesuaikan dengan anjuran dokter/apoteker.`
            : 'Aturan pakai tidak dapat dibaca otomatis. Isi jam sesuai anjuran dokter/apoteker.'}
        </p>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-bold text-slate-700 mb-1">Jam pengingat</legend>
        {times.map((t, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <label className="sr-only" htmlFor={`rem-time-${idx}`}>
              Jam pengingat ke-{idx + 1}
            </label>
            <input
              id={`rem-time-${idx}`}
              type="time"
              value={t}
              onChange={(e) => setTimes((list) => list.map((x, i) => (i === idx ? e.target.value : x)))}
              className="flex-1 px-3.5 min-h-[48px] rounded-xl border border-slate-300 text-base bg-white outline-none focus:border-[#0B3D91] focus:ring-2 focus:ring-[#0B3D91]/15"
            />
            <button
              type="button"
              disabled={times.length <= 1}
              onClick={() => setTimes((list) => list.filter((_, i) => i !== idx))}
              aria-label={`Hapus jam pengingat ke-${idx + 1}`}
              className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-rose-700 hover:bg-rose-50 cursor-pointer disabled:opacity-40"
            >
              <Trash2 className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        ))}
        {times.length < 6 && (
          <button
            type="button"
            onClick={() => setTimes((list) => [...list, '12:00'])}
            className="min-h-[44px] px-3 rounded-xl border border-dashed border-slate-400 text-slate-800 text-sm font-bold cursor-pointer inline-flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            Tambah jam
          </button>
        )}
      </fieldset>

      {valid.length === 0 && (
        <p role="alert" className="text-sm font-semibold text-rose-700">
          Isi minimal satu jam yang valid.
        </p>
      )}

      <div className="grid grid-cols-2 gap-2.5">
        <button type="button" onClick={onCancel} className="min-h-[48px] rounded-xl bg-slate-100 text-slate-800 font-bold text-sm cursor-pointer">
          Batal
        </button>
        <button
          type="submit"
          disabled={valid.length === 0}
          className="min-h-[48px] rounded-xl bg-[#0B3D91] text-white font-bold text-sm cursor-pointer disabled:opacity-60"
        >
          Simpan Pengingat
        </button>
      </div>
    </form>
  );
};

/* ────────────────────────────── Panel ────────────────────────────── */

export const MedicineReminderPanel: React.FC<{ owner: string; meds: ReminderMedSource[] }> = ({ owner, meds }) => {
  const [reminders, setReminders] = useState<MedicineReminder[]>(() => loadReminders(safeLocalStorage(), owner));
  const [permission, setPermission] = useState<NotifPermission>(currentPermission);
  const [editing, setEditing] = useState<ReminderMedSource | null>(null);
  const storageAvailable = useMemo(() => safeLocalStorage() !== null, []);

  useEffect(() => {
    setReminders(loadReminders(safeLocalStorage(), owner));
  }, [owner]);

  const persist = useCallback(
    (next: MedicineReminder[]) => {
      setReminders(next);
      if (!saveReminders(safeLocalStorage(), owner, next)) {
        toast.error('Pengingat tidak dapat disimpan di perangkat ini (penyimpanan diblokir).');
      }
      emitChanged();
    },
    [owner]
  );

  const requestPermission = async () => {
    if (permission === 'unsupported') return;
    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      if (result === 'granted') toast.success('Notifikasi pengingat diizinkan di perangkat ini.');
      else toast.error('Izin notifikasi ditolak. Pengingat hanya tampil di dalam aplikasi.');
    } catch {
      setPermission(currentPermission());
    }
  };

  const byId = new Map(reminders.map((r) => [r.id, r]));
  const medIds = new Set(meds.map((m) => reminderIdFor(m.name)));
  const orphaned = reminders.filter((r) => !medIds.has(r.id));

  const renderRow = (med: ReminderMedSource, reminder: MedicineReminder | null) => (
    <li key={reminderIdFor(med.name)} className="rounded-xl bg-slate-50 border border-slate-200/70 p-3.5 space-y-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-bold text-slate-900">{med.name}</p>
          <p className="text-sm text-slate-600">{[med.dose, med.instruction].filter(Boolean).join(' · ') || '—'}</p>
        </div>
        {reminder && (
          <label className="flex items-center gap-2 text-sm font-semibold text-slate-800 min-h-[44px] cursor-pointer shrink-0">
            <input
              type="checkbox"
              checked={reminder.enabled}
              onChange={(e) => persist(reminders.map((r) => (r.id === reminder.id ? { ...r, enabled: e.target.checked } : r)))}
              className="w-5 h-5 accent-[#0B3D91]"
            />
            Aktif
          </label>
        )}
      </div>
      {reminder && (
        <p className="text-sm text-slate-700">
          Jam: <span className="font-mono font-bold">{reminder.times.join(', ')}</span>
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setEditing(med)}
          className="min-h-[44px] px-3 rounded-xl border border-slate-300 hover:border-[#0B3D91] bg-white text-slate-800 text-sm font-bold cursor-pointer inline-flex items-center gap-1.5"
        >
          <AlarmClock className="w-4 h-4 text-[#0B3D91]" aria-hidden="true" />
          {reminder ? 'Ubah Jam' : 'Atur Pengingat'}
        </button>
        {reminder && (
          <button
            type="button"
            onClick={() => persist(reminders.filter((r) => r.id !== reminder.id))}
            aria-label={`Hapus pengingat ${med.name}`}
            className="min-h-[44px] px-3 rounded-xl text-rose-700 hover:bg-rose-50 text-sm font-bold cursor-pointer inline-flex items-center gap-1.5"
          >
            <Trash2 className="w-4 h-4" aria-hidden="true" />
            Hapus
          </button>
        )}
      </div>
    </li>
  );

  return (
    <section className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3" aria-labelledby="pengingat-obat-heading">
      <h3 id="pengingat-obat-heading" className="text-base font-extrabold text-slate-900 flex items-center gap-2">
        <AlarmClock className="w-4 h-4 text-[#0B3D91]" aria-hidden="true" />
        Pengingat Minum Obat
      </h3>
      <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-sm text-amber-950 flex gap-2">
        <Info className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
        <p>
          Pengingat disimpan <strong>hanya di perangkat ini</strong> dan hanya berbunyi selama aplikasi terbuka di peramban
          (termasuk tab latar belakang). Tidak tersinkron ke perangkat lain dan bukan pengganti anjuran dokter/apoteker.
        </p>
      </div>
      {!storageAvailable && (
        <p role="alert" className="text-sm font-semibold text-rose-700">
          Penyimpanan peramban diblokir; pengingat tidak dapat disimpan.
        </p>
      )}
      {permission === 'unsupported' ? (
        <p className="text-sm text-slate-600 flex items-center gap-1.5">
          <BellOff className="w-4 h-4" aria-hidden="true" />
          Peramban ini tidak mendukung notifikasi; pengingat tampil sebagai pesan di dalam aplikasi.
        </p>
      ) : permission !== 'granted' ? (
        <button
          type="button"
          onClick={requestPermission}
          disabled={permission === 'denied'}
          className="w-full min-h-[44px] px-3 rounded-xl bg-[#0B3D91] text-white text-sm font-bold cursor-pointer disabled:opacity-60 inline-flex items-center justify-center gap-1.5"
        >
          <BellRing className="w-4 h-4" aria-hidden="true" />
          {permission === 'denied' ? 'Notifikasi diblokir di pengaturan peramban' : 'Izinkan Notifikasi Pengingat'}
        </button>
      ) : (
        <p className="text-sm text-emerald-700 font-semibold flex items-center gap-1.5">
          <BellRing className="w-4 h-4" aria-hidden="true" />
          Notifikasi diizinkan di perangkat ini.
        </p>
      )}

      {meds.length === 0 && orphaned.length === 0 ? (
        <p className="text-sm text-slate-600">Belum ada resep untuk dibuatkan pengingat.</p>
      ) : (
        <ul className="space-y-2">
          {meds.map((m) => renderRow(m, byId.get(reminderIdFor(m.name)) ?? null))}
          {orphaned.map((r) =>
            renderRow({ name: r.medName, dose: r.dose, instruction: r.instruction }, r)
          )}
        </ul>
      )}

      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title="Atur Jam Pengingat"
        closeLabel="Tutup pengaturan pengingat"
      >
        {editing && (
          <ReminderEditor
            key={editing.name}
            med={editing}
            existing={byId.get(reminderIdFor(editing.name)) ?? null}
            onCancel={() => setEditing(null)}
            onSave={(times) => {
              const id = reminderIdFor(editing.name);
              const existing = byId.get(id);
              const updated: MedicineReminder = {
                id,
                medName: editing.name,
                dose: editing.dose,
                instruction: editing.instruction,
                times,
                enabled: existing?.enabled ?? true,
                createdAt: existing?.createdAt || new Date().toISOString()
              };
              persist(existing ? reminders.map((r) => (r.id === id ? updated : r)) : [...reminders, updated]);
              setEditing(null);
              toast.success(`Pengingat ${editing.name} disimpan di perangkat ini.`);
            }}
          />
        )}
      </Modal>
    </section>
  );
};
