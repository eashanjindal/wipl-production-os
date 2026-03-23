// APP STATE
window._currentRole = null;
window._currentModule = 'dashboard';

// LOGIN
function handleLogin() {
  const role = document.getElementById('login-role').value;
  const pin  = document.getElementById('login-pin').value;

  if (!role) { showToast('Select your role', 'error'); return; }
  if (!ROLES[role]) { showToast('Invalid role', 'error'); return; }
  if (ROLES[role].pin !== pin) { showToast('Incorrect PIN', 'error'); return; }

  window._currentRole = role;
  document.getElementById('login-screen').classList.remove('active');
  document.getElementById('main-app').classList.add('active');

  buildNav(role);
  updateDateBadge();
  navigateTo('dashboard');
  loadAlerts();

  // Load mould config from DB — overrides hardcoded MOULD_MAP in config.js
  loadAppConfigFromDB();
}

function handleLogout() {
  window._currentRole = null;
  document.getElementById('main-app').classList.remove('active');
  document.getElementById('login-screen').classList.add('active');
  document.getElementById('login-pin').value = '';
  document.getElementById('login-role').value = '';
}

// NAV
function buildNav(role) {
  const modules = ROLES[role].modules;
  const nav = document.getElementById('sidebar-nav');
  nav.innerHTML = modules.map(m => `
    <div class="nav-item" id="nav-${m}" onclick="navigateTo('${m}')">
      <span class="nav-icon">${NAV_ITEMS[m].icon}</span>
      <span>${NAV_ITEMS[m].label}</span>
    </div>
  `).join('');

  const badge = document.getElementById('user-badge');
  badge.innerHTML = `
    <div style="font-size:10px;color:var(--ink3);margin-bottom:2px">Logged in as</div>
    <div style="font-weight:600;color:var(--ink)">${ROLES[role].label}</div>
  `;
}

function navigateTo(module) {
  window._currentModule = module;
  // Scroll to top
  document.getElementById('content-area')?.scrollTo({ top: 0, behavior: 'instant' });
  window.scrollTo(0, 0);
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById(`nav-${module}`)?.classList.add('active');
  const _label = NAV_ITEMS[module]?.label || module;
  document.getElementById('page-title').textContent = _label;
  document.title = _label + ' — WIPL Production OS';
  document.getElementById('alerts-panel').classList.add('hidden');

  const renders = {
    dashboard:   renderDashboard,
    orders:      renderOrders,
    inventory:   renderInventory,
    production:  renderProduction,
    rawmaterial: renderRawMaterial,
    dispatch:    renderDispatch,
    masterdata:  renderMasterData
  };

  if (renders[module]) {
    renders[module]();
  } else {
    document.getElementById('content-area').innerHTML = `<div class="empty-state"><div class="empty-icon">🚧</div><p>Module not found</p></div>`;
  }
}

// DATE
function updateDateBadge() {
  const d = new Date();
  document.getElementById('date-badge').textContent = d.toLocaleDateString('en-IN', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric'
  });
}

