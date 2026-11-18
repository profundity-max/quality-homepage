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
  'x-user-name': encodeURIComponent('武欣雨'),
  'x-user-username': encodeURIComponent('wuxinyu'),
  'x-user-role': encodeURIComponent('审核员'),
};
const reviewerHeaders = {
  'content-type': 'application/json',
  'x-user-name': encodeURIComponent('审核员甲'),
  'x-user-username': encodeURIComponent('reviewer'),
  'x-user-role': encodeURIComponent('审核员'),
};
const approverHeaders = {
  'content-type': 'application/json',
  'x-user-name': encodeURIComponent('核准员甲'),
  'x-user-username': encodeURIComponent('approver'),
  'x-user-role': encodeURIComponent('核准员'),
};
const areaHeaders = {
  'content-type': 'application/json',
  'x-user-name': encodeURIComponent('领用人甲'),
  'x-user-username': encodeURIComponent('area.lead'),
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

test('独立模式审批主流程、角色权限与数量约束由服务端执行并持久化', async (t) => {
  const first = await startApp(t);
  let result = await write(first.base, [
    op('materials', 'm1', { name: '无尘布', unit: '包', safe: 2 }),
    op('members', 'm-lead', {
      name: '领用人甲', username: 'area.lead', role: '区域领用人', region: 'IPQC2',
      enabled: true,
    }),
  ]);
  assert.equal(result.response.status, 200);
  assert.equal(result.body.rejected.length, 0, JSON.stringify(result.body.rejected));

  result = await write(
    first.base,
    [op('purchases', 'p1', {
      mid: 'm1', qty: 10, date: '2026-11-18', approvalStatus: '待审核',
    }, { by: '领用人甲' })],
    areaHeaders,
  );
  assert.equal(result.body.rejected.length, 0, JSON.stringify(result.body.rejected));

  result = await write(
    first.base,
    [op('purchases', 'p1', {
      mid: 'm1', qty: 10, date: '2026-11-18', approvalStatus: '待核准',
      reviewedBy: '审核员甲', reviewedAt: '2026-11-18 09:00',
    }, { by: '领用人甲' })],
    reviewerHeaders,
  );
  assert.equal(result.body.rejected.length, 0, JSON.stringify(result.body.rejected));

  result = await write(
    first.base,
    [op('purchases', 'p1', {
      mid: 'm1', qty: 10, date: '2026-11-18', approvalStatus: '已核准',
      reviewedBy: '审核员甲', reviewedAt: '2026-11-18 09:00',
      approvedBy: '核准员甲', approvedAt: '2026-11-18 10:00',
    }, { by: '领用人甲' })],
    approverHeaders,
  );
  assert.equal(result.body.rejected.length, 0, JSON.stringify(result.body.rejected));

  result = await write(first.base, [
    op('arrivals', 'a1', { pid: 'p1', mid: 'm1', arrQty: 10, arrDate: '2026-11-18' }),
    op('receipts', 'r1', { aid: 'a1', recvQty: 10, recvBy: '审核员甲', recvAt: '2026-11-18 10:30' }),
    op('dispatches', 'd1', {
      aid: 'a1', mid: 'm1', region: 'IPQC2', qty: 4, at: '2026-11-18 11:00',
      byWho: '审核员甲', claimantId: 'm-lead', claimantName: '领用人甲',
    }),
  ], reviewerHeaders);
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
    [op('dispatches', 'd2', {
      aid: 'a1', mid: 'm1', region: 'IPQC2', qty: 7, at: '2026-11-18 12:00',
      byWho: '审核员甲', claimantId: 'm-lead', claimantName: '领用人甲',
    })],
    reviewerHeaders,
  );
  assert.equal(result.response.status, 200);
  assert.match(result.body.rejected[0].reason, /不能超过该批次的实收数量/);

  const store = await json(first.base, '/api/store', { headers: reviewerHeaders });
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
  const persisted = await json(`http://127.0.0.1:${secondAddress.port}`, '/api/store', { headers: reviewerHeaders });
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
  assert.equal(allowed.body.user.role, '核准员');
  assert.equal(allowed.body.user.admin, true);
  assert.equal(allowed.body.user.systemAdmin, false);
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
    headers: reviewerHeaders,
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

test('品集编辑者武欣雨获得系统管理员身份并可维护成员名单', async (t) => {
  const { base } = await startApp(t, { QNEXUS_SSO: '1' });
  const wuxinyuHeaders = {
    'content-type': 'application/json',
    'x-q-nexus-subject': 'subject-wuxinyu',
    'x-q-nexus-username-b64': Buffer.from('wuxinyu').toString('base64url'),
    'x-q-nexus-display-name-b64': Buffer.from('武欣雨').toString('base64url'),
    'x-q-nexus-role': 'editor',
  };
  let result = await write(base, [
    op('members', 'm-lead', {
      name: '领用人甲', username: 'area.lead', role: '区域领用人', region: 'IPQC2',
      enabled: true,
    }),
  ], wuxinyuHeaders);
  assert.equal(result.response.status, 200);
  assert.equal(result.body.rejected.length, 0, JSON.stringify(result.body.rejected));
  assert.equal(result.body.user.systemAdmin, true);

  result = await write(base, [
    op('members', 'm-sub', {
      name: '领用人乙', username: 'area.member', role: '隶属区域领用人', region: 'IPQC2',
      supervisorId: 'm-lead', enabled: true,
    }),
  ], wuxinyuHeaders);
  assert.equal(result.body.rejected.length, 0, JSON.stringify(result.body.rejected));

  const reviewerHeaders = {
    'content-type': 'application/json',
    'x-q-nexus-subject': 'subject-reviewer',
    'x-q-nexus-username-b64': Buffer.from('reviewer').toString('base64url'),
    'x-q-nexus-display-name-b64': Buffer.from('审核员甲').toString('base64url'),
    'x-q-nexus-role': 'editor',
  };
  result = await write(base, [
    op('members', 'm-forbidden', {
      name: '越权成员', role: '区域领用人', region: 'OQC', enabled: true,
    }),
  ], reviewerHeaders);
  assert.match(result.body.rejected[0].reason, /仅系统管理员武欣雨可维护/);
});

test('成员名单中的普通成员可以导入物料档案，但不能手改或删除物料', async (t) => {
  const { base } = await startApp(t);
  await write(base, [
    op('members', 'm-lead', {
      name: '领用人甲', username: 'area.lead', role: '区域领用人', region: 'IPQC2', enabled: true,
    }),
  ]);
  const memberHeaders = {
    'content-type': 'application/json',
    'x-user-name': encodeURIComponent('领用人甲'),
    'x-user-username': encodeURIComponent('area.lead'),
    'x-user-role': encodeURIComponent('区域领用人'),
    'x-user-region': encodeURIComponent('IPQC2'),
  };
  let result = await json(base, '/api/import/materials', {
    method: 'POST',
    headers: memberHeaders,
    body: JSON.stringify({ materials: [{ id: 'm-import', code: 'CL-1', name: '无尘布', unit: '包', safe: 2 }] }),
  });
  assert.equal(result.response.status, 200);
  assert.equal(result.body.applied.length, 1);
  assert.equal(result.body.applied[0].record.name, '无尘布');

  result = await json(base, '/api/import/materials', {
    method: 'POST',
    headers: memberHeaders,
    body: JSON.stringify({ materials: [{ id: 'm-import', name: '无尘布升级', safe: 3 }] }),
  });
  assert.equal(result.body.applied.length, 1);
  assert.equal(result.body.applied[0].record.name, '无尘布升级');

  result = await write(base, [
    op('materials', 'm-import', { name: '手工修改', unit: '包', safe: 1 }, { by: '领用人甲' }),
  ], memberHeaders);
  assert.match(result.body.rejected[0].reason, /物料档案仅管理员可维护/);

  const unregistered = {
    'content-type': 'application/json',
    'x-user-name': encodeURIComponent('未登记人员'),
    'x-user-role': encodeURIComponent('区域领用人'),
  };
  const denied = await json(base, '/api/import/materials', {
    method: 'POST',
    headers: unregistered,
    body: JSON.stringify({ materials: [{ id: 'm-denied', name: '禁止物料' }] }),
  });
  assert.equal(denied.response.status, 403);
});
