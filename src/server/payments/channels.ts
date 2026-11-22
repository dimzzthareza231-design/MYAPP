// Registri kanal pembayaran. Daftar kanal yang diminta pemilik RS beserta status dukungannya menurut
// dokumentasi resmi Xendit (Payments API v3, POST /v3/payment_requests):
//   https://docs.xendit.co/docs/available-payment-channels  (diperiksa 2026-11-22)
// Kanal yang TIDAK didukung provider tetap dicantumkan dengan `supported: false` agar jelas bagi
// pemilik/pasien, tetapi tidak pernah ditawarkan atau dibuat (tanpa simulasi).
import type { PaymentChannelGroup, PaymentProviderId } from './types';

export interface PaymentChannelDefinition {
  id: string;
  label: string;
  group: PaymentChannelGroup;
  provider: PaymentProviderId;
  /** Kode kanal di provider (channel_code Xendit). */
  providerChannelCode?: string;
  supported: boolean;
  /** Penjelasan untuk kanal yang tidak didukung. */
  unsupportedReason?: string;
}

export const PAYMENT_CHANNELS: readonly PaymentChannelDefinition[] = [
  // Virtual Account
  { id: 'VA_BCA', label: 'BCA Virtual Account', group: 'VIRTUAL_ACCOUNT', provider: 'xendit', providerChannelCode: 'BCA_VIRTUAL_ACCOUNT', supported: true },
  { id: 'VA_MANDIRI', label: 'Mandiri Virtual Account', group: 'VIRTUAL_ACCOUNT', provider: 'xendit', providerChannelCode: 'MANDIRI_VIRTUAL_ACCOUNT', supported: true },
  { id: 'VA_BRI', label: 'BRI Virtual Account', group: 'VIRTUAL_ACCOUNT', provider: 'xendit', providerChannelCode: 'BRI_VIRTUAL_ACCOUNT', supported: true },
  { id: 'VA_BNI', label: 'BNI Virtual Account', group: 'VIRTUAL_ACCOUNT', provider: 'xendit', providerChannelCode: 'BNI_VIRTUAL_ACCOUNT', supported: true },
  { id: 'VA_CIMB', label: 'CIMB Niaga Virtual Account', group: 'VIRTUAL_ACCOUNT', provider: 'xendit', providerChannelCode: 'CIMB_VIRTUAL_ACCOUNT', supported: true },
  {
    id: 'VA_BANK_DKI', label: 'Bank DKI Virtual Account', group: 'VIRTUAL_ACCOUNT', provider: 'xendit', supported: false,
    unsupportedReason: 'Bank DKI tidak tersedia sebagai Virtual Account di Xendit. Nasabah Bank DKI dapat membayar melalui QRIS.'
  },
  {
    id: 'VA_BANK_JATENG', label: 'Bank Jateng Virtual Account', group: 'VIRTUAL_ACCOUNT', provider: 'xendit', supported: false,
    unsupportedReason: 'Bank Jateng tidak tersedia sebagai Virtual Account di Xendit. Nasabah Bank Jateng dapat membayar melalui QRIS.'
  },
  // E-Wallet
  { id: 'EWALLET_GOPAY', label: 'GoPay', group: 'EWALLET', provider: 'xendit', providerChannelCode: 'GOPAY', supported: true },
  { id: 'EWALLET_SHOPEEPAY', label: 'ShopeePay', group: 'EWALLET', provider: 'xendit', providerChannelCode: 'SHOPEEPAY', supported: true },
  { id: 'EWALLET_OVO', label: 'OVO', group: 'EWALLET', provider: 'xendit', providerChannelCode: 'OVO', supported: true },
  { id: 'EWALLET_DANA', label: 'DANA', group: 'EWALLET', provider: 'xendit', providerChannelCode: 'DANA', supported: true },
  { id: 'EWALLET_LINKAJA', label: 'LinkAja', group: 'EWALLET', provider: 'xendit', providerChannelCode: 'LINKAJA', supported: true },
  // QRIS
  { id: 'QRIS', label: 'QRIS', group: 'QRIS', provider: 'xendit', providerChannelCode: 'QRIS', supported: true },
  {
    id: 'QRIS_TAP', label: 'QRIS Tap (NFC)', group: 'QRIS', provider: 'xendit', supported: false,
    unsupportedReason: 'QRIS Tap (NFC) tidak tersedia di Xendit Payments API. Gunakan QRIS biasa (pindai kode QR).'
  },
  // PayPal (dikonfigurasi terpisah)
  { id: 'PAYPAL', label: 'PayPal', group: 'PAYPAL', provider: 'paypal', supported: true }
];

export function findChannel(id: string): PaymentChannelDefinition | undefined {
  return PAYMENT_CHANNELS.find((channel) => channel.id === id);
}

/**
 * PAYMENT_CHANNELS (env) = daftar id kanal dipisah koma yang diaktifkan, mis. "VA_BCA,QRIS,PAYPAL".
 * Kosong/tidak diisi = semua kanal yang didukung provider yang sudah dikonfigurasi.
 */
export function enabledChannelIds(env: Record<string, string | undefined> = process.env): Set<string> | null {
  const raw = (env.PAYMENT_CHANNELS || '').trim();
  if (!raw) return null;
  return new Set(raw.split(',').map((part) => part.trim().toUpperCase()).filter(Boolean));
}
