async function renderInventory() {
  const area = document.getElementById('content-area');
  area.innerHTML = loading();
  const [inventory, articles, reorderAlerts] = await Promise.all([DB.getInventory(), DB.getArticles(), DB.getInventoryBelowReorder()]);
  window._articles      = articles;
  window._inventoryData = inventory;

  const yootsStock   = inventory.filter(i=>i.pool==='yoots');
  const generalStock = inventory.filter(i=>i.pool==='general');
  const totalYoots   = yootsStock.reduce((s,i)=>s+Math.max(0,i.qty_on_hand-i.qty_reserved),0);
  const totalGeneral = generalStock.reduce((s,i)=>s+Math.max(0,i.qty_on_hand-i.qty_reserved),0);
  const totalReserved= inventory.reduce((s,i)=>s+i.qty_reserved,0);

  area.innerHTML = `
    <div class="page-header">
      <div><div class="page-header-title">Inventory</div><div class="page-header-sub">Live stock across YOOTS & General pools</div></div>
      <div style="display:flex;gap:10px">
        ${['admin','dispatch'].includes(window._currentRole) ? `
          <button class="btn-secondary" onclick="openStockAdjModal()">Adjust Stock</button>
          <button class="btn-primary" onclick="openMSLModal()">Set Reorder Levels</button>
        ` : ''}
        <button class="btn-secondary" onclick="showStockHistory()">📜 History</button>
      </div>
    </div>

    ${window._currentRole === 'sales' ? `
      <div class="success-box" style="margin-bottom:16px">
        📦 <strong>Current Stock View</strong> — This shows live inventory. Use this when quoting customers on availability.
      </div>` : ''}
    ${reorderAlerts.length?`<div class="warning-box">⚠ <strong>${reorderAlerts.length} SKU${reorderAlerts.length>1?'s':''}</strong> below reorder point: ${reorderAlerts.slice(0,4).map(a=>`${a.article_id} ${a.colour} Sz${a.size} (${a.pool})`).join(', ')}${reorderAlerts.length>4?'...':''}</div>`:''}

    <div class="stat-grid">
      <div class="stat-card purple"><div class="stat-icon">🟣</div><div class="stat-label">YOOTS Pool</div><div class="stat-value">${num(totalYoots)}</div><div class="stat-sub">Available pairs</div></div>
      <div class="stat-card blue"><div class="stat-icon">🔵</div><div class="stat-label">General Pool</div><div class="stat-value">${num(totalGeneral)}</div><div class="stat-sub">Available pairs</div></div>
      <div class="stat-card orange"><div class="stat-icon">🔒</div><div class="stat-label">Reserved</div><div class="stat-value">${num(totalReserved)}</div><div class="stat-sub">Committed to orders</div></div>
      <div class="stat-card ${reorderAlerts.length>0?'red':'green'}"><div class="stat-icon">${reorderAlerts.length>0?'⚠️':'✅'}</div><div class="stat-label">Below Reorder</div><div class="stat-value">${reorderAlerts.length}</div><div class="stat-sub">Need replenishment</div></div>
    </div>


    <!-- Filter bar -->
    <div style="display:flex;gap:10px;margin-bottom:14px;align-items:center;flex-wrap:wrap">
      <select id="inv-filter-article" onchange="applyInvFilter()" style="width:160px">
        <option value="">All Articles</option>
        ${(window._articles||[]).map(a=>`<option value="${a.id}">${a.id}</option>`).join('')}
      </select>
      <input type="text" id="inv-filter-colour" placeholder="Filter by colour..." oninput="applyInvFilter()" style="width:180px" />
      <button class="btn-secondary btn-sm" onclick="clearInvFilter()">✕ Clear</button>
    </div>

    <div class="tabs">
      <button class="tab active" onclick="showInvPool(this,'general')">General Pool</button>
      <button class="tab" onclick="showInvPool(this,'yoots')">YOOTS Pool</button>
    </div>
    <div id="inv-pool-view">${renderInventoryTable(generalStock, articles, 'general', reorderAlerts)}</div>

    <!-- STOCK ADJUSTMENT MODAL -->
    <div id="stock-adj-modal" class="modal-overlay hidden">
      <div class="modal">
        <div class="modal-header"><div class="modal-title">Adjust Stock</div><button class="modal-close" onclick="closeModal('stock-adj-modal')">×</button></div>
        <div class="modal-body">
          <div class="warning-box">Positive = add stock. Negative = reduce. A movement record will be saved.</div>
          <div class="form-row cols-2">
            <div class="form-group"><label>Article</label>
              <select id="adj-article" onchange="onAdjArticleChange()"><option value="">Select</option>
                ${articles.map(a=>`<option value="${a.id}">${a.id}</option>`).join('')}
              </select>
            </div>
            <div class="form-group"><label>Colour</label><select id="adj-colour"><option value="">Select article first</option></select></div>
          </div>
          <div class="form-row cols-2">
            <div class="form-group"><label>Pool</label><select id="adj-pool"><option value="general">General</option><option value="yoots">YOOTS</option></select></div>
            <div class="form-group"><label>Size</label><select id="adj-size"><option value="">Select article first</option></select></div>
          </div>
          <div class="form-row cols-2">
            <div class="form-group"><label>Quantity (+add / -remove)</label><input type="number" id="adj-qty" placeholder="e.g. 100 or -20" /></div>
            <div class="form-group"><label>Reason</label><input type="text" id="adj-reason" placeholder="e.g. Stock count correction" value="Manual adjustment" /></div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" onclick="closeModal('stock-adj-modal')">Cancel</button>
          <button class="btn-primary" onclick="saveStockAdj()">Adjust Stock</button>
        </div>
      </div>
    </div>

    <!-- MSL MODAL -->
    <div id="msl-modal" class="modal-overlay hidden">
      <div class="modal">
        <div class="modal-header"><div class="modal-title">Set Reorder Levels</div><button class="modal-close" onclick="closeModal('msl-modal')">×</button></div>
        <div class="modal-body">
          <div class="form-row cols-2">
            <div class="form-group"><label>Article</label><select id="msl-article">${articles.map(a=>`<option value="${a.id}">${a.id}</option>`).join('')}</select></div>
            <div class="form-group"><label>Colour</label><input type="text" id="msl-colour" placeholder="e.g. GREY" /></div>
          </div>
          <div class="form-group"><label>Pool</label><select id="msl-pool"><option value="general">General</option><option value="yoots">YOOTS</option></select></div>
          <div class="form-row cols-3">
            <div class="form-group"><label>Min Stock Level</label><input type="number" id="msl-min" placeholder="100" /></div>
            <div class="form-group"><label>Reorder Point</label><input type="number" id="msl-rop" placeholder="200" /></div>
            <div class="form-group"><label>Max Stock Level</label><input type="number" id="msl-max" placeholder="500" /></div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" onclick="closeModal('msl-modal')">Cancel</button>
          <button class="btn-primary" onclick="saveMSL()">Save Levels</button>
        </div>
      </div>
    </div>

    <!-- PARTIAL DISPATCH MODAL -->
    <div id="partial-dispatch-modal" class="modal-overlay hidden">
      <div class="modal" style="max-width:700px">
        <div class="modal-header">
          <div class="modal-title" id="pd-modal-title">Dispatch Stock</div>
          <button class="modal-close" onclick="closeModal('partial-dispatch-modal')">×</button>
        </div>
        <div class="modal-body" id="pd-modal-body">
          <div class="loading"><div class="spinner"></div> Loading pending orders...</div>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" onclick="closeModal('partial-dispatch-modal')">Cancel</button>
          <button class="btn-primary" onclick="confirmPartialDispatch()">📦 Confirm Dispatch</button>
        </div>
      </div>
    </div>

    <!-- STOCK HISTORY MODAL -->
    <div id="stock-history-modal" class="modal-overlay hidden">
      <div class="modal" style="max-width:800px">
        <div class="modal-header"><div class="modal-title">Stock Movement History</div><button class="modal-close" onclick="closeModal('stock-history-modal')">×</button></div>
        <div class="modal-body" id="stock-history-body"><div class="loading"><div class="spinner"></div> Loading...</div></div>
      </div>
    </div>
  `;
}

