import React, { useCallback, useEffect, useState } from 'react';
import { MessageSquareWarning, Send, Star } from 'lucide-react';
import toast from 'react-hot-toast';
import { EmptyState, Modal, SkeletonList } from '../ui';
import {
  accountApi,
  COMPLAINT_CATEGORY_LABELS,
  FEEDBACK_CATEGORY_LABELS,
  formatDateId,
  type ComplaintItem,
  type FeedbackItem,
  type PendingVisit
} from './accountApi';

const inputClass =
  'w-full min-h-[44px] rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0B3D91]';
const primaryButton =
  'inline-flex items-center justify-center gap-2 min-h-[44px] px-4 rounded-xl bg-[#0B3D91] text-white text-sm font-bold cursor-pointer disabled:opacity-60';
const labelClass = 'block text-sm font-semibold text-slate-700 mb-1';

const STATUS_TONE: Record<ComplaintItem['status'], string> = {
  Diterima: 'bg-slate-100 text-slate-800',
  Diproses: 'bg-amber-100 text-amber-900',
  Selesai: 'bg-emerald-100 text-emerald-900',
  Ditolak: 'bg-rose-100 text-rose-900'
};

const StarInput: React.FC<{ value: number; onChange: (v: number) => void; idPrefix: string }> = ({ value, onChange, idPrefix }) => (
  <div role="radiogroup" aria-label="Nilai 1 sampai 5" className="flex gap-1">
    {[1, 2, 3, 4, 5].map((n) => (
      <button
        key={n}
        id={`${idPrefix}-${n}`}
        type="button"
        role="radio"
        aria-checked={value === n}
        aria-label={`${n} bintang`}
        onClick={() => onChange(n)}
        className="min-h-[44px] min-w-[44px] flex items-center justify-center cursor-pointer"
      >
        <Star className={`w-7 h-7 ${n <= value ? 'fill-amber-400 text-amber-400' : 'text-slate-300'}`} aria-hidden="true" />
      </button>
    ))}
  </div>
);

