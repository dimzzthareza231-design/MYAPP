import React from 'react';
import { PhoneCall, ChevronRight, Smartphone } from 'lucide-react';
import { BrandLogo } from '../Common/BrandLogo';

export const EMPLOYEE_PORTAL_URL = 'https://myitaru.ai.studio/portal-karyawan';
export const STAFF_SIMK_URL = 'https://myitaru.ai.studio/staff/login';

interface ClinicLogoMarkProps {
  subtitle?: string;
  compact?: boolean;
  onClick?: () => void;
}

export const ClinicLogoMark: React.FC<ClinicLogoMarkProps> = ({
  subtitle,
  compact = false,
  onClick
}) => {
  const content = (
    <span className="flex items-center gap-2.5 text-left whitespace-nowrap shrink-0">
      <BrandLogo
        alt="MYITARU"
        className={`${compact ? 'w-8 h-8' : 'w-9 h-9'} rounded-xl shadow-xs object-cover border border-slate-200 dark:border-slate-700`}
      />
      <span className="flex flex-col leading-none">
        <span
          className={`${
            compact ? 'text-base' : 'text-lg sm:text-xl'
          } font-extrabold tracking-tight text-[#0B3D91] dark:text-sky-400`}
        >
          MYITARU
        </span>
        {subtitle && (
          <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mt-0.5">
            {subtitle}
          </span>
        )}
      </span>
    </span>
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className="cursor-pointer">
        {content}
      </button>
    );
  }

  return content;
};

interface PublicUtilityBarProps {
  rightLabel?: string;
  onRightClick?: () => void;
}

export const PublicUtilityBar: React.FC<PublicUtilityBarProps> = ({
  rightLabel = 'Portal Publik Pasien',
  onRightClick
}) => {
  return (
    <div className="bg-[#082B6B] text-white text-xs py-2 px-4 sm:px-6 lg:px-8 border-b border-white/10">
      <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-4">
          <a
            href="tel:1500911"
            className="inline-flex items-center gap-2 font-semibold text-white hover:text-red-200 transition"
          >
            <span className="inline-flex items-center gap-1 bg-[#DC2626] px-2 py-0.5 rounded font-bold tracking-wide">
              <PhoneCall className="w-3 h-3" /> IGD 24 JAM
            </span>
            <span className="font-mono tabular-nums font-bold">1-500-911</span>
          </a>
          <span className="hidden sm:inline text-blue-200">
            MYITARU SIMK · Terintegrasi BPJS VClaim &amp; Kemenkes SatuSehat
          </span>
        </div>

        {onRightClick && (
          <button
            type="button"
            onClick={onRightClick}
            className="inline-flex items-center gap-1.5 text-sky-200 hover:text-white font-semibold cursor-pointer whitespace-nowrap"
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span>{rightLabel}</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
};
