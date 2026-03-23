// ═══════════════════════════════════════════════════════
// RAW MATERIAL MODULE — Full RM planning
// ═══════════════════════════════════════════════════════

async function renderRawMaterial() {
  const area = document.getElementById('content-area');
  area.innerHTML = loading();

  const [rmStock, rmPOs, shifts, articles, orderLines] = await Promise.all([
    DB.getRMStock(), DB.getRMPOs(), DB.getShifts({ from: today() }),
    DB.getArticles(), DB.getAllOrderLines()
  ]);

  window._articles = articles;
  window._rmStock  = rmStock;
  window._rmShifts = shifts;

  // Normalise order lines
  const pendingLines = orderLines.filter(l => {
    const bal = (l.qty_ordered||0) - (l.qty_dispatched||0);
    if (bal <= 0) return false;
    const ord = Array.isArray(l.orders) ? l.orders[0] : l.orders;
    if (!ord) return false;
    return ['pending','partial','in_production'].includes((ord.status||'').toLowerCase());
  }).map(l => ({ ...l, orders: Array.isArray(l.orders) ? l.orders[0] : l.orders }));

  const orderRM  = buildOrderRM(pendingLines, articles);
  const colourRM = buildColourRM(orderRM, rmStock);
  const shiftRM  = buildShiftRM(shifts, articles, rmStock);

  window._orderRM  = orderRM;
  window._colourRM = colourRM;

  const overdueAlerts = rmPOs.filter(p => p.status === 'pending' && p.expected_arrival < today());

  area.innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-header-title">Raw Material Planning</div>
        <div class="page-header-sub">Order-wise requirements, colour totals & machine capacity planning</div>
      </div>
      <div style="display:flex;gap:10px">
        <button class="btn-secondary" onclick="openUpdateStockModal()">Update Stock</button>
        <button class="btn-primary" onclick="openRaisePOModal()">+ Raise PO</button>
      </div>
    </div>

    ${overdueAlerts.length ? `<div class="error-box">🚨 ${overdueAlerts.length} PO(s) overdue — contact supplier immediately.</div>` : ''}

    <div style="overflow-x:auto"><div class="tabs" style="width:max-content;flex-wrap:nowrap">
      <button class="tab active" onclick="showRMTab(this,'overview')">Overview</button>
      <button class="tab" onclick="showRMTab(this,'orderwise')">Order-wise</button>
      <button class="tab" onclick="showRMTab(this,'colourwise')">Colour-wise</button>
      <button class="tab" onclick="showRMTab(this,'capacity')">Capacity Planner</button>
      <button class="tab" onclick="showRMTab(this,'pos')">Purchase Orders</button>
    </div>
    </div></div>
    <div id="rm-tab-content">${renderRMOverview(rmStock, colourRM, shiftRM)}</div>

    ${renderRaisePOModal(rmStock)}
    ${renderUpdateStockModal(rmStock)}
  `;

  window._allPOs = rmPOs;
}

// ─── DATA BUILDERS ────────────────────────────────────────────────────────────
function buildOrderRM(lines, articles) {
  const orders = {};
  lines.forEach(l => {
    const ord = l.orders;
    const oid = l.order_id;
    const bal = (l.qty_ordered||0) - (l.qty_dispatched||0);
    if (!orders[oid]) orders[oid] = {
      order_id: oid, party: ord?.master_parties?.party_name||'Unknown',
      pool: ord?.pool||'general', status: ord?.status||'', lines: []
    };
    const art   = articles.find(a => a.id === l.article_id);
    const rmKg  = art?.compound_per_pair_g ? (art.compound_per_pair_g * bal) / 1000 : 0;
    orders[oid].lines.push({
      article_id: l.article_id, colour: l.colour, size: l.size,
      bal, rmKg, compound_per_pair_g: art?.compound_per_pair_g || 0
    });
  });

  return Object.values(orders).map(o => {
    const byAC = {};
    o.lines.forEach(l => {
      const key = `${l.article_id}__${l.colour}`;
      if (!byAC[key]) byAC[key] = { article_id:l.article_id, colour:l.colour, totalPairs:0, totalRmKg:0, compound_per_pair_g:l.compound_per_pair_g };
      byAC[key].totalPairs += l.bal;
      byAC[key].totalRmKg  += l.rmKg;
    });
    return {
      ...o,
      byArtColour: Object.values(byAC),
      totalPairs: o.lines.reduce((s,l)=>s+l.bal,0),
      totalRmKg:  o.lines.reduce((s,l)=>s+l.rmKg,0)
    };
  }).sort((a,b) => b.totalRmKg - a.totalRmKg);
}

function buildColourRM(orderRM, rmStock) {
  const byColour = {};
  orderRM.forEach(o => o.byArtColour.forEach(ac => {
    if (!byColour[ac.colour]) byColour[ac.colour] = { colour:ac.colour, totalPairs:0, totalRmKg:0, articles:new Set(), orderCount:0 };
    byColour[ac.colour].totalPairs  += ac.totalPairs;
    byColour[ac.colour].totalRmKg   += ac.totalRmKg;
    byColour[ac.colour].articles.add(ac.article_id);
    byColour[ac.colour].orderCount++;
  }));
  return Object.values(byColour).map(c => {
    const stk = rmStock.find(r=>r.compound_colour===c.colour);
    c.inStock   = stk?.qty_kg || 0;
    c.shortfall = Math.max(0, c.totalRmKg - c.inStock);
    c.sufficient = c.inStock >= c.totalRmKg;
    return c;
  }).sort((a,b) => b.totalRmKg - a.totalRmKg);
}

function buildShiftRM(shifts, articles, rmStock) {
  return shifts.filter(s=>s.status!=='completed').map(s => {
    const colours      = [s.colour_1, s.colour_mode==='dual'?s.colour_2:null].filter(Boolean);
    const capPerColour = s.target_pairs_colour_1 || 0;
    const avgCompound  = articles.filter(a=>a.compound_per_pair_g>0).reduce((sum,a,_,arr)=>sum+a.compound_per_pair_g/arr.length,0);
    const rmPerColour  = {};
    colours.forEach(c => {
      const needed = (avgCompound * capPerColour) / 1000;
      rmPerColour[c] = { needed, inStock:rmStock.find(r=>r.compound_colour===c)?.qty_kg||0 };
      rmPerColour[c].sufficient = rmPerColour[c].inStock >= needed;
      rmPerColour[c].shortfall  = Math.max(0, needed - rmPerColour[c].inStock);
    });
    const poDeadline = addDays(s.shift_date, -cfg('rmLead'));
    return { shift_id:s.id, shift_date:s.shift_date, status:s.status, colours, capPerColour, rmPerColour, poDeadline, poOverdue:poDeadline<today(), poDaysLeft:daysDiff(poDeadline,today()) };
  });
}

// ═══ TAB ROUTER ══════════════════════════════════════════════════════════════
function showRMTab(btn, tab) {
  document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
  btn.classList.add('active');
  const el = document.getElementById('rm-tab-content');
  if (tab==='overview')  el.innerHTML = renderRMOverview(window._rmStock, window._colourRM, buildShiftRM(window._rmShifts||[], window._articles||[], window._rmStock||[]));
  if (tab==='orderwise') el.innerHTML = renderOrderWise(window._orderRM);
  if (tab==='colourwise')el.innerHTML = renderColourWise(window._colourRM);
  if (tab==='capacity')  el.innerHTML = renderCapacityPlanning(window._colourRM, window._rmStock, window._articles||[]);
  if (tab==='pos')       el.innerHTML = renderPOTab(window._allPOs||[]);
}

// ═══ OVERVIEW ════════════════════════════════════════════════════════════════
function renderRMOverview(rmStock, colourRM, shiftRM) {
  const totalShortfall = (colourRM||[]).reduce((s,c)=>s+c.shortfall,0);
  const coloursAtRisk  = (colourRM||[]).filter(c=>!c.sufficient).length;
  const urgentShifts   = (shiftRM||[]).filter(s=>s.poOverdue||s.poDaysLeft<=3).length;
  const totalStock     = rmStock.reduce((s,r)=>s+r.qty_kg,0);

  return `
    <div class="stat-grid">
      <div class="stat-card blue"><div class="stat-icon">🧪</div><div class="stat-label">Total RM in Stock</div><div class="stat-value">${totalStock.toFixed(0)} kg</div><div class="stat-sub">All colours combined</div></div>
      <div class="stat-card ${coloursAtRisk>0?'red':'green'}"><div class="stat-icon">${coloursAtRisk>0?'⚠️':'✅'}</div><div class="stat-label">Colours Short</div><div class="stat-value">${coloursAtRisk}</div><div class="stat-sub">Insufficient for orders</div></div>
      <div class="stat-card ${totalShortfall>0?'orange':'green'}"><div class="stat-icon">📉</div><div class="stat-label">Total Shortfall</div><div class="stat-value">${totalShortfall.toFixed(1)} kg</div><div class="stat-sub">Needs to be ordered</div></div>
      <div class="stat-card ${urgentShifts>0?'red':'green'}"><div class="stat-icon">⏰</div><div class="stat-label">Urgent POs</div><div class="stat-value">${urgentShifts}</div><div class="stat-sub">Shifts needing PO now</div></div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(360px,1fr));gap:16px">
      <div class="card">
        <div class="card-title">Stock vs Order Requirements</div>
        ${rmStock.map(r => {
          const needed = (colourRM||[]).find(c=>c.colour===r.compound_colour)?.totalRmKg||0;
          const pct    = needed>0 ? Math.min(100,Math.round((r.qty_kg/needed)*100)) : 100;
          const s      = r.qty_kg<20?'critical':r.qty_kg<needed?'low':'ok';
          return `
            <div style="margin-bottom:14px">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px">
                <span style="display:flex;align-items:center;gap:7px">
                  <span style="width:10px;height:10px;border-radius:50%;background:${COLOUR_HEX[r.compound_colour]||'#888'};border:1px solid rgba(0,0,0,0.1);display:inline-block;flex-shrink:0"></span>
                  <span style="font-weight:600">${r.compound_colour}</span>
                </span>
                <div style="display:flex;align-items:center;gap:8px">
                  <span class="mono" style="font-size:12px">${r.qty_kg} kg in stock</span>
                  <span class="badge ${s==='critical'?'low':s==='low'?'partial':'ok'}">${s==='critical'?'Critical':s==='low'?'Low':'OK'}</span>
                </div>
              </div>
              <div class="progress-bar">
                <div class="progress-fill ${s==='ok'?'green':s==='low'?'yellow':'red'}" style="width:${pct}%"></div>
              </div>
              <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--ink3);margin-top:3px">
                <span>In stock: ${r.qty_kg}kg</span>
                ${needed>0?`<span>Orders need: ${needed.toFixed(1)}kg</span>`:'<span style="color:var(--green)">No pending orders</span>'}
              </div>
            </div>`;
        }).join('')}
      </div>
      <div class="card">
        <div class="card-title">Upcoming Shift PO Deadlines</div>
        ${shiftRM.length ? shiftRM.slice(0,6).map(s=>`
          <div style="background:${s.poOverdue?'var(--red-bg)':s.poDaysLeft<=3?'var(--amber-bg)':'var(--surface2)'};border:1px solid ${s.poOverdue?'rgba(220,38,38,0.2)':s.poDaysLeft<=3?'rgba(217,119,6,0.2)':'var(--line)'};border-radius:8px;padding:12px;margin-bottom:8px">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
              <strong>${fmtDate(s.shift_date)}</strong>
              <span class="badge ${s.poOverdue?'low':s.poDaysLeft<=3?'partial':'ok'}">${s.poOverdue?'OVERDUE':s.poDaysLeft<=0?'TODAY':s.poDaysLeft+'d left'}</span>
            </div>
            ${s.colours.map(c=>`<div style="font-size:12px;color:var(--ink2);margin-top:3px"><span style="width:7px;height:7px;border-radius:50%;background:${COLOUR_HEX[c]||'#888'};display:inline-block;margin-right:5px"></span>${c}: ${(s.rmPerColour[c]?.needed||0).toFixed(1)}kg needed</div>`).join('')}
            <div style="font-size:11px;color:var(--ink3);margin-top:6px">PO deadline: <strong>${fmtDate(s.poDeadline)}</strong></div>
          </div>`).join('') : '<p style="color:var(--ink3);font-size:13px">No upcoming shifts planned</p>'}
      </div>
    </div>`;
}

// ═══ ORDER-WISE ═══════════════════════════════════════════════════════════════
function renderOrderWise(orderRM) {
  if (!orderRM?.length) return `<div class="card">${emptyState('📋','No pending orders')}</div>`;
  const grandPairs = orderRM.reduce((s,o)=>s+o.totalPairs,0);
  const grandKg    = orderRM.reduce((s,o)=>s+o.totalRmKg,0);
  return `
    <div class="card">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
        <div class="card-title" style="margin-bottom:0">Order-wise Raw Material Requirement</div>
        <div style="font-size:12px;color:var(--ink2)"><strong>${orderRM.length}</strong> orders · <strong>${num(grandPairs)}</strong> pairs · <strong>${grandKg.toFixed(1)} kg</strong> total</div>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Order #</th><th>Party</th><th>Pool</th><th>Status</th><th>Article</th><th>Colour</th><th style="text-align:right">Pending Pairs</th><th style="text-align:right">g/pair</th><th style="text-align:right">RM (kg)</th></tr></thead>
          <tbody>
            ${orderRM.map(o => o.byArtColour.map((ac,i) => `
              <tr>
                ${i===0?`<td rowspan="${o.byArtColour.length}" style="vertical-align:top;padding-top:14px;font-family:'IBM Plex Mono',monospace;font-weight:700">#${o.order_id}</td>
                <td rowspan="${o.byArtColour.length}" style="vertical-align:top;padding-top:14px;font-weight:600">${o.party}</td>
                <td rowspan="${o.byArtColour.length}" style="vertical-align:top;padding-top:14px">${poolBadge(o.pool)}</td>
                <td rowspan="${o.byArtColour.length}" style="vertical-align:top;padding-top:14px">${statusBadge(o.status)}</td>`:''}
                <td class="mono">${ac.article_id}</td>
                <td><span style="display:inline-flex;align-items:center;gap:5px"><span style="width:8px;height:8px;border-radius:50%;background:${COLOUR_HEX[ac.colour]||'#888'};display:inline-block;border:1px solid rgba(0,0,0,0.1)"></span>${ac.colour}</span></td>
                <td style="text-align:right;font-weight:600;font-family:'IBM Plex Mono',monospace">${num(ac.totalPairs)}</td>
                <td style="text-align:right;font-family:'IBM Plex Mono',monospace;color:var(--ink3)">${ac.compound_per_pair_g||'?'}g</td>
                <td style="text-align:right;font-weight:700;font-family:'IBM Plex Mono',monospace;color:var(--blue)">${ac.totalRmKg.toFixed(2)}</td>
              </tr>`).join('')).join('')}
          </tbody>
          <tfoot>
            <tr style="background:var(--surface2);border-top:2px solid var(--line)">
              <td colspan="6" style="font-weight:800;padding:12px 16px">GRAND TOTAL</td>
              <td style="text-align:right;font-weight:800;font-family:'IBM Plex Mono',monospace;padding:12px 16px">${num(grandPairs)}</td>
              <td></td>
              <td style="text-align:right;font-weight:800;font-family:'IBM Plex Mono',monospace;color:var(--blue);padding:12px 16px">${grandKg.toFixed(2)} kg</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>`;
}

// ═══ COLOUR-WISE ══════════════════════════════════════════════════════════════
function renderColourWise(colourRM) {
  if (!colourRM?.length) return `<div class="card">${emptyState('🎨','No pending orders')}</div>`;
  const grandTotal    = colourRM.reduce((s,c)=>s+c.totalRmKg,0);
  const grandShortfall= colourRM.reduce((s,c)=>s+c.shortfall,0);
  return `
    <div class="card">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px">
        <div class="card-title" style="margin-bottom:0">Colour-wise RM Summary</div>
        <div style="font-size:12px;color:var(--ink2)">Total needed: <strong>${grandTotal.toFixed(1)} kg</strong>${grandShortfall>0?` · <span style="color:var(--red)">Shortfall: ${grandShortfall.toFixed(1)} kg</span>`:''}</div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(270px,1fr));gap:14px">
        ${colourRM.map(c => {
          const pct = c.totalRmKg>0 ? Math.min(100,Math.round((c.inStock/c.totalRmKg)*100)) : 100;
          return `
            <div style="background:${!c.sufficient?'var(--red-bg)':'var(--surface2)'};border:1px solid ${!c.sufficient?'rgba(220,38,38,0.2)':'var(--line)'};border-radius:10px;padding:16px">
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
                <div style="display:flex;align-items:center;gap:8px">
                  <span style="width:12px;height:12px;border-radius:50%;background:${COLOUR_HEX[c.colour]||'#888'};border:1px solid rgba(0,0,0,0.1);display:inline-block;flex-shrink:0"></span>
                  <strong style="font-family:'IBM Plex Mono',monospace">${c.colour}</strong>
                </div>
                <span class="badge ${c.sufficient?'ok':'low'}">${c.sufficient?'✅ OK':'❌ Short'}</span>
              </div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px">
                <div style="background:white;border-radius:6px;padding:10px;text-align:center">
                  <div style="font-size:10px;color:var(--ink3);margin-bottom:3px">Needed</div>
                  <div style="font-weight:800;font-size:18px;line-height:1">${c.totalRmKg.toFixed(1)}</div>
                  <div style="font-size:10px;color:var(--ink3)">kg</div>
                </div>
                <div style="background:white;border-radius:6px;padding:10px;text-align:center">
                  <div style="font-size:10px;color:var(--ink3);margin-bottom:3px">In Stock</div>
                  <div style="font-weight:800;font-size:18px;line-height:1;color:${c.sufficient?'var(--green)':'var(--red)'}">${c.inStock.toFixed(1)}</div>
                  <div style="font-size:10px;color:var(--ink3)">kg</div>
                </div>
              </div>
              <div class="progress-bar" style="margin-bottom:8px">
                <div class="progress-fill ${c.sufficient?'green':pct>60?'yellow':'red'}" style="width:${pct}%"></div>
              </div>
              <div style="font-size:10px;color:var(--ink3);margin-bottom:8px">${pct}% covered · ${[...c.articles].join(', ')} · ${c.orderCount} line${c.orderCount>1?'s':''}</div>
              ${!c.sufficient?`
                <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 10px;background:white;border-radius:6px;border:1px solid rgba(220,38,38,0.15)">
                  <span style="font-size:12px;color:var(--red);font-weight:600">Short: ${c.shortfall.toFixed(1)} kg</span>
                  <button class="btn-primary btn-sm" onclick="prefillPO('${c.colour}',${c.shortfall.toFixed(1)})">Raise PO</button>
                </div>`:`<div style="font-size:11px;color:var(--green)">Surplus: ${(c.inStock-c.totalRmKg).toFixed(1)}kg</div>`}
            </div>`;
        }).join('')}
      </div>
    </div>`;
}

// ═══ CAPACITY PLANNER ════════════════════════════════════════════════════════
function renderCapacityPlanning(colourRM, rmStock, articles) {
  // Show ALL articles — flag blocked ones
  const allArticlesWithRM = articles; // Show all articles — compound can be added in Master Data
  // Max capacity uses actual moulds per article from MOULD_MAP (not a fixed constant)
  const mouldCounts = checked.map(c => (MOULD_MAP[c.value] || []).length);
  const avgMouldCount = mouldCounts.length ? Math.round(mouldCounts.reduce((s,n)=>s+n,0)/mouldCounts.length) : cfg('mouldsPerArt');
  const capPerShiftMax = cfg('shots') * cfg('sizesPerMould') * (checked.length * avgMouldCount);

  return `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(360px,1fr));gap:16px">

      <!-- LEFT: Capacity planner inputs -->
      <div class="card">
        <div class="card-title">Machine Capacity RM Planner</div>
        <p style="font-size:13px;color:var(--ink2);margin-bottom:18px;line-height:1.6">
          Calculate exact RM needed to run the machine at any capacity — even when pending orders are small. Set shift hours, efficiency and number of shifts to get the exact PO quantity to raise.
        </p>

        <!-- Shift Parameters -->
        <div style="background:var(--blue-soft);border:1px solid #bfdbfe;border-radius:8px;padding:14px;margin-bottom:18px">
          <div style="font-size:11px;font-weight:700;color:var(--blue);text-transform:uppercase;letter-spacing:0.8px;margin-bottom:12px">Shift Parameters</div>
          <div class="form-row cols-2" style="margin-bottom:0">
            <div class="form-group" style="margin-bottom:0">
              <label>Shift Duration</label>
              <select id="cap-shift-hours" onchange="calcCapacityRM()">
                <option value="6">6 hours (30 shots)</option>
                <option value="8">8 hours (40 shots)</option>
                <option value="12" selected>12 hours (60 shots)</option>
                <option value="custom">Custom hours</option>
              </select>
            </div>
            <div class="form-group" style="margin-bottom:0" id="custom-hours-row" style="display:none">
              <label>Custom Hours</label>
              <input type="number" id="cap-custom-hours" value="12" min="1" max="24" onchange="calcCapacityRM()" />
            </div>
          </div>
          <div style="margin-top:10px;padding:10px;background:white;border-radius:6px;border:1px solid #bfdbfe">
            <div style="display:flex;justify-content:space-between;align-items:center">
              <span style="font-size:12px;color:var(--ink2)">Shots for selected duration</span>
              <span style="font-family:'IBM Plex Mono',monospace;font-weight:800;font-size:16px;color:var(--blue)" id="cap-shots-display">60 shots</span>
            </div>
            <div style="font-size:11px;color:var(--ink3);margin-top:3px">1 shot = all moulds cycle once = 2 pairs per mould (1 per size)</div>
          </div>
        </div>

        <div class="form-row cols-2">
          <div class="form-group">
            <label>Colour to Plan</label>
            <select id="cap-colour" onchange="calcCapacityRM()">
              <option value="">Select colour</option>
              ${Object.keys(COLOUR_HEX).map(c=>`<option value="${c}">${c}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label>Colour Mode</label>
            <select id="cap-mode" onchange="calcCapacityRM()">
              <option value="dual">Dual (splits capacity 50/50)</option>
              <option value="single">Single (full capacity)</option>
            </select>
          </div>
        </div>

        <!-- ALL articles, not just in_production -->
        <div class="form-group">
          <label>Articles to Run</label>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
            ${allArticlesWithRM.map(a => {
              const blocked = a.mould_status !== 'in_production';
              return `
                <div onclick="onCapArticleToggle('${a.id}')"
                  id="cap-art-label-${a.id}"
                  data-selected="false"
                  data-blocked="${blocked}"
                  style="display:flex;align-items:center;gap:10px;background:${blocked?'var(--amber-bg)':'white'};border:2px solid ${blocked?'rgba(217,119,6,0.2)':'var(--line)'};border-radius:8px;padding:10px 12px;cursor:pointer;transition:all 0.15s;user-select:none">
                  <div id="cap-art-cb-${a.id}" style="width:20px;height:20px;border-radius:5px;border:2px solid ${blocked?'rgba(217,119,6,0.4)':'var(--line2)'};background:white;display:flex;align-items:center;justify-content:center;flex-shrink:0;flex-shrink:0;transition:all 0.15s">
                    <span id="cap-art-tick-${a.id}" style="display:none;color:white;font-size:13px;font-weight:900;line-height:1">✓</span>
                  </div>
                  <div style="flex:1">
                    <div style="font-weight:700;font-size:12px;font-family:'IBM Plex Mono',monospace">${a.id}</div>
                    <div style="font-size:10px;color:var(--ink3)">${a.compound_per_pair_g?a.compound_per_pair_g+'g/pair':'⚠ set mould weight'} · Sz ${a.size_range}</div>
                  </div>
                  ${blocked?`<span class="badge in_coating" style="font-size:9px">Coating</span>`:`<span class="badge available" style="font-size:9px">Ready</span>`}
                </div>`;
            }).join('')}
          </div>
          ${allArticlesWithRM.some(a=>a.mould_status!=='in_production')?`<div style="font-size:11px;color:var(--amber);margin-top:6px">⚠ Orange = mould in coating. You can still plan RM for future production.</div>`:''}
        </div>

        <div class="form-row cols-2">
          <div class="form-group">
            <label>Number of Shifts</label>
            <input type="number" id="cap-shifts" value="1" min="1" max="60" onchange="calcCapacityRM()" />
          </div>
          <div class="form-group">
            <label>Safety Buffer %</label>
            <input type="number" id="cap-buffer" value="5" min="0" max="30" onchange="calcCapacityRM()" />
          </div>
        </div>

        <div id="cap-result" style="display:none"></div>
      </div>

      <!-- RIGHT: Colour vs capacity comparison -->
      <div class="card">
        <div class="card-title">Order Qty vs Full Shift Capacity</div>
        <p style="font-size:13px;color:var(--ink2);margin-bottom:16px;line-height:1.6">
          How much of a standard shift's capacity is covered by actual orders — and how much will go to stock replenishment.
        </p>
        ${(colourRM||[]).length ? (colourRM||[]).map(c => {
          const pct = Math.min(100, Math.round((c.totalPairs/capPerShiftMax)*100));
          return `
            <div style="margin-bottom:16px;padding:12px 14px;background:var(--surface2);border-radius:8px;border:1px solid var(--line)">
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
                <span style="display:flex;align-items:center;gap:7px">
                  <span style="width:10px;height:10px;border-radius:50%;background:${COLOUR_HEX[c.colour]||'#888'};border:1px solid rgba(0,0,0,0.1);display:inline-block"></span>
                  <strong style="font-family:'IBM Plex Mono',monospace">${c.colour}</strong>
                </span>
                <span style="font-size:12px;color:var(--ink2)">${num(c.totalPairs)} pairs pending · ${c.totalRmKg.toFixed(1)}kg RM</span>
              </div>
              <div style="display:flex;height:22px;border-radius:6px;overflow:hidden;margin-bottom:6px;border:1px solid var(--line)">
                <div style="width:${pct}%;background:var(--blue);display:flex;align-items:center;justify-content:center;min-width:${pct>0?'2px':'0'}">
                  ${pct>15?`<span style="font-size:10px;color:white;font-weight:700;white-space:nowrap;padding:0 4px">${pct}% orders</span>`:''}
                </div>
                <div style="flex:1;background:#e5e7eb;display:flex;align-items:center;justify-content:center">
                  ${(100-pct)>15?`<span style="font-size:10px;color:var(--ink3);font-weight:600;white-space:nowrap;padding:0 4px">+${100-pct}% → stock</span>`:''}
                </div>
              </div>
              <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--ink3)">
                <span>🔵 Orders: ${num(c.totalPairs)} pairs</span>
                <span>⬜ To stock: ~${num(capPerShiftMax - c.totalPairs)} pairs</span>
              </div>
            </div>`;
        }).join('') : '<p style="color:var(--ink3);font-size:13px">No pending orders to compare</p>'}
      </div>
    </div>`;
}

