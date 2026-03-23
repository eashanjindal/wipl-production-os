const SUPABASE_URL = 'https://opcqnfngczcmtmooaauw.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9wY3FuZm5nY3pjbXRtb29hYXV3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM5MDYwNjIsImV4cCI6MjA4OTQ4MjA2Mn0.ZEj3vQvvq2pY-nh05cUmaSmtTRpd3bx70P1tDDTPQmQ';

const ROLES = {
  admin:    { pin: '1234', label: 'Admin / Planner',  modules: ['dashboard','orders','inventory','production','rawmaterial','dispatch','masterdata'] },
  sales:    { pin: '2222', label: 'Sales Team',       modules: ['dashboard','orders','inventory'] },
  floor:    { pin: '3333', label: 'Floor Team',       modules: ['dashboard','production'] },
  dispatch: { pin: '4444', label: 'Dispatch Team',    modules: ['dashboard','dispatch','inventory'] }
};

const NAV_ITEMS = {
  dashboard:   { icon: '◈', label: 'Dashboard' },
  orders:      { icon: '≡', label: 'Orders' },
  inventory:   { icon: '▦', label: 'Inventory' },
  production:  { icon: '◎', label: 'Production' },
  rawmaterial: { icon: '◐', label: 'Raw Material' },
  dispatch:    { icon: '→', label: 'Dispatch' },
  masterdata:  { icon: '◇', label: 'Master Data' }
};

const MENS_SIZES   = [6,7,8,9,10,11];
const WOMENS_SIZES = [3,4,5,6,7,8];
const MENS_ARTICLES   = ['WIPL001','WIPL002','WIPL003','WIPL004'];
const WOMENS_ARTICLES = ['WIPL005','WIPL006'];

const COLOUR_HEX = {
  'WHITE':'#f0f0f0',    'BLACK':'#444',       'GREY':'#888',
  'BEIGE':'#d4b896',    'GREEN':'#4aaa88',    'BLUE':'#4488ff',
  'SKY BLUE':'#87ceeb', 'MINT GREEN':'#98e8c8','OLIVE GREEN':'#6b7c3a',
  'ONION PINK':'#e88fa0','BABY PINK':'#f4c2c2',
};

const SHOTS_PER_SHIFT    = 60;   // Shots per 12-hour shift
const DEFAULT_SHIFT_HOURS = 12;  // Default shift duration hours
// Pairs = shots × moulds × 2 sizes per mould
// For shift hours other than 12: shots scale proportionally
function calcActualShots(shiftHours = 12) {
  return Math.round((shiftHours / 12) * SHOTS_PER_SHIFT);
}
const STATIONS          = 6;
const MOULDS_PER_STATION = 2;
const SIZES_PER_MOULD   = 2;
const TOTAL_MOULD_SLOTS = 12;
const MAX_ARTICLES_PER_SHIFT = 4;
const MOULDS_PER_ARTICLE = 3;

// Mould map — FALLBACK ONLY. Live data loaded from master_moulds table in Supabase.
// This is used only if DB fetch fails. Keep in sync with DB.
const MOULD_MAP = {
  WIPL001: [ { mould:1, sizes:[6,7] }, { mould:2, sizes:[8,9] }, { mould:3, sizes:[10,11] } ],
  WIPL002: [ { mould:1, sizes:[7,8] }, { mould:2, sizes:[9,10] }, { mould:3, sizes:[6,11] } ],
  WIPL003: [ { mould:1, sizes:[6,7] }, { mould:2, sizes:[8,9] }, { mould:3, sizes:[10,11] } ],
  WIPL004: [ { mould:1, sizes:[6,7] }, { mould:2, sizes:[8,9] }, { mould:3, sizes:[10,11] } ],
  WIPL005: [ { mould:1, sizes:[3,4] }, { mould:2, sizes:[5,6] }, { mould:3, sizes:[7,8] } ],
  WIPL006: [ { mould:1, sizes:[3,4] }, { mould:2, sizes:[5,6] }, { mould:3, sizes:[7,8] } ],
};
const RM_LEAD_DAYS      = 14;
