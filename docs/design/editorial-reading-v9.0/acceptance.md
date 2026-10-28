# V9.0 文章阅读模板：本地验收

日期：2026-10-28。基础提交：`05efd53`；本次实现以包含此记录的 Git 提交定位。应用/测试提交：`e9553fc`–`4d9bc34`；当前分支 main。部署状态：**已部署到 quality-server 并完成直连检查**；生产证据、已登录交互限制与发布顺序见 [发布记录](../../operations/releases/v9.0.md)。

## 实现范围

只有文章详情及归档说明进入 `data-design-system="editorial"` 边界。浅色为象牙白、墨色、深青绿，暗色采用独立映射；既有六类 Callout 色组保留。默认 PortalShell、首页、分类内联、登录、后台及编辑预览不接入新 Token。

正常文章按面包屑、标题/摘要、元信息、正文排列。桌面保留真实发布树和右侧目录/相关文章；1199px及以下收起为分类和目录入口；手机单栏。收藏、反馈、版本权限、阅读计时、水印、复制与打印限制、新人来源及归档说明沿用原业务。

共用 Markdown 渲染先清洗不可信输入，再用 `trust:false` 的 KaTeX 生成完整几何和 MathML；危险 HTML、事件和 JavaScript 链接另有回归。表格、代码及块公式可聚焦并局部横滚。Mermaid 串行初始化/渲染，响应内容和主题更新，保持 strict、禁 HTML 标签，错误时保留源码及状态提示。

## 数据与复现

- 浏览器 Chromium，Playwright 1.62.1。演示账号 member、editor、columnadmin；不使用生产账号和内容。
- 使用专用 `.data/e2e/editorial-v9-20261028` 子目录，保留 seed guard；未清空已有默认开发数据库。宽表、长公式、六类 Callout 均为演示 fixture。
- 散热及长标题 fixture 用 `Q_NEXUS_E2E_READING_FIXTURES=1` 显式开启，避免改变原有空栏目断言。该环境变量仅用于隔离演示 seed 和对应浏览器用例。
- 主题边界验证 light/dark/system；新版 Token 对首页没有边界的断言保留。页面截图不是上线结果。

## 验收结果

| 检查 | 结果与证据 |
| --- | --- |
| 本地单元/集成 | `npm run test:local -- --maxWorkers=2`：69文件415项通过。默认大量并行的PGlite先出现超时，限制2 workers后完整通过，不删减测试。 |
| 真实PostgreSQL | `npm run test:postgres:container`：6文件19项通过；临时容器已清理。 |
| 完整浏览器 | 全套执行115项通过、1项散热专用fixture跳过，9.5分钟；包含内容保护、复制/打印、上传、编辑预览、版本权限、归档、新人来源、学习统计及认证生命周期。 |
| 文章专项补充 | `npm run test:e2e:editorial`：14项全部通过，含单独散热fixture、坏图解源码回退、200%文字放大、未试点页面检查及用户批准的Warning标题色。该专项包含与完整套件重叠的用例，不把计数简单相加。 |
| 重排 | light/dark各在320/375/768/1024/1440px测量文档无横溢；手机正文保持视口减边距；16列表格与长公式在自身容器滚动，键盘可横滚，尾列数据未截断。1150px菜单展开不撑高Header且链接至少44px。 |
| 主题/可达性 | 四组375/1440px浅深色文章axe检查0 violations；system随媒体主题变化；减弱动态效果、目录选择后关闭并聚焦目标、标题不被Header遮挡；200%文字放大通过。未宣称人工读屏通过。 |
| 类型/格式/lint | TypeScript、Prettier通过；eslint无错误，保留2条既有警告（编辑器effect依赖、账户测试未用变量）。 |
| 构建/部署契约 | `npm run build`与`npm run test:compose`通过。构建保留3条既有动态存储路径追踪警告。 |
| Excel | 版本总览第55行、提交对照第49行追加；历史单元格值逐格比对无变化，行高沿用165/70，新增行已渲染核对。 |

截图为隔离演示库的真实页面，四组全文及首屏在 `screenshots/reading-{375,1440}-{light,dark}*.png`，另含home、inline-reading、login及三张后台代表页。旧代码`05efd53`在独立临时目录启动后补拍基线，存于`baseline/`；这是旧代码复现，不伪称实施前已拍摄。旧版375px正文被隐式列挤窄，新版单栏已实测修复。

生产模式E2E尝试被既有“The E2E database is forbidden in production”保护拒绝；未降低保护、未把这些失败算通过。浏览器证据来自隔离开发模式，生产构建与真实PostgreSQL分别通过。截图隐藏了开发工具控件，不隐藏产品内容。

## 对比度

按实际 CSS 纯色计算（WCAG 相对亮度），数值见 `contrast.json`。浅/深画布上的主文字分别 15.76/15.12，次文字 6.76/9.92，辅助文字 5.15/7.34，链接 7.07/9.18，强调按钮前景 7.45/8.58。控件边界 3.48/4.93。装饰分隔线不作为控件边界使用。

Callout 标题与各自底色：浅色 info 4.71、tip 5.05、important 4.80、warning 4.63（原色4.38）、example 5.13、formula 4.55；深色均 5.70 以上。Warning 原色未满足 4.5:1；用户已批准仅将新版文章页浅色标题改为 #96672D（4.63:1）。深色、色条和其他页面保留原色。其余兼容色保持不变。Token 比值不等同于覆盖水印、图片和所有实际内容的完整无障碍认证。

## 与生成参考稿的差异

参考图在 `references/`；已确认规范、首批计划分别在 `handoff.md`、`implementation-plan.md`。真实实现使用已发布树、真实元信息、授权入口和作者 Markdown；不复制生成图里的示例代码、不虚构图表内容、不新增复制按钮或自动公式编号。导航项数量随内容变化；保护水印和复核字段保留，所以高度与示意图不同。

## 验证边界

axe、键盘回归、MathML 和几何属性验证不替代 VoiceOver/NVDA 人工读屏。现有 CSS body.zoom 用例只算辅助；另行验证文字放大至200%的重排，不宣称已完成浏览器原生缩放或全面可访问性认证。生产LAN部署、加密备份、直连表单/样式/访问保护和数据核对已执行；已登录生产角色交互未执行。详见发布记录。

## 可复现命令与评审

```sh
npm run format:check
npm run lint
npm run typecheck
npm run test:local -- --maxWorkers=2
npm run test:postgres:container
npm run build
npm run test:compose
npm run test:e2e:editorial
```

完整浏览器当次以临时配置覆盖数据库目录（`.data/e2e/editorial-v9-20261028`），其余配置与仓库playwright.config.ts相同。专用常驻配置`playwright.editorial.config.ts`固定独立演示目录并开启热学样本，不改变默认套件的空栏目约定。

独立代码审阅发现1项P2：1199px紧凑菜单断点与1100px菜单布局断点不一致。已在隔离副本重现菜单使Header从64px涨到220.1875px；修正后1150px布局和键盘回归通过。Warning标题修订同样先重现旧rgb(154,107,47)与批准目标rgb(150,103,45)不一致，再验证两主题标题色与原色条；14项专项全绿。无遗留的评审Minor。
