'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { resolveQnexusIdentity } = require('../src/application/identity');

function request(headers) {
  return { headers };
}

function headers(username, displayName, role) {
  return {
    'x-q-nexus-subject': `subject-${username}`,
    'x-q-nexus-username-b64': Buffer.from(username).toString('base64url'),
    'x-q-nexus-display-name-b64': Buffer.from(displayName).toString('base64url'),
    'x-q-nexus-role': role,
  };
}

test('成员名单可覆盖默认业务角色并补充区域和上级', () => {
  const identity = resolveQnexusIdentity(
    request(headers('area.member', '领用人乙', 'reader')),
    {
      members: {
        lead: { id: 'lead', name: '领用人甲', username: 'area.lead', role: '区域领用人', region: 'IPQC2', enabled: true },
        member: {
          id: 'member', name: '领用人乙', username: 'area.member', role: '隶属区域领用人',
          region: 'IPQC2', dept: '品质部', supervisorId: 'lead', enabled: true,
        },
      },
    },
  );
  assert.equal(identity.role, '隶属区域领用人');
  assert.equal(identity.region, 'IPQC2');
  assert.equal(identity.memberId, 'member');
  assert.equal(identity.supervisorId, 'lead');
  assert.equal(identity.supervisorName, '领用人甲');
  assert.equal(identity.dept, '品质部');
  assert.equal(identity.memberMatched, true);
  assert.equal(identity.admin, false);
  assert.equal(identity.systemAdmin, false);
});

test('品集账号未匹配成员名单时保留登录态但标记不可办理业务', () => {
  const identity = resolveQnexusIdentity(
    request(headers('unknown.user', '未登记人员', 'reader')),
    { members: {} },
  );
  assert.equal(identity.username, 'unknown.user');
  assert.equal(identity.memberMatched, false);
  assert.equal(identity.memberId, '');
  assert.equal(identity.dept, '');
  assert.equal(identity.supervisorName, '');
});

test('武欣雨使用品集编辑者账号时获得系统管理员权限', () => {
  const identity = resolveQnexusIdentity(
    request(headers('wuxinyu', '武欣雨', 'editor')),
    {},
  );
  assert.equal(identity.role, '审核员');
  assert.equal(identity.admin, true);
  assert.equal(identity.systemAdmin, true);
});

test('品集管理员默认映射核准员，但非武欣雨不获得成员维护权限', () => {
  const identity = resolveQnexusIdentity(
    request(headers('admin.user', '管理员', 'administrator')),
    {},
  );
  assert.equal(identity.role, '核准员');
  assert.equal(identity.admin, true);
  assert.equal(identity.systemAdmin, false);
});

test('未知品集角色被拒绝', () => {
  assert.equal(
    resolveQnexusIdentity(request(headers('unknown', '未知', 'owner')), {}),
    null,
  );
});
