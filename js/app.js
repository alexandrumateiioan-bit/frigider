// =============================================================
// APLICAȚIA
// -------------------------------------------------------------
// Ideea de bază, ca să poți urmări codul:
//   1. Toate datele afișate stau în obiectul `state`.
//   2. `render()` desenează ecranul curent pornind DOAR din `state`.
//   3. Când apeși un buton, o funcție din `actions` modifică datele
//      prin store.js, apoi reîncarcă `state` și cheamă `render()`.
// Nu modificăm niciodată HTML-ul „pe bucăți"; îl redesenăm tot.
// E simplu și, pentru câteva zeci de produse, suficient de rapid.
// =============================================================

import * as store from './store.js';
import { loadRecipes, matchRecipes, claudePrompt, norm, MESE } from './recipes.js';

const $ = (sel) => document.querySelector(sel);
const view = $('#view');
const tabsEl = $('#tabs');

const state = {
  tab: 'frigider',
  items: [],          // ce e în frigider
  shopping: [],       // lista de cumpărături
  quick: [],          // butoanele rapide
  publicRecipes: [],  // rețetele din data/recipes.json (publice)
  recipes: [],        // publice + cele private din planul nutrițional
  user: null,
  openItem: null,     // produsul pe care ai apăsat (arată butoanele)
  openRecipes: new Set(),
  showPrompt: false,
  recipeFilter: 'toate', // 'toate' sau 'plan'
  loginStep: 'email',
  loginEmail: '',
};

const TITLES = { frigider: 'Frigider', cumparaturi: 'Cumpărături', retete: 'Rețete', setari: 'Setări' };

// -------------------------------------------------------------
// Utilitare mici
// -------------------------------------------------------------

// Orice text scris de utilizator trece prin esc() înainte să ajungă
// în HTML, ca un nume de produs ciudat să nu strice pagina.
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Data de azi (+ n zile) în formatul AAAA-LL-ZZ, în ora locală.
function isoDate(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

// Câte zile mai sunt până la data de expirare (negativ = a expirat).
function daysLeft(iso) {
  if (!iso) return null;
  const today = new Date(isoDate() + 'T00:00:00');
  const exp = new Date(iso + 'T00:00:00');
  return Math.round((exp - today) / 86400000);
}

function zile(n) { return n === 1 ? '1 zi' : `${n} zile`; }

function expiryBadge(iso) {
  const d = daysLeft(iso);
  if (d === null) return '';
  if (d < 0) return `<span class="badge bad">expirat de ${zile(-d)}</span>`;
  if (d === 0) return '<span class="badge bad">expiră azi</span>';
  if (d === 1) return '<span class="badge warn">expiră mâine</span>';
  if (d <= 3) return `<span class="badge warn">expiră în ${zile(d)}</span>`;
  return `<span class="badge ok">mai are ${zile(d)}</span>`;
}

// Cine a adăugat produsul (doar prima parte a emailului).
function who(email) {
  if (!email || store.isDemo) return '';
  return `<span class="who">${esc(email.split('@')[0])}</span>`;
}

// Produsele care expiră primele apar sus; cele fără dată, la final.
function byExpiry(a, b) {
  const da = daysLeft(a.expires_on), db = daysLeft(b.expires_on);
  if (da === null && db !== null) return 1;
  if (db === null && da !== null) return -1;
  return (da ?? 0) - (db ?? 0) || a.name.localeCompare(b.name, 'ro');
}

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { t.hidden = true; }, 2200);
}

// -------------------------------------------------------------
// Încărcarea datelor și desenarea ecranului
// -------------------------------------------------------------

async function loadAll(force = true) {
  const [items, shopping, quick] = await Promise.all([
    store.list('items'), store.list('shopping'), store.list('quick_items'),
  ]);
  Object.assign(state, { items, shopping, quick });
  render(force);
}

// Dacă celălalt modifică ceva în timp ce tu scrii într-un câmp,
// nu redesenăm imediat (ți-ar șterge ce scrii). Amânăm până ieși din câmp.
let pendingRender = false;
const isTyping = () => view.contains(document.activeElement) && document.activeElement.matches('input, textarea');

view.addEventListener('focusout', () => {
  setTimeout(() => { if (pendingRender && !isTyping()) render(); }, 0);
});

