import React from 'react';

interface SectionHeadingProps {
  id?: string;
  eyebrow: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  className?: string;
  /** Gunakan varian terang untuk latar brand gelap. */
  inverted?: boolean;
}

/** Judul section standar: eyebrow kecil + h2 + deskripsi opsional. */
export const SectionHeading: React.FC<SectionHeadingProps> = ({
  id,
  eyebrow,
  title,
  description,
  className = '',
  inverted = false
}) => (
  <div className={className}>
    <p
      className={`text-xs font-bold uppercase tracking-[0.16em] ${inverted ? 'text-sky-200' : 'text-brand'}`}
    >
      {eyebrow}
    </p>
    <h2
      id={id}
      className={`text-2xl sm:text-3xl font-extrabold mt-1 text-balance ${inverted ? 'text-white' : 'text-slate-900'}`}
    >
      {title}
    </h2>
    {description && (
      <p className={`text-sm mt-2 leading-relaxed ${inverted ? 'text-blue-100' : 'text-slate-600'}`}>
        {description}
      </p>
    )}
  </div>
);
