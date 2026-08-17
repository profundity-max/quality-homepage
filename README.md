# 品集｜Q Nexus — 品质部门户

面向品质部成员的内部知识门户：沉淀部门知识、帮助新人融入、降低重复询问与寻找资料的成本。产品正式名称为**「品集｜Q Nexus」**（见 `CONTEXT.md` 术语表；避免使用"品质部知识中心 / Q Nexus / 品集"等非正式写法）。

- **技术栈**：Next.js 16（App Router）+ React 19 + TypeScript + Drizzle ORM + PostgreSQL（本地开发用 PGlite，无需装数据库）
- **部署目标**：部门 Mac Studio 局域网自托管（Docker Compose + Nginx 反向代理，见 `docs/deployment.md`）
- **需求基线**：`docs/requirements/product-requirements.md`（PRD）、`docs/requirements/acceptance-criteria.md`（验收标准）、`docs/requirements/visual-design-specification.md`（视觉规范）
- **架构决策**：`docs/adr/`（8 个 ADR，见下文）
- **交付路线**：`docs/plans/product-delivery-roadmap.md`（6 个切片，已完成 1–4）

---

## 一、快速开始（本地开发，零外部依赖）

不需要 Docker、PostgreSQL 或任何外部服务即可跑起来：

```bash
# 1. 安装依赖
npm install

# 2. 启动开发服务器（自动 seed 演示数据，PGlite 文件数据库）
npm run e2e:serve
# 等价于：npm run e2e:prepare && next dev
```

打开 **http://127.0.0.1:3000**，用演示账号登录：

| 账号 | 密码 | 角色 | 用途 |
|---|---|---|---|
| `member` | `member secure password` | 阅读者 | 浏览首页/知识/新人路线/模板/书单 |
| `editor` | `editor secure password` | 编辑者 | 编辑发布文章、查看版本历史 |
| `columnadmin` | `column admin secure password` | 管理员（免首改密） | 栏目/主题管理、内容复核 |
| `admin` | `correct horse battery staple` | 管理员（bootstrap） | **首次登录会被强制改密**（产品行为） |

> 演示数据在 `.data/e2e/`（被 `.gitignore` 忽略）。`npm run e2e:serve` 每次会**清空重建** seed 数据。
> 生产/正式环境需要 PostgreSQL：见 `docs/deployment.md` 与 `.env.example`。

### 常用脚本

```bash
npm run dev            # 开发服务器（无 seed，需要已有数据库）
npm run build          # 生产构建
npm run start          # 生产启动
npm run lint           # ESLint
npm run typecheck      # tsc --noEmit
npm run test:local     # 全部单元/集成测试（PGlite，无需 Docker）
npm run test:e2e       # Playwright 端到端测试
npm run verify         # 完整验证链（format/lint/typecheck/test/build/e2e/compose）
npm run db:migrate     # 应用数据库迁移
npm run identity:bootstrap  # 初始化首位管理员
```

---

## 二、主体架构

### 2.1 模块化单体（ADR-0004）

一个 Next.js 应用 + 一个 PostgreSQL + 一个受控文件目录。**深模块**约定：

- 领域逻辑集中在 `src/modules/<domain>/index.ts`，页面 / Server Actions 只调用模块接口
- 模块内部直接用 Drizzle，**不设通用 repository 层**；只有真正变化的依赖才放 seam（如密码哈希、文件存储、恶意文件扫描、时钟）
- 不引入需要运行时联网的字体 / CDN / 图标 / 服务（图标、KaTeX、Mermaid 全部构建时打包）

现有模块（`src/modules/`）：

