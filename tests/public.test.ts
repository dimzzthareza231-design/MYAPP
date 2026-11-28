import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { openLocalDatabases } from '../src/server/localD1';
import { registerPatientPortalRoutes } from '../src/server/patientPortalService';

test('patient portal: verify RM+DOB -> session token -> notification inbox round-trip', async () => {
  const db = openLocalDatabases(':memory:');
  await db.core
    .prepare('INSERT INTO pasien (id, no_rm, nik, nama, penjamin, data) VALUES (?, ?, ?, ?, ?, ?)')
    .bind('p-test', 'RM-TEST-0001', '', 'Pasien Uji', 'Umum', JSON.stringify({ tanggal_lahir: '2000-02-03', jenis_kelamin: 'P' }))
    .run();

  const app = express();
  app.use(express.json());
  registerPatientPortalRoutes(app, { db });
  const srv = app.listen(0);
  const base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
  const post = (path: string, body: unknown, token?: string) =>
    fetch(base + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body)
    });

  try {
    assert.equal((await post('/api/patient/verify', { no_rm: 'rm-test-0001', tanggal_lahir: '2000-02-04' })).status, 401);

    const ok = await post('/api/patient/verify', { no_rm: 'rm-test-0001', tanggal_lahir: '2000-02-03' });
    assert.equal(ok.status, 200);
    const { token, dossier }: any = await ok.json();
    assert.match(token, /^pat_[0-9a-f]{40}$/);
    assert.equal(dossier.patient.nama, 'Pasien Uji');

    // Only the hash is stored
    const stored = await db.public.prepare('SELECT token_hash FROM portal_session').first<{ token_hash: string }>();
    assert.notEqual(stored?.token_hash, token);
    assert.equal(stored?.token_hash.length, 64);

    const dossierRes = await fetch(`${base}/api/patient/dossier`, { headers: { Authorization: `Bearer ${token}` } });
    assert.equal(dossierRes.status, 200);
    assert.equal((await fetch(`${base}/api/patient/dossier`, { headers: { Authorization: 'Bearer pat_bogus' } })).status, 401);

    const sent = await post('/api/patient/notifications/test', { type: 'queue_call' }, token);
    assert.equal(sent.status, 200);

    const inbox: any = await (await fetch(`${base}/api/patient/notifications?token=${token}`)).json();
    assert.equal(inbox.notifications.length, 1);
    assert.equal(inbox.unreadCount, 1);

    const read: any = await (await post('/api/patient/notifications/read', { id: inbox.notifications[0].id }, token)).json();
    assert.equal(read.unreadCount, 0);
    const after: any = await (await fetch(`${base}/api/patient/notifications?token=${token}`)).json();
    assert.equal(after.notifications[0].read, true);
  } finally {
    srv.close();
  }
});

test('patient portal: booking for an existing RM needs the matching DOB and creates a kunjungan', async () => {
  const db = openLocalDatabases(':memory:');
  await db.core
    .prepare('INSERT INTO pasien (id, no_rm, nik, nama, data) VALUES (?, ?, ?, ?, ?)')
    .bind('p-b', 'RM-TEST-0002', '', 'Pasien Booking', JSON.stringify({ tanggal_lahir: '1990-01-01' }))
    .run();
  const app = express();
  app.use(express.json());
  registerPatientPortalRoutes(app, { db });
  const srv = app.listen(0);
  const base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
  const book = (body: Record<string, unknown>) =>
    fetch(`${base}/api/patient/appointments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ poli_nama: 'Poli Umum', dokter_nama: 'dr. Uji', ...body })
    });
  try {
    assert.equal((await book({ no_rm: 'RM-TEST-0002', tanggal_lahir: '1999-09-09' })).status, 401);
    const ok = await book({ no_rm: 'RM-TEST-0002', tanggal_lahir: '1990-01-01' });
    assert.equal(ok.status, 201);
    const body: any = await ok.json();
    assert.equal(body.dossier.activeQueues.length, 1);
    const n = await db.core.prepare('SELECT COUNT(*) AS n FROM kunjungan WHERE pasien_id = ?').bind('p-b').first<number>('n');
    assert.equal(n, 1);
  } finally {
    srv.close();
  }
});
