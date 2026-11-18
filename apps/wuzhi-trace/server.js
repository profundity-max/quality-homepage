#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createServer } = require('./src/http/create-server');
const { normKey } = require('./src/application/identity');

function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));
  } catch {
    return { port: 8082, title: '物资申领与消耗追溯', keepBackups: 200 };
  }
}

function resolveRuntime(environment = process.env) {
  const config = loadConfig();
  const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
  const adminKey = normKey(environment.WZ_ADMIN_KEY || config.adminKey || 'wuzhi-admin-2026');
  const adminKeySource = environment.WZ_ADMIN_KEY
    ? 'env'
    : config.adminKey
      ? 'config'
      : 'default';
  return {
    adminKey,
    adminKeySource,
    appVersion: packageJson.version,
    config,
    dataDir: environment.SHARE_DATA_DIR || path.join(__dirname, 'data'),
    keepBackups: Number(environment.WZ_KEEP_BACKUPS || config.keepBackups || 200),
    port: Number(environment.PORT || environment.WZ_PORT || config.port || 8082),
    ssoEnabled: environment.QNEXUS_SSO === '1',
    systemAdminNames: environment.WZ_SYSTEM_ADMIN_NAMES || '武欣雨',
    title: config.title || '物资申领与消耗追溯',
    token: environment.WZ_SHARE_TOKEN || config.token || '',
  };
}

function createApplication(environment = process.env) {
  const runtime = resolveRuntime(environment);
  const application = createServer({
    publicDir: path.join(__dirname, 'public'),
    dataDir: runtime.dataDir,
    title: runtime.title,
    token: runtime.token,
    adminKey: runtime.adminKey,
    adminKeySource: runtime.adminKeySource,
    ssoEnabled: runtime.ssoEnabled,
    systemAdminNames: runtime.systemAdminNames,
    keepBackups: runtime.keepBackups,
  });
  return { ...application, runtime };
}

async function start(environment = process.env) {
  const application = createApplication(environment);
  await new Promise((resolve, reject) => {
    application.server.once('error', reject);
    application.server.listen(application.runtime.port, '0.0.0.0', () => {
      application.server.off('error', reject);
      resolve();
    });
  });
  return application;
}

function localAddresses() {
  const addresses = [];
  for (const [name, entries] of Object.entries(os.networkInterfaces())) {
    for (const entry of entries || []) {
      if (entry.family === 'IPv4' && !entry.internal) addresses.push({ name, address: entry.address });
    }
  }
  return addresses;
}

if (require.main === module) {
  start()
    .then((application) => {
      const { runtime, getState } = application;
      console.log('==================================================');
      console.log(`  ${runtime.title} V${runtime.appVersion}`);
      console.log(`  服务已启动：http://localhost:${runtime.port}/`);
      console.log(`  运行模式：${runtime.ssoEnabled ? '品集身份 SSO' : '独立/局域网'}`);
      console.log(`  数据目录：${runtime.dataDir}`);
      console.log(`  当前版本：v${getState().ver}`);
      if (!runtime.ssoEnabled) {
        for (const address of localAddresses()) {
          console.log(`  局域网地址：http://${address.address}:${runtime.port}/ (${address.name})`);
        }
        if (runtime.adminKeySource === 'default') {
          console.log('  安全提醒：独立模式仍在使用默认管理员口令，请在 config.json 或 WZ_ADMIN_KEY 中修改。');
        }
      }
      console.log('==================================================');

      const shutdown = async (signal) => {
        console.log(`收到 ${signal}，正在停止服务…`);
        try {
          await application.close();
          process.exit(0);
        } catch (error) {
          console.error('停止失败', error);
          process.exit(1);
        }
      };
      process.once('SIGINT', () => shutdown('SIGINT'));
      process.once('SIGTERM', () => shutdown('SIGTERM'));
    })
    .catch((error) => {
      console.error('服务启动失败：', error);
      process.exit(1);
    });
}

module.exports = {
  createApplication,
  loadConfig,
  resolveRuntime,
  start,
};
