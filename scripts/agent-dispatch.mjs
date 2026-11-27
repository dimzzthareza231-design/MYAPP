#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process';

const [, , mode = 'help', ...rest] = process.argv;

function quoteArg(arg) {
  if (/^[A-Za-z0-9_./:=+-]+$/.test(arg)) return arg;
  // cmd tidak mengenal \" (setiap " membalik mode kutip dan bisa membuka & | ke shell), jadi ganti dengan '.
  // %VAR% juga diekspansi cmd di dalam kutip; ganti % agar teks tugas tidak berubah.
  return process.platform === 'win32'
    ? `"${arg.replace(/"/g, "'").replace(/%/g, ' persen')}"`
    : `"${arg.replace(/"/g, '\\"')}"`;
}

// Dikirim apa adanya ke cmd (windowsVerbatimArguments); tanpa itu Node meng-escape ulang tanda kutip dan prompt terpecah.
function buildCommand(command, args) {
  return [command, ...args.map(quoteArg)].join(' ');
}

// Batas waktu agar CLI yang macet (mis. Gemini retry 503 tanpa henti) tidak menggantung sesi.
const AGENT_TIMEOUT_MS = 10 * 60 * 1000;
const AGENTS = ['gemini', 'copilot', 'agy'];

function run(command, args, opts = {}) {
  const result = process.platform === 'win32'
    ? spawnSync('cmd', ['/d', '/s', '/c', `"${buildCommand(command, args)}"`], { stdio: 'inherit', windowsVerbatimArguments: true, ...opts })
    : spawnSync(command, args, { stdio: 'inherit', ...opts });
  return result.status ?? 1;
}

function runAsync(label, command, args) {
  return new Promise((resolve) => {
    const child = process.platform === 'win32'
      ? spawn('cmd', ['/d', '/s', '/c', `"${buildCommand(command, args)}"`], { stdio: ['ignore', 'pipe', 'pipe'], windowsVerbatimArguments: true })
      : spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'], detached: true });

    let stdout = '';
    let stderr = '';
    let timedOut = false;
    // Matikan seluruh pohon proses: membunuh cmd saja meninggalkan CLI anak tetap berjalan.
    const timer = setTimeout(() => {
      timedOut = true;
      if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
      else try { process.kill(-child.pid, 'SIGKILL'); } catch { /* sudah selesai */ }
    }, AGENT_TIMEOUT_MS);
    child.stdout?.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr?.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (timedOut) stderr += `\n[agent] ${command} timeout ${AGENT_TIMEOUT_MS / 60000} menit`;
      resolve({ label, code: timedOut ? 124 : code ?? 1, stdout: stdout.trim(), stderr: stderr.trim() });
    });
  });
}