/** Form penilaian; dipakai di layar Masukan dan di ajakan menilai kunjungan selesai. */
export const RatingForm: React.FC<{
  token: string | null;
  visit?: PendingVisit | null;
  onSubmitted: (item: FeedbackItem) => void;
}> = ({ token, visit, onSubmitted }) => {
  const [rating, setRating] = useState(0);
  const [kategori, setKategori] = useState(visit ? 'dokter' : 'pelayanan');
  const [komentar, setKomentar] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!rating) {
      setError('Pilih nilai bintang terlebih dahulu.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await accountApi.sendFeedback(
        { rating, kategori, komentar: komentar.trim() || undefined, ...(visit ? { appointment_id: visit.appointment_id } : {}) },
        token
      );
      toast.success('Terima kasih atas penilaian Anda.');
      setRating(0);
      setKomentar('');
      onSubmitted(res.feedback);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const prefix = visit ? `rate-${visit.appointment_id}` : 'rate-general';
  return (
    <form onSubmit={submit} className="space-y-3">
      {visit && (
        <p className="text-sm text-slate-700">
          Kunjungan <strong>{visit.poli}</strong> · {visit.dokter} · {formatDateId(visit.tanggal)}
        </p>
      )}
      <StarInput value={rating} onChange={setRating} idPrefix={prefix} />
      <div>
        <label htmlFor={`${prefix}-cat`} className={labelClass}>Aspek yang dinilai</label>
        <select id={`${prefix}-cat`} value={kategori} onChange={(e) => setKategori(e.target.value)} className={inputClass}>
          {Object.entries(FEEDBACK_CATEGORY_LABELS).map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor={`${prefix}-com`} className={labelClass}>Komentar (opsional)</label>
        <textarea id={`${prefix}-com`} value={komentar} onChange={(e) => setKomentar(e.target.value)} rows={3} maxLength={1000} className={inputClass} />
      </div>
      {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
      <button type="submit" disabled={busy} className={primaryButton}>
        <Send className="w-4 h-4" aria-hidden="true" /> {busy ? 'Mengirim...' : 'Kirim Penilaian'}
      </button>
    </form>
  );
};

const ComplaintForm: React.FC<{ token: string | null; onCreated: (c: ComplaintItem) => void }> = ({ token, onCreated }) => {
  const [kategori, setKategori] = useState('pelayanan');
  const [isi, setIsi] = useState('');
  const [kontak, setKontak] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await accountApi.sendComplaint({ kategori, isi: isi.trim(), kontak_balik: kontak.trim() || undefined }, token);
      toast.success(`Pengaduan terkirim. Nomor tiket: ${res.ticket_no}`, { duration: 8000 });
      setIsi('');
      setKontak('');
      onCreated(res.complaint);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <div>
        <label htmlFor="cmp-cat" className={labelClass}>Kategori</label>
        <select id="cmp-cat" value={kategori} onChange={(e) => setKategori(e.target.value)} className={inputClass}>
          {Object.entries(COMPLAINT_CATEGORY_LABELS).map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="cmp-isi" className={labelClass}>Isi pengaduan</label>
        <textarea id="cmp-isi" value={isi} onChange={(e) => setIsi(e.target.value)} rows={5} minLength={10} maxLength={2000} required className={inputClass} />
        <p className="text-xs text-slate-500 mt-1">{isi.length}/2000</p>
      </div>
      <div>
        <label htmlFor="cmp-kontak" className={labelClass}>Kontak balik (opsional)</label>
        <input id="cmp-kontak" value={kontak} onChange={(e) => setKontak(e.target.value)} maxLength={160} className={inputClass} placeholder="Email atau nomor yang bisa dihubungi" />
      </div>
      {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
      <button type="submit" disabled={busy || isi.trim().length < 10} className={primaryButton}>
        <Send className="w-4 h-4" aria-hidden="true" /> {busy ? 'Mengirim...' : 'Kirim Pengaduan'}
      </button>
    </form>
  );
};

export const FeedbackScreen: React.FC<{ token: string | null }> = ({ token }) => {
  const [feedback, setFeedback] = useState<FeedbackItem[]>([]);
  const [pending, setPending] = useState<PendingVisit[]>([]);
  const [complaints, setComplaints] = useState<ComplaintItem[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  const load = useCallback(async () => {
    try {
      const [fb, cmp] = await Promise.all([accountApi.feedback(token), accountApi.complaints(token)]);
      setFeedback(fb.feedback);
      setPending(fb.pending_visits);
      setComplaints(cmp.complaints);
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  }, [token]);

  useEffect(() => {
    setStatus('loading');
    void load();
  }, [load]);

  if (status === 'loading') return <SkeletonList rows={2} label="Memuat masukan..." />;
  if (status === 'error') {
    return <EmptyState tone="error" title="Masukan belum dapat dimuat" action={<button type="button" onClick={load} className={primaryButton}>Coba Lagi</button>} />;
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
      <div className="lg:col-span-6 space-y-4">
        {pending.length > 0 && (
          <section className="bg-white rounded-2xl border border-amber-200 p-5 space-y-3" aria-labelledby="pending-heading">
            <h3 id="pending-heading" className="text-base font-extrabold text-slate-900">Nilai kunjungan terakhir</h3>
            <RatingForm key={pending[0].appointment_id} token={token} visit={pending[0]} onSubmitted={() => void load()} />
          </section>
        )}
        <section className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3" aria-labelledby="rate-heading">
          <h3 id="rate-heading" className="text-base font-extrabold text-slate-900">Beri penilaian layanan</h3>
          <RatingForm token={token} onSubmitted={() => void load()} />
        </section>
        {feedback.length > 0 && (
          <section className="bg-white rounded-2xl border border-slate-200 p-5 space-y-2" aria-labelledby="my-rating-heading">
            <h3 id="my-rating-heading" className="text-base font-extrabold text-slate-900">Penilaian saya</h3>
            <ul className="divide-y divide-slate-100">
              {feedback.map((f) => (
                <li key={f.id} className="py-2 text-sm">
                  <p className="font-bold text-slate-900">
                    {'★'.repeat(f.rating)}<span className="text-slate-300">{'★'.repeat(5 - f.rating)}</span>{' '}
                    <span className="font-medium text-slate-600">{FEEDBACK_CATEGORY_LABELS[f.kategori] ?? f.kategori}</span>
                  </p>
                  <p className="text-xs text-slate-500">{[f.poli, f.dokter, formatDateId(f.created_at)].filter(Boolean).join(' · ')}</p>
                  {f.komentar && <p className="text-slate-700 mt-0.5">{f.komentar}</p>}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
      <div className="lg:col-span-6 space-y-4">
        <section className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3" aria-labelledby="complaint-heading">
          <h3 id="complaint-heading" className="text-base font-extrabold text-slate-900 flex items-center gap-2">
            <MessageSquareWarning className="w-5 h-5 text-[#0B3D91]" aria-hidden="true" /> Sampaikan pengaduan
          </h3>
          <p className="text-sm text-slate-600">Pengaduan ditindaklanjuti tim mutu rumah sakit. Simpan nomor tiket untuk memantau status.</p>
          <ComplaintForm token={token} onCreated={(c) => setComplaints((list) => [c, ...list])} />
        </section>
        <section className="bg-white rounded-2xl border border-slate-200 p-5 space-y-2" aria-labelledby="my-complaints-heading">
          <h3 id="my-complaints-heading" className="text-base font-extrabold text-slate-900">Pengaduan saya</h3>
          {complaints.length === 0 ? (
            <p className="text-sm text-slate-600">Belum ada pengaduan.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {complaints.map((c) => (
                <li key={c.id} className="py-3 space-y-1 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono font-bold text-slate-900">{c.ticket_no}</span>
                    <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${STATUS_TONE[c.status]}`}>{c.status}</span>
                  </div>
                  <p className="text-xs text-slate-500">{COMPLAINT_CATEGORY_LABELS[c.kategori] ?? c.kategori} · {formatDateId(c.created_at)}</p>
                  <p className="text-slate-700 line-clamp-3">{c.isi}</p>
                  {c.tanggapan && (
                    <p className="text-slate-800 bg-blue-50 rounded-xl p-2.5"><strong>Tanggapan:</strong> {c.tanggapan}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
};

const PROMPT_DISMISS_KEY = 'myitaru_rating_prompt_dismissed';

function readDismissed(): string[] {
  try {
    const raw = sessionStorage.getItem(PROMPT_DISMISS_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

/** Ajakan menilai kunjungan yang sudah selesai dan belum dinilai (tampil di Beranda). */
export const RatingPrompt: React.FC<{ token: string | null; refreshKey?: unknown }> = ({ token, refreshKey }) => {
  const [visit, setVisit] = useState<PendingVisit | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!token) return;
    accountApi
      .feedback(token)
      .then((res) => {
        if (cancelled) return;
        const dismissed = new Set(readDismissed());
        setVisit(res.pending_visits.find((v) => !dismissed.has(v.appointment_id)) ?? null);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [token, refreshKey]);

  if (!visit) return null;
  const dismiss = () => {
    try {
      sessionStorage.setItem(PROMPT_DISMISS_KEY, JSON.stringify([...readDismissed(), visit.appointment_id].slice(-50)));
    } catch {
      // Abaikan bila penyimpanan diblokir.
    }
    setVisit(null);
  };

  return (
    <>
      <div className="rounded-2xl border border-amber-200 bg-white p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-start gap-2.5 min-w-0">
          <Star className="w-5 h-5 text-amber-400 fill-amber-400 shrink-0 mt-0.5" aria-hidden="true" />
          <p className="text-sm text-slate-800">
            Bagaimana kunjungan Anda ke <strong>{visit.poli}</strong> ({formatDateId(visit.tanggal)})?
          </p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => setOpen(true)} className={primaryButton}>Beri nilai</button>
          <button type="button" onClick={dismiss} className="min-h-[44px] px-3 rounded-xl border border-slate-200 text-sm font-bold text-slate-700 cursor-pointer">Nanti</button>
        </div>
      </div>
      <Modal open={open} onClose={() => setOpen(false)} title="Nilai kunjungan" closeLabel="Tutup penilaian">
        <RatingForm
          token={token}
          visit={visit}
          onSubmitted={() => {
            setOpen(false);
            setVisit(null);
          }}
        />
      </Modal>
    </>
  );
};
