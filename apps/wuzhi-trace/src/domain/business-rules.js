'use strict';

const { COLLECTIONS, sameRecord } = require('./model');

const ADMIN_ONLY_COLLECTIONS = new Set(['materials', 'members']);
const OWNER_CONTROLLED_COLLECTIONS = new Set(['purchases', 'dispatches', 'signoffs']);
const VALID_MEMBER_ROLES = new Set(['管理员', '文员', '区域领用人']);
const QUANTITY_EPSILON = 1e-9;

function positiveNumber(value) {
  return Number.isFinite(Number(value)) && Number(value) > 0;
}

function nonNegativeNumber(value) {
  return Number.isFinite(Number(value)) && Number(value) >= 0;
}

function sumOtherRecords(collection, excludedId, predicate) {
  return Object.values(collection || {}).reduce((total, record) => {
    if (!record || record.id === excludedId || !predicate(record)) return total;
    return total + (Number(record.arrQty ?? record.recvQty ?? record.qty) || 0);
  }, 0);
}

function validatePermissions({ previousData, nextData, fullData, who }) {
  const violations = [];
  const admin = Boolean(who && who.admin);

  for (const collection of COLLECTIONS) {
    const previousRecords = previousData[collection] || {};
    const nextRecords = nextData[collection] || {};
    for (const id of Object.keys(nextRecords)) {
      const before = previousRecords[id] || null;
      const after = nextRecords[id] || null;
      if (!after || sameRecord(before, after)) continue;

      if (ADMIN_ONLY_COLLECTIONS.has(collection) && !admin) {
        violations.push(`${collection}/${id}：物料档案与成员名单仅管理员可维护`);
        continue;
      }
      if (collection === 'logs' && before) {
        violations.push(`logs/${id}：审计日志只允许追加，不允许修改`);
        continue;
      }
      if (!admin && before && OWNER_CONTROLLED_COLLECTIONS.has(collection)) {
        const owner = String(before.by || '');
        if (owner && who.name && owner !== who.name) {
          violations.push(`${collection}/${id}：「${owner}」录入的单据只能由本人或管理员修改`);
          continue;
        }
        if (after.by && before.by && after.by !== before.by) {
          violations.push(`${collection}/${id}：不能修改单据的创建人`);
          continue;
        }
      }

      if (collection === 'signoffs' && !admin) {
        const dispatch = fullData.dispatches && fullData.dispatches[after.did];
        if (!dispatch) {
          violations.push(`signoffs/${id}：找不到对应的分发单，不能签字确认`);
          continue;
        }
        if (who.role === '区域领用人') {
          if (!who.region) {
            violations.push('当前账号尚未在成员名单中配置所属区域，不能执行领用签字');
            continue;
          }
          if (String(dispatch.region || '') !== String(who.region)) {
            violations.push(
              `signoffs/${id}：只能确认 ${who.region} 的单据，此单属于 ${dispatch.region || '未配置区域'}`,
            );
            continue;
          }
          if (who.authMode === 'qnexus' && after.signer !== who.name) {
            violations.push('签字人必须与当前品集登录身份一致');
            continue;
          }
        }
      }
    }
  }

  const previousTombs = previousData.tomb || {};
  const nextTombs = nextData.tomb || {};
  for (const id of Object.keys(nextTombs)) {
    if ((Number(nextTombs[id]) || 0) <= (Number(previousTombs[id]) || 0)) continue;
    if (admin) continue;
    let owner = '';
    for (const collection of COLLECTIONS) {
      const record = previousData[collection] && previousData[collection][id];
      if (record) {
        owner = String(record.by || '');
        break;
      }
    }
    if (owner && owner !== who.name) {
      violations.push(`${id}：「${owner}」创建的记录只能由本人或管理员删除`);
    }
  }
  return violations;
}

