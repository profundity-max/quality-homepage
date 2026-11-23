'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const {
  COLLECTIONS,
  countRecords,
  changedRecords,
  mergeRec,
  mergeState,
  normRec,
  normalize,
  sameRecord,
} = require('../domain/model');
const { validateMutation } = require('../domain/business-rules');
const {
  createIdentityResolver,
  normalizeAdminNames,
  normKey,
  publicIdentity,
  safeEqual,
} = require('../application/identity');
const { createStoreRepository } = require('../application/store-repository');

const MAX_BODY_BYTES = 64 * 1024 * 1024;
const MAX_FUTURE_SKEW_MS = 10 * 60 * 1000;
const CHANGE_CAP = 5000;
const MIME = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
};

function createBuildFingerprint(publicDir) {
  const hash = crypto.createHash('sha1');
  function walk(directory) {
    for (const entry of fs.readdirSync(directory).sort()) {
      const fullPath = path.join(directory, entry);
      const stats = fs.statSync(fullPath);
      if (stats.isDirectory()) walk(fullPath);
      else {
        hash.update(path.relative(publicDir, fullPath));
        hash.update(fs.readFileSync(fullPath));
      }
    }
  }
  try {
    walk(publicDir);
    return hash.digest('hex').slice(0, 12);
  } catch {
    return `missing-${Date.now().toString(36)}`;
  }
}

