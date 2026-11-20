import { test, expect } from 'bun:test';
import { createApp } from '../src/server/app';
import { firebaseVerifier, HttpError } from '../src/server/security';
import { FirestoreRepository, type Repository } from '../src/server/firestoreRepository';

async function fixture(role = 'dokter', active = true, missing = false, max = 90) {
  const queries: any[] = [], writes: any[] = [];
  const store: Repository = {
    get: async (collection, id) => collection === 'users' ? missing ? null : { roleId: role, aktif: active, nama: 'Test User', no_rm: 'OWN-RM' } : { id, no_rm: 'OWN-RM', nama: 'Test Patient' },
    list: async () => ({ documents: [{ id: 'test-patient', no_rm: 'OWN-RM' }] }),
    query: async (collection, field, value) => { queries.push({ collection, field, value }); return [{ id: 'own-record', no_rm: value }]; },
    put: async (collection, id, data) => { writes.push({ collection, id, data }); return { ...data, id }; },
  };
  const app = createApp({ verify: async token => { if (token !== 'verified-test-token') throw new HttpError(401, 'Invalid token'); return { uid: 'test-uid', email: 'test@example.invalid', token }; }, repository: () => store, origin: 'https://app.example.invalid', rateLimit: max });
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const port = (server.address() as any).port;
  const request = (path: string, init: RequestInit = {}, authorized = true) => fetch(`http://127.0.0.1:${port}${path}`, { ...init, headers: { ...(authorized ? { Authorization: 'Bearer verified-test-token' } : {}), ...init.headers } });
  return { request, queries, writes, close: () => new Promise<void>(resolve => server.close(() => resolve())) };
}
async function using(role: string, fn: (f: Awaited<ReturnType<typeof fixture>>) => Promise<void>, active = true, missing = false, max = 90) {
  const f = await fixture(role, active, missing, max); try { await fn(f); } finally { await f.close(); }
}
test('health is anonymous and contains no patient records', () => using('dokter', async f => { const r = await f.request('/api/v1/health', {}, false); expect(r.status).toBe(200); expect(await r.json()).toEqual({ status: 'ok', service: 'myitaru-main' }); }));
test('anonymous patient read is rejected', () => using('dokter', async f => { expect((await f.request('/api/v1/patients', {}, false)).status).toBe(401); }));
test('query-string tokens cannot authenticate', () => using('dokter', async f => { expect((await f.request('/api/v1/patients?token=verified-test-token', {}, false)).status).toBe(401); }));
test('unverified bearer is rejected', () => using('dokter', async f => { expect((await f.request('/api/v1/patients', { headers: { Authorization: 'Bearer forged-token' } })).status).toBe(401); }));
test('active staff can read persisted patients', () => using('dokter', async f => { const r = await f.request('/api/v1/patients'); expect(r.status).toBe(200); expect((await r.json()).data[0].id).toBe('test-patient'); }));
test('patient cannot list all patients', () => using('patient', async f => { expect((await f.request('/api/v1/patients')).status).toBe(403); }));
test('patient dossier ignores caller-supplied RM', () => using('patient', async f => { const r = await f.request('/api/patient/dossier?no_rm=OTHER-RM'); expect(r.status).toBe(200); expect(f.queries.every(q => q.value === 'OWN-RM')).toBe(true); }));
test('disabled accounts fail closed', () => using('admin', async f => { expect((await f.request('/api/v1/patients')).status).toBe(403); }, false));
test('missing account profiles fail closed', () => using('admin', async f => { expect((await f.request('/api/v1/patients')).status).toBe(403); }, true, true));
test('body email is not Google authentication', () => using('patient', async f => { const r = await f.request('/api/patient/google-session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@example.invalid', useDemoSample: true }) }, false); expect(r.status).toBe(401); expect(f.writes.length).toBe(0); }));
test('retired demo authentication does not issue a session', () => using('patient', async f => { const r = await f.request('/api/gateway/auth/verify-mfa', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"otp":"123456"}' }); expect(r.status).toBe(410); expect(JSON.stringify(await r.json())).not.toContain('"token"'); }));
test('backup never claims a simulated success', () => using('admin', async f => { const r = await f.request('/api/v1/backup/create', { method: 'POST' }); expect(r.status).toBe(501); expect((await r.json()).configured).toBe(false); expect(f.writes.length).toBe(0); }));
test('patient cannot request admin backup', () => using('patient', async f => { expect((await f.request('/api/v1/backup/create', { method: 'POST' })).status).toBe(403); }));
test('unmatched API remains JSON 404, not SPA HTML', () => using('dokter', async f => { const r = await f.request('/api/does-not-exist'); expect(r.status).toBe(404); expect(r.headers.get('content-type')).toContain('application/json'); }));
test('cross-origin API request is rejected', () => using('dokter', async f => { expect((await f.request('/api/v1/patients', { headers: { Origin: 'https://evil.example.invalid' } })).status).toBe(403); }));
test('API rate limits are applied before authentication', () => using('dokter', async f => { await f.request('/api/v1/patients', {}, false); expect((await f.request('/api/v1/patients', {}, false)).status).toBe(429); }, true, false, 1));
test('invalid patient data does not write', () => using('dokter', async f => { expect((await f.request('/api/v1/patients', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"nama":"Test","nik":"bad"}' })).status).toBe(400); expect(f.writes.length).toBe(0); }));
test('Firestore errors are failures, never an in-memory success', async () => {
  const store = new FirestoreRepository('test-token', { FIREBASE_PROJECT_ID: 'demo-myapp' }, (async () => new Response('{}', { status: 503 })) as typeof fetch);
  await expect(store.put('pasien', 'test-id', { nama: 'Test' })).rejects.toThrow();
});
test('a decodable but Firebase-rejected token is not trusted', async () => {
  const claims = { aud: 'demo-myapp', iss: 'https://securetoken.google.com/demo-myapp', sub: 'test-uid', email: 'test@example.invalid', exp: Date.now() / 1000 + 60, iat: Date.now() / 1000 };
  const token = `header.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.signature`;
  const verify = firebaseVerifier({ FIREBASE_PROJECT_ID: 'demo-myapp', FIREBASE_WEB_API_KEY: 'test-key' }, (async () => new Response('{}', { status: 400 })) as typeof fetch);
  await expect(verify(token)).rejects.toThrow();
});
