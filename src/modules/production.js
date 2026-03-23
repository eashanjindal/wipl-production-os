// ═══════════════════════════════════════════════════════
// PRODUCTION MODULE — Full shift planner
// ═══════════════════════════════════════════════════════

async function renderProduction() {
  const area = document.getElementById('content-area');
  area.innerHTML = loading();
  try {

  const [shifts, articles] = await Promise.all([DB.getShifts(), DB.getArticles()]);
  window._articles = articles;
  const availArticles  = articles.filter(a => a.mould_status === 'in_production');
  const blockedArticles = articles.filter(a => a.mould_status !== 'in_production');
  const role = window._currentRole;

  area.innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-header-title">Production Plan</div>
        <div class="page-header-sub">Shift scheduling, order fulfilment & raw material planning</div>
      </div>
      ${['admin'].includes(role) ? `<button class="btn-primary" onclick="openNewShiftModal()">+ Plan New Shift</button>` : ''}
    </div>

    ${blockedArticles.length ? `
      <div class="warning-box">
        ⚠ Moulds in coating — cannot be scheduled: <strong>${blockedArticles.map(a=>a.id).join(', ')}</strong>
      </div>` : ''}

    <!-- COLOUR BACKLOG CARD -->
    <div class="card" style="margin-bottom:20px">
      <div class="card-title">Pending Order Backlog by Colour — Use this to decide your next colour campaign</div>
      <div id="colour-backlog-summary"><div class="loading"><div class="spinner"></div> Loading...</div></div>
    </div>

    <!-- SHIFT LIST -->
    <div class="tabs">
      <button class="tab active" onclick="filterShifts(this,'upcoming')">Upcoming</button>
      <button class="tab" onclick="filterShifts(this,'all')">All Shifts</button>
      <button class="tab" onclick="filterShifts(this,'completed')">Completed</button>
      <button class="tab" onclick="filterShifts(this,'calendar')">📅 Calendar</button>
    </div>
    <div id="shifts-container">
      ${renderShiftCards(shifts.filter(s => s.shift_date >= today() || s.status === 'in_progress'))}
    </div>

    <!-- ═══ NEW SHIFT MODAL ═══ -->
    <div id="new-shift-modal" class="modal-overlay hidden" style="align-items:stretch;padding:16px">
      <div class="modal" style="max-width:100%;width:calc(100vw - 32px);height:calc(100vh - 32px);max-height:calc(100vh - 32px);display:flex;flex-direction:column;border-radius:var(--r-lg)">
        <div class="modal-header" style="flex-shrink:0">
          <div class="modal-title">Plan New Production Shift</div>
          <button class="modal-close" onclick="closeModal('new-shift-modal')">×</button>
        </div>

        <div class="modal-body" style="padding:0;display:grid;grid-template-columns:260px 1fr;flex:1;overflow:hidden;min-height:0">

          <!-- ── LEFT: Config + Moulds ── -->
          <div style="padding:18px 16px;border-right:1px solid var(--line);background:var(--surface2);display:flex;flex-direction:column;gap:0;overflow-y:auto">
            <div class="panel-heading">① Shift Setup</div>

            <div class="form-group">
              <label>Shift Date</label>
              <input type="date" id="shift-date" value="${today()}" onchange="onShiftConfigChange()" />
            </div>
            <div class="form-group">
              <label>Pool</label>
              <select id="shift-pool" onchange="onShiftConfigChange()">
                <option value="general">General</option>
                <option value="yoots">YOOTS</option>
                <option value="mixed">Mixed (Both)</option>
              </select>
            </div>
            <div class="form-group">
              <label>Colour Mode</label>
              <select id="shift-colour-mode" onchange="onColourModeChange()">
                <option value="dual">Dual — 720 + 720 pairs</option>
                <option value="single">Single — 1,440 pairs</option>
              </select>
            </div>
            <div class="form-group">
              <label>Colour 1</label>
              <select id="shift-colour1" onchange="onShiftConfigChange()">
                <option value="">— Select —</option>
                ${Object.keys(COLOUR_HEX).map(c=>`<option value="${c}">${c}</option>`).join('')}
              </select>
            </div>
            <div id="colour2-row" class="form-group">
              <label>Colour 2</label>
              <select id="shift-colour2" onchange="onShiftConfigChange()">
                <option value="">— Select —</option>
                ${Object.keys(COLOUR_HEX).map(c=>`<option value="${c}">${c}</option>`).join('')}
              </select>
            </div>

            <div class="divider"></div>
            <div class="panel-heading">② Select Moulds <span style="font-weight:400;color:var(--ink3)">(max 12 slots)</span></div>

            <div id="mould-slot-counter" style="background:var(--blue-soft);border:1px solid var(--blue-mid);border-radius:var(--r-sm);padding:7px 10px;margin-bottom:10px;font-size:12px;display:flex;justify-content:space-between;align-items:center">
              <span style="color:var(--ink2);font-weight:500">Slots used</span>
              <span style="font-family:'IBM Plex Mono',monospace;font-weight:700;color:var(--blue)"><span id="slots-used">0</span> / 12</span>
            </div>

            <div id="shift-articles-grid">
              ${availArticles.map(a => {
                const moulds = MOULD_MAP[a.id] || [];
                if (!moulds.length) return ''; // article not in mould map — skip
                return `<div style="margin-bottom:10px">
                  <div style="font-size:10px;font-weight:700;color:var(--ink2);font-family:'IBM Plex Mono',monospace;letter-spacing:0.6px;padding:3px 0 5px;border-bottom:1px solid var(--line);margin-bottom:5px;display:flex;justify-content:space-between">
                    <span>${a.id}</span>
                    <span style="color:var(--ink3);font-weight:400">${a.compound_per_pair_g||'?'}g/pair · ${moulds.length} mould${moulds.length>1?'s':''}</span>
                  </div>
                  <div style="display:grid;grid-template-columns:repeat(${moulds.length},1fr);gap:5px">
                    ${moulds.map(m => `
                      <div onclick="toggleMould('${a.id}',${m.mould})"
                        id="mould-${a.id}-${m.mould}"
                        data-selected="false"
                        data-article="${a.id}"
                        data-mould="${m.mould}"
                        data-sizes="${m.sizes.join(',')}"
                        style="border:2px solid var(--line);border-radius:var(--r-sm);padding:8px 4px;cursor:pointer;transition:all 0.12s;user-select:none;text-align:center;background:white">
                        <div style="width:16px;height:16px;border-radius:3px;border:2px solid var(--line2);background:white;margin:0 auto 4px;display:flex;align-items:center;justify-content:center;transition:all 0.12s" id="mould-cb-${a.id}-${m.mould}">
                          <span style="display:none;color:white;font-size:10px;font-weight:900;line-height:1" id="mould-tick-${a.id}-${m.mould}">✓</span>
                        </div>
                        <div style="font-size:11px;font-weight:700;font-family:'IBM Plex Mono',monospace;color:var(--ink)">M${m.mould}</div>
                        <div style="font-size:10px;color:var(--ink3);margin-top:1px">Sz&nbsp;${m.sizes[0]}–${m.sizes[1]}</div>
                      </div>`).join('')}
                  </div>
                </div>`;
              }).join('')}
            </div>

            <!-- Capacity mini display -->
            <div style="margin-top:12px;background:white;border:1px solid var(--line);border-radius:8px;padding:12px" id="mini-capacity">
              <div style="font-size:10px;color:var(--ink3);text-transform:uppercase;letter-spacing:0.8px;margin-bottom:6px;font-weight:700">Shift Capacity</div>
              <div id="mini-cap-numbers" style="color:var(--ink3);font-size:12px">Select articles first</div>
            </div>
          </div>

          <!-- ── RIGHT: Pending Orders (top) + Summary strip (bottom) ── -->
          <div style="display:flex;flex-direction:column;overflow:hidden;min-height:0">

            <!-- Pending Orders — takes all available space -->
            <div style="flex:1;overflow-y:auto;padding:18px 20px;min-height:0">
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
                <div class="panel-heading" style="margin-bottom:0">③ Pending Orders for This Shift</div>
                <div style="display:flex;gap:6px" id="alloc-btns">
                  <button class="btn-secondary btn-sm" onclick="toggleAllOrders(false)">Clear</button>
                  <button class="btn-primary btn-sm" onclick="toggleAllOrders(true)">⚡ Select All</button>
                </div>
              </div>
              <div id="pending-orders-panel">
                <div class="empty-state" style="padding:40px 0">
                  <div class="empty-icon">🎨</div>
                  <p>Select colours above to see pending orders</p>
                </div>
              </div>
            </div>

            <!-- Summary strip — collapsible -->
            <div id="summary-strip" style="flex-shrink:0;border-top:2px solid var(--line);background:var(--surface2)">
              <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 20px;cursor:pointer;user-select:none"
                   onclick="toggleSummaryStrip()">
                <div style="display:flex;align-items:center;gap:10px">
                  <div class="panel-heading" style="margin-bottom:0">④ Shift Summary</div>
                  <div id="summary-compact-badge" style="display:none;font-size:11px;color:var(--ink3)"></div>
                </div>
                <button id="summary-toggle-btn" style="background:none;border:1px solid var(--line);border-radius:4px;font-size:11px;cursor:pointer;color:var(--ink2);padding:2px 8px;line-height:1.6" title="Expand/Collapse">▼ Show</button>
              </div>
              <div id="summary-strip-body" style="padding:0 20px 14px;display:none">
                <div id="shift-summary-panel">
                  <p style="color:var(--ink3);font-size:12px">Configure shift to see summary</p>
                </div>
              </div>
            </div>

          </div>

        </div>

        <div class="modal-footer" style="flex-shrink:0">
          <div id="shift-footer-warn" style="flex:1;font-size:12px;color:var(--red)"></div>
          <button class="btn-secondary" onclick="closeModal('new-shift-modal')">Cancel</button>
          <button class="btn-primary" onclick="saveShift()">✓ Create Shift</button>
        </div>
      </div>
    </div>

    <!-- LOG OUTPUT MODAL -->
    <div id="log-output-modal" class="modal-overlay hidden">
      <div class="modal">
        <div class="modal-header">
          <div class="modal-title">Log Actual Output</div>
          <button class="modal-close" onclick="closeModal('log-output-modal')">×</button>
        </div>
        <div class="modal-body" id="log-output-body"></div>
        <div class="modal-footer">
          <button class="btn-secondary" onclick="closeModal('log-output-modal')">Cancel</button>
          <button class="btn-primary" onclick="saveActualOutput()">Save & Complete Shift</button>
        </div>
      </div>
    </div>
  `;

  window._allShifts      = shifts;
  window._allocatedOrders = {};
  window._rmStock        = await DB.getRMStock();

  loadColourBacklog();
  loadTodayShiftCard();
  } catch(e) {
    log('error', 'renderProduction', e.message, e);
    if(area) area.innerHTML = `<div class="error-box" style="margin:20px">⚠ Failed to load — ${e.message} <button class="btn-secondary btn-sm" onclick="navigateTo('production')">Retry</button></div>`;
  }
}

async function loadTodayShiftCard() {
  const container = document.getElementById('daily-card-container');
  if (!container) return;
  const shifts = window._allShifts || [];
  const todayShift = shifts.find(s => s.shift_date === today() && s.status !== 'completed');
  if (!todayShift) { container.innerHTML = ''; return; }

  const [arts, orders] = await Promise.all([DB.getShiftArticles(todayShift.id), DB.getShiftOrders(todayShift.id)]);
  const totalTarget = todayShift.colour_mode === 'dual'
    ? todayShift.target_pairs_colour_1 + (todayShift.target_pairs_colour_2||0)
    : todayShift.target_pairs_colour_1;

  const orderGroups = {};
  orders.forEach(o => {
    const party = o.order_lines?.orders?.master_parties?.party_name || 'Unknown';
    if (!orderGroups[party]) orderGroups[party] = [];
    const line = `${o.order_lines?.colour} ${o.order_lines?.article_id}`;
    if (!orderGroups[party].includes(line)) orderGroups[party].push(line);
  });

  container.innerHTML = `
    <div class="card" style="border:2px solid var(--blue)">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
        <div>
          <div style="font-size:11px;font-weight:700;color:var(--blue);text-transform:uppercase;letter-spacing:1px;margin-bottom:4px">📋 Today's Production Card — ${fmtDate(todayShift.shift_date)}</div>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
            <span class="colour-chip"><span class="colour-dot" style="background:${COLOUR_HEX[todayShift.colour_1]||'#888'}"></span>${todayShift.colour_1}</span>
            ${todayShift.colour_2?`<span style="color:var(--ink3)">+</span><span class="colour-chip"><span class="colour-dot" style="background:${COLOUR_HEX[todayShift.colour_2]||'#888'}"></span>${todayShift.colour_2}</span>`:''}
            <span class="badge ${todayShift.colour_mode==='single'?'pending':'general'}">${todayShift.colour_mode==='single'?'Single':'Dual'}</span>
            ${poolBadge(todayShift.pool)}
            ${statusBadge(todayShift.status)}
          </div>
        </div>
        <div style="text-align:right">
          <div style="font-size:24px;font-weight:800;color:var(--blue)">${num(totalTarget)}</div>
          <div style="font-size:11px;color:var(--ink3)">target pairs</div>
        </div>
      </div>
      ${arts.length ? `<div style="margin-bottom:12px">
        <div style="font-size:11px;font-weight:700;color:var(--ink3);text-transform:uppercase;letter-spacing:0.8px;margin-bottom:6px">Articles Loaded</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">${arts.map(a=>`<span class="article-chip">${a.article_id} (${a.moulds_allocated} moulds)</span>`).join('')}</div>
      </div>` : ''}
      ${Object.keys(orderGroups).length ? `<div style="margin-bottom:14px">
        <div style="font-size:11px;font-weight:700;color:var(--ink3);text-transform:uppercase;letter-spacing:0.8px;margin-bottom:6px">Orders Being Fulfilled</div>
        <div style="display:flex;flex-wrap:wrap;gap:8px">
          ${Object.entries(orderGroups).map(([party, lines])=>`
            <div style="background:var(--surface2);border:1px solid var(--line);border-radius:6px;padding:7px 12px;font-size:12px">
              <strong>${party}</strong> — ${lines.join(', ')}
            </div>`).join('')}
        </div>
      </div>` : ''}
      <div style="display:flex;gap:8px">
        ${todayShift.status==='planned'?`<button class="btn-secondary" onclick="startShift(${todayShift.id})">▶ Start Shift</button>`:''}
        ${todayShift.status==='in_progress'?`<button class="btn-primary" onclick="openLogOutput(${todayShift.id})">✓ Log Output & Complete</button>`:''}
        <button class="btn-secondary" onclick="printDailyCard()">🖨 Print Card</button>
      </div>
    </div>`;
}

// ═══ COLOUR BACKLOG ═══════════════════════════════════════════════════════════
async function loadColourBacklog() {
  const lines = await DB.getAllOrderLines();

  // Only show backlog for articles whose moulds are currently available
  const availableIds = new Set(
    (window._articles || []).filter(a => a.mould_status === 'in_production').map(a => a.id)
  );

  const pending = lines.filter(l => {
    const bal = (l.qty_ordered||0) - (l.qty_dispatched||0);
    if (bal <= 0) return false;
    if (!availableIds.has(l.article_id)) return false; // skip coated article orders
    const ord = Array.isArray(l.orders) ? l.orders[0] : l.orders;
    if (!ord) return false;
    const status = (ord.status||'').trim().toLowerCase();
    return ['pending','partial','in_production'].includes(status);
  });

  const byColour = {};
  pending.forEach(l => {
    const bal = l.qty_ordered - l.qty_dispatched;
    if (!byColour[l.colour]) byColour[l.colour] = { total:0, articles:new Set(), orders:new Set() };
    byColour[l.colour].total += bal;
    byColour[l.colour].articles.add(l.article_id);
    byColour[l.colour].orders.add(l.order_id);
  });

  window._colourBacklog = byColour;
  const el = document.getElementById('colour-backlog-summary');
  if (!el) return;

  if (!Object.keys(byColour).length) {
    el.innerHTML = '<p style="color:var(--ink3);font-size:13px">✅ No pending orders</p>';
    return;
  }

  const sorted = Object.entries(byColour).sort((a,b) => b[1].total - a[1].total);
  el.innerHTML = `
    <div style="display:flex;flex-wrap:wrap;gap:10px">
      ${sorted.map(([col, d]) => {
        // Max capacity = shots × total mould slots available across all articles
        const allMoulds = Object.values(MOULD_MAP).flat();
        const cap = cfg('shots') * cfg('sizesPerMould') * Math.min(allMoulds.length, cfg('mouldSlots'));
        const pct = Math.min(100, Math.round((d.total / cap) * 100));
        return `
          <div style="background:var(--surface2);border:1px solid var(--line);border-radius:10px;padding:14px 16px;min-width:160px;cursor:pointer;transition:all 0.12s"
               onclick="prefillColour('${col}')"
               onmouseover="this.style.borderColor='var(--blue)';this.style.background='rgba(43,91,255,0.03)'"
               onmouseout="this.style.borderColor='var(--line)';this.style.background='var(--surface2)'">
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px">
              <span style="width:10px;height:10px;border-radius:50%;background:${COLOUR_HEX[col]||'#888'};border:1px solid rgba(0,0,0,0.1);flex-shrink:0;display:inline-block"></span>
              <span style="font-weight:700;font-size:12px;font-family:'IBM Plex Mono',monospace">${col}</span>
            </div>
            <div style="font-size:22px;font-weight:800;line-height:1;color:var(--ink)">${num(d.total)}</div>
            <div style="font-size:10px;color:var(--ink3);margin-top:3px">pairs · ${d.orders.size} order${d.orders.size>1?'s':''}</div>
            <div style="font-size:10px;font-weight:600;color:var(--blue);margin-top:4px">~${Math.ceil(d.total/cap)} shift${Math.ceil(d.total/cap)>1?'s':''} needed</div>
            <div class="progress-bar" style="margin-top:6px">
              <div class="progress-fill ${pct>80?'yellow':'green'}" style="width:${pct}%"></div>
            </div>
            <div style="font-size:10px;color:var(--ink3);margin-top:3px;margin-bottom:10px">${[...d.articles].join(', ')}</div>
            <div style="font-size:11px;color:var(--blue);font-weight:600;border-top:1px solid var(--line);padding-top:8px;display:flex;align-items:center;gap:4px">
              <span>→ Plan Shift</span>
            </div>
          </div>
        `;
      }).join('')}
    </div>
    <div style="font-size:11px;color:var(--ink3);margin-top:10px">💡 Click a colour card to prefill it in the shift planner</div>
  `;
}

function prefillColour(colour) {
  openNewShiftModal();
  setTimeout(() => {
    const c1 = document.getElementById('shift-colour1');
    if (c1) { c1.value = colour; onShiftConfigChange(); }
  }, 100);
}

// ═══ SHIFT CONFIG ═════════════════════════════════════════════════════════════
function onColourModeChange() {
  const mode = document.getElementById('shift-colour-mode')?.value;
  const c2row = document.getElementById('colour2-row');
  if (c2row) c2row.style.display = mode === 'dual' ? 'block' : 'none';
  onShiftConfigChange();
}

async function onShiftConfigChange() {
  updateMiniCapacity();
  // Reset selections when colour/pool/mode changes — user is configuring a new shift
  window._allocatedOrders = {};
  await loadPendingOrdersForColours();
  updateShiftSummary();
}

function toggleMould(articleId, mouldNum) {
  const card = document.getElementById(`mould-${articleId}-${mouldNum}`);
  const box  = document.getElementById(`mould-cb-${articleId}-${mouldNum}`);
  const tick = document.getElementById(`mould-tick-${articleId}-${mouldNum}`);
  if (!card) return;

  const isSelected = card.dataset.selected === 'true';

  if (!isSelected) {
    const used = document.querySelectorAll('#shift-articles-grid [data-selected="true"]').length;
    if (used >= 12) {
      showToast('All 12 mould slots are used', 'error');
      return;
    }
    card.dataset.selected  = 'true';
    card.style.borderColor = 'var(--blue)';
    card.style.background  = 'rgba(43,91,255,0.06)';
    box.style.background   = 'var(--blue)';
    box.style.borderColor  = 'var(--blue)';
    if (tick) tick.style.display = 'block';
  } else {
    card.dataset.selected  = 'false';
    card.style.borderColor = 'var(--line)';
    card.style.background  = 'white';
    box.style.background   = 'white';
    box.style.borderColor  = 'var(--line2)';
    if (tick) tick.style.display = 'none';
  }
  updateSlotCounter();
  onShiftArticleToggle();
}

function updateSlotCounter() {
  const used = document.querySelectorAll('#shift-articles-grid [data-selected="true"]').length;
  const el = document.getElementById('slots-used');
  if (el) el.textContent = used;
  const counter = document.getElementById('mould-slot-counter');
  if (counter) {
    counter.style.background  = used >= 12 ? 'var(--red-bg)' : 'var(--blue-soft)';
    counter.style.borderColor = used >= 12 ? 'var(--red-line)' : 'var(--blue-mid)';
  }
}

function onShiftArticleToggle() {
  updateMiniCapacity();
  // Rebuild capacity pool from new mould selection — no DB fetch needed
  // Data (orders, inventory) is already cached on window
  rebuildCapacityPoolAndRender();
}

function rebuildCapacityPoolAndRender() {
  // Rebuild capacityPool from currently checked moulds
  const checkedMoulds = getCheckedMoulds();
  const capacityPool  = {};
  checkedMoulds.forEach(m => {
    m.sizes.forEach(size => {
      const key = `${m.article_id}|${size}`;
      if (!capacityPool[key]) capacityPool[key] = { capacity: cfg('shots'), allocated: 0 };
    });
  });
  window._capacityPool = capacityPool;

  // If no pending data cached yet, do a full load
  if (!window._pendingGroups) {
    loadPendingOrdersForColours();
    return;
  }

  // Re-run auto-suggest with new capacity pool (only for unseen orders)
  const groups   = window._pendingGroups;
  const pool     = window._pendingPool || 'general';

  Object.keys(capacityPool).forEach(k => { capacityPool[k].allocated = 0; });
  groups.forEach(g => {
    const gKey = `${g.order_id}_${g.colour}_${g.article_id}`;
    // Only auto-suggest orders the user hasn't explicitly interacted with
    if (gKey in (window._allocatedOrders||{})) return;
    const canSuggest = g.lines.every(l => {
      const net   = getLineNet(l);
      if (net <= 0) return true;
      const cpKey = `${l.article_id}|${l.size}`;
      if (!capacityPool[cpKey]) return false;
      return capacityPool[cpKey].allocated + net <= capacityPool[cpKey].capacity;
    });
    g.suggested = canSuggest;
    if (canSuggest) {
      if (!window._allocatedOrders) window._allocatedOrders = {};
      window._allocatedOrders[gKey] = {
        checked: true, orderId: parseInt(g.order_id), colour: g.colour,
        article: g.article_id, total: g.totalNetToProduce,
        lineIds: g.lines.map(l => l.id)
      };
      g.lines.forEach(l => {
        const net   = getLineNet(l);
        const cpKey = `${l.article_id}|${l.size}`;
        if (capacityPool[cpKey]) capacityPool[cpKey].allocated += net;
      });
    }
  });

  renderPendingPanel();
  updateShiftSummary();
}

function getCheckedMoulds() {
  return Array.from(document.querySelectorAll('#shift-articles-grid [data-selected="true"]'))
    .map(el => ({
      article_id: el.dataset.article,
      mould:      parseInt(el.dataset.mould),
      sizes:      (el.dataset.sizes||'').split(',').map(Number).filter(Boolean)
    }));
}

function getCheckedArticles() {
  const moulds = getCheckedMoulds();
  const seen = new Set();
  return moulds.filter(m => {
    if (seen.has(m.article_id)) return false;
    seen.add(m.article_id); return true;
  }).map(m => ({ value: m.article_id }));
}

function getShiftCapacityPerColour() {
  const moulds = getCheckedMoulds();
  if (!moulds.length) return 0;
  const actualShots = calcActualShots(DEFAULT_SHIFT_HOURS);
  return actualShots * cfg('sizesPerMould') * moulds.length;
}

function updateMiniCapacity() {
  const checked   = getCheckedArticles();
  const mode      = document.getElementById('shift-colour-mode')?.value || 'dual';
  const capEl     = document.getElementById('mini-cap-numbers');
  if (!capEl) return;
  if (!checked.length) { capEl.innerHTML = '<span style="color:var(--ink3)">Select articles</span>'; return; }
  const perColour = getShiftCapacityPerColour();
  const total     = mode === 'single' ? perColour : perColour * 2;
  capEl.innerHTML = `
    <div style="display:flex;justify-content:space-between;margin-bottom:4px">
      <span style="color:var(--ink3);font-size:11px">${mode==='dual'?'Per colour':'Total'}</span>
      <span style="font-weight:800;font-size:16px;color:var(--blue)">${num(perColour)}</span>
    </div>
    <div style="display:flex;justify-content:space-between">
      <span style="color:var(--ink3);font-size:11px">Total capacity</span>
      <span style="font-weight:700;font-size:13px">${num(total)}</span>
    </div>
    <div style="font-size:10px;color:var(--ink3);margin-top:4px">
      ${checked.length} articles · ${getCheckedMoulds().length}/${cfg('mouldSlots')} mould slots
    </div>
  `;
}

// ═══ PENDING ORDERS PANEL ════════════════════════════════════════════════════

// Get net-to-produce for a single order line (module-level, always available)
function getLineNet(l) {
  const pool    = window._pendingPool || 'general';
  const ordPool = (Array.isArray(l.orders) ? l.orders[0] : l.orders)?.pool || pool;
  const bal     = (l.qty_ordered||0) - (l.qty_dispatched||0);
  const inStock = (window._stockMap||{})[`${l.article_id}|${l.colour}|${l.size}|${ordPool}`] || 0;
  return Math.max(0, bal - inStock);
}

async function loadPendingOrdersForColours() {
  const c1    = document.getElementById('shift-colour1')?.value;
  const c2    = document.getElementById('shift-colour2')?.value;
  const mode  = document.getElementById('shift-colour-mode')?.value || 'dual';
  const pool  = document.getElementById('shift-pool')?.value || 'general';
  const panel = document.getElementById('pending-orders-panel');
  const btns  = document.getElementById('alloc-btns');
  if (!panel) return;

  const colours = [c1, mode === 'dual' ? c2 : null].filter(Boolean);
  if (!colours.length) {
    panel.innerHTML = `<div class="empty-state" style="padding:30px 0"><div class="empty-icon">🎨</div><p>Select colour(s) above</p></div>`;
    if (btns) btns.style.display = 'none';
    return;
  }

  panel.innerHTML = `<div class="loading" style="padding:20px 0"><div class="spinner"></div> Loading...</div>`;

  // ── Fetch all data in parallel ─────────────────────────────────────────────
  const [lines, inventory, allShifts] = await Promise.all([
    DB.getAllOrderLines(),
    DB.getInventory(),
    DB.getShifts({ status: ['planned','in_progress'] }),
  ]);

  // ── Build inventory lookup: article+colour+size+pool → qty_on_hand ─────────
  const stockMap = {};
  (inventory || []).forEach(inv => {
    const key = `${inv.article_id}|${inv.colour}|${inv.size}|${inv.pool}`;
    stockMap[key] = (stockMap[key] || 0) + (inv.qty_on_hand || 0);
  });

  // ── Build already-scheduled order_line_ids from planned/in-progress shifts ─
  // Fetch shift orders for all planned shifts
  const plannedShiftIds = (allShifts || [])
    .filter(s => ['planned','in_progress'].includes(s.status))
    .map(s => s.id);

  const scheduledLineIds = new Set();
  const scheduledLineToShift = {}; // lineId → shiftId
  for (const shiftId of plannedShiftIds) {
    const shiftOrders = await DB.getShiftOrders(shiftId);
    (shiftOrders || []).forEach(so => {
      scheduledLineIds.add(so.order_line_id);
      scheduledLineToShift[so.order_line_id] = shiftId;
    });
  }

  // ── Build capacity pool per article+size ───────────────────────────────────
  // Each loaded mould = 60 pairs per size (cfg('shots') × 1 pair per shot)
  // Pool is per (article + size) — independent per mould
  const checkedMoulds = getCheckedMoulds();
  const capacityPool = {}; // key: `${articleId}|${size}` → { capacity, allocated }
  checkedMoulds.forEach(m => {
    m.sizes.forEach(size => {
      const key = `${m.article_id}|${size}`;
      if (!capacityPool[key]) capacityPool[key] = { capacity: cfg('shots'), allocated: 0 };
    });
  });
  window._capacityPool = capacityPool; // expose for toggleOrderCard updates

  // ── Articles available for production ──────────────────────────────────────
  const availableArticleIds = new Set(
    (window._articles || [])
      .filter(a => a.mould_status === 'in_production')
      .map(a => a.id)
  );

  // ── Filter to matching pending lines ───────────────────────────────────────
  const pending = lines.filter(l => {
    const bal = (l.qty_ordered || 0) - (l.qty_dispatched || 0);
    if (bal <= 0) return false;
    if (!availableArticleIds.has(l.article_id)) return false;
    const lineColour = (l.colour || '').trim().toUpperCase();
    if (!colours.some(c => c.trim().toUpperCase() === lineColour)) return false;
    const ord = Array.isArray(l.orders) ? l.orders[0] : l.orders;
    if (!ord) return false;
    if (!['pending','partial','in_production'].includes((ord.status||'').toLowerCase())) return false;
    if (pool !== 'mixed' && (ord.pool||'').toLowerCase() !== pool) return false;
    return true;
  });

  pending.forEach(l => { if (Array.isArray(l.orders)) l.orders = l.orders[0]; });

  const blockedCount = lines.filter(l => {
    const bal = (l.qty_ordered||0) - (l.qty_dispatched||0);
    if (bal <= 0) return false;
    const lc = (l.colour||'').trim().toUpperCase();
    if (!colours.some(c => c.trim().toUpperCase() === lc)) return false;
    return !availableArticleIds.has(l.article_id);
  }).length;

  // Set these BEFORE auto-suggest so getLineNet() works correctly
  window._pendingForShift = pending;
  window._stockMap        = stockMap;
  window._pendingPool     = pool;
  window._blockedOrderCount = blockedCount;
  if (btns) btns.style.display = pending.length ? 'flex' : 'none';

  if (!pending.length) {
    const blockedNote = blockedCount > 0
      ? `<div style="margin-top:10px;padding:8px 12px;background:var(--amber-bg);border:1px solid var(--amber-line);border-radius:6px;font-size:12px;color:#92400E">⚠ ${blockedCount} line${blockedCount>1?'s':''} hidden — article moulds in coating</div>`
      : '';
    panel.innerHTML = `
      <div style="background:var(--green-bg);border:1px solid rgba(13,153,115,0.2);border-radius:8px;padding:20px;text-align:center">
        <div style="font-size:24px;margin-bottom:8px">✅</div>
        <div style="font-weight:700;color:var(--green);margin-bottom:4px">No pending orders for ${colours.join(' + ')}</div>
        <div style="font-size:12px;color:var(--ink3)">This shift will produce replenishment stock</div>
        ${blockedNote}
      </div>`;
    updateShiftSummary();
    return;
  }

  // ── Group by colour → party → article → order ─────────────────────────────
  const grouped = {};
  pending.forEach(l => {
    const key = `${l.colour}|||${l.orders?.master_parties?.party_name}|||${l.article_id}|||${l.order_id}`;
    if (!grouped[key]) grouped[key] = {
      colour: l.colour,
      party:  l.orders?.master_parties?.party_name || 'Unknown',
      article_id: l.article_id,
      order_id:   l.order_id,
      pool:       l.orders?.pool,
      lines:      [],
      totalBal:   0,
      totalNetToProduce: 0,
    };
    grouped[key].lines.push(l);

    const bal        = (l.qty_ordered||0) - (l.qty_dispatched||0);
    const inStock    = stockMap[`${l.article_id}|${l.colour}|${l.size}|${l.orders?.pool||pool}`] || 0;
    const netToProd  = Math.max(0, bal - inStock);

    grouped[key].totalBal          += bal;
    grouped[key].totalNetToProduce += netToProd;
  });

  // ── Filter out orders where ALL lines have net-to-produce = 0 (stock covers all) ─
  const groups = Object.values(grouped).filter(g => g.totalNetToProduce > 0);
  const fullyStockedCount = Object.values(grouped).length - groups.length;

  // Sort by colour then by net-to-produce desc
  groups.sort((a, b) => {
    if (a.colour < b.colour) return -1;
    if (a.colour > b.colour) return 1;
    return b.totalNetToProduce - a.totalNetToProduce;
  });

  // ── Pre-suggest orders that fit within per-article+size capacity ───────────
  // Reset capacity pool — allocated tracks committed pairs per article+size
  Object.keys(capacityPool).forEach(k => { capacityPool[k].allocated = 0; });



  groups.forEach(g => {
    // Suggest this order only if NO size would overcommit
    let canSuggest = g.lines.every(l => {
      const net   = getLineNet(l);
      if (net <= 0) return true;
      const cpKey = `${l.article_id}|${l.size}`;
      if (!capacityPool[cpKey]) return false; // mould not loaded
      return capacityPool[cpKey].allocated + net <= capacityPool[cpKey].capacity;
    });
    g.suggested = canSuggest;
    if (canSuggest) {
      g.lines.forEach(l => {
        const net   = getLineNet(l);
        const cpKey = `${l.article_id}|${l.size}`;
        if (capacityPool[cpKey]) capacityPool[cpKey].allocated += net;
      });
    }
  });

  // Store all render data on window — renderPendingPanel() reads from here
  window._pendingGroups            = groups;
  window._pendingColours           = colours;
  window._pendingFullyStockedCount = fullyStockedCount;
  window._scheduledLineIds         = scheduledLineIds;
  window._scheduledLineToShift     = scheduledLineToShift;
  window._pendingBlockedCount      = blockedCount;

  renderPendingPanel();
}

function renderPendingPanel() {
  const panel  = document.getElementById('pending-orders-panel');
  const btns   = document.getElementById('alloc-btns');
  if (!panel) return;

  const groups            = window._pendingGroups || [];
  const colours           = window._pendingColours || [];
  const pool              = window._pendingPool || 'general';
  const capacityPool      = window._capacityPool || {};
  // stockMap accessed via getLineNet() which reads window._stockMap
  const scheduledLineIds  = window._scheduledLineIds || new Set();
  const scheduledLineToShift = window._scheduledLineToShift || {};
  const fullyStockedCount = window._pendingFullyStockedCount || 0;
  const blockedCount      = window._pendingBlockedCount || 0;
  const checkedMoulds     = getCheckedMoulds();

  if (btns) btns.style.display = groups.length ? 'flex' : 'none';

  if (!groups.length) {
    const blockedNote = blockedCount > 0
      ? `<div style="margin-top:10px;padding:8px 12px;background:var(--amber-bg);border:1px solid var(--amber-line);border-radius:6px;font-size:12px;color:#92400E">⚠ ${blockedCount} line${blockedCount>1?'s':''} hidden — article moulds in coating</div>`
      : '';
    panel.innerHTML = `
      <div style="background:var(--green-bg);border:1px solid rgba(13,153,115,0.2);border-radius:8px;padding:20px;text-align:center">
        <div style="font-size:24px;margin-bottom:8px">✅</div>
        <div style="font-weight:700;color:var(--green);margin-bottom:4px">No pending orders for ${colours.join(' + ')}</div>
        <div style="font-size:12px;color:var(--ink3)">This shift will produce replenishment stock</div>
        ${blockedNote}
      </div>`;
    updateShiftSummary();
    return;
  }

  // ── Colour totals ──────────────────────────────────────────────────────────
  const colourTotals = {};
  groups.forEach(g => {
    colourTotals[g.colour] = (colourTotals[g.colour] || 0) + g.totalNetToProduce;
  });

  // ── Render ─────────────────────────────────────────────────────────────────
  let currentColour = null;
  let html = '';

  // If some orders were hidden because stock covers them, show a note
  if (fullyStockedCount > 0) {
    html += `<div style="background:var(--green-bg);border:1px solid rgba(13,153,115,0.2);border-radius:6px;padding:8px 12px;margin-bottom:12px;font-size:12px;color:var(--green);font-weight:600">
      ✅ ${fullyStockedCount} order${fullyStockedCount>1?'s':''} hidden — fully covered by existing stock. Go to Dispatch.
    </div>`;
  }

  groups.forEach(g => {
    const gKey = `${g.order_id}_${g.colour}_${g.article_id}`;
    const _ao = window._allocatedOrders?.[gKey];
    const isChecked = _ao !== undefined ? _ao.checked : g.suggested;
    const isScheduled = g.lines.some(l => scheduledLineIds.has(l.id));
    const scheduledShiftId = isScheduled ? scheduledLineToShift[g.lines.find(l => scheduledLineIds.has(l.id))?.id] : null;

    if (g.colour !== currentColour) {
      currentColour = g.colour;
      const total    = colourTotals[g.colour];
      // Check if total net-to-produce exceeds capacity for any size
      let overcommit = false;
      const cpForColour = {};
      groups.filter(gg => gg.colour === g.colour).forEach(gg => {
        gg.lines.forEach(l => {
          const bal      = (l.qty_ordered||0) - (l.qty_dispatched||0);
          const inStock  = (window._stockMap||{})[`${l.article_id}|${l.colour}|${l.size}|${l.orders?.pool||pool}`] || 0;
          const net      = Math.max(0, bal - inStock);
          const cpKey    = `${l.article_id}|${l.size}`;
          if (!cpForColour[cpKey]) cpForColour[cpKey] = 0;
          cpForColour[cpKey] += net;
          if (capacityPool[cpKey] && cpForColour[cpKey] > capacityPool[cpKey].capacity) overcommit = true;
        });
      });
      html += `
        <div style="display:flex;align-items:center;gap:8px;margin:${html?'16px':'0px'} 0 8px;flex-wrap:wrap">
          <span style="width:10px;height:10px;border-radius:50%;background:${COLOUR_HEX[g.colour]||'#888'};display:inline-block;flex-shrink:0"></span>
          <span style="font-weight:800;font-size:13px;font-family:'IBM Plex Mono',monospace">${g.colour}</span>
          <span style="font-size:12px;color:var(--ink2)">${num(total)} pairs net-to-produce</span>
          ${!checkedMoulds.length
            ? ''
            : overcommit
            ? `<span class="badge low">⚠ Some sizes exceed 60 pairs — split needed</span>`
            : `<span class="badge ok">Within shift capacity</span>`}
        </div>`;
    }

    // Per-size breakdown — show REAL demand per order, flag overcommit at size level
    // Total demand across ALL ticked orders for same article+size is computed separately
    const sizeDetails = g.lines.sort((a,b) => a.size - b.size).map(l => {
      const bal       = (l.qty_ordered||0) - (l.qty_dispatched||0);
      const ordPool   = (Array.isArray(l.orders)?l.orders[0]:l.orders)?.pool || pool;
      const inStock   = (window._stockMap||{})[`${l.article_id}|${l.colour}|${l.size}|${ordPool}`] || 0;
      const netToProd = Math.max(0, bal - inStock);
      const cpKey     = `${l.article_id}|${l.size}`;
      const mouldLoaded = capacityPool[cpKey] !== undefined;
      const cap       = mouldLoaded ? capacityPool[cpKey].capacity : null; // 60

      // Total demand for this article+size across ALL currently ticked orders
      const pendingLines = window._pendingForShift || [];
      const totalDemandForSize = Object.values(window._allocatedOrders||{})
        .filter(v => v.checked)
        .reduce((sum, v) => {
          return sum + pendingLines
            .filter(pl =>
              v.lineIds?.includes(pl.id) &&
              pl.article_id === l.article_id &&
              pl.size === l.size &&
              pl.colour === l.colour   // must match colour too
            )
            .reduce((s, pl) => s + getLineNet(pl), 0);
        }, 0);

      // Is this size overcommitted across all ticked orders?
      // Only flag overcommit if THIS order is ticked — unticked orders show their own demand normally
      const thisOrderTicked = !!(window._allocatedOrders?.[gKey]?.checked);
      const sizeOvercommit = mouldLoaded && thisOrderTicked && totalDemandForSize > cap;
      // Excess pairs that cannot be produced this shift for this size (shared across ticked orders)
      const sizeExcess     = sizeOvercommit ? totalDemandForSize - cap : 0;

      // thisShift for THIS order = its full netToProd (we show real demand)
      // deferred = shown only if this size is overcommitted (some pairs across orders will defer)
      const thisShift  = netToProd; // always show real order demand
      const deferred   = 0;        // overcommit shown at size level, not per-order

      return { l, bal, inStock, netToProd, thisShift, deferred, sizeOvercommit, sizeExcess, totalDemandForSize, mouldLoaded, cpKey, cap };
    });

    const totalThisShift    = sizeDetails.reduce((s, d) => s + d.thisShift, 0);
    const hasOvercommit     = sizeDetails.some(d => d.sizeOvercommit);
    const hasStock          = sizeDetails.some(d => d.inStock > 0);
    const hasMouldGap       = sizeDetails.some(d => d.netToProd > 0 && !d.mouldLoaded);
    const totalOvercommitPairs = sizeDetails.reduce((s,d) => s + (d.sizeExcess||0), 0);

    html += `
      <div class="order-alloc-card ${isChecked ? 'selected' : ''} ${isScheduled ? 'scheduled' : ''}"
           id="ocard-${gKey}"
           ${isScheduled ? '' : `onclick="toggleOrderCard('${gKey}','${g.order_id}','${g.colour}','${g.article_id}',${g.totalNetToProduce},'${g.lines.map(l=>l.id).join(',')}')"`}
           style="${isScheduled ? 'opacity:0.7;cursor:default' : ''}">
        <div style="display:flex;align-items:flex-start;gap:10px">
          <div style="padding-top:2px">
            ${isScheduled
              ? `<div style="width:16px;height:16px;border-radius:3px;background:var(--amber);display:flex;align-items:center;justify-content:center;font-size:9px;color:white">📅</div>`
              : `<div class="alloc-checkbox ${isChecked ? 'checked' : ''}" id="cb-${gKey}"></div>`}
          </div>
          <div style="flex:1;min-width:0">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:wrap">
              <span style="font-weight:700;font-size:13px">${g.party}</span>
              <span style="font-family:'IBM Plex Mono',monospace;font-size:11px;color:var(--ink3)">${g.article_id}</span>
              ${poolBadge(g.pool)}
              ${isScheduled
                ? `<span class="badge partial" style="margin-left:auto">📅 In Shift #${scheduledShiftId}</span>`
                : `<span style="margin-left:auto;font-weight:800;font-size:13px;color:var(--blue)">${num(totalThisShift)} this shift</span>`}
            </div>

            <!-- Size breakdown: balance / in-stock / this-shift / deferred -->
            <div style="display:grid;grid-template-columns:repeat(${g.lines.length},1fr);gap:3px;margin-bottom:8px">
              ${sizeDetails.map(d => {
                const { l, inStock, netToProd, thisShift, sizeOvercommit, sizeExcess, totalDemandForSize, mouldLoaded, cap } = d;
                const allCovered  = netToProd === 0;
                const bgColor     = allCovered    ? 'var(--green-bg)'
                                  : !mouldLoaded  ? 'var(--amber-bg)'
                                  : sizeOvercommit? 'var(--red-bg)'
                                  : 'var(--surface2)';
                const borderColor = allCovered    ? 'rgba(13,153,115,0.25)'
                                  : sizeOvercommit? 'rgba(220,38,38,0.35)'
                                  : 'transparent';
                return `
                  <div style="text-align:center;background:${bgColor};border-radius:4px;padding:5px 2px;border:1px solid ${borderColor}">
                    <div style="font-size:9px;color:var(--ink3);font-weight:600">Sz${l.size}</div>
                    ${allCovered
                      ? `<div style="font-size:10px;color:var(--green);font-weight:700">✓ stock</div>
                         <div style="font-size:9px;color:var(--green)">${inStock}</div>`
                      : !mouldLoaded
                      ? `<div style="font-size:11px;font-weight:700;color:var(--amber)">${netToProd}</div>
                         <div style="font-size:9px;color:var(--amber)">no mould</div>`
                      : sizeOvercommit
                      ? `<div style="font-size:12px;font-weight:700;color:var(--red)">${netToProd}</div>
                         <div style="font-size:9px;color:var(--red)">⚠ ${cap} max</div>
                         <div style="font-size:9px;color:var(--ink3)">${totalDemandForSize} total</div>`
                      : `<div style="font-size:12px;font-weight:700;font-family:'IBM Plex Mono',monospace">${thisShift}</div>
                         ${inStock>0?`<div style="font-size:9px;color:var(--green)">+${inStock} stk</div>`:''}`
                    }
                  </div>`;
              }).join('')}
            </div>

            <!-- Status row -->
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:11px">
              ${hasOvercommit
                ? `<span style="color:var(--red);font-weight:600">⚠ Size conflict — ${sizeDetails.filter(d=>d.sizeOvercommit).map(d=>`Sz${d.l.size}: ${d.totalDemandForSize}>${d.cap}`).join(', ')} — split orders across shifts</span>`
                : `<span style="color:var(--green);font-weight:600">✅ Fits in shift (${num(totalThisShift)} pairs)</span>`}
              ${hasMouldGap ? `<span style="color:var(--amber)">⚠ Load moulds for all sizes</span>` : ''}
              ${g.totalBal !== g.totalNetToProduce
                ? `<span style="color:var(--green)">${num(g.totalBal - g.totalNetToProduce)} pairs covered by stock</span>`
                : ''}
              ${hasOvercommit && !isScheduled
                ? `<button class="btn-secondary btn-sm" style="margin-left:auto;font-size:10px" onclick="event.stopPropagation();planRemainderShift('${g.colour}','${g.article_id}')">+ Plan next shift for remainder →</button>`
                : ''}
            </div>
          </div>
        </div>
      </div>`;
  });

  if (blockedCount > 0) {
    html += `<div style="margin-top:12px;padding:10px 14px;background:var(--amber-bg);border:1px solid var(--amber-line);border-radius:8px;font-size:12px;color:#92400E">
      ⚠ <strong>${blockedCount} line${blockedCount>1?'s':''} hidden</strong> — article moulds in coating.
    </div>`;
  }

  panel.innerHTML = html;

  // Auto-apply suggestions only for orders user hasn't interacted with yet
  if (!window._allocatedOrders) window._allocatedOrders = {};
  groups.forEach(g => {
    const gKey = `${g.order_id}_${g.colour}_${g.article_id}`;
    if (!(gKey in window._allocatedOrders) && g.suggested) {
      window._allocatedOrders[gKey] = {
        checked: true, orderId: parseInt(g.order_id), colour: g.colour,
        article: g.article_id, total: g.totalNetToProduce,
        lineIds: g.lines.map(l => l.id)
      };
    }
  });

  updateShiftSummary();
}


function toggleOrderCard(gKey, orderId, colour, article, total, lineIdStr) {
  if (!window._allocatedOrders) window._allocatedOrders = {};
  const existing = window._allocatedOrders[gKey];
  const lineIds  = lineIdStr.split(',').map(Number);

  if (existing?.checked) {
    // Store checked:false so re-renders know user explicitly unticked this
    window._allocatedOrders[gKey] = { checked: false };
  } else {
    window._allocatedOrders[gKey] = {
      checked: true, orderId: parseInt(orderId), colour,
      article, total: parseInt(total), lineIds
    };
  }

  // Defer re-render so the click event fully completes first
  setTimeout(() => {
    renderPendingPanel();
    updateShiftSummary();
  }, 0);
}

function toggleAllOrders(select) {
  const pending = window._pendingForShift || [];
  const grouped = {};
  pending.forEach(l => {
    const key = `${l.order_id}_${l.colour}_${l.article_id}`;
    if (!grouped[key]) grouped[key] = { order_id:l.order_id, colour:l.colour, article_id:l.article_id, lines:[], totalBal:0 };
    grouped[key].lines.push(l);
    grouped[key].totalBal += (l.qty_ordered - l.qty_dispatched);
  });

  Object.entries(grouped).forEach(([gKey, g]) => {
    const card = document.getElementById(`ocard-${gKey}`);
    const cb   = document.getElementById(`cb-${gKey}`);
    if (select) {
      window._allocatedOrders[gKey] = { checked:true, orderId:parseInt(g.order_id), colour:g.colour, article:g.article_id, total:g.totalBal, lineIds:g.lines.map(l=>l.id) };
      card?.classList.add('selected'); cb?.classList.add('checked');
    } else {
      window._allocatedOrders[gKey] = { checked: false };
      card?.classList.remove('selected'); cb?.classList.remove('checked');
    }
  });
  updateShiftSummary();
}

// ═══ SHIFT SUMMARY PANEL ═════════════════════════════════════════════════════
function updateShiftSummary() {
  const panel = document.getElementById('shift-summary-panel');
  // If collapsed, auto-expand when summary has real data
  const summaryBody = document.getElementById('summary-strip-body');
  const isCollapsed = summaryBody && summaryBody.style.display === 'none';
  if (!panel) return;

  const mode        = document.getElementById('shift-colour-mode')?.value || 'dual';
  const c1          = document.getElementById('shift-colour1')?.value;
  const c2          = document.getElementById('shift-colour2')?.value;
  const shiftDate   = document.getElementById('shift-date')?.value;
  const colours     = [c1, mode==='dual'?c2:null].filter(Boolean);
  const capPerColour = getShiftCapacityPerColour();
  const alloc       = Object.values(window._allocatedOrders||{}).filter(a=>a.checked);
  const rmStock     = window._rmStock || [];

  if (!colours.length || !capPerColour) {
    panel.innerHTML = `<p style="color:var(--ink3);font-size:12px">Complete configuration to see summary</p>`;
    return;
  }

  // Per-colour stats
  const byColour = {};
  colours.forEach(c => { byColour[c] = { allocated:0, orders:0 }; });
  alloc.forEach(a => {
    if (byColour[a.colour]) {
      byColour[a.colour].allocated += a.total;
      byColour[a.colour].orders++;
    }
  });

  // RM check — two numbers:
  // 1. Mould-based (actual consumption): what the machine WILL consume when shift runs
  // 2. Order-based (minimum needed): what orders require
  const articles  = window._articles||[];
  const checkedMoulds = getCheckedMoulds();
  const rmNeededMould  = {}; // actual machine consumption
  const rmNeededOrder  = {}; // order demand only
  colours.forEach(c => { rmNeededMould[c] = 0; rmNeededOrder[c] = 0; });

  // Mould-based: every loaded mould runs 60 shots × 2 sizes × compound per pair
  checkedMoulds.forEach(m => {
    const art = articles.find(a => a.id === m.article_id);
    if (!art || !art.compound_per_pair_g) return;
    const kg = (art.compound_per_pair_g * cfg('shots') * m.sizes.length) / 1000;
    colours.forEach(c => { rmNeededMould[c] = (rmNeededMould[c]||0) + kg; });
  });

  // Order-based: only net-to-produce pairs × compound per pair
  alloc.forEach(a => {
    if (!colours.includes(a.colour)) return;
    const art = articles.find(x => x.id === a.article);
    if (!art || !art.compound_per_pair_g) return;
    const kg = (art.compound_per_pair_g * (a.total || 0)) / 1000;
    rmNeededOrder[a.colour] = (rmNeededOrder[a.colour]||0) + kg;
  });

  // Use mould-based as the procurement number (always >= order-based)
  const rmNeeded = rmNeededMould;

  const poDeadline    = shiftDate ? addDays(shiftDate, -cfg('rmLead')) : null;
  const poOverdue     = poDeadline && poDeadline < today();
  const poDaysLeft    = poDeadline ? daysDiff(poDeadline, today()) : null;

  // Fulfilment analysis
  // Count orders where all sizes fit vs need splitting
  // An order "fits" when its totalNetToProduce <= cfg('shots') (60 per size max)
  // Since total is sum across all sizes, we check per-size via capacityPool
  const capacityPool = window._capacityPool || {};
  const fulfilledCount = alloc.filter(a => {
    // check if any size for this order exceeds 60
    const pending = window._pendingForShift || [];
    const lines = pending.filter(l => a.lineIds?.includes(l.id));
    return !lines.some(l => {
      const bal     = (l.qty_ordered||0) - (l.qty_dispatched||0);
      const inStk   = (window._stockMap||{})[`${l.article_id}|${l.colour}|${l.size}|${(Array.isArray(l.orders)?l.orders[0]:l.orders)?.pool||'general'}`] || 0;
      const net     = Math.max(0, bal - inStk);
      return net > cfg('shots');
    });
  }).length;
  const partialCount = alloc.length - fulfilledCount;

  let html = '';

  // ── COMPACT HORIZONTAL STRIP: colour capacity + order counts ──
  html += `<div style="display:flex;gap:16px;flex-wrap:wrap;align-items:flex-start">`;
  colours.forEach(c => {
    const allocated = byColour[c]?.allocated || 0;
    const orders    = byColour[c]?.orders || 0;
    const pct  = capPerColour ? Math.min(100, Math.round((allocated/capPerColour)*100)) : 0;
    const over = allocated > capPerColour;
    html += `
      <div style="min-width:160px;flex:1">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:5px">
          <span style="width:9px;height:9px;border-radius:50%;background:${COLOUR_HEX[c]||'#888'};display:inline-block;border:1px solid rgba(0,0,0,0.1);flex-shrink:0"></span>
          <span style="font-weight:700;font-size:13px">${c}</span>
          <span style="font-family:'IBM Plex Mono',monospace;font-size:12px;font-weight:700;color:${over?'var(--red)':'var(--blue)'};margin-left:auto">${num(allocated)}<span style="font-weight:400;color:var(--ink3)"> / ${num(capPerColour)}</span></span>
        </div>
        <div class="progress-bar" style="height:6px;margin-bottom:4px">
          <div class="progress-fill ${over?'red':pct>80?'yellow':'green'}" style="width:${Math.min(100,pct)}%"></div>
        </div>
        <div style="font-size:10px;color:${over?'var(--red)':'var(--ink3)'}">
          ${over ? `⚠ Over by ${num(allocated-capPerColour)} — split needed` : `${pct}% · ${orders} order${orders!==1?'s':''} · ${num(capPerColour-allocated)} free`}
        </div>
      </div>`;
  });
  html += `
    <div style="border-left:1px solid var(--line);padding-left:16px;display:flex;gap:12px;flex-shrink:0">
      <div style="text-align:center">
        <div style="font-size:22px;font-weight:800;color:var(--green);line-height:1">${fulfilledCount}</div>
        <div style="font-size:10px;color:var(--ink3);margin-top:2px;white-space:nowrap">fully filled</div>
      </div>
      <div style="text-align:center">
        <div style="font-size:22px;font-weight:800;color:${partialCount>0?'var(--amber)':'var(--ink4)'};line-height:1">${partialCount}</div>
        <div style="font-size:10px;color:var(--ink3);margin-top:2px;white-space:nowrap">partial</div>
      </div>
    </div>`;
  html += `</div>`;
  if (partialCount > 0) {
    html += `<div style="font-size:11px;color:var(--amber);margin-top:8px">⚠ ${partialCount} order(s) exceed shift capacity — balance stays pending for next shift.</div>`;
  }

  // ── RM Check ──
  // ── RM Check ──
  html += `<div class="summary-section">`;
  html += `<div class="summary-label">Raw Material Check</div>`;
  let allRMOk = true;
  colours.forEach(c => {
    const needed  = rmNeeded[c] || 0;
    const inStock = rmStock.find(r=>r.compound_colour===c)?.qty_kg || 0;
    const ok      = inStock >= needed;
    if (!ok) allRMOk = false;
    const orderKg = rmNeededOrder[c] || 0;
    const surplusKg = Math.max(0, needed - orderKg);
    html += `
      <div style="padding:8px 10px;background:${ok?'var(--green-bg)':'var(--red-bg)'};border:1px solid ${ok?'rgba(5,150,105,0.2)':'rgba(220,38,38,0.2)'};border-radius:6px;margin-bottom:6px;font-size:12px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:${surplusKg>0?4:0}px">
        <span style="display:flex;align-items:center;gap:5px">
          <span style="width:7px;height:7px;border-radius:50%;background:${COLOUR_HEX[c]||'#888'};display:inline-block"></span>
          <strong>${c}</strong>
        </span>
        <span style="font-family:'IBM Plex Mono',monospace;color:${ok?'var(--green)':'var(--red)'}">
          ${ok?'✅':'❌'} ${inStock.toFixed(1)}kg stock / ${needed.toFixed(1)}kg needed
        </span>
        </div>
        ${surplusKg > 0.1 ? `
          <div style="font-size:10px;color:var(--ink3);margin-top:3px;display:flex;gap:8px;flex-wrap:wrap">
            <span>📦 Order needs: <strong>${orderKg.toFixed(1)}kg</strong></span>
            <span style="color:var(--blue)">⚙ Machine consumes: <strong>${needed.toFixed(1)}kg</strong></span>
            <span style="color:var(--ink3)">→ ${surplusKg.toFixed(1)}kg produces surplus stock</span>
          </div>` : ''}
      </div>`;
  });
  if (!allRMOk) {
    html += `<div style="font-size:11px;color:var(--red);padding:8px;background:var(--red-bg);border-radius:6px;margin-top:4px">❌ Insufficient RM. Raise a PO immediately — 14 day lead time.</div>`;
  }
  html += `</div>`;

  // ── PO Deadline ──
  if (poDeadline) {
    html += `<div class="summary-section">`;
    html += `<div class="summary-label">PO Deadline</div>`;
    html += `
      <div style="padding:10px;background:${poOverdue?'var(--red-bg)':poDaysLeft<=3?'var(--amber-bg)':'var(--green-bg)'};border:1px solid ${poOverdue?'rgba(220,38,38,0.2)':poDaysLeft<=3?'rgba(217,119,6,0.2)':'rgba(5,150,105,0.2)'};border-radius:6px;font-size:12px">
        <div style="font-weight:700;margin-bottom:2px">PO must be raised by: ${fmtDate(poDeadline)}</div>
        <div style="color:${poOverdue?'var(--red)':poDaysLeft<=3?'var(--amber)':'var(--green)'}">
          ${poOverdue?`🚨 ${Math.abs(poDaysLeft)} days overdue!`:poDaysLeft===0?'⚠ Due today!':poDaysLeft<=3?`⚠ ${poDaysLeft} days left`:`✅ ${poDaysLeft} days left`}
        </div>
      </div>`;
    html += `</div>`;
  }

  // ── Warning for footer ──
  const warnEl = document.getElementById('shift-footer-warn');
  if (warnEl) {
    if (!allRMOk) warnEl.textContent = '❌ Insufficient raw material — raise PO before confirming';
    else if (partialCount > 0) warnEl.textContent = `⚠ ${partialCount} order(s) exceed shift capacity — they will be split across shifts`;
    else warnEl.textContent = '';
  }

  panel.innerHTML = html;

  // Restore collapsed state after re-render
  if (window._summaryCollapsed) {
    const body = document.getElementById('summary-strip-body');
    const btn  = document.getElementById('summary-toggle-btn');
    if (body) body.style.display = 'none';
    if (btn)  btn.textContent = '▼';
  }
}

// ═══ SAVE SHIFT ═══════════════════════════════════════════════════════════════
async function saveShift() {
  const shiftDate  = document.getElementById('shift-date').value;
  const pool       = document.getElementById('shift-pool').value;
  const mode       = document.getElementById('shift-colour-mode').value;
  const colour1    = document.getElementById('shift-colour1').value;
  const colour2    = mode==='dual' ? document.getElementById('shift-colour2').value : null;
  const checkedMoulds = getCheckedMoulds();
  const checked       = getCheckedArticles();

  if (!shiftDate)               { showToast('Select a shift date', 'error'); return; }
  const existing = (window._allShifts||[]).find(s => s.shift_date === shiftDate && s.status !== 'cancelled');
  if (existing) {
    if (!confirmAction(`A shift is already planned for ${fmtDate(shiftDate)} (${existing.colour_1}${existing.colour_2?'+'+existing.colour_2:''}). Plan another shift on the same day?`)) return;
  }
  if (!colour1)                  { showToast('Select Colour 1', 'error'); return; }
  if (mode==='dual' && !colour2) { showToast('Select Colour 2 for dual mode', 'error'); return; }
  if (mode==='dual' && colour1 && colour2 && colour1 === colour2) { showToast('Colour 1 and Colour 2 cannot be the same', 'error'); return; }
  if (!checkedMoulds.length)     { showToast('Select at least one mould', 'error'); return; }

  const capPerColour = getShiftCapacityPerColour();
  const shift = {
    shift_date: shiftDate, pool, colour_mode: mode,
    colour_1: colour1, colour_2: colour2,
    target_pairs_colour_1: capPerColour,
    target_pairs_colour_2: mode==='dual' ? capPerColour : 0,
    status: 'planned'
  };

  // Group moulds by article and store selected mould numbers
  const mouldsByArticle = {};
  checkedMoulds.forEach(m => {
    if (!mouldsByArticle[m.article_id]) mouldsByArticle[m.article_id] = { article_id: m.article_id, moulds: 0, mould_numbers: [] };
    mouldsByArticle[m.article_id].moulds++;
    mouldsByArticle[m.article_id].mould_numbers.push(m.mould);
  });
  const articles = Object.values(mouldsByArticle);
  const alloc       = Object.values(window._allocatedOrders||{}).filter(a=>a.checked);
  const shiftOrders = alloc.map(a => ({ order_line_id:a.lineIds[0], qty_planned:a.total }));

  let data, error;
  if (window._editingShiftId) {
    // Edit mode — update existing shift header + replace articles
    const editId = window._editingShiftId;
    window._editingShiftId = null;
    const { error: e1 } = await DB.updateShift(editId, {
      shift_date:shiftDate, pool, colour_mode:mode,
      colour_1:colour1, colour_2:colour2,
      target_pairs_colour_1:capPerColour,
      target_pairs_colour_2:mode==='dual'?capPerColour:0
    });
    const { error: e2 } = await DB.replaceShiftArticles(editId, articles);
    error = e1 || e2;
    if (!error) showToast(`Shift updated for ${fmtDate(shiftDate)}`, 'success');
  } else {
    const res = await DB.createShift(shift, articles, shiftOrders);
    error = res.error; data = res.data;
  }
  if (error) { showToast('Error: '+error.message, 'error'); return; }

  // Mark orders in production
  const orderIds = [...new Set(alloc.map(a=>a.orderId))];
  for (const oid of orderIds) await DB.updateOrder(oid, { status:'in_production' });

  showToast(`Shift created for ${fmtDate(shiftDate)} · ${alloc.length} order groups allocated`, 'success');
  window._allocatedOrders = {};
  closeModal('new-shift-modal');
  renderProduction();
}

// ═══ SHIFT CARDS ═════════════════════════════════════════════════════════════
function renderShiftCards(shifts) {
  if (!shifts.length) return emptyState('⚙️', 'No shifts yet — click "+ Plan New Shift" to get started');
  return shifts.map(s => {
    const totalTarget = s.colour_mode==='single' ? s.target_pairs_colour_1 : s.target_pairs_colour_1+(s.target_pairs_colour_2||0);
    const totalActual = (s.actual_pairs_colour_1||0)+(s.actual_pairs_colour_2||0);
    const pct = totalTarget ? Math.round((totalActual/totalTarget)*100) : 0;
    return `
      <div class="shift-card ${s.status}">
        <div class="shift-header">
          <div>
            <div class="shift-date">${fmtDate(s.shift_date)}</div>
            <div style="font-size:11px;color:var(--ink3);font-family:'IBM Plex Mono',monospace;margin-top:1px">${s.pool?.toUpperCase()}</div>
          </div>
          <div class="shift-meta">
            ${statusBadge(s.status)}
            <span class="badge ${s.colour_mode==='single'?'pending':'general'}">${s.colour_mode==='single'?'Single':'Dual'}</span>
          </div>
        </div>
        <div style="display:flex;gap:8px;align-items:center;margin-bottom:14px">
          <span style="font-size:11px;color:var(--ink3);font-weight:600">COLOURS:</span>
          <span class="colour-chip"><span class="colour-dot" style="background:${COLOUR_HEX[s.colour_1]||'#888'}"></span>${s.colour_1}</span>
          ${s.colour_2?`<span style="color:var(--ink3)">+</span><span class="colour-chip"><span class="colour-dot" style="background:${COLOUR_HEX[s.colour_2]||'#888'}"></span>${s.colour_2}</span>`:''}
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:12px">
          <div style="background:var(--surface2);border-radius:6px;padding:10px;text-align:center">
            <div style="font-size:10px;color:var(--ink3);margin-bottom:3px">${s.colour_1}</div>
            <div style="font-weight:800;font-size:16px">${num(s.target_pairs_colour_1)}</div>
          </div>
          ${s.colour_mode==='dual'&&s.colour_2?`
            <div style="background:var(--surface2);border-radius:6px;padding:10px;text-align:center">
              <div style="font-size:10px;color:var(--ink3);margin-bottom:3px">${s.colour_2}</div>
              <div style="font-weight:800;font-size:16px">${num(s.target_pairs_colour_2)}</div>
            </div>`:'<div></div>'}
          <div style="background:var(--blue-soft);border:1px solid rgba(37,99,235,0.15);border-radius:6px;padding:10px;text-align:center">
            <div style="font-size:10px;color:var(--blue);margin-bottom:3px">TOTAL</div>
            <div style="font-weight:800;font-size:16px;color:var(--blue)">${num(totalTarget)}</div>
          </div>
        </div>
        ${s.status==='completed'?`
          <div style="margin-bottom:10px">
            <div style="display:flex;justify-content:space-between;margin-bottom:3px;font-size:12px">
              <span style="color:var(--ink3)">Actual output</span>
              <span style="font-weight:600">${num(totalActual)} pairs (${pct}%)</span>
            </div>
            <div class="progress-bar"><div class="progress-fill ${pct>=90?'green':pct>=70?'yellow':'red'}" style="width:${pct}%"></div></div>
          </div>`:''}
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn-secondary btn-sm" onclick="viewShiftDetail(${s.id})">📋 Detail</button>
          ${s.status==='planned'    ?`<button class="btn-secondary btn-sm" onclick="startShift(${s.id})">▶ Start</button>`:''}
          ${s.status==='in_progress'?`<button class="btn-primary btn-sm" onclick="openLogOutput(${s.id})">✓ Log Output</button>`:''}
          ${s.status==='planned'    ?`<button class="btn-secondary btn-sm" onclick="editPlannedShift(${s.id})">✏ Edit</button>`:''}
          ${s.status==='planned'    ?`<button class="btn-secondary btn-sm" onclick="printDailyCard(${s.id})">🖨 Print</button>`:''}
          ${s.status==='completed'  ?`<button class="btn-secondary btn-sm" onclick="duplicateShift(${s.id})" style="color:var(--blue);border-color:var(--blue-mid)">↺ Run Again</button>`:''}
          ${s.status==='completed' && window._currentRole==='admin' ?`<button class="btn-secondary btn-sm" onclick="editCompletedOutput(${s.id})">✏ Fix Output</button>`:''}
        </div>
      </div>`;
  }).join('');
}

function filterShifts(btn, filter) {
  document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
  btn.classList.add('active');
  const all = window._allShifts||[];
  if (filter === 'calendar') {
    document.getElementById('shifts-container').innerHTML = renderWeeklyCalendar(all);
    return;
  }
  let f;
  if (filter==='upcoming')  f = all.filter(s=>s.shift_date>=today()||s.status==='in_progress');
  else if (filter==='completed') f = all.filter(s=>s.status==='completed');
  else f = all;
  document.getElementById('shifts-container').innerHTML = renderShiftCards(f);
}

function openNewShiftModal() {
  window._allocatedOrders = {};
  openModal('new-shift-modal');
  setTimeout(() => {
    onColourModeChange();
    document.getElementById('shift-date')?.focus();
  }, 100);
}

async function startShift(id) {
  await DB.updateShift(id, { status:'in_progress' });
  showToast('Shift started', 'info');
  renderProduction();
}

async function openLogOutput(shiftId) {
  const s = window._allShifts?.find(x=>x.id===shiftId);
  if (!s) return;
  window._logShiftId   = shiftId;
  window._logShiftArts = await DB.getShiftArticles(shiftId);
  document.getElementById('log-output-body').innerHTML = `
    <div class="info-row" style="margin-bottom:20px">
      <div class="info-item"><div class="info-label">Date</div><div class="info-value">${fmtDate(s.shift_date)}</div></div>
      <div class="info-item"><div class="info-label">Mode</div><div class="info-value">${s.colour_mode.toUpperCase()}</div></div>
    </div>
    <div class="form-row cols-2">
      <div class="form-group">
        <label>Actual ${s.colour_1} Pairs Produced</label>
        <input type="number" id="actual-c1" value="${s.target_pairs_colour_1}" />
      </div>
      ${s.colour_mode==='dual'&&s.colour_2?`
        <div class="form-group">
          <label>Actual ${s.colour_2} Pairs Produced</label>
          <input type="number" id="actual-c2" value="${s.target_pairs_colour_2}" />
        </div>`:'<div></div>'}
    </div>
    <div class="form-group">
      <label>Notes (downtime, issues, etc.)</label>
      <input type="text" id="actual-notes" placeholder="e.g. 10 min colour flush downtime" />
    </div>`;
  openModal('log-output-modal');
}

async function saveActualOutput() {
  const shiftId = window._logShiftId;
  const shift   = window._allShifts?.find(x => x.id === shiftId);
  const arts    = window._logShiftArts || [];
  const c1      = parseInt(document.getElementById('actual-c1')?.value)||0;
  const c2      = parseInt(document.getElementById('actual-c2')?.value)||0;

  if (c1 <= 0 && (shift?.colour_mode !== 'dual' || c2 <= 0)) {
    showToast('Enter actual pairs produced — cannot be 0', 'error'); return;
  }
  if (c1 < 0 || c2 < 0) { showToast('Pairs cannot be negative', 'error'); return; }

  const { error } = await DB.logActualOutput(shiftId, c1, c2);
  if (error) { showToast('Error: '+error.message, 'error'); return; }

  // Update qty_produced on allocated order lines
  try {
    const shiftOrders = await DB.getShiftOrders(shiftId);
    for (const so of shiftOrders) {
      if (so.order_line_id && so.qty_planned > 0) {
        const line = await DB.getOrderLines(0).then ? null : null; // get line
        // Update qty_produced by qty_planned
        await DB.updateOrderLine(so.order_line_id, { qty_produced: so.qty_planned });
      }
    }
  } catch(e) { /* non-critical */ }

  // AUTO-UPDATE INVENTORY for each article loaded in the shift
  if (arts.length && shift) {
    const pool = shift.pool === 'mixed' ? 'general' : shift.pool;
    for (const art of arts) {
      const artId = art.article_id;
      // Only update inventory for the sizes that were actually run (selected moulds)
      const allMouldSizes = (MOULD_MAP[artId] || [])
        .filter(m => art.mould_numbers ? art.mould_numbers.includes(m.mould) : true)
        .flatMap(m => m.sizes);
      const sizes = allMouldSizes.length > 0 ? allMouldSizes : (MENS_ARTICLES.includes(artId) ? MENS_SIZES : WOMENS_SIZES);
      const pairsC1PerSize = sizes.length ? Math.round(c1 / arts.length / sizes.length) : 0;
      const pairsC2PerSize = (sizes.length && shift.colour_mode==='dual' && shift.colour_2) ? Math.round(c2 / arts.length / sizes.length) : 0;
      // Build order demand per size for surplus detection
      // Sum qty_planned from shift orders for this article
      const shiftOrders2 = await DB.getShiftOrders(shiftId);
      const orderDemand = {}; // colour|size → qty planned for orders
      shiftOrders2.forEach(so => {
        const line = so.order_lines;
        if (!line || line.article_id !== artId) return;
        const key = `${line.colour}|${line.size}`;
        orderDemand[key] = (orderDemand[key] || 0) + (so.qty_planned || 0);
      });

      for (const size of sizes) {
        if (pairsC1PerSize > 0) {
          const demandKey  = `${shift.colour_1}|${size}`;
          const demanded   = orderDemand[demandKey] || 0;
          const surplus    = Math.max(0, pairsC1PerSize - demanded);
          const forOrders  = pairsC1PerSize - surplus;
          const reason     = surplus > 0
            ? `Shift #${shiftId} — ${forOrders} for orders, ${surplus} surplus stock`
            : `Shift #${shiftId} production`;
          await DB.upsertInventory(artId, shift.colour_1, size, pool, pairsC1PerSize);
          await DB.logStockMovement(artId, shift.colour_1, size, pool, pairsC1PerSize, reason, shiftId);
        }
        if (shift.colour_2 && pairsC2PerSize > 0) {
          const demandKey  = `${shift.colour_2}|${size}`;
          const demanded   = orderDemand[demandKey] || 0;
          const surplus    = Math.max(0, pairsC2PerSize - demanded);
          const forOrders  = pairsC2PerSize - surplus;
          const reason     = surplus > 0
            ? `Shift #${shiftId} — ${forOrders} for orders, ${surplus} surplus stock`
            : `Shift #${shiftId} production`;
          await DB.upsertInventory(artId, shift.colour_2, size, pool, pairsC2PerSize);
          await DB.logStockMovement(artId, shift.colour_2, size, pool, pairsC2PerSize, reason, shiftId);
        }
      }

      // ── Deduct RM compound used for this article ──────────────────────────
      const artConfig = (window._articles||[]).find(a => a.id === artId);
      if (artConfig?.compound_per_pair_g) {
        const totalPairsThisArt = (pairsC1PerSize + pairsC2PerSize) * sizes.length;
        const kgUsed = (artConfig.compound_per_pair_g * totalPairsThisArt) / 1000;
        if (kgUsed > 0) {
          const colours = [shift.colour_1];
          if (shift.colour_2 && shift.colour_mode === 'dual') colours.push(shift.colour_2);
          for (const col of colours) {
            const kgPerColour = kgUsed / colours.length;
            await DB.updateRMStock(col, -kgPerColour);
          }
        }
      }
    }
    // ── AUTO-CHECK: which orders can now be dispatched ──────────────────────
  try {
    const fulfilStatus = await DB.getOrderFulfilmentStatus();
    const nowFulfillable = fulfilStatus.filter(f => f.canFullyFulfil || f.canPartialFulfil);
    // ── Update order statuses based on new inventory ──────────────────────
    // in_production → ready if stock fully covers balance
    // in_production → pending if stock doesn't cover all sizes yet
    for (const f of fulfilStatus) {
      if (!f.orderId) continue;
      const ord = f;
      // Only update orders that were in_production (shift just completed them)
      const orderObj = (await DB.getOrders()).find(o => o.id === f.orderId);
      if (!orderObj || orderObj.status !== 'in_production') continue;
      if (f.canFullyFulfil) {
        await DB.updateOrder(f.orderId, { status: 'ready' });
      } else {
        // Stock doesn't fully cover — move back to pending so it shows correctly
        await DB.updateOrder(f.orderId, { status: 'pending' });
      }
    }

    if (nowFulfillable.length > 0) {
      const fullCount    = nowFulfillable.filter(f => f.canFullyFulfil).length;
      const partialCount = nowFulfillable.filter(f => f.canPartialFulfil && !f.canFullyFulfil).length;
      let msg = `✅ Shift complete · Inventory updated`;
      if (fullCount > 0) msg += ` · ${fullCount} order${fullCount>1?'s':''} ready to dispatch`;
      if (partialCount > 0) msg += ` · ${partialCount} can be partially dispatched`;
      showToast(msg, 'success');
      window._pendingFulfilCount = nowFulfillable.length;
    } else {
      showToast(`✅ Shift complete — inventory updated for ${arts.length} article${arts.length>1?'s':''}`, 'success');
    }
  } catch(e) {
    showToast(`✅ Shift complete — inventory updated for ${arts.length} article${arts.length>1?'s':''}`, 'success');
  }
  } else {
    showToast('Shift completed & output logged', 'success');
  }
  closeModal('log-output-modal');
  renderProduction();
}