| 模块 | 职责 |
|---|---|
| `identity` | 账号、会话、登录锁定、强制改密、首次管理员 bootstrap |
| `account-administration` | 管理员维护账号/角色/锁定（含 GOV-04 停用负责人联动） |
| `personalized-home` | 首页问候与导航模型（Asia/Shanghai 时段问候） |
| `knowledge-publishing` | 知识阅读侧：主题树、文章详情、最近更新、相关文章、阅读计数、归档说明、复核到期 |
| `knowledge-editing` | 文章编辑服务：草稿/发布/beginEdit/恢复版本/副本/归档/确认复核/编辑占用锁 |
| `knowledge-administration` | 栏目/主题管理：增改排序归档、管理员门禁、IA-09 归档守卫 |
| `editor-commands` | 编辑器格式化命令（纯函数：加粗/标题/列表/引用/Callout/表格等） |
| `offline-drafts` | 离线草稿控制器（localStorage 时间戳比较，纯函数可测） |
| `file-storage` | 受控文件目录存储（磁盘实现 + 扩展名白名单，模板可 null 白名单） |
| `image-service` | 图片上传（受控目录 + `image_assets` 元数据 + sha256） |
| `template-service` | 模板中心：上传隔离区、扫描 adapter、版本流转、下载、阅读者视图 |
| `book-service` | 推荐书目：分类、书籍视图、封面 |
| `onboarding` | 新人六阶段路线读取 |
| `shared` | `password-hasher`、`markdown-renderer`（安全 Markdown 管线） |

### 2.2 数据层（Drizzle + 手写 SQL 迁移）

- 表定义在 `src/db/schema.ts`（导出 `identitySchema` / `knowledgeSchema` / `onboardingSchema` / `templateSchema` / `bookSchema`）
- 迁移是**手写 SQL**：`drizzle/NNNN_*.sql` + `drizzle/migrations.json` 清单；每个迁移文件末尾自我登记进 `schema_migrations`
- 约定：`CREATE TABLE IF NOT EXISTS`、uuid 主键、snake_case 列名、索引 `*_idx` 命名、seed 数据 `ON CONFLICT (id) DO NOTHING`（幂等）

**迁移历史（0000–0012）**：

| 迁移 | 内容 |
|---|---|
| 0000 | 身份基座：users / sessions / identity_audit_events（append-only 触发器） |
| 0001 | 登录防护（失败次数/锁定列） |
| 0002 | 会话生命周期约束 |
| 0003 | 内容基座：sections / topics / topic_aliases / articles / article_aliases + 栏目体系 seed（37 主题）+ 发布必填 CHECK |
| 0004 | 文章阅读计数列 |
| 0005 | article_versions 版本快照表（kind=publish/restore + 恢复原因条件 CHECK） |
| 0006 | image_assets 图片元数据表 |
| 0007 | 编辑占用列（editing_by / editing_at） |
| 0008 | 新人路线：onboarding_stages / onboarding_steps + 六阶段 seed |
| 0009 | 模板中心：template_categories / templates / template_versions（八分类 seed） |
| 0010 | 推荐书目：book_categories / books（五分类 seed） |
| 0011 | 模板隔离原因列（quarantine_reason） |
| 0012 | 模板下载计数列（download_count） |

### 2.3 路由地图（`src/app/`）

| 路由 | 功能 | 权限 |
|---|---|---|
| `/` | 首页（问候 + 真实知识/模板/书单/新人入口 + 最近更新） | 登录 |
| `/login` `/change-password` | 登录 / 强制改密 | 公开 / 登录 |
| `/quality` `/thermal` | 知识入口页（可收起分类树 + 主题文章列表） | 登录 |
| `/articles/[stableId]` | 文章三栏阅读页（目录/相关/上下篇/阅读计数/归档说明） | 登录 |
| `/articles/[stableId]/versions` | 版本历史页（恢复需填原因） | 编辑者/管理员 |
| `/onboarding` | 新人六阶段路线（总览 + 阶段 + 上下篇导航） | 登录 |
| `/templates` `/templates/[stableId]` | 模板中心 / 模板详情（QMS 提示 + 下载） | 登录 |
| `/books` | 推荐书单 | 登录 |
| `/manage` | 账户管理 + 待复核内容（GOV-02/03） | 管理员 |
| `/manage/columns` | 栏目/主题管理 | 管理员 |
| `/manage/articles/[stableId]/edit` `/manage/articles/new` | Markdown 编辑器（三模式 + 自动保存 + 离线 + 占用） | 编辑者/管理员 |
| `/uploads/[id]` | 受控图片访问 | 登录 |
| `/templates/[stableId]/download` | 模板附件下载（计数） | 登录 |
| `/api/articles/[stableId]/take-over` | 编辑占用接管 | 编辑者/管理员 |
| `/api/health/live` `/api/health/ready` | 健康检查 | 公开 |

### 2.4 关键设计决策（ADR 摘要）

