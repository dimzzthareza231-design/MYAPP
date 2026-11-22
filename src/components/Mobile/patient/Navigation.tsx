import React from 'react';
import { motion } from 'motion/react';
import { ArrowLeft, Bell, BellRing, CalendarPlus, FileHeart, Home, QrCode, Receipt, RefreshCw } from 'lucide-react';
import { BrandLogo } from '../../Common/BrandLogo';
import type { MobileTab, PatientDossierPayload } from './types';
import { SkeletonBlock } from './ui';

export const TAB_ITEMS: Array<{
  id: MobileTab;
  label: string;
  desktopLabel: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'beranda', label: 'Beranda', desktopLabel: 'Beranda', icon: Home },
  { id: 'jadwal', label: 'Jadwal', desktopLabel: 'Jadwal & Daftar', icon: CalendarPlus },
  { id: 'hasil', label: 'Hasil', desktopLabel: 'Hasil Medis', icon: FileHeart },
  { id: 'tagihan', label: 'Tagihan', desktopLabel: 'Tagihan & Akun', icon: Receipt }
];

const iconButtonClass =
  'relative rounded-xl bg-white/10 hover:bg-white/20 transition cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center disabled:opacity-60';

export const AppHeader: React.FC<{
  patient: PatientDossierPayload['patient'] | null;
  activeTab: MobileTab;
  showBack: boolean;
  onBack: () => void;
  onSelectTab: (tab: MobileTab) => void;
  unreadCount: number;
  sseConnected: boolean;
  isRefreshing: boolean;
  onOpenNotifications: () => void;
  onRefresh: () => void;
  onOpenQr: () => void;
}> = ({
  patient,
  activeTab,
  showBack,
  onBack,
  onSelectTab,
  unreadCount,
  sseConnected,
  isRefreshing,
  onOpenNotifications,
  onRefresh,
  onOpenQr
}) => (
  <header className="sticky top-0 z-40 bg-[#0B3D91] text-white shadow-sm pt-[env(safe-area-inset-top)]">
    <div className="max-w-5xl mx-auto px-3 sm:px-4 h-16 flex items-center justify-between gap-2">
      <div className="flex items-center gap-2 min-w-0">
        {showBack ? (
          <button
            type="button"
            onClick={onBack}
            aria-label="Kembali ke halaman sebelumnya"
            className="rounded-xl hover:bg-white/10 transition cursor-pointer shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center"
          >
            <ArrowLeft className="w-5 h-5" aria-hidden="true" />
          </button>
        ) : (
          <BrandLogo alt="MYITARU" className="w-8 h-8 rounded-lg object-cover border border-white/20 shrink-0 ml-1" />
        )}
        <div className="min-w-0">
          {patient ? (
            <>
              <p className="text-sm font-extrabold truncate">{patient.nama}</p>
              <p className="text-xs text-blue-100 font-mono tabular-nums truncate">
                {[patient.no_rm, patient.penjamin].filter(Boolean).join(' · ')}
              </p>
            </>
          ) : (
            <div className="space-y-1.5" aria-hidden="true">
              <SkeletonBlock className="h-4 w-32 bg-white/25" />
              <SkeletonBlock className="h-3 w-24 bg-white/20" />
            </div>
          )}
        </div>
      </div>

      <nav aria-label="Navigasi Aplikasi Pasien" className="hidden md:flex items-center gap-1.5">
        {TAB_ITEMS.map((t) => {
          const isSelected = activeTab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              aria-current={isSelected ? 'page' : undefined}
              onClick={() => onSelectTab(t.id)}
              className={`relative px-3.5 min-h-[44px] rounded-xl text-sm font-bold transition-colors cursor-pointer whitespace-nowrap ${
                isSelected ? 'text-[#0B3D91]' : 'text-blue-100 hover:bg-white/10'
              }`}
            >
              {isSelected && (
                <motion.span
                  layoutId="desktopActiveTabPill"
                  transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                  className="absolute inset-0 rounded-xl bg-white shadow-xs"
                />
              )}
              <span className="relative z-10">{t.desktopLabel}</span>
            </button>
          );
        })}
      </nav>

      <div className="flex items-center gap-1.5 shrink-0">
        <button
          type="button"
          onClick={onOpenNotifications}
          aria-label={unreadCount > 0 ? `Notifikasi, ${unreadCount} belum dibaca` : 'Notifikasi'}
          className={iconButtonClass}
        >
          {unreadCount > 0 ? (
            <BellRing className="w-5 h-5 text-amber-300 motion-safe:animate-pulse" aria-hidden="true" />
          ) : (
            <Bell className="w-5 h-5" aria-hidden="true" />
          )}
          {unreadCount > 0 ? (
            <span
              aria-hidden="true"
              className="absolute -top-1 -right-1 min-w-[20px] h-[20px] px-1 rounded-full bg-rose-500 text-white text-xs font-extrabold flex items-center justify-center shadow-xs"
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          ) : sseConnected ? (
            <span
              title="Diperbarui otomatis"
              aria-hidden="true"
              className="absolute top-2 right-2 w-2 h-2 rounded-full bg-emerald-400 ring-2 ring-[#0B3D91]"
            />
          ) : null}
        </button>
        <button
          type="button"
          onClick={onRefresh}
          disabled={isRefreshing}
          aria-label="Perbarui data"
          className={iconButtonClass}
        >
          <RefreshCw className={`w-5 h-5 ${isRefreshing ? 'animate-spin' : ''}`} aria-hidden="true" />
        </button>
        <button type="button" onClick={onOpenQr} aria-label="Kartu berobat QR" className={iconButtonClass}>
          <QrCode className="w-5 h-5" aria-hidden="true" />
        </button>
      </div>
    </div>
  </header>
);

export const BottomNav: React.FC<{
  activeTab: MobileTab;
  onSelectTab: (tab: MobileTab) => void;
}> = ({ activeTab, onSelectTab }) => (
  <nav
    aria-label="Navigasi Aplikasi Pasien"
    className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t border-slate-200 px-2 pt-1.5 pb-[calc(0.375rem+env(safe-area-inset-bottom))] grid grid-cols-4 gap-1 shadow-lg"
  >
    {TAB_ITEMS.map((item) => {
      const Icon = item.icon;
      const isActive = activeTab === item.id;
      return (
        <button
          key={item.id}
          type="button"
          aria-current={isActive ? 'page' : undefined}
          onClick={() => onSelectTab(item.id)}
          className={`relative flex flex-col items-center justify-center py-1.5 rounded-xl min-h-[52px] transition-colors cursor-pointer ${
            isActive ? 'text-[#0B3D91] font-bold' : 'text-slate-600 font-medium'
          }`}
        >
          {isActive && (
            <motion.span
              layoutId="mobileBottomActiveTabPill"
              transition={{ type: 'spring', stiffness: 420, damping: 32 }}
              className="absolute inset-0 rounded-xl bg-blue-50"
            />
          )}
          <Icon className="w-5 h-5 relative z-10" />
          <span className="text-xs mt-0.5 relative z-10">{item.label}</span>
        </button>
      );
    })}
  </nav>
);