function createServer({
  publicDir,
  dataDir,
  title = '物资申领与消耗追溯',
  token = '',
  adminKey,
  adminKeySource = 'default',
  ssoEnabled = false,
  systemAdminNames = '武欣雨,熊光芬',
  keepBackups = 200,
  now = () => Date.now(),
}) {
  const repository = createStoreRepository({ dataDir, keepBackups });
  const systemAdministrators = normalizeAdminNames(systemAdminNames);
  const build = createBuildFingerprint(publicDir);
  const bootId = crypto.randomBytes(4).toString('hex');
  const sseClients = new Map();
  let clientSequence = 0;
  let state = repository.load();
  let changes = [];

  const resolveIdentity = createIdentityResolver({
    ssoEnabled,
    adminKey,
    adminNames: systemAdministrators,
    dataProvider: () => state.data,
  });

  function securityHeaders(response) {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    response.setHeader('X-Frame-Options', 'DENY');
    response.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; object-src 'none'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'",
    );
  }

  function applyCors(response) {
    if (ssoEnabled) return;
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Access-Control-Allow-Methods', 'GET, PUT, POST, OPTIONS');
    response.setHeader(
      'Access-Control-Allow-Headers',
      'content-type, x-share-token, x-admin-key, x-user-name, x-user-username, x-user-role, x-user-region',
    );
  }

  function sendJSON(response, statusCode, payload) {
    securityHeaders(response);
    applyCors(response);
    response.writeHead(statusCode, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    });
    response.end(JSON.stringify(payload));
  }

  function sendText(response, statusCode, text) {
    securityHeaders(response);
    applyCors(response);
    response.writeHead(statusCode, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
    });
    response.end(text);
  }

  function readBody(request) {
    return new Promise((resolve, reject) => {
      const chunks = [];
      let size = 0;
      request.on('data', (chunk) => {
        size += chunk.length;
        if (size > MAX_BODY_BYTES) {
          reject(Object.assign(new Error('请求体过大'), { statusCode: 413 }));
          request.destroy();
          return;
        }
        chunks.push(chunk);
      });
      request.on('end', () => {
        if (!chunks.length) {
          resolve(null);
          return;
        }
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
        } catch {
          reject(Object.assign(new Error('非法 JSON'), { statusCode: 400 }));
        }
      });
      request.on('error', reject);
    });
  }

  function tokenAccepted(request, url) {
    if (!token) return true;
    const header = request.headers['x-share-token'];
    return header === token || url.searchParams.get('token') === token;
  }

  function identityOrNull(request, body = null) {
    return resolveIdentity(request, body);
  }

  function requireIdentity(request, response, body = null) {
    const identity = identityOrNull(request, body);
    if (!identity) {
      sendJSON(response, 401, {
        ok: false,
        error: ssoEnabled ? '缺少有效的品集登录身份，请从品集应用中心进入' : '缺少有效身份',
      });
      return null;
    }
    return identity;
  }

  function scopeOf(identity) {
    if (!identity || identity.admin) return 'all';
    return identity.role === '区域领用人' ? 'mine' : 'all';
  }

  function userPayload(identity) {
    return {
      ...publicIdentity(identity),
      systemAdminNames: systemAdministrators,
      authMode: ssoEnabled ? 'qnexus' : 'standalone',
    };
  }

  function noteChanges(previousData, nextData, version) {
    for (const collection of COLLECTIONS) {
      const previous = previousData[collection] || {};
      const next = nextData[collection] || {};
      for (const id of new Set([...Object.keys(previous), ...Object.keys(next)])) {
        const before = previous[id] || null;
        const after = next[id] || null;
        if (before && after && sameRecord(before, after)) continue;
        if (!before && !after) continue;
        changes.push({ seq: version, coll: collection, id });
      }
    }
    const previousTombs = previousData.tomb || {};
    const nextTombs = nextData.tomb || {};
    for (const id of new Set([...Object.keys(previousTombs), ...Object.keys(nextTombs)])) {
      if ((Number(previousTombs[id]) || 0) === (Number(nextTombs[id]) || 0)) continue;
      changes.push({ seq: version, coll: '', id });
    }
    if (changes.length > CHANGE_CAP) changes = changes.slice(-CHANGE_CAP);
  }

  function changesSince(since) {
    if (!Number.isFinite(since) || since < 0 || since > state.ver) return null;
    const selected = changes.filter((change) => change.seq > since);
    if (!selected.length) return since === state.ver ? [] : null;
    if (selected[0].seq > since + 1) return null;
    return selected;
  }

  function changelogPayload(selected) {
    const output = [];
    const seen = new Set();
    for (const change of selected) {
      const key = `${change.coll}/${change.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (!change.coll) {
        output.push({
          coll: '',
          id: change.id,
          tomb: Number((state.data.tomb || {})[change.id]) || 0,
        });
        for (const collection of COLLECTIONS) {
          const record = state.data[collection] && state.data[collection][change.id];
          if (record) output.push({ coll: collection, id: change.id, rec: record });
        }
        continue;
      }
      const record = state.data[change.coll] && state.data[change.coll][change.id];
      output.push({ coll: change.coll, id: change.id, rec: record || null });
    }
    return output;
  }

  function onlineList() {
    const seen = new Map();
    for (const client of sseClients.values()) {
      const name = client.name || `匿名${client.id}`;
      const current = seen.get(name) || { name, count: 0 };
      current.count += 1;
      seen.set(name, current);
    }
    return [...seen.values()].map(
      (entry) => `${entry.name}${entry.count > 1 ? `×${entry.count}` : ''}`,
    );
  }

  function broadcast(event, payload, excludedClientId) {
    const line = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
    for (const [clientId, client] of sseClients) {
      if (clientId === excludedClientId) continue;
      try {
        client.response.write(line);
      } catch {
        // 断开连接由 close 事件统一清理。
      }
    }
  }

  function broadcastPresence() {
    broadcast('presence', { online: onlineList() });
  }

  function commit(nextState, identity, previousData) {
    const prepared = normalize(nextState);
    prepared.ver = state.ver + 1;
    prepared.updatedAt = now();
    prepared.updatedBy = identity.name || '—';
    const warnings = repository.save(prepared, identity, previousData);
    state = prepared;
    noteChanges(previousData, prepared.data, prepared.ver);
    broadcast('update', { ver: prepared.ver, by: prepared.updatedBy });
    return warnings;
  }

  function healthPayload(request) {
    const identity = identityOrNull(request);
    return {
      ok: true,
      ver: state.ver,
      build,
      records: countRecords(state.data),
      items: countRecords(state.data),
      online: onlineList(),
      needToken: Boolean(token),
      title,
      authMode: ssoEnabled ? 'qnexus' : 'standalone',
      adminKeySource: ssoEnabled ? 'qnexus' : adminKeySource,
      serverTime: now(),
      user: userPayload(identity),
    };
  }

  function serveStatic(request, response, url) {
    if (ssoEnabled && !identityOrNull(request)) {
      sendText(response, 401, '请从品集应用中心进入');
      return;
    }
    if (!tokenAccepted(request, url)) {
      sendText(response, 401, '需要口令');
      return;
    }
    let pathname;
    try {
      pathname = decodeURIComponent(url.pathname);
    } catch {
      sendText(response, 400, '无效路径');
      return;
    }
    if (pathname === '/' || pathname === '') pathname = '/index.html';
    const filePath = path.normalize(path.join(publicDir, pathname));
    const relative = path.relative(publicDir, filePath);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      sendText(response, 403, 'Forbidden');
      return;
    }
    fs.readFile(filePath, (error, contents) => {
      if (error) {
        sendText(response, 404, 'Not Found');
        return;
      }
      securityHeaders(response);
      response.writeHead(200, {
        'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream',
        'Cache-Control': pathname === '/index.html' ? 'no-store' : 'no-cache',
      });
      response.end(contents);
    });
  }

  async function handleOperations(request, response) {
    if (!tokenAccepted(request, new URL(request.url, 'http://localhost'))) {
      sendJSON(response, 401, { error: '需要口令' });
      return;
    }
    let body;
    try {
      body = await readBody(request);
    } catch (error) {
      sendJSON(response, error.statusCode || 400, { error: error.message });
      return;
    }
    const identity = requireIdentity(request, response, body);
    if (!identity) return;

    const rawOperations = Array.isArray(body && body.ops) ? body.ops.slice(0, 3000) : [];
    if (!rawOperations.length) {
      sendJSON(response, 400, { error: '没有可提交的改动' });
      return;
    }

    const draft = normalize(state);
    const previousData = state.data;
    const applied = [];
    const rejected = [];
    let touched = 0;

    for (const operation of rawOperations) {
      const collection = String(operation && (operation.collection || operation.coll) || '');
      const id = String(operation && operation.id || '');
      if (!COLLECTIONS.includes(collection) || !id) {
        rejected.push({ coll: collection, id, reason: '集合或记录标识无效' });
        continue;
      }
      const existing = draft.data[collection][id] || null;
      const tombstoneAt = Number(draft.data.tomb[id]) || 0;

      if (operation.deleted || operation.del) {
        const timestamp = Math.max(
          Number(operation.ts) || now(),
          (existing && Number(existing.ts) + 1) || 0,
          tombstoneAt + 1,
        );
        const previousPartial = {
          tomb: { ...draft.data.tomb },
          [collection]: existing ? { [id]: existing } : {},
        };
        const nextPartial = {
          tomb: { ...draft.data.tomb, [id]: timestamp },
          [collection]: {},
        };
        const violations = validateMutation({
          previousData: previousPartial,
          nextData: nextPartial,
          fullData: draft.data,
          who: identity,
        });
        if (violations.length) {
          rejected.push({ coll: collection, id, reason: violations[0] });
          continue;
        }
        draft.data.tomb[id] = timestamp;
        delete draft.data[collection][id];
        touched += 1;
        applied.push({ coll: collection, id, rec: null, del: true, ts: timestamp });
        continue;
      }

      const recordPayload = operation.record || operation.rec;
      if (!recordPayload || typeof recordPayload !== 'object') {
        rejected.push({ coll: collection, id, reason: '记录内容为空' });
        continue;
      }
      const candidate = normRec({ ...recordPayload, id });
      let timestamp = Number(candidate.ts) || 0;
      if (!timestamp) {
        rejected.push({ coll: collection, id, reason: '记录缺少时间戳' });
        continue;
      }
      const maxTimestamp = now() + MAX_FUTURE_SKEW_MS;
      if (timestamp > maxTimestamp) timestamp = maxTimestamp;
      candidate.ts = timestamp;
      for (const key of Object.keys(candidate.f)) {
        if (candidate.f[key] > timestamp) candidate.f[key] = timestamp;
      }
      if (tombstoneAt >= candidate.ts) {
        applied.push({
          coll: collection,
          id,
          rec: null,
          del: true,
          ts: tombstoneAt,
          note: '该记录已被他人删除',
        });
        continue;
      }
      const baseTimestamp = Number(operation.baseTs) || 0;
      if (tombstoneAt > 0 && tombstoneAt >= baseTimestamp && tombstoneAt < candidate.ts) {
        applied.push({
          coll: collection,
          id,
          rec: null,
          del: true,
          ts: tombstoneAt,
        });
        rejected.push({
          coll: collection,
          id,
          reason: '该记录已被他人删除，本次修改未保存',
        });
        continue;
      }

      const merged = existing ? mergeRec(existing, candidate) : candidate;
      const previousPartial = {
        tomb: { ...draft.data.tomb },
        [collection]: existing ? { [id]: existing } : {},
      };
      const nextPartial = {
        tomb: { ...draft.data.tomb },
        [collection]: { [id]: merged },
      };
      const violations = validateMutation({
        previousData: previousPartial,
        nextData: nextPartial,
        fullData: draft.data,
        who: identity,
      });
      if (violations.length) {
        rejected.push({ coll: collection, id, reason: violations[0] });
        continue;
      }
      if (existing && sameRecord(existing, merged)) {
        applied.push({ coll: collection, id, rec: merged });
        continue;
      }
      draft.data[collection][id] = merged;
      touched += 1;
      applied.push({ coll: collection, id, rec: merged });
    }

    if (!touched) {
      sendJSON(response, 200, {
        ok: true,
        ver: state.ver,
        seq: state.ver,
        boot: bootId,
        applied,
        rejected,
        touched: 0,
        serverTime: now(),
        ver_note: '每条记录独立字段级合并',
      });
      return;
    }

    const warnings = commit(draft, identity, previousData);
    sendJSON(response, 200, {
      ok: true,
      ver: state.ver,
      seq: state.ver,
      boot: bootId,
      applied,
      rejected,
      touched,
      serverTime: now(),
      user: userPayload(identity),
      warnings,
      ver_note: '每条记录独立字段级合并',
    });
  }

  async function handleMaterialImport(request, response) {
    let body;
    try {
      body = await readBody(request);
    } catch (error) {
      sendJSON(response, error.statusCode || 400, { error: error.message });
      return;
    }
    const identity = requireIdentity(request, response, body);
    if (!identity) return;
    if (!identity.admin && !identity.memberId) {
      sendJSON(response, 403, {
        ok: false,
        error: '只有成员名单中的已登记人员或管理员可以导入物料档案',
      });
      return;
    }
    const rows = Array.isArray(body && body.materials) ? body.materials.slice(0, 5000) : [];
    if (!rows.length) {
      sendJSON(response, 400, { ok: false, error: '没有可导入的物料记录' });
      return;
    }
    const draft = normalize(state);
    const previousData = state.data;
    const applied = [];
    const rejected = [];
    let touched = 0;
    const allowedFields = ['code', 'name', 'spec', 'unit', 'category', 'safe', 'note'];
    for (const row of rows) {
      if (!row || typeof row !== 'object') continue;
      let id = String(row.id || '').trim();
      if (!id) {
        const code = String(row.code || '').trim();
        const name = String(row.name || '').trim();
        const matched = Object.values(draft.data.materials).find(
          (material) =>
            (code && String(material.code || '').trim() === code)
            || (name && String(material.name || '').trim() === name),
        );
        id = matched ? matched.id : crypto.randomUUID();
      }
      const existing = draft.data.materials[id] || null;
      const timestamp = Math.max(now(), Number(existing && existing.ts) + 1 || 0);
      const record = {
        id,
        ts: timestamp,
        by: existing ? existing.by : (identity.name || identity.username || '导入'),
        f: {},
      };
      for (const key of allowedFields) {
        if (!Object.prototype.hasOwnProperty.call(row, key)) continue;
        record[key] = row[key];
        record.f[key] = timestamp;
      }
      const candidate = normRec(record);
      const merged = existing ? mergeRec(existing, candidate) : candidate;
      if (!String(merged.name || '').trim()) {
        rejected.push({ id, reason: '物料名称不能为空' });
        continue;
      }
      if (!Number.isFinite(Number(merged.safe ?? 0)) || Number(merged.safe ?? 0) < 0) {
        rejected.push({ id, reason: '安全库存必须是非负数' });
        continue;
      }
      if (existing && sameRecord(existing, merged)) {
        applied.push({ id, record: merged });
        continue;
      }
      draft.data.materials[id] = merged;
      touched += 1;
      applied.push({ id, record: merged });
    }
    if (touched) commit(draft, identity, previousData);
    sendJSON(response, 200, {
      ok: true,
      ver: state.ver,
      applied,
      rejected,
      touched,
      user: userPayload(identity),
      serverTime: now(),
    });
  }

  async function handleWholeStore(request, response) {
    if (!tokenAccepted(request, new URL(request.url, 'http://localhost'))) {
      sendJSON(response, 401, { error: '需要口令' });
      return;
    }
    let body;
    try {
      body = await readBody(request);
    } catch (error) {
      sendJSON(response, error.statusCode || 400, { error: error.message });
      return;
    }
    const identity = requireIdentity(request, response, body);
    if (!identity) return;

    const incoming = normalize(body && body.data);
    const merged = mergeState(state, incoming);
    const violations = validateMutation({
      previousData: state.data,
      nextData: merged.data,
      fullData: merged.data,
      who: identity,
    });
    if (violations.length) {
      sendJSON(response, 403, {
        ok: false,
        error: '写权限或业务校验未通过',
        violations,
      });
      return;
    }
    if (!changedRecords(state.data, merged.data).length) {
      sendJSON(response, 200, { ver: state.ver, conflict: false, data: state.data });
      return;
    }
    const conflict = Number(body && body.ver) !== state.ver;
    const warnings = commit(merged, identity, state.data);
    sendJSON(response, 200, {
      ver: state.ver,
      conflict,
      data: state.data,
      warnings,
    });
  }


  async function handleRestore(request, response) {
    let body;
    try {
      body = await readBody(request);
    } catch (error) {
      sendJSON(response, error.statusCode || 400, { error: error.message });
      return;
    }
    const identity = requireIdentity(request, response, body);
    if (!identity) return;
    if (!identity.admin) {
      sendJSON(response, 403, { ok: false, error: '整库恢复需要管理员权限' });
      return;
    }
    if (!body || body.confirm !== 'REPLACE_ALL') {
      sendJSON(response, 400, {
        ok: false,
        error: '整库恢复需要明确确认',
      });
      return;
    }
    const restored = normalize(body.data);
    const restoreTimestamp = now();
    for (const collection of COLLECTIONS) {
      const currentRecords = state.data[collection] || {};
      const restoredRecords = restored.data[collection] || {};
      for (const id of Object.keys(currentRecords)) {
        if (restoredRecords[id]) continue;
        restored.data.tomb[id] = Math.max(
          Number(restored.data.tomb[id]) || 0,
          restoreTimestamp,
          Number(currentRecords[id].ts) + 1 || 0,
        );
      }
    }
    const warnings = commit(restored, identity, state.data);
    sendJSON(response, 200, { ok: true, ver: state.ver, warnings });
  }

  async function handleWipe(request, response) {
    let body;
    try {
      body = await readBody(request);
    } catch (error) {
      sendJSON(response, error.statusCode || 400, { error: error.message });
      return;
    }
    const identity = requireIdentity(request, response, body);
    if (!identity) return;
    if (!identity.admin) {
      sendJSON(response, 403, { ok: false, error: '清空数据需要管理员权限' });
      return;
    }
    const previousData = state.data;
    const empty = normalize(null);
    const wipeTimestamp = now();
    for (const collection of COLLECTIONS) {
      for (const id of Object.keys(previousData[collection] || {})) {
        empty.data.tomb[id] = Math.max(
          Number(empty.data.tomb[id]) || 0,
          wipeTimestamp,
          Number(previousData[collection][id].ts) + 1 || 0,
        );
      }
    }
    const warnings = commit(empty, identity, previousData);
    sendJSON(response, 200, { ok: true, ver: state.ver, warnings });
  }

  function handleEvents(request, response, url) {
    if (!tokenAccepted(request, url)) {
      sendJSON(response, 401, { error: '需要口令' });
      return;
    }
    const identity = requireIdentity(request, response);
    if (!identity) return;
    const clientId = String(url.searchParams.get('client') || `c${++clientSequence}`).slice(0, 128);
    response.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    sseClients.set(clientId, { id: clientId, name: identity.name, response });
    response.write(
      `event: hello\ndata: ${JSON.stringify({ ver: state.ver, clientId })}\n\n`,
    );
    broadcastPresence();
    const heartbeat = setInterval(() => {
      try {
        response.write(': heartbeat\n\n');
      } catch {
        // 连接关闭时由 close 清理。
      }
    }, 15000);
    response.on('close', () => {
      clearInterval(heartbeat);
      sseClients.delete(clientId);
      broadcastPresence();
    });
  }

  const server = http.createServer(async (request, response) => {
    let url;
    try {
      url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
    } catch {
      sendText(response, 400, '无效请求');
      return;
    }
    if (request.method === 'OPTIONS') {
      securityHeaders(response);
      applyCors(response);
      response.writeHead(204);
      response.end();
      return;
    }

    try {
      if (url.pathname === '/api/health' && request.method === 'GET') {
        sendJSON(response, 200, healthPayload(request));
        return;
      }
      if (url.pathname === '/api/build' && request.method === 'GET') {
        sendJSON(response, 200, { ok: true, build, serverTime: now() });
        return;
      }
      if (url.pathname === '/api/verify-key') {
        if (ssoEnabled) {
          const identity = requireIdentity(request, response);
          if (!identity) return;
          sendJSON(response, 200, {
            ok: true,
            isAdmin: identity.admin,
            authMode: 'qnexus',
            adminKeySource: 'qnexus',
          });
          return;
        }
        let body;
        try {
          body = await readBody(request);
        } catch (error) {
          sendJSON(response, error.statusCode || 400, { error: error.message });
          return;
        }
        const typed = body && typeof body.adminKey === 'string' ? body.adminKey : '';
        const normalized = normKey(typed);
        sendJSON(response, 200, {
          ok: true,
          isAdmin: safeEqual(normalized, adminKey),
          adminKeySource,
          len: normalized.length,
          hadInvisible: /[\u200B-\u200F\u202A-\u202E\u2060\uFEFF]/.test(typed),
          hadFullWidth: /[^\x00-\x7F]/.test(
            typed.replace(/[\u200B-\u200F\u202A-\u202E\u2060\uFEFF]/g, ''),
          ),
        });
        return;
      }
      if (url.pathname === '/api/wipe' && request.method === 'POST') {
        await handleWipe(request, response);
        return;
      }
      if (url.pathname === '/api/restore' && request.method === 'POST') {
        await handleRestore(request, response);
        return;
      }
      if (url.pathname === '/api/store' && request.method === 'GET') {
        if (!tokenAccepted(request, url)) {
          sendJSON(response, 401, { error: '需要口令' });
          return;
        }
        const identity = requireIdentity(request, response);
        if (!identity) return;
        const sinceRaw = url.searchParams.get('since');
        if (sinceRaw !== null && sinceRaw !== '') {
          const selected = changesSince(Number(sinceRaw));
          if (selected) {
            sendJSON(response, 200, {
              partial: true,
              ver: state.ver,
              seq: state.ver,
              boot: bootId,
              isAdmin: identity.admin,
              scope: scopeOf(identity),
              changes: changelogPayload(selected),
              serverTime: now(),
              authMode: ssoEnabled ? 'qnexus' : 'standalone',
              user: userPayload(identity),
              adminKeySource: ssoEnabled ? 'qnexus' : adminKeySource,
            });
            return;
          }
        }
        sendJSON(response, 200, {
          ver: state.ver,
          updatedAt: state.updatedAt,
          updatedBy: state.updatedBy,
          isAdmin: identity.admin,
          scope: scopeOf(identity),
          boot: bootId,
          seq: state.ver,
          adminKeySource: ssoEnabled ? 'qnexus' : adminKeySource,
          authMode: ssoEnabled ? 'qnexus' : 'standalone',
          user: userPayload(identity),
          build,
          data: state.data,
        });
        return;
      }
      if (url.pathname === '/api/ops' && request.method === 'POST') {
        await handleOperations(request, response);
        return;
      }
      if (url.pathname === '/api/import/materials' && request.method === 'POST') {
        await handleMaterialImport(request, response);
        return;
      }
      if (url.pathname === '/api/store' && request.method === 'PUT') {
        await handleWholeStore(request, response);
        return;
      }
      if (url.pathname === '/api/events' && request.method === 'GET') {
        handleEvents(request, response, url);
        return;
      }
      if (request.method === 'GET') {
        serveStatic(request, response, url);
        return;
      }
      sendText(response, 404, 'Not Found');
    } catch (error) {
      console.error('Unhandled request failure', error);
      if (!response.headersSent) {
        sendJSON(response, 500, { ok: false, error: '服务器内部错误' });
      } else {
        response.end();
      }
    }
  });

  server.on('clientError', (error, socket) => {
    if (!socket.writable) return;
    socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
  });

  function close() {
    for (const client of sseClients.values()) {
      try {
        client.response.end();
      } catch {
        // 已关闭。
      }
    }
    sseClients.clear();
    return new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }

  return {
    build,
    close,
    getState: () => state,
    repository,
    server,
  };
}

module.exports = {
  MAX_BODY_BYTES,
  MAX_FUTURE_SKEW_MS,
  createBuildFingerprint,
  createServer,
};
