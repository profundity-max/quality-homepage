// THROWAWAY PROTOTYPE
// Three visual directions for the Q Nexus home, article, and editor surfaces.

const variants = {
  A: { name: "Editorial Space", caption: "宽松 · 编辑式 · 手册感" },
  B: { name: "Knowledge Atlas", caption: "全局 · 可定位 · 知识地图" },
  C: { name: "Focus Studio", caption: "搜索主导 · 任务聚焦 · 工作空间" },
};

const pages = {
  home: "首页",
  article: "文章阅读",
  editor: "Markdown 编辑器",
};

const topics = [
  ["数据与统计基础", "6 个主题", "Mean · σ · CI · ANOVA"],
  ["测量与数据可信度", "5 个主题", "MSA · Uncertainty · Calibration"],
  ["过程控制", "8 个主题", "SPC · Control Chart · Cpk"],
  ["问题解决", "4 个主题", "RCA · CAPA · Escape Point"],
  ["风险与预防", "6 个主题", "FMEA · CTQ · Poka-Yoke"],
  ["品质系统与管理", "9 个主题", "QMS · Audit · Traceability"],
];

const articleSections = [
  ["01", "为什么过程稳定比结果合格更重要"],
  ["02", "Common Cause 与 Special Cause"],
  ["03", "控制图如何帮助我们做判断"],
  ["04", "从信号到 OCAP 的闭环"],
];

const route = () => {
  const params = new URLSearchParams(window.location.search);
  return {
    variant: variants[params.get("variant")] ? params.get("variant") : "A",
    page: pages[params.get("page")] ? params.get("page") : "home",
    theme: params.get("theme") === "dark" ? "dark" : "light",
  };
};

function setRoute(next) {
  const current = route();
  const params = new URLSearchParams({ ...current, ...next });
  window.history.replaceState(null, "", `?${params.toString()}`);
  render();
}

function topNav(active) {
  const nav = ["首页", "新人专区", "品质知识", "散热知识", "模板中心", "推荐书单"];
  return `
    <header class="top-nav">
      <button class="brand" data-page="home" aria-label="返回首页">
        <span class="brand-mark" aria-hidden="true">Q</span>
        <span><b>品集</b><small>Q Nexus</small></span>
      </button>
      <nav aria-label="主导航">
        ${nav
          .map(
            (item) =>
              `<button class="nav-link ${item === active ? "active" : ""}">${item}</button>`,
          )
          .join("")}
      </nav>
      <div class="nav-actions">
        <button class="icon-button search-trigger" aria-label="打开全站搜索"><span class="search-glyph"></span></button>
        <button class="avatar-button" aria-label="用户菜单">L</button>
      </div>
    </header>`;
}

function themeButton(theme) {
  return `<button class="theme-toggle" data-theme-toggle aria-label="切换明暗模式">${
    theme === "dark" ? "浅色" : "深色"
  }</button>`;
}

