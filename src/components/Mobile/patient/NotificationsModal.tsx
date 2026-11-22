import React from 'react';
import { Bell, BellRing, CheckCheck, FlaskConical, Volume2 } from 'lucide-react';
import type { PatientNotificationItem } from '../../../lib/fcm';
import type { PatientNotificationsState } from './usePatientNotifications';
import { EmptyState, Modal } from './ui';
import { formatClock } from './utils';

const PreferenceToggle: React.FC<{
  label: string;
  hint: string;
  enabled: boolean;
  onToggle: () => void;
}> = ({ label, hint, enabled, onToggle }) => (
  <button
    type="button"
    role="switch"
    aria-checked={enabled}
    onClick={onToggle}
    className={`px-3 py-2.5 min-h-[44px] rounded-xl border text-left transition cursor-pointer flex items-center justify-between gap-2 ${
      enabled ? 'bg-white border-[#0B3D91]/40 text-slate-900' : 'bg-slate-100 border-slate-200 text-slate-600'
    }`}
  >
    <span>
      <span className="block text-sm font-bold">{label}</span>
      <span className="block text-sm opacity-80">{hint}</span>
    </span>
    <span
      aria-hidden="true"
      className={`px-2 py-0.5 rounded-full text-xs font-extrabold ${
        enabled ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'
      }`}
    >
      {enabled ? 'ON' : 'OFF'}
    </span>
  </button>
);

function typeLabel(type: PatientNotificationItem['type']): string {
  if (type === 'queue_call') return 'Antrean Poli';
  if (type === 'lab_ready') return 'Hasil Laboratorium';
  return 'Sistem';
}

