'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { changedRecords, normalize } = require('../domain/model');

function timestampForFile(date = new Date()) {
  const pad = (value) => String(value).padStart(2, '0');
  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-`
    + `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
    + `-${String(date.getMilliseconds()).padStart(3, '0')}`
  );
}

function createStoreRepository({ dataDir, keepBackups = 200, now = () => new Date() }) {
  const storeFile = path.join(dataDir, 'store.json');
  const backupDir = path.join(dataDir, 'backup');
  const auditFile = path.join(dataDir, 'audit.jsonl');

  function load() {
    try {
      return normalize(JSON.parse(fs.readFileSync(storeFile, 'utf8')));
    } catch (error) {
      if (error && error.code === 'ENOENT') return normalize(null);
      throw new Error(`无法读取数据文件 ${storeFile}：${error.message}`);
    }
  }

  function writeAtomic(filePath, content) {
    const temporaryPath = `${filePath}.tmp`;
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const descriptor = fs.openSync(temporaryPath, 'w');
    try {
      fs.writeFileSync(descriptor, content, 'utf8');
      fs.fsyncSync(descriptor);
    } finally {
      fs.closeSync(descriptor);
    }
    fs.renameSync(temporaryPath, filePath);
  }

  function rotateBackups() {
    const files = fs
      .readdirSync(backupDir)
      .filter((file) => file.startsWith('store-') && file.endsWith('.json'))
      .sort();
    while (files.length > Math.max(1, Number(keepBackups) || 200)) {
      fs.unlinkSync(path.join(backupDir, files.shift()));
    }
  }

  function appendAudit(previousData, nextState, identity, changes) {
    if (!changes.length) return;
    const time = Date.now();
    const lines = changes.map((change) =>
      JSON.stringify({
        at: time,
        version: nextState.ver,
        actor: identity && identity.name ? identity.name : '—',
        subject: identity && identity.subject ? identity.subject : null,
        authMode: identity && identity.authMode ? identity.authMode : 'unknown',
        action: change.action,
        collection: change.collection,
        recordId: change.id,
        fields: change.fields,
      }),
    );
    fs.appendFileSync(auditFile, `${lines.join('\n')}\n`, 'utf8');
  }

  function save(nextState, identity, previousData) {
    const content = JSON.stringify(nextState);
    writeAtomic(storeFile, content);
    fs.mkdirSync(backupDir, { recursive: true });
    const backupFile = path.join(
      backupDir,
      `store-${timestampForFile(now())}-v${nextState.ver}.json`,
    );
    const warnings = {};
    try {
      writeAtomic(backupFile, content);
      rotateBackups();
    } catch (error) {
      // 主数据已经成功落盘；备份失败在下次写入时会继续尝试，并由调用方暴露告警。
      warnings.backupWarning = `自动快照失败：${error.message}`;
    }
    try {
      const before = previousData || normalize(null).data;
      const changes = changedRecords(before, nextState.data);
      appendAudit(before, nextState, identity, changes);
    } catch (error) {
      warnings.auditWarning = `服务端审计日志写入失败：${error.message}`;
    }
    return warnings;
  }

  return {
    auditFile,
    backupDir,
    dataDir,
    load,
    save,
    storeFile,
  };
}

module.exports = { createStoreRepository, timestampForFile };