function prototypeSwitcher(state) {
  return `
    <aside class="prototype-switcher" aria-label="原型切换器">
      <div class="prototype-badge">THROWAWAY UI PROTOTYPE</div>
      <div class="page-tabs" role="tablist" aria-label="选择评审页面">
        ${Object.entries(pages)
          .map(
            ([key, label]) =>
              `<button role="tab" aria-selected="${state.page === key}" class="page-tab ${
                state.page === key ? "selected" : ""
              }" data-page="${key}">${label}</button>`,
          )
          .join("")}
      </div>
      <div class="variant-controls">
        <button data-variant-step="-1" aria-label="上一个视觉方向">←</button>
        <div><strong>${state.variant} — ${variants[state.variant].name}</strong><small>${
          variants[state.variant].caption
        }</small></div>
        <button data-variant-step="1" aria-label="下一个视觉方向">→</button>
      </div>
    </aside>`;
}

function searchField(placeholder = "搜索品质知识、散热知识、模板或书籍") {
  return `<label class="search-field"><span class="search-glyph" aria-hidden="true"></span><input aria-label="全站搜索" placeholder="${placeholder}" /><kbd>⌘ K</kbd></label>`;
}

function abstractGraphic(type) {
  return `<div class="abstract-graphic ${type}" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div>`;
}

function homeA(theme) {
  return `
    ${topNav("首页")}
    <main class="home home-a">
      <section class="hero-a">
        <p class="eyebrow">2026 年 8 月 12 日 · 品质部</p>
        <h1>早上好，Lou</h1>
        <p class="hero-belief">数据驱动 <span>·</span> 结果闭环</p>
        ${searchField()}
        <p class="search-hint">试试：标准差、SPC、TVC 工艺、8D 模板</p>
      </section>
      <section class="onboarding-feature">
        <div class="feature-copy">
          <p class="section-index">01 / NEW HERE</p>
          <h2>从第一天，到独立判断。</h2>
          <p>六个阶段，一条清晰的新人成长路线。理解我们如何看事实、担责任、提前暴露风险，并让系统比个人英雄更可靠。</p>
          <button class="text-action">开始新人路线 <span>→</span></button>
        </div>
        <ol class="route-steps">
          <li class="current"><b>01</b><span>入职第一天</span></li>
          <li><b>02</b><span>认识品质工作</span></li>
          <li><b>03</b><span>工作理念</span></li>
          <li><b>04</b><span>品质基础</span></li>
          <li><b>05</b><span>散热与 TVC 入门</span></li>
          <li><b>06</b><span>培训与试用期</span></li>
        </ol>
      </section>
      <section class="editorial-entries">
        <article class="entry entry-quality">
          <div><p class="section-index">02 / QUALITY</p><h2>品质知识</h2><p>从数据可信，到过程受控，再到问题闭环。</p><button class="text-action">探索 38 个主题 <span>→</span></button></div>
          ${abstractGraphic("distribution")}
        </article>
        <article class="entry entry-thermal">
          ${abstractGraphic("thermal")}
          <div><p class="section-index">03 / THERMAL</p><h2>散热知识</h2><p>理解热如何流动，以及超薄均热板如何被制造。</p><button class="text-action">进入散热专题 <span>→</span></button></div>
        </article>
        <article class="entry entry-template">
          <div><p class="section-index">04 / TEMPLATES</p><h2>不用再问，模板在哪里。</h2><p>当前有效版本、适用软件和变更说明，一处查找。</p></div>
          <div class="file-stack"><span>8D Report.xlsx</span><span>Control Plan.xlsx</span><span>Audit Checklist.numbers</span></div>
        </article>
      </section>
      <section class="recent-grid">
        <header><p class="section-index">05 / RECENT</p><h2>最近更新</h2></header>
        <div class="recent-list">
          <button><span>过程控制</span><b>如何选择正确的控制图</b><small>今天 · Lou</small></button>
          <button><span>散热原理</span><b>Vapor Chamber 的相变循环</b><small>昨天 · Ming</small></button>
          <button><span>问题解决</span><b>Escape Point Analysis 实践</b><small>8 月 9 日 · Yan</small></button>
        </div>
      </section>
      <section class="book-feature"><div class="book-cover"><span>THE<br/>SIGNAL<br/>AND THE<br/>NOISE</span></div><div><p class="section-index">06 / READING</p><h2>在不确定中，做更好的判断。</h2><p>本周推荐 · Nate Silver《信号与噪声》</p><button class="text-action">阅读推荐理由 <span>→</span></button></div></section>
    </main>
    ${themeButton(theme)}`;
}

function homeB(theme) {
  return `
    <div class="atlas-shell">
      <aside class="atlas-rail">
        <button class="rail-brand" data-page="home">Q</button>
        <nav aria-label="知识地图">
          <button class="rail-item active"><span>01</span>总览</button>
          <button class="rail-item"><span>02</span>新人</button>
          <button class="rail-item"><span>03</span>品质</button>
          <button class="rail-item"><span>04</span>散热</button>
          <button class="rail-item"><span>05</span>模板</button>
          <button class="rail-item"><span>06</span>书单</button>
        </nav>
        <button class="avatar-button">L</button>
      </aside>
      <main class="atlas-home">
        <header class="atlas-header"><div><b>品集｜Q Nexus</b><span>品质知识网络</span></div>${searchField("搜索整个知识网络")}</header>
        <section class="atlas-welcome"><div><p class="eyebrow">OVERVIEW · WEDNESDAY</p><h1>早上好，Lou</h1><p>数据驱动 · 结果闭环</p></div><div class="atlas-status"><span><b>84</b> 篇有效知识</span><span><b>12</b> 项待复核</span><span><b>3</b> 条内容反馈</span></div></section>
        <section class="atlas-map">
          <header><div><p class="section-index">KNOWLEDGE ATLAS</p><h2>从问题出发，找到可靠答案。</h2></div><button class="outline-button">展开完整地图</button></header>
          <div class="atlas-columns">
            <article class="atlas-column quality"><h3>品质知识 <small>38 主题</small></h3>${topics.map(([name, count, detail]) => `<button><b>${name}</b><span>${detail}</span><small>${count}</small></button>`).join("")}</article>
            <article class="atlas-column thermal"><h3>散热知识 <small>12 主题</small></h3><button><b>原理知识</b><span>Conduction · Phase Change · Thermal Resistance</span><small>6 个主题</small></button><button><b>工艺知识</b><span>Etching · Welding · Filling · Reliability</span><small>6 个主题</small></button><div class="thermal-map">${abstractGraphic("thermal")}</div></article>
          </div>
        </section>
        <section class="atlas-lower">
          <article><p class="section-index">ONBOARDING</p><h3>新人路线</h3><div class="mini-route"><i class="done"></i><i></i><i></i><i></i><i></i><i></i></div><p>从「入职第一天」开始了解品质部。</p><button class="text-action">查看路线 →</button></article>
          <article><p class="section-index">QUICK ACCESS</p><h3>常用模板</h3><ul><li>8D Report <small>XLSX</small></li><li>Control Plan <small>XLSX</small></li><li>Audit Checklist <small>NUMBERS</small></li></ul></article>
          <article><p class="section-index">RECENT SIGNALS</p><h3>最近更新</h3><ul><li>控制图选择指南 <small>今天</small></li><li>Vapor Chamber 相变循环 <small>昨天</small></li><li>MSA：测量系统的可信度 <small>3 天前</small></li></ul></article>
        </section>
      </main>
    </div>
    ${themeButton(theme)}`;
}

function homeC(theme) {
  return `
    ${topNav("首页")}
    <main class="studio-home">
      <section class="studio-hero">
        <div class="studio-greeting"><p class="eyebrow">Q NEXUS · INTERNAL</p><h1>早上好，Lou</h1><p>数据驱动 · 结果闭环</p></div>
        <div class="command-search"><span class="search-glyph"></span><input aria-label="全站搜索" placeholder="今天要找什么？"/><kbd>⌘ K</kbd><div class="suggestions"><span>SPC</span><span>8D 模板</span><span>TVC 工艺</span><span>我的收藏</span></div></div>
      </section>
      <section class="studio-workspaces">
        <header><p class="section-index">YOUR STARTING POINTS</p><h2>选择一个空间。</h2></header>
        <div class="workspace-grid">
          <button class="workspace-card onboarding"><span class="card-number">01</span><div><small>FOR NEW MEMBERS</small><h3>新人专区</h3><p>六个阶段，理解品质部如何工作。</p></div><span class="card-arrow">↗</span></button>
          <button class="workspace-card quality"><span class="card-number">02</span><div><small>QUALITY SYSTEM</small><h3>品质知识</h3><p>数据、测量、过程、问题与风险。</p></div><span class="card-arrow">↗</span>${abstractGraphic("distribution")}</button>
          <button class="workspace-card thermal"><span class="card-number">03</span><div><small>THERMAL ENGINEERING</small><h3>散热知识</h3><p>原理、工艺与 TVC 实践。</p></div><span class="card-arrow">↗</span>${abstractGraphic("thermal")}</button>
          <button class="workspace-card templates"><span class="card-number">04</span><div><small>CONTROLLED DOWNLOADS</small><h3>模板中心</h3><p>找到当前推荐版本。</p></div><span class="card-arrow">↗</span></button>
        </div>
      </section>
      <section class="studio-feed">
        <div><p class="section-index">RECENTLY PUBLISHED</p><h2>刚刚发生的知识变化。</h2></div>
        <div class="feed-list"><button><time>08.12</time><span><small>过程控制</small><b>如何选择正确的控制图</b></span><i>→</i></button><button><time>08.11</time><span><small>散热原理</small><b>Vapor Chamber 的相变循环</b></span><i>→</i></button><button><time>08.09</time><span><small>问题解决</small><b>Escape Point Analysis 实践</b></span><i>→</i></button></div>
      </section>
    </main>
    ${themeButton(theme)}`;
}

function categoryTree(compact = false) {
  return `<aside class="category-tree ${compact ? "compact" : ""}"><div class="tree-title"><span>品质知识</span><button aria-label="收起分类">‹</button></div><nav>${topics.map(([name], index) => `<div class="tree-group ${index === 2 ? "open" : ""}"><button><i></i>${name}<span>›</span></button>${index === 2 ? `<div class="tree-children"><button>SPC</button><button class="active">Control Chart</button><button>Xbar-R</button><button>Cp / Cpk</button><button>OCAP</button></div>` : ""}</div>`).join("")}</nav></aside>`;
}

function articleBody() {
  return `<article class="article-body">
    <div class="article-kicker"><span>过程控制</span><span>Control Chart</span></div>
    <h1>控制图不是合格判定工具</h1>
    <p class="article-deck">控制图回答的不是“这一个产品是否合格”，而是“这个过程是否仍由同一套稳定机制产生结果”。</p>
    <div class="article-meta"><span>负责人 <b>Lou</b></span><span>最近更新 <b>2026.08.12</b></span><span>最近复核 <b>2026.08.12</b></span><span>1,284 次阅读</span></div>
    <div class="callout emphasis"><span>重点</span><p>规格限描述客户可以接受什么；控制限描述过程正在产生什么。不要把 USL / LSL 画成 UCL / LCL。</p></div>
    <section id="stability"><h2>为什么过程稳定比结果合格更重要</h2><p>一个当下全部合格、但持续漂移的过程，往往比一个偶有超差、但原因清楚且可控制的过程更危险。前者让问题在不确定中积累，后者至少给出了可行动的信号。</p><blockquote>Reality &gt; Opinion：先看过程真实产生的数据，再解释它为什么如此。</blockquote></section>
    <section id="causes"><h2>Common Cause 与 Special Cause</h2><p>Common Cause 是系统本身持续产生的波动；Special Cause 是某个可识别变化带来的额外信号。二者需要不同的管理动作。</p><table><thead><tr><th>信号</th><th>判断</th><th>推荐动作</th></tr></thead><tbody><tr><td>点位随机落在控制限内</td><td>过程可能稳定</td><td>改善系统能力</td></tr><tr><td>单点超出控制限</td><td>Special Cause</td><td>隔离时间窗口并调查</td></tr><tr><td>连续点位单侧偏移</td><td>过程机制可能改变</td><td>启动 OCAP</td></tr></tbody></table></section>
    <section id="chart"><h2>控制图如何帮助我们做判断</h2><div class="control-chart" aria-label="控制图示意"><div class="limit upper"><span>UCL</span></div><div class="limit center"><span>CL</span></div><div class="limit lower"><span>LCL</span></div><div class="data-line"><i style="--x:4%;--y:54%"></i><i style="--x:16%;--y:43%"></i><i style="--x:28%;--y:57%"></i><i style="--x:40%;--y:35%"></i><i style="--x:52%;--y:48%"></i><i style="--x:64%;--y:30%"></i><i class="signal" style="--x:76%;--y:8%"></i><i style="--x:88%;--y:42%"></i></div></div><p>控制图把连续数据放回时间顺序中，让我们看到平均值和波动是否出现了非随机变化。</p></section>
    <div class="callout warning"><span>警告</span><p>发现 Special Cause 后，不要立刻调整所有过程参数。先确认信号、保护客户，再定位发生变化的机制。</p></div>
    <section id="ocap"><h2>从信号到 OCAP 的闭环</h2><ol><li>确认数据和测量系统可信。</li><li>隔离异常时间窗口内的产品。</li><li>寻找与信号同步发生的过程变化。</li><li>验证原因、采取措施并观察过程重新稳定。</li></ol></section>
    <footer class="article-footer"><div><span>标签</span><button>SPC</button><button>控制图</button><button>过程稳定性</button></div><button class="feedback-button">反馈这篇内容</button></footer>
  </article>`;
}

function tableOfContents() {
  return `<aside class="toc"><span>本页目录</span>${articleSections.map(([n, title], index) => `<button class="${index === 0 ? "active" : ""}"><small>${n}</small>${title}</button>`).join("")}<div class="article-tools"><button>☆ 收藏</button><button>↗ 分享链接</button></div></aside>`;
}

function articleA(theme) {
  return `${topNav("品质知识")}<main class="reader reader-a">${categoryTree()}${articleBody()}${tableOfContents()}</main>${themeButton(theme)}`;
}

function articleB(theme) {
  return `<div class="atlas-shell article-atlas"><aside class="atlas-rail"><button class="rail-brand" data-page="home">Q</button><nav><button class="rail-item"><span>01</span>总览</button><button class="rail-item active"><span>03</span>品质</button><button class="rail-item"><span>04</span>散热</button><button class="rail-item"><span>05</span>模板</button></nav><button class="avatar-button">L</button></aside><main><header class="atlas-reader-header"><div><b>品质知识</b><span>/ 过程控制 / Control Chart</span></div>${searchField("在品质知识中搜索")}</header><div class="atlas-reader-grid">${categoryTree(true)}<div class="atlas-article-wrap">${articleBody()}</div>${tableOfContents()}</div></main></div>${themeButton(theme)}`;
}

function articleC(theme) {
  return `${topNav("品质知识")}<main class="focus-reader"><div class="reader-command"><button>← 返回过程控制</button>${searchField("搜索当前主题")}</div><div class="focus-reader-grid"><aside class="article-context"><p class="section-index">CONTROL CHART</p><h2>过程控制</h2><p>用时间顺序理解过程，而不是用单一结果猜测系统。</p><div class="context-progress"><span>2 / 6 ARTICLES</span><i><b></b></i></div><nav><button>SPC 基础</button><button class="active">控制图不是合格判定工具</button><button>如何选择控制图</button><button>Xbar-R 实践</button><button>Cp 与 Cpk</button><button>OCAP</button></nav></aside>${articleBody()}${tableOfContents()}</div></main>${themeButton(theme)}`;
}

function editorToolbar() {
  return `<div class="editor-toolbar"><button title="撤销">↶</button><button title="重做">↷</button><span></span><button><b>B</b></button><button><i>I</i></button><button>H2</button><button>≡</button><button>“ ”</button><button>[ ]</button><button>ƒx</button><button>Callout</button><span></span><button class="command-button">命令 <kbd>⌘ /</kbd></button></div>`;
}

function editorContent(mode = "live") {
  const markdown = `# 控制图不是合格判定工具\n\n控制图回答的不是「这一个产品是否合格」，而是「这个过程是否仍由同一套稳定机制产生结果」。\n\n> [!IMPORTANT] 重点\n> 规格限描述客户可以接受什么；控制限描述过程正在产生什么。\n\n## Common Cause 与 Special Cause\n\nCommon Cause 是系统本身持续产生的波动；Special Cause 是某个可识别变化带来的额外信号。`;
  if (mode === "source") return `<textarea class="markdown-source" spellcheck="false">${markdown}</textarea>`;
  if (mode === "split") return `<div class="split-editor"><textarea class="markdown-source" spellcheck="false">${markdown}</textarea><div class="editor-preview">${articleBody()}</div></div>`;
  return `<div class="live-editor" contenteditable="true" role="textbox" aria-label="文章正文编辑器"><h1>控制图不是合格判定工具</h1><p class="article-deck">控制图回答的不是“这一个产品是否合格”，而是“这个过程是否仍由同一套稳定机制产生结果”。</p><div class="callout emphasis"><span>重点</span><p>规格限描述客户可以接受什么；控制限描述过程正在产生什么。</p></div><h2>Common Cause 与 Special Cause</h2><p>Common Cause 是系统本身持续产生的波动；Special Cause 是某个可识别变化带来的额外信号。</p><p class="empty-line">在此继续输入，或按 / 插入内容…</p></div>`;
}

