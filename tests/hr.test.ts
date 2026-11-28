import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { openLocalDatabases } from '../src/server/localD1';
import { registerEmployeePortalGateway } from '../src/server/employeePortalGateway';

// Gateway mounted on its own Express app (same middleware as createApp) so the test only depends on this module.
function startGateway(db: ReturnType<typeof openLocalDatabases>) {
  const app = express();
  app.use(express.json());
  registerEmployeePortalGateway(app, { db });
  const srv = app.listen(0);
  const base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
  const call = async (path: string, init: { method?: string; body?: unknown; token?: string; headers?: Record<string, string> } = {}) => {
    const res = await fetch(base + path, {
      method: init.method || (init.body ? 'POST' : 'GET'),
      headers: {
        'Content-Type': 'application/json',
        ...(init.token ? { Authorization: `Bearer ${init.token}` } : {}),
        ...init.headers
      },
      body: init.body ? JSON.stringify(init.body) : undefined
    });
    return { status: res.status, body: (await res.json()) as any };
  };
  return { srv, call };
}

async function addEmployee(db: ReturnType<typeof openLocalDatabases>, id: string, nip: string, divisionId: string, clinical: boolean, role: string) {
  await db.hr
    .prepare(
      `INSERT INTO employee (id, nip, email, name, division_id, role_title, portal_role, is_clinical, is_admin_capable, unit_location, shift_pattern)
       VALUES (?, ?, ?, ?, ?, 'Staf', ?, ?, 0, 'Unit', 'Reguler')`
    )
    .bind(id, nip, `${id}@example.test`, `Test ${id}`, divisionId, role, clinical ? 1 : 0)
    .run();
}

async function login(call: ReturnType<typeof startGateway>['call'], nip: string) {
  const r = await call('/api/gateway/auth/login', { body: { identifier: nip } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  if (!r.body.mfaRequired) return r.body.token as string;
  assert.match(r.body.demoOtpHint, /^\d{6}$/); // only outside production
  const bad = await call('/api/gateway/auth/verify-mfa', { body: { challengeId: r.body.challengeId, otp: r.body.demoOtpHint === '000000' ? '111111' : '000000' } });
  assert.equal(bad.status, 401);
  const ok = await call('/api/gateway/auth/verify-mfa', { body: { challengeId: r.body.challengeId, otp: r.body.demoOtpHint } });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  return ok.body.token as string;
}

test('unknown employee cannot log in (no auto-created accounts)', async () => {
  const db = openLocalDatabases(':memory:');
  const { srv, call } = startGateway(db);
  try {
    const r = await call('/api/gateway/auth/login', { body: { identifier: 'NIP-NOPE' } });
    assert.equal(r.status, 404);
  } finally {
    srv.close();
  }
});

test('login -> OTP verify -> attendance check-in is idempotent in D1', async () => {
  const db = openLocalDatabases(':memory:');
  await addEmployee(db, 'emp-n1', 'NIP-T-001', 'keperawatan', true, 'KEPERAWATAN');
  const a = startGateway(db);
  const b = startGateway(db); // second instance on the same DB, like another Worker isolate
  try {
    const token = await login(a.call, 'NIP-T-001');
    const stored = await db.hr.prepare('SELECT session_token_hash FROM auth_session').first<{ session_token_hash: string }>();
    assert.notEqual(stored?.session_token_hash, token); // only the hash is stored

    const clock = { body: { type: 'MASUK' }, token, headers: { 'Idempotency-Key': 'k-1' } };
    const first = await a.call('/api/gateway/attendance/clock', clock);
    assert.equal(first.status, 200, JSON.stringify(first.body));
    const replay = await b.call('/api/gateway/attendance/clock', clock);
    assert.equal(replay.status, 200);
    assert.equal(replay.body.entry.id, first.body.entry.id);

    const n = await db.hr.prepare('SELECT COUNT(*) AS n FROM sdm_kehadiran').first<{ n: number }>();
    assert.equal(n?.n, 1);

    const sync = await b.call('/api/gateway/attendance/sync-offline', {
      token,
      body: { items: [{ idempotencyKey: 'off-1', type: 'PULANG' }, { idempotencyKey: 'off-1', type: 'PULANG' }, { idempotencyKey: 'k-1' }] }
    });
    assert.equal(sync.body.syncedCount, 1);
    assert.equal(sync.body.skippedDuplicates, 2);
  } finally {
    a.srv.close();
    b.srv.close();
  }
});

test('SBAR handover is stored in core DB, not hr, and only clinical staff reach it', async () => {
  const db = openLocalDatabases(':memory:');
  await addEmployee(db, 'emp-n2', 'NIP-T-002', 'keperawatan', true, 'KEPERAWATAN');
  await addEmployee(db, 'emp-k1', 'NIP-T-003', 'keuangan', false, 'STAF_UMUM');
  const { srv, call } = startGateway(db);
  try {
    const nurse = await login(call, 'NIP-T-002');
    const created = await call('/api/gateway/sbar', { token: nurse, body: { patientLabel: 'Pasien Uji · Bed 1', situation: 'Stabil' } });
    assert.equal(created.status, 200, JSON.stringify(created.body));

    const inCore = await db.core.prepare('SELECT created_by, data FROM sbar_handover WHERE id = ?').bind(created.body.handover.id).first<{ created_by: string; data: string }>();
    assert.equal(inCore?.created_by, 'emp-n2');
    assert.equal(JSON.parse(inCore!.data).patientLabel, 'Pasien Uji · Bed 1');
    const hrTables = await db.hr.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE '%sbar%'").all();
    assert.equal(hrTables.results.length, 0);

    const clerk = await login(call, 'NIP-T-003');
    const denied = await call('/api/gateway/sbar', { token: clerk, body: { patientLabel: 'x' } });
    assert.equal(denied.status, 403);
    const list = await call('/api/gateway/sbar', { token: clerk });
    assert.equal(list.status, 200);
    assert.deepEqual(list.body.handovers, []);
  } finally {
    srv.close();
  }
});
