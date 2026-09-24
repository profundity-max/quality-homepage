# Docker Compose 部署与验证

## 兼容容器环境中的可验证范围

Slice 1 使用 `compose.yaml` 运行反向代理、Web 应用和 PostgreSQL 17。默认只在宿主回环地址发布反向代理的 `8080` 端口；Web 与数据库只在内部网络开放。应用启动时先执行幂等迁移，并以非 root 用户运行。

```sh
export Q_NEXUS_DB_PASSWORD='replace-with-a-long-random-secret'
docker compose up --build --detach --wait
curl -i http://127.0.0.1:8080/api/health/live
curl -i http://127.0.0.1:8080/api/health/ready
```

若环境只提供独立 Compose，可把 `docker compose` 换为 `docker-compose`。部署后使用同一内部网络中的一次性操作容器创建首位管理员；该命令会分配交互式 TTY，密码只从隐藏输入读取。不要把管理员密码写入参数、环境变量或 Compose 文件。数据库密码应使用仅含 URL 安全字符的长随机值。

```sh
docker compose --profile operations run --rm bootstrap --username admin
```

`bootstrap` 服务不发布端口，仅连接 `application` 内部网络；首位管理员已存在时命令会拒绝再次初始化。生产 Compose 不发布数据库端口。部署前必须在 `.env` 配置 `BACKUP_PASSPHRASE` 和宿主机 `BACKUP_TARGET_DIR`；Compose 会初始化备份目录权限，并让 Web 与运维备份容器共用该目录。备份包同时包含非空 PostgreSQL 转储和受控上传文件，缺失数据库转储时直接失败。恢复演练可使用 `scripts/restore.ts <备份ID> --drill`，也可由管理员在后台点击“恢复演练”；两者都创建隔离临时数据库，核对核心表后自动删除，不覆盖生产库。备份文件名链接下载原始加密包，不暴露服务器文件系统路径。详细步骤见 [运维手册](operations/ops-runbook.md)。

如需明确允许局域网访问，维护人员必须设置具体主机地址，例如 `Q_NEXUS_BIND_ADDRESS=192.0.2.10`。不要使用 `0.0.0.0` 作为默认值。仅当反向代理前端已由维护人员配置 HTTPS 时设置 `Q_NEXUS_HTTPS=1`。

独立 E2E 形态使用：

```sh
Q_NEXUS_DB_PASSWORD=test-only docker compose -f compose.yaml -f compose.e2e.yaml up --build --detach --wait
```

它使用 `q_nexus_e2e`、确定性账号和 tmpfs，并只把测试数据库绑定到 `127.0.0.1:55433`。seed 对生产模式和非 `q_nexus_e2e` 数据库都会拒绝执行。

## V3.0 新人路线升级

在实际部署机器操作，不在开发电脑部署。升级前暂停内容维护并完成数据库与受控文件的一致性备份，先用备份副本验证 `0015_article_based_onboarding.sql`。部署新版本后，原每个阶段转换为一篇文章，原说明、步骤和文章/模板链接都保留，旧表不删除，旧阶段地址兼容跳转。

已有安装的迁移文章交给最早启用的管理员（没有管理员则编辑者），保持已发布，复核日期设为迁移当天。升级后请进入“管理 → 新人路线”，核对数量、顺序与正文，再确认或重分配负责人和复核日期。没有任何启用管理员或编辑者的安装只生成草稿，需补齐发布条件后发布。

移出路线后重启或重复迁移不会恢复被移出的条目。不要通过清空迁移记录来重跑转换。若需要回退到 V2.9，应恢复升级前数据库备份并使用对应旧版本，避免旧页面与新路线内容产生分叉。

## 公司 IT 仍需确认

以下项目不能由仓库内的兼容容器验证代替，正式上线前必须由公司 IT/主机维护人员确认：

- Mac Studio 的固定局域网 IP、DNS 与访问控制范围；
- HTTPS 证书、终止位置与更新流程；
- Docker/容器运行时的软件许可和公司政策；
- PostgreSQL 备份目标、加密、保留周期、告警以及定期恢复演练。