function editorProperties(style = "panel") {
  return `<aside class="editor-properties ${style}"><header><h3>文章属性</h3><button>•••</button></header><label>状态 <button class="status-draft"><i></i>草稿</button></label><label>主要主题 <button>过程控制 / Control Chart <span>⌄</span></button></label><label>内容负责人 <button><i class="mini-avatar">L</i> Lou <span>⌄</span></button></label><label>标签 <div class="tag-input"><span>SPC ×</span><span>控制图 ×</span><button>＋</button></div></label><label>下次复核日期 <button>2027.08.12 <span>⌄</span></button></label><label>知识别名 <textarea>控制图\nControl Chart\nShewhart Chart</textarea></label><div class="property-note"><b>发布检查</b><span>6 / 6 项已填写</span><i><b></b></i></div></aside>`;
}

function editorA(theme) {
  return `<div class="editor-shell editor-a"><header class="editor-top"><button class="brand" data-page="home"><span class="brand-mark">Q</span><span><b>品集</b><small>Q Nexus</small></span></button><div class="document-state"><b>控制图不是合格判定工具</b><span><i></i> 已保存 · 10:42</span></div><div class="editor-actions"><button>预览</button><button class="primary-button">发布…</button><button class="avatar-button">L</button></div></header><div class="mode-tabs"><button class="active">即时预览</button><button>Markdown</button><button>分栏</button></div>${editorToolbar()}<main class="editor-workspace"><aside class="editor-outline"><header><b>文章大纲</b><button>‹</button></header><button class="active">控制图不是合格判定工具</button><button>为什么过程稳定更重要</button><button>Common Cause 与 Special Cause</button><button>控制图如何帮助判断</button><button>从信号到 OCAP</button></aside><section class="editor-canvas">${editorContent("live")}</section>${editorProperties()}</main></div>${themeButton(theme)}`;
}

