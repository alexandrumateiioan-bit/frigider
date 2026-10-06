// =============================================================
// STRATUL DE DATE
// -------------------------------------------------------------
// Restul aplicației nu știe unde stau datele. Vorbește doar cu
// funcțiile exportate de aici: list, insert, update, upsert, remove,
// onChange și cele de login.
//
// Există două implementări cu exact aceleași funcții:
//   - `local`  → mod demo, datele în localStorage (doar pe acest
//                dispozitiv)
//   - `remote` → Supabase, date comune pentru amândoi
// La final alegem una dintre ele în funcție de config.js.
// =============================================================

import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js?v=3';

export const isDemo = !SUPABASE_URL || !SUPABASE_ANON_KEY;

// Butoanele rapide cu care pornește aplicația (le poți schimba din Setări),
// pe fiecare loc de depozitare.
export const DEFAULT_QUICK = {
  frigider: ['Lapte', 'Ouă', 'Unt', 'Telemea', 'Cașcaval', 'Iaurt', 'Smântână',
    'Șuncă', 'Roșii', 'Castraveți', 'Ardei', 'Piept de pui', 'Carne tocată'],
  congelator: ['Carne tocată', 'Piept de pui', 'Pește', 'Legume congelate', 'Broccoli congelat'],
  camara: ['Orez', 'Paste', 'Făină', 'Ulei', 'Ceapă', 'Cartofi', 'Usturoi', 'Năut la borcan', 'Pâine Wasa'],
};

// După ce coloană sortăm fiecare tabel.
// `aisles` ține raioanele alese de voi: id = numele normalizat al produsului.
const ORDER = { items: 'created_at', shopping: 'created_at', quick_items: 'name', aisles: 'id' };

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

  // Login cu email și parolă. Conturile le creezi tu din panoul
  // Supabase (Authentication → Users → Add user); înscrierea din
  // aplicație e dezactivată, deci nu se pot crea conturi străine.
  async signIn(email, password) {
    const c = await client();
    const data = check(await c.auth.signInWithPassword({ email, password }));
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

  // Inserează sau, dacă există deja un rând cu același id, îl înlocuiește.
  async upsert(table, row) {
    const c = await client();
    check(await c.from(table).upsert(row));
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

function seedQuick() {
  return Object.entries(DEFAULT_QUICK).flatMap(([location, names]) =>
    names.map((name) => ({ id: uid(), name, location })));
}

function seed() {
  return { items: [], shopping: [], quick_items: seedQuick(), aisles: [] };
}

// Datele salvate de versiunea 1 nu au locuri de depozitare; le completăm.
function migrate(d) {
  d.aisles ??= [];
  for (const it of d.items) it.location ??= 'frigider';
  if (!d.quick_items.some((q) => q.location && q.location !== 'frigider')) {
    for (const q of d.quick_items) q.location ??= 'frigider';
    d.quick_items.push(...seedQuick().filter((q) => q.location !== 'frigider'));
  }
  return d;
}

function readDb() {
  try {
    const d = JSON.parse(localStorage.getItem(KEY));
    return d ? migrate(d) : seed();
  } catch {
    return seed();
  }
}

let db = readDb();
// Dacă browserul nu permite salvarea (ex. fereastră privată), aplicația
// merge mai departe, doar că datele se pierd la închidere.
const saveDb = () => {
  try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { /* ignorăm */ }
};

// Valori implicite, la fel ca în baza de date reală.
const DEFAULTS = { shopping: { done: false }, items: { location: 'frigider' }, quick_items: { location: 'frigider' } };

const local = {
  async getUser() { return { email: 'demo' }; },
  async signIn() { return { email: 'demo' }; },
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

  async upsert(table, row) {
    db[table] = db[table].filter((r) => r.id !== row.id);
    db[table].push(row);
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
export const signIn = impl.signIn;
export const isMember = impl.isMember;
export const signOut = impl.signOut;
export const list = impl.list;
export const insert = impl.insert;
export const update = impl.update;
export const upsert = impl.upsert;
export const remove = impl.remove;
export const onChange = impl.onChange;
export const privateRecipes = impl.privateRecipes;
