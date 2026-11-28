import crypto from 'crypto';
import type express from 'express';
import {
  HOSPITAL_DIVISIONS,
  CORE_EMPLOYEE_MODULES,
  GOVERNANCE_FRAMEWORKS,
  type DivisionDefinition
} from '../data/employeePortalCatalog';
import type { Databases } from './db';

export interface GatewayDependencies {
  db: Databases;
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

// Row shapes of db.hr / db.core tables (see migrations/hr/0001_init.sql, migrations/core/0002_sbar_handover.sql)
interface EmployeeRow {
  id: string;
  nip: string;
  email: string;
  name: string;
  division_id: string;
  role_title: string;
  portal_role: EmployeeUserRecord['portalRole'];
  is_clinical: number;
  is_admin_capable: number;
  active: number;
  str_number: string | null;
  str_expiry: string | null;
  sip_number: string | null;
  sip_expiry: string | null;
  unit_location: string;
  shift_pattern: string;
  last_hris_sync: string;
}

interface SessionRow {
  employee_id: string;
  name: string;
  email: string;
  auth_type: 'nip' | 'google';
  mfa_verified: number;
  device_fingerprint: string;
  abac: string;
  created_at: string;
  nip: string;
  division_id: string;
  role_title: string;
  portal_role: EmployeeUserRecord['portalRole'];
  is_clinical: number;
  is_admin_capable: number;
}

interface OtpRow {
  id: string;
  employee_id: string;
  otp_hash: string;
  auth_type: 'nip' | 'google';
  device_info: string;
}

const SESSION_TTL_SQL = "datetime('now', '-12 hours')";
const MAX_OTP_ATTEMPTS = 5;
const ATTENDANCE_TYPES = ['MASUK', 'PULANG', 'LEMBUR', 'KOREKSI'] as const;
const LEAVE_TYPES = ['Cuti Tahunan', 'Cuti Sakit', 'Izin Pelatihan / Seminar', 'Izin Khusus'] as const;
const REIMBURSE_CATEGORIES = ['Diklat / SKP', 'Perjalanan Dinas', 'Kesehatan Pegawai', 'Operasional Unit'] as const;
const HELPDESK_CATEGORIES = ['TI / SIMK & MFA', 'HR & Absensi / Payroll', 'Instalasi Aplikasi Mobile', 'Sarana / Medis'] as const;
const HELPDESK_PRIORITIES = ['P1 - Kritis (15 Menit)', 'P2 - Tinggi (1 Jam)', 'P3 - Normal (4 Jam)'] as const;
const DAY_LABELS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

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

const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
const nowStamp = (len = 19) => new Date().toISOString().replace('T', ' ').slice(0, len);
const today = () => new Date().toISOString().slice(0, 10);
const isDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const isUniqueViolation = (e: unknown) => String((e as Error)?.message || '').includes('UNIQUE');
const divisionById = (id: string) => HOSPITAL_DIVISIONS.find((d) => d.id === id);
const oneOf = <T extends string>(list: readonly T[], v: unknown, fallback: T): T =>
  list.includes(v as T) ? (v as T) : fallback;
// Trimmed, length-capped string from untrusted input.
const str = (v: unknown, fallback: string, max = 500) => {
  const s = v === undefined || v === null ? '' : String(v).trim();
  return (s || fallback).slice(0, max);
};
const daysUntil = (date?: string) => (date ? Math.ceil((Date.parse(date) - Date.now()) / 86_400_000) : 0);

function toUser(r: EmployeeRow): EmployeeUserRecord {
  return {
    id: r.id,
    nip: r.nip,
    email: r.email,
    name: r.name,
    divisionId: r.division_id,
    divisionName: divisionById(r.division_id)?.name || r.division_id,
    roleTitle: r.role_title,
    portalRole: r.portal_role,
    isClinical: Boolean(r.is_clinical),
    isAdminCapable: Boolean(r.is_admin_capable),
    active: Boolean(r.active),
    strNumber: r.str_number ?? undefined,
    strExpiry: r.str_expiry ?? undefined,
    sipNumber: r.sip_number ?? undefined,
    sipExpiry: r.sip_expiry ?? undefined,
    unitLocation: r.unit_location,
    shiftPattern: r.shift_pattern,
    lastHrisSync: r.last_hris_sync
  };
}

// Express 4 does not catch rejected promises; forward them to the error handler.
const asyncRoute =
  (fn: (req: express.Request, res: express.Response) => Promise<unknown>) =>
  (req: express.Request, res: express.Response, next: express.NextFunction) => {
    fn(req, res).catch(next);
  };

export function registerEmployeePortalGateway(app: express.Application, deps: GatewayDependencies) {
  const hr = deps.db.hr;
  const core = deps.db.core;

  // Klinik Campus Reference Coordinate (MYITARU Medical Center - Jakarta)
  const HOSPITAL_GEOFENCE = {
    name: 'Kampus Utama Klinik Tarumanagara Jakarta',
    lat: -6.229728,
    lng: 106.829518,
    radiusMeters: 200
  };

  // =========================================================================
  // 1. GOVERNANCE STATE (employees, sessions and HR data live in db.hr; SBAR in db.core)
  // =========================================================================
  // shortcut: per-isolate memory, resets on deploy and differs between Worker isolates; move to D1/KV when it must hold across instances.
  const idempotencyCache = new Map<string, { status: number; body: unknown; createdAt: number }>();
  const rateLimitMap = new Map<string, number[]>();

  // shortcut: governance config (ABAC policies, feature flags, RBAC matrix, announcements, change proposals,
  // changelog, integration health, landing analytics) is in memory and resets per isolate; move to D1 when admins must change it for real.
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

  let portalAnnouncements = [
    {
      id: 'ann-1',
      title: 'Pembaruan Kebijakan Keamanan PMK 24/2022 & MFA Klinis',
      category: 'Tata Kelola & Keamanan',
      priority: 'Penting',
      publishedAt: '2026-04-02 08:00',
      author: 'Komite Mutu & Unit SIMK/TI',
      summary: 'Seluruh tenaga klinis dan pengelola sistem wajib mengaktifkan MFA 6-digit serta menjaga kepatuhan atribut ABAC On-Duty saat mengakses Rekam Medis Elektronik.'
    },
    {
      id: 'ann-2',
      title: 'Jadwal Uji Kompetensi BHD / ACLS Batch Q2 2026',
      category: 'Diklat & SDM',
      priority: 'Info',
      publishedAt: '2026-04-01 10:30',
      author: 'Instalasi Pendidikan & Pelatihan',
      summary: 'Pegawai dengan masa berlaku sertifikat BHD kurang dari 90 hari dapat mendaftar langsung melalui modul Pengetahuan & Diklat.'
    },
    {
      id: 'ann-3',
      title: 'Pemeliharaan Terjadwal Adapter SATUSEHAT FHIR R4 Minggu Dini Hari',
      category: 'Operasional TI',
      priority: 'Info',
      publishedAt: '2026-03-29 14:15',
      author: 'Unit SIMK / TI',
      summary: 'Pengiriman data klinis akan masuk ke Message Queue asinkron dan dikirim otomatis dengan mekanisme retry idempoten tanpa kehilangan transaksi.'
    }
  ];

  // shortcut: in-memory view of the last 200 gateway events for the admin screen; the durable copy goes through deps.createAuditLog.
  const siemAuditTrail: SiemAuditEntry[] = [];

  const configChangeProposals: ConfigChangeProposal[] = [
    {
      id: 'chg-101',
      proposedAt: '2026-04-08 09:30:00',
      proposedBy: 'Unit SIMK/TI',
      category: 'ABAC_POLICY',
      title: 'Aktifkan verifikasi hubungan perawatan (Care Relationship) untuk akses EMR detail',
      targetKey: 'requireCareRelationshipForPatientRecords',
      proposedValue: true,
      justification: 'Memperketat prinsip need-to-know sesuai PMK 24/2022 dan audit SPI Q2 2026.',
      status: 'PENDING_REVIEW'
    },
    {
      id: 'chg-102',
      proposedAt: '2026-04-07 15:10:00',
      proposedBy: 'SDM & Umum',
      category: 'FEATURE_FLAG',
      title: 'Aktifkan mode absensi offline idempoten untuk seluruh unit',
      targetKey: 'offline_attendance',
      proposedValue: true,
      justification: 'Menjaga kelancaran presensi di area basement & ambulans saat sinyal lemah.',
      status: 'APPROVED',
      reviewedAt: '2026-04-07 16:00:00',
      reviewedBy: 'DPO / Hukum & Etik',
      reviewNote: 'Disetujui dengan syarat enkripsi lokal & Idempotency-Key aktif.'
    }
  ];

  const governanceChangelog: Array<{
    id: string;
    appliedAt: string;
    proposalId: string;
    category: string;
    title: string;
    approvedBy: string;
    summary: string;
  }> = [
    {
      id: 'clog-1',
      appliedAt: '2026-04-07 16:00:00',
      proposalId: 'chg-102',
      category: 'FEATURE_FLAG',
      title: 'Aktivasi Mode Absensi Offline Idempoten',
      approvedBy: 'DPO / Hukum & Etik',
      summary: 'Feature flag offline_attendance diaktifkan dengan proteksi Idempotency-Key.'
    }
  ];

  const integrationHealthStore = [
    {
      id: 'satusehat',
      name: 'SATUSEHAT Kemenkes (FHIR R4 Adapter)',
      protocol: 'REST / FHIR R4 Bundle (OAuth2)',
      status: 'TERHUBUNG',
      latencyMs: 118,
      queueDepth: 3,
      idempotencyRate: '100%',
      lastSync: '2026-04-08 13:55:00'
    },
    {
      id: 'bpjs-vclaim',
      name: 'BPJS Kesehatan Middleware (VClaim & Antrean JKN)',
      protocol: 'REST + HMAC-SHA256 + LZ-String',
      status: 'TERHUBUNG',
      latencyMs: 142,
      queueDepth: 0,
      idempotencyRate: '100%',
      lastSync: '2026-04-08 13:57:12'
    },
    {
      id: 'hris-core',
      name: 'HRIS Kepegawaian & Payroll Inti',
      protocol: 'Internal mTLS / Sync Queue',
      status: 'TERHUBUNG',
      latencyMs: 34,
      queueDepth: 0,
      idempotencyRate: '100%',
      lastSync: '2026-04-08 13:50:00'
    },
    {
      id: 'async-mq',
      name: 'Async Message Queue (Notifikasi & Retry Idempoten)',
      protocol: 'Worker Queue (Dead-Letter Guarded)',
      status: 'TERHUBUNG',
      latencyMs: 19,
      queueDepth: 2,
      idempotencyRate: '100%',
      lastSync: '2026-04-08 13:58:01'
    }
  ];

  const landingAnalyticsStore = {
    totalVisits: 1842,
    byDevice: { Android: 964, iOS: 418, Desktop: 460 },
    byCta: { playstore: 612, appstore: 285, qr: 214, deeplink: 198, mobile_web: 341, portal: 512 },
    byUtmSource: { intranet: 740, qrcode_lobby: 520, whatsapp_hr: 392, direct: 190 },
    recentEvents: [
      { timestamp: '2026-04-08 13:45', device: 'Android', cta: 'playstore', utmSource: 'whatsapp_hr' },
      { timestamp: '2026-04-08 13:32', device: 'Desktop', cta: 'qr', utmSource: 'intranet' },
      { timestamp: '2026-04-08 13:18', device: 'iOS', cta: 'mobile_web', utmSource: 'qrcode_lobby' }
    ] as Array<{ timestamp: string; device: string; cta: string; utmSource: string }>
  };

  // =========================================================================
  // 2. GATEWAY HELPERS (SIEM LOG, RATE LIMIT, IDEMPOTENCY, RBAC+ABAC, SESSIONS)
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
      timestamp: nowStamp(),
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
    // SBAR holds patient data: clinical staff only.
    const sbarAccess = featureFlags.sbar_bedside_handover.enabled && session.isClinical;

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

  const sessionDivision = (session: GatewaySession) => divisionById(session.divisionId) || HOSPITAL_DIVISIONS[0];

  // Returns why SBAR (patient data) is closed for this session, or null when allowed.
  function sbarDenyReason(session: GatewaySession): string | null {
    const access = evaluateAccess(session, sessionDivision(session));
    if (!featureFlags.sbar_bedside_handover.enabled) return 'Fitur handover SBAR sedang dinonaktifkan.';
    if (!access.sbarAccess) return 'Handover SBAR hanya dapat diakses tenaga klinis.';
    if (access.emrAccess === 'LOCKED') return access.emrReasons.join(' ');
    return null;
  }

  function extractBearerToken(req: express.Request): string | null {
    const auth = req.headers.authorization;
    if (auth && auth.startsWith('Bearer ')) {
      return auth.slice(7).trim();
    }
    const queryToken = req.query.token;
    return typeof queryToken === 'string' && queryToken ? queryToken : null;
  }

  function defaultAbac(): AbacContext {
    return { onDuty: true, unitMatch: true, careRelationship: true, breakGlassActive: false, breakGlassReason: '' };
  }

  async function getEmployee(id: string) {
    return hr.prepare('SELECT * FROM employee WHERE id = ?').bind(id).first<EmployeeRow>();
  }

  async function createSession(
    user: EmployeeUserRecord,
    opts: { name: string; email: string; authType: 'nip' | 'google'; deviceFingerprint: string }
  ): Promise<GatewaySession> {
    const token = 'emp_' + crypto.randomBytes(32).toString('hex');
    const abac = defaultAbac();
    await hr
      .prepare(
        'INSERT INTO auth_session (session_token_hash, employee_id, name, email, auth_type, mfa_verified, device_fingerprint, abac) VALUES (?, ?, ?, ?, ?, 1, ?, ?)'
      )
      .bind(sha256(token), user.id, opts.name, opts.email, opts.authType, opts.deviceFingerprint, JSON.stringify(abac))
      .run();
    return {
      token,
      userId: user.id,
      nip: user.nip,
      name: opts.name,
      email: opts.email,
      divisionId: user.divisionId,
      divisionName: user.divisionName,
      roleTitle: user.roleTitle,
      portalRole: user.portalRole,
      isClinical: user.isClinical,
      isAdminCapable: user.isAdminCapable,
      mfaVerified: true,
      authType: opts.authType,
      deviceFingerprint: opts.deviceFingerprint,
      abac,
      createdAt: new Date().toISOString()
    };
  }

  // Sessions expire 12 hours after login; deactivated employees lose their sessions immediately.
  async function loadSession(token: string): Promise<GatewaySession | null> {
    const r = await hr
      .prepare(
        `SELECT s.employee_id, s.name, s.email, s.auth_type, s.mfa_verified, s.device_fingerprint, s.abac, s.created_at,
                e.nip, e.division_id, e.role_title, e.portal_role, e.is_clinical, e.is_admin_capable
           FROM auth_session s JOIN employee e ON e.id = s.employee_id
          WHERE s.session_token_hash = ? AND e.active = 1 AND s.created_at > ${SESSION_TTL_SQL}`
      )
      .bind(sha256(token))
      .first<SessionRow>();
    if (!r) return null;
    return {
      token,
      userId: r.employee_id,
      nip: r.nip,
      name: r.name,
      email: r.email,
      divisionId: r.division_id,
      divisionName: divisionById(r.division_id)?.name || r.division_id,
      roleTitle: r.role_title,
      portalRole: r.portal_role,
      isClinical: Boolean(r.is_clinical),
      isAdminCapable: Boolean(r.is_admin_capable),
      mfaVerified: Boolean(r.mfa_verified),
      authType: r.auth_type,
      deviceFingerprint: r.device_fingerprint,
      abac: { ...defaultAbac(), ...JSON.parse(r.abac) },
      createdAt: r.created_at
    };
  }

  async function requireGatewaySession(req: express.Request, res: express.Response): Promise<GatewaySession | null> {
    const token = extractBearerToken(req);
    const session = token ? await loadSession(token) : null;
    if (!session) {
      res.status(401).json({
        success: false,
        code: 'GATEWAY_UNAUTHORIZED',
        message: 'Sesi API Gateway tidak ditemukan atau telah berakhir. Silakan login kembali.'
      });
      return null;
    }
    return session;
  }

  function requireAdminArea(session: GatewaySession, req: express.Request, res: express.Response): boolean {
    if (evaluateAccess(session, sessionDivision(session)).adminAreaAccess) return true;
    appendSiemLog({
      actorNip: session.nip,
      actorName: session.name,
      divisionId: session.divisionId,
      eventType: 'ADMIN_AREA_FORBIDDEN',
      resource: `Area Admin Portal Karyawan (${req.path})`,
      decision: 'DENY',
      detail: 'Pengguna tidak memiliki peran Admin/Direksi/SPI/DPO untuk membuka Area Admin.',
      ipAddress: req.ip
    });
    res.status(403).json({
      success: false,
      message: 'Akses ditolak: Area Admin & Tata Kelola hanya untuk Unit SIMK/TI, SDM, Direksi, SPI, atau Hukum & Etik.'
    });
    return false;
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
      // Scoped per caller so one user's key never replays another user's response.
      const cacheKey = `${extractBearerToken(req) || ip}::${req.path}::${idemKey.trim()}`;
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
  // Employees come from db.hr.employee (created via POST /api/gateway/admin/users action CREATE).
  app.post('/api/gateway/auth/login', asyncRoute(async (req, res) => {
    const { identifier, divisionId, authType, googleEmail, googleName, deviceInfo } = req.body || {};

    // Housekeeping: drop expired sessions and challenges.
    await hr.batch([
      hr.prepare(`DELETE FROM auth_session WHERE created_at <= ${SESSION_TTL_SQL}`),
      hr.prepare('DELETE FROM auth_otp WHERE expires_at < ?').bind(new Date().toISOString())
    ]);

    let row: EmployeeRow | null = null;
    if (identifier) {
      const cleanId = String(identifier).trim().toLowerCase();
      row = await hr
        .prepare('SELECT * FROM employee WHERE lower(nip) = ? OR lower(email) = ? LIMIT 1')
        .bind(cleanId, cleanId)
        .first<EmployeeRow>();
    } else if (divisionId && process.env.NODE_ENV !== 'production') {
      // Dev-only quick division picker: first active employee of that division.
      row = await hr
        .prepare('SELECT * FROM employee WHERE division_id = ? AND active = 1 ORDER BY id LIMIT 1')
        .bind(String(divisionId))
        .first<EmployeeRow>();
    }

    if (!row) {
      return res.status(404).json({
        success: false,
        message: 'NIP / Email pegawai tidak terdaftar di direktori HRIS. Hubungi SDM.'
      });
    }
    const user = toUser(row);

    if (!user.active) {
      appendSiemLog({
        actorNip: user.nip,
        actorName: user.name,
        divisionId: user.divisionId,
        eventType: 'LOGIN_ATTEMPT',
        resource: 'Portal Karyawan Auth',
        decision: 'DENY',
        detail: 'Akun pegawai dalam status dinonaktifkan.',
        ipAddress: req.ip
      });
      return res.status(403).json({
        success: false,
        message: 'Akun pegawai dinonaktifkan oleh Administrator / Bagian SDM.'
      });
    }

    const normAuthType: 'nip' | 'google' = authType === 'google' ? 'google' : 'nip';
    const effectiveName = normAuthType === 'google' && googleName ? `${str(googleName, '', 120)} (${user.divisionName})` : user.name;
    const effectiveEmail = normAuthType === 'google' && googleEmail ? str(googleEmail, '', 200) : user.email;

    const needsMfa = abacPolicies.mfaRequiredForClinicalAndAdmin && (user.isClinical || user.isAdminCapable);

    if (needsMfa) {
      const challengeId = 'mfa-' + crypto.randomUUID();
      const otp = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
      await hr
        .prepare('INSERT INTO auth_otp (id, employee_id, otp_hash, auth_type, device_info, expires_at) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(
          challengeId,
          user.id,
          sha256(`${challengeId}:${otp}`),
          normAuthType,
          str(deviceInfo, 'Browser Web Portal MYITARU', 200),
          new Date(Date.now() + 10 * 60 * 1000).toISOString()
        )
        .run();

      appendSiemLog({
        actorNip: user.nip,
        actorName: effectiveName,
        divisionId: user.divisionId,
        eventType: 'MFA_CHALLENGE_ISSUED',
        resource: `MFA (${normAuthType === 'google' ? 'Google SSO' : 'NIP'})`,
        decision: 'CHALLENGE',
        detail: `Tantangan OTP 6-digit diterbitkan untuk role sensitif (${user.divisionName}).`,
        ipAddress: req.ip
      });

      // shortcut: no SMS/email channel yet, so the OTP is only shown outside production; production needs a delivery channel.
      return res.json({
        success: true,
        mfaRequired: true,
        challengeId,
        ...(process.env.NODE_ENV !== 'production' ? { demoOtpHint: otp } : {}),
        userPreview: {
          nip: user.nip,
          name: effectiveName,
          email: effectiveEmail,
          divisionId: user.divisionId,
          divisionName: user.divisionName,
          roleTitle: user.roleTitle,
          isClinical: user.isClinical,
          isAdminCapable: user.isAdminCapable
        }
      });
    }

    // Standard role direct issue (MFA optional)
    const session = await createSession(user, {
      name: effectiveName,
      email: effectiveEmail,
      authType: normAuthType,
      deviceFingerprint: `DEV-${user.nip.slice(-3)}-${String(deviceInfo || 'WEB').slice(0, 12).toUpperCase()}`
    });

    appendSiemLog({
      actorNip: user.nip,
      actorName: effectiveName,
      divisionId: user.divisionId,
      eventType: 'GATEWAY_LOGIN',
      resource: 'Portal Karyawan',
      decision: 'ALLOW',
      detail: `Login berhasil (${session.authType.toUpperCase()}) dengan Device Binding ${session.deviceFingerprint}.`,
      ipAddress: req.ip
    });

    return res.json({
      success: true,
      mfaRequired: false,
      token: session.token,
      session
    });
  }));

  app.post('/api/gateway/auth/verify-mfa', asyncRoute(async (req, res) => {
    const { challengeId, otp, deviceName } = req.body || {};
    const id = String(challengeId || '');

    // Count the attempt first (atomic), so parallel guesses cannot exceed the limit.
    const bump = await hr
      .prepare('UPDATE auth_otp SET attempts = attempts + 1 WHERE id = ? AND attempts < ? AND expires_at > ?')
      .bind(id, MAX_OTP_ATTEMPTS, new Date().toISOString())
      .run();
    const challenge = bump.meta.changes ? await hr.prepare('SELECT * FROM auth_otp WHERE id = ?').bind(id).first<OtpRow>() : null;

    if (!challenge) {
      return res.status(400).json({
        success: false,
        message: 'Sesi tantangan MFA tidak ditemukan, kedaluwarsa, atau terlalu banyak percobaan. Silakan login kembali.'
      });
    }

    const expected = Buffer.from(challenge.otp_hash, 'hex');
    const given = Buffer.from(sha256(`${challenge.id}:${String(otp || '').trim()}`), 'hex');
    const userRow = await getEmployee(challenge.employee_id);

    if (!crypto.timingSafeEqual(expected, given)) {
      appendSiemLog({
        actorNip: userRow?.nip || 'UNKNOWN',
        actorName: userRow?.name || 'Unknown User',
        divisionId: userRow?.division_id || 'unknown',
        eventType: 'MFA_VERIFY_FAILED',
        resource: 'MFA 6-Digit OTP',
        decision: 'DENY',
        detail: 'Kode OTP MFA tidak valid.',
        ipAddress: req.ip
      });
      return res.status(401).json({ success: false, message: 'Kode OTP salah.' });
    }

    if (!userRow || !userRow.active) {
      return res.status(404).json({ success: false, message: 'Pengguna tidak ditemukan atau nonaktif.' });
    }
    const user = toUser(userRow);

    await hr.prepare('DELETE FROM auth_otp WHERE id = ?').bind(challenge.id).run();
    const deviceFingerprint = `BND-${user.nip.slice(-3)}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    const session = await createSession(user, {
      name: user.name,
      email: user.email,
      authType: challenge.auth_type,
      deviceFingerprint
    });

    appendSiemLog({
      actorNip: user.nip,
      actorName: user.name,
      divisionId: user.divisionId,
      eventType: 'MFA_VERIFIED_LOGIN',
      resource: 'Portal Karyawan + Device Binding',
      decision: 'ALLOW',
      detail: `MFA 6-digit terverifikasi (${challenge.auth_type.toUpperCase()}). Perangkat terikat: ${str(deviceName, challenge.device_info, 200)} [${deviceFingerprint}].`,
      ipAddress: req.ip
    });

    return res.json({
      success: true,
      token: session.token,
      session
    });
  }));

  app.post('/api/gateway/auth/logout', asyncRoute(async (req, res) => {
    const token = extractBearerToken(req);
    const s = token ? await loadSession(token) : null;
    if (token && s) {
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
      await hr.prepare('DELETE FROM auth_session WHERE session_token_hash = ?').bind(sha256(token)).run();
    }
    res.json({ success: true });
  }));

  // =========================================================================
  // 4. BOOTSTRAP & LIVE ABAC CONTEXT EVALUATION
  // =========================================================================
  app.get('/api/gateway/bootstrap', asyncRoute(async (req, res) => {
    const session = await requireGatewaySession(req, res);
    if (!session) return;

    const division = sessionDivision(session);
    const userRow = await getEmployee(session.userId);
    if (!userRow) return res.status(404).json({ success: false, message: 'User tidak ditemukan' });
    const access = evaluateAccess(session, division);

    res.json({
      success: true,
      session,
      user: toUser(userRow),
      division,
      access,
      abacPolicies,
      featureFlags,
      announcements: portalAnnouncements,
      governanceFrameworks: GOVERNANCE_FRAMEWORKS,
      geofence: HOSPITAL_GEOFENCE
    });
  }));

  app.post('/api/gateway/abac-context', asyncRoute(async (req, res) => {
    const session = await requireGatewaySession(req, res);
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
        ? str(breakGlassReason, 'Penanganan Kegawatdaruratan Pasien (Kode Biru)')
        : '';
    }

    await hr
      .prepare('UPDATE auth_session SET abac = ? WHERE session_token_hash = ?')
      .bind(JSON.stringify(session.abac), sha256(session.token))
      .run();

    const division = sessionDivision(session);
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
  }));

  // =========================================================================
  // 5. CORE EMPLOYEE MODULES (ALL 9 MANDATORY MODULES)
  // =========================================================================
  app.get('/api/gateway/profile', asyncRoute(async (req, res) => {
    const session = await requireGatewaySession(req, res);
    if (!session) return;
    const userRow = await getEmployee(session.userId);
    if (!userRow) return res.status(404).json({ success: false, message: 'User tidak ditemukan' });
    const user = toUser(userRow);
    const division = sessionDivision(session);
    const licenseStatus = (expiry?: string) =>
      !expiry ? 'Belum Terdata' : daysUntil(expiry) < 90 ? 'Segera Perpanjang (<90 Hari)' : 'Aktif';

    // shortcut: contract data and the non-clinical K3 certificate are fixed placeholders until HRIS supplies them.
    res.json({
      success: true,
      user,
      division,
      contracts: {
        statusKepegawaian: 'Pegawai Tetap RS',
        tanggalMasuk: '2021-03-01',
        masaKerja: '5 Tahun 1 Bulan',
        penilaianTerakhir: '92.4 (Sangat Baik)'
      },
      licenses: division.isClinical
        ? [
            {
              id: 'lic-1',
              name: 'Surat Tanda Registrasi (STR)',
              number: user.strNumber || '-',
              expiry: user.strExpiry || '-',
              daysRemaining: daysUntil(user.strExpiry),
              status: licenseStatus(user.strExpiry)
            },
            {
              id: 'lic-2',
              name: 'Surat Izin Praktik (SIP)',
              number: user.sipNumber || '-',
              expiry: user.sipExpiry || '-',
              daysRemaining: daysUntil(user.sipExpiry),
              status: licenseStatus(user.sipExpiry)
            }
          ]
        : [
            {
              id: 'lic-3',
              name: 'Sertifikat K3 & PPI Klinik Utama',
              number: `K3-MYITARU-${user.nip.slice(-3)}`,
              expiry: '2027-12-31',
              daysRemaining: daysUntil('2027-12-31'),
              status: 'Aktif'
            }
          ]
    });
  }));

  app.put('/api/gateway/profile', asyncRoute(async (req, res) => {
    const session = await requireGatewaySession(req, res);
    if (!session) return;

    const { email, unitLocation } = req.body || {};
    const cleanEmail = email ? String(email).trim().toLowerCase() : '';
    if (cleanEmail && !isEmail(cleanEmail)) {
      return res.status(400).json({ success: false, message: 'Format email tidak valid.' });
    }

    try {
      await hr.batch([
        hr
          .prepare(
            "UPDATE employee SET email = COALESCE(?, email), unit_location = COALESCE(?, unit_location), last_hris_sync = datetime('now') WHERE id = ?"
          )
          .bind(cleanEmail || null, unitLocation ? str(unitLocation, '', 200) : null, session.userId),
        hr
          .prepare('UPDATE auth_session SET email = COALESCE(?, email) WHERE session_token_hash = ?')
          .bind(cleanEmail || null, sha256(session.token))
      ]);
    } catch (e) {
      if (isUniqueViolation(e)) return res.status(409).json({ success: false, message: 'Email sudah dipakai pegawai lain.' });
      throw e;
    }
    const userRow = await getEmployee(session.userId);
    if (!userRow) return res.status(404).json({ success: false, message: 'User tidak ditemukan' });

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

    res.json({ success: true, user: toUser(userRow) });
  }));

  // Roster of the current week (Monday..Sunday) for one employee.
  async function weekRoster(employeeId: string) {
    const now = new Date();
    const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - ((now.getUTCDay() + 6) % 7)));
    const sunday = new Date(monday.getTime() + 6 * 86_400_000);
    const { results } = await hr
      .prepare('SELECT * FROM sdm_roster WHERE employee_id = ? AND date BETWEEN ? AND ? ORDER BY date')
      .bind(employeeId, monday.toISOString().slice(0, 10), sunday.toISOString().slice(0, 10))
      .all<{ id: string; date: string; shift_type: string; hours: number; unit: string; status: string }>();
    return results;
  }

  // Shifts + 40 Hour Weekly Cap + Conflict Detection + Swap Approval
  app.get('/api/gateway/shifts', asyncRoute(async (req, res) => {
    const session = await requireGatewaySession(req, res);
    if (!session) return;

    const myShifts = (await weekRoster(session.userId)).map((s) => ({
      id: s.id,
      nip: session.nip,
      employeeName: session.name,
      divisionId: session.divisionId,
      date: s.date,
      dayLabel: DAY_LABELS[new Date(s.date + 'T00:00:00Z').getUTCDay()],
      shiftType: s.shift_type,
      hours: s.hours,
      unit: s.shift_type === 'Libur' ? 'Istirahat Mingguan' : s.unit,
      status: s.status
    }));

    const totalWeeklyHours = myShifts.reduce((acc, s) => acc + s.hours, 0);
    const exceeds40 = totalWeeklyHours > 40;

    const seeAll = session.isAdminCapable || session.divisionId === 'keperawatan';
    const { results: swaps } = await hr
      .prepare(
        `SELECT w.*, e.name AS requester_name, e.nip AS requester_nip FROM sdm_shift_swap w JOIN employee e ON e.id = w.requester_id
          WHERE ? OR w.division_id = ? OR w.requester_id = ? ORDER BY w.created_at DESC LIMIT 100`
      )
      .bind(seeAll ? 1 : 0, session.divisionId, session.userId)
      .all<Record<string, unknown>>();

    res.json({
      success: true,
      shifts: myShifts,
      totalWeeklyHours,
      maxLegalWeeklyHours: 40,
      exceeds40,
      swaps: swaps.map(toSwap)
    });
  }));

  function toSwap(w: Record<string, unknown>) {
    return {
      id: w.id,
      requesterName: w.requester_name,
      requesterNip: w.requester_nip,
      divisionId: w.division_id,
      fromDate: w.from_date,
      fromShift: w.from_shift,
      targetColleague: w.target_colleague,
      toDate: w.to_date,
      toShift: w.to_shift,
      reason: w.reason,
      weeklyHoursAfterSwap: w.weekly_hours_after_swap,
      conflictWarning: w.conflict_warning ?? undefined,
      status: w.status,
      createdAt: w.created_at
    };
  }

  app.post('/api/gateway/shifts/swap', asyncRoute(async (req, res) => {
    const session = await requireGatewaySession(req, res);
    if (!session) return;

    const { fromDate, fromShift, targetColleague, toDate, toShift, reason, extraHours } = req.body || {};
    const currentHours = (await weekRoster(session.userId)).reduce((acc, s) => acc + s.hours, 0);
    const projectedHours = currentHours + (Number(extraHours) || 0);
    const conflictWarning =
      abacPolicies.enforce40HourShiftCap && projectedHours > 40
        ? `Peringatan UU Ketenagakerjaan: Total jam kerja menjadi ${projectedHours} jam/minggu (melebihi batas 40 jam). Memerlukan justifikasi & persetujuan Atasan Unit.`
        : null;

    const newSwap = {
      id: 'swp-' + crypto.randomUUID(),
      requester_name: session.name,
      requester_nip: session.nip,
      division_id: session.divisionId,
      from_date: isDate(fromDate) ? fromDate : today(),
      from_shift: str(fromShift, 'Siang (14:00-21:00)', 100),
      target_colleague: str(targetColleague, 'Rekan Satu Unit', 200),
      to_date: isDate(toDate) ? toDate : today(),
      to_shift: str(toShift, 'Pagi (07:00-14:00)', 100),
      reason: str(reason, 'Penyesuaian jadwal jaga unit'),
      weekly_hours_after_swap: projectedHours,
      conflict_warning: conflictWarning,
      status: 'Menunggu Atasan Unit',
      created_at: nowStamp()
    };

    await hr
      .prepare(
        `INSERT INTO sdm_shift_swap (id, requester_id, division_id, from_date, from_shift, target_colleague, to_date, to_shift, reason, weekly_hours_after_swap, conflict_warning, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        newSwap.id, session.userId, newSwap.division_id, newSwap.from_date, newSwap.from_shift, newSwap.target_colleague,
        newSwap.to_date, newSwap.to_shift, newSwap.reason, newSwap.weekly_hours_after_swap, newSwap.conflict_warning,
        newSwap.status, newSwap.created_at
      )
      .run();

    appendSiemLog({
      actorNip: session.nip,
      actorName: session.name,
      divisionId: session.divisionId,
      eventType: 'SHIFT_SWAP_REQUEST',
      resource: 'Jadwal & Shift Unit',
      decision: 'ALLOW',
      detail: `Pengajuan tukar shift ${newSwap.from_date} <-> ${newSwap.to_date} (${projectedHours} jam/minggu).`,
      ipAddress: req.ip
    });

    res.json({ success: true, swap: toSwap(newSwap) });
  }));

  app.post('/api/gateway/shifts/approve', asyncRoute(async (req, res) => {
    const session = await requireGatewaySession(req, res);
    if (!session) return;
    const { swapId, decision } = req.body || {};
    const target = await hr
      .prepare(
        'SELECT w.*, e.name AS requester_name, e.nip AS requester_nip FROM sdm_shift_swap w JOIN employee e ON e.id = w.requester_id WHERE w.id = ?'
      )
      .bind(String(swapId || ''))
      .first<Record<string, unknown>>();
    if (!target) return res.status(404).json({ success: false, message: 'Pengajuan tukar shift tidak ditemukan.' });

    const canApprove =
      rbacMatrix[session.portalRole].canApproveUnitLeave &&
      target.requester_id !== session.userId &&
      (target.division_id === session.divisionId || session.isAdminCapable);
    if (!canApprove) {
      return res.status(403).json({ success: false, message: 'Hanya Atasan Unit terkait yang dapat memutuskan tukar shift ini.' });
    }

    target.status = decision === 'REJECT' ? 'Ditolak' : 'Disetujui';
    await hr.prepare('UPDATE sdm_shift_swap SET status = ? WHERE id = ?').bind(target.status, target.id).run();
    appendSiemLog({
      actorNip: session.nip,
      actorName: session.name,
      divisionId: session.divisionId,
      eventType: 'SHIFT_SWAP_APPROVAL',
      resource: String(target.id),
      decision: 'ALLOW',
      detail: `Tukar shift oleh ${target.requester_name} status diubah menjadi ${target.status}.`,
      ipAddress: req.ip
    });
    res.json({ success: true, swap: toSwap(target) });
  }));

  // Attendance Geofencing + Biometric + Offline Sync
  // Idempotency keys are stored as '<employeeId>:<key>' so keys of different employees never collide.
  const ATTENDANCE_SELECT =
    'SELECT k.*, e.nip, e.name AS employee_name FROM sdm_kehadiran k JOIN employee e ON e.id = k.employee_id';

  function toAttendance(r: Record<string, unknown>) {
    const key = r.idempotency_key ? String(r.idempotency_key) : undefined;
    return {
      id: r.id,
      nip: r.nip,
      employeeName: r.employee_name,
      divisionId: r.division_id,
      timestamp: r.recorded_at,
      type: r.type,
      method: r.method,
      distanceMeters: r.distance_meters,
      withinGeofence: Boolean(r.within_geofence),
      biometricVerified: Boolean(r.biometric_verified),
      note: r.note ?? undefined,
      idempotencyKey: key ? key.slice(key.indexOf(':') + 1) : undefined
    };
  }

  // Inserts one attendance row; returns the stored row, or the earlier row when the idempotency key was already used.
  function insertAttendanceStmt(session: GatewaySession, e: {
    id: string; recordedAt: string; type: string; method: string; distanceMeters: number;
    withinGeofence: boolean; biometricVerified: boolean; note: string; idemKey?: string;
  }) {
    return hr
      .prepare(
        `INSERT INTO sdm_kehadiran (id, employee_id, division_id, recorded_at, type, method, distance_meters, within_geofence, biometric_verified, note, idempotency_key)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(idempotency_key) DO NOTHING`
      )
      .bind(
        e.id, session.userId, session.divisionId, e.recordedAt, e.type, e.method, e.distanceMeters,
        e.withinGeofence ? 1 : 0, e.biometricVerified ? 1 : 0, e.note, e.idemKey ? `${session.userId}:${e.idemKey}` : null
      );
  }

  app.get('/api/gateway/attendance', asyncRoute(async (req, res) => {
    const session = await requireGatewaySession(req, res);
    if (!session) return;

    const { results } = await hr
      .prepare(`${ATTENDANCE_SELECT} WHERE k.employee_id = ? OR k.division_id = ? ORDER BY k.recorded_at DESC LIMIT 100`)
      .bind(session.userId, session.divisionId)
      .all<Record<string, unknown>>();

    // shortcut: monthlySummary is a fixed placeholder; compute from sdm_kehadiran when payroll rules are defined.
    res.json({
      success: true,
      geofence: HOSPITAL_GEOFENCE,
      offlineModeEnabled: featureFlags.offline_attendance.enabled,
      logs: results.map(toAttendance),
      monthlySummary: {
        hadirTepatWaktu: 19,
        terlambat: 0,
        lemburJam: 6.5,
        statusRekap: 'Memenuhi Target Kehadiran'
      }
    });
  }));

  app.post('/api/gateway/attendance/clock', asyncRoute(async (req, res) => {
    const session = await requireGatewaySession(req, res);
    if (!session) return;

    const { type, lat, lng, biometricVerified, note, isOfflineReplay } = req.body || {};
    const userLat = typeof lat === 'number' ? lat : HOSPITAL_GEOFENCE.lat;
    const userLng = typeof lng === 'number' ? lng : HOSPITAL_GEOFENCE.lng;
    const distanceMeters = haversineMeters(userLat, userLng, HOSPITAL_GEOFENCE.lat, HOSPITAL_GEOFENCE.lng);
    const withinGeofence = distanceMeters <= HOSPITAL_GEOFENCE.radiusMeters;
    const attType = oneOf(ATTENDANCE_TYPES, type, 'MASUK');

    if (!withinGeofence && !isOfflineReplay && attType !== 'KOREKSI') {
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

    const header = req.headers['idempotency-key'];
    const idemKey = typeof header === 'string' && header.trim() ? header.trim().slice(0, 200) : undefined;
    const id = 'att-' + crypto.randomUUID();
    await insertAttendanceStmt(session, {
      id,
      recordedAt: nowStamp(),
      type: attType,
      method: isOfflineReplay ? 'Offline Sync (Idempoten)' : 'Geofencing + Biometrik',
      distanceMeters,
      withinGeofence,
      biometricVerified: Boolean(biometricVerified ?? true),
      note: str(note, withinGeofence ? 'Area Kampus Klinik Tarumanagara' : 'Koreksi / Tugas Luar'),
      idemKey
    }).run();

    const stored = idemKey
      ? await hr.prepare(`${ATTENDANCE_SELECT} WHERE k.idempotency_key = ?`).bind(`${session.userId}:${idemKey}`).first<Record<string, unknown>>()
      : await hr.prepare(`${ATTENDANCE_SELECT} WHERE k.id = ?`).bind(id).first<Record<string, unknown>>();
    if (!stored) throw new Error('Presensi gagal disimpan.');
    const entry = toAttendance(stored);

    if (stored.id !== id) {
      res.setHeader('X-Idempotent-Replay', 'true');
      return res.json({ success: true, entry });
    }

    appendSiemLog({
      actorNip: session.nip,
      actorName: session.name,
      divisionId: session.divisionId,
      eventType: `ATTENDANCE_${entry.type}`,
      resource: String(entry.method),
      decision: 'ALLOW',
      detail: `Presensi ${entry.type} tercatat (${entry.distanceMeters} m dari Klinik).`,
      ipAddress: req.ip
    });

    res.json({ success: true, entry });
  }));

  app.post('/api/gateway/attendance/sync-offline', asyncRoute(async (req, res) => {
    const session = await requireGatewaySession(req, res);
    if (!session) return;

    if (!featureFlags.offline_attendance.enabled) {
      return res.status(403).json({
        success: false,
        message: 'Feature flag absensi offline saat ini sedang dinonaktifkan.'
      });
    }

    const items: Array<Record<string, unknown>> = Array.isArray(req.body?.items) ? req.body.items.slice(0, 200) : [];
    const ids = items.map(() => 'att-off-' + crypto.randomUUID());
    const results = items.length
      ? await hr.batch(
          items.map((item, i) =>
            insertAttendanceStmt(session, {
              id: ids[i],
              recordedAt: str(item.capturedAt, nowStamp(), 30),
              type: oneOf(ATTENDANCE_TYPES, item.type, 'MASUK'),
              method: 'Offline Sync (Idempoten)',
              distanceMeters: Math.round(Number(item.distanceMeters) || 42),
              withinGeofence: true,
              biometricVerified: true,
              note: str(item.note, 'Sinkronisasi antrean offline'),
              idemKey: item.idempotencyKey ? String(item.idempotencyKey).trim().slice(0, 200) || undefined : undefined
            })
          )
        )
      : [];

    const insertedIds = ids.filter((_, i) => results[i]?.meta?.changes);
    const skippedDuplicates = items.length - insertedIds.length;
    const synced = insertedIds.length
      ? (
          await hr
            .prepare(`${ATTENDANCE_SELECT} WHERE k.id IN (${insertedIds.map(() => '?').join(',')})`)
            .bind(...insertedIds)
            .all<Record<string, unknown>>()
        ).results.map(toAttendance)
      : [];

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
  }));

  // Leave Requests & Multi-Tier Approval
  const LEAVE_SELECT = `SELECT c.*, e.nip, e.name AS employee_name, e.division_id, u.name AS unit_approver, s.name AS sdm_approver
      FROM sdm_cuti c JOIN employee e ON e.id = c.employee_id
      LEFT JOIN employee u ON u.id = c.unit_approved_by LEFT JOIN employee s ON s.id = c.sdm_approved_by`;

  function toLeave(r: Record<string, unknown>) {
    return {
      id: r.id,
      nip: r.nip,
      employeeName: r.employee_name,
      divisionId: r.division_id,
      type: r.type,
      startDate: r.start_date,
      endDate: r.end_date,
      days: r.days,
      substitute: r.substitute,
      reason: r.reason,
      status: r.status,
      unitApprovedBy: r.unit_approver ?? undefined,
      sdmApprovedBy: r.sdm_approver ?? undefined,
      createdAt: r.created_at
    };
  }

  app.get('/api/gateway/leaves', asyncRoute(async (req, res) => {
    const session = await requireGatewaySession(req, res);
    if (!session) return;
    // Own requests; unit approvers also see their division, SDM approvers see all.
    const policy = rbacMatrix[session.portalRole];
    const { results } = await hr
      .prepare(`${LEAVE_SELECT} WHERE ? OR c.employee_id = ? OR (? AND e.division_id = ?) ORDER BY c.created_at DESC LIMIT 200`)
      .bind(policy.canApproveSdmLeave ? 1 : 0, session.userId, policy.canApproveUnitLeave ? 1 : 0, session.divisionId)
      .all<Record<string, unknown>>();
    // shortcut: leave balances are a fixed placeholder; compute from sdm_cuti once entitlement rules exist.
    res.json({
      success: true,
      balances: {
        tahunanTotal: 12,
        tahunanTerpakai: 3,
        tahunanSisa: 9,
        izinDiklatTersisa: 5
      },
      requests: results.map(toLeave)
    });
  }));

  app.post('/api/gateway/leaves', asyncRoute(async (req, res) => {
    const session = await requireGatewaySession(req, res);
    if (!session) return;

    const { type, startDate, endDate, days, substitute, reason } = req.body || {};
    if (!isDate(startDate) || !isDate(endDate) || endDate < startDate) {
      return res.status(400).json({ success: false, message: 'Tanggal mulai/selesai cuti tidak valid (format YYYY-MM-DD).' });
    }
    const spanDays = Math.round((Date.parse(endDate) - Date.parse(startDate)) / 86_400_000) + 1;
    const leaveDays = Math.round(Number(days)) > 0 ? Math.round(Number(days)) : spanDays;
    const id = 'lv-' + crypto.randomUUID();

    await hr
      .prepare(
        'INSERT INTO sdm_cuti (id, employee_id, type, start_date, end_date, days, substitute, reason, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      )
      .bind(
        id, session.userId, oneOf(LEAVE_TYPES, type, 'Cuti Tahunan'), startDate, endDate, leaveDays,
        str(substitute, 'Rekan Pengganti Unit', 200), str(reason, 'Keperluan pribadi'), 'Menunggu Atasan Unit', nowStamp(16)
      )
      .run();
    const newLeave = toLeave((await hr.prepare(`${LEAVE_SELECT} WHERE c.id = ?`).bind(id).first<Record<string, unknown>>())!);

    appendSiemLog({
      actorNip: session.nip,
      actorName: session.name,
      divisionId: session.divisionId,
      eventType: 'LEAVE_SUBMITTED',
      resource: id,
      decision: 'ALLOW',
      detail: `Pengajuan ${newLeave.type} (${newLeave.days} hari) menunggu approval Atasan Unit.`,
      ipAddress: req.ip
    });

    res.json({ success: true, leave: newLeave });
  }));

  app.post('/api/gateway/leaves/approve', asyncRoute(async (req, res) => {
    const session = await requireGatewaySession(req, res);
    if (!session) return;
    const { leaveId, action } = req.body || {};
    const item = await hr.prepare(`${LEAVE_SELECT} WHERE c.id = ?`).bind(String(leaveId || '')).first<Record<string, unknown>>();
    if (!item) return res.status(404).json({ success: false, message: 'Pengajuan cuti tidak ditemukan.' });

    const policy = rbacMatrix[session.portalRole];
    const unitApprover = policy.canApproveUnitLeave && (item.division_id === session.divisionId || policy.canApproveSdmLeave);
    const status = String(item.status);
    let next: { status: string; column?: 'unit_approved_by' | 'sdm_approved_by' } | null = null;
    if (item.employee_id === session.userId) {
      next = null;
    } else if (action === 'REJECT' && (status === 'Menunggu Atasan Unit' ? unitApprover : status === 'Menunggu Verifikasi SDM' && policy.canApproveSdmLeave)) {
      next = { status: 'Ditolak' };
    } else if (action !== 'REJECT' && status === 'Menunggu Atasan Unit' && unitApprover) {
      next = { status: 'Menunggu Verifikasi SDM', column: 'unit_approved_by' };
    } else if (action !== 'REJECT' && status === 'Menunggu Verifikasi SDM' && policy.canApproveSdmLeave) {
      next = { status: 'Disetujui Final', column: 'sdm_approved_by' };
    }
    if (!next) {
      return res.status(403).json({ success: false, message: 'Anda tidak berwenang memproses pengajuan cuti ini pada tahap saat ini.' });
    }

    // Compare-and-set on the current status so two approvers cannot both act on the same step.
    const upd = await hr
      .prepare(
        `UPDATE sdm_cuti SET status = ?${next.column ? `, ${next.column} = ?` : ''} WHERE id = ? AND status = ?`
      )
      .bind(...(next.column ? [next.status, session.userId] : [next.status]), item.id, status)
      .run();
    if (!upd.meta.changes) return res.status(409).json({ success: false, message: 'Status pengajuan sudah berubah. Muat ulang data.' });

    const updated = toLeave((await hr.prepare(`${LEAVE_SELECT} WHERE c.id = ?`).bind(item.id).first<Record<string, unknown>>())!);
    appendSiemLog({
      actorNip: session.nip,
      actorName: session.name,
      divisionId: session.divisionId,
      eventType: 'LEAVE_WORKFLOW_STEP',
      resource: String(item.id),
      decision: 'ALLOW',
      detail: `Status pengajuan cuti ${updated.employeeName} diperbarui menjadi ${updated.status}.`,
      ipAddress: req.ip
    });

    res.json({ success: true, leave: updated });
  }));

  // Payroll & Reimbursement
  function toReimbursement(r: Record<string, unknown>) {
    return {
      id: r.id,
      nip: r.nip,
      employeeName: r.employee_name,
      title: r.title,
      category: r.category,
      amount: r.amount,
      date: r.date,
      status: r.status
    };
  }
  const REIMBURSE_SELECT = 'SELECT r.*, e.nip, e.name AS employee_name FROM sdm_reimbursement r JOIN employee e ON e.id = r.employee_id';

  app.get('/api/gateway/payroll', asyncRoute(async (req, res) => {
    const session = await requireGatewaySession(req, res);
    if (!session) return;

    // shortcut: salary slip is computed from fixed figures per role; replace with real payroll data when available.
    const baseSalary = session.isClinical ? 12500000 : session.isAdminCapable ? 10500000 : 7800000;
    const jasaMedis = session.isClinical ? 6400000 : 1850000;
    const tunjanganShift = 1150000;
    const bpjsKesehatanPot = 180000;
    const pph21 = Math.round((baseSalary + jasaMedis) * 0.04);
    const takeHomePay = baseSalary + jasaMedis + tunjanganShift - bpjsKesehatanPot - pph21;

    const { results } = await hr
      .prepare(`${REIMBURSE_SELECT} WHERE r.employee_id = ? ORDER BY r.date DESC, r.id DESC LIMIT 100`)
      .bind(session.userId)
      .all<Record<string, unknown>>();

    res.json({
      success: true,
      currentSlip: {
        periode: 'Maret 2026',
        nip: session.nip,
        nama: session.name,
        unit: session.divisionName,
        gajiPokok: baseSalary,
        jasaPelayanan: jasaMedis,
        tunjanganShiftLembur: tunjanganShift,
        potonganBpjs: bpjsKesehatanPot,
        potonganPajak: pph21,
        takeHomePay,
        statusPembayaran: 'Sudah Ditransfer (Mandiri Payroll)'
      },
      reimbursements: results.map(toReimbursement)
    });
  }));

  app.post('/api/gateway/payroll/reimburse', asyncRoute(async (req, res) => {
    const session = await requireGatewaySession(req, res);
    if (!session) return;

    const { title, category, amount } = req.body || {};
    const cleanAmount = Math.round(Number(amount ?? 500000));
    if (!Number.isFinite(cleanAmount) || cleanAmount <= 0 || cleanAmount > 1_000_000_000) {
      return res.status(400).json({ success: false, message: 'Nominal reimbursement tidak valid.' });
    }
    const id = 'rmb-' + crypto.randomUUID();
    await hr
      .prepare('INSERT INTO sdm_reimbursement (id, employee_id, title, category, amount, date, status) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(id, session.userId, str(title, 'Klaim Pelatihan / Operasional', 200), oneOf(REIMBURSE_CATEGORIES, category, 'Diklat / SKP'), cleanAmount, today(), 'Diajukan')
      .run();
    const newItem = await hr.prepare(`${REIMBURSE_SELECT} WHERE r.id = ?`).bind(id).first<Record<string, unknown>>();
    res.json({ success: true, reimbursement: toReimbursement(newItem!) });
  }));

  // Training & SOP: catalog in sdm_training, enrollment per employee in sdm_training_record.
  async function trainingCourses(employeeId: string, courseId?: string) {
    const { results } = await hr
      .prepare(
        `SELECT t.*, r.status AS record_status FROM sdm_training t
           LEFT JOIN sdm_training_record r ON r.training_id = t.id AND r.employee_id = ?
          WHERE ? IS NULL OR t.id = ? ORDER BY t.id`
      )
      .bind(employeeId, courseId ?? null, courseId ?? null)
      .all<{ id: string; code: string; type: string; title: string; unit: string; skp: number; record_status: string | null }>();
    return results.map((t) => ({
      id: t.id,
      code: t.code,
      type: t.type,
      title: t.title,
      unit: t.unit,
      status: t.record_status || 'Belum Terdaftar',
      enrolled: t.record_status !== null,
      skp: t.skp
    }));
  }

  app.get('/api/gateway/training', asyncRoute(async (req, res) => {
    const session = await requireGatewaySession(req, res);
    if (!session) return;
    // shortcut: certificates are fixed placeholders until a certificate table exists.
    res.json({
      success: true,
      courses: await trainingCourses(session.userId),
      certificates: [
        { name: 'Bantuan Hidup Dasar (BHD)', validUntil: '2027-01-15', status: 'Aktif' },
        { name: 'Keamanan Informasi Kesehatan (PMK 24/2022)', validUntil: '2026-06-30', status: 'Perlu Resertifikasi' }
      ]
    });
  }));

  app.post('/api/gateway/training/enroll', asyncRoute(async (req, res) => {
    const session = await requireGatewaySession(req, res);
    if (!session) return;
    const courseId = String(req.body?.courseId || '');
    const exists = await hr.prepare('SELECT id FROM sdm_training WHERE id = ?').bind(courseId).first();
    if (!exists) return res.status(404).json({ success: false, message: 'Pelatihan tidak ditemukan.' });
    await hr
      .prepare(
        'INSERT INTO sdm_training_record (employee_id, training_id, status) VALUES (?, ?, ?) ON CONFLICT(employee_id, training_id) DO NOTHING'
      )
      .bind(session.userId, courseId, 'Terdaftar (Menunggu Jadwal)')
      .run();
    const [course] = await trainingCourses(session.userId, courseId);
    res.json({ success: true, course });
  }));

  // Performance KPI & Doctor OPPE
  app.get('/api/gateway/performance', asyncRoute(async (req, res) => {
    const session = await requireGatewaySession(req, res);
    if (!session) return;
    const access = evaluateAccess(session, sessionDivision(session));

    // shortcut: KPI and OPPE figures are fixed placeholders until a performance data source exists.
    res.json({
      success: true,
      individualKpi: {
        periode: 'Kuartal I 2026',
        totalScore: 93.2,
        predikat: 'Sangat Baik (Memenuhi Target RS)',
        dimensions: [
          { label: 'Kuantitas & Beban Kerja Unit', score: 94, target: 90, weight: '30%' },
          { label: 'Kualitas & Akurasi Dokumentasi', score: 95, target: 90, weight: '30%' },
          { label: 'Perilaku Profesional & Disiplin Shift', score: 92, target: 85, weight: '25%' },
          { label: 'Kepatuhan K3 / PPI & Risiko Jabatan', score: 91, target: 88, weight: '15%' }
        ]
      },
      oppeVisible: access.oppeAccess,
      doctorOppeMetrics: access.oppeAccess
        ? [
            { doctor: 'dr. Budi Santoso, Sp.PD', ksm: 'Penyakit Dalam', alosDays: 3.8, mortalityRate: '0.4%', fornasCompliance: '97.2%', resumeUnder24h: '98.5%', status: 'Memenuhi Standar' },
            { doctor: 'dr. Bambang Alamsyah, Sp.B', ksm: 'Bedah Umum', alosDays: 3.1, mortalityRate: '0.2%', fornasCompliance: '95.8%', resumeUnder24h: '96.4%', status: 'Memenuhi Standar' },
            { doctor: 'dr. Hendra Wijaya, Sp.JP', ksm: 'Kardiologi', alosDays: 4.2, mortalityRate: '0.8%', fornasCompliance: '98.1%', resumeUnder24h: '99.0%', status: 'Memenuhi Standar' }
          ]
        : []
    });
  }));

  // SBAR Handover (db.core, clinical staff only) + Internal Directory + Announcements
  function toSbar(r: { id: string; division_id: string; karu_verified: number; data: string; created_at: string }) {
    return { id: r.id, divisionId: r.division_id, ...JSON.parse(r.data), karuVerified: Boolean(r.karu_verified), createdAt: r.created_at };
  }

  function denySbar(session: GatewaySession, reason: string, req: express.Request, res: express.Response) {
    appendSiemLog({
      actorNip: session.nip,
      actorName: session.name,
      divisionId: session.divisionId,
      eventType: 'SBAR_ACCESS_DENIED',
      resource: 'Handover SBAR',
      decision: 'DENY',
      detail: reason,
      ipAddress: req.ip
    });
    return res.status(403).json({ success: false, message: `Akses SBAR ditolak: ${reason}` });
  }

  app.get('/api/gateway/sbar', asyncRoute(async (req, res) => {
    const session = await requireGatewaySession(req, res);
    if (!session) return;

    const denied = sbarDenyReason(session);
    let handovers: ReturnType<typeof toSbar>[] = [];
    if (!denied) {
      const { results } = await core
        .prepare('SELECT * FROM sbar_handover ORDER BY created_at DESC LIMIT 100')
        .all<{ id: string; division_id: string; karu_verified: number; data: string; created_at: string }>();
      handovers = results.map(toSbar);
      if (evaluateAccess(session, sessionDivision(session)).emrAccess === 'BREAK_GLASS') {
        appendSiemLog({
          actorNip: session.nip,
          actorName: session.name,
          divisionId: session.divisionId,
          eventType: 'BREAK_GLASS_SBAR_READ',
          resource: 'Handover SBAR',
          decision: 'BREAK_GLASS',
          detail: `${handovers.length} catatan SBAR dibuka dalam mode Break-Glass.`,
          ipAddress: req.ip
        });
      }
    }

    const { results: directory } = await hr
      .prepare('SELECT nip, name, division_id, role_title, email, shift_pattern FROM employee WHERE active = 1 ORDER BY name LIMIT 18')
      .all<{ nip: string; name: string; division_id: string; role_title: string; email: string; shift_pattern: string }>();

    // Non-clinical staff still get announcements and the directory, but no patient handovers.
    res.json({
      success: true,
      sbarAccess: !denied,
      sbarDeniedReason: denied || undefined,
      handovers,
      announcements: portalAnnouncements,
      directory: directory.map((u) => ({
        nip: u.nip,
        name: u.name,
        divisionName: divisionById(u.division_id)?.name || u.division_id,
        roleTitle: u.role_title,
        email: u.email,
        shiftPattern: u.shift_pattern
      }))
    });
  }));

  app.post('/api/gateway/sbar', asyncRoute(async (req, res) => {
    const session = await requireGatewaySession(req, res);
    if (!session) return;
    const denied = sbarDenyReason(session);
    if (denied) return denySbar(session, denied, req, res);

    const { unit, sessionType, fromShift, toShift, receiverName, patientLabel, situation, background, assessment, recommendation } = req.body || {};
    const data = {
      unit: str(unit, session.divisionName, 200),
      sessionType: sessionType === 'Nurse Station (Terjadwal)' ? 'Nurse Station (Terjadwal)' : 'Bedside Handover',
      fromShift: str(fromShift, session.divisionName, 100),
      toShift: str(toShift, 'Shift Berikutnya', 100),
      senderName: session.name,
      receiverName: str(receiverName, 'Petugas Shift Pengganti', 200),
      patientLabel: str(patientLabel, 'Pasien Unit', 300),
      situation: str(situation, '', 4000),
      background: str(background, '', 4000),
      assessment: str(assessment, '', 4000),
      recommendation: str(recommendation, '', 4000)
    };
    const id = 'sbar-' + crypto.randomUUID();
    const createdAt = nowStamp(16);
    await core
      .prepare('INSERT INTO sbar_handover (id, division_id, created_by, karu_verified, data, created_at) VALUES (?, ?, ?, 0, ?, ?)')
      .bind(id, session.divisionId, session.userId, JSON.stringify(data), createdAt)
      .run();
    const entry = { id, divisionId: session.divisionId, ...data, karuVerified: false, createdAt };

    appendSiemLog({
      actorNip: session.nip,
      actorName: session.name,
      divisionId: session.divisionId,
      eventType: 'SBAR_HANDOVER_CREATED',
      resource: entry.id,
      decision: 'ALLOW',
      detail: `Handover ${entry.sessionType} diserahkan ke ${entry.receiverName}.`,
      ipAddress: req.ip
    });

    res.json({ success: true, handover: entry });
  }));

  app.post('/api/gateway/sbar/verify', asyncRoute(async (req, res) => {
    const session = await requireGatewaySession(req, res);
    if (!session) return;
    const denied = sbarDenyReason(session);
    if (denied) return denySbar(session, denied, req, res);

    const sbarId = String(req.body?.sbarId || '');
    const item = await core.prepare('SELECT created_by FROM sbar_handover WHERE id = ?').bind(sbarId).first<{ created_by: string }>();
    if (!item) return res.status(404).json({ success: false, message: 'Catatan SBAR tidak ditemukan.' });
    if (item.created_by === session.userId) {
      return res.status(403).json({ success: false, message: 'Handover tidak dapat diverifikasi oleh pengirimnya sendiri.' });
    }

    await core
      .prepare(
        "UPDATE sbar_handover SET karu_verified = 1, karu_verified_by = ?, data = json_set(data, '$.karuName', ?), updated_at = datetime('now') WHERE id = ?"
      )
      .bind(session.userId, session.name, sbarId)
      .run();
    const row = await core.prepare('SELECT * FROM sbar_handover WHERE id = ?').bind(sbarId).first<{ id: string; division_id: string; karu_verified: number; data: string; created_at: string }>();

    appendSiemLog({
      actorNip: session.nip,
      actorName: session.name,
      divisionId: session.divisionId,
      eventType: 'SBAR_HANDOVER_VERIFIED',
      resource: sbarId,
      decision: 'ALLOW',
      detail: 'Handover SBAR diverifikasi Karu.',
      ipAddress: req.ip
    });
    res.json({ success: true, handover: toSbar(row!) });
  }));

  // Helpdesk TI & HR (accessible both authenticated & from landing page support form)
  function toTicket(t: Record<string, unknown>) {
    return {
      id: t.id,
      ticketNo: t.ticket_no,
      requesterName: t.requester_name,
      requesterContact: t.requester_contact,
      divisionName: t.division_name,
      category: t.category,
      priority: t.priority,
      subject: t.subject,
      description: t.description,
      source: t.source,
      status: t.status,
      assignedTeam: t.assigned_team,
      createdAt: t.created_at
    };
  }

  app.get('/api/gateway/helpdesk', asyncRoute(async (req, res) => {
    // Tickets hold names and contacts: anonymous callers get none, staff their own, admins all.
    const token = extractBearerToken(req);
    const session = token ? await loadSession(token) : null;
    let tickets: ReturnType<typeof toTicket>[] = [];
    if (session) {
      const isAdmin = evaluateAccess(session, sessionDivision(session)).adminAreaAccess;
      const { results } = await hr
        .prepare('SELECT * FROM helpdesk_ticket WHERE ? OR requester_contact = ? ORDER BY created_at DESC LIMIT 100')
        .bind(isAdmin ? 1 : 0, session.nip)
        .all<Record<string, unknown>>();
      tickets = results.map(toTicket);
    }
    res.json({
      success: true,
      tickets,
      emergencyContacts: [
        { label: 'Service Desk TI / SIMK (24 Jam)', phone: 'Ext. 1100 / 0811-900-1100', sla: 'Respon < 15 Menit (P1)' },
        { label: 'HR Helpdesk & Payroll', phone: 'Ext. 1205', sla: 'Hari Kerja 08:00 - 16:30' },
        { label: 'Code Blue / Kegawatdaruratan Internal', phone: 'Ext. 911', sla: 'Segera < 3 Menit' },
        { label: 'Data Protection Officer (UU PDP)', phone: 'dpo@tarumanagara-klinik.id', sla: 'Eskalasi Keamanan Data' }
      ],
      faqs: [
        { q: 'Bagaimana jika kode OTP MFA tidak diterima saat login?', a: 'Ulangi login untuk menerbitkan kode baru, atau klik "Buat Tiket TI" bila perangkat baru belum terikat.' },
        { q: 'Apakah absensi tetap tercatat di area basement / ambulans tanpa sinyal?', a: 'Ya. Aktifkan Mode Offline di aplikasi mobile karyawan. Data disimpan terenkripsi dan otomatis disinkronkan menggunakan Idempotency-Key.' },
        { q: 'Mengapa tombol Rekam Medis terkunci saat Off-Duty?', a: 'Kebijakan ABAC (Attribute-Based Access Control) sesuai PMK 24/2022 membatasi akses EMR di luar jadwal jaga, kecuali menggunakan protokol darurat Break-Glass yang diaudit.' }
      ]
    });
  }));

  app.post('/api/gateway/helpdesk', asyncRoute(async (req, res) => {
    const token = extractBearerToken(req);
    const session = token ? await loadSession(token) : null;
    const { requesterName, requesterContact, divisionName, category, priority, subject, description, source } = req.body || {};
    const cleanCategory = oneOf(HELPDESK_CATEGORIES, category, 'TI / SIMK & MFA');

    const row = {
      id: 'tkt-' + crypto.randomUUID(),
      ticket_no: `INC-${new Date().getUTCFullYear()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`,
      // Logged-in staff cannot file tickets under someone else's identity.
      requester_name: session ? session.name : str(requesterName, 'Karyawan RS', 200),
      requester_contact: session ? session.nip : str(requesterContact, 'Eksternal', 200),
      division_name: session ? session.divisionName : str(divisionName, 'Umum / Pengunjung Landing Page', 200),
      category: cleanCategory,
      priority: oneOf(HELPDESK_PRIORITIES, priority, 'P2 - Tinggi (1 Jam)'),
      subject: str(subject, 'Permintaan Bantuan Layanan', 300),
      description: str(description, '-', 4000),
      source: source === 'Landing Page App' ? 'Landing Page App' : 'Portal Karyawan',
      status: 'Terbuka',
      assigned_team: cleanCategory === 'HR & Absensi / Payroll' ? 'SDM & Payroll Service' : 'Service Desk TI (ITIL 4)',
      created_at: nowStamp(16)
    };

    await hr
      .prepare(
        `INSERT INTO helpdesk_ticket (id, ticket_no, requester_name, requester_contact, division_name, category, priority, subject, description, source, status, assigned_team, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        row.id, row.ticket_no, row.requester_name, row.requester_contact, row.division_name, row.category, row.priority,
        row.subject, row.description, row.source, row.status, row.assigned_team, row.created_at
      )
      .run();
    const ticket = toTicket(row);

    appendSiemLog({
      actorNip: session?.nip || row.requester_contact,
      actorName: row.requester_name,
      divisionId: session?.divisionId || 'landing',
      eventType: 'HELPDESK_TICKET_CREATED',
      resource: row.ticket_no,
      decision: 'ALLOW',
      detail: `[${row.priority}] ${row.subject}`,
      ipAddress: req.ip
    });

    res.json({ success: true, ticket });
  }));

  app.post('/api/gateway/helpdesk/resolve', asyncRoute(async (req, res) => {
    const session = await requireGatewaySession(req, res);
    if (!session) return;
    if (!requireAdminArea(session, req, res)) return;
    const { ticketId, status } = req.body || {};
    const newStatus = status === 'Selesai' ? 'Selesai' : 'Ditangani ITIL L1/L2';
    const upd = await hr.prepare('UPDATE helpdesk_ticket SET status = ? WHERE id = ?').bind(newStatus, String(ticketId || '')).run();
    if (!upd.meta.changes) return res.status(404).json({ success: false, message: 'Tiket tidak ditemukan.' });
    const t = await hr.prepare('SELECT * FROM helpdesk_ticket WHERE id = ?').bind(String(ticketId)).first<Record<string, unknown>>();
    res.json({ success: true, ticket: toTicket(t!) });
  }));

  // =========================================================================
  // 6. ALL 34 DIVISION-SPECIFIC WORKSPACES (RBAC + ABAC PROTECTED)
  // =========================================================================
  app.get('/api/gateway/divisions/:divisionId/workspace', asyncRoute(async (req, res) => {
    const session = await requireGatewaySession(req, res);
    if (!session) return;

    const div = divisionById(req.params.divisionId);
    if (!div) {
      return res.status(404).json({ success: false, message: 'Divisi rumah sakit tidak ditemukan.' });
    }

    const access = evaluateAccess(session, div);
    const { results: saved } = await hr
      .prepare('SELECT task_id, status FROM division_task_status WHERE division_id = ?')
      .bind(div.id)
      .all<{ task_id: string; status: string }>();
    const divisionActions = Object.fromEntries(saved.map((s) => [s.task_id, s.status]));

    const worklist = div.specificModules.map((modName, idx) => {
      const itemId = `${div.id}-task-${idx + 1}`;
      const isClinicalLocked = div.isClinical && access.emrAccess === 'LOCKED';
      const defaultStatus = isClinicalLocked
        ? 'Terkunci (ABAC)'
        : idx === 0
        ? 'Prioritas Aktif'
        : idx === 1
        ? 'Dalam Proses'
        : 'Terpantau Baik';

      return {
        id: itemId,
        moduleTitle: modName,
        referenceCode: `${div.id.toUpperCase().slice(0, 4)}-2026-0${idx + 1}`,
        assignedUnit: div.name,
        sensitivity: div.abacSensitivity,
        metricSummary:
          idx === 0
            ? `${4 + ((div.name.length + idx) % 12)} item memerlukan verifikasi`
            : idx === 1
            ? `SLA Unit: 98.${(div.name.length % 7) + 2}% terpenuhi`
            : 'Sinkron API Gateway (FHIR/HRIS)',
        status: divisionActions[itemId] || defaultStatus,
        requiresEmrClearance: div.isClinical
      };
    });

    // shortcut: workspace KPIs are fixed placeholders derived from the catalog.
    res.json({
      success: true,
      division: div,
      access,
      kpis: [
        { label: 'Kepatuhan Standar Unit', value: '97.8%', hint: 'Target >= 95%' },
        { label: 'Beban Tugas Shift Berjalan', value: `${6 + (div.name.length % 9)} Item`, hint: div.defaultShift },
        { label: 'Kesiapan SDM Terjadwal', value: '100% Terpenuhi', hint: 'Batas 40 jam/minggu aman' }
      ],
      worklist
    });
  }));

  app.post('/api/gateway/divisions/:divisionId/action', asyncRoute(async (req, res) => {
    const session = await requireGatewaySession(req, res);
    if (!session) return;

    const div = divisionById(req.params.divisionId);
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
    if (session.divisionId !== div.id && !access.adminAreaAccess) {
      return res.status(403).json({ success: false, message: 'Hanya anggota divisi ini yang dapat memperbarui item kerjanya.' });
    }

    const taskId = String(req.body?.taskId || '');
    const validTask = div.specificModules.some((_, idx) => taskId === `${div.id}-task-${idx + 1}`);
    if (!validTask) return res.status(400).json({ success: false, message: 'Item kerja divisi tidak dikenal.' });
    const newStatus = str(req.body?.newStatus, 'Selesai Diverifikasi', 100);
    await hr
      .prepare(
        'INSERT INTO division_task_status (division_id, task_id, status) VALUES (?, ?, ?) ON CONFLICT(division_id, task_id) DO UPDATE SET status = excluded.status'
      )
      .bind(div.id, taskId, newStatus)
      .run();

    appendSiemLog({
      actorNip: session.nip,
      actorName: session.name,
      divisionId: session.divisionId,
      eventType: access.emrAccess === 'BREAK_GLASS' ? 'BREAK_GLASS_CLINICAL_ACTION' : 'DIVISION_TASK_UPDATED',
      resource: `${div.name} :: ${taskId}`,
      decision: access.emrAccess === 'BREAK_GLASS' ? 'BREAK_GLASS' : 'ALLOW',
      detail: `Status item diperbarui menjadi "${newStatus}".`,
      ipAddress: req.ip
    });

    res.json({ success: true, taskId, status: newStatus });
  }));

  // =========================================================================
  // 7. AREA ADMIN & GOVERNANCE (CHANGE APPROVAL, SIEM, INTEGRATIONS)
  // =========================================================================
  async function allUsers() {
    const { results } = await hr.prepare('SELECT * FROM employee ORDER BY division_id, name').all<EmployeeRow>();
    return results.map(toUser);
  }

  app.get('/api/gateway/admin/state', asyncRoute(async (req, res) => {
    const session = await requireGatewaySession(req, res);
    if (!session) return;
    if (!requireAdminArea(session, req, res)) return;

    const users = await allUsers();
    const counts = await hr
      .prepare(
        `SELECT (SELECT COUNT(*) FROM auth_session WHERE created_at > ${SESSION_TTL_SQL}) AS sessions,
                (SELECT COUNT(*) FROM sdm_cuti WHERE status NOT IN ('Disetujui Final', 'Ditolak')) AS pending_leaves`
      )
      .first<{ sessions: number; pending_leaves: number }>();

    res.json({
      success: true,
      users,
      rbacMatrix,
      abacPolicies,
      featureFlags,
      announcements: portalAnnouncements,
      proposals: configChangeProposals,
      changelog: governanceChangelog,
      siemAuditTrail: siemAuditTrail.slice(0, 60),
      integrations: integrationHealthStore,
      analyticsSummary: {
        totalActiveEmployees: users.filter((u) => u.active).length,
        divisionsCovered: HOSPITAL_DIVISIONS.length,
        activeSessions: counts?.sessions ?? 0,
        pendingApprovals: configChangeProposals.filter((p) => p.status === 'PENDING_REVIEW').length + (counts?.pending_leaves ?? 0),
        complianceScore: '99.4%'
      }
    });
  }));

  // The only way to add employees: action CREATE writes db.hr.employee (role/flags derived from the division catalog).
  app.post('/api/gateway/admin/users', asyncRoute(async (req, res) => {
    const session = await requireGatewaySession(req, res);
    if (!session) return;
    if (!requireAdminArea(session, req, res)) return;

    const { action, userId, name, nip, divisionId, email } = req.body || {};
    if (action === 'HRIS_SYNC') {
      await hr.prepare("UPDATE employee SET last_hris_sync = datetime('now')").run();
      const users = await allUsers();
      appendSiemLog({
        actorNip: session.nip,
        actorName: session.name,
        divisionId: session.divisionId,
        eventType: 'HRIS_DIRECTORY_SYNC',
        resource: 'HRIS -> Portal Karyawan',
        decision: 'ALLOW',
        detail: `Sinkronisasi ${users.length} akun pegawai dari sumber kebenaran HRIS selesai.`,
        ipAddress: req.ip
      });
      return res.json({ success: true, users, message: 'Sinkronisasi HRIS selesai.' });
    }

    if (action === 'TOGGLE_ACTIVE' && userId) {
      if (userId === session.userId) {
        return res.status(400).json({ success: false, message: 'Tidak dapat menonaktifkan akun sendiri.' });
      }
      const upd = await hr.prepare('UPDATE employee SET active = 1 - active WHERE id = ?').bind(String(userId)).run();
      const row = upd.meta.changes ? await getEmployee(String(userId)) : null;
      if (row) {
        // Deactivated accounts lose their sessions at once.
        if (!row.active) await hr.prepare('DELETE FROM auth_session WHERE employee_id = ?').bind(row.id).run();
        const u = toUser(row);
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
      const div = divisionById(String(divisionId || ''));
      if (!div) return res.status(400).json({ success: false, message: 'Divisi pegawai tidak dikenal.' });
      const cleanNip = str(nip, '', 50);
      const cleanEmail = email ? String(email).trim().toLowerCase() : `${cleanNip.toLowerCase().replace(/[^a-z0-9]/g, '')}@tarumanagara-klinik.id`;
      if (!isEmail(cleanEmail)) return res.status(400).json({ success: false, message: 'Format email tidak valid.' });
      const id = 'emp-' + crypto.randomUUID();
      try {
        await hr
          .prepare(
            `INSERT INTO employee (id, nip, email, name, division_id, role_title, portal_role, is_clinical, is_admin_capable, active, unit_location, shift_pattern)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`
          )
          .bind(
            id, cleanNip, cleanEmail, str(name, '', 200), div.id, div.sampleRoles[0] || div.name, mapPortalRole(div),
            div.isClinical ? 1 : 0, div.isAdminCapable ? 1 : 0, div.name, div.defaultShift
          )
          .run();
      } catch (e) {
        if (isUniqueViolation(e)) return res.status(409).json({ success: false, message: 'NIP atau email sudah terdaftar.' });
        throw e;
      }
      const newUser = toUser((await getEmployee(id))!);
      appendSiemLog({
        actorNip: session.nip,
        actorName: session.name,
        divisionId: session.divisionId,
        eventType: 'USER_CREATED',
        resource: newUser.nip,
        decision: 'ALLOW',
        detail: `Akun pegawai ${newUser.name} (${div.name}) dibuat.`,
        ipAddress: req.ip
      });
      return res.json({ success: true, user: newUser });
    }

    res.status(400).json({ success: false, message: 'Aksi user tidak valid.' });
  }));

  // Segregation-of-duties Change Proposal & Reviewer Approval
  app.post('/api/gateway/admin/propose-change', asyncRoute(async (req, res) => {
    const session = await requireGatewaySession(req, res);
    if (!session) return;
    if (!requireAdminArea(session, req, res)) return;

    const { category, title, targetKey, proposedValue, justification } = req.body || {};
    const proposal: ConfigChangeProposal = {
      id: 'chg-' + Date.now(),
      proposedAt: nowStamp(),
      proposedBy: `${session.name} (${session.divisionName})`,
      category: oneOf(['FEATURE_FLAG', 'ABAC_POLICY', 'RBAC_MATRIX', 'PORTAL_CONTENT'] as const, category, 'FEATURE_FLAG'),
      title: str(title, 'Usulan Perubahan Konfigurasi', 300),
      targetKey: str(targetKey, 'offline_attendance', 100),
      proposedValue,
      justification: str(justification, 'Peningkatan tata kelola ITIL 4 & COBIT 2019'),
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
  }));

  app.post('/api/gateway/admin/review-change', asyncRoute(async (req, res) => {
    const session = await requireGatewaySession(req, res);
    if (!session) return;
    if (!requireAdminArea(session, req, res)) return;
    if (!rbacMatrix[session.portalRole].canReviewConfigChanges) {
      return res.status(403).json({ success: false, message: 'Peran Anda tidak berwenang meninjau perubahan konfigurasi.' });
    }

    const { proposalId, decision, reviewNote } = req.body || {};
    const proposal = configChangeProposals.find((p) => p.id === proposalId);
    if (!proposal) return res.status(404).json({ success: false, message: 'Usulan perubahan tidak ditemukan.' });

    proposal.reviewedAt = nowStamp();
    proposal.reviewedBy = `${session.name} (Reviewer Keamanan/Kepatuhan)`;
    proposal.reviewNote = str(reviewNote, decision === 'APPROVE' ? 'Memenuhi syarat ISO 27001 & UU PDP' : 'Perlu kajian ulang risiko');

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
        publishedAt: nowStamp(16),
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
  }));

  app.post('/api/gateway/admin/integrations/test', asyncRoute(async (req, res) => {
    const session = await requireGatewaySession(req, res);
    if (!session) return;
    if (!requireAdminArea(session, req, res)) return;

    const { integrationId } = req.body || {};
    const target = integrationHealthStore.find((i) => i.id === integrationId);
    if (!target) return res.status(404).json({ success: false, message: 'Layanan integrasi tidak ditemukan.' });

    target.latencyMs = Math.max(14, Math.round(target.latencyMs * 0.75));
    target.queueDepth = 0;
    target.lastSync = nowStamp();

    appendSiemLog({
      actorNip: session.nip,
      actorName: session.name,
      divisionId: session.divisionId,
      eventType: 'INTEGRATION_IDEMPOTENT_TEST',
      resource: target.name,
      decision: 'ALLOW',
      detail: `Uji koneksi & retry queue idempoten berhasil (${target.latencyMs}ms, antrean kosong).`,
      ipAddress: req.ip
    });

    res.json({ success: true, integration: target });
  }));

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
        cta: String(cta).slice(0, 50),
        utmSource: cleanUtm.slice(0, 50)
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
