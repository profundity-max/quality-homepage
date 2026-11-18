'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  mergeRec,
  mergeState,
  normRec,
  normalize,
} = require('../src/domain/model');

function record(id, fields, timestamps, by = '测试') {
  const ts = Math.max(...Object.values(timestamps));
  return normRec({ id, ts, by, ...fields, f: timestamps });
}

test('字段级合并保留双方修改的不同字段', () => {
  const left = record('p1', { qty: 10, purpose: '原始用途' }, { qty: 100, purpose: 100 });
  const right = record('p1', { qty: 12, purpose: '新用途' }, { qty: 200, purpose: 200 });
  const merged = mergeRec(left, right);
  assert.equal(merged.qty, 12);
  assert.equal(merged.purpose, '新用途');
});

test('同一字段冲突时较晚时间戳获胜且合并满足交换律', () => {
  const left = record('p1', { qty: 10, purpose: 'A' }, { qty: 100, purpose: 100 });
  const right = record('p1', { qty: 12, purpose: 'B' }, { qty: 200, purpose: 200 });
  assert.deepEqual(mergeRec(left, right), mergeRec(right, left));
  assert.equal(mergeRec(left, right).qty, 12);
});

test('墓碑删除不会被较旧记录复活', () => {
  const oldRecord = record('p1', { qty: 1 }, { qty: 100 });
  const left = normalize({
    ver: 2,
    data: { tomb: { p1: 300 }, purchases: { p1: oldRecord } },
  });
  const right = normalize({
    ver: 1,
    data: { tomb: {}, purchases: { p1: oldRecord } },
  });
  const merged = mergeState(left, right);
  assert.equal(merged.data.purchases.p1, undefined);
  assert.equal(merged.data.tomb.p1, 300);
});

test('规范化可接受裸 data 对象并忽略已删除记录', () => {
  const normalized = normalize({
    tomb: { p2: 500 },
    purchases: {
      p1: record('p1', { qty: 1 }, { qty: 100 }),
      p2: record('p2', { qty: 2 }, { qty: 200 }),
    },
  });
  assert.equal(normalized.data.purchases.p1.qty, 1);
  assert.equal(normalized.data.purchases.p2, undefined);
});
