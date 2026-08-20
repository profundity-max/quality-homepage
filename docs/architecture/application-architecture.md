# 品集｜Q Nexus 应用架构

> 状态：实施基线
> 关联：[ADR 0001](../adr/0001-self-host-on-the-department-mac-studio.md)、[ADR 0002](../adr/0002-store-markdown-in-postgresql-and-files-outside-the-database.md)、[ADR 0004](../adr/0004-build-a-modular-nextjs-postgresql-application.md)

## 1. 运行形态

系统是部署在部门 Mac Studio 上的模块化单体：

```text
公司局域网浏览器
        |
        v
反向代理（唯一暴露的 HTTP/HTTPS 入口）
        |
        v
Next.js 应用
   |          \
   v           v
PostgreSQL   受控文件目录
               |
               v
          模板隔离区 / 图片 / 导出包
```

Docker Compose 管理 `proxy`、`web` 和 `postgres`。模板功能进入实施时再增加 `scanner`；扫描不可用时模板保持隔离且不能发布。所有容器镜像、npm 依赖、字体、图标和客户端资源在计划维护窗口准备完成，外网断开后运行不依赖第三方服务。

只允许反向代理绑定 Mac Studio 的局域网地址；PostgreSQL 与应用内部端口不发布到宿主机网络。受控文件目录不挂载为公开静态目录，文件只能通过经过身份与权限检查的应用接口读取。

## 2. 技术基线

| 领域       | 选择                                            | 约束                                              |
| -------- | --------------------------------------------- | ----------------------------------------------- |
| 运行时      | Node.js 24 LTS                                | 只使用受支持的 LTS，不跟随 Current 奇数版本                    |
| Web      | Next.js 16 App Router、React 19、TypeScript 5.9 | 使用 Node.js server/Docker 部署，不使用静态导出             |
| 样式       | CSS Modules + `src/styles/tokens.css`         | 以 Editorial Space 令牌为唯一视觉基线，不引入通用后台主题           |
| 数据       | PostgreSQL 17                                 | 固定 major，跟随当前安全 minor；启用 `pg_trgm` 支持别名与中英文模糊匹配 |
| 数据访问     | Drizzle ORM + 提交到 Git 的 SQL migration         | 生产变更只运行 review 过的 migration，不使用 `push`          |
| 身份       | 本地账号、Argon2id、数据库中的不透明会话                      | 无自行注册、第三方登录或明文密码                                |
| Markdown | Milkdown/ProseMirror 编辑；统一 Markdown 渲染模块      | 编辑与阅读共享语法和样式；危险 HTML 清理，Mermaid 安全模式            |
| 图标       | 本地打包的 Lucide 图标                               | 统一细线风格，不使用 Emoji 充当导航图标                         |
| 单元/模块测试  | Vitest、Testing Library                        | 测试通过模块接口，不跨过接口断言内部状态                            |
| 浏览器测试    | Playwright                                    | 覆盖登录、搜索、阅读、编辑发布和移动端关键路径                         |
| 部署       | Docker Compose + Nginx 反向代理                   | 首版 HTTP，配置层保留内部 HTTPS；运行时不依赖公网                  |

Docker Desktop 是否满足公司许可与 IT 政策须在 Mac Studio 部署前确认；架构只依赖 Docker Compose 兼容运行时，不依赖 Docker Desktop 专属能力。

## 3. 代码结构

```text
src/
├── app/                         # 路由、页面、Route Handler 和 Server Action
├── modules/                     # 业务深模块；每个模块只公开 index.ts
│   ├── identity/
│   ├── taxonomy/
│   ├── knowledge/
│   ├── onboarding/
│   ├── templates/
│   ├── books/
│   ├── search/
│   ├── engagement/
│   ├── governance/
│   ├── audit/
│   └── operations/
├── ui/                          # AppShell、SearchLauncher、阅读器和编辑器 UI 模块
├── db/                          # schema 聚合、连接和 migration runner
├── files/                       # FileVault interface 与 adapters
├── lib/                         # 无业务含义的少量通用函数
└── styles/                      # 全局令牌、reset 与 Markdown 样式
drizzle/                         # 已生成并经 review 的 SQL migration
tests/
├── module/                      # 通过业务模块接口测试
├── integration/                 # PostgreSQL、文件与容器集成验证
└── e2e/                         # Playwright 用户路径
ops/                             # Compose、Nginx、备份、恢复和健康检查
```

