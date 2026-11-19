'use strict';

const { timingSafeEqual } = require('node:crypto');

const QNEXUS_ROLE_MAP = Object.freeze({
  administrator: '核准员',
  editor: '审核员',
  reader: '区域领用人',
});
const VALID_BUSINESS_ROLES = new Set([
  '审核员',
  '核准员',
  '区域领用人',
  '隶属区域领用人',
]);
const DEFAULT_SYSTEM_ADMIN_NAMES = ['武欣雨'];

function normKey(value) {
  return String(value == null ? '' : value)
    .replace(/[\u200B-\u200F\u202A-\u202E\u2060\uFEFF]/g, '')
    .normalize('NFKC')
    .trim();
}

function decodeBase64Url(value) {
  if (!value) return '';
  try {
    return Buffer.from(String(value), 'base64url').toString('utf8');
  } catch {
    return '';
  }
}

function decodeLegacyHeader(value) {
  if (!value) return '';
  try {
    return decodeURIComponent(String(value));
  } catch {
    return String(value);
  }
}

function safeEqual(left, right) {
  const a = Buffer.from(normKey(left));
  const b = Buffer.from(normKey(right));
  return a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
}

function normalizeAdminNames(names) {
  const list = Array.isArray(names)
    ? names
    : String(names || '')
      .split(',')
      .map((value) => value.trim());
  const cleaned = list.map((value) => value.trim()).filter(Boolean);
  return cleaned.length ? cleaned : DEFAULT_SYSTEM_ADMIN_NAMES;
}

function findMember(data, username, name) {
  const members = Object.values((data && data.members) || {});
  const normalizedUsername = String(username || '').trim().toLowerCase();
  const normalizedName = String(name || '').trim();
  return (
    members.find(
      (record) =>
        record.enabled !== false
        && normalizedUsername
        && String(record.username || '').trim().toLowerCase() === normalizedUsername,
    )
    || members.find(
      (record) =>
        record.enabled !== false
        && normalizedName
        && String(record.name || '').trim() === normalizedName,
    )
    || null
  );
}

function memberIdentityFields(data, member) {
  if (!member) {
    return {
      memberMatched: false,
      dept: '',
      supervisorName: '',
      supervisorUsername: '',
    };
  }
  const supervisor = member.supervisorId
    ? ((data && data.members) || {})[member.supervisorId]
    : null;
  return {
    memberMatched: true,
    dept: String(member.dept || ''),
    supervisorName: supervisor ? String(supervisor.name || '') : '',
    supervisorUsername: supervisor ? String(supervisor.username || '') : '',
  };
}

function isSystemAdminIdentity({ username, name, adminNames }) {
  const candidates = new Set(
    [username, name].map((value) => String(value || '').trim()).filter(Boolean),
  );
  return adminNames.some((candidate) => candidates.has(candidate));
}

function resolveQnexusIdentity(request, data, adminNames = DEFAULT_SYSTEM_ADMIN_NAMES) {
  const subject = String(request.headers['x-q-nexus-subject'] || '').trim();
  const username = decodeBase64Url(request.headers['x-q-nexus-username-b64']).trim();
  const displayName = decodeBase64Url(
    request.headers['x-q-nexus-display-name-b64'],
  ).trim();
  const portalRole = String(request.headers['x-q-nexus-role'] || '').trim();
  const mappedRole = QNEXUS_ROLE_MAP[portalRole];
  if (!subject || !username || !mappedRole) return null;
  const portalName = displayName || username;
  const member = findMember(data, username, portalName);
  const name = member ? String(member.name || portalName) : portalName;
  const memberRole = member && VALID_BUSINESS_ROLES.has(member.role)
    ? String(member.role)
    : '';
  const systemAdmin = isSystemAdminIdentity({
    username,
    name,
    adminNames: normalizeAdminNames(adminNames),
  });
  return {
    authMode: 'qnexus',
    subject,
    username,
    name,
    role: memberRole || mappedRole,
    region: member ? String(member.region || '') : '',
    memberId: member ? member.id : '',
    supervisorId: member ? String(member.supervisorId || '') : '',
    ...memberIdentityFields(data, member),
    systemAdmin,
    admin: systemAdmin || portalRole === 'administrator',
  };
}

function resolveStandaloneIdentity(
  request,
  body,
  data,
  adminKey,
  adminNames = DEFAULT_SYSTEM_ADMIN_NAMES,
) {
  const bodyData = body && typeof body === 'object' ? body : {};
  const name = String(
    bodyData.name || decodeLegacyHeader(request.headers['x-user-name']) || '',
  ).trim();
  const username = String(
    bodyData.username || decodeLegacyHeader(request.headers['x-user-username']) || name,
  ).trim();
  const requestedRole = String(
    bodyData.role || decodeLegacyHeader(request.headers['x-user-role']) || '',
  ).trim();
  const requestedRegion = String(
    bodyData.region || decodeLegacyHeader(request.headers['x-user-region']) || '',
  ).trim();
  const member = findMember(data, username, name);
  const resolvedName = member ? String(member.name || name) : name;
  const memberRole = member && VALID_BUSINESS_ROLES.has(member.role)
    ? String(member.role)
    : '';
  const role = memberRole || (VALID_BUSINESS_ROLES.has(requestedRole) ? requestedRole : '区域领用人');
  const headerAdmin = request.headers['x-admin-key'];
  const bodyAdmin = bodyData.adminKey;
  const admin =
    safeEqual(headerAdmin, adminKey) || safeEqual(bodyAdmin, adminKey);
  const systemAdmin = admin && isSystemAdminIdentity({
    username,
    name: resolvedName,
    adminNames: normalizeAdminNames(adminNames),
  });
  return {
    authMode: 'standalone',
    subject: '',
    username,
    name,
    role,
    region: member ? String(member.region || '') : requestedRegion,
    memberId: member ? member.id : '',
    supervisorId: member ? String(member.supervisorId || '') : '',
    ...memberIdentityFields(data, member),
    systemAdmin,
    admin,
  };
}

function publicIdentity(who) {
  if (!who) return null;
  return {
    name: who.name,
    username: who.username || '',
    role: who.role,
    region: who.region || '',
    memberId: who.memberId || '',
    supervisorId: who.supervisorId || '',
    dept: who.dept || '',
    supervisorName: who.supervisorName || '',
    supervisorUsername: who.supervisorUsername || '',
    memberMatched: Boolean(who.memberMatched),
    admin: Boolean(who.admin),
    systemAdmin: Boolean(who.systemAdmin),
    authMode: who.authMode,
  };
}

function createIdentityResolver({
  ssoEnabled,
  adminKey,
  adminNames = DEFAULT_SYSTEM_ADMIN_NAMES,
  dataProvider = () => null,
}) {
  return function resolveIdentity(request, body = null) {
    const data = dataProvider();
    if (ssoEnabled) return resolveQnexusIdentity(request, data, adminNames);
    return resolveStandaloneIdentity(request, body, data, adminKey, adminNames);
  };
}

module.exports = {
  DEFAULT_SYSTEM_ADMIN_NAMES,
  QNEXUS_ROLE_MAP,
  VALID_BUSINESS_ROLES,
  createIdentityResolver,
  findMember,
  isSystemAdminIdentity,
  memberIdentityFields,
  normKey,
  normalizeAdminNames,
  publicIdentity,
  resolveQnexusIdentity,
  resolveStandaloneIdentity,
  safeEqual,
};
