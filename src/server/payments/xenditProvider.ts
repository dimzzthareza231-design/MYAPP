// Xendit Payments API v3 (POST /v3/payment_requests, api-version 2024-11-11).
// Referensi: https://docs.xendit.co/apidocs/create-payment-request
//            https://docs.xendit.co/apidocs/payment-webhook-notification
//            https://docs.xendit.co/docs/handling-webhooks (verifikasi header x-callback-token)
import {
  PaymentProviderError,
  type CreateProviderPaymentInput,
  type CreateProviderPaymentResult,
  type FetchLike,
  type PaymentInstructions,
  type PaymentProvider,
  type PaymentStatus,
  type ProviderStatusResult,
  type ProviderWebhookEvent
} from './types';
import { basicAuth, timingSafeEqualString } from './webCrypto';

const XENDIT_API_BASE = 'https://api.xendit.co';
const XENDIT_API_VERSION = '2024-11-11';

interface XenditAction { type?: string; descriptor?: string; value?: string }
interface XenditPaymentRequest {
  payment_request_id?: string;
  reference_id?: string;
  status?: string;
  request_amount?: number;
  currency?: string;
  actions?: XenditAction[];
  channel_properties?: { expires_at?: string };
  error_code?: string;
  message?: string;
}

export function mapXenditStatus(status: string | undefined): PaymentStatus {
  switch (status) {
    case 'SUCCEEDED': return 'PAID';
    case 'FAILED': return 'FAILED';
    case 'EXPIRED':
    case 'CANCELED': return 'EXPIRED';
    default: return 'PENDING';
  }
}

export interface XenditProviderOptions {
  secretKey?: string;
  callbackToken?: string;
  vaDisplayName?: string;
  fetch?: FetchLike;
  apiBase?: string;
}

export class XenditProvider implements PaymentProvider {
  readonly id = 'xendit' as const;
  private readonly fetchImpl: FetchLike;

  constructor(private readonly options: XenditProviderOptions = {}) {
    this.fetchImpl = options.fetch || ((input, init) => fetch(input, init));
  }

  static fromEnv(env: Record<string, string | undefined> = process.env, fetchImpl?: FetchLike): XenditProvider {
    return new XenditProvider({
      secretKey: env.XENDIT_SECRET_KEY,
      callbackToken: env.XENDIT_CALLBACK_TOKEN,
      vaDisplayName: env.XENDIT_VA_DISPLAY_NAME,
      fetch: fetchImpl
    });
  }

  /** Butuh secret key untuk membuat pembayaran DAN callback token untuk menerima konfirmasi. */
  isConfigured(): boolean {
    return Boolean(this.options.secretKey && this.options.callbackToken);
  }

  private headers(idempotencyKey?: string): Record<string, string> {
    return {
      Authorization: basicAuth(this.options.secretKey || '', ''),
      'Content-Type': 'application/json',
      'api-version': XENDIT_API_VERSION,
      ...(idempotencyKey ? { 'idempotency-key': idempotencyKey } : {})
    };
  }

  private async request(path: string, init: RequestInit): Promise<XenditPaymentRequest> {
    const res = await this.fetchImpl(`${this.options.apiBase || XENDIT_API_BASE}${path}`, {
      ...init,
      signal: AbortSignal.timeout(15_000)
    });
    const body = await res.json().catch(() => ({})) as XenditPaymentRequest;
    if (!res.ok) {
      throw new PaymentProviderError(`Xendit menolak permintaan (HTTP ${res.status}).`, res.status, body.error_code);
    }
    return body;
  }

  async createPayment(input: CreateProviderPaymentInput): Promise<CreateProviderPaymentResult> {
    const channelProperties: Record<string, unknown> = {};
    if (input.group === 'VIRTUAL_ACCOUNT') {
      channelProperties.display_name = (this.options.vaDisplayName || 'MYITARU').slice(0, 64);
      channelProperties.expires_at = input.expires_at;
    } else if (input.group === 'QRIS') {
      channelProperties.expires_at = input.expires_at;
    } else {
      channelProperties.success_return_url = input.return_url;
      channelProperties.failure_return_url = input.cancel_url;
    }

    const body = await this.request('/v3/payment_requests', {
      method: 'POST',
      headers: this.headers(input.idempotency_key),
      body: JSON.stringify({
        reference_id: input.payment_id,
        type: 'PAY',
        country: 'ID',
        currency: input.currency,
        request_amount: input.amount,
        capture_method: 'AUTOMATIC',
        channel_code: input.channel_code,
        channel_properties: channelProperties,
        description: input.description.slice(0, 1000),
        metadata: { payment_id: input.payment_id }
      })
    });

    if (!body.payment_request_id) {
      throw new PaymentProviderError('Respons Xendit tidak memuat payment_request_id.');
    }
    const instructions = extractInstructions(body.actions || [], input);
    if (!instructions) {
      throw new PaymentProviderError('Respons Xendit tidak memuat instruksi pembayaran.');
    }
    return {
      provider_ref: body.payment_request_id,
      status: mapXenditStatus(body.status),
      instructions,
      expires_at: body.channel_properties?.expires_at,
      raw: body
    };
  }

  async getStatus(providerRef: string): Promise<ProviderStatusResult> {
    const body = await this.request(`/v3/payment_requests/${encodeURIComponent(providerRef)}`, {
      method: 'GET',
      headers: this.headers()
    });
    return { status: mapXenditStatus(body.status), amount: body.request_amount, currency: body.currency, raw: body };
  }

  async verifyWebhook(headers: Record<string, string | undefined>, _rawBody: string, body: unknown): Promise<ProviderWebhookEvent | null> {
    const expected = this.options.callbackToken;
    const received = headers['x-callback-token'];
    if (!expected || !received) return null;
    if (!(await timingSafeEqualString(received, expected))) return null;

    const payload = (body && typeof body === 'object' ? body : {}) as {
      event?: string;
      data?: XenditPaymentRequest & { amount?: number };
    };
    const event = String(payload.event || '');
    const data = payload.data || {};
    let status: PaymentStatus | undefined;
    if (event === 'payment.capture') status = 'PAID';
    else if (event === 'payment.failure') status = 'FAILED';
    else if (event === 'payment_request.expiry') status = 'EXPIRED';
    return {
      event_type: event || 'unknown',
      provider_ref: typeof data.payment_request_id === 'string' ? data.payment_request_id : undefined,
      payment_id: typeof data.reference_id === 'string' ? data.reference_id : undefined,
      status,
      amount: typeof data.request_amount === 'number' ? data.request_amount : data.amount,
      currency: data.currency
    };
  }
}

function extractInstructions(actions: XenditAction[], input: CreateProviderPaymentInput): PaymentInstructions | null {
  const find = (descriptor: string) => actions.find((action) => action.descriptor === descriptor && action.value)?.value;
  if (input.group === 'VIRTUAL_ACCOUNT') {
    const vaNumber = find('VIRTUAL_ACCOUNT_NUMBER');
    return vaNumber ? { kind: 'virtual_account', bank: input.bank_label, va_number: vaNumber } : null;
  }
  if (input.group === 'QRIS') {
    const qr = find('QR_STRING');
    return qr ? { kind: 'qr', qr_string: qr } : null;
  }
  const deeplink = find('DEEPLINK_URL');
  const url = find('WEB_URL') || find('MOBILE_WEB_URL') || deeplink;
  if (url) return { kind: 'redirect', url, deeplink: deeplink && deeplink !== url ? deeplink : undefined };
  const qr = find('QR_STRING');
  return qr ? { kind: 'qr', qr_string: qr } : null;
}
