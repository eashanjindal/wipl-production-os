async function renderDispatch() {
  const area = document.getElementById('content-area');
  area.innerHTML = loading();

  const [dispatches, fulfilStatus] = await Promise.all([
    DB.getDispatches(),
    DB.getOrderFulfilmentStatus()
  ]);

  const canFulfil   = fulfilStatus.filter(f => f.canFullyFulfil || f.canPartialFulfil);
  const canFull     = fulfilStatus.filter(f => f.canFullyFulfil);
  const canPartial  = fulfilStatus.filter(f => f.canPartialFulfil && !f.canFullyFulfil);
  const noStock     = fulfilStatus.filter(f => f.availablePairs === 0);

  area.innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-header-title">Dispatch</div>
        <div class="page-header-sub">Fulfil orders from current stock</div>
      </div>
    </div>

    ${canFull.length ? `
      <div class="success-box" style="display:flex;justify-content:space-between;align-items:center">
        <span>✅ <strong>${canFull.length} order${canFull.length>1?'s':''}</strong> can be fully dispatched from current stock</span>
        <button class="btn-primary btn-sm" onclick="dispatchAllReady()">Dispatch All Ready</button>
      </div>` : ''}

    ${canPartial.length ? `
      <div class="warning-box" style="margin-bottom:0">
        ⚠ <strong>${canPartial.length} order${canPartial.length>1?'s':''}</strong> can be partially dispatched — some sizes available now
      </div>` : ''}

    <div class="tabs" style="margin-top:16px">
      <button class="tab active" onclick="showDispatchTab(this,'fulfil')">
        Fulfil from Stock ${canFulfil.length?`<span class="badge low" style="margin-left:4px">${canFulfil.length}</span>`:''}
      </button>
      <button class="tab" onclick="showDispatchTab(this,'awaiting')">
        Awaiting Production ${noStock.length?`<span style="margin-left:4px;font-size:10px;color:var(--ink3)">${noStock.length}</span>`:''}
      </button>
      <button class="tab" onclick="showDispatchTab(this,'history')">History</button>
    </div>

    <div id="dispatch-tab-content">
      ${renderFulfilTab(fulfilStatus, dispatches)}
    </div>

    <!-- DISPATCH MODAL -->
    <div id="dispatch-modal" class="modal-overlay hidden">
      <div class="modal" style="max-width:720px">
        <div class="modal-header">
          <div class="modal-title" id="dispatch-modal-title">Dispatch Order</div>
          <button class="modal-close" onclick="closeModal('dispatch-modal')">×</button>
        </div>
        <div class="modal-body" id="dispatch-modal-body"></div>
        <div class="modal-footer">
          <button class="btn-secondary" onclick="closeModal('dispatch-modal')">Cancel</button>
          <button class="btn-primary" onclick="confirmDispatch()">✓ Confirm Dispatch</button>
        </div>
      </div>
    </div>
  `;

  window._fulfilStatus = fulfilStatus;
  window._dispatches   = dispatches;
}

// ── TAB ROUTER ────────────────────────────────────────────────────────────────
function showDispatchTab(btn, tab) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  const el = document.getElementById('dispatch-tab-content');
  const fs = window._fulfilStatus || [];
  const ds = window._dispatches  || [];
  if (tab === 'fulfil')   el.innerHTML = renderFulfilTab(fs, ds);
  if (tab === 'awaiting') el.innerHTML = renderAwaitingTab(fs);
  if (tab === 'history')  el.innerHTML = renderHistoryTab(ds);
}

// ── FULFIL FROM STOCK TAB ─────────────────────────────────────────────────────
function renderFulfilTab(fulfilStatus, dispatches) {
  const active = fulfilStatus.filter(f => f.canFullyFulfil || f.canPartialFulfil);
  if (!active.length) return `
    <div class="card" style="margin-top:4px">
      ${emptyState('📦', 'No orders can be dispatched from current stock')}
      <p style="text-align:center;color:var(--ink3);font-size:12px;margin-top:8px">
        Complete a production shift to add stock, then orders will appear here automatically.
      </p>
    </div>`;

  return active.map(f => {
    const o         = f.order;
    const isOverdue = o.required_delivery_date && o.required_delivery_date < today();
    const daysLate  = isOverdue ? daysDiff(today(), o.required_delivery_date) : 0;
    const daysLeft  = o.required_delivery_date ? daysDiff(o.required_delivery_date, today()) : null;

    return `
      <div class="card" style="margin-bottom:12px;border-left:4px solid ${f.canFullyFulfil?'var(--green)':'var(--amber)'}">
        <!-- Header -->
        <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:12px">
          <div>
            <div style="font-weight:700;font-size:15px">${o.master_parties?.party_name}</div>
            <div style="display:flex;align-items:center;gap:8px;margin-top:4px;flex-wrap:wrap">
              <span style="font-size:11px;color:var(--ink3);font-family:'IBM Plex Mono',monospace">Order #${o.id}</span>
              ${o.po_number?`<span style="font-size:11px;color:var(--ink3)">PO: ${o.po_number}</span>`:''}
              ${poolBadge(o.pool)}
              ${isOverdue
                ? `<span class="badge low">${daysLate}d overdue</span>`
                : daysLeft !== null
                  ? `<span style="font-size:11px;color:${daysLeft<=3?'var(--red)':daysLeft<=7?'var(--amber)':'var(--green)'};font-weight:600">${daysLeft===0?'Due today':daysLeft<0?Math.abs(daysLeft)+'d late':daysLeft+'d left'}</span>`
                  : ''}
            </div>
          </div>
          <div style="text-align:right;flex-shrink:0;margin-left:12px">
            <div style="font-size:20px;font-weight:800;color:${f.canFullyFulfil?'var(--green)':'var(--amber)'};font-family:'IBM Plex Mono',monospace">${f.fulfilPct}%</div>
            <div style="font-size:10px;color:var(--ink3);margin-top:1px">${num(f.availablePairs)} of ${num(f.totalPending)} pairs</div>
          </div>
        </div>

        <!-- Stock vs Order breakdown — compact table -->
        <div style="overflow-x:auto;margin-bottom:12px">
          <table style="width:100%;font-size:12px">
            <thead>
              <tr style="background:var(--surface2)">
                <th style="padding:6px 10px;text-align:left;font-size:10px;color:var(--ink3);font-family:'IBM Plex Mono',monospace;font-weight:600;border-radius:var(--r-xs) 0 0 0">Article</th>
                <th style="padding:6px 10px;text-align:left;font-size:10px;color:var(--ink3);font-family:'IBM Plex Mono',monospace;font-weight:600">Colour</th>
                <th style="padding:6px 10px;text-align:left;font-size:10px;color:var(--ink3);font-family:'IBM Plex Mono',monospace;font-weight:600">Size</th>
                <th style="padding:6px 10px;text-align:right;font-size:10px;color:var(--ink3);font-family:'IBM Plex Mono',monospace;font-weight:600">Ordered</th>
                <th style="padding:6px 10px;text-align:right;font-size:10px;color:var(--ink3);font-family:'IBM Plex Mono',monospace;font-weight:600">Balance</th>
                <th style="padding:6px 10px;text-align:right;font-size:10px;color:var(--ink3);font-family:'IBM Plex Mono',monospace;font-weight:600">In Stock</th>
                <th style="padding:6px 10px;text-align:center;font-size:10px;color:var(--ink3);font-family:'IBM Plex Mono',monospace;font-weight:600;border-radius:0 var(--r-xs) 0 0">Status</th>
              </tr>
            </thead>
            <tbody>
              ${f.lineStatus.sort((a,b)=>a.article_id.localeCompare(b.article_id)||a.colour.localeCompare(b.colour)||a.size-b.size).map(l=>`
                <tr style="${l.canFulfilLine?'':'background:rgba(217,119,6,0.04)'}">
                  <td style="padding:6px 10px;font-weight:700;font-family:'IBM Plex Mono',monospace">${l.article_id}</td>
                  <td style="padding:6px 10px">
                    <span style="display:inline-flex;align-items:center;gap:5px">
                      <span style="width:7px;height:7px;border-radius:50%;background:${COLOUR_HEX[l.colour]||'#888'};display:inline-block;flex-shrink:0"></span>
                      ${l.colour}
                    </span>
                  </td>
                  <td style="padding:6px 10px;font-family:'IBM Plex Mono',monospace">Sz ${l.size}</td>
                  <td style="padding:6px 10px;text-align:right;font-family:'IBM Plex Mono',monospace">${l.qty_ordered}</td>
                  <td style="padding:6px 10px;text-align:right;font-family:'IBM Plex Mono',monospace;font-weight:700;color:var(--amber)">${l.bal}</td>
                  <td style="padding:6px 10px;text-align:right;font-family:'IBM Plex Mono',monospace;font-weight:700;color:${l.avail>=l.bal?'var(--green)':l.avail>0?'var(--amber)':'var(--red)'}">${l.avail}</td>
                  <td style="padding:6px 10px;text-align:center">
                    ${l.canFulfilLine
                      ? '<span class="badge ok">✓ Full</span>'
                      : l.avail > 0
                        ? `<span class="badge partial">${l.avail}/${l.bal}</span>`
                        : '<span class="badge low">No stock</span>'}
                  </td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>

        <!-- Actions -->
        <div style="display:flex;gap:8px;align-items:center">
          <button class="btn-primary btn-sm" onclick="openDispatchModal(${o.id})">
            ${f.canFullyFulfil ? '📦 Dispatch Full Order' : '📦 Dispatch Available Stock'}
          </button>
          ${!f.canFullyFulfil ? `<span style="font-size:11px;color:var(--ink3)">${num(f.totalPending-f.availablePairs)} pairs still need production</span>` : ''}
        </div>
      </div>`;
  }).join('');
}

