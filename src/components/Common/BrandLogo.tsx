import React, { useState } from 'react';
import { useHospital } from '../../contexts/HospitalContext';

interface BrandLogoProps {
  src?: string;
  alt?: string;
  className?: string;
}

export const OFFICIAL_LOGO_URL = '/logo-myitaru.png';

export const BrandLogo: React.FC<BrandLogoProps> = ({
  src,
  alt = 'MYITARU',
  className = 'w-9 h-9 rounded-xl object-cover shrink-0',
}) => {
  const { hospitalSettings } = useHospital();
  const [fallbackUsed, setFallbackUsed] = useState(false);

  const resolvedSrc = fallbackUsed
    ? '/icon.svg'
    : src || hospitalSettings?.logoUrl || OFFICIAL_LOGO_URL;

  return (
    <img
      src={resolvedSrc}
      alt={alt}
      className={className}
      onError={() => {
        if (!fallbackUsed) setFallbackUsed(true);
      }}
    />
  );
};
