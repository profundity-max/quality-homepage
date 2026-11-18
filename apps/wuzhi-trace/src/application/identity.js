'use strict';

const { timingSafeEqual } = require('node:crypto');

const QNEXUS_ROLE_MAP = Object.freeze({
  administrator: '管理员',
  editor: '文员',
  reader: '区域领用人',
});

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

function memberRegion(data, name) {
  const member = Object.values((data && data.members) || {}).find(
    (record) => String(record.name || '').trim() === String(name || '').trim(),
  );
  return member ? String(member.region || '') : '';
}

function resolveQnexusIdentity(request, data) {
  const subject = String(request.headers['x-q-nexus-subject'] || '').trim();
  const username = decodeBase64Url(request.headers['x-q-nexus-username-b64']).trim();
  const displayName = decodeBase64Url(
    request.headers['x-q-nexus-display-name-b64'],
  ).trim();
  const portalRole = String(request.headers['x-q-nexus-role'] || '').trim();
  const role = QNEXUS_ROLE_MAP[portalRole];
  if (!subject || !username || !role) return null;
  const name = displayName || username;
  return {
    authMode: 'qnexus',
    subject,
    username,
    name,
    role,
    region: role === '区域领用人' ? memberRegion(data, name) : '',
    admin: role === '管理员',
  };
}

function resolveStandaloneIdentity(request, body, data, adminKey) {
  const bodyData = body && typeof body === 'object' ? body : {};
  const name = String(
    bodyData.name || decodeLegacyHeader(request.headers['x-user-name']) || '',
  ).trim();
  const role = String(
    bodyData.role || decodeLegacyHeader(request.headers['x-user-role']) || '',
  ).trim();
  const region = String(
    bodyData.region || decodeLegacyHeader(request.headers['x-user-region']) || '',
  ).trim();
  const headerAdmin = request.headers['x-admin-key'];
  const bodyAdmin = bodyData.adminKey;
  const admin =
    safeEqual(headerAdmin, adminKey) || safeEqual(bodyAdmin, adminKey);
  return {
    authMode: 'standalone',
    subject: '',
    username: name,
    name,
    role,
    region,
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
    admin: Boolean(who.admin),
    authMode: who.authMode,
  };
}

function createIdentityResolver({
  ssoEnabled,
  adminKey,
  dataProvider = () => null,
}) {
  return function resolveIdentity(request, body = null) {
    const data = dataProvider();
    if (ssoEnabled) return resolveQnexusIdentity(request, data);
    return resolveStandaloneIdentity(request, body, data, adminKey);
  };
}

module.exports = {
  QNEXUS_ROLE_MAP,
  createIdentityResolver,
  normKey,
  publicIdentity,
  resolveQnexusIdentity,
  resolveStandaloneIdentity,
  safeEqual,
};