1. **ADR-0001**：自托管于部门 Mac Studio；**ADR-0002**：Markdown 正文存 PostgreSQL，图片/模板文件存受控目录（DB 只存元数据 + 校验值）
2. **ADR-0003**：Editorial Space 视觉方向（灰阶 + `#0096FF` 强调，CSS Modules + 设计令牌）
3. **ADR-0004**：模块化单体（见 2.1）
4. **ADR-0005**：Nginx 本地反向代理
5. **ADR-0006**：内容寻址用不可变稳定标识（`stable_id`，改名不断链）
6. **ADR-0007**：文章版本快照表 + 乐观并发（`expectedUpdatedAt` 冲突检测）
7. **ADR-0008**：模板隔离区 + 扫描后发布 + 版本快照

---

## 三、开发进度

### 3.1 切片总览（roadmap 共 6 个切片）

| 切片 | 内容 | 状态 |
|---|---|---|
| **Slice 1** | 基础、身份与 Editorial Space 门户骨架 | ✅ 完成（issues #1–#10） |
| **Slice 2** | 栏目与知识阅读闭环 | ✅ 完成（issues #11–#18） |
| **Slice 3** | Markdown 编辑与发布闭环 | ✅ 完成（issues #20–#29） |
| **Slice 4** | 新人路线、模板中心与推荐书目（**内容闭环**） | ✅ 完成（issues #30–#37） |
| **Slice 5** | 搜索、收藏、反馈与内容统计 | ⏸ 暂停（已拆规划，未实施） |
| **Slice 6** | 治理、迁移、审计与运行保障 | ⏸ 暂停（未实施；正式上线需先完成） |

> 当前代码状态：43 个提交在 `main`；原型分支 `prototype/q-nexus-ui` 保留。

### 3.2 已完成能力清单

**身份与门户（Slice 1）**
- 账号/角色（reader/editor/administrator）、登录锁定（5 次/15 分钟）、强制首改密、会话（浏览器 7 天持久）、账户管理（创建/改角色/禁用/解锁/重置密码）、"最后一位有效管理员"保护
- Editorial Space 首页：时段问候（Asia/Shanghai）、浅/深色主题、键盘导航、移动抽屉

**知识阅读（Slice 2）**
- 内容模型：栏目树（品质知识 6 栏目 34 主题 + 散热知识 2 栏目）、37 主题 seed、稳定标识、文章别名、发布必填约束
- 主题树递归剪枝（空主题/归档栏目对阅读者隐藏）、相关文章（同主题→共享标签）、最近更新、阅读计数（编辑者不计）
- 安全 Markdown 渲染器：remark/rehype 管线 + rehype-sanitize + KaTeX + 六种 Callout + 目录提取
- 三栏阅读页、知识入口页（可收起分类树）、首页真实入口 + 最近更新、栏目/主题管理（含 IA-09 归档守卫）

**编辑发布（Slice 3）**
- 文章版本：快照表 + kind（publish/restore）+ 恢复原因；已发布文章编辑期间阅读者仍见旧版本
- 编辑器：三模式（预览/源码/分栏）、工具栏 + 命令菜单、大纲/属性面板、Mermaid 安全渲染、站内链接选择器
- 图片上传（受控目录 + 元数据 + sha256）、自动保存（30s）+ 离线草稿（localStorage）+ 冲突人工选择、发布必须在线
- 编辑占用（acquire/release/takeover）、版本历史页、归档说明页、内容复核（GOV-02 提醒/03 确认/04 停用联动）

**内容闭环（Slice 4）**
- 新人六阶段路线（步骤可引用文章/模板）、模板中心（八分类、隔离区 + 可注入扫描 adapter、草稿→发布→历史流转、附件下载 + 计数、QMS 提示）、推荐书单（五分类、封面/占位）、首页真实入口

### 3.3 尚未完成 / 已知边界

- **Slice 5/6 暂停**：搜索、收藏/反馈、内容统计；治理/迁移/审计/备份/告警
- **管理端 UI 缺口**（服务层已支持，页面待做）：模板/书单维护、模板上传、新人阶段调整（ONB-08）
- **已知边界**（各 issue 关闭评论有详细记录）：并发发布 max+1 无事务锁；编辑占用无超时自动释放；扫描为本地 adapter（真实病毒库待部署环境）；下载人数去重统计留待 Slice 5；Docker 相关测试（`test:postgres:container` / `test:compose`）需 CI/有 Docker 环境
- **上线前置**：issue #9（Mac Studio IT 运维准备，`ready-for-human`）+ Slice 6