function renderInventoryTable(invData, articles, pool, reorderAlerts=[]) {
  if (!invData.length) return `<div class="card">${emptyState('📦',`No ${pool} stock recorded yet`)}</div>`;
  const grouped={};
  invData.forEach(i=>{
    const key=`${i.article_id}__${i.colour}`;
    if(!grouped[key]) grouped[key]={article_id:i.article_id,colour:i.colour,sizes:{}};
    grouped[key].sizes[i.size]=i;
  });
  return `<div class="card"><div class="table-wrap"><table>
    <thead><tr><th>Article</th><th>Colour</th>${[...MENS_SIZES,...WOMENS_SIZES.filter(s=>!MENS_SIZES.includes(s))].map(s=>`<th class="inv-cell">Sz ${s}</th>`).join('')}<th>Total</th><th>Reserved</th><th>Available</th><th>Status</th><th>Action</th></tr></thead>
    <tbody>${Object.values(grouped).map(g=>{
      const isWomens=WOMENS_ARTICLES.includes(g.article_id);
      const sizes=isWomens?WOMENS_SIZES:MENS_SIZES;
      const allSizes=[...MENS_SIZES,...WOMENS_SIZES.filter(s=>!MENS_SIZES.includes(s))];
      let total=0,reserved=0;
      sizes.forEach(s=>{const d=g.sizes[s];if(d){total+=d.qty_on_hand;reserved+=d.qty_reserved;}});
      const avail=total-reserved;
      const hasAlert=reorderAlerts.some(a=>a.article_id===g.article_id&&a.colour===g.colour&&a.pool===pool);
      return `<tr style="${hasAlert?'background:var(--amber-bg);':''}">
        <td class="mono" style="font-weight:700">${g.article_id}</td>
        <td><span style="display:inline-flex;align-items:center;gap:6px"><span style="width:8px;height:8px;border-radius:50%;background:${COLOUR_HEX[g.colour]||'#888'};border:1px solid rgba(0,0,0,0.1);display:inline-block"></span>${g.colour}</span></td>
        ${allSizes.map(s=>{
          if(!sizes.includes(s)) return`<td class="inv-cell" style="color:var(--line2)">—</td>`;
          const d=g.sizes[s],qty=d?d.qty_on_hand-d.qty_reserved:0;
          const cls=qty<=0?'low':qty<20?'warn':'ok';
          return`<td class="inv-cell ${cls}">${d?qty:0}</td>`;
        }).join('')}
        <td class="mono">${num(total)}</td>
        <td class="mono" style="color:var(--amber)">${num(reserved)}</td>
        <td class="mono" style="color:var(--green);font-weight:700">${num(avail)}</td>
        <td>${hasAlert?'<span class="badge partial">⚠ Reorder</span>':'<span class="badge ok">OK</span>'}</td>
        ${['admin','dispatch'].includes(window._currentRole) ? `<td><button class="btn-secondary btn-sm" onclick="openPartialDispatch('${g.article_id}','${g.colour}','${pool}')" style="white-space:nowrap">📦 Dispatch</button></td>` : '<td></td>'}
      </tr>`;
    }).join('')}</tbody>
  </table></div></div>`;
}

