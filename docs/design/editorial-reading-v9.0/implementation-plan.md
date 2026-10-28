# Q-Nexus 首批基础 Token 与文章阅读基准 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: 使用 superpowers:executing-plans 顺序实施；用户另行选择委派时改用 superpowers:subagent-driven-development。以下复选框用于执行跟踪。本文件是待用户审核的计划，不是代码实施或部署记录。

**Goal:** 在保留权限、内容保护和阅读功能的前提下，将文章阅读页落实为已确认的现代编辑型，并消除窄屏正文被挤压的问题。

**Architecture:** 使用现有 Next.js Server Components、CSS Modules、主题Cookie及Markdown管线。新语义Token先在文章页的PortalShell边界接入，避免未完成模板一并换色；抽出轻量、可复用的知识导航和页内目录，不引入UI框架或新数据库结构。

**Tech Stack:** Next.js16.3.0、React19.2.4、TypeScript、CSS Modules、KaTeX、Mermaid、Vitest、Playwright；Node24。执行前重新核对版本，不升级依赖。

**Spec:** [已确认设计交付与QA](./Q-Nexus-Design-System-Handoff-2026-10-26.md)。其中文章四张主题／尺寸参考及颜色、字体、Markdown章节为首批依据。

## Global Constraints

- 本轮只写计划，仓库当前V8.0且工作区干净；代码执行和生产部署均未开始。
- 首批应用发布版本计划V9.0（技能驱动需求主版本递增），执行时若当前版本已变化，按最新版本重算，不能覆盖其他工作。
- 首页、分类页新布局、搜索改造、新人路线页面、编辑器和后台重设计不在首批。共享正文受影响的既有入口必须回归。
- 新Token采用渐进接入，不在本批直接替换全站根主题；用户确认本计划同时确认此批次边界。
- 保留所有读取权限、发布快照、收藏／反馈Server Actions、阅读统计、归档说明、版本历史权限、新人路线来源导航、受控图片、水印及复制／打印限制。
- 不增加复制按钮，不放宽HTML清洗或Mermaid strict安全级别，不采用生成稿中的示例代码／伪数据。
- CSS尺寸以rem为主；普通正文18px桌面／16px手机、1.85行高；正文上限46rem；普通文字≥4.5:1、适用控件／状态≥3:1。
- 写代码前阅读本地Next.js指南：node_modules/next/dist/docs/01-app/01-getting-started/11-css.md、05-server-and-client-components.md、03-layouts-and-pages.md。
- 版本、摘要、Excel、提交、LAN部署验收、GitHub与标签按当前AGENTS.md及docs/versioning.md执行；Git网络操作命令级HTTP/1.1。

## Review Focus

1. 320/375px下仍指定grid-column:2的上下篇导航可能生成隐式列；正文、表格与公式应有足够宽度，页面无非必要横滚（Task3）。
2. 从新人路线进入或访问归档文章时，重排不能丢失路线导航、归档说明或展示受限正文（Task3/5）。
3. 从散热知识进入文章时，导航必须返回正确根入口；不能统一硬编码为/quality（Task2）。
4. 数学排版依赖KaTeX输出属性；清洗不能破坏上下标、求和及MathML，也不能为恢复样式放行不可信HTML（Task4）。
5. 新主题边界内浮层／图解与主题切换可能失去继承；内容更新或切换主题后不能保留旧图解或旧主题（Task1/4）。

## 实施选择与交付边界

建议当前会话顺序执行。任务依赖紧密，先完成基础后再组装文章页，避免同时修改共享样式。

PortalShell新增可选 `designSystem?: "editorial"`，默认保持原有页面行为。仅文章正常及归档页面传入；/manage继续直接走现有AdminShell。设计边界包含Header、主内容及浮层容器；不得把client portal默认挂载到边界外而丢失Token。

首批Header沿用现有导航／搜索路径，只接入已确认字体、品牌色、非缩小吸顶及必要紧凑布局。完整快速搜索入口统一、首页搜索表单、手机菜单模态重构在后续批次；验收报告不得声称全站Header规范已全部实现。

颜色采用已确认短名映射到现有变量：如accent→--color-accent、on-accent→--color-accent-foreground，新增hover/active/control-border/focus等角色。不保留新旧两套同义变量供页面随意选择。

## 文件职责图

