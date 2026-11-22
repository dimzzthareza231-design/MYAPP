// Endpoint pembayaran online tagihan pasien.
//   GET  /api/patient/payments/channels      kanal tersedia (kosong bila provider belum dikonfigurasi)
//   GET  /api/patient/payments/bills         tagihan milik pasien yang login
//   POST /api/patient/payments               {bill_id, channel} -> buat pembayaran (nominal dari server)
//   GET  /api/patient/payments/:id           status pembayaran milik pasien
//   POST /api/payments/webhook/xendit        verifikasi x-callback-token (XENDIT_CALLBACK_TOKEN)
//   POST /api/payments/webhook/paypal        verifikasi via PayPal verify-webhook-signature (PAYPAL_WEBHOOK_ID)
import type express from 'express';
import type { PersistenceRepository } from '../databaseAdapter';
import { resolvePatientSession } from '../patientPortalService';
import { PaymentService, PaymentServiceError, toPublicPayment, type AuditEntry } from './paymentService';
import type { PaymentProvider, PaymentProviderId } from './types';

// Sesi pasien diperiksa oleh patientPortalService (satu sumber), sehingga logout/pencabutan token berlaku di sini juga.
export function resolvePatientRmFromRequest(req: express.Request): string | undefined {
  return resolvePatientSession(req)?.no_rm;
}

export interface PaymentRoutesDeps {
  persistence: PersistenceRepository;
  createAuditLog?: (entry: AuditEntry) => void;
  /** Override untuk pengujian. */
  providers?: Partial<Record<PaymentProviderId, PaymentProvider>>;
  env?: Record<string, string | undefined>;
  resolvePatientRm?: (req: express.Request) => string | undefined;
}

function headerMap(req: express.Request): Record<string, string | undefined> {
  const map: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(req.headers)) {
    map[key.toLowerCase()] = Array.isArray(value) ? value[0] : value;
  }
  return map;
}

export function registerPaymentRoutes(app: express.Express, deps: PaymentRoutesDeps): PaymentService {
  const env = deps.env || process.env;
  const service = new PaymentService({
    persistence: deps.persistence,
    providers: deps.providers,
    env,
    audit: deps.createAuditLog
  });
  const resolveRm = deps.resolvePatientRm || resolvePatientRmFromRequest;

  const requirePatient = (req: express.Request, res: express.Response): string | undefined => {
    const rm = resolveRm(req);
    if (!rm) {
      res.status(401).json({
        success: false,
        code: 'PATIENT_SESSION_REQUIRED',
        message: 'Sesi pasien tidak valid atau telah berakhir. Silakan masuk kembali.'
      });
    }
    return rm;
  };

  const sendError = (res: express.Response, error: unknown) => {
    if (error instanceof PaymentServiceError) {
      return res.status(error.httpStatus).json({ success: false, code: error.code, message: error.message });
    }
    console.error('[Payments] unexpected error', error);
    return res.status(500).json({ success: false, code: 'PAYMENT_ERROR', message: 'Terjadi kesalahan pembayaran.' });
  };

  app.get('/api/patient/payments/channels', (req, res) => {
    if (!requirePatient(req, res)) return;
    const { channels, unavailable } = service.listChannels();
    res.setHeader('Cache-Control', 'no-store');
    return res.json({
      success: true,
      configured: channels.length > 0,
      channels,
      unavailable,
      message: channels.length ? undefined : 'Pembayaran online belum tersedia, silakan bayar di kasir.'
    });
  });

  app.get('/api/patient/payments/bills', async (req, res) => {
    const rm = requirePatient(req, res);
    if (!rm) return;
    try {
      res.setHeader('Cache-Control', 'no-store');
      return res.json({ success: true, bills: await service.listBills(rm) });
    } catch (error) {
      return sendError(res, error);
    }
  });

  app.post('/api/patient/payments', async (req, res) => {
    const rm = requirePatient(req, res);
    if (!rm) return;
    try {
      // Hanya bill_id & channel yang dibaca dari klien; nominal apa pun dari klien diabaikan.
      const { bill_id, channel } = (req.body || {}) as { bill_id?: unknown; channel?: unknown };
      const returnBaseUrl = env.PAYMENT_RETURN_BASE_URL || `${req.protocol}://${req.get('host') || 'localhost'}`;
      const payment = await service.createPayment({
        patientRm: rm,
        billId: bill_id,
        channelId: channel,
        returnBaseUrl,
        ip: req.ip || '-'
      });
      res.setHeader('Cache-Control', 'no-store');
      return res.status(201).json({ success: true, payment: toPublicPayment(payment) });
    } catch (error) {
      return sendError(res, error);
    }
  });

  app.get('/api/patient/payments/:id', async (req, res) => {
    const rm = requirePatient(req, res);
    if (!rm) return;
    try {
      const payment = await service.getPayment(rm, String(req.params.id || ''));
      res.setHeader('Cache-Control', 'no-store');
      return res.json({ success: true, payment: toPublicPayment(payment) });
    } catch (error) {
      return sendError(res, error);
    }
  });

  const webhook = (providerId: PaymentProviderId) => async (req: express.Request, res: express.Response) => {
    try {
      const body = req.body as unknown;
      const result = await service.handleWebhook(providerId, headerMap(req), JSON.stringify(body ?? null), body);
      if (!result.verified) return res.status(401).json({ success: false, code: 'WEBHOOK_UNVERIFIED' });
      return res.status(200).json({ success: true, handled: result.handled });
    } catch (error) {
      console.error(`[Payments] ${providerId} webhook failed`, error);
      // 5xx agar provider mengirim ulang webhook.
      return res.status(500).json({ success: false, code: 'WEBHOOK_PROCESSING_FAILED' });
    }
  };
  app.post('/api/payments/webhook/xendit', webhook('xendit'));
  app.post('/api/payments/webhook/paypal', webhook('paypal'));

  return service;
}
