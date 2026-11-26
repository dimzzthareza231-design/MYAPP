#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process';

const [, , mode = 'help', ...rest] = process.argv;

function quoteArg(arg) {
  if (/^[A-Za-z0-9_./:=+-]+$/.test(arg)) return arg;
  return `"${arg.replace(/"/g, '\\"')}"`;
}

function buildCommand(command, args) {
  return [command, ...args.map(quoteArg)].join(' ');
}

function run(command, args, opts = {}) {
  const result = process.platform === 'win32'
    ? spawnSync(buildCommand(command, args), { stdio: 'inherit', shell: true, ...opts })
    : spawnSync(command, args, { stdio: 'inherit', ...opts });
  return result.status ?? 1;
}

function runAsync(label, command, args) {
  return new Promise((resolve) => {
    const child = process.platform === 'win32'
      ? spawn(buildCommand(command, args), { stdio: ['ignore', 'pipe', 'pipe'], shell: true })
      : spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });

    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr?.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('close', (code) => {
      resolve({ label, code: code ?? 1, stdout: stdout.trim(), stderr: stderr.trim() });
    });
  });
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
  npm run agent:auto -- "<tugas>"            Klasifikasi otomatis (ringan vs berat) dan panggil agent
  npm run agent:parallel -- "<t1>" "<t2>"    Jalankan Gemini CLI & Copilot CLI secara paralel

Opsi untuk light / assist / auto:
  --agent=gemini|copilot                     Pilih CLI secara eksplisit (default: auto)
  --dry-run                                  Tampilkan prompt & target tanpa mengeksekusi CLI
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

function isHeavyTask(task) {
  return /\b(arsitektur|architecture|refactor|migrasi|migration|security|keamanan|auth|kripto|crypto|schema|d1|firestore|cross-module)\b/i.test(task);
}

function buildPrompt(kind, task) {
  if (kind === 'light') {
    return `Ikuti AGENTS.md untuk TUGAS RINGAN. Gunakan terminologi Klinik/SIMK/RME, jaga strict TypeScript, jalankan npm run typecheck dan npm test setelah selesai. Tugas: ${task}`;
  }
  return `Ikuti AGENTS.md sebagai PENDAMPING CLAUDE untuk KASUS BERAT (riset, audit, verifikasi regresi, dan test; jangan ubah arsitektur inti tanpa arahan). Konteks: ${task}`;
}

function cliInvocation(resolvedAgent, kind, prompt) {
  if (resolvedAgent === 'gemini') {
    return {
      command: 'gemini',
      args: kind === 'assist' ? ['--approval-mode', 'plan', '-p', prompt] : ['-p', prompt]
    };
  }
  return {
    command: 'copilot',
    args: ['-p', prompt, '--silent']
  };
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
    console.error(`[agent:${kind}] Mohon sertakan deskripsi tugas.`);
    process.exit(1);
  }

  const effectiveKind = kind === 'auto' ? (isHeavyTask(task) ? 'assist' : 'light') : kind;
  const resolvedAgent = agent === 'auto'
    ? (hasCli('gemini') ? 'gemini' : hasCli('copilot') ? 'copilot' : null)
    : (hasCli(agent) ? agent : null);

  const prompt = buildPrompt(effectiveKind, task);

  if (!resolvedAgent || dryRun) {
    console.log(`[agent:${kind}] Mode: ${effectiveKind} | Agent target: ${resolvedAgent || 'tidak ditemukan di PATH (gunakan Antigravity/VS Code)'}`);
    console.log(`[agent:${kind}] Prompt standar:\n${prompt}`);
    if (!resolvedAgent && !dryRun) process.exit(1);
    return;
  }

  const { command, args: cliArgs } = cliInvocation(resolvedAgent, effectiveKind, prompt);
  process.exit(run(command, cliArgs));
}

async function runParallel(args) {
  const dryRun = args.includes('--dry-run');
  const tasks = args.filter((arg) => arg !== '--dry-run');
  if (tasks.length === 0) {
    console.error('[agent:parallel] Berikan minimal 1 tugas. Contoh: npm run agent:parallel -- "cek test" "audit lint"');
    process.exit(1);
  }

  const available = ['gemini', 'copilot'].filter(hasCli);
  if (available.length === 0) {
    console.error('[agent:parallel] Tidak ada CLI gemini atau copilot di PATH.');
    process.exit(1);
  }

  const jobs = tasks.map((task, idx) => {
    const target = available[idx % available.length];
    const kind = isHeavyTask(task) ? 'assist' : 'light';
    const prompt = buildPrompt(kind, task);
    return { target, kind, task, ...cliInvocation(target, kind, prompt) };
  });

  if (dryRun) {
    for (const job of jobs) {
      console.log(`[agent:parallel] -> ${job.target} (${job.kind}): ${job.task}`);
    }
    return;
  }

  const results = await Promise.all(
    jobs.map((job) => runAsync(`${job.target}:${job.kind}`, job.command, job.args))
  );

  let hasFailure = false;
  for (const res of results) {
    console.log(`\n=== [${res.label}] (exit ${res.code}) ===`);
    if (res.stdout) console.log(res.stdout);
    if (res.stderr) console.error(res.stderr);
    if (res.code !== 0) hasFailure = true;
  }
  if (hasFailure) process.exit(1);
}

if (mode === 'check') runCheck(rest);
else if (mode === 'light' || mode === 'assist' || mode === 'auto') runAgentTask(mode, rest);
else if (mode === 'parallel') void runParallel(rest);
else printHelp();