function editorB(theme) {
  return `<div class="atlas-shell editor-atlas"><aside class="atlas-rail"><button class="rail-brand" data-page="home">Q</button><nav><button class="rail-item"><span>01</span>内容</button><button class="rail-item active"><span>02</span>编辑</button><button class="rail-item"><span>03</span>反馈</button><button class="rail-item"><span>04</span>复核</button></nav><button class="avatar-button">L</button></aside><main class="atlas-editor-main"><header class="atlas-editor-header"><div><button>← 所有文章</button><b>控制图不是合格判定工具</b><span><i></i> 自动保存于 10:42</span></div><div><button class="outline-button">预览</button><button class="primary-button">发布新版本</button></div></header><section class="atlas-editor-info">${editorProperties("horizontal")}</section>${editorToolbar()}<div class="atlas-editor-body"><section class="editor-canvas">${editorContent("split")}</section></div></main></div>${themeButton(theme)}`;
}

function editorC(theme) {
  return `<div class="focus-editor"><header><button class="text-action" data-page="home">← 品集｜Q Nexus</button><div class="focus-save"><i></i><span>已保存</span></div><div><button>预览</button><button class="primary-button">发布…</button></div></header><div class="focus-document"><div class="focus-title"><span>过程控制 / Control Chart</span><input value="控制图不是合格判定工具" aria-label="文章标题"/><p>控制图回答的不是“这一个产品是否合格”，而是“这个过程是否仍由同一套稳定机制产生结果”。</p></div>${editorToolbar()}<div class="focus-writing">${editorContent("live")}</div></div><button class="properties-drawer-button">文章属性 <span>6 / 6</span></button>${editorProperties("drawer")}</div>${themeButton(theme)}`;
}

