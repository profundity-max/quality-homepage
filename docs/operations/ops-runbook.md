# 品集｜Q Nexus 运维手册（OPS/BKP/AVL）

适用：部门 Mac Studio 上的 Docker Compose 部署。仅两名指定的 macOS 管理账号可执行升级、恢复与故障处理（OPS-09）。

## 0. 前置条件

- Docker 已安装并随登录自启（本机为 Colima，`brew services start colima`）。
- 环境变量：`Q_NEXUS_DB_PASSWORD`、`BACKUP_PASSPHRASE`、`BACKUP_TARGET_DIR`（默认 `.data/backups`）、`Q_NEXUS_DATA_DIR`（默认 `.data`）。
- 备份密钥保管位置至少两名管理员知情（BKP-04）。

## 1. 每日/每周备份（BKP-01/02）

在 macOS 上配置 cron/launchd，按以下命令执行（示例为 cron 行）：

```bash
# 每日 02:30
30 2 * * * cd /path/to/quality-homepage && BACKUP_PASSPHRASE=... BACKUP_TARGET_DIR=... Q_NEXUS_DATA_DIR=... npx tsx scripts/backup.ts daily <管理员用户ID> >> logs/backup.log 2>&1
# 每周日 03:00
0 3 * * 0 cd /path/to/quality-homepage && BACKUP_PASSPHRASE=... BACKUP_TARGET_DIR=... Q_NEXUS_DATA_DIR=... npx tsx scripts/backup.ts weekly <管理员用户ID> >> logs/backup.log 2>&1
```

Compose 部署形态下，备份在栈内执行（`backup` 操作服务，内部网络连接 PostgreSQL、只读挂载数据卷、挂载宿主机备份目录）：

```bash
# 手动备份（替换 <管理员用户ID>）
docker compose --profile operations run --rm backup manual <管理员用户ID>
# 恢复演练 dry-run
docker compose --profile operations run --rm --entrypoint "npx tsx scripts/restore.ts" backup <备份ID> --apply /tmp/restore-check
```

宿主机（非 Compose）形态可用 `PG_DUMP_CMD`（如 `pg_dump "postgres://…"`）或 `COMPOSE_PROJECT`（自动 `docker compose exec db pg_dump`）。保留策略：7 份每日 + 8 份每周，由脚本自动执行（BKP-02）。备份为 AES-256-GCM 加密文件，校验和写入数据库（BKP-04/05）。

备份目标：公司服务器或移动硬盘（BKP-03）。配置为 `BACKUP_TARGET_DIR` 指向挂载的目标目录即可；正式上线前必须完成配置。

## 2. 恢复与季度演练（BKP-06）

```bash
# 校验备份并列出内容（dry-run）
BACKUP_PASSPHRASE=... BACKUP_ADMIN_USER_ID=... npx tsx scripts/restore.ts <备份ID>
# 解包到临时目录
BACKUP_PASSPHRASE=... BACKUP_ADMIN_USER_ID=... npx tsx scripts/restore.ts <备份ID> --apply /tmp/restore-check
```

每季度在临时环境执行完整恢复演练：恢复数据库转储（`pg_restore`/`psql`）与数据目录，验证登录、搜索、阅读和模板下载（BKP-06）。恢复结果记录在管理后台备份页与审计日志中。

## 3. 更新流程（OPS-10）

1. 先备份：`npx tsx scripts/backup.ts manual <管理员用户ID>`
2. 拉取新版本并构建：`git pull && docker compose build`
3. 加载并执行迁移：`docker compose up -d postgres && npm run db:migrate`（生产禁止 `drizzle-kit push`）
4. 健康检查：`docker compose ps` 等待 healthy；`curl http://127.0.0.1:8080/api/health/live` 与 `/api/health/ready`
5. 失败时保留旧版本：停止新容器、启动上一镜像（保留 tag/镜像备份），按第 2 节恢复数据后复检。

应用不在网页后台提供在线更新按钮（OPS-11）。

## 4. 日志轮转（OPS-12）

服务错误日志保留 30 天。示例 macOS 日志轮转（`/etc/newsyslog.d` 或 launchd 定时任务）：

```text
/var/log/q-nexus/error.log                       644  7   *  $D0   G
/var/log/q-nexus/app.log                         644  30  *  $W0   G
```

容器 stdout 由 Docker 保留（`docker compose logs --since`），关键错误另写 `logs/error.log` 并轮转 30 天。

## 5. 计划维护与故障（AVL-01/02/03）

- 计划维护提前至少一天在门户首页公告（本手册附录文案），单机维护窗口接受短暂不可用。
- 故障恢复目标 4 小时内；每日备份意味着最多可能丢失 24 小时数据（AVL-02）。
- 重启后容器随 Docker 自启自动恢复（OPS-07）；若 Colima 未启动，先 `brew services start colima` 再 `docker compose up -d`。

## 6. 安全与数据边界（SEC）

- 仅内网访问，登录页提示已内置（SEC-01/02）。
- 固定 IP 由路由器/DHCP 保留（OPS-08）；出现域名/证书、敏感资料或外部访问需求时升级 HTTPS（SEC-03）。
- 门户不存储客户机密、NDA 资料、未脱敏图纸等（SEC-08），案例文章发布前强制确认脱敏（SEC-07）。
