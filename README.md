# Frigiderul nostru

Aplicație pentru doi: ce avem în frigider, ce trebuie cumpărat și ce putem găti cu ce avem.
Merge pe iPhone ca o aplicație obișnuită (de pe ecranul principal), fără App Store, și e gratuită.

**Ce face:**
- **Frigider**: adaugi produse cu o atingere (butoane rapide) sau le scrii. Data de expirare e opțională, iar produsele care expiră primele apar sus.
- **Terminat + pe listă**: când se termină ceva, ajunge direct pe lista de cumpărături.
- **Cumpărături**: listă comună. Bifezi în magazin, apoi „Pune bifatele în frigider".
- **Rețete**: 25 de rețete simple, potrivite automat cu ce aveți. Vezi ce poți găti acum și ce îți lipsește pentru altele (cu un buton care pune lipsurile pe listă).
- **Copiază lista pentru Claude**: copiază ce aveți în frigider, gata de lipit în Claude ca să primești rețete noi.

---

## 1. Încearcă imediat (mod demo)

Fără nicio configurare, aplicația pornește în **mod demo**: datele stau doar pe dispozitivul pe care o deschizi.
E bun ca s-o încerci, dar tu și soția nu veți vedea aceleași date. Pentru asta e pasul 2.

Pe calculator, din folderul proiectului:

```bash
python3 -m http.server 8000
```

apoi deschide http://localhost:8000.

## 2. Date comune pentru amândoi (Supabase, gratuit)

Supabase este baza de date în care stau datele voastre. Planul gratuit ajunge cu mult peste ce vă trebuie.

1. Creează un proiect nou în Supabase (regiune: Frankfurt / Central EU). Parola bazei de date pune-o într-un loc sigur; aplicația nu are nevoie de ea.
2. Deschide `supabase/schema.sql` și **înlocuiește cele două emailuri** de la pasul 1 cu adresele voastre.
3. În Supabase: **SQL Editor → New query** → lipește tot fișierul → **Run**.
4. Tot în SQL Editor, rulează pe rând **`supabase/v2.sql`** (cămară, congelator, raioane), apoi conținutul fișierului **`retete-plan.sql`** (rețetele din planul nutrițional) → **Run**. Fișierul ăsta nu e în repo, intenționat.
5. **Conturile voastre** (login cu email și parolă, fără emailuri trimise):
   - **Authentication → Users → Add user → Create new user**: emailul tău, o parolă, bifă pe **Auto Confirm User** → **Create user**. La fel pentru soție.
   - **Authentication → Sign In / Providers**: dezactivează **Allow new users to sign up**, ca nimeni altcineva să nu-și poată face cont.
6. Butonul **Connect** din partea de sus a proiectului (sau **Project Settings → API Keys**): copiază **Project URL** și cheia **publishable** în `js/config.js`.

Despre cheia din `config.js`: e făcută să fie publică, deci poate sta într-un repo public.
Datele sunt protejate de regulile din `schema.sql`: doar emailurile din tabelul `members` au acces.

**De știut despre planul gratuit Supabase:**
- Proiectele gratuite se pun pe pauză dacă nu sunt folosite o săptămână. Folosită zilnic, aplicația nu are problema asta; dacă se întâmplă, repornești proiectul din panoul Supabase.
- Dacă uitați o parolă: în **Authentication → Users** ștergeți contul și îl creați din nou cu o parolă nouă. Datele din frigider nu se pierd (sunt ale casei, nu ale contului).

### Ce e public și ce e privat

- **Public (repo-ul de pe GitHub):** codul și cele 25 de rețete generale din `data/recipes.json`.
- **Privat (doar în Supabase, vizibil doar pentru voi doi după login):** frigiderul, lista de cumpărături și rețetele din planul nutrițional.
- `data/recipes-plan.json` și `supabase/retete-plan.sql` sunt trecute în `.gitignore`, ca să nu ajungă din greșeală pe GitHub.

## 3. Publică pe GitHub Pages

1. Pune proiectul într-un repo pe GitHub.
2. Repo → **Settings → Pages** → Source: **Deploy from a branch** → Branch: `main`, folder `/ (root)` → Save.
3. După 1–2 minute aplicația e la `https://<utilizator>.github.io/<repo>/`.