|文件|操作与职责|
|---|---|
|src/styles/editorial-tokens.css|新建；以data-design-system="editorial"限定新颜色／字体／间距／布局基础值，浅深及system映射|
|src/app/layout.tsx|仅导入新Token样式，保留KaTeX、原主题及CSS顺序|
|src/app/portal-shell.tsx、portal-shell.module.css|可选设计边界；文章试点外观，保持默认消费者不变|
|src/app/sticky-header.tsx|仅在需要时增加可选紧凑行为开关，旧调用默认行为不变|
|src/ui/knowledge-navigation-model.ts|新建；从真实发布树查主题所属根和目的地址的纯函数|
|src/ui/knowledge-navigation.tsx、knowledge-navigation.module.css|新建；共享真实树导航，桌面aside／紧凑details，选中态、键盘语义|
|src/ui/article-toc.tsx、article-toc.module.css|新建；同一目录数据生成桌面aside／紧凑details，避免链接重复ID|
|src/app/articles/[stableId]/page.tsx、article.module.css|重组页面；元信息在标题下、真实知识导航、目录／相关文章、窄屏单栏|
|src/ui/article-body.module.css|共用Markdown排版；新风格限定在设计边界，旧消费者不重设计|
|src/modules/shared/markdown-renderer.ts|仅在数学／对齐回归证明必要时做最小修复；公共函数签名不变|
|src/app/mermaid-renderer.tsx|必要的安全主题／内容更新适配，不改业务模块|
|tests/module/knowledge-navigation-model.test.ts|新建；根入口与主题定位|
|tests/module/markdown-renderer.test.ts|按实际渲染问题补数学／表格／安全回归|
|tests/e2e/editorial-reading.spec.ts|新建；尺寸、主题、目录、真实布局与功能边界|
|tests/e2e/article.spec.ts及相关现有E2E|更新只因已确认结构变化失效的定位；保留功能断言|
|scripts/seed-e2e.ts|补隔离测试所需长标题、超宽表／公式、六类Callout及散热主题；不改生产内容|
|VERSION、docs/versioning.md、Q-Nexus项目变更说明.xlsx|实施发布时更新，不在计划阶段动|

测试文件及样式命名若与执行时仓库冲突，应先调整计划并记录，不能覆盖现有文件。

### Task 1: Token与文章试点设计边界

**Interfaces:** Consumes现有getSelectedTheme()和data-theme；Produces PortalShell({currentPath,children,designSystem?})，designSystem仅"editorial"或省略，默认不改变现有页面。

- [ ] 在隔离演示库建立基线，记录1440/375px文章和首页／后台的浅深截图；不使用生产数据，不清空已有库。演示目录必须为新建的.data/e2e/<批次>子目录，seed guard生效。
- [ ] 在editorial-reading.spec.ts增加“article theme boundary follows light/dark/system without restyling home”回归：文章主文字／背景／按钮前景按Token切换；首页没有新边界；主题变化后无闪烁错误内容。执行定向测试确认在新行为上失败。
- [ ] 新建editorial-tokens.css：填入交付文档全部已确认颜色及字体；将既有Callout浅深色组作为兼容映射保留并量测，不擅自把六类全换青绿。状态背景尚无确定值时不新增无需求变体。
- [ ] 为PortalShell加可选边界包装，设置min-height:100vh、画布／文字／字体、焦点3px/3px；只在试点文章接入。紧凑Header关闭缩小动画，但保留旧页面默认行为。不添加新的搜索交互。
- [ ] 边界内按钮使用on-accent；修复试点反馈按钮硬编码白字的问题。验证暗色对比度，不同时修改所有后台按钮。
- [ ] 运行新增定向E2E、npm run typecheck、npm run lint；新回归PASS、默认入口不变后提交任务1。

验收：文章页浅深颜色正确，system在无显式Cookie时响应系统；首页／后台布局与旧色彩未被误改。现有callout兼容组不足对比度时先提出具体修订值供确认，不默认宣称通过。

### Task 2: 真实知识导航与主题入口

**Interfaces:** 新建 `resolveKnowledgeContext(tree: SectionNode[], topicStableId: string): { root: SectionNode; destinationPath: "/quality" | "/thermal"; topicStableId: string } | null`。输入保持现有发布树；未知／无权限主题返回null，禁止拼猜地址。

**UI:** `KnowledgeNavigation({root, destinationPath, selectedTopicStableId})`，root为SectionNode，destinationPath为上述路径联合类型，其余为string。组件只呈现可见树，不查询数据库或写数据。

- [ ] 新建单元测试覆盖深层品质主题→/quality、散热主题→/thermal、未知主题→null、并列顺序不变；先执行 `npx vitest run tests/module/knowledge-navigation-model.test.ts` 确认缺失实现失败。
- [ ] 实现纯递归定位，不使用显示名决定入口；映射根stableId为quality-knowledge／thermal-knowledge。叶主题地址保持?topic=稳定标识。
- [ ] 实现共享树导航：桌面aside aria-label="知识导航"，紧凑details summary="分类导航"；空枝不制造链接。选中项aria-current="page"，显示名原样，保持维护顺序。
- [ ] 在ArticlePage并行读取listTopicTree并应用上下文；面包屑回到正确根。找不到上下文时不展示错误树，已有文章正文及安全条件保持可用。
- [ ] 增加E2E“thermal article breadcrumb remains in thermal knowledge”和“keyboard opens compact classification”；散热样本放隔离seed，不发布正式内容。
- [ ] 单元／E2E通过后提交任务2；不要顺手替换现有分类页TreeSection，本批只准备可复用组件。

