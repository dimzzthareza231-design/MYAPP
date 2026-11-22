// Logika pembayaran online tagihan pasien: pemilihan kanal, pembuatan pembayaran (nominal SELALU
// dari tagihan di server), sinkronisasi status, dan pemrosesan webhook yang idempoten.
import type { PersistenceChange, PersistenceRepository } from '../databaseAdapter';
import { PAYMENT_CHANNELS, enabledChannelIds, findChannel, type PaymentChannelDefinition } from './channels';
import { PayPalProvider } from './paypalProvider';
import { XenditProvider } from './xenditProvider';
import {
  PaymentProviderError,
  type PaymentChannelGroup,
  type PaymentProvider,
  type PaymentProviderId,
  type PaymentRecord,
  type PaymentStatus,
  type ProviderWebhookEvent
} from './types';

/** Bentuk tagihan yang dibaca dari entitas persistensi `billings` (sejalan dengan BillingRecord modul Kasir). */
export interface ServerBillRecord {
  id: string;
  noBilling?: string;
  noRm?: string;
  no_rm?: string;
  namaPasien?: string;
  tipeLayanan?: string;
  poliRuangan?: string;
  tanggalMasuk?: string;
  totalTagihan?: number;
  sisaTagihan?: number;
  jumlahDibayar?: number;
  status?: string;
  items?: Array<{ nama?: string; kategori?: string; subtotal?: number; nominal?: number }>;
  metodePembayaran?: string;
  nomorReferensiPembayaran?: string;
  tanggalBayar?: string;
  [key: string]: unknown;
}

export interface PublicBill {
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

export interface PublicChannel {
  id: string;
  label: string;
  group: PaymentChannelGroup;
  provider: PaymentProviderId;
  available: boolean;
  reason?: string;
}

export interface AuditEntry {
  user: string;
  role: string;
  action: string;
  module: string;
  ip: string;
  status: 'SUCCESS' | 'FAILED' | 'WARNING';
  details: string;
}

export class PaymentServiceError extends Error {
  constructor(readonly httpStatus: number, readonly code: string, message: string) {
    super(message);
  }
}

const PAYABLE_BILL_STATUSES = new Set(['Belum Lunas', 'Sebagian', 'Menunggu Pembayaran']);
const PROVIDER_REFRESH_INTERVAL_MS = 15_000;
const STATUS_RANK: Record<PaymentStatus, number> = { PENDING: 0, FAILED: 1, EXPIRED: 1, PAID: 2 };

function normalizeRm(value: unknown): string {
  return String(value || '').trim().toUpperCase();
}

function billRm(bill: ServerBillRecord): string {
  return normalizeRm(bill.noRm ?? bill.no_rm);
}

/** Sisa tagihan dalam IDR utuh; null bila tidak valid. */
export function outstandingAmount(bill: ServerBillRecord): number | null {
  const raw = typeof bill.sisaTagihan === 'number' ? bill.sisaTagihan : bill.totalTagihan;
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw <= 0) return null;
  return Math.round(raw);
}

function isPayable(bill: ServerBillRecord): boolean {
  return PAYABLE_BILL_STATUSES.has(String(bill.status || '')) && outstandingAmount(bill) !== null;
}