function validateBusinessRecord({ collection, before, after, fullData }) {
  if (!after) return [];
  const violations = [];

  if (collection === 'materials') {
    if (!String(after.name || '').trim()) violations.push('物料名称不能为空');
    if (!nonNegativeNumber(after.safe ?? 0)) violations.push('安全库存必须是非负数');
  }

  if (collection === 'members') {
    if (!String(after.name || '').trim()) violations.push('成员姓名不能为空');
    if (!VALID_MEMBER_ROLES.has(String(after.role || ''))) violations.push('成员角色无效');
    if (after.role === '区域领用人' && !String(after.region || '').trim()) {
      violations.push('区域领用人必须配置所属区域');
    }
  }

  if (collection === 'purchases') {
    if (!positiveNumber(after.qty)) violations.push('采购数量必须大于 0');
    if (!after.mid || !fullData.materials[after.mid]) violations.push('采购单必须关联有效物料');
  }

  if (collection === 'arrivals') {
    if (!positiveNumber(after.arrQty)) violations.push('到货数量必须大于 0');
    if (after.pid) {
      const purchase = fullData.purchases[after.pid];
      if (!purchase) {
        violations.push('到货单关联的采购记录不存在');
      } else {
        if (purchase.mid !== after.mid) violations.push('到货物料与采购物料不一致');
        const arrivedOthers = sumOtherRecords(
          fullData.arrivals,
          after.id,
          (record) => record.pid === after.pid,
        );
        if (arrivedOthers + Number(after.arrQty) > Number(purchase.qty) + QUANTITY_EPSILON) {
          violations.push('累计到货数量不能超过采购数量');
        }
      }
    }
  }

  if (collection === 'receipts') {
    if (!positiveNumber(after.recvQty)) violations.push('实收数量必须大于 0');
    if (after.aid) {
      const arrival = fullData.arrivals[after.aid];
      if (!arrival) {
        violations.push('签收记录关联的到货记录不存在');
      } else {
        if (Number(after.recvQty) > Number(arrival.arrQty) + QUANTITY_EPSILON) {
          violations.push('实收数量不能超过到货数量');
        }
        const duplicate = Object.values(fullData.receipts || {}).find(
          (record) => record.id !== after.id && record.aid === after.aid,
        );
        if (duplicate) violations.push('同一到货批次只能签收一次');
      }
    }
  }

  if (collection === 'dispatches') {
    if (!positiveNumber(after.qty)) violations.push('分发数量必须大于 0');
    if (after.aid) {
      const arrival = fullData.arrivals[after.aid];
      const receipt = Object.values(fullData.receipts || {}).find(
        (record) => record.aid === after.aid,
      );
      if (!arrival) {
        violations.push('分发记录关联的到货记录不存在');
      } else if (arrival.mid !== after.mid) {
        violations.push('分发的物料与到货批次不一致');
      }
      if (!receipt) {
        violations.push('到货批次尚未签收，不能分发');
      } else {
        const dispatchedOthers = sumOtherRecords(
          fullData.dispatches,
          after.id,
          (record) => record.aid === after.aid,
        );
        if (dispatchedOthers + Number(after.qty) > Number(receipt.recvQty) + QUANTITY_EPSILON) {
          violations.push('累计分发数量不能超过该批次的实收数量');
        }
      }
    }
    if (!String(after.region || '').trim()) violations.push('分发区域不能为空');
  }

  if (collection === 'signoffs') {
    const dispatch = fullData.dispatches[after.did];
    if (!dispatch) violations.push('领用签字必须关联有效分发单');
    if (!String(after.signer || '').trim()) violations.push('领用人姓名不能为空');
    if (dispatch) {
      const duplicate = Object.values(fullData.signoffs || {}).find(
        (record) => record.id !== after.id && record.did === after.did,
      );
      if (duplicate) violations.push('同一分发单只能签字确认一次');
    }
  }

  if (collection === 'logs') {
    if (!String(after.action || '').trim()) violations.push('日志动作不能为空');
    if (!String(after.entity || '').trim()) violations.push('日志对象不能为空');
  }

  return violations;
}

function validateMutation({ previousData, nextData, fullData, who }) {
  const violations = validatePermissions({ previousData, nextData, fullData, who });
  if (!who) return ['缺少有效身份'];

  for (const collection of COLLECTIONS) {
    const previousRecords = previousData[collection] || {};
    const nextRecords = nextData[collection] || {};
    for (const id of Object.keys(nextRecords)) {
      const before = previousRecords[id] || null;
      const after = nextRecords[id] || null;
      if (!after || sameRecord(before, after)) continue;
      const recordViolations = validateBusinessRecord({
        collection,
        before,
        after,
        fullData,
      });
      for (const violation of recordViolations) violations.push(`${collection}/${id}：${violation}`);
    }
  }
  return [...new Set(violations)];
}

module.exports = {
  ADMIN_ONLY_COLLECTIONS,
  OWNER_CONTROLLED_COLLECTIONS,
  validateBusinessRecord,
  validateMutation,
  validatePermissions,
};