function render(force = true) {
  if (!force && isTyping()) { pendingRender = true; return; }
  pendingRender = false;

  const loggedOut = !store.isDemo && !state.user;
  tabsEl.hidden = loggedOut;
  $('#title').textContent = loggedOut ? 'Frigiderul nostru' : TITLES[state.tab];
  view.innerHTML = loggedOut ? viewLogin() : VIEWS[state.tab]();

  for (const b of tabsEl.querySelectorAll('button')) {
    b.classList.toggle('active', b.dataset.tab === state.tab);
  }
  const toBuy = state.shopping.filter((s) => !s.done).length;
  $('#shopCount').textContent = toBuy || '';
}

// -------------------------------------------------------------
// Ecranele
// -------------------------------------------------------------

function viewFrigider() {
  const items = [...state.items].sort(byExpiry);
  const chips = state.quick
    .map((q) => `<button class="chip" data-action="quick" data-name="${esc(q.name)}">+ ${esc(q.name)}</button>`)
    .join('');

  return `
    <section class="card">
      <div class="chips">${chips || '<span class="muted small">Adaugă butoane rapide din Setări.</span>'}</div>
      <form id="addItem" class="add">
        <input name="name" placeholder="Ce ai pus în frigider?" autocomplete="off" maxlength="80" required>
        <input name="qty" placeholder="Cantitate (opțional)" autocomplete="off" maxlength="40">
        <div class="row exp">
          <label for="exp">Expiră</label>
          <input id="exp" type="date" name="exp">
          <button type="button" data-action="exp" data-days="3">+3z</button>
          <button type="button" data-action="exp" data-days="7">+7z</button>
        </div>
        <button class="primary">Adaugă în frigider</button>
      </form>
    </section>
    <h2>În frigider <span class="muted">(${items.length})</span></h2>
    <ul class="list">
      ${items.map(itemRow).join('') || '<li class="empty">Frigiderul e gol. Apasă un buton rapid sau scrie un produs.</li>'}
    </ul>`;
}

function itemRow(it) {
  const open = state.openItem === it.id;
  return `
    <li>
      <button class="item-main" data-action="toggle" data-id="${it.id}">
        <span class="name">${esc(it.name)}</span>
        ${it.quantity ? `<span class="qty-t">${esc(it.quantity)}</span>` : ''}
        ${expiryBadge(it.expires_on)}
        ${who(it.added_by)}
      </button>
      ${open ? `
        <div class="item-actions">
          <button class="primary" data-action="done-shop" data-id="${it.id}">Terminat + pe listă</button>
          <button class="secondary" data-action="done" data-id="${it.id}">Doar terminat</button>
        </div>` : ''}
    </li>`;
}

function viewCumparaturi() {
  const list = [...state.shopping].sort((a, b) => (a.done - b.done) || a.created_at.localeCompare(b.created_at));
  const checked = list.filter((s) => s.done).length;

  return `
    <form id="addShop" class="add inline">
      <input name="name" placeholder="Ce trebuie cumpărat?" autocomplete="off" maxlength="80" required>
      <button class="primary">Adaugă</button>
    </form>
    <h2>De cumpărat</h2>
    <ul class="list">
      ${list.map((s) => `
        <li class="shop ${s.done ? 'done' : ''}">
          <button class="check" data-action="check" data-id="${s.id}" aria-label="Bifează">${s.done ? '✓' : ''}</button>
          <span class="name">${esc(s.name)}</span>
          ${who(s.added_by)}
          <button class="x" data-action="delshop" data-id="${s.id}" aria-label="Șterge">×</button>
        </li>`).join('') || '<li class="empty">Lista e goală.</li>'}
    </ul>
    ${checked ? `
      <div class="bar">
        <button class="primary" data-action="to-fridge">Pune ${checked === 1 ? 'produsul bifat' : `cele ${checked} bifate`} în frigider</button>
        <button class="secondary" data-action="clear-checked">Doar șterge bifatele</button>
      </div>` : ''}`;
}

