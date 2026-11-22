// Tipe bersama modul pembayaran online tagihan pasien (Xendit + PayPal).
// Kode ini dipakai di Node, Vercel, dan Cloudflare Workers: hanya fetch + Web Crypto.

export type PaymentProviderId = 'xendit' | 'paypal';
export type PaymentChannelGroup = 'VIRTUAL_ACCOUNT' | 'EWALLET' | 'QRIS' | 'PAYPAL';
export type PaymentStatus = 'PENDING' | 'PAID' | 'FAILED' | 'EXPIRED';

/** Instruksi yang ditampilkan ke pasien setelah pembayaran dibuat. */
export type PaymentInstructions =
  | { kind: 'virtual_account'; bank: string; va_number: string }
  | { kind: 'qr'; qr_string: string }
  | { kind: 'redirect'; url: string; deeplink?: string };

export interface PaymentRecord {
  id: string;
  bill_id: string;
  patient_rm: string;
  provider: PaymentProviderId;
  channel: string;
  /** Nominal tagihan (IDR) yang diambil dari tagihan di server. */
  amount: number;
  currency: 'IDR';
  /** Nominal yang benar-benar ditagihkan ke provider (berbeda untuk PayPal: mata uang settlement). */
  charge_amount: number;
  charge_currency: string;
  status: PaymentStatus;
  idempotency_key: string;
  provider_ref?: string;
  instructions?: PaymentInstructions;
  expires_at?: string;
  paid_at?: string;
  failure_reason?: string;
  raw_webhook?: unknown;
  last_provider_check_at?: string;
  created_at: string;
  updated_at: string;
}

export interface CreateProviderPaymentInput {
  payment_id: string;
  idempotency_key: string;
  channel_code: string;
  group: PaymentChannelGroup;
  bank_label: string;
  amount: number;
  currency: string;
  description: string;
  expires_at: string;
  return_url: string;
  cancel_url: string;
}

export interface CreateProviderPaymentResult {
  provider_ref: string;
  status: PaymentStatus;
  instructions: PaymentInstructions;
  expires_at?: string;
  raw?: unknown;
}

export interface ProviderStatusResult {
  status: PaymentStatus;
  amount?: number;
  currency?: string;
  raw?: unknown;
}

/** Hasil verifikasi + normalisasi webhook. `null` dari verify berarti tidak terverifikasi. */
export interface ProviderWebhookEvent {
  provider_ref?: string;
  /** reference_id / custom_id yang kita kirim (= id pembayaran internal), jika ada. */
  payment_id?: string;
  status?: PaymentStatus;
  amount?: number;
  currency?: string;
  event_type: string;
  /** Untuk PayPal: order sudah disetujui pembeli dan perlu di-capture. */
  needs_capture?: boolean;
}

export interface PaymentProvider {
  readonly id: PaymentProviderId;
  isConfigured(): boolean;
  createPayment(input: CreateProviderPaymentInput): Promise<CreateProviderPaymentResult>;
  getStatus(providerRef: string): Promise<ProviderStatusResult>;
  /** Verifikasi keaslian webhook. Mengembalikan null bila gagal verifikasi. */
  verifyWebhook(headers: Record<string, string | undefined>, rawBody: string, body: unknown): Promise<ProviderWebhookEvent | null>;
  /** Opsional (PayPal): capture order yang sudah disetujui. */
  capture?(providerRef: string): Promise<ProviderStatusResult>;
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export class PaymentProviderError extends Error {
  constructor(message: string, readonly httpStatus?: number, readonly providerCode?: string) {
    super(message);
    this.name = 'PaymentProviderError';
  }
}
