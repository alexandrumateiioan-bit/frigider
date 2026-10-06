// =============================================================
// STRATUL DE DATE
// -------------------------------------------------------------
// Restul aplicației nu știe unde stau datele. Vorbește doar cu
// funcțiile exportate de aici: list, insert, update, remove,
// onChange și cele de login.
//
// Există două implementări cu exact aceleași funcții:
//   - `local`  → mod demo, datele în localStorage (doar pe acest
//                dispozitiv)
//   - `remote` → Supabase, date comune pentru amândoi
// La final alegem una dintre ele în funcție de config.js.
// =============================================================

import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

export const isDemo = !SUPABASE_URL || !SUPABASE_ANON_KEY;

// Butoanele rapide cu care pornește aplicația (le poți schimba din Setări).
export const DEFAULT_QUICK = [
  'Lapte', 'Ouă', 'Unt', 'Telemea', 'Cașcaval', 'Iaurt', 'Smântână',
  'Șuncă', 'Roșii', 'Castraveți', 'Ardei', 'Piept de pui', 'Carne tocată',
];

// După ce coloană sortăm fiecare tabel.
const ORDER = { items: 'created_at', shopping: 'created_at', quick_items: 'name' };

// -------------------------------------------------------------
// 1) Implementarea Supabase
// -------------------------------------------------------------
let sb = null;

// Biblioteca Supabase se încarcă doar când e nevoie de ea,
// ca modul demo să meargă și fără internet.
async function client() {
  if (!sb) {
    const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
    sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true },
    });
  }
  return sb;
}

// Supabase întoarce { data, error }. Transformăm eroarea în excepție,
// ca s-o prindem într-un singur loc în app.js.
function check({ data, error }) {
  if (error) throw error;
  return data;
}

const remote = {
  async getUser() {
    const c = await client();
    const { data } = await c.auth.getSession();
    return data.session?.user ?? null;
  },

  // Trimite un cod de 6 cifre pe email. Folosim cod, nu link,
  // pentru că pe iPhone un link s-ar deschide în Safari, iar
  // aplicația de pe ecranul principal nu ar afla de login.
  async sendCode(email) {
    const c = await client();
    check(await c.auth.signInWithOtp({ email, options: { shouldCreateUser: true } }));
  },

  async verifyCode(email, token) {
    const c = await client();
    const data = check(await c.auth.verifyOtp({ email, token, type: 'email' }));
    return data.user;
  },

  // Verifică dacă emailul e pe lista casei (tabelul members).
  async isMember() {
    const c = await client();
    return check(await c.rpc('is_member')) === true;
  },

  async signOut() {
    const c = await client();
    await c.auth.signOut();
  },

  async list(table) {
    const c = await client();
    return check(await c.from(table).select('*').order(ORDER[table]));
  },

  async insert(table, rows) {
    const c = await client();
    check(await c.from(table).insert(rows));
  },

  async update(table, id, patch) {
    const c = await client();
    check(await c.from(table).update(patch).eq('id', id));
  },

  async remove(table, ids) {
    if (!ids.length) return;
    const c = await client();
    check(await c.from(table).delete().in('id', ids));
  },

  // Rețetele private (din planul nutrițional), din tabelul recipes.
  async privateRecipes() {
    const c = await client();
    const rows = check(await c.from('recipes').select('data'));
    return rows.map((r) => r.data);
  },

  // Când celălalt modifică ceva, Supabase ne anunță imediat (Realtime).
  async onChange(cb) {
    const c = await client();
    c.channel('frigider')
      .on('postgres_changes', { event: '*', schema: 'public' }, () => cb())
      .subscribe();
  },
};

// -------------------------------------------------------------
// 2) Implementarea locală (mod demo)
// -------------------------------------------------------------
const KEY = 'frigider-demo-v1';

function uid() {
  return crypto.randomUUID
    ? crypto.randomUUID()
    : Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function seed() {
  return { items: [], shopping: [], quick_items: DEFAULT_QUICK.map((name) => ({ id: uid(), name })) };
}

function readDb() {
  try { return JSON.parse(localStorage.getItem(KEY)) || seed(); } catch { return seed(); }
}

let db = readDb();
// Dacă browserul nu permite salvarea (ex. fereastră privată), aplicația
// merge mai departe, doar că datele se pierd la închidere.
const saveDb = () => {
  try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { /* ignorăm */ }
};

// Valori implicite, la fel ca în baza de date reală.
const DEFAULTS = { shopping: { done: false } };

const local = {
  async getUser() { return { email: 'demo' }; },
  async sendCode() {},
  async verifyCode() { return { email: 'demo' }; },
  async isMember() { return true; },
  async signOut() {},

  async list(table) {
    const key = ORDER[table];
    const rows = JSON.parse(JSON.stringify(db[table]));
    return rows.sort((a, b) => String(a[key]).localeCompare(String(b[key]), 'ro'));
  },

  async insert(table, rows) {
    for (const r of [].concat(rows)) {
      db[table].push({ id: uid(), created_at: new Date().toISOString(), ...DEFAULTS[table], ...r });
    }
    saveDb();
  },

  async update(table, id, patch) {
    const row = db[table].find((r) => r.id === id);
    if (row) Object.assign(row, patch);
    saveDb();
  },

  async remove(table, ids) {
    db[table] = db[table].filter((r) => !ids.includes(r.id));
    saveDb();
  },

  // În modul demo, rețetele private vin dintr-un fișier care NU e pe
  // GitHub (vezi .gitignore). Dacă fișierul lipsește, nu sunt rețete private.
  async privateRecipes() {
    try {
      const res = await fetch('data/recipes-plan.json');
      return res.ok ? await res.json() : [];
    } catch {
      return [];
    }
  },

  // Dacă aplicația e deschisă în două taburi, ele se anunță între ele.
  async onChange(cb) {
    window.addEventListener('storage', (e) => {
      if (e.key === KEY) { db = readDb(); cb(); }
    });
  },
};

// -------------------------------------------------------------
// Alegem implementarea
// -------------------------------------------------------------
const impl = isDemo ? local : remote;

export const getUser = impl.getUser;
export const sendCode = impl.sendCode;
export const verifyCode = impl.verifyCode;
export const isMember = impl.isMember;
export const signOut = impl.signOut;
export const list = impl.list;
export const insert = impl.insert;
export const update = impl.update;
export const remove = impl.remove;
export const onChange = impl.onChange;
export const privateRecipes = impl.privateRecipes;