function recipeCard(r) {
  const ingredient = (i) => {
    const cls = i.ai ? 'have' : i.opt ? 'opt' : 'miss';
    const mark = i.ai ? '✓' : i.opt ? '○' : '✗';
    return `<li class="${cls}">${mark} ${esc(i.n)} <span class="muted">${esc(i.q)}${i.opt && !i.ai ? ' · opțional' : ''}</span></li>`;
  };
  const missingNames = r.missing.map((i) => i.n);
  const fromPlan = r.sursa === 'plan';

  return `
    <details class="recipe" data-id="${r.id}" ${state.openRecipes.has(r.id) ? 'open' : ''}>
      <summary>
        <div class="title">${esc(r.nume)}</div>
        <div class="meta">
          ${fromPlan ? `<span class="badge plan">plan · ${esc(r.masa)}</span>` : ''}
          ${r.timp ? `<span>${r.timp} min</span>` : ''}
          ${r.folosesteCeExpira ? '<span class="badge warn">folosește ce expiră</span>' : ''}
          ${r.missing.length ? `<span class="miss">lipsește: ${esc(missingNames.join(', '))}</span>` : ''}
        </div>
      </summary>
      <div class="body">
        ${fromPlan ? `<p class="muted small">Cantități pentru: ${esc(r.portii)}</p>` : ''}
        ${r.ing.length ? `<ul>${r.ing.map(ingredient).join('')}</ul>` : ''}
        ${r.camara.length ? `<p class="muted small">Din cămară: ${esc(r.camara.join(', '))}</p>` : ''}
        <ol>${r.pasi.map((p) => `<li>${esc(p)}</li>`).join('')}</ol>
        ${r.note?.length ? `<div class="notes small">${r.note.map((n) => `<p>${esc(n)}</p>`).join('')}</div>` : ''}
        ${r.missing.length ? `<button class="secondary block" data-action="add-missing" data-names="${esc(JSON.stringify(missingNames))}">Pune ce lipsește pe listă</button>` : ''}
      </div>
    </details>`;
}

function viewRetete() {
  const onlyPlan = state.recipeFilter === 'plan';
  const recipes = onlyPlan ? state.recipes.filter((r) => r.sursa === 'plan') : state.recipes;
  const { ready, almost, all } = matchRecipes(recipes, state.items, daysLeft);

  // În modul „plan", sub potriviri apar toate rețetele din plan, grupate pe mese.
  let planList = '';
  if (onlyPlan) {
    const shown = new Set([...ready, ...almost].map((r) => r.id));
    const rest = all.filter((r) => !shown.has(r.id));
    planList = MESE.map((masa) => {
      const group = rest.filter((r) => r.masa === masa).sort((a, b) => a.nume.localeCompare(b.nume, 'ro'));
      return group.length ? `<h2>${esc(masa)} <span class="muted">(${group.length})</span></h2>${group.map(recipeCard).join('')}` : '';
    }).join('');
  }

  const hasPlan = state.recipes.some((r) => r.sursa === 'plan');

  return `
    ${!hasPlan ? '' : `<div class="seg" role="tablist">
      <button data-action="filter" data-f="toate" class="${onlyPlan ? '' : 'on'}">Toate rețetele</button>
      <button data-action="filter" data-f="plan" class="${onlyPlan ? 'on' : ''}">Din planul nutrițional</button>
    </div>`}

    ${onlyPlan ? '' : `
    <section class="card">
      <p style="margin:0 0 10px">Vrei altceva decât ce e în listă? Copiază ce aveți în frigider și lipește în Claude.</p>
      <button class="primary block" data-action="copy-claude">Copiază lista pentru Claude</button>
      ${state.showPrompt ? `<textarea class="prompt" readonly>${esc(claudePrompt(state.items, daysLeft))}</textarea>` : ''}
    </section>`}

    <h2>Poți găti acum <span class="muted">(${ready.length})</span></h2>
    ${ready.map(recipeCard).join('') || '<p class="muted">Nicio rețetă completă cu ce e acum în frigider.</p>'}

    <h2>Îți lipsesc 1–2 lucruri <span class="muted">(${almost.length})</span></h2>
    ${almost.map(recipeCard).join('') || '<p class="muted">Nimic aici încă. Adaugă produse în frigider.</p>'}

    ${planList}`;
}

function viewSetari() {
  const chips = state.quick
    .map((q) => `<button class="chip" data-action="delquick" data-id="${q.id}">${esc(q.name)} <b>×</b></button>`)
    .join('');

  return `
    <h2>Butoane rapide</h2>
    <section class="card">
      <p class="muted small" style="margin-top:0">Produsele cumpărate des. Apasă pe unul ca să-l scoți.</p>
      <div class="quick-edit">${chips || '<span class="muted">Niciunul.</span>'}</div>
      <form id="addQuick" class="add inline">
        <input name="name" placeholder="Produs nou" autocomplete="off" maxlength="40" required>
        <button class="primary">Adaugă</button>
      </form>
    </section>

    <h2>Cont</h2>
    <section class="card">
      ${store.isDemo
        ? '<p style="margin:0">Rulezi în <b>mod demo</b>: datele stau doar pe acest dispozitiv. Pentru sincronizare între voi doi, urmează pașii din README (Supabase).</p>'
        : `<p style="margin-top:0">Conectat ca <b>${esc(state.user?.email)}</b></p>
           <button class="secondary block" data-action="logout">Deconectare</button>`}
    </section>

    <h2>Pe iPhone</h2>
    <section class="card small">
      În Safari: butonul <b>Partajează</b> → <b>Adaugă pe ecranul principal</b>. De atunci o deschizi ca pe orice aplicație.
    </section>`;
}

