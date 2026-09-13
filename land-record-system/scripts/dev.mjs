#!/usr/bin/env node
/**
 * One-command launcher for the whole project:
 *   AI service (Python FastAPI) + API server (Express) + client (Vite)
 *
 * Usage:
 *   node scripts/dev.mjs              start everything
 *   node scripts/dev.mjs --no-ai      skip the Python AI service
 *   node scripts/dev.mjs --kill       free the ports first (kills anything on 5000/5173/8001)
 *   node scripts/dev.mjs --stop       stop everything and exit (no start)
 *   node scripts/dev.mjs --check      pre-flight checks only, start nothing
 *
 * If the ports are held by a PREVIOUS copy of this same project, the launcher
 * stops it automatically — double-clicking twice in a row just works.
 */

import { spawn, spawnSync } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ARGS = new Set(process.argv.slice(2));
const KILL_FIRST = ARGS.has('--kill') || ARGS.has('-k');
const CHECK_ONLY = ARGS.has('--check');
const SKIP_AI = ARGS.has('--no-ai');
const STOP_MODE = ARGS.has('--stop');

const C = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m',
  blue: '\x1b[34m', magenta: '\x1b[35m', cyan: '\x1b[36m',
};
const color = (c, s) => (process.stdout.isTTY ? `${C[c]}${s}${C.reset}` : s);

const SERVICES = [
  {
    name: 'server',
    label: 'API server ',
    color: 'blue',
    port: 5000,
    cwd: path.join(ROOT, 'server'),
    command: () => 'node server.js',
    health: `http://localhost:5000/api/health`,
    required: true,
    hint: 'cd server && npm install',
  },
  {
    name: 'client',
    label: 'Web client ',
    color: 'green',
    port: 5173,
    cwd: path.join(ROOT, 'client'),
    command: () => 'npx vite --port 5173 --strictPort',
    health: `http://localhost:5173`,
    required: true,
    hint: 'cd client && npm install',
  },
  {
    name: 'ai',
    label: 'AI service ',
    color: 'magenta',
    port: 8001,
    cwd: path.join(ROOT, 'ai-service'),
    command: () => `${PY} -m uvicorn app:app --port 8001`,
    health: null, // needs API key header; a plain GET 401 also proves it is alive
    required: false, // optional — server falls back to its own extractor
    hint: 'pip install -r ai-service/requirements.txt',
  },
];

/* ---------------- helpers ---------------- */

function portBusy(port) {
  // Vite and friends may bind IPv4, IPv6 or both — probe both stacks.
  const probe = (host) => new Promise((resolve) => {
    const s = net.connect({ port, host, timeout: 700 });
    s.on('connect', () => { s.destroy(); resolve(true); });
    s.on('error', () => resolve(false));
    s.on('timeout', () => { s.destroy(); resolve(false); });
  });
  return (async () => (await probe('127.0.0.1')) || (await probe('::1')))();
}

function waitForPort(port, timeoutMs = 30000) {
  const start = Date.now();
  return new Promise((resolve) => {
    const t = setInterval(async () => {
      if (await portBusy(port)) { clearInterval(t); resolve(true); }
      else if (Date.now() - start > timeoutMs) { clearInterval(t); resolve(false); }
    }, 500);
  });
}

function killPort(port) {
  // Windows
  const win = spawnSync('netstat', ['-ano'], { encoding: 'utf8' });
  if (win.status === 0) {
    const pids = new Set();
    for (const line of win.stdout.split('\n')) {
      if (line.includes(`:${port} `) && /LISTENING/i.test(line)) {
        const pid = line.trim().split(/\s+/).pop();
        if (pid && /^\d+$/.test(pid)) pids.add(pid);
      }
    }
    for (const pid of pids) spawnSync('taskkill', ['/F', '/PID', pid], { stdio: 'ignore' });
    if (pids.size) return pids.size;
  }
  // Unix fallback
  const unix = spawnSync('bash', ['-c', `lsof -ti :${port} 2>/dev/null || fuser ${port}/tcp 2>/dev/null`], { encoding: 'utf8' });
  if (unix.status === 0 && unix.stdout.trim()) {
    for (const pid of unix.stdout.trim().split('\n')) {
      if (/^\d+$/.test(pid)) spawnSync('kill', ['-9', pid], { stdio: 'ignore' });
    }
    return 1;
  }
  return 0;
}

