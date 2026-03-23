async function renderOrders() {
  const area = document.getElementById('content-area');
  area.innerHTML = loading();
  let orders = [], parties = [], articles = [];
  try {
    [orders, parties, articles] = await Promise.all([DB.getOrders(), DB.getParties(), DB.getArticles()]);
  } catch(e) {
    area.innerHTML = `<div class="error-box">Failed to load orders: ${e.message}. Check your connection and try again.</div>`;
    return;
  }
  window._articles = articles;
  window._parties  = parties;
  const role = window._currentRole;
  const overdueCount = orders.filter(o => o.required_delivery_date && o.required_delivery_date < today() && !['dispatched','completed','cancelled'].includes(o.status)).length;

  area.innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-header-title">Orders</div>
        <div class="page-header-sub">${orders.filter(o=>o.status!=='cancelled').length} active orders</div>
      </div>
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
        <input type="text" id="order-search" placeholder="🔍  Search party, PO, order #..." style="width:240px" oninput="searchOrders(this.value)" />
        <select id="order-sort" onchange="applySortAndFilter()" style="width:160px">
          <option value="date_desc">Newest first</option>
          <option value="delivery_asc">Delivery: soonest</option>
          <option value="delivery_desc">Delivery: latest</option>
          <option value="age_desc">Oldest orders</option>
        </select>
        ${['admin','sales'].includes(role)?`<button class="btn-primary" onclick="openNewOrderModal()">+ New Order</button>`:''}
      </div>
    </div>

    <div class="tabs">
      <button class="tab active" onclick="filterOrders(this,'all')">All</button>
      <button class="tab" onclick="filterOrders(this,'pending')">Pending</button>
      <button class="tab" onclick="filterOrders(this,'in_production')">In Production</button>
      <button class="tab" onclick="filterOrders(this,'ready')">Ready</button>
      <button class="tab" onclick="filterOrders(this,'partial')">Partial</button>
      <button class="tab" onclick="filterOrders(this,'dispatched')">Dispatched</button>
      <button class="tab" onclick="filterOrders(this,'cancelled')" style="color:var(--ink3)">Cancelled</button>
      ${overdueCount>0?`<button class="tab" onclick="filterOrders(this,'overdue')" style="color:var(--red)">⚠ Overdue (${overdueCount})</button>`:''}
    </div>

    <!-- STATS BAR -->
    <div class="stat-grid" style="margin-bottom:16px">
      <div class="stat-card yellow"><div class="stat-icon">📋</div><div class="stat-label">Pending</div><div class="stat-value">${orders.filter(o=>o.status==='pending').length}</div></div>
      <div class="stat-card blue"><div class="stat-icon">⚙️</div><div class="stat-label">In Production</div><div class="stat-value">${orders.filter(o=>o.status==='in_production').length}</div></div>
      <div class="stat-card orange"><div class="stat-icon">📦</div><div class="stat-label">Partial</div><div class="stat-value">${orders.filter(o=>o.status==='partial').length}</div></div>
      <div class="stat-card green"><div class="stat-icon">✅</div><div class="stat-label">Ready</div><div class="stat-value">${orders.filter(o=>o.status==='ready').length}</div></div>
    </div>

    <div id="party-summary-strip" style="margin-bottom:16px"></div>

    <div class="card">
      <div class="table-wrap">
        <table>
          <thead><tr><th>#</th><th>Date</th><th>Party</th><th>Pool</th><th>PO No.</th><th>Delivery By</th><th>Age</th><th>Notes</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody id="orders-tbody">${renderOrderRows(orders)}</tbody>
        </table>
      </div>
    </div>

    <!-- NEW ORDER MODAL -->
    <div id="new-order-modal" class="modal-overlay hidden">
      <div class="modal" style="max-width:820px">
        <div class="modal-header"><div class="modal-title">New Order</div><button class="modal-close" onclick="closeModal('new-order-modal')">×</button></div>
        <div class="modal-body">
          <div class="form-row cols-3">
            <div class="form-group"><label>Order Date</label><input type="date" id="ord-date" value="${today()}" /></div>
            <div class="form-group">
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:5px">
                <label style="margin-bottom:0">Party</label>
                ${window._currentRole !== 'admin'
                  ? `<button class="btn-secondary btn-sm" onclick="openRequestPartyModal()" style="font-size:10px;padding:3px 8px">+ Request New Party</button>`
                  : `<button class="btn-secondary btn-sm" onclick="navigateTo('masterdata')" style="font-size:10px;padding:3px 8px">+ Add Party</button>`}
              </div>
              <select id="ord-party" onchange="onPartyChange()">
                <option value="">Select party</option>
                ${parties.map(p=>`<option value="${p.id}" data-pool="${p.pool}">${p.party_name}</option>`).join('')}
              </select>
            </div>
            <div class="form-group"><label>PO Number (optional)</label><input type="text" id="ord-po" placeholder="PO-001" /></div>
          </div>
          <div class="form-row cols-3">
            <div class="form-group">
              <label>Required Delivery Date</label>
              <input type="date" id="ord-delivery" onchange="checkDeliveryFeasibility(this.value)" />
              <div id="delivery-feasibility" style="font-size:11px;margin-top:4px;color:var(--ink3)"></div>
            </div>
            <div class="form-group"><label>Pool (auto-set from party)</label><input type="text" id="ord-pool-display" readonly placeholder="Select party first" /></div>
            <div class="form-group"><label>Notes (optional)</label><input type="text" id="ord-notes" placeholder="Special instructions, remarks..." /></div>
          </div>
          <div class="divider"></div>
          <div class="section-header">
            <div>
              <div class="section-title">Order Lines</div>
              <div style="font-size:11px;color:var(--ink3);margin-top:2px">Select article → fill colour × size matrix → Add to order</div>
            </div>
            <div style="display:flex;gap:8px">
              <select id="matrix-article-select" onchange="loadMatrixColours()" style="width:160px">
                <option value="">Select article...</option>
                ${articles.map(a=>`<option value="${a.id}">${a.id}${a.mould_status!=='in_production'?' ⚠':''}  (Sz ${a.size_range})</option>`).join('')}
              </select>
              <button class="btn-primary btn-sm" onclick="openMatrixEntry()" id="open-matrix-btn" disabled>+ Add via Matrix</button>
            </div>
          </div>

          <!-- MATRIX ENTRY PANEL (inline, not modal) -->
          <div id="matrix-entry-panel" style="display:none;background:var(--surface2);border:1px solid var(--line);border-radius:var(--r);padding:16px;margin-bottom:12px">
            <div id="matrix-content"></div>
            <div style="display:flex;justify-content:space-between;align-items:center;margin-top:12px;padding-top:12px;border-top:1px solid var(--line)">
              <button class="btn-secondary btn-sm" onclick="closeMatrixPanel()">✕ Cancel</button>
              <button class="btn-primary btn-sm" onclick="addMatrixToOrder()">✓ Add to Order</button>
            </div>
          </div>

          <!-- ADDED LINES SUMMARY -->
          <div id="order-lines-container"></div>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" onclick="closeModal('new-order-modal')">Cancel</button>
          <button class="btn-primary" onclick="saveOrder()">Save Order</button>
        </div>
      </div>
    </div>

    <!-- REQUEST NEW PARTY MODAL -->
    <div id="request-party-modal" class="modal-overlay hidden">
      <div class="modal" style="max-width:480px">
        <div class="modal-header">
          <div class="modal-title">Request New Party</div>
          <button class="modal-close" onclick="closeModal('request-party-modal')">×</button>
        </div>
        <div class="modal-body">
          <div class="info-box" style="background:var(--blue-soft);border:1px solid var(--blue-mid);border-radius:var(--r-sm);padding:10px 14px;margin-bottom:16px;font-size:12px;color:var(--ink2)">
            ℹ This will send a request to Admin for approval. The party will be available for orders once approved.
          </div>
          <div class="form-group">
            <label>Party Name *</label>
            <input type="text" id="rp-name" placeholder="e.g. WAVES FOOTWEAR" style="text-transform:uppercase" />
          </div>
          <div class="form-group">
            <label>Pool *</label>
            <select id="rp-pool">
              <option value="general">General</option>
              <option value="yoots">YOOTS</option>
            </select>
          </div>
          <div class="form-group">
            <label>Contact Name</label>
            <input type="text" id="rp-contact" placeholder="Contact person name" />
          </div>
          <div class="form-group">
            <label>Contact Phone</label>
            <input type="text" id="rp-phone" placeholder="Mobile number" />
          </div>
          <div class="form-group" style="margin-bottom:0">
            <label>Notes (optional)</label>
            <input type="text" id="rp-notes" placeholder="Any additional details for Admin" />
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" onclick="closeModal('request-party-modal')">Cancel</button>
          <button class="btn-primary" onclick="submitPartyRequest()">Submit Request</button>
        </div>
      </div>
    </div>

    <!-- ORDER DETAIL MODAL -->
    <div id="order-detail-modal" class="modal-overlay hidden">
      <div class="modal" style="max-width:900px">
        <div class="modal-header"><div class="modal-title" id="order-detail-title">Order Details</div><button class="modal-close" onclick="closeModal('order-detail-modal')">×</button></div>
        <div class="modal-body" id="order-detail-body"></div>
        <div class="modal-footer" id="order-detail-footer"></div>
      </div>
    </div>

    <!-- EDIT LINE MODAL -->
    <div id="edit-line-modal" class="modal-overlay hidden">
      <div class="modal" style="max-width:500px">
        <div class="modal-header"><div class="modal-title">Edit Order Line Quantity</div><button class="modal-close" onclick="closeModal('edit-line-modal')">×</button></div>
        <div class="modal-body" id="edit-line-body"></div>
        <div class="modal-footer">
          <button class="btn-secondary" onclick="closeModal('edit-line-modal')">Cancel</button>
          <button class="btn-primary" onclick="saveLineEdit()">Save Changes</button>
        </div>
      </div>
    </div>
  `;
  window._allOrders = orders;
  loadPartySummary();
}

function renderOrderRows(orders) {
  // If viewing cancelled tab, show cancelled orders; otherwise exclude them
  const viewingCancelled = orders.length > 0 && orders.every(o => o.status === 'cancelled');
  const active = viewingCancelled ? orders : orders.filter(o => o.status !== 'cancelled');
  if (!active.length) return `<tr><td colspan="10">${emptyState('📋','No orders found')}</td></tr>`;
  return active.map(o => {
    const isOverdue = o.required_delivery_date && o.required_delivery_date < today() && !['dispatched','completed'].includes(o.status);
    const daysLate  = isOverdue ? daysDiff(today(), o.required_delivery_date) : 0;
    const ageDays   = o.order_date ? daysDiff(today(), o.order_date) : 0;
    const ageColor  = ageDays > 30 ? 'var(--red)' : ageDays > 14 ? 'var(--amber)' : 'var(--ink3)';
    const deliveryCell = o.required_delivery_date
      ? `<span style="color:${isOverdue?'var(--red)':'var(--ink)'};font-weight:${isOverdue?700:400}">${fmtDate(o.required_delivery_date)}${isOverdue?` <span class="badge low">${daysLate}d late</span>`:''}</span>`
      : '<span style="color:var(--ink3)">—</span>';
    return `<tr style="${isOverdue?'background:var(--red-bg);':''}cursor:pointer" onclick="viewOrderDetail(${o.id})" title="Click to view order details">
      <td class="mono">#${o.id}</td>
      <td>${fmtDate(o.order_date)}</td>
      <td style="font-weight:600">${o.master_parties?.party_name||'—'}</td>
      <td>${poolBadge(o.pool)}</td>
      <td class="mono">${o.po_number||'—'}</td>
      <td>${deliveryCell}</td>
      <td><span style="font-size:11px;color:${ageColor};font-family:'IBM Plex Mono',monospace">${ageDays}d</span></td>
      <td style="font-size:11px;color:var(--amber);max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${o.notes||''}">${o.notes?'📝 '+o.notes:'—'}</td>
      <td>${statusBadge(o.status)}</td>
      <td><div style="display:flex;gap:5px;flex-wrap:wrap">
        ${o.status==='ready'?`<button class="btn-primary btn-sm" onclick="event.stopPropagation();navigateTo('dispatch')">Dispatch →</button>`:''}
        ${o.status==='pending'?`<button class="btn-secondary btn-sm" onclick="event.stopPropagation();markInProduction(${o.id})">→ Prod</button>`:''}
        <button class="btn-secondary btn-sm" onclick="event.stopPropagation();viewOrderDetail(${o.id})">View</button>
        ${(window._currentRole==='admin' && !['completed','cancelled'].includes(o.status)) ||
          (window._currentRole==='sales' && ['pending','in_production'].includes(o.status))
          ?`<button class="btn-secondary btn-sm" onclick="event.stopPropagation();openEditOrderModal(${o.id})">✏ Edit</button>`:''}
        ${['admin'].includes(window._currentRole)&&!['completed','cancelled'].includes(o.status)?`<button class="btn-danger btn-sm" onclick="event.stopPropagation();cancelOrder(${o.id})">Cancel</button>`:''}
        ${window._currentRole==='sales'&&o.status==='pending'?`<button class="btn-danger btn-sm" onclick="event.stopPropagation();cancelOrder(${o.id})">Cancel</button>`:''}
      </div></td>
    </tr>`;
  }).join('');
}

function searchOrders(query) {
  window._orderSearchQuery = (query||'').toLowerCase().trim();
  applySortAndFilter();
}

function applySortAndFilter() {
  const q      = window._orderSearchQuery || '';
  const sort   = document.getElementById('order-sort')?.value || 'date_desc';
  let orders   = window._allOrders || [];

  // Apply active tab filter
  const activeTab = document.querySelector('.tabs .tab.active')?.textContent?.trim();
  if (activeTab === 'Partial')        orders = orders.filter(o => o.status === 'partial');
  else if (activeTab === 'Cancelled') orders = orders.filter(o => o.status === 'cancelled');
  else if (activeTab === 'Overdue')   orders = orders.filter(o =>
    o.required_delivery_date && o.required_delivery_date < today() &&
    !['dispatched','completed','cancelled'].includes(o.status));
  else if (activeTab === 'Dispatched') orders = orders.filter(o => o.status === 'dispatched');
  else if (activeTab === 'Pending')    orders = orders.filter(o => o.status === 'pending');
  else if (activeTab === 'In Production') orders = orders.filter(o => o.status === 'in_production');
  else if (activeTab === 'Ready')      orders = orders.filter(o => o.status === 'ready');
  else orders = orders.filter(o => o.status !== 'cancelled'); // All tab

  // Apply search
  if (q) orders = orders.filter(o =>
    (o.master_parties?.party_name||'').toLowerCase().includes(q) ||
    (o.po_number||'').toLowerCase().includes(q) ||
    String(o.id).includes(q) ||
    (o.notes||'').toLowerCase().includes(q)
  );

  // Apply sort
  if (sort === 'delivery_asc') orders.sort((a,b) => {
    if (!a.required_delivery_date) return 1;
    if (!b.required_delivery_date) return -1;
    return a.required_delivery_date.localeCompare(b.required_delivery_date);
  });
  else if (sort === 'delivery_desc') orders.sort((a,b) => {
    if (!a.required_delivery_date) return 1;
    if (!b.required_delivery_date) return -1;
    return b.required_delivery_date.localeCompare(a.required_delivery_date);
  });
  else if (sort === 'age_desc') orders.sort((a,b) =>
    (a.order_date||'').localeCompare(b.order_date||''));
  // date_desc is default (already sorted by created_at desc from DB)

  document.getElementById('orders-tbody').innerHTML = renderOrderRows(orders);
}

function filterOrders(btn, status) {
  document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active')); btn.classList.add('active');
  // Clear search box when switching tabs
  const searchEl = document.getElementById('order-search');
  if (searchEl) searchEl.value = '';
  window._orderSearchQuery = '';
  const all = window._allOrders||[];
  const filtered = status==='all' ? all
    : status==='cancelled' ? all.filter(o => o.status === 'cancelled')
    : status==='overdue' ? all.filter(o => o.required_delivery_date && o.required_delivery_date < today() && !['dispatched','completed','cancelled'].includes(o.status))
    : all.filter(o=>o.status===status);
  document.getElementById('orders-tbody').innerHTML = renderOrderRows(filtered);
}

async function loadPartySummary() {
  const el = document.getElementById('party-summary-strip'); if (!el) return;
  const summary = await DB.getPartySummary();
  const active  = summary.filter(s=>s.totalPending>0).sort((a,b)=>b.totalPending-a.totalPending).slice(0,8);
  if (!active.length) { el.innerHTML=''; return; }
  el.innerHTML = `
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:4px">
      ${active.map(s=>`<div style="background:white;border:1px solid var(--line);border-radius:8px;padding:8px 12px;cursor:pointer;transition:all 0.15s" onclick="searchOrders('${s.party}')" onmouseover="this.style.borderColor='var(--blue)'" onmouseout="this.style.borderColor='var(--line)'" title="Click to filter">
        <div style="font-size:11px;font-weight:700;color:var(--ink)">${s.party}</div>
        <div style="font-size:10px;color:var(--ink3);margin-top:2px">${num(s.totalPending)} pending · ${s.orderCount} order${s.orderCount>1?'s':''}</div>
      </div>`).join('')}
    </div>
    <div style="font-size:11px;color:var(--ink3)">💡 Click a party card to filter their orders</div>`;
}

async function viewOrderDetail(orderId) {
  const lines = await DB.getOrderLines(orderId);
  const order = (window._allOrders||[]).find(o=>o.id===orderId);
  document.getElementById('order-detail-title').textContent = `Order #${orderId} — ${order?.master_parties?.party_name||''}`;
  const grouped = {};
  lines.forEach(l => {
    const key = `${l.article_id}__${l.colour}`;
    if (!grouped[key]) grouped[key] = { article_id:l.article_id, colour:l.colour, lines:[] };
    grouped[key].lines.push(l);
  });
  const isOverdue = order?.required_delivery_date && order.required_delivery_date < today() && !['dispatched','completed','cancelled'].includes(order.status);
  // Load stock availability for this order
  const stockStatus = await DB.getStockAvailableForOrder(orderId);
  const stockByLine = {};
  stockStatus.forEach(l => { stockByLine[l.id] = l.avail || 0; });

  // Compute order-level summary
  const allLines       = lines;
  const totalOrdered   = allLines.reduce((s,l) => s + l.qty_ordered, 0);
  const totalDispatched= allLines.reduce((s,l) => s + l.qty_dispatched, 0);
  const totalBalance   = totalOrdered - totalDispatched;
  const pctDone        = totalOrdered ? Math.round((totalDispatched/totalOrdered)*100) : 0;

  document.getElementById('order-detail-body').innerHTML = `

    <!-- ORDER META -->
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px;margin-bottom:16px">
      <div style="background:var(--surface2);border-radius:var(--r-sm);padding:10px 12px">
        <div style="font-size:10px;color:var(--ink3);margin-bottom:2px">Status</div>
        <div>${statusBadge(order?.status)}</div>
      </div>
      <div style="background:var(--surface2);border-radius:var(--r-sm);padding:10px 12px">
        <div style="font-size:10px;color:var(--ink3);margin-bottom:2px">Pool</div>
        <div>${poolBadge(order?.pool)}</div>
      </div>
      <div style="background:var(--surface2);border-radius:var(--r-sm);padding:10px 12px">
        <div style="font-size:10px;color:var(--ink3);margin-bottom:2px">Order Date</div>
        <div style="font-size:13px;font-weight:600">${fmtDate(order?.order_date)}</div>
      </div>
      <div style="background:var(--surface2);border-radius:var(--r-sm);padding:10px 12px">
        <div style="font-size:10px;color:var(--ink3);margin-bottom:2px">Required By</div>
        <div style="font-size:13px;font-weight:600;color:${isOverdue?'var(--red)':'var(--ink)'}">
          ${fmtDate(order?.required_delivery_date)||'—'}${isOverdue?' ⚠ Overdue':''}
        </div>
      </div>
      ${order?.po_number?`<div style="background:var(--surface2);border-radius:var(--r-sm);padding:10px 12px">
        <div style="font-size:10px;color:var(--ink3);margin-bottom:2px">PO Number</div>
        <div style="font-size:13px;font-weight:600;font-family:'IBM Plex Mono',monospace">${order.po_number}</div>
      </div>`:''}
      ${order?.notes?`<div style="background:var(--amber-bg);border:1px solid var(--amber-line);border-radius:var(--r-sm);padding:10px 12px;grid-column:span 2">
        <div style="font-size:10px;color:var(--amber);margin-bottom:2px">Notes</div>
        <div style="font-size:12px;color:var(--ink)">📝 ${order.notes}</div>
      </div>`:''}
    </div>

    <!-- PROGRESS BAR -->
    <div style="background:var(--surface2);border-radius:var(--r-sm);padding:12px 14px;margin-bottom:16px">
      <div style="display:flex;justify-content:space-between;margin-bottom:6px;font-size:12px">
        <span style="font-weight:700">Overall Progress</span>
        <span style="font-family:'IBM Plex Mono',monospace;font-weight:700;color:${pctDone===100?'var(--green)':'var(--blue)'}">
          ${num(totalDispatched)} / ${num(totalOrdered)} pairs dispatched (${pctDone}%)
        </span>
      </div>
      <div style="height:8px;background:var(--line);border-radius:4px;overflow:hidden">
        <div style="height:100%;width:${pctDone}%;background:${pctDone===100?'var(--green)':'var(--blue)'};border-radius:4px;transition:width 0.3s"></div>
      </div>
      <div style="display:flex;gap:16px;margin-top:6px;font-size:11px;color:var(--ink3)">
        <span>📦 <strong style="color:var(--green)">${num(totalDispatched)}</strong> dispatched</span>
        <span>⏳ <strong style="color:${totalBalance>0?'var(--amber)':'var(--green)'}">${num(totalBalance)}</strong> remaining</span>
        <span>📋 <strong>${num(totalOrdered)}</strong> total ordered</span>
      </div>
    </div>

    <!-- LINE ITEMS — grouped by article+colour -->
    ${Object.values(grouped).map(g => {
      const gOrdered    = g.lines.reduce((s,l)=>s+l.qty_ordered,0);
      const gDispatched = g.lines.reduce((s,l)=>s+l.qty_dispatched,0);
      const gBalance    = gOrdered - gDispatched;
      const gPct        = gOrdered ? Math.round((gDispatched/gOrdered)*100) : 0;

      // Categorise lines for visual grouping
      const fullyDone   = g.lines.filter(l => l.qty_dispatched >= l.qty_ordered);
      const partial     = g.lines.filter(l => l.qty_dispatched > 0 && l.qty_dispatched < l.qty_ordered);
      const notStarted  = g.lines.filter(l => l.qty_dispatched === 0);

      const renderLines = (linesToRender, rowStyle) => linesToRender.sort((a,b)=>a.size-b.size).map(l => {
        const bal   = l.qty_ordered - l.qty_dispatched;
        const avail = stockByLine[l.id] || 0;
        return `<tr style="${rowStyle}">
          <td class="mono" style="font-weight:600">Sz ${l.size}</td>
          <td class="mono" style="text-align:right">${l.qty_ordered}</td>
          <td class="mono" style="text-align:right;color:var(--green);font-weight:700">${l.qty_dispatched||'—'}</td>
          <td class="mono" style="text-align:right;font-weight:700;color:${bal===0?'var(--green)':bal===l.qty_ordered?'var(--ink2)':'var(--amber)'}">${bal===0?'✓ Done':bal}</td>
          <td class="mono" style="text-align:right;color:${avail>=bal&&bal>0?'var(--green)':avail>0?'var(--amber)':'var(--ink3)'}">
            ${bal===0?'—':avail>0?avail:'No stock'}
          </td>
          ${['admin'].includes(window._currentRole)?`<td><button class="btn-secondary btn-sm" onclick="openEditLine(${l.id},${l.qty_ordered},'${g.article_id}','${g.colour}',${l.size})">Edit</button></td>`:''}
        </tr>`;
      }).join('');

      return `
        <div style="margin-bottom:16px;border:1px solid var(--line);border-radius:var(--r);overflow:hidden">
          <!-- Group header -->
          <div style="background:var(--surface2);padding:10px 14px;display:flex;align-items:center;gap:10px;flex-wrap:wrap">
            <span style="font-weight:800;font-size:13px;font-family:'IBM Plex Mono',monospace">${g.article_id}</span>
            <span style="display:flex;align-items:center;gap:6px">
              <span style="width:9px;height:9px;border-radius:50%;background:${COLOUR_HEX[g.colour]||'#888'};display:inline-block;border:1px solid rgba(0,0,0,0.1)"></span>
              <span style="font-weight:600">${g.colour}</span>
            </span>
            <span style="margin-left:auto;display:flex;align-items:center;gap:10px;font-size:12px">
              <span style="color:var(--green)">✓ ${num(gDispatched)} sent</span>
              ${gBalance>0?`<span style="color:var(--amber)">⏳ ${num(gBalance)} to go</span>`:''}
              <span style="color:var(--ink3)">${gPct}% done</span>
            </span>
          </div>
          <!-- Lines table -->
          <table style="width:100%">
            <thead>
              <tr style="background:var(--surface2);border-top:1px solid var(--line)">
                <th style="font-size:11px">Size</th>
                <th style="font-size:11px;text-align:right">Ordered</th>
                <th style="font-size:11px;text-align:right">Dispatched</th>
                <th style="font-size:11px;text-align:right">Balance</th>
                <th style="font-size:11px;text-align:right">In Stock</th>
                ${['admin'].includes(window._currentRole)?'<th style="font-size:11px"></th>':''}
              </tr>
            </thead>
            <tbody>
              ${fullyDone.length ? `
                <tr><td colspan="6" style="padding:4px 14px;background:#f0faf4;font-size:10px;font-weight:700;color:var(--green);letter-spacing:0.5px;border-top:1px solid rgba(13,153,115,0.15)">✅ FULLY DISPATCHED</td></tr>
                ${renderLines(fullyDone, 'background:#f0faf4;opacity:0.8')}` : ''}
              ${partial.length ? `
                <tr><td colspan="6" style="padding:4px 14px;background:#fffbeb;font-size:10px;font-weight:700;color:var(--amber);letter-spacing:0.5px;border-top:1px solid rgba(180,83,9,0.15)">⚡ PARTIALLY DISPATCHED</td></tr>
                ${renderLines(partial, 'background:#fffbeb')}` : ''}
              ${notStarted.length ? `
                <tr><td colspan="6" style="padding:4px 14px;background:#eff6ff;font-size:10px;font-weight:700;color:var(--blue);letter-spacing:0.5px;border-top:1px solid rgba(43,91,255,0.15)">🔄 TO BE PRODUCED / DISPATCHED</td></tr>
                ${renderLines(notStarted, 'background:#eff6ff')}` : ''}
            </tbody>
          </table>
        </div>`;
    }).join('')}`;
  // Admin: full edit on any non-completed/cancelled order
  // Sales: edit header+lines on pending AND in_production; cancel only on pending
  const canEditFull   = window._currentRole === 'admin' && !['completed','cancelled'].includes(order?.status);
  const canEditSales  = window._currentRole === 'sales' && ['pending','in_production'].includes(order?.status);
  const canEdit       = canEditFull || canEditSales;
  const canCancel     = (window._currentRole === 'admin' && !['completed','cancelled'].includes(order?.status)) ||
                        (window._currentRole === 'sales' && order?.status === 'pending');
  document.getElementById('order-detail-footer').innerHTML = `
    <button class="btn-secondary" onclick="duplicateOrder(${orderId})">↺ Duplicate</button>
    ${canEdit
      ?`<button class="btn-secondary" onclick="openEditOrderHeader(${orderId})">✏ Edit Details</button>
        <button class="btn-secondary" onclick="openEditOrderModal(${orderId})">+ Add / Edit Lines</button>`:''}
    ${canCancel?`<button class="btn-danger" onclick="cancelOrder(${orderId},true)">Cancel Order</button>`:''}
    <button class="btn-secondary" onclick="closeModal('order-detail-modal')">Close</button>`;
  openModal('order-detail-modal');
}

