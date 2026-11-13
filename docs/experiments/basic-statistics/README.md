# 基础统计首篇文章优化实验 · V10.13

日期：2026-11-13。范围仅为 `article-da79db86`，未改第二篇文章或共享渲染器。

## 交付与预览

- `comparison.html`：单文件离线 HTML，包含完整 Before / After、原图、五维评分、三个问题、变化表和原站截图；双击打开即可，无网络依赖。
- `before.md` / `before.json`：修改前完整正文及阅读快照；原图为 `original-diagram.png`。Before 保留历史表述，不代为修正。
- `after.md`：新版完整正文，是这次实验的可追溯源文件。文章实际存于数据库，通过原站编辑器发布；不是由仓库 Markdown 自动加载。
- `review.json`：具体评审依据；`length-check.json`：两种长度口径。
- `before-desktop.png` / `after-desktop.png` 与 mobile 对应文件：Ego Lite 原站真实截图，桌面视口 1440×1000，手机 390×844 CSS px，浅色模式。

原站：`http://192.168.60.9:8080/quality?topic=mean-sigma-distribution-ci-normal-distribution`，需登录。

本地 HTTP 预览：在项目根目录运行 `python3 -m http.server 18777 --bind 127.0.0.1 --directory docs/experiments/basic-statistics`，打开 `http://127.0.0.1:18777/comparison.html`。

重新生成对比页：在项目根目录运行 `npx tsx docs/experiments/basic-statistics/build-comparison.ts`。复用原站 Markdown 渲染器与正文 CSS、品牌色，并内嵌 KaTeX 字体、原图和截图。该 HTML 是授权的离线评审资料，不放入绕过原站登录的 public 目录。

## 恢复

原站进入该文编辑器，将 `before.md` 完整内容替换到 Markdown 源码并发布；标题、摘要、主题、标签和负责人沿用原值。也可用文章历史恢复操作，填写“撤回 V10.13 单篇优化实验”。不覆盖其他文章，不执行全库回滚。

原始摘要、标题等以 `before.json` 为准。正文内原图仍保留在原站上传资源，不删除。

## 设计取舍与专业核对

采用单组数据贯穿的轻量改写及独立 HTML，避免增加培训系统、通用组件或依赖。保留均值、标准差、分布、正态与 CI 五概念。正文压缩重复解释，以数据表和公式替代原版密集总图；原总图含“σ 小（更稳定）”等不严谨文字，仅在 Before 保留。

示例都是教学模拟。A/B 样本均值均为 1，平方和分别 0.0002 / 0.1，样本标准差约 0.0070711 / 0.1581139 mm；比值 √500 ≈ 22.3607。A 的 t 区间使用 n=5、df=4、t≈2.776445，端点约 0.9912201 / 1.0087799 mm。文章计算取未舍入值，展示五位小数。

NIST 方法依据：https://www.itl.nist.gov/div898/handbook/eda/section3/eda352.htm 。独立、随机、代表性及正态总体是假设，未由五点数据证明；CI 不是单件覆盖或规格范围。

没有宣称改版已提高学习能力。专家评分保留工作关联性 4→4，不强行使每项加分。仍需真实 QE 观察阅读时间、误判率、延迟保持和不同情境迁移。

## 验收记录

见 `verification.json`；发布和 Git 同步记录见 `docs/operations/releases/v10.13.md`。