function applyInvFilter() {
  const article = document.getElementById('inv-filter-article')?.value || '';
  const colour  = (document.getElementById('inv-filter-colour')?.value || '').trim().toUpperCase();
  const pool    = document.querySelector('.tabs .tab.active')?.textContent.includes('YOOTS') ? 'yoots' : 'general';
  let data = (window._inventoryData || []).filter(i => i.pool === pool);
  if (article) data = data.filter(i => i.article_id === article);
  if (colour)  data = data.filter(i => i.colour.toUpperCase().includes(colour));
  const alerts = window._reorderAlerts || [];
  document.getElementById('inv-pool-view').innerHTML = renderInventoryTable(data, window._articles||[], pool, alerts);
}

function clearInvFilter() {
  const artEl = document.getElementById('inv-filter-article');
  const colEl = document.getElementById('inv-filter-colour');
  if (artEl) artEl.value = '';
  if (colEl) colEl.value = '';
  applyInvFilter();
}

function showInvPool(btn, pool) {
  document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active')); btn.classList.add('active');
  const data=(window._inventoryData||[]).filter(i=>i.pool===pool);
  document.getElementById('inv-pool-view').innerHTML=renderInventoryTable(data,window._articles||[],pool);
}

function openStockAdjModal() { openModal('stock-adj-modal'); }
function openMSLModal()       { openModal('msl-modal'); }