function openEditLine(lineId, currentQty, article, colour, size) {
  window._editLineId = lineId;
  document.getElementById('edit-line-body').innerHTML = `
    <div class="info-row" style="margin-bottom:16px">
      <div class="info-item"><div class="info-label">Article</div><div class="info-value mono">${article}</div></div>
      <div class="info-item"><div class="info-label">Colour</div><div class="info-value">${colour}</div></div>
      <div class="info-item"><div class="info-label">Size</div><div class="info-value">Size ${size}</div></div>
    </div>
    <div class="form-group"><label>New Quantity (pairs)</label><input type="number" id="edit-line-qty" value="${currentQty}" min="0" /></div>
    <div class="warning-box">Cannot reduce below already-dispatched quantity.</div>`;
  openModal('edit-line-modal');
}

async function saveLineEdit() {
  const newQty = parseInt(document.getElementById('edit-line-qty')?.value);
  if (isNaN(newQty)||newQty<0) { showToast('Enter a valid quantity','error'); return; }
  const { error } = await DB.updateOrderLineQty(window._editLineId, newQty);
  if (error) { showToast('Error: '+error.message,'error'); return; }
  showToast('Quantity updated','success');
  closeModal('edit-line-modal');
  closeModal('order-detail-modal');
  renderOrders();
}

