# Article content protection Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans task-by-task with TDD and a final independent review.

**Goal:** 实现用户确认的文章身份水印、阅读者操作限制、图片权限和导出审计。
**Architecture:** 阅读专用客户端容器包装共享 ArticleBody 的阅读入口，服务端从会话生成身份标签；图片访问规则置于 image-service；导出路由调用现有 append-only 审计。
**Tech Stack:** Next.js 16.3, React 19, TypeScript, Drizzle/PostgreSQL/PGlite, CSS modules, Vitest, Playwright。
**Spec:** docs/specs/article-content-protection.md

## Global Constraints
- 无新依赖；后台 ArticleBody 预览保留原行为。模板下载不改动。
- 上海时区；水印无 token；图片授权失败不返回文件，private/no-store；不承诺绝对防复制。
- 当前分支实施，遵循用户授权的部署及 GitHub 顺序，V4.0。

## Review Focus
- 草稿/归档图片不能因猜中 URL 被阅读者读取，书封面不能误伤。
- 姓名含 XML/HTML 特殊字符，水印不能注入；日期跨 UTC 日界。
- 通过页面外选区复制正文也应拦截，反馈输入不受影响。
- 主题页打印不能泄漏其他文章；编辑者复制、打印与后台预览保持可用。
- 图片旧的公共缓存不可撤回，文档应说明范围。

### Task 1: 阅读保护
**Files:** src/ui/article-protection.tsx, src/ui/article-protection.module.css, src/modules/content-protection/index.ts, 两个阅读入口，tests/module/content-protection.test.ts, tests/e2e/content-protection.spec.ts。
**Interfaces:** createArticleProtection(member, now) -> {watermark, restrict}; ArticleProtection({watermark,restrict,children})。
- [x] RED：固定姓名转义、时区跨日与角色策略；浏览器测试读者 copy/cut/drag/contextmenu、跨容器选区、打印和编辑角色豁免。
- [x] GREEN：可见重复 SVG 水印；只读限制绑定保护内容与选区；打印规则覆盖整张阅读页面；两个阅读入口包装。
- [x] Verify：npx vitest run tests/module/content-protection.test.ts；npx playwright test tests/e2e/content-protection.spec.ts。

### Task 2: 图片访问
**Files:** src/modules/image-service/index.ts, src/app/uploads/[id]/route.ts, tests/module/image-service.test.ts, tests/integration/protected-uploads.test.ts。
**Interfaces:** image-service.canReadImage(userId,imageId) -> boolean。
- [x] RED：匿名401、读者草稿/归档404、发布快照图片和书封面200、非法扩展404、编辑者正常；缓存私有。
- [x] GREEN：按已发布快照或已发布书目引用授权；路由先会话和类型再读文件。
- [x] Verify：npx vitest run tests/module/image-service.test.ts tests/integration/protected-uploads.test.ts。

### Task 3: 导出审计
**Files:** 两个 migration/export 路由, tests/integration/export-audit.test.ts。
- [x] RED：导出成功记录 actor/target，拒绝及生成失败不记成功；reader不可导出。
- [x] GREEN：复用 content-audit；审计失败则不返回文件。
- [x] Verify：npx vitest run tests/integration/export-audit.test.ts。

### Task 4: 验收与发布
- [x] 全量 local tests、lint/typecheck/build、相关浏览器测试；独立 review 并修复必要发现。
- [x] VERSION=4.0、版本摘要、Excel及保护限制说明。
- [x] 本地提交；部署前加密备份；SSH推送与部署；健康/页面/图片/水印验收。
- [ ] 本机 GitHub 推送及 v4.0；工作区干净。


## 执行记录

- Task 1: 水印模块缺失 RED，7 个水印/日期用例 GREEN；读者跨容器拖拽回归 RED→GREEN；3 条浏览器保护检查通过。
- Task 2–3: 后端委派独立实现；20 条边界检查 GREEN。最终审查 P2「Callout 标题隐藏引用仍授权」由主 Agent 增加失败用例并修复为共享阅读树提取；更新后加水印共 24 条定向检查 GREEN。
- Ruling: 保持现有阅读模块的最后 publish 快照口径，图片鉴权复用其现状；不顺带改变历史恢复/文章发布语义，以免扩大本次改动。
- Final: fixed callout-hidden-image authorization — 回归 RED→GREEN，复用最终 Markdown 变换。
- Final: minor (deferred): 超大内容量下的原图鉴权容量测量。当前 UUID SQL 预筛后只解析匹配内容，没有已证实的性能阻断；代价是未来内容量显著增大时需测量并考虑引用索引。
- Ruling: 为避免跨日期导致既有统计测试失效，只修正该测试的 Date.now 锚点；生产统计不改动。
- Final review set-aside items handled: 私有缓存策略和无 CDN 的 Nginx 部署配置复查；手机明暗截图人工检查；全量测试与发布记录由主 Agent 完成。大规模压测属于以上 deferred 项。

- Task 4: 本地 337/337、浏览器最终 5/5、类型/构建通过；部署机三容器健康；HTTP 匿名图片/导出 401；真实 PostgreSQL 图片授权只读验收通过。
