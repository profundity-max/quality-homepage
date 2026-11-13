import fs from "node:fs/promises";
import path from "node:path";
import { renderReadingDocument } from "../../../src/modules/shared/markdown-renderer";

const dir = path.dirname(new URL(import.meta.url).pathname);
const read = (name: string) => fs.readFile(path.join(dir, name), "utf8");
const esc = (s: unknown) =>
  String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll('"', "&quot;");
const dataImage = async (name: string) =>
  `data:image/png;base64,${(await fs.readFile(path.join(dir, name))).toString("base64")}`;
const before = await read("before.md");
const after = await read("after.md");
const review = JSON.parse(await read("review.json"));
const b = await renderReadingDocument(before, "before");
const a = await renderReadingDocument(after, "after");
// Keep original content and image intact, including its historically imprecise wording.
b.html = b.html.replace(
  /src="[^"]*cf1a5aab[^"]*"/,
  `src="${await dataImage("original-diagram.png")}"`,
);
const root = path.resolve(dir, "../../..");
let articleCss = await fs.readFile(
  path.join(root, "src/ui/article-body.module.css"),
  "utf8",
);
articleCss = articleCss
  .replaceAll(".body", ".article")
  .replace(/:global\(([^)]+)\)/g, "$1");
let katex = await fs.readFile(
  path.join(root, "node_modules/katex/dist/katex.min.css"),
  "utf8",
);
// Embed fonts for a single-file, fully offline comparison.
for (const match of [...katex.matchAll(/url\((fonts\/[^)]+)\)/g)]) {
  const bytes = await fs.readFile(
    path.join(root, "node_modules/katex/dist", match[1]),
  );
  const type = match[1].endsWith(".woff2")
    ? "font/woff2"
    : match[1].endsWith(".woff")
      ? "font/woff"
      : "font/ttf";
  katex = katex.replace(
    match[0],
    `url(data:${type};base64,${bytes.toString("base64")})`,
  );
}
const table = (headers: string[], rows: unknown[][]) =>
  `<div class="table-scroll" tabindex="0" role="region" aria-label="对比表，可左右滚动"><table><thead><tr>${headers.map((h) => `<th scope="col">${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
const plain = (html: string) =>
  html
    .replace(/<math[\s\S]*?<\/math>/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, "").length;
const count = {
  beforeMarkdown: before.replace(/\s/g, "").length,
  afterMarkdown: after.replace(/\s/g, "").length,
  beforeVisible: plain(b.html),
  afterVisible: plain(a.html),
};
await fs.writeFile(
  path.join(dir, "length-check.json"),
  JSON.stringify(count, null, 2) + "\n",
);
if (
  count.afterMarkdown > count.beforeMarkdown * 1.3 ||
  count.afterVisible > count.beforeVisible * 1.3
)
  throw new Error("Article length exceeds 130%");
let screenshots = "";
for (const device of ["desktop", "mobile"]) {
  try {
    const imgs = await Promise.all(
      ["before", "after"].map(
        async (version) =>
          `<figure><figcaption>${version === "before" ? "Before" : "After"} · ${device === "desktop" ? "1440 × 1000" : "390 × 844"} CSS px 视口</figcaption><a href="${await dataImage(`${version}-${device}.png`)}" target="_blank" rel="noopener"><img loading="lazy" alt="${version} 原站${device === "desktop" ? "桌面" : "手机"}完整页面实拍" src="${await dataImage(`${version}-${device}.png`)}"></a></figure>`,
      ),
    );
    screenshots += `<details><summary>${device === "desktop" ? "桌面" : "手机"}原站实拍（展开查看完整长图）</summary><div class="pair">${imgs.join("")}</div></details>`;
  } catch {
    /* Before publication, a draft comparison can omit after screenshots. */
  }
}
const html = `<!doctype html><html lang="zh-CN" data-appearance="editorial" data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>品集｜Q Nexus · 单篇文章 Before / After</title><style>
${await fs.readFile(path.join(root, "src/styles/editorial-tokens.css"), "utf8")}
${katex}
*{box-sizing:border-box}body{margin:0;background:var(--color-canvas);color:var(--color-text);font:16px/1.75 system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif}main{max-width:1500px;margin:auto;padding:32px}h1{font-size:clamp(1.65rem,3vw,2.4rem);line-height:1.35}h2{font-size:1.45rem}a{color:var(--color-accent)}.eyebrow{letter-spacing:.08em;color:var(--color-accent);font-weight:700}.muted{color:var(--color-text-secondary)}nav{display:flex;flex-wrap:wrap;gap:12px;margin:24px 0}nav a{padding:7px 14px;border:1px solid var(--color-divider);border-radius:6px;text-decoration:none}.panel,.pair>section{padding:26px;border:1px solid var(--color-divider);background:var(--color-surface);border-radius:10px;margin-bottom:24px}.pair{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:24px;align-items:start}.pair>section{min-width:0}.label{font-weight:750;color:var(--color-accent);border-bottom:1px solid var(--color-divider);padding-bottom:12px;margin-bottom:24px}table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:12px;vertical-align:top;border-bottom:1px solid var(--color-divider)}th{background:var(--color-surface-muted)}.table-scroll{overflow-x:auto}#scores td:nth-child(2),#scores td:nth-child(3){font-size:1.3rem;font-weight:700;white-space:nowrap;color:var(--color-accent)}details{margin:16px 0;border-top:1px solid var(--color-divider);padding-top:14px}summary{cursor:pointer;font-weight:700}figure{margin:16px 0;min-width:0}figure img{display:block;width:100%;height:auto;border:1px solid var(--color-divider)}figcaption{margin-bottom:8px}section{scroll-margin-top:18px}.article{max-width:46rem;margin:auto}.article h1{font-size:1.8rem}.article h2{font-size:1.25rem}.problem{padding:14px 0;border-bottom:1px solid var(--color-divider)}:focus-visible{outline:3px solid var(--color-accent);outline-offset:3px}button{font:inherit;padding:8px 16px;cursor:pointer;background:var(--color-accent);color:white;border:0;border-radius:5px}.single .pair.articles{grid-template-columns:1fr}.single .pair.articles>section{max-width:850px;width:100%;margin:0 auto 24px}@media(max-width:800px){main{padding:16px}.pair{grid-template-columns:1fr}.panel,.pair>section{padding:18px}th,td{min-width:110px;padding:10px}#scores td:last-child{min-width:250px}.table-scroll>table{min-width:620px}}@media print{nav,button{display:none}.pair{display:block}}
${articleCss}
</style></head><body><main><p class="eyebrow">品集｜Q Nexus · 小步内容实验 · V10.13</p><h1>同一篇统计入门文章，能否更好地支持工作判断？</h1><p class="muted">2026-11-13 · 仅优化第一篇 · 专家设计评估，尚无学习效果实证</p><nav aria-label="对比页导航"><a href="#scores">五维评分</a><a href="#changes">核心变化</a><a href="#articles">完整 Before / After</a><a href="#shots">真实截图</a><a href="#limits">局限与验证</a></nav>
<section class="panel"><h2>定位与恢复依据</h2><p>实际导航：品质知识 → 数据与统计基础 → 基础概念。该主题仅一篇已发布文章：《Mean / σ / Distribution / CI / 正态分布：品质数据的第一堂统计课》，稳定标识 article-da79db86。依据栏目 sort_order、主题 sort_order 和发布内容核对，未按猜测标题选文。</p><p>完整原文与原图保留，Before 不纠正原文错误；After 下方为实际发布正文。原站编辑器发布会保留旧版快照，也可从 before.md 恢复。标题、主题及其他文章均不改动。</p><p>篇幅口径：去空白 Markdown 字符数 ${count.beforeMarkdown} → ${count.afterMarkdown}（${((count.afterMarkdown / count.beforeMarkdown) * 100).toFixed(1)}%）；渲染文本近似字符数 ${count.beforeVisible} → ${count.afterVisible}（${((count.afterVisible / count.beforeVisible) * 100).toFixed(1)}%）。后者去除标签、空白及重复 MathML，保留可见公式字符；不计原图内文字。两种口径均低于 130%，不将字数直接等同于学习负担。</p></section>
<section id="scores" class="panel"><h2>五维度重新评审</h2><p>1 = 明显不足，3 = 基本可用，5 = 本次目标下充分支持独立理解与判断。评分来自同一套专家标准，属于设计评估；没有读者实验、盲评或因果证据。</p>${table(["维度", "Before / 5", "After / 5", "具体证据与保留意见"], review.scores)}</section>
<section class="panel"><h2>原文最值得解决的三个问题</h2>${review.problems.map((p: string[], i: number) => `<div class="problem"><h3>${i + 1}. ${esc(p[0])}</h3><p><strong>位置：</strong>${esc(p[1])}</p><p><strong>学习影响：</strong>${esc(p[2])}</p><p><strong>处理：</strong>${esc(p[3])}</p></div>`).join("")}</section>
<section id="changes" class="panel"><h2>核心变化对比</h2>${table(["对比项目", "Before", "After", "为什么修改"], review.changes)}</section>
<section id="articles"><h2>完整原文与优化版</h2><p>桌面可并排看；手机自动上下排列。为长文阅读可切为单栏。原文总图完整保留于 Before。</p><button type="button" onclick="document.body.classList.toggle('single');this.textContent=document.body.classList.contains('single')?'切换并排阅读':'切换单栏阅读';this.setAttribute('aria-pressed',document.body.classList.contains('single'))" aria-pressed="false">切换单栏阅读</button><div class="pair articles" style="margin-top:20px"><section><div class="label">A · Before · 原版全文</div><article class="article">${b.html}</article></section><section><div class="label">B · After · 优化版全文</div><article class="article">${a.html}</article></section></div></section>
<section id="shots" class="panel"><h2>原站真实渲染截图</h2><p>来自 Ego Lite 对同一原站主题页的实际截图，均为浅色模式。桌面 1440 × 1000、手机 390 × 844 CSS px；两版使用相同视口。长图是完整页面截图，非效果图，点击可查看原图。Before 保留历史水印及更新信息。</p>${screenshots || "<p>截图尚待发布后补齐。</p>"}</section>
<section id="limits" class="panel"><h2>三个改进与仍需验证的效果</h2><ol><li>用一个 A/B 厚度案例串起计算、解释和可汇报结论。</li><li>纠正分散与稳定性混淆，补足 s/σ、CI 条件与单件判定边界。</li><li>加入换数据的独立判断题，压缩重复段落与总图。</li></ol><p>局限：同一篇仍包含五个概念，t 系数与置信覆盖对新人有负担；五点案例只能演示算法，不能验证正态或量产能力；练习是近迁移，答案向下可见，不能作为独立考核；After 暂未提供新的分布图。</p><p>建议用真实 QE 做一次小样本可用性试验：将熟悉程度相近的读者分配阅读 Before 或 After，记录阅读时间、无提示解释和新数据题正确率；隔数日再给一道不同情境的判断题，观察保持与迁移。检查是否减少 CI/规格和波动/稳定性误判，也记录公式卡点。此处仅提出验证方式，没有招募、实验结果或学习提升结论。</p><p>复算依据：A 的离均差平方和 0.0002 mm²，s = √(0.0002/4)；B 为 0.1 mm²，s = √(0.1/4)；t(0.975,4) ≈ 2.776445，CI 约 [0.99122, 1.00878] mm；练习超差点为 0.94 和 1.06 mm。</p><p>专业核对参考：<a href="https://www.itl.nist.gov/div898/handbook/eda/section3/eda352.htm">NIST：总体均值的置信限</a>。只核对统计方法，不引用未经验证的学习研究结论。</p></section><footer class="muted">单篇实验 · 完整原文可恢复 · 不代表已证明 QE 学习提升</footer></main></body></html>`;
await fs.writeFile(path.join(dir, "comparison.html"), html);
console.log({ output: path.join(dir, "comparison.html"), ...count });
