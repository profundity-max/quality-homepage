'use strict';

const assert = require('node:assert/strict');
const { mkdtemp, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const test = require('node:test');

const { createApplication } = require('../server');

async function startApp(t, environment = {}) {
  const dataDir = await mkdtemp(join(tmpdir(), 'wuzhi-trace-'));
  const app = createApplication({
    ...process.env,
    PORT: '0',
    SHARE_DATA_DIR: dataDir,
    WZ_ADMIN_KEY: 'integration-admin-key',
    ...environment,
  });
  await new Promise((resolve, reject) => {
    app.server.once('error', reject);
    app.server.listen(0, '127.0.0.1', resolve);
  });
  const address = app.server.address();
  const base = `http://127.0.0.1:${address.port}`;
  t.after(async () => {
    await app.close().catch(() => undefined);
    await rm(dataDir, { recursive: true, force: true });
  });
  return { app, base, dataDir };
}

async function json(base, pathname, options = {}) {
  const response = await fetch(base + pathname, options);
  const body = await response.json();
  return { response, body };
}

function op(collection, id, fields, extra = {}) {
  const ts = extra.ts || Date.now();
  return {
    coll: collection,
    id,
    ts,
    baseTs: 0,
    rec: { id, ts, by: extra.by || '测试', ...fields, f: Object.fromEntries(Object.keys(fields).map((key) => [key, ts])) },
    ...extra,
  };
}

const adminHeaders = {
  'content-type': 'application/json',
  'x-admin-key': 'integration-admin-key',
};
const clerkHeaders = {
  'content-type': 'application/json',
  'x-user-name': encodeURIComponent('文员甲'),
  'x-user-role': encodeURIComponent('文员'),
};
const areaHeaders = {
  'content-type': 'application/json',
  'x-user-name': encodeURIComponent('领用人甲'),
  'x-user-role': encodeURIComponent('区域领用人'),
  'x-user-region': encodeURIComponent('IPQC2'),
};

async function write(base, operations, headers = adminHeaders) {
  return json(base, '/api/ops', {
    method: 'POST',
    headers,
    body: JSON.stringify({ ops: operations }),
  });
}

test('独立模式主流程、权限与数量约束由服务端执行并持久化', async (t) => {
  const first = await startApp(t);
  let result = await write(first.base, [
    op('materials', 'm1', { name: '无尘布', unit: '包', safe: 2 }),
    op('purchases', 'p1', { mid: 'm1', qty: 10, date: '2026-11-18' }),
    op('arrivals', 'a1', { pid: 'p1', mid: 'm1', arrQty: 10, arrDate: '2026-11-18' }),
    op('receipts', 'r1', { aid: 'a1', recvQty: 10, recvBy: '文员甲', recvAt: '2026-11-18 10:00' }),
    op('dispatches', 'd1', { aid: 'a1', mid: 'm1', region: 'IPQC2', qty: 4, at: '2026-11-18 11:00', byWho: '文员甲' }),
  ]);
  assert.equal(result.response.status, 200);
  assert.equal(result.body.rejected.length, 0, JSON.stringify(result.body.rejected));

  result = await write(
    first.base,
    [op('signoffs', 's1', { did: 'd1', signer: '领用人甲', sigAt: '2026-11-18 11:10' }, { by: '领用人甲' })],
    areaHeaders,
  );
  assert.equal(result.response.status, 200);
  assert.equal(result.body.rejected.length, 0, JSON.stringify(result.body.rejected));

  result = await write(
    first.base,
    [op('dispatches', 'd2', { aid: 'a1', mid: 'm1', region: 'IPQC2', qty: 7, at: '2026-11-18 12:00', byWho: '文员甲' })],
    clerkHeaders,
  );
  assert.equal(result.response.status, 200);
  assert.match(result.body.rejected[0].reason, /不能超过该批次的实收数量/);

  const store = await json(first.base, '/api/store', { headers: clerkHeaders });
  assert.equal(store.response.status, 200);
  assert.equal(store.body.data.dispatches.d1.qty, 4);
  assert.equal(store.body.data.signoffs.s1.signer, '领用人甲');
  assert.equal(store.body.data.dispatches.d2, undefined);

  const second = createApplication({
    ...process.env,
    PORT: '0',
    SHARE_DATA_DIR: first.dataDir,
    WZ_ADMIN_KEY: 'integration-admin-key',
  });
  await new Promise((resolve, reject) => {
    second.server.once('error', reject);
    second.server.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => second.close());
  const secondAddress = second.server.address();
  const persisted = await json(`http://127.0.0.1:${secondAddress.port}`, '/api/store', { headers: clerkHeaders });
  assert.equal(persisted.body.data.signoffs.s1.signer, '领用人甲');
});

test('品集 SSO 模式拒绝无身份访问并映射管理员身份', async (t) => {
  const { base } = await startApp(t, { QNEXUS_SSO: '1' });
  const health = await json(base, '/api/health');
  assert.equal(health.response.status, 200);
  assert.equal(health.body.authMode, 'qnexus');

  const denied = await fetch(base + '/api/store');
  assert.equal(denied.status, 401);
  assert.equal(denied.headers.get('access-control-allow-origin'), null);

  const identityHeaders = {
    'x-q-nexus-subject': 'subject-admin',
    'x-q-nexus-username-b64': Buffer.from('admin.user').toString('base64url'),
    'x-q-nexus-display-name-b64': Buffer.from('管理员').toString('base64url'),
    'x-q-nexus-role': 'administrator',
  };
  const allowed = await json(base, '/api/store', { headers: identityHeaders });
  assert.equal(allowed.response.status, 200);
  assert.equal(allowed.body.user.role, '管理员');
  assert.equal(allowed.body.user.authMode, 'qnexus');
});

test('品集 SSO 模式下静态应用页面同样要求网关身份', async (t) => {
  const { base } = await startApp(t, { QNEXUS_SSO: '1' });
  const denied = await fetch(base + '/');
  assert.equal(denied.status, 401);

  const headers = {
    'x-q-nexus-subject': 'subject-editor',
    'x-q-nexus-username-b64': Buffer.from('editor.user').toString('base64url'),
    'x-q-nexus-display-name-b64': Buffer.from('文员用户').toString('base64url'),
    'x-q-nexus-role': 'editor',
  };
  const allowed = await fetch(base + '/', { headers });
  assert.equal(allowed.status, 200);
  assert.match(await allowed.text(), /物资申领与消耗追溯/);
  assert.equal(allowed.headers.get('x-content-type-options'), 'nosniff');
  assert.match(allowed.headers.get('content-security-policy'), /frame-ancestors 'none'/);
});

test('整库恢复需要管理员明确确认，并阻止旧客户端复活已移除记录', async (t) => {
  const { base } = await startApp(t);
  await write(base, [op('materials', 'm1', { name: '旧物料', unit: '包', safe: 1 })]);
  const rejected = await json(base, '/api/restore', {
    method: 'POST',
    headers: clerkHeaders,
    body: JSON.stringify({ confirm: 'REPLACE_ALL', data: { materials: {} } }),
  });
  assert.equal(rejected.response.status, 403);

  const restored = await json(base, '/api/restore', {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({
      confirm: 'REPLACE_ALL',
      data: { tomb: {}, materials: { m2: { id: 'm2', ts: Date.now(), by: '管理员', name: '新物料', unit: '包', safe: 1, f: {} } } },
    }),
  });
  assert.equal(restored.response.status, 200);
  const store = await json(base, '/api/store', { headers: adminHeaders });
  assert.equal(store.body.data.materials.m1, undefined);
  assert.equal(store.body.data.materials.m2.name, '新物料');
  assert.ok(store.body.data.tomb.m1 >= Date.now() - 60_000);
});