async function cancelOrder(orderId, fromDetail=false) {
  if (!confirmAction(`Cancel Order #${orderId}? This cannot be undone.`)) return;
  const { error } = await DB.cancelOrder(orderId);
  if (error) { showToast('Error: '+error.message,'error'); return; }
  showToast(`Order #${orderId} cancelled`,'info');
  if (fromDetail) closeModal('order-detail-modal');
  renderOrders();
}

function checkDeliveryFeasibility(deliveryDate) {
  const el = document.getElementById('delivery-feasibility');
  if (!el || !deliveryDate) return;
  const t = today();
  if (deliveryDate < t) {
    el.innerHTML = '<span style="color:var(--red)">⚠ Date is in the past</span>';
    return;
  }
  const daysAvailable = daysDiff(deliveryDate, t);
  const rmLeadTime = cfg('rmLead');
  if (daysAvailable < rmLeadTime) {
    el.innerHTML = `<span style="color:var(--red)">⚠ Only ${daysAvailable} days — RM lead time is ${rmLeadTime} days. May not be feasible.</span>`;
  } else if (daysAvailable < rmLeadTime + 7) {
    el.innerHTML = `<span style="color:var(--amber)">⚠ Tight timeline — ${daysAvailable} days. Ensure RM is already in stock.</span>`;
  } else {
    el.innerHTML = `<span style="color:var(--green)">✅ ${daysAvailable} days available — feasible</span>`;
  }
}

