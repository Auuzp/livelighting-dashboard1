const { test, describe, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

// Set test environment
process.env.NODE_ENV = 'test';
delete process.env.DATABASE_URL;

const app = require('../server');
const db = require('../db');

describe('Health check and diagnostics security tests', () => {
  let server;
  let baseUrl;
  let originalPing;
  let originalNodeEnv;
  let originalEnableDiagnostics;

  before(async () => {
    await db.initSchema();
    await new Promise((resolve) => {
      server = http.createServer(app);
      server.listen(0, '127.0.0.1', () => {
        const port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  beforeEach(() => {
    originalPing = db.ping;
    originalNodeEnv = process.env.NODE_ENV;
    originalEnableDiagnostics = process.env.ENABLE_DIAGNOSTICS;
  });

  afterEach(() => {
    db.ping = originalPing;
    if (originalNodeEnv !== undefined) {
      process.env.NODE_ENV = originalNodeEnv;
    } else {
      delete process.env.NODE_ENV;
    }
    if (originalEnableDiagnostics !== undefined) {
      process.env.ENABLE_DIAGNOSTICS = originalEnableDiagnostics;
    } else {
      delete process.env.ENABLE_DIAGNOSTICS;
    }
  });

  test('GET /healthz returns 200 and generic {"status":"ok"} when database is healthy', async () => {
    db.ping = async () => true;

    const res = await fetch(`${baseUrl}/healthz`);
    assert.equal(res.status, 200);

    const data = await res.json();
    assert.deepEqual(data, { status: 'ok' });
    assert.equal(Object.keys(data).length, 1);
    assert.equal(data.dbType, undefined);
    assert.equal(data.tables, undefined);
  });

  test('GET /healthz returns 503 and generic {"status":"unavailable"} when database ping returns false', async () => {
    db.ping = async () => false;

    const res = await fetch(`${baseUrl}/healthz`);
    assert.equal(res.status, 503);

    const data = await res.json();
    assert.deepEqual(data, { status: 'unavailable' });
    assert.equal(Object.keys(data).length, 1);
    assert.equal(data.error, undefined);
  });

  test('GET /healthz returns 503 and does not leak internal error when ping throws', async () => {
    db.ping = async () => {
      throw new Error('Secret internal connection failure: postgres://user:pass@host:5432/db');
    };

    const res = await fetch(`${baseUrl}/healthz`);
    assert.equal(res.status, 503);

    const data = await res.json();
    assert.deepEqual(data, { status: 'unavailable' });
    assert.equal(data.error, undefined);
    assert.equal(data.message, undefined);
  });

  test('GET /api/diagnose in production returns 404 even if ENABLE_DIAGNOSTICS is true', async () => {
    process.env.NODE_ENV = 'production';
    process.env.ENABLE_DIAGNOSTICS = 'true';

    const res = await fetch(`${baseUrl}/api/diagnose`);
    assert.equal(res.status, 404);

    const text = await res.text();
    assert.ok(!text.includes('dbType'));
    assert.ok(!text.includes('connectionOk'));
  });

  test('GET /api/diagnose is disabled by default in development/test (returns 404)', async () => {
    process.env.NODE_ENV = 'development';
    delete process.env.ENABLE_DIAGNOSTICS;

    const res = await fetch(`${baseUrl}/api/diagnose`);
    assert.equal(res.status, 404);
  });

  test('GET /api/diagnose works in development/test when ENABLE_DIAGNOSTICS is true', async () => {
    process.env.NODE_ENV = 'development';
    process.env.ENABLE_DIAGNOSTICS = 'true';

    const res = await fetch(`${baseUrl}/api/diagnose`);
    assert.equal(res.status, 200);

    const data = await res.json();
    assert.ok('dbType' in data);
    assert.ok('connectionOk' in data);
    assert.ok('tables' in data);
  });

  test('db.ping() is read-only and does not mutate database tables or records', async () => {
    const beforeReport = await db.diagnose();
    assert.equal(beforeReport.connectionOk, true);

    const alive = await db.ping();
    assert.equal(typeof alive, 'boolean');
    assert.equal(alive, true);

    const afterReport = await db.diagnose();
    assert.deepEqual(beforeReport.tables, afterReport.tables);
  });
});