页面不能直接写 Drizzle 查询。一个模块的内部文件不能被其他模块深路径导入；跨模块调用只能从该模块的 `index.ts` 进入。

## 4. 模块地图

| 模块           | 小接口提供的能力                   | 隐藏的实现复杂度                          |
| ------------ | -------------------------- | --------------------------------- |
| `identity`   | 登录、会话、改密、账号与角色管理           | Argon2id、失败锁定、强制退出、最后管理员保护、Cookie |
| `taxonomy`   | 读取和维护栏目、主题、标签与知识别名         | 稳定标识、排序、空主题可见性、归档迁移规则             |
| `knowledge`  | 创建草稿、保存、发布、复核、恢复、归档与读取知识文章 | Markdown 版本、并发占用、负责人、历史与发布快照      |
| `onboarding` | 获取和维护六阶段学习路线               | 有序步骤、文章与有效模板引用、无进度记录约束            |
| `templates`  | 隔离上传、发布有效模板、下载与版本追溯        | 文件扫描、校验值、历史版本、QMS 提示、下载统计         |
| `books`      | 发布和读取推荐书目                  | 本地封面、分类、主题关联和灰度占位                 |
| `search`     | 快速搜索、完整筛选和搜索记录             | PostgreSQL 检索、别名、分组、排序和知识缺口       |
| `engagement` | 收藏、内容反馈、阅读与触达记录            | 30 分钟去重、90 天身份明细、匿名聚合和权限投影        |
| `governance` | 复核队列、待重新分配、回收站和导入导出        | 跨内容状态、引用保护、Markdown 包和预检冲突        |
| `audit`      | 追加审计事件和管理员查询               | 不可通过后台修改、操作者与原因、保留策略              |
| `operations` | 健康、备份状态、告警和恢复演练结果          | 调度、加密、保留轮转和 Compose 运行状态          |

模块按完整行为而不是数据库表拆分。例：发布知识文章时，`knowledge` 在一个事务内生成版本、更新当前发布指针并调用 `audit`；页面不分别调用三个浅模块拼装发布流程。

## 5. 关键接口原则

### 5.1 身份模块

```ts
type AuthenticateResult =
  | { kind: "authenticated"; session: Session; mustChangePassword: boolean }
  | { kind: "invalid-credentials"; attemptsRemaining: number }
  | { kind: "locked"; unlockAt: Date }
  | { kind: "disabled" };

interface IdentityModule {
  authenticate(input: AuthenticateInput): Promise<AuthenticateResult>;
  resolveSession(token: string): Promise<ResolvedSession | null>;
  changePassword(input: ChangePasswordInput): Promise<Session>;
  revokeSession(sessionId: SessionId): Promise<void>;
  revokeAllSessions(userId: UserId): Promise<void>;
}
```

`ResolvedSession` 包含会话标识、`SessionUser`、是否必须改密和会话是否持久，不包含原始密码或令牌。默认登录保护为连续 5 次失败后锁定 15 分钟，值通过部署配置集中调整。登录成功清除失败计数。会话令牌只将随机原值放在 `HttpOnly`、`SameSite=Lax` Cookie 中，数据库保存其 SHA-256 摘要；HTTPS 启用后同时设置 `Secure`。

### 5.2 知识发布模块

```ts
interface KnowledgeModule {
  getPublishedArticle(id: ArticleId, viewer: Viewer): Promise<PublishedArticle | null>;
  saveDraft(command: SaveArticleDraft): Promise<SaveDraftResult>;
  publish(command: PublishArticle): Promise<PublishResult>;
  confirmCurrent(command: ConfirmArticleCurrent): Promise<void>;
  archive(command: ArchiveArticle): Promise<void>;
}
```

`saveDraft` 接受客户端所见版本号并返回已保存、冲突或被占用的显式结果，禁止最后写入者静默覆盖。`publish` 内部完成字段校验、脱敏确认、版本生成、当前发布指针切换与审计。

### 5.3 Markdown 渲染模块

```ts
interface MarkdownRenderer {
  render(markdown: string, context: RenderContext): Promise<SafeDocument>;
}
```

该接口同时服务阅读页、即时预览和导出预检，内部统一处理六种 Callout、LaTeX、Mermaid、站内链接、图片引用与危险 HTML 清理。测试从安全 HTML/渲染树结果验证行为，不直接测试内部插件顺序。