// ─── Shift hours change handler ───────────────────────────────────────────────
function onShiftHoursChange() {
  const sel = document.getElementById('cap-shift-hours');
  const customRow = document.getElementById('custom-hours-row');
  if (sel) customRow.style.display = sel.value === 'custom' ? 'block' : 'none';
  calcCapacityRM();
}

// ─── Article toggle handler for capacity planner ─────────────────────────────
function onCapArticleToggle(articleId) {
  const card = document.getElementById(`cap-art-label-${articleId}`);
  const box  = document.getElementById(`cap-art-cb-${articleId}`);
  const tick = document.getElementById(`cap-art-tick-${articleId}`);
  if (!card) return;

  const isSelected = card.dataset.selected === 'true';
  const isBlocked  = card.dataset.blocked === 'true';

  if (!isSelected) {
    // Check max limit
    const alreadySelected = document.querySelectorAll('[id^="cap-art-label-"][data-selected="true"]').length;
    if (alreadySelected >= cfg('maxArticles')) {
      showToast(`Max ${cfg('maxArticles')} articles per shift`, 'error');
      return;
    }
    card.dataset.selected  = 'true';
    card.style.borderColor = 'var(--blue)';
    card.style.background  = 'rgba(37,99,235,0.06)';
    box.style.background   = 'var(--blue)';
    box.style.borderColor  = 'var(--blue)';
    if (tick) tick.style.display = 'block';
  } else {
    card.dataset.selected  = 'false';
    card.style.borderColor = isBlocked ? 'rgba(217,119,6,0.2)' : 'var(--line)';
    card.style.background  = isBlocked ? 'var(--amber-bg)' : 'white';
    box.style.background   = 'white';
    box.style.borderColor  = isBlocked ? 'rgba(217,119,6,0.4)' : 'var(--line2)';
    if (tick) tick.style.display = 'none';
  }
  calcCapacityRM();
}

