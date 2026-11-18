'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { validateMutation } = require('../src/domain/business-rules');
const { normRec, normalize } = require('../src/domain/model');

function rec(id, fields, ts = Date.now(), by = '张三') {
  return normRec({ id, ts, by, ...fields, f: Object.fromEntries(Object.keys(fields).map((key) => [key, ts])) });
}

function stateWith(records) {
  return normalize({ data: { tomb: {}, ...records } });
}

const systemAdmin = {
  name: '武欣雨', username: 'wuxinyu', role: '审核员', region: '', admin: true,
  systemAdmin: true, authMode: 'qnexus',
};
const reviewer = {
  name: '审核员甲', username: 'reviewer', role: '审核员', region: '', admin: false,
  systemAdmin: false, authMode: 'qnexus',
};
const approver = {
  name: '核准员甲', username: 'approver', role: '核准员', region: '', admin: false,
  systemAdmin: false, authMode: 'qnexus',
};
const areaLead = {
  name: '领用人甲', username: 'area.lead', role: '区域领用人', region: 'IPQC2',
  memberId: 'm-lead', admin: false, systemAdmin: false, authMode: 'qnexus',
};
const subordinate = {
  name: '领用人乙', username: 'area.member', role: '隶属区域领用人', region: 'IPQC2',
  memberId: 'm-sub', supervisorId: 'm-lead', admin: false, systemAdmin: false,
  authMode: 'qnexus',
};
const members = {
  'm-lead': rec('m-lead', {
    name: '领用人甲', username: 'area.lead', role: '区域领用人', region: 'IPQC2', enabled: true,
  }),
  'm-sub': rec('m-sub', {
    name: '领用人乙', username: 'area.member', role: '隶属区域领用人', region: 'IPQC2',
    enabled: true, supervisorId: 'm-lead',
  }),
};

function purchase(overrides = {}) {
  return rec('p1', {
    mid: 'm1', qty: 10, date: '2026-11-18', approvalStatus: '已核准',
    reviewedBy: '审核员甲', reviewedAt: '2026-11-18 09:00', approvedBy: '核准员甲',
    approvedAt: '2026-11-18 10:00', ...overrides,
  });
}

test('采购必须依次经过审核员一级审核和核准员最终核准', () => {
  const draft = rec('p1', { mid: 'm1', qty: 10, approvalStatus: '待审核' }, Date.now(), '领用人甲');
  const reviewed = rec('p1', {
    mid: 'm1', qty: 10, approvalStatus: '待核准', reviewedBy: '审核员甲',
    reviewedAt: '2026-11-18 09:00',
  }, Date.now() + 1, '领用人甲');
  const approved = rec('p1', {
    mid: 'm1', qty: 10, approvalStatus: '已核准', reviewedBy: '审核员甲',
    reviewedAt: '2026-11-18 09:00', approvedBy: '核准员甲', approvedAt: '2026-11-18 10:00',
  }, Date.now() + 2, '领用人甲');
  const data = stateWith({ materials: { m1: rec('m1', { name: '无尘布' }) } }).data;

  assert.deepEqual(validateMutation({
    previousData: { tomb: {}, purchases: {} },
    nextData: { tomb: {}, purchases: { p1: draft } },
    fullData: data,
    who: areaLead,
  }), []);
  assert.deepEqual(validateMutation({
    previousData: { tomb: {}, purchases: { p1: draft } },
    nextData: { tomb: {}, purchases: { p1: reviewed } },
    fullData: data,
    who: reviewer,
  }), []);
  assert.deepEqual(validateMutation({
    previousData: { tomb: {}, purchases: { p1: reviewed } },
    nextData: { tomb: {}, purchases: { p1: approved } },
    fullData: data,
    who: approver,
  }), []);
});

test('核准员不能代替审核员执行一级审核', () => {
  const draft = rec('p1', { mid: 'm1', qty: 10, approvalStatus: '待审核' });
  const waiting = rec('p1', { mid: 'm1', qty: 10, approvalStatus: '待核准' });
  const data = stateWith({ materials: { m1: rec('m1', { name: '无尘布' }) } }).data;
  const violations = validateMutation({
    previousData: { tomb: {}, purchases: { p1: draft } },
    nextData: { tomb: {}, purchases: { p1: waiting } },
    fullData: data,
    who: approver,
  });
  assert.match(violations.join('\n'), /只有审核员可以执行一级审核/);
});