### 5.4 文件模块

```ts
interface FileVault {
  storeImage(input: ImageUpload): Promise<StoredImage>;
  quarantineTemplate(input: TemplateUpload): Promise<QuarantinedFile>;
  promoteTemplate(fileId: FileId): Promise<StoredTemplateFile>;
  openAuthorized(fileId: FileId): Promise<DownloadStream>;
}
```

生产 adapter 使用 Mac Studio 受控数据目录，测试 adapter 使用临时目录。文件名不参与磁盘寻址；内部标识、校验值和数据库授权共同决定访问。

## 6. 数据与事务

- 每张业务表使用不可变 UUID 主键和独立可变 slug/显示名称。
- 所有时间存 UTC，界面按 Asia/Shanghai 显示。
- 版本化内容采用不可变版本行和当前版本指针，不覆盖历史正文。
- 多模块写操作由发起业务模块拥有事务；审计事件在同一事务写入，避免业务成功而审计缺失。
- SQL migration 提交到 `drizzle/` 并先在备份副本验证；生产不运行自动 schema push。
- 搜索先使用 PostgreSQL `tsvector`、`pg_trgm` 和显式知识别名；中文验收不通过时再以 ADR 评估搜索引擎。

## 7. 身份与授权

路由层只负责取得会话并将 `Viewer` 传给模块。每个能改变或读取敏感状态的模块在接口内部再次检查能力，不能只靠隐藏按钮。

- 阅读者：读取已发布内容、搜索、收藏、下载和反馈。
- 编辑者：增加内容发布与聚合统计能力。
- 管理员：增加账号、分类、身份明细、审计、备份与恢复能力。

首次管理员由容器内一次性 CLI 创建。CLI 从 TTY 隐藏读取临时密码，不接受会进入 shell history 的明文密码参数。新账号必须在首次登录后改密。

## 8. 测试策略

- 纯规则使用 Vitest 单元测试，例如问候时段、发布字段、锁定和 30 分钟阅读去重。
- 业务模块使用本地可替代 PostgreSQL 环境，从模块 `index.ts` 的接口验证完整行为。
- `pg_trgm`、事务锁、migration、下载响应头和受控目录使用真实 PostgreSQL/文件系统集成测试。
- Next.js 异步页面与 Server Action 的主要行为通过 Playwright 验证，不对框架内部实现做脆弱快照。
- 每个交付切片必须通过 `format:check`、`lint`、`typecheck`、`test`、`test:e2e` 和 `build`。

## 9. 运维与安全

- 更新顺序：备份 → 拉取已批准镜像 → migration → 健康检查 → 切换；失败时保留旧镜像和恢复说明。
- 健康检查分 `live` 与 `ready`；`ready` 必须验证数据库可用和 migration 版本匹配。
- 备份包含 PostgreSQL、自有文件目录和恢复元数据，按 7 份每日、8 份每周保留并加密离机存储。
- 日志禁止记录密码、会话令牌、正文和原始文件；身份化搜索与阅读明细按 90 天策略清理。
- HTTP 首版必须在登录页显示受信任局域网警告；出现需求规定的触发条件时启用内部 HTTPS。

## 10. 技术依据

- [Next.js 自托管指南](https://nextjs.org/docs/app/guides/self-hosting)建议在自托管 Node.js 服务前使用反向代理。
- [Next.js 部署指南](https://nextjs.org/docs/app/getting-started/deploying)确认 Node.js server 与 Docker 支持完整 Next.js 功能。
- [Node.js 发布计划](https://nodejs.org/en/about/previous-releases)将 Node.js 24 标记为 LTS；生产只采用 LTS 线。
- [PostgreSQL 版本策略](https://www.postgresql.org/support/versioning/)显示 PostgreSQL 17 获得支持至 2029 年，并建议持续使用该 major 的当前 minor。
- [OWASP 密码存储指南](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)给出 Argon2id 的最低内存、迭代和并行参数。
- [MDN Cookie 安全指南](https://developer.mozilla.org/en-US/docs/Web/Security/Practical_implementation_guides/Cookies)说明 `HttpOnly`、`Secure` 和 `SameSite` 的使用边界。
- [Docker Desktop for Mac 说明](https://docs.docker.com/desktop/setup/install/mac-install/)包含 macOS 支持与公司使用许可条件；部署前必须由公司确认适用许可。

