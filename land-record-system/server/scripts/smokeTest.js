/**
 * End-to-end smoke test. Boots its own server instance (in-memory DB),
 * runs the full workflow, then shuts down.
 * Usage: npm run smoke-test
 */
process.env.PORT = process.env.SMOKE_PORT || '5050';
process.env.NODE_ENV = 'test';

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

await import('../server.js');

const BASE = `http://localhost:${process.env.PORT}`;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

let token = '';
let failures = 0;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitUp() {
  for (let i = 0; i < 90; i++) {
    try {
      const r = await fetch(`${BASE}/api/health`);
      if (r.ok) {
        const j = await r.json();
        if (j.dbMode !== 'starting') return true;
      }
    } catch { /* not up yet */ }
    await sleep(500);
  }
  return false;
}

async function call(method, url, body, isForm = false) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (!isForm && body) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${BASE}${url}`, {
    method,
    headers,
    body: isForm ? body : body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

function check(name, cond, extra = '') {
  if (cond) console.log(`  ✓ ${name}`);
  else {
    failures++;
    console.error(`  ✗ ${name} ${extra}`);
  }
}

async function main() {
  console.log(`Smoke testing ${BASE}…\n`);
  const up = await waitUp();
  if (!up) {
    console.error('Server did not start — aborting.');
    process.exit(1);
  }

  // 1. health
  const h = await call('GET', '/api/health');
  check('GET /api/health', h.status === 200);

  // 2. login as officer
  const login = await call('POST', '/api/auth/login', { email: 'officer@lrs.gov.in', password: 'Officer@123' });
  check('POST /api/auth/login (officer)', login.status === 200 && login.json.token, JSON.stringify(login.json));
  token = login.json.token;

  // 3. dashboard stats
  const stats = await call('GET', '/api/dashboard/stats');
  check('GET /api/dashboard/stats', stats.status === 200 && stats.json.totals);
  console.log(`    totals: ${JSON.stringify(stats.json.totals)}`);

  // 4. upload a sample sidecar document (AI service likely offline here → Node fallback)
  const samplePath = path.resolve(__dirname, '../../sample-documents/khatian_1245_rampur.txt');
  const fd = new FormData();
  fd.append('file', new Blob([fs.readFileSync(samplePath)], { type: 'text/plain' }), 'khatian_smoke_test.txt');
  fd.append('documentType', 'Khatian');
  fd.append('district', 'Burdwan');
  fd.append('state', 'West Bengal');
  const up1 = await call('POST', '/api/documents/upload', fd, true);
  check('POST /api/documents/upload', up1.status === 201, JSON.stringify(up1.json).slice(0, 400));
  const docId = up1.json?.document?._id;
  const extracted = up1.json?.document?.extracted || {};
  console.log(`    extracted: owner=${extracted.ownerName}, khatian=${extracted.khatianNumber}, plot=${extracted.plotNumber}, village=${extracted.village}`);

  // 5. duplicate detection should flag the seeded verified record (same parcel)
  const dups = up1.json?.document?.validation?.duplicates || [];
  check('duplicate detection finds seeded parcel', dups.length > 0, JSON.stringify(dups));

  // 6. officer saves edits; revenue officer approves (separation of duties)
  const save = await call('PUT', `/api/verification/${docId}`, { action: 'save', extracted, note: 'officer corrections' });
  check('PUT /api/verification/:id save (officer)', save.status === 200, JSON.stringify(save.json).slice(0, 200));

  const rlogin = await call('POST', '/api/auth/login', { email: 'reviewer@lrs.gov.in', password: 'Reviewer@123' });
  token = rlogin.json.token;
  const rev = await call('PUT', `/api/verification/${docId}`, { action: 'approve', extracted, note: 'smoke test approval' });
  check('PUT /api/verification/:id approve (revenue officer)', rev.status === 200 && rev.json.document.status === 'verified', JSON.stringify(rev.json).slice(0, 300));

  // 7. record searchable
  const rec = await call('GET', '/api/records?q=Abdul');
  check('GET /api/records?q=Abdul', rec.status === 200 && rec.json.total >= 1);

  // 8. document reflects verified status
  const doc = await call('GET', `/api/documents/${docId}`);
  check('document now verified', doc.status === 200 && doc.json?.document?.status === 'verified', JSON.stringify(doc.json).slice(0, 200));

  // 9. RBAC: citizen cannot upload
  const clogin = await call('POST', '/api/auth/login', { email: 'citizen@lrs.gov.in', password: 'Citizen@123' });
  const citizenToken = clogin.json.token;
  const prev = token;
  token = citizenToken;
  const fd2 = new FormData();
  fd2.append('file', new Blob(['x'], { type: 'text/plain' }), 'x.txt');
  const forbidden = await call('POST', '/api/documents/upload', fd2, true);
  check('RBAC: citizen upload forbidden (403)', forbidden.status === 403, `got ${forbidden.status}`);
  token = prev;

  // 10. audit log recorded (admin)
  const alogin = await call('POST', '/api/auth/login', { email: 'admin@lrs.gov.in', password: 'Admin@123' });
  token = alogin.json.token;
  const logs = await call('GET', '/api/admin/audit-logs?limit=5');
  check('GET /api/admin/audit-logs (admin)', logs.status === 200 && logs.json.items.length > 0);

  console.log(failures === 0 ? '\n✅ All smoke tests passed' : `\n❌ ${failures} smoke test(s) failed`);
  process.exit(failures === 0 ? 0 : 1);
}

main().then(() => process.exit(failures === 0 ? 0 : 1)).catch((e) => {
  console.error('Smoke test crashed:', e.message);
  process.exit(1);
});