function viewLogin() {
  if (state.loginStep === 'email') {
    return `
      <section class="card">
        <p style="margin-top:0">Intră cu emailul tău. Îți trimitem un cod.</p>
        <form id="login" class="add">
          <input name="email" type="email" placeholder="email@exemplu.ro" autocomplete="email" required>
          <button class="primary">Trimite codul</button>
        </form>
      </section>`;
  }
  return `
    <section class="card">
      <p style="margin-top:0">Am trimis un cod la <b>${esc(state.loginEmail)}</b>.</p>
      <form id="code" class="add">
        <input name="code" inputmode="numeric" autocomplete="one-time-code" placeholder="Codul din email" maxlength="10" required>
        <button class="primary">Intră</button>
      </form>
      <button class="secondary block" style="margin-top:8px" data-action="other-email">Alt email</button>
    </section>`;
}

const VIEWS = { frigider: viewFrigider, cumparaturi: viewCumparaturi, retete: viewRetete, setari: viewSetari };

// -------------------------------------------------------------
// Acțiuni (butoane)
// Fiecare buton are data-action="numele-funcției".
// -------------------------------------------------------------

// Adaugă pe lista de cumpărături doar ce nu e deja acolo.
async function addToShopping(names) {
  const already = new Set(state.shopping.filter((s) => !s.done).map((s) => norm(s.name)));
  const fresh = names.filter((n) => !already.has(norm(n)));
  if (fresh.length) await store.insert('shopping', fresh.map((name) => ({ name })));
  return fresh.length;
}

const actions = {
  async quick(btn) {
    await store.insert('items', { name: btn.dataset.name });
    await loadAll();
    toast(`${btn.dataset.name} — adăugat`);
  },

  exp(btn) {
    $('#exp').value = isoDate(Number(btn.dataset.days));
  },

  toggle(btn) {
    state.openItem = state.openItem === btn.dataset.id ? null : btn.dataset.id;
    render();
  },

  async done(btn) {
    await store.remove('items', [btn.dataset.id]);
    state.openItem = null;
    await loadAll();
  },

  async 'done-shop'(btn) {
    const it = state.items.find((i) => i.id === btn.dataset.id);
    await addToShopping([it.name]);
    await store.remove('items', [it.id]);
    state.openItem = null;
    await loadAll();
    toast(`${it.name} — pe lista de cumpărături`);
  },

  async check(btn) {
    const s = state.shopping.find((x) => x.id === btn.dataset.id);
    await store.update('shopping', s.id, { done: !s.done });
    await loadAll();
  },

  async delshop(btn) {
    await store.remove('shopping', [btn.dataset.id]);
    await loadAll();
  },

  // Bucla completă: cumperi → bifezi → ajunge în frigider.
  async 'to-fridge'() {
    const bought = state.shopping.filter((s) => s.done);
    await store.insert('items', bought.map((s) => ({ name: s.name })));
    await store.remove('shopping', bought.map((s) => s.id));
    await loadAll();
    toast(`${bought.length} ${bought.length === 1 ? 'produs mutat' : 'produse mutate'} în frigider`);
  },

  async 'clear-checked'() {
    await store.remove('shopping', state.shopping.filter((s) => s.done).map((s) => s.id));
    await loadAll();
  },

  async 'add-missing'(btn) {
    const n = await addToShopping(JSON.parse(btn.dataset.names));
    await loadAll();
    toast(n ? 'Am pus pe listă ce lipsește' : 'Erau deja pe listă');
  },

  async 'copy-claude'() {
    if (!state.items.length) { toast('Frigiderul e gol'); return; }
    try {
      await navigator.clipboard.writeText(claudePrompt(state.items, daysLeft));
      toast('Copiat. Deschide Claude și lipește.');
    } catch {
      // Dacă telefonul nu permite copierea automată, afișăm textul.
      state.showPrompt = true;
      render();
      toast('Selectează textul și copiază-l manual');
    }
  },

  async delquick(btn) {
    await store.remove('quick_items', [btn.dataset.id]);
    await loadAll();
  },

  async logout() {
    await store.signOut();
    state.user = null;
    state.loginStep = 'email';
    render();
  },

  filter(btn) {
    state.recipeFilter = btn.dataset.f;
    state.showPrompt = false;
    render();
  },

  'other-email'() {
    state.loginStep = 'email';
    render();
  },
};