## 4. Instalează pe iPhone (amândoi)

1. Deschide adresa de mai sus în **Safari**.
2. Butonul **Partajează** → **Adaugă pe ecranul principal**.
3. Deschide aplicația de pe ecranul principal și intră cu emailul și parola. Rămâi logat până apeși Deconectare.

---

## Cum e construit codul

Fără framework și fără „build": doar HTML, CSS și JavaScript, ca să poți citi fiecare fișier de la cap la coadă.

```
index.html            scheletul paginii: antet, zona de conținut, bara de jos
css/style.css         aspectul, inclusiv modul întunecat
js/config.js          adresa și cheia Supabase (goale = mod demo)
js/store.js           stratul de date: citește și scrie în localStorage SAU în Supabase
js/app.js             ecranele, butoanele și formularele
js/recipes.js         potrivirea rețetelor cu ce e în frigider
js/aisles.js          raioanele din magazin și unde ajunge fiecare produs cumpărat
data/recipes.json     rețetele generale, publice (le poți edita sau adăuga)
supabase/schema.sql   tabelele și regulile de acces
supabase/v2.sql       completarea pentru cămară, congelator și raioane
manifest.json, icons/ ce face pagina să se instaleze ca aplicație
```

**Ordinea în care merită citit:**

1. **`js/store.js`**. Aici e cea mai importantă idee: aceleași funcții (`list`, `insert`, `update`, `remove`) există în două variante, una locală și una Supabase. Restul aplicației nu știe care e folosită. De aceea modul demo și modul real folosesc același cod.
2. **`js/app.js`**, începând cu comentariul de sus. Totul se învârte în jurul a trei lucruri:
   - `state`: toate datele de pe ecran;
   - `render()`: redesenează ecranul din `state`;
   - `actions` și `forms`: ce se întâmplă la apăsarea unui buton sau la trimiterea unui formular. Fiecare buton are `data-action="nume"`, care corespunde unei funcții din `actions`.
3. **`js/recipes.js`**: cum se decide că „Roșii cherry" din frigider se potrivește cu ingredientul „Roșii" (litere mici, fără diacritice, apoi caută cuvinte care încep la fel).
4. **`supabase/schema.sql`**: tabelele și regulile de acces (Row Level Security), care decid cine are voie să vadă datele.

**Sincronizarea dintre telefoane:** Supabase anunță aplicația imediat ce celălalt modifică ceva (`onChange` în `store.js`). Aplicația reîncarcă datele și redesenează ecranul. Dacă tocmai scrii într-un câmp, redesenarea așteaptă până termini, ca să nu-ți șteargă textul.

### Cum adaugi o rețetă

În `data/recipes.json`, după modelul celorlalte:

```json
{
  "id": "nume-unic",
  "nume": "Numele rețetei",
  "timp": 20,
  "ingrediente": [
    { "n": "Ouă", "q": "3", "k": ["ou"] },
    { "n": "Ciuperci", "q": "200 g", "k": ["ciuperc"], "opt": true }
  ],
  "camara": ["sare", "ulei"],
  "pasi": ["Pasul 1.", "Pasul 2."]
}
```

- `k`: cuvintele după care se recunoaște produsul în frigider, cu litere mici și fără diacritice. Merge și doar începutul cuvântului: `ciuperc` prinde „Ciuperci champignon".
- `opt: true`: ingredient opțional, care nu blochează rețeta.
- `camara`: ce presupunem că aveți deja în casă. Nu se verifică.

Rețetele din planurile nutriționale (în Supabase, tabelul `recipes`) au în plus `"sursa": "plan"`, `"masa"` (Mic dejun, Prânz, Cină…), `"portii"` și, unde e cazul, `"note"`. Cantitățile sunt cele din plan, pentru o porție. În ecranul Rețete le vezi separat, cu butonul „Din planul nutrițional”.

---

## Ce urmează

- Rețete generate direct în aplicație și poză la bon (folosesc aceeași funcție pe server și un cont Claude API).
- Notificare dimineața când ceva expiră.