async function duplicateShift(shiftId) {
  const shift = (window._allShifts||[]).find(s => s.id === shiftId);
  if (!shift) return;
  openNewShiftModal();
  setTimeout(async () => {
    // Pre-fill colour mode, colours, pool, duration
    const modeEl = document.getElementById('shift-colour-mode');
    const c1El   = document.getElementById('shift-colour1');
    const c2El   = document.getElementById('shift-colour2');
    const poolEl = document.getElementById('shift-pool');
    if (modeEl) { modeEl.value = shift.colour_mode; onColourModeChange(); }
    if (poolEl) poolEl.value = shift.pool || 'general';
    // Wait for colour dropdowns to populate
    await new Promise(r => setTimeout(r, 150));
    if (c1El) c1El.value = shift.colour_1 || '';
    if (c2El && shift.colour_2) c2El.value = shift.colour_2;
    // Re-select the same moulds
    const arts = await DB.getShiftArticles(shiftId);
    arts.forEach(a => {
      const mouldNums = a.mould_numbers || [1,2,3].slice(0, a.moulds_allocated||3);
      mouldNums.forEach(m => {
        const el = document.getElementById(`mould-${a.article_id}-${m}`);
        if (el && el.dataset.selected !== 'true') toggleMould(a.article_id, m);
      });
    });
    onColourModeChange();
    showToast('Shift prefilled — update the date and adjust as needed', 'info');
  }, 200);
}