function onPartyChange() {
  const sel = document.getElementById('ord-party');
  const opt = sel.options[sel.selectedIndex];
  const pool = opt.dataset.pool||'';
  document.getElementById('ord-pool-display').value = pool.toUpperCase();
  window._currentOrderPool = pool;
}

// ── MATRIX ORDER ENTRY ───────────────────────────────────────────
// _orderLines: array of { article_id, colour, size, qty }
let _orderLines = [];

function openNewOrderModal() {
  _orderLines = [];
  renderOrderLinesSummary();
  const sel = document.getElementById('matrix-article-select');
  if (sel) sel.value = '';
  const btn = document.getElementById('open-matrix-btn');
  if (btn) btn.disabled = true;
  document.getElementById('matrix-entry-panel').style.display = 'none';
  openModal('new-order-modal');
}

function loadMatrixColours() {
  const btn = document.getElementById('open-matrix-btn');
  const val = document.getElementById('matrix-article-select')?.value;
  if (btn) btn.disabled = !val;
  // Close any open matrix panel when article changes
  document.getElementById('matrix-entry-panel').style.display = 'none';
}

async function openMatrixEntry() {
  const articleId = document.getElementById('matrix-article-select')?.value;
  if (!articleId) return;

  const colours = await DB.getColours(articleId);
  const art     = (window._articles||[]).find(a => a.id === articleId);
  const sizes   = getSizesForArticle(articleId);
  const pool    = window._currentOrderPool || 'general';

  // Load current inventory for this article to show sales team what's available
  const inventory = await DB.getInventory();
  const stockIdx  = {};
  inventory.filter(i => i.article_id === articleId && i.pool === pool).forEach(i => {
    const key = `${i.colour}||${i.size}`;
    stockIdx[key] = Math.max(0, i.qty_on_hand - i.qty_reserved);
  });
  window._matrixStock = stockIdx;

  const panel   = document.getElementById('matrix-entry-panel');
  const content = document.getElementById('matrix-content');

  // Warnings
  let warnings = '';
  if (art && art.mould_status !== 'in_production') {
    warnings += `<div class="warning-box" style="margin-bottom:10px">⚠ ${articleId} moulds in ${art.mould_status.replace('_',' ')} — order will be queued.</div>`;
  }
  if (['WIPL005','WIPL006'].includes(articleId)) {
    warnings += `<div class="warning-box" style="margin-bottom:10px">⚠ Size issue: Sizes 3 & 4 same length, Sizes 5 & 6 same length. Confirm with customer.</div>`;
  }

  // Build matrix: rows = colours, columns = sizes
  content.innerHTML = `
    ${warnings}
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
      <span style="font-weight:700;font-family:'IBM Plex Mono',monospace;font-size:13px">${articleId}</span>
      <span style="font-size:11px;color:var(--ink3)">Fill quantities — leave blank or 0 to skip</span>
      <button class="btn-secondary btn-sm" style="margin-left:auto" onclick="fillAllMatrix('${articleId}')">Fill All Rows</button>
      <button class="btn-secondary btn-sm" onclick="clearMatrixArticle('${articleId}')">Clear All</button>
    </div>
    <div style="overflow-x:auto">
      <table style="border-collapse:separate;border-spacing:4px">
        <thead>
          <tr>
            <th style="text-align:left;padding:4px 8px;font-size:10px;color:var(--ink3);font-family:'IBM Plex Mono',monospace;font-weight:600;min-width:100px">Colour</th>
            ${sizes.map(s => `<th style="text-align:center;padding:4px 6px;font-size:10px;color:var(--ink3);font-family:'IBM Plex Mono',monospace;font-weight:600;min-width:58px">Size ${s}</th>`).join('')}
            <th style="text-align:center;padding:4px 6px;font-size:10px;color:var(--ink3);font-family:'IBM Plex Mono',monospace;font-weight:600">Row Total</th>
          </tr>
          <!-- Stock available row -->
          <tr style="background:rgba(13,153,115,0.06);border-bottom:2px solid rgba(13,153,115,0.15)">
            <td style="padding:4px 8px;font-size:10px;font-weight:700;color:var(--green);font-family:'IBM Plex Mono',monospace;white-space:nowrap">In Stock (${pool.toUpperCase()})</td>
            ${sizes.map(s => {
              const anyStock = colours.some(c => (stockIdx[c.colour_name+'||'+s]||0) > 0);
              return `<td style="text-align:center;padding:4px 2px;font-size:10px;font-family:'IBM Plex Mono',monospace;color:var(--green);font-weight:600">${anyStock?'—':'0'}</td>`;
            }).join('')}
            <td></td>
          </tr>
        </thead>
        <tbody>
          ${colours.map(c => `
            <tr id="matrix-row-${articleId}-${c.colour_name.replace(/\s+/g,'-')}">
              <td style="padding:4px 0">
                <div style="display:flex;align-items:center;gap:7px;padding:6px 8px;background:var(--surface);border:1px solid var(--line);border-radius:var(--r-xs)">
                  <span style="width:9px;height:9px;border-radius:50%;background:${COLOUR_HEX[c.colour_name]||'#888'};border:1px solid rgba(0,0,0,0.1);flex-shrink:0;display:inline-block"></span>
                  <span style="font-size:12px;font-weight:600">${c.colour_name}</span>
                </div>
              </td>
              ${sizes.map((s, si) => {
                const avail   = stockIdx[c.colour_name+'||'+s] || 0;
                const tabIdx  = (colours.indexOf(c)+1) * 100 + si + 1;
                return `<td style="padding:3px 4px;text-align:center">
                  <input type="number" min="0"
                    id="mx-${articleId}-${c.colour_name}-${s}"
                    placeholder="0"
                    tabindex="${tabIdx}"
                    style="width:58px;text-align:center;padding:6px 4px;font-family:'IBM Plex Mono',monospace;font-size:12px;color:#0D1117;border-radius:var(--r-xs);${avail>0?'border-color:rgba(13,153,115,0.4);background:rgba(13,153,115,0.03);':''}"
                    oninput="updateMatrixRowTotal('${articleId}','${c.colour_name}')" />
                  <div style="font-size:9px;font-family:'IBM Plex Mono',monospace;color:${avail>0?'var(--green)':'var(--ink4)'};margin-top:2px;font-weight:600">${avail>0?avail+' avail':'—'}</div>
                </td>`;}).join('')}
              <td style="padding:4px;text-align:center">
                <span id="mx-total-${articleId}-${c.colour_name}" style="font-family:'IBM Plex Mono',monospace;font-size:12px;font-weight:700;color:var(--blue)">0</span>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;

  panel.style.display = 'block';
  // Smooth scroll to panel
  panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  window._matrixArticle  = articleId;
  window._matrixColours  = colours.map(c => c.colour_name);
  window._matrixSizes    = sizes;
}

