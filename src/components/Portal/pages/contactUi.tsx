import React from 'react';
import { toTelHref, toWhatsAppHref } from '../../../data/hospitalPublicCatalog';

export interface ContactRow {
  label: string;
  value: string;
  kind?: 'tel' | 'wa' | 'email' | 'text';
}

/** Daftar kontak; baris kosong otomatis disembunyikan. Mengembalikan null bila semua kosong. */
export const ContactList: React.FC<{ rows: ContactRow[] }> = ({ rows }) => {
  const filled = rows.filter((r) => r.value && r.value.trim());
  if (filled.length === 0) return null;
  return (
    <dl className="rounded-2xl border border-slate-200 bg-white p-5 grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm not-prose">
      {filled.map((r) => {
        let href = '';
        if (r.kind === 'tel') href = toTelHref(r.value);
        if (r.kind === 'wa') href = toWhatsAppHref(r.value);
        if (r.kind === 'email') href = `mailto:${r.value}`;
        return (
          <div key={r.label}>
            <dt className="text-xs font-bold text-slate-600">{r.label}</dt>
            <dd className="text-slate-900 font-semibold break-words">
              {href ? (
                <a
                  href={href}
                  {...(r.kind === 'wa' ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                  className="text-brand underline-offset-2 hover:underline rounded"
                >
                  {r.value}
                </a>
              ) : (
                r.value
              )}
            </dd>
          </div>
        );
      })}
    </dl>
  );
};