// ── AWAITING PRODUCTION TAB ───────────────────────────────────────────────────
function renderAwaitingTab(fulfilStatus) {
  const awaiting = fulfilStatus.filter(f => f.availablePairs === 0);
  if (!awaiting.length) return `<div class="card" style="margin-top:4px">${emptyState('✅','All active orders have some stock available')}</div>`;

  return `<div class="card" style="margin-top:4px">
    <div class="card-title">Orders With No Stock Available — Need Production First</div>
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th>#</th><th>Party</th><th>Pool</th><th>PO</th>
          <th>Delivery By</th><th>Pending Pairs</th><th>Status</th>
        </tr></thead>
        <tbody>
          ${awaiting.map(f => {
            const o = f.order;
            const isOverdue = o.required_delivery_date && o.required_delivery_date < today();
            const daysLeft  = o.required_delivery_date ? daysDiff(o.required_delivery_date, today()) : null;
            return `<tr style="${isOverdue?'background:var(--red-bg);':''}">
              <td class="mono">#${o.id}</td>
              <td style="font-weight:600">${o.master_parties?.party_name||'—'}</td>
              <td>${poolBadge(o.pool)}</td>
              <td class="mono">${o.po_number||'—'}</td>
              <td style="color:${isOverdue?'var(--red)':'var(--ink)'}">
                ${o.required_delivery_date ? fmtDate(o.required_delivery_date) : '—'}
                ${isOverdue ? `<span class="badge low" style="margin-left:4px">${daysDiff(today(),o.required_delivery_date)}d late</span>` : daysLeft<=7&&daysLeft>=0 ? `<span style="font-size:11px;color:var(--amber);font-weight:600;margin-left:4px">${daysLeft}d left</span>` : ''}
              </td>
              <td class="mono" style="font-weight:700;color:var(--amber)">${num(f.totalPending)}</td>
              <td>${statusBadge(o.status)}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
  </div>`;
}

// ── HISTORY TAB ───────────────────────────────────────────────────────────────
function renderHistoryTab(dispatches) {
  if (!dispatches.length) return `<div class="card" style="margin-top:4px">${emptyState('🚚','No dispatches yet')}</div>`;
  return `<div class="card" style="margin-top:4px">
    <div class="table-wrap">
      <table>
        <thead><tr><th>Date</th><th>Party</th><th>Pool</th><th>Order #</th><th>Packaging</th><th>Transport</th><th>Notes</th></tr></thead>
        <tbody>
          ${dispatches.slice(0,50).map(d=>`
            <tr>
              <td>${fmtDate(d.dispatch_date)}</td>
              <td style="font-weight:500">${d.orders?.master_parties?.party_name||'—'}</td>
              <td>${poolBadge(d.orders?.pool||'general')}</td>
              <td class="mono">#${d.order_id||'—'}</td>
              <td><span class="badge ${d.packaging_type==='yoots_branded'?'yoots':'general'}">${d.packaging_type==='yoots_branded'?'🏷 YOOTS':'Standard'}</span></td>
              <td style="font-size:12px;color:var(--ink3)">${d.transport_details||'—'}</td>
              <td style="font-size:12px;color:var(--ink3)">${d.notes||'—'}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>
  </div>`;
}

// ── DISPATCH MODAL ────────────────────────────────────────────────────────────
async function openDispatchModal(orderId) {
  const fulfilData = (window._fulfilStatus||[]).find(f => f.order.id === orderId);
  const order      = fulfilData?.order;
  if (!order) return;

  window._dispatchOrderId = orderId;
  window._dispatchPool    = order.pool;

  // Use lineStatus from fulfilment data (already has avail info)
  const lines = fulfilData?.lineStatus || await DB.getStockAvailableForOrder(orderId);
  window._dispatchLines = lines;

  document.getElementById('dispatch-modal-title').textContent =
    `Dispatch — ${order.master_parties?.party_name} · Order #${orderId}`;

  document.getElementById('dispatch-modal-body').innerHTML = `
    <div class="info-row" style="margin-bottom:14px">
      <div class="info-item"><div class="info-label">Party</div><div class="info-value" style="font-weight:700">${order.master_parties?.party_name}</div></div>
      <div class="info-item"><div class="info-label">Pool</div><div class="info-value">${poolBadge(order.pool)}</div></div>
      <div class="info-item"><div class="info-label">Order #</div><div class="info-value mono">#${orderId}</div></div>
    </div>
    ${order.pool==='yoots'?`<div class="warning-box">🏷 Use YOOTS BRANDED packaging for this order</div>`:''}

    <div class="form-row cols-2" style="margin-bottom:14px">
      <div class="form-group" style="margin-bottom:0"><label>Dispatch Date</label><input type="date" id="disp-date" value="${today()}" /></div>
      <div class="form-group" style="margin-bottom:0"><label>Packaging Type</label>
        <select id="disp-packaging">
          ${order.pool==='yoots'
            ?`<option value="yoots_branded" selected>🏷 YOOTS Branded</option><option value="standard">Standard</option>`
            :`<option value="standard" selected>Standard</option><option value="yoots_branded">🏷 YOOTS Branded</option>`}
        </select>
      </div>
    </div>
    <div class="form-row cols-2" style="margin-bottom:14px">
      <div class="form-group" style="margin-bottom:0"><label>Transport Details</label><input type="text" id="disp-transport" placeholder="Courier, tracking no." /></div>
      <div class="form-group" style="margin-bottom:0"><label>Notes</label><input type="text" id="disp-notes" placeholder="Special instructions..." /></div>
    </div>

    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
      <div style="font-size:11px;font-weight:700;color:var(--ink3);text-transform:uppercase;letter-spacing:0.8px;font-family:'IBM Plex Mono',monospace">Qty to Dispatch</div>
      <div style="font-size:13px;color:var(--ink2)">Total: <strong id="dispatch-running-total" style="color:var(--blue);font-family:'IBM Plex Mono',monospace;font-size:15px">0</strong> pairs</div>
    </div>

    <table style="width:100%;font-size:13px">
      <thead><tr style="background:var(--surface2)">
        <th style="padding:7px 10px;text-align:left;font-size:10px;color:var(--ink3);font-family:'IBM Plex Mono',monospace;font-weight:600">Article</th>
        <th style="padding:7px 10px;text-align:left;font-size:10px;color:var(--ink3);font-family:'IBM Plex Mono',monospace;font-weight:600">Colour</th>
        <th style="padding:7px 10px;text-align:left;font-size:10px;color:var(--ink3);font-family:'IBM Plex Mono',monospace;font-weight:600">Size</th>
        <th style="padding:7px 10px;text-align:right;font-size:10px;color:var(--ink3);font-family:'IBM Plex Mono',monospace;font-weight:600">Balance</th>
        <th style="padding:7px 10px;text-align:right;font-size:10px;color:var(--ink3);font-family:'IBM Plex Mono',monospace;font-weight:600">In Stock</th>
        <th style="padding:7px 10px;text-align:right;font-size:10px;color:var(--ink3);font-family:'IBM Plex Mono',monospace;font-weight:600">Dispatch Qty</th>
      </tr></thead>
      <tbody>
        ${lines.filter(l=>l.bal>0).sort((a,b)=>a.article_id.localeCompare(b.article_id)||a.colour.localeCompare(b.colour)||a.size-b.size).map(l=>`
          <tr style="${l.avail<=0?'opacity:0.5':''}">
            <td style="padding:7px 10px;font-weight:700;font-family:'IBM Plex Mono',monospace">${l.article_id}</td>
            <td style="padding:7px 10px">
              <span style="display:inline-flex;align-items:center;gap:5px">
                <span style="width:7px;height:7px;border-radius:50%;background:${COLOUR_HEX[l.colour]||'#888'};display:inline-block"></span>
                ${l.colour}
              </span>
            </td>
            <td style="padding:7px 10px;font-family:'IBM Plex Mono',monospace">Sz ${l.size}</td>
            <td style="padding:7px 10px;text-align:right;font-family:'IBM Plex Mono',monospace;font-weight:700;color:var(--amber)">${l.bal}</td>
            <td style="padding:7px 10px;text-align:right;font-family:'IBM Plex Mono',monospace;font-weight:700;color:${l.avail>=l.bal?'var(--green)':l.avail>0?'var(--amber)':'var(--red)'}">${l.avail}</td>
            <td style="padding:7px 10px;text-align:right">
              <input type="number" id="dline-${l.id}"
                min="0" max="${Math.min(l.bal, l.avail)}"
                value="${Math.min(l.bal, l.avail)}"
                ${l.avail<=0?'disabled':''}
                style="width:80px;text-align:center;padding:5px;color:#0D1117;font-family:'IBM Plex Mono',monospace;border-radius:var(--r-xs)"
                oninput="updateDispatchTotal()" onclick="event.stopPropagation()" />
            </td>
          </tr>`).join('')}
      </tbody>
    </table>`;

  openModal('dispatch-modal');
  setTimeout(updateDispatchTotal, 50);
}

function updateDispatchTotal() {
  let total = 0;
  document.querySelectorAll('[id^="dline-"]').forEach(el => { total += parseInt(el.value)||0; });
  const el = document.getElementById('dispatch-running-total');
  if (el) el.textContent = total.toLocaleString('en-IN');
}

async function confirmDispatch() {
  const orderId   = window._dispatchOrderId;
  const lines     = window._dispatchLines||[];
  const orderPool = window._dispatchPool||'general';
  const date      = document.getElementById('disp-date').value;
  const pkg       = document.getElementById('disp-packaging').value;
  const transport = document.getElementById('disp-transport').value;
  const notes     = document.getElementById('disp-notes').value;

  const dispatchLines = [];
  for (const l of lines) {
    let qty = parseInt(document.getElementById(`dline-${l.id}`)?.value)||0;
    if (qty <= 0) continue;
    // Hard cap: cannot dispatch more than balance or available stock
    const maxAllowed = Math.min(l.bal || 0, l.avail || 0);
    if (qty > maxAllowed) {
      showToast(`Size ${l.size}: cannot dispatch ${qty} — only ${maxAllowed} available (${l.avail} in stock, ${l.bal} balance)`, 'error');
      return;
    }
    dispatchLines.push({ order_line_id:l.id, qty_dispatched:qty });
  }
  if (!dispatchLines.length) { showToast('No quantities entered','error'); return; }

  const { error } = await DB.createDispatch(
    { dispatch_date:date, order_id:orderId, packaging_type:pkg, transport_details:transport, notes },
    dispatchLines
  );
  if (error) { showToast('Error: '+error.message,'error'); return; }

  let totalDispatched = 0;
  for (const l of lines) {
    const qty = parseInt(document.getElementById(`dline-${l.id}`)?.value)||0;
    if (qty>0) {
      totalDispatched += qty;
      await DB.updateOrderLine(l.id, { qty_dispatched: l.qty_dispatched+qty });
      await DB.upsertInventory(l.article_id, l.colour, l.size, orderPool, -qty);
      await DB.logStockMovement(l.article_id, l.colour, l.size, orderPool, -qty,
        `Dispatch → Order #${orderId} (${(window._fulfilStatus||[]).find(f=>f.order.id===orderId)?.order.master_parties?.party_name||''})`, orderId);
    }
  }

  const updatedLines = await DB.getOrderLines(orderId);
  const allDone = updatedLines.every(l=>l.qty_dispatched>=l.qty_ordered);
  await DB.updateOrder(orderId, { status:allDone?'completed':'partial' });

  showToast(`✅ Dispatched ${num(totalDispatched)} pairs${allDone?' — Order completed':''}`, 'success');
  closeModal('dispatch-modal');
  renderDispatch();
}

// Dispatch all fully-ready orders in one go
async function dispatchAllReady() {
  const fullyReady = (window._fulfilStatus||[]).filter(f => f.canFullyFulfil);
  if (!fullyReady.length) return;
  if (!confirmAction(`Dispatch ${fullyReady.length} fully-ready order${fullyReady.length>1?'s':''} with default settings (today's date, standard packaging)?`)) return;

  let dispatched = 0;
  for (const f of fullyReady) {
    const o = f.order;
    const dispatchLines = f.lineStatus.map(l => ({ order_line_id: l.id, qty_dispatched: l.bal }));
    const { error } = await DB.createDispatch(
      { dispatch_date: today(), order_id: o.id, packaging_type: o.pool==='yoots'?'yoots_branded':'standard', transport_details:'', notes:'' },
      dispatchLines
    );
    if (error) { showToast('Error on order #'+o.id+': '+error.message,'error'); continue; }
    for (const l of f.lineStatus) {
      await DB.updateOrderLine(l.id, { qty_dispatched: l.qty_dispatched + l.bal });
      await DB.upsertInventory(l.article_id, l.colour, l.size, o.pool, -l.bal);
      await DB.logStockMovement(l.article_id, l.colour, l.size, o.pool, -l.bal, `Bulk dispatch → Order #${o.id}`, o.id);
    }
    await DB.updateOrder(o.id, { status: 'completed' });
    dispatched++;
  }
  showToast(`✅ ${dispatched} orders dispatched`, 'success');
  renderDispatch();
}

async function markOrderReady(orderId) {
  await DB.updateOrder(orderId, { status:'ready' });
  showToast('Order marked as ready','success');
  renderDispatch();
}

async function markAllReady() {
  const orders = await DB.getOrders({ status:'in_production' });
  for (const o of orders) await DB.updateOrder(o.id, { status:'ready' });
  showToast(`${orders.length} orders marked ready`, 'success');
  renderDispatch();
}

async function viewOrderDetailDispatch(orderId) {
  const lines = await DB.getOrderLines(orderId);
  const modal = document.createElement('div'); modal.className='modal-overlay';
  modal.innerHTML = `<div class="modal" style="max-width:600px">
    <div class="modal-header"><div class="modal-title">Order #${orderId} Lines</div><button class="modal-close" onclick="this.closest('.modal-overlay').remove()">×</button></div>
    <div class="modal-body"><table><thead><tr><th>Article</th><th>Colour</th><th>Size</th><th>Ordered</th><th>Dispatched</th><th>Balance</th></tr></thead>
    <tbody>${lines.map(l=>{const bal=l.qty_ordered-l.qty_dispatched;return`<tr><td class="mono">${l.article_id}</td><td>${l.colour}</td><td class="mono">Sz ${l.size}</td><td class="mono">${l.qty_ordered}</td><td class="mono" style="color:var(--green)">${l.qty_dispatched}</td><td class="mono" style="font-weight:700;color:${bal>0?'var(--amber)':'var(--green)'}">${bal}</td></tr>`}).join('')}</tbody>
    </table></div></div>`;
  document.body.appendChild(modal);
  modal.addEventListener('click', e=>{if(e.target===modal)modal.remove();});
}
