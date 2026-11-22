import React, { useState } from 'react';
import type { LiveDoctor } from '../portalShared';

export function doctorInitials(nama: string): string {
  return nama
    .replace(/^(dr\.|drg\.)\s*/i, '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0])
    .join('')
    .toUpperCase();
}

/** Foto dokter bila server menyediakan foto_url; selain itu inisial (tanpa foto stok/karangan). */
export const DoctorAvatar: React.FC<{ doctor: LiveDoctor; size?: 'md' | 'lg' }> = ({ doctor, size = 'md' }) => {
  const [failed, setFailed] = useState(false);
  const dim = size === 'lg' ? 'w-28 h-28 sm:w-36 sm:h-36 text-3xl' : 'w-14 h-14 text-lg';
  const url = typeof doctor.foto_url === 'string' ? doctor.foto_url.trim() : '';
  if (url && !failed) {
    return (
      <img
        src={url}
        alt={`Foto ${doctor.nama}`}
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
        className={`${dim} rounded-2xl object-cover bg-slate-100 shrink-0`}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className={`${dim} rounded-2xl bg-blue-50 text-brand font-extrabold flex items-center justify-center shrink-0`}
    >
      {doctorInitials(doctor.nama)}
    </span>
  );
};
