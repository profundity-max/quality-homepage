/* 物资申领与消耗追溯 V1.2.6 — core.js：数据模型 / 派生计算 / 同步层 / Excel 读写 */
'use strict';
window.WZ = (function () {
  /* ---------------- 基础工具 ---------------- */
  const COLLS = ['materials', 'purchases', 'arrivals', 'receipts', 'dispatches', 'signoffs', 'members', 'logs'];
  const FIELDS = ['name', 'spec', 'unit', 'safe', 'note', 'code', 'category', 'mid', 'qty', 'date', 'purpose', 'dest', 'dept',
    'pid', 'arrQty', 'arrDate', 'aid', 'recvQty', 'recvBy', 'recvAt', 'region', 'at', 'byWho',
    'did', 'signer', 'sigData', 'sigAt', 'role', 'action', 'entity', 'refId', 'detail',
    'username', 'enabled', 'supervisorId', 'requestSource', 'approvalStatus', 'reviewedBy', 'reviewedAt',
    'reviewComment', 'approvedBy', 'approvedAt', 'approvalComment', 'rejectedBy',
    'rejectedAt', 'rejectionReason', 'claimantId', 'claimantName', 'approvalMode',
    'reviewerId', 'reviewerName', 'reviewerUsername', 'approverId', 'approverName',
    'approverUsername', 'submitterMemberId', 'routeResolvedAt'];
  /* ---- 部门 / 区域：可配置清单（设置页维护，localStorage 持久化） ---- */
  const ORG_KEY = 'WZ_ORG_CFG';
  const DEFAULT_DEPTS = ['品质部', '生产部', '工程部', '设备部', '仓储部', '采购部', '计划部', '业务部', '研发部', '行政部', '人力资源部', '财务部', 'IT信息部'];
  const DEFAULT_REGIONS = [
    { id: 'IPQC2', label: 'IPQC 2期' }, { id: 'IPQC3', label: 'IPQC 3期' }, { id: 'OQC', label: 'OQC' },
    { id: 'IQC', label: 'IQC' }, { id: '量测室', label: '量测室' }, { id: '实验室', label: '实验室' }
  ];
  function sanitizeOrg(o) {
    const rSeen = {}, regions = [];
    for (const r of (Array.isArray(o && o.regions) ? o.regions : DEFAULT_REGIONS)) {
      const id = String(r && r.id || '').trim(), label = String(r && r.label || '').trim() || id;
      if (id && !rSeen[id]) { rSeen[id] = 1; regions.push({ id, label }); }
    }
    if (!regions.length) DEFAULT_REGIONS.forEach(r => regions.push({ id: r.id, label: r.label }));
    const dSeen = {}, depts = [];
    for (const d of (Array.isArray(o && o.depts) ? o.depts : DEFAULT_DEPTS)) {
      const s = String(d || '').trim();
      if (s && !dSeen[s]) { dSeen[s] = 1; depts.push(s); }
    }
    if (!depts.length) DEFAULT_DEPTS.forEach(d => depts.push(d));
    return { depts, regions };
  }
  function loadOrg() { try { return sanitizeOrg(JSON.parse(localStorage.getItem(ORG_KEY) || 'null')); } catch (e) { return sanitizeOrg(null); } }
  let ORG = loadOrg();
  let REGIONS = ORG.regions.map(r => r.id);
  let REGION_LABEL = {}; ORG.regions.forEach(r => { REGION_LABEL[r.id] = r.label; });
  let DEPTS = ORG.depts.slice();
  function saveOrgCfg(depts, regions) {
    ORG = sanitizeOrg({ depts, regions });
    REGIONS = ORG.regions.map(r => r.id);
    REGION_LABEL = {}; ORG.regions.forEach(r => { REGION_LABEL[r.id] = r.label; });
    DEPTS = ORG.depts.slice();
    try { localStorage.setItem(ORG_KEY, JSON.stringify(ORG)); } catch (e) { }
    try { document.dispatchEvent(new CustomEvent('wz:org-changed')); } catch (e) { }
  }
  const ROLES = ['审核员', '核准员', '区域领用人', '隶属区域领用人'];
  const AREA_ROLES = ['区域领用人', '隶属区域领用人'];
  const OFFICE_ROLES = ['审核员', '核准员'];
  const APPROVAL_PENDING = '待审核', APPROVAL_WAITING = '待核准', APPROVAL_APPROVED = '已核准', APPROVAL_REJECTED = '已驳回';
  const APPROVAL_STATUSES = [APPROVAL_PENDING, APPROVAL_WAITING, APPROVAL_APPROVED, APPROVAL_REJECTED];
  const APPROVAL_MODE_TWO_STEP = 'two_step';
  const APPROVAL_MODE_REVIEW_ONLY = 'review_only';
  const APPROVAL_MODE_DIRECT_APPROVE = 'direct_approve';
  const APPROVAL_MODE_LABELS = {
    [APPROVAL_MODE_TWO_STEP]: '两级审批（审核 → 核准）',
    [APPROVAL_MODE_REVIEW_ONLY]: '仅审核（审核后完成）',
    [APPROVAL_MODE_DIRECT_APPROVE]: '直接核准（跳过审核）'
  };

  const uid = p => p + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const pad = n => String(n).padStart(2, '0');
  const today = () => { const d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  const nowStr = () => { const d = new Date(); return today() + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()); };
  const tsOf = s => { const t = Date.parse(String(s).replace(' ', 'T')); return isNaN(t) ? 0 : t; };
  const monthOf = s => String(s || '').slice(0, 7);
  const thisMonth = () => monthOf(today());
  const inMonth = (s, m) => m === 'all' || monthOf(s) === m;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = v => { const n = Number(v); return isNaN(n) ? 0 : n; };
  const fmtQty = n => { const v = num(n); return v % 1 === 0 ? String(v) : v.toFixed(2).replace(/\.?0+$/, ''); };

  function toast(msg, ms) {
    const box = document.getElementById('toast');
    const t = document.createElement('div'); t.className = 't'; t.textContent = msg;
    t.title = '点击关闭';
    /* UI 优化（2026-11-17）：toast 可点击关闭，长提示不再死等倒计时遮挡内容 */
    t.onclick = () => { t.classList.remove('show'); setTimeout(() => t.remove(), 200); };
    box.appendChild(t);
    requestAnimationFrame(() => t.classList.add('show'));
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, ms || 2600);
  }

  /* ---------------- 状态 ---------------- */
  const LS_KEY = 'WZ_DATA_V1', PEND_KEY = 'WZ_PENDING', ME_KEY = 'WZ_ME', SRV_KEY = 'WZ_SERVER', CID_KEY = 'WZ_CID', LS_CLOUD = 'WZ_CLOUD', OPS_KEY = 'WZ_OPS';
  let state = { ver: 0, updatedAt: 0, updatedBy: '', data: emptyData() };
  function emptyData() { const d = { tomb: {} }; COLLS.forEach(c => d[c] = {}); return d; }
  function recCount(d) { let n = 0; COLLS.forEach(c => n += Object.keys(d[c] || {}).length); return n; }

  function normRec(r0) {
    const r = { id: String(r0.id || ''), ts: Number(r0.ts) || 0, by: String(r0.by || ''), f: {} };
    const f0 = r0.f && typeof r0.f === 'object' ? r0.f : {};
    for (const k of FIELDS) { if (k in r0) { r[k] = r0[k]; r.f[k] = Number(f0[k]) || r.ts; } }
    return r;
  }
  function normalize(raw) {
    const out = { ver: 0, updatedAt: 0, updatedBy: '', data: emptyData() };
    if (!raw || typeof raw !== 'object') return out;
    const d = raw.data || raw;
    out.ver = Number(raw.ver) || 0; out.updatedAt = Number(raw.updatedAt) || 0; out.updatedBy = String(raw.updatedBy || '');
    const tomb = {};
    const st = d.tomb || {};
    for (const k of Object.keys(st)) tomb[k] = Number(st[k]) || 0;
    for (const c of COLLS) {
      const arr = Array.isArray(d[c]) ? d[c] : (d[c] && typeof d[c] === 'object' ? Object.values(d[c]) : []);
      for (const r0 of arr) {
        if (!r0 || typeof r0 !== 'object' || !r0.id) continue;
        const r = normRec(r0);
        if ((Number(tomb[r.id]) || 0) >= r.ts) continue;
        out.data[c][r.id] = r;
      }
    }
    out.data.tomb = tomb;
    return out;
  }
  /* 同毫秒并发按 (by, 内容) 稳定取一方，保证 mergeRec(a,b) 与 mergeRec(b,a) 结果相同 */
  function tieKey(r) { return String(r.by || '') + '#' + JSON.stringify(sortKeysRec(r)); }
  function sortKeysRec(o) {
    if (Array.isArray(o)) return o.map(sortKeysRec);
    if (o && typeof o === 'object') { const out = {}; Object.keys(o).sort().forEach(k => { out[k] = sortKeysRec(o[k]); }); return out; }
    return o;
  }
  function mergeRec(a, b) {
    let base, other;
    if (a.ts !== b.ts) { base = a.ts > b.ts ? a : b; other = base === a ? b : a; }
    else { const ka = tieKey(a), kb = tieKey(b); base = ka >= kb ? a : b; other = base === a ? b : a; }
    const out = { id: base.id, ts: Math.max(a.ts, b.ts), by: base.by, f: Object.assign({}, base.f) };
    for (const k of FIELDS) if (k in base) { out[k] = base[k]; out.f[k] = Number(base.f[k]) || base.ts; }
    for (const k of FIELDS) {
      if (!(k in other)) continue;
      const ot = (other.f && other.f[k]) || other.ts, bt = out.f[k] || 0;
      if (ot > bt) { out[k] = other[k]; out.f[k] = ot; }
    }
    return out;
  }
  function mergeStates(sA, sB) {
    const A = normalize(sA), B = normalize(sB);
    const tomb = Object.assign({}, A.data.tomb);
    for (const k of Object.keys(B.data.tomb)) tomb[k] = Math.max(tomb[k] || 0, B.data.tomb[k]);
    const data = { tomb };
    for (const c of COLLS) {
      data[c] = {};
      const ids = new Set([...Object.keys(A.data[c]), ...Object.keys(B.data[c])]);
      for (const id of ids) {
        const a = A.data[c][id], b = B.data[c][id];
        const r = a && b ? mergeRec(a, b) : (a || b);
        if ((Number(tomb[id]) || 0) >= r.ts) continue;
        data[c][id] = r;
      }
    }
    return { ver: Math.max(A.ver, B.ver), updatedAt: Math.max(A.updatedAt, B.updatedAt), updatedBy: A.updatedAt >= B.updatedAt ? A.updatedBy : B.updatedBy, data };
  }

  /* ---------------- 本地持久化 ---------------- */
  function loadLocal() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) { state = normalize(JSON.parse(raw)); return true; }
    } catch (e) { }
    return false;
  }
  // pend=true 仅表示「本机有未推送的改动」；拉取/采纳服务端数据时必须传 false，
  // 否则会形成 拉取→标脏→推送→广播→对端拉取 的无限冲突循环
  function saveLocal(pend) {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(state));
      if (pend) localStorage.setItem(PEND_KEY, '1');
      else localStorage.removeItem(PEND_KEY);
    } catch (e) { }
  }

  /* ---------------- 同步层 ---------------- */
  const SYNC = { mode: 'local', ver: 0, seq: 0, server: '', online: [], conflict: 0, es: null, pollT: null, pushT: null, autoT: null, connected: false, booting: true, admin: false, systemAdmin: false, memberId: '', scope: 'all', lastSyncAt: 0, lastError: null, pushing: false, adminKeySource: '', authMode: 'standalone', systemAdminNames: [] };

  /* 云端共享配置（与送测工作台同模式）：管理员口令存本机，随每个请求带给服务端校验 */
  const cloudCfg = { adminKey: '', auto: 1 };
  /* 口令归一化（修复 2026-11-17）：从微信 / 文档复制口令常混入零宽字符与全角字符，
     trim() 剥不掉导致服务端校验失败；存入与发送前统一归一化（与服务端同一套规则） */
  function normKey(s) {
    return String(s == null ? '' : s)
      .replace(/[\u200B-\u200F\u202A-\u202E\u2060\uFEFF]/g, '')
      .normalize('NFKC')
      .trim();
  }
  function loadCloudCfg() {
    try { const o = JSON.parse(localStorage.getItem(LS_CLOUD) || '{}'); if (o) for (const k in o) if (k in cloudCfg) cloudCfg[k] = o[k]; } catch (e) { }
    if (cloudCfg.adminKey) cloudCfg.adminKey = normKey(cloudCfg.adminKey);
  }
  function saveCloudCfg() { try { localStorage.setItem(LS_CLOUD, JSON.stringify(cloudCfg)); } catch (e) { } }
  /* 请求头同时带口令与身份（姓名/角色/区域），服务端据此判定管理员与可见范围；
     中文用 encodeURIComponent 转成 ASCII，避免请求头非 Latin-1 报错 */
  function cloudHeaders(extra) {
    const h = Object.assign({}, extra || {});
    if (cloudCfg.adminKey) h['x-admin-key'] = normKey(cloudCfg.adminKey);
    const M = me();
    if (M && M.name) h['x-user-name'] = encodeURIComponent(String(M.name).trim());
    if (M && M.role) h['x-user-role'] = encodeURIComponent(String(M.role).trim());
    if (M && M.region) h['x-user-region'] = encodeURIComponent(String(M.region).trim());
    return h;
  }

  const renderHooks = [];
  function onRender(fn) { renderHooks.push(fn); }
  function renderAll() { renderHooks.forEach(fn => { try { fn(); } catch (e) { console.error(e); } }); }

  /* ---------------- 并发写入通道（与送测一致：串行队列 + 只传本次改动） ----------------
     旧的写法是「每次改动把整库 PUT 上去」，两人同时录入时后到的整库会带一堆旧副本，
     服务端只能靠时间戳一条条拉回来，既慢又容易被旧副本顶掉别人的新改动。
     现在改为：
       ① 每次录入只记录「受影响的那几条记录」到待传队列（op 队列），落 localStorage，刷新/断网都不丢；
       ② 提交走串行队列，绝不允许两个请求同时在路上，避免自乱序；
       ③ 服务端逐条字段级合并后把「裁决结果」回传，本地采纳，双方改动都保留；
       ④ 失败指数退避重试，恢复后自动补传，不需要用户手动点。 */
  const OPS_KEY_LOCAL = (typeof OPS_KEY === 'string' ? OPS_KEY : 'WZ_OPS');
  const OPS_CAP = 3000;
  let ops = {};
  let opSeq = 0;
  let pushQueue = Promise.resolve();
  let flushTimer = null, retryDelay = 0, offlineWarned = false;

  function loadOps() {
    try {
      const o = JSON.parse(localStorage.getItem(OPS_KEY_LOCAL) || '{}');
      if (o && typeof o === 'object') {
        ops = {};
        for (const k of Object.keys(o)) {
          const it = o[k];
          if (!it || !it.coll || !it.id) continue;
          ops[k] = it;
          opSeq = Math.max(opSeq, Number(it.seq) || 0);
        }
      }
    } catch (e) { ops = {}; }
  }
  function saveOps() { try { localStorage.setItem(OPS_KEY_LOCAL, JSON.stringify(ops)); } catch (e) { } }
  function opCount() { return Object.keys(ops).length; }

  /** 把一条记录的改动放进待传队列（同一条记录多次改动只留最后一次，天然去重） */
  function queueOp(coll, id, rec, del, ts, baseTs) {
    const key = coll + '/' + id;
    const cur = ops[key];
    const t = Number(ts) || (rec && Number(rec.ts)) || Date.now();
    ops[key] = {
      coll: coll, id: id, del: !!del, rec: del ? null : rec,
      ts: Math.max(t, (cur && Number(cur.ts)) || 0),
      /* 打开编辑窗时那条记录的版本时间：服务端用它判断「我改的是不是已经被别人删掉的旧数据」 */
      baseTs: Math.max(Number(baseTs) || 0, (cur && Number(cur.baseTs)) || 0),
      seq: ++opSeq
    };
    const keys = Object.keys(ops);
    if (keys.length > OPS_CAP) {
      keys.sort((a, b) => (ops[a].seq || 0) - (ops[b].seq || 0));
      for (let i = 0; i < keys.length - OPS_CAP; i++) delete ops[keys[i]];
    }
    saveOps();
    if (SYNC.mode === 'server') scheduleFlush();
  }

  function scheduleFlush(delay) {
    if (SYNC.mode !== 'server') return;
    clearTimeout(flushTimer);
    flushTimer = setTimeout(() => { flushOps().catch(() => { }); }, delay == null ? 220 : delay);
  }
  /* 串行队列：与送测 cloudPullQueue 同一做法，先到先执行，绝不并发写 */
  function flushOps() {
    const run = () => flushOnce();
    const task = pushQueue.then(run, run);
    pushQueue = task.then(() => null, () => null);
    return task;
  }
  async function flushOnce() {
    if (SYNC.mode !== 'server') return;
    const keys = Object.keys(ops);
    if (!keys.length) return;
    const batch = keys.map(k => ops[k]);
    const sentSeq = {};
    batch.forEach(o => { sentSeq[o.coll + '/' + o.id] = o.seq; });
    SYNC.pushing = true;
    let r;
    try {
      r = await fetch(SYNC.server + '/api/ops', {
        method: 'POST', headers: cloudHeaders({ 'content-type': 'application/json' }),
        body: JSON.stringify({
          ops: batch.map(o => o.del ? { coll: o.coll, id: o.id, del: true, ts: o.ts } : { coll: o.coll, id: o.id, rec: o.rec, ts: o.ts, baseTs: o.baseTs || 0 }),
          ver: SYNC.ver, client: clientId(),
          name: me().name, role: me().role, region: me().region, adminKey: normKey(cloudCfg.adminKey)
        })
      });
    } catch (e) {
      SYNC.pushing = false;
      SYNC.connected = false;
      SYNC.lastError = { ok: false, reason: 'timeout', detail: (e && e.message) || '网络异常', url: SYNC.server };
      updatePill();
      retryDelay = Math.min(15000, (retryDelay || 800) * 2);
      clearTimeout(SYNC.pushT);
      SYNC.pushT = setTimeout(() => { flushOps().catch(() => { }); }, retryDelay);
      if (!offlineWarned) { offlineWarned = true; toast('暂未连上服务器，' + keys.length + ' 条改动已保存在本机，恢复后自动补传'); }
      return;
    }
    SYNC.pushing = false;
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      if (r.status === 401 || r.status === 403) {
        toast('服务器拒绝了本次提交（' + ((j && j.error) || ('HTTP ' + r.status)) + '），已刷新为云端最新数据');
        await pullStore(true).catch(() => { });
        return;
      }
      retryDelay = Math.min(15000, (retryDelay || 800) * 2);
      clearTimeout(SYNC.pushT);
      SYNC.pushT = setTimeout(() => { flushOps().catch(() => { }); }, retryDelay);
      SYNC.lastError = { ok: false, reason: 'http', detail: 'HTTP ' + r.status, url: SYNC.server };
      updatePill();
      return;
    }
    const j = await r.json();
    offlineWarned = false; retryDelay = 0;
    SYNC.connected = true;
    if (typeof j.ver === 'number') SYNC.ver = j.ver;
    if (typeof j.seq === 'number') SYNC.seq = j.seq;
    SYNC.lastSyncAt = Date.now();
    SYNC.lastError = null;

    /* 采纳服务端裁决：别人更晚的字段会并进来，自己刚写的也不会丢 */
    let contested = 0;
    const sentBy = {};
    batch.forEach(o => { sentBy[o.coll + '/' + o.id] = o; });
    (j.applied || []).forEach(a => {
      if (!a || !a.coll || !COLLS.includes(a.coll)) return;
      const sent = sentBy[a.coll + '/' + a.id];
      if (a.del || a.rec === null) {
        delete state.data[a.coll][a.id];
        state.data.tomb[a.id] = Math.max(Number(state.data.tomb[a.id]) || 0, Number(a.ts) || 0, sent ? sent.ts : 0);
        return;
      }
      const local = state.data[a.coll][a.id];
      if (local && !sameVal(JSON.stringify(local), JSON.stringify(a.rec))) {
        if (sent && !sent.del && !sameVal(JSON.stringify(sent.rec), JSON.stringify(a.rec))) contested++;
      }
      const merged = local ? mergeRec(local, a.rec) : a.rec;
      const tomb = Number(state.data.tomb[a.id]) || 0;
      if (tomb >= merged.ts) { delete state.data[a.coll][a.id]; return; }
      state.data[a.coll][a.id] = merged;
    });
    /* 被服务端明确拒绝的（越权 / 记录已被删除）不再重试，否则会无限循环 */
    const rejectedKeys = {};
    (j.rejected || []).forEach(x => { if (x && x.coll) rejectedKeys[x.coll + '/' + x.id] = 1; });
    /* 只清掉「已经发出去且期间没再改过」的 op；期间又改过的保留，下一轮再传 */
    batch.forEach(o => {
      const key = o.coll + '/' + o.id;
      if (rejectedKeys[key]) { delete ops[key]; return; }
      if (ops[key] && ops[key].seq === sentSeq[key]) delete ops[key];
    });
    saveOps();
    if ((j.rejected || []).length) {
      const why = (j.rejected[0] && j.rejected[0].reason) || '无权限';
      let msg = '有 ' + j.rejected.length + ' 条被服务器拒绝：' + why + '，已刷新为云端数据';
      if (why.indexOf('管理员口令') >= 0) {
        msg += '。若你是管理员：请核对上方管理员口令（注意大小写与前后空格）后重新点「保存并连接」再录入';
        const hint0 = adminKeyHint();
        if (hint0) msg += '（' + hint0 + '）';
      }
      toast(msg);
      await pullStore(true).catch(() => { });
    }
    if (contested) { SYNC.conflict += contested; toast('已自动合并 ' + contested + ' 条他人同时修改的记录（双方改动都保留）'); }
    saveLocal(opCount() > 0);
    updatePill(); renderAll();
    if (opCount() > 0) scheduleFlush(400);
  }

  async function importMaterials(materials) {
    const list = Array.isArray(materials) ? materials : [];
    if (!list.length) return { ok: true, applied: [], rejected: [], touched: 0 };
    if (SYNC.mode !== 'server') {
      const applied = [];
      for (const record of list) {
        applied.push({ id: record.id, record: upsert('materials', record, `导入物料：${record.name || ''}`) });
      }
      return { ok: true, applied, rejected: [], touched: applied.length };
    }
    const response = await fetch(SYNC.server + '/api/import/materials', {
      method: 'POST',
      headers: cloudHeaders({ 'content-type': 'application/json' }),
      body: JSON.stringify({
        materials: list,
        name: me().name,
        role: me().role,
        region: me().region,
        adminKey: normKey(cloudCfg.adminKey)
      })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || ('HTTP ' + response.status));
    await pullStore(true);
    return result;
  }

  function saveState() {
    state.updatedAt = Date.now();
    state.updatedBy = me().name;
    saveLocal(opCount() > 0);
    renderAll();
  }

  async function pushStore(force) {
    if (SYNC.mode !== 'server') return;
    try {
      localStorage.removeItem(PEND_KEY);
      const body = { ver: SYNC.ver, data: state.data, client: clientId(), name: me().name, role: me().role, region: me().region, force: !!force, adminKey: normKey(cloudCfg.adminKey) };
      const r = await fetch(SYNC.server + '/api/store', { method: 'PUT', headers: cloudHeaders({ 'content-type': 'application/json' }), body: JSON.stringify(body) });
      if (r.status === 403) {
        const j = await r.json().catch(() => ({}));
        const msg = (j && (j.error || '') + ((j.violations || [])[0] ? '：' + j.violations[0] : '')) || 'HTTP 403';
        toast('操作被服务器拒绝（' + msg + '），已恢复为云端最新数据');
        await pullStore(true).catch(() => { });
        return;
      }
      if (!r.ok) { toast('推送失败：HTTP ' + r.status); return; }
      const j = await r.json();
      if (j.conflict) SYNC.conflict++;
      SYNC.ver = j.ver;
      if (j.conflict && j.data) { state = normalize({ ver: j.ver, data: j.data }); saveLocal(false); renderAll(); toast('检测到并发修改，已自动合并两边改动'); }
      else { state.ver = j.ver; }
    } catch (e) { try { localStorage.setItem(PEND_KEY, '1'); } catch (x) { } toast('共享连接中断，已转为本地缓存（改动会保留）'); setLocalMode(); }
  }

  /* 串行队列（与送测 cloudPullQueue 同做法）：页面刚打开时多次并发拉取会互相吞结果，
     这里把并发请求排队执行，绝不丢弃，保证「保存并连接」一定拿到身份结果 */
  let pullQueue = Promise.resolve();
  function pullStore(force) {
    const run = () => pullOnce(force);
    const task = pullQueue.then(run, run);
    pullQueue = task.then(() => null, () => null);
    return task;
  }
  /* 增量拉取（对齐送测 /api/state?since=）：只取对方改过的记录，逐条字段级并行合并 */
  function applyChanges(list) {
    (list || []).forEach(ch => {
      if (!ch || !ch.id) return;
      if (!ch.coll) {
        if (ch.tomb) state.data.tomb[ch.id] = Math.max(Number(state.data.tomb[ch.id]) || 0, Number(ch.tomb) || 0);
        return;
      }
      if (COLLS.indexOf(ch.coll) < 0) return;
      if (ch.rec === null || ch.rec === undefined) { delete state.data[ch.coll][ch.id]; return; }
      const cur = state.data[ch.coll][ch.id];
      const tomb = Number(state.data.tomb[ch.id]) || 0;
      const merged = cur ? mergeRec(cur, ch.rec) : normRec(ch.rec);
      if (tomb >= merged.ts) { delete state.data[ch.coll][ch.id]; return; }
      state.data[ch.coll][ch.id] = merged;
    });
  }

  async function pullOnce(force) {
    const pendingOps = opCount();
    const canSince = !force && SYNC.seq > 0 && pendingOps === 0;
    const r = await fetch(SYNC.server + '/api/store' + (canSince ? ('?since=' + SYNC.seq) : ''), { headers: cloudHeaders() });
    if (!r.ok) throw new Error('pull ' + r.status);
    const j = await r.json();
    applyServerIdentity(j);
    SYNC.admin = !!j.isAdmin;
    SYNC.scope = j.scope || (j.isAdmin ? 'all' : 'mine');
    SYNC.lastSyncAt = Date.now();
    updatePill();
    if (j.partial) {
      applyChanges(j.changes || []);
      if (typeof j.seq === 'number') SYNC.seq = j.seq;
      if (typeof j.ver === 'number') { SYNC.ver = j.ver; state.ver = j.ver; }
      saveLocal(false); renderAll();
      return;
    }
    const hadLocalPending = pendingOps > 0 || !!localStorage.getItem(PEND_KEY);
    const prev = state;
    const serverState = normalize(j);
    SYNC.seq = (typeof j.seq === 'number') ? j.seq : serverState.ver;
    if (recCount(serverState.data) === 0 && recCount(prev.data) > 0) {
      // 空服务器播种
      state = prev; SYNC.ver = serverState.ver;
      localStorage.removeItem(PEND_KEY);
      await pushStore(false);
      ops = {}; saveOps();
      toast('已把本机数据同步为共享初始数据');
    } else if (hadLocalPending && recCount(prev.data) > 0) {
      state = mergeStates(serverState, prev);
      state.ver = serverState.ver; SYNC.ver = serverState.ver;
      saveLocal(pendingOps > 0); renderAll();
      /* 有待传记录时按记录补传（不再整库覆盖，避免把别人的记录顶掉） */
      if (pendingOps > 0) flushOps().catch(() => { });
      else await pushStore(false);
    } else {
      if (!force && j.ver === SYNC.ver && SYNC.connected) return;   // ver 未变不重渲染
      state = serverState;
      SYNC.ver = j.ver;
      saveLocal(false); renderAll();
    }
  }

  function startStream() {
    if (typeof EventSource === 'function') {
      try {
        const es = new EventSource(SYNC.server + '/api/events?client=' + encodeURIComponent(clientId()) + '&name=' + encodeURIComponent(me().name || ''));
        es.addEventListener('hello', () => { });
        es.addEventListener('presence', e => { try { const j = JSON.parse(e.data); SYNC.online = j.online || []; updatePill(); } catch (x) { } });
        es.addEventListener('update', e => { try { const j = JSON.parse(e.data); if (j.ver > SYNC.ver) pullStore(); } catch (x) { } });
        es.onerror = () => {
          /* EventSource 会自动重连；若断开超过一个周期，同时启用 8 秒轮询兜底。 */
          if (!SYNC.pollT) SYNC.pollT = setInterval(() => pullStore().catch(() => { }), 8000);
        };
        es.addEventListener('open', () => {
          if (SYNC.pollT) { clearInterval(SYNC.pollT); SYNC.pollT = null; }
        });
        SYNC.es = es;
        return;
      } catch (e) { }
    }
    SYNC.pollT = setInterval(() => pullStore().catch(() => { }), 8000);   // 降级轮询
  }

  function setLocalMode() {
    if (SYNC.es) { try { SYNC.es.close(); } catch (e) { } SYNC.es = null; }
    if (SYNC.pollT) { clearInterval(SYNC.pollT); SYNC.pollT = null; }
    stopAutoSync();
    SYNC.mode = 'local'; SYNC.connected = false; SYNC.online = []; SYNC.admin = false; SYNC.systemAdmin = false; SYNC.memberId = ''; SYNC.scope = 'all';
    if (SYNC.authMode !== 'qnexus') SYNC.authMode = 'standalone';
    updatePill();
  }

  function clientId() {
    let c = null;
    try { c = localStorage.getItem(CID_KEY); } catch (e) { }
    if (!c) { c = uid('c'); try { localStorage.setItem(CID_KEY, c); } catch (e) { } }
    return c;
  }

  /* ---- 探测失败分类（纯函数，PROBE-CLASSIFY 标记供单测提取） ---- */
  /* PROBE-CLASSIFY-START */
  function classifyProbeFailure(err, status, url) {
    if (err && err.name === 'AbortError') return { reason: 'timeout', detail: '4 秒内无响应（网络不可达）', url: url };
    if (err) return { reason: 'refused', detail: '连接未建立（服务未启动或端口不对）', url: url };
    if (status && status !== 200) return { reason: 'http' + status, detail: 'HTTP ' + status, url: url };
    return { reason: 'badreply', detail: '有响应但不是本系统健康数据', url: url };
  }
  /* PROBE-CLASSIFY-END */

  /* ---- 旧端口地址升级（纯函数，LEGACY-PORT 标记供单测提取） ---- */
  /* LEGACY-PORT-START */
  const LEGACY_PORTS = { '8787': '8082' };
  function upgradeLegacyPort(base) {
    const s = String(base == null ? '' : base).trim();
    const m = s.match(/^(https?:\/\/)([^\/?#]+):(\d+)([\/?#].*)?$/i);
    if (!m) return s;
    const to = LEGACY_PORTS[m[3]];
    if (!to) return s;
    return m[1] + m[2] + ':' + to + (m[4] || '');
  }
  /* LEGACY-PORT-END */

  /**
   * 连接探测（带失败原因）。返回：
   *   { ok:true,  health, url }                         成功
   *   { ok:false, reason, detail, url }                 失败（reason: empty/timeout/refused/http<code>/badreply）
   */
  async function probeEx(base) {
    const b = String(base == null ? '' : base).trim().replace(/\/$/, '');
    if (!b) return { ok: false, reason: 'empty', detail: '未填写服务器地址', url: '' };
    const url = b + '/api/health';
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 4000);
    try {
      const r = await fetch(url, { signal: ctl.signal });
      clearTimeout(t);
      if (!r.ok) return Object.assign({ ok: false }, classifyProbeFailure(null, r.status, url));
      let j = null;
      try { j = await r.json(); } catch (e) { return Object.assign({ ok: false }, classifyProbeFailure(null, 0, url)); }
      if (!(j && j.ok)) return Object.assign({ ok: false }, classifyProbeFailure(null, 0, url));
      return { ok: true, health: j, url: url };
    } catch (e) {
      clearTimeout(t);
      return Object.assign({ ok: false }, classifyProbeFailure(e, 0, url));
    }
  }

  /* 兼容旧调用：成功返回 health 对象，失败返回 null */
  async function probe(base) {
    const x = await probeEx(base);
    return x.ok ? x.health : null;
  }

  /* 口令即时校验（修复 2026-11-17）：调服务端 /api/verify-key，当场告诉用户口令是否被认可，
     并带回诊断（是否混入不可见/全角字符、归一化后长度），不再静默降级为非管理员 */
  async function verifyAdminKey(base, key) {
    const b = String(base || SYNC.server || '').trim().replace(/\/$/, '');
    if (!b) return { ok: false, detail: '未填写服务器地址' };
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 4000);
    try {
      const r = await fetch(b + '/api/verify-key', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ adminKey: normKey(key) }), signal: ctl.signal
      });
      clearTimeout(t);
      if (!r.ok) return { ok: false, detail: '服务端返回 ' + r.status };
      return await r.json();
    } catch (e) {
      clearTimeout(t);
      return { ok: false, detail: e && e.name === 'AbortError' ? '请求超时（4 秒）' : String((e && e.message) || e) };
    }
  }

  /* 构建候选服务器地址（供 autoDetect / connect 共用） */
  /* AUTO-DETECT-START */
  function candidateBases() {
    const cands = [];
    try { const q = new URLSearchParams(location.search).get('server'); if (q) cands.push(upgradeLegacyPort(q)); } catch (e) { }
    try { const s = localStorage.getItem(SRV_KEY); if (s) cands.push(upgradeLegacyPort(s)); } catch (e) { }
    if (/^https?:$/i.test(location.protocol)) {
      /* 挂载模式（如 …/wz/）下同源 API 带子路径前缀 */
      const prefix = (location.pathname.match(/^\/wz(?=\/|$)/) || [''])[0];
      cands.push(location.origin + prefix);
    }
    try { if (location.hostname) cands.push('http://' + location.hostname + ':' + 8082); } catch (e) { }
    cands.push('http://localhost:8082');
    return [...new Set(cands.map(u => String(u).replace(/\/$/, '')))];
  }

  /**
   * 自动探测候选服务器地址（空地址时兜底）。
   * 命中 → { ok:true, base, health }；全部失败 → { ok:false, last: 最后一次 probeEx 结果 }
   */
  async function autoDetect() {
    let last = null;
    for (const base of candidateBases()) {
      const x = await probeEx(base);
      if (x.ok) return { ok: true, base: base, health: x.health };
      last = x;
    }
    return { ok: false, last: last };
  }
  /* AUTO-DETECT-END */

  async function connect() {
    SYNC.booting = true;
    const r = await autoDetect();
    if (r.ok) {
      const h = r.health;
      SYNC.server = r.base; SYNC.mode = 'server'; SYNC.connected = true;
      SYNC.ver = h.ver; SYNC.online = h.online || [];
      applyServerIdentity(h);
      try { localStorage.setItem(SRV_KEY, r.base); } catch (e) { }
      startStream();
      startAutoSync();
      await pullStore(true).catch(() => { });
      if (opCount()) flushOps().catch(() => { });
      updatePill();
      SYNC.booting = false;
      renderAll();
      return true;
    }
    setLocalMode();
    SYNC.booting = false;
    renderAll();
    return false;
  }

  function updatePill() {
    const pill = document.getElementById('syncPill'), txt = document.getElementById('syncTxt');
    if (!pill) return;
    if (SYNC.mode === 'server') {
      pill.classList.add('on');
      const n = Math.max(1, SYNC.online.length);
      const pend = opCount();
      txt.textContent = '共享已连接 · ' + scopeLabel() + ' · ' + n + ' 台在线' + (pend ? ' · ' + pend + ' 条待同步' : '');
      pill.title = (SYNC.lastSyncAt ? ('最近同步：' + new Date(SYNC.lastSyncAt).toLocaleTimeString()) : '') + (pend ? ('；' + pend + ' 条改动排队中，会自动补传') : '');
    } else {
      pill.classList.remove('on');
      txt.textContent = '本地模式';
      pill.title = '';
    }
  }

  async function switchMode(target, addr) {
    if (target === 'local') { setLocalMode(); SYNC.lastError = null; try { localStorage.removeItem(SRV_KEY); } catch (e) { } return true; }
    const base = upgradeLegacyPort(String(addr || '').trim().replace(/\/$/, ''));
    if (!base) { SYNC.lastError = { ok: false, reason: 'empty', detail: '请填写服务器地址', url: '' }; return false; }
    const x = await probeEx(base);
    if (!x.ok) { SYNC.lastError = x; return false; }
    SYNC.lastError = null;
    const h = x.health;
    SYNC.server = base; SYNC.mode = 'server'; SYNC.connected = true; SYNC.ver = h.ver; SYNC.online = h.online || [];
    applyServerIdentity(h);
    if (h.adminKeySource) SYNC.adminKeySource = h.adminKeySource;
    try { localStorage.setItem(SRV_KEY, base); } catch (e) { }
    if (SYNC.es) { try { SYNC.es.close(); } catch (e) { } SYNC.es = null; }
    if (SYNC.pollT) { clearInterval(SYNC.pollT); SYNC.pollT = null; }
    startStream();
    startAutoSync();
    await pullStore(true).catch(() => { });
    if (opCount()) flushOps().catch(() => { });
    updatePill();
    return true;
  }

  /* ---------------- 身份 / 权限 ---------------- */
  let ME = { name: '', role: '' };
  function loadMe() { try { ME = JSON.parse(localStorage.getItem(ME_KEY) || '{}') || {}; } catch (e) { ME = {}; } }
  function saveMe() { try { localStorage.setItem(ME_KEY, JSON.stringify(ME)); } catch (e) { } }
  function me() { return ME; }
  function setMe(name, role, region) {
    if (SYNC.authMode === 'qnexus') return;
    ME = { name: String(name || ''), role: String(role || ''), region: region || '' };
    saveMe(); renderAll();
  }
  function applyServerIdentity(payload) {
    if (!payload || !payload.authMode) return;
    SYNC.authMode = payload.authMode;
    const user = payload.user || {};
    SYNC.memberId = String(user.memberId || '');
    if (Array.isArray(user.systemAdminNames)) {
      SYNC.systemAdminNames = user.systemAdminNames.map(name => String(name || '').trim()).filter(Boolean);
    }
    if (typeof user.admin === 'boolean') SYNC.admin = user.admin;
    if (typeof user.systemAdmin === 'boolean') SYNC.systemAdmin = user.systemAdmin;
    if (payload.authMode !== 'qnexus') return;
    ME = {
      name: String(user.name || user.username || ''),
      role: String(user.role || ''),
      region: String(user.region || ''),
      username: String(user.username || ''),
      memberId: String(user.memberId || ''),
      supervisorId: String(user.supervisorId || ''),
      dept: String(user.dept || ''),
      supervisorName: String(user.supervisorName || ''),
      supervisorUsername: String(user.supervisorUsername || ''),
      memberMatched: Boolean(user.memberMatched),
      admin: !!user.admin,
      systemAdmin: !!user.systemAdmin
    };
    SYNC.admin = !!user.admin;
    SYNC.systemAdmin = !!user.systemAdmin;
    SYNC.adminKeySource = 'qnexus';
  }
  const isRole = r => ME.role === r;
  function systemAdminLabel() {
    return SYNC.systemAdminNames.length ? SYNC.systemAdminNames.join('、') : '系统管理员';
  }
  const isMemberMatched = () => SYNC.authMode === 'qnexus' ? Boolean(ME.memberMatched) : Boolean(ME.memberId || ME.name);
  const isSystemAdmin = () => Boolean(SYNC.systemAdmin);
  const canManageMaterials = () => Boolean(SYNC.admin);
  const canManageMembers = () => Boolean(SYNC.systemAdmin);
  const canImportMaterials = () => SYNC.mode === 'server' ? Boolean(SYNC.admin || SYNC.memberId || ME.memberId) : Boolean(ME.name);
  const canEditFlow = () => Boolean((SYNC.admin || OFFICE_ROLES.includes(ME.role)) && isMemberMatched());
  const canCreatePurchase = () => Boolean(ME.name && (SYNC.admin || ROLES.includes(ME.role)) && isMemberMatched());
  function currentMember() {
    if (ME.memberId) return memberById(ME.memberId);
    const username = String(ME.username || '').trim().toLowerCase();
    const name = String(ME.name || '').trim();
    return list('members').find(member => member.enabled !== false && (
      (username && String(member.username || '').trim().toLowerCase() === username)
      || (name && String(member.name || '').trim() === name)
    )) || null;
  }
  function resolveApprovalRoute(submitterMember) {
    const member = submitterMember || currentMember();
    if (!member || member.enabled === false) {
      return { ok: false, code: 'SUBMITTER_NOT_MATCHED', message: '提交人未匹配成员名单，请联系管理员' };
    }
    const mode = String(member.approvalMode || '').trim();
    if (!Object.prototype.hasOwnProperty.call(APPROVAL_MODE_LABELS, mode)) {
      return { ok: false, code: 'APPROVAL_ROUTE_MISSING', message: '未配置审核人，请联系管理员' };
    }
    const reviewer = member.reviewerId ? get('members', member.reviewerId) : null;
    const approver = member.approverId ? get('members', member.approverId) : null;
    if (mode === APPROVAL_MODE_DIRECT_APPROVE) {
      if (!approver || approver.enabled === false || approver.role !== '核准员') {
        return { ok: false, code: 'APPROVER_NOT_CONFIGURED', message: '未配置核准人，请联系管理员' };
      }
      return { ok: true, mode, reviewer: null, approver, initialStatus: APPROVAL_WAITING };
    }
    if (!reviewer || reviewer.enabled === false || reviewer.role !== '审核员') {
      return { ok: false, code: 'REVIEWER_NOT_CONFIGURED', message: '未配置审核人，请联系管理员' };
    }
    if (mode === APPROVAL_MODE_REVIEW_ONLY) {
      return { ok: true, mode, reviewer, approver: null, initialStatus: APPROVAL_PENDING };
    }
    if (!approver || approver.enabled === false || approver.role !== '核准员') {
      return { ok: false, code: 'APPROVER_NOT_CONFIGURED', message: '未配置核准人，请联系管理员' };
    }
    return { ok: true, mode, reviewer, approver, initialStatus: APPROVAL_PENDING };
  }
  function submitterMemberFor(record) {
    if (!record) return null;
    if (record.submitterMemberId) {
      const byId = get('members', record.submitterMemberId);
      if (byId) return byId;
    }
    return list('members').find(member => member.enabled !== false
      && String(member.name || '').trim() === String(record.by || '').trim()) || null;
  }
  function approvalRouteSnapshot(route, submitterMember) {
    if (!route || !route.ok || !submitterMember) return {};
    return {
      submitterMemberId: String(submitterMember.id || ''),
      approvalMode: route.mode,
      reviewerId: route.reviewer ? String(route.reviewer.id || '') : '',
      reviewerName: route.reviewer ? String(route.reviewer.name || '') : '',
      reviewerUsername: route.reviewer ? String(route.reviewer.username || '') : '',
      approverId: route.approver ? String(route.approver.id || '') : '',
      approverName: route.approver ? String(route.approver.name || '') : '',
      approverUsername: route.approver ? String(route.approver.username || '') : '',
      routeResolvedAt: nowStr()
    };
  }
  function actorMatches(who, memberId, username, name) {
    if (!who) return false;
    if (memberId) return Boolean(who.memberId && String(memberId) === String(who.memberId));
    if (username && who.username && String(username).trim().toLowerCase() === String(who.username).trim().toLowerCase()) return true;
    return !memberId && !username && name && who.name && String(name).trim() === String(who.name).trim();
  }
  function canReviewPurchase(purchase) {
    if (!purchase || !isMemberMatched()) return false;
    if (purchase.reviewerId || purchase.reviewerUsername || purchase.reviewerName) {
      return actorMatches(ME, purchase.reviewerId, purchase.reviewerUsername, purchase.reviewerName);
    }
    return Boolean(SYNC.admin || (ME.role === '审核员' && isMemberMatched()));
  }
  function canApprovePurchase(purchase) {
    if (!purchase || !isMemberMatched()) return false;
    if (purchase.approverId || purchase.approverUsername || purchase.approverName) {
      return actorMatches(ME, purchase.approverId, purchase.approverUsername, purchase.approverName);
    }
    return Boolean(SYNC.admin || (ME.role === '核准员' && isMemberMatched()));
  }
  const canConfirm = () => Boolean((SYNC.admin || AREA_ROLES.includes(ME.role)) && isMemberMatched());
  function canConfirmDispatch(d) {
    if (!d || !canConfirm()) return false;
    if (SYNC.admin) return true;
    if (!ME.region || String(d.region || '') !== String(ME.region)) return false;
    if (ME.role === '区域领用人') return true;
    return Boolean((ME.memberId && d.claimantId === ME.memberId) || (ME.name && d.claimantName === ME.name));
  }
  function purchaseApprovalStatus(record) {
    const status = String(record && record.approvalStatus || '');
    return APPROVAL_STATUSES.includes(status) ? status : APPROVAL_APPROVED;
  }
  function purchaseRequestSource(record) {
    const raw = String(record && record.requestSource || '').trim();
    if (/^OA/i.test(raw) || raw === 'OA请购') return 'OA请购';
    if (raw.includes('行政')) return '行政请购';
    return '其他';
  }
  function memberById(id) { return id ? get('members', id) : null; }
  function membersForRegion(region) {
    return list('members').filter(member => member.enabled !== false && (!region || String(member.region || '') === String(region)) && AREA_ROLES.includes(member.role));
  }
  function supervisorsForRegion(region) {
    return list('members').filter(member => member.enabled !== false && member.role === '区域领用人' && String(member.region || '') === String(region));
  }
  function roleCapabilities() {
    return {
      canManageMaterials: canManageMaterials(), canManageMembers: canManageMembers(), isMemberMatched: isMemberMatched(),
      canEditFlow: canEditFlow(), canCreatePurchase: canCreatePurchase(),
      canReviewPurchase: canReviewPurchase(), canApprovePurchase: canApprovePurchase(),
      canConfirm: canConfirm()
    };
  }

  /* ---- 视图范围（与送测「录入员只看自己」规则对齐）----
     · 管理员（口令经服务端校验）：看全员数据，可改删任何记录，可维护档案
     · 文员：看全员业务台账（汇总角色），基础档案只读
     · 区域领用人：申领台账默认只看本人录入，分发/签字看本区域 + 本人
     说明：库存 / 欠货等聚合指标必须用全量数据算，隐藏底层单据会让余量变虚高，
           所以「只看自己」只过滤单据列表，不影响库存类 KPI（这点与送测的差异已写入说明）。 */
  const SCOPE = { showAll: false };
  function scopeInfo() {
    const online = SYNC.mode === 'server';
    const admin = online && !!SYNC.admin;
    const systemAdmin = online && !!SYNC.systemAdmin;
    const role = String(ME.role || '');
    const named = !!String(ME.name || '').trim();
    const mineOnly = online && !admin && AREA_ROLES.includes(role) && named;
    return { online, admin, systemAdmin, role: role, named: named, mineOnly: mineOnly, showAll: false };
  }
  function setShowAll(v) { SCOPE.showAll = !!v; renderAll(); }
  function scopeLabel() {
    const s = scopeInfo();
    if (!s.online) return '本地模式';
    /* 修复（2026-11-17）：在线时管理员身份只认「服务端口令校验」。
       本机角色选了管理员但口令未被服务端认可时，必须明确标注，
       否则用户会以为口令已通过（此前状态条会误导性地显示「身份：管理员」）。 */
    if (s.systemAdmin) return '系统管理员 · ' + (s.role || '业务身份');
    if (s.admin) return '管理员 · ' + (s.role || '业务身份');
    return s.role || '未设身份';
  }
  /* 口令来源提示（服务端 /api/health、/api/store 下发 adminKeySource，不泄露口令本身） */
  function adminKeyHint() {
    const src = SYNC.adminKeySource || '';
    if (src === 'default') return '服务器当前使用默认口令 wuzhi-admin-2026（未改过 config.json / 环境变量）';
    if (src === 'config') return '服务器口令自定义：在服务器电脑本程序目录 config.json 的 adminKey 字段，找启动服务的人核对';
    if (src === 'env') return '服务器口令自定义：来自服务器环境变量 WZ_ADMIN_KEY，找启动服务的人核对';
    return '';
  }
  /* 记录是否在可见范围内（只作用于单据类，不含库存底座） */
  function inScope(coll, rec) {
    const s = scopeInfo();
    if (!s.mineOnly || !rec) return true;
    if (['purchases', 'dispatches', 'signoffs'].indexOf(coll) < 0) return true;
    const me0 = String(ME.name || '').trim();
    if (String(rec.by || '').trim() === me0) return true;
    if (coll === 'dispatches') {
      if (!ME.region || String(rec.region || '') !== String(ME.region)) return false;
      if (ME.role === '区域领用人') return true;
      return Boolean((ME.memberId && rec.claimantId === ME.memberId) || (me0 && rec.claimantName === me0));
    }
    return false;
  }
  /* 能否改动这条记录：连上共享后，区域领用人只能动本人录入的单据（管理员不限） */
  function canOperateRec(coll, rec) {
    const s = scopeInfo();
    if (!s.online || s.admin) return true;
    if (!AREA_ROLES.includes(s.role)) return true;
    const me0 = String(ME.name || '').trim();
    if (!me0) return true;
    return String((rec && rec.by) || '').trim() === me0;
  }
  /* 团队概览：按录入人统计申领单（管理员看全员，其他身份只看自己那行） */
  function teamStats() {
    const s = scopeInfo();
    const me0 = String(ME.name || '').trim();
    const map = {};
    Object.values(state.data.purchases || {}).forEach(r => {
      const who = String(r.by || '未署名').trim() || '未署名';
      if (!s.admin && !OFFICE_ROLES.includes(s.role) && me0 && who !== me0) return;
      map[who] = (map[who] || 0) + 1;
    });
    const total = Object.keys(map).reduce((a, k) => a + map[k], 0);
    const rows = Object.keys(map).sort((a, b) => map[b] - map[a])
      .map(k => ({ name: k, n: map[k], pct: total ? Math.round(map[k] / total * 1000) / 10 : 0 }));
    return { total: total, rows: rows, admin: s.admin };
  }
  /* 上传本机未同步（离线补传，与送测同名按钮同义）：只补传待传队列里的记录，不整库覆盖 */
  async function pushPending() {
    if (SYNC.mode !== 'server') throw new Error('尚未连接共享服务');
    const had = opCount();
    if (!had) return 0;
    await flushOps();
    return had;
  }
  /* 自动同步：SSE 是主通道，这里每 30 秒兜底拉一次（断线 / 代理掐断时的保险） */
  function startAutoSync() {
    stopAutoSync();
    if (!cloudCfg.auto) return;
    SYNC.autoT = setInterval(() => {
      if (document.hidden || SYNC.mode !== 'server') return;
      pullStore().catch(() => { });
    }, 30000);
  }
  function stopAutoSync() { if (SYNC.autoT) { clearInterval(SYNC.autoT); SYNC.autoT = null; } }

  /* 清空云端（仅管理员；服务端二次校验口令） */
  async function wipeCloud() {
    const r = await fetch(SYNC.server + '/api/wipe', { method: 'POST', headers: cloudHeaders({ 'content-type': 'application/json' }), body: JSON.stringify({ adminKey: normKey(cloudCfg.adminKey) }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.ok) throw new Error((j && j.error) || 'HTTP ' + r.status);
    SYNC.ver = j.ver || 1;
    await pullStore(true).catch(() => { });
    return true;
  }

  /* ---------------- 业务操作 ---------------- */
  /* 值是否相同（表单回填会把未改动的字段也一起提交，必须按值判断是否真的改了） */
  function sameVal(a, b) {
    if (a === b) return true;
    if (a == null && b == null) return true;
    if (a == null || b == null) return false;
    return String(a) === String(b);
  }
  /* 单调时间戳：一定大于记录原有 ts，避免本机时钟略慢时自己的改动反而「更旧」被合并掉 */
  function nextTs(prev) { return Math.max(Date.now(), (prev && Number(prev.ts) ? Number(prev.ts) : 0) + 1); }

  /* 编辑基线：打开编辑窗时把记录快照下来。
     判断「用户到底改了哪个字段」要跟打开窗口时的值比，而不是跟此刻服务端的最新值比 ——
     否则用户在填表期间别人改了另一个字段，表单把旧值回传时就会把别人的改动当成「改回去了」。 */
  const EDIT_BASE = {};
  function markEdit(coll, id) {
    const r = state.data[coll] && state.data[coll][id];
    if (!r) return null;
    try { EDIT_BASE[coll + '/' + id] = JSON.parse(JSON.stringify(r)); } catch (e) { EDIT_BASE[coll + '/' + id] = r; }
    return r;
  }

  function upsert(coll, patch, logDetail) {
    const editId = patch && patch.id;
    const id = editId || uid(coll.slice(0, 3));       // 兜底：undefined patch.id 不覆盖新 id
    const prev = state.data[coll][id] || null;
    const base = EDIT_BASE[coll + '/' + id] || null;
    if (base) delete EDIT_BASE[coll + '/' + id];
    const t = nextTs(prev);
    const rec = {
      id: id,
      ts: t,
      /* by 是「创建人」，用于归属与越权校验；改别人的单据不能把归属改到自己名下 */
      by: (prev && prev.by) || ME.name,
      f: Object.assign({}, (prev && prev.f) || {})
    };
    /* 只给「用户确实动过」的字段打新时间戳 —— 这是并发不互相覆盖的关键：
       两个人同时改同一条单子的不同字段，回填表单里那些没动的字段不会被误当成新写入，
       服务端字段级合并时就能把两边的改动都留下。 */
    Object.keys(patch || {}).forEach(k => {
      if (k === 'id' || k === 'ts' || k === 'by' || k === 'f') return;
      const ref = (base && k in base) ? base[k] : (prev ? prev[k] : undefined);
      const changed = !prev || !sameVal(ref, patch[k]);
      if (changed) {
        rec[k] = patch[k];
        rec.f[k] = Math.max(t, ((prev && prev.f && Number(prev.f[k])) || 0) + 1);
      } else {
        /* 用户没动这个字段：保留当前值（可能已被别人改过），不要用表单里的旧值写回去 */
        rec[k] = (prev && k in prev) ? prev[k] : patch[k];
        rec.f[k] = (prev && prev.f && Number(prev.f[k])) || t;
      }
    });
    /* 表单没提交的字段原样保留（含其时间戳），防止被当成「删除字段」 */
    if (prev) {
      for (const k of FIELDS) {
        if (k in rec || !(k in prev)) continue;
        rec[k] = prev[k];
        rec.f[k] = (prev.f && prev.f[k]) || prev.ts || t;
      }
    }
    state.data[coll][id] = normRec(rec);
    queueOp(coll, id, state.data[coll][id], false, null, base ? base.ts : (prev ? prev.ts : 0));
    logOp(editId ? '修改' : '新增', coll, id, logDetail || '');
    saveState();
    return state.data[coll][id];
  }
  function remove(coll, id, logDetail) {
    const rec = state.data[coll][id];
    if (!rec) return;
    delete state.data[coll][id];
    const t = Math.max(Date.now(), (Number(rec.ts) || 0) + 1, (Number(state.data.tomb[id]) || 0) + 1);
    state.data.tomb[id] = t;
    queueOp(coll, id, null, true, t);
    logOp('删除', coll, id, logDetail || '');
    saveState();
  }
  function get(coll, id) { return state.data[coll][id] || null; }
  function list(coll) { return Object.values(state.data[coll]); }
  function logOp(action, entity, refId, detail) {
    const t = Date.now();
    const r = { id: uid('log'), ts: t, by: ME.name || '—', action, entity, refId: refId || '', detail: detail || '', f: { action: t, entity: t, refId: t, detail: t } };
    state.data.logs[r.id] = normRec(r);
    queueOp('logs', r.id, state.data.logs[r.id], false);
  }

  /* ---------------- 派生计算纯函数 ---------------- */
  function arrivalsOf(pid) { return list('arrivals').filter(a => a.pid === pid); }
  function dispatchesOf(aid) { return list('dispatches').filter(d => d.aid === aid); }
  function receiptOf(aid) { return list('receipts').find(r => r.aid === aid) || null; }
  function signoffOf(did) { return list('signoffs').find(s => s.did === did) || null; }
  function dispatchedOf(aid) { return dispatchesOf(aid).reduce((s, d) => s + num(d.qty), 0); }

  function stockOf(mid) {
    let recvTotal = 0, usedTotal = 0;
    for (const a of list('arrivals')) {
      if (a.mid !== mid) continue;
      const rc = receiptOf(a.id);
      if (rc) recvTotal += num(rc.recvQty);
    }
    for (const d of list('dispatches')) if (d.mid === mid) usedTotal += num(d.qty);
    return { recvTotal, usedTotal, remain: recvTotal - usedTotal };
  }

  function burnRateOf(mid) {
    const now = Date.now(), WIN = 30 * 86400000;
    const disp = list('dispatches').filter(d => d.mid === mid).map(d => ({ qty: num(d.qty), t: tsOf(d.at) })).filter(x => x.t > 0 && x.t <= now);
    if (!disp.length) return { rate: 0, days: 0, sample: false, activeDays: 0 };
    const recent = disp.filter(x => x.t >= now - WIN);
    const used = recent.length ? recent : disp;
    const sum = used.reduce((s, x) => s + x.qty, 0);
    const daySet = new Set(used.map(x => new Date(x.t).toDateString()));
    const activeDays = daySet.size;
    const firstT = Math.min(...disp.map(x => x.t));
    const spanDays = Math.max(1, Math.min(30, Math.ceil((now - firstT) / 86400000)));
    const rate = sum / Math.max(1, activeDays);
    return { rate, days: spanDays, sample: activeDays < 7, activeDays };
  }

  function daysLeftOf(mid) {
    const st = stockOf(mid), br = burnRateOf(mid);
    if (br.rate <= 0) return { days: null, rate: 0 };
    return { days: Math.max(0, Math.round(st.remain / br.rate)), rate: br.rate };
  }

  function alertLevel(mid) {
    const m = get('materials', mid);
    const safe = m ? num(m.safe) : 0;
    if (safe <= 0) return { level: 'ok', safe };
    const remain = stockOf(mid).remain;
    if (remain <= safe) return { level: 'red', safe, remain };
    if (remain <= safe * 1.5) return { level: 'yellow', safe, remain };
    return { level: 'ok', safe, remain };
  }

  function purchaseStatus(p) {
    const approval = purchaseApprovalStatus(p);
    if (approval !== APPROVAL_APPROVED) return approval;
    const arr = arrivalsOf(p.id).reduce((s, a) => s + num(a.arrQty), 0);
    const q = num(p.qty);
    if (arr <= 0) return '已采购未到货';
    if (arr < q) return '部分到货';
    return '已到货';
  }

  function docStatus(rec) {
    if (rec.entity === 'purchases' || state.data.purchases[rec.id]) {
      const p = state.data.purchases[rec.id];
      const approval = p ? purchaseApprovalStatus(p) : '';
      if (['待审核', '待核准', '已驳回'].includes(approval)) return approval;
      if (p && purchaseStatus(p) !== '已到货') return '待到货';
    }
    const a = state.data.arrivals[rec.id];
    if (a) { const rc = receiptOf(a.id); if (!rc) return '待签收'; }
    const d = state.data.dispatches[rec.id];
    if (d) { const s = signoffOf(d.id); if (!s) return '待领用确认'; }
    return null;
  }

  function pendingDocs() {
    const pend = { '待审核': [], '待核准': [], '待到货': [], '待签收': [], '待领用确认': [] };
    for (const p of list('purchases')) {
      const approval = purchaseApprovalStatus(p);
      if (approval === APPROVAL_PENDING) pend['待审核'].push(p);
      else if (approval === APPROVAL_WAITING) pend['待核准'].push(p);
      else if (approval === APPROVAL_APPROVED && purchaseStatus(p) !== '已到货') pend['待到货'].push(p);
    }
    for (const a of list('arrivals')) if (!receiptOf(a.id)) pend['待签收'].push(a);
    for (const d of list('dispatches')) if (!signoffOf(d.id)) pend['待领用确认'].push(d);
    return pend;
  }

  function sourceSummary(m) {
    const out = {
      'OA请购': { purchaseQty: 0, purchaseCount: 0, arriveQty: 0, arriveCount: 0, recvQty: 0, recvCount: 0, pendingReview: 0, pendingApproval: 0 },
      '行政请购': { purchaseQty: 0, purchaseCount: 0, arriveQty: 0, arriveCount: 0, recvQty: 0, recvCount: 0, pendingReview: 0, pendingApproval: 0 },
      '其他': { purchaseQty: 0, purchaseCount: 0, arriveQty: 0, arriveCount: 0, recvQty: 0, recvCount: 0, pendingReview: 0, pendingApproval: 0 }
    };
    for (const p of list('purchases')) {
      if (!inMonth(p.date, m)) continue;
      const bucket = out[purchaseRequestSource(p)];
      bucket.purchaseQty += num(p.qty);
      bucket.purchaseCount += 1;
      const approval = purchaseApprovalStatus(p);
      if (approval === APPROVAL_PENDING) bucket.pendingReview += 1;
      if (approval === APPROVAL_WAITING) bucket.pendingApproval += 1;
    }
    for (const a of list('arrivals')) {
      if (!inMonth(a.arrDate, m)) continue;
      const purchase = a.pid ? get('purchases', a.pid) : null;
      const bucket = out[purchaseRequestSource(purchase)];
      bucket.arriveQty += num(a.arrQty);
      bucket.arriveCount += 1;
    }
    for (const rc of list('receipts')) {
      if (!inMonth(rc.recvAt, m)) continue;
      const arrival = get('arrivals', rc.aid);
      const purchase = arrival && arrival.pid ? get('purchases', arrival.pid) : null;
      const bucket = out[purchaseRequestSource(purchase)];
      bucket.recvQty += num(rc.recvQty);
      bucket.recvCount += 1;
    }
    return out;
  }

  function monthSummary(m) {
    const out = { month: m, purchaseQty: 0, purchaseCount: 0, arriveQty: 0, arriveCount: 0, recvQty: 0, recvCount: 0, dispatchByRegion: {}, usedByRegion: {}, pendingSignoffs: 0, stocks: [], sources: sourceSummary(m) };
    REGIONS.forEach(r => { out.dispatchByRegion[r] = 0; out.usedByRegion[r] = 0; });
    for (const p of list('purchases')) if (inMonth(p.date, m)) { out.purchaseQty += num(p.qty); out.purchaseCount++; }
    for (const a of list('arrivals')) if (inMonth(a.arrDate, m)) { out.arriveQty += num(a.arrQty); out.arriveCount++; }
    for (const rc of list('receipts')) {
      const a = get('arrivals', rc.aid);
      if (a && inMonth(rc.recvAt, m)) { out.recvQty += num(rc.recvQty); out.recvCount++; }
    }
    for (const d of list('dispatches')) {
      if (!inMonth(d.at, m)) continue;
      if (out.dispatchByRegion[d.region] == null) out.dispatchByRegion[d.region] = 0;
      out.dispatchByRegion[d.region] += num(d.qty);
    }
    for (const d of list('dispatches')) {
      if (out.usedByRegion[d.region] == null) continue;
      out.usedByRegion[d.region] += num(d.qty);
    }
    const pend = pendingDocs();
    out.pendingSignoffs = pend['待领用确认'].length;
    for (const mtl of list('materials')) {
      const st = stockOf(mtl.id), dl = daysLeftOf(mtl.id), al = alertLevel(mtl.id);
      out.stocks.push({ id: mtl.id, name: mtl.name, spec: mtl.spec, unit: mtl.unit, remain: st.remain, recvTotal: st.recvTotal, usedTotal: st.usedTotal, days: dl.days, rate: dl.rate, alert: al.level, safe: num(mtl.safe) });
    }
    return out;
  }

  /* ---------------- Excel（手写 ZIP+OOXML，零依赖） ---------------- */
  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
    return t;
  })();
  function crc32(buf) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }
  async function deflateRaw(bytes) {
    if (typeof CompressionStream !== 'function') return null;
    const cs = new CompressionStream('deflate-raw');
    const w = cs.writable.getWriter(); w.write(bytes); w.close();
    const buf = await new Response(cs.readable).arrayBuffer();
    return new Uint8Array(buf);
  }
  async function inflateRaw(bytes) {
    const ds = new DecompressionStream('deflate-raw');
    const w = ds.writable.getWriter(); w.write(bytes); w.close();
    return new Uint8Array(await new Response(ds.readable).arrayBuffer());
  }

  async function xlsxBuild(sheets) {  // sheets:[{name, rows:[[cell,...],...]}]
    const files = [];
    const xmlEsc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const colName = i => { let s = ''; i++; while (i) { s = String.fromCharCode(65 + (i - 1) % 26) + s; i = Math.floor((i - 1) / 26); } return s; };
    files.push({ name: '[Content_Types].xml', data: new TextEncoder().encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' + sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('') + '</Types>') });
    files.push({ name: '_rels/.rels', data: new TextEncoder().encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>') });
    files.push({ name: 'xl/workbook.xml', data: new TextEncoder().encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' + sheets.map((s, i) => `<sheet name="${xmlEsc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') + '</sheets></workbook>') });
    files.push({ name: 'xl/_rels/workbook.xml.rels', data: new TextEncoder().encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('') + '</Relationships>') });
    sheets.forEach((s, i) => {
      let rowsXml = '';
      s.rows.forEach((row, ri) => {
        let cellsXml = '';
        row.forEach((cell, ci) => {
          if (cell == null || cell === '') return;
          const ref = colName(ci) + (ri + 1);
          if (typeof cell === 'number' && isFinite(cell)) cellsXml += `<c r="${ref}"><v>${cell}</v></c>`;
          else cellsXml += `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xmlEsc(cell)}</t></is></c>`;
        });
        rowsXml += `<row r="${ri + 1}">${cellsXml}</row>`;
      });
      files.push({ name: `xl/worksheets/sheet${i + 1}.xml`, data: new TextEncoder().encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>' + rowsXml + '</sheetData></worksheet>') });
    });
    // 组 ZIP（逐段拼字节，避免 zipBuild 的混合 push 问题）
    const enc = new TextEncoder();
    const u16v = v => new Uint8Array([v & 255, (v >> 8) & 255]);
    const u32v = v => new Uint8Array([v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >>> 24) & 255]);
    const parts = [], central = [];
    let offset = 0;
    for (const f of files) {
      const nameB = enc.encode(f.name);
      let comp = await deflateRaw(f.data), method = 8;
      if (!comp) { comp = f.data; method = 0; }
      const crc = crc32(f.data);
      const lh = [u32v(0x04034b50), u16v(20), u16v(0), u16v(method), u16v(0), u16v(0), u32v(crc), u32v(comp.length), u32v(f.data.length), u16v(nameB.length), u16v(0)];
      parts.push(...lh, nameB, comp);
      central.push({ nameB, crc, csize: comp.length, usize: f.data.length, offset, method });
      offset += lh.reduce((s, x) => s + x.length, 0) + nameB.length + comp.length;
    }
    const cdStart = offset;
    let cdSize = 0;
    for (const c of central) {
      const ch = [u32v(0x02014b50), u16v(20), u16v(20), u16v(0), u16v(c.method), u16v(0), u16v(0), u32v(c.crc), u32v(c.csize), u32v(c.usize), u16v(c.nameB.length), u16v(0), u16v(0), u16v(0), u16v(0), u32v(0), u32v(c.offset)];
      parts.push(...ch, c.nameB);
      cdSize += ch.reduce((s, x) => s + x.length, 0) + c.nameB.length;
    }
    const eocd = [u32v(0x06054b50), u16v(0), u16v(0), u16v(central.length), u16v(central.length), u32v(cdSize), u32v(cdStart), u16v(0)];
    parts.push(...eocd);
    const total = parts.reduce((s, p) => s + p.length, 0);
    const outB = new Uint8Array(total);
    let pos = 0;
    for (const p of parts) { outB.set(p, pos); pos += p.length; }
    return outB;
  }

  /* ---- OA请购提报模板 V1.0 严格复刻导出（表头填充/字体/边框/列宽/行高/numFmt 与模板零差异） ----
     模板权威样式（openpyxl 提取）：表头 34 列，蓝 FF2E75B6 白字 / 黄 FFFFEEAD 蓝字(FF1450B8) /
     亮黄 FFFFFF00 黑字(P,Q,R) / 黄 FFFFEEAD 蓝字(X,Y,Z) / 蓝 FF0070C0(AG)；行1高70、数据行29；S/AF「yyyy/m/d;@」、T/U「mm-dd-yy」、
     P/Q「0_ 」；全表细边框、居中、表头换行。模板自身错位（S列单价为日期格式）按语义保留表头样式。 */
  const OA_HDR_XF = [1, 1, 1, 1, 1, 2, 2, 2, 2, 1, 1, 1, 1, 1, 1, 3, 3, 10, 5, 4, 4, 1, 1, 2, 2, 2, 1, 1, 1, 1, 1, 6, 7, 1];
  const OA_WIDTHS = { 0: 6.5, 3: 16.7, 5: 14.7, 7: 10.5, 8: 11.2, 10: 12.9, 11: 14.8, 12: 17.1, 13: 27.0, 15: 9.0, 19: 10.2, 25: 9.3, 26: 15.1, 27: 39.2, 28: 14.0, 31: 11.9, 33: 21.7 };
  const OA_QTY_COLS = [15, 16, 17];
  const OA_STYLES_XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<numFmts count="3"><numFmt numFmtId="176" formatCode="0_ "/><numFmt numFmtId="177" formatCode="yyyy/m/d;@"/><numFmt numFmtId="178" formatCode="mm-dd-yy"/></numFmts>' +
    '<fonts count="5"><font><sz val="11"/><name val="等线"/></font>' +
    '<font><b/><color rgb="FFFFFFFF"/><sz val="9"/><name val="等线"/></font>' +
    '<font><b/><color rgb="FF1450B8"/><sz val="9"/><name val="等线"/></font>' +
    '<font><b/><color rgb="FF000000"/><sz val="9"/><name val="等线"/></font>' +
    '<font><b/><color rgb="FFFFFFFF"/><sz val="12"/><name val="等线"/></font></fonts>' +
    '<fills count="6"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FF2E75B6"/><bgColor indexed="64"/></patternFill></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FFFFEEAD"/><bgColor indexed="64"/></patternFill></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FFFFFF00"/><bgColor indexed="64"/></patternFill></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FF0070C0"/><bgColor indexed="64"/></patternFill></fill></fills>' +
    '<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border>' +
    '<border><left style="thin"><color auto="1"/></left><right style="thin"><color auto="1"/></right><top style="thin"><color auto="1"/></top><bottom style="thin"><color auto="1"/></bottom><diagonal/></border></borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="11">' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
    '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>' +
    '<xf numFmtId="0" fontId="2" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>' +
    '<xf numFmtId="176" fontId="3" fillId="4" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>' +
    '<xf numFmtId="178" fontId="1" fillId="2" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>' +
    '<xf numFmtId="177" fontId="1" fillId="2" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>' +
    '<xf numFmtId="177" fontId="4" fillId="2" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>' +
    '<xf numFmtId="0" fontId="1" fillId="5" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>' +
    '<xf numFmtId="176" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"/>' +
    '<xf numFmtId="0" fontId="3" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>' +
    '</cellXfs><cellStyles count="1"><cellStyle name="常规" xfId="0" builtinId="0"/></cellStyles></styleSheet>';

  function oaCellXml(ref, v, s) {
    if (typeof v === 'number' && isFinite(v)) return '<c r="' + ref + '" s="' + s + '"><v>' + v + '</v></c>';
    if (v === '' || v == null) return '<c r="' + ref + '" s="' + s + '"/>';
    const t = String(v).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    return '<c r="' + ref + '" s="' + s + '" t="inlineStr"><is><t xml:space="preserve">' + t + '</t></is></c>';
  }
  function oaColsXml(widths) {
    const keys = Object.keys(widths);
    if (!keys.length) return '';
    return '<cols>' + keys.map(k => '<col min="' + (+k + 1) + '" max="' + (+k + 1) + '" width="' + widths[k] + '" customWidth="1"/>').join('') + '</cols>';
  }

  async function xlsxBuildOA(opts) {
    const headers = opts.headers || [];
    const oaRows = opts.oaRows || [];
    const aHeaders = opts.archiveHeaders || [];
    const aRows = opts.archiveRows || [];
    const colName = i => { let s = ''; i++; while (i) { s = String.fromCharCode(65 + (i - 1) % 26) + s; i = Math.floor((i - 1) / 26); } return s; };

    /* Sheet1：OA 请购提报格式 */
    let s1 = oaColsXml(OA_WIDTHS) + '<sheetData>';
    s1 += '<row r="1" ht="70" customHeight="1">' + headers.map((h, i) => oaCellXml(colName(i) + '1', h, OA_HDR_XF[i])).join('') + '</row>';
    oaRows.forEach((row, ri) => {
      const r = ri + 2;
      s1 += '<row r="' + r + '" ht="29" customHeight="1">' + row.map((v, ci) => {
        const s = (OA_QTY_COLS.includes(ci) && typeof v === 'number' && isFinite(v)) ? 8 : 9;
        return oaCellXml(colName(ci) + r, v, s);
      }).join('') + '</row>';
    });
    s1 += '</sheetData>';

    /* Sheet2：物料档案全字段快照 */
    const AW = { 0: 12, 1: 14, 2: 16, 3: 7, 4: 12, 5: 9, 6: 9, 7: 9, 8: 9, 9: 11, 10: 26 };
    let s2 = oaColsXml(AW) + '<sheetData>';
    s2 += '<row r="1" ht="30" customHeight="1">' + aHeaders.map((h, i) => oaCellXml(colName(i) + '1', h, 1)).join('') + '</row>';
    aRows.forEach((row, ri) => {
      const r = ri + 2;
      s2 += '<row r="' + r + '" ht="24" customHeight="1">' + row.map((v, ci) => oaCellXml(colName(ci) + r, v, 9)).join('') + '</row>';
    });
    s2 += '</sheetData>';

    const XMLHDR = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
    const NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"';
    const files = [
      { name: '[Content_Types].xml', data: new TextEncoder().encode(XMLHDR + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' + [1, 2, 3].map(i => '<Override PartName="/xl/worksheets/sheet' + i + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join('') + '</Types>') },
      { name: '_rels/.rels', data: new TextEncoder().encode(XMLHDR + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>') },
      { name: 'xl/workbook.xml', data: new TextEncoder().encode(XMLHDR + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/><sheet name="物料档案" sheetId="2" r:id="rId2"/><sheet name="Sheet3" sheetId="3" r:id="rId3"/></sheets></workbook>') },
      { name: 'xl/_rels/workbook.xml.rels', data: new TextEncoder().encode(XMLHDR + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet3.xml"/></Relationships>') },
      { name: 'xl/styles.xml', data: new TextEncoder().encode(OA_STYLES_XML) },
      { name: 'xl/worksheets/sheet1.xml', data: new TextEncoder().encode(XMLHDR + '<worksheet ' + NS + '>' + s1 + '</worksheet>') },
      { name: 'xl/worksheets/sheet2.xml', data: new TextEncoder().encode(XMLHDR + '<worksheet ' + NS + '>' + s2 + '</worksheet>') },
      { name: 'xl/worksheets/sheet3.xml', data: new TextEncoder().encode(XMLHDR + '<worksheet ' + NS + '><sheetData/></worksheet>') }
    ];

    const enc = new TextEncoder();
    const u16v = v => new Uint8Array([v & 255, (v >> 8) & 255]);
    const u32v = v => new Uint8Array([v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >>> 24) & 255]);
    const parts = [], central = [];
    let offset = 0;
    for (const f of files) {
      const nameB = enc.encode(f.name);
      let comp = await deflateRaw(f.data), method = 8;
      if (!comp) { comp = f.data; method = 0; }
      const crc = crc32(f.data);
      const lh = [u32v(0x04034b50), u16v(20), u16v(0), u16v(method), u16v(0), u16v(0), u32v(crc), u32v(comp.length), u32v(f.data.length), u16v(nameB.length), u16v(0)];
      parts.push(...lh, nameB, comp);
      central.push({ nameB: nameB, crc: crc, csize: comp.length, usize: f.data.length, offset: offset, method: method });
      offset += lh.reduce((s, x) => s + x.length, 0) + nameB.length + comp.length;
    }
    const cdStart = offset;
    let cdSize = 0;
    for (const c of central) {
      const ch = [u32v(0x02014b50), u16v(20), u16v(20), u16v(0), u16v(c.method), u16v(0), u16v(0), u32v(c.crc), u32v(c.csize), u32v(c.usize), u16v(c.nameB.length), u16v(0), u16v(0), u16v(0), u16v(0), u32v(0), u32v(c.offset)];
      parts.push(...ch, c.nameB);
      cdSize += ch.reduce((s, x) => s + x.length, 0) + c.nameB.length;
    }
    const eocd = [u32v(0x06054b50), u16v(0), u16v(0), u16v(central.length), u16v(central.length), u32v(cdSize), u32v(cdStart), u16v(0)];
    parts.push(...eocd);
    const total = parts.reduce((s, p) => s + p.length, 0);
    const outB = new Uint8Array(total);
    let pos = 0;
    for (const p of parts) { outB.set(p, pos); pos += p.length; }
    return outB;
  }

  async function zipRead(bytes) {   // -> {name: Uint8Array}
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    // 找 EOCD
    let eocd = -1;
    for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65536); i--) {
      if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('不是有效的 xlsx/zip 文件');
    const count = dv.getUint16(eocd + 10, true);
    let p = dv.getUint32(eocd + 16, true);
    const files = {};
    for (let i = 0; i < count; i++) {
      if (dv.getUint32(p, true) !== 0x02014b50) break;
      const method = dv.getUint16(p + 10, true);
      const csize = dv.getUint32(p + 20, true);
      const nlen = dv.getUint16(p + 28, true);
      const elen = dv.getUint16(p + 30, true);
      const clen = dv.getUint16(p + 32, true);
      const lho = dv.getUint32(p + 42, true);
      const name = new TextDecoder().decode(bytes.subarray(p + 46, p + 46 + nlen));
      const lm = dv.getUint16(lho + 8, true);
      const fnl = dv.getUint16(lho + 26, true);
      const eln = dv.getUint16(lho + 28, true);
      const dstart = lho + 30 + fnl + eln;
      let data = bytes.subarray(dstart, dstart + csize);
      if (lm === 8 || method === 8) data = await inflateRaw(data);
      files[name] = data;
      p += 46 + nlen + elen + clen;
    }
    return files;
  }

  function xmlText(s) {
    return String(s || '').replace(/&(#x[0-9a-f]+|#\d+|lt|gt|quot|#39|amp);/gi, (match, code) => {
      if (code[0] === '#') {
        const value = code[1] && code[1].toLowerCase() === 'x'
          ? parseInt(code.slice(2), 16)
          : parseInt(code.slice(1), 10);
        try { return Number.isFinite(value) ? String.fromCodePoint(value) : match; } catch (e) { return match; }
      }
      return ({ lt: '<', gt: '>', quot: '"', '#39': "'", amp: '&' })[code.toLowerCase()] || match;
    });
  }
  async function xlsxRead(bytes) {  // -> {sheetName: rows:[[cell...]]}
    const files = await zipRead(bytes);
    let shared = [];
    if (files['xl/sharedStrings.xml']) {
      const xml = new TextDecoder().decode(await maybeInflate(files, 'xl/sharedStrings.xml'));
      shared = [...xml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map(m => [...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(x => xmlText(x[1])).join(''));
    }
    const wbXml = new TextDecoder().decode(files['xl/workbook.xml']);
    const names = [...wbXml.matchAll(/<sheet[^>]*name="([^"]*)"[^>]*r:id="rId(\d+)"[^>]*\/?>/g)].map(m => ({ name: xmlText(m[1]), rid: Number(m[2]) }));
    const relXml = files['xl/_rels/workbook.xml.rels'] ? new TextDecoder().decode(files['xl/_rels/workbook.xml.rels']) : '';
    const rels = {};
    for (const m of relXml.matchAll(/<Relationship[^>]*Id="rId(\d+)"[^>]*Target="([^"]*)"[^>]*\/?>/g)) rels[Number(m[1])] = 'xl/' + m[2].replace(/^\//, '').replace(/^xl\//, '');
    const out = {};
    for (const sh of names) {
      const target = rels[sh.rid] || `xl/worksheets/sheet${sh.rid}.xml`;
      const raw = files[target];
      if (!raw) continue;
      const xml = new TextDecoder().decode(raw);
      const rows = [];
      for (const rm of xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
        const row = [];
        for (const cm of rm[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
          const attrs = cm[1] || '';
          const inner = cm[2] || '';
          const tm0 = attrs.match(/\bt="(\w+)"/); const t = tm0 ? tm0[1] : 'n';
          const rm0 = attrs.match(/\br="([A-Z]+)\d+"/); const ref = rm0 ? rm0[1] : '';
          let col = 0;
          for (const ch of ref) col = col * 26 + (ch.charCodeAt(0) - 64);
          let val = '';
          if (t === 'inlineStr') { const tm = inner.match(/<t[^>]*>([\s\S]*?)<\/t>/); val = tm ? xmlText(tm[1]) : ''; }
          else if (t === 's') { const vm = inner.match(/<v>([\s\S]*?)<\/v>/); val = vm ? (shared[Number(vm[1])] || '') : ''; }
          else if (t === 'str') { const vm = inner.match(/<v>([\s\S]*?)<\/v>/); val = vm ? xmlText(vm[1]) : ''; }
          else { const vm = inner.match(/<v>([\s\S]*?)<\/v>/); val = vm ? vm[1] : ''; }
          while (row.length < col - 1) row.push('');
          if (col > 0) row[col - 1] = val;
        }
        rows.push(row);
      }
      out[sh.name] = rows;
    }
    return out;
  }
  async function maybeInflate(files, name) { return files[name]; }   // zipRead 已解压

  function csvParse(text) {
    const rows = [];
    let row = [], cell = '', q = false;
    const t = text.replace(/^\uFEFF/, '');
    for (let i = 0; i < t.length; i++) {
      const c = t[i];
      if (q) {
        if (c === '"') { if (t[i + 1] === '"') { cell += '"'; i++; } else q = false; }
        else cell += c;
      } else {
        if (c === '"') q = true;
        else if (c === ',') { row.push(cell); cell = ''; }
        else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
        else if (c === '\r') { }
        else cell += c;
      }
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows;
  }
  function csvBuild(rows) {
    return '\uFEFF' + rows.map(r => r.map(c => { c = String(c == null ? '' : c); return /[",\n]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c; }).join(',')).join('\n');
  }

  function downloadBlob(bytes, filename, mime) {
    const blob = new Blob([bytes], { type: mime || 'application/octet-stream' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  function normDate(s) {
    s = String(s == null ? '' : s).trim();
    if (!s) return '';
    if (/^\d{5}(\.\d+)?$/.test(s)) {   // Excel 日期序列号（兼容带时间小数）
      const d = new Date(Date.UTC(1899, 11, 30) * 1 + Math.floor(Number(s)) * 86400000);
      return d.toISOString().slice(0, 10);
    }
    let m = s.match(/^(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})/);
    if (m) return `${m[1]}-${pad(Number(m[2]))}-${pad(Number(m[3]))}`;
    m = s.match(/^(\d{4})(\d{2})(\d{2})/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    return s;
  }

  /* ---------------- 导入列映射 ---------------- */
  /* 列名别名：OA请购提报模板 V1.0 列名优先，旧模板列名保留兼容 */
  const IMP_MAP = {
    materials: {
      code: ['存货编码', '物料编码', '编码'],
      name: ['存货名称', '物料名称', '名称', '品名', '物料'],
      spec: ['规格型号', '规格', '型号'],
      unit: ['单位', '计量单位'],
      category: ['物品分类', '物品类型', '分类'],
      safe: ['安全库存', '安全库存量', '告警线'],
      note: ['描述', '备注', '说明', '用途说明']
    },
    purchases: {
      code: ['存货编码', '物料编码', '编码'],
      materialName: ['存货名称', '物料名称', '名称', '品名', '物料'],
      spec: ['规格型号', '规格', '型号'],
      unit: ['单位', '计量单位'],
      category: ['物品分类', '物品类型', '分类'],
      requestSource: ['请购来源', '请购类型', '采购来源', '来源'],
      qty: ['请购数量', '采购数量', '数量', '采购量'],
      date: ['申请时间', '采购日期', '日期'],
      purpose: ['申请原因', '用途说明', '用途', '用途描述'],
      dest: ['使用去向', '地点', '去向', '使用目的'],
      dept: ['申请部门', '请购部门', '部门']
    },
    arrivals: {
      code: ['存货编码', '物料编码', '编码'],
      materialName: ['存货名称', '物料名称', '名称', '物料'],
      arrQty: ['实际到货数量', '到货数量', '实到数量'],
      arrDate: ['到货日期', '到货时间']
    },
    dispatches: {
      code: ['存货编码', '物料编码', '编码'],
      materialName: ['存货名称', '物料名称', '名称', '物料'],
      region: ['分发区域', '区域', '领用区域', '地点'],
      dept: ['领用部门', '申请部门', '部门'],
      qty: ['分发数量', '数量'],
      at: ['分发时间', '分发日期', '时间']
    },
    members: {
      name: ['姓名', '成员姓名', '人员姓名'],
      username: ['品集账号', '账号', '用户名', '登录账号'],
      role: ['业务角色', '角色', '身份'],
      region: ['所属区域', '区域', '领用区域'],
      dept: ['所属部门', '部门'],
      supervisorName: ['上级区域领用人', '上级', '上级姓名'],
      reviewerName: ['指定审核人', '审核人', '提交人审核人'],
      approverName: ['指定核准人', '核准人', '提交人核准人'],
      approvalMode: ['审批模式', '审批流程', '审批方式'],
      enabled: ['启用状态', '状态', '是否启用']
    }
  };
  function guessMapping(headers, coll) {
    const map = {}, used = new Set();
    const norm = s => String(s || '').replace(/\s+/g, '');
    for (const [field, aliases] of Object.entries(IMP_MAP[coll] || {})) {
      let hit = -1;
      // 按别名优先级逐个尝试：先精确相等，再包含匹配（避免「物品类型」抢走「物品分类」）
      for (const a of aliases) {
        hit = headers.findIndex(h => h && norm(h) === a && !used.has(h));
        if (hit < 0) hit = headers.findIndex(h => h && norm(h).includes(a) && !used.has(h));
        if (hit >= 0) break;
      }
      if (hit >= 0) { map[field] = hit; used.add(headers[hit]); }
    }
    return map;
  }

  /* ---------------- 共享文档同步（无服务器 / 免防火墙） ----------------
     原理：本系统的数据本身就是「字段级时间戳(f) + 记录时间戳(ts) + 删除墓碑(tomb)」结构，
     两个人各录一批 → 各自导出共享包 → 互相导入 → mergeStates 做字段级合并：
       · 同一条记录的不同字段，谁后改谁生效，不会互相覆盖
       · 只有一边有的记录直接取用，不会丢
       · 删除用墓碑时间戳传递，不会「删了又被别人的旧数据复活」
     因此不需要服务器、不需要端口、不需要防火墙放行，靠共享盘/群文件/邮件即可多人协作。 */
  const BUNDLE_TAG = 'WZ-SYNC-BUNDLE';
  /* 导出基线：记录本机上次导出时间，增量导出只打包这之后的新改动（含删除墓碑） */
  const EXP_KEY = 'WZ_LAST_EXPORT_AT';
  const SEEN_KEY = 'WZ_SEEN_BUNDLES';
  function getLastExportAt() { try { return Number(localStorage.getItem(EXP_KEY)) || 0; } catch (e) { return 0; } }
  function markExported(t) { try { localStorage.setItem(EXP_KEY, String(t || Date.now())); } catch (e) { } }
  function seenBundles() { try { return JSON.parse(localStorage.getItem(SEEN_KEY) || '[]'); } catch (e) { return []; } }
  function markSeenBundle(key) {
    if (!key) return;
    try { const s = seenBundles(); if (!s.includes(key)) { s.push(key); localStorage.setItem(SEEN_KEY, JSON.stringify(s.slice(-200))); } } catch (e) { }
  }
  /* 记录的真实改动时间 = 记录级 ts 与所有字段级 f 时间戳的最大值 */
  function recTouchTs(r) {
    let t = Number(r && r.ts) || 0;
    const f = (r && r.f) || {};
    for (const k of Object.keys(f)) t = Math.max(t, Number(f[k]) || 0);
    return t;
  }
  function syncCounts(d) {
    const n = {}; let total = 0;
    COLLS.forEach(c => { const k = Object.keys((d && d[c]) || {}).length; n[c] = k; total += k; });
    n.total = total;
    return n;
  }
  /* opts.mode='inc' → 增量包：只含上次导出基线之后的新改动（记录按字段级时间戳过滤，删除按墓碑时间戳过滤）。
     增量包与全量包合并结果一致（mergeStates 按时间戳叠加，与顺序无关），但体积小、流转快。 */
  function syncBundleText(opts) {
    const o = opts || {};
    const since = o.mode === 'inc' ? getLastExportAt() : 0;
    let data;
    if (since > 0) {
      data = { tomb: {} };
      const srcTomb = state.data.tomb || {};
      for (const id of Object.keys(srcTomb)) { const t = Number(srcTomb[id]) || 0; if (t > since) data.tomb[id] = t; }
      for (const c of COLLS) {
        data[c] = {};
        const src = state.data[c] || {};
        for (const id of Object.keys(src)) { if (recTouchTs(src[id]) > since) data[c][id] = src[id]; }
      }
    } else data = state.data;
    const body = {
      tag: BUNDLE_TAG, ver: 2, mode: since > 0 ? 'incremental' : 'full', since,
      exportedAt: Date.now(), exportedBy: me().name || '', device: clientId(),
      counts: syncCounts(data), data, stateVer: state.ver, stateUpdatedAt: state.updatedAt
    };
    return JSON.stringify(body);
  }
  function syncBundleName(opts) {
    const d = new Date();
    const t = today() + '_' + pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds());
    const who = String(me().name || '未设身份').replace(/[\\/:*?"<>|\s]+/g, '');
    const kind = (opts && opts.mode === 'inc' && getLastExportAt() > 0) ? '增量' : '';
    return '物资共享包_' + who + (kind ? '_' + kind : '') + '_' + t + '.json';
  }
  function syncMergeText(text) {
    let raw;
    try { raw = JSON.parse(String(text || '')); }
    catch (e) { throw new Error('不是有效的 JSON：可能选错了文件，或文件被改坏'); }
    // 兼容三种来源：本模块共享包 / 服务器备份 store.json / 裸 data 对象
    let payload = null;
    if (raw && raw.data && typeof raw.data === 'object') payload = raw;
    else if (raw && raw.state && raw.state.data) payload = raw.state;
    else if (raw && typeof raw === 'object' && COLLS.some(coll => raw[coll] && typeof raw[coll] === 'object')) payload = { data: raw };
    if (!payload || !payload.data) throw new Error('文件里没有可识别的数据，不是本系统的共享包或备份');
    /* 重复包识别：同一设备同一导出时间的包只合并一次，重复导入直接跳过（防手抖重复合并导致误判） */
    const seenKey = raw.tag === BUNDLE_TAG ? String(raw.device || '') + '@' + String(raw.exportedAt || '') : '';
    if (seenKey && seenBundles().includes(seenKey)) {
      return { skipped: true, from: String(raw.exportedBy || '未知来源'), at: Number(raw.exportedAt || 0) };
    }
    const beforeMap = syncCounts(state.data);
    const wasServer = SYNC.mode === 'server';
    state = mergeStates(state, payload);
    if (me().name) state.updatedBy = me().name;
    saveLocal(true);
    if (wasServer) { clearTimeout(SYNC.pushT); SYNC.pushT = setTimeout(pushStore, 400); }
    renderAll();
    const afterMap = syncCounts(state.data);
    markSeenBundle(seenKey);
    return {
      from: String(raw.exportedBy || raw.updatedBy || (raw.state && raw.state.updatedBy) || '未知来源'),
      at: Number(raw.exportedAt || raw.updatedAt || 0),
      before: beforeMap.total, after: afterMap.total,
      added: Math.max(0, afterMap.total - beforeMap.total),
      counts: afterMap
    };
  }

  /* 要发给同事的地址：已连共享用服务地址，否则用当前网址；本地文件打开时为空 */
  function shareUrl() {
    if (SYNC.server) return SYNC.server;
    try {
      if (/^https?:$/i.test(location.protocol)) return String(location.origin || '').replace(/\/$/, '');
    } catch (e) { }
    return '';
  }

  /* ---------------- boot ---------------- */
  let booted = false;
  function boot() {
    if (booted) return;
    booted = true;
    loadMe(); loadCloudCfg(); loadLocal(); renderAll(); updatePill();
    connect();
    if (typeof WZ_ON_BOOT === 'function') WZ_ON_BOOT();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  return {
    COLLS, ROLES, AREA_ROLES, OFFICE_ROLES, APPROVAL_PENDING, APPROVAL_WAITING, APPROVAL_APPROVED, APPROVAL_REJECTED, FIELDS,
    APPROVAL_MODE_TWO_STEP, APPROVAL_MODE_REVIEW_ONLY, APPROVAL_MODE_DIRECT_APPROVE, APPROVAL_MODE_LABELS,
    get REGIONS() { return REGIONS; }, get REGION_LABEL() { return REGION_LABEL; }, get DEPTS() { return DEPTS; }, saveOrgCfg,
    state, get state$() { return state; }, SYNC, me, setMe, applyServerIdentity, isRole, isMemberMatched, systemAdminLabel, isSystemAdmin, canManageMaterials, canManageMembers, canImportMaterials, canEditFlow, canCreatePurchase, canReviewPurchase, canApprovePurchase, canConfirm, canConfirmDispatch, roleCapabilities,
    currentMember, resolveApprovalRoute, submitterMemberFor, approvalRouteSnapshot,
    upsert, remove, get, list, logOp, saveState, saveLocal, wipeCloud, saveCloudCfg, markEdit, importMaterials,
    normalize, mergeStates, switchMode, updatePill, toast, onRender, renderAll, cloudCfg, cloudHeaders, upgradeLegacyPort, probeEx, autoDetect,
    pullStore, pushStore, pushPending, startAutoSync, stopAutoSync, shareUrl,
    flushOps, scheduleFlush, pendingOps: () => opCount(),
    scopeInfo, scopeLabel, adminKeyHint, normKey, verifyAdminKey, setShowAll, inScope, canOperateRec, teamStats,
    purchaseApprovalStatus, purchaseRequestSource, sourceSummary, memberById, membersForRegion, supervisorsForRegion,
    syncBundleText, syncBundleName, syncMergeText, syncCounts, getLastExportAt, markExported, recTouchTs,
    stockOf, burnRateOf, daysLeftOf, alertLevel, purchaseStatus, docStatus, pendingDocs, monthSummary,
    arrivalsOf, dispatchesOf, receiptOf, signoffOf, dispatchedOf,
    xlsxBuild, xlsxBuildOA, xlsxRead, csvParse, csvBuild, downloadBlob, normDate, guessMapping, IMP_MAP,
    uid, today, nowStr, thisMonth, monthOf, inMonth, tsOf, esc, num, fmtQty,
    LS_KEY, PEND_KEY, ME_KEY, SRV_KEY, CID_KEY, LS_CLOUD,
    _setState: s => { state = s; },
    _getState: () => state,
    closeStream: () => { if (SYNC.es) { try { SYNC.es.close(); } catch (e) { } SYNC.es = null; } if (SYNC.pollT) { clearInterval(SYNC.pollT); SYNC.pollT = null; } },
  };
})();
