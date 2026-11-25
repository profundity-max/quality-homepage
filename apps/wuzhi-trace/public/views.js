/* 物资申领与消耗追溯 V1.2.13 — views.js：视图 / 表单 / 签名板 / 导入导出 UI */
'use strict';
(function () {
  const W = window.WZ;
  const $ = s => document.querySelector(s);
  const FILTER = { dash: 'all', buy: 'all', qry: 'all', qMat: '', qRegion: '', qStatus: '', qType: 'all' };
  let curTab = 'dashboard';

  /* ---------------- 模态 ---------------- */
  function openModal(html) {
    const mask = $('#modalMask'), box = $('#modalBox');
    box.innerHTML = html;
    mask.classList.add('show');
  }
  function closeModal() { $('#modalMask').classList.remove('show'); $('#modalBox').innerHTML = ''; }
  window.closeModal = closeModal;
  function modalShell(title, body, acts) {
    return `<h3>${title}</h3>${body}<div class="acts">${acts || '<button class="btn" onclick="closeModal()">关闭</button>'}</div>`;
  }

  /* ---------------- 身份 ---------------- */
  function ensureIdentity() {
    if (W.SYNC.authMode === 'qnexus') return;
    if (W.SYNC.booting) return;
    const m = W.me();
    if (m && m.name) return;
    const members = W.list('members');
    const opts = members.map(x => `<option value="${W.esc(x.name)}|${W.esc(x.role)}|${W.esc(x.region || '')}">${W.esc(x.name)}（${W.esc(x.role)}${x.region ? '·' + W.esc(W.REGION_LABEL[x.region] || x.region) : ''}）</option>`).join('');
    openModal(modalShell('👋 设置我的身份', `
      ${opts ? `<div class="frow"><label>从成员名单选择<select id="mePick"><option value="">— 手动填写 —</option>${opts}</select></label></div>` : ''}
      <div class="frow">
        <label>我的姓名<input id="meNameIn" placeholder="如：张三"></label>
        <label>角色<select id="meRoleIn">${W.ROLES.map(r => `<option>${r}</option>`).join('')}</select></label>
        <label>所属区域（区域领用人）<select id="meRegionIn"><option value=""></option>${W.REGIONS.map(r => `<option value="${r}">${W.REGION_LABEL[r]}</option>`).join('')}</select></label>
      </div>
      <p class="muted">身份保存在本机浏览器，用于操作留痕与权限显隐。</p>
    `, `<button class="btn pri" id="meSave">进入系统</button>`));
    const pick = $('#mePick');
    if (pick) pick.onchange = () => {
      const v = pick.value; if (!v) return;
      const [n, r, g] = v.split('|');
      $('#meNameIn').value = n; $('#meRoleIn').value = r; $('#meRegionIn').value = g || '';
    };
    $('#meSave').onclick = () => {
      const n = $('#meNameIn').value.trim();
      if (!n) { W.toast('请填写姓名'); return; }
      W.setMe(n, $('#meRoleIn').value, $('#meRegionIn').value);
      closeModal(); W.toast('欢迎，' + n);
    };
  }
  function showMeModal() {
    const m = W.me();
    if (W.SYNC.authMode === 'qnexus') {
      const unmatched = !m.memberMatched;
      openModal(modalShell('👤 当前登录身份', `
        <div class="frow">
          <label>姓名<input value="${W.esc(m.name || '')}" readonly></label>
          <label>品集账号<input value="${W.esc(m.username || '')}" readonly></label>
          <label>角色<input value="${W.esc(m.role || '')}" readonly></label>
          <label>所属部门<input value="${W.esc(m.dept || '未配置')}" readonly></label>
          <label>所属区域<input value="${W.esc(W.REGION_LABEL[m.region] || m.region || '未配置')}" readonly></label>
          <label>上级<input value="${W.esc(m.supervisorName || '未配置')}" readonly></label>
        </div>
        ${unmatched ? `<div class="note err"><b>未匹配成员名单，请联系管理员</b><br>当前账号可以查看数据，但不能提交、审批或签字。请管理员 ${W.esc(W.systemAdminLabel())} 在成员名单中补充品集账号并配置审批路由。</div>` : ''}
        <p class="muted">该身份由品集登录态自动关联成员名单，不能在应用内修改。部门、角色、区域、上级和审批路由需要调整时，请联系管理员 ${W.esc(W.systemAdminLabel())}。</p>
      `, `<a class="btn" href="/apps">返回品集</a><button class="btn pri" onclick="closeModal()">关闭</button>`));
      return;
    }
    openModal(modalShell('👤 切换身份', `
      <div class="frow">
        <label>姓名<input id="meNameIn" value="${W.esc(m.name || '')}"></label>
        <label>角色<select id="meRoleIn">${W.ROLES.map(r => `<option ${m.role === r ? 'selected' : ''}>${r}</option>`).join('')}</select></label>
        <label>所属区域<select id="meRegionIn"><option value=""></option>${W.REGIONS.map(r => `<option value="${r}" ${m.region === r ? 'selected' : ''}>${W.REGION_LABEL[r]}</option>`).join('')}</select></label>
      </div>
    `, `<button class="btn" onclick="closeModal()">取消</button><button class="btn pri" id="meSave2">保存</button>`));
    $('#meSave2').onclick = () => {
      const n = $('#meNameIn').value.trim();
      if (!n) { W.toast('请填写姓名'); return; }
      W.setMe(n, $('#meRoleIn').value, $('#meRegionIn').value);
      closeModal();
    };
  }

  /* ---------------- 页签切换 ---------------- */
  function switchTab(t) {
    curTab = t;
    document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('act', b.dataset.tab === t));
    document.querySelectorAll('.tabpane').forEach(p => p.classList.toggle('act', p.id === 'pane-' + t));
    const main = $('#main');
    if (main) main.classList.toggle('wide-pane', t === 'purchases');
    try { history.replaceState(null, '', '#tab=' + t); } catch (e) { }
    W.renderAll();
  }

  /* ================= 仪表盘 ================= */
  function renderDashboard() {
    const pane = $('#pane-dashboard');
    const selectedMonth = FILTER.dash === 'all' ? W.thisMonth() : FILTER.dash;
    const s = W.monthSummary(selectedMonth);
    const kpi = (l, v, sub, cls) => `<div class="kpi ${cls || ''}"><div class="l">${l}</div><div class="v">${v}</div><div class="s">${sub || ''}</div></div>`;
    const pend = W.pendingDocs();
    const myPendingReview = pend['待审核'].filter(W.canReviewPurchase);
    const myPendingApproval = pend['待核准'].filter(W.canApprovePurchase);
    const maxDisp = Math.max(1, ...W.REGIONS.map(r => s.dispatchByRegion[r] || 0));
    const sourceTotal = key => Object.values(s.sources).reduce((sum, item) => sum + W.num(item[key]), 0);
    const sourceRow = (source, metric, label, value, sub, total) => {
      const width = total > 0 ? Math.max(0, Math.min(100, value / total * 100)) : 0;
      return `<div class="source-row"><span class="source-label">${label}</span><span class="source-track"><span class="source-fill" style="width:${width}%"></span></span><span class="source-value"><button class="source-link" data-source-detail="${source}" data-source-metric="${metric}">${W.fmtQty(value)}</button><span class="source-meta">${sub}</span></span></div>`;
    };
    const sourceCard = source => {
      const d = s.sources[source];
      return `<section class="source-card"><h4>${source}<span class="source-subtitle">分类取自申领单，到货 / 签收自动归入</span></h4><div class="source-body">
        ${sourceRow(source, 'purchase', '本月申领', d.purchaseQty, d.purchaseCount + ' 单', s.purchaseQty)}
        ${sourceRow(source, 'arrival', '本月到货', d.arriveQty, d.arriveCount + ' 批', s.arriveQty)}
        ${sourceRow(source, 'receipt', '文员实收', d.recvQty, d.recvCount + ' 次', s.recvQty)}
        ${sourceRow(source, 'pendingReview', '待审核', d.pendingReview, '待一级审核', sourceTotal('pendingReview'))}
        ${sourceRow(source, 'pendingApproval', '待核准', d.pendingApproval, '待最终核准', sourceTotal('pendingApproval'))}
      </div></section>`;
    };
    const stockRows = s.stocks.map(x => {
      const cls = x.alert === 'red' ? 'bad' : x.alert === 'yellow' ? 'warn' : '';
      const daysTxt = x.days == null ? '—' : x.days + ' 天';
      const alertTag = x.alert === 'red' ? '<span class="tag red">低于安全库存</span>' : x.alert === 'yellow' ? '<span class="tag yellow">接近安全库存</span>' : '';
      return `<tr><td>${W.esc(x.name)}</td><td>${W.esc(x.spec)}</td><td>${W.esc(x.unit)}</td><td>${W.fmtQty(x.recvTotal)}</td><td>${W.fmtQty(x.usedTotal)}</td><td class="${cls}"><b>${W.fmtQty(x.remain)}</b> ${alertTag}</td><td>${daysTxt}${x.rate ? `<span class="muted">（日均 ${W.fmtQty(x.rate)}${x.sample ? '·样本少' : ''}）</span>` : ''}</td></tr>`;
    }).join('') || `<tr><td colspan="7" class="empty">暂无物料，请先在「物料档案」建立档案</td></tr>`;
    pane.innerHTML = `
      ${W.SYNC.authMode === 'qnexus' && !W.isMemberMatched() ? `<div class="card"><div class="note err"><b>未匹配成员名单，请联系管理员</b><br>当前品集账号可以查看数据，但不能提交申领、审批或领用签字。请联系管理员 ${W.esc(W.systemAdminLabel())} 补建成员档案并配置审批路由。</div></div>` : ''}
      <div class="card"><h3>📊 月度汇总
        <span class="sp"><input type="month" id="dashMonth" value="${selectedMonth}"></span>
        <span><button class="btn sm" id="dashExport">导出 Excel</button></span>
      </h3>
      <div class="kpis">
        ${kpi('本月申领总量', W.fmtQty(s.purchaseQty), s.purchaseCount + ' 单')}
        ${kpi('本月实际到货总量', W.fmtQty(s.arriveQty), s.arriveCount + ' 批')}
        ${kpi('实收总量', W.fmtQty(s.recvQty), s.recvCount + ' 次签收')}
        ${kpi('我的待审核', myPendingReview.length, '自动路由给当前审核人', myPendingReview.length > 0 ? 'warn' : '')}
        ${kpi('我的待核准', myPendingApproval.length, '自动路由给当前核准人', myPendingApproval.length > 0 ? 'warn' : '')}
        ${kpi('待签字领用单据', s.pendingSignoffs, '待领用确认', s.pendingSignoffs > 0 ? 'warn' : '')}
        ${W.REGIONS.map(r => kpi('分发至 ' + W.REGION_LABEL[r], W.fmtQty(s.dispatchByRegion[r] || 0), '本月分发')).join('')}
      </div>
      <div class="source-grid">${sourceCard('OA请购')}${sourceCard('行政请购')}</div>
      <p class="source-note">OA请购 + 行政请购 + 其他来源 = 全量合计；请购来源为“其他”或旧数据不进入上方两个卡片，但仍计入顶部核心指标。</p>
    </div>
    <div class="card"><h3>📈 各区域分发对比</h3>
        <div class="bar">${W.REGIONS.map(r => `<div class="col"><b>${W.fmtQty(s.dispatchByRegion[r] || 0)}</b><div class="b" style="height:${Math.round((s.dispatchByRegion[r] || 0) / maxDisp * 90) + 4}px"></div><div class="n">${W.REGION_LABEL[r]}</div></div>`).join('')}</div>
      </div></div>
      <div class="card"><h3>📦 各物料库存与可用周期 <span class="sp muted">剩余 = 实收 − 已领用 · 消耗口径：近 30 天日均</span></h3>
        <div class="twrap"><table><thead><tr><th>物料</th><th>规格</th><th>单位</th><th>实收累计</th><th>已领用累计</th><th>剩余库存</th><th>预估可用</th></tr></thead><tbody>${stockRows}</tbody></table></div>
      </div>
      <div class="card"><h3>⏳ 待办单据
        <span class="sp"><button class="btn sm" id="dashDetail">${FILTER.qType === 'pend' ? '隐藏明细' : '查看明细'}</button></span></h3>
        ${FILTER.qType === 'pend' ? renderPendingTable() : '<p class="muted">待到货 / 待签收 / 待领用确认的单据会显示在这里。</p>'}
      </div>`;
    $('#dashMonth').onchange = e => { FILTER.dash = e.target.value || W.thisMonth(); W.renderAll(); };
    $('#dashExport').onclick = exportMonth;
    pane.querySelectorAll('[data-source-detail]').forEach(button => button.onclick = () => openSourceDetail(button.dataset.sourceDetail, button.dataset.sourceMetric));
    const dt = $('#dashDetail'); if (dt) dt.onclick = () => { FILTER.qType = FILTER.qType === 'pend' ? 'all' : 'pend'; W.renderAll(); };
  }
  function sourceDetailRecords(source, metric, month) {
    const purchases = W.list('purchases').filter(purchase => W.purchaseRequestSource(purchase) === source);
    const purchaseById = new Map(purchases.map(purchase => [purchase.id, purchase]));
    const records = [];
    if (metric === 'purchase' || metric === 'pendingReview' || metric === 'pendingApproval') {
      for (const purchase of purchases) {
        if (!W.inMonth(purchase.date, month)) continue;
        const status = W.purchaseApprovalStatus(purchase);
        if (metric === 'pendingReview' && status !== W.APPROVAL_PENDING) continue;
        if (metric === 'pendingApproval' && status !== W.APPROVAL_WAITING) continue;
        const material = W.get('materials', purchase.mid);
        records.push({
          date: purchase.date, type: '申领', material: material ? material.name : '（已删物料）',
          qty: purchase.qty, ref: purchase.id, status: W.purchaseStatus(purchase), by: purchase.by,
        });
      }
    }
    if (metric === 'arrival') {
      for (const arrival of W.list('arrivals')) {
        const purchase = arrival.pid ? purchaseById.get(arrival.pid) : null;
        if (!purchase || !W.inMonth(arrival.arrDate, month)) continue;
        const material = W.get('materials', arrival.mid);
        records.push({
          date: arrival.arrDate, type: '到货', material: material ? material.name : '（已删物料）',
          qty: arrival.arrQty, ref: purchase.id, status: '已到货', by: arrival.by,
        });
      }
    }
    if (metric === 'receipt') {
      for (const receipt of W.list('receipts')) {
        if (!W.inMonth(receipt.recvAt, month)) continue;
        const arrival = W.get('arrivals', receipt.aid);
        const purchase = arrival && arrival.pid ? purchaseById.get(arrival.pid) : null;
        if (!purchase) continue;
        const material = W.get('materials', arrival.mid);
        records.push({
          date: receipt.recvAt, type: '实收', material: material ? material.name : '（已删物料）',
          qty: receipt.recvQty, ref: purchase.id, status: '已签收', by: receipt.recvBy,
        });
      }
    }
    return records;
  }
  function openSourceDetail(source, metric) {
    const month = FILTER.dash === 'all' ? W.thisMonth() : FILTER.dash;
    const labels = { purchase: '本月申领', arrival: '本月到货', receipt: '文员实收', pendingReview: '待审核', pendingApproval: '待核准' };
    const records = sourceDetailRecords(source, metric, month);
    const rows = records.sort((a, b) => String(b.date).localeCompare(String(a.date))).map(record =>
      `<tr><td>${W.esc(record.date)}</td><td>${W.esc(record.type)}</td><td>${W.esc(record.material)}</td><td>${W.fmtQty(record.qty)}</td><td>${W.esc(record.status)}</td><td>${W.esc(record.by || '—')}</td><td>${W.esc(record.ref)}</td></tr>`
    ).join('') || `<tr><td colspan="7" class="empty">${W.esc(month)} 暂无${source}${labels[metric] || ''}记录</td></tr>`;
    openModal(modalShell(`${source} · ${labels[metric] || '明细'}（${W.esc(month)}）`, `
      <p class="muted">分类来自申领单来源；到货按到货日期、实收按签收日期归入同一申领来源。</p>
      <div class="twrap" style="max-height:460px"><table><thead><tr><th>日期</th><th>类型</th><th>物料</th><th>数量</th><th>状态</th><th>经手人</th><th>关联申领</th></tr></thead><tbody>${rows}</tbody></table></div>
    `, `<button class="btn" onclick="closeModal()">关闭</button><button class="btn pri" onclick="closeModal();goTab('purchases')">去申领台账</button>`));
  }
  function renderPendingTable() {
    const p = W.pendingDocs();
    const rows = [];
    p['待审核'].filter(W.canReviewPurchase).forEach(r => { const mt = W.get('materials', r.mid); rows.push(`<tr><td><span class="tag yellow">待审核</span></td><td>${W.esc(mt ? mt.name : '?')}</td><td>申领 ${W.fmtQty(r.qty)}</td><td>${W.esc(r.date || '')}</td><td>${W.esc(r.by || '')}</td><td><button class="btn sm" onclick="goTab('purchases')">去审核</button></td></tr>`); });
    p['待核准'].filter(W.canApprovePurchase).forEach(r => { const mt = W.get('materials', r.mid); rows.push(`<tr><td><span class="tag blue">待核准</span></td><td>${W.esc(mt ? mt.name : '?')}</td><td>申领 ${W.fmtQty(r.qty)}</td><td>${W.esc(r.date || '')}</td><td>${W.esc(r.reviewedBy || r.by || '')}</td><td><button class="btn sm" onclick="goTab('purchases')">去核准</button></td></tr>`); });
    p['待到货'].forEach(r => { const mt = W.get('materials', r.mid); rows.push(`<tr><td><span class="tag blue">待到货</span></td><td>${W.esc(mt ? mt.name : '?')}</td><td>申领 ${W.fmtQty(r.qty)}</td><td>${W.esc(r.date || '')}</td><td>${W.esc(r.by || '')}</td><td><button class="btn sm pri" onclick="goArrival('${r.id}')">登记到货</button></td></tr>`); });
    p['待签收'].forEach(r => { const mt = W.get('materials', r.mid); rows.push(`<tr><td><span class="tag yellow">待签收</span></td><td>${W.esc(mt ? mt.name : '?')}</td><td>到货 ${W.fmtQty(r.arrQty)}</td><td>${W.esc(r.arrDate || '')}</td><td>${W.esc(r.by || '')}</td><td><button class="btn sm" onclick="goTab('arrivals')">去处理</button></td></tr>`); });
    p['待领用确认'].forEach(r => { const mt = W.get('materials', r.mid); rows.push(`<tr><td><span class="tag red">待领用确认</span></td><td>${W.esc(mt ? mt.name : '?')}</td><td>分发 ${W.fmtQty(r.qty)} → ${W.esc(W.REGION_LABEL[r.region] || r.region)}</td><td>${W.esc(r.at || '')}</td><td>${W.esc(r.byWho || '')}</td><td><button class="btn sm" onclick="goTab('dispatch')">去签字</button></td></tr>`); });
    return rows.length ? `<div class="twrap"><table><thead><tr><th>状态</th><th>物料</th><th>数量</th><th>日期</th><th>操作人</th><th></th></tr></thead><tbody>${rows.join('')}</tbody></table></div>` : '<p class="empty">🎉 没有待办单据</p>';
  }
  window.goTab = switchTab;
  window.goArrival = id => { switchTab('arrivals'); arrivalForm(null, id); };

  async function exportMonth() {
    const month = FILTER.dash === 'all' ? W.thisMonth() : FILTER.dash;
    const s = W.monthSummary(month);
    const sourceRows = [
      ['请购来源分类'],
      ['来源', '本月申领', '申领单数', '本月到货', '到货批次', '文员实收', '签收次数', '待审核', '待核准'],
      ...['OA请购', '行政请购', '其他'].map(source => {
        const item = s.sources[source];
        return [source, item.purchaseQty, item.purchaseCount, item.arriveQty, item.arriveCount, item.recvQty, item.recvCount, item.pendingReview, item.pendingApproval];
      }),
      ['全量合计', s.purchaseQty, s.purchaseCount, s.arriveQty, s.arriveCount, s.recvQty, s.recvCount,
        Object.values(s.sources).reduce((sum, item) => sum + item.pendingReview, 0),
        Object.values(s.sources).reduce((sum, item) => sum + item.pendingApproval, 0)],
    ];
    const rows = [
      ['物资申领与消耗追溯 V1.2.13 · 月度汇总'],
      ['月份', month],
      [],
      ['指标', '数值'],
      ['本月申领总量', s.purchaseQty], ['本月申领单数', s.purchaseCount],
      ['本月实际到货总量', s.arriveQty], ['本月到货批次', s.arriveCount],
      ['实收总量', s.recvQty], ['签收次数', s.recvCount],
      ['待签字领用单据数', s.pendingSignoffs],
      ...W.REGIONS.map(r => ['分发至 ' + W.REGION_LABEL[r], s.dispatchByRegion[r] || 0]),
      [],
      ...sourceRows,
      [],
      ['物料库存明细'],
      ['物料', '规格', '单位', '实收累计', '已领用累计', '剩余库存', '日均消耗', '预估可用天数', '安全库存', '告警'],
      ...s.stocks.map(x => [x.name, x.spec, x.unit, x.recvTotal, x.usedTotal, x.remain, x.rate ? Math.round(x.rate * 100) / 100 : '', x.days == null ? '' : x.days, x.safe, x.alert === 'red' ? '低于安全库存' : x.alert === 'yellow' ? '接近安全库存' : ''])
    ];
    const detailSheet = source => ({
      name: source,
      rows: [
        ['日期', '类型', '物料', '数量', '状态', '经手人', '关联申领'],
        ...['purchase', 'arrival', 'receipt']
          .flatMap(metric => sourceDetailRecords(source, metric, month))
          .sort((a, b) => String(b.date).localeCompare(String(a.date)))
          .map(record => [record.date, record.type, record.material, record.qty, record.status, record.by || '', record.ref]),
      ],
    });
    try {
      const bytes = await W.xlsxBuild([
        { name: '月度汇总', rows },
        detailSheet('OA请购'),
        detailSheet('行政请购'),
      ]);
      W.downloadBlob(bytes, `物资月度汇总_${month}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      W.logOp('导出', 'dashboard', '', `导出 ${month} 月度汇总与请购来源明细 Excel`); W.saveState();
    } catch (e) { W.toast('导出失败：' + e.message); }
  }

  /* ================= 物料档案 ================= */
  function renderMaterials() {
    const pane = $('#pane-materials');
    const editable = W.canManageMaterials();
    const canImport = W.canImportMaterials();
    const all = W.list('materials').sort((a, b) => String(a.name).localeCompare(String(b.name)));
    /* 修复（2026-11-17）：档案页头部显示数据条数与来源（本地缓存/云端版本），
       保存后数据有没有进档案页一眼可查，避免「存了但看不到」无法定位。 */
    const srcNote = W.SYNC.mode === 'server'
      ? '数据来源：云端共享（服务端版本 v' + (W.SYNC.ver || 1) + (W.SYNC.lastSyncAt ? '，最近同步 ' + new Date(W.SYNC.lastSyncAt).toLocaleTimeString() : '，尚未成功拉取') + '）'
      : '数据来源：本机（本地模式，未连共享）';
    const rows = all.map(mt => {
      const st = W.stockOf(mt.id), dl = W.daysLeftOf(mt.id), al = W.alertLevel(mt.id);
      const cls = al.level === 'red' ? 'bad' : al.level === 'yellow' ? 'warn' : '';
      return `<tr><td>${W.esc(mt.code || '—')}</td><td><b>${W.esc(mt.name)}</b></td><td>${W.esc(mt.spec)}</td><td>${W.esc(mt.unit)}</td><td>${W.esc(mt.category || '—')}</td><td>${W.fmtQty(mt.safe)}</td><td>${W.fmtQty(st.recvTotal)}</td><td>${W.fmtQty(st.usedTotal)}</td><td class="${cls}"><b>${W.fmtQty(st.remain)}</b></td><td>${dl.days == null ? '—' : dl.days + ' 天'}</td><td>${W.esc(mt.note)}</td>
        ${editable ? `<td><button class="btn sm" data-edit="${mt.id}">编辑</button> <button class="btn sm danger" data-del="${mt.id}">删除</button></td>` : ''}</tr>`;
    }).join('') || `<tr><td colspan="11" class="empty">暂无物料档案${editable ? '，点击「新增物料」开始' : ''}</td></tr>`;
    pane.innerHTML = `<div class="card"><h3>🧾 物料基础档案 <span class="muted">共 ${all.length} 条 · ${srcNote}</span>
      <span class="sp">${editable ? '<button class="btn pri sm" id="btnAddMaterial">＋ 新增物料</button>' : '<span class="muted">手改/删除仅管理员</span>'}<button class="btn sm" id="btnOaExport">⬇ 导出 OA 模板</button>${canImport ? '<button class="btn sm" id="btnOaImport">⬆ 导入 OA 模板</button>' : ''}</span></h3>
      ${(!editable && W.SYNC.mode === 'server' && String(W.cloudCfg.adminKey || '').trim()) ? '<p class="muted" style="color:#b45309;margin:-4px 0 8px">你已填管理员口令但服务端未认可 → 档案只读。请核对口令大小写与前后空格后重新「保存并连接」（默认口令 wuzhi-admin-2026，服务端可改）。</p>' : ''}
      <div class="twrap"><table><thead><tr><th>存货编码</th><th>物料名称</th><th>规格型号</th><th>单位</th><th>物品分类</th><th>安全库存</th><th>实收累计</th><th>已领用</th><th>剩余库存</th><th>预估可用</th><th>备注</th>${editable ? '<th>操作</th>' : ''}</tr></thead><tbody>${rows}</tbody></table></div><input type="file" id="oaImpFile" accept=".xlsx" style="display:none"></div>`;
    const add = $('#btnAddMaterial');
    if (add) add.onclick = () => materialForm(null);
    const bx = $('#btnOaExport'); if (bx) bx.onclick = oaExport;
    const bi = $('#btnOaImport'); if (bi) bi.onclick = () => $('#oaImpFile').click();
    const fi = $('#oaImpFile'); if (fi) fi.onchange = e => { const f = e.target.files && e.target.files[0]; if (f) oaImport(f); e.target.value = ''; };
    pane.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => materialForm(b.dataset.edit));
    pane.querySelectorAll('[data-del]').forEach(b => b.onclick = () => {
      const mt = W.get('materials', b.dataset.del);
      if (confirm(`确认删除物料「${mt.name}」？其申领/到货/分发记录将保留但失去关联名称。`)) W.remove('materials', mt.id, `删除物料：${mt.name}`);
    });
  }
  function materialForm(id) {
    if (id) W.markEdit('materials', id);
    const mt = id ? W.get('materials', id) : { code: '', name: '', spec: '', unit: '', category: '', safe: '', note: '' };
    openModal(modalShell(id ? '✏️ 编辑物料' : '＋ 新增物料', `
      <div class="frow">
        <label>存货编码<input id="fCode" value="${W.esc(mt.code)}" placeholder="如 CL-000025"></label>
        <label>物料名称 *<input id="fName" value="${W.esc(mt.name)}"></label>
        <label>规格型号<input id="fSpec" value="${W.esc(mt.spec)}"></label>
        <label>单位<input id="fUnit" value="${W.esc(mt.unit)}" placeholder="个/包/盒"></label>
        <label>物品分类<input id="fCategory" value="${W.esc(mt.category)}" placeholder="耗材/备品备件"></label>
        <label>安全库存<input id="fSafe" type="number" min="0" value="${W.esc(mt.safe)}"></label>
      </div>
      <div class="frow"><label style="flex:1">描述 / 用途说明<textarea id="fNote" rows="2" style="width:100%">${W.esc(mt.note)}</textarea></label></div>
    `, `<button class="btn" onclick="closeModal()">取消</button><button class="btn pri" id="fSave">保存</button>`));
    $('#fSave').onclick = () => {
      const name = $('#fName').value.trim();
      if (!name) { W.toast('物料名称必填'); return; }
      W.upsert('materials', { id, code: $('#fCode').value.trim(), name, spec: $('#fSpec').value.trim(), unit: $('#fUnit').value.trim(), category: $('#fCategory').value.trim(), safe: W.num($('#fSafe').value), note: $('#fNote').value.trim() }, `物料：${name}`);
      closeModal(); W.toast('已保存');
    };
  }

  /* ================= 申领台账 ================= */
  /* OA请购提报模板 V1.0 的 34 列表头（与物料档案 OA 模板、附件请购申请一致） */
  const OA_HEADERS = ['序号', '申请人', '申请部门', '申请课级单位', '部门主管', '项目', '项目阶段',
    'Area\n详细工站', '制程\n（中文）', '物品类型', '存货编码', '存货名称', '规格型号',
    '描述（对物品详细解释）', '单位', '线体需求', '现有数量', '请购数量', '单价', '申请时间', '需求时间',
    '地点\n（一期/二期/三期）', '详细地点\n（哪个楼层，哪个位置）',
    '工程客户是否批准', '工程客户批准DRI', '工程客户批准时间',
    '物品分类\n（模治具/设备/耗材/备品备件/生产物料等）',
    '申请原因（用途）及数量逻辑\n（数量多的需要提供计算逻辑）',
    '预算名录                   （部门费用/设备预算/模治具）', '费用类别', '是否客户付费', 'BPM确认', '是否在预算内', '部门备注超预算原因'];

  const OA_COLUMN_WIDTHS = [56, 92, 112, 100, 92, 100, 82, 104, 100, 100, 132, 132, 132, 190, 64, 82, 82, 82, 82, 104, 104, 92, 150, 108, 122, 112, 132, 210, 144, 104, 100, 88, 96, 160];
  const OA_NUMBER_COLUMNS = new Set([0, 15, 16, 17, 18]);
  const OA_DATE_COLUMNS = new Set([19, 20, 25]);
  const OA_LONG_COLUMNS = new Set([7, 13, 22, 27, 33]);

  const PURCHASE_SYSTEM_COLUMNS = [
    { label: '请购来源', width: 94, kind: 'text' },
    { label: '审批状态', width: 112, kind: 'status' },
    { label: '已到货数量', width: 88, kind: 'num' },
    { label: '审核人（应/实）', width: 134, kind: 'text' },
    { label: '核准人（应/实）', width: 134, kind: 'text' },
    { label: '操作', width: 240, kind: 'action' }
  ];
  const PURCHASE_SYSTEM_HEADERS = PURCHASE_SYSTEM_COLUMNS.map(column => column.label);

  function purchaseColumnMeta() {
    const oaColumns = OA_HEADERS.map((label, index) => ({
      label,
      width: OA_COLUMN_WIDTHS[index],
      kind: OA_NUMBER_COLUMNS.has(index) ? 'num' : OA_DATE_COLUMNS.has(index) ? 'date' : 'text',
      long: OA_LONG_COLUMNS.has(index),
      sequence: index === 0
    }));
    return [...oaColumns, ...PURCHASE_SYSTEM_COLUMNS];
  }

  function purchaseColumnClass(column) {
    const classes = ['purchase-col'];
    if (column.kind === 'num') classes.push('purchase-num-cell');
    if (column.kind === 'date') classes.push('purchase-date-cell');
    if (column.kind === 'status') classes.push('purchase-status-cell');
    if (column.kind === 'action') classes.push('purchase-action-cell');
    if (column.sequence) classes.push('purchase-seq-col');
    if (column.long) classes.push('purchase-long-cell');
    return classes.join(' ');
  }

  function purchaseOaRowValues(p, mt, sequence) {
    return [
      sequence,
      p.oaApplicant || p.by || '',
      p.dept || '',
      p.oaRequestUnit || '',
      p.oaSupervisor || '',
      p.project || '',
      p.projectStage || '',
      p.areaStation || '',
      p.processName || '',
      p.itemType || (mt ? mt.category : '') || '',
      mt ? mt.code : '',
      mt ? mt.name : '（已删物料）',
      mt ? mt.spec : '',
      p.description || (mt ? mt.note : '') || '',
      mt ? mt.unit : '',
      p.lineDemand || '',
      p.currentQty || '',
      p.qty,
      p.unitPrice || '',
      p.date || '',
      p.requiredDate || '',
      p.location || p.dest || '',
      p.detailedLocation || '',
      p.engineeringApproved || '',
      p.engineeringDri || '',
      p.engineeringApprovedAt || '',
      p.itemCategory || (mt ? mt.category : '') || '',
      p.purpose || '',
      p.budgetList || '',
      p.expenseCategory || '',
      p.customerPaid || '',
      p.bpmConfirmed || '',
      p.withinBudget || '',
      p.budgetNote || ''
    ];
  }

  async function purchaseExport(items, month) {
    const ledgerRows = items.map((p, index) => {
      const mt = W.get('materials', p.mid);
      const arrived = W.arrivalsOf(p.id).reduce((sum, a) => sum + W.num(a.arrQty), 0);
      return [
        ...purchaseOaRowValues(p, mt, index + 1),
        W.purchaseRequestSource(p),
        W.purchaseApprovalStatus(p),
        arrived,
        `${p.reviewerName || '未指定'} / ${p.reviewedBy || '—'}`,
        `${p.approverName || (p.approvalMode === W.APPROVAL_MODE_REVIEW_ONLY ? '无需核准' : '未指定')} / ${p.approvedBy || '—'}`,
        ''
      ];
    });
    const ledgerHeaders = [...OA_HEADERS, ...PURCHASE_SYSTEM_HEADERS];
    const instructions = [
      ['申领台账导入模板填写说明'],
      ['1. “导入模板”工作表与物料档案现有“OA请购提报 V1.0”模板一致，共34列；请保持表头不变。'],
      ['2. 从第2行开始填写，每行代表一张OA请购单；存货编码或存货名称至少填写一项。'],
      ['3. 系统读取存货编码、存货名称、规格型号、单位、物品类型、请购数量、申请时间、申请部门、申请原因和地点等字段。'],
      ['4. 请购数量必须大于0，申请时间必填，推荐格式 YYYY-MM-DD。'],
      ['5. OA模板没有“请购来源”列，因此导入后默认归为“OA请购”；行政请购和其他来源请在申领台账中编辑。'],
      ['6. 未匹配到物料档案时，系统会按OA模板中的编码、名称、规格、单位、物品类型自动创建物料。'],
      ['7. 导入申领会按当前登录人的成员名单路由进入待审核或待核准，不会绕过审核与核准。'],
      ['8. “申领台账”工作表是本次导出时的业务快照，用于查看和归档，不会被导入。'],
    ];
    try {
      const bytes = await W.xlsxBuild([
        { name: '申领台账', rows: [ledgerHeaders, ...ledgerRows] },
        { name: '导入模板', rows: [OA_HEADERS] },
        { name: '填写说明', rows: instructions }
      ]);
      const scope = month === 'all' ? '全部月份' : month;
      W.downloadBlob(bytes, `申领台账_${scope}_${W.today()}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      W.logOp('导出', 'purchases', '', `导出申领台账（${scope}，${items.length}条）及导入模板`);
      W.saveState();
      W.toast('申领台账与导入模板已导出');
    } catch (error) {
      W.toast('导出失败：' + error.message);
    }
  }

  function purchaseImportResult(result) {
    openModal(modalShell('📥 申领 Excel 导入结果', `
      <p>成功 <b class="tag green">${result.ok}</b> · 失败 <b class="tag ${result.fail ? 'red' : 'gray'}">${result.fail}</b> · 提示 <b class="tag ${result.warnings.length ? 'yellow' : 'gray'}">${result.warnings.length}</b></p>
      <div class="twrap" style="max-height:300px;margin-top:8px">${[...result.warnings, ...result.errors].length
        ? [...result.warnings, ...result.errors].map(message => `<div class="logline">${W.esc(message)}</div>`).join('')
        : '<p class="empty">全部导入成功</p>'}</div>
    `, `<button class="btn pri" onclick="closeModal()">完成</button>`));
    W.renderAll();
  }

  function importPurchaseRows(rows, mapping) {
    const route = W.resolveApprovalRoute();
    if (!route.ok) return { ok: 0, fail: 0, warnings: [], errors: [route.message] };
    const result = { ok: 0, fail: 0, warnings: [], errors: [] };
    rows.forEach((row, index) => {
      const lineNo = index + 2;
      const gv = field => mapping[field] != null
        ? String(row[mapping[field]] == null ? '' : row[mapping[field]]).trim()
        : '';
      try {
        const code = gv('code');
        const materialName = gv('materialName') || gv('name');
        if (!code && !materialName) return;
        if (materialName === '存货名称' || materialName === '物料名称') return;
        const qty = W.num(gv('qty'));
        if (qty <= 0) throw new Error('申领数量必须大于0');
        const dateRaw = gv('date');
        if (!dateRaw) throw new Error('申领日期不能为空');
        const date = W.normDate(dateRaw);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`申领日期「${dateRaw}」格式无效`);
        const sourceRaw = gv('requestSource');
        const requestSource = !sourceRaw || /^OA/i.test(sourceRaw)
          ? 'OA请购'
          : sourceRaw.includes('行政')
            ? '行政请购'
            : sourceRaw === '其他'
              ? '其他'
              : '';
        if (!requestSource) throw new Error(`请购来源「${sourceRaw}」无效，只能填写 OA请购、行政请购或其他`);
        const spec = gv('spec');
        const unit = gv('unit');
        const itemType = gv('itemType');
        const itemCategory = gv('itemCategory');
        const category = itemCategory || itemType || gv('category');
        const description = gv('description');
        const materials = W.list('materials');
        let material = (code && materials.find(item => String(item.code || '').trim() === code))
          || (materialName && materials.find(item => String(item.name || '').trim() === materialName))
          || null;
        if (!material) {
          material = W.upsert('materials', {
            code, name: materialName || code, spec, unit, category, note: description
          }, `申领导入自动创建物料：${materialName || code}`);
          result.warnings.push(`行${lineNo}：物料「${materialName || code}」不存在，已自动创建档案`);
        }
        W.upsert('purchases', {
          mid: material.id,
          qty,
          date,
          purpose: gv('purpose'),
          dest: gv('dest') || gv('location'),
          dept: gv('dept'),
          requestSource,
          oaApplicant: gv('applicant') || W.me().name || '',
          oaRequestUnit: gv('requestUnit'),
          oaSupervisor: gv('supervisor'),
          project: gv('project'),
          projectStage: gv('projectStage'),
          areaStation: gv('areaStation'),
          processName: gv('processName'),
          itemType,
          description,
          lineDemand: gv('lineDemand'),
          currentQty: gv('currentQty'),
          unitPrice: gv('unitPrice'),
          requiredDate: gv('requiredDate') ? W.normDate(gv('requiredDate')) : '',
          location: gv('location') || gv('dest'),
          detailedLocation: gv('detailedLocation'),
          engineeringApproved: gv('engineeringApproved'),
          engineeringDri: gv('engineeringDri'),
          engineeringApprovedAt: gv('engineeringApprovedAt') ? W.normDate(gv('engineeringApprovedAt')) : '',
          itemCategory,
          budgetList: gv('budgetList'),
          expenseCategory: gv('expenseCategory'),
          customerPaid: gv('customerPaid'),
          bpmConfirmed: gv('bpmConfirmed'),
          withinBudget: gv('withinBudget'),
          budgetNote: gv('budgetNote'),
          ...W.approvalRouteSnapshot(route, W.currentMember()),
          approvalStatus: route.initialStatus
        }, `申领 Excel 导入：${materialName || code} ×${W.fmtQty(qty)}；自动路由 ${route.initialStatus}`);
        result.ok += 1;
      } catch (error) {
        result.fail += 1;
        result.errors.push(`行${lineNo}：${error.message}`);
      }
    });
    return result;
  }

  async function purchaseImport(file) {
    if (!W.canCreatePurchase()) { W.toast('当前身份不能导入申领单，请确认成员名单及审批路由'); return; }
    let rows;
    try {
      if (/\.csv$/i.test(file.name)) rows = W.csvParse(await file.text());
      else {
        const sheets = await W.xlsxRead(new Uint8Array(await file.arrayBuffer()));
        const preferred = sheets['导入模板'];
        const first = Object.keys(sheets)[0];
        rows = preferred || (first ? sheets[first] : null);
      }
    } catch (error) {
      W.toast('文件解析失败：' + error.message);
      return;
    }
    if (!rows || rows.length < 2) { W.toast('导入模板没有数据行，请在“导入模板”工作表第2行开始填写'); return; }
    const headers = rows[0].map(value => String(value || '').trim());
    const mapping = W.guessMapping(headers, 'purchases');
    if (mapping.code == null && mapping.materialName == null) { W.toast('模板缺少“存货编码”或“物料名称”列'); return; }
    if (mapping.qty == null) { W.toast('模板缺少“申领数量”列'); return; }
    if (mapping.date == null) { W.toast('模板缺少“申领日期”列'); return; }
    const result = importPurchaseRows(rows.slice(1), mapping);
    purchaseImportResult(result);
    W.toast(`申领导入完成：成功 ${result.ok}，失败 ${result.fail}`);
  }

  function approvalTag(status) {
    if (status === W.APPROVAL_PENDING) return '<span class="tag yellow">待审核</span>';
    if (status === W.APPROVAL_WAITING) return '<span class="tag blue">待核准</span>';
    if (status === W.APPROVAL_APPROVED) return '<span class="tag green">已核准</span>';
    if (status === W.APPROVAL_REJECTED) return '<span class="tag red">已驳回</span>';
    return `<span class="tag gray">${W.esc(status)}</span>`;
  }
  function canEditPurchase(p) {
    if (W.SYNC.admin) return true;
    if (W.purchaseApprovalStatus(p) === W.APPROVAL_APPROVED) return false;
    return String(p.by || '') === String(W.me().name || '');
  }
  function purchaseActionHtml(p) {
    const status = W.purchaseApprovalStatus(p);
    const actions = [];
    if (canEditPurchase(p)) {
      actions.push(`<button class="btn sm purchase-row-action" data-edit="${p.id}">编辑</button>`);
      actions.push(`<button class="btn sm danger purchase-row-action" data-del="${p.id}">删除</button>`);
    }
    if (status === W.APPROVAL_PENDING && W.canReviewPurchase(p)) {
      actions.push(`<button class="btn sm pri purchase-row-action" data-review="${p.id}">审核</button>`);
      actions.push(`<button class="btn sm danger purchase-row-action" data-reject-review="${p.id}">驳回</button>`);
    }
    if (status === W.APPROVAL_WAITING && W.canApprovePurchase(p)) {
      actions.push(`<button class="btn sm pri purchase-row-action" data-approve="${p.id}">核准</button>`);
      actions.push(`<button class="btn sm danger purchase-row-action" data-reject-approve="${p.id}">驳回</button>`);
    }
    if (status === W.APPROVAL_APPROVED && purchaseRemainingQty(p) > 0 && W.canEditFlow()) {
      actions.push(`<button class="btn sm pri purchase-row-action" data-arrival="${p.id}">登记到货</button>`);
    }
    if (status === W.APPROVAL_REJECTED && String(p.by || '') === String(W.me().name || '')) {
      actions.push(`<button class="btn sm purchase-row-action" data-resubmit="${p.id}">重新提交</button>`);
    }
    return actions.length ? actions.join(' ') : '<span class="muted">—</span>';
  }
  function renderPurchases() {
    const pane = $('#pane-purchases');
    const canCreate = W.canCreatePurchase();
    const month = FILTER.buy;
    const q = FILTER.buyMat || '';
    const items = W.list('purchases')
      .filter(p => W.inScope('purchases', p))
      .filter(p => W.inMonth(p.date, month))
      .filter(p => !q || (W.get('materials', p.mid) || {}).name === q)
      .sort((a, b) => String(b.date).localeCompare(String(a.date)));
    const sc = W.scopeInfo();
    const purchaseColumns = purchaseColumnMeta();
    const purchaseTableWidth = purchaseColumns.reduce((sum, column) => sum + column.width, 0);
    const purchaseColgroup = `<colgroup>${purchaseColumns.map(column => `<col style="width:${column.width}px">`).join('')}</colgroup>`;
    const scopeNote = sc.mineOnly
      ? `<p class="muted" style="margin:-2px 0 8px">当前为<b>${W.esc(sc.role)}</b>身份：仅显示本人提交的申领单（${items.length} 条）。</p>`
      : '';
    const matOpts = W.list('materials').map(mt => `<option value="${W.esc(mt.name)}">${W.esc(mt.name)}</option>`).join('');
    const rows = items.map((p, index) => {
      const mt = W.get('materials', p.mid);
      const status = W.purchaseApprovalStatus(p);
      const delivery = W.purchaseStatus(p);
      const arrived = W.arrivalsOf(p.id).reduce((sum, a) => sum + W.num(a.arrQty), 0);
      const deliveryTag = status !== W.APPROVAL_APPROVED ? '<span class="muted">未进入到货流程</span>'
        : delivery === '已到货' ? '<span class="tag green">已到货</span>'
          : delivery === '部分到货' ? '<span class="tag yellow">部分到货</span>'
            : '<span class="tag gray">已申领未到货</span>';
      const reviewerText = `${p.reviewerName || '未指定'} / ${p.reviewedBy || '—'}`;
      const approverText = `${p.approverName || (p.approvalMode === W.APPROVAL_MODE_REVIEW_ONLY ? '无需核准' : '未指定')} / ${p.approvedBy || '—'}`;
      const oaCells = purchaseOaRowValues(p, mt, index + 1).map((value, columnIndex) => {
        const column = purchaseColumns[columnIndex];
        return `<td class="${purchaseColumnClass(column)}" title="${W.esc(value)}"><div class="purchase-cell">${W.esc(value)}</div></td>`;
      }).join('');
      return `<tr>${oaCells}<td class="purchase-col"><div class="purchase-cell">${W.esc(W.purchaseRequestSource(p))}</div></td><td class="purchase-col purchase-status-cell">${approvalTag(status)}<br>${deliveryTag}</td><td class="purchase-col purchase-num-cell">${W.fmtQty(arrived)}</td><td class="purchase-col"><div class="purchase-cell">${W.esc(reviewerText)}</div></td><td class="purchase-col"><div class="purchase-cell">${W.esc(approverText)}</div></td><td class="purchase-col purchase-action-cell">${purchaseActionHtml(p)}</td></tr>`;
    }).join('') || `<tr><td colspan="${purchaseColumns.length}" class="empty">本月暂无申领记录</td></tr>`;
    const headerCells = purchaseColumns
      .map(column => `<th class="${purchaseColumnClass(column)}">${W.esc(column.label).replace(/\n/g, '<br>')}</th>`).join('');
    pane.innerHTML = `<div class="card purchase-ledger-card"><h3>🛒 申领台账
      <span class="sp">
        <input type="month" id="buyMonth" value="${month === 'all' ? W.thisMonth() : month}">
        <select id="buyMat"><option value="">全部物料</option>${matOpts}</select>
        <button class="btn sm" id="buyAll">全部月份</button>
        <button class="btn sm" id="btnPurchaseExport">⬇ 导出 Excel</button>
        ${canCreate ? '<button class="btn sm" id="btnPurchaseImport">⬆ 导入 Excel</button>' : ''}
        ${canCreate ? '<button class="btn pri sm" id="btnAddPurchase">＋ 申领登记</button>' : ''}
      </span></h3>
      ${scopeNote}
      <p class="muted">申领流程按成员名单自动路由：两级审批为“待审核 → 待核准 → 已核准”，直接核准从“待核准”开始，仅审核在审核通过后完成。进入到货流程后按实际到货、签收和分发继续追溯。</p>
      <div class="twrap purchase-ledger-scroll"><table class="purchase-ledger-table" style="min-width:${purchaseTableWidth}px">${purchaseColgroup}<thead><tr>${headerCells}</tr></thead><tbody>${rows}</tbody></table></div><input type="file" id="purchaseImpFile" accept=".xlsx,.csv" style="display:none"></div>`;
    $('#buyMonth').onchange = e => { FILTER.buy = e.target.value || 'all'; W.renderAll(); };
    $('#buyMat').onchange = e => { FILTER.buyMat = e.target.value; W.renderAll(); };
    $('#buyAll').onclick = () => { FILTER.buy = 'all'; W.renderAll(); };
    $('#btnPurchaseExport').onclick = () => purchaseExport(items, month);
    const purchaseImportButton = $('#btnPurchaseImport');
    const purchaseImportFile = $('#purchaseImpFile');
    if (purchaseImportButton && purchaseImportFile) {
      purchaseImportButton.onclick = () => purchaseImportFile.click();
      purchaseImportFile.onchange = e => {
        const file = e.target.files && e.target.files[0];
        if (file) purchaseImport(file).catch(error => W.toast('申领导入失败：' + error.message));
        e.target.value = '';
      };
    }
    const add = $('#btnAddPurchase');
    if (add) add.onclick = () => purchaseForm(null);
    pane.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => purchaseForm(b.dataset.edit));
    pane.querySelectorAll('[data-del]').forEach(b => b.onclick = () => {
      const p = W.get('purchases', b.dataset.del);
      if (confirm('确认删除该申领记录？')) W.remove('purchases', p.id, `删除申领：${p.date} ${W.fmtQty(p.qty)}`);
    });
    pane.querySelectorAll('[data-review]').forEach(b => b.onclick = () => approvalForm(b.dataset.review, 'review-pass'));
    pane.querySelectorAll('[data-reject-review]').forEach(b => b.onclick = () => approvalForm(b.dataset.rejectReview, 'review-reject'));
    pane.querySelectorAll('[data-approve]').forEach(b => b.onclick = () => approvalForm(b.dataset.approve, 'approve-pass'));
    pane.querySelectorAll('[data-reject-approve]').forEach(b => b.onclick = () => approvalForm(b.dataset.rejectApprove, 'approve-reject'));
    pane.querySelectorAll('[data-arrival]').forEach(b => b.onclick = () => goArrival(b.dataset.arrival));
    pane.querySelectorAll('[data-resubmit]').forEach(b => b.onclick = () => {
      const p = W.get('purchases', b.dataset.resubmit);
      const submitter = W.submitterMemberFor(p);
      const route = W.resolveApprovalRoute(submitter);
      if (!route.ok) { W.toast(route.message); return; }
      W.upsert('purchases', {
        id: p.id,
        ...W.approvalRouteSnapshot(route, submitter),
        approvalStatus: route.initialStatus,
        reviewedBy: '', reviewedAt: '', reviewComment: '',
        approvedBy: '', approvedAt: '', approvalComment: '',
        rejectedBy: '', rejectedAt: '', rejectionReason: ''
      }, `重新提交申领${route.initialStatus === W.APPROVAL_WAITING ? '核准' : '审核'}：${p.id}；提交人 ${p.by}`);
      W.toast(route.initialStatus === W.APPROVAL_WAITING ? '已重新提交核准' : '已重新提交审核');
    });
  }
  function approvalForm(id, action) {
    const p = W.get('purchases', id);
    const mt = W.get('materials', p.mid);
    const review = action.startsWith('review');
    const pass = action.endsWith('pass');
    if (review && !W.canReviewPurchase(p)) { W.toast('该申领单未分配给当前审核人'); return; }
    if (!review && !W.canApprovePurchase(p)) { W.toast('该申领单未分配给当前核准人'); return; }
    const reviewOnly = review && p.approvalMode === W.APPROVAL_MODE_REVIEW_ONLY;
    const title = review ? (pass ? (reviewOnly ? '申领审核（仅审核模式）' : '申领一级审核') : '申领审核驳回') : (pass ? '申领最终核准' : '申领核准驳回');
    const routeText = p.approvalMode === W.APPROVAL_MODE_DIRECT_APPROVE
      ? `直接核准：${p.approverName || '未配置'}`
      : p.approvalMode === W.APPROVAL_MODE_REVIEW_ONLY
        ? `仅审核：${p.reviewerName || '未配置'}`
        : `审核：${p.reviewerName || '未配置'} → 核准：${p.approverName || '未配置'}`;
    openModal(modalShell(title, `
      <p>物料：<b>${W.esc(mt ? mt.name : '?')}</b> · 数量 ${W.fmtQty(p.qty)} · 申请人 ${W.esc(p.by || '')}</p>
      <p class="muted">审批路由快照：${W.esc(routeText)}</p>
      <div class="frow"><label style="flex:1">${pass ? '审批意见（可选）' : '驳回原因 *'}<textarea id="approvalNote" rows="3" style="width:100%"></textarea></label></div>
    `, `<button class="btn" onclick="closeModal()">取消</button><button class="btn ${pass ? 'pri' : 'danger'}" id="approvalSave">${pass ? '确认' : '确认驳回'}</button>`));
    $('#approvalSave').onclick = () => {
      const note = $('#approvalNote').value.trim();
      if (!pass && !note) { W.toast('驳回必须填写原因'); return; }
      const at = W.nowStr();
      if (review && pass) {
        if (reviewOnly) {
          W.upsert('purchases', {
            id, approvalStatus: W.APPROVAL_APPROVED, reviewedBy: W.me().name, reviewedAt: at,
            reviewComment: note, approvedBy: W.me().name, approvedAt: at,
            approvalComment: note || '仅审核流程完成，无需核准', rejectedBy: '', rejectedAt: '', rejectionReason: ''
          }, `申领仅审核流程通过并完成：${p.id}；审核人 ${W.me().name}`);
        } else {
          W.upsert('purchases', { id, approvalStatus: W.APPROVAL_WAITING, reviewedBy: W.me().name, reviewedAt: at, reviewComment: note, rejectedBy: '', rejectedAt: '', rejectionReason: '' }, `申领一级审核通过：${p.id}；审核人 ${W.me().name}`);
        }
      } else if (review && !pass) {
        W.upsert('purchases', { id, approvalStatus: W.APPROVAL_REJECTED, reviewedBy: W.me().name, reviewedAt: at, reviewComment: note, rejectedBy: W.me().name, rejectedAt: at, rejectionReason: note }, `申领审核驳回：${p.id}；审核人 ${W.me().name}；原因 ${note}`);
      } else if (!review && pass) {
        W.upsert('purchases', { id, approvalStatus: W.APPROVAL_APPROVED, approvedBy: W.me().name, approvedAt: at, approvalComment: note, rejectedBy: '', rejectedAt: '', rejectionReason: '' }, `申领最终核准：${p.id}；核准人 ${W.me().name}${p.approvalMode === W.APPROVAL_MODE_DIRECT_APPROVE ? '；直接核准' : ''}`);
      } else {
        W.upsert('purchases', { id, approvalStatus: W.APPROVAL_REJECTED, rejectedBy: W.me().name, rejectedAt: at, rejectionReason: note, approvalComment: note }, `申领核准驳回：${p.id}；核准人 ${W.me().name}；原因 ${note}`);
      }
      closeModal();
      W.toast(pass ? '审批完成' : '已驳回');
    };
  }
  function purchaseForm(id) {
    if (id) W.markEdit('purchases', id);
    const p = id ? W.get('purchases', id) : { mid: '', qty: '', date: W.today(), purpose: '', dest: '', dept: '', requestSource: 'OA请购' };
    if (id && !canEditPurchase(p)) { W.toast('该申领单当前状态不允许修改'); return; }
    const submitter = id ? W.submitterMemberFor(p) : W.currentMember();
    const route = W.resolveApprovalRoute(submitter);
    const routeText = route.ok
      ? route.mode === W.APPROVAL_MODE_DIRECT_APPROVE
        ? `直接核准：${route.approver.name}（跳过审核）`
        : route.mode === W.APPROVAL_MODE_REVIEW_ONLY
          ? `仅审核：${route.reviewer.name}（审核通过后完成）`
          : `审核：${route.reviewer.name} → 核准：${route.approver.name}`
      : route.message;
    const opts = W.list('materials').map(mt => `<option value="${mt.id}" ${p.mid === mt.id ? 'selected' : ''}>${W.esc(mt.name)}${mt.spec ? '（' + W.esc(mt.spec) + '）' : ''}</option>`).join('');
    if (!W.list('materials').length) { W.toast('请先在「物料档案」新增物料'); return; }
    openModal(modalShell(id ? '✏️ 编辑申领' : '🛒 申领登记', `
      <div class="frow">
        <label>物料 *<select id="fMid">${opts}</select></label>
        <label>申领数量 *<input id="fQty" type="number" min="0" step="any" value="${W.esc(p.qty)}"></label>
        <label>申领日期 *<input id="fDate" type="date" value="${W.esc(p.date)}"></label>
      </div>
      <div class="frow">
        <label style="flex:1">用途说明<input id="fPurpose" style="width:100%" value="${W.esc(p.purpose)}"></label>
        <label style="flex:1">使用去向<input id="fDest" style="width:100%" value="${W.esc(p.dest)}"></label>
        <label style="flex:1">申请部门<select id="fDept" style="width:100%"><option value="">— 未选择 —</option>${W.DEPTS.map(d0 => `<option ${p.dept === d0 ? 'selected' : ''}>${W.esc(d0)}</option>`).join('')}</select></label>
        <label style="flex:1">请购来源<select id="fSource">${['OA请购','行政请购','其他'].map(source => `<option ${W.purchaseRequestSource(p) === source ? 'selected' : ''}>${source}</option>`).join('')}</select></label>
      </div>
      <div class="note ${route.ok ? 'info' : 'err'}"><b>${route.ok ? '自动审批路由' : '无法提交'}</b><br>${W.esc(routeText)}${route.ok ? `<br><span class="muted">提交后按当前成员名单固化到申领单，后续调整名单不影响在途单据。</span>` : `<br><span class="muted">请管理员 ${W.esc(W.systemAdminLabel())} 在成员名单中补充本人的审核人 / 核准人配置。</span>`}</div>
      <p class="muted">${route.ok && route.initialStatus === W.APPROVAL_WAITING ? '保存后直接进入「待核准」；核准完成后才能登记到货。' : '保存后申领单进入「待审核」；审核通过后按审批模式进入「待核准」或直接完成，已核准后才能登记到货。'}</p>
    `, `<button class="btn" onclick="closeModal()">取消</button><button class="btn pri" id="fSave">${route.ok && route.initialStatus === W.APPROVAL_WAITING ? '保存并提交核准' : '保存并提交审核'}</button>`));
    $('#fSave').onclick = () => {
      if (!route.ok) { W.toast(route.message); return; }
      const qty = W.num($('#fQty').value);
      if (qty <= 0) { W.toast('申领数量必须大于 0'); return; }
      const mid = $('#fMid').value, mt = W.get('materials', mid);
      W.upsert('purchases', {
        id, mid, qty, date: $('#fDate').value || W.today(), purpose: $('#fPurpose').value.trim(), dest: $('#fDest').value.trim(), dept: $('#fDept').value, requestSource: $('#fSource').value,
        ...W.approvalRouteSnapshot(route, submitter),
        approvalStatus: route.initialStatus, reviewedBy: '', reviewedAt: '', reviewComment: '',
        approvedBy: '', approvedAt: '', approvalComment: '', rejectedBy: '', rejectedAt: '', rejectionReason: ''
      }, `申领 ${mt ? mt.name : ''} ×${W.fmtQty(qty)}`);
      closeModal(); W.toast(route.initialStatus === W.APPROVAL_WAITING ? '已提交核准' : '已提交审核');
    };
  }

  /* ================= 到货 & 签收 ================= */
  function purchaseRemainingQty(purchase) {
    const arrived = W.arrivalsOf(purchase.id).reduce((sum, arrival) => sum + W.num(arrival.arrQty), 0);
    return Math.max(0, W.num(purchase.qty) - arrived);
  }

  function renderArrivals() {
    const pane = $('#pane-arrivals');
    const editable = W.canEditFlow();
    const month = FILTER.arr || 'all';
    const pendingPurchases = editable
      ? W.list('purchases')
        .filter(purchase => W.inScope('purchases', purchase))
        .filter(purchase => W.purchaseApprovalStatus(purchase) === W.APPROVAL_APPROVED)
        .filter(purchase => purchaseRemainingQty(purchase) > 0)
        .sort((a, b) => String(b.approvedAt || b.date).localeCompare(String(a.approvedAt || a.date)))
      : [];
    const pendingRows = pendingPurchases.map(purchase => {
      const material = W.get('materials', purchase.mid);
      const arrived = W.arrivalsOf(purchase.id).reduce((sum, arrival) => sum + W.num(arrival.arrQty), 0);
      return `<tr><td>${W.esc(purchase.date)}</td><td><b>${W.esc(material ? material.name : '（已删物料）')}</b>${material && material.spec ? '<br><span class="muted">' + W.esc(material.spec) + '</span>' : ''}</td><td class="num-cell">${W.fmtQty(purchase.qty)}</td><td class="num-cell">${W.fmtQty(arrived)}</td><td class="num-cell"><b>${W.fmtQty(purchaseRemainingQty(purchase))}</b></td><td>${W.esc(purchase.by || '—')}</td><td>${W.esc(purchase.approvedBy || purchase.approverName || '—')}</td><td><button class="btn sm pri" data-arrival-link="${purchase.id}">登记到货</button></td></tr>`;
    }).join('') || '<tr><td colspan="8" class="empty">暂无已核准待关联到货的申领单</td></tr>';
    const items = W.list('arrivals').filter(a => W.inMonth(a.arrDate, month)).sort((a, b) => String(b.arrDate).localeCompare(String(a.arrDate)));
    const rows = items.map(a => {
      const mt = W.get('materials', a.mid);
      const p = W.get('purchases', a.pid);
      const rc = W.receiptOf(a.id);
      const disp = W.dispatchedOf(a.id);
      const recvTag = rc ? `<span class="tag green">已签收 ${W.fmtQty(rc.recvQty)}</span>` : `<span class="tag yellow">待签收</span>`;
      return `<tr><td>${W.esc(a.arrDate)}</td><td>${W.esc(mt ? mt.name : '（已删物料）')}</td><td>${p ? W.esc(p.date) + ' 申领' + W.fmtQty(p.qty) : '—'}</td><td>${W.fmtQty(a.arrQty)}</td><td>${W.fmtQty(disp)}</td><td>${recvTag}<br><span class="muted">${rc ? W.esc(rc.recvBy) + ' ' + W.esc(rc.recvAt || '') : ''}</span></td>
        <td>${editable && !rc ? `<button class="btn sm pri" data-recv="${a.id}">签收</button> ` : ''}${editable ? `<button class="btn sm" data-edit="${a.id}">编辑</button> <button class="btn sm danger" data-del="${a.id}">删除</button>` : ''}</td></tr>`;
    }).join('') || `<tr><td colspan="7" class="empty">暂无到货记录</td></tr>`;
    pane.innerHTML = `<div class="card"><h3>📌 已核准待关联到货 <span class="sp muted">审批完成后自动带出，点击后自动关联申领单与物料</span></h3>
      <div class="twrap" style="max-height:34vh"><table><thead><tr><th>申领日期</th><th>物料</th><th>申领数量</th><th>已到货</th><th>剩余可到货</th><th>申请人</th><th>核准人</th><th>操作</th></tr></thead><tbody>${pendingRows}</tbody></table></div></div>
      <div class="card"><h3>🚚 到货登记 & 实收签收
      <span class="sp">
        <input type="month" id="arrMonth" value="${month === 'all' ? W.thisMonth() : month}">
        <button class="btn sm" id="arrAll">全部月份</button>
        ${editable ? '<button class="btn pri sm" id="btnAddArrival">＋ 到货登记</button>' : ''}
      </span></h3>
      <div class="twrap"><table><thead><tr><th>到货日期</th><th>物料</th><th>关联申领</th><th>到货数量</th><th>已分发</th><th>签收状态</th><th>操作</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
    $('#arrMonth').onchange = e => { FILTER.arr = e.target.value || 'all'; W.renderAll(); };
    $('#arrAll').onclick = () => { FILTER.arr = 'all'; W.renderAll(); };
    const add = $('#btnAddArrival');
    if (add) add.onclick = () => arrivalForm(null);
    pane.querySelectorAll('[data-arrival-link]').forEach(button => button.onclick = () => arrivalForm(null, button.dataset.arrivalLink));
    pane.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => arrivalForm(b.dataset.edit));
    pane.querySelectorAll('[data-del]').forEach(b => b.onclick = () => {
      if (confirm('确认删除该到货记录？')) W.remove('arrivals', b.dataset.del, '删除到货记录');
    });
    pane.querySelectorAll('[data-recv]').forEach(b => b.onclick = () => recvForm(b.dataset.recv));
  }
  function arrivalForm(id, presetPid = '') {
    if (id) W.markEdit('arrivals', id);
    const a = id ? W.get('arrivals', id) : { pid: presetPid, arrQty: '', arrDate: W.today() };
    const purchases = W.list('purchases')
      .filter(p => W.purchaseApprovalStatus(p) === W.APPROVAL_APPROVED)
      .filter(p => id || p.id === presetPid || purchaseRemainingQty(p) > 0)
      .sort((x, y) => String(y.date).localeCompare(String(x.date)));
    if (!purchases.length) { W.toast('没有已完成审核和核准的申领单，不能登记到货'); return; }
    const selectedPid = a.pid || (purchases[0] && purchases[0].id) || '';
    const selectedPurchase = W.get('purchases', selectedPid);
    const selectedRemaining = selectedPurchase ? purchaseRemainingQty(selectedPurchase) : 0;
    const suggestedQty = a.arrQty || (presetPid ? selectedRemaining : '');
    const opts = purchases.map(p => {
      const mt = W.get('materials', p.mid);
      const arrived = W.arrivalsOf(p.id).reduce((sum, arrival) => sum + W.num(arrival.arrQty), 0);
      return `<option value="${p.id}" ${selectedPid === p.id ? 'selected' : ''}>${W.esc(p.date)} ${W.esc(mt ? mt.name : '?')} · 申领${W.fmtQty(p.qty)} · 已到${W.fmtQty(arrived)} · 剩余${W.fmtQty(purchaseRemainingQty(p))}</option>`;
    }).join('');
    openModal(modalShell(id ? '✏️ 编辑到货' : '🚚 到货登记', `
      <div class="frow">
        <label>关联申领单 *<select id="fPid">${opts}</select></label>
        <label>实际到货数量 *<input id="fArrQty" type="number" min="0" step="any" value="${W.esc(suggestedQty)}"></label>
        <label>到货日期 *<input id="fArrDate" type="date" value="${W.esc(a.arrDate)}"></label>
      </div>
      <div class="note info" id="arrivalLinkInfo"></div>
      <p class="muted">一单申领可分批多次到货；到货后由审核员或核准员在本页「签收」。</p>
    `, `<button class="btn" onclick="closeModal()">取消</button><button class="btn pri" id="fSave">保存</button>`));
    function refreshArrivalLink() {
      const pid = $('#fPid').value;
      const purchase = W.get('purchases', pid);
      const material = purchase ? W.get('materials', purchase.mid) : null;
      const currentArrived = purchase ? W.arrivalsOf(purchase.id).reduce((sum, arrival) => sum + W.num(arrival.arrQty), 0) : 0;
      const editingQty = id && purchase && a.pid === purchase.id ? W.num(a.arrQty) : 0;
      const remaining = purchase ? Math.max(0, W.num(purchase.qty) - currentArrived + editingQty) : 0;
      $('#arrivalLinkInfo').innerHTML = purchase
        ? `已自动关联：<b>${W.esc(material ? material.name : '（已删物料）')}</b> · 申领数量 ${W.fmtQty(purchase.qty)} · 已到货 ${W.fmtQty(currentArrived)} · 可登记 ${W.fmtQty(remaining)}`
        : '未找到关联申领单';
      const qtyInput = $('#fArrQty');
      qtyInput.max = String(remaining);
      if (!id) qtyInput.value = String(remaining);
    }
    $('#fPid').onchange = refreshArrivalLink;
    refreshArrivalLink();
    $('#fSave').onclick = () => {
      const qty = W.num($('#fArrQty').value);
      if (qty <= 0) { W.toast('到货数量必须大于 0'); return; }
      const pid = $('#fPid').value, p = W.get('purchases', pid);
      W.upsert('arrivals', { id, pid, mid: p ? p.mid : '', arrQty: qty, arrDate: $('#fArrDate').value || W.today() }, `到货 ${W.fmtQty(qty)}`);
      closeModal(); W.toast('已保存');
    };
  }
  function recvForm(aid) {
    const a = W.get('arrivals', aid);
    const mt = W.get('materials', a.mid);
    openModal(modalShell('✍️ 实收签收', `
      <p style="margin-bottom:10px">物料：<b>${W.esc(mt ? mt.name : '?')}</b> · 到货数量 <b>${W.fmtQty(a.arrQty)}</b> · 到货日期 ${W.esc(a.arrDate)}</p>
      <div class="frow">
        <label>实收数量 *<input id="fRecvQty" type="number" min="0" step="any" value="${W.esc(a.arrQty)}"></label>
        <label>签收人<input id="fRecvBy" value="${W.esc(W.me().name || '')}" readonly></label>
      </div>
    `, `<button class="btn" onclick="closeModal()">取消</button><button class="btn pri" id="fSave">确认签收</button>`));
    $('#fSave').onclick = () => {
      const qty = W.num($('#fRecvQty').value);
      if (qty <= 0) { W.toast('实收数量必须大于 0'); return; }
      W.upsert('receipts', { aid, recvQty: qty, recvBy: W.me().name || '—', recvAt: W.nowStr() }, `签收 ${W.fmtQty(qty)}`);
      closeModal(); W.toast('签收完成');
    };
  }

  /* ================= 分发 & 领用确认 ================= */
  function renderDispatch() {
    const pane = $('#pane-dispatch');
    const editable = W.canEditFlow();
    const month = FILTER.dsp || 'all';
    const region = FILTER.dspRegion || '';
    let items = W.list('dispatches').filter(d => W.inScope('dispatches', d)).filter(d => W.inMonth(d.at, month));
    if (region) items = items.filter(d => d.region === region);
    items.sort((a, b) => String(b.at).localeCompare(String(a.at)));
    const rows = items.map(d => {
      const mt = W.get('materials', d.mid);
      const s = W.signoffOf(d.id);
      const sigTag = s ? `<span class="tag green">已确认</span>` : `<span class="tag red">待领用确认</span>`;
      const canOp = W.canOperateRec('dispatches', d);
      const canSign = !s && W.canConfirmDispatch(d);
      return `<tr><td>${W.esc(d.at)}</td><td>${W.esc(mt ? mt.name : '（已删物料）')}</td><td>${W.esc(W.REGION_LABEL[d.region] || d.region)}</td><td>${W.esc(d.claimantName || '—')}</td><td>${W.esc(d.subordinateLeaderName || d.dept || '—')}</td><td>${W.fmtQty(d.qty)}</td><td>${W.esc(d.byWho)}</td><td>${sigTag}<br><span class="muted">${s ? W.esc(s.signer) + ' ' + W.esc(s.sigAt || '') : ''}</span></td>
        <td>${canSign ? `<button class="btn sm pri" data-sign="${d.id}">签字确认</button> ` : ''}${s && s.sigData ? `<button class="btn sm" data-view="${d.id}">查看签名</button>` : ''}${editable ? (canOp ? `<button class="btn sm" data-edit="${d.id}">编辑</button> <button class="btn sm danger" data-del="${d.id}">删除</button>` : '<span class="muted">他人单据</span>') : ''}</td></tr>`;
    }).join('') || `<tr><td colspan="9" class="empty">暂无分发记录</td></tr>`;
    pane.innerHTML = `<div class="card"><h3>📤 物料分发 & 领用签字确认
      <span class="sp">
        <input type="month" id="dspMonth" value="${month === 'all' ? W.thisMonth() : month}">
        <select id="dspRegion"><option value="">全部区域</option>${W.REGIONS.map(r => `<option value="${r}" ${region === r ? 'selected' : ''}>${W.REGION_LABEL[r]}</option>`).join('')}</select>
        <button class="btn sm" id="dspAll">全部月份</button>
        ${editable ? '<button class="btn pri sm" id="btnAddDispatch">＋ 物料下发</button>' : ''}
      </span></h3>
      <p class="muted">区域领用人可确认本区域分配单；隶属区域领用人只能确认分配给本人的单据。</p>
      <div class="twrap"><table><thead><tr><th>分发时间</th><th>物料</th><th>分发区域</th><th>领用人</th><th>隶属区域负责人</th><th>分发数量</th><th>分发人</th><th>领用确认</th><th>操作</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
    $('#dspMonth').onchange = e => { FILTER.dsp = e.target.value || 'all'; W.renderAll(); };
    $('#dspRegion').onchange = e => { FILTER.dspRegion = e.target.value; W.renderAll(); };
    $('#dspAll').onclick = () => { FILTER.dsp = 'all'; FILTER.dspRegion = ''; W.renderAll(); };
    const add = $('#btnAddDispatch');
    if (add) add.onclick = () => dispatchForm(null);
    pane.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => dispatchForm(b.dataset.edit));
    pane.querySelectorAll('[data-del]').forEach(b => b.onclick = () => {
      if (confirm('确认删除该分发记录？')) W.remove('dispatches', b.dataset.del, '删除分发记录');
    });
    pane.querySelectorAll('[data-sign]').forEach(b => b.onclick = () => signForm(b.dataset.sign));
    pane.querySelectorAll('[data-view]').forEach(b => b.onclick = () => {
      const s = W.signoffOf(b.dataset.view);
      openModal(modalShell('🖼️ 领用签名', `<p>领用人：<b>${W.esc(s.signer)}</b> · ${W.esc(s.sigAt || '')}</p>${s.sigData ? `<img src="${s.sigData}" alt="签名" style="max-width:100%;border:1px solid var(--line);border-radius:8px">` : '<p class="muted">（姓名确认，无手写笔迹）</p>'}`));
    });
  }
  function claimantOptions(region, selectedId) {
    const members = W.membersForRegion(region);
    return members.map(member => `<option value="${member.id}" ${selectedId === member.id ? 'selected' : ''}>${W.esc(member.name)}（${W.esc(member.role)}）</option>`).join('');
  }
  function dispatchForm(id) {
    if (id) W.markEdit('dispatches', id);
    const d = id ? W.get('dispatches', id) : { aid: '', region: W.REGIONS[0] || '', dept: '', subordinateLeaderName: '', qty: '', at: W.nowStr(), claimantId: '', claimantName: '' };
    const arrivals = W.list('arrivals')
      .filter(a => W.receiptOf(a.id))
      .sort((x, y) => String(y.arrDate).localeCompare(String(x.arrDate)));
    if (!arrivals.length) { W.toast('请先完成到货批次的实收签收，再进行分发'); return; }
    if (!W.membersForRegion(d.region).length) { W.toast('当前区域没有可用的区域领用人，请先由系统管理员维护成员名单'); return; }
    const opts = arrivals.map(a => {
      const mt = W.get('materials', a.mid);
      const disp = W.dispatchedOf(a.id);
      const rc = W.receiptOf(a.id);
      const avail = W.num(rc.recvQty) - disp;
      return `<option value="${a.id}" ${d.aid === a.id ? 'selected' : ''}>${W.esc(a.arrDate)} ${W.esc(mt ? mt.name : '?')}（已签收 ${W.fmtQty(rc.recvQty)}，可发 ${W.fmtQty(avail)}）</option>`;
    }).join('');
    openModal(modalShell(id ? '✏️ 编辑分发' : '📤 物料下发', `
      <div class="frow">
        <label>选择到货批次 *<select id="fAid">${opts}</select></label>
        <label>分发区域 *<select id="fRegion">${W.REGIONS.map(r => `<option value="${r}" ${d.region === r ? 'selected' : ''}>${W.REGION_LABEL[r]}</option>`).join('')}</select></label>
        <label>领用人 *<select id="fClaimant">${claimantOptions(d.region, d.claimantId)}</select></label>
        <label>隶属区域负责人<input id="fSubordinateLeader" value="${W.esc(d.subordinateLeaderName || '')}" placeholder="可手动输入姓名"></label>
        <label>分发数量 *<input id="fQty" type="number" min="0" step="any" value="${W.esc(d.qty)}"></label>
        <label>分发时间<input id="fAt" value="${W.esc(d.at)}"></label>
      </div>
      <p class="muted">下发后由指定领用人确认；区域领用人可确认本区域单据，隶属区域领用人只能确认分配给自己的单据。</p>
    `, `<button class="btn" onclick="closeModal()">取消</button><button class="btn pri" id="fSave">保存</button>`));
    $('#fRegion').onchange = e => {
      const options = claimantOptions(e.target.value, '');
      $('#fClaimant').innerHTML = options;
      if (!options) W.toast('该区域尚未配置区域领用人');
    };
    $('#fSave').onclick = () => {
      const qty = W.num($('#fQty').value);
      if (qty <= 0) { W.toast('分发数量必须大于 0'); return; }
      const aid = $('#fAid').value, a = W.get('arrivals', aid);
      const region = $('#fRegion').value;
      const claimant = W.memberById($('#fClaimant').value);
      if (!claimant) { W.toast('请选择领用人'); return; }
      W.upsert('dispatches', {
        id, aid, mid: a ? a.mid : '', region, dept: claimant.dept || '', subordinateLeaderName: $('#fSubordinateLeader').value.trim(), qty,
        at: $('#fAt').value || W.nowStr(), byWho: W.me().name || '—',
        claimantId: claimant.id, claimantName: claimant.name
      }, `下发 ${W.REGION_LABEL[region]} ${claimant.name} ${W.fmtQty(qty)}`);
      closeModal(); W.toast('已下发，等待领用人签字确认');
    };
  }

  /* ---------------- 签名板 ---------------- */
  function signForm(did) {
    const d = W.get('dispatches', did);
    const mt = W.get('materials', d.mid);
    let ctx = null;
    openModal(modalShell('✍️ 领用签字确认', `
      <p style="margin-bottom:10px">物料：<b>${W.esc(mt ? mt.name : '?')}</b> · 数量 <b>${W.fmtQty(d.qty)}</b> → ${W.esc(W.REGION_LABEL[d.region] || d.region)}<br><span class="muted">领用人 ${W.esc(d.claimantName || '未指定')} · 隶属区域负责人 ${W.esc(d.subordinateLeaderName || '未填写')} · 分发时间 ${W.esc(d.at)} · 分发人 ${W.esc(d.byWho)}</span></p>
      <canvas id="sigCanvas" class="sigpad" width="560" height="200" style="width:100%"></canvas>
      <div class="frow" style="margin-top:8px">
        <label>领用人姓名 *<input id="fSigner" value="${W.esc(W.me().name || '')}"></label>
        <button class="btn sm" id="sigClear">清除重签</button>
        <span class="muted" id="sigHint">在上方白框内手写签名</span>
      </div>
    `, `<button class="btn" onclick="closeModal()">取消</button><button class="btn pri" id="fSave">确认领用</button>`));
    try {
      const canvas = $('#sigCanvas');
      ctx = canvas.getContext('2d');
      ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#111827';
      let drawing = false, lx = 0, ly = 0, drawn = false;
      const pos = e => {
        const r = canvas.getBoundingClientRect();
        const src = e.touches && e.touches[0] ? e.touches[0] : e;
        return { x: (src.clientX - r.left) * canvas.width / r.width, y: (src.clientY - r.top) * canvas.height / r.height };
      };
      const down = e => { drawing = true; const p = pos(e); lx = p.x; ly = p.y; e.preventDefault(); };
      const move = e => {
        if (!drawing) return;
        const p = pos(e); drawn = true;
        ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(p.x, p.y); ctx.stroke();
        lx = p.x; ly = p.y; e.preventDefault();
      };
      const up = () => { drawing = false; };
      canvas.addEventListener('mousedown', down); canvas.addEventListener('mousemove', move); canvas.addEventListener('mouseup', up); canvas.addEventListener('mouseleave', up);
      canvas.addEventListener('touchstart', down, { passive: false }); canvas.addEventListener('touchmove', move, { passive: false }); canvas.addEventListener('touchend', up);
      $('#sigClear').onclick = () => { ctx.clearRect(0, 0, canvas.width, canvas.height); drawn = false; };
      $('#fSave').onclick = () => {
        const signer = $('#fSigner').value.trim();
        if (!signer) { W.toast('请填写领用人姓名'); return; }
        const sigData = drawn ? canvas.toDataURL('image/png') : '';
        W.upsert('signoffs', { did, signer, sigData, sigAt: W.nowStr() }, `领用确认 ${W.REGION_LABEL[d.region] || d.region}：${signer}`);
        closeModal(); W.toast('领用确认完成 ✓');
      };
    } catch (e) {
      // Canvas 不可用 → 退化为姓名确认
      const cv = $('#sigCanvas'); if (cv) cv.style.display = 'none';
      $('#sigClear').style.display = 'none';
      $('#sigHint').textContent = '（当前环境不支持手写，将以姓名确认留档）';
      $('#fSave').onclick = () => {
        const signer = $('#fSigner').value.trim();
        if (!signer) { W.toast('请填写领用人姓名'); return; }
        W.upsert('signoffs', { did, signer, sigData: '', sigAt: W.nowStr() }, `领用确认（姓名）：${signer}`);
        closeModal(); W.toast('领用确认完成 ✓');
      };
    }
  }

  /* ================= 查询 / 操作日志 ================= */
  function renderQuery() {
    const pane = $('#pane-query');
    const month = FILTER.qry, mat = FILTER.qMat, region = FILTER.qRegion, dept = FILTER.qDept || '', st = FILTER.qStatus;
    const matNames = [...new Set(W.list('materials').map(m => m.name))];
    const sec = FILTER.qTab || 'docs';
    const docsRows = [];
    if (st === '' || st === 'all' || ['待审核', '待核准', '已驳回', '待到货'].includes(st)) {
      for (const p of W.list('purchases').filter(record => W.inScope('purchases', record))) {
        const s = W.purchaseStatus(p);
        const deliveryPending = ['已申领未到货', '部分到货'].includes(s);
        const matchesStatus = !st || st === 'all' || s === st || (st === '待到货' && deliveryPending);
        if (!matchesStatus) continue;
        if (!W.inMonth(p.date, month)) continue;
        const mt = W.get('materials', p.mid);
        if (mat && (!mt || mt.name !== mat)) continue;
        if (dept && (p.dept || '') !== dept) continue;
        docsRows.push({ t: '申领', date: p.date, mt: mt ? mt.name : '?', qty: W.fmtQty(p.qty) + '（' + s + '）', region: '—', by: p.by, ref: p });
      }
    }
    if (st === '' || st === '待签收' || st === 'all') {
      for (const a of W.list('arrivals')) {
        const rc = W.receiptOf(a.id);
        const ps = rc ? null : '待签收';
        if (st && st !== 'all' && ps !== st) continue;
        if (st === 'all' && !ps) continue;
        if (!W.inMonth(a.arrDate, month)) continue;
        const mt = W.get('materials', a.mid);
        if (mat && (!mt || mt.name !== mat)) continue;
        docsRows.push({ t: '到货', date: a.arrDate, mt: mt ? mt.name : '?', qty: W.fmtQty(a.arrQty) + (rc ? '（已签收' + W.fmtQty(rc.recvQty) + '）' : '（待签收）'), region: '—', by: rc ? rc.recvBy : a.by, ref: a });
      }
    }
    if (st === '' || st === '待领用确认' || st === 'all') {
      for (const d of W.list('dispatches').filter(record => W.inScope('dispatches', record))) {
        const s = W.signoffOf(d.id);
        const ps = s ? null : '待领用确认';
        if (st && st !== 'all' && ps !== st) continue;
        if (st === 'all' && !ps) continue;
        if (!W.inMonth(d.at, month)) continue;
        const mt = W.get('materials', d.mid);
        if (mat && (!mt || mt.name !== mat)) continue;
        if (region && d.region !== region) continue;
        if (dept && (d.dept || '') !== dept) continue;
        docsRows.push({ t: '分发', date: d.at, mt: mt ? mt.name : '?', qty: W.fmtQty(d.qty) + (s ? '（已确认）' : '（待确认）'), region: W.REGION_LABEL[d.region] || d.region, by: s ? s.signer : (d.byWho || ''), ref: d });
      }
    }
    docsRows.sort((a, b) => String(b.date).localeCompare(String(a.date)));
    const docHtml = docsRows.slice(0, 400).map(r => `<tr><td><span class="tag ${r.t === '申领' ? 'blue' : r.t === '到货' ? 'yellow' : 'green'}">${r.t}</span></td><td>${W.esc(r.date)}</td><td>${W.esc(r.mt)}</td><td>${r.qty}</td><td>${r.region}</td><td>${W.esc(r.by)}</td></tr>`).join('') || `<tr><td colspan="6" class="empty">无匹配记录</td></tr>`;
    const logs = W.list('logs').sort((a, b) => b.ts - a.ts).slice(0, 200).map(l =>
      `<div class="logline"><span class="t">${W.esc(new Date(l.ts).toLocaleString('zh-CN'))}</span><b>${W.esc(l.by)}</b> ${W.esc(l.action)} <span class="tag gray">${W.esc(l.entity)}</span> ${W.esc(l.detail)}</div>`).join('') || '<p class="empty">暂无操作日志</p>';
    pane.innerHTML = `<div class="card"><h3>🔍 全部记录查询
      <span class="sp">
        <input type="month" id="qMonth" value="${month === 'all' ? W.thisMonth() : month}">
        <select id="qMat"><option value="">全部物料</option>${matNames.map(n => `<option ${mat === n ? 'selected' : ''}>${W.esc(n)}</option>`).join('')}</select>
        <select id="qRegion"><option value="">全部区域</option>${W.REGIONS.map(r => `<option value="${r}" ${region === r ? 'selected' : ''}>${W.REGION_LABEL[r]}</option>`).join('')}</select>
        <select id="qDept"><option value="">全部部门</option>${W.DEPTS.map(d0 => `<option ${dept === d0 ? 'selected' : ''}>${W.esc(d0)}</option>`).join('')}</select>
        <select id="qStatus"><option value="">全部状态</option>${['待审核', '待核准', '待到货', '待签收', '待领用确认', '已驳回'].map(s => `<option ${st === s ? 'selected' : ''}>${s}</option>`).join('')}</select>
        <button class="btn sm" id="qAll">全部月份</button>
      </span></h3>
      <div class="twrap"><table><thead><tr><th>类型</th><th>日期</th><th>物料</th><th>数量/状态</th><th>区域</th><th>经手人</th></tr></thead><tbody>${docHtml}</tbody></table></div></div>
      <div class="card"><h3>📜 操作日志 <span class="sp muted">操作人 · 操作时间 · 动作（近 200 条）</span></h3>${logs}</div>`;
    $('#qMonth').onchange = e => { FILTER.qry = e.target.value || 'all'; W.renderAll(); };
    $('#qMat').onchange = e => { FILTER.qMat = e.target.value; W.renderAll(); };
    $('#qRegion').onchange = e => { FILTER.qRegion = e.target.value; W.renderAll(); };
    $('#qDept').onchange = e => { FILTER.qDept = e.target.value; W.renderAll(); };
    $('#qStatus').onchange = e => { FILTER.qStatus = e.target.value; W.renderAll(); };
    $('#qAll').onclick = () => { FILTER.qry = 'all'; W.renderAll(); };
  }

  /* ================= 设置 · 成员 · 导入导出 ================= */
  function renderSettings() {
    const pane = $('#pane-settings');
    const m = W.me();
    const canManageMaterials = W.canManageMaterials();
    const canManageMembers = W.canManageMembers();
    const isAdmin = canManageMaterials;
    const members = W.list('members').sort((a, b) => String(a.name).localeCompare(String(b.name)));

    /* ---- 云端共享：状态条 / 团队概览 / 分享网址（与送测 cloudStatus、cloudTeam、cloudShare 同结构） ---- */
    function connStyle() {
      const online = W.SYNC.mode === 'server';
      return 'margin-top:10px;padding:10px 12px;border-radius:8px;font-size:13px;line-height:1.75;border:1px solid ' +
        (online ? '#bbf7d0' : '#e5e7eb') + ';background:' + (online ? '#f0fdf4' : '#f9fafb');
    }
    function cloudStatusHtml() {
      const S = W.SYNC, sc = W.scopeInfo();
      if (S.mode !== 'server') return '本地模式：数据只存在本机，不与他人同步。填好服务地址后点「保存并连接」即可共享。';
      const c = W.syncCounts(W._getState().data);
      const at = S.lastSyncAt ? new Date(S.lastSyncAt).toLocaleTimeString() : '—';
      /* UI 优化（2026-11-17）：状态条改为「主行 + chips 明细 + 分级提示框」结构，
         替代原先多色文字堆叠；口令未认可只保留一条警示框，不再黄/红重复。 */
      const badge = sc.admin
        ? '<span class="badge">身份：' + W.esc(W.scopeLabel()) + '</span>'
        : '<span class="badge warnbg">身份：' + W.esc(W.scopeLabel()) + '</span>';
      const chips = '<span class="chips">' +
        ['物料 ' + c.materials, '申领 ' + c.purchases, '到货 ' + c.arrivals, '收货 ' + (c.receipts || 0), '分发 ' + c.dispatches, '签字 ' + c.signoffs, '成员 ' + c.members, '日志 ' + (c.logs || 0)]
          .map(x => '<span class="chip">' + x + '</span>').join('') + '</span>';
      let t = '<div>✅ 已连接共享　' + badge + '　最近同步：' + at + '　在线：' + W.esc((S.online || []).join('、') || '—') + '</div>' +
        '<div style="margin-top:6px">' + chips + '</div>';
      const pend = (typeof W.pendingOps === 'function' ? W.pendingOps() : 0);
      t += pend
        ? '<div class="note warn" style="margin-top:8px">⏳ 还有 ' + pend + ' 条改动在排队上传（' + (S.pushing ? '正在发送…' : '稍后自动重试') + '），期间可以继续录入，不会丢。</div>'
        : '<div class="muted" style="margin-top:6px">✔ 所有改动已同步　·　并发录入按「每条记录 + 每个字段」独立合并：改同一单的不同字段两边都保留，改同一字段以更晚提交为准。</div>';
      if (!sc.admin) {
        if (String(W.cloudCfg.adminKey || '').trim()) {
          /* 口令未认可：合并为一条警示框（此前黄/红/灰三行重复表达同一问题） */
          t += '<div class="note warn"><div><b>⚠ 已填管理员口令但服务端未认可</b> — 当前按非管理员处理：物料档案与成员名单只读，此身份下保存的物料/成员会被服务端拒绝并从列表消失。</div>' +
            '<div style="margin-top:4px">多半是口令不对：① 注意<b>大小写</b>　② 复制时可能带了<b>前后空格 / 不可见字符</b>（本版已自动剔除）　③ 服务端口令可能已被人改过。' + (W.adminKeyHint ? W.adminKeyHint() : '') + '</div>' +
            '<div style="margin-top:4px">修复后操作：在口令框内点一下再点别处（或回车）→ 框下方<b>当场显示校验结果</b>；出现「✓ 校验通过」后点「保存并连接」，状态条出现「身份：管理员」即成功。</div></div>';
        }
        else {
          t += '<div class="note info">当前不是管理员：物料档案只读；成员名单仅系统管理员可维护。申领审批按成员名单中的提交人路由，只有被指定的审核人 / 核准人能处理对应待办。</div>';
        }
      }
      if (S.mode === 'server' && !S.lastSyncAt && S.lastError) {
        t += '<div class="note err">✗ 数据尚未成功拉取（最近同步：—）：' + W.esc(S.lastError.detail || '') + ' → 检查服务是否启动后点「立即拉取云端」重试。</div>';
      }
      return t;
    }
    function teamTableHtml() {
      const st = W.teamStats();
      if (!st.total) return '<span class="muted">暂无申领单数据</span>';
      const head = (st.admin || W.canEditFlow())
        ? '团队数据（全员 ' + st.total + ' 单）'
        : '我的数据（' + W.esc(W.me().name || '未设身份') + ' · ' + st.total + ' 单，仅本人录入）';
      const rows = st.rows.map(r => `<tr><td>${W.esc(r.name)}</td><td>${r.n}</td><td>${r.pct.toFixed(1)}%</td></tr>`).join('');
      return `<div style="font-size:13px;font-weight:600;margin-bottom:6px">${head}</div>
        <div class="twrap"><table><thead><tr><th>录入人</th><th>申领单数</th><th>占比</th></tr></thead><tbody>${rows}</tbody></table></div>`;
    }
    function shareHtml() {
      const u = W.shareUrl();
      if (!u) return '本地文件打开时不会自动共享：请把程序部署到一台电脑并启动服务，或用网址打开本页。';
      return '分享网址：<b style="user-select:all">' + W.esc(u) + '</b>　（发到工作群，同事打开即可；管理员填口令后看全员）';
    }
    function scopeBtnHtml() {
      const sc = W.scopeInfo();
      if (!sc.online || sc.admin) return '';
      if (sc.role === '区域领用人') return '<span class="muted" style="align-self:center">视图：本人申领 + 本区域分发</span>';
      if (sc.role === '隶属区域领用人') return '<span class="muted" style="align-self:center">视图：本人申领 + 分配给我的分发</span>';
      return '<span class="muted" style="align-self:center">视图：全部业务台账</span>';
    }
    const memberRows = members.map(x => {
      const supervisor = x.supervisorId ? W.memberById(x.supervisorId) : null;
      return `<tr><td>${W.esc(x.name)}</td><td>${W.esc(x.username || '—')}</td><td>${W.esc(x.dept || '—')}</td><td>${W.esc(x.role)}</td><td>${x.region ? W.esc(W.REGION_LABEL[x.region] || x.region) : '—'}</td><td>${W.esc(supervisor ? supervisor.name : '—')}</td><td>${x.enabled === false ? '<span class="tag gray">停用</span>' : '<span class="tag green">启用</span>'}</td><td>${W.esc(x.by)}</td>${canManageMembers ? `<td><button class="btn sm" data-editmem="${x.id}">编辑</button> <button class="btn sm danger" data-delmem="${x.id}">删除</button></td>` : ''}</tr>`;
    }).join('') || `<tr><td colspan="9" class="empty">暂无成员${canManageMembers ? '，点击「添加成员」' : ''}</td></tr>`;
    pane.innerHTML = `
      <div class="card"><h3>👤 我的身份</h3>
        <p>当前：<b>${W.esc(m.name || '未设置')}</b> · ${W.esc(m.role || '—')}${m.dept ? ' · ' + W.esc(m.dept) : ''}${m.region ? ' · ' + W.esc(W.REGION_LABEL[m.region]) : ''} <button class="btn sm" id="btnMe">切换身份</button></p>
      </div>
      <div class="card"><h3>👥 成员名单 <span class="sp">${canManageMembers ? '<button class="btn pri sm" id="btnAddMember">＋ 添加成员</button>' : '<span class="muted">仅系统管理员可维护</span>'}</span></h3>
        <div class="twrap"><table><thead><tr><th>姓名</th><th>品集账号</th><th>部门</th><th>角色</th><th>区域</th><th>上级</th><th>状态</th><th>录入人</th>${canManageMembers ? '<th>操作</th>' : ''}</tr></thead><tbody>${memberRows}</tbody></table></div></div>
      <div class="card"><h3>🏢 部门与区域 <span class="sp muted">全公司部门 / 全部区域 · 表单下拉、仪表盘、筛选器的取值来源</span></h3>
        ${canManageMembers ? `
        <div class="frow">
          <label style="flex:1">部门清单（每行一个部门）<textarea id="orgDepts" rows="7" style="width:100%;font-family:inherit">${W.esc(W.DEPTS.join('\n'))}</textarea></label>
          <label style="flex:1">区域清单（每行一个区域）<textarea id="orgRegions" rows="7" style="width:100%;font-family:inherit">${W.esc(W.REGIONS.map(r => W.REGION_LABEL[r] || r).join('\n'))}</textarea></label>
        </div>
        <button class="btn pri sm" id="btnOrgSave">保存清单</button>
        <span class="muted"> 保存后所有下拉与仪表盘区域卡片同步更新；历史记录保留原区域名，删除的项不再出现在新单据中。</span>
        ` : `<p class="muted">部门：${W.esc(W.DEPTS.join('、'))}</p><p class="muted">区域：${W.esc(W.REGIONS.map(r => W.REGION_LABEL[r] || r).join('、'))}（清单由管理员在设置页维护）</p>`}
      </div>
      <div class="card"><h3>📁 共享文件同步（推荐 · 免防火墙） <span class="sp muted">免服务器 · 免端口 · 免放行：用共享文件在电脑之间交换数据</span></h3>
        <p class="muted" style="margin-bottom:8px"><b>为什么不会被防火墙拦</b>：本模式不监听任何端口、不建立任何网络连接——「导出」就是浏览器把数据存成一个文件，「合并导入」就是读入文件做字段级合并，防火墙完全不参与，任何电脑、任何网络策略下都可用。<b>协作节奏</b>：每人把共享包放进共享盘 / 企业微信群 / 邮件 → 大家各自选「共享文件夹」或「共享包文件」→ 点「③ 合并导入」。合并是<b>字段级自动合并</b>：只补不覆盖，同一字段以较新改动为准，删除同步为墓碑不会复活；<b>重复导入同一个包会自动跳过</b>，不会误算。</p>
        <div class="frow">
          <button class="btn pri" id="btnSyncExp">① 导出共享包（全部数据）</button>
          <button class="btn" id="btnSyncExpInc" title="只含上次导出之后的新改动，体积小、流转快；对方合并过你之前的包即可无缝接上">① 导出增量包（仅新改动）</button>
          <label>② 选择共享包文件（可多选）<input type="file" id="syncImpFile" accept=".json,application/json" multiple></label>
          <label>② 或选共享文件夹（合并其中全部 .json）<input type="file" id="syncDirFile" webkitdirectory directory multiple></label>
          <button class="btn pri" id="btnSyncImpRun">③ 合并导入</button>
        </div>
        <div id="syncArea" class="muted">${syncResult || syncDefaultHtml()}</div>
      </div>
      <div class="card"><h3>🔗 云端共享（多人实时） <span class="sp muted">同一地址 · 口令鉴权 · 服务端权限校验 · 实时同步（需服务端在线）</span></h3>
        <p class="muted" style="margin-bottom:8px">申领由申请人提交后按成员名单自动路由：<b>指定审核人</b>执行一级审核，<b>指定核准人</b>执行最终核准；直接核准会跳过审核，仅审核在审核通过后完成。<b>审核员/核准员</b>负责到货、签收和分发；<b>区域领用人</b>确认本区域领用，<b>隶属区域领用人</b>只确认分配给本人的单据；成员名单仅系统管理员（${W.esc(W.systemAdminLabel())}）维护。</p>
        <div class="frow">
          <label style="flex:2 1 220px">服务地址<input id="srvAddr" value="${W.esc(W.SYNC.server)}" placeholder="http://192.168.x.x:8082 或站点网址"></label>
          <label style="flex:1 1 170px">管理员口令<span style="display:flex;gap:4px"><input id="admKey" type="password" value="${W.esc(W.cloudCfg.adminKey)}" placeholder="仅管理员填写" style="flex:1;min-width:0"><button class="btn sm" id="btnEye" title="显示/隐藏口令原文（核对大小写与空格）" style="padding:6px 9px">👁</button></span></label>
          <label style="flex:1 1 130px">我的姓名（录入人）<input id="meName" value="${W.esc(m.name)}" placeholder="填写你的姓名"></label>
          <label style="flex:1 1 170px">自动同步<select id="autoSync">
            <option value="1" ${W.cloudCfg.auto ? 'selected' : ''}>开启（实时推送 + 30 秒兜底）</option>
            <option value="0" ${!W.cloudCfg.auto ? 'selected' : ''}>关闭（仅手动同步）</option>
          </select></label>
        </div>
        <div id="keyCheck" class="muted" style="font-size:12px;min-height:16px;margin:-6px 0 8px"></div>
        <div class="btnrow">
          <button class="btn" id="btnTestConn">测试连接</button>
          <button class="btn pri" id="btnConn">保存并连接</button>
          <span class="spacer"></span>
          ${isAdmin ? '<button class="btn danger" id="btnWipe">管理员清空云端</button>' : ''}
        </div>
        <div class="btnrow" style="margin-bottom:0">
          <button class="btn" id="btnPullNow">立即拉取云端</button>
          <button class="btn" id="btnPushNow">上传本机未同步</button>
          <button class="btn" id="btnLocal">切换本地模式</button>
          ${scopeBtnHtml()}
        </div>
        <div id="connInfo" style="${connStyle()}">${cloudStatusHtml()}</div>
        <div id="teamBox" style="margin-top:12px">${teamTableHtml()}</div>
        <p class="muted" id="shareLine" style="margin-top:10px">${shareHtml()}</p>
        <p class="muted">权限口径：申领申请人提交后按名单自动进入待审核或待核准；只有被指定的审核人 / 核准人能处理对应待办，驳回必须填写原因并写入操作日志；审核员/核准员负责到货、签收和分发；<b>区域领用人</b>确认本区域单据，<b>隶属区域领用人</b>只确认分配给本人的单据；成员名单仅系统管理员（${W.esc(W.systemAdminLabel())}）维护。已核准申领不能由普通用户直接修改。</p></div>
      <div class="card"><h3>💾 数据备份与恢复 <span class="sp muted">自动备份在服务器 data/backup/ 目录</span></h3>
        <div class="frow">
          <button class="btn" id="btnBackup">下载整库备份（store.json）</button>
          <label>恢复文件<input type="file" id="restoreFile" accept=".json"></label>
          <button class="btn danger" id="btnRestore">上传恢复（整库覆盖）</button>
        </div>
        <p class="muted">恢复会把云端数据整体替换，请谨慎操作；恢复前建议先下载一份备份。</p></div>
      <div class="card"><h3>📥 Excel 导入 <span class="sp muted">支持 物料档案 / 申领 / 到货 / 分发 / 成员名单 五张表 · 列可手动映射</span></h3>
        <div class="frow">
          <label>目标表<select id="impTarget"><option value="materials">物料档案</option><option value="purchases">申领记录</option><option value="arrivals">到货记录</option><option value="dispatches">分发记录</option><option value="members">成员名单</option></select></label>
          <label>选择文件<input type="file" id="impFile" accept=".xlsx,.csv"></label>
          <button class="btn" id="btnTemplate">下载空白模板</button>
          <button class="btn pri" id="btnImpPreview">解析并预览</button>
        </div>
        <div id="impArea"></div>
      </div>
      <div class="card"><h3>📤 Excel 导出</h3>
        <div class="frow">
          <button class="btn" id="btnExpAll">导出全部台账（多工作表）</button>
          <button class="btn" id="btnExpCsv">导出 CSV 兜底</button>
        </div></div>`;
    if (W.SYNC.authMode === 'qnexus') {
      const localCard = Array.from(pane.querySelectorAll('.card')).find(card => card.querySelector('#srvAddr'));
      if (localCard) {
        localCard.style.display = 'none';
        localCard.insertAdjacentHTML('beforebegin', `<div class="card"><h3>🔐 品集身份</h3>
          <p><b>${W.esc(m.name || '')}</b>${m.username ? ' · ' + W.esc(m.username) : ''} · ${W.esc(m.role || '')}${m.dept ? ' · ' + W.esc(m.dept) : ''}${m.region ? ' · ' + W.esc(W.REGION_LABEL[m.region] || m.region) : ''}</p>
          <p class="muted">部门、角色、区域、上级和审批路由均从成员名单自动读取，个人不能在应用内修改。</p>
          ${m.memberMatched ? `<p>上级：<b>${W.esc(m.supervisorName || '未配置')}</b></p>` : `<div class="note err"><b>未匹配成员名单，请联系管理员</b><br>当前账号只能查看数据，不能提交申领、审批或领用签字。请联系管理员 ${W.esc(W.systemAdminLabel())} 补建成员档案。</div>`}
          <p>${m.memberMatched ? (W.SYNC.systemAdmin ? '✅ 当前为系统管理员，可维护成员名单及全部业务。' : isAdmin ? '✅ 当前具备管理员权限，可维护物料并处理审批业务。' : '当前为业务角色：按角色提交、审核、核准或确认相关单据。') : '待管理员完成成员名单匹配后才能办理业务。'}</p>
          <a class="btn" href="/apps">返回品集应用中心</a></div>`);
      }
      const restoreButton = $('#btnRestore');
      if (restoreButton && !isAdmin) restoreButton.style.display = 'none';
    }
    $('#btnMe').onclick = showMeModal;
    if (canManageMembers) {
      $('#btnAddMember').onclick = () => memberForm(null);
      pane.querySelectorAll('[data-editmem]').forEach(b => b.onclick = () => memberForm(b.dataset.editmem));
      pane.querySelectorAll('[data-delmem]').forEach(b => b.onclick = () => {
        if (confirm('确认删除该成员？')) W.remove('members', b.dataset.delmem, '删除成员');
      });
    }
    $('#btnOrgSave') && ($('#btnOrgSave').onclick = () => {
      const parse = t => t.split(/\n+/).map(s => s.trim()).filter(Boolean);
      const depts = parse($('#orgDepts').value);
      // 区域：优先沿用已有 id（保证旧记录统计不丢），新增项以名称为 id
      const regions = parse($('#orgRegions').value).map(line => {
        const hit = W.REGIONS.find(id => id === line || (W.REGION_LABEL[id] || '') === line);
        return hit ? { id: hit, label: W.REGION_LABEL[hit] || hit } : { id: line, label: line };
      });
      if (!depts.length || !regions.length) { W.toast('清单不能为空'); return; }
      W.saveOrgCfg(depts, regions);
      W.toast('部门与区域清单已保存');
      renderSettings(); W.renderAll();
    });
    $('#btnTemplate').onclick = downloadTemplate;
    $('#btnImpPreview').onclick = importPreview;
    // 缓存已选文件：同步刷新重渲染后文件选择框会被重建，避免已选文件丢失
    $('#impFile').onchange = e => { impFileCache = (e.target.files && e.target.files[0]) || null; };
    $('#btnExpAll').onclick = exportAll;
    $('#btnExpCsv').onclick = exportCsv;
    $('#btnBackup').onclick = downloadBackup;
    /* ---- 共享文件同步（无服务器 / 免端口 / 免防火墙） ---- */
    const doExport = (mode) => {
      try {
        if (mode === 'inc' && !W.getLastExportAt()) { W.toast('本机还没导出过全量包：第一次请先点「导出共享包（全部数据）」'); return; }
        W.downloadBlob(new TextEncoder().encode(W.syncBundleText({ mode })), W.syncBundleName({ mode }), 'application/json');
        W.markExported();
        const last = W.getLastExportAt();
        W.toast(mode === 'inc' ? '已导出增量包：只含上次导出后的新改动' : '已导出共享包：发给同事或放进共享盘');
        if ($('#syncArea')) $('#syncArea').textContent = '上次导出：' + new Date(last).toLocaleString() + '（之后的新改动可用增量包）';
      } catch (e) { W.toast('导出失败：' + e.message); }
    };
    $('#btnSyncExp').onclick = () => doExport('full');
    $('#btnSyncExpInc').onclick = () => doExport('inc');
    const syncInp = $('#syncImpFile'), syncDir = $('#syncDirFile');
    const showPick = () => {
      const a = $('#syncArea');
      const all = Array.prototype.slice.call((syncInp.files || [])).concat(Array.prototype.slice.call((syncDir.files || [])));
      const jsons = all.filter(f => /\.json$/i.test(f.name));
      if (a && jsons.length) a.textContent = '已选 ' + jsons.length + ' 个 .json：' + jsons.slice(0, 6).map(f => f.name).join('、') + (jsons.length > 6 ? ' 等' : '') + '（点「③ 合并导入」执行）';
    };
    syncInp.onchange = showPick;
    syncDir.onchange = showPick;
    $('#btnSyncImpRun').onclick = async () => {
      /* 缓存的文件优先（重渲染后输入框会被重建，避免已选文件丢失）；文件夹模式自动过滤出 .json */
      let files = Array.prototype.slice.call((syncInp.files || [])).concat(Array.prototype.slice.call((syncDir.files || [])));
      if (!files.length) files = syncFileCache;
      files = files.filter(f => /\.json$/i.test(f.name));
      if (!files.length) { W.toast('请先选共享包文件或共享文件夹'); return; }
      syncFileCache = files;
      const area = $('#syncArea');
      if (area) area.textContent = '正在合并 ' + files.length + ' 个文件…';
      const readOne = f => (typeof f.text === 'function')
        ? f.text()
        : new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result || '')); fr.onerror = () => rej(new Error('读取文件失败')); fr.readAsText(f, 'utf-8'); });
      /* 先全部读入并解析 → 按包内导出时间从旧到新排序 → 依次合并（时间戳合并与顺序无关，排序只为报告清晰） */
      const entries = [];
      for (const f of files) {
        try { entries.push({ name: f.name, txt: await readOne(f) }); }
        catch (e) { entries.push({ name: f.name, err: e.message || '读取失败' }); }
      }
      for (const en of entries) {
        if (en.err) continue;
        try { en.at = Number(JSON.parse(en.txt).exportedAt) || 0; } catch (e) { en.err = '不是有效的 JSON：可能选错了文件，或文件被改坏'; }
      }
      entries.sort((a, b) => (a.at || 0) - (b.at || 0));
      const lines = [];
      let done = 0, dup = 0, fail = 0, addedTotal = 0;
      for (const en of entries) {
        if (en.err) { fail++; lines.push('✗ ' + en.name + '：' + en.err); continue; }
        try {
          const r = W.syncMergeText(en.txt);
          if (r.skipped) { dup++; lines.push('↷ ' + en.name + '（来自 ' + W.esc(r.from || '未知') + '）：重复包，已自动跳过'); continue; }
          done++; addedTotal += r.added;
          lines.push('✓ ' + en.name + '（来自 ' + W.esc(r.from || '未知') + '）：合并后本机 ' + r.after + ' 条，新增 ' + r.added + ' 条');
        } catch (e) { fail++; lines.push('✗ ' + en.name + '：' + e.message); }
      }
      syncResult = lines.join('<br>')
        + '<br><b>结果</b>：成功合并 ' + done + ' · 重复跳过 ' + dup + ' · 失败 ' + fail + (done ? ' · 共新增 ' + addedTotal + ' 条' : '')
        + (fail ? '<br><span style="color:#dc2626">失败文件请确认是本系统导出的 .json 共享包（Excel/备份以外的文件不会合并）</span>'
          : done ? '<br>合并完成：可继续录入，或再导出一份共享包给下一位同事。' : '');
      syncFileCache = [];
      W.toast('合并完成：成功 ' + done + (dup ? ' · 跳过重复 ' + dup : '') + (fail ? ' · 失败 ' + fail : ''));
      renderSettings();
    };
    $('#btnRestore').onclick = restoreBackup;
    /* 连接结果 → 用户可读的诊断文案（与 core.js probeEx 的 reason 对应） */
    function connMsg(x, base) {
      x = x || {};
      const where = x.url || (base ? base.replace(/\/$/, '') + '/api/health' : '');
      const localHit = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/i.test(where);
      const oldPort = /:8787(\D|$)/.test(base || '');
      const fixed = oldPort ? '（已把旧端口 8787 自动更正为 8082）' : '';
      if (x.ok) {
        const h = x.health || {};
        return '✓ 连接正常（' + where + '）· 已存 ' + (h.records || 0) + ' 条记录 · 在线 ' + ((h.online || []).join('、') || '—') + fixed;
      }
      if (x.reason === 'empty') return '✗ 地址为空且未探测到服务。请：① 在服务器电脑以管理员运行「一键启动_自动放行防火墙.bat」② 填写地址（看服务器目录下「访问地址.txt」，如 http://192.168.28.5:8082）③ 点「测试连接」确认 ✓ 后再「保存并连接」';
      if (x.reason === 'timeout') return '✗ 连不上 ' + where + '：4 秒无响应（网络不可达）。请依次检查：① 服务器是否用「一键启动_自动放行防火墙.bat」以管理员运行（放行 8082）② 两台电脑是否同一网段 ③ 地址是否为服务器当前 IP（看服务器目录下「访问地址.txt」）';
      if (x.reason === 'refused') return localHit
        ? '✗ 连不上 ' + where + '：连接被拒绝。本机直连也被拒 → 服务未启动。请在服务器电脑以管理员运行「一键启动_自动放行防火墙.bat」，然后本机浏览器访问 http://localhost:8082/api/health 自检（应返回 {"ok":true}）'
        : '✗ 连不上 ' + where + '：连接被拒绝。服务未启动或端口不对：① 确认服务器已启动且端口为 8082 ② 若服务器本机 localhost 能打开而这里被拒，多为地址写错（看「访问地址.txt」取当前 IP）' + fixed;
      if (x.reason === 'badreply') return '✗ ' + where + ' 有响应但不是物资申领与消耗追溯 V1.2.13服务（核对地址与端口是否指向别的程序）' + fixed;
      return '✗ 连不上 ' + where + '（' + (x.detail || x.reason || 'HTTP 异常') + '）' + fixed;
    }
    /* 读取输入框地址：升级旧端口并把结果写回输入框（用户可见纠正） */
    function readAddr() {
      const inp = $('#srvAddr');
      const fixed = W.upgradeLegacyPort(inp.value.trim());
      if (fixed !== inp.value.trim()) inp.value = fixed;
      return fixed;
    }
    /* 口令可见切换：核对大小写与前后空格时必须能看到原文（UI 优化 2026-11-17） */
    const eyeBtn = $('#btnEye');
    if (eyeBtn) eyeBtn.onclick = () => {
      const k = $('#admKey');
      k.type = k.type === 'password' ? 'text' : 'password';
      eyeBtn.style.background = k.type === 'text' ? '#eff6ff' : '';
      eyeBtn.style.borderColor = k.type === 'text' ? '#93c5fd' : '';
    };
    /* 口令即时校验（修复 2026-11-17）：失焦 / 回车当场问服务端「这个口令认不认」，
       不再等「保存并连接」之后才从状态条降级提示里反推。 */
    const runKeyCheck = async (auto) => {
      const box = $('#keyCheck');
      const k = ($('#admKey').value || '');
      if (!k.trim()) { box.textContent = ''; box.style.color = ''; return; }
      const base = readAddr().replace(/\/$/, '');
      if (!base) { box.textContent = '先填服务地址再校验口令'; box.style.color = '#92400e'; return; }
      box.textContent = '口令校验中…';
      box.style.color = '';
      const j = await W.verifyAdminKey(base, k);
      if (!j || !j.ok) {
        box.textContent = '✗ 无法校验：' + (j ? j.detail : '网络错误') + '（服务是否启动？）';
        box.style.color = '#b91c1c';
        return;
      }
      if (j.isAdmin) {
        box.textContent = '✓ 管理员口令校验通过 — 点「保存并连接」后生效' + (auto ? '（回车可直接连接）' : '');
        box.style.color = '#166534';
        if (j.adminKeySource) W.SYNC.adminKeySource = j.adminKeySource;
      } else {
        let why = '口令不匹配（服务端' + (j.adminKeySource === 'default' ? '使用默认口令' : '口令为自定义，需找启动服务的人核对') + '）';
        if (j.hadInvisible) why += '；已自动剔除口令里的不可见字符（常见于从微信/文档复制）';
        if (j.hadFullWidth) why += '；检测到全角字符（中文输入法易把 - 打成 －），已按转换后重试仍不匹配';
        why += '。注意大小写；服务端口令默认 wuzhi-admin-2026（config.json / 环境变量可改）。';
        box.textContent = '✗ ' + why;
        box.style.color = '#b91c1c';
      }
    };
    const admKeyInput = $('#admKey');
    if (admKeyInput) {
      admKeyInput.addEventListener('blur', () => { runKeyCheck(true); });
      admKeyInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); runKeyCheck(false).then(() => $('#btnConn').click()); } });
    }
    $('#btnTestConn').onclick = async () => {
      const base = readAddr().replace(/\/$/, '');
      const info = $('#connInfo');
      if (!base) { info.textContent = connMsg({ reason: 'empty' }); return; }
      info.textContent = '测试中…（最长 4 秒）';
      const x = await W.probeEx(base);
      info.textContent = connMsg(x, base);
      /* 顺带把已填的口令一并校验（修复 2026-11-17）：测试连接不再只测连通性 */
      if (x.ok && ($('#admKey').value || '').trim()) runKeyCheck(false);
    };
    $('#btnConn').onclick = async () => {
      const typedName = ($('#meName') && $('#meName').value || '').trim();
      W.cloudCfg.adminKey = W.normKey($('#admKey').value);
      W.saveCloudCfg();
      const info = $('#connInfo');
      let base = readAddr();
      /* 地址为空 → 自动探测候选（保存过的地址 / 同源 / 本机 8082），命中即填入并连接 */
      if (!base) {
        info.textContent = '地址为空，正在自动探测候选地址…（最长约 16 秒）';
        const det = await W.autoDetect();
        if (!det.ok) {
          info.textContent = connMsg({ reason: 'empty' });
          W.toast('连接失败：未探测到服务，请先启动服务器（详见提示）');
          return;
        }
        base = det.base;
        $('#srvAddr').value = base;
        W.toast('已自动识别服务器地址：' + base);
      }
      info.textContent = '连接中…（最长 4 秒）';
      const ok = await W.switchMode('server', base);
      if (ok) {
        /* 填了姓名就一并保存，并按新身份重拉一次（身份参与服务端权限判定） */
        if (typedName && typedName !== W.me().name) {
          const m0 = W.me();
          W.setMe(typedName, m0.role || '', m0.region || '');
          await W.pullStore(true).catch(() => { });
        }
        /* 修复（2026-11-17）：连接成功 ≠ 口令校验通过。填了口令但服务端未认可时必须明确警告，
           不能再笼统提示「已连接共享（管理员）」（此前 scopeLabel 用本机角色，口令错了也显示管理员）。
           UI 优化：toast 只做简短提示，详细排查指引统一放在下方状态条，避免三处重复。 */
        if (W.cloudCfg.adminKey && !W.SYNC.admin) {
          W.toast('⚠ 已连接，但管理员口令未通过服务端校验（详见下方提示）', 4200);
        } else if (W.cloudCfg.adminKey && W.SYNC.admin) {
          W.toast('✓ 已连接共享，管理员口令校验通过');
        } else {
          W.toast('已连接共享（' + W.scopeLabel() + '）');
        }
        renderSettings();
      }
      else {
        const x = W.SYNC.lastError || { reason: 'unknown' };
        W.toast('连接失败：' + (x.detail || x.reason || '请先用「测试连接」查看原因'));
        info.textContent = connMsg(x, base);
      }
    };
    $('#btnLocal').onclick = async () => { await W.switchMode('local'); W.toast('已切换本地模式'); renderSettings(); };
    /* ---- 自动同步 / 我的姓名 / 立即拉取 / 上传未同步 / 视图范围（对齐送测同名按钮） ---- */
    $('#autoSync').onchange = e => {
      W.cloudCfg.auto = e.target.value === '1' ? 1 : 0;
      W.saveCloudCfg(); W.startAutoSync();
      W.toast(W.cloudCfg.auto ? '已开启自动同步（实时推送 + 30 秒兜底拉取）' : '已关闭自动同步（可手动点「立即拉取云端」）');
    };
    $('#meName').onchange = e => {
      const nm = e.target.value.trim(), m0 = W.me();
      W.setMe(nm, m0.role || '', m0.region || '');
      W.toast('姓名已保存：' + (nm || '未设身份'));
      renderSettings();
    };
    $('#btnPullNow').onclick = async () => {
      const info = $('#connInfo');
      if (W.SYNC.mode !== 'server') { info.textContent = '尚未连接共享，请先点「保存并连接」'; return; }
      info.textContent = '正在拉取云端数据…';
      try { await W.pullStore(true); W.toast('已拉取云端最新数据'); renderSettings(); }
      catch (e) { info.textContent = '拉取失败：' + e.message + '（数据仍在本机，网络恢复后点「上传本机未同步」补传）'; }
    };
    $('#btnPushNow').onclick = async () => {
      const info = $('#connInfo');
      if (W.SYNC.mode !== 'server') { info.textContent = '尚未连接共享，无法上传'; return; }
      try { const had = await W.pushPending(); W.toast(had ? '已上传本机未同步的改动' : '本机没有待上传的改动'); renderSettings(); }
      catch (e) { W.toast('上传失败：' + e.message); }
    };
    const wipeBtn = $('#btnWipe');
    if (wipeBtn) wipeBtn.onclick = async () => {
      if (!confirm('⚠️ 将清空云端服务器上的全部数据（物料/申领/到货/分发/签字/成员/日志），且不可恢复！所有同事下次同步会一并清掉。确定继续？')) return;
      try { await W.wipeCloud(); W.toast('云端数据已清空'); renderSettings(); }
      catch (e) { W.toast('清空失败：' + e.message); }
    };
  }

  function memberForm(id) {
    if (!W.canManageMembers()) { W.toast('成员名单仅系统管理员可维护'); return; }
    if (id) W.markEdit('members', id);
    const x = id ? W.get('members', id) : {
      name: '', username: '', role: '区域领用人', region: '', dept: '', enabled: true,
      supervisorId: '', approvalMode: '', reviewerId: '', approverId: ''
    };
    function supervisors(region, selected) {
      return W.supervisorsForRegion(region).filter(member => member.id !== id)
        .map(member => `<option value="${member.id}" ${selected === member.id ? 'selected' : ''}>${W.esc(member.name)}（${W.esc(W.REGION_LABEL[member.region] || member.region)}）</option>`).join('');
    }
    function reviewerOptions(selected) {
      return W.list('members').filter(member => member.enabled !== false && member.role === '审核员')
        .sort((a, b) => String(a.name).localeCompare(String(b.name)))
        .map(member => `<option value="${member.id}" ${selected === member.id ? 'selected' : ''}>${W.esc(member.name)}${member.username ? '（' + W.esc(member.username) + '）' : ''}</option>`).join('');
    }
    function approverOptions(selected) {
      return W.list('members').filter(member => member.enabled !== false && member.role === '核准员')
        .sort((a, b) => String(a.name).localeCompare(String(b.name)))
        .map(member => `<option value="${member.id}" ${selected === member.id ? 'selected' : ''}>${W.esc(member.name)}${member.username ? '（' + W.esc(member.username) + '）' : ''}</option>`).join('');
    }
    openModal(modalShell(id ? '✏️ 编辑成员' : '＋ 添加成员', `
      <div class="frow">
        <label>姓名 *<input id="fName" value="${W.esc(x.name)}"></label>
        <label>品集账号<input id="fUsername" value="${W.esc(x.username || '')}" placeholder="用于匹配品集登录账号"></label>
        <label>部门<select id="fDept"><option value="">— 未选择 —</option>${W.DEPTS.map(d0 => `<option ${x.dept === d0 ? 'selected' : ''}>${W.esc(d0)}</option>`).join('')}</select></label>
        <label>角色<select id="fRole">${W.ROLES.map(r => `<option ${x.role === r ? 'selected' : ''}>${r}</option>`).join('')}</select></label>
        <label>区域<select id="fRegion"><option value=""></option>${W.REGIONS.map(r => `<option value="${r}" ${x.region === r ? 'selected' : ''}>${W.REGION_LABEL[r]}</option>`).join('')}</select></label>
        <label>状态<select id="fEnabled"><option value="true" ${x.enabled !== false ? 'selected' : ''}>启用</option><option value="false" ${x.enabled === false ? 'selected' : ''}>停用</option></select></label>
        <label id="supervisorRow">上级区域领用人 *<select id="fSupervisor"><option value="">— 请选择 —</option>${supervisors(x.region, x.supervisorId)}</select></label>
      </div>
      <div class="frow" style="margin-top:10px">
        <label>审批模式<select id="fApprovalMode"><option value="">— 未配置（不可提交申领）—</option>${Object.entries(W.APPROVAL_MODE_LABELS).map(([value, label]) => `<option value="${value}" ${x.approvalMode === value ? 'selected' : ''}>${W.esc(label)}</option>`).join('')}</select></label>
        <label id="reviewerRow">指定审核人<select id="fReviewer"><option value="">— 请选择审核员 —</option>${reviewerOptions(x.reviewerId)}</select></label>
        <label id="approverRow">指定核准人<select id="fApprover"><option value="">— 请选择核准员 —</option>${approverOptions(x.approverId)}</select></label>
      </div>
      <p class="muted">审批路由以本表为准：两级审批会先到指定审核人，再到指定核准人；直接核准会跳过审核；仅审核在审核通过后完成。审核员和核准员不绑定区域；区域领用人负责本区域确认；隶属区域领用人必须指定同区域的区域领用人作为上级。</p>
    `, `<button class="btn" onclick="closeModal()">取消</button><button class="btn pri" id="fSave">保存</button>`));
    function refreshSupervisor() {
      const role = $('#fRole').value;
      const region = $('#fRegion').value;
      const subordinate = role === '隶属区域领用人';
      $('#supervisorRow').style.display = subordinate ? '' : 'none';
      if (subordinate) $('#fSupervisor').innerHTML = `<option value="">— 请选择 —</option>${supervisors(region, '')}`;
    }
    $('#fRole').onchange = refreshSupervisor;
    $('#fRegion').onchange = refreshSupervisor;
    function refreshApprovalRoute() {
      const mode = $('#fApprovalMode').value;
      const needsReviewer = mode === W.APPROVAL_MODE_TWO_STEP || mode === W.APPROVAL_MODE_REVIEW_ONLY;
      const needsApprover = mode === W.APPROVAL_MODE_TWO_STEP || mode === W.APPROVAL_MODE_DIRECT_APPROVE;
      $('#reviewerRow').style.display = needsReviewer ? '' : 'none';
      $('#approverRow').style.display = needsApprover ? '' : 'none';
    }
    $('#fApprovalMode').onchange = refreshApprovalRoute;
    refreshSupervisor();
    refreshApprovalRoute();
    $('#fSave').onclick = () => {
      const name = $('#fName').value.trim();
      const role = $('#fRole').value;
      const region = $('#fRegion').value;
      const supervisorId = role === '隶属区域领用人' ? $('#fSupervisor').value : '';
      const approvalMode = $('#fApprovalMode').value;
      const reviewerId = approvalMode === W.APPROVAL_MODE_TWO_STEP || approvalMode === W.APPROVAL_MODE_REVIEW_ONLY ? $('#fReviewer').value : '';
      const approverId = approvalMode === W.APPROVAL_MODE_TWO_STEP || approvalMode === W.APPROVAL_MODE_DIRECT_APPROVE ? $('#fApprover').value : '';
      if (!name) { W.toast('姓名必填'); return; }
      if (['区域领用人', '隶属区域领用人'].includes(role) && !region) { W.toast('该角色必须选择所属区域'); return; }
      if (role === '隶属区域领用人' && !supervisorId) { W.toast('请选择上级区域领用人'); return; }
      if (approvalMode && !reviewerId && !approverId) { W.toast('请为审批模式选择对应审批人'); return; }
      if ((approvalMode === W.APPROVAL_MODE_TWO_STEP || approvalMode === W.APPROVAL_MODE_REVIEW_ONLY) && !reviewerId) { W.toast('请选择指定审核人'); return; }
      if ((approvalMode === W.APPROVAL_MODE_TWO_STEP || approvalMode === W.APPROVAL_MODE_DIRECT_APPROVE) && !approverId) { W.toast('请选择指定核准人'); return; }
      W.upsert('members', {
        id, name, username: $('#fUsername').value.trim().toLowerCase(), role, region,
        dept: $('#fDept').value, supervisorId, enabled: $('#fEnabled').value === 'true',
        approvalMode, reviewerId, approverId
      }, `成员：${name}（${role}）`);
      closeModal(); W.toast('成员已保存');
    };
  }

  /* ---------------- 物料档案 · OA 模板导入导出 ---------------- */
  const OA_XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

  /* 导出：Sheet1 = OA请购提报 V1.0 格式（严格复刻模板样式），Sheet2 = 物料档案全字段快照 */
  async function oaExportBytes() {
    const mats = W.list('materials').slice().sort((a, b) => String(a.code || '').localeCompare(String(b.code || '')));
    const oaRows = mats.map((mt, i) => {
      const st = W.stockOf(mt.id);
      const row = new Array(34).fill('');
      row[0] = i + 1;                        // 序号
      row[9] = mt.category || '';            // 物品类型
      row[10] = mt.code || '';               // 存货编码
      row[11] = mt.name;                     // 存货名称
      row[12] = mt.spec || '';               // 规格型号
      row[13] = mt.note || '';               // 描述（对物品详细解释）
      row[14] = mt.unit || '';               // 单位
      row[16] = Number(st.remain) || 0;      // 现有数量 = 剩余库存
      row[26] = mt.category || '';           // 物品分类（模治具/设备/耗材…）
      return row;
    });
    const archiveHeaders = ['存货编码', '物料名称', '规格型号', '单位', '物品分类', '安全库存', '实收累计', '已领用', '剩余库存', '预估可用(天)', '备注'];
    const archiveRows = mats.map(mt => {
      const st = W.stockOf(mt.id), dl = W.daysLeftOf(mt.id);
      return [mt.code || '', mt.name, mt.spec || '', mt.unit || '', mt.category || '',
        W.num(mt.safe) || '', st.recvTotal, st.usedTotal, st.remain, dl.days == null ? '' : dl.days, mt.note || ''];
    });
    return W.xlsxBuildOA({ headers: OA_HEADERS, oaRows: oaRows, archiveHeaders: archiveHeaders, archiveRows: archiveRows });
  }

  async function oaExport() {
    try {
      const bytes = await oaExportBytes();
      W.downloadBlob(bytes, '物料档案_OA请购提报V1.0格式_' + W.today().replace(/-/g, '') + '.xlsx', OA_XLSX_MIME);
      W.toast('已按 OA 模板格式导出');
    } catch (e) { W.toast('导出失败：' + e.message); }
  }

  /* 解析：自动识别 OA 模板（34 列）或系统档案表头；返回分类计划（不落库）。bytes: Uint8Array */
  async function oaImportPlan(bytes) {
    const sheets = await W.xlsxRead(bytes);
    const norm = h => String(h || '').replace(/\s+/g, '');
    let pick = null;
    for (const [name, rows] of Object.entries(sheets)) {
      if (!rows || !rows.length) continue;
      const hs = rows[0].map(norm);
      if (hs.includes('存货编码') && (hs.includes('存货名称') || hs.includes('物料名称'))) { pick = { name: name, rows: rows }; break; }
    }
    if (!pick) {
      const first = Object.keys(sheets)[0];
      if (!first) throw new Error('文件里没有工作表');
      pick = { name: first, rows: sheets[first] || [] };
    }
    const rows = pick.rows || [];
    if (rows.length < 2) return { pickName: pick.name, headers: [], mapping: {}, plan: { add: [], upd: [], skip: 0, empty: true } };
    const headers = rows[0].map(h => String(h || '').trim());
    const mapping = W.guessMapping(headers, 'materials');
    if (mapping.name == null && mapping.code == null) throw new Error('未识别表头：需要「存货编码」或「存货名称」列');
    const classify = mp => {
      const plan = { add: [], upd: [], skip: 0 };
      const gv = (r, f) => mp[f] != null ? String(r[mp[f]] == null ? '' : r[mp[f]]).trim() : '';
      rows.slice(1).forEach(r => {
        const code = gv(r, 'code'), name = gv(r, 'name');
        if ((!code && !name) || name === '存货名称' || name === '物料名称') { plan.skip++; return; }
        const L = W.list('materials');
        const mt = (code && L.find(x => String(x.code || '').trim() === code)) || (name && L.find(x => x.name === name)) || null;
        const rec = { code: code, name: name || code, spec: gv(r, 'spec'), unit: gv(r, 'unit'), category: gv(r, 'category'), note: gv(r, 'note') };
        const safeRaw = gv(r, 'safe');
        if (safeRaw !== '' && W.num(safeRaw) > 0) rec.safe = W.num(safeRaw);
        if (mt) plan.upd.push({ id: mt.id, name: mt.name, rec: rec }); else plan.add.push({ rec: rec });
      });
      return plan;
    };
    return { pickName: pick.name, headers: headers, mapping: mapping, plan: classify(mapping), classify: classify };
  }

  /* 导入 UI：弹窗展示列映射 + 新增/更新统计，可改映射后重算，确认后落库 */
  async function oaImport(file) {
    let res;
    try { res = await oaImportPlan(new Uint8Array(await file.arrayBuffer())); }
    catch (e) { W.toast('导入失败：' + e.message); return; }
    if (res.plan.empty) { W.toast('「' + res.pickName + '」没有数据行'); return; }
    const mapDesc = { code: '存货编码', name: '存货名称', spec: '规格型号', unit: '单位', category: '物品分类', safe: '安全库存', note: '描述/备注' };
    const mapping = Object.assign({}, res.mapping);
    const opts = () => '<option value="-1">— 未映射 —</option>' + res.headers.map((h, i) => '<option value="' + i + '">' + W.esc(h || '列' + (i + 1)) + '</option>').join('');
    const mapGrid = () => Object.entries(mapDesc).map(([f, lb]) =>
      '<span class="h">' + lb + '</span><select data-mf="' + f + '">' + opts() + '</select>').join('');
    openModal(modalShell('⬆ 导入 OA 模板 · ' + W.esc(res.pickName), `
      <div class="imp-grid">${mapGrid()}</div>
      <p id="oaImpSummary"></p>
      <p class="muted">更新按「存货编码」精确匹配，其次「物料名称」；未映射或为空的列不会覆盖档案已有值。</p>
    `, '<button class="btn" onclick="closeModal()">取消</button><button class="btn pri" id="oaImpGo">确认导入</button>'));
    const summary = () => {
      const plan = res.classify(mapping);
      $('#oaImpSummary').innerHTML = '识别数据行：<b>' + (plan.add.length + plan.upd.length) + '</b> 条（<b>新增 ' + plan.add.length + '</b> · <b>更新 ' + plan.upd.length + '</b>），空行/示例行跳过 ' + plan.skip + ' 条。';
      return plan;
    };
    document.querySelectorAll('[data-mf]').forEach(sel => {
      if (mapping[sel.dataset.mf] != null) sel.value = mapping[sel.dataset.mf];
      sel.onchange = () => { mapping[sel.dataset.mf] = Number(sel.value) >= 0 ? Number(sel.value) : null; summary(); };
    });
    let plan = summary();
    $('#oaImpGo').onclick = async () => {
      plan = summary();
      if (!plan.add.length && !plan.upd.length) { W.toast('没有可导入的数据行'); return; }
      const records = [];
      plan.add.forEach(({ rec }) => records.push({ ...rec, id: W.uid('mat'), safe: rec.safe == null ? 0 : rec.safe }));
      plan.upd.forEach(({ id, rec }) => {
        const patch = { id };
        ['code', 'name', 'spec', 'unit', 'category', 'note'].forEach(k => { if (rec[k] !== '' && rec[k] != null) patch[k] = rec[k]; });
        if (rec.safe != null) patch.safe = rec.safe;
        records.push(patch);
      });
      try {
        const result = await W.importMaterials(records);
        const rejected = result.rejected || [];
        closeModal();
        if (rejected.length) {
          openModal(modalShell('📥 物料导入结果', `<p>成功 <b class="tag green">${(result.applied || []).length}</b> · 失败 <b class="tag red">${rejected.length}</b></p><div class="twrap" style="max-height:260px;margin-top:8px">${rejected.map(item => `<div class="logline">${W.esc(item.reason || '导入失败')}</div>`).join('')}</div>`, '<button class="btn pri" onclick="closeModal()">完成</button>'));
        } else W.toast('已导入 ' + (result.applied || []).length + ' 条物料');
        W.renderAll();
      } catch (error) { W.toast('导入失败：' + error.message); }
    };
  }

  /* ---------------- 模板 / 导入 ---------------- */
  /* OA请购提报模板 V1.0 示例行。 */
  function oaExampleRow() {
    return [1, '张三', '品质部', '品质一课', '李四', 'Jupiter', '量产', 'MP IPQC AOI', '自动光学检测', '耗材',
      'CL-000025', '无尘布', '9寸 100片/包', 'AOI 镜头与光源清洁用，无尘室级别', '包', 'L2 线体',
      10, 50, 0.8, W.today(), W.today(),
      '二期', '3F MP IPQC线边仓', '是', '王工', W.today(),
      '耗材', 'AOI 镜头每日清洁 1 包 × 2 线 × 25 天 = 50 包', '部门费用', '耗材费', '否', '待确认', '是', ''];
  }
  function templateRows(target) {
    if (target === 'materials') return [['存货编码', '存货名称', '规格型号', '单位', '物品分类', '安全库存', '描述（对物品详细解释）'], ['CL-000025', '无尘布', '9寸 100片/包', '包', '耗材', 20, 'IPQC 表面检查用']];
    if (target === 'purchases') return [OA_HEADERS];
    if (target === 'arrivals') return [['存货编码', '存货名称', '实际到货数量', '到货日期'], ['CL-000025', '无尘布', 50, W.today()]];
    if (target === 'members') return [
      ['姓名', '品集账号', '业务角色', '所属区域', '所属部门', '上级区域领用人', '指定审核人', '指定核准人', '审批模式', '启用状态'],
      ['领用人甲', 'area.lead', '区域领用人', 'MP IPQC', '品质部', '', '审核员甲', '核准员甲', '两级审批', '启用'],
      ['领用人乙', 'area.member', '隶属区域领用人', 'MP IPQC', '品质部', '领用人甲', '', '', '', '启用'],
      ['直接核准人员', 'direct.user', '区域领用人', 'OQC', '品质部', '', '', '核准员甲', '直接核准', '启用']
    ];
    return [['存货编码', '存货名称', '分发区域', '隶属区域负责人', '分发数量', '分发时间'], ['CL-000025', '无尘布', 'MP IPQC', '张三', 10, W.nowStr()]];
  }
  function downloadTemplate() {
    const target = $('#impTarget').value;
    const rows = templateRows(target);
    try {
      W.xlsxBuild([{ name: '导入模板', rows }]).then(bytes => {
        W.downloadBlob(bytes, `导入模板_${$('#impTarget').selectedOptions[0].text}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        W.toast('模板已下载');
      }).catch(e => {
        W.downloadBlob(new TextEncoder().encode(W.csvBuild(rows)), '导入模板.csv', 'text/csv');
        W.toast('当前环境不支持 xlsx，已下载 CSV 模板');
      });
    } catch (e) { W.downloadBlob(new TextEncoder().encode(W.csvBuild(rows)), '导入模板.csv', 'text/csv'); }
  }

  let impSession = null, impFileCache = null, syncFileCache = [], syncResult = '';
  function syncDefaultHtml() {
    const c = W.syncCounts(W._getState().data);
    const last = W.getLastExportAt();
    return '当前本机：' + c.total + ' 条记录（物料 ' + c.materials + ' · 申领 ' + c.purchases + ' · 到货 ' + c.arrivals
      + ' · 分发 ' + c.dispatches + ' · 签字 ' + c.signoffs + ' · 成员 ' + c.members + '）'
      + (last ? ' · 上次导出：' + new Date(last).toLocaleString() + '，之后的新改动可导出增量包' : ' · 尚未导出过，首次请导出「全部数据」');
  }
  async function importPreview() {
    const target = $('#impTarget').value;
    const inEl = $('#impFile');
    const fileIn = (inEl.files && inEl.files[0]) || impFileCache;
    if (!fileIn) { W.toast('请先选择文件'); return; }
    let rows;
    try {
      if (/\.csv$/i.test(fileIn.name)) {
        rows = W.csvParse(await fileIn.text());
      } else {
        const buf = new Uint8Array(await fileIn.arrayBuffer());
        const sheets = await W.xlsxRead(buf);
        const first = Object.keys(sheets)[0];
        if (!first) { W.toast('文件里没有工作表'); return; }
        rows = sheets[first];
      }
    } catch (e) { W.toast('解析失败：' + e.message); return; }
    if (!rows || rows.length < 2) { W.toast('文件没有数据行'); return; }
    const headers = rows[0].map(h => String(h || '').trim());
    const mapping = W.guessMapping(headers, target);
    impSession = { target, headers, rows: rows.slice(1), mapping };
    const fieldNames = {
      materials: { code: '存货编码', name: '存货名称*', spec: '规格型号', unit: '单位', category: '物品分类', safe: '安全库存', note: '描述/备注' },
      purchases: { code: '存货编码', materialName: '存货名称*', spec: '规格型号', unit: '单位', category: '物品分类', requestSource: '请购来源', qty: '请购数量*', date: '申请时间*', purpose: '申请原因/用途', dest: '地点/使用去向', dept: '申请部门' },
      arrivals: { code: '存货编码', materialName: '存货名称*', arrQty: '实际到货数量*', arrDate: '到货日期*' },
      dispatches: { code: '存货编码', materialName: '存货名称*', region: '分发区域*', subordinateLeaderName: '隶属区域负责人', qty: '分发数量*', at: '分发时间' },
      members: { name: '姓名*', username: '品集账号', role: '业务角色*', region: '所属区域', dept: '所属部门', supervisorName: '上级区域领用人', reviewerName: '指定审核人', approverName: '指定核准人', approvalMode: '审批模式', enabled: '启用状态' }
    }[target];
    const opts = h => `<option value="-1">— 未映射 —</option>` + headers.map((h2, i) => `<option value="${i}">${W.esc(h2 || '列' + (i + 1))}</option>`).join('');
    const grid = Object.entries(fieldNames).map(([f, label]) => `<span class="h">${label}</span><select data-field="${f}">${opts()}</select><span data-hit="${f}" class="muted">${mapping[f] != null ? '✓ ' + W.esc(headers[mapping[f]]) : '未识别'}</span>`).join('');
    $('#impArea').innerHTML = `
      <div class="imp-grid">${grid}</div>
      <div id="impPreview"></div>
      <button class="btn pri" id="btnImpGo">确认导入</button>`;
    $('#impArea').querySelectorAll('select[data-field]').forEach(sel => {
      if (mapping[sel.dataset.field] != null) sel.value = mapping[sel.dataset.field];
      sel.onchange = () => {
        impSession.mapping[sel.dataset.field] = Number(sel.value) >= 0 ? Number(sel.value) : null;
        const hit = $('#impArea').querySelector(`[data-hit="${sel.dataset.field}"]`);
        hit.textContent = sel.value >= 0 ? '✓ ' + headers[sel.value] : '未识别';
      };
    });
    $('#btnImpGo').onclick = importGo;
    doPreview();
  }
  function doPreview() {
    const { target, rows, mapping } = impSession;
    const pv = [];
    const need = Object.keys(mapping).filter(k => mapping[k] == null);
    for (let i = 0; i < Math.min(rows.length, 8); i++) {
      pv.push(`<tr><td>${i + 2}</td>${Object.keys(mapping).map(f => { const c = mapping[f] != null ? rows[i][mapping[f]] : ''; return `<td>${W.esc(c == null ? '' : c)}</td>`; }).join('')}</tr>`);
    }
    $('#impPreview').innerHTML = `<p class="muted">预览前 ${Math.min(rows.length, 8)} / ${rows.length} 行${need.length ? ` · ⚠ 未映射字段：${need.join('、')}` : ''}</p>
      <div class="twrap" style="max-height:200px"><table><thead><tr>${Object.keys(mapping).map(f => `<th>${f}</th>`).join('')}</tr></thead><tbody>${pv.join('')}</tbody></table></div>`;
  }
  function normalizeImportedRole(raw) {
    const value = String(raw || '').replace(/\s+/g, '');
    const aliases = {
      '审核': '审核员', '审核员': '审核员',
      '核准': '核准员', '核准员': '核准员',
      '区域领用': '区域领用人', '区域领用人': '区域领用人', '领用人': '区域领用人',
      '隶属区域领用': '隶属区域领用人', '隶属区域领用人': '隶属区域领用人',
      '隶属领用': '隶属区域领用人', '隶属领用人': '隶属区域领用人'
    };
    return aliases[value] || '';
  }
  function normalizeImportedRegion(raw) {
    const value = String(raw || '').trim();
    if (!value) return '';
    const norm = s => String(s || '').replace(/\s+/g, '').toUpperCase().replace(/期/g, '');
    return W.REGIONS.find(id => id === value || (W.REGION_LABEL[id] || '') === value)
      || W.REGIONS.find(id => norm(id) === norm(value))
      || W.REGIONS.find(id => norm(W.REGION_LABEL[id] || id).includes(norm(value)))
      || '';
  }
  function importedEnabled(raw) {
    const value = String(raw || '').trim();
    if (!value) return true;
    return !/^(停用|禁用|否|false|no|0)$/i.test(value);
  }
  function normalizeImportedApprovalMode(raw, hasReviewer, hasApprover) {
    const value = String(raw || '').replace(/\s+/g, '');
    if (!value) {
      if (hasReviewer && hasApprover) return W.APPROVAL_MODE_TWO_STEP;
      if (hasReviewer) return W.APPROVAL_MODE_REVIEW_ONLY;
      if (hasApprover) return W.APPROVAL_MODE_DIRECT_APPROVE;
      return '';
    }
    const aliases = {
      '两级审批': W.APPROVAL_MODE_TWO_STEP,
      '两级审核': W.APPROVAL_MODE_TWO_STEP,
      '审核核准': W.APPROVAL_MODE_TWO_STEP,
      '审核→核准': W.APPROVAL_MODE_TWO_STEP,
      'two_steps': W.APPROVAL_MODE_TWO_STEP,
      'two_step': W.APPROVAL_MODE_TWO_STEP,
      '直接核准': W.APPROVAL_MODE_DIRECT_APPROVE,
      '直接审批': W.APPROVAL_MODE_DIRECT_APPROVE,
      '跳过审核': W.APPROVAL_MODE_DIRECT_APPROVE,
      'direct_approve': W.APPROVAL_MODE_DIRECT_APPROVE,
      '仅审核': W.APPROVAL_MODE_REVIEW_ONLY,
      '只审核': W.APPROVAL_MODE_REVIEW_ONLY,
      '审核后完成': W.APPROVAL_MODE_REVIEW_ONLY,
      'review_only': W.APPROVAL_MODE_REVIEW_ONLY
    };
    return aliases[value] || '';
  }
  function importMembers() {
    const { rows, mapping } = impSession;
    if (!W.canManageMembers()) { W.toast('成员名单导入仅系统管理员可执行'); return; }
    if (mapping.name == null) { W.toast('姓名列必须映射'); return; }
    const gv = (row, field) => mapping[field] != null
      ? String(row[mapping[field]] == null ? '' : row[mapping[field]]).trim()
      : '';
    const parsed = [];
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      const name = gv(row, 'name');
      if (!name || name === '姓名' || name === '成员姓名') continue;
      const role = normalizeImportedRole(gv(row, 'role'));
      parsed.push({
        lineNo: index + 2,
        name,
        username: gv(row, 'username').toLowerCase(),
        role,
        roleRaw: gv(row, 'role'),
        regionRaw: gv(row, 'region'),
        dept: gv(row, 'dept'),
        supervisorName: gv(row, 'supervisorName'),
        reviewerName: gv(row, 'reviewerName'),
        approverName: gv(row, 'approverName'),
        approvalModeRaw: gv(row, 'approvalMode'),
        enabled: importedEnabled(gv(row, 'enabled')),
      });
    }

    let ok = 0;
    let fail = 0;
    const warnings = [];
    const errors = [];
    const subordinates = [];
    const savedMembers = [];
    for (const item of parsed) {
      try {
        if (!item.role) throw new Error(`业务角色「${item.roleRaw || '空'}」无效`);
        item.region = normalizeImportedRegion(item.regionRaw);
        if (['区域领用人', '隶属区域领用人'].includes(item.role) && !item.region) {
          throw new Error(`区域「${item.regionRaw || '空'}」无效`);
        }
        if (item.role === '隶属区域领用人') { subordinates.push(item); continue; }
        const existing = W.list('members').find(member =>
          (item.username && String(member.username || '').toLowerCase() === item.username)
          || (!item.username && String(member.name || '').trim() === item.name));
        const saved = W.upsert('members', {
          id: existing ? existing.id : undefined,
          name: item.name,
          username: item.username,
          role: item.role,
          region: item.region,
          dept: item.dept,
          supervisorId: '',
          enabled: item.enabled,
        }, `导入成员：${item.name}（${item.role}）`);
        item.memberId = saved.id;
        savedMembers.push(item);
        if (existing) warnings.push(`行${item.lineNo}：已更新成员「${item.name}」`);
        ok += 1;
      } catch (error) {
        fail += 1;
        errors.push(`行${item.lineNo}：${error.message}`);
      }
    }
    for (const item of subordinates) {
      try {
        const supervisor = W.list('members').find(member =>
          member.role === '区域领用人'
          && member.enabled !== false
          && String(member.name || '').trim() === item.supervisorName
          && String(member.region || '') === item.region);
        if (!supervisor) throw new Error(`上级区域领用人「${item.supervisorName || '空'}」不存在或不属于同一区域`);
        const existing = W.list('members').find(member =>
          (item.username && String(member.username || '').toLowerCase() === item.username)
          || (!item.username && String(member.name || '').trim() === item.name));
        const saved = W.upsert('members', {
          id: existing ? existing.id : undefined,
          name: item.name,
          username: item.username,
          role: item.role,
          region: item.region,
          dept: item.dept,
          supervisorId: supervisor.id,
          enabled: item.enabled,
        }, `导入成员：${item.name}（${item.role}，上级 ${supervisor.name}）`);
        item.memberId = saved.id;
        savedMembers.push(item);
        if (existing) warnings.push(`行${item.lineNo}：已更新成员「${item.name}」`);
        ok += 1;
      } catch (error) {
        fail += 1;
        errors.push(`行${item.lineNo}：${error.message}`);
      }
    }

    let routeFail = 0;
    for (const item of savedMembers) {
      if (!item.reviewerName && !item.approverName && !item.approvalModeRaw) continue;
      const member = W.get('members', item.memberId);
      if (!member) { routeFail += 1; errors.push(`行${item.lineNo}：成员已保存，但找不到成员记录，审批路由未写入`); continue; }
      const findManager = (raw, role) => {
        const key = String(raw || '').trim().toLowerCase();
        if (!key) return null;
        return W.list('members').find(candidate => candidate.enabled !== false && candidate.role === role && (
          String(candidate.id || '').toLowerCase() === key
          || String(candidate.username || '').trim().toLowerCase() === key
          || String(candidate.name || '').trim().toLowerCase() === key
        )) || null;
      };
      const reviewer = findManager(item.reviewerName, '审核员');
      const approver = findManager(item.approverName, '核准员');
      const mode = normalizeImportedApprovalMode(item.approvalModeRaw, Boolean(item.reviewerName), Boolean(item.approverName));
      if (!mode) {
        routeFail += 1;
        errors.push(`行${item.lineNo}：审批模式「${item.approvalModeRaw || '空'}」无效，成员已保存但审批路由未更新`);
        continue;
      }
      if ((mode === W.APPROVAL_MODE_TWO_STEP || mode === W.APPROVAL_MODE_REVIEW_ONLY) && !reviewer) {
        routeFail += 1;
        errors.push(`行${item.lineNo}：指定审核人「${item.reviewerName || '空'}」不存在、已停用或角色不是审核员`);
        continue;
      }
      if ((mode === W.APPROVAL_MODE_TWO_STEP || mode === W.APPROVAL_MODE_DIRECT_APPROVE) && !approver) {
        routeFail += 1;
        errors.push(`行${item.lineNo}：指定核准人「${item.approverName || '空'}」不存在、已停用或角色不是核准员`);
        continue;
      }
      W.upsert('members', {
        id: member.id,
        approvalMode: mode,
        reviewerId: (mode === W.APPROVAL_MODE_TWO_STEP || mode === W.APPROVAL_MODE_REVIEW_ONLY) && reviewer ? reviewer.id : '',
        approverId: (mode === W.APPROVAL_MODE_TWO_STEP || mode === W.APPROVAL_MODE_DIRECT_APPROVE) && approver ? approver.id : ''
      }, `导入审批路由：${member.name} → ${W.APPROVAL_MODE_LABELS[mode]}${reviewer ? '；审核 ' + reviewer.name : ''}${approver ? '；核准 ' + approver.name : ''}`);
    }
    openModal(modalShell('📥 成员名单导入结果', `
      <p>成员写入 <b class="tag green">${ok}</b> · 成员失败 <b class="tag ${fail ? 'red' : 'gray'}">${fail}</b> · 路由失败 <b class="tag ${routeFail ? 'red' : 'gray'}">${routeFail}</b> · 更新提示 <b class="tag ${warnings.length ? 'yellow' : 'gray'}">${warnings.length}</b></p>
      <div class="twrap" style="max-height:260px;margin-top:8px">${[...warnings, ...errors].length ? [...warnings, ...errors].map(message => `<div class="logline">${W.esc(message)}</div>`).join('') : '<p class="empty">全部导入成功</p>'}</div>
    `, `<button class="btn pri" onclick="closeModal()">完成</button>`));
    W.toast(`成员导入完成：成员写入 ${ok}，失败 ${fail}，审批路由失败 ${routeFail}`);
  }
  async function importMaterialRows() {
    const { rows, mapping } = impSession;
    if (!W.canImportMaterials()) { W.toast('只有成员名单中的已登记人员或管理员可以导入物料档案'); return; }
    if (mapping.name == null && mapping.code == null) { W.toast('存货编码或物料名称列必须至少映射一个'); return; }
    const records = [];
    const parseErrors = [];
    rows.forEach((row, index) => {
      const value = field => mapping[field] != null ? String(row[mapping[field]] == null ? '' : row[mapping[field]]).trim() : '';
      const code = value('code');
      const name = value('name');
      if ((!code && !name) || name === '存货名称' || name === '物料名称') return;
      const existing = (code && W.list('materials').find(material => String(material.code || '').trim() === code))
        || (name && W.list('materials').find(material => String(material.name || '').trim() === name))
        || null;
      if (!existing && !name && !code) {
        parseErrors.push(`行${index + 2}：物料名称为空`);
        return;
      }
      const record = { id: existing ? existing.id : W.uid('mat'), name: name || code };
      const optional = { code, spec: value('spec'), unit: value('unit'), category: value('category'), note: value('note') };
      for (const [key, val] of Object.entries(optional)) {
        if (existing && !val) continue;
        record[key] = val;
      }
      const safe = value('safe');
      if (safe !== '') record.safe = W.num(safe);
      else if (!existing) record.safe = 0;
      records.push(record);
    });
    if (parseErrors.length) {
      openModal(modalShell('📥 物料导入结果', `<p>有 <b class="tag red">${parseErrors.length}</b> 行无法解析</p><div class="twrap" style="max-height:260px;margin-top:8px">${parseErrors.map(error => `<div class="logline">${W.esc(error)}</div>`).join('')}</div>`, '<button class="btn pri" onclick="closeModal()">完成</button>'));
      return;
    }
    try {
      const result = await W.importMaterials(records);
      const applied = result.applied || [];
      const rejected = result.rejected || [];
      openModal(modalShell('📥 物料导入结果', `
        <p>成功 <b class="tag green">${applied.length}</b> · 失败 <b class="tag ${rejected.length ? 'red' : 'gray'}">${rejected.length}</b></p>
        <div class="twrap" style="max-height:260px;margin-top:8px">${rejected.length ? rejected.map(item => `<div class="logline">${W.esc(item.reason || '导入失败')}</div>`).join('') : '<p class="empty">全部导入成功</p>'}</div>
      `, '<button class="btn pri" onclick="closeModal()">完成</button>'));
      W.toast(`物料导入完成：成功 ${applied.length}，失败 ${rejected.length}`);
    } catch (error) { W.toast('导入失败：' + error.message); }
  }
  async function importGo() {
    const { target, rows, mapping } = impSession;
    if (target === 'members') { importMembers(); return; }
    if (target === 'materials') { await importMaterialRows(); return; }
    if (target === 'purchases') {
      if (mapping.code == null && mapping.materialName == null) { W.toast('模板缺少“存货编码”或“物料名称”列'); return; }
      if (mapping.qty == null) { W.toast('模板缺少“申领数量”列'); return; }
      if (mapping.date == null) { W.toast('模板缺少“申领日期”列'); return; }
      const result = importPurchaseRows(rows, mapping);
      purchaseImportResult(result);
      W.toast(`申领导入完成：成功 ${result.ok}，失败 ${result.fail}`);
      return;
    }
    if (['arrivals', 'dispatches'].includes(target) && !W.SYNC.admin) { W.toast('历史到货/分发链路导入仅管理员可执行'); return; }
    if (mapping.name == null && mapping.materialName == null) { W.toast('物料名称列必须映射'); return; }
    let ok = 0, fail = 0, warn = 0;
    const errs = [];
    rows.forEach((r, idx) => {
      const lineNo = idx + 2;
      const gv = f => mapping[f] != null ? String(r[mapping[f]] == null ? '' : r[mapping[f]]).trim() : '';
      try {
        const code = gv('code');
        const matName = gv('name') || gv('materialName');
        if ((!matName && !code) || matName === '存货名称' || matName === '物料名称') return;   // 跳过示例/空行
        const spec = gv('spec'), unit = gv('unit'), category = gv('category');
        const L = W.list('materials');
        // 物料匹配：存货编码精确优先 → 名称精确兜底
        let mt = (code && L.find(x => String(x.code || '').trim() === code)) ||
          (matName && L.find(x => x.name === matName)) || null;
        if (!mt && target !== 'materials') {
          mt = W.upsert('materials', { code, name: matName || code, spec, unit, category }, `导入时自动创建物料：${matName || code}`);
          warn++; errs.push(`行${lineNo}：物料「${matName || code}」不存在，已按 OA 信息自动创建档案`);
        }
        if (target === 'materials') {
          W.upsert('materials', { id: mt ? mt.id : undefined, code, name: matName || code, spec, unit, category, safe: W.num(gv('safe')), note: gv('note') }, `导入物料：${matName || code}`); ok++;
        } else if (target === 'arrivals') {
          const qty = W.num(gv('arrQty'));
          if (qty <= 0) throw new Error('到货数量无效');
          const arrDate = W.normDate(gv('arrDate')) || W.today();
          const purchase = W.upsert('purchases', { mid: mt.id, qty, date: arrDate, purpose: '导入到货自动关联', dest: '', dept: '', approvalStatus: W.APPROVAL_APPROVED, approvedBy: W.me().name || '导入', approvedAt: W.nowStr(), approvalComment: '历史导入自动核准' }, `导入到货补建申领：${matName} ×${W.fmtQty(qty)}`);
          W.upsert('arrivals', { pid: purchase.id, mid: mt.id, arrQty: qty, arrDate }, `导入到货：${matName} ×${W.fmtQty(qty)}`); ok++;
        } else if (target === 'dispatches') {
          const qty = W.num(gv('qty'));
          const regionRaw = gv('region').trim();
          const rn = s => String(s || '').replace(/\s+/g, '').toUpperCase().replace(/期/g, '');
          const region = W.REGIONS.find(x => regionRaw === x || regionRaw === (W.REGION_LABEL[x] || ''))
            || W.REGIONS.find(x => rn(regionRaw) && rn(regionRaw) === rn(x))
            || W.REGIONS.find(x => rn(regionRaw) && rn(x) && rn(regionRaw).includes(rn(x)));
          if (!region) throw new Error(`区域「${gv('region')}」无效（当前可选：${W.REGIONS.map(r => W.REGION_LABEL[r] || r).join('、')}，可在设置页维护清单）`);
          if (qty <= 0) throw new Error('分发数量无效');
          const at = W.normDate(gv('at')) || W.nowStr();
          const purchase = W.upsert('purchases', { mid: mt.id, qty, date: at.slice(0, 10), purpose: '导入分发自动补链', dest: '', dept: '', approvalStatus: W.APPROVAL_APPROVED, approvedBy: W.me().name || '导入', approvedAt: W.nowStr(), approvalComment: '历史导入自动核准' }, `导入分发补建申领：${matName} ×${W.fmtQty(qty)}`);
          const arrival = W.upsert('arrivals', { pid: purchase.id, mid: mt.id, arrQty: qty, arrDate: at.slice(0, 10) }, `导入分发补建到货：${matName} ×${W.fmtQty(qty)}`);
          W.upsert('receipts', { aid: arrival.id, recvQty: qty, recvBy: W.me().name || '导入', recvAt: at }, `导入分发补建签收：${matName} ×${W.fmtQty(qty)}`);
          const claimant = W.membersForRegion(region)[0];
          if (!claimant) throw new Error(`区域「${W.REGION_LABEL[region] || region}」没有可用的区域领用人，无法导入分发`);
          W.upsert('dispatches', { aid: arrival.id, mid: mt.id, region, dept: claimant.dept || '', subordinateLeaderName: gv('subordinateLeaderName'), qty, at, byWho: W.me().name || '导入', claimantId: claimant.id, claimantName: claimant.name }, `导入分发：${matName} →${region} ${claimant.name} ×${W.fmtQty(qty)}`); ok++;
        }
      } catch (e) { fail++; errs.push(`行${lineNo}：${e.message}`); }
    });
    W.saveState();
    openModal(modalShell('📥 导入结果', `
      <p>成功 <b class="tag green">${ok}</b> · 失败 <b class="tag ${fail ? 'red' : 'gray'}">${fail}</b> · 提示 <b class="tag ${warn ? 'yellow' : 'gray'}">${warn}</b></p>
      <div class="twrap" style="max-height:240px;margin-top:8px">${errs.length ? errs.map(e => `<div class="logline">${W.esc(e)}</div>`).join('') : '<p class="empty">全部导入成功</p>'}</div>
    `, `<button class="btn pri" onclick="closeModal()">完成</button>`));
    W.toast(`导入完成：成功 ${ok}，失败 ${fail}`);
  }

  /* ---------------- 导出全部 / CSV ---------------- */
  async function exportAll() {
    const L = W.list.bind(W), G = W.get.bind(W);
    const matName = id => { const m = G('materials', id); return m ? m.name : ''; };
    const sheets = [
      { name: '物料档案', rows: [['存货编码', '存货名称', '规格型号', '单位', '物品分类', '安全库存', '描述/备注'], ...L('materials').map(m => [m.code, m.name, m.spec, m.unit, m.category, m.safe, m.note])] },
      { name: '成员名单', rows: [['姓名', '品集账号', '业务角色', '所属区域', '所属部门', '上级区域领用人', '指定审核人', '指定核准人', '审批模式', '启用状态'], ...L('members').sort((a, b) => String(a.name).localeCompare(String(b.name))).map(member => { const supervisor = member.supervisorId ? G('members', member.supervisorId) : null; const reviewer = member.reviewerId ? G('members', member.reviewerId) : null; const approver = member.approverId ? G('members', member.approverId) : null; return [member.name, member.username || '', member.role, W.REGION_LABEL[member.region] || member.region || '', member.dept || '', supervisor ? supervisor.name : '', reviewer ? reviewer.name : '', approver ? approver.name : '', W.APPROVAL_MODE_LABELS[member.approvalMode] || '', member.enabled === false ? '停用' : '启用']; })] },
      { name: '申领台账', rows: [['申领日期', '存货编码', '存货名称', '规格型号', '请购来源', '申领数量', '已到货', '状态', '用途说明', '使用去向', '申请部门', '申请人', '指定审核人', '指定核准人', '审批模式', '实际审核人', '实际核准人'], ...L('purchases').sort((a, b) => String(a.date).localeCompare(String(b.date))).map(p => { const mt = G('materials', p.mid); return [p.date, mt ? mt.code : '', matName(p.mid), mt ? mt.spec : '', W.purchaseRequestSource(p), p.qty, W.fmtQty(W.arrivalsOf(p.id).reduce((s, a) => s + W.num(a.arrQty), 0)), W.purchaseStatus(p), p.purpose, p.dest, p.dept || '', p.by, p.reviewerName || '', p.approverName || '', W.APPROVAL_MODE_LABELS[p.approvalMode] || '', p.reviewedBy || '', p.approvedBy || '']; })] },
      { name: '到货签收', rows: [['到货日期', '存货编码', '存货名称', '到货数量', '签收状态', '实收数量', '签收人', '签收时间'], ...L('arrivals').sort((a, b) => String(a.arrDate).localeCompare(String(b.arrDate))).map(a => { const rc = W.receiptOf(a.id); const mt = G('materials', a.mid); return [a.arrDate, mt ? mt.code : '', matName(a.mid), a.arrQty, rc ? '已签收' : '待签收', rc ? rc.recvQty : '', rc ? rc.recvBy : '', rc ? rc.recvAt : '']; })] },
      { name: '分发领用', rows: [['分发时间', '存货编码', '存货名称', '分发区域', '隶属区域负责人', '分发数量', '分发人', '确认状态', '领用人', '签名时间'], ...L('dispatches').sort((a, b) => String(a.at).localeCompare(String(b.at))).map(d => { const s = W.signoffOf(d.id); const mt = G('materials', d.mid); return [d.at, mt ? mt.code : '', matName(d.mid), W.REGION_LABEL[d.region] || d.region, d.subordinateLeaderName || d.dept || '', d.qty, d.byWho, s ? '已确认' : '待领用确认', s ? s.signer : '', s ? s.sigAt : '']; })] },
      { name: '操作日志', rows: [['时间', '操作人', '动作', '对象', '详情'], ...L('logs').sort((a, b) => a.ts - b.ts).map(l => [new Date(l.ts).toLocaleString('zh-CN'), l.by, l.action, l.entity, l.detail])] }
    ];
    try {
      const bytes = await W.xlsxBuild(sheets);
      W.downloadBlob(bytes, `物资申领追溯台账_${W.today()}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      W.logOp('导出', 'all', '', '导出全部台账 Excel'); W.saveState();
      W.toast('已导出');
    } catch (e) { W.toast('导出失败：' + e.message); }
  }
  function exportCsv() {
    const rows = [['类型', '日期', '存货编码', '物料', '数量', '区域', '状态', '经手人', '用途/详情']];
    for (const p of W.list('purchases')) { const mt = W.get('materials', p.mid); rows.push(['申领', p.date, mt ? (mt.code || '') : '', mt ? mt.name : '', p.qty, '', W.purchaseStatus(p), p.by, (p.purpose || '') + ' ' + (p.dest || '')]); }
    for (const a of W.list('arrivals')) { const rc = W.receiptOf(a.id); const mt = W.get('materials', a.mid); rows.push(['到货', a.arrDate, mt ? (mt.code || '') : '', mt ? mt.name : '', a.arrQty, '', rc ? '已签收' : '待签收', rc ? rc.recvBy : a.by, '']); }
    for (const d of W.list('dispatches')) { const s = W.signoffOf(d.id); const mt = W.get('materials', d.mid); rows.push(['分发', d.at, mt ? (mt.code || '') : '', mt ? mt.name : '', d.qty, W.REGION_LABEL[d.region] || d.region, s ? '已确认' : '待领用确认', s ? s.signer : d.byWho, '']); }
    W.downloadBlob(new TextEncoder().encode(W.csvBuild(rows)), `物资台账_${W.today()}.csv`, 'text/csv');
    W.toast('CSV 已导出');
  }

  /* ---------------- 备份恢复 ---------------- */
  async function downloadBackup() {
    let data;
    if (W.SYNC.mode === 'server') {
      try {
        const r = await fetch(W.SYNC.server + '/api/store');
        data = await r.json();
      } catch (e) { W.toast('拉取云端数据失败'); return; }
    } else data = W._getState();
    W.downloadBlob(new TextEncoder().encode(JSON.stringify(data, null, 1)), `store_备份_${W.today()}.json`, 'application/json');
    W.toast('备份已下载');
  }
  async function restoreBackup() {
    const f = $('#restoreFile').files[0];
    if (!f) { W.toast('请先选择备份 json 文件'); return; }
    if (!W.SYNC.admin) { W.toast('整库恢复仅限管理员'); return; }
    if (!confirm('⚠️ 恢复会用备份文件整体覆盖当前云端数据，确定继续？')) return;
    if (!confirm('再次确认：此操作不可撤销，建议先「下载整库备份」。确定恢复？')) return;
    try {
      const txt = await f.text();
      const parsed = JSON.parse(txt);
      const restored = W.normalize(parsed);
      if (W.SYNC.mode !== 'server') { W.toast('请先连接品集共享服务后再恢复'); return; }
      const response = await fetch(W.SYNC.server + '/api/restore', {
        method: 'POST',
        headers: W.cloudHeaders({ 'content-type': 'application/json' }),
        body: JSON.stringify({ confirm: 'REPLACE_ALL', data: restored.data })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || ('HTTP ' + response.status));
      await W.pullStore(true);
      W.renderAll();
      W.toast('整库恢复完成');
    } catch (error) {
      W.toast('恢复失败：' + error.message);
    }
  }

  /* ---------------- 接线 ---------------- */
  W.testHooks = { templateRows, OA_HEADERS, purchaseTemplateHeaders: OA_HEADERS };
  document.querySelectorAll('#tabs button').forEach(b => b.onclick = () => switchTab(b.dataset.tab));
  $('#meChip').onclick = showMeModal;
  $('#syncPill').onclick = () => { switchTab('settings'); };
  $('#modalMask').addEventListener('click', e => { if (e.target === $('#modalMask')) closeModal(); });

  try { const h = (location.hash || '').match(/#tab=(\w+)/); if (h) curTab = h[1]; } catch (e) { }
  const initial = curTab;
  W.onRender(() => {
    try {
      if (!W.me().name) ensureIdentity();
      if (curTab !== initial) { /* 保持当前页签 */ }
      switch (curTab) {
        case 'dashboard': renderDashboard(); break;
        case 'materials': renderMaterials(); break;
        case 'purchases': renderPurchases(); break;
        case 'arrivals': renderArrivals(); break;
        case 'dispatch': renderDispatch(); break;
        case 'query': renderQuery(); break;
        case 'settings': renderSettings(); break;
      }
      const meB = $('#meName'); if (meB) meB.textContent = W.me().name ? `${W.me().name} · ${W.scopeLabel()}` : '未设置身份';
      const purchaseTab = document.querySelector('#tabs [data-tab="purchases"]');
      if (purchaseTab) {
        const pending = W.pendingDocs();
        const myApprovals = pending['待审核'].filter(W.canReviewPurchase).length + pending['待核准'].filter(W.canApprovePurchase).length;
        purchaseTab.textContent = '申领台账' + (myApprovals ? ` · 待办 ${myApprovals}` : '');
      }
    } catch (e) { console.error(e); if (window.PAGE_ERRORS != null) window.PAGE_ERRORS++; }
  });
  window.__TEST__ = Object.assign({}, window.__TEST__, { oaExportBytes: oaExportBytes, oaImportPlan: oaImportPlan });
  switchTab(['dashboard', 'materials', 'purchases', 'arrivals', 'dispatch', 'query', 'settings'].includes(initial) ? initial : 'dashboard');
})();
