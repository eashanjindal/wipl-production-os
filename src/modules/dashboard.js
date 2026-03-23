async function renderDashboard() {
  const area = document.getElementById('content-area');
  area.innerHTML = loading();
  try {
  const role = window._currentRole || 'admin';

  const [orders, shifts, rmStock, inventory, overdueOrders, reorderAlerts, fulfilStatus, pendingParties] = await Promise.all([
    DB.getOrders(), DB.getShifts({ from: today() }), DB.getRMStock(),
    DB.getInventory(), DB.getOverdueOrders(), DB.getInventoryBelowReorder(),
    DB.getOrderFulfilmentStatus(),
    window._currentRole === 'admin' ? DB.getParties('pending') : Promise.resolve([])
  ]);

  const pending    = orders.filter(o => o.status === 'pending').length;
  const inProd     = orders.filter(o => o.status === 'in_production').length;
  const ready      = orders.filter(o => o.status === 'ready').length;
  const todayShift = shifts.find(s => s.shift_date === today());
  const upcoming   = shifts.filter(s => s.shift_date >= today()).slice(0, 5);
  const totalPairs = inventory.reduce((s, i) => s + Math.max(0, i.qty_on_hand - i.qty_reserved), 0);
  const rmAlerts     = rmStock.filter(r => r.qty_kg < 50).length;
  const canDispatch  = fulfilStatus.filter(f => f.canFullyFulfil || f.canPartialFulfil).length;
  const fullyReady   = fulfilStatus.filter(f => f.canFullyFulfil).length;

  area.innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-header-title">Dashboard</div>
        <div class="page-header-sub">${new Date().toLocaleDateString('en-IN',{weekday:'long',day:'numeric',month:'long',year:'numeric'})}</div>
      </div>
    </div>

    ${overdueOrders.length ? `
      <div class="error-box" style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
        <span>🚨 <strong>${overdueOrders.length} order${overdueOrders.length>1?'s':''}</strong> past delivery date — ${overdueOrders.map(o=>o.master_parties?.party_name).slice(0,3).join(', ')}${overdueOrders.length>3?'...':''}</span>
        <button class="btn-danger btn-sm" onclick="navigateTo('orders')">View Orders</button>
      </div>` : ''}

    ${reorderAlerts.length && ['admin','floor'].includes(role) ? `
      <div class="warning-box" style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
        <span>⚠ <strong>${reorderAlerts.length} SKU${reorderAlerts.length>1?'s':''}</strong> below reorder point</span>
        <button class="btn-secondary btn-sm" onclick="navigateTo('rawmaterial')">View RM Stock</button>
      </div>` : ''}

    ${pendingParties.length > 0 && window._currentRole === 'admin' ? `
      <div class="warning-box" style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
        <span>⏳ <strong>${pendingParties.length} party approval request${pendingParties.length>1?'s':''}</strong> waiting for your review</span>
        <button class="btn-secondary btn-sm" onclick="navigateTo('masterdata')">Review →</button>
      </div>` : ''}

    ${canDispatch > 0 && ['admin','dispatch'].includes(role) ? `
      <div class="success-box" style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
        <span>📦 <strong>${fullyReady > 0 ? fullyReady+' order'+(fullyReady>1?'s':'')+' ready to fully dispatch' : ''}</strong>${fullyReady>0&&canDispatch>fullyReady?' · ':''}<strong>${canDispatch-fullyReady > 0 ? (canDispatch-fullyReady)+' can be partially dispatched' : ''}</strong></span>
        <button class="btn-primary btn-sm" onclick="navigateTo('dispatch')">Go to Dispatch →</button>
      </div>` : ''}

    <div class="stat-grid">
      ${['admin','sales','dispatch'].includes(role) ? `<div class="stat-card yellow"><div class="stat-icon">📋</div><div class="stat-label">Pending Orders</div><div class="stat-value">${pending}</div><div class="stat-sub">Awaiting production</div></div>` : ''}
      ${['admin','floor'].includes(role) ? `<div class="stat-card blue"><div class="stat-icon">⚙️</div><div class="stat-label">In Production</div><div class="stat-value">${inProd}</div><div class="stat-sub">Currently scheduled</div></div>` : ''}
      ${['admin','dispatch'].includes(role) ? `<div class="stat-card green"><div class="stat-icon">✅</div><div class="stat-label">Ready to Dispatch</div><div class="stat-value">${ready}</div><div class="stat-sub">Packed & waiting</div></div>` : ''}
      ${['admin','sales','dispatch'].includes(role) ? `<div class="stat-card ${overdueOrders.length>0?'red':'green'}"><div class="stat-icon">⏰</div><div class="stat-label">Overdue</div><div class="stat-value">${overdueOrders.length}</div><div class="stat-sub">Past delivery date</div></div>` : ''}
      ${['admin','sales','dispatch'].includes(role) ? `<div class="stat-card orange"><div class="stat-icon">📦</div><div class="stat-label">Available Stock</div><div class="stat-value">${num(totalPairs)}</div><div class="stat-sub">Pairs across all SKUs</div></div>` : ''}
      ${['admin','floor'].includes(role) ? `<div class="stat-card ${rmAlerts>0?'red':'green'}"><div class="stat-icon">🧪</div><div class="stat-label">RM Low Alerts</div><div class="stat-value">${rmAlerts}</div><div class="stat-sub">Colours below 50kg</div></div>` : ''}
      ${['admin','dispatch'].includes(role) && canDispatch>0 ? `<div class="stat-card blue" onclick="navigateTo('dispatch')" style="cursor:pointer"><div class="stat-icon">📦</div><div class="stat-label">Can Dispatch Now</div><div class="stat-value">${canDispatch}</div><div class="stat-sub">${fullyReady} full · ${canDispatch-fullyReady} partial</div></div>` : ''}
    </div>

    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(400px,1fr));gap:16px;margin-bottom:16px">
      ${['admin','floor'].includes(role) ? `<div class="card">
        <div class="card-title">Today's Shift</div>
        ${todayShift ? `
          <div style="border-left:4px solid ${todayShift.status==='in_progress'?'var(--blue)':todayShift.status==='completed'?'var(--green)':'var(--blue)'};padding-left:14px;margin-bottom:16px">
            <div style="font-size:18px;font-weight:800;color:var(--ink)">${fmtDate(todayShift.shift_date)}</div>
            <div style="font-size:12px;color:var(--ink3);margin-top:2px">${todayShift.colour_mode.toUpperCase()} · ${poolBadge(todayShift.pool)}</div>
          </div>
          <div style="display:flex;gap:8px;align-items:center;margin-bottom:14px">
            <span class="colour-chip"><span class="colour-dot" style="background:${COLOUR_HEX[todayShift.colour_1]||'#888'}"></span>${todayShift.colour_1}</span>
            ${todayShift.colour_2?`<span style="color:var(--ink3)">+</span><span class="colour-chip"><span class="colour-dot" style="background:${COLOUR_HEX[todayShift.colour_2]||'#888'}"></span>${todayShift.colour_2}</span>`:''}
          </div>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-bottom:14px">
            <div style="background:var(--surface2);border-radius:6px;padding:10px;text-align:center">
              <div style="font-size:10px;color:var(--ink3);margin-bottom:3px">${todayShift.colour_1}</div>
              <div style="font-weight:800;font-size:18px">${num(todayShift.target_pairs_colour_1)}</div>
            </div>
            ${todayShift.colour_mode==='dual'&&todayShift.colour_2?`<div style="background:var(--surface2);border-radius:6px;padding:10px;text-align:center">
              <div style="font-size:10px;color:var(--ink3);margin-bottom:3px">${todayShift.colour_2}</div>
              <div style="font-weight:800;font-size:18px">${num(todayShift.target_pairs_colour_2)}</div>
            </div>`:''}
          </div>
          <div style="display:flex;gap:8px;align-items:center">
            ${statusBadge(todayShift.status)}
            <button class="btn-secondary btn-sm" onclick="navigateTo('production')">Go to Production →</button>
          </div>
        ` : `<div class="empty-state" style="padding:24px 0">
            <div class="empty-icon">📅</div><p>No shift planned for today</p>
            <button class="btn-primary btn-sm" style="margin-top:12px" onclick="navigateTo('production')">Plan a Shift</button>
          </div>`}
      </div>` : ''}

      <div class="card">
        <div class="card-title">Overdue Deliveries ${overdueOrders.length>0?`<span class="badge low" style="margin-left:6px">${overdueOrders.length}</span>`:''}</div>
        ${overdueOrders.length ? overdueOrders.slice(0,5).map(o => {
          const daysLate = daysDiff(today(), o.required_delivery_date);
          return `<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--line)">
            <div>
              <div style="font-weight:600;font-size:13px">${o.master_parties?.party_name}</div>
              <div style="font-size:11px;color:var(--ink3);margin-top:1px">Due: ${fmtDate(o.required_delivery_date)} · #${o.id}</div>
            </div>
            <div style="text-align:right">
              <span class="badge low">${daysLate}d late</span>
              <div style="margin-top:3px">${statusBadge(o.status)}</div>
            </div>
          </div>`;
        }).join('') : `<div class="empty-state" style="padding:24px 0"><div class="empty-icon">✅</div><p>No overdue deliveries</p></div>`}
      </div>
    </div>

    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(380px,1fr));gap:16px">
      ${['admin','floor'].includes(role) ? `<div class="card">
        <div class="card-title">Upcoming Shifts</div>
        ${upcoming.length ? upcoming.map(s => `
          <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--line)">
            <div>
              <div style="font-weight:600;font-size:13px">${fmtDate(s.shift_date)}</div>
              <div style="display:flex;align-items:center;gap:6px;margin-top:3px">
                <span style="width:7px;height:7px;border-radius:50%;background:${COLOUR_HEX[s.colour_1]||'#888'};display:inline-block"></span>
                <span style="font-size:11px;color:var(--ink3)">${s.colour_1}${s.colour_2?' + '+s.colour_2:''}</span>
              </div>
            </div>
            ${statusBadge(s.status)}
          </div>`).join('') : `<div class="empty-state" style="padding:24px 0"><div class="empty-icon">📅</div><p>No upcoming shifts</p></div>`}
      </div>` : ''}

      ${['admin','floor'].includes(role) ? `<div class="card">
        <div class="card-title">Raw Material Stock</div>
        ${rmStock.map(r => `
          <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--line)">
            <span style="display:flex;align-items:center;gap:7px">
              <span style="width:9px;height:9px;border-radius:50%;background:${COLOUR_HEX[r.compound_colour]||'#888'};border:1px solid rgba(0,0,0,0.1);display:inline-block;flex-shrink:0"></span>
              <span style="font-size:13px;font-weight:500">${r.compound_colour}</span>
            </span>
            <div style="display:flex;align-items:center;gap:8px">
              <span class="mono" style="font-size:12px">${r.qty_kg} kg</span>
              ${r.qty_kg<20?'<span class="badge low">Critical</span>':r.qty_kg<50?'<span class="badge partial">Low</span>':'<span class="badge ok">OK</span>'}
            </div>
          </div>`).join('')}
      </div>` : ''}
    </div>
  `;
  } catch(e) {
    log('error', 'renderDashboard', e.message, e);
    if(area) area.innerHTML = `<div class="error-box" style="margin:20px">⚠ Dashboard failed — ${e.message} <button class="btn-secondary btn-sm" onclick="renderDashboard()">Retry</button></div>`;
  }
}