// -------------------------------------------------------------
// Formulare
// Fiecare formular are id="numele-funcției".
// -------------------------------------------------------------
const forms = {
  async addItem(data) {
    const name = data.name.trim();
    if (!name) return;
    await store.insert('items', {
      name,
      quantity: data.qty.trim() || null,
      expires_on: data.exp || null,
    });
    await loadAll();
    toast(`${name} — adăugat`);
  },

  async addShop(data) {
    const name = data.name.trim();
    if (!name) return;
    const n = await addToShopping([name]);
    await loadAll();
    if (!n) toast('E deja pe listă');
    $('#addShop input')?.focus(); // ca să poți scrie următorul produs imediat
  },

  async addQuick(data) {
    const name = data.name.trim();
    if (!name) return;
    if (state.quick.some((q) => norm(q.name) === norm(name))) { toast('Există deja'); return; }
    await store.insert('quick_items', { name });
    await loadAll();
  },

  async login(data) {
    state.loginEmail = data.email.trim();
    await store.sendCode(state.loginEmail);
    state.loginStep = 'code';
    render();
  },

  async code(data) {
    state.user = await store.verifyCode(state.loginEmail, data.code.trim());
    await startSession();
  },
};

// -------------------------------------------------------------
// Legăm evenimentele (o singură dată, pe tot ecranul)
// -------------------------------------------------------------

view.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn || !actions[btn.dataset.action]) return;
  e.preventDefault();
  btn.disabled = true; // împiedică dublul tap
  try {
    await actions[btn.dataset.action](btn);
  } catch (err) {
    console.error(err);
    toast('Eroare: ' + (err.message || err));
  } finally {
    btn.disabled = false;
  }
});

view.addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const data = Object.fromEntries(new FormData(form));
  try {
    await forms[form.id]?.(data, form);
  } catch (err) {
    console.error(err);
    toast('Eroare: ' + (err.message || err));
  }
});

// Ținem minte ce rețete sunt deschise, ca să rămână deschise după redesenare.
view.addEventListener('toggle', (e) => {
  const d = e.target;
  if (!d.matches?.('details.recipe')) return;
  if (d.open) state.openRecipes.add(d.dataset.id);
  else state.openRecipes.delete(d.dataset.id);
}, true);

tabsEl.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-tab]');
  if (!btn) return;
  state.tab = btn.dataset.tab;
  state.openItem = null;
  state.showPrompt = false;
  render();
  window.scrollTo(0, 0);
});

// -------------------------------------------------------------
// Pornire
// -------------------------------------------------------------

async function startSession() {
  if (!(await store.isMember())) {
    await store.signOut();
    state.user = null;
    state.loginStep = 'email';
    render();
    toast('Emailul ăsta nu e pe lista casei');
    return;
  }
  // Rețetele private se pot citi doar după login.
  try {
    state.recipes = [...state.publicRecipes, ...(await store.privateRecipes())];
  } catch (err) {
    console.error(err);
    state.recipes = state.publicRecipes;
  }
  await loadAll();
  if (!startSession.listening) {
    startSession.listening = true;
    await store.onChange(() => loadAll(false).catch(console.error));
  }
}

async function init() {
  $('#mode').textContent = store.isDemo ? 'mod demo' : '';

  // Când revii în aplicație (după ce a stat în fundal), reîncărcăm datele.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && (store.isDemo || state.user)) {
      loadAll(false).catch(console.error);
    }
  });

  try {
    state.publicRecipes = state.recipes = await loadRecipes();
  } catch (err) {
    console.error(err);
  }

  if (!store.isDemo) {
    state.user = await store.getUser();
    if (!state.user) { render(); return; }
  }
  await startSession();
}

init().catch((err) => {
  console.error(err);
  view.innerHTML = `<p class="card">Nu am putut porni aplicația: ${esc(err.message || err)}</p>`;
});
