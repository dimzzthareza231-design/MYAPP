import React from 'react';
import { Volume2, Stethoscope, Activity } from 'lucide-react';
import { useAntrian } from '../contexts/AntrianContext';
import { motion, AnimatePresence } from 'motion/react';

export function DashboardWidgetAntrian() {
  const {
    antrianList,
    totalPasienHariIni,
    totalMenunggu
  } = useAntrian();

  const antrianAktif = (antrianList || []).filter(
    (a) => a && (a.status === 'Dipanggil' || a.status === 'Dilayani')
  );
  const antrianMenunggu = (antrianList || [])
    .filter((a) => a && a.status === 'Menunggu')
    .slice(0, 5);
  const gabunganAntrian = [...antrianAktif, ...antrianMenunggu].slice(0, 5);

  return (
    <div className="bg-white dark:bg-[#111927] rounded-2xl border border-slate-200 dark:border-slate-800 h-full flex flex-col p-5 transition-colors">
      {/* Header & KPI Counters */}
      <div className="flex items-start justify-between gap-3 pb-3.5 mb-3.5 border-b border-slate-100 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#0B3D91] dark:text-sky-400">
            <Activity className="w-3.5 h-3.5" />
            <span>Real-Time</span>
          </div>
          <h2 className="text-sm font-bold text-slate-900 dark:text-white mt-0.5 leading-snug">
            Antrian Poli Hari Ini
          </h2>
        </div>

        <div className="flex items-center border border-slate-200 dark:border-slate-800 rounded-xl divide-x divide-slate-200 dark:divide-slate-800 bg-slate-50/70 dark:bg-slate-900/60 shrink-0">
          <div className="px-3 py-1.5 text-center min-w-[54px]">
            <span className="block text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Total
            </span>
            <span className="block text-base font-extrabold text-slate-900 dark:text-white font-mono tabular-nums leading-tight mt-0.5">
              {totalPasienHariIni}
            </span>
          </div>
          <div className="px-3 py-1.5 text-center min-w-[54px]">
            <span className="block text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Antre
            </span>
            <span className="block text-base font-extrabold text-[#0B3D91] dark:text-sky-400 font-mono tabular-nums leading-tight mt-0.5">
              {totalMenunggu}
            </span>
          </div>
        </div>
      </div>

      {/* Active Call Banner */}
      <AnimatePresence>
        {antrianAktif.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0, marginBottom: 0 }}
            animate={{ opacity: 1, height: 'auto', marginBottom: 12 }}
            exit={{ opacity: 0, height: 0, marginBottom: 0 }}
            className="px-3 py-2 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800/60 rounded-xl flex items-center gap-2 text-emerald-800 dark:text-emerald-300"
          >
            <Volume2 className="w-3.5 h-3.5 shrink-0" />
            <span className="text-[11px] font-bold tracking-wide uppercase">
              Sedang Dipanggil / Dilayani
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Queue Rows */}
      <div className="flex-1 flex flex-col divide-y divide-slate-100 dark:divide-slate-800/80 border border-slate-200/80 dark:border-slate-800 rounded-xl overflow-hidden bg-slate-50/40 dark:bg-slate-900/30">
        {gabunganAntrian.length > 0 ? (
          <AnimatePresence mode="popLayout">
            {gabunganAntrian.map((a) => {
              const isActive = a.status === 'Dipanggil' || a.status === 'Dilayani';
              return (
                <motion.div
                  key={a.id}
                  layout
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  className="flex items-center justify-between px-3 py-2.5 bg-white dark:bg-transparent hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className={`text-xs font-extrabold font-mono tabular-nums shrink-0 w-[68px] ${
                        isActive
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : 'text-[#0B3D91] dark:text-sky-400'
                      }`}
                    >
                      {a.nomorAntrian}
                    </span>
                    <div className="min-w-0 border-l border-slate-200 dark:border-slate-800 pl-3">
                      <p className="text-xs font-semibold text-slate-900 dark:text-white truncate leading-tight">
                        {a.namaPasien}
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate leading-tight mt-0.5">
                        {a.poliNama}
                      </p>
                    </div>
                  </div>
                  <Stethoscope
                    className={`w-3.5 h-3.5 shrink-0 ${
                      isActive
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-slate-400 dark:text-slate-500'
                    }`}
                  />
                </motion.div>
              );
            })}
          </AnimatePresence>
        ) : (
          <div className="flex items-center justify-center flex-1 text-xs text-slate-500 dark:text-slate-400 p-6 text-center">
            Belum ada antrian hari ini.
          </div>
        )}
      </div>
    </div>
  );
}