### Task 3: 阅读布局、元信息与目录

**Interfaces:** `ArticleToc({entries}: {entries:TocEntry[]})`复用extractTableOfContents输出；ArticlePage异步params/searchParams及Server Actions签名不变。

- [ ] 在editorial-reading.spec.ts添加“adjacent links do not create an implicit mobile grid column”：320/375/768/1024/1440px测量文档scrollWidth≤clientWidth+1；375px正文宽度≥视口减40px再减2px容差。相邻导航必须存在且可用，不能删掉导航使测试通过。
- [ ] 添加“metadata wraps and compact TOC stays reachable”与长标题测试：H1完整，元信息不与正文并排，分类／目录summary可操作，目标标题滚入视口后不被Header遮挡。先运行相关测试看到新断言失败。
- [ ] 重组正常文章：面包屑→标题／摘要→负责人／更新／最近复核／下次复核／标签／版本历史／阅读次数及收藏反馈→正文；相关文章移到右栏或正文后。保留owner缺失及日期空值现有回退。
- [ ] 标题、摘要、正文继续由ArticleProtection覆盖；元信息与交互控件不能被复制限制或水印层挡住。ReadingTracker和data-reading-article继续绑定同一文章，避免重复挂载计时。
- [ ] 桌面≥1200px采用216px minmax(0,1fr) 176px三栏、32px间距，容器最大1328px；768–1199px收起右侧目录为展开入口；<768px分类与目录均紧凑、正文单栏。主正文上限46rem，元信息自然换行。
- [ ] 所有断点显式安排上下篇导航列；手机grid-column:1/-1，不生成隐式第2列；归档区跨可用列，不保留空侧栏。sticky偏移按实际Header高度或统一offset token，不能继续盲用88px。
- [ ] ArticleToc复用同一entries，只有正文标题有锚点ID。空目录不显示空工具；桌面／紧凑重复导航隐藏的一份不进入焦点；选择手机目录链接后收起并使目标可见。
- [ ] 更新article.spec.ts中元信息容器定位，保留阅读次数、收藏、反馈、编辑者版本历史、上下篇、归档及新人路线断言，不删功能测试迁就新DOM。
- [ ] 运行 `npm run test:e2e -- tests/e2e/editorial-reading.spec.ts tests/e2e/article.spec.ts tests/e2e/onboarding.spec.ts`；通过并检查浅深截图后提交任务3。

### Task 4: 共用正文、数学和图解

**Interfaces:** 保留renderMarkdown(markdown:string):Promise<string>、extractTableOfContents(markdown:string):Promise<TocEntry[]>、ArticleBody({html:string})。MermaidRenderer({html:string})仍兼容旧调用；新增可选主题参数时不能要求所有业务页面改签名。

- [ ] 在隔离seed增加长表、长公式、图片、代码和六类Callout样本；不以生成图中的示例代码为fixture。为保留动态输入验证提供内容变化的测试宿主，不能修改真实文章来演示。
- [ ] 增加“wide content scrolls locally, not the document”E2E：外层不横滚，超宽容器可横滚且内容未截断；中文文本列可换行；明确Markdown列对齐保持；图片不超正文。
- [ ] CSS仅在editorial边界覆盖新字体、标题间距、表格文本换行／对齐、代码及语义边框；Callout仍700、4px色条、14px16px内距、类型名仅读屏。旧内联主题页和编辑预览保持旧布局但回归正常渲染。
- [ ] 数学先用现有输出复现公式上下标／求和布局；单元验证MathML、上下标、表格alignment和危险HTML剔除。若证实sanitize破坏KaTeX生成属性，仅修复受信任渲染产物的最小白名单／管线，不接受任意style或HTML，不降低trust／协议限制。修改必须配恶意输入回归；若无需改动renderer则保持不动。
- [ ] 公式编号与图题：本批不引入新的Markdown语法或批量改历史内容；保留作者明确内容，图题用相邻段落。自动编号机制留后续单独设计，不能把视觉稿编号硬编码进每篇文章。
- [ ] Mermaid按试点主题渲染，严格保持securityLevel:strict、htmlLabels:false；用受控主题值生成图，不能从不可信HTML提取任意执行配置。切换主题或html变更后重渲染，避免保留initialHtml旧内容；坏语法保留可读源码并给提示。验证不影响水印覆盖。
- [ ] 跑 `npx vitest run tests/module/markdown-renderer.test.ts` 和新正文E2E；同时回归content-protection、knowledge-entry、editor-advanced；通过后提交任务4。