function renderPage(state) {
  const renderers = {
    home: { A: homeA, B: homeB, C: homeC },
    article: { A: articleA, B: articleB, C: articleC },
    editor: { A: editorA, B: editorB, C: editorC },
  };
  return renderers[state.page][state.variant](state.theme);
}

function bindEvents(state) {
  document.querySelectorAll("[data-page]").forEach((button) =>
    button.addEventListener("click", () => setRoute({ page: button.dataset.page })),
  );
  document.querySelectorAll("[data-variant-step]").forEach((button) =>
    button.addEventListener("click", () => cycleVariant(Number(button.dataset.variantStep))),
  );
  document.querySelector("[data-theme-toggle]")?.addEventListener("click", () =>
    setRoute({ theme: state.theme === "dark" ? "light" : "dark" }),
  );
  document.querySelectorAll(".mode-tabs button").forEach((button) =>
    button.addEventListener("click", () => {
      document.querySelectorAll(".mode-tabs button").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      const modes = { 即时预览: "live", Markdown: "source", 分栏: "split" };
      const canvas = document.querySelector(".editor-canvas");
      if (canvas) canvas.innerHTML = editorContent(modes[button.textContent.trim()] || "live");
    }),
  );
}

function cycleVariant(direction) {
  const state = route();
  const keys = Object.keys(variants);
  const nextIndex = (keys.indexOf(state.variant) + direction + keys.length) % keys.length;
  setRoute({ variant: keys[nextIndex] });
}

function render() {
  const state = route();
  document.documentElement.dataset.theme = state.theme;
  document.documentElement.dataset.variant = state.variant;
  document.body.className = `page-${state.page} variant-${state.variant}`;
  document.getElementById("app").innerHTML = `${renderPage(state)}${prototypeSwitcher(state)}`;
  bindEvents(state);
  document.title = `${pages[state.page]} · ${state.variant} ${variants[state.variant].name} · 品集｜Q Nexus`;
}

window.addEventListener("keydown", (event) => {
  const target = event.target;
  if (target.matches("input, textarea, [contenteditable='true']")) return;
  if (event.key === "ArrowLeft") cycleVariant(-1);
  if (event.key === "ArrowRight") cycleVariant(1);
});

window.addEventListener("popstate", render);
render();