---

## 四、测试

| 层级 | 位置 | 说明 |
|---|---|---|
| 单元/集成 | `tests/module/*.test.ts`、`tests/integration/*.test.ts` | 177+ 用例，PGlite 内存库 + `migrate()`，无需 Docker |
| 端到端 | `tests/e2e/*.spec.ts`（14 个文件，50 个场景） | Playwright，webServer 自动 seed |
| compose | `tests/compose-e2e/` + `scripts/verify-compose*.mjs` | 需要 Docker（CI 跑） |

**e2e 账号**（由 `scripts/seed-e2e.ts` 生成）：`member` / `editor` / `columnadmin`（见上文表格）。
**e2e 环境变量**（`playwright.config.ts`）：`Q_NEXUS_E2E=1`、`Q_NEXUS_DATABASE_PATH=.data/e2e`、`Q_NEXUS_LOCKOUT_SECONDS=10`、`Q_NEXUS_BROWSER_SESSION_SECONDS=2`（**注意：浏览器会话仅 2 秒，跨页面的长流程测试需勾选"保持登录 7 天"**）。

---

## 五、环境变量（`.env.example`）

| 变量 | 用途 | 默认 |
|---|---|---|
| `DATABASE_URL` | PostgreSQL 连接串（非 E2E 必需） | — |
| `Q_NEXUS_E2E=1` | E2E 模式（PGlite 文件库，禁生产） | 未设 |
| `Q_NEXUS_DATABASE_PATH` | E2E 数据库目录（必须含 `e2e`） | — |
| `Q_NEXUS_DATA_DIR` | 受控文件目录（图片/模板）根路径 | `.data/uploads` |
| `Q_NEXUS_MAX_LOGIN_FAILURES` | 登录失败上限 | 5 |
| `Q_NEXUS_LOCKOUT_MINUTES` | 锁定分钟数 | 15 |
| `Q_NEXUS_BROWSER_SESSION_SECONDS` | 浏览器会话有效期 | 43200 |
| `Q_NEXUS_HTTPS=1` | 反向代理 HTTPS 时设置 | 未设 |
| `Q_NEXUS_E2E_CONTROL_TOKEN` | E2E 控制令牌 | — |

---

## 六、给新开发者的工作流建议

本项目按 **切片 + GitHub Issues** 驱动（见 `docs/agents/issue-tracker.md` 与 `/setup-matt-pocock-skills` 的工程技能约定）：

1. 每个 issue 以 **TDD 红绿循环** 实现（先写失败测试 → 最小实现 → 全量验证）
2. 完成后跑两轴评审（**标准合规** + **规格对齐**），通过后提交（`git commit -m "Implement ... (#issue)"`）并推送、关闭 issue
3. 提交信息建议带 issue 编号；每个 issue 关闭评论写明验收证据 + 剩余风险
4. 新增业务词汇同步 `CONTEXT.md` 术语表；难逆转决策写 `docs/adr/`
5. 提交前必须：`npm run lint && npm run typecheck && npm run test:local && npm run build`

**目录速查**：
- 需求：`docs/requirements/`；路线：`docs/plans/`；决策：`docs/adr/`；架构：`docs/architecture/`
- 术语表（**写作/命名必读**）：`CONTEXT.md`；栏目体系：`栏目体系.md`
- 代理约定：`AGENTS.md`（含 Next.js 16 变更说明）；`docs/agents/`
- 迁移：`drizzle/`；模块：`src/modules/`；页面：`src/app/`

---

## 七、GitHub 工作区

- 仓库：`profundity-max/quality-homepage`
- Issues 按 `ready-for-agent` / `ready-for-human` 等 triage 标签流转（默认五标签：`needs-triage` / `needs-info` / `ready-for-agent` / `ready-for-human` / `wontfix`）
- 切片级 issue 带原生阻塞关系（blocking edges），从无阻塞的 frontier 开始逐个实施
- 网络提示：本机部分网络环境直连 `github.com` 不通（DNS 解析到不可达节点），可用 `140.82.112.3` IP 直连 + Host 头（见会话历史；未修改全局配置）
