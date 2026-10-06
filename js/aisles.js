// =============================================================
// RAIOANE ȘI LOCURI DE DEPOZITARE
// -------------------------------------------------------------
// 1. RAIOANE: grupăm lista de cumpărături ca în magazin.
//    Fiecare raion are o listă de începuturi de cuvinte (fără
//    diacritice). „rosi" prinde „Roșii cherry", „ciuperc" prinde
//    „Ciuperci champignon".
//    Regulile se verifică în ordinea din RULES; prima care se
//    potrivește câștigă. De aceea expresiile mai precise
//    („fasole verde", „lapte de cocos") stau sus.
//
// 2. Când mutați un produs în alt raion, alegerea se salvează în
//    tabelul `aisles` și are prioritate față de reguli.
//
// 3. Locul de depozitare (frigider / congelator / cămară) pentru
//    produsele cumpărate se deduce tot din raion.
// =============================================================

import { norm } from './recipes.js';

// Ordinea în care apar raioanele în listă (drumul obișnuit prin magazin).
export const AISLES = [
  'Legume și fructe',
  'Brutărie',
  'Lactate și ouă',
  'Mezeluri',
  'Carne și pește',
  'Congelate',
  'Băcănie',
  'Dulciuri',
  'Băuturi',
  'Casă',
  'Altele',
];

const RULES = [
  // expresii precise, verificate primele
  ['Congelate', ['congelat', 'inghetat']],
  ['Legume și fructe', ['fasole verde', 'suc de lamai', 'suc lime']],
  ['Băcănie', ['lapte de cocos', 'lapte cocos', 'lapte de orez', 'lapte de ovaz', 'lapte de soia', 'lapte de migdal',
    'lapte vegetal', 'pasta de tomate', 'fulgi de drojdie', 'ton ', 'sos ']],
  ['Casă', ['pasta de dinti', 'hartie', 'servetel', 'detergent', 'burete', 'sapun', 'sampon', 'saci', 'folie',
    'solutie', 'balsam de rufe']],
  // pe raioane
  ['Legume și fructe', ['rosi', 'castravet', 'ardei', 'ceap', 'usturoi', 'cartof', 'morcov', 'telin', 'patrunjel',
    'marar', 'leustean', 'salata', 'spanac', 'rucola', 'valerian', 'varz', 'conopid', 'broccoli', 'brocoli',
    'dovlecel', 'zucchini', 'vanat', 'praz', 'ciuperc', 'avocado', 'lamai', 'lime', 'mere', 'mar ', 'pere',
    'banan', 'portocal', 'mandarin', 'strugur', 'capsun', 'afin', 'zmeur', 'piersic', 'pepene', 'kiwi',
    'vinete', 'gulie', 'sparanghel', 'menta', 'coriandru', 'pastarnac', 'ridich', 'sfecl', 'fructe', 'legume', 'smochin',
    'curmal', 'rodi', 'ghimbir']],
  ['Brutărie', ['paine', 'chifl', 'lipi', 'baghet', 'corn', 'croissant', 'wasa', 'tortilla', 'franzel']],
  ['Lactate și ouă', ['ou', 'oua', 'lapte', 'iaurt', 'skyr', 'kefir', 'sana', 'smantan', 'unt', 'branz', 'telemea',
    'cascaval', 'mozzarella', 'parmezan', 'feta', 'cottage', 'almette', 'urda', 'mascarpone', 'ricotta', 'cheddar',
    'gouda', 'emmentaler', 'frisca']],
  ['Mezeluri', ['sunca', 'salam', 'parizer', 'crenvurst', 'carnat', 'carnati', 'bacon', 'kaiser', 'pastrama',
    'costita', 'pate']],
  ['Carne și pește', ['pui', 'piept', 'pulp', 'porc', 'vita', 'vitel', 'vacuta', 'curcan', 'tocat', 'carne', 'ficat',
    'cotlet', 'muschi', 'somon', 'peste', 'pastrav', 'cod', 'creveti', 'rasol', 'miel', 'gaina']],
  ['Băcănie', ['orez', 'paste', 'spaghet', 'faina', 'zahar', 'sare', 'piper', 'ulei', 'otet', 'malai', 'ovaz',
    'fulgi', 'quinoa', 'couscous', 'cous', 'naut', 'fasole', 'linte', 'conserv', 'bulion', 'pasat', 'ketchup',
    'mustar', 'maion', 'miere', 'gem', 'dulceat', 'condiment', 'boia', 'oregano', 'cimbru', 'chimion', 'tahini',
    'masline', 'porumb', 'cafea', 'ceai', 'cacao', 'chia', 'nuci', 'migdal', 'seminte', 'drojdie', 'tait',
    'merisoare', 'stafide', 'cereale', 'tahin', 'vanilie', 'scortisoara']],
  ['Dulciuri', ['ciocolat', 'biscuit', 'napolitan', 'chips', 'bomboan', 'prajitur', 'inghetata']],
  ['Băuturi', ['apa', 'suc', 'bere', 'vin', 'cola', 'sirop']],
];

// „Roșii cherry" → caută „rosi" la începutul unui cuvânt.
function matches(text, stem) {
  if (stem.endsWith(' ')) return (' ' + text + ' ').includes(' ' + stem);
  return new RegExp('(^|\\s)' + stem.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(text);
}

// overrides: { 'nume normalizat': 'Raion' } — alegerile voastre salvate.
export function aisleFor(name, overrides = {}) {
  const t = norm(name);
  if (overrides[t]) return overrides[t];
  for (const [aisle, stems] of RULES) {
    if (stems.some((s) => matches(t, s))) return aisle;
  }
  return 'Altele';
}

// -------------------------------------------------------------
// Locuri de depozitare
// -------------------------------------------------------------
export const PLACES = [
  { id: 'frigider', label: 'Frigider', in: 'în frigider' },
  { id: 'congelator', label: 'Congelator', in: 'în congelator' },
  { id: 'camara', label: 'Cămară', in: 'în cămară' },
];

export const placeLabel = (id) => PLACES.find((p) => p.id === id)?.label ?? 'Frigider';
export const placeIn = (id) => PLACES.find((p) => p.id === id)?.in ?? 'în frigider';

// Legume care de obicei NU stau în frigider.
const PANTRY_PRODUCE = ['cartof', 'ceap', 'usturoi', 'banan'];

// Unde ajunge un produs cumpărat. null = nu se pune nicăieri (ex. detergent).
export function placeFor(name, overrides = {}) {
  const aisle = aisleFor(name, overrides);
  const t = norm(name);
  if (aisle === 'Casă') return null;
  if (aisle === 'Congelate') return 'congelator';
  if (['Băcănie', 'Brutărie', 'Dulciuri', 'Băuturi'].includes(aisle)) return 'camara';
  if (aisle === 'Legume și fructe' && PANTRY_PRODUCE.some((s) => matches(t, s))) return 'camara';
  return 'frigider';
}
