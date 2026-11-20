import { test, expect } from 'bun:test';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
const read = (file: string) => readFileSync(file, 'utf8');
test('public source has no imports from internal application or Firebase', () => {
  const source = read('apps/public/src/main.tsx');
  expect(source).not.toMatch(/from\s+['"][^'"]*(?:firebase|contexts|seedData|components|\.\.\/\.\/)['"]/);
  expect(source).not.toMatch(/fetch\(/);
});
test('main routing does not expose old public or demo portals', () => {
  const source = read('src/App.tsx');
  expect(source).not.toContain('PublicHospitalPortal'); expect(source).not.toContain('EmployeePortal'); expect(source).not.toContain('PatientMobileApp');
  expect(source).toContain('<Gate staff>');
});
test('staff authentication has no default password directory or role fallback', () => {
  const source = read('src/contexts/AuthContext.tsx');
  expect(source).not.toContain('DEFAULT_USERS'); expect(source).not.toContain('saveAuthSession('); expect(source).toContain('signInWithEmailAndPassword');
});
test('hospital context does not seed demo patients', () => {
  const source = read('src/contexts/HospitalContext.tsx');
  expect(source).not.toContain('batchSeed'); expect(source).not.toContain('seedData'); expect(source).not.toContain('localStorage');
});
test('Firestore patient ownership is bound to the provisioned profile', () => {
  const source = read('firestore.rules');
  expect(source).toContain('resource.data.no_rm == profile().no_rm'); expect(source).toContain('allow get, list: if staff() || owner();');
  expect(source).not.toContain('isSuperAdminEmail'); expect(source).not.toContain('@gmail.com');
});
test('server serves only the main client directory', () => {
  const source = read('server.ts'); expect(source).toContain("path.resolve('dist/main')"); expect(source).not.toContain('express.static(distPath)');
  expect(read('scripts/build-server.mjs')).toContain('dist/server/index.cjs');
});
test('public deployment selects public output only', () => {
  const config = JSON.parse(read('vercel.json')); expect(config.outputDirectory).toBe('dist/public'); expect(config.buildCommand).toBe('bun run build:public');
});
test('public output contains neither private entry points nor patient seed values', () => {
  if (!existsSync('dist/public')) throw new Error('Run bun run build:public before boundary tests.');
  function walk(dir: string): string[] { return readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)]); }
  const files = walk('dist/public'); expect(files.some(file => file.endsWith('index.html'))).toBe(true);
  for (const file of files) {
    expect(file).not.toMatch(/server|\.map$/);
    if (/\.(js|html)$/.test(file)) expect(read(file)).not.toMatch(/RM-260101-0001|mahasiswa001|firebase-applet-config|patientsStore|ClinicalDecisionSupportWidget/);
  }
});