async function onAdjArticleChange() {
  const articleId=document.getElementById('adj-article').value; if(!articleId) return;
  const colours=await DB.getColours(articleId);
  document.getElementById('adj-colour').innerHTML=colours.map(c=>`<option value="${c.colour_name}">${c.colour_name}</option>`).join('');
  const sizes=getSizesForArticle(articleId);
  document.getElementById('adj-size').innerHTML=sizes.map(s=>`<option value="${s}">Size ${s}</option>`).join('');
}

async function saveStockAdj() {
  const articleId=document.getElementById('adj-article').value;
  const colour=document.getElementById('adj-colour').value;
  const pool=document.getElementById('adj-pool').value;
  const size=parseInt(document.getElementById('adj-size').value);
  const qty=parseInt(document.getElementById('adj-qty').value);
  const reason=document.getElementById('adj-reason').value||'Manual adjustment';
  if(!articleId||!colour||!size||isNaN(qty)){showToast('Fill all fields','error');return;}
  await DB.upsertInventory(articleId,colour,size,pool,qty);
  await DB.logStockMovement(articleId,colour,size,pool,qty,reason);
  showToast('Stock adjusted','success');
  closeModal('stock-adj-modal');
  renderInventory();
}

async function saveMSL() {
  const articleId=document.getElementById('msl-article').value;
  const colour=document.getElementById('msl-colour').value.toUpperCase();
  const pool=document.getElementById('msl-pool').value;
  const min=parseInt(document.getElementById('msl-min').value);
  const rop=parseInt(document.getElementById('msl-rop').value);
  const max=parseInt(document.getElementById('msl-max').value);
  if(!articleId||!colour||isNaN(min)||isNaN(rop)||isNaN(max)){showToast('Fill all fields','error');return;}
  const {error}=await DB.setInventoryLevels(articleId,colour,pool,min,rop,max);
  if(error){showToast('Error: '+error.message,'error');return;}
  showToast('Reorder levels saved','success');
  closeModal('msl-modal');
}