// ALERTS
async function loadAlerts() {
  const alerts = [];

  try {
    const [rmStock, shifts, articles, overdueOrders, reorderAlerts, pendingParties] = await Promise.all([
      DB.getRMStock(),
      DB.getShifts({ from: today() }),
      DB.getArticles(),
      DB.getOverdueOrders(),
      DB.getInventoryBelowReorder(),
      window._currentRole === 'admin' ? DB.getParties('pending') : Promise.resolve([])
    ]);
    window._articles = articles;

    // Pending party approvals (admin only)
    pendingParties.forEach(p => {
      alerts.unshift({ type:'orange', title:`⏳ Party Request: ${p.party_name}`, body:`${p.pool.toUpperCase()} pool · Submitted by ${p.requested_by||'Sales'} — go to Master Data to approve` });
    });

    // Overdue delivery alerts (highest priority)
    overdueOrders.forEach(o => {
      const daysLate = daysDiff(today(), o.required_delivery_date);
      alerts.push({ type:'red', title:`🚨 Overdue: ${o.master_parties?.party_name} #${o.id}`, body:`${daysLate}d past delivery date (${fmtDate(o.required_delivery_date)})` });
    });

    // Inventory reorder point alerts
    reorderAlerts.slice(0, 5).forEach(a => {
      alerts.push({ type:'orange', title:`⚠ Reorder: ${a.article_id} ${a.colour} Sz${a.size} (${a.pool})`, body:`Available: ${a.available} pairs — below reorder point of ${a.reorder_point}` });
    });

    // RM Critical alerts
    rmStock.forEach(r => {
      if (r.qty_kg < 20) {
        alerts.push({ type: 'red', title: `🚨 Critical: ${r.compound_colour} compound`, body: `Only ${r.qty_kg}kg remaining. Raise PO immediately.` });
      } else if (r.qty_kg < 50) {
        alerts.push({ type: 'orange', title: `⚠ Low: ${r.compound_colour} compound`, body: `${r.qty_kg}kg in stock. Consider raising a PO soon.` });
      }
    });

    // PO deadline alerts for upcoming shifts
    shifts.filter(s => s.status !== 'completed').forEach(s => {
      const deadline = addDays(s.shift_date, -(window._cfg_rm_lead_days || RM_LEAD_DAYS));
      const diff = daysDiff(deadline, today());
      if (diff < 0) {
        alerts.push({ type: 'red', title: `🚨 PO Overdue for shift ${fmtDate(s.shift_date)}`, body: `RM purchase order should have been raised ${Math.abs(diff)} days ago.` });
      } else if (diff <= 3) {
        alerts.push({ type: 'orange', title: `⚠ PO Due Soon: ${fmtDate(s.shift_date)} shift`, body: `Raise RM purchase order within ${diff} day(s).` });
      }
    });

    // Overdue POs — supplier hasn't delivered on expected date
    const rmPOs = await DB.getRMPOs();
    rmPOs.filter(p => ['pending','in_transit'].includes(p.status) && p.expected_arrival < today())
      .forEach(p => {
        const daysLate = daysDiff(today(), p.expected_arrival);
        alerts.push({ type:'red', title:`🚨 PO Overdue: ${p.compound_colour} (${p.qty_kg}kg)`,
          body:`Expected ${fmtDate(p.expected_arrival)} · ${daysLate}d late · ${p.supplier||'Supplier not set'}` });
      });

    // Blocked moulds
    articles.filter(a => a.mould_status !== 'in_production').forEach(a => {
      alerts.push({ type: 'yellow', title: `Mould Blocked: ${a.id}`, body: `Status: ${a.mould_status.replace(/_/g, ' ')}. Cannot be scheduled until available.` });
    });

    // Missing height plates
    articles.filter(a => a.height_plate_required && !a.height_plate_fitted).forEach(a => {
      alerts.push({ type: 'orange', title: `Height Plate Missing: ${a.id}`, body: `${a.height_plate_mm}mm plate required but not yet fitted.` });
    });

  } catch(e) {
    console.error('Alert load error:', e);
  }

  const countEl = document.getElementById('alert-count');
  countEl.textContent = alerts.length;
  countEl.className = `alert-count ${alerts.length === 0 ? 'zero' : ''}`;

  const list = document.getElementById('alerts-list');
  list.innerHTML = alerts.length
    ? alerts.map(a => `
        <div class="alert-item ${a.type}">
          <div class="alert-title">${a.title}</div>
          <div class="alert-body">${a.body}</div>
        </div>`).join('')
    : '<p style="color:var(--ink3);font-size:13px">No active alerts — all clear ✅</p>';
}

