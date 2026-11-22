// Klien API pembayaran online tagihan pasien. Identitas pasien selalu dari sesi (Bearer/cookie);
// nominal tidak pernah dikirim dari klien.

export type PaymentChannelGroup = 'VIRTUAL_ACCOUNT' | 'EWALLET' | 'QRIS' | 'PAYPAL';
export type PaymentStatus = 'PENDING' | 'PAID' | 'FAILED' | 'EXPIRED';

export interface PaymentChannel {
  id: string;
  label: string;
  group: PaymentChannelGroup;
  provider: 'xendit' | 'paypal';
  available: boolean;
  reason?: string;
}

export interface PatientBill {
  id: string;
  no_billing: string;
  tanggal: string;
  layanan: string;
  status: string;
  total: number;
  sisa: number;
  payable: boolean;
  items: Array<{ nama: string; nominal: number }>;
}

export type PaymentInstructions =
  | { kind: 'virtual_account'; bank: string; va_number: string }
  | { kind: 'qr'; qr_string: string }
  | { kind: 'redirect'; url: string; deeplink?: string };

export interface PatientPayment {
  id: string;
  bill_id: string;
  provider: 'xendit' | 'paypal';
  channel: string;
  channel_label: string;
  group?: PaymentChannelGroup;
  amount: number;
  currency: 'IDR';
  charge_amount: number;
  charge_currency: string;
  status: PaymentStatus;
  instructions?: PaymentInstructions;
  expires_at?: string;
  paid_at?: string;
}

export const PAYMENT_UNAVAILABLE_MESSAGE = 'Pembayaran online belum tersedia, silakan bayar di kasir.';

export const GROUP_LABELS: Record<PaymentChannelGroup, string> = {
  VIRTUAL_ACCOUNT: 'Virtual Account',
  EWALLET: 'E-Wallet',
  QRIS: 'QRIS',
  PAYPAL: 'PayPal'
};

export class PaymentApiError extends Error {
  constructor(readonly status: number, readonly code: string | undefined, message: string) {
    super(message);
  }
}

const TOKEN_KEY = 'myitaru_patient_token';

function readStoredToken(): string | null {
  try {
    return sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

async function request<T>(path: string, token: string | null | undefined, init: RequestInit = {}): Promise<T> {
  const bearer = token || readStoredToken();
  const res = await fetch(path, {
    ...init,
    credentials: 'same-origin',
    headers: {
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
      ...(init.headers || {})
    }
  });
  const body = await res.json().catch(() => null) as ({ success?: boolean; code?: string; message?: string } & T) | null;
  if (!res.ok || !body?.success) {
    throw new PaymentApiError(res.status, body?.code, body?.message || 'Permintaan pembayaran gagal. Coba lagi.');
  }
  return body;
}

export const paymentApi = {
  channels: (token?: string | null) =>
    request<{ configured: boolean; channels: PaymentChannel[]; unavailable: PaymentChannel[] }>('/api/patient/payments/channels', token),
  bills: (token?: string | null) => request<{ bills: PatientBill[] }>('/api/patient/payments/bills', token),
  create: (billId: string, channel: string, token?: string | null) =>
    request<{ payment: PatientPayment }>('/api/patient/payments', token, {
      method: 'POST',
      body: JSON.stringify({ bill_id: billId, channel })
    }),
  status: (paymentId: string, token?: string | null) =>
    request<{ payment: PatientPayment }>(`/api/patient/payments/${encodeURIComponent(paymentId)}`, token)
};
