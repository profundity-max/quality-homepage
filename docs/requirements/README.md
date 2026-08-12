# 品集｜Q Nexus 需求文档

本目录是品集｜Q Nexus 经需求访谈确认后的执行基线。

## 核心文档

1. [产品需求规格](./product-requirements.md) — 产品范围、角色、功能、数据、安全、部署和里程碑
2. [视觉设计规范](./visual-design-specification.md) — 灰度视觉系统、布局、排版、交互和高保真验收页
3. [上线验收标准](./acceptance-criteria.md) — 内容、功能、安全、恢复、浏览器和试运行检查项
4. [Editorial Space 正式 UI 方向](../design/editorial-space-ui-direction.md) — 已选视觉方向、正式令牌、信息架构和定义性界面

## 配套资料

- [领域词汇表](../../CONTEXT.md) — 产品内统一使用的业务术语
- [栏目初始结构](../../栏目体系.md) — 品质知识与散热知识的初始分类树
- [ADR 0001：在部门 Mac Studio 上自托管](../adr/0001-self-host-on-the-department-mac-studio.md)
- [ADR 0002：Markdown 正文存入 PostgreSQL，文件资源独立保存](../adr/0002-store-markdown-in-postgresql-and-files-outside-the-database.md)
- [ADR 0003：采用 Editorial Space 作为正式视觉方向](../adr/0003-adopt-editorial-space-as-the-visual-direction.md)
- [ADR 0004：使用 Next.js 与 PostgreSQL 构建模块化单体应用](../adr/0004-build-a-modular-nextjs-postgresql-application.md)
- [应用架构](../architecture/application-architecture.md)
- [产品交付路线](../plans/product-delivery-roadmap.md)

## 使用方式

- 原型和开发以产品需求编号为依据。
- 视觉实现先通过三张高保真页面确认，再扩展全站。
- 正式上线必须完成验收清单，而不只是完成页面开发。
- 若后续改变难以逆转的部署、数据或职责边界，应新增或更新 ADR，并同步需求与验收文档。
