import crypto from 'crypto';
import type express from 'express';
import { createSignedStore } from './signedStore';
import {
  HOSPITAL_DIVISIONS,
  CORE_EMPLOYEE_MODULES,
  GOVERNANCE_FRAMEWORKS,
  type DivisionDefinition
} from '../data/employeePortalCatalog';

export interface GatewayDependencies {
  createAuditLog?: (entry: {
    user_id: string;
    user_name: string;
    action: string;
    module: string;
    details: string;
    ip_address?: string;
    status: 'SUCCESS' | 'WARNING' | 'FAILED';
  }) => void;
}

export interface AbacContext {
  onDuty: boolean;
  unitMatch: boolean;
  careRelationship: boolean;
  breakGlassActive: boolean;
  breakGlassReason: string;
}

interface EmployeeUserRecord {
  id: string;
  nip: string;
  email: string;
  name: string;
  divisionId: string;
  divisionName: string;
  roleTitle: string;
  portalRole: 'ADMIN_TI' | 'PIMPINAN' | 'KLINIS' | 'KEPERAWATAN' | 'PENUNJANG' | 'STAF_UMUM';
  isClinical: boolean;
  isAdminCapable: boolean;
  active: boolean;
  strNumber?: string;
  strExpiry?: string;
  sipNumber?: string;
  sipExpiry?: string;
  unitLocation: string;
  shiftPattern: string;
  lastHrisSync: string;
}

interface GatewaySession {
  token: string;
  userId: string;
  nip: string;
  name: string;
  email: string;
  divisionId: string;
  divisionName: string;
  roleTitle: string;
  portalRole: EmployeeUserRecord['portalRole'];
  isClinical: boolean;
  isAdminCapable: boolean;
  mfaVerified: boolean;
  authType: 'nip' | 'google';
  deviceFingerprint: string;
  abac: AbacContext;
  createdAt: string;
}

interface SiemAuditEntry {
  id: string;
  timestamp: string;
  actorNip: string;
  actorName: string;
  divisionId: string;
  eventType: string;
  resource: string;
  decision: 'ALLOW' | 'DENY' | 'CHALLENGE' | 'BREAK_GLASS';
  detail: string;
  ipAddress: string;
  hash: string;
}

interface AbacPolicies {
  requireOnDutyForClinicalEmr: boolean;
  requireUnitMatchForSensitiveActions: boolean;
  requireCareRelationshipForPatientRecords: boolean;
  allowBreakGlassWithAudit: boolean;
  enforce40HourShiftCap: boolean;
  mfaRequiredForClinicalAndAdmin: boolean;
}

interface ConfigChangeProposal {
  id: string;
  proposedAt: string;
  proposedBy: string;
  category: 'FEATURE_FLAG' | 'ABAC_POLICY' | 'RBAC_MATRIX' | 'PORTAL_CONTENT';
  title: string;
  targetKey: string;
  proposedValue: unknown;
  justification: string;
  status: 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED';
  reviewedAt?: string;
  reviewedBy?: string;
  reviewNote?: string;
}

const EMPLOYEE_LOGIN_UNAVAILABLE = {
  success: false,
  code: 'EMPLOYEE_LOGIN_UNAVAILABLE',
  message: 'Login pegawai belum tersedia: integrasi identitas pegawai dan MFA belum dikonfigurasi.'
} as const;

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

function mapPortalRole(div: DivisionDefinition): EmployeeUserRecord['portalRole'] {
  if (div.id === 'simrs-ti' || div.id === 'sdm-umum') return 'ADMIN_TI';
  if (div.id === 'direktur' || div.id === 'wadir' || div.id === 'spi' || div.id === 'hukum-etik') return 'PIMPINAN';
  if (div.id === 'keperawatan' || div.id === 'rawat-inap') return 'KEPERAWATAN';
  if (div.isClinical) return 'KLINIS';
  if (div.category === 'Penunjang Medik' || div.category === 'Penunjang Non-Medik & Sarana') return 'PENUNJANG';
  return 'STAF_UMUM';
}

