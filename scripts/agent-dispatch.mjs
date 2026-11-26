#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

const [, , mode = 'help', ...rest] = process.argv;

function run(command, args, opts = {}) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    ...opts
  });
  return result.status ?? 1;
}

function hasCli(name) {
  const probe = process.platform === 'win32'
    ? spawnSync('where.exe', [name], { stdio: 'ignore' })
    : spawnSync('which', [name], { stdio: 'ignore' });
  return probe.status === 0;
}

function printHelp() {
  console.log(`
MYAPP Multi-Agent Dispatcher (sesuai AGENTS.md)

Perintah:
  npm run agent:check [-- --build]          Jalankan verifikasi wajib (typecheck, test, opsional build)
  npm run agent:light -- "<tugas>"           Jalankan tugas ringan via Gemini CLI / Copilot CLI
  npm run agent:assist -- "<konteks>"        Jalankan mode pendamping Claude (riset/audit/test)

Opsi untuk light / assist:
  --agent=gemini|copilot                     Pilih CLI secara eksplisit (default: auto)
  --dry-run                                  Tampilkan prompt & perintah tanpa mengeksekusi CLI
`.trim());
}

function runCheck(args) {
  const withBuild = args.includes('--build');
  console.log('[agent:check] Memeriksa sinkronisasi branch terhadap origin/main...');
  run('git', ['status', '-sb']);

  console.log('\n[agent:check] Menjalankan npm run typecheck...');
  if (run('npm', ['run', 'typecheck']) !== 0) process.exit(1);

  console.log('\n[agent:check] Menjalankan npm test...');
  if (run('npm', ['test']) !== 0) process.exit(1);

  if (withBuild) {
    console.log('\n[agent:check] Menjalankan npm run build...');
    if (run('npm', ['run', 'build']) !== 0) process.exit(1);
  }
  console.log('\n[agent:check] Semua pemeriksaan lulus.');
}

function runAgentTask(kind, args) {
  let agent = 'auto';
  let dryRun = false;
  const taskParts = [];

  for (const arg of args) {
    if (arg.startsWith('--agent=')) agent = arg.slice('--agent='.length);
    else if (arg === '--dry-run') dryRun = true;
    else taskParts.push(arg);
  }

  const task = taskParts.join(' ').trim();
  if (!task) {
    console.error(`[agent:${kind}] Mohon sertakan deskripsi tugas. Contoh: npm run agent:${kind} -- "perbaiki typo di Login"`);
    process.exit(1);
  }

  const resolvedAgent = agent === 'auto'
    ? (hasCli('gemini') ? 'gemini' : hasCli('copilot') ? 'copilot' : null)
    : (hasCli(agent) ? agent : null);

  const prompt = kind === 'light'
    ? `Ikuti AGENTS.md untuk TUGAS RINGAN. Gunakan terminologi Klinik/SIMK/RME, jaga strict TypeScript, jalankan npm run typecheck dan npm test setelah selesai. Tugas: ${task}`
    : `Ikuti AGENTS.md sebagai PENDAMPING CLAUDE untuk KASUS BERAT (riset, audit, verifikasi regresi, dan test; jangan ubah arsitektur inti tanpa arahan). Konteks: ${task}`;

  if (!resolvedAgent || dryRun) {
    console.log(`[agent:${kind}] Agent target: ${resolvedAgent || 'tidak ditemukan di PATH (gunakan Antigravity/VS Code)'}`);
    console.log(`[agent:${kind}] Prompt standar:\n${prompt}`);
    if (!resolvedAgent && !dryRun) process.exit(1);
    return;
  }

  if (resolvedAgent === 'gemini') {
    const cliArgs = kind === 'assist' ? ['--approval-mode', 'plan', '-p', prompt] : ['-p', prompt];
    process.exit(run('gemini', cliArgs));
  }

  if (resolvedAgent === 'copilot') {
    process.exit(run('copilot', ['-p', prompt]));
  }

  console.error(`[agent:${kind}] Agent tidak dikenal: ${resolvedAgent}`);
  process.exit(1);
}

if (mode === 'check') runCheck(rest);
else if (mode === 'light' || mode === 'assist') runAgentTask(mode, rest);
else printHelp();