### Task 5: 阅读质量与回归验收

**Files:** tests/e2e/editorial-reading.spec.ts及现有article/content-protection/onboarding/knowledge-entry/editor-advanced/versions；新增 docs/design/editorial-reading-v9.0/ 验收记录与截图（仅实施阶段创建）。

- [ ] 新增或复用“route source and archive states survive layout changes”：?from=onboarding保留路线顺序和来源；归档不显示正文；reader不出现版本历史，editor可见。
- [ ] 量测两主题的文字、链接、按钮／边界、6类Callout关键组合；图解标签、MathML及复杂公式人工复核。非纯色、图片与实际水印不能只依赖Token比值。
- [ ] 320/375/768/1024/1440px两主题检查；200%真实浏览器缩放／文字放大、system主题、减少动态效果、长标题与空字段。CSS body.zoom只作辅助，不作为完整可访问性证据。
- [ ] 键盘完成分类→文章→目录→收藏／反馈路径；检查焦点遮挡、details关闭／目标聚焦，读屏验证表头、标题、数学和状态提示。运行axe并结合人工结果，不自动宣称全面合规。
- [ ] 先运行定向检查；最终一次 `npm run verify` 覆盖format/lint/typecheck/local/PostgreSQL/build/compose/E2E。缺少Docker或其他基础设施时记录阻塞并解决，不能把未跑算通过，也不为本批删除检查。
- [ ] 同视口同内容对比4张文章参考；说明生成稿差异及依据。检查首页、登录、分类内联、编辑预览、后台三个代表页未被试点Token污染。
- [ ] 验收表记录提交SHA、角色、数据、浏览器、主题、尺寸、预期／实际、截图与结果；Critical关闭，Major按用户明确决定处理。通过后提交Task5证据。

### Task 6: V9.0记录、部署与发布

**Interfaces:** 沿用scripts/deploy-to-server.sh；不改变运维架构。本任务仅在首批实现与验收通过且用户授权上线后执行。

- [ ] 更新VERSION与docs/versioning.md：计划V9.0，摘要仅写首批已实现部分；不得声称首页／搜索／全站改造完成。把已确认设计规范、必要参考资产和本计划纳入仓库可回溯位置。
- [ ] 按spreadsheets技能在Q-Nexus项目变更说明.xlsx追加版本总览及必要提交对照。关联提交可填实现提交SHA或明确范围，避免把最终记录提交的自引用SHA硬写进自身造成循环。
- [ ] 确认无意外Next开发生成文件改动，提交当前分支；核对新提交含完整代码、文档、版本及Excel，工作区干净。
- [ ] 执行部署dry-run核对目标quality-server及/Users/quality/q-nexus，实际部署不跳过备份；部署前保留可恢复的原版本提交及加密备份证据。
- [ ] 经LAN部署后用真实角色验收文章、归档、新人来源、主题、统计、水印及图片；健康检查通过不代替页面验收。
- [ ] 失败先修复或部署已知良好版本，确认恢复与数据兼容；不得reset --hard清掉用户修改，不先推GitHub。
- [ ] 验收后再本机 `git -c http.version=HTTP/1.1 push origin HEAD`，核对无冲突才创建并推送v9.0标签（执行时按最新版本调整）；已有标签不得覆盖。
- [ ] 若验收证据补写需形成新提交，核对该提交已同步部署机并通过必要复验，再发布最终SHA；GitHub分支、标签、服务器代码与版本记录一致。

## 完成与排除项

首批完成意味着：文章页新视觉、手机单栏、可达导航、元信息与现有功能保留，浅深主题及专业正文通过实际验收，版本可追溯。并不意味着所有模板重设计或整站无障碍全面完成。

明确延期：完整Header搜索体验、首页布局、分类页主题介绍／全文索引、完整结果页状态、新人路线样式、自动公式编号／图题新机制、全站状态组件重构。后续继续按模板确认执行。

## 本轮自审

- [x] 任务从已确认设计中选取首批范围；未覆盖项目明确列出。
- [x] 列出实际文件、接口、行为断言、命令和预期结果；没有在计划阶段写产品代码。
- [x] 五项Review Focus均有任务和验证归属。
- [x] 模块公共接口及既有Server Actions保持一致；不引入数据库迁移。
- [x] 新Token限域、全局消费者回归、内容保护与部署顺序已明确。
- [x] 视觉稿差异、生成式图表／代码不作为真实实现，以及验收证据边界已明确。

## 用户确认

请审核首批范围、渐进接入策略、暂缓项目和发布边界。建议当前会话顺序实施（executing-plans）；若用户希望独立子代理实施与评审，可另选该方式。本轮确认前不开始代码，代码完成后的具体部署结果仍应先供用户审核，除非用户同时明确授权后续上线。
