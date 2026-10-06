// =============================================================
// REȚETE
// -------------------------------------------------------------
// Rețetele stau în data/recipes.json. Cele cu "sursa": "plan" vin
// din planurile nutriționale (cantități pentru o porție, câmpurile
// "masa", "portii" și "note" în plus). Fiecare ingredient are o
// listă de cuvinte-cheie ("k") fără diacritice. Un produs din
// frigider se potrivește cu un ingredient dacă unul dintre
// cuvintele produsului începe cu un cuvânt-cheie.
//   Exemplu: produsul „Roșii cherry" → „rosii cherry"
//            cuvântul-cheie „rosi" → se potrivește.
//
// Ingredientele din cămară (orez, ceapă, ulei...) nu se urmăresc:
// presupunem că le aveți și doar le afișăm.
// =============================================================

// „Ouă Proaspete" → „oua proaspete": litere mici, fără diacritice.
export function norm(s) {
  return String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();
}

export async function loadRecipes() {
  const res = await fetch('data/recipes.json?v=3');
  if (!res.ok) throw new Error('Nu am putut încărca rețetele');
  return res.json();
}

// Caută în frigider un produs care se potrivește cu un ingredient.
function findInFridge(fridge, keys) {
  return fridge.find((item) => keys.some((k) => new RegExp('\\b' + k).test(item.n)));
}

// Primul cuvânt al produsului din cămară, fără ultima literă, ca să
// prindă și pluralul: „Cartofi" → „cartof", „Ceapă" → „ceap".
function pantryStem(name) {
  const w = norm(name).split(/\s+/)[0] || '';
  if (w.length < 3) return null;
  return w.length > 4 ? w.slice(0, -1) : w;
}

// Un rând „din cămară" (ex. „100 g Orez integral") e bifat dacă un produs
// din cămară începe un cuvânt din rând. null = nu urmăriți cămara deloc.
function inPantry(pantry, line) {
  if (!pantry.length) return null;
  const t = norm(line);
  return pantry.some((stem) => new RegExp('(^|[\\s(])' + stem).test(t));
}

/**
 * Împarte rețetele în:
 *   ready  — ai tot ce trebuie (frigider, congelator sau cămară)
 *   almost — îți lipsesc 1–2 ingrediente
 * Primele în listă sunt cele care folosesc produse care expiră în
 * cel mult 2 zile, apoi cele care folosesc cele mai multe produse.
 */
export function matchRecipes(recipes, items, daysLeft) {
  // Toate produsele (frigider, congelator, cămară) contează ca „ai".
  const fridge = items.map((it) => ({ n: norm(it.name), d: daysLeft(it.expires_on) }));
  // Pentru ingredientele „din cămară" verificăm doar produsele din cămară.
  const pantry = items.filter((it) => it.location === 'camara').map((it) => pantryStem(it.name)).filter(Boolean);

  const scored = recipes.map((r) => {
    const ing = r.ingrediente.map((i) => {
      const hit = findInFridge(fridge, i.k);
      return { ...i, ai: Boolean(hit), expira: Boolean(hit && hit.d !== null && hit.d <= 2) };
    });
    return {
      ...r,
      ing,
      camaraAi: r.camara.map((line) => inPantry(pantry, line)),
      missing: ing.filter((i) => !i.ai && !i.opt),
      have: ing.filter((i) => i.ai).length,
      folosesteCeExpira: ing.some((i) => i.expira),
    };
  });

  // Rețetele din plan nu au timp trecut; le punem după cele cu timp.
  const timp = (r) => r.timp ?? 999;
  const order = (a, b) =>
    (b.folosesteCeExpira - a.folosesteCeExpira) || (b.have - a.have) || (timp(a) - timp(b));

  return {
    // „have > 0": o rețetă doar din cămară (ex. un sos) nu spune nimic
    // despre ce e în frigider, deci nu o punem la „Poți găti acum".
    ready: scored.filter((r) => r.missing.length === 0 && r.have > 0).sort(order),
    almost: scored.filter((r) => r.missing.length > 0 && r.missing.length <= 2 && r.have > 0).sort(order),
    all: scored,
  };
}

// Ordinea meselor în lista rețetelor din planul nutrițional.
export const MESE = ['Mic dejun', 'Mic dejun / Cină', 'Prânz', 'Prânz / Cină', 'Cină', 'Sosuri și garnituri'];

// Textul pe care îl lipești în Claude ca să primești rețete noi.
export function claudePrompt(items, daysLeft) {
  const line = (it) => {
    const d = daysLeft(it.expires_on);
    let exp = '';
    if (d !== null) exp = d < 0 ? ' — expirat' : d === 0 ? ' — expiră azi' : ` — expiră în ${d} zile`;
    return `- ${it.name}${it.quantity ? ` (${it.quantity})` : ''}${exp}`;
  };
  const group = (loc, title) => {
    const list = items.filter((it) => (it.location || 'frigider') === loc);
    return list.length ? [title, ...list.map(line), ''] : [];
  };
  const tracksPantry = items.some((it) => it.location === 'camara');
  return [
    ...group('frigider', 'Ce avem acum în frigider:'),
    ...group('congelator', 'În congelator:'),
    ...group('camara', 'În cămară:'),
    'Propune-ne 3 rețete pentru 2 persoane, în română, care folosesc întâi produsele care expiră curând.',
    tracksPantry
      ? 'Presupune că avem și sare, piper și condimente de bază.'
      : 'Presupune că avem în cămară ingrediente de bază: ulei, sare, piper, făină, zahăr, orez, paste, ceapă, usturoi, cartofi.',
    'Pentru fiecare rețetă: timpul, ingredientele cu cantități, pașii pe scurt și ce ne lipsește.',
  ].join('\n');
}
