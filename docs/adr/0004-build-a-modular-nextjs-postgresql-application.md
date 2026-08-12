# 使用 Next.js 与 PostgreSQL 构建模块化单体应用

品集｜Q Nexus 使用一个 Next.js App Router 应用、一个 PostgreSQL 数据库和一个受控文件目录构成模块化单体，通过 Docker Compose 部署在部门 Mac Studio。反向代理只暴露局域网 HTTP 入口，并保留未来切换内部 HTTPS 的能力。

正式基线采用 Node.js 24 LTS、Next.js 16、React 19、TypeScript 5.9、Drizzle ORM 与版本化 SQL migration。UI 使用 CSS Modules 和全局设计令牌，不引入需要运行时联网的字体、图标、CDN 或身份服务。图标包、编辑器和 Markdown 渲染依赖在构建时打包进应用。

应用按身份、知识发布、新人学习、模板、推荐书目、搜索、互动统计、治理审计和运行维护划分深模块。页面和 Server Action 只调用模块接口；模块内部直接使用 Drizzle，不为单一 PostgreSQL 实现增加通用 repository 层。真正变化的依赖才放置 seam，例如密码哈希、时钟、令牌生成、文件存储和恶意文件扫描分别提供生产与测试 adapter。

选择模块化单体是因为首版容量为 100 个账号、5,000 篇文章和 20 人同时在线，拆分网络服务不会带来相称收益，却会增加离线部署、备份、故障排查和一致性成本。若未来容量或组织职责发生实质变化，应先用测量数据证明当前模块接口已无法满足，再评估服务拆分。

PostgreSQL 继续是 Markdown 正文、版本与业务元数据的唯一真实来源，文件继续位于非公开的受控目录。本决策补充但不替代 ADR 0001 与 ADR 0002。
