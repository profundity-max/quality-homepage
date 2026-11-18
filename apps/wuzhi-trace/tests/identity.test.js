'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { resolveQnexusIdentity } = require('../src/application/identity');

function request(headers) {
  return { headers };
}

test('品集身份映射角色并从成员名单补齐区域', () => {
  const identity = resolveQnexusIdentity(
    request({
      'x-q-nexus-subject': 'subject-1',
      'x-q-nexus-username-b64': Buffer.from('quality.user').toString('base64url'),
      'x-q-nexus-display-name-b64': Buffer.from('领用人甲').toString('base64url'),
      'x-q-nexus-role': 'reader',
    }),
    { members: { m1: { name: '领用人甲', region: 'IPQC2' } } },
  );
  assert.equal(identity.role, '区域领用人');
  assert.equal(identity.region, 'IPQC2');
  assert.equal(identity.admin, false);
  assert.equal(identity.authMode, 'qnexus');
});

test('管理员角色具有管理员权限，未知角色被拒绝', () => {
  const base = {
    'x-q-nexus-subject': 'subject-1',
    'x-q-nexus-username-b64': Buffer.from('admin').toString('base64url'),
    'x-q-nexus-role': 'administrator',
  };
  assert.equal(resolveQnexusIdentity(request(base), {}).admin, true);
  assert.equal(
    resolveQnexusIdentity(request({ ...base, 'x-q-nexus-role': 'owner' }), {}),
    null,
  );
});