test('完整主流程可写入：核准采购 → 到货 → 实收 → 分发 → 签字', () => {
  const data = stateWith({
    materials: { m1: rec('m1', { name: '无尘布', unit: '包', safe: 2 }) },
    members,
    purchases: { p1: purchase() },
    arrivals: { a1: rec('a1', { pid: 'p1', mid: 'm1', arrQty: 10, arrDate: '2026-11-18' }) },
    receipts: { r1: rec('r1', { aid: 'a1', recvQty: 10, recvBy: '审核员甲' }) },
    dispatches: {
      d1: rec('d1', {
        aid: 'a1', mid: 'm1', region: 'IPQC2', qty: 4,
        claimantId: 'm-lead', claimantName: '领用人甲',
      }),
    },
  }).data;
  const signoff = rec('s1', { did: 'd1', signer: '领用人甲' }, Date.now(), '领用人甲');
  const violations = validateMutation({
    previousData: { tomb: {}, signoffs: {} },
    nextData: { tomb: {}, signoffs: { s1: signoff } },
    fullData: data,
    who: areaLead,
  });
  assert.deepEqual(violations, []);
});

test('未核准采购不能登记到货', () => {
  const data = stateWith({
    materials: { m1: rec('m1', { name: '无尘布' }) },
    purchases: { p1: purchase({ approvalStatus: '待核准' }) },
  }).data;
  const arrival = rec('a1', { pid: 'p1', mid: 'm1', arrQty: 1, arrDate: '2026-11-18' });
  const violations = validateMutation({
    previousData: { tomb: {}, arrivals: {} },
    nextData: { tomb: {}, arrivals: { a1: arrival } },
    fullData: data,
    who: reviewer,
  });
  assert.match(violations.join('\n'), /尚未完成核准/);
});

test('未签收的到货批次不能分发', () => {
  const data = stateWith({
    materials: { m1: rec('m1', { name: '无尘布' }) },
    members,
    purchases: { p1: purchase() },
    arrivals: { a1: rec('a1', { pid: 'p1', mid: 'm1', arrQty: 10 }) },
  }).data;
  const dispatch = rec('d1', {
    aid: 'a1', mid: 'm1', region: 'IPQC2', qty: 1,
    claimantId: 'm-lead', claimantName: '领用人甲',
  });
  const violations = validateMutation({
    previousData: { tomb: {}, dispatches: {} },
    nextData: { tomb: {}, dispatches: { d1: dispatch } },
    fullData: data,
    who: reviewer,
  });
  assert.match(violations.join('\n'), /尚未签收/);
});

test('分发数量不能超过该批次实收数量', () => {
  const data = stateWith({
    materials: { m1: rec('m1', { name: '无尘布' }) },
    members,
    purchases: { p1: purchase() },
    arrivals: { a1: rec('a1', { pid: 'p1', mid: 'm1', arrQty: 10 }) },
    receipts: { r1: rec('r1', { aid: 'a1', recvQty: 5 }) },
    dispatches: {
      d0: rec('d0', {
        aid: 'a1', mid: 'm1', region: 'IPQC2', qty: 4,
        claimantId: 'm-lead', claimantName: '领用人甲',
      }),
    },
  }).data;
  const dispatch = rec('d1', {
    aid: 'a1', mid: 'm1', region: 'IPQC2', qty: 2,
    claimantId: 'm-lead', claimantName: '领用人甲',
  });
  const violations = validateMutation({
    previousData: { tomb: {}, dispatches: {} },
    nextData: { tomb: {}, dispatches: { d1: dispatch } },
    fullData: data,
    who: reviewer,
  });
  assert.match(violations.join('\n'), /不能超过该批次的实收数量/);
});

test('区域领用人不能跨区域签字，且签字人必须与品集身份一致', () => {
  const dispatch = rec('d1', {
    aid: 'a1', mid: 'm1', region: 'IPQC3', qty: 1,
    claimantId: 'm-lead', claimantName: '领用人甲',
  });
  const data = stateWith({ members, dispatches: { d1: dispatch } }).data;
  const signoff = rec('s1', { did: 'd1', signer: '领用人甲' }, Date.now(), '领用人甲');
  const wrongRegion = validateMutation({
    previousData: { tomb: {}, signoffs: {} },
    nextData: { tomb: {}, signoffs: { s1: signoff } },
    fullData: data,
    who: areaLead,
  });
  assert.match(wrongRegion.join('\n'), /只能确认所属区域/);

  const area3 = { ...areaLead, region: 'IPQC3' };
  const wrongSigner = rec('s2', { did: 'd1', signer: '其他人' }, Date.now(), '领用人甲');
  const signerViolations = validateMutation({
    previousData: { tomb: {}, signoffs: {} },
    nextData: { tomb: {}, signoffs: { s2: wrongSigner } },
    fullData: data,
    who: area3,
  });
  assert.match(signerViolations.join('\n'), /必须与当前品集登录身份一致/);
});

test('隶属区域领用人只能确认分配给本人的分发单', () => {
  const data = stateWith({
    members,
    dispatches: {
      d1: rec('d1', {
        aid: 'a1', mid: 'm1', region: 'IPQC2', qty: 1,
        claimantId: 'm-lead', claimantName: '领用人甲',
      }),
    },
  }).data;
  const signoff = rec('s1', { did: 'd1', signer: '领用人乙' }, Date.now(), '领用人乙');
  const violations = validateMutation({
    previousData: { tomb: {}, signoffs: {} },
    nextData: { tomb: {}, signoffs: { s1: signoff } },
    fullData: data,
    who: subordinate,
  });
  assert.match(violations.join('\n'), /只能确认分配给本人的单据/);
});

