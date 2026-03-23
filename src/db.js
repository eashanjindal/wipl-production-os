let _sb = null;
function sb() {
  if (!_sb) _sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  return _sb;
}

const DB = {
  // ── MASTER DATA ──────────────────────────────────────────────────────────
  async addMould(mould) {
    const { error } = await sb().from('master_moulds').insert(mould);
    return { error };
  },
  async deleteMould(id) {
    const { error } = await sb().from('master_moulds').delete().eq('id', id);
    return { error };
  },
  async updateMould(id, updates) {
    const { error } = await sb().from('master_moulds')
      .update(updates).eq('id', id);
    return { error };
  },

  async getAppConfig() {
    const { data } = await sb().from('app_config').select('*');
    return data || [];
  },

  async getMoulds() {
    const { data } = await sb().from('master_moulds')
      .select('*').order('article_id').order('mould_num');
    return data || [];
  },

  async getArticles() {
    const { data } = await sb().from('master_articles').select('*').order('id');
    return data || [];
  },
  async _getPartiesLegacy() {
    const { data } = await sb().from('master_parties').select('*').order('party_name');
    return data || [];
  },
  async getColours(articleId) {
    const { data } = await sb().from('master_colours').select('*').eq('article_id', articleId).order('colour_name');
    return data || [];
  },
  async addColour(articleId, colourName) {
    const { error } = await sb().from('master_colours')
      .insert({ article_id: articleId, colour_name: colourName });
    return { error };
  },
  async getAllColours() {
    const { data } = await sb().from('master_colours').select('*').order('article_id');
    return data || [];
  },
  async getDistinctColours() {
    const { data } = await sb().from('master_colours').select('colour_name, hex_colour').order('colour_name');
    // Return unique colours with hex
    const seen = new Set();
    return (data||[]).filter(c => { if (seen.has(c.colour_name)) return false; seen.add(c.colour_name); return true; });
  },
  async updateArticle(id, updates) {
    const { data, error } = await sb().from('master_articles').update(updates).eq('id', id).select().single();
    return { data, error };
  },
  async updateParty(id, updates) {
    const { data, error } = await sb().from('master_parties').update(updates).eq('id', id).select().single();
    return { data, error };
  },
  async getParties(statusFilter='active') {
    try {
      // .select() must come before .eq() in Supabase JS v2
      let q = sb().from('master_parties').select('*').order('party_name');
      if (statusFilter === 'active')  q = q.eq('status', 'active');
      if (statusFilter === 'pending') q = q.eq('status', 'pending');
      // statusFilter === 'all' — no filter added
      const { data, error } = await q;
      if (error) {
        console.warn('getParties fallback:', error.message);
        const { data: fallback } = await sb().from('master_parties').select('*').order('party_name');
        return fallback || [];
      }
      return data || [];
    } catch(e) {
      console.warn('getParties error:', e.message);
      const { data } = await sb().from('master_parties').select('*').order('party_name');
      return data || [];
    }
  },

  async getPendingParties() {
    try {
      const { data, error } = await sb().from('master_parties')
        .select('*').eq('status', 'pending').order('created_at', { ascending: false });
      if (error) return []; // column doesn't exist yet
      return data || [];
    } catch(e) { return []; }
  },

  async approveParty(id) {
    const { data, error } = await sb()
      .from('master_parties')
      .update({ status: 'active', rejection_reason: null })
      .eq('id', id)
      .select();
    if (error) return { error };
    // If data is empty, RLS blocked the update silently
    if (!data || data.length === 0) {
      return { error: { message: 'Update failed — check Supabase permissions.' } };
    }
    return { error: null, data: data[0] };
  },

  async rejectParty(id, reason='') {
    const { data, error } = await sb()
      .from('master_parties')
      .update({ status: 'rejected', rejection_reason: reason })
      .eq('id', id)
      .select();
    if (error) return { error };
    if (!data || data.length === 0) {
      return { error: { message: 'Update failed — check Supabase permissions.' } };
    }
    return { error: null, data: data[0] };
  },

  async addParty(party) {
    // Try inserting with all fields; if status column missing, insert without it
    let { data, error } = await sb().from('master_parties').insert(party).select().single();
    if (error && (error.message?.includes('status') || error.code === '42703')) {
      // Column doesn't exist yet — insert without status fields
      const { status: _s, requested_by: _r, rejection_reason: _rr, ...safeParty } = party;
      ({ data, error } = await sb().from('master_parties').insert(safeParty).select().single());
    }
    return { data, error };
  },

  // ── ORDERS ───────────────────────────────────────────────────────────────
  async getOrders(filters = {}) {
    let q = sb().from('orders').select('*, master_parties(party_name, pool)').order('created_at', { ascending: false });
    if (filters.status) q = q.eq('status', filters.status);
    if (filters.pool)   q = q.eq('pool', filters.pool);
    const { data } = await q;
    return data || [];
  },
  async getOrderLines(orderId) {
    const { data } = await sb().from('order_lines').select('*').eq('order_id', orderId);
    return data || [];
  },
  async getAllOrderLines() {
    const { data } = await sb().from('order_lines').select('*, orders(id, status, pool, master_parties(party_name))');
    return (data || []).map(l => ({ ...l, orders: Array.isArray(l.orders) ? l.orders[0] : l.orders }));
  },
  async createOrder(order, lines) {
    const { data: ord, error: e1 } = await sb().from('orders').insert(order).select().single();
    if (e1) return { error: e1 };
    const { error: e2 } = await sb().from('order_lines').insert(lines.map(l => ({ ...l, order_id: ord.id })));
    if (e2) return { error: e2 };
    return { data: ord };
  },
  async updateOrder(id, updates) {
    const { data, error } = await sb().from('orders').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id).select().single();
    return { data, error };
  },
  async updateOrderLine(id, updates) {
    const { data, error } = await sb().from('order_lines').update(updates).eq('id', id).select().single();
    return { data, error };
  },
  async updateOrderLineQty(id, qty_ordered) {
    const { error } = await sb().from('order_lines').update({ qty_ordered }).eq('id', id);
    return { error };
  },
  async deleteOrderLine(id) {
    const { error } = await sb().from('order_lines').delete().eq('id', id);
    return { error };
  },
  async addOrderLines(orderId, lines) {
    const { error } = await sb().from('order_lines').insert(
      lines.map(l => ({ ...l, order_id: orderId }))
    );
    return { error };
  },
  async cancelOrder(id) {
    const { error } = await sb().from('orders').update({ status: 'cancelled', updated_at: new Date().toISOString() }).eq('id', id);
    return { error };
  },
  async getOverdueOrders() {
    const { data } = await sb().from('orders')
      .select('*, master_parties(party_name, pool)')
      .lt('required_delivery_date', new Date().toISOString().split('T')[0])
      .in('status', ['pending', 'partial', 'in_production'])
      .not('required_delivery_date', 'is', null)
      .order('required_delivery_date');
    return data || [];
  },
  async getReadyOrders() {
    // Include both 'ready' and 'partial' — partial orders still have balance to dispatch
    const [ready, partial] = await Promise.all([
      DB.getOrders({ status: 'ready' }),
      DB.getOrders({ status: 'partial' })
    ]);
    return [...ready, ...partial];
  },
  async getPartySummary() {
    const lines = await DB.getAllOrderLines();
    const summary = {};
    lines.forEach(l => {
      const ord   = l.orders;
      if (!ord) return;
      const party = ord.master_parties?.party_name || 'Unknown';
      const bal   = (l.qty_ordered || 0) - (l.qty_dispatched || 0);
      if (!summary[party]) summary[party] = { party, pool: ord.pool, totalOrdered: 0, totalDispatched: 0, totalPending: 0, orders: new Set() };
      summary[party].totalOrdered    += l.qty_ordered || 0;
      summary[party].totalDispatched += l.qty_dispatched || 0;
      summary[party].totalPending    += bal > 0 ? bal : 0;
      summary[party].orders.add(l.order_id);
    });
    return Object.values(summary).map(s => ({ ...s, orderCount: s.orders.size }));
  },

  // ── INVENTORY ────────────────────────────────────────────────────────────
  async getInventory(pool = null) {
    let q = sb().from('inventory').select('*').order('article_id').order('colour').order('size');
    if (pool) q = q.eq('pool', pool);
    const { data } = await q;
    return data || [];
  },
  async getInventoryLevels() {
    const { data } = await sb().from('inventory_levels').select('*');
    return data || [];
  },
  async upsertInventory(article_id, colour, size, pool, qty_delta) {
    const { data: rows } = await sb().from('inventory').select('*')
      .eq('article_id', article_id).eq('colour', colour).eq('size', size).eq('pool', pool);
    const existing = rows && rows[0];
    if (existing) {
      const newQty = Math.max(0, (existing.qty_on_hand || 0) + qty_delta);
      await sb().from('inventory').update({ qty_on_hand: newQty, updated_at: new Date().toISOString() }).eq('id', existing.id);
    } else if (qty_delta > 0) {
      await sb().from('inventory').insert({ article_id, colour, size, pool, qty_on_hand: qty_delta });
    }
  },
  async reserveInventory(article_id, colour, size, pool, qty) {
    const { data: rows } = await sb().from('inventory').select('*')
      .eq('article_id', article_id).eq('colour', colour).eq('size', size).eq('pool', pool);
    const existing = rows && rows[0];
    if (!existing) return false;
    const available = existing.qty_on_hand - existing.qty_reserved;
    if (available < qty) return false;
    await sb().from('inventory').update({ qty_reserved: existing.qty_reserved + qty }).eq('id', existing.id);
    return true;
  },
  async setInventoryLevels(article_id, colour, pool, msl_min, reorder_point, msl_max) {
    const { error } = await sb().from('inventory_levels').upsert({ article_id, colour, pool, msl_min, reorder_point, msl_max }, { onConflict: 'article_id,colour,pool' });
    return { error };
  },
  async getInventoryBelowReorder() {
    const inv    = await DB.getInventory();
    const levels = await DB.getInventoryLevels();
    const alerts = [];
    inv.forEach(i => {
      const lvl = levels.find(l => l.article_id === i.article_id && l.colour === i.colour && l.pool === i.pool);
      if (!lvl) return;
      const available = i.qty_on_hand - i.qty_reserved;
      if (available <= lvl.reorder_point) {
        alerts.push({ ...i, reorder_point: lvl.reorder_point, msl_min: lvl.msl_min, msl_max: lvl.msl_max, available });
      }
    });
    return alerts;
  },

  // ── STOCK MOVEMENTS ──────────────────────────────────────────────────────
  async logStockMovement(article_id, colour, size, pool, qty_delta, reason, ref_id = null) {
    try {
      await sb().from('stock_movements').insert({ article_id, colour, size, pool, qty_delta, reason, ref_id, created_at: new Date().toISOString() });
    } catch(e) { /* ignore */ }
  },
  async getStockMovements(article_id = null, colour = null) {
    try {
      let q = sb().from('stock_movements').select('*').order('created_at', { ascending: false }).limit(200);
      if (article_id) q = q.eq('article_id', article_id);
      if (colour)     q = q.eq('colour', colour);
      const { data } = await q;
      return data || [];
    } catch(e) { return []; }
  },

  // ── PRODUCTION ───────────────────────────────────────────────────────────
  async getShifts(filters = {}) {
    let q = sb().from('production_shifts').select('*').order('shift_date');
    if (filters.status) {
      if (Array.isArray(filters.status)) q = q.in('status', filters.status);
      else q = q.eq('status', filters.status);
    }
    if (filters.from)   q = q.gte('shift_date', filters.from);
    const { data } = await q;
    return data || [];
  },
  async getShiftArticles(shiftId) {
    const { data } = await sb().from('production_shift_articles').select('*, master_articles(*)').eq('shift_id', shiftId);
    return data || [];
  },
  async getShiftOrders(shiftId) {
    const { data } = await sb().from('production_shift_orders').select('*, order_lines(*, orders(*, master_parties(party_name)))').eq('shift_id', shiftId);
    return data || [];
  },
  async createShift(shift, articles, shiftOrders) {
    const { data: s, error } = await sb().from('production_shifts').insert(shift).select().single();
    if (error) return { error };
    if (articles.length)    await sb().from('production_shift_articles').insert(articles.map(a => ({ shift_id: s.id, article_id: a.article_id, moulds_allocated: a.moulds || 3 })));
    if (shiftOrders.length) await sb().from('production_shift_orders').insert(shiftOrders.map(o => ({ shift_id: s.id, order_line_id: o.order_line_id, qty_planned: o.qty_planned })));
    return { data: s };
  },
  async updateShift(id, updates) {
    const { data, error } = await sb().from('production_shifts').update(updates).eq('id', id).select().single();
    return { data, error };
  },
  async replaceShiftArticles(shiftId, articles) {
    await sb().from('production_shift_articles').delete().eq('shift_id', shiftId);
    if (articles.length) {
      await sb().from('production_shift_articles').insert(
        articles.map(a => ({
          shift_id: shiftId, article_id: a.article_id,
          moulds_allocated: a.moulds || 3,
          mould_numbers: a.mould_numbers || null
        }))
      );
    }
    return { error: null };
  },
  async logActualOutput(shiftId, colour1Actual, colour2Actual) {
    return await DB.updateShift(shiftId, { actual_pairs_colour_1: colour1Actual, actual_pairs_colour_2: colour2Actual, status: 'completed' });
  },

  // ── RAW MATERIAL ─────────────────────────────────────────────────────────
  async getRMStock() {
    const { data } = await sb().from('raw_material_stock').select('*').order('compound_colour');
    return data || [];
  },
  async updateRMStock(colour, qty_kg) {
    if (qty_kg < 0) {
      // Deduct: fetch current, subtract, floor at 0
      const { data: rows } = await sb().from('raw_material_stock')
        .select('qty_kg').eq('compound_colour', colour);
      const current = rows && rows[0];
      if (!current) return { error: null }; // colour not in RM — skip silently
      const newQty = Math.max(0, Math.round(((current.qty_kg || 0) + qty_kg) * 100) / 100);
      const { error } = await sb().from('raw_material_stock')
        .update({ qty_kg: newQty, updated_at: new Date().toISOString() })
        .eq('compound_colour', colour);
      return { error };
    }
    // Absolute set (from RM module manual update)
    const { error } = await sb().from('raw_material_stock')
      .update({ qty_kg, updated_at: new Date().toISOString() })
      .eq('compound_colour', colour);
    return { error };
  },
  async getRMPOs() {
    const { data } = await sb().from('raw_material_po').select('*').order('po_date', { ascending: false });
    return data || [];
  },
  async createRMPO(po) {
    const { data, error } = await sb().from('raw_material_po').insert(po).select().single();
    return { data, error };
  },
  async updateRMPO(id, updates) {
    const { data, error } = await sb().from('raw_material_po').update(updates).eq('id', id).select().single();
    return { data, error };
  },

  async createRMStockEntry(colour, qty_kg) {
    const { error } = await sb().from('raw_material_stock').insert({ compound_colour: colour, qty_kg });
    return { error };
  },

  // ── ORDER FULFILMENT INTELLIGENCE ───────────────────────────────────────────
  async getOrderFulfilmentStatus() {
    // Cross-reference all active orders against current inventory
    // Returns per-order: { canFulfil (bool), availablePairs, totalPending, lines[] }
    const [orders, lines, inventory] = await Promise.all([
      DB.getOrders(), DB.getAllOrderLines(), DB.getInventory()
    ]);

    // Index inventory by article+colour+size+pool
    const stockIndex = {};
    inventory.forEach(i => {
      const key = `${i.article_id}||${i.colour}||${i.size}||${i.pool}`;
      stockIndex[key] = Math.max(0, i.qty_on_hand - i.qty_reserved);
    });

    // Group lines by order
    const linesByOrder = {};
    lines.forEach(l => {
      if (!linesByOrder[l.order_id]) linesByOrder[l.order_id] = [];
      linesByOrder[l.order_id].push(l);
    });

    const result = [];
    orders.forEach(o => {
      if (['completed','cancelled','dispatched'].includes(o.status)) return;
      const orderLines = linesByOrder[o.id] || [];
      let totalPending = 0, availablePairs = 0, fulfilableLines = 0;

      const lineStatus = orderLines.map(l => {
        const bal = (l.qty_ordered||0) - (l.qty_dispatched||0);
        if (bal <= 0) return null;
        const key = `${l.article_id}||${l.colour}||${l.size}||${o.pool}`;
        const avail = stockIndex[key] || 0;
        const canFulfilLine = avail >= bal;
        totalPending   += bal;
        availablePairs += Math.min(avail, bal);
        if (canFulfilLine) fulfilableLines++;
        return { ...l, bal, avail, canFulfilLine };
      }).filter(Boolean);

      if (!lineStatus.length) return;

      const canFullyFulfil   = lineStatus.every(l => l.canFulfilLine);
      const canPartialFulfil = availablePairs > 0 && !canFullyFulfil;
      const pct = totalPending > 0 ? Math.round((availablePairs/totalPending)*100) : 0;

      result.push({
        order: o,
        lineStatus,
        totalPending,
        availablePairs,
        canFullyFulfil,
        canPartialFulfil,
        fulfilPct: pct,
        fulfilableLines,
        totalLines: lineStatus.length
      });
    });

    // Sort: fully fulfillable first, then partial, then none
    return result.sort((a,b) => {
      if (a.canFullyFulfil && !b.canFullyFulfil) return -1;
      if (!a.canFullyFulfil && b.canFullyFulfil) return 1;
      return b.fulfilPct - a.fulfilPct;
    });
  },

  async getStockAvailableForOrder(orderId) {
    // Returns per order-line how much stock is available right now
    const [order, lines, inventory] = await Promise.all([
      DB.getOrders().then(os => os.find(o => o.id === orderId)),
      DB.getOrderLines(orderId),
      DB.getInventory()
    ]);
    if (!order) return [];

    const stockIndex = {};
    inventory.forEach(i => {
      const key = `${i.article_id}||${i.colour}||${i.size}||${i.pool}`;
      stockIndex[key] = Math.max(0, i.qty_on_hand - i.qty_reserved);
    });

    return lines.map(l => {
      const bal  = (l.qty_ordered||0) - (l.qty_dispatched||0);
      const key  = `${l.article_id}||${l.colour}||${l.size}||${order.pool}`;
      const avail = stockIndex[key] || 0;
      return { ...l, bal, avail, canFulfil: avail >= bal };
    });
  },

  // ── DISPATCH ─────────────────────────────────────────────────────────────
  async getDispatches() {
    const { data } = await sb().from('dispatches').select('*, orders(*, master_parties(party_name, pool))').order('dispatch_date', { ascending: false });
    return data || [];
  },
  async createDispatch(dispatch, lines) {
    const { data: d, error } = await sb().from('dispatches').insert(dispatch).select().single();
    if (error) return { error };
    await sb().from('dispatch_lines').insert(lines.map(l => ({ dispatch_id: d.id, order_line_id: l.order_line_id, qty_dispatched: l.qty_dispatched })));
    return { data: d };
  }
};
