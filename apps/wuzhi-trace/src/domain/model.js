'use strict';

const COLLECTIONS = Object.freeze([
  'materials',
  'purchases',
  'arrivals',
  'receipts',
  'dispatches',
  'signoffs',
  'members',
  'logs',
]);

const FIELDS = Object.freeze([
  'name', 'spec', 'unit', 'safe', 'note', 'code', 'category', 'mid', 'qty',
  'date', 'purpose', 'dest', 'dept', 'pid', 'arrQty', 'arrDate', 'aid',
  'recvQty', 'recvBy', 'recvAt', 'region', 'at', 'byWho', 'did', 'signer',
  'sigData', 'sigAt', 'role', 'action', 'entity', 'refId', 'detail',
  'username', 'enabled', 'supervisorId', 'requestSource', 'approvalStatus', 'reviewedBy',
  'reviewedAt', 'reviewComment', 'approvedBy', 'approvedAt', 'approvalComment',
  'rejectedBy', 'rejectedAt', 'rejectionReason', 'claimantId', 'claimantName',
  'approvalMode', 'reviewerId', 'reviewerName', 'reviewerUsername',
  'approverId', 'approverName', 'approverUsername', 'submitterMemberId', 'routeResolvedAt',
  'oaApplicant', 'oaRequestUnit', 'oaSupervisor', 'project', 'projectStage', 'areaStation',
  'processName', 'itemType', 'description', 'lineDemand', 'currentQty', 'unitPrice',
  'requiredDate', 'location', 'detailedLocation', 'engineeringApproved', 'engineeringDri',
  'engineeringApprovedAt', 'itemCategory', 'budgetList', 'expenseCategory', 'customerPaid',
  'bpmConfirmed', 'withinBudget', 'budgetNote',
]);

function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    const result = {};
    for (const key of Object.keys(value).sort()) result[key] = sortKeys(value[key]);
    return result;
  }
  return value;
}

function sameRecord(a, b) {
  if (!a || !b) return a === b;
  return JSON.stringify(sortKeys(a)) === JSON.stringify(sortKeys(b));
}

function normRec(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const record = {
    id: String(source.id || ''),
    ts: Number(source.ts) || 0,
    by: String(source.by || ''),
    f: {},
  };
  if (source.f && typeof source.f === 'object') {
    for (const key of Object.keys(source.f)) {
      record.f[key] = Number(source.f[key]) || 0;
    }
  }
  for (const key of Object.keys(source)) {
    if (key === 'id' || key === 'ts' || key === 'by' || key === 'f') continue;
    record[key] = source[key];
    if (!record.f[key]) record.f[key] = record.ts;
  }
  return record;
}

function normalize(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const data = source.data && typeof source.data === 'object' ? source.data : source;
  const output = {
    ver: Number(source.ver) || 0,
    updatedAt: Number(source.updatedAt) || 0,
    updatedBy: String(source.updatedBy || ''),
    data: { tomb: {} },
  };
  for (const collection of COLLECTIONS) output.data[collection] = {};

  const sourceTombs = data.tomb && typeof data.tomb === 'object' ? data.tomb : {};
  for (const id of Object.keys(sourceTombs)) {
    output.data.tomb[id] = Number(sourceTombs[id]) || 0;
  }

  for (const collection of COLLECTIONS) {
    const sourceCollection = data[collection];
    const records = Array.isArray(sourceCollection)
      ? sourceCollection
      : sourceCollection && typeof sourceCollection === 'object'
        ? Object.values(sourceCollection)
        : [];
    for (const rawRecord of records) {
      if (!rawRecord || typeof rawRecord !== 'object') continue;
      const record = normRec(rawRecord);
      if (!record.id) continue;
      const deletedAt = Number(output.data.tomb[record.id]) || 0;
      if (deletedAt >= record.ts) continue;
      output.data[collection][record.id] = record;
    }
  }
  return output;
}