function updateMatrixRowTotal(articleId, colour) {
  const sizes = window._matrixSizes || getSizesForArticle(articleId);
  let total = 0;
  sizes.forEach(s => {
    total += parseInt(document.getElementById(`mx-${articleId}-${colour}-${s}`)?.value)||0;
  });
  const el = document.getElementById(`mx-total-${articleId}-${colour}`);
  if (el) { el.textContent = total > 0 ? total : '0'; el.style.color = total > 0 ? 'var(--blue)' : 'var(--ink4)'; }
}

function fillAllMatrix(articleId) {
  // Focus the first empty input in each row as a helper
  const sizes   = window._matrixSizes || [];
  const colours = window._matrixColours || [];
  colours.forEach(c => {
    sizes.forEach(s => {
      const el = document.getElementById(`mx-${articleId}-${c}-${s}`);
      if (el && !el.value) el.focus();
    });
  });
}

function clearMatrixArticle(articleId) {
  const sizes   = window._matrixSizes || [];
  const colours = window._matrixColours || [];
  colours.forEach(c => {
    sizes.forEach(s => {
      const el = document.getElementById(`mx-${articleId}-${c}-${s}`);
      if (el) el.value = '';
    });
    updateMatrixRowTotal(articleId, c);
  });
}

function closeMatrixPanel() {
  document.getElementById('matrix-entry-panel').style.display = 'none';
}

function addMatrixToOrder() {
  const articleId = window._matrixArticle;
  const colours   = window._matrixColours || [];
  const sizes     = window._matrixSizes   || [];

  let added = 0;
  colours.forEach(colour => {
    sizes.forEach(size => {
      const qty = parseInt(document.getElementById(`mx-${articleId}-${colour}-${size}`)?.value)||0;
      if (qty > 0) {
        // Remove existing entry for same article+colour+size and replace
        _orderLines = _orderLines.filter(l => !(l.article_id===articleId && l.colour===colour && l.size===size));
        _orderLines.push({ article_id:articleId, colour, size, qty_ordered:qty });
        added++;
      }
    });
  });

  if (!added) { showToast('No quantities entered', 'error'); return; }
  showToast(`Added ${added} line item${added>1?'s':''} for ${articleId}`, 'success');
  closeMatrixPanel();
  document.getElementById('matrix-article-select').value = '';
  document.getElementById('open-matrix-btn').disabled = true;
  renderOrderLinesSummary();
}

