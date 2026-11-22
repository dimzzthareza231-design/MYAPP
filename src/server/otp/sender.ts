// Pengirim OTP. Produksi hanya memakai WhatsAppCloudSender (Meta WhatsApp Cloud API).
// Tidak ada mode demo: bila konfigurasi tidak lengkap, createOtpSenderFromEnv() mengembalikan null
// dan endpoint login pasien menjawab 503 PATIENT_LOGIN_UNAVAILABLE.

export interface OtpSendResult {
  ok: boolean;
  /** ID pesan dari penyedia (untuk audit), bila ada. */
  providerMessageId?: string;
  /** Kode/teks galat singkat tanpa data sensitif. */
  error?: string;
}

export interface OtpSender {
  readonly channel: 'whatsapp' | 'test';
  /** @param toE164 nomor tujuan E.164 tanpa "+" (mis. 6281234567890) */
  sendOtp(toE164: string, code: string): Promise<OtpSendResult>;
}

export interface WhatsAppCloudConfig {
  accessToken: string;
  phoneNumberId: string;
  templateName: string;
  templateLang: string;
  apiVersion: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export const DEFAULT_WHATSAPP_API_VERSION = 'v23.0';

export class WhatsAppCloudSender implements OtpSender {
  readonly channel = 'whatsapp' as const;
  constructor(private readonly config: WhatsAppCloudConfig) {}

  /** Body permintaan template autentikasi dengan tombol salin kode (OTP muncul di body dan tombol). */
  buildPayload(toE164: string, code: string) {
    return {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: toE164,
      type: 'template',
      template: {
        name: this.config.templateName,
        language: { code: this.config.templateLang },
        components: [
          { type: 'body', parameters: [{ type: 'text', text: code }] },
          { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: code }] }
        ]
      }
    };
  }

  async sendOtp(toE164: string, code: string): Promise<OtpSendResult> {
    const { accessToken, phoneNumberId, apiVersion } = this.config;
    const fetchImpl = this.config.fetchImpl ?? fetch;
    const url = `https://graph.facebook.com/${encodeURIComponent(apiVersion)}/${encodeURIComponent(phoneNumberId)}/messages`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs ?? 10_000);
    try {
      const res = await fetchImpl(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(this.buildPayload(toE164, code)),
        signal: controller.signal
      });
      const data = (await res.json().catch(() => null)) as
        | { messages?: Array<{ id?: string }>; error?: { code?: number; error_subcode?: number; type?: string } }
        | null;
      if (!res.ok) {
        const err = data?.error;
        return { ok: false, error: `HTTP_${res.status}${err?.code ? `_${err.code}` : ''}${err?.error_subcode ? `_${err.error_subcode}` : ''}` };
      }
      return { ok: true, providerMessageId: data?.messages?.[0]?.id };
    } catch (error) {
      return { ok: false, error: (error as Error)?.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK_ERROR' };
    } finally {
      clearTimeout(timer);
    }
  }
}

type Env = Record<string, string | undefined>;

export function createOtpSenderFromEnv(env: Env = process.env): OtpSender | null {
  const accessToken = env.WHATSAPP_ACCESS_TOKEN?.trim();
  const phoneNumberId = env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  const templateName = env.WHATSAPP_OTP_TEMPLATE?.trim();
  if (!accessToken || !phoneNumberId || !templateName) return null;
  return new WhatsAppCloudSender({
    accessToken,
    phoneNumberId,
    templateName,
    templateLang: env.WHATSAPP_TEMPLATE_LANG?.trim() || 'id',
    apiVersion: env.WHATSAPP_API_VERSION?.trim() || DEFAULT_WHATSAPP_API_VERSION
  });
}
