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
const APPROVAL_MODE_TWO_STEP = 'two_step';
const APPROVAL_MODE_REVIEW_ONLY = 'review_only';
const APPROVAL_MODE_DIRECT_APPROVE = 'direct_approve';
const APPROVAL_MODES = new Set([
  APPROVAL_MODE_TWO_STEP,
  APPROVAL_MODE_REVIEW_ONLY,
  APPROVAL_MODE_DIRECT_APPROVE,
]);
const APPROVAL_TRACKING_FIELDS = new Set([
  'f', 'ts', 'approvalStatus', 'reviewedBy', 'reviewedAt', 'reviewComment',
  'approvedBy', 'approvedAt', 'approvalComment', 'rejectedBy', 'rejectedAt',
  'rejectionReason', 'approvalMode', 'reviewerId', 'reviewerName', 'reviewerUsername',
  'approverId', 'approverName', 'approverUsername', 'submitterMemberId', 'routeResolvedAt',
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

function normalized(value) {
  return String(value == null ? '' : value).trim().toLowerCase();
}

function enabledMemberOfRole(fullData, memberId, role) {
  if (!memberId) return null;
  const member = fullData && fullData.members && fullData.members[memberId];
  if (!member || !isEnabledMember(member) || String(member.role || '') !== role) return null;
  return member;
}

function routeFailure(message, code = 'APPROVAL_ROUTE_INVALID') {
  return { ok: false, code, message };
}

function resolveApprovalRoute(fullData, submitterMember) {
  if (!submitterMember || !isEnabledMember(submitterMember)) {
    return routeFailure('提交人未匹配成员名单，请联系管理员', 'SUBMITTER_NOT_MATCHED');
  }
  const mode = String(submitterMember.approvalMode || '').trim();
  if (!APPROVAL_MODES.has(mode)) {
    return routeFailure('未配置审核人，请联系管理员', 'APPROVAL_ROUTE_MISSING');
  }

  if (mode === APPROVAL_MODE_DIRECT_APPROVE) {
    const approver = enabledMemberOfRole(fullData, submitterMember.approverId, '核准员');
    if (!approver) {
      return routeFailure('未配置核准人，请联系管理员', 'APPROVER_NOT_CONFIGURED');
    }
    return {
      ok: true,
      mode,
      reviewer: null,
      approver,
      initialStatus: APPROVAL_WAITING,
    };
  }

  const reviewer = enabledMemberOfRole(fullData, submitterMember.reviewerId, '审核员');
  if (!reviewer) {
    return routeFailure('未配置审核人，请联系管理员', 'REVIEWER_NOT_CONFIGURED');
  }
  if (mode === APPROVAL_MODE_REVIEW_ONLY) {
    return {
      ok: true,
      mode,
      reviewer,
      approver: null,
      initialStatus: APPROVAL_PENDING,
    };
  }

  const approver = enabledMemberOfRole(fullData, submitterMember.approverId, '核准员');
  if (!approver) {
    return routeFailure('未配置核准人，请联系管理员', 'APPROVER_NOT_CONFIGURED');
  }
  return {
    ok: true,
    mode,
    reviewer,
    approver,
    initialStatus: APPROVAL_PENDING,
  };
}

function approvalModeOf(record) {
  return String(record && record.approvalMode || '').trim();
}

function hasRouteSnapshot(record) {
  return Boolean(
    record
    && (
      APPROVAL_MODES.has(approvalModeOf(record))
      || String(record.reviewerId || '').trim()
      || String(record.approverId || '').trim()
    )
  );
}

function actorIsMember(who, memberId, username, name) {
  if (!who) return false;
  if (memberId) return Boolean(who.memberId && String(who.memberId) === String(memberId));
  if (username && who.username && normalized(who.username) === normalized(username)) return true;
  if (!username && name && who.name) {
    return normalized(who.name) === normalized(name);
  }
  return false;
}

function isAssignedReviewer(who, purchase) {
  return Boolean(
    purchase
    && actorIsMember(
      who,
      purchase.reviewerId,
      purchase.reviewerUsername,
      purchase.reviewerName,
    )
  );
}

function isAssignedApprover(who, purchase) {
  return Boolean(
    purchase
    && actorIsMember(
      who,
      purchase.approverId,
      purchase.approverUsername,
      purchase.approverName,
    )
  );
}

function approvalRouteSnapshot(route, submitterMember, resolvedAt) {
  if (!route || !route.ok || !submitterMember) return null;
  return {
    submitterMemberId: String(submitterMember.id || ''),
    approvalMode: route.mode,
    reviewerId: route.reviewer ? String(route.reviewer.id || '') : '',
    reviewerName: route.reviewer ? String(route.reviewer.name || '') : '',
    reviewerUsername: route.reviewer ? String(route.reviewer.username || '') : '',
    approverId: route.approver ? String(route.approver.id || '') : '',
    approverName: route.approver ? String(route.approver.name || '') : '',
    approverUsername: route.approver ? String(route.approver.username || '') : '',
    routeResolvedAt: String(resolvedAt || ''),
  };
}

function snapshotMatchesRoute(record, route, submitterMember) {
  const expected = approvalRouteSnapshot(route, submitterMember, record && record.routeResolvedAt);
  if (!expected) return false;
  return Object.keys(expected).every((key) => {
    if (key === 'routeResolvedAt') return Boolean(String(record[key] || '').trim());
    return normalized(record[key]) === normalized(expected[key]);
  });
}

function purchaseRouteViolations(purchase, fullData) {
  let submitter = null;
  if (purchase && purchase.submitterMemberId) {
    submitter = (fullData.members || {})[purchase.submitterMemberId] || null;
  }
  if (!submitter && purchase && purchase.by) {
    submitter = findMember(fullData, '', purchase.by);
  }
  const route = resolveApprovalRoute(fullData, submitter);
  if (!route.ok) return [route.message];
  if (!snapshotMatchesRoute(purchase, route, submitter)) {
    return ['审批路由与成员名单不一致，请重新提交或联系管理员'];
  }
  if (purchaseApprovalStatus(purchase) !== route.initialStatus) {
    return [`${route.mode === APPROVAL_MODE_DIRECT_APPROVE ? '直接核准' : '当前审批模式'}应从「${route.initialStatus}」开始`];
  }
  return [];
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

function validatePurchaseTransition(before, after, who, fullData) {
  const violations = [];
  const previous = purchaseApprovalStatus(before);
  const next = purchaseApprovalStatus(after);
  if (previous === next) return violations;
  if (who.admin && next === APPROVAL_PENDING && !hasRouteSnapshot(before)) return violations;

  if (hasRouteSnapshot(before)) {
    const mode = approvalModeOf(before);
    if (
      previous === APPROVAL_PENDING
      && [APPROVAL_WAITING, APPROVAL_APPROVED, APPROVAL_REJECTED].includes(next)
    ) {
      if (!isAssignedReviewer(who, before)) {
        violations.push('当前单据未分配给该审核人');
        return violations;
      }
      if (next === APPROVAL_WAITING && mode !== APPROVAL_MODE_TWO_STEP) {
        violations.push('当前审批模式没有二级核准节点');
        return violations;
      }
      if (next === APPROVAL_APPROVED && mode !== APPROVAL_MODE_REVIEW_ONLY) {
        violations.push('审核通过后必须由指定核准人完成最终核准');
        return violations;
      }
      if (next === APPROVAL_REJECTED && !String(after.rejectionReason || '').trim()) {
        violations.push('驳回必须填写原因');
      }
      if (String(after.reviewedBy || '') !== String(who.name || '')) {
        violations.push('审核人必须与当前登录身份一致');
      }
      if (next === APPROVAL_REJECTED && String(after.rejectedBy || '') !== String(who.name || '')) {
        violations.push('驳回操作人必须与当前登录身份一致');
      }
      return violations;
    }
    if (
      previous === APPROVAL_WAITING
      && [APPROVAL_APPROVED, APPROVAL_REJECTED].includes(next)
    ) {
      if (mode !== APPROVAL_MODE_TWO_STEP && mode !== APPROVAL_MODE_DIRECT_APPROVE) {
        violations.push('当前审批模式没有核准节点');
        return violations;
      }
      if (!isAssignedApprover(who, before)) {
        violations.push('当前单据未分配给该核准人');
        return violations;
      }
      if (next === APPROVAL_REJECTED && !String(after.rejectionReason || '').trim()) {
        violations.push('驳回必须填写原因');
      }
      if (next === APPROVAL_REJECTED && String(after.rejectedBy || '') !== String(who.name || '')) {
        violations.push('驳回操作人必须与当前登录身份一致');
      }
      if (next === APPROVAL_APPROVED && String(after.approvedBy || '') !== String(who.name || '')) {
        violations.push('核准人必须与当前登录身份一致');
      }
      return violations;
    }
    if (previous === APPROVAL_APPROVED) {
      if (!who.systemAdmin) {
        violations.push('只有系统管理员可以修改已核准采购单');
        return violations;
      }
      const submitter = findMember(fullData, before.submitterMemberId, before.by);
      const route = resolveApprovalRoute(fullData, submitter);
      if (!route.ok) {
        violations.push(route.message);
        return violations;
      }
      if (next !== route.initialStatus) {
        violations.push(`修改后应按当前名单进入「${route.initialStatus}」重新审批`);
        return violations;
      }
      if (!snapshotMatchesRoute(after, route, submitter)) {
        violations.push('修改后的审批路由与成员名单不一致');
      }
      return violations;
    }
    if (previous === APPROVAL_REJECTED) {
      const submitter = findMember(fullData, before.submitterMemberId, before.by);
      const isSubmitter = actorIsMember(
        who,
        before.submitterMemberId || (submitter && submitter.id),
        submitter && submitter.username,
        before.by,
      );
      if (!isSubmitter && !who.systemAdmin) {
        violations.push('只有申请人或系统管理员可以重新提交被驳回的采购单');
        return violations;
      }
      const route = resolveApprovalRoute(fullData, submitter);
      if (!route.ok) {
        violations.push(route.message);
        return violations;
      }
      if (next !== route.initialStatus) {
        violations.push(`重新提交后状态应为「${route.initialStatus}」`);
      }
      if (!snapshotMatchesRoute(after, route, submitter)) {
        violations.push('重新提交后的审批路由与成员名单不一致');
      }
      return violations;
    }
    violations.push(`采购审批状态不能从「${previous}」直接改为「${next}」`);
    return violations;
  }

  if (
    previous === APPROVAL_PENDING
    && [APPROVAL_WAITING, APPROVAL_REJECTED].includes(next)
  ) {
    if (!canReview(who)) violations.push('只有审核员可以执行一级审核');
    if (next === APPROVAL_REJECTED && !String(after.rejectionReason || '').trim()) {
      violations.push('驳回必须填写原因');
    }
    return violations;
  }
  if (
    previous === APPROVAL_WAITING
    && [APPROVAL_APPROVED, APPROVAL_REJECTED].includes(next)
  ) {
    if (!canApprove(who)) violations.push('只有核准员可以执行最终核准');
    if (next === APPROVAL_REJECTED && !String(after.rejectionReason || '').trim()) {
      violations.push('驳回必须填写原因');
    }
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
          const status = purchaseApprovalStatus(after);
          if (status === APPROVAL_PENDING || status === APPROVAL_WAITING) {
            const routeViolations = purchaseRouteViolations(after, fullData);
            for (const routeViolation of routeViolations) {
              violations.push(`purchases/${id}：${routeViolation}`);
            }
            if (!after.submitterMemberId || after.submitterMemberId !== who.memberId) {
              if (!admin) {
                violations.push(`purchases/${id}：提交人身份与成员名单不一致`);
              }
            }
          } else if (!admin) {
            violations.push(`purchases/${id}：新采购单必须从审批路由要求的初始状态开始`);
          }
        } else {
          const changedBusinessFields = Object.keys(after).filter((key) => (
            !APPROVAL_TRACKING_FIELDS.has(key)
            && JSON.stringify(after[key]) !== JSON.stringify(before[key])
          ));
          if (!admin && before.by && String(before.by) !== String(who.name) && changedBusinessFields.length) {
            violations.push(`purchases/${id}：只有申请人或系统管理员可以修改采购业务内容`);
            continue;
          }
          for (const transitionViolation of validatePurchaseTransition(before, after, who, fullData)) {
            violations.push(`purchases/${id}：${transitionViolation}`);
          }
          if (String(after.by || '') !== String(before.by || '')) {
            violations.push(`purchases/${id}：不能修改采购申请人`);
            continue;
          }
          const changedNonApproval = changedBusinessFields.length > 0;
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

    const mode = String(after.approvalMode || '').trim();
    if (mode && !APPROVAL_MODES.has(mode)) {
      violations.push('审批模式无效');
    } else if (mode === APPROVAL_MODE_TWO_STEP) {
      if (!enabledMemberOfRole(fullData, after.reviewerId, '审核员')) {
        violations.push('两级审核必须指定有效的审核员');
      }
      if (!enabledMemberOfRole(fullData, after.approverId, '核准员')) {
        violations.push('两级审核必须指定有效的核准员');
      }
    } else if (mode === APPROVAL_MODE_REVIEW_ONLY) {
      if (!enabledMemberOfRole(fullData, after.reviewerId, '审核员')) {
        violations.push('仅审核模式必须指定有效的审核员');
      }
      if (String(after.approverId || '').trim()) {
        violations.push('仅审核模式不能配置核准人');
      }
    } else if (mode === APPROVAL_MODE_DIRECT_APPROVE) {
      if (!enabledMemberOfRole(fullData, after.approverId, '核准员')) {
        violations.push('直接核准必须指定有效的核准员');
      }
      if (String(after.reviewerId || '').trim()) {
        violations.push('直接核准模式不能配置审核人');
      }
    }
  }

  if (collection === 'purchases') {
    if (!positiveNumber(after.qty)) violations.push('采购数量必须大于 0');
    if (!after.mid || !fullData.materials[after.mid]) violations.push('采购单必须关联有效物料');
    if (!APPROVAL_STATUSES.has(purchaseApprovalStatus(after))) {
      violations.push('采购审批状态无效');
    }
    const source = String(after.requestSource || '').trim();
    if (source && !['OA请购', '行政请购', '其他'].includes(source)) {
      violations.push('请购来源无效');
    }
    if (!before && [APPROVAL_PENDING, APPROVAL_WAITING].includes(purchaseApprovalStatus(after))) {
      for (const routeViolation of purchaseRouteViolations(after, fullData)) {
        violations.push(routeViolation);
      }
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
  APPROVAL_MODE_DIRECT_APPROVE,
  APPROVAL_MODE_REVIEW_ONLY,
  APPROVAL_MODE_TWO_STEP,
  APPROVAL_MODES,
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
  approvalRouteSnapshot,
  hasRouteSnapshot,
  isAssignedApprover,
  isAssignedReviewer,
  purchaseApprovalStatus,
  purchaseRouteViolations,
  resolveApprovalRoute,
  validateBusinessRecord,
  validateMutation,
  validatePermissions,
};