// ─── Main capacity calculation ────────────────────────────────────────────────
function calcCapacityRM() {
  const shiftHoursEl = document.getElementById('cap-shift-hours');
  const shiftHours   = shiftHoursEl?.value === 'custom'
    ? parseFloat(document.getElementById('cap-custom-hours')?.value) || 12
    : parseFloat(shiftHoursEl?.value) || 12;

  // Show custom hours row if needed
  const customRow = document.getElementById('custom-hours-row');
  if (customRow) customRow.style.display = shiftHoursEl?.value === 'custom' ? 'block' : 'none';

  // Shots = proportional to shift hours (60 shots per 12hr)
  const actualShots = calcActualShots(shiftHours);

  // Update shots display
  const shotsDisplay = document.getElementById('cap-shots-display');
  if (shotsDisplay) shotsDisplay.textContent = actualShots + ' shots';

  const colour    = document.getElementById('cap-colour')?.value;
  const mode      = document.getElementById('cap-mode')?.value || 'dual';
  const numShifts = parseInt(document.getElementById('cap-shifts')?.value) || 1;
  const buffer    = parseFloat(document.getElementById('cap-buffer')?.value) || 0;
  const articles  = window._articles || [];
  const rmStock   = window._rmStock || [];
  const colourRM  = window._colourRM || [];
  const resultEl  = document.getElementById('cap-result');
  if (!resultEl) return;

  const checked = Array.from(document.querySelectorAll('[id^="cap-art-label-"][data-selected="true"]')).map(el => ({ value: el.id.replace('cap-art-label-', '') }));
  if (!colour || !checked.length) {
    resultEl.style.display = 'none';
    return;
  }

  // Pairs per colour per shift using actual shots
  const mouldSlots     = checked.reduce((s,c) => s + (MOULD_MAP[c.value]||[]).length, 0);
  const pairsPerColour = actualShots * cfg('sizesPerMould') * mouldSlots;
  const totalPairs     = pairsPerColour * numShifts;

  // RM breakdown per article
  let totalRMKg = 0;
  const breakdown = [];
  checked.forEach(cb => {
    const art = articles.find(a=>a.id===cb.value);
    if (!art) return;
    const artMoulds = (MOULD_MAP[cb.value] || []).length || cfg('mouldsPerArt');
    const pairsThisArt = actualShots * cfg('sizesPerMould') * artMoulds * numShifts;
    const kgThisArt    = art.compound_per_pair_g ? (art.compound_per_pair_g * pairsThisArt) / 1000 : 0;
    totalRMKg += kgThisArt;
    breakdown.push({
      article: art.id, pairs: pairsThisArt, kg: kgThisArt,
      blocked: art.mould_status !== 'in_production',
      noCompound: !art.compound_per_pair_g
    });
  });

  const bufferKg     = totalRMKg * (buffer/100);
  const totalWithBuf = totalRMKg + bufferKg;
  const inStock      = rmStock.find(r=>r.compound_colour===colour)?.qty_kg || 0;
  const orderPending = (colourRM.find(c=>c.colour===colour)?.totalPairs) || 0;
  const surplusToStock = Math.max(0, totalPairs - orderPending);
  const shortfall    = Math.max(0, totalWithBuf - inStock);
  const poQty        = Math.ceil(shortfall * 10) / 10; // round up to 1 decimal

  resultEl.style.display = 'block';
  resultEl.innerHTML = `
    <div class="divider"></div>
    <div style="font-size:11px;font-weight:700;color:var(--ink3);text-transform:uppercase;letter-spacing:0.8px;margin-bottom:12px">
      Result: ${numShifts} shift${numShifts>1?'s':''} · ${shiftHours}hr · ${actualShots} shots/shift
    </div>

    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:14px">
      <div style="background:var(--blue-soft);border:1px solid #bfdbfe;border-radius:8px;padding:10px;text-align:center">
        <div style="font-size:10px;color:var(--blue);margin-bottom:3px">TOTAL PAIRS</div>
        <div style="font-size:20px;font-weight:800;color:var(--blue)">${num(totalPairs)}</div>
      </div>
      <div style="background:var(--green-bg);border:1px solid rgba(5,150,105,0.2);border-radius:8px;padding:10px;text-align:center">
        <div style="font-size:10px;color:var(--green);margin-bottom:3px">TO ORDERS</div>
        <div style="font-size:20px;font-weight:800;color:var(--green)">${num(Math.min(orderPending,totalPairs))}</div>
      </div>
      <div style="background:var(--surface2);border:1px solid var(--line);border-radius:8px;padding:10px;text-align:center">
        <div style="font-size:10px;color:var(--ink3);margin-bottom:3px">TO STOCK</div>
        <div style="font-size:20px;font-weight:800;color:var(--ink)">${num(surplusToStock)}</div>
      </div>
    </div>

    <div style="background:var(--surface2);border-radius:8px;padding:12px;margin-bottom:12px">
      <div style="font-size:11px;font-weight:700;color:var(--ink3);margin-bottom:8px;text-transform:uppercase;letter-spacing:0.8px">RM Breakdown by Article</div>
      ${breakdown.map(b=>`
        <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--line)">
          <span style="font-family:'IBM Plex Mono',monospace;font-size:12px;font-weight:600">
            ${b.article}
            ${b.blocked?'<span style="font-size:10px;color:var(--amber);margin-left:4px">(coating)</span>':''}
            ${b.noCompound?'<span style="font-size:10px;color:var(--red);margin-left:4px">⚠ set mould weight</span>':''}
          </span>
          <span style="font-size:12px;color:var(--ink2)">${num(b.pairs)} pairs</span>
          <span style="font-family:'IBM Plex Mono',monospace;font-size:12px;font-weight:700;color:${b.noCompound?'var(--ink3)':'inherit'}">${b.noCompound?'— kg':b.kg.toFixed(2)+' kg'}</span>
        </div>`).join('')}
      <div style="display:flex;justify-content:space-between;padding:8px 0 4px;font-weight:700">
        <span>Base RM</span><span>${totalRMKg.toFixed(2)} kg</span>
      </div>
      ${buffer>0?`<div style="display:flex;justify-content:space-between;padding:4px 0;color:var(--amber);font-size:12px">
        <span>Buffer (${buffer}%)</span><span>+ ${bufferKg.toFixed(2)} kg</span>
      </div>`:''}
      <div style="display:flex;justify-content:space-between;padding:8px 0 0;font-weight:800;font-size:14px;border-top:2px solid var(--line2);color:var(--blue)">
        <span>Total RM to order</span><span>${totalWithBuf.toFixed(2)} kg</span>
      </div>
    </div>

    <div style="background:${shortfall>0?'var(--red-bg)':'var(--green-bg)'};border:1px solid ${shortfall>0?'rgba(220,38,38,0.2)':'rgba(5,150,105,0.2)'};border-radius:8px;padding:12px;margin-bottom:12px">
      <div style="display:flex;justify-content:space-between;margin-bottom:6px;font-size:12px">
        <span>Currently in stock (${colour})</span>
        <span class="mono">${inStock.toFixed(2)} kg</span>
      </div>
      <div style="display:flex;justify-content:space-between;font-weight:800;font-size:14px;color:${shortfall>0?'var(--red)':'var(--green)'}">
        <span>${shortfall>0?'❌ Need to order':'✅ Stock sufficient'}</span>
        <span>${shortfall>0?poQty+' kg to order':((inStock-totalWithBuf).toFixed(2)+' kg surplus')}</span>
      </div>
    </div>

    ${shortfall>0?`
      <button class="btn-primary full-width" onclick="prefillPO('${colour}',${poQty})" style="margin-bottom:8px">
        Raise PO for ${poQty} kg ${colour} compound
      </button>
      <div style="font-size:11px;color:var(--ink3);text-align:center">PO must be raised at least 14 days before production</div>
    `:''}
  `;
}

