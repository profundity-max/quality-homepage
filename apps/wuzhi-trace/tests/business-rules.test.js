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

const admin = { name: '管理员', role: '管理员', region: '', admin: true, authMode: 'standalone' };
const clerk = { name: '文员甲', role: '文员', region: '', admin: false, authMode: 'qnexus' };
const area2 = { name: '领用人甲', role: '区域领用人', region: 'IPQC2', admin: false, authMode: 'qnexus' };

test('完整主流程可写入：采购 → 到货 → 实收 → 分发 → 签字', () => {
  const material = rec('m1', { name: '无尘布', unit: '包', safe: 2 });
  const purchase = rec('p1', { mid: 'm1', qty: 10, date: '2026-11-18' });
  const arrival = rec('a1', { pid: 'p1', mid: 'm1', arrQty: 10, arrDate: '2026-11-18' });
  const receipt = rec('r1', { aid: 'a1', recvQty: 10, recvBy: '文员甲' });
  const dispatch = rec('d1', { aid: 'a1', mid: 'm1', region: 'IPQC2', qty: 4 });
  const signoff = rec('s1', { did: 'd1', signer: '领用人甲' }, Date.now(), '领用人甲');
  const data = stateWith({
    materials: { m1: material },
    purchases: { p1: purchase },
    arrivals: { a1: arrival },
    receipts: { r1: receipt },
    dispatches: { d1: dispatch },
  }).data;
  const violations = validateMutation({
    previousData: { tomb: {}, signoffs: {} },
    nextData: { tomb: {}, signoffs: { s1: signoff } },
    fullData: data,
    who: area2,
  });
  assert.deepEqual(violations, []);
});

test('未签收的到货批次不能分发', () => {
  const data = stateWith({
    materials: { m1: rec('m1', { name: '无尘布' }) },
    arrivals: { a1: rec('a1', { pid: 'p1', mid: 'm1', arrQty: 10 }) },
  }).data;
  const dispatch = rec('d1', { aid: 'a1', mid: 'm1', region: 'IPQC2', qty: 1 });
  const violations = validateMutation({
    previousData: { tomb: {}, dispatches: {} },
    nextData: { tomb: {}, dispatches: { d1: dispatch } },
    fullData: data,
    who: clerk,
  });
  assert.match(violations.join('\n'), /尚未签收/);
});

test('分发数量不能超过该批次实收数量', () => {
  const data = stateWith({
    materials: { m1: rec('m1', { name: '无尘布' }) },
    arrivals: { a1: rec('a1', { pid: 'p1', mid: 'm1', arrQty: 10 }) },
    receipts: { r1: rec('r1', { aid: 'a1', recvQty: 5 }) },
    dispatches: { d0: rec('d0', { aid: 'a1', mid: 'm1', region: 'IPQC2', qty: 4 }) },
  }).data;
  const dispatch = rec('d1', { aid: 'a1', mid: 'm1', region: 'IPQC2', qty: 2 });
  const violations = validateMutation({
    previousData: { tomb: {}, dispatches: {} },
    nextData: { tomb: {}, dispatches: { d1: dispatch } },
    fullData: data,
    who: clerk,
  });
  assert.match(violations.join('\n'), /不能超过该批次的实收数量/);
});

test('区域领用人不能跨区域签字，且签字人必须与品集身份一致', () => {
  const dispatch = rec('d1', { aid: 'a1', mid: 'm1', region: 'IPQC3', qty: 1 });
  const data = stateWith({ dispatches: { d1: dispatch } }).data;
  const signoff = rec('s1', { did: 'd1', signer: '领用人甲' }, Date.now(), '领用人甲');
  const wrongRegion = validateMutation({
    previousData: { tomb: {}, signoffs: {} },
    nextData: { tomb: {}, signoffs: { s1: signoff } },
    fullData: data,
    who: area2,
  });
  assert.match(wrongRegion.join('\n'), /只能确认 IPQC2/);

  const area3 = { ...area2, region: 'IPQC3' };
  const wrongSigner = rec('s2', { did: 'd1', signer: '其他人' }, Date.now(), '领用人甲');
  const signerViolations = validateMutation({
    previousData: { tomb: {}, signoffs: {} },
    nextData: { tomb: {}, signoffs: { s2: wrongSigner } },
    fullData: data,
    who: area3,
  });
  assert.match(signerViolations.join('\n'), /必须与当前品集登录身份一致/);
});

test('同一分发单只能确认一次', () => {
  const dispatch = rec('d1', { aid: 'a1', mid: 'm1', region: 'IPQC2', qty: 1 });
  const data = stateWith({
    dispatches: { d1: dispatch },
    signoffs: { s1: rec('s1', { did: 'd1', signer: '领用人甲' }) },
  }).data;
  const duplicate = rec('s2', { did: 'd1', signer: '领用人甲' }, Date.now() + 1);
  const violations = validateMutation({
    previousData: { tomb: {}, signoffs: {} },
    nextData: { tomb: {}, signoffs: { s2: duplicate } },
    fullData: data,
    who: admin,
  });
  assert.match(violations.join('\n'), /只能签字确认一次/);
});