function printResult(res) {
  console.log(`\n=== [${res.label}] (exit ${res.code}) ===`);
  if (res.stdout) console.log(res.stdout);
  if (res.stderr) console.error(res.stderr);
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

Catatan: dispatcher ini memanggil CLI yang terinstal di PATH: Gemini CLI,
GitHub Copilot CLI, dan Antigravity CLI (agy). Claude adalah lead yang memanggil
dispatcher ini. Gunakan --dry-run untuk melihat prompt tanpa mengeksekusi CLI.

Perintah:
  npm run agent:check [-- --build]          Jalankan verifikasi wajib (typecheck, test, opsional build)
  npm run agent:light -- "<tugas>"           Jalankan tugas ringan via Gemini / Copilot / Antigravity
  npm run agent:assist -- "<konteks>"        Jalankan mode pendamping (riset/audit/test) via Gemini / Copilot / Antigravity
  npm run agent:auto -- "<tugas>"            Klasifikasi otomatis (ringan vs berat) dan panggil agent
  npm run agent:parallel -- "gemini: <t1>" "agy: <t2>"  Jalankan paralel; awalan memilih agent, tanpa awalan round-robin

Opsi untuk light / assist / auto:
  --agent=gemini|copilot|agy                 Pilih CLI secara eksplisit (default: auto-detect di PATH)
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

// Gemini & Antigravity hanya untuk UI/UX & frontend ringan (AGENTS.md bagian 1); backend milik Claude/Copilot/Cloudflare.
const UI_AGENTS = ['agy', 'gemini'];

function isUiTask(task) {
  return /\b(ui|ux|frontend|front-end|komponen|component|tampilan|layout|css|tailwind|styling|responsif|responsive|tombol|button|halaman|form|label|aksesibilitas|accessibility|copy|teks antarmuka)\b/i.test(task);
}

// Pilih agent sesuai jobdesk bila tidak ditentukan; null bila tidak ada CLI yang cocok.
function pickAgent(task, available, idx = 0) {
  if (isUiTask(task) && !isHeavyTask(task)) {
    const ui = UI_AGENTS.filter((a) => available.includes(a));
    if (ui.length) return ui[idx % ui.length];
  }
  return available.includes('copilot') ? 'copilot' : null;
}

function outOfJobdesk(agent, task) {
  return UI_AGENTS.includes(agent) && (!isUiTask(task) || isHeavyTask(task));
}

const HONESTY = 'Jangan menulis LULUS/BERHASIL/SELESAI tanpa bukti (perintah + hasil); bila tidak bisa memverifikasi tulis BELUM DIVERIFIKASI. ' +
  'Hal sensitif (secret, data pasien, autentikasi, produksi, hapus data): berhenti dan laporkan ke Claude. Jangan commit, push, atau deploy.';

// Agent headless tidak punya izin shell npm; Antigravity membatalkan seluruh jawaban bila satu perintah ditolak.
const NO_SHELL = 'Jangan menjalankan perintah shell/terminal (npm, git, dll.); Claude yang menjalankan typecheck/test.';
const COPILOT_SHELL = 'Boleh menjalankan git status/diff/log; jangan menjalankan npm/npx; Claude yang menjalankan typecheck/test.';

function buildPrompt(kind, task, agent) {
  const shell = agent === 'copilot' ? COPILOT_SHELL : NO_SHELL;
  if (kind === 'light') {
    return `Ikuti AGENTS.md dan skill jobdesk Anda. Gunakan terminologi Klinik/SIMK/RME, jaga strict TypeScript. Hanya ubah file yang ditugaskan. ${shell} ${HONESTY} Jawab ringkas: status dan file yang diubah. Tugas: ${task}`;
  }
  return `Ikuti AGENTS.md dan skill jobdesk Anda. Mode READ-ONLY: jangan mengubah file. ${shell} Laporkan temuan dengan path:baris. ${HONESTY} Konteks: ${task}`;
}

// Copilot boleh mengedit dan membaca git; commit/push/reset/deploy ditolak eksplisit.
const COPILOT_DENY = ['shell(git push:*)', 'shell(git commit:*)', 'shell(git reset:*)', 'shell(git rebase:*)', 'shell(npx wrangler:*)', 'shell(wrangler:*)', 'shell(rm:*)']
  .flatMap((t) => ['--deny-tool', t]);
const COPILOT_READ = ['shell(git status:*)', 'shell(git diff:*)', 'shell(git log:*)'].flatMap((t) => ['--allow-tool', t]);
// shortcut: Copilot belum diberi shell npm karena deny untuk `npm run cf:deploy` belum terbukti (kuota habis saat diuji); verifikasi dipegang Claude.
const COPILOT_VERIFY = ['--allow-tool', 'write'];

function cliInvocation(resolvedAgent, kind, prompt) {
  if (resolvedAgent === 'gemini') {
    return { command: 'gemini', args: ['--approval-mode', kind === 'assist' ? 'plan' : 'auto_edit', '-p', prompt] };
  }
  if (resolvedAgent === 'agy') {
    return { command: 'agy', args: ['-p', prompt, '--mode', kind === 'assist' ? 'plan' : 'accept-edits'] };
  }
  return {
    command: 'copilot',
    args: ['-p', prompt, '--silent', ...COPILOT_READ, ...(kind === 'assist' ? [] : COPILOT_VERIFY), ...COPILOT_DENY]
  };
}

async function runAgentTask(kind, args) {
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
  if (agent !== 'auto' && outOfJobdesk(agent, task)) {
    console.error(`[agent:${kind}] Ditolak: ${agent} hanya untuk UI/UX & frontend ringan (AGENTS.md). Serahkan ke copilot atau Claude.`);
    process.exit(2);
  }
  const resolvedAgent = agent === 'auto'
    ? pickAgent(task, AGENTS.filter(hasCli))
    : (hasCli(agent) ? agent : null);

  const prompt = buildPrompt(effectiveKind, task, resolvedAgent);

  if (!resolvedAgent || dryRun) {
    console.log(`[agent:${kind}] Mode: ${effectiveKind} | Agent target: ${resolvedAgent || 'tidak ditemukan di PATH (gunakan Antigravity/VS Code)'}`);
    console.log(`[agent:${kind}] Prompt standar:\n${prompt}`);
    if (!resolvedAgent && !dryRun) process.exit(1);
    return;
  }

  const { command, args: cliArgs } = cliInvocation(resolvedAgent, effectiveKind, prompt);
  const res = await runAsync(`${resolvedAgent}:${effectiveKind}`, command, cliArgs);
  printResult(res);
  process.exit(res.code);
}

async function runParallel(args) {
  const dryRun = args.includes('--dry-run');
  const tasks = args.filter((arg) => arg !== '--dry-run');
  if (tasks.length === 0) {
    console.error('[agent:parallel] Berikan minimal 1 tugas. Contoh: npm run agent:parallel -- "cek test" "audit lint"');
    process.exit(1);
  }

  let available = AGENTS.filter(hasCli);
  if (available.length === 0) {
    if (!dryRun) {
      console.error('[agent:parallel] Tidak ada CLI gemini, copilot, atau agy di PATH.');
      process.exit(1);
    }
    available = AGENTS;
  }

  // Awalan 'gemini:' / 'copilot:' / 'agy:' memilih agent; tanpa awalan dipilih sesuai jobdesk.
  const jobs = tasks.map((raw, idx) => {
    const [, picked, body] = raw.match(/^(gemini|copilot|agy):\s*(.*)$/s) ?? [];
    const task = picked ? body : raw;
    if (picked && outOfJobdesk(picked, task)) {
      console.error(`[agent:parallel] Ditolak: "${task}" bukan jobdesk ${picked} (hanya UI/UX & frontend ringan).`);
      process.exit(2);
    }
    const target = picked ?? pickAgent(task, available, idx);
    if (!target) {
      console.error(`[agent:parallel] Tidak ada CLI yang cocok untuk: ${task}`);
      process.exit(1);
    }
    const kind = isHeavyTask(task) ? 'assist' : 'light';
    const prompt = buildPrompt(kind, task, target);
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
    printResult(res);
    if (res.code !== 0) hasFailure = true;
  }
  if (hasFailure) process.exit(1);
}

if (mode === 'check') runCheck(rest);
else if (mode === 'light' || mode === 'assist' || mode === 'auto') void runAgentTask(mode, rest);
else if (mode === 'parallel') void runParallel(rest);
else printHelp();
