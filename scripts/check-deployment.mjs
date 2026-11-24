import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const COLORS = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m'
};

function logInfo(msg) {
  console.log(`${COLORS.cyan}[INFO]${COLORS.reset} ${msg}`);
}
function logSuccess(msg) {
  console.log(`${COLORS.green}[OK]${COLORS.reset} ${msg}`);
}
function logWarn(msg) {
  console.log(`${COLORS.yellow}[WARN]${COLORS.reset} ${msg}`);
}
function logError(msg) {
  console.log(`${COLORS.red}[FAIL]${COLORS.reset} ${msg}`);
}

console.log(`\n${COLORS.bold}===========================================${COLORS.reset}`);
console.log(`${COLORS.bold} MYITARU SIMK - Pre-Deployment Audit Check${COLORS.reset}`);
console.log(`${COLORS.bold}===========================================${COLORS.reset}\n`);

let hasErrors = false;
let hasWarnings = false;

// 1. Check Node.js Version
const nodeVersion = process.version;
const majorVersion = parseInt(nodeVersion.replace('v', '').split('.')[0], 10);
if (majorVersion >= 20) {
  logSuccess(`Node.js version compatible: ${nodeVersion} (>= v20 required)`);
} else {
  logError(`Node.js version ${nodeVersion} is outdated. Node.js v20+ is required.`);
  hasErrors = true;
}

// 2. Check Critical Files
const criticalFiles = [
  'package.json',
  'server.ts',
  'vite.config.ts',
  'index.html',
  'public.html',
  'vite.public.config.ts',
  'src/PublicApp.tsx',
  'src/main.public.tsx',
  'src/App.tsx',
  'src/main.tsx',
  'Dockerfile'
];

logInfo('Verifying critical project files...');
for (const file of criticalFiles) {
  const filePath = path.join(rootDir, file);
  if (fs.existsSync(filePath)) {
    logSuccess(`Found critical file: ${file}`);
  } else {
    logError(`Missing critical file: ${file}`);
    hasErrors = true;
  }
}

// 3. Check Dependencies in package.json & node_modules
logInfo('Verifying package dependencies...');
try {
  const pkgPath = path.join(rootDir, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

  const requiredDependencies = [
    'react',
    'react-dom',
    'react-router-dom',
    'express',
    '@google/genai',
    'lucide-react',
    'recharts'
  ];

  const requiredDevDependencies = [
    'vite',
    'esbuild',
    'typescript'
  ];

  for (const dep of requiredDependencies) {
    if (pkg.dependencies && pkg.dependencies[dep]) {
      logSuccess(`Dependency declared: ${dep} (${pkg.dependencies[dep]})`);
    } else {
      logError(`Missing required dependency in package.json: ${dep}`);
      hasErrors = true;
    }
  }

  for (const devDep of requiredDevDependencies) {
    if (pkg.devDependencies && pkg.devDependencies[devDep]) {
      logSuccess(`DevDependency declared: ${devDep} (${pkg.devDependencies[devDep]})`);
    } else {
      logError(`Missing required devDependency in package.json: ${devDep}`);
      hasErrors = true;
    }
  }
} catch (err) {
  logError(`Failed to parse package.json: ${err.message}`);
  hasErrors = true;
}

// 4. Check Environment Variables & Runtime Settings
logInfo('Checking Environment Configuration...');

const port = process.env.PORT || '3000';
logSuccess(`Target Port configured: ${port}`);

const nodeEnv = process.env.NODE_ENV || 'development';
logInfo(`NODE_ENV set to: ${nodeEnv}`);

if (!process.env.GEMINI_API_KEY) {
  logWarn(`GEMINI_API_KEY is not set in environment. AI endpoints (/api/ai/*) will run in offline fallback mode unless injected by host.`);
  hasWarnings = true;
} else {
  logSuccess(`GEMINI_API_KEY detected in environment.`);
}

if (nodeEnv === 'production') {
  if (process.env.ALLOW_INSECURE_DEMO_AUTH === 'true') {
    logError('ALLOW_INSECURE_DEMO_AUTH=true tidak boleh aktif di produksi.');
    hasErrors = true;
  }
  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
    logWarn('SESSION_SECRET (>= 32 karakter) belum terbaca; server produksi menolak start tanpa itu.');
    hasWarnings = true;
  }
}

// 5. Verify Build Output Directory Write Permissions
logInfo('Verifying build output directory accessibility...');
const distDir = path.join(rootDir, 'dist');
try {
  if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
  }
  const testFile = path.join(distDir, '.write-test');
  fs.writeFileSync(testFile, 'test');
  fs.unlinkSync(testFile);
  logSuccess(`Build target directory 'dist/' is writable.`);
} catch (err) {
  logError(`Cannot write to target directory 'dist/': ${err.message}`);
  hasErrors = true;
}

// Summary Report
console.log(`\n${COLORS.bold}===========================================${COLORS.reset}`);
if (hasErrors) {
  logError(`${COLORS.bold}Pre-deployment check FAILED. Please resolve errors before triggering build.${COLORS.reset}\n`);
  process.exit(1);
} else if (hasWarnings) {
  logWarn(`${COLORS.bold}Pre-deployment check passed with WARNINGS. Build can proceed.${COLORS.reset}\n`);
  process.exit(0);
} else {
  logSuccess(`${COLORS.bold}Static pre-deployment checks passed.${COLORS.reset}`);
  logWarn(`${COLORS.bold}These checks do not certify production readiness. Runtime production startup remains blocked until durable storage is implemented.${COLORS.reset}\n`);
  process.exit(0);
}