function hasCommand(cmd, args = ['--version']) {
  // no shell: shell+args concatenation mangles quoted args on Windows (DEP0190)
  const r = spawnSync(cmd, args, { encoding: 'utf8' });
  return r.status === 0;
}

function missingDir(pkgDir, hint) {
  if (!fs.existsSync(path.join(pkgDir, 'node_modules'))) return hint;
  return null;
}

/* ---------------- pre-flight ---------------- */

const problems = [];
const notes = [];
const PY = hasCommand('python') ? 'python' : 'python3';

console.log(color('bold', STOP_MODE ? '\n  Land Record System\n' : '\n  Land Record System — starting all services\n'));

// 1. node/python available
if (!hasCommand('node')) problems.push('Node.js is not installed or not on PATH');
if (!SKIP_AI && !hasCommand(PY))
  problems.push('Python is not installed or not on PATH (needed for the AI service)');

// 2. dependencies installed
const serverMiss = missingDir(path.join(ROOT, 'server'), 'cd server && npm install');
const clientMiss = missingDir(path.join(ROOT, 'client'), 'cd client && npm install');
if (serverMiss) problems.push('server dependencies missing → ' + serverMiss);
if (clientMiss) problems.push('client dependencies missing → ' + clientMiss);
if (!SKIP_AI) {
  const imp = spawnSync(PY, ['-c', 'import fastapi, uvicorn'], { encoding: 'utf8' });
  if (imp.status !== 0)
    notes.push('Python packages (fastapi/uvicorn) not found → AI service may fail to start. Fix: pip install -r ai-service/requirements.txt');
}

// 3. env files exist
for (const env of ['server/.env', 'ai-service/.env']) {
  if (!fs.existsSync(path.join(ROOT, env))) {
    const example = env.replace('.env', '.env.example');
    if (fs.existsSync(path.join(ROOT, example))) {
      fs.copyFileSync(path.join(ROOT, example), path.join(ROOT, env));
      notes.push(`created ${env} from ${example}`);
    } else {
      problems.push(`missing ${env}`);
    }
  }
}

// 4. gemini key present?
try {
  const aiEnv = fs.readFileSync(path.join(ROOT, 'ai-service/.env'), 'utf8');
  if (/^GEMINI_API_KEY=\s*$/m.test(aiEnv) || !/GEMINI_API_KEY=/.test(aiEnv))
    notes.push('GEMINI_API_KEY is empty → extraction uses the offline regex engine (get a free key: aistudio.google.com/apikey)');
} catch { /* handled above */ }

if (problems.length) {
  console.log(color('red', '  Pre-flight failed:'));
  for (const p of problems) console.log(color('red', '   ✗ ' + p));
  console.log();
  process.exit(1);
}
for (const n of notes) console.log(color('yellow', '  ⚠ ' + n));

/* ---------------- stop mode / free ports ---------------- */

// Probe whether a listening port belongs to OUR project (health endpoint identifies it)
async function isOurs(svc) {
  if (!svc.health) return false;
  try {
    const r = await fetch(svc.health, { signal: AbortSignal.timeout(1500) });
    const body = await r.text();
    if (svc.name === 'server') return body.includes('land-record-api');
    if (svc.name === 'ai') return body.includes('land-record-ai') || r.status === 401; // 401 = our key-guard
    return r.status === 200; // vite dev server responds 200 on /
  } catch {
    return false;
  }
}

if (STOP_MODE) {
  console.log(color('bold', '\n  Land Record System — stopping all services\n'));
  let killed = 0;
  for (const s of SERVICES) {
    if (await portBusy(s.port)) {
      killed += killPort(s.port);
      console.log(color('yellow', `  ⚏ stopped whatever was on port ${s.port} (${s.label})`));
    } else {
      console.log(color('dim', `  · port ${s.port} already free`));
    }
  }
  console.log(killed ? color('green', '\n  ✓ All services stopped.') : color('green', '\n  ✓ Nothing was running.'));
  console.log();
  process.exit(0);
}

