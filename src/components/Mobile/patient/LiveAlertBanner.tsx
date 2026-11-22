import React from 'react';
import { FlaskConical, Volume2, X } from 'lucide-react';
import type { PatientNotificationItem } from '../../../lib/fcm';
import { formatClock } from './utils';

export const LiveAlertBanner: React.FC<{
  alert: PatientNotificationItem;
  onOpen: (alert: PatientNotificationItem) => void;
  onDismiss: () => void;
}> = ({ alert, onOpen, onDismiss }) => {
  const isQueue = alert.type === 'queue_call';
  return (
    <div
      role="alert"
      className={`rounded-2xl border p-4 shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
        isQueue ? 'bg-amber-50 border-amber-300 text-amber-950' : 'bg-emerald-50 border-emerald-300 text-emerald-950'
      }`}
    >
      <div className="flex items-start gap-3">
        <div className={`p-2.5 rounded-xl shrink-0 text-white ${isQueue ? 'bg-amber-500' : 'bg-emerald-600'}`}>
          {isQueue ? <Volume2 className="w-5 h-5" aria-hidden="true" /> : <FlaskConical className="w-5 h-5" aria-hidden="true" />}
        </div>
        <div className="space-y-0.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full bg-white/80 border border-current/15">
              {isQueue ? 'Panggilan Antrean' : alert.type === 'lab_ready' ? 'Hasil Lab Baru' : 'Pemberitahuan'}
            </span>
            <span className="text-xs font-mono opacity-80">{formatClock(alert.createdAt)}</span>
          </div>
          <p className="text-base font-extrabold">{alert.title}</p>
          {alert.body && <p className="text-sm opacity-90 leading-relaxed">{alert.body}</p>}
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
        <button
          type="button"
          onClick={() => onOpen(alert)}
          className="px-4 min-h-[44px] rounded-xl bg-slate-900 text-white text-sm font-bold hover:bg-slate-800 transition cursor-pointer"
        >
          {alert.type === 'lab_ready' ? 'Lihat Hasil Lab' : 'Lihat Antrean'}
        </button>
        <button
          type="button"
          aria-label="Tutup pemberitahuan"
          onClick={onDismiss}
          className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl hover:bg-black/10 transition cursor-pointer"
        >
          <X className="w-5 h-5" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
};