async function viewShiftDetail(shiftId) {
  const [arts, orders] = await Promise.all([DB.getShiftArticles(shiftId), DB.getShiftOrders(shiftId)]);
  const s = window._allShifts?.find(x=>x.id===shiftId);
  if (!s) return;
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal" style="max-width:680px">
      <div class="modal-header">
        <div class="modal-title">Shift — ${fmtDate(s.shift_date)}</div>
        <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">×</button>
      </div>
      <div class="modal-body">
        <div class="info-row" style="margin-bottom:18px">
          <div class="info-item"><div class="info-label">Pool</div><div class="info-value">${poolBadge(s.pool)}</div></div>
          <div class="info-item"><div class="info-label">Mode</div><div class="info-value">${s.colour_mode.toUpperCase()}</div></div>
          <div class="info-item"><div class="info-label">Status</div><div class="info-value">${statusBadge(s.status)}</div></div>
        </div>
        <div style="margin-bottom:16px">
          <div class="section-title" style="margin-bottom:8px">Articles Loaded</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">${arts.map(a=>`<span class="article-chip">${a.article_id} (${a.moulds_allocated} moulds)</span>`).join('')||'<span style="color:var(--ink3)">None</span>'}</div>
        </div>
        <div class="section-title" style="margin-bottom:8px">Allocated Orders</div>
        ${orders.length?`
          <table>
            <thead><tr><th>Party</th><th>Article</th><th>Colour</th><th>Size</th><th>Planned</th></tr></thead>
            <tbody>
              ${orders.map(o=>`<tr>
                <td>${o.order_lines?.orders?.master_parties?.party_name||'—'}</td>
                <td class="mono">${o.order_lines?.article_id||'—'}</td>
                <td>${colourDot(o.order_lines?.colour||'')}</td>
                <td class="mono">${o.order_lines?.size||'—'}</td>
                <td class="mono"><strong>${o.qty_planned}</strong></td>
              </tr>`).join('')}
            </tbody>
          </table>`:`<p style="color:var(--ink3);font-size:13px">No orders allocated to this shift</p>`}
      </div>
    </div>`;
  document.body.appendChild(modal);
  modal.addEventListener('click', e=>{ if(e.target===modal) modal.remove(); });
}

async function deleteShift(shiftId) {
  if (!confirmAction('Delete this planned shift? This cannot be undone.')) return;
  await DB.updateShift(shiftId, { status: 'cancelled' });
  showToast('Shift deleted', 'info');
  renderProduction();
}

async function checkShiftBlockers() {}

async function printDailyCard(shiftId) {
  // If no shiftId, use today's shift
  const shifts = window._allShifts || [];
  const shift  = shiftId
    ? shifts.find(s => s.id === shiftId)
    : shifts.find(s => s.shift_date === today() && s.status !== 'completed');

  if (!shift) { showToast('No shift to print', 'error'); return; }

  const [arts, shiftOrders] = await Promise.all([
    DB.getShiftArticles(shift.id),
    DB.getShiftOrders(shift.id)
  ]);

  // Build order fulfilment table
  const orderMap = {};
  shiftOrders.forEach(o => {
    const l = o.order_lines;
    if (!l) return;
    const party   = l.orders?.master_parties?.party_name || '—';
    const orderId = l.order_id;
    const key     = `${orderId}_${party}`;
    if (!orderMap[key]) orderMap[key] = { party, orderId, po: l.orders?.po_number, items: [] };
    orderMap[key].items.push({
      article: l.article_id, colour: l.colour, size: l.size,
      qty: o.qty_planned
    });
  });

  // Build mould layout — group by article
  const mouldLayout = arts.map(a => {
    const articleId = a.article_id;
    const mouldNums = a.mould_numbers || [1,2,3].slice(0, a.moulds_allocated || 3);
    const moulds    = (window._articles||[]).find(x => x.id === articleId);
    const mouldMap  = window.MOULD_MAP || {};
    const sizes     = mouldMap[articleId] || [];
    return { articleId, moulds_allocated: a.moulds_allocated, mouldNums, sizes, compound: moulds?.compound_per_pair_g||'?' };
  });

  const totalTarget = shift.colour_mode === 'dual'
    ? shift.target_pairs_colour_1 + (shift.target_pairs_colour_2||0)
    : shift.target_pairs_colour_1;

  const printDate = new Date().toLocaleString('en-IN', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' });
  const shiftDateFmt = new Date(shift.shift_date).toLocaleDateString('en-IN', { weekday:'long', day:'2-digit', month:'long', year:'numeric' });

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>WIPL Production Card — ${shift.shift_date}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@400;500;600&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Inter', sans-serif; background: #fff; color: #0D1117; font-size: 13px; }

  /* PAGE LAYOUT */
  .page { width: 210mm; min-height: 297mm; padding: 14mm 16mm; margin: 0 auto; }
  @media print {
    body { margin: 0; }
    .page { padding: 10mm 14mm; }
    .no-print { display: none; }
  }

  /* HEADER */
  .header { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 12px; border-bottom: 3px solid #0D1117; margin-bottom: 16px; }
  .company-block .company-name { font-size: 22px; font-weight: 800; letter-spacing: -0.5px; }
  .company-block .doc-type { font-size: 10px; font-weight: 600; color: #6B7280; text-transform: uppercase; letter-spacing: 1.5px; margin-top: 2px; }
  .shift-date-block { text-align: right; }
  .shift-date-block .date-main { font-size: 15px; font-weight: 700; }
  .shift-date-block .date-sub { font-size: 10px; color: #6B7280; margin-top: 2px; font-family: 'IBM Plex Mono', monospace; }

  /* META ROW */
  .meta-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 16px; }
  .meta-box { background: #F8FAFC; border: 1px solid #E4E7F0; border-radius: 8px; padding: 10px 12px; }
  .meta-label { font-size: 9px; font-weight: 700; color: #9CA3AF; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 4px; font-family: 'IBM Plex Mono', monospace; }
  .meta-value { font-size: 15px; font-weight: 800; color: #0D1117; letter-spacing: -0.3px; }
  .meta-value.blue { color: #2B5BFF; }
  .meta-sub { font-size: 10px; color: #6B7280; margin-top: 2px; }

  /* COLOUR TARGETS */
  .section-title { font-size: 10px; font-weight: 700; color: #6B7280; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px; font-family: 'IBM Plex Mono', monospace; }
  .colour-targets { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 16px; }
  .colour-card { border: 2px solid #E4E7F0; border-radius: 8px; padding: 12px 14px; display: flex; align-items: center; gap: 12px; }
  .colour-dot { width: 20px; height: 20px; border-radius: 50%; border: 2px solid rgba(0,0,0,0.1); flex-shrink: 0; }
  .colour-name { font-weight: 700; font-size: 14px; }
  .colour-target { margin-left: auto; text-align: right; }
  .colour-target .pairs { font-size: 22px; font-weight: 800; font-family: 'IBM Plex Mono', monospace; color: #2B5BFF; }
  .colour-target .pairs-label { font-size: 9px; color: #9CA3AF; font-weight: 600; text-transform: uppercase; }

  /* MOULD LAYOUT */
  .mould-table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
  .mould-table th { background: #0D1117; color: white; padding: 8px 12px; font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.8px; text-align: left; font-family: 'IBM Plex Mono', monospace; }
  .mould-table td { padding: 9px 12px; border-bottom: 1px solid #E4E7F0; font-size: 12px; vertical-align: middle; }
  .mould-table tr:last-child td { border-bottom: none; }
  .mould-table tr:nth-child(even) td { background: #F8FAFC; }
  .mould-num { display: inline-block; background: #2B5BFF; color: white; border-radius: 5px; padding: 2px 8px; font-family: 'IBM Plex Mono', monospace; font-size: 11px; font-weight: 600; }
  .size-badge { display: inline-block; background: #EEF0F6; border: 1px solid #D1D5DE; border-radius: 4px; padding: 2px 8px; font-family: 'IBM Plex Mono', monospace; font-size: 11px; margin-left: 6px; }

  /* ORDERS TABLE */
  .orders-table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
  .orders-table th { background: #F0F4F8; padding: 7px 10px; font-size: 10px; font-weight: 700; color: #3D4555; text-transform: uppercase; letter-spacing: 0.8px; text-align: left; border: 1px solid #E4E7F0; font-family: 'IBM Plex Mono', monospace; }
  .orders-table td { padding: 8px 10px; border: 1px solid #E4E7F0; font-size: 12px; vertical-align: middle; }
  .orders-table tr:nth-child(even) td { background: #F8FAFC; }
  .party-name { font-weight: 700; }
  .qty-cell { font-family: 'IBM Plex Mono', monospace; font-weight: 700; text-align: right; color: #2B5BFF; }

  /* CHECKLIST */
  .checklist { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 16px; }
  .check-item { display: flex; align-items: center; gap: 8px; padding: 8px 10px; border: 1px solid #E4E7F0; border-radius: 6px; font-size: 11px; }
  .check-box { width: 16px; height: 16px; border: 2px solid #D1D5DE; border-radius: 3px; flex-shrink: 0; }

  /* OUTPUT LOG */
  .output-log { border: 2px dashed #D1D5DE; border-radius: 8px; padding: 14px 16px; }
  .output-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; margin-top: 10px; }
  .output-field { }
  .output-label { font-size: 9px; font-weight: 700; color: #9CA3AF; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 6px; font-family: 'IBM Plex Mono', monospace; }
  .output-line { border-bottom: 1px solid #9CA3AF; height: 24px; }

  /* FOOTER */
  .card-footer { margin-top: 16px; padding-top: 10px; border-top: 1px solid #E4E7F0; display: flex; justify-content: space-between; font-size: 9px; color: #9CA3AF; font-family: 'IBM Plex Mono', monospace; }

  /* PRINT BUTTON */
  .print-btn { display: block; margin: 20px auto; padding: 10px 28px; background: #2B5BFF; color: white; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; font-family: 'Inter', sans-serif; }
</style>
</head>
<body>
<div class="page">

  <!-- HEADER -->
  <div class="header">
    <div class="company-block">
      <div class="company-name">WIPL</div>
      <div class="doc-type">Daily Production Job Card</div>
    </div>
    <div class="shift-date-block">
      <div class="date-main">${shiftDateFmt}</div>
      <div class="date-sub">Shift · ${shift.colour_mode.toUpperCase()} COLOUR · ${shift.pool.toUpperCase()}</div>
    </div>
  </div>

  <!-- META ROW -->
  <div class="meta-row">
    <div class="meta-box">
      <div class="meta-label">Colour Mode</div>
      <div class="meta-value">${shift.colour_mode === 'dual' ? 'DUAL' : 'SINGLE'}</div>
      <div class="meta-sub">${shift.colour_mode === 'dual' ? '2 colours this shift' : '1 colour this shift'}</div>
    </div>
    <div class="meta-box">
      <div class="meta-label">Moulds Loaded</div>
      <div class="meta-value blue">${arts.reduce((s,a) => s+(a.moulds_allocated||0), 0)}</div>
      <div class="meta-sub">of 12 slots used</div>
    </div>
    <div class="meta-box">
      <div class="meta-label">Target — Shift</div>
      <div class="meta-value blue">${totalTarget.toLocaleString('en-IN')}</div>
      <div class="meta-sub">pairs total</div>
    </div>
    <div class="meta-box">
      <div class="meta-label">Orders Fulfilled</div>
      <div class="meta-value">${Object.keys(orderMap).length}</div>
      <div class="meta-sub">parties this shift</div>
    </div>
  </div>

  <!-- COLOUR TARGETS -->
  <div class="section-title">Colour Targets</div>
  <div class="colour-targets">
    <div class="colour-card">
      <div class="colour-dot" style="background:${(COLOUR_HEX && COLOUR_HEX[shift.colour_1])||'#888'}"></div>
      <div>
        <div class="colour-name">${shift.colour_1}</div>
        <div style="font-size:10px;color:#6B7280;margin-top:2px">Colour 1${shift.colour_mode==='single'?' (full shift)':''}</div>
      </div>
      <div class="colour-target">
        <div class="pairs">${shift.target_pairs_colour_1.toLocaleString('en-IN')}</div>
        <div class="pairs-label">pairs</div>
      </div>
    </div>
    ${shift.colour_2 ? `
    <div class="colour-card">
      <div class="colour-dot" style="background:${(COLOUR_HEX && COLOUR_HEX[shift.colour_2])||'#888'}"></div>
      <div>
        <div class="colour-name">${shift.colour_2}</div>
        <div style="font-size:10px;color:#6B7280;margin-top:2px">Colour 2</div>
      </div>
      <div class="colour-target">
        <div class="pairs">${(shift.target_pairs_colour_2||0).toLocaleString('en-IN')}</div>
        <div class="pairs-label">pairs</div>
      </div>
    </div>` : '<div></div>'}
  </div>

  <!-- MOULD LAYOUT -->
  <div class="section-title">Mould Layout — Machine Setup</div>
  <table class="mould-table">
    <thead>
      <tr>
        <th>Article</th>
        <th>Mould</th>
        <th>Sizes Covered</th>
        <th>Compound</th>
        <th>Pairs / Shot</th>
      </tr>
    </thead>
    <tbody>
      ${mouldLayout.flatMap(a => {
        const mouldDefs = (typeof MOULD_MAP !== 'undefined' && MOULD_MAP[a.articleId]) || [];
        if (mouldDefs.length === 0) {
          return [`<tr>
            <td style="font-weight:700;font-family:'IBM Plex Mono',monospace">${a.articleId}</td>
            <td><span class="mould-num">All</span></td>
            <td>${a.moulds_allocated} moulds loaded</td>
            <td style="font-family:'IBM Plex Mono',monospace">${a.compound}g/pair</td>
            <td style="font-family:'IBM Plex Mono',monospace">2</td>
          </tr>`];
        }
        const mouldNumsToShow = a.mouldNums && a.mouldNums.length ? a.mouldNums : mouldDefs.map(m=>m.mould);
        return mouldDefs.filter(m => mouldNumsToShow.includes(m.mould)).map((m, mi) => `<tr>
          <td style="font-weight:700;font-family:'IBM Plex Mono',monospace">${mi===0 ? a.articleId : ''}</td>
          <td><span class="mould-num">M${m.mould}</span></td>
          <td>Size ${m.sizes[0]} &amp; Size ${m.sizes[1]}<span class="size-badge">Sz ${m.sizes[0]}</span><span class="size-badge">Sz ${m.sizes[1]}</span></td>
          <td style="font-family:'IBM Plex Mono',monospace">${a.compound}g/pair</td>
          <td style="font-family:'IBM Plex Mono',monospace;font-weight:700">2 pairs</td>
        </tr>`);
      }).join('')}
    </tbody>
  </table>

  <!-- ORDERS TABLE -->
  ${Object.keys(orderMap).length > 0 ? `
  <div class="section-title">Orders Being Fulfilled This Shift</div>
  <table class="orders-table">
    <thead>
      <tr>
        <th>Party</th>
        <th>Order #</th>
        <th>Article</th>
        <th>Colour</th>
        <th>Sizes</th>
        <th style="text-align:right">Qty (pairs)</th>
      </tr>
    </thead>
    <tbody>
      ${Object.values(orderMap).flatMap(o =>
        o.items.sort((a,b) => a.article.localeCompare(b.article) || a.colour.localeCompare(b.colour) || a.size-b.size)
        .map((item, i) => `<tr>
          <td class="party-name">${i===0 ? o.party : ''}</td>
          <td style="font-family:'IBM Plex Mono',monospace;color:#6B7280">${i===0 ? '#'+o.orderId : ''}</td>
          <td style="font-family:'IBM Plex Mono',monospace;font-weight:700">${item.article}</td>
          <td>${item.colour}</td>
          <td style="font-family:'IBM Plex Mono',monospace">Size ${item.size}</td>
          <td class="qty-cell">${item.qty.toLocaleString('en-IN')}</td>
        </tr>`)
      ).join('')}
    </tbody>
  </table>` : `<div style="background:#F0F9FF;border:1px solid #BAE6FD;border-radius:8px;padding:12px 16px;margin-bottom:16px;font-size:12px;color:#0369A1;">
    ℹ This shift produces for <strong>stock replenishment</strong> — no specific orders allocated.
  </div>`}

  <!-- PRE-SHIFT CHECKLIST -->
  <div class="section-title">Pre-Shift Checklist</div>
  <div class="checklist">
    <div class="check-item"><div class="check-box"></div>Moulds loaded &amp; secured correctly</div>
    <div class="check-item"><div class="check-box"></div>Colour compound loaded — ${shift.colour_1}${shift.colour_2?' + '+shift.colour_2:''}</div>
    <div class="check-item"><div class="check-box"></div>Machine temperature at setpoint</div>
    <div class="check-item"><div class="check-box"></div>Cooling water flow confirmed</div>
    <div class="check-item"><div class="check-box"></div>First shot inspection passed</div>
    <div class="check-item"><div class="check-box"></div>Size labels / stickers ready</div>
    ${shift.colour_mode==='dual'?`<div class="check-item"><div class="check-box"></div>Colour changeover plan confirmed</div>`:''}
  </div>

  <!-- OUTPUT LOG (fill by hand) -->
  <div class="output-log">
    <div class="section-title" style="margin-bottom:0">Shift Output — Fill at End of Shift</div>
    <div class="output-grid">
      <div class="output-field">
        <div class="output-label">${shift.colour_1} — Actual Pairs</div>
        <div class="output-line"></div>
      </div>
      ${shift.colour_2 ? `<div class="output-field">
        <div class="output-label">${shift.colour_2} — Actual Pairs</div>
        <div class="output-line"></div>
      </div>` : '<div></div>'}
      <div class="output-field">
        <div class="output-label">Rejections (pairs)</div>
        <div class="output-line"></div>
      </div>
      <div class="output-field">
        <div class="output-label">Downtime (minutes)</div>
        <div class="output-line"></div>
      </div>
      <div class="output-field">
        <div class="output-label">Downtime Reason</div>
        <div class="output-line"></div>
      </div>
      <div class="output-field">
        <div class="output-label">Operator Signature</div>
        <div class="output-line"></div>
      </div>
    </div>
  </div>

  <!-- FOOTER -->
  <div class="card-footer">
    <span>WIPL Production OS · Generated: ${printDate}</span>
    <span>Shift ID: #${shift.id} · ${shift.pool.toUpperCase()} Pool</span>
  </div>

</div>
<button class="print-btn no-print" onclick="window.print();this.style.display='none'">🖨 Print This Card</button>
</body>
</html>`;

  const printWin = window.open('', '_blank', 'width=900,height=700');
  if (!printWin) { showToast('Allow pop-ups to print', 'error'); return; }
  printWin.document.write(html);
  printWin.document.close();
}