export const NotificationsModal: React.FC<{
  open: boolean;
  onClose: () => void;
  notif: PatientNotificationsState;
  onOpenItem: (item: PatientNotificationItem) => void;
}> = ({ open, onClose, notif, onOpenItem }) => {
  const {
    notifications,
    unreadCount,
    fcmMode,
    fcmCapability,
    fcmSyncing,
    sseConnected,
    simulatingType,
    queueAlertsEnabled,
    labAlertsEnabled
  } = notif;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Pusat Notifikasi"
      description="Antrean poli & hasil laboratorium tervalidasi"
      closeLabel="Tutup pusat notifikasi"
      variant="brand"
      maxWidthClass="max-w-lg"
      headerIcon={<BellRing className="w-5 h-5 text-amber-300 shrink-0" aria-hidden="true" />}
    >
      <div className="space-y-4">
        <section className="rounded-2xl bg-slate-50 border border-slate-200 p-4 space-y-3" aria-label="Pengaturan notifikasi">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-extrabold text-slate-800">Status Notifikasi</span>
            <span
              className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                fcmMode === 'fcm_web_push'
                  ? 'bg-emerald-100 text-emerald-800'
                  : sseConnected
                  ? 'bg-sky-100 text-[#0B3D91]'
                  : 'bg-amber-100 text-amber-900'
              }`}
            >
              {fcmMode === 'fcm_web_push' ? 'Notifikasi aktif' : sseConnected ? 'Diperbarui otomatis' : 'Tidak terhubung'}
            </span>
          </div>

          <div className="text-sm text-slate-700 space-y-1">
            <p>
              Izin Browser:{' '}
              <strong className="text-slate-900">
                {fcmCapability?.permission === 'granted'
                  ? 'Diizinkan'
                  : fcmCapability?.permission === 'denied'
                  ? 'Diblokir Browser (Aktifkan di Setelan Situs)'
                  : fcmCapability?.permission === 'unsupported'
                  ? 'Tidak didukung perangkat ini'
                  : 'Belum Diminta'}
              </strong>
            </p>
            {fcmCapability && !fcmCapability.hasVapidKey && (
              <p className="text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 mt-1">
                Notifikasi hanya muncul selama aplikasi ini terbuka. Biarkan tab tetap terbuka agar tidak melewatkan
                panggilan antrean.
              </p>
            )}
          </div>

          <button
            type="button"
            disabled={fcmSyncing}
            onClick={notif.enableNotifications}
            className="w-full min-h-[44px] rounded-xl bg-[#0B3D91] hover:bg-[#082D6E] text-white text-sm font-bold cursor-pointer disabled:opacity-60"
          >
            {fcmSyncing
              ? 'Memperbarui notifikasi...'
              : fcmCapability?.permission === 'granted'
              ? 'Perbarui Notifikasi di Perangkat Ini'
              : 'Izinkan Notifikasi'}
          </button>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-slate-200">
            <PreferenceToggle
              label="Antrean Dipanggil"
              hint="Kabar saat poli memanggil"
              enabled={queueAlertsEnabled}
              onToggle={() => notif.toggleAlertPreference('queue')}
            />
            <PreferenceToggle
              label="Hasil Lab Tersedia"
              hint="Kabar saat hasil siap"
              enabled={labAlertsEnabled}
              onToggle={() => notif.toggleAlertPreference('lab')}
            />
          </div>
        </section>

        {/* Tombol simulasi hanya untuk pengembangan; tidak pernah tampil ke pasien. */}
        {import.meta.env.DEV && (
          <section className="space-y-2" aria-label="Uji coba notifikasi">
            <p className="text-sm font-extrabold uppercase tracking-wider text-slate-600">
              Uji Coba Notifikasi (mode pengembangan)
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                disabled={simulatingType !== null}
                onClick={() => notif.simulatePush('queue_call')}
                className="min-h-[44px] px-3 rounded-xl border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-900 text-sm font-bold cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-60"
              >
                <Volume2 className="w-4 h-4" aria-hidden="true" />
                <span>{simulatingType === 'queue_call' ? 'Mengirim...' : 'Simulasi Antrean Dipanggil'}</span>
              </button>
              <button
                type="button"
                disabled={simulatingType !== null}
                onClick={() => notif.simulatePush('lab_ready')}
                className="min-h-[44px] px-3 rounded-xl border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-900 text-sm font-bold cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-60"
              >
                <FlaskConical className="w-4 h-4" aria-hidden="true" />
                <span>{simulatingType === 'lab_ready' ? 'Mengirim...' : 'Simulasi Hasil Lab Tersedia'}</span>
              </button>
            </div>
          </section>
        )}

        <section className="space-y-2.5" aria-label="Riwayat notifikasi">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-extrabold text-slate-800">Riwayat Notifikasi ({notifications.length})</p>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={notif.markAllRead}
                className="text-sm font-bold text-[#0B3D91] hover:underline flex items-center gap-1 cursor-pointer min-h-[44px] px-1"
              >
                <CheckCheck className="w-4 h-4" aria-hidden="true" />
                <span>Tandai Semua Dibaca</span>
              </button>
            )}
          </div>

          {notifications.length === 0 ? (
            <EmptyState
              icon={Bell}
              title="Belum ada notifikasi"
              description="Notifikasi muncul otomatis saat antrean Anda dipanggil atau hasil laboratorium divalidasi."
            />
          ) : (
            <ul className="space-y-2">
              {notifications.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => onOpenItem(item)}
                    className={`w-full text-left rounded-2xl border p-3.5 transition cursor-pointer space-y-1 ${
                      item.read
                        ? 'bg-white border-slate-200 text-slate-700'
                        : 'bg-blue-50/70 border-[#0B3D91]/30 text-slate-900 shadow-xs'
                    }`}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span
                        className={`text-xs font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                          item.type === 'queue_call'
                            ? 'bg-amber-100 text-amber-900'
                            : item.type === 'lab_ready'
                            ? 'bg-emerald-100 text-emerald-900'
                            : 'bg-slate-100 text-slate-800'
                        }`}
                      >
                        {typeLabel(item.type)}
                      </span>
                      <span className="text-sm font-mono text-slate-600">{formatClock(item.createdAt)}</span>
                    </span>
                    <span className="text-sm font-extrabold flex items-center gap-1.5">
                      {!item.read && (
                        <>
                          <span className="w-2 h-2 rounded-full bg-[#0B3D91] shrink-0" aria-hidden="true" />
                          <span className="sr-only">Belum dibaca: </span>
                        </>
                      )}
                      <span>{item.title}</span>
                    </span>
                    {item.body && <span className="block text-sm opacity-90 leading-relaxed">{item.body}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </Modal>
  );
};
