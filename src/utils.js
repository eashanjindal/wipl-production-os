
// ══════════════════════════════════════════════════════════════════════════════
// ERROR HANDLING & STRUCTURED LOGGING
// ══════════════════════════════════════════════════════════════════════════════

const LOG_LEVEL = 'debug'; // 'debug' | 'info' | 'warn' | 'error'

function log(level, module, message, data = null) {
  const levels = { debug:0, info:1, warn:2, error:3 };
  if (levels[level] < levels[LOG_LEVEL]) return;
  const prefix = `[WIPL:${module}]`;
  const style  = { debug:'color:#888', info:'color:#2B5BFF', warn:'color:#B45309', error:'color:#DC2626' };
  if (data) console[level === 'error' ? 'error' : 'log'](`%c${prefix} ${message}`, style[level], data);
  else      console[level === 'error' ? 'error' : 'log'](`%c${prefix} ${message}`, style[level]);
}

// Wrap async operations with consistent error handling
// Usage: const result = await safe('Orders', () => DB.getOrders());
async function safe(module, fn, fallback = null) {
  try {
    return await fn();
  } catch(e) {
    log('error', module, `Unhandled error: ${e.message}`, e);
    showToast(`Error in ${module}: ${e.message}`, 'error');
    return fallback;
  }
}

// Wrap DB operations — returns { data, error } consistently
// Usage: const { data, error } = await dbOp('Orders', () => DB.getOrders());
async function dbOp(module, fn) {
  try {
    const result = await fn();
    if (result && result.error) {
      log('error', module, `DB error: ${result.error.message}`, result.error);
    }
    return result || { data: null, error: null };
  } catch(e) {
    log('error', module, `DB exception: ${e.message}`, e);
    return { data: null, error: { message: e.message } };
  }
}

// Global unhandled promise rejection catcher
window.addEventListener('unhandledrejection', e => {
  log('error', 'Global', `Unhandled promise rejection: ${e.reason?.message || e.reason}`, e.reason);
  // Don't show toast for every unhandled rejection — just log
});

// TOAST
const toastContainer = document.createElement('div');
toastContainer.id = 'toast';
document.body.appendChild(toastContainer);

function showToast(msg, type = 'info') {
  const t = document.createElement('div');
  t.className = `toast-item ${type}`;
  t.textContent = msg;
  toastContainer.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}

// DATE
function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}
function fmtDateInput(d) {
  if (!d) return '';
  return new Date(d).toISOString().split('T')[0];
}
function today() { return new Date().toISOString().split('T')[0]; }
function addDays(dateStr, days) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}
function daysDiff(a, b) {
  return Math.round((new Date(a) - new Date(b)) / 86400000);
}

// STATUS BADGE
function statusBadge(status) {
  const map = {
    pending: 'pending', partial: 'partial', in_production: 'in-production',
    ready: 'ready', dispatched: 'dispatched', completed: 'completed',
    planned: 'pending', in_progress: 'in-production', available: 'available',
    in_coating: 'in_coating', in_production_mould: 'available'
  };
  const label = status?.replace(/_/g,' ') || status;
  return `<span class="badge ${map[status] || ''}">${label}</span>`;
}

function poolBadge(pool) {
  return `<span class="badge ${pool}">${pool === 'yoots' ? 'YOOTS' : 'GENERAL'}</span>`;
}

// COLOUR DOT
function colourDot(colour) {
  const hex = COLOUR_HEX[colour] || '#888';
  return `<span class="colour-dot" style="background:${hex}"></span>${colour}`;
}

// NUMBER
function num(n) { return (n || 0).toLocaleString('en-IN'); }

// COMPOUND CALCULATION
function calcCompoundKg(articleId, qty) {
  const articles = window._articles || [];
  const art = articles.find(a => a.id === articleId);
  if (!art || !art.compound_per_pair_g) return 0;
  return (art.compound_per_pair_g * qty) / 1000;
}

// MAX CAPACITY per shift for an article
function shiftCapacity(numMoulds, colourMode) {
  // each mould = 2 sizes, shots = 60, capacity split by colour mode
  // numMoulds moulds × 60 shots × 1 pair per size per shot = numMoulds × 60 pairs
  // but split by colour mode
  const pairsPerColour = numMoulds * SHOTS_PER_SHIFT; // per colour
  return colourMode === 'single' ? pairsPerColour * 2 : pairsPerColour;
}

// ESTIMATE DISPATCH DATE based on current queue
function estimateDispatchDate(shiftsNeeded) {
  const baseDate = new Date();
  baseDate.setDate(baseDate.getDate() + shiftsNeeded + 1);
  return baseDate.toISOString().split('T')[0];
}

// MODAL HELPERS
function openModal(id) { document.getElementById(id)?.classList.remove('hidden'); }
function closeModal(id) { document.getElementById(id)?.classList.add('hidden'); }

// RENDER HELPERS
function loading() { return `<div class="loading"><div class="spinner"></div> Loading...</div>`; }
function emptyState(icon, msg) { return `<div class="empty-state"><div class="empty-icon">${icon}</div><p>${msg}</p></div>`; }

// SIZE QTY INPUT GRID
function sizeQtyGrid(articleId, prefix = 'qty', existing = {}) {
  const sizes = getSizesForArticle(articleId);
  const cls = MENS_ARTICLES.includes(articleId) ? 'mens' : 'womens';
  return `
    <div class="size-grid ${cls}">
      ${sizes.map(s => `
        <div class="size-input-group">
          <div class="size-label">Size ${s}</div>
          <input type="number" class="size-input" id="${prefix}_${s}" min="0" value="${existing[s] || ''}" placeholder="0" />
        </div>
      `).join('')}
    </div>`;
}

// READ SIZE QTY from form
function readSizeQty(articleId, prefix = 'qty') {
  const sizes = getSizesForArticle(articleId);
  const result = {};
  let total = 0;
  sizes.forEach(s => {
    const v = parseInt(document.getElementById(`${prefix}_${s}`)?.value) || 0;
    result[s] = v;
    total += v;
  });
  return { sizes: result, total };
}

// APP CONFIG GETTERS — read from DB-loaded values, fall back to config.js constants
function cfg(key) {
  const map = {
    shots:      () => window._cfg_shots_per_shift        || SHOTS_PER_SHIFT,
    rmLead:     () => window._cfg_rm_lead_days           || RM_LEAD_DAYS,
    maxArticles:() => window._cfg_max_articles_per_shift || MAX_ARTICLES_PER_SHIFT,
    mouldSlots: () => window._cfg_total_mould_slots      || TOTAL_MOULD_SLOTS,
    mouldsPerArt:()=> window._cfg_moulds_per_article     || MOULDS_PER_ARTICLE,
    sizesPerMould:()=> window._cfg_sizes_per_mould       || SIZES_PER_MOULD,
  };
  return map[key] ? map[key]() : null;
}

// ARTICLE SIZE LOOKUP — reads from DB-loaded arrays, fallback to config.js
function getSizesForArticle(articleId) {
  // First check if master_articles data has sizes for this article
  const art = (window._articles || []).find(a => a.id === articleId);
  if (art && art.sizes && art.sizes.length) return art.sizes;
  // Fall back to global arrays (populated from DB on login, or config.js hardcoded)
  return MENS_ARTICLES.includes(articleId) ? MENS_SIZES : WOMENS_SIZES;
}

// CONFIRMATION
function confirmAction(msg) { return window.confirm(msg); }
