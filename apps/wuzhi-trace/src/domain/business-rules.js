'use strict';

const { COLLECTIONS, sameRecord } = require('./model');

const ADMIN_ONLY_COLLECTIONS = new Set(['materials']);
const OWNER_CONTROLLED_COLLECTIONS = new Set(['purchases', 'dispatches', 'signoffs']);
const VALID_MEMBER_ROLES = new Set([
  '审核员',
  '核准员',
  '区域领用人',
  '隶属区域领用人',
]);
const OFFICE_ROLES = new Set(['审核员', '核准员']);
const AREA_ROLES = new Set(['区域领用人', '隶属区域领用人']);
const APPROVAL_PENDING = '待审核';
const APPROVAL_WAITING = '待核准';
const APPROVAL_APPROVED = '已核准';
const APPROVAL_REJECTED = '已驳回';
const APPROVAL_STATUSES = new Set([
  APPROVAL_PENDING,
  APPROVAL_WAITING,
  APPROVAL_APPROVED,
  APPROVAL_REJECTED,
]);
const QUANTITY_EPSILON = 1e-9;

function positiveNumber(value) {
  return Number.isFinite(Number(value)) && Number(value) > 0;
}

function nonNegativeNumber(value) {
  return Number.isFinite(Number(value)) && Number(value) >= 0;
}

function purchaseApprovalStatus(record) {
  return APPROVAL_STATUSES.has(String(record && record.approvalStatus))
    ? String(record.approvalStatus)
    : APPROVAL_APPROVED;
}

function isEnabledMember(record) {
  return Boolean(record) && record.enabled !== false;
}

function findMember(fullData, id, name) {
  const members = (fullData && fullData.members) || {};
  if (id && members[id]) return members[id];
  if (!name) return null;
  return (
    Object.values(members).find(
      (record) => isEnabledMember(record) && String(record.name || '').trim() === String(name).trim(),
    ) || null
  );
}

function sumOtherRecords(collection, excludedId, predicate) {
  return Object.values(collection || {}).reduce((total, record) => {
    if (!record || record.id === excludedId || !predicate(record)) return total;
    return total + (Number(record.arrQty ?? record.recvQty ?? record.qty) || 0);
  }, 0);
}

function canMaintainMembers(who) {
  return Boolean(who && who.systemAdmin);
}

function canReview(who) {
  return Boolean(who && (who.admin || who.role === '审核员'));
}

function canApprove(who) {
  return Boolean(who && (who.admin || who.role === '核准员'));
}

function canOperateFlow(who) {
  return Boolean(who && (who.admin || OFFICE_ROLES.has(who.role)));
}

function canSignForDispatch(who, dispatch) {
  if (!who || !dispatch || !AREA_ROLES.has(who.role)) return false;
  if (!who.region || String(dispatch.region || '') !== String(who.region)) return false;
  if (who.role === '区域领用人') return true;
  return Boolean(
    (who.memberId && dispatch.claimantId === who.memberId)
      || (who.name && dispatch.claimantName === who.name),
  );
}

function validatePurchaseTransition(before, after, who) {
  const violations = [];
  const previous = purchaseApprovalStatus(before);
  const next = purchaseApprovalStatus(after);
  if (previous === next) return violations;
  if (who.admin && next === APPROVAL_PENDING) return violations;

  if (
    previous === APPROVAL_PENDING
    && [APPROVAL_WAITING, APPROVAL_REJECTED].includes(next)
  ) {
    if (!canReview(who)) violations.push('只有审核员可以执行一级审核');
    return violations;
  }
  if (
    previous === APPROVAL_WAITING
    && [APPROVAL_APPROVED, APPROVAL_REJECTED].includes(next)
  ) {
    if (!canApprove(who)) violations.push('只有核准员可以执行最终核准');
    return violations;
  }
  if (previous === APPROVAL_REJECTED && next === APPROVAL_PENDING) {
    if (!who.admin && before && String(before.by || '') !== String(who.name || '')) {
      violations.push('只有申请人或系统管理员可以重新提交被驳回的采购单');
    }
    return violations;
  }
  violations.push(`采购审批状态不能从「${previous}」直接改为「${next}」`);
  return violations;
}

