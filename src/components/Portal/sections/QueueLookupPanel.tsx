import React from 'react';
import { AlertCircle, RefreshCw, Search, Ticket } from 'lucide-react';
import { motion } from 'motion/react';
import {
  BOOKING_CODE_LENGTH,
  EASE_OUT_EXPO,
  SECTION_IDS,
  formatTimeLabel,
  type PoliQueueSnapshot,
  type QueueLookupMatch,
  type RecentTicketSummary
} from '../portalShared';

interface QueueLookupPanelProps {
  queueQuery: string;
  onQueryChange: (value: string) => void;
  onLookup: (overrideQuery?: string) => void;
  searching: boolean;
  searchedQuery: string;
  matches: QueueLookupMatch[];
  recentTickets: RecentTicketSummary[];
  poliQueues: PoliQueueSnapshot[];
  queueUpdatedAt: string;
  catalogLoading: boolean;
  onRefresh: () => void;
}

export const QueueLookupPanel: React.FC<QueueLookupPanelProps> = ({
  queueQuery,
  onQueryChange,
  onLookup,
  searching,
  searchedQuery,
  matches,
  recentTickets,
  poliQueues,
  queueUpdatedAt,
  catalogLoading,
  onRefresh
}) => (
  <div id={SECTION_IDS.queue} className="space-y-6 scroll-mt-24">
    <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-xs space-y-6">
      <form
        role="search"
        aria-label="Cek status antrean"
        onSubmit={(e) => {
          e.preventDefault();
          onLookup();
        }}
        className="space-y-2"
      >
        <label htmlFor="queue-lookup-input" className="block text-sm font-bold text-slate-800">
          Kode booking ({BOOKING_CODE_LENGTH} karakter)
        </label>
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-5 h-5 text-slate-500 absolute left-4 top-1/2 -translate-y-1/2" aria-hidden="true" />
            <input
              id="queue-lookup-input"
              type="text"
              value={queueQuery}
              onChange={(e) => onQueryChange(e.target.value)}
              placeholder="Contoh: kode pada bukti pendaftaran"
              aria-describedby="queue-lookup-help"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              maxLength={BOOKING_CODE_LENGTH + 4}
              className="w-full pl-12 pr-4 py-3.5 rounded-xl border border-slate-300 bg-slate-50 focus:bg-white focus:border-brand tabular-nums text-sm uppercase outline-none focus-visible:ring-2 focus-visible:ring-brand/30"
            />
          </div>
          <button
            type="submit"
            disabled={searching}
            className="bg-brand hover:bg-brand-hover text-white font-bold px-6 py-3.5 rounded-xl transition cursor-pointer flex items-center justify-center gap-2 min-h-[48px] text-sm shrink-0 disabled:opacity-60"
          >
            <Ticket className="w-4 h-4" aria-hidden="true" />
            <span>{searching ? 'Memeriksa...' : 'Cek Antrean'}</span>
          </button>
        </div>
        <p id="queue-lookup-help" className="text-xs text-slate-600">
          Demi privasi, status antrean hanya dapat dilihat dengan kode booking {BOOKING_CODE_LENGTH} karakter yang
          tercantum pada bukti pendaftaran Anda (bukan nomor antrean). Pencarian dengan No. RM atau nama tidak
          tersedia.
        </p>
      </form>

      {recentTickets.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="font-semibold text-slate-600">Tiket di perangkat ini:</span>
          {recentTickets.map((t) => (
            <button
              key={t.kode_booking}
              type="button"
              onClick={() => onLookup(t.kode_booking)}
              className="px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 tabular-nums font-bold hover:bg-emerald-100 cursor-pointer min-h-[44px]"
            >
              {t.nomor_antrian} · {t.poli} · {t.tanggal}
              <span className="sr-only"> (kode booking {t.kode_booking})</span>
            </button>
          ))}
        </div>
      )}

      <div aria-live="polite">
        {searchedQuery && (
          <div className="pt-4 border-t border-slate-200">
            {matches.length === 0 ? (
              <div className="rounded-xl bg-amber-50 border border-amber-200 p-5 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" aria-hidden="true" />
                <div className="text-sm">
                  <p className="font-bold text-amber-900">Kode booking “{searchedQuery}” tidak ditemukan.</p>
                  <p className="text-xs text-amber-900 mt-1">
                    Pastikan kode booking ({BOOKING_CODE_LENGTH} karakter) diketik lengkap sesuai bukti pendaftaran.
                    Nomor antrean (mis. UMM-003) tidak dapat dipakai untuk pencarian.
                  </p>
                </div>
              </div>
            ) : (
              <ul className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {matches.map((m, idx) => (
                  <motion.li
                    key={`${m.nomor_antrian}-${m.tanggal}-${idx}`}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: idx * 0.05, ease: EASE_OUT_EXPO }}
                    className="rounded-2xl border border-brand/25 bg-blue-50/40 p-5 space-y-4 shadow-xs"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-bold uppercase tracking-wider text-slate-600">Nomor Antrean Anda</p>
                        <p className="text-3xl font-extrabold tabular-nums text-brand">{m.nomor_antrian}</p>
                      </div>
                      <span
                        className={`px-3 py-1 rounded-lg text-xs font-bold ${
                          m.status === 'Diperiksa' || m.status === 'Panggil'
                            ? 'bg-emerald-700 text-white'
                            : m.status === 'Selesai'
                            ? 'bg-slate-200 text-slate-800'
                            : 'bg-amber-100 text-amber-900 border border-amber-200'
                        }`}
                      >
                        {m.status}
                      </span>
                    </div>

                    <dl className="grid grid-cols-3 gap-2 text-center bg-white rounded-xl border border-slate-200 p-3">
                      <div>
                        <dt className="text-xs text-slate-600">Sedang Dipanggil</dt>
                        <dd className="tabular-nums font-extrabold text-sm text-brand mt-0.5">
                          {m.sedang_dipanggil || '—'}
                        </dd>
                      </div>
                      <div className="border-x border-slate-200">
                        <dt className="text-xs text-slate-600">Antrean di Depan</dt>
                        <dd className="tabular-nums font-extrabold text-sm text-slate-900 mt-0.5">
                          {m.antrean_di_depan} pasien
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs text-slate-600">Estimasi Tunggu</dt>
                        <dd className="tabular-nums font-extrabold text-sm text-emerald-700 mt-0.5">
                          {m.estimasi_menit === 0 ? 'Giliran Anda' : `~${m.estimasi_menit} mnt`}
                        </dd>
                      </div>
                    </dl>

                    <div className="text-xs text-slate-700 space-y-1">
                      <p>
                        <strong className="text-slate-900">{m.poli}</strong> · {m.dokter}
                      </p>
                      <p className="tabular-nums text-slate-600">
                        {m.tanggal} · {m.jam_praktek || 'Jadwal belum tersedia'}
                      </p>
                    </div>
                  </motion.li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>

    <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-brand">PAPAN PANTAUAN ANTREAN POLIKLINIK</p>
          <h3 className="text-lg font-extrabold text-slate-900 mt-0.5">Nomor Dipanggil Hari Ini</h3>
          <p className="text-xs text-slate-600 mt-0.5">{formatTimeLabel(queueUpdatedAt)}</p>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={catalogLoading}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-300 bg-slate-50 hover:bg-slate-100 text-xs font-bold text-slate-700 cursor-pointer self-start sm:self-auto disabled:opacity-60"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${catalogLoading ? 'animate-spin' : ''}`} aria-hidden="true" />
          <span>{catalogLoading ? 'Memuat...' : 'Perbarui Status'}</span>
        </button>
      </div>

      <p className="text-xs text-slate-600">
        Ringkasan agregat per poliklinik (nomor yang sedang dipanggil dan jumlah pasien menunggu), tanpa identitas
        pasien.
      </p>

      {poliQueues.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-600 text-center">
          {catalogLoading ? 'Memuat ringkasan antrean...' : 'Data antrean belum tersedia.'}
        </div>
      ) : (
        <ul className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3.5">
          {poliQueues.slice(0, 12).map((pq) => (
            <li
              key={pq.id}
              className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 flex items-center justify-between gap-3"
            >
              <div className="min-w-0">
                <p className="text-xs font-bold text-slate-900 truncate">{pq.nama}</p>
                <p className="text-xs text-slate-600 tabular-nums mt-0.5">{pq.totalMenunggu} menunggu</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-xs font-semibold uppercase text-slate-600">Dipanggil</p>
                <p className="tabular-nums font-extrabold text-base text-brand">{pq.sedangDipanggil || '—'}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  </div>
);