for (const s of SERVICES) {
  if (await portBusy(s.port)) {
    // If a previous copy of OUR stack holds the port, replace it automatically.
    if (await isOurs(s)) {
      killPort(s.port);
      // wait until the port is actually released (TIME_WAIT/binding lag on Windows)
      let freed = false;
      for (let i = 0; i < 15; i++) {
        await new Promise((r) => setTimeout(r, 400));
        if (!(await portBusy(s.port))) { freed = true; break; }
      }
      if (!freed) {
        problems.push(`port ${s.port} is still held after stopping the previous ${s.label.trim()} — close it manually`);
        continue;
      }
      console.log(color('yellow', `  ⚏ replaced an already-running ${s.label.trim()} (port ${s.port})`));
      continue;
    }
    if (KILL_FIRST) {
      const n = killPort(s.port);
      await new Promise((r) => setTimeout(r, 800));
      console.log(color('yellow', `  ⚏ port ${s.port} was busy — killed ${n} process(es)`));
    } else {
      problems.push(`port ${s.port} is used by another app (${s.label}) → close it, or run "node scripts/dev.mjs --kill" to force`);
    }
  }
}

if (CHECK_ONLY) {
  console.log(color('green', '  ✓ pre-flight OK (nothing started — remove --check to launch)\n'));
  process.exit(0);
}

/* ---------------- launch ---------------- */

const children = [];
let shuttingDown = false;

function startService(svc) {
  const cmdString = svc.command();
  const child = spawn(cmdString, {
    cwd: svc.cwd,
    env: { ...process.env },
    shell: true, // single string + shell: npx/python resolve .cmd shims on Windows
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const tag = color(svc.color, `│ ${svc.label}`);
  const pipe = (stream, isError) => {
    let buf = '';
    stream.setEncoding('utf8');
    stream.on('data', (chunk) => {
      buf += chunk;
      const lines = buf.split('\n');
      buf = lines.pop();
      for (const line of lines) {
        if (line.trim()) console.log(`${color('dim', tag)} ${line}`);
      }
    });
  };
  pipe(child.stdout);
  pipe(child.stderr);
  child.on('exit', (code) => {
    if (!shuttingDown && svc.required) {
      console.log(color('red', `\n  ✗ ${svc.label} exited (code ${code}). Check the logs above.`));
      if (code !== 0) shutdown(code || 1);
    }
  });
  children.push({ svc, child });
  return child;
}

async function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(color('yellow', '\n  Stopping all services…'));
  for (const { child } of children) {
    try { child.kill(); } catch { /* already gone */ }
  }
  // Windows needs the tree kill for shell-wrapped processes
  if (process.platform === 'win32') {
    for (const { child } of children) {
      try { spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' }); } catch { /* gone */ }
    }
  }
  setTimeout(() => process.exit(code), 500);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
process.on('uncaughtException', (err) => {
  console.error(color('red', 'Unexpected error:'), err);
  shutdown(1);
});

const started = [];
for (const svc of SERVICES) {
  if (SKIP_AI && svc.name === 'ai') {
    console.log(color('yellow', '  ⊘ skipping AI service (--no-ai): server will use its built-in fallback extractor'));
    continue;
  }
  startService(svc);
  started.push(svc);
}

/* ---------------- readiness report ---------------- */

setTimeout(async () => {
  if (shuttingDown) return;
  console.log();
  for (const svc of started) {
    const up = await waitForPort(svc.port, svc.name === 'ai' ? 25000 : 20000);
    if (up) console.log(color('green', `  ✓ ${svc.label} ready`));
    else if (svc.required) console.log(color('red', `  ✗ ${svc.label} did not come up on port ${svc.port}`));
    else console.log(color('yellow', `  ⚠ ${svc.label} not up yet (optional) — check logs above`));
  }
  console.log();
  console.log(color('bold', '  ──────────────────────────────────────────────'));
  console.log(`   ${color('bold', 'App:')}        ${color('cyan', 'http://localhost:5173')}`);
  console.log(`   ${color('bold', 'API:')}        http://localhost:5000/api`);
  if (!SKIP_AI) console.log(`   ${color('bold', 'AI service:')} http://localhost:8001`);
  console.log(`   ${color('bold', 'Login:')}      ${color('green', 'officer@lrs.gov.in / Officer@123')}`);
  console.log(color('bold', '  ──────────────────────────────────────────────'));
  console.log(color('dim', '  Press Ctrl+C to stop everything\n'));
}, 1500);