function validatePermissions({ previousData, nextData, fullData, who }) {
  const violations = [];
  if (!who) return ['缺少有效身份'];
  const admin = Boolean(who.admin);

  for (const collection of COLLECTIONS) {
    const previousRecords = previousData[collection] || {};
    const nextRecords = nextData[collection] || {};
    for (const id of Object.keys(nextRecords)) {
      const before = previousRecords[id] || null;
      const after = nextRecords[id] || null;
      if (!after || sameRecord(before, after)) continue;

      if (collection === 'members' && !canMaintainMembers(who)) {
        violations.push(`${collection}/${id}：成员名单仅系统管理员武欣雨可维护`);
        continue;
      }
      if (ADMIN_ONLY_COLLECTIONS.has(collection) && !admin) {
        violations.push(`${collection}/${id}：物料档案仅管理员可维护`);
        continue;
      }
      if (collection === 'logs' && before) {
        violations.push(`logs/${id}：审计日志只允许追加，不允许修改`);
        continue;
      }
      if (collection === 'purchases') {
        if (!before) {
          if (!admin && String(after.by || '') !== String(who.name || '')) {
            violations.push(`purchases/${id}：新采购单必须由当前登录人创建`);
            continue;
          }
          if (!admin && purchaseApprovalStatus(after) !== APPROVAL_PENDING) {
            violations.push(`purchases/${id}：新采购单必须从「待审核」开始`);
            continue;
          }
        } else {
          for (const transitionViolation of validatePurchaseTransition(before, after, who)) {
            violations.push(`purchases/${id}：${transitionViolation}`);
          }
          if (String(after.by || '') !== String(before.by || '')) {
            violations.push(`purchases/${id}：不能修改采购申请人`);
            continue;
          }
          const changedNonApproval = Object.keys(after).some((key) => (
            !['f', 'ts', 'approvalStatus', 'reviewedBy', 'reviewedAt', 'reviewComment',
              'approvedBy', 'approvedAt', 'approvalComment', 'rejectedBy', 'rejectedAt',
              'rejectionReason'].includes(key)
            && JSON.stringify(after[key]) !== JSON.stringify(before[key])
          ));
          if (
            purchaseApprovalStatus(before) === APPROVAL_APPROVED
            && changedNonApproval
            && !admin
          ) {
            violations.push(`purchases/${id}：已核准采购单不能直接修改，请由系统管理员处理`);
            continue;
          }
        }
      }

      if (['arrivals', 'receipts', 'dispatches'].includes(collection) && !canOperateFlow(who)) {
        violations.push(`${collection}/${id}：只有审核员、核准员或管理员可以执行到货、签收和分发`);
        continue;
      }

      if (!admin && before && OWNER_CONTROLLED_COLLECTIONS.has(collection)) {
        const owner = String(before.by || '');
        if (AREA_ROLES.has(who.role) && owner && who.name && owner !== who.name) {
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
        if (!AREA_ROLES.has(who.role)) {
          violations.push(`signoffs/${id}：只有区域领用人可以执行领用签字`);
          continue;
        }
        if (!who.region) {
          violations.push('当前账号尚未在成员名单中配置所属区域，不能执行领用签字');
          continue;
        }
        if (!canSignForDispatch(who, dispatch)) {
          violations.push(
            who.role === '隶属区域领用人'
              ? `signoffs/${id}：隶属区域领用人只能确认分配给本人的单据`
              : `signoffs/${id}：只能确认所属区域的单据`,
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

  const previousTombs = previousData.tomb || {};
  const nextTombs = nextData.tomb || {};
  for (const id of Object.keys(nextTombs)) {
    if ((Number(nextTombs[id]) || 0) <= (Number(previousTombs[id]) || 0)) continue;
    if (previousData.members && previousData.members[id]) {
      const dependent = Object.values(previousData.members).find(
        (record) => record.supervisorId === id && record.enabled !== false,
      );
      const referenced = Object.values(previousData.dispatches || {}).some(
        (record) => record.claimantId === id,
      );
      if (dependent || referenced) {
        violations.push(`members/${id}：该成员仍被下属或历史分发引用，请改为停用而不是删除`);
      }
    }
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
    const role = String(after.role || '');
    if (!VALID_MEMBER_ROLES.has(role)) violations.push('成员角色无效');
    if (AREA_ROLES.has(role) && !String(after.region || '').trim()) {
      violations.push(`${role}必须配置所属区域`);
    }
    if (role === '隶属区域领用人') {
      const supervisor = after.supervisorId
        ? (fullData.members || {})[after.supervisorId]
        : null;
      if (!supervisor || supervisor.role !== '区域领用人' || supervisor.enabled === false) {
        violations.push('隶属区域领用人必须指定有效的区域领用人作为上级');
      } else if (String(supervisor.region || '') !== String(after.region || '')) {
        violations.push('隶属区域领用人与其上级必须属于同一区域');
      } else if (supervisor.id === after.id) {
        violations.push('成员不能将自己设为上级');
      }
    }
    const username = String(after.username || '').trim().toLowerCase();
    if (username) {
      const duplicate = Object.values(fullData.members || {}).find(
        (record) => record.id !== after.id
          && String(record.username || '').trim().toLowerCase() === username,
      );
      if (duplicate) violations.push('成员品集账号不能重复');
    }
  }

  if (collection === 'purchases') {
    if (!positiveNumber(after.qty)) violations.push('采购数量必须大于 0');
    if (!after.mid || !fullData.materials[after.mid]) violations.push('采购单必须关联有效物料');
    if (!APPROVAL_STATUSES.has(purchaseApprovalStatus(after))) {
      violations.push('采购审批状态无效');
    }
  }

  if (collection === 'arrivals') {
    if (!positiveNumber(after.arrQty)) violations.push('到货数量必须大于 0');
    if (!after.pid) {
      violations.push('到货单必须关联采购单');
    } else {
      const purchase = fullData.purchases[after.pid];
      if (!purchase) {
        violations.push('到货单关联的采购记录不存在');
      } else {
        if (purchaseApprovalStatus(purchase) !== APPROVAL_APPROVED) {
          violations.push('采购单尚未完成核准，不能登记到货');
        }
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
    if (!before || after.claimantId || after.claimantName) {
      const claimant = findMember(fullData, after.claimantId, after.claimantName);
      if (!claimant) {
        violations.push('分发单必须指定有效的领用人');
      } else {
        if (!AREA_ROLES.has(String(claimant.role || ''))) {
          violations.push('分发领用人必须是区域领用人或隶属区域领用人');
        }
        if (String(claimant.region || '') !== String(after.region || '')) {
          violations.push('分发领用人与分发区域不一致');
        }
      }
    }
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
  APPROVAL_APPROVED,
  APPROVAL_PENDING,
  APPROVAL_REJECTED,
  APPROVAL_WAITING,
  AREA_ROLES,
  OFFICE_ROLES,
  OWNER_CONTROLLED_COLLECTIONS,
  VALID_MEMBER_ROLES,
  canApprove,
  canMaintainMembers,
  canOperateFlow,
  canReview,
  canSignForDispatch,
  purchaseApprovalStatus,
  validateBusinessRecord,
  validateMutation,
  validatePermissions,
};