function tieKey(record) {
  return `${String(record.by || '')}#${JSON.stringify(sortKeys(record))}`;
}

function mergeRec(a, b) {
  let base;
  let other;
  if (a.ts !== b.ts) {
    base = a.ts > b.ts ? a : b;
    other = base === a ? b : a;
  } else {
    const left = tieKey(a);
    const right = tieKey(b);
    base = left >= right ? a : b;
    other = base === a ? b : a;
  }
  const output = {
    id: base.id,
    ts: Math.max(a.ts, b.ts),
    by: base.by,
    f: { ...base.f },
  };
  for (const key of FIELDS) {
    if (!(key in base)) continue;
    output[key] = base[key];
    output.f[key] = Number(base.f[key]) || base.ts;
  }
  for (const key of FIELDS) {
    if (!(key in other)) continue;
    const otherTimestamp = Number(other.f && other.f[key]) || other.ts;
    const baseTimestamp = Number(output.f[key]) || 0;
    if (otherTimestamp > baseTimestamp) {
      output[key] = other[key];
      output.f[key] = otherTimestamp;
    }
  }
  return normRec(output);
}

function mergeState(leftRaw, rightRaw) {
  const left = normalize(leftRaw);
  const right = normalize(rightRaw);
  const tomb = { ...left.data.tomb };
  for (const id of Object.keys(right.data.tomb)) {
    tomb[id] = Math.max(Number(tomb[id]) || 0, Number(right.data.tomb[id]) || 0);
  }
  const data = { tomb };
  for (const collection of COLLECTIONS) {
    const records = { ...left.data[collection] };
    for (const id of Object.keys(right.data[collection])) {
      records[id] = records[id]
        ? mergeRec(records[id], right.data[collection][id])
        : right.data[collection][id];
    }
    data[collection] = {};
    for (const id of Object.keys(records)) {
      const record = records[id];
      if ((Number(tomb[id]) || 0) >= record.ts) continue;
      data[collection][id] = record;
    }
  }
  return {
    ver: Math.max(left.ver, right.ver),
    updatedAt: Math.max(left.updatedAt, right.updatedAt),
    updatedBy: left.updatedAt >= right.updatedAt ? left.updatedBy : right.updatedBy,
    data,
  };
}

function countRecords(data) {
  let count = 0;
  for (const collection of COLLECTIONS) count += Object.keys(data[collection] || {}).length;
  return count;
}

function changedRecords(previousData, nextData) {
  const changes = [];
  for (const collection of COLLECTIONS) {
    const previous = previousData[collection] || {};
    const next = nextData[collection] || {};
    for (const id of new Set([...Object.keys(previous), ...Object.keys(next)])) {
      const before = previous[id] || null;
      const after = next[id] || null;
      if (sameRecord(before, after)) continue;
      const fieldNames = [];
      if (before && after) {
        for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
          if (key === 'f') continue;
          if (JSON.stringify(sortKeys(before[key])) !== JSON.stringify(sortKeys(after[key]))) {
            fieldNames.push(key);
          }
        }
      }
      changes.push({
        collection,
        id,
        action: !before ? 'create' : !after ? 'delete' : 'update',
        fields: fieldNames,
      });
    }
  }
  const previousTombs = previousData.tomb || {};
  const nextTombs = nextData.tomb || {};
  for (const id of new Set([...Object.keys(previousTombs), ...Object.keys(nextTombs)])) {
    if ((Number(previousTombs[id]) || 0) === (Number(nextTombs[id]) || 0)) continue;
    if (changes.some((change) => change.id === id && change.action === 'delete')) continue;
    changes.push({ collection: '', id, action: 'delete', fields: [] });
  }
  return changes;
}

module.exports = {
  COLLECTIONS,
  FIELDS,
  countRecords,
  changedRecords,
  mergeRec,
  mergeState,
  normRec,
  normalize,
  sameRecord,
  sortKeys,
};
