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

`bootstrap` 服务不发布端口，仅连接 `application` 内部网络；首位管理员已存在时命令会拒绝再次初始化。生产 Compose 不发布数据库端口。备份前应暂停写入或使用 PostgreSQL 一致性备份工具；恢复演练必须在隔离数据库完成。

如需明确允许局域网访问，维护人员必须设置具体主机地址，例如 `Q_NEXUS_BIND_ADDRESS=192.0.2.10`。不要使用 `0.0.0.0` 作为默认值。仅当反向代理前端已由维护人员配置 HTTPS 时设置 `Q_NEXUS_HTTPS=1`。

独立 E2E 形态使用：

```sh
Q_NEXUS_DB_PASSWORD=test-only docker compose -f compose.yaml -f compose.e2e.yaml up --build --detach --wait
```

它使用 `q_nexus_e2e`、确定性账号和 tmpfs，并只把测试数据库绑定到 `127.0.0.1:55433`。seed 对生产模式和非 `q_nexus_e2e` 数据库都会拒绝执行。

## 公司 IT 仍需确认

以下项目不能由仓库内的兼容容器验证代替，正式上线前必须由公司 IT/主机维护人员确认：

- Mac Studio 的固定局域网 IP、DNS 与访问控制范围；
- HTTPS 证书、终止位置与更新流程；
- Docker/容器运行时的软件许可和公司政策；
- PostgreSQL 备份目标、加密、保留周期、告警以及定期恢复演练。