// ═══ PO TAB ═══════════════════════════════════════════════════════════════════
function renderPOTab(pos) {
  const pending = pos.filter(p=>p.status!=='received');
  return `
    <div class="card">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
        <div class="card-title" style="margin-bottom:0">Purchase Orders</div>
        <div class="tabs" style="margin-bottom:0">
          <button class="tab active" onclick="filterPOs(this,'pending')">Active</button>
          <button class="tab" onclick="filterPOs(this,'all')">All</button>
        </div>
      </div>
      <div id="po-list">${renderPOTable(pending)}</div>
    </div>`;
}

function renderPOTable(pos) {
  if (!pos.length) return emptyState('📄','No purchase orders');
  return `
    <div class="table-wrap">
      <table>
        <thead><tr><th>#</th><th>Colour</th><th>Qty (kg)</th><th>PO Date</th><th>Expected Arrival</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>
          ${pos.map(p=>`
            <tr>
              <td class="mono">#${p.id}</td>
              <td><span style="display:inline-flex;align-items:center;gap:6px"><span style="width:8px;height:8px;border-radius:50%;background:${COLOUR_HEX[p.compound_colour]||'#888'};border:1px solid rgba(0,0,0,0.1);display:inline-block"></span>${p.compound_colour}</span></td>
              <td class="mono"><strong>${p.qty_kg} kg</strong></td>
              <td>${fmtDate(p.po_date)}</td>
              <td style="color:${p.expected_arrival<today()&&p.status!=='received'?'var(--red)':'var(--ink)'};font-weight:${p.expected_arrival<today()&&p.status!=='received'?700:400}">${fmtDate(p.expected_arrival)}</td>
              <td>${statusBadge(p.status)}</td>
              <td>
                ${p.status==='pending'   ?`<button class="btn-secondary btn-sm" onclick="markPOInTransit(${p.id})">→ Transit</button>`:''}
                ${p.status==='in_transit'?`<button class="btn-primary btn-sm" onclick="markPOReceived(${p.id},'${p.compound_colour}',${p.qty_kg})">✓ Received</button>`:''}
                ${['pending','in_transit'].includes(p.status)?`<button class="btn-secondary btn-sm" onclick="editRMPO(${p.id},'${p.compound_colour}',${p.qty_kg},'${p.expected_arrival}','${p.supplier||''}')">✏</button>`:''}
                ${['pending','in_transit'].includes(p.status)?`<button class="btn-danger btn-sm" onclick="cancelRMPO(${p.id})">✕</button>`:''}
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

function filterPOs(btn, filter) {
  document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('po-list').innerHTML = renderPOTable(
    filter==='all' ? window._allPOs||[] : (window._allPOs||[]).filter(p=>p.status!=='received')
  );
}

// ═══ MODALS ═══════════════════════════════════════════════════════════════════
function renderRaisePOModal(rmStock) {
  return `
    <div id="raise-po-modal" class="modal-overlay hidden">
      <div class="modal">
        <div class="modal-header"><div class="modal-title">Raise Purchase Order</div><button class="modal-close" onclick="closeModal('raise-po-modal')">×</button></div>
        <div class="modal-body">
          <div class="form-row cols-2">
            <div class="form-group"><label>Compound Colour</label>
              <select id="po-colour">
                ${rmStock.map(r=>`<option value="${r.compound_colour}">${r.compound_colour} (${r.qty_kg}kg in stock)</option>`).join('')}
              </select>
            </div>
            <div class="form-group"><label>Quantity (kg)</label><input type="number" id="po-qty" placeholder="e.g. 200" step="0.5" /></div>
          </div>
          <div class="form-row cols-2">
            <div class="form-group"><label>PO Date</label><input type="date" id="po-date" value="${today()}" onchange="calcPOArrival()" /></div>
            <div class="form-group"><label>Expected Arrival (PO + 14 days)</label><input type="date" id="po-arrival" value="${addDays(today(),14)}" /></div>
          </div>
          <div class="form-group"><label>Notes</label><input type="text" id="po-notes" placeholder="Supplier name, grade, etc." /></div>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" onclick="closeModal('raise-po-modal')">Cancel</button>
          <button class="btn-primary" onclick="saveRaisePO()">Raise PO</button>
        </div>
      </div>
    </div>`;
}

function renderUpdateStockModal(rmStock) {
  return `
    <div id="update-stock-modal" class="modal-overlay hidden">
      <div class="modal">
        <div class="modal-header"><div class="modal-title">Update RM Stock</div><button class="modal-close" onclick="closeModal('update-stock-modal')">×</button></div>
        <div class="modal-body">
          <p style="color:var(--ink2);font-size:13px;margin-bottom:18px">Enter current actual stock on hand for each colour compound.</p>
          ${rmStock.map(r=>`
            <div style="display:flex;align-items:center;gap:16px;margin-bottom:12px">
              <span style="display:flex;align-items:center;gap:7px;width:150px">
                <span style="width:10px;height:10px;border-radius:50%;background:${COLOUR_HEX[r.compound_colour]||'#888'};border:1px solid rgba(0,0,0,0.1);display:inline-block;flex-shrink:0"></span>
                <span style="font-weight:600">${r.compound_colour}</span>
              </span>
              <input type="number" id="stock-${r.compound_colour.replace(/ /g,'-')}" value="${r.qty_kg}" min="0" step="0.5" style="width:120px" />
              <span style="font-size:12px;color:var(--ink3)">kg</span>
            </div>`).join('')}
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" onclick="closeModal('update-stock-modal')">Cancel</button>
          <button class="btn-primary" onclick="saveRMStock()">Update Stock</button>
        </div>
      </div>
    </div>`;
}

// ═══ ACTIONS ══════════════════════════════════════════════════════════════════
function prefillPO(colour, qty) {
  openModal('raise-po-modal');
  setTimeout(() => {
    const sel = document.getElementById('po-colour');
    if (sel) sel.value = colour;
    const qtyEl = document.getElementById('po-qty');
    if (qtyEl) qtyEl.value = qty;
  }, 50);
}
function calcPOArrival() {
  const d = document.getElementById('po-date')?.value;
  if (d) document.getElementById('po-arrival').value = addDays(d, cfg('rmLead'));
}
function openRaisePOModal() { openModal('raise-po-modal'); }
function openUpdateStockModal() { openModal('update-stock-modal'); }

async function saveRaisePO() {
  const colour  = document.getElementById('po-colour').value;
  const qty     = parseFloat(document.getElementById('po-qty').value);
  const date    = document.getElementById('po-date').value;
  const arrival = document.getElementById('po-arrival').value;
  const notes   = document.getElementById('po-notes').value;
  if (!colour||!qty||!date||!arrival) { showToast('Fill all required fields','error'); return; }
  const {error} = await DB.createRMPO({compound_colour:colour,qty_kg:qty,po_date:date,expected_arrival:arrival,notes,status:'pending'});
  if (error) { showToast('Error: '+error.message,'error'); return; }
  showToast('Purchase order raised','success');
  closeModal('raise-po-modal');
  renderRawMaterial();
}
async function markPOInTransit(id) {
  await DB.updateRMPO(id,{status:'in_transit'});
  showToast('Marked in transit','info');
  renderRawMaterial();
}
async function markPOReceived(id, colour, qty) {
  await DB.updateRMPO(id, { status:'received', actual_arrival:today() });
  const stk = (window._rmStock||[]).find(r => r.compound_colour === colour);
  if (stk) {
    // Colour exists — update
    await DB.updateRMStock(colour, stk.qty_kg + qty);
  } else {
    // New colour not in table yet — insert it
    try {
      await (async () => { const {error} = await DB.createRMStockEntry(colour, qty); if(error) throw error; })();
    } catch(e) {
      // Fallback: just update anyway
      await DB.updateRMStock(colour, qty);
    }
  }
  showToast(`${qty}kg ${colour} received & added to stock`, 'success');
  renderRawMaterial();
}
async function saveRMStock() {
  for (const r of (window._rmStock||[])) {
    const id  = `stock-${r.compound_colour.replace(/ /g,'-')}`;
    const val = parseFloat(document.getElementById(id)?.value);
    if (!isNaN(val)) await DB.updateRMStock(r.compound_colour,val);
  }
  showToast('Stock updated','success');
  closeModal('update-stock-modal');
  renderRawMaterial();
}

// ── RM PO EDIT / CANCEL ────────────────────────────────────────────────────
async function editRMPO(id, colour, qty, expectedDate, supplier) {
  const newQty      = prompt(`Edit quantity for ${colour} PO (kg):`, qty);
  if (newQty === null) return;
  const newDate     = prompt(`Edit expected arrival date (YYYY-MM-DD):`, expectedDate);
  if (newDate === null) return;
  const newSupplier = prompt(`Edit supplier:`, supplier);
  if (newSupplier === null) return;

  const parsedQty = parseFloat(newQty);
  if (isNaN(parsedQty) || parsedQty <= 0) { showToast('Invalid quantity', 'error'); return; }

  const { error } = await DB.updateRMPO(id, {
    qty_kg: parsedQty,
    expected_arrival: newDate,
    supplier: newSupplier
  });
  if (error) { showToast('Error: ' + error.message, 'error'); return; }
  showToast('PO updated', 'success');
  renderRawMaterial();
}

async function cancelRMPO(id) {
  if (!confirmAction('Cancel this Purchase Order? This cannot be undone.')) return;
  const { error } = await DB.updateRMPO(id, { status: 'cancelled' });
  if (error) { showToast('Error: ' + error.message, 'error'); return; }
  showToast('PO cancelled', 'info');
  renderRawMaterial();
}
