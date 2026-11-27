import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useHospital } from '../contexts/HospitalContext';
import { useAuth } from '../contexts/AuthContext';
import { getRoleById } from '../data/roles';
import { LogOut, Moon, Sun, Shield, ChevronDown, Cloud, Stethoscope, Building2, ArrowLeftRight } from 'lucide-react';
import toast from 'react-hot-toast';

export default function UserMenu() {
  const navigate = useNavigate();
  const { isDarkMode, toggleDarkMode } = useHospital();
  const { currentUser, logout, facilityMode } = useAuth();
  const [isOpen, setIsOpen] = useState(false);

  const currentRole = currentUser ? getRoleById(currentUser.roleId) : null;
  const displayName = currentUser?.nama || 'Admin ITARU';
  const roleName = currentRole?.nama || 'Administrator';
  const photoURL = currentUser?.photoURL;

  const handleLogout = async () => {
    await logout();
    toast.success('Anda telah logout dari MYITARU SIMK');
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2.5 bg-white/[0.06] hover:bg-white/[0.11] border border-white/10 rounded-xl pl-1.5 pr-3 py-1.5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60 group cursor-pointer"
      >
        {photoURL ? (
          <img
            src={photoURL}
            alt={displayName}
            referrerPolicy="no-referrer"
            className="w-7 h-7 rounded-lg object-cover border border-white/20"
          />
        ) : (
          <div className="w-7 h-7 rounded-lg bg-[#16417C] flex items-center justify-center text-white text-xs font-bold border border-sky-400/30">
            {displayName.charAt(0)}
          </div>
        )}

        <div className="hidden sm:block text-left">
          <div className="text-xs font-semibold text-white leading-tight truncate max-w-[105px]">
            {displayName.split(' ')[0]}
          </div>
          <div className="text-[10px] text-slate-300 font-medium truncate max-w-[110px]">
            {facilityMode === 'klinik' ? 'Mode Klinik' : 'Mode RS'} · {roleName}
          </div>
        </div>

        <ChevronDown
          className={`w-3.5 h-3.5 text-slate-400 group-hover:text-white transition-transform ${
            isOpen ? 'rotate-180 text-white' : ''
          }`}
        />
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute right-0 mt-2 w-72 bg-[#0E1729] border border-slate-700/80 rounded-2xl shadow-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150 origin-top-right">
            <div className="p-4 border-b border-slate-800">
              <div className="flex items-center gap-3">
                {photoURL ? (
                  <img
                    src={photoURL}
                    alt={displayName}
                    referrerPolicy="no-referrer"
                    className="w-10 h-10 rounded-xl object-cover border border-slate-700"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-xl bg-[#16417C] flex items-center justify-center text-white font-bold text-base border border-sky-400/30">
                    {displayName.charAt(0)}
                  </div>
                )}
                <div className="overflow-hidden">
                  <p className="text-xs font-bold text-white truncate">{displayName}</p>
                  <p className="text-[11px] text-slate-400 truncate">{currentUser?.email || roleName}</p>
                  <p className="text-[10px] text-sky-300 font-semibold mt-0.5 flex items-center gap-1">
                    <Shield className="w-3 h-3 shrink-0" />
                    <span className="truncate">{roleName}</span>
                  </p>
                </div>
              </div>
            </div>

            <div className="p-2 space-y-1.5">
              {/* Locked Facility Mode Info + Switch via Login */}
              <div className="p-2.5 rounded-xl bg-slate-900/70 border border-slate-800/80 space-y-2">
                <div className="flex items-center justify-between px-0.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Mode Aktif
                  </span>
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-sky-300">
                    {facilityMode === 'klinik' ? (
                      <Stethoscope className="w-3 h-3 shrink-0" />
                    ) : (
                      <Building2 className="w-3 h-3 shrink-0" />
                    )}
                    <span>{facilityMode === 'klinik' ? 'Modul Klinik' : 'Modul Rumah Sakit'}</span>
                  </span>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    setIsOpen(false);
                    await logout();
                    navigate('/staff/login');
                    toast('Silakan pilih ulang mode Klinik atau Rumah Sakit');
                  }}
                  className="w-full flex items-center justify-center gap-1.5 py-1.5 px-2.5 rounded-lg text-[11px] font-semibold bg-white/[0.06] hover:bg-[#16417C] text-slate-200 hover:text-white transition-colors cursor-pointer"
                >
                  <ArrowLeftRight className="w-3 h-3 shrink-0" />
                  <span>Ganti Mode (Login Ulang)</span>
                </button>
              </div>

              <div className="px-3 py-2 text-[11px] text-slate-400 flex items-center justify-between rounded-xl bg-slate-900/60 border border-slate-800/80">
                <span className="flex items-center gap-1.5">
                  <Cloud className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Sinkronisasi Cloud</span>
                </span>
                <span className="text-emerald-400 font-semibold text-[10px]">Aktif</span>
              </div>

              <button
                type="button"
                onClick={toggleDarkMode}
                className="w-full flex items-center justify-between px-3 py-2 text-xs text-slate-200 hover:text-white hover:bg-white/[0.06] rounded-xl transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-2.5">
                  {isDarkMode ? (
                    <Sun size={15} className="text-amber-400" />
                  ) : (
                    <Moon size={15} className="text-slate-400" />
                  )}
                  <span>Mode Tampilan</span>
                </div>
                <span className="text-[10px] text-slate-400 font-semibold">
                  {isDarkMode ? 'Gelap' : 'Terang'}
                </span>
              </button>
            </div>

            <div className="p-2 border-t border-slate-800 bg-slate-950/40">
              <button
                type="button"
                onClick={handleLogout}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-rose-400 hover:bg-rose-500/15 hover:text-rose-300 rounded-xl transition-colors font-semibold cursor-pointer"
              >
                <LogOut size={15} />
                <span>Keluar dari SIMK</span>
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
