async function renderMasterData() {
  const area = document.getElementById('content-area');
  area.innerHTML = loading();

  const [articles, parties, pendingParties, moulds] = await Promise.all([DB.getArticles(), DB.getParties('active'), DB.getParties('pending'), DB.getMoulds()]);
  window._moulds = moulds;
  window._articles       = articles;
  window._parties        = parties;
  window._pendingParties = pendingParties;

  area.innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-header-title">Master Data</div>
        <div class="page-header-sub">Articles, moulds, parties & system config</div>
      </div>
    </div>

    <div class="tabs">
      <button class="tab active" onclick="showMDTab(this,'articles')">Articles</button>
      <button class="tab" onclick="showMDTab(this,'moulds')">Moulds</button>
      <button class="tab" onclick="showMDTab(this,'parties')">Parties</button>
      <button class="tab" onclick="showMDTab(this,'machine')">Machine Config</button>
    </div>

    <div id="md-content">
      ${renderArticlesTab(articles)}
    </div>

    <!-- EDIT ARTICLE MODAL -->
    <div id="edit-article-modal" class="modal-overlay hidden">
      <div class="modal">
        <div class="modal-header">
          <div class="modal-title" id="edit-article-title">Edit Article</div>
          <button class="modal-close" onclick="closeModal('edit-article-modal')">×</button>
        </div>
        <div class="modal-body" id="edit-article-body"></div>
        <div class="modal-footer">
          <button class="btn-secondary" onclick="closeModal('edit-article-modal')">Cancel</button>
          <button class="btn-primary" onclick="saveArticleEdit()">Save Changes</button>
        </div>
      </div>
    </div>

    <!-- ADD PARTY MODAL -->
    <div id="add-party-modal" class="modal-overlay hidden">
      <div class="modal">
        <div class="modal-header">
          <div class="modal-title">Add Party</div>
          <button class="modal-close" onclick="closeModal('add-party-modal')">×</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>Party Name</label>
            <input type="text" id="new-party-name" placeholder="e.g. NEW BRAND" />
          </div>
          <div class="form-group">
            <label>Pool</label>
            <select id="new-party-pool">
              <option value="general">General</option>
              <option value="yoots">YOOTS</option>
            </select>
          </div>
          <div class="form-group">
            <label>Contact Name (optional)</label>
            <input type="text" id="new-party-contact" />
          </div>
          <div class="form-group">
            <label>Phone (optional)</label>
            <input type="text" id="new-party-phone" />
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" onclick="closeModal('add-party-modal')">Cancel</button>
          <button class="btn-primary" onclick="saveNewParty()">Add Party</button>
        </div>
      </div>
    </div>
  `;
}

function renderArticlesTab(articles) {
  return `
    <div class="card">
      <div class="card-title">Articles & Mould Status</div>
      <table>
        <thead>
          <tr>
            <th>Article</th><th>Size Range</th><th>Compound/Pair</th>
            <th>Mould Status</th><th>Height Plate</th><th>Notes</th><th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${articles.map(a => `
            <tr>
              <td class="mono" style="font-weight:700">${a.id}</td>
              <td class="mono">${a.size_range}</td>
              <td class="mono">${a.compound_per_pair_g ? a.compound_per_pair_g + 'g' : '⚠ Not set'}</td>
              <td>
                <span class="badge ${a.mould_status === 'in_production' ? 'available' : 'in_coating'}">
                  ${a.mould_status.replace('_',' ')}
                </span>
              </td>
              <td>
                ${a.height_plate_required
                  ? `<span class="badge ${a.height_plate_fitted ? 'ready' : 'low'}">${a.height_plate_mm}mm ${a.height_plate_fitted ? '✓ Fitted' : '✗ Not fitted'}</span>`
                  : '<span style="color:var(--ink3)">—</span>'}
              </td>
              <td style="font-size:12px;color:var(--ink3)">${a.notes || '—'}</td>
              <td><button class="btn-secondary btn-sm" onclick="editArticle('${a.id}')">Edit</button></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>

    <div class="card" style="margin-top:20px">
      <div class="card-title">Machine Configuration</div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:20px">
        <div class="stat-card blue">
          <div class="stat-label">Stations</div>
          <div class="stat-value">${STATIONS}</div>
        </div>
        <div class="stat-card yellow">
          <div class="stat-label">Total Mould Slots</div>
          <div class="stat-value">${cfg('mouldSlots')}</div>
        </div>
        <div class="stat-card green">
          <div class="stat-label">Shots/Shift</div>
          <div class="stat-value">${cfg('shots')}</div>
        </div>
        <div class="stat-card orange">
          <div class="stat-label">Max Pairs (Single)</div>
          <div class="stat-value">1,440</div>
        </div>
        <div class="stat-card purple">
          <div class="stat-label">Max Pairs (Dual)</div>
          <div class="stat-value">720+720</div>
        </div>
        <div class="stat-card blue">
          <div class="stat-label">RM Lead Time</div>
          <div class="stat-value">${cfg('rmLead')}d</div>
        </div>
      </div>
    </div>
  `;
}

function renderPartiesTab(parties, pendingParties=[]) {
  return `
    ${pendingParties.length > 0 ? `
      <div style="background:var(--amber-bg);border:1px solid var(--amber-line);border-radius:var(--r);padding:16px 20px;margin-bottom:20px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
          <div style="font-weight:700;font-size:14px;color:var(--amber)">
            ⏳ ${pendingParties.length} Party Request${pendingParties.length>1?'s':''} Awaiting Approval
          </div>
          <span style="font-size:11px;color:var(--ink3)">Submitted by Sales — approve or reject below</span>
        </div>
        ${pendingParties.map(p => `
          <div style="background:white;border:1px solid var(--line);border-radius:var(--r-sm);padding:12px 14px;margin-bottom:8px;display:flex;align-items:center;gap:12px;flex-wrap:wrap">
            <div style="flex:1;min-width:200px">
              <div style="font-weight:700;font-size:14px">${p.party_name}</div>
              <div style="font-size:11px;color:var(--ink3);margin-top:3px;display:flex;gap:10px;flex-wrap:wrap">
                ${poolBadge(p.pool)}
                ${p.contact_name ? `<span>👤 ${p.contact_name}</span>` : ''}
                ${p.contact_phone ? `<span>📞 ${p.contact_phone}</span>` : ''}
                ${p.notes ? `<span style="color:var(--amber)">📝 ${p.notes}</span>` : ''}
              </div>
            </div>
            <div style="display:flex;gap:8px;flex-shrink:0">
              <button class="btn-primary btn-sm" onclick="approveParty(${p.id},'${p.party_name}')">✓ Approve</button>
              <button class="btn-danger btn-sm" onclick="rejectParty(${p.id},'${p.party_name}')">✕ Reject</button>
            </div>
          </div>`).join('')}
      </div>` : ''}

    <div class="card">
      <div class="section-header" style="margin-bottom:16px">
        <div class="section-title">Active Parties</div>
        <button class="btn-primary btn-sm" onclick="openModal('add-party-modal')">+ Add Party</button>
      </div>
      <table>
        <thead><tr><th>Party Name</th><th>Pool</th><th>Contact</th><th>Phone</th><th></th></tr></thead>
        <tbody>
          ${parties.map(p => `
            <tr>
              <td style="font-weight:500">${p.party_name}</td>
              <td>${poolBadge(p.pool)}</td>
              <td style="color:var(--ink2)">${p.contact_name || '—'}</td>
              <td class="mono">${p.contact_phone || '—'}</td>
              <td><button class="btn-danger btn-sm" onclick="archiveParty(${p.id},'${p.party_name}')">Archive</button></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function showMDTab(btn, tab) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  if (tab === 'articles') document.getElementById('md-content').innerHTML = renderArticlesTab(window._articles || []);
  else if (tab === 'moulds')  document.getElementById('md-content').innerHTML = renderMouldsTab(window._moulds || []);
  else if (tab === 'parties') document.getElementById('md-content').innerHTML = renderPartiesTab(window._parties || [], window._pendingParties || []);
  else if (tab === 'machine') document.getElementById('md-content').innerHTML = renderMachineConfig();
}

function renderMachineConfig() {
  const articles = window._articles || [];
  return `
    <div class="card">
      <div class="card-title">Shift Capacity Calculator</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(380px,1fr));gap:20px">
        <div>
          <div class="form-group">
            <label>Articles to Load</label>
            <div style="display:flex;flex-direction:column;gap:8px">
              ${articles.filter(a => a.mould_status === 'in_production').map(a => `
                <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
                  <input type="checkbox" id="calc-art-${a.id}" onchange="calcCapacity()" />
                  <span class="mono">${a.id}</span>
                </label>
              `).join('')}
            </div>
          </div>
          <div class="form-group">
            <label>Colour Mode</label>
            <select id="calc-mode" onchange="calcCapacity()">
              <option value="dual">Dual Colour</option>
              <option value="single">Single Colour</option>
            </select>
          </div>
        </div>
        <div id="calc-result" class="card" style="background:var(--surface2)">
          <p style="color:var(--ink3)">Select articles to calculate capacity</p>
        </div>
      </div>
    </div>
  `;
}

function calcCapacity() {
  const checked = Array.from(document.querySelectorAll('[id^="calc-art-"]:checked'));
  const mode = document.getElementById('calc-mode')?.value;
  const result = document.getElementById('calc-result');
  if (!checked.length) { result.innerHTML = '<p style="color:var(--ink3)">Select articles to calculate capacity</p>'; return; }

  const numArticles = checked.length;
  // Mould slots = sum of actual moulds per selected article (not fixed 3)
  const mouldSlots = articles.reduce((s,a) => s + (MOULD_MAP[a.id]||[]).length, 0);
  const pairsPerMouldPerColour = cfg('shots') * cfg('sizesPerMould');
  const pairsPerColour = pairsPerMouldPerColour * mouldSlots;
  const total = mode === 'single' ? pairsPerColour : pairsPerColour; // same formula, dual just splits across 2

  result.innerHTML = `
    <div style="font-family:'Syne',sans-serif;font-size:28px;font-weight:800;color:var(--blue);margin-bottom:8px">
      ${mode === 'single' ? num(pairsPerColour * 2) : num(pairsPerColour) + '+' + num(pairsPerColour)}
    </div>
    <div style="font-size:13px;color:var(--ink2)">pairs per shift</div>
    <div class="divider"></div>
    <div style="font-size:12px;color:var(--ink3);line-height:1.8">
      ${numArticles} articles · ${mouldSlots} total mould slots<br/>
      ${mouldSlots} slots × ${cfg('shots')} shots × ${cfg('sizesPerMould')} sizes = ${num(pairsPerColour)} pairs${mode === 'dual' ? ' per colour' : ' total'}<br/>
      Remaining slots: ${cfg('mouldSlots') - mouldSlots} / 12
    </div>
  `;
}

function editArticle(articleId) {
  const art = (window._articles || []).find(a => a.id === articleId);
  if (!art) return;
  window._editArticleId = articleId;

  document.getElementById('edit-article-title').textContent = `Edit ${articleId}`;
  document.getElementById('edit-article-body').innerHTML = `
    <div class="form-group">
      <label>Mould Status</label>
      <select id="ea-status">
        <option value="in_production" ${art.mould_status === 'in_production' ? 'selected' : ''}>In Production (Available)</option>
        <option value="in_coating" ${art.mould_status === 'in_coating' ? 'selected' : ''}>In Coating (Blocked)</option>
      </select>
    </div>
    <div class="form-group">
      <label>Compound per Pair (grams)</label>
      <input type="number" id="ea-compound" value="${art.compound_per_pair_g}" step="0.5" />
    </div>
    <div class="form-row cols-2">
      <div class="form-group">
        <label>Height Plate Required</label>
        <select id="ea-plate-req">
          <option value="false" ${!art.height_plate_required ? 'selected' : ''}>No</option>
          <option value="true" ${art.height_plate_required ? 'selected' : ''}>Yes</option>
        </select>
      </div>
      <div class="form-group">
        <label>Plate Fitted</label>
        <select id="ea-plate-fit">
          <option value="false" ${!art.height_plate_fitted ? 'selected' : ''}>Not Fitted</option>
          <option value="true" ${art.height_plate_fitted ? 'selected' : ''}>Fitted ✓</option>
        </select>
      </div>
    </div>
    <div class="form-group">
      <label>Notes</label>
      <input type="text" id="ea-notes" value="${art.notes || ''}" />
    </div>
  `;
  openModal('edit-article-modal');
}

async function saveArticleEdit() {
  const articleId = window._editArticleId;
  const updates = {
    mould_status: document.getElementById('ea-status').value,
    compound_per_pair_g: parseFloat(document.getElementById('ea-compound').value),
    height_plate_required: document.getElementById('ea-plate-req').value === 'true',
    height_plate_fitted: document.getElementById('ea-plate-fit').value === 'true',
    notes: document.getElementById('ea-notes').value
  };
  const { error } = await DB.updateArticle(articleId, updates);
  if (error) { showToast('Error: ' + error.message, 'error'); return; }
  showToast(`${articleId} updated`, 'success');
  closeModal('edit-article-modal');
  renderMasterData();
}

async function saveNewParty() {
  const name  = document.getElementById('new-party-name').value.trim().toUpperCase();
  const pool  = document.getElementById('new-party-pool').value;
  const contact = document.getElementById('new-party-contact').value;
  const phone = document.getElementById('new-party-phone').value;
  if (!name) { showToast('Enter party name', 'error'); return; }
  const { error } = await DB.addParty({ party_name: name, pool, contact_name: contact, contact_phone: phone });
  if (error) { showToast('Error: ' + error.message, 'error'); return; }
  showToast(`${name} added`, 'success');
  closeModal('add-party-modal');
  renderMasterData();
}

// ── PARTY APPROVAL ────────────────────────────────────────────────────────────
async function approveParty(id, name) {
  const { error } = await DB.approveParty(id);
  if (error) {
    showToast('❌ ' + error.message, 'error');
    return;
  }
  showToast(`✅ ${name} approved — now available for orders`, 'success');
  await refreshPartiesPanel();
}

async function rejectParty(id, name) {
  const reason = prompt(`Reason for rejecting "${name}" (optional):`);
  if (reason === null) return;
  const { error } = await DB.rejectParty(id, reason || '');
  if (error) {
    showToast('❌ ' + error.message, 'error');
    return;
  }
  showToast(`${name} rejected`, 'info');
  await refreshPartiesPanel();
}

function renderMDPartiesPanel() {
  const el = document.getElementById('md-content');
  if (el) el.innerHTML = renderPartiesTab(window._parties || [], window._pendingParties || []);
}

async function refreshPartiesPanel() {
  const [parties, pending] = await Promise.all([
    DB.getParties('active'),
    DB.getParties('pending')
  ]);
  window._parties        = parties;
  window._pendingParties = pending;
  renderMDPartiesPanel();
}

// ── ARCHIVE PARTY ──────────────────────────────────────────────────────────
async function archiveParty(id, name) {
  if (!confirmAction(`Archive "${name}"? They will no longer appear in order dropdowns. Can be restored from Supabase if needed.`)) return;
  const { error } = await DB.approveParty(id); // reuse update mechanism
  // Actually set to 'archived' status
  const { error: e2 } = await DB.updateParty(id, { status: 'rejected' });
  if (e2) { showToast('Error: ' + e2.message, 'error'); return; }
  showToast(`${name} archived — no longer selectable in orders`, 'info');
  window._parties = (window._parties||[]).filter(p => p.id !== id);
  renderMDPartiesPanel();
}

// ── ADD COLOUR ─────────────────────────────────────────────────────────────
function openAddColourModal() {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.id = 'add-colour-modal';
  const articles = window._articles || [];
  modal.innerHTML = `
    <div class="modal" style="max-width:460px">
      <div class="modal-header">
        <div class="modal-title">Add New Colour</div>
        <button class="modal-close" onclick="document.getElementById('add-colour-modal').remove()">×</button>
      </div>
      <div class="modal-body">
        <div class="info-box" style="background:var(--blue-soft);border:1px solid var(--blue-mid);border-radius:var(--r-sm);padding:10px 14px;margin-bottom:14px;font-size:12px;color:var(--ink2)">
          ℹ Adding a colour here makes it available in orders and production for the selected articles. You also need to add RM stock for the new colour in Raw Material.
        </div>
        <div class="form-group">
          <label>Colour Name *</label>
          <input type="text" id="ac-name" placeholder="e.g. MAROON" style="text-transform:uppercase" />
        </div>
        <div class="form-group">
          <label>Hex Colour (for dots) *</label>
          <div style="display:flex;gap:8px;align-items:center">
            <input type="text" id="ac-hex" placeholder="#8B1A1A" style="flex:1" oninput="updateColourPreview()" />
            <input type="color" id="ac-hex-picker" style="width:40px;height:38px;padding:2px;cursor:pointer" onchange="document.getElementById('ac-hex').value=this.value;updateColourPreview()" />
            <span id="ac-preview" style="width:24px;height:24px;border-radius:50%;border:1px solid var(--line);display:inline-block;flex-shrink:0"></span>
          </div>
        </div>
        <div class="form-group" style="margin-bottom:0">
          <label>Add to Articles *</label>
          <div style="display:flex;flex-direction:column;gap:5px;margin-top:4px">
            ${articles.map(a => `
              <label style="display:flex;align-items:center;gap:8px;font-weight:400;cursor:pointer">
                <input type="checkbox" id="ac-art-${a.id}" value="${a.id}" style="width:auto" />
                ${a.id} (Sz ${a.size_range})
              </label>`).join('')}
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" onclick="document.getElementById('add-colour-modal').remove()">Cancel</button>
        <button class="btn-primary" onclick="saveNewColour()">Add Colour</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  setTimeout(() => document.getElementById('ac-name')?.focus(), 100);
}

function updateColourPreview() {
  const hex = document.getElementById('ac-hex')?.value;
  const preview = document.getElementById('ac-preview');
  if (preview && hex) preview.style.background = hex;
}

async function saveNewColour() {
  const name = (document.getElementById('ac-name')?.value||'').trim().toUpperCase();
  const hex  = (document.getElementById('ac-hex')?.value||'').trim();
  if (!name) { showToast('Enter colour name', 'error'); return; }
  if (!hex || !hex.match(/^#[0-9A-Fa-f]{3,6}$/)) { showToast('Enter a valid hex colour (e.g. #8B1A1A)', 'error'); return; }

  // Get selected articles
  const articles = (window._articles||[]).filter(a =>
    document.getElementById(`ac-art-${a.id}`)?.checked
  );
  if (!articles.length) { showToast('Select at least one article', 'error'); return; }

  // Add to master_colours for each selected article
  let errors = 0;
  for (const art of articles) {
    const { error } = await DB.addColour(art.id, name);
    if (error && !error.message?.includes('duplicate')) errors++;
  }

  if (errors) { showToast('Some articles failed — colour may already exist', 'error'); return; }

  // Update COLOUR_HEX in memory (survives until page reload)
  if (typeof COLOUR_HEX === 'object') COLOUR_HEX[name] = hex;

  showToast(`✅ ${name} added — also add RM stock in Raw Material module`, 'success');
  document.getElementById('add-colour-modal')?.remove();
  // Reload master data to reflect change
  renderMasterData();
}

// ── MOULDS TAB ────────────────────────────────────────────────────────────────
function renderMouldsTab(moulds) {
  const articles = window._articles || [];
  // Group moulds by article
  const byArticle = {};
  articles.forEach(a => { byArticle[a.id] = []; });
  moulds.forEach(m => {
    if (!byArticle[m.article_id]) byArticle[m.article_id] = [];
    byArticle[m.article_id].push(m);
  });

  return `
    <div class="card">
      <div class="section-header" style="margin-bottom:16px">
        <div class="section-title">Mould Configuration</div>
        <span style="font-size:12px;color:var(--ink3)">Each mould produces 2 sizes per shot · Admin editable</span>
      </div>
      <div class="info-box" style="background:var(--blue-soft);border:1px solid var(--blue-mid);border-radius:var(--r-sm);padding:10px 14px;margin-bottom:16px;font-size:12px;color:var(--ink2)">
        ℹ Changes here update the database immediately and affect the production shift planner, capacity calculations, and operator job cards.
      </div>
      ${articles.map(a => {
        const aMoulds = (byArticle[a.id] || []).sort((x,y) => x.mould_number - y.mould_number);
        return `
          <div style="margin-bottom:20px;border:1px solid var(--line);border-radius:var(--r-sm);overflow:hidden">
            <div style="background:var(--surface2);padding:10px 14px;display:flex;align-items:center;gap:10px">
              <span style="font-weight:800;font-family:'IBM Plex Mono',monospace">${a.id}</span>
              <span style="font-size:12px;color:var(--ink3)">Size range: ${a.size_range}</span>
              <span style="font-size:11px;color:var(--ink3);margin-left:auto">${a.compound_per_pair_g}g/pair</span>
            </div>
            <table style="width:100%">
              <thead><tr style="background:var(--surface2);border-top:1px solid var(--line)">
                <th>Mould</th><th style="text-align:center">Size 1</th><th style="text-align:center">Size 2</th><th style="text-align:center">Label</th><th></th>
              </tr></thead>
              <tbody>
                ${aMoulds.map(m => `
                  <tr id="mould-row-${m.id}">
                    <td style="font-weight:700;font-family:'IBM Plex Mono',monospace">M${m.mould_num}</td>
                    <td style="text-align:center">
                      <input type="number" id="ms1-${m.id}" value="${m.size_1}" min="1" max="15"
                        style="width:60px;text-align:center" />
                    </td>
                    <td style="text-align:center">
                      <input type="number" id="ms2-${m.id}" value="${m.size_2}" min="1" max="15"
                        style="width:60px;text-align:center" />
                    </td>
                    <td style="text-align:center;font-size:12px;color:var(--ink3)" id="mould-label-${m.id}">
                      Sz ${m.size_1} + Sz ${m.size_2}
                    </td>
                    <td style="display:flex;gap:4px">
                      <button class="btn-primary btn-sm" onclick="saveMouldRow(${m.id})">Save</button>
                      <button class="btn-danger btn-sm" onclick="deleteMouldRow(${m.id},'${a.id}',${m.mould_num})">✕</button>
                    </td>
                  </tr>`).join('')}
              </tbody>
            </table>
            <div style="padding:8px 12px;border-top:1px solid var(--line)">
              <button class="btn-secondary btn-sm" onclick="addMouldRow('${a.id}')">+ Add Mould</button>
            </div>
          </div>`;
      }).join('')}
    </div>`;
}

async function saveMouldRow(mouldId) {
  const s1 = parseInt(document.getElementById(`ms1-${mouldId}`)?.value);
  const s2 = parseInt(document.getElementById(`ms2-${mouldId}`)?.value);
  if (isNaN(s1) || isNaN(s2) || s1 < 1 || s2 < 1) {
    showToast('Enter valid size numbers', 'error'); return;
  }
  if (s1 === s2) { showToast('Size 1 and Size 2 cannot be the same', 'error'); return; }

  const { error } = await DB.updateMould(mouldId, { size_1: s1, size_2: s2 });
  if (error) { showToast('Error: ' + error.message, 'error'); return; }

  showToast(`Mould updated — Sz${s1} + Sz${s2}`, 'success');

  // Update label in row immediately
  const row = document.getElementById(`mould-row-${mouldId}`);
  if (row) {
    const labelCell = row.querySelectorAll('td')[3];
    if (labelCell) labelCell.textContent = `Sz ${s1} + Sz ${s2}`;
  }

  // Reload MOULD_MAP from DB so rest of app uses new config immediately
  const moulds = await DB.getMoulds();
  window._moulds = moulds;
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

// ── ADD / DELETE MOULD ────────────────────────────────────────────────────────
async function addMouldRow(articleId) {
  const existing = (window._moulds||[]).filter(m => m.article_id === articleId);
  const nextNum  = existing.length ? Math.max(...existing.map(m => m.mould_num)) + 1 : 1;

  const s1 = prompt(`New mould M${nextNum} for ${articleId} — Size 1:`, '');
  if (!s1) return;
  const s2 = prompt(`New mould M${nextNum} for ${articleId} — Size 2:`, '');
  if (!s2) return;

  const size1 = parseInt(s1), size2 = parseInt(s2);
  if (isNaN(size1)||isNaN(size2)||size1<1||size2<1) { showToast('Invalid sizes', 'error'); return; }
  if (size1 === size2) { showToast('Size 1 and Size 2 must be different', 'error'); return; }

  const { error } = await DB.addMould({ article_id: articleId, mould_num: nextNum, size_1: size1, size_2: size2 });
  if (error) { showToast('Error: ' + error.message, 'error'); return; }

  showToast(`M${nextNum} added to ${articleId} — Sz${size1}+Sz${size2}`, 'success');
  await reloadMouldsAndRefresh();
}

async function deleteMouldRow(mouldId, articleId, mouldNum) {
  if (!confirmAction(`Delete M${mouldNum} from ${articleId}? This cannot be undone.`)) return;
  const { error } = await DB.deleteMould(mouldId);
  if (error) { showToast('Error: ' + error.message, 'error'); return; }
  showToast(`M${mouldNum} removed from ${articleId}`, 'info');
  await reloadMouldsAndRefresh();
}

async function reloadMouldsAndRefresh() {
  const moulds = await DB.getMoulds();
  window._moulds = moulds;
  // Rebuild MOULD_MAP in memory
  const newMap = {};
  moulds.forEach(m => {
    if (!newMap[m.article_id]) newMap[m.article_id] = [];
    newMap[m.article_id].push({ mould: m.mould_num, sizes: [m.size_1, m.size_2] });
  });
  Object.keys(newMap).forEach(k => {
    newMap[k].sort((a,b) => a.mould - b.mould);
    MOULD_MAP[k] = newMap[k];
  });
  // Re-render the moulds tab
  document.getElementById('md-content').innerHTML = renderMouldsTab(moulds);
}