function renderOrderLinesSummary() {
  const container = document.getElementById('order-lines-container');
  if (!container) return;

  if (!_orderLines.length) {
    container.innerHTML = `<div style="text-align:center;padding:20px;color:var(--ink3);font-size:13px;border:2px dashed var(--line);border-radius:var(--r);margin-top:8px">
      No lines added yet — select an article above and use the matrix to add quantities
    </div>`;
    return;
  }

  // Group by article+colour for display
  const grouped = {};
  _orderLines.forEach(l => {
    const key = `${l.article_id}__${l.colour}`;
    if (!grouped[key]) grouped[key] = { article_id:l.article_id, colour:l.colour, lines:[] };
    grouped[key].lines.push(l);
  });

  const totalPairs = _orderLines.reduce((s,l) => s+l.qty_ordered, 0);

  container.innerHTML = `
    <div style="margin-top:8px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
        <span style="font-size:12px;font-weight:700;color:var(--ink2)">${_orderLines.length} line items · ${num(totalPairs)} pairs total</span>
        <button class="btn-danger btn-sm" onclick="_orderLines=[];renderOrderLinesSummary()">Clear All</button>
      </div>
      <div style="border:1px solid var(--line);border-radius:var(--r);overflow:hidden">
        <table style="width:100%">
          <thead style="background:var(--surface2)">
            <tr>
              <th style="padding:8px 12px;text-align:left;font-size:10px;color:var(--ink3);font-family:'IBM Plex Mono',monospace;font-weight:600;text-transform:uppercase;letter-spacing:0.6px">Article</th>
              <th style="padding:8px 12px;text-align:left;font-size:10px;color:var(--ink3);font-family:'IBM Plex Mono',monospace;font-weight:600;text-transform:uppercase;letter-spacing:0.6px">Colour</th>
              <th style="padding:8px 12px;text-align:left;font-size:10px;color:var(--ink3);font-family:'IBM Plex Mono',monospace;font-weight:600;text-transform:uppercase;letter-spacing:0.6px">Sizes & Qty</th>
              <th style="padding:8px 12px;text-align:right;font-size:10px;color:var(--ink3);font-family:'IBM Plex Mono',monospace;font-weight:600;text-transform:uppercase;letter-spacing:0.6px">Total</th>
              <th style="padding:8px 12px;width:60px"></th>
            </tr>
          </thead>
          <tbody>
            ${Object.values(grouped).map(g => {
              const rowTotal = g.lines.reduce((s,l) => s+l.qty_ordered, 0);
              const sortedLines = [...g.lines].sort((a,b) => a.size-b.size);
              return `<tr style="border-top:1px solid var(--line)">
                <td style="padding:10px 12px;font-weight:700;font-family:'IBM Plex Mono',monospace;font-size:12px">${g.article_id}</td>
                <td style="padding:10px 12px">
                  <span style="display:inline-flex;align-items:center;gap:6px">
                    <span style="width:8px;height:8px;border-radius:50%;background:${COLOUR_HEX[g.colour]||'#888'};border:1px solid rgba(0,0,0,0.1);display:inline-block;flex-shrink:0"></span>
                    <span style="font-size:12px;font-weight:500">${g.colour}</span>
                  </span>
                </td>
                <td style="padding:10px 12px">
                  <div style="display:flex;flex-wrap:wrap;gap:4px">
                    ${sortedLines.map(l => `<span style="background:var(--surface2);border:1px solid var(--line);border-radius:4px;padding:2px 7px;font-size:11px;font-family:'IBM Plex Mono',monospace">Sz${l.size}:<strong>${l.qty_ordered}</strong></span>`).join('')}
                  </div>
                </td>
                <td style="padding:10px 12px;text-align:right;font-weight:700;font-family:'IBM Plex Mono',monospace;font-size:13px;color:var(--blue)">${num(rowTotal)}</td>
                <td style="padding:10px 12px">
                  <button class="btn-danger btn-sm" onclick="removeMatrixGroup('${g.article_id}','${g.colour}')">✕</button>
                </td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>`;
}

function removeMatrixGroup(articleId, colour) {
  _orderLines = _orderLines.filter(l => !(l.article_id===articleId && l.colour===colour));
  renderOrderLinesSummary();
}

// Matrix entry handles all order lines
function addOrderLine() { openMatrixEntry(); }

async function saveOrder() {
  const partyId  = document.getElementById('ord-party').value;
  const date     = document.getElementById('ord-date').value;
  const delivery = document.getElementById('ord-delivery').value;
  const po       = document.getElementById('ord-po').value;
  const pool     = window._currentOrderPool||'general';
  if (!partyId) { showToast('Select a party','error'); return; }
  if (delivery && delivery < date) { showToast('Delivery date cannot be before order date','error'); return; }
  // _orderLines is now a flat array from matrix entry: [{ article_id, colour, size, qty_ordered }]
  const lines = _orderLines.filter(l => l.qty_ordered > 0);
  if (!lines.length) { showToast('Add at least one item with qty > 0','error'); return; }
  const notes = document.getElementById('ord-notes')?.value || null;
  const { data, error } = await DB.createOrder({ order_date:date, party_id:parseInt(partyId), pool, required_delivery_date:delivery||null, po_number:po||null, notes, status:'pending' }, lines);
  if (error) { showToast('Error: '+error.message,'error'); return; }
  showToast(`Order #${data.id} created`,'success');
  closeModal('new-order-modal');
  renderOrders();
}

async function markInProduction(orderId) {
  await DB.updateOrder(orderId, { status:'in_production' });
  showToast('Order moved to In Production','info');
  renderOrders();
}