async function loadAppConfigFromDB() {
  try {
    const [moulds, colours, articles, appConfig] = await Promise.all([
      DB.getMoulds(),
      DB.getDistinctColours(),
      DB.getArticles(),
      DB.getAppConfig(),
    ]);

    // ── 1. MOULD_MAP from master_moulds ─────────────────────────────────────
    if (moulds.length) {
      const newMap = {};
      moulds.forEach(m => {
        if (!newMap[m.article_id]) newMap[m.article_id] = [];
        newMap[m.article_id].push({ mould: m.mould_num, sizes: [m.size_1, m.size_2] });
      });
      Object.keys(newMap).forEach(k => {
        newMap[k].sort((a,b) => a.mould - b.mould);
        MOULD_MAP[k] = newMap[k];
      });
    }

    // ── 2. COLOUR_HEX from master_colours.hex_colour ─────────────────────────
    if (colours.length) {
      colours.forEach(c => {
        if (c.colour_name && c.hex_colour) COLOUR_HEX[c.colour_name] = c.hex_colour;
      });
    }

    // ── 3. Article sizes from master_articles.sizes ──────────────────────────
    if (articles.length) {
      // Rebuild MENS/WOMENS article arrays and size arrays from DB
      const newMensArticles   = [];
      const newWomensArticles = [];
      const mensSizesSet      = new Set();
      const womensSizesSet    = new Set();
      articles.forEach(a => {
        if (a.size_category === 'womens') {
          newWomensArticles.push(a.id);
          (a.sizes || WOMENS_SIZES).forEach(s => womensSizesSet.add(s));
        } else {
          newMensArticles.push(a.id);
          (a.sizes || MENS_SIZES).forEach(s => mensSizesSet.add(s));
        }
      });
      // Override global arrays
      if (newMensArticles.length)   { MENS_ARTICLES.length   = 0; newMensArticles.forEach(x   => MENS_ARTICLES.push(x)); }
      if (newWomensArticles.length) { WOMENS_ARTICLES.length = 0; newWomensArticles.forEach(x => WOMENS_ARTICLES.push(x)); }
      if (mensSizesSet.size)   { MENS_SIZES.length   = 0; [...mensSizesSet].sort((a,b)=>a-b).forEach(x   => MENS_SIZES.push(x)); }
      if (womensSizesSet.size) { WOMENS_SIZES.length = 0; [...womensSizesSet].sort((a,b)=>a-b).forEach(x => WOMENS_SIZES.push(x)); }
    }

    // ── 4. Operational constants from app_config ─────────────────────────────
    if (appConfig.length) {
      const cfg = {};
      appConfig.forEach(c => { cfg[c.key] = c.value; });
      // Override globals — these are declared as const in config.js so we
      // store on window and modules read window.* with fallback to const
      window._cfg_shots_per_shift        = parseInt(cfg.shots_per_shift)        || SHOTS_PER_SHIFT;
      window._cfg_rm_lead_days           = parseInt(cfg.rm_lead_days)           || RM_LEAD_DAYS;
      window._cfg_max_articles_per_shift = parseInt(cfg.max_articles_per_shift) || MAX_ARTICLES_PER_SHIFT;
      window._cfg_total_mould_slots      = parseInt(cfg.total_mould_slots)      || TOTAL_MOULD_SLOTS;
      window._cfg_moulds_per_article     = parseInt(cfg.moulds_per_article)     || MOULDS_PER_ARTICLE;
      window._cfg_sizes_per_mould        = parseInt(cfg.sizes_per_mould)        || SIZES_PER_MOULD;
    }

    console.log('✅ App config loaded from DB');
  } catch(e) {
    console.warn('Could not load app config from DB — using config.js fallback:', e.message);
  }
}

function toggleAlerts() {
  document.getElementById('alerts-panel').classList.toggle('hidden');
}

// Escape closes modals
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    const openModal = document.querySelector('.modal-overlay:not(.hidden)');
    if (openModal) {
      openModal.classList.add('hidden');
      return;
    }
    // Also close alerts panel
    document.getElementById('alerts-panel')?.classList.add('hidden');
  }
});

// Alerts panel closes on outside click
document.addEventListener('click', e => {
  const panel = document.getElementById('alerts-panel');
  const bell  = document.getElementById('alert-bell');
  if (panel && !panel.classList.contains('hidden') &&
      !panel.contains(e.target) && !bell?.contains(e.target)) {
    panel.classList.add('hidden');
  }
});

// Enter key on PIN input
document.addEventListener('DOMContentLoaded', () => {
  const pinInput = document.getElementById('login-pin');
  if (pinInput) {
    pinInput.addEventListener('keypress', e => {
      if (e.key === 'Enter') handleLogin();
    });
  }
});

// Refresh alerts every 5 minutes
setInterval(() => {
  if (window._currentRole) loadAlerts();
}, 5 * 60 * 1000);

// Auto-refresh dashboard every 2 minutes when on dashboard
setInterval(() => {
  if (window._currentRole && window._currentModule === 'dashboard') {
    renderDashboard();
  }
}, 2 * 60 * 1000);