export function registerEmployeePortalGateway(app: express.Application, deps: GatewayDependencies = {}) {
  // MYITARU Campus Reference Coordinate (Jakarta)
  const HOSPITAL_GEOFENCE = {
    name: 'Kampus Utama MYITARU Jakarta',
    lat: -6.229728,
    lng: 106.829518,
    radiusMeters: 200
  };

  // =========================================================================
  // 1. IN-MEMORY ENTERPRISE STORES (SIMK / HRIS / GATEWAY STATE)
  // =========================================================================
  // Direktori pegawai diisi dari HRIS/admin; tidak ada akun bawaan.
  const usersStore: EmployeeUserRecord[] = [];

  // Sesi = token bertanda tangan (stateless) agar login tetap jalan di serverless multi-instance.
  const sessions = createSignedStore<GatewaySession>('emp_', 'token', 12 * 60 * 60 * 1000);
  const idempotencyCache = new Map<string, { status: number; body: unknown; createdAt: number }>();
  const rateLimitMap = new Map<string, number[]>();

  let abacPolicies: AbacPolicies = {
    requireOnDutyForClinicalEmr: true,
    requireUnitMatchForSensitiveActions: true,
    requireCareRelationshipForPatientRecords: false,
    allowBreakGlassWithAudit: true,
    enforce40HourShiftCap: true,
    mfaRequiredForClinicalAndAdmin: true
  };

  let featureFlags: Record<string, { label: string; enabled: boolean; targetScope: string; description: string }> = {
    offline_attendance: {
      label: 'Absensi Mode Offline + Auto-Sync Idempoten',
      enabled: true,
      targetScope: 'Semua Divisi',
      description: 'Mengizinkan penyimpanan presensi saat zona blankspot dengan deduplikasi Idempotency-Key.'
    },
    sbar_bedside_handover: {
      label: 'Handover Shift SBAR Bedside & Supervisi Karu',
      enabled: true,
      targetScope: 'Keperawatan, IGD, Rawat Inap, ICU, IBS',
      description: 'Validasi serah terima pasien antar shift lengkap dengan tanda tangan Karu.'
    },
    doctor_oppe_dashboard: {
      label: 'Evaluasi Kinerja Klinis Dokter (OPPE)',
      enabled: true,
      targetScope: 'KSM, Yanmed, Komite Medik, Direktur',
      description: 'Pemantauan ALOS, mortalitas, kepatuhan Fornas, dan kelengkapan resume medis.'
    },
    break_glass_emergency: {
      label: 'Protokol Darurat Break-Glass EMR',
      enabled: true,
      targetScope: 'Klinis & IGD',
      description: 'Membuka akses darurat EMR saat darurat nyawa dengan pencatatan audit immutable wajib.'
    },
    bpjs_vclaim_bridge: {
      label: 'Middleware BPJS VClaim & Antrean JKN',
      enabled: true,
      targetScope: 'Keuangan, Rekam Medis, Pendaftaran, Rawat Jalan',
      description: 'Validasi SEP, INA-CBGs, dan verifikasi rujukan melalui middleware API.'
    },
    satusehat_fhir_sync: {
      label: 'Adapter FHIR R4 SATUSEHAT Kemenkes',
      enabled: true,
      targetScope: 'Klinis, Rekam Medis, TI',
      description: 'Sinkronisasi asinkron Encounter, Observation, dan Condition melalui message queue.'
    }
  };

  let rbacMatrix: Record<
    EmployeeUserRecord['portalRole'],
    {
      label: string;
      coreModules: string[];
      canAccessDivisionSpecific: boolean;
      canApproveUnitLeave: boolean;
      canApproveSdmLeave: boolean;
      canAccessAdminArea: boolean;
      canViewOppe: boolean;
      canReviewConfigChanges: boolean;
    }
  > = {
    ADMIN_TI: {
      label: 'Unit SIMK / TI & SDM Admin',
      coreModules: CORE_EMPLOYEE_MODULES.map((m) => m.id),
      canAccessDivisionSpecific: true,
      canApproveUnitLeave: true,
      canApproveSdmLeave: true,
      canAccessAdminArea: true,
      canViewOppe: true,
      canReviewConfigChanges: true
    },
    PIMPINAN: {
      label: 'Direksi, SPI & Hukum Etik',
      coreModules: CORE_EMPLOYEE_MODULES.map((m) => m.id),
      canAccessDivisionSpecific: true,
      canApproveUnitLeave: true,
      canApproveSdmLeave: true,
      canAccessAdminArea: true,
      canViewOppe: true,
      canReviewConfigChanges: true
    },
    KLINIS: {
      label: 'Dokter Spesialis, IGD, Farmasi, Penunjang Klinis',
      coreModules: CORE_EMPLOYEE_MODULES.map((m) => m.id),
      canAccessDivisionSpecific: true,
      canApproveUnitLeave: true,
      canApproveSdmLeave: false,
      canAccessAdminArea: false,
      canViewOppe: true,
      canReviewConfigChanges: false
    },
    KEPERAWATAN: {
      label: 'Bidang Keperawatan, Karu & Perawat Ruangan',
      coreModules: CORE_EMPLOYEE_MODULES.map((m) => m.id),
      canAccessDivisionSpecific: true,
      canApproveUnitLeave: true,
      canApproveSdmLeave: false,
      canAccessAdminArea: false,
      canViewOppe: false,
      canReviewConfigChanges: false
    },
    PENUNJANG: {
      label: 'Penunjang Medik & Non-Medik (CSSD, IPSRS, Gizi, Kesling, Security)',
      coreModules: CORE_EMPLOYEE_MODULES.map((m) => m.id),
      canAccessDivisionSpecific: true,
      canApproveUnitLeave: true,
      canApproveSdmLeave: false,
      canAccessAdminArea: false,
      canViewOppe: false,
      canReviewConfigChanges: false
    },
    STAF_UMUM: {
      label: 'Keuangan, Perencanaan, Humas, Diklat & Tata Usaha',
      coreModules: CORE_EMPLOYEE_MODULES.map((m) => m.id),
      canAccessDivisionSpecific: true,
      canApproveUnitLeave: false,
      canApproveSdmLeave: false,
      canAccessAdminArea: false,
      canViewOppe: false,
      canReviewConfigChanges: false
    }
  };

  const portalAnnouncements: Array<{
    id: string;
    title: string;
    category: string;
    priority: string;
    publishedAt: string;
    author: string;
    summary: string;
  }> = [];

  // Shift schedule store (3-shift & long-shift with weekly hour calculation)
  const shiftSchedulesStore: Array<{
    id: string;
    nip: string;
    employeeName: string;
    divisionId: string;
    date: string;
    dayLabel: string;
    shiftType: 'Pagi (07:00-14:00)' | 'Siang (14:00-21:00)' | 'Malam (21:00-07:00)' | 'Reguler (08:00-16:00)' | 'Libur';
    hours: number;
    unit: string;
    status: 'Terjadwal' | 'Sedang Bertugas' | 'Selesai' | 'Tukar Pending';
  }> = [];

  const shiftSwapsStore: Array<{
    id: string;
    requesterName: string;
    requesterNip: string;
    divisionId: string;
    fromDate: string;
    fromShift: string;
    targetColleague: string;
    toDate: string;
    toShift: string;
    reason: string;
    weeklyHoursAfterSwap: number;
    conflictWarning?: string;
    status: 'Menunggu Atasan Unit' | 'Disetujui' | 'Ditolak';
    createdAt: string;
  }> = [];

  const attendanceLogsStore: Array<{
    id: string;
    nip: string;
    employeeName: string;
    divisionId: string;
    timestamp: string;
    type: 'MASUK' | 'PULANG' | 'LEMBUR' | 'KOREKSI';
    method: 'Geofencing + Biometrik' | 'Offline Sync (Idempoten)' | 'Koreksi Manual';
    distanceMeters: number;
    withinGeofence: boolean;
    biometricVerified: boolean;
    note?: string;
    idempotencyKey?: string;
  }> = [];

  const leaveRequestsStore: Array<{
    id: string;
    nip: string;
    employeeName: string;
    divisionId: string;
    type: 'Cuti Tahunan' | 'Cuti Sakit' | 'Izin Pelatihan / Seminar' | 'Izin Khusus';
    startDate: string;
    endDate: string;
    days: number;
    substitute: string;
    reason: string;
    status: 'Menunggu Atasan Unit' | 'Menunggu Verifikasi SDM' | 'Disetujui Final' | 'Ditolak';
    unitApprovedBy?: string;
    sdmApprovedBy?: string;
    createdAt: string;
  }> = [];

  const reimbursementsStore: Array<{
    id: string;
    nip: string;
    employeeName: string;
    title: string;
    category: 'Diklat / SKP' | 'Perjalanan Dinas' | 'Kesehatan Pegawai' | 'Operasional Unit';
    amount: number;
    date: string;
    status: 'Diajukan' | 'Diverifikasi Keuangan' | 'Dibayarkan';
  }> = [];

  const sbarHandoversStore: Array<{
    id: string;
    unit: string;
    divisionId: string;
    sessionType: 'Nurse Station (Terjadwal)' | 'Bedside Handover';
    fromShift: string;
    toShift: string;
    senderName: string;
    receiverName: string;
    patientLabel: string;
    situation: string;
    background: string;
    assessment: string;
    recommendation: string;
    karuVerified: boolean;
    karuName?: string;
    createdAt: string;
  }> = [];

  const helpdeskTicketsStore: Array<{
    id: string;
    ticketNo: string;
    requesterName: string;
    requesterContact: string;
    divisionName: string;
    category: 'TI / SIMK & MFA' | 'HR & Absensi / Payroll' | 'Instalasi Aplikasi Mobile' | 'Sarana / Medis';
    priority: 'P1 - Kritis (15 Menit)' | 'P2 - Tinggi (1 Jam)' | 'P3 - Normal (4 Jam)';
    subject: string;
    description: string;
    source: 'Portal Karyawan' | 'Landing Page App';
    status: 'Terbuka' | 'Ditangani ITIL L1/L2' | 'Selesai';
    assignedTeam: string;
    createdAt: string;
  }> = [];

  const divisionActionState = new Map<string, Record<string, string>>();

  const siemAuditTrail: SiemAuditEntry[] = [];

  const configChangeProposals: ConfigChangeProposal[] = [];

  const governanceChangelog: Array<{
    id: string;
    appliedAt: string;
    proposalId: string;
    category: string;
    title: string;
    approvedBy: string;
    summary: string;
  }> = [];

  // Status integrasi apa adanya: belum ada konektor yang terpasang, jadi tidak ada latensi/sinkronisasi.
  const integrationHealthStore: Array<{
    id: string;
    name: string;
    protocol: string;
    status: 'BELUM DIKONFIGURASI';
    latencyMs: number | null;
    queueDepth: number | null;
    idempotencyRate: string | null;
    lastSync: string | null;
  }> = [
    { id: 'satusehat', name: 'SATUSEHAT Kemenkes (FHIR R4 Adapter)', protocol: 'REST / FHIR R4 Bundle (OAuth2)' },
    { id: 'bpjs-vclaim', name: 'BPJS Kesehatan Middleware (VClaim & Antrean JKN)', protocol: 'REST + HMAC-SHA256 + LZ-String' },
    { id: 'hris-core', name: 'HRIS Kepegawaian & Payroll Inti', protocol: 'Internal mTLS / Sync Queue' },
    { id: 'async-mq', name: 'Async Message Queue (Notifikasi & Retry Idempoten)', protocol: 'Worker Queue (Dead-Letter Guarded)' }
  ].map((item) => ({
    ...item,
    status: 'BELUM DIKONFIGURASI' as const,
    latencyMs: null,
    queueDepth: null,
    idempotencyRate: null,
    lastSync: null
  }));

  const landingAnalyticsStore = {
    totalVisits: 0,
    byDevice: { Android: 0, iOS: 0, Desktop: 0 },
    byCta: { playstore: 0, appstore: 0, qr: 0, deeplink: 0, mobile_web: 0, portal: 0 },
    byUtmSource: { intranet: 0, qrcode_lobby: 0, whatsapp_hr: 0, direct: 0 },
    recentEvents: [] as Array<{ timestamp: string; device: string; cta: string; utmSource: string }>
  };

  // =========================================================================
  // 2. GATEWAY HELPERS (SIEM LOG, RATE LIMIT, IDEMPOTENCY, RBAC+ABAC)
  // =========================================================================
  function appendSiemLog(params: {
    actorNip: string;
    actorName: string;
    divisionId: string;
    eventType: string;
    resource: string;
    decision: SiemAuditEntry['decision'];
    detail: string;
    ipAddress?: string;
  }) {
    const hash = crypto
      .createHash('sha256')
      .update(`${Date.now()}-${params.actorNip}-${params.eventType}-${params.resource}`)
      .digest('hex')
      .slice(0, 16);

    const entry: SiemAuditEntry = {
      id: `siem-${Date.now()}-${Math.floor(Math.random() * 999)}`,
      timestamp: new Date().toISOString().replace('T', ' ').slice(0, 19),
      actorNip: params.actorNip,
      actorName: params.actorName,
      divisionId: params.divisionId,
      eventType: params.eventType,
      resource: params.resource,
      decision: params.decision,
      detail: params.detail,
      ipAddress: params.ipAddress || '127.0.0.1',
      hash: `sha256:${hash}`
    };

    siemAuditTrail.unshift(entry);
    if (siemAuditTrail.length > 200) siemAuditTrail.pop();

    deps.createAuditLog?.({
      user_id: params.actorNip,
      user_name: params.actorName,
      action: `${params.eventType} [${params.decision}]`,
      module: 'PORTAL_KARYAWAN_GATEWAY',
      details: `${params.resource}: ${params.detail}`,
      ip_address: params.ipAddress,
      status: params.decision === 'DENY' ? 'FAILED' : params.decision === 'BREAK_GLASS' ? 'WARNING' : 'SUCCESS'
    });
  }

  function evaluateAccess(session: GatewaySession, division: DivisionDefinition) {
    const rolePolicy = rbacMatrix[session.portalRole];
    const reasons: string[] = [];

    // Clinical & EMR sensitive check via RBAC + ABAC
    let emrAccess: 'GRANTED' | 'LOCKED' | 'BREAK_GLASS' = 'GRANTED';
    if (abacPolicies.mfaRequiredForClinicalAndAdmin && (division.isClinical || division.isAdminCapable) && !session.mfaVerified) {
      emrAccess = 'LOCKED';
      reasons.push('MFA 6-digit wajib diselesaikan.');
    } else if (session.abac.breakGlassActive && abacPolicies.allowBreakGlassWithAudit && featureFlags.break_glass_emergency.enabled) {
      emrAccess = 'BREAK_GLASS';
      reasons.push(`Mode Darurat Break-Glass aktif (${session.abac.breakGlassReason || 'Penyelamatan Nyawa'}).`);
    } else {
      if (division.isClinical && abacPolicies.requireOnDutyForClinicalEmr && !session.abac.onDuty) {
        emrAccess = 'LOCKED';
        reasons.push('Atribut ABAC: Status jaga saat ini Off-Duty (akses EMR klinis dikunci).');
      }
      if (abacPolicies.requireUnitMatchForSensitiveActions && !session.abac.unitMatch) {
        emrAccess = 'LOCKED';
        reasons.push('Atribut ABAC: Lokasi unit kerja tidak cocok dengan unit layanan.');
      }
      if (division.isClinical && abacPolicies.requireCareRelationshipForPatientRecords && !session.abac.careRelationship) {
        emrAccess = 'LOCKED';
        reasons.push('Atribut ABAC: Tidak ada relasi perawatan aktif (DPJP/Perawat jaga) dengan pasien.');
      }
    }

    const adminAreaAccess = rolePolicy.canAccessAdminArea || session.isAdminCapable || session.divisionId === 'direktur';
    const oppeAccess = rolePolicy.canViewOppe && featureFlags.doctor_oppe_dashboard.enabled;
    const sbarAccess = featureFlags.sbar_bedside_handover.enabled;

    return {
      emrAccess,
      emrReasons: reasons,
      adminAreaAccess,
      oppeAccess,
      sbarAccess,
      offlineAttendanceEnabled: featureFlags.offline_attendance.enabled,
      shift40HourRuleEnforced: abacPolicies.enforce40HourShiftCap,
      roleLabel: rolePolicy.label
    };
  }

  function extractBearerToken(req: express.Request): string | null {
    const auth = req.headers.authorization;
    if (auth && auth.startsWith('Bearer ')) {
      return auth.slice(7).trim();
    }
    return null;
  }

  function requireGatewaySession(req: express.Request, res: express.Response): GatewaySession | null {
    const token = extractBearerToken(req);
    if (!token || !sessions.has(token)) {
      res.status(401).json({
        success: false,
        code: 'GATEWAY_UNAUTHORIZED',
        message: 'Sesi API Gateway tidak ditemukan atau telah berakhir. Silakan login kembali.'
      });
      return null;
    }
    return sessions.get(token)!;
  }

  // Sliding window rate limiter + Idempotency middleware for /api/gateway/*
  app.use('/api/gateway', (req, res, next) => {
    const ip = req.ip || '127.0.0.1';
    const now = Date.now();
    const history = (rateLimitMap.get(ip) || []).filter((ts) => now - ts < 60_000);
    history.push(now);
    rateLimitMap.set(ip, history);

    res.setHeader('X-Gateway-Version', 'MYITARU-GW-2026.1');
    res.setHeader('X-RateLimit-Remaining', String(Math.max(0, 180 - history.length)));

    if (history.length > 180) {
      return res.status(429).json({
        success: false,
        code: 'GATEWAY_RATE_LIMITED',
        message: 'Melebihi batas permintaan API Gateway (180 req/menit).'
      });
    }

    const idemKey = req.headers['idempotency-key'];
    if (req.method !== 'GET' && typeof idemKey === 'string' && idemKey.trim()) {
      const cacheKey = `${req.path}::${idemKey.trim()}`;
      const existing = idempotencyCache.get(cacheKey);
      if (existing) {
        res.setHeader('X-Idempotent-Replay', 'true');
        return res.status(existing.status).json(existing.body);
      }

      const originalJson = res.json.bind(res);
      res.json = ((body: unknown) => {
        idempotencyCache.set(cacheKey, { status: res.statusCode || 200, body, createdAt: Date.now() });
        return originalJson(body);
      }) as typeof res.json;
    }

    next();
  });

  // =========================================================================
  // 3. AUTHENTICATION & MANDATORY MFA OTP
  // =========================================================================
  // Login & MFA pegawai: belum ada penyedia identitas/MFA pegawai yang terpasang. Kedua endpoint
  // menolak dengan 503; mesin sesi (signed store) tetap dipakai saat integrasi nyata tersedia.
  app.post('/api/gateway/auth/login', (_req, res) => {
    return res.status(503).json(EMPLOYEE_LOGIN_UNAVAILABLE);
  });

  app.post('/api/gateway/auth/verify-mfa', (_req, res) => {
    return res.status(503).json(EMPLOYEE_LOGIN_UNAVAILABLE);
  });

  app.post('/api/gateway/auth/logout', (req, res) => {
    const token = extractBearerToken(req);
    if (token && sessions.has(token)) {
      const s = sessions.get(token)!;
      appendSiemLog({
        actorNip: s.nip,
        actorName: s.name,
        divisionId: s.divisionId,
        eventType: 'GATEWAY_LOGOUT',
        resource: 'Portal Karyawan',
        decision: 'ALLOW',
        detail: 'Sesi pengguna diakhiri secara aman.',
        ipAddress: req.ip
      });
      sessions.delete(token);
    }
    res.json({ success: true });
  });

  // =========================================================================
  // 4. BOOTSTRAP & LIVE ABAC CONTEXT EVALUATION
  // =========================================================================
  app.get('/api/gateway/bootstrap', (req, res) => {
    const session = requireGatewaySession(req, res);
    if (!session) return;

    const division = HOSPITAL_DIVISIONS.find((d) => d.id === session.divisionId) || HOSPITAL_DIVISIONS[0];
    const user = usersStore.find((u) => u.id === session.userId) || null;
    const access = evaluateAccess(session, division);

    res.json({
      success: true,
      session,
      user,
      division,
      access,
      abacPolicies,
      featureFlags,
      announcements: portalAnnouncements,
      governanceFrameworks: GOVERNANCE_FRAMEWORKS,
      geofence: HOSPITAL_GEOFENCE
    });
  });

  app.post('/api/gateway/abac-context', (req, res) => {
    const session = requireGatewaySession(req, res);
    if (!session) return;

    const { onDuty, unitMatch, careRelationship, breakGlassActive, breakGlassReason } = req.body || {};
    if (typeof onDuty === 'boolean') session.abac.onDuty = onDuty;
    if (typeof unitMatch === 'boolean') session.abac.unitMatch = unitMatch;
    if (typeof careRelationship === 'boolean') session.abac.careRelationship = careRelationship;

    if (typeof breakGlassActive === 'boolean') {
      if (breakGlassActive && !abacPolicies.allowBreakGlassWithAudit) {
        return res.status(403).json({
          success: false,
          message: 'Kebijakan Break-Glass saat ini dinonaktifkan oleh Administrator.'
        });
      }
      session.abac.breakGlassActive = breakGlassActive;
      session.abac.breakGlassReason = breakGlassActive
        ? String(breakGlassReason || 'Penanganan Kegawatdaruratan Pasien (Kode Biru)')
        : '';
    }

    const division = HOSPITAL_DIVISIONS.find((d) => d.id === session.divisionId) || HOSPITAL_DIVISIONS[0];
    const access = evaluateAccess(session, division);

    appendSiemLog({
      actorNip: session.nip,
      actorName: session.name,
      divisionId: session.divisionId,
      eventType: session.abac.breakGlassActive ? 'ABAC_BREAK_GLASS' : 'ABAC_CONTEXT_EVALUATION',
      resource: `Unit ${division.name}`,
      decision: session.abac.breakGlassActive ? 'BREAK_GLASS' : access.emrAccess === 'LOCKED' ? 'DENY' : 'ALLOW',
      detail: `onDuty=${session.abac.onDuty}, unitMatch=${session.abac.unitMatch}, careRel=${session.abac.careRelationship}${session.abac.breakGlassActive ? ` | Alasan: ${session.abac.breakGlassReason}` : ''}`,
      ipAddress: req.ip
    });

    res.json({
      success: true,
      abac: session.abac,
      access
    });
  });

  // =========================================================================
  // 5. CORE EMPLOYEE MODULES (ALL 9 MANDATORY MODULES)
  // =========================================================================
  app.get('/api/gateway/profile', (req, res) => {
    const session = requireGatewaySession(req, res);
    if (!session) return;
    const user = usersStore.find((u) => u.id === session.userId);
    if (!user) return res.status(404).json({ success: false, message: 'Pegawai tidak ditemukan di direktori HRIS.' });
    const division = HOSPITAL_DIVISIONS.find((d) => d.id === session.divisionId) || HOSPITAL_DIVISIONS[0];

    // Hanya data yang tercatat di direktori; kontrak & lisensi tanpa sumber HRIS tidak dikarang.
    const licenses = [
      user.strNumber ? { id: 'str', name: 'Surat Tanda Registrasi (STR)', number: user.strNumber, expiry: user.strExpiry || null } : null,
      user.sipNumber ? { id: 'sip', name: 'Surat Izin Praktik (SIP)', number: user.sipNumber, expiry: user.sipExpiry || null } : null
    ].filter((item): item is NonNullable<typeof item> => item !== null);

    res.json({
      success: true,
      user,
      division,
      contracts: null,
      licenses
    });
  });

  app.put('/api/gateway/profile', (req, res) => {
    const session = requireGatewaySession(req, res);
    if (!session) return;
    const user = usersStore.find((u) => u.id === session.userId);
    if (!user) return res.status(404).json({ success: false, message: 'User tidak ditemukan' });

    const { email, unitLocation } = req.body || {};
    if (email) {
      user.email = String(email);
      session.email = user.email;
    }
    if (unitLocation) user.unitLocation = String(unitLocation);
    user.lastHrisSync = new Date().toISOString();

    appendSiemLog({
      actorNip: session.nip,
      actorName: session.name,
      divisionId: session.divisionId,
      eventType: 'PROFILE_SELF_UPDATE',
      resource: 'HRIS Profil 360',
      decision: 'ALLOW',
      detail: 'Pembaruan profil mandiri tersinkronisasi ke HRIS.',
      ipAddress: req.ip
    });

    res.json({ success: true, user });
  });

  // Shifts + 40 Hour Weekly Cap + Conflict Detection + Swap Approval
  app.get('/api/gateway/shifts', (req, res) => {
    const session = requireGatewaySession(req, res);
    if (!session) return;

    const myShifts = shiftSchedulesStore.map((s) => ({
      ...s,
      nip: session.nip,
      employeeName: session.name,
      unit: s.shiftType === 'Libur' ? 'Istirahat Mingguan' : session.divisionName
    }));

    const totalWeeklyHours = myShifts.reduce((acc, s) => acc + s.hours, 0);
    const exceeds40 = totalWeeklyHours > 40;

    res.json({
      success: true,
      shifts: myShifts,
      totalWeeklyHours,
      maxLegalWeeklyHours: 40,
      exceeds40,
      swaps: shiftSwapsStore.filter((sw) => sw.divisionId === session.divisionId || session.isAdminCapable || session.divisionId === 'keperawatan' || sw.requesterNip === session.nip)
    });
  });

  app.post('/api/gateway/shifts/swap', (req, res) => {
    const session = requireGatewaySession(req, res);
    if (!session) return;

    const { fromDate, fromShift, targetColleague, toDate, toShift, reason, extraHours } = req.body || {};
    if (!fromDate || !fromShift || !targetColleague || !toDate || !toShift) {
      return res.status(400).json({ success: false, message: 'Tanggal, shift asal/tujuan, dan rekan pengganti wajib diisi.' });
    }
    const scheduledHours = shiftSchedulesStore
      .filter((s) => s.nip === session.nip)
      .reduce((acc, s) => acc + s.hours, 0);
    const projectedHours = scheduledHours + Number(extraHours || 0);
    const conflictWarning =
      abacPolicies.enforce40HourShiftCap && projectedHours > 40
        ? `Peringatan UU Ketenagakerjaan: Total jam kerja menjadi ${projectedHours} jam/minggu (melebihi batas 40 jam). Memerlukan justifikasi & persetujuan Atasan Unit.`
        : undefined;

    const newSwap = {
      id: 'swp-' + Date.now(),
      requesterName: session.name,
      requesterNip: session.nip,
      divisionId: session.divisionId,
      fromDate: String(fromDate),
      fromShift: String(fromShift),
      targetColleague: String(targetColleague),
      toDate: String(toDate),
      toShift: String(toShift),
      reason: String(reason || ''),
      weeklyHoursAfterSwap: projectedHours,
      conflictWarning,
      status: 'Menunggu Atasan Unit' as const,
      createdAt: new Date().toISOString().replace('T', ' ').slice(0, 16)
    };

    shiftSwapsStore.unshift(newSwap);

    appendSiemLog({
      actorNip: session.nip,
      actorName: session.name,
      divisionId: session.divisionId,
      eventType: 'SHIFT_SWAP_REQUEST',
      resource: 'Jadwal & Shift Unit',
      decision: 'ALLOW',
      detail: `Pengajuan tukar shift ${newSwap.fromDate} <-> ${newSwap.toDate} (${projectedHours} jam/minggu).`,
      ipAddress: req.ip
    });

    res.json({ success: true, swap: newSwap });
  });

  app.post('/api/gateway/shifts/approve', (req, res) => {
    const session = requireGatewaySession(req, res);
    if (!session) return;
    const { swapId, decision } = req.body || {};
    const target = shiftSwapsStore.find((s) => s.id === swapId);
    if (!target) return res.status(404).json({ success: false, message: 'Pengajuan tukar shift tidak ditemukan.' });

    target.status = decision === 'REJECT' ? 'Ditolak' : 'Disetujui';
    appendSiemLog({
      actorNip: session.nip,
      actorName: session.name,
      divisionId: session.divisionId,
      eventType: 'SHIFT_SWAP_APPROVAL',
      resource: target.id,
      decision: 'ALLOW',
      detail: `Tukar shift oleh ${target.requesterName} status diubah menjadi ${target.status}.`,
      ipAddress: req.ip
    });
    res.json({ success: true, swap: target });
  });

  // Attendance Geofencing + Biometric + Offline Sync
  app.get('/api/gateway/attendance', (req, res) => {
    const session = requireGatewaySession(req, res);
    if (!session) return;

    const logs = attendanceLogsStore.filter(
      (l) => l.nip === session.nip || l.divisionId === session.divisionId
    );

    res.json({
      success: true,
      geofence: HOSPITAL_GEOFENCE,
      offlineModeEnabled: featureFlags.offline_attendance.enabled,
      logs,
      monthlySummary: null
    });
  });

  app.post('/api/gateway/attendance/clock', (req, res) => {
    const session = requireGatewaySession(req, res);
    if (!session) return;

    const { type, lat, lng, biometricVerified, note, isOfflineReplay } = req.body || {};
    if (typeof lat !== 'number' || typeof lng !== 'number') {
      return res.status(400).json({ success: false, message: 'Koordinat lokasi presensi wajib disertakan.' });
    }
    const userLat = lat;
    const userLng = lng;
    const distanceMeters = haversineMeters(userLat, userLng, HOSPITAL_GEOFENCE.lat, HOSPITAL_GEOFENCE.lng);
    const withinGeofence = distanceMeters <= HOSPITAL_GEOFENCE.radiusMeters;

    if (!withinGeofence && !isOfflineReplay && type !== 'KOREKSI') {
      appendSiemLog({
        actorNip: session.nip,
        actorName: session.name,
        divisionId: session.divisionId,
        eventType: 'ATTENDANCE_OUT_OF_GEOFENCE',
        resource: 'Absensi Geofencing',
        decision: 'DENY',
        detail: `Presensi ditolak karena radius ${distanceMeters}m > batas ${HOSPITAL_GEOFENCE.radiusMeters}m.`,
        ipAddress: req.ip
      });
      return res.status(400).json({
        success: false,
        distanceMeters,
        message: `Posisi Anda (${distanceMeters} m) berada di luar radius geofence RS (${HOSPITAL_GEOFENCE.radiusMeters} m). Gunakan opsi Koreksi atau aktifkan koordinat kampus RS.`
      });
    }

    const entry = {
      id: 'att-' + Date.now() + '-' + Math.floor(Math.random() * 100),
      nip: session.nip,
      employeeName: session.name,
      divisionId: session.divisionId,
      timestamp: new Date().toISOString().replace('T', ' ').slice(0, 19),
      type: (type || 'MASUK') as 'MASUK' | 'PULANG' | 'LEMBUR' | 'KOREKSI',
      method: isOfflineReplay ? ('Offline Sync (Idempoten)' as const) : ('Geofencing + Biometrik' as const),
      distanceMeters,
      withinGeofence,
      biometricVerified: biometricVerified === true,
      note: String(note || (withinGeofence ? 'Area Kampus MYITARU' : 'Koreksi / Tugas Luar')),
      idempotencyKey: typeof req.headers['idempotency-key'] === 'string' ? req.headers['idempotency-key'] : undefined
    };

    attendanceLogsStore.unshift(entry);
    appendSiemLog({
      actorNip: session.nip,
      actorName: session.name,
      divisionId: session.divisionId,
      eventType: `ATTENDANCE_${entry.type}`,
      resource: entry.method,
      decision: 'ALLOW',
      detail: `Presensi ${entry.type} tercatat (${entry.distanceMeters} m dari Klinik).`,
      ipAddress: req.ip
    });

    res.json({ success: true, entry });
  });

  app.post('/api/gateway/attendance/sync-offline', (req, res) => {
    const session = requireGatewaySession(req, res);
    if (!session) return;

    if (!featureFlags.offline_attendance.enabled) {
      return res.status(403).json({
        success: false,
        message: 'Feature flag absensi offline saat ini sedang dinonaktifkan.'
      });
    }

    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    const synced: typeof attendanceLogsStore = [];
    let skippedDuplicates = 0;

    for (const item of items) {
      const idem = String(item.idempotencyKey || '');
      if (idem && attendanceLogsStore.some((existing) => existing.idempotencyKey === idem)) {
        skippedDuplicates += 1;
        continue;
      }

      const entry = {
        id: 'att-off-' + Date.now() + '-' + Math.floor(Math.random() * 999),
        nip: session.nip,
        employeeName: session.name,
        divisionId: session.divisionId,
        timestamp: String(item.capturedAt || new Date().toISOString().replace('T', ' ').slice(0, 19)),
        type: (item.type || 'MASUK') as 'MASUK' | 'PULANG' | 'LEMBUR' | 'KOREKSI',
        method: 'Offline Sync (Idempoten)' as const,
        distanceMeters: Number(item.distanceMeters) || 0,
        withinGeofence: Number.isFinite(Number(item.distanceMeters)) && Number(item.distanceMeters) <= HOSPITAL_GEOFENCE.radiusMeters,
        biometricVerified: true,
        note: String(item.note || 'Sinkronisasi antrean offline'),
        idempotencyKey: idem || undefined
      };
      attendanceLogsStore.unshift(entry);
      synced.push(entry);
    }

    appendSiemLog({
      actorNip: session.nip,
      actorName: session.name,
      divisionId: session.divisionId,
      eventType: 'ATTENDANCE_OFFLINE_SYNC',
      resource: 'Idempotent Queue Sync',
      decision: 'ALLOW',
      detail: `${synced.length} presensi offline disinkronkan (${skippedDuplicates} duplikat dicegah).`,
      ipAddress: req.ip
    });

    res.json({
      success: true,
      syncedCount: synced.length,
      skippedDuplicates,
      synced
    });
  });

  // Leave Requests & Multi-Tier Approval
  app.get('/api/gateway/leaves', (req, res) => {
    const session = requireGatewaySession(req, res);
    if (!session) return;
    res.json({
      success: true,
      // Saldo cuti berasal dari HRIS yang belum terhubung.
      balances: null,
      requests: leaveRequestsStore
    });
  });

  app.post('/api/gateway/leaves', (req, res) => {
    const session = requireGatewaySession(req, res);
    if (!session) return;

    const { type, startDate, endDate, days, substitute, reason } = req.body || {};
    if (!type || !startDate || !endDate || !Number(days)) {
      return res.status(400).json({ success: false, message: 'Jenis cuti, tanggal mulai/selesai, dan jumlah hari wajib diisi.' });
    }
    const newLeave = {
      id: 'lv-' + Date.now(),
      nip: session.nip,
      employeeName: session.name,
      divisionId: session.divisionId,
      type: type as 'Cuti Tahunan' | 'Cuti Sakit' | 'Izin Pelatihan / Seminar' | 'Izin Khusus',
      startDate: String(startDate),
      endDate: String(endDate),
      days: Number(days),
      substitute: String(substitute || ''),
      reason: String(reason || ''),
      status: 'Menunggu Atasan Unit' as const,
      createdAt: new Date().toISOString().replace('T', ' ').slice(0, 16)
    };

    leaveRequestsStore.unshift(newLeave);
    appendSiemLog({
      actorNip: session.nip,
      actorName: session.name,
      divisionId: session.divisionId,
      eventType: 'LEAVE_SUBMITTED',
      resource: newLeave.id,
      decision: 'ALLOW',
      detail: `Pengajuan ${newLeave.type} (${newLeave.days} hari) menunggu approval Atasan Unit.`,
      ipAddress: req.ip
    });

    res.json({ success: true, leave: newLeave });
  });

  app.post('/api/gateway/leaves/approve', (req, res) => {
    const session = requireGatewaySession(req, res);
    if (!session) return;
    const { leaveId, action } = req.body || {};
    const item = leaveRequestsStore.find((l) => l.id === leaveId);
    if (!item) return res.status(404).json({ success: false, message: 'Pengajuan cuti tidak ditemukan.' });

    if (action === 'REJECT') {
      item.status = 'Ditolak';
    } else if (item.status === 'Menunggu Atasan Unit') {
      item.unitApprovedBy = session.name;
      item.status = 'Menunggu Verifikasi SDM';
    } else if (item.status === 'Menunggu Verifikasi SDM') {
      item.sdmApprovedBy = session.name;
      item.status = 'Disetujui Final';
    }

    appendSiemLog({
      actorNip: session.nip,
      actorName: session.name,
      divisionId: session.divisionId,
      eventType: 'LEAVE_WORKFLOW_STEP',
      resource: item.id,
      decision: 'ALLOW',
      detail: `Status pengajuan cuti ${item.employeeName} diperbarui menjadi ${item.status}.`,
      ipAddress: req.ip
    });

    res.json({ success: true, leave: item });
  });

  // Payroll & Reimbursement
  app.get('/api/gateway/payroll', (req, res) => {
    const session = requireGatewaySession(req, res);
    if (!session) return;

    res.json({
      success: true,
      // Slip gaji berasal dari sistem payroll yang belum terhubung.
      currentSlip: null,
      reimbursements: reimbursementsStore
    });
  });

  app.post('/api/gateway/payroll/reimburse', (req, res) => {
    const session = requireGatewaySession(req, res);
    if (!session) return;

    const { title, category, amount } = req.body || {};
    if (!title || !category || !(Number(amount) > 0)) {
      return res.status(400).json({ success: false, message: 'Judul, kategori, dan nominal klaim wajib diisi.' });
    }
    const newItem = {
      id: 'rmb-' + Date.now(),
      nip: session.nip,
      employeeName: session.name,
      title: String(title),
      category: category as 'Diklat / SKP' | 'Perjalanan Dinas' | 'Kesehatan Pegawai' | 'Operasional Unit',
      amount: Number(amount),
      date: new Date().toISOString().split('T')[0],
      status: 'Diajukan' as const
    };
    reimbursementsStore.unshift(newItem);
    res.json({ success: true, reimbursement: newItem });
  });

  // Training & SOP
  // Katalog pelatihan diisi oleh unit Diklat; tidak ada katalog bawaan.
  const trainingCatalog: Array<{
    id: string;
    code: string;
    type: string;
    title: string;
    unit: string;
    status: string;
    enrolled: boolean;
    skp: number;
  }> = [];

  app.get('/api/gateway/training', (req, res) => {
    const session = requireGatewaySession(req, res);
    if (!session) return;
    res.json({
      success: true,
      courses: trainingCatalog,
      certificates: []
    });
  });

  app.post('/api/gateway/training/enroll', (req, res) => {
    const session = requireGatewaySession(req, res);
    if (!session) return;
    const { courseId } = req.body || {};
    const course = trainingCatalog.find((c) => c.id === courseId);
    if (!course) return res.status(404).json({ success: false, message: 'Pelatihan tidak ditemukan.' });
    course.enrolled = true;
    course.status = 'Terdaftar (Menunggu Jadwal)';
    res.json({ success: true, course });
  });

  // Performance KPI & Doctor OPPE
  app.get('/api/gateway/performance', (req, res) => {
    const session = requireGatewaySession(req, res);
    if (!session) return;
    const division = HOSPITAL_DIVISIONS.find((d) => d.id === session.divisionId) || HOSPITAL_DIVISIONS[0];
    const access = evaluateAccess(session, division);

    res.json({
      success: true,
      // KPI & OPPE berasal dari sistem penilaian kinerja yang belum terhubung.
      individualKpi: null,
      oppeVisible: access.oppeAccess,
      doctorOppeMetrics: []
    });
  });

  // SBAR Handover + Internal Directory + Announcements
  app.get('/api/gateway/sbar', (req, res) => {
    const session = requireGatewaySession(req, res);
    if (!session) return;
    res.json({
      success: true,
      handovers: sbarHandoversStore,
      announcements: portalAnnouncements,
      directory: usersStore.slice(0, 18).map((u) => ({
        nip: u.nip,
        name: u.name,
        divisionName: u.divisionName,
        roleTitle: u.roleTitle,
        email: u.email,
        shiftPattern: u.shiftPattern
      }))
    });
  });

  app.post('/api/gateway/sbar', (req, res) => {
    const session = requireGatewaySession(req, res);
    if (!session) return;

    const { unit, sessionType, fromShift, toShift, receiverName, patientLabel, situation, background, assessment, recommendation } = req.body || {};
    const entry = {
      id: 'sbar-' + Date.now(),
      unit: String(unit || session.divisionName),
      divisionId: session.divisionId,
      sessionType: (sessionType === 'Nurse Station (Terjadwal)' ? 'Nurse Station (Terjadwal)' : 'Bedside Handover') as
        | 'Nurse Station (Terjadwal)'
        | 'Bedside Handover',
      fromShift: String(fromShift || session.divisionName),
      toShift: String(toShift || 'Shift Berikutnya'),
      senderName: session.name,
      receiverName: String(receiverName || 'Petugas Shift Pengganti'),
      patientLabel: String(patientLabel || 'Pasien Unit'),
      situation: String(situation || ''),
      background: String(background || ''),
      assessment: String(assessment || ''),
      recommendation: String(recommendation || ''),
      karuVerified: false,
      createdAt: new Date().toISOString().replace('T', ' ').slice(0, 16)
    };

    sbarHandoversStore.unshift(entry);
    appendSiemLog({
      actorNip: session.nip,
      actorName: session.name,
      divisionId: session.divisionId,
      eventType: 'SBAR_HANDOVER_CREATED',
      resource: entry.patientLabel,
      decision: 'ALLOW',
      detail: `Handover ${entry.sessionType} diserahkan ke ${entry.receiverName}.`,
      ipAddress: req.ip
    });

    res.json({ success: true, handover: entry });
  });

  app.post('/api/gateway/sbar/verify', (req, res) => {
    const session = requireGatewaySession(req, res);
    if (!session) return;
    const { sbarId } = req.body || {};
    const item = sbarHandoversStore.find((h) => h.id === sbarId);
    if (!item) return res.status(404).json({ success: false, message: 'Catatan SBAR tidak ditemukan.' });
    item.karuVerified = true;
    item.karuName = session.name;
    res.json({ success: true, handover: item });
  });

  // Helpdesk TI & HR (accessible both authenticated & from landing page support form)
  app.get('/api/gateway/helpdesk', (req, res) => {
    res.json({
      success: true,
      tickets: helpdeskTicketsStore,
      // Kontak unit diisi oleh fasilitas; tidak ada nomor bawaan.
      emergencyContacts: [],
      faqs: [
        { q: 'Apakah absensi tetap tercatat di area basement / ambulans tanpa sinyal?', a: 'Ya. Aktifkan Mode Offline di aplikasi mobile karyawan. Data disimpan terenkripsi dan otomatis disinkronkan menggunakan Idempotency-Key.' },
        { q: 'Mengapa tombol Rekam Medis terkunci saat Off-Duty?', a: 'Kebijakan ABAC (Attribute-Based Access Control) sesuai PMK 24/2022 membatasi akses EMR di luar jadwal jaga, kecuali menggunakan protokol darurat Break-Glass yang diaudit.' }
      ]
    });
  });

  app.post('/api/gateway/helpdesk', (req, res) => {
    const token = extractBearerToken(req);
    const session = token ? sessions.get(token) : undefined;
    const { requesterName, requesterContact, divisionName, category, priority, subject, description, source } = req.body || {};

    const ticket = {
      id: 'tkt-' + Date.now(),
      ticketNo: `INC-${new Date().getFullYear()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`,
      requesterName: String(requesterName || session?.name || 'Karyawan RS'),
      requesterContact: String(requesterContact || session?.nip || 'Eksternal'),
      divisionName: String(divisionName || session?.divisionName || 'Umum / Pengunjung Landing Page'),
      category: (category || 'TI / SIMK & MFA') as
        | 'TI / SIMK & MFA'
        | 'HR & Absensi / Payroll'
        | 'Instalasi Aplikasi Mobile'
        | 'Sarana / Medis',
      priority: (priority || 'P2 - Tinggi (1 Jam)') as 'P1 - Kritis (15 Menit)' | 'P2 - Tinggi (1 Jam)' | 'P3 - Normal (4 Jam)',
      subject: String(subject || 'Permintaan Bantuan Layanan'),
      description: String(description || '-'),
      source: (source === 'Landing Page App' ? 'Landing Page App' : 'Portal Karyawan') as 'Portal Karyawan' | 'Landing Page App',
      status: 'Terbuka' as const,
      assignedTeam: category === 'HR & Absensi / Payroll' ? 'SDM & Payroll Service' : 'Service Desk TI (ITIL 4)',
      createdAt: new Date().toISOString().replace('T', ' ').slice(0, 16)
    };

    helpdeskTicketsStore.unshift(ticket);
    appendSiemLog({
      actorNip: session?.nip || ticket.requesterContact,
      actorName: ticket.requesterName,
      divisionId: session?.divisionId || 'landing',
      eventType: 'HELPDESK_TICKET_CREATED',
      resource: ticket.ticketNo,
      decision: 'ALLOW',
      detail: `[${ticket.priority}] ${ticket.subject}`,
      ipAddress: req.ip
    });

    res.json({ success: true, ticket });
  });

  app.post('/api/gateway/helpdesk/resolve', (req, res) => {
    const session = requireGatewaySession(req, res);
    if (!session) return;
    const { ticketId, status } = req.body || {};
    const t = helpdeskTicketsStore.find((item) => item.id === ticketId);
    if (!t) return res.status(404).json({ success: false, message: 'Tiket tidak ditemukan.' });
    t.status = status === 'Selesai' ? 'Selesai' : 'Ditangani ITIL L1/L2';
    res.json({ success: true, ticket: t });
  });

  // =========================================================================
  // 6. ALL 34 DIVISION-SPECIFIC WORKSPACES (RBAC + ABAC PROTECTED)
  // =========================================================================
  app.get('/api/gateway/divisions/:divisionId/workspace', (req, res) => {
    const session = requireGatewaySession(req, res);
    if (!session) return;

    const div = HOSPITAL_DIVISIONS.find((d) => d.id === req.params.divisionId);
    if (!div) {
      return res.status(404).json({ success: false, message: 'Divisi rumah sakit tidak ditemukan.' });
    }

    const access = evaluateAccess(session, div);
    const divisionActions = divisionActionState.get(div.id) || {};

    const worklist = div.specificModules.map((modName, idx) => {
      const itemId = `${div.id}-task-${idx + 1}`;
      const isClinicalLocked = div.isClinical && access.emrAccess === 'LOCKED';
      const defaultStatus = isClinicalLocked ? 'Terkunci (ABAC)' : 'Belum Ada Data';

      return {
        id: itemId,
        moduleTitle: modName,
        referenceCode: `${div.id.toUpperCase().slice(0, 4)}-${String(idx + 1).padStart(2, '0')}`,
        assignedUnit: div.name,
        sensitivity: div.abacSensitivity,
        metricSummary: null,
        status: divisionActions[itemId] || defaultStatus,
        requiresEmrClearance: div.isClinical
      };
    });

    res.json({
      success: true,
      division: div,
      access,
      // KPI unit belum memiliki sumber data; jangan tampilkan angka karangan.
      kpis: [],
      worklist
    });
  });

  app.post('/api/gateway/divisions/:divisionId/action', (req, res) => {
    const session = requireGatewaySession(req, res);
    if (!session) return;

    const div = HOSPITAL_DIVISIONS.find((d) => d.id === req.params.divisionId);
    if (!div) return res.status(404).json({ success: false, message: 'Divisi tidak ditemukan.' });

    const access = evaluateAccess(session, div);
    if (div.isClinical && access.emrAccess === 'LOCKED') {
      appendSiemLog({
        actorNip: session.nip,
        actorName: session.name,
        divisionId: session.divisionId,
        eventType: 'ABAC_POLICY_BLOCK',
        resource: `${div.name} (${req.body?.taskId || 'task'})`,
        decision: 'DENY',
        detail: access.emrReasons.join(' '),
        ipAddress: req.ip
      });
      return res.status(403).json({
        success: false,
        message: `Aksi ditolak kebijakan ABAC: ${access.emrReasons.join(' ')}`
      });
    }

    const { taskId, newStatus } = req.body || {};
    const state = divisionActionState.get(div.id) || {};
    state[String(taskId)] = String(newStatus || 'Selesai Diverifikasi');
    divisionActionState.set(div.id, state);

    appendSiemLog({
      actorNip: session.nip,
      actorName: session.name,
      divisionId: session.divisionId,
      eventType: access.emrAccess === 'BREAK_GLASS' ? 'BREAK_GLASS_CLINICAL_ACTION' : 'DIVISION_TASK_UPDATED',
      resource: `${div.name} :: ${taskId}`,
      decision: access.emrAccess === 'BREAK_GLASS' ? 'BREAK_GLASS' : 'ALLOW',
      detail: `Status item diperbarui menjadi "${state[String(taskId)]}".`,
      ipAddress: req.ip
    });

    res.json({ success: true, taskId, status: state[String(taskId)] });
  });

  // =========================================================================
  // 7. AREA ADMIN & GOVERNANCE (CHANGE APPROVAL, SIEM, INTEGRATIONS)
  // =========================================================================
  app.get('/api/gateway/admin/state', (req, res) => {
    const session = requireGatewaySession(req, res);
    if (!session) return;

    const division = HOSPITAL_DIVISIONS.find((d) => d.id === session.divisionId) || HOSPITAL_DIVISIONS[0];
    const access = evaluateAccess(session, division);
    if (!access.adminAreaAccess) {
      appendSiemLog({
        actorNip: session.nip,
        actorName: session.name,
        divisionId: session.divisionId,
        eventType: 'ADMIN_AREA_FORBIDDEN',
        resource: 'Area Admin Portal Karyawan',
        decision: 'DENY',
        detail: 'Pengguna tidak memiliki peran Admin/Direksi/SPI/DPO untuk membuka Area Admin.',
        ipAddress: req.ip
      });
      return res.status(403).json({
        success: false,
        message: 'Akses ditolak: Area Admin & Tata Kelola hanya untuk Unit SIMK/TI, SDM, Direksi, SPI, atau Hukum & Etik.'
      });
    }

    res.json({
      success: true,
      users: usersStore,
      rbacMatrix,
      abacPolicies,
      featureFlags,
      announcements: portalAnnouncements,
      proposals: configChangeProposals,
      changelog: governanceChangelog,
      siemAuditTrail: siemAuditTrail.slice(0, 60),
      integrations: integrationHealthStore,
      analyticsSummary: {
        totalActiveEmployees: usersStore.filter((u) => u.active).length,
        divisionsCovered: HOSPITAL_DIVISIONS.length,
        activeSessions: sessions.size,
        pendingApprovals: configChangeProposals.filter((p) => p.status === 'PENDING_REVIEW').length + leaveRequestsStore.filter((l) => l.status !== 'Disetujui Final' && l.status !== 'Ditolak').length,
        complianceScore: null
      }
    });
  });

  app.post('/api/gateway/admin/users', (req, res) => {
    const session = requireGatewaySession(req, res);
    if (!session) return;

    const { action, userId, name, nip, divisionId } = req.body || {};
    if (action === 'HRIS_SYNC') {
      const now = new Date().toISOString();
      usersStore.forEach((u) => {
        u.lastHrisSync = now;
      });
      appendSiemLog({
        actorNip: session.nip,
        actorName: session.name,
        divisionId: session.divisionId,
        eventType: 'HRIS_DIRECTORY_SYNC',
        resource: 'HRIS -> Portal Karyawan',
        decision: 'ALLOW',
        detail: `Sinkronisasi ${usersStore.length} akun pegawai dari sumber kebenaran HRIS selesai.`,
        ipAddress: req.ip
      });
      return res.json({ success: true, users: usersStore, message: 'Sinkronisasi HRIS selesai.' });
    }

    if (action === 'TOGGLE_ACTIVE' && userId) {
      const u = usersStore.find((item) => item.id === userId);
      if (u) {
        u.active = !u.active;
        appendSiemLog({
          actorNip: session.nip,
          actorName: session.name,
          divisionId: session.divisionId,
          eventType: 'USER_STATUS_TOGGLE',
          resource: u.nip,
          decision: 'ALLOW',
          detail: `Akun ${u.name} diubah menjadi ${u.active ? 'Aktif' : 'Nonaktif'}.`,
          ipAddress: req.ip
        });
        return res.json({ success: true, user: u });
      }
    }

    if (action === 'CREATE' && name && nip) {
      const div = HOSPITAL_DIVISIONS.find((d) => d.id === divisionId) || HOSPITAL_DIVISIONS[0];
      const newUser: EmployeeUserRecord = {
        id: 'emp-' + Date.now(),
        nip: String(nip),
        email: `${String(nip).toLowerCase().replace(/[^a-z0-9]/g, '')}@myitaru.id`,
        name: String(name),
        divisionId: div.id,
        divisionName: div.name,
        roleTitle: div.sampleRoles[0] || div.name,
        portalRole: mapPortalRole(div),
        isClinical: div.isClinical,
        isAdminCapable: div.isAdminCapable,
        active: true,
        unitLocation: div.name,
        shiftPattern: div.defaultShift,
        lastHrisSync: new Date().toISOString()
      };
      usersStore.unshift(newUser);
      return res.json({ success: true, user: newUser });
    }

    res.status(400).json({ success: false, message: 'Aksi user tidak valid.' });
  });

  // Segregation-of-duties Change Proposal & Reviewer Approval
  app.post('/api/gateway/admin/propose-change', (req, res) => {
    const session = requireGatewaySession(req, res);
    if (!session) return;

    const { category, title, targetKey, proposedValue, justification } = req.body || {};
    const proposal: ConfigChangeProposal = {
      id: 'chg-' + Date.now(),
      proposedAt: new Date().toISOString().replace('T', ' ').slice(0, 19),
      proposedBy: `${session.name} (${session.divisionName})`,
      category: category || 'FEATURE_FLAG',
      title: String(title || 'Usulan Perubahan Konfigurasi'),
      targetKey: String(targetKey || 'offline_attendance'),
      proposedValue,
      justification: String(justification || 'Peningkatan tata kelola ITIL 4 & COBIT 2019'),
      status: 'PENDING_REVIEW'
    };

    configChangeProposals.unshift(proposal);
    appendSiemLog({
      actorNip: session.nip,
      actorName: session.name,
      divisionId: session.divisionId,
      eventType: 'CONFIG_CHANGE_PROPOSED',
      resource: `${proposal.category} :: ${proposal.targetKey}`,
      decision: 'CHALLENGE',
      detail: `Usulan perubahan "${proposal.title}" menunggu Reviewer Keamanan/Kepatuhan.`,
      ipAddress: req.ip
    });

    res.json({ success: true, proposal });
  });

  app.post('/api/gateway/admin/review-change', (req, res) => {
    const session = requireGatewaySession(req, res);
    if (!session) return;

    const { proposalId, decision, reviewNote } = req.body || {};
    const proposal = configChangeProposals.find((p) => p.id === proposalId);
    if (!proposal) return res.status(404).json({ success: false, message: 'Usulan perubahan tidak ditemukan.' });

    proposal.reviewedAt = new Date().toISOString().replace('T', ' ').slice(0, 19);
    proposal.reviewedBy = `${session.name} (Reviewer Keamanan/Kepatuhan)`;
    proposal.reviewNote = String(reviewNote || (decision === 'APPROVE' ? 'Memenuhi syarat ISO 27001 & UU PDP' : 'Perlu kajian ulang risiko'));

    if (decision === 'REJECT') {
      proposal.status = 'REJECTED';
      appendSiemLog({
        actorNip: session.nip,
        actorName: session.name,
        divisionId: session.divisionId,
        eventType: 'CONFIG_CHANGE_REJECTED',
        resource: proposal.id,
        decision: 'DENY',
        detail: `${proposal.title} ditolak: ${proposal.reviewNote}`,
        ipAddress: req.ip
      });
      return res.json({ success: true, proposal, changelog: governanceChangelog });
    }

    proposal.status = 'APPROVED';

    // Apply atomically to live policy / flag / announcement
    if (proposal.category === 'FEATURE_FLAG' && featureFlags[proposal.targetKey]) {
      featureFlags[proposal.targetKey].enabled = Boolean(proposal.proposedValue);
    } else if (proposal.category === 'ABAC_POLICY' && proposal.targetKey in abacPolicies) {
      (abacPolicies as unknown as Record<string, boolean>)[proposal.targetKey] = Boolean(proposal.proposedValue);
    } else if (proposal.category === 'PORTAL_CONTENT' && proposal.proposedValue && typeof proposal.proposedValue === 'object') {
      const val = proposal.proposedValue as { title?: string; summary?: string; category?: string };
      portalAnnouncements.unshift({
        id: 'ann-' + Date.now(),
        title: val.title || proposal.title,
        category: val.category || 'Pengumuman Resmi',
        priority: 'Penting',
        publishedAt: new Date().toISOString().replace('T', ' ').slice(0, 16),
        author: proposal.proposedBy,
        summary: val.summary || proposal.justification
      });
    }

    governanceChangelog.unshift({
      id: 'clog-' + Date.now(),
      appliedAt: proposal.reviewedAt,
      proposalId: proposal.id,
      category: proposal.category,
      title: proposal.title,
      approvedBy: proposal.reviewedBy,
      summary: `${proposal.targetKey} = ${JSON.stringify(proposal.proposedValue)}`
    });

    appendSiemLog({
      actorNip: session.nip,
      actorName: session.name,
      divisionId: session.divisionId,
      eventType: 'CONFIG_CHANGE_APPLIED',
      resource: `${proposal.category} :: ${proposal.targetKey}`,
      decision: 'ALLOW',
      detail: `Disetujui & diterapkan secara atomik oleh ${proposal.reviewedBy}.`,
      ipAddress: req.ip
    });

    res.json({
      success: true,
      proposal,
      featureFlags,
      abacPolicies,
      announcements: portalAnnouncements,
      changelog: governanceChangelog
    });
  });

  app.post('/api/gateway/admin/integrations/test', (req, res) => {
    const session = requireGatewaySession(req, res);
    if (!session) return;

    const { integrationId } = req.body || {};
    const target = integrationHealthStore.find((i) => i.id === integrationId);
    if (!target) return res.status(404).json({ success: false, message: 'Layanan integrasi tidak ditemukan.' });

    // Belum ada konektor nyata yang bisa diuji; jangan laporkan uji koneksi palsu.
    return res.status(503).json({
      success: false,
      code: 'INTEGRATION_NOT_CONFIGURED',
      message: `${target.name} belum dikonfigurasi.`,
      integration: target
    });
  });

  // =========================================================================
  // 8. PUBLIC LANDING PAGE ANALYTICS (/app-karyawan)
  // =========================================================================
  app.get('/api/gateway/landing-analytics', (_req, res) => {
    res.json({
      success: true,
      analytics: landingAnalyticsStore
    });
  });

  app.post('/api/gateway/landing-analytics', (req, res) => {
    const { device, cta, utmSource, isVisit } = req.body || {};
    const cleanDevice = device === 'iOS' ? 'iOS' : device === 'Android' ? 'Android' : 'Desktop';
    const cleanUtm = String(utmSource || 'direct');

    if (isVisit) {
      landingAnalyticsStore.totalVisits += 1;
      landingAnalyticsStore.byDevice[cleanDevice] += 1;
    }

    if (cta && cta in landingAnalyticsStore.byCta) {
      const k = cta as keyof typeof landingAnalyticsStore.byCta;
      landingAnalyticsStore.byCta[k] += 1;
    }

    if (cleanUtm in landingAnalyticsStore.byUtmSource) {
      const u = cleanUtm as keyof typeof landingAnalyticsStore.byUtmSource;
      landingAnalyticsStore.byUtmSource[u] += 1;
    }

    if (cta) {
      landingAnalyticsStore.recentEvents.unshift({
        timestamp: new Date().toISOString().replace('T', ' ').slice(11, 16),
        device: cleanDevice,
        cta: String(cta),
        utmSource: cleanUtm
      });
      if (landingAnalyticsStore.recentEvents.length > 10) {
        landingAnalyticsStore.recentEvents.pop();
      }
    }

    res.json({
      success: true,
      analytics: landingAnalyticsStore
    });
  });
}