// ═══════════════════════════════════════════════════════════════════
// WEEKLY CALENDAR VIEW
// ═══════════════════════════════════════════════════════════════════
function renderWeeklyCalendar(allShifts) {
  // Show 5 weeks: 2 past + current + 2 future
  const todayDate  = today();
  const todayObj   = new Date(todayDate);
  const dayOfWeek  = todayObj.getDay(); // 0=Sun
  // Start from Monday 2 weeks ago
  const startDate  = new Date(todayObj);
  startDate.setDate(todayObj.getDate() - dayOfWeek - 13); // 2 weeks back from last Monday

  const weeks = [];
  let cursor = new Date(startDate);
  // Align to Monday
  const cursorDay = cursor.getDay();
  if (cursorDay !== 1) cursor.setDate(cursor.getDate() + (1 - cursorDay + 7) % 7);

  for (let w = 0; w < 5; w++) {
    const week = [];
    for (let d = 0; d < 7; d++) {
      const dateStr = cursor.toISOString().split('T')[0];
      week.push(dateStr);
      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push(week);
  }

  // Index shifts by date
  const shiftsByDate = {};
  allShifts.forEach(s => {
    if (!shiftsByDate[s.shift_date]) shiftsByDate[s.shift_date] = [];
    shiftsByDate[s.shift_date].push(s);
  });

  // Build calendar HTML
  const days = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

  const statusColour = {
    planned:     '#F59E0B',
    in_progress: '#2B5BFF',
    completed:   '#0D9973',
    cancelled:   '#9CA3AF'
  };

  let html = `
    <div style="background:var(--surface);border:1px solid var(--line);border-radius:var(--r-lg);overflow:hidden">
      <!-- Day headers -->
      <div style="display:grid;grid-template-columns:repeat(7,1fr);background:var(--surface2);border-bottom:1px solid var(--line)">
        ${days.map(d => `
          <div style="padding:8px;text-align:center;font-size:11px;font-weight:700;color:var(--ink3);font-family:'IBM Plex Mono',monospace;letter-spacing:0.5px;text-transform:uppercase">
            ${d}
          </div>`).join('')}
      </div>

      <!-- Weeks -->
      ${weeks.map(week => `
        <div style="display:grid;grid-template-columns:repeat(7,1fr);border-bottom:1px solid var(--line)">
          ${week.map(dateStr => {
            const isToday   = dateStr === todayDate;
            const isPast    = dateStr < todayDate;
            const shifts    = shiftsByDate[dateStr] || [];
            const dayNum    = parseInt(dateStr.split('-')[2]);
            const monthShort= new Date(dateStr).toLocaleDateString('en-IN',{month:'short'});
            const showMonth = dayNum === 1 || dateStr === week[0];

            return `
              <div style="min-height:90px;padding:6px;border-right:1px solid var(--line);${isToday?'background:rgba(43,91,255,0.04);':''}position:relative">
                <!-- Day number -->
                <div style="display:flex;align-items:center;gap:4px;margin-bottom:5px">
                  <span style="
                    display:inline-flex;align-items:center;justify-content:center;
                    width:22px;height:22px;border-radius:50%;
                    font-size:11px;font-weight:700;font-family:'IBM Plex Mono',monospace;
                    ${isToday ? 'background:var(--blue);color:white;' : 'color:'+(isPast?'var(--ink4)':'var(--ink2)')+';'}
                  ">${dayNum}</span>
                  ${showMonth ? `<span style="font-size:9px;color:var(--ink4);font-weight:600;text-transform:uppercase">${monthShort}</span>` : ''}
                </div>
                <!-- Shift blocks -->
                ${shifts.map(s => {
                  const col1bg = (COLOUR_HEX && COLOUR_HEX[s.colour_1]) || '#888';
                  const col2bg = s.colour_2 ? ((COLOUR_HEX && COLOUR_HEX[s.colour_2]) || '#888') : null;
                  const borderCol = statusColour[s.status] || '#888';
                  const totalPairs = s.colour_mode==='dual'
                    ? s.target_pairs_colour_1+(s.target_pairs_colour_2||0)
                    : s.target_pairs_colour_1;
                  const actualPairs = (s.actual_pairs_colour_1||0)+(s.actual_pairs_colour_2||0);
                  const efficiency = s.status==='completed' && totalPairs > 0 && actualPairs > 0
                    ? Math.round((actualPairs/totalPairs)*100) : null;

                  return `
                    <div onclick="viewShiftDetail(${s.id})" style="
                      background:white;border-left:3px solid ${borderCol};
                      border:1px solid var(--line);border-left:3px solid ${borderCol};
                      border-radius:5px;padding:5px 7px;margin-bottom:4px;
                      cursor:pointer;transition:box-shadow 0.12s;font-size:10px;
                    " onmouseover="this.style.boxShadow='0 2px 8px rgba(0,0,0,0.12)'" onmouseout="this.style.boxShadow='none'">
                      <!-- Colour dots -->
                      <div style="display:flex;align-items:center;gap:3px;margin-bottom:3px">
                        <span style="width:7px;height:7px;border-radius:50%;background:${col1bg};display:inline-block;border:1px solid rgba(0,0,0,0.1);flex-shrink:0"></span>
                        ${col2bg ? `<span style="width:7px;height:7px;border-radius:50%;background:${col2bg};display:inline-block;border:1px solid rgba(0,0,0,0.1);flex-shrink:0"></span>` : ''}
                        <span style="font-weight:700;color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:70px">${s.colour_1}${s.colour_2?'+'+s.colour_2:''}</span>
                      </div>
                      <!-- Pairs + status -->
                      <div style="display:flex;align-items:center;justify-content:space-between">
                        <span style="font-family:'IBM Plex Mono',monospace;font-weight:700;color:${borderCol}">${num(totalPairs)}</span>
                        <span style="font-size:9px;font-weight:600;color:${borderCol};text-transform:uppercase">${efficiency !== null ? efficiency+'%' : s.status.replace('_',' ')}</span>
                      </div>
                      ${s.status==='planned' ? `
                        <div style="margin-top:3px;display:flex;gap:3px">
                          <button onclick="event.stopPropagation();startShift(${s.id})" style="flex:1;padding:2px;background:var(--blue);color:white;border:none;border-radius:3px;font-size:9px;cursor:pointer;font-family:'Inter',sans-serif;font-weight:600">Start</button>
                          <button onclick="event.stopPropagation();printDailyCard(${s.id})" style="flex:1;padding:2px;background:white;color:var(--ink2);border:1px solid var(--line);border-radius:3px;font-size:9px;cursor:pointer;font-family:'Inter',sans-serif">Print</button>
                        </div>` : ''}
                      ${s.status==='in_progress' ? `
                        <div style="margin-top:3px">
                          <button onclick="event.stopPropagation();openLogOutput(${s.id})" style="width:100%;padding:2px;background:var(--blue);color:white;border:none;border-radius:3px;font-size:9px;cursor:pointer;font-family:'Inter',sans-serif;font-weight:600">Log Output</button>
                        </div>` : ''}
                    </div>`;
                }).join('')}
                <!-- Empty day add button (upcoming only) -->
                ${!isPast && !isToday && !shifts.length ? `
                  <div onclick="prefillDate('${dateStr}')" style="
                    border:1px dashed var(--line2);border-radius:5px;padding:5px;
                    text-align:center;cursor:pointer;color:var(--ink4);font-size:10px;
                    transition:all 0.12s;
                  " onmouseover="this.style.borderColor='var(--blue)';this.style.color='var(--blue)'" onmouseout="this.style.borderColor='var(--line2)';this.style.color='var(--ink4)'">
                    + Plan
                  </div>` : ''}
              </div>`;
          }).join('')}
        </div>`).join('')}
    </div>

    <!-- Legend -->
    <div style="display:flex;gap:16px;margin-top:12px;flex-wrap:wrap">
      ${Object.entries(statusColour).map(([s, c]) => `
        <div style="display:flex;align-items:center;gap:6px;font-size:11px;color:var(--ink2)">
          <span style="width:10px;height:10px;border-radius:2px;background:${c};display:inline-block"></span>
          <span style="text-transform:capitalize">${s.replace('_',' ')}</span>
        </div>`).join('')}
      <div style="display:flex;align-items:center;gap:6px;font-size:11px;color:var(--ink2)">
        <span style="width:16px;height:16px;border-radius:50%;background:var(--blue);display:inline-flex;align-items:center;justify-content:center;color:white;font-size:9px;font-weight:700">T</span>
        <span>Today</span>
      </div>
    </div>
  `;

  return html;
}

function prefillDate(dateStr) {
  openNewShiftModal();
  setTimeout(() => {
    const el = document.getElementById('shift-date');
    if (el) { el.value = dateStr; onShiftConfigChange(); }
  }, 100);
}

// ── EDIT PLANNED SHIFT ────────────────────────────────────────────────────────
async function editPlannedShift(shiftId) {
  const shift = (window._allShifts||[]).find(s => s.id === shiftId);
  if (!shift || shift.status !== 'planned') {
    showToast('Can only edit planned shifts', 'error'); return;
  }
  if (!confirmAction(`Edit shift for ${fmtDate(shift.shift_date)}? This will update the shift details.`)) return;

  // Open new shift modal pre-filled with this shift's data
  openNewShiftModal();
  window._editingShiftId = shiftId; // mark as edit mode

  setTimeout(async () => {
    // Fill date, pool, mode, colours
    const dateEl = document.getElementById('shift-date');
    const poolEl = document.getElementById('shift-pool');
    const modeEl = document.getElementById('shift-colour-mode');
    const c1El   = document.getElementById('shift-colour1');
    const c2El   = document.getElementById('shift-colour2');

    if (dateEl) dateEl.value = shift.shift_date;
    if (poolEl) poolEl.value = shift.pool || 'general';
    if (modeEl) { modeEl.value = shift.colour_mode; onColourModeChange(); }

    await new Promise(r => setTimeout(r, 100));
    if (c1El) c1El.value = shift.colour_1 || '';
    if (c2El && shift.colour_2) c2El.value = shift.colour_2;

    // Re-select the same moulds
    const arts = await DB.getShiftArticles(shiftId);
    arts.forEach(a => {
      const mouldNums = a.mould_numbers || [1,2,3].slice(0, a.moulds_allocated||3);
      mouldNums.forEach(m => {
        const el = document.getElementById(`mould-${a.article_id}-${m}`);
        if (el && el.dataset.selected !== 'true') toggleMould(a.article_id, m);
      });
    });

    onShiftConfigChange();
    // Update modal title
    const titleEl = document.querySelector('#new-shift-modal .modal-title');
    if (titleEl) titleEl.textContent = `Edit Shift — ${fmtDate(shift.shift_date)}`;
    // Update save button
    const saveBtn = document.querySelector('#new-shift-modal .btn-primary[onclick="saveShift()"]');
    if (saveBtn) { saveBtn.textContent = '✓ Update Shift'; }
    showToast('Editing shift — change details and save', 'info');
  }, 200);
}

// ── EDIT COMPLETED SHIFT OUTPUT ────────────────────────────────────────────
async function editCompletedOutput(shiftId) {
  const shift = (window._allShifts||[]).find(s => s.id === shiftId);
  if (!shift) return;

  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.id = 'fix-output-modal';
  modal.innerHTML = `
    <div class="modal" style="max-width:460px">
      <div class="modal-header">
        <div class="modal-title">Fix Output — ${fmtDate(shift.shift_date)}</div>
        <button class="modal-close" onclick="document.getElementById('fix-output-modal').remove()">×</button>
      </div>
      <div class="modal-body">
        <div class="warning-box">⚠ This will update the logged output and adjust inventory accordingly. Use only to correct data entry errors.</div>
        <div class="form-group">
          <label>${shift.colour_1} — Actual Pairs</label>
          <input type="number" id="fix-c1" min="0" value="${shift.actual_pairs_colour_1||0}" />
        </div>
        ${shift.colour_2 ? `<div class="form-group" style="margin-bottom:0">
          <label>${shift.colour_2} — Actual Pairs</label>
          <input type="number" id="fix-c2" min="0" value="${shift.actual_pairs_colour_2||0}" />
        </div>` : ''}
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" onclick="document.getElementById('fix-output-modal').remove()">Cancel</button>
        <button class="btn-primary" onclick="saveOutputFix(${shiftId})">Save Correction</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
}

async function saveOutputFix(shiftId) {
  const shift = (window._allShifts||[]).find(s => s.id === shiftId);
  if (!shift) return;
  const newC1 = parseInt(document.getElementById('fix-c1')?.value)||0;
  const newC2 = parseInt(document.getElementById('fix-c2')?.value)||0;
  if (newC1 < 0 || newC2 < 0) { showToast('Values cannot be negative', 'error'); return; }
  if (!confirmAction(`Update output from ${shift.actual_pairs_colour_1||0}/${shift.actual_pairs_colour_2||0} to ${newC1}/${newC2} pairs? Inventory will be adjusted for the difference.`)) return;

  // Calculate delta and adjust inventory
  const arts = await DB.getShiftArticles(shiftId);
  const pool  = shift.pool === 'mixed' ? 'general' : shift.pool;
  const deltaC1 = newC1 - (shift.actual_pairs_colour_1||0);
  const deltaC2 = newC2 - (shift.actual_pairs_colour_2||0);

  for (const art of arts) {
    const artId = art.article_id;
    const mouldSizes = (MOULD_MAP[artId]||[])
      .filter(m => art.mould_numbers ? art.mould_numbers.includes(m.mould) : true)
      .flatMap(m => m.sizes);
    const sizes = mouldSizes.length ? mouldSizes : (MENS_ARTICLES.includes(artId) ? MENS_SIZES : WOMENS_SIZES);

    if (deltaC1 !== 0) {
      const perSize = Math.round(deltaC1 / arts.length / sizes.length);
      for (const size of sizes) {
        if (perSize !== 0) {
          await DB.upsertInventory(artId, shift.colour_1, size, pool, perSize);
          await DB.logStockMovement(artId, shift.colour_1, size, pool, perSize, `Output correction — Shift #${shiftId}`, null);
        }
      }
    }
    if (shift.colour_2 && deltaC2 !== 0) {
      const perSize = Math.round(deltaC2 / arts.length / sizes.length);
      for (const size of sizes) {
        if (perSize !== 0) {
          await DB.upsertInventory(artId, shift.colour_2, size, pool, perSize);
          await DB.logStockMovement(artId, shift.colour_2, size, pool, perSize, `Output correction — Shift #${shiftId}`, null);
        }
      }
    }
  }

  await DB.logActualOutput(shiftId, newC1, newC2);
  showToast('Output corrected — inventory adjusted', 'success');
  document.getElementById('fix-output-modal')?.remove();
  renderProduction();
}

