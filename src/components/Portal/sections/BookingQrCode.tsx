import React from 'react';
import { QRCodeSVG } from 'qrcode.react';

/** Dimuat secara lazy agar pustaka QR tidak ikut bundle awal halaman publik. */
const BookingQrCode: React.FC<{ value: string; size?: number }> = ({ value, size = 144 }) => (
  <QRCodeSVG value={value} size={size} level="M" role="img" aria-label="Kode QR reservasi" />
);

export default BookingQrCode;
