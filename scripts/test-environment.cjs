/* Integration-test infrastructure. NEVER connects the application to the real database. */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const https = require('node:https');
const { spawn, execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { Pool } = require('pg');
const { drizzle } = require('drizzle-orm/node-postgres');
const { sql } = require('drizzle-orm');
const { chromium } = require('@playwright/test');

const TEST_DB = 'cabtrack_checks_test';
const TEST_URL = `postgresql://postgres:postgres@127.0.0.1:5432/${TEST_DB}`;
const HTTP_BASE = 'http://127.0.0.1:3100';
const HTTPS_BASE = 'https://app.cab.test:3443';
const SHELL_BASE = 'https://shell.preview.test:3443';
const TEST_PIN = '02468';
const sha = s => createHash('sha256').update(s).digest('hex');

async function environment({ legacyPin = true } = {}) {
  if (!new URL(TEST_URL).pathname.endsWith('_test')) throw new Error('Unsafe test database');
  const adminPool = new Pool({ connectionString: 'postgresql://postgres:postgres@127.0.0.1:5432/postgres' });
  const admin = drizzle(adminPool);
  await admin.execute(sql.raw(`DROP DATABASE IF EXISTS ${TEST_DB} WITH (FORCE)`));
  await admin.execute(sql.raw(`CREATE DATABASE ${TEST_DB}`));
  const pool = new Pool({ connectionString: TEST_URL });
  const db = drizzle(pool);
  const schema = fs.readFileSync(path.join(process.cwd(), 'schema.sql'), 'utf8')
    .split('\n').filter(l => !l.startsWith('\\')).join('\n');
  await db.execute(sql.raw(schema));
  await db.execute(sql`set search_path to public`);
  if (legacyPin) {
    const salt = 'integration-tests-only-not-a-production-secret';
    await db.execute(sql`insert into app_settings(key,value) values
      ('admin_pin_salt', ${salt}),
      ('admin_pin_hash', ${sha(`${salt}:${TEST_PIN}`)}),
      ('admin_recovery_hash', ${sha(`${salt}:ABCD-5678`)})`);
  }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cabtrack-check-'));
  const logFd = fs.openSync(path.join(tmp, 'next.log'), 'w');
  console.log('TEST: database seeded; starting isolated production server');
  let server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', '3100'], {
    cwd: process.cwd(), env: { ...process.env, DATABASE_URL: TEST_URL }, detached: true, stdio: ['ignore', logFd, logFd],
  });
  fs.closeSync(logFd);
  const healthy = () => new Promise(resolve => {
    const req = http.get(`${HTTP_BASE}/api/health`, res => { res.resume(); resolve(res.statusCode === 200); });
    req.on('error', () => resolve(false));
    req.setTimeout(2000, () => { req.destroy(); resolve(false); });
  });
  for (let i = 0; i < 90; i++) {
    if (await healthy()) break;
    if (i === 89) throw new Error(fs.readFileSync(path.join(tmp, 'next.log'), 'utf8'));
    await new Promise(r => setTimeout(r, 500));
  }
  console.log('TEST: production server healthy; preparing HTTPS browser proxy');
  const cert = path.join(tmp, 'cert.pem');
  const key = path.join(tmp, 'key.pem');
  execFileSync('openssl', ['req', '-x509', '-nodes', '-newkey', 'rsa:2048', '-keyout', key, '-out', cert, '-days', '1', '-subj', '/CN=app.cab.test', '-addext', 'subjectAltName=DNS:app.cab.test,DNS:shell.preview.test,DNS:localhost'], { stdio: 'ignore' });
  const proxy = https.createServer({ key: fs.readFileSync(key), cert: fs.readFileSync(cert) }, (req, res) => {
    if ((req.headers.host || '').startsWith('shell.preview.test')) {
      const u = new URL(req.url, SHELL_BASE);
      const route = u.searchParams.get('path') || '/';
      res.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' });
      res.end(`<!doctype html><html><head><title>Embedded preview test</title></head><body style="margin:0"><iframe id="app" src="${HTTPS_BASE}${route.replace(/"/g, '&quot;')}" style="width:100%;height:100vh;border:0" allow="clipboard-write"></iframe></body></html>`);
      return;
    }
    const upstream = http.request({ hostname: '127.0.0.1', port: 3100, method: req.method, path: req.url,
      headers: { ...req.headers, 'x-forwarded-proto': 'https', 'x-forwarded-host': 'app.cab.test:3443' },
    }, up => { res.writeHead(up.statusCode, up.headers); up.pipe(res); });
    upstream.on('error', e => { res.writeHead(502); res.end(e.message); });
    req.pipe(upstream);
  });
  await new Promise(r => proxy.listen(3443, '0.0.0.0', r));
  const browser = await chromium.launch({ headless: true,
    args: ['--no-sandbox', '--no-proxy-server', '--host-resolver-rules=MAP app.cab.test 127.0.0.1,MAP shell.preview.test 127.0.0.1', '--test-third-party-cookie-phaseout'],
  });
  return {
    db, pool, sql, browser, tmp,
    async context(options = {}) { return browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1440, height: 1000 }, ...options }); },
    async restart() {
      try { process.kill(-server.pid, 'SIGTERM'); } catch {}
      await new Promise(r => setTimeout(r, 1200));
      const fd = fs.openSync(path.join(tmp, 'next.log'), 'a');
      server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', '3100'], {
        cwd: process.cwd(), env: { ...process.env, DATABASE_URL: TEST_URL }, detached: true, stdio: ['ignore', fd, fd],
      });
      fs.closeSync(fd);
      for (let i = 0; i < 60; i++) {
        if (await healthy()) return;
        await new Promise(r => setTimeout(r, 500));
      }
      throw new Error('Test server failed to restart');
    },
    async stop() {
      await browser.close();
      proxy.closeAllConnections();
      await new Promise(r => proxy.close(r));
      try { process.kill(-server.pid, 'SIGTERM'); } catch {}
      await pool.end();
      await new Promise(r => setTimeout(r, 500));
      await admin.execute(sql.raw(`DROP DATABASE IF EXISTS ${TEST_DB} WITH (FORCE)`));
      await adminPool.end();
    },
  };
}

module.exports = { environment, HTTP_BASE, HTTPS_BASE, SHELL_BASE, TEST_PIN };