async function showStockHistory() {
  openModal('stock-history-modal');
  const movements = await DB.getStockMovements();
  const el = document.getElementById('stock-history-body');
  if (!movements.length) { el.innerHTML=emptyState('📜','No stock movements recorded yet. Run the migration SQL if this is your first time.'); return; }
  el.innerHTML=`<div class="table-wrap"><table>
    <thead><tr><th>Date/Time</th><th>Article</th><th>Colour</th><th>Size</th><th>Pool</th><th style="text-align:right">Qty</th><th>Reason</th></tr></thead>
    <tbody>${movements.map(m=>`<tr>
      <td style="font-size:12px;white-space:nowrap">${new Date(m.created_at).toLocaleString('en-IN',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}</td>
      <td class="mono">${m.article_id}</td>
      <td><span style="display:inline-flex;align-items:center;gap:5px"><span style="width:7px;height:7px;border-radius:50%;background:${COLOUR_HEX[m.colour]||'#888'};display:inline-block"></span>${m.colour}</span></td>
      <td class="mono">Sz ${m.size||'—'}</td>
      <td>${poolBadge(m.pool)}</td>
      <td style="text-align:right;font-family:'IBM Plex Mono',monospace;font-weight:700;color:${m.qty_delta>0?'var(--green)':'var(--red)'}">${m.qty_delta>0?'+':''}${m.qty_delta}</td>
      <td style="font-size:12px;color:var(--ink2)">${m.reason}</td>
    </tr>`).join('')}</tbody>
  </table></div>`;
}

// ═══════════════════════════════════════════════════════════════════
// PARTIAL DISPATCH FROM INVENTORY
// ═══════════════════════════════════════════════════════════════════
async function openPartialDispatch(articleId, colour, pool) {
  openModal('partial-dispatch-modal');
  document.getElementById('pd-modal-title').textContent = `Dispatch ${articleId} · ${colour} (${pool.toUpperCase()})`;
  document.getElementById('pd-modal-body').innerHTML =
    `<div class="loading"><div class="spinner"></div> Loading pending orders...</div>`;

  window._pdArticle = articleId;
  window._pdColour  = colour;
  window._pdPool    = pool;

  // Get available stock for this article+colour+pool
  const inv = (window._inventoryData || []).filter(i =>
    i.article_id === articleId && i.colour === colour && i.pool === pool
  );
  const stockBySize = {};
  inv.forEach(i => { stockBySize[i.size] = Math.max(0, i.qty_on_hand - i.qty_reserved); });
  const totalAvail = Object.values(stockBySize).reduce((s,v) => s+v, 0);

  // Get pending orders that need this article+colour
  const lines = await DB.getAllOrderLines();
  const pending = lines.filter(l => {
    if (l.article_id !== articleId) return false;
    if ((l.colour||'').trim().toUpperCase() !== colour.trim().toUpperCase()) return false;
    const bal = (l.qty_ordered||0) - (l.qty_dispatched||0);
    if (bal <= 0) return false;
    const ord = l.orders;
    if (!ord) return false;
    if ((ord.pool||'').toLowerCase() !== pool.toLowerCase()) return false;
    return ['pending','in_production','partial','ready'].includes((ord.status||'').toLowerCase());
  });

  if (!pending.length) {
    document.getElementById('pd-modal-body').innerHTML = `
      <div class="success-box">No pending orders need ${articleId} ${colour} from ${pool.toUpperCase()} pool.</div>
      <div style="font-size:13px;color:var(--ink2)">Available stock: <strong>${num(totalAvail)} pairs</strong> across all sizes.</div>`;
    return;
  }

  // Group by order
  const byOrder = {};
  pending.forEach(l => {
    const ord = l.orders;
    const party = ord?.master_parties?.party_name || 'Unknown';
    const oid = l.order_id;
    if (!byOrder[oid]) byOrder[oid] = { order_id:oid, party, pool: ord?.pool, po: ord?.po_number, lines:[] };
    byOrder[oid].lines.push(l);
  });

  const orders = Object.values(byOrder);
  window._pdOrders = orders;
  window._pdStockBySize = stockBySize;

  const sizes = MENS_ARTICLES.includes(articleId) ? MENS_SIZES : WOMENS_SIZES;

  let html = `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px;margin-bottom:16px">
      <div style="background:var(--surface2);border:1px solid var(--line);border-radius:var(--r-sm);padding:12px">
        <div style="font-size:10px;color:var(--ink3);font-family:'IBM Plex Mono',monospace;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;margin-bottom:8px">Available Stock</div>
        ${sizes.map(s => `
          <div style="display:flex;justify-content:space-between;font-size:12px;padding:3px 0;border-bottom:1px solid var(--line)">
            <span style="color:var(--ink2);font-family:'IBM Plex Mono',monospace">Size ${s}</span>
            <span style="font-weight:700;font-family:'IBM Plex Mono',monospace;color:${(stockBySize[s]||0)>0?'var(--green)':'var(--red)'}">${stockBySize[s]||0} pairs</span>
          </div>`).join('')}
        <div style="display:flex;justify-content:space-between;font-size:13px;padding:8px 0 0;font-weight:700">
          <span>Total Available</span>
          <span style="color:var(--blue)">${num(totalAvail)} pairs</span>
        </div>
      </div>
      <div style="background:var(--surface2);border:1px solid var(--line);border-radius:var(--r-sm);padding:12px">
        <div style="font-size:10px;color:var(--ink3);font-family:'IBM Plex Mono',monospace;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;margin-bottom:8px">Dispatch Details</div>
        <div class="form-group" style="margin-bottom:10px">
          <label>Dispatch Date</label>
          <input type="date" id="pd-date" value="${today()}" />
        </div>
        <div class="form-group" style="margin-bottom:10px">
          <label>Transport Details</label>
          <input type="text" id="pd-transport" placeholder="Courier, tracking no." />
        </div>
        <div class="form-group" style="margin-bottom:0">
          <label>Notes</label>
          <input type="text" id="pd-notes" placeholder="Special instructions..." />
        </div>
      </div>
    </div>

    <div style="font-size:10px;color:var(--ink3);font-family:'IBM Plex Mono',monospace;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;margin-bottom:10px">
      Select Order & Enter Qty to Dispatch
    </div>`;

  orders.forEach((o, oi) => {
    const totalBal = o.lines.reduce((s,l) => s+(l.qty_ordered-l.qty_dispatched), 0);
    html += `
      <div style="border:1.5px solid var(--line);border-radius:var(--r);padding:14px;margin-bottom:10px;transition:all 0.12s"
           id="pd-order-${oi}" data-selected="false">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;cursor:pointer" onclick="togglePDOrder(${oi})">
          <div id="pd-cb-${oi}" style="width:20px;height:20px;border-radius:5px;border:2px solid var(--line2);background:white;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:all 0.12s">
            <span id="pd-tick-${oi}" style="display:none;color:white;font-size:12px;font-weight:900;line-height:1">✓</span>
          </div>
          <div style="flex:1">
            <div style="font-weight:700;font-size:14px">${o.party}</div>
            <div style="font-size:11px;color:var(--ink3);margin-top:1px">Order #${o.order_id}${o.po?' · PO: '+o.po:''} · Balance: ${num(totalBal)} pairs</div>
          </div>
          ${poolBadge(o.pool)}
        </div>
        <div id="pd-sizes-${oi}" style="display:none" onclick="event.stopPropagation()">
          <table style="width:100%">
            <thead><tr><th>Size</th><th style="text-align:right">Order Balance</th><th style="text-align:right">Stock Available</th><th style="text-align:right">Dispatch Qty</th></tr></thead>
            <tbody>
              ${o.lines.sort((a,b)=>a.size-b.size).map(l => {
                const bal = l.qty_ordered - l.qty_dispatched;
                const avail = stockBySize[l.size] || 0;
                const suggested = Math.min(bal, avail);
                return `<tr>
                  <td class="mono">Size ${l.size}</td>
                  <td class="mono" style="text-align:right;color:var(--amber)">${bal}</td>
                  <td class="mono" style="text-align:right;color:${avail>0?'var(--green)':'var(--red)'}">${avail}</td>
                  <td style="text-align:right"><input type="number" id="pd-qty-${oi}-${l.id}" min="0" value="${suggested}" style="width:80px;text-align:center;color:#0D1117;font-family:'IBM Plex Mono',monospace" onclick="event.stopPropagation()" oninput="event.stopPropagation();updatePDTotal()" onchange="event.stopPropagation()" /></td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
          <div style="display:flex;justify-content:flex-end;margin-top:8px;font-size:12px;color:var(--ink2)">
            Dispatching: <strong id="pd-order-total-${oi}" style="color:var(--blue);margin-left:6px;font-family:'IBM Plex Mono',monospace">0</strong> pairs
          </div>
        </div>
      </div>`;
  });

  html += `
    <div style="background:var(--surface2);border:1px solid var(--line);border-radius:var(--r-sm);padding:12px;display:flex;justify-content:space-between;align-items:center;margin-top:4px">
      <span style="font-weight:600">Grand Total to Dispatch</span>
      <span id="pd-grand-total" style="font-size:18px;font-weight:800;color:var(--blue);font-family:'IBM Plex Mono',monospace">0 pairs</span>
    </div>`;

  document.getElementById('pd-modal-body').innerHTML = html;
  updatePDTotal();
}

function togglePDOrder(oi) {
  const card = document.getElementById(`pd-order-${oi}`);
  const cb   = document.getElementById(`pd-cb-${oi}`);
  const tick = document.getElementById(`pd-tick-${oi}`);
  const sizes = document.getElementById(`pd-sizes-${oi}`);
  if (!card) return;

  const isSelected = card.dataset.selected === 'true';
  if (!isSelected) {
    card.dataset.selected  = 'true';
    card.style.borderColor = 'var(--blue)';
    card.style.background  = 'rgba(43,91,255,0.03)';
    cb.style.background    = 'var(--blue)';
    cb.style.borderColor   = 'var(--blue)';
    tick.style.display     = 'block';
    sizes.style.display    = 'block';
  } else {
    card.dataset.selected  = 'false';
    card.style.borderColor = 'var(--line)';
    card.style.background  = 'white';
    cb.style.background    = 'white';
    cb.style.borderColor   = 'var(--line2)';
    tick.style.display     = 'none';
    sizes.style.display    = 'none';
  }
  updatePDTotal();
}

function updatePDTotal() {
  const orders = window._pdOrders || [];
  let grand = 0;
  orders.forEach((o, oi) => {
    const card = document.getElementById(`pd-order-${oi}`);
    if (!card || card.dataset.selected !== 'true') return;
    let orderTotal = 0;
    o.lines.forEach(l => {
      orderTotal += parseInt(document.getElementById(`pd-qty-${oi}-${l.id}`)?.value)||0;
    });
    const el = document.getElementById(`pd-order-total-${oi}`);
    if (el) el.textContent = num(orderTotal) + ' pairs';
    grand += orderTotal;
  });
  const el = document.getElementById('pd-grand-total');
  if (el) el.textContent = num(grand) + ' pairs';
}

async function confirmPartialDispatch() {
  const orders = window._pdOrders || [];
  const date      = document.getElementById('pd-date')?.value || today();
  const transport = document.getElementById('pd-transport')?.value || '';
  const notes     = document.getElementById('pd-notes')?.value || '';
  const pool      = window._pdPool;

  const selected = orders.filter((o,oi) => {
    const card = document.getElementById(`pd-order-${oi}`);
    return card?.dataset.selected === 'true';
  });

  if (!selected.length) { showToast('Select at least one order', 'error'); return; }

  let totalDispatched = 0;
  let ordersUpdated   = 0;

  for (let oi = 0; oi < orders.length; oi++) {
    const o = orders[oi];
    const card = document.getElementById(`pd-order-${oi}`);
    if (!card || card.dataset.selected !== 'true') continue;

    const dispatchLines = [];
    for (const l of o.lines) {
      const qty = parseInt(document.getElementById(`pd-qty-${oi}-${l.id}`)?.value)||0;
      if (qty > 0) dispatchLines.push({ order_line_id: l.id, qty_dispatched: qty });
    }
    if (!dispatchLines.length) continue;

    // Create dispatch record
    const { error } = await DB.createDispatch(
      { dispatch_date: date, order_id: o.order_id, packaging_type: pool === 'yoots' ? 'yoots_branded' : 'standard', transport_details: transport, notes },
      dispatchLines
    );
    if (error) { showToast('Error dispatching order #'+o.order_id+': '+error.message, 'error'); continue; }

    // Update each line's qty_dispatched + deduct inventory + log movement
    for (const l of o.lines) {
      const qty = parseInt(document.getElementById(`pd-qty-${oi}-${l.id}`)?.value)||0;
      if (qty <= 0) continue;
      totalDispatched += qty;
      await DB.updateOrderLine(l.id, { qty_dispatched: l.qty_dispatched + qty });
      await DB.upsertInventory(l.article_id, l.colour, l.size, pool, -qty);
      await DB.logStockMovement(l.article_id, l.colour, l.size, pool, -qty, `Partial dispatch → Order #${o.order_id} (${o.party})`, o.order_id);
    }

    // Update order status
    const updatedLines = await DB.getOrderLines(o.order_id);
    const allDone = updatedLines.every(l => l.qty_dispatched >= l.qty_ordered);
    await DB.updateOrder(o.order_id, { status: allDone ? 'completed' : 'partial' });
    ordersUpdated++;
  }

  showToast(`✅ Dispatched ${num(totalDispatched)} pairs across ${ordersUpdated} order${ordersUpdated>1?'s':''}`, 'success');
  closeModal('partial-dispatch-modal');
  renderInventory();
}
