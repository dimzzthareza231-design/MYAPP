import React, { useState } from 'react';

interface BrandLogoProps {
  alt?: string;
  className?: string;
}

export const OFFICIAL_LOGO_URL = '/logo-myitaru.webp';

export const BrandLogo: React.FC<BrandLogoProps> = ({
  alt = 'MYITARU',
  className = 'w-9 h-9 rounded-xl object-cover shrink-0',
}) => {
  const [fallbackUsed, setFallbackUsed] = useState(false);

  const resolvedSrc = fallbackUsed
    ? '/icon.svg'
    : OFFICIAL_LOGO_URL;

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