function expiryMsFor(channel: PaymentChannelDefinition): number {
  if (channel.group === 'VIRTUAL_ACCOUNT') return 24 * 60 * 60 * 1000;
  if (channel.group === 'PAYPAL') return 3 * 60 * 60 * 1000;
  if (channel.id === 'EWALLET_OVO') return 15 * 60 * 1000;
  return 30 * 60 * 1000;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function toPublicPayment(payment: PaymentRecord) {
  const channel = findChannel(payment.channel);
  return {
    id: payment.id,
    bill_id: payment.bill_id,
    provider: payment.provider,
    channel: payment.channel,
    channel_label: channel?.label || payment.channel,
    group: channel?.group,
    amount: payment.amount,
    currency: payment.currency,
    charge_amount: payment.charge_amount,
    charge_currency: payment.charge_currency,
    status: payment.status,
    instructions: payment.status === 'PENDING' ? payment.instructions : undefined,
    expires_at: payment.expires_at,
    paid_at: payment.paid_at,
    created_at: payment.created_at
  };
}

export interface PaymentServiceOptions {
  persistence: PersistenceRepository;
  providers?: Partial<Record<PaymentProviderId, PaymentProvider>>;
  env?: Record<string, string | undefined>;
  audit?: (entry: AuditEntry) => void;
  now?: () => number;
}

export class PaymentService {
  readonly providers: Partial<Record<PaymentProviderId, PaymentProvider>>;
  private readonly env: Record<string, string | undefined>;
  private readonly now: () => number;
  private readonly locks = new Map<string, Promise<unknown>>();

  constructor(private readonly options: PaymentServiceOptions) {
    this.env = options.env || process.env;
    this.providers = options.providers || {
      xendit: XenditProvider.fromEnv(this.env),
      paypal: PayPalProvider.fromEnv(this.env)
    };
    this.now = options.now || Date.now;
  }

  /** Serialisasi operasi per kunci (tagihan/pembayaran) di dalam instance ini. */
  private async withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const previous = this.locks.get(key) || Promise.resolve();
    const run = previous.catch(() => undefined).then(fn);
    const tail = run.catch(() => undefined);
    this.locks.set(key, tail);
    try {
      return await run;
    } finally {
      if (this.locks.get(key) === tail) this.locks.delete(key);
    }
  }

  private audit(entry: Omit<AuditEntry, 'module'>): void {
    try {
      this.options.audit?.({ ...entry, module: 'Pembayaran Online' });
    } catch (error) {
      console.error('[Payments] audit log failed', error);
    }
  }

  private configuredProvider(id: PaymentProviderId): PaymentProvider | undefined {
    const provider = this.providers[id];
    return provider?.isConfigured() ? provider : undefined;
  }

  isAnyProviderConfigured(): boolean {
    return Boolean(this.configuredProvider('xendit') || this.configuredProvider('paypal'));
  }

  private channelAvailability(channel: PaymentChannelDefinition): { available: boolean; reason?: string } {
    if (!channel.supported) return { available: false, reason: channel.unsupportedReason };
    if (!this.configuredProvider(channel.provider)) return { available: false, reason: 'Provider belum dikonfigurasi.' };
    const enabled = enabledChannelIds(this.env);
    if (enabled && !enabled.has(channel.id)) return { available: false, reason: 'Kanal dinonaktifkan oleh rumah sakit.' };
    return { available: true };
  }

  /** Kanal tersedia (dapat dipilih) dan kanal tidak didukung (informasi). Kosong bila tidak ada provider. */
  listChannels(): { channels: PublicChannel[]; unavailable: PublicChannel[] } {
    if (!this.isAnyProviderConfigured()) return { channels: [], unavailable: [] };
    const all = PAYMENT_CHANNELS.map((channel) => {
      const { available, reason } = this.channelAvailability(channel);
      return { id: channel.id, label: channel.label, group: channel.group, provider: channel.provider, available, reason };
    });
    return {
      channels: all.filter((c) => c.available),
      // Hanya kanal yang memang tidak didukung provider yang ditampilkan sebagai info ke pasien.
      unavailable: all.filter((c) => !c.available && !findChannel(c.id)?.supported)
    };
  }

  private async loadBill(billId: string): Promise<ServerBillRecord | null> {
    if (!billId || billId.length > 128) return null;
    const bill = await this.options.persistence.get<ServerBillRecord>('billings', billId);
    return bill ? { ...bill, id: bill.id || billId } : null;
  }

  async listBills(patientRm: string): Promise<PublicBill[]> {
    const rm = normalizeRm(patientRm);
    const records = await this.options.persistence.list<ServerBillRecord>('billings');
    return records
      .map(({ id, data }) => ({ ...data, id: data.id || id }))
      .filter((bill) => billRm(bill) === rm && bill.status !== 'Dibatalkan')
      .map((bill) => ({
        id: bill.id,
        no_billing: String(bill.noBilling || bill.id),
        tanggal: String(bill.tanggalMasuk || ''),
        layanan: [bill.tipeLayanan, bill.poliRuangan].filter(Boolean).join(' · '),
        status: String(bill.status || '-'),
        total: Number(bill.totalTagihan) || 0,
        sisa: isPayable(bill) ? outstandingAmount(bill) || 0 : 0,
        payable: isPayable(bill),
        items: (bill.items || []).map((item) => ({
          nama: String(item.nama || '-'),
          nominal: Number(item.subtotal ?? item.nominal) || 0
        }))
      }));
  }

  private async listPayments(): Promise<PaymentRecord[]> {
    return (await this.options.persistence.list<PaymentRecord>('payments')).map(({ data }) => data);
  }

  async createPayment(params: {
    patientRm: string;
    billId: unknown;
    channelId: unknown;
    returnBaseUrl: string;
    ip: string;
  }): Promise<PaymentRecord> {
    if (!this.isAnyProviderConfigured()) {
      throw new PaymentServiceError(503, 'PAYMENT_PROVIDER_NOT_CONFIGURED', 'Pembayaran online belum tersedia, silakan bayar di kasir.');
    }
    const billId = typeof params.billId === 'string' ? params.billId.trim() : '';
    const channelId = typeof params.channelId === 'string' ? params.channelId.trim().toUpperCase() : '';
    const channel = findChannel(channelId);
    if (!billId || !channel) {
      throw new PaymentServiceError(400, 'INVALID_PAYMENT_REQUEST', 'bill_id dan channel wajib diisi dengan nilai yang valid.');
    }
    const availability = this.channelAvailability(channel);
    if (!availability.available) {
      throw new PaymentServiceError(422, 'PAYMENT_CHANNEL_UNAVAILABLE', availability.reason || 'Kanal pembayaran tidak tersedia.');
    }
    const provider = this.configuredProvider(channel.provider)!;
    const rm = normalizeRm(params.patientRm);

    return this.withLock(`bill:${billId}`, async () => {
      const bill = await this.loadBill(billId);
      // Tagihan pasien lain diperlakukan sama dengan tidak ada (tanpa membocorkan keberadaannya).
      if (!bill || billRm(bill) !== rm) {
        throw new PaymentServiceError(404, 'BILL_NOT_FOUND', 'Tagihan tidak ditemukan.');
      }
      const amount = outstandingAmount(bill);
      if (!isPayable(bill) || amount === null) {
        throw new PaymentServiceError(409, 'BILL_NOT_PAYABLE', 'Tagihan ini tidak memiliki sisa yang perlu dibayar.');
      }

      const nowMs = this.now();
      const billPayments = (await this.listPayments()).filter((p) => p.bill_id === bill.id);
      const reusable = billPayments.find((p) =>
        p.channel === channel.id &&
        p.status === 'PENDING' &&
        p.amount === amount &&
        (!p.expires_at || Date.parse(p.expires_at) > nowMs + 60_000)
      );
      if (reusable) return reusable;

      const attempt = billPayments.filter((p) => p.channel === channel.id).length + 1;
      const idempotencyKey = `${bill.id}:${channel.id}:${amount}:${attempt}`;
      const paymentId = `pay_${(await sha256Hex(idempotencyKey)).slice(0, 32)}`;
      const expiresAt = new Date(nowMs + expiryMsFor(channel)).toISOString();

      let chargeAmount = amount;
      let chargeCurrency = 'IDR';
      if (provider instanceof PayPalProvider) {
        const converted = provider.convertFromIdr(amount);
        chargeAmount = converted.amount;
        chargeCurrency = converted.currency;
      }

      const base = params.returnBaseUrl.replace(/\/+$/, '');
      const query = `payment_id=${encodeURIComponent(paymentId)}`;
      let result;
      try {
        result = await provider.createPayment({
          payment_id: paymentId,
          idempotency_key: idempotencyKey,
          channel_code: channel.providerChannelCode || channel.id,
          group: channel.group,
          bank_label: channel.label.replace(/ Virtual Account$/, ''),
          amount: chargeAmount,
          currency: chargeCurrency,
          description: `Tagihan ${bill.noBilling || bill.id}`,
          expires_at: expiresAt,
          return_url: `${base}/?${query}&payment_result=success`,
          cancel_url: `${base}/?${query}&payment_result=cancel`
        });
      } catch (error) {
        this.audit({
          user: rm, role: 'pasien', action: 'PAYMENT_CREATE', ip: params.ip, status: 'FAILED',
          details: `Gagal membuat pembayaran ${channel.id} untuk tagihan ${bill.id}: ${error instanceof Error ? error.message : 'error'}`
        });
        if (error instanceof PaymentProviderError) {
          throw new PaymentServiceError(502, 'PAYMENT_PROVIDER_ERROR', 'Provider pembayaran menolak permintaan. Coba kanal lain atau bayar di kasir.');
        }
        throw error;
      }

      const timestamp = new Date(nowMs).toISOString();
      const payment: PaymentRecord = {
        id: paymentId,
        bill_id: bill.id,
        patient_rm: rm,
        provider: provider.id,
        channel: channel.id,
        amount,
        currency: 'IDR',
        charge_amount: chargeAmount,
        charge_currency: chargeCurrency,
        status: result.status,
        idempotency_key: idempotencyKey,
        provider_ref: result.provider_ref,
        instructions: result.instructions,
        expires_at: result.expires_at || expiresAt,
        created_at: timestamp,
        updated_at: timestamp
      };
      await this.options.persistence.commit([{ entity: 'payments', id: payment.id, data: payment }]);
      this.audit({
        user: rm, role: 'pasien', action: 'PAYMENT_CREATE', ip: params.ip, status: 'SUCCESS',
        details: `Pembayaran ${payment.id} (${channel.id}, ${chargeCurrency} ${chargeAmount}) dibuat untuk tagihan ${bill.id}.`
      });
      return payment;
    });
  }

  /** Status pembayaran milik pasien; menyinkronkan ke provider bila masih menunggu. */
  async getPayment(patientRm: string, paymentId: string): Promise<PaymentRecord> {
    const rm = normalizeRm(patientRm);
    let payment = paymentId && paymentId.length <= 128
      ? await this.options.persistence.get<PaymentRecord>('payments', paymentId)
      : null;
    if (!payment || payment.patient_rm !== rm) {
      throw new PaymentServiceError(404, 'PAYMENT_NOT_FOUND', 'Pembayaran tidak ditemukan.');
    }
    if (payment.status === 'PENDING') payment = await this.refreshFromProvider(payment);
    return payment;
  }

  private async refreshFromProvider(payment: PaymentRecord): Promise<PaymentRecord> {
    const nowMs = this.now();
    const lastCheck = payment.last_provider_check_at ? Date.parse(payment.last_provider_check_at) : 0;
    const expired = payment.expires_at ? Date.parse(payment.expires_at) <= nowMs : false;
    const provider = this.configuredProvider(payment.provider);
    if (!provider || !payment.provider_ref || nowMs - lastCheck < PROVIDER_REFRESH_INTERVAL_MS) {
      return expired ? this.applyStatus(payment.id, { status: 'EXPIRED', source: 'local-expiry' }) : payment;
    }
    try {
      let result = await provider.getStatus(payment.provider_ref);
      const raw = result.raw as { needs_capture?: boolean } | undefined;
      if (raw?.needs_capture && provider.capture) result = await provider.capture(payment.provider_ref);
      const status: PaymentStatus = result.status === 'PENDING' && expired ? 'EXPIRED' : result.status;
      return this.applyStatus(payment.id, {
        status, amount: result.amount, currency: result.currency, source: 'provider-poll', checkedAt: nowMs
      });
    } catch (error) {
      console.error('[Payments] provider status check failed', error instanceof Error ? error.message : error);
      return expired ? this.applyStatus(payment.id, { status: 'EXPIRED', source: 'local-expiry' }) : payment;
    }
  }

  /**
   * Transisi status idempoten. PAID bersifat final dan hanya sekali menandai tagihan lunas.
   * Pembayaran yang terlambat (EXPIRED/FAILED -> PAID) tetap dicatat karena dana sudah diterima.
   */
  private async applyStatus(
    paymentId: string,
    update: { status?: PaymentStatus; amount?: number; currency?: string; source: string; rawWebhook?: unknown; checkedAt?: number }
  ): Promise<PaymentRecord> {
    return this.withLock(`payment:${paymentId}`, async () => {
      const current = await this.options.persistence.get<PaymentRecord>('payments', paymentId);
      if (!current) throw new PaymentServiceError(404, 'PAYMENT_NOT_FOUND', 'Pembayaran tidak ditemukan.');
      const nowIso = new Date(this.now()).toISOString();
      const next: PaymentRecord = { ...current, updated_at: nowIso };
      if (update.checkedAt) next.last_provider_check_at = new Date(update.checkedAt).toISOString();
      if (update.rawWebhook !== undefined) next.raw_webhook = update.rawWebhook;

      const target = update.status;
      const changes: PersistenceChange[] = [];
      let transitioned = false;
      if (target && target !== current.status && STATUS_RANK[target] > STATUS_RANK[current.status]) {
        if (target === 'PAID') {
          const amountOk = update.amount === undefined || Math.abs(update.amount - current.charge_amount) < 0.005;
          const currencyOk = !update.currency || update.currency.toUpperCase() === current.charge_currency;
          if (!amountOk || !currencyOk) {
            this.audit({
              user: 'system', role: current.provider, action: 'PAYMENT_AMOUNT_MISMATCH', ip: '-', status: 'WARNING',
              details: `Pembayaran ${current.id}: nominal provider ${update.currency || ''} ${update.amount} tidak sesuai ${current.charge_currency} ${current.charge_amount}. Tagihan tidak ditandai lunas.`
            });
            changes.push({ entity: 'payments', id: next.id, data: next });
            await this.options.persistence.commit(changes);
            return next;
          }
          next.status = 'PAID';
          next.paid_at = nowIso;
          const billChange = await this.markBillPaid(next);
          if (billChange) changes.push(billChange);
        } else {
          next.status = target;
        }
        transitioned = true;
      }
      changes.unshift({ entity: 'payments', id: next.id, data: next });
      await this.options.persistence.commit(changes);
      if (transitioned) {
        this.audit({
          user: 'system', role: current.provider, action: `PAYMENT_${next.status}`, ip: '-',
          status: next.status === 'PAID' ? 'SUCCESS' : 'WARNING',
          details: `Pembayaran ${current.id} tagihan ${current.bill_id}: ${current.status} -> ${next.status} (${update.source}).`
        });
      }
      return next;
    });
  }

  private async markBillPaid(payment: PaymentRecord): Promise<PersistenceChange | null> {
    const bill = await this.loadBill(payment.bill_id);
    if (!bill) {
      this.audit({
        user: 'system', role: payment.provider, action: 'PAYMENT_BILL_MISSING', ip: '-', status: 'WARNING',
        details: `Pembayaran ${payment.id} lunas tetapi tagihan ${payment.bill_id} tidak ditemukan.`
      });
      return null;
    }
    const outstanding = outstandingAmount(bill) ?? 0;
    if (!isPayable(bill)) {
      // Tagihan sudah lunas lewat kanal lain: dana ganda harus dikembalikan oleh kasir.
      this.audit({
        user: 'system', role: payment.provider, action: 'PAYMENT_DOUBLE_PAID', ip: '-', status: 'WARNING',
        details: `Tagihan ${bill.id} sudah lunas; pembayaran ${payment.id} (${payment.charge_currency} ${payment.charge_amount}) perlu ditinjau untuk refund.`
      });
      return null;
    }
    const remaining = Math.max(0, outstanding - payment.amount);
    const channel = findChannel(payment.channel);
    const updated: ServerBillRecord = {
      ...bill,
      sisaTagihan: remaining,
      jumlahDibayar: (Number(bill.jumlahDibayar) || 0) + payment.amount,
      status: remaining === 0 ? 'Lunas' : 'Sebagian',
      metodePembayaran: channel?.group === 'VIRTUAL_ACCOUNT' ? 'Transfer VA' : channel?.group === 'QRIS' ? 'QRIS' : 'Pembayaran Online',
      kanalPembayaranOnline: channel?.label || payment.channel,
      nomorReferensiPembayaran: payment.provider_ref || payment.id,
      tanggalBayar: payment.paid_at
    };
    return { entity: 'billings', id: bill.id, data: updated };
  }

  /** Memproses webhook. Mengembalikan false bila tidak terverifikasi (balas 401). */
  async handleWebhook(providerId: PaymentProviderId, headers: Record<string, string | undefined>, rawBody: string, body: unknown): Promise<{ verified: boolean; handled: boolean }> {
    const provider = this.providers[providerId];
    const event = provider ? await provider.verifyWebhook(headers, rawBody, body) : null;
    if (!provider || !event) {
      this.audit({
        user: 'anonymous', role: providerId, action: 'PAYMENT_WEBHOOK_REJECTED', ip: headers['x-forwarded-for'] || '-', status: 'FAILED',
        details: `Webhook ${providerId} ditolak: verifikasi gagal.`
      });
      return { verified: false, handled: false };
    }
    const payment = await this.findPaymentForEvent(providerId, event);
    if (!payment) {
      this.audit({
        user: 'system', role: providerId, action: 'PAYMENT_WEBHOOK_UNMATCHED', ip: '-', status: 'WARNING',
        details: `Webhook ${event.event_type} tanpa pembayaran yang cocok (ref ${event.provider_ref || event.payment_id || '-'}).`
      });
      return { verified: true, handled: false };
    }

    let status = event.status;
    let amount = event.amount;
    let currency = event.currency;
    if (event.needs_capture && provider.capture && payment.provider_ref && payment.status !== 'PAID') {
      const captured = await provider.capture(payment.provider_ref);
      status = captured.status;
      amount = captured.amount;
      currency = captured.currency;
    }
    await this.applyStatus(payment.id, { status, amount, currency, source: `webhook:${event.event_type}`, rawWebhook: body });
    return { verified: true, handled: true };
  }

  private async findPaymentForEvent(providerId: PaymentProviderId, event: ProviderWebhookEvent): Promise<PaymentRecord | null> {
    if (event.payment_id && event.payment_id.length <= 128) {
      const byId = await this.options.persistence.get<PaymentRecord>('payments', event.payment_id);
      if (byId && byId.provider === providerId && (!event.provider_ref || byId.provider_ref === event.provider_ref)) return byId;
    }
    if (!event.provider_ref) return null;
    return (await this.listPayments()).find((p) => p.provider === providerId && p.provider_ref === event.provider_ref) || null;
  }
}
