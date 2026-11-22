// PayPal Orders v2 + verifikasi webhook via /v1/notifications/verify-webhook-signature.
// Referensi: https://developer.paypal.com/docs/api/orders/v2/
//            https://developer.paypal.com/docs/api/webhooks/v1/#verify-webhook-signature
//            https://developer.paypal.com/reference/currency-codes/ (IDR TIDAK didukung PayPal)
// Karena IDR tidak didukung, PayPal hanya aktif bila pemilik mengonfigurasi mata uang settlement
// (PAYPAL_CURRENCY, mis. USD) dan kurs tetap PAYPAL_IDR_PER_UNIT (IDR per 1 unit mata uang tsb).
import {
  PaymentProviderError,
  type CreateProviderPaymentInput,
  type CreateProviderPaymentResult,
  type FetchLike,
  type PaymentProvider,
  type PaymentStatus,
  type ProviderStatusResult,
  type ProviderWebhookEvent
} from './types';
import { basicAuth } from './webCrypto';

const PAYPAL_SUPPORTED_CURRENCIES = new Set([
  'AUD', 'BRL', 'CAD', 'CNY', 'CZK', 'DKK', 'EUR', 'HKD', 'HUF', 'ILS', 'JPY', 'MYR',
  'MXN', 'TWD', 'NZD', 'NOK', 'PHP', 'PLN', 'GBP', 'SGD', 'SEK', 'CHF', 'THB', 'USD'
]);
const ZERO_DECIMAL = new Set(['HUF', 'JPY', 'TWD']);

interface PayPalOrder {
  id?: string;
  status?: string;
  links?: Array<{ rel?: string; href?: string }>;
  purchase_units?: Array<{
    custom_id?: string;
    amount?: { currency_code?: string; value?: string };
    payments?: { captures?: Array<{ status?: string; amount?: { currency_code?: string; value?: string } }> };
  }>;
}

export function mapPayPalOrderStatus(status: string | undefined): PaymentStatus {
  if (status === 'COMPLETED') return 'PAID';
  if (status === 'VOIDED') return 'EXPIRED';
  return 'PENDING';
}

export interface PayPalProviderOptions {
  clientId?: string;
  clientSecret?: string;
  env?: string;
  webhookId?: string;
  currency?: string;
  idrPerUnit?: number;
  fetch?: FetchLike;
}

export class PayPalProvider implements PaymentProvider {
  readonly id = 'paypal' as const;
  private readonly fetchImpl: FetchLike;
  private cachedToken?: { token: string; expiresAt: number };

  constructor(private readonly options: PayPalProviderOptions = {}) {
    this.fetchImpl = options.fetch || ((input, init) => fetch(input, init));
  }

  static fromEnv(env: Record<string, string | undefined> = process.env, fetchImpl?: FetchLike): PayPalProvider {
    const rate = Number(env.PAYPAL_IDR_PER_UNIT);
    return new PayPalProvider({
      clientId: env.PAYPAL_CLIENT_ID,
      clientSecret: env.PAYPAL_CLIENT_SECRET,
      env: env.PAYPAL_ENV,
      webhookId: env.PAYPAL_WEBHOOK_ID,
      currency: (env.PAYPAL_CURRENCY || '').trim().toUpperCase() || undefined,
      idrPerUnit: Number.isFinite(rate) && rate > 0 ? rate : undefined,
      fetch: fetchImpl
    });
  }

  get apiBase(): string {
    return this.options.env === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';
  }

  /** Kredensial, webhook ID, mata uang settlement yang didukung PayPal, dan kurs wajib ada. */
  isConfigured(): boolean {
    const { clientId, clientSecret, webhookId, currency, idrPerUnit, env } = this.options;
    return Boolean(
      clientId && clientSecret && webhookId && idrPerUnit &&
      currency && PAYPAL_SUPPORTED_CURRENCIES.has(currency) &&
      (env === 'sandbox' || env === 'live')
    );
  }

  /** Konversi nominal IDR (dari tagihan server) ke mata uang settlement PayPal, dibulatkan ke atas. */
  convertFromIdr(amountIdr: number): { amount: number; currency: string; value: string } {
    const currency = this.options.currency || '';
    const rate = this.options.idrPerUnit || 0;
    if (!currency || !rate) throw new PaymentProviderError('PayPal belum dikonfigurasi.');
    const decimals = ZERO_DECIMAL.has(currency) ? 0 : 2;
    const factor = 10 ** decimals;
    const amount = Math.ceil((amountIdr / rate) * factor - 1e-9) / factor;
    return { amount, currency, value: amount.toFixed(decimals) };
  }