// ── PARTY REQUEST FLOW ────────────────────────────────────────────────────────
function openRequestPartyModal() {
  ['rp-name','rp-contact','rp-phone','rp-notes'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const pool = document.getElementById('rp-pool');
  if (pool) pool.value = 'general';
  openModal('request-party-modal');
  setTimeout(() => document.getElementById('rp-name')?.focus(), 100);
}

async function submitPartyRequest() {
  const name    = document.getElementById('rp-name')?.value.trim().toUpperCase();
  const pool    = document.getElementById('rp-pool')?.value || 'general';
  const contact = document.getElementById('rp-contact')?.value.trim();
  const phone   = document.getElementById('rp-phone')?.value.trim();
  const notes   = document.getElementById('rp-notes')?.value.trim();

  if (!name) { showToast('Enter party name', 'error'); return; }
  if (name.length < 2) { showToast('Name too short', 'error'); return; }

  // Check if already exists (active or pending)
  const allParties = await DB.getParties('all');
  const existing = allParties.find(p => p.party_name === name);
  if (existing) {
    if (existing.status === 'active') {
      showToast(`${name} already exists — select from the dropdown`, 'error'); return;
    }
    if (existing.status === 'pending') {
      showToast(`${name} is already pending Admin approval`, 'error'); return;
    }
  }

  // Try with status field (requires migration SQL to be run)
  // If it fails due to missing column, fall back to adding as active directly
  let partyData = {
    party_name: name,
    pool,
    contact_name: contact || null,
    contact_phone: phone || null,
    notes: notes || null,
  };

  // Try with approval flow first
  let { error } = await DB.addParty({ ...partyData, status: 'pending', requested_by: window._currentRole || 'sales' });

  if (error) {
    // If error is about missing status column, fall back to adding directly as active
    if (error.message && (error.message.includes('status') || error.message.includes('column') || error.message.includes('requested_by'))) {
      const fallback = await DB.addParty(partyData);
      if (fallback.error) {
        showToast('Error adding party: ' + fallback.error.message, 'error'); return;
      }
      showToast(`✅ ${name} added directly (run migration SQL to enable approval workflow)`, 'success');
      closeModal('request-party-modal');
      renderOrders(); // refresh so party appears in dropdown
      return;
    }
    showToast('Error: ' + error.message, 'error'); return;
  }

  showToast(`✅ Request submitted — Admin will review "${name}" shortly`, 'success');
  closeModal('request-party-modal');
}

// ── EDIT ORDER HEADER ──────────────────────────────────────────────────────
function openEditOrderHeader(orderId) {
  const order = (window._allOrders||[]).find(o => o.id === orderId);
  if (!order) return;
  closeModal('order-detail-modal');

  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.id = 'edit-order-header-modal';
  modal.innerHTML = `
    <div class="modal" style="max-width:480px">
      <div class="modal-header">
        <div class="modal-title">Edit Order #${orderId} — ${order.master_parties?.party_name}</div>
        <button class="modal-close" onclick="document.getElementById('edit-order-header-modal').remove()">×</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label>PO Number</label>
          <input type="text" id="eoh-po" value="${order.po_number||''}" placeholder="PO-001" />
        </div>
        <div class="form-group">
          <label>Required Delivery Date</label>
          <input type="date" id="eoh-delivery" value="${order.required_delivery_date||''}"
            onchange="checkDeliveryFeasibility(this.value)" />
          <div id="delivery-feasibility" style="font-size:11px;margin-top:4px;color:var(--ink3)"></div>
        </div>
        <div class="form-group" style="margin-bottom:0">
          <label>Notes</label>
          <input type="text" id="eoh-notes" value="${order.notes||''}" placeholder="Special instructions..." />
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" onclick="document.getElementById('edit-order-header-modal').remove()">Cancel</button>
        <button class="btn-primary" onclick="saveOrderHeader(${orderId})">Save Changes</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  setTimeout(() => document.getElementById('eoh-po')?.focus(), 100);
}

async function saveOrderHeader(orderId) {
  const po       = document.getElementById('eoh-po')?.value.trim();
  const delivery = document.getElementById('eoh-delivery')?.value;
  const notes    = document.getElementById('eoh-notes')?.value.trim();

  const { error } = await DB.updateOrder(orderId, {
    po_number: po || null,
    required_delivery_date: delivery || null,
    notes: notes || null,
  });
  if (error) { showToast('Error: ' + error.message, 'error'); return; }
  showToast('Order updated', 'success');
  document.getElementById('edit-order-header-modal')?.remove();
  renderOrders();
}

// ── DUPLICATE ORDER ────────────────────────────────────────────────────────
async function duplicateOrder(orderId) {
  const order = (window._allOrders||[]).find(o => o.id === orderId);
  if (!order) return;
  if (!confirmAction(`Create a new order for ${order.master_parties?.party_name} with the same line items?`)) return;

  const lines = await DB.getOrderLines(orderId);
  if (!lines.length) { showToast('No lines to duplicate', 'error'); return; }

  // Pre-fill order form
  closeModal('order-detail-modal');
  openNewOrderModal();

  setTimeout(() => {
    // Set party
    const partyEl = document.getElementById('ord-party');
    if (partyEl) {
      partyEl.value = order.party_id;
      onPartyChange();
    }
    // Set PO (blank — new PO needed)
    const poEl = document.getElementById('ord-po');
    if (poEl) poEl.value = '';
    // Set notes
    const notesEl = document.getElementById('ord-notes');
    if (notesEl) notesEl.value = order.notes || '';

    // Pre-fill _orderLines from existing lines
    _orderLines = lines
      .filter(l => (l.qty_ordered - l.qty_dispatched) > 0) // only pending balance
      .map(l => ({
        article_id: l.article_id,
        colour: l.colour,
        size: l.size,
        qty_ordered: l.qty_ordered - l.qty_dispatched  // copy balance, not original qty
      }));
    renderOrderLinesSummary();
    showToast(`${_orderLines.length} lines pre-filled — update date, PO and delivery then save`, 'info');
  }, 200);
}

// ══════════════════════════════════════════════════════════════════════════════
// EDIT ORDER MODAL
// ══════════════════════════════════════════════════════════════════════════════
let _editOrderId    = null;
let _editOrderLines = []; // { id (existing db id or null), article_id, colour, size, qty_ordered, qty_dispatched, _deleted, _new }

async function openEditOrderModal(orderId) {
  closeModal('order-detail-modal');
  _editOrderId    = orderId;
  _editOrderLines = [];

  const order = (window._allOrders||[]).find(o => o.id === orderId);
  if (!order) { showToast('Order not found','error'); return; }

  // Load existing lines from DB
  const existingLines = await DB.getOrderLines(orderId);
  _editOrderLines = existingLines.map(l => ({
    id:             l.id,
    article_id:     l.article_id,
    colour:         l.colour,
    size:           l.size,
    qty_ordered:    l.qty_ordered,
    qty_dispatched: l.qty_dispatched || 0,
    _deleted:       false,
    _new:           false,
  }));

  _buildEditOrderModal(order);
}

function _buildEditOrderModal(order) {
  // Remove any existing instance
  document.getElementById('edit-order-modal')?.remove();

  const parties  = window._parties  || [];
  const articles = window._articles || [];
  const role     = window._currentRole;

  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.id = 'edit-order-modal';
  modal.innerHTML = `
    <div class="modal" style="max-width:860px;width:95vw">
      <div class="modal-header">
        <div class="modal-title">Edit Order #${order.id} — ${order.master_parties?.party_name}</div>
        <button class="modal-close" onclick="document.getElementById('edit-order-modal').remove()">×</button>
      </div>
      <div class="modal-body" style="max-height:75vh;overflow-y:auto">

        <!-- IN-PRODUCTION WARNING -->
        ${order.status === 'in_production' ? `
          <div style="background:var(--amber-bg);border:1px solid var(--amber-line);border-radius:var(--r-sm);padding:10px 14px;margin-bottom:16px;font-size:12px;color:var(--ink)">
            ⚠ <strong>This order is in production.</strong>
            Changes here update the order record but do <strong>not</strong> automatically update the planned shift.
            Inform the floor team of any quantity changes that affect what they are producing.
          </div>` : ''}

        <!-- ORDER HEADER FIELDS -->
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:20px">
          <div class="form-group" style="margin-bottom:0">
            <label>Party</label>
            <input type="text" value="${order.master_parties?.party_name||''}" disabled
              style="background:var(--surface2);color:var(--ink3)" />
          </div>
          <div class="form-group" style="margin-bottom:0">
            <label>PO Number</label>
            <input type="text" id="eom-po" value="${order.po_number||''}" placeholder="PO-001" />
          </div>
          <div class="form-group" style="margin-bottom:0">
            <label>Required Delivery Date</label>
            <input type="date" id="eom-delivery" value="${order.required_delivery_date||''}" />
          </div>
          <div class="form-group" style="margin-bottom:0;grid-column:span 3">
            <label>Notes</label>
            <input type="text" id="eom-notes" value="${order.notes||''}" placeholder="Special instructions..." />
          </div>
        </div>

        <!-- EXISTING LINES TABLE -->
        <div style="font-weight:700;font-size:13px;margin-bottom:8px;color:var(--ink)">
          Order Lines
          <span style="font-weight:400;font-size:11px;color:var(--ink3);margin-left:8px">Edit quantities · Remove lines · Add new articles below</span>
        </div>
        <div id="eom-lines-table" style="margin-bottom:20px"></div>

        <!-- ADD NEW LINES VIA MATRIX -->
        <div style="border-top:1px solid var(--line);padding-top:16px;margin-top:4px">
          <div style="font-weight:700;font-size:13px;margin-bottom:10px;color:var(--ink)">
            Add New Lines
          </div>
          <div style="display:flex;gap:10px;align-items:flex-end;margin-bottom:12px;flex-wrap:wrap">
            <div class="form-group" style="margin-bottom:0;flex:1;min-width:160px">
              <label>Article</label>
              <select id="eom-article-select" onchange="eomLoadMatrixColours()">
                <option value="">Select article</option>
                ${articles.map(a=>`<option value="${a.id}">${a.id} (Sz ${a.size_range})</option>`).join('')}
              </select>
            </div>
            <button class="btn-secondary" id="eom-open-matrix-btn" onclick="eomOpenMatrix()" disabled>
              Open Matrix →
            </button>
          </div>
          <div id="eom-matrix-panel" style="display:none"></div>
          <!-- New lines preview -->
          <div id="eom-new-lines-preview"></div>
        </div>

      </div>
      <div class="modal-footer" style="justify-content:space-between">
        <div style="font-size:12px;color:var(--ink3)" id="eom-summary"></div>
        <div style="display:flex;gap:8px">
          <button class="btn-secondary" onclick="document.getElementById('edit-order-modal').remove()">Cancel</button>
          <button class="btn-primary" onclick="saveEditOrder()">Save Changes</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(modal);
  renderEOMLines();
}

function renderEOMLines() {
  const el = document.getElementById('eom-lines-table');
  if (!el) return;

  const active = _editOrderLines.filter(l => !l._deleted);
  if (!active.length) {
    el.innerHTML = `<div style="color:var(--ink3);font-size:12px;padding:8px 0">No lines — add articles below</div>`;
    updateEOMSummary();
    return;
  }

  // Group by article + colour for display
  const groups = {};
  active.forEach(l => {
    const key = `${l.article_id}||${l.colour}`;
    if (!groups[key]) groups[key] = { article_id:l.article_id, colour:l.colour, lines:[] };
    groups[key].lines.push(l);
  });

  el.innerHTML = Object.values(groups).map(g => {
    const dotColour = COLOUR_HEX[g.colour]||'#888';
    return `
      <div style="border:1px solid var(--line);border-radius:var(--r-sm);margin-bottom:8px;overflow:hidden">
        <div style="background:var(--surface2);padding:8px 12px;display:flex;align-items:center;justify-content:space-between">
          <div style="display:flex;align-items:center;gap:8px">
            <span style="font-weight:700;font-size:12px" class="mono">${g.article_id}</span>
            <span style="width:8px;height:8px;border-radius:50%;background:${dotColour};display:inline-block"></span>
            <span style="font-weight:600;font-size:12px">${g.colour}</span>
          </div>
          <button class="btn-danger btn-sm" style="font-size:10px" onclick="eomRemoveGroup('${g.article_id}','${g.colour}')">Remove All</button>
        </div>
        <div style="padding:8px 12px">
          <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center">
            ${g.lines.sort((a,b)=>a.size-b.size).map(l => {
              const maxQty  = Math.max(l.qty_ordered, l.qty_dispatched);
              const minQty  = l.qty_dispatched || 0;
              const isNew   = l._new;
              return `
                <div style="display:flex;flex-direction:column;align-items:center;gap:3px">
                  <span style="font-size:10px;color:var(--ink3)">Sz ${l.size}</span>
                  <input type="number" class="eom-qty-input" data-lineid="${l.id||''}" data-idx="${_editOrderLines.indexOf(l)}"
                    value="${l.qty_ordered}" min="${minQty}" style="width:64px;text-align:center;font-size:13px;font-weight:700"
                    oninput="eomUpdateQty(this)" title="${l.qty_dispatched>0?`Min: ${l.qty_dispatched} (already dispatched)`:''}" />
                  ${l.qty_dispatched>0?`<span style="font-size:9px;color:var(--ink3)">${l.qty_dispatched} disp.</span>`:''}
                  ${isNew?`<span style="font-size:9px;color:var(--blue)">new</span>`:''}
                </div>`;
            }).join('')}
            <button class="btn-danger btn-sm" style="font-size:10px;align-self:center" onclick="eomRemoveGroup('${g.article_id}','${g.colour}')">✕</button>
          </div>
        </div>
      </div>`;
  }).join('');

  updateEOMSummary();
}

function eomUpdateQty(input) {
  const idx = parseInt(input.dataset.idx);
  const val = parseInt(input.value)||0;
  if (!isNaN(idx) && _editOrderLines[idx]) {
    _editOrderLines[idx].qty_ordered = val;
  }
  updateEOMSummary();
}

function eomRemoveGroup(articleId, colour) {
  // Sales cannot remove lines from in-production orders — too risky
  const order = (window._allOrders||[]).find(o => o.id === _editOrderId);
  if (window._currentRole === 'sales' && order?.status === 'in_production') {
    showToast('Cannot remove lines from an in-production order — contact Admin', 'error');
    return;
  }
  // Cannot remove lines that have been partially dispatched
  const hasDispatched = _editOrderLines.some(l =>
    l.article_id === articleId && l.colour === colour && (l.qty_dispatched||0) > 0
  );
  if (hasDispatched) {
    showToast('Cannot remove lines that have already been partially dispatched', 'error');
    return;
  }
  _editOrderLines.forEach(l => {
    if (l.article_id === articleId && l.colour === colour) l._deleted = true;
  });
  renderEOMLines();
}

function updateEOMSummary() {
  const el = document.getElementById('eom-summary');
  if (!el) return;
  const active = _editOrderLines.filter(l => !l._deleted);
  const total  = active.reduce((s,l) => s + (l.qty_ordered||0), 0);
  el.textContent = `${active.length} lines · ${num(total)} pairs total`;
}

// ── MATRIX ENTRY FOR ADDING NEW LINES ────────────────────────────────────────
function eomLoadMatrixColours() {
  const btn = document.getElementById('eom-open-matrix-btn');
  const val = document.getElementById('eom-article-select')?.value;
  if (btn) btn.disabled = !val;
  document.getElementById('eom-matrix-panel').style.display = 'none';
}

async function eomOpenMatrix() {
  const articleId = document.getElementById('eom-article-select')?.value;
  if (!articleId) return;

  const panel = document.getElementById('eom-matrix-panel');
  panel.style.display = 'block';
  panel.innerHTML = `<div style="color:var(--ink3);font-size:12px">Loading colours...</div>`;

  const colours = await DB.getColours(articleId);
  const sizes   = getSizesForArticle(articleId);

  if (!colours.length) {
    panel.innerHTML = `<div style="color:var(--ink3);font-size:12px">No colours configured for ${articleId}</div>`;
    return;
  }

  panel.innerHTML = `
    <div style="border:1px solid var(--line);border-radius:var(--r-sm);overflow:hidden;margin-bottom:12px">
      <table style="width:100%;border-collapse:collapse">
        <thead>
          <tr style="background:var(--surface2)">
            <th style="padding:8px 10px;text-align:left;font-size:11px;color:var(--ink3)">Colour</th>
            ${sizes.map(s=>`<th style="padding:8px 6px;text-align:center;font-size:11px;color:var(--ink3)">Sz ${s}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${colours.map((c,ri) => `
            <tr style="background:${ri%2===0?'white':'var(--surface2)'}">
              <td style="padding:7px 10px">
                <div style="display:flex;align-items:center;gap:6px">
                  <span style="width:8px;height:8px;border-radius:50%;background:${COLOUR_HEX[c.colour_name]||'#888'};display:inline-block;flex-shrink:0"></span>
                  <span style="font-size:12px;font-weight:600">${c.colour_name}</span>
                </div>
              </td>
              ${sizes.map(s => `
                <td style="padding:4px 3px;text-align:center">
                  <input type="number" id="eom-m-${articleId}-${c.colour_name.replace(/\s/g,'_')}-${s}"
                    min="0" value=""
                    placeholder="0"
                    style="width:54px;text-align:center;font-size:12px;padding:4px" />
                </td>`).join('')}
            </tr>`).join('')}
        </tbody>
      </table>
    </div>
    <button class="btn-primary btn-sm" onclick="eomAddMatrixLines('${articleId}')">+ Add to Order</button>
    <button class="btn-secondary btn-sm" onclick="document.getElementById('eom-matrix-panel').style.display='none'">Cancel</button>
  `;
}

function eomAddMatrixLines(articleId) {
  const colours = document.querySelectorAll(`#eom-matrix-panel tbody tr`);
  const sizes   = getSizesForArticle(articleId);
  let added = 0;

  colours.forEach(row => {
    const colourName = row.querySelector('td:first-child span:last-child')?.textContent?.trim();
    if (!colourName) return;
    sizes.forEach(s => {
      const input = document.getElementById(`eom-m-${articleId}-${colourName.replace(/\s/g,'_')}-${s}`);
      const qty   = parseInt(input?.value)||0;
      if (qty <= 0) return;

      // Check if this line already exists (non-deleted)
      const existing = _editOrderLines.find(l =>
        l.article_id === articleId && l.colour === colourName &&
        l.size === s && !l._deleted
      );
      if (existing) {
        // Just update qty
        existing.qty_ordered = (existing.qty_ordered||0) + qty;
      } else {
        // Check if exists but was marked deleted — restore it
        const deleted = _editOrderLines.find(l =>
          l.article_id === articleId && l.colour === colourName &&
          l.size === s && l._deleted
        );
        if (deleted) {
          deleted._deleted  = false;
          deleted.qty_ordered = qty;
        } else {
          _editOrderLines.push({
            id:             null,
            article_id:     articleId,
            colour:         colourName,
            size:           s,
            qty_ordered:    qty,
            qty_dispatched: 0,
            _deleted:       false,
            _new:           true,
          });
        }
      }
      added++;
    });
  });

  if (!added) { showToast('Enter at least one quantity','error'); return; }
  document.getElementById('eom-matrix-panel').style.display = 'none';
  document.getElementById('eom-article-select').value = '';
  document.getElementById('eom-open-matrix-btn').disabled = true;
  renderEOMLines();
  showToast(`${added} size${added>1?'s':''} added — review below`,'success');
}

// ── SAVE EDIT ORDER ───────────────────────────────────────────────────────────
async function saveEditOrder() {
  if (!_editOrderId) return;

  // Validate
  const active = _editOrderLines.filter(l => !l._deleted);
  if (!active.length) {
    if (!confirmAction('Removing all lines will cancel this order. Continue?')) return;
  }

  for (const l of active) {
    if ((l.qty_ordered||0) < (l.qty_dispatched||0)) {
      showToast(`Qty for ${l.article_id} ${l.colour} Sz${l.size} cannot be less than ${l.qty_dispatched} (already dispatched)`,'error');
      return;
    }
    if ((l.qty_ordered||0) <= 0) {
      showToast(`Qty for ${l.article_id} ${l.colour} Sz${l.size} must be greater than 0`,'error');
      return;
    }
  }

  // Gather header changes
  const po       = document.getElementById('eom-po')?.value.trim()||null;
  const delivery = document.getElementById('eom-delivery')?.value||null;
  const notes    = document.getElementById('eom-notes')?.value.trim()||null;

  let errors = [];

  // 1. Update order header
  const { error: headerErr } = await DB.updateOrder(_editOrderId, {
    po_number: po, required_delivery_date: delivery, notes
  });
  if (headerErr) errors.push('Header: ' + headerErr.message);

  // 2. Update existing lines (qty changes)
  for (const l of _editOrderLines.filter(l => !l._new && !l._deleted)) {
    const { error } = await DB.updateOrderLineQty(l.id, l.qty_ordered);
    if (error) errors.push(`Line ${l.id}: ` + error.message);
  }

  // 3. Delete removed lines (only if not dispatched)
  for (const l of _editOrderLines.filter(l => l._deleted && !l._new && l.id)) {
    if ((l.qty_dispatched||0) > 0) continue; // cannot delete partially dispatched lines
    const { error } = await DB.deleteOrderLine(l.id);
    if (error) errors.push(`Delete line ${l.id}: ` + error.message);
  }

  // 4. Add new lines
  const newLines = _editOrderLines.filter(l => l._new && !l._deleted && l.qty_ordered > 0);
  if (newLines.length) {
    const { error } = await DB.addOrderLines(_editOrderId, newLines.map(l => ({
      article_id:  l.article_id,
      colour:      l.colour,
      size:        l.size,
      qty_ordered: l.qty_ordered,
      qty_dispatched: 0,
    })));
    if (error) errors.push('New lines: ' + error.message);
  }

  // 5. If all lines removed, cancel the order
  if (!active.length) {
    await DB.cancelOrder(_editOrderId);
    showToast(`Order #${_editOrderId} cancelled — all lines removed`, 'info');
    document.getElementById('edit-order-modal')?.remove();
    renderOrders();
    return;
  }

  if (errors.length) {
    showToast('Some updates failed: ' + errors[0], 'error');
    return;
  }

  showToast(`Order #${_editOrderId} updated successfully`, 'success');
  document.getElementById('edit-order-modal')?.remove();
  renderOrders();
}