test('同一分发单只能确认一次', () => {
  const data = stateWith({
    members,
    dispatches: {
      d1: rec('d1', {
        aid: 'a1', mid: 'm1', region: 'IPQC2', qty: 1,
        claimantId: 'm-lead', claimantName: '领用人甲',
      }),
    },
    signoffs: { s1: rec('s1', { did: 'd1', signer: '领用人甲' }) },
  }).data;
  const duplicate = rec('s2', { did: 'd1', signer: '领用人甲' }, Date.now() + 1);
  const violations = validateMutation({
    previousData: { tomb: {}, signoffs: {} },
    nextData: { tomb: {}, signoffs: { s2: duplicate } },
    fullData: data,
    who: systemAdmin,
  });
  assert.match(violations.join('\n'), /只能签字确认一次/);
});

test('成员名单仅系统管理员可维护，隶属领用人必须绑定同区域上级', () => {
  const data = stateWith({ members }).data;
  const candidate = rec('m-new', {
    name: '领用人丙', username: 'area.c', role: '隶属区域领用人', region: 'IPQC2',
    supervisorId: 'm-lead', enabled: true,
  });
  const allowed = validateMutation({
    previousData: { tomb: {}, members },
    nextData: { tomb: {}, members: { ...members, 'm-new': candidate } },
    fullData: data,
    who: systemAdmin,
  });
  assert.deepEqual(allowed, []);

  const denied = validateMutation({
    previousData: { tomb: {}, members },
    nextData: { tomb: {}, members: { ...members, 'm-new': candidate } },
    fullData: data,
    who: reviewer,
  });
  assert.match(denied.join('\n'), /仅系统管理员武欣雨可维护/);

  const invalid = rec('m-bad', {
    name: '领用人丁', role: '隶属区域领用人', region: 'IPQC3', supervisorId: 'm-lead',
  });
  const invalidViolations = validateMutation({
    previousData: { tomb: {}, members },
    nextData: { tomb: {}, members: { ...members, 'm-bad': invalid } },
    fullData: data,
    who: systemAdmin,
  });
  assert.match(invalidViolations.join('\n'), /上级必须属于同一区域/);
});

test('隶属区域领用人可以确认分配给本人的分发单', () => {
  const data = stateWith({
    members,
    dispatches: {
      d1: rec('d1', {
        aid: 'a1', mid: 'm1', region: 'IPQC2', qty: 1,
        claimantId: 'm-sub', claimantName: '领用人乙',
      }),
    },
  }).data;
  const signoff = rec('s1', { did: 'd1', signer: '领用人乙' }, Date.now(), '领用人乙');
  const violations = validateMutation({
    previousData: { tomb: {}, signoffs: {} },
    nextData: { tomb: {}, signoffs: { s1: signoff } },
    fullData: data,
    who: subordinate,
  });
  assert.deepEqual(violations, []);
});

test('系统管理员修改已核准采购时必须重新进入审核流程', () => {
  const before = purchase();
  const after = rec('p1', {
    mid: 'm1', qty: 12, date: '2026-11-18', approvalStatus: '待审核',
  }, Date.now() + 1, '张三');
  const data = stateWith({
    materials: { m1: rec('m1', { name: '无尘布' }) },
    purchases: { p1: before },
  }).data;
  const violations = validateMutation({
    previousData: { tomb: {}, purchases: { p1: before } },
    nextData: { tomb: {}, purchases: { p1: after } },
    fullData: data,
    who: systemAdmin,
  });
  assert.deepEqual(violations, []);
});

test('采购请购来源只接受 OA请购、行政请购和其他', () => {
  const data = stateWith({
    materials: { m1: rec('m1', { name: '无尘布' }) },
  }).data;
  const valid = rec('p1', {
    mid: 'm1', qty: 1, approvalStatus: '待审核', requestSource: '行政请购',
  }, Date.now(), '领用人甲');
  assert.deepEqual(validateMutation({
    previousData: { tomb: {}, purchases: {} },
    nextData: { tomb: {}, purchases: { p1: valid } },
    fullData: data,
    who: areaLead,
  }), []);
  const invalid = rec('p2', {
    mid: 'm1', qty: 1, approvalStatus: '待审核', requestSource: '外部来源',
  }, Date.now(), '领用人甲');
  assert.match(validateMutation({
    previousData: { tomb: {}, purchases: {} },
    nextData: { tomb: {}, purchases: { p2: invalid } },
    fullData: data,
    who: areaLead,
  }).join('\n'), /请购来源无效/);
});