  private async accessToken(): Promise<string> {
    if (this.cachedToken && this.cachedToken.expiresAt > Date.now() + 60_000) return this.cachedToken.token;
    const res = await this.fetchImpl(`${this.apiBase}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        Authorization: basicAuth(this.options.clientId || '', this.options.clientSecret || ''),
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: 'grant_type=client_credentials',
      signal: AbortSignal.timeout(15_000)
    });
    const body = await res.json().catch(() => ({})) as { access_token?: string; expires_in?: number };
    if (!res.ok || !body.access_token) throw new PaymentProviderError(`PayPal OAuth gagal (HTTP ${res.status}).`, res.status);
    this.cachedToken = { token: body.access_token, expiresAt: Date.now() + (body.expires_in || 300) * 1000 };
    return body.access_token;
  }

  private async api<T>(path: string, init: { method: string; body?: unknown; requestId?: string }): Promise<T> {
    const token = await this.accessToken();
    const res = await this.fetchImpl(`${this.apiBase}${path}`, {
      method: init.method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(init.requestId ? { 'PayPal-Request-Id': init.requestId } : {})
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: AbortSignal.timeout(15_000)
    });
    const body = await res.json().catch(() => ({})) as T & { name?: string };
    if (!res.ok) throw new PaymentProviderError(`PayPal menolak permintaan (HTTP ${res.status}).`, res.status, body.name);
    return body;
  }

  async createPayment(input: CreateProviderPaymentInput): Promise<CreateProviderPaymentResult> {
    // input.amount/currency sudah dalam mata uang settlement (dikonversi oleh service).
    const decimals = ZERO_DECIMAL.has(input.currency) ? 0 : 2;
    const order = await this.api<PayPalOrder>('/v2/checkout/orders', {
      method: 'POST',
      requestId: input.idempotency_key,
      body: {
        intent: 'CAPTURE',
        purchase_units: [{
          reference_id: input.payment_id,
          custom_id: input.payment_id,
          description: input.description.slice(0, 127),
          amount: { currency_code: input.currency, value: input.amount.toFixed(decimals) }
        }],
        payment_source: {
          paypal: {
            experience_context: {
              user_action: 'PAY_NOW',
              shipping_preference: 'NO_SHIPPING',
              return_url: input.return_url,
              cancel_url: input.cancel_url
            }
          }
        }
      }
    });
    const approve = order.links?.find((link) => link.rel === 'payer-action' || link.rel === 'approve')?.href;
    if (!order.id || !approve) throw new PaymentProviderError('Respons PayPal tidak memuat tautan persetujuan.');
    return { provider_ref: order.id, status: 'PENDING', instructions: { kind: 'redirect', url: approve }, raw: order };
  }

  async getStatus(providerRef: string): Promise<ProviderStatusResult> {
    const order = await this.api<PayPalOrder>(`/v2/checkout/orders/${encodeURIComponent(providerRef)}`, { method: 'GET' });
    if (order.status === 'APPROVED') return { status: 'PENDING', raw: { ...order, needs_capture: true } };
    return { ...orderAmount(order), status: mapPayPalOrderStatus(order.status), raw: order };
  }

  async capture(providerRef: string): Promise<ProviderStatusResult> {
    const order = await this.api<PayPalOrder>(`/v2/checkout/orders/${encodeURIComponent(providerRef)}/capture`, {
      method: 'POST',
      body: {},
      requestId: `capture-${providerRef}`
    });
    const capture = order.purchase_units?.[0]?.payments?.captures?.[0];
    let status = mapPayPalOrderStatus(order.status);
    if (capture?.status === 'DECLINED' || capture?.status === 'FAILED') status = 'FAILED';
    return {
      status,
      amount: capture?.amount?.value ? Number(capture.amount.value) : undefined,
      currency: capture?.amount?.currency_code,
      raw: order
    };
  }

  async verifyWebhook(headers: Record<string, string | undefined>, _rawBody: string, body: unknown): Promise<ProviderWebhookEvent | null> {
    if (!this.isConfigured()) return null;
    const required = ['paypal-auth-algo', 'paypal-cert-url', 'paypal-transmission-id', 'paypal-transmission-sig', 'paypal-transmission-time'];
    if (required.some((name) => !headers[name]) || !body || typeof body !== 'object') return null;
    try {
      const result = await this.api<{ verification_status?: string }>('/v1/notifications/verify-webhook-signature', {
        method: 'POST',
        body: {
          auth_algo: headers['paypal-auth-algo'],
          cert_url: headers['paypal-cert-url'],
          transmission_id: headers['paypal-transmission-id'],
          transmission_sig: headers['paypal-transmission-sig'],
          transmission_time: headers['paypal-transmission-time'],
          webhook_id: this.options.webhookId,
          webhook_event: body
        }
      });
      if (result.verification_status !== 'SUCCESS') return null;
    } catch {
      return null;
    }

    const event = body as {
      event_type?: string;
      resource?: {
        id?: string;
        custom_id?: string;
        status?: string;
        amount?: { currency_code?: string; value?: string };
        purchase_units?: Array<{ custom_id?: string }>;
        supplementary_data?: { related_ids?: { order_id?: string } };
      };
    };
    const type = String(event.event_type || 'unknown');
    const resource = event.resource || {};
    if (type === 'CHECKOUT.ORDER.APPROVED') {
      return { event_type: type, provider_ref: resource.id, payment_id: resource.purchase_units?.[0]?.custom_id, needs_capture: true };
    }
    if (type.startsWith('PAYMENT.CAPTURE.')) {
      let status: PaymentStatus | undefined;
      if (type === 'PAYMENT.CAPTURE.COMPLETED') status = 'PAID';
      else if (type === 'PAYMENT.CAPTURE.DENIED' || type === 'PAYMENT.CAPTURE.DECLINED') status = 'FAILED';
      return {
        event_type: type,
        provider_ref: resource.supplementary_data?.related_ids?.order_id,
        payment_id: resource.custom_id,
        status,
        amount: resource.amount?.value ? Number(resource.amount.value) : undefined,
        currency: resource.amount?.currency_code
      };
    }
    return { event_type: type };
  }
}

function orderAmount(order: PayPalOrder): { amount?: number; currency?: string } {
  const capture = order.purchase_units?.[0]?.payments?.captures?.[0];
  const amount = capture?.amount || order.purchase_units?.[0]?.amount;
  return { amount: amount?.value ? Number(amount.value) : undefined, currency: amount?.currency_code };
}
