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
  const res = await fetch('data/recipes.json');
  if (!res.ok) throw new Error('Nu am putut încărca rețetele');
  return res.json();
}

// Caută în frigider un produs care se potrivește cu un ingredient.
function findInFridge(fridge, keys) {
  return fridge.find((item) => keys.some((k) => new RegExp('\\b' + k).test(item.n)));
}

/**
 * Împarte rețetele în:
 *   ready  — ai tot ce trebuie din frigider
 *   almost — îți lipsesc 1–2 ingrediente din frigider
 * Primele în listă sunt cele care folosesc produse care expiră în
 * cel mult 2 zile, apoi cele care folosesc cele mai multe produse.
 */
export function matchRecipes(recipes, items, daysLeft) {
  const fridge = items.map((it) => ({ n: norm(it.name), d: daysLeft(it.expires_on) }));

  const scored = recipes.map((r) => {
    const ing = r.ingrediente.map((i) => {
      const hit = findInFridge(fridge, i.k);
      return { ...i, ai: Boolean(hit), expira: Boolean(hit && hit.d !== null && hit.d <= 2) };
    });
    return {
      ...r,
      ing,
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
  const lines = items.map((it) => {
    const d = daysLeft(it.expires_on);
    let exp = '';
    if (d !== null) exp = d < 0 ? ' — expirat' : d === 0 ? ' — expiră azi' : ` — expiră în ${d} zile`;
    return `- ${it.name}${it.quantity ? ` (${it.quantity})` : ''}${exp}`;
  });
  return [
    'Ce avem acum în frigider:',
    ...lines,
    '',
    'Propune-ne 3 rețete pentru 2 persoane, în română, care folosesc întâi produsele care expiră curând.',
    'Presupune că avem în cămară ingrediente de bază: ulei, sare, piper, făină, zahăr, orez, paste, ceapă, usturoi, cartofi.',
    'Pentru fiecare rețetă: timpul, ingredientele cu cantități, pașii pe scurt și ce ne lipsește.',
  ].join('\n');
}