// ── PLAN REMAINDER SHIFT ──────────────────────────────────────────────────────
// Opens a new shift modal pre-filled with same colour/article for leftover demand
function planRemainderShift(colour, articleId) {
  const mode = document.getElementById('shift-colour-mode')?.value || 'single';
  const pool = document.getElementById('shift-pool')?.value || 'general';

  // Close current modal and open new shift planner
  closeModal('new-shift-modal');
  openNewShiftModal();
  window._editingShiftId = null;

  setTimeout(() => {
    // Set same colour and pool
    const poolEl  = document.getElementById('shift-pool');
    const modeEl  = document.getElementById('shift-colour-mode');
    const c1El    = document.getElementById('shift-colour1');
    if (poolEl)  poolEl.value  = pool;
    if (modeEl)  { modeEl.value = 'single'; onColourModeChange(); }
    if (c1El)    c1El.value    = colour;

    // Select same article moulds
    setTimeout(() => {
      const MOULD_NUMS = [1, 2, 3];
      MOULD_NUMS.forEach(m => {
        const el = document.getElementById(`mould-${articleId}-${m}`);
        if (el && el.dataset.selected !== 'true') toggleMould(articleId, m);
      });
      onShiftConfigChange();
      showToast(`New shift pre-filled for ${colour} ${articleId} remainder`, 'info');
    }, 150);
  }, 200);
}

// ── SHIFT SUMMARY TOGGLE ──────────────────────────────────────────────────────
function toggleSummaryStrip() {
  const body  = document.getElementById('summary-strip-body');
  const btn   = document.getElementById('summary-toggle-btn');
  const badge = document.getElementById('summary-compact-badge');
  if (!body) return;
  const isCollapsed = body.style.display === 'none';
  body.style.display = isCollapsed ? 'block' : 'none';
  if (btn)   btn.textContent   = isCollapsed ? '▲ Hide' : '▼ Show';
  if (badge) badge.style.display = isCollapsed ? 'none' : 'inline';
  window._summaryCollapsed = !isCollapsed;
}
