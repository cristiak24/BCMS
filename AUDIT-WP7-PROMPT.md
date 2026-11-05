# WP7 — Ce a rămas din auditul BCMS din 15 oct. 2026

Lucrezi la pachetul **WP7** din auditul BCMS: punctele care n-au intrat în WP1–WP6B, plus o lucrare rămasă nepublicată. Scrie-mi în română.

## Context
- BCMS: aplicație de management pentru cluburi de baschet. Monorepo cu npm workspaces:
  - `apps/server`: Express 5, Drizzle, Clerk; teste `node:test` prin tsx, inclusiv `*.int.test.ts` pe PGlite.
  - `apps/client`: React 19 + Vite, cu shim React Native pentru web.
  - `e2e/`: Playwright; Clerk e simulat **doar** aici.
- Producția: Render (API) + Cloudflare (bcms.ro). Deploy automat la push pe `feat/mobile-responsive-and-dark-mode`, iar CI-ul (`.github/workflows/ci.yml`) rulează porțile la fiecare push.
- Pe 19 oct., WP1–WP6B sunt toate live (`bae596d`), iar migrațiile 0024, 0026, 0027 și 0028 sunt pe Neon.
- Fișiere de citit întâi, căi absolute (sunt necomise, deci în worktree nu există):
  - `/Users/baramariuscristianvalentin/BCMS/AUDIT-2026-10-15.md`: dovezile, cu ID-uri (P1-x, R3-x, rundele 2–5);
  - `/Users/baramariuscristianvalentin/BCMS/AUDIT-FIX-PROMPT.md`: secțiunile „Context”, „Reguli obligatorii”, „Cum verifici în browser fără Clerk”, „Ce NU face”, „Raportul final”. Respectă-le.
- Memoria proiectului (MEMORY.md) are regulile neevidente: ore UTC, `parseApiDate`, `coachSeesPlayer`, rata de prezență pe 30 de zile, `lazyRoute`, harness-ul de previzualizare, E2E.

## Reguli specifice WP7
- **Lucrează într-un worktree nou, pornit din `origin/feat/mobile-responsive-and-dark-mode`.** Checkout-ul principal are modificări necomise mai vechi (invitații pe 4 roluri, migrația 0023 `access_requests.team_id`), care nu sunt ale tale: nu-l atinge deloc, nici `git pull`, nici `git stash`.
- **Pas 0:** pentru fiecare punct, verifică întâi pe codul actual dacă e încă valabil (unele pot fi rezolvate în treacăt de WP4–WP6). Marchează-l „deja rezolvat” cu dovada și treci mai departe.
- **[DECIZIE]** = întreabă-mă înainte să implementezi; pune toate întrebările într-un singur mesaj, la început, cu o recomandare pentru fiecare.
- Orice text nou din UI e în română și folosește `plural()`, `parseApiDate`, `playerStatusLabel()`, deja existente.
- Fiecare bug reparat are un test care pică pe codul vechi și trece pe cel nou.
- Porțile trebuie să fie verzi:
  - server: `tsc` + `npm test`, și cu `TZ=UTC`;
  - client: `tsc` + `npm test` + `build:web`;
  - `npm run lint`: 0 erori;
  - `npm run test:e2e`.
- Verifică fiecare ecran schimbat la 375 și 1280 px, în ambele teme.
- **Fără push și fără modificări pe Neon.** Dacă e nevoie de o migrație, scrie-o, folosește următorul număr liber (0023 e rezervat pentru lucrarea din checkout-ul principal; 0025 pentru punctul A), iar raportul spune exact ce trebuie rulat.
- Commit-uri cu căi explicite, grupate pe secțiunile A–G.

## A. Lucrare nepublicată: `feat/team-code-switch`
- Branch-ul local `feat/team-code-switch` (worktree `.claude/worktrees/team-code-switch`) are 2 commit-uri care n-au ajuns niciodată pe origin: `3a29425` (codul de echipă se poate opri și reporni fără să fie rotit) și `9247a38` (redenumirea migrației).
- Migrația lui e **deja aplicată pe Neon**, dar fișierul se numește `0024_team_join_code_switch.sql`, iar 0024 e ocupat pe origin de migrația legal/GDPR → redenumește-l `0025_team_join_code_switch.sql`, fără să schimbi conținutul.
- La unire apare un conflict în `apps/client/components/family/FamilyRequestsPanel.tsx`, atins între timp de WP4B (R3-7: „Jucător nou” implicit, avertisment la potrivire). Păstrează ambele comportamente.
- Verifică prin citire (doar SELECT) că pe Neon coloana din migrație există, ca să confirmi că nu mai e nimic de rulat.

## B. Prezență
1. **Statusurile „Întârziat” și „Medical”** există în backend, dar UI-ul oferă doar Prezent/Absent/Motivat (admin: `components/schedule/AttendanceTab.tsx`; antrenor: `app/(coach)/attendance.tsx`). Adaugă „Întârziat” și afișează-l și la jucător (R3-18). Verifică ce înseamnă azi „Motivat” vs „medical”/„excused”, ca să nu rămână două statusuri pentru același lucru.
2. **Prezența la evenimente din viitor** e acceptată (runda 2, P2). Serverul o refuză pentru un eveniment care n-a început (cu o marjă, de ex. din ziua evenimentului, ora României), iar UI-ul nu oferă notarea.
3. **[DECIZIE] R3-6:** la antrenor prezența se salvează instant, la admin cere „Salvează”. Propune un singur comportament.
4. **Ordinea sesiunilor la antrenor (Prezență):** 16 oct., 25 oct., apoi 8 oct. → viitoarele și trecutele separate, fiecare grup sortat.

## C. Scorer și statistici
1. Un meci programat pe 25 oct. poate fi pornit și încheiat pe 16 oct. → confirmare explicită dacă pornești un meci cu mai mult de o zi înainte de data lui.
2. **După „Final” meciul nu se mai poate corecta.** Adminul poate redeschide meciul (audit + recalcularea scorului din acțiuni, ca la încheiere).
3. La un meci încă gol, scorer-ul arată imediat „1 acțiune salvată pe telefon” (observat în WP4A).
4. **[DECIZIE]** Statistici de sezon pe jucător (medii și totaluri din `game_stats` încheiate), pe profilul jucătorului și pe pagina echipei. Propune întâi forma, apoi implementează dacă accept.

## D. Jurnal (audit log)
Jurnalul promite „roluri, taxe, documente și plăți”, dar scrie doar conturi, familii, plăți și confidențialitate (`writeAuditLog` nu e apelat din rutele de evenimente, prezență, meciuri și documente). Adaugă intrări pentru:
- eveniment creat, editat sau șters;
- prezență salvată (o intrare pe sesiune, nu pe jucător);
- meci încheiat sau redeschis;
- document încărcat sau șters;
- jucător adăugat sau scos din echipă.

Verifică și filtrele din UI-ul jurnalului.

## E. Validări și bug-uri mici
1. Un eveniment cu durata de 10 ani e acceptat → limită rezonabilă (de ex. maximum 31 de zile; cantonamentele sunt multi-zi).
2. `/players/search?q=a` → 400 „query is required”; mesajul corect e „Scrie cel puțin 2 caractere”.
3. `/games/assigned` pentru un cont fără profil: `Number(req.user?.id)` → NaN în SQL → 500 (`routes/games.ts`). Trebuie să întoarcă `[]`.
4. **Cont fără profil în DB:** `fetchMeFromBackend` reîncearcă de 10 ori pe 404 (~10 s de spinner) (`context/AuthContext.tsx:108`) → 1–2 încercări, apoi un mesaj clar („contul nu e asociat cu un club”).
5. Mesajele de validare de la editarea jucătorului vin în engleză.
6. Contabilul vede butonul „Șterge evenimentul” (`app/(admin)/event/[id].tsx`), deși serverul îl refuză. Același lucru pentru alte butoane pe care serverul le refuză rolului (verifică pagina evenimentului).
7. Plățile cu doar dată (cash) afișează și o oră („03:00”) → doar data.
8. `medicalStatus()` citește data vizei cu `new Date`, nu cu `parseApiDate`/`toCalendarDay` (problemă de fus orar, de tip WP3).
9. `ThemedCheckbox` are culori fixe care nu urmează tema închisă.
10. Adăugarea în bloc: duplicatele sărite nu sunt anunțate („2 adăugați, 1 sărit: există deja”).
11. În tema luminoasă, butonul de meniu negru plin e prea greu vizual (runda 2). Respectă stilul din memoria `feedback-decorated-ui`.

## F. Securitate și backend
1. **[DECIZIE] Echipă fără antrenor:** `coachManagesTeam` (`lib/coachScope.ts:21`) dă acces de **scriere** oricărui antrenor la echipele fără antrenor alocat. Variante: (a) doar adminul scrie la echipele fără antrenor; (b) antrenorul poate doar citi și „revendica”, cu aprobarea adminului; (c) rămâne așa. Atenție: WP4A a construit vizibilitatea pe aceeași regulă (antrenorul vede sesiunile echipelor fără antrenor).
2. `getRequesterEmail` din `routes/finance.ts` reverifică JWT-ul deja verificat de `authenticate` → folosește `req.firebaseUser`/`req.user`.
3. Invitația când emailul eșuează: adminul primește doar „RESEND_API_KEY is missing”. Rezervă: „Copiază linkul invitației” (fără să lași invitații orfane; azi se revocă automat).

## G. Deploy și reîncărcarea după deploy
1. **E2E-1:** la reîncărcarea după un chunk vechi, ecranul de eroare apare o clipă (~1 din 8 rulări). Cauza: `src/lazyRoute.ts` face `preventDefault()` pe `vite:preloadError`, iar importul se rezolvă cu `undefined`. Repară și transformă testul `fixme` din `e2e/specs/08-deploy*` într-un test normal, stabil (rulează-l de cel puțin 10 ori).
2. **[DECIZIE] 404 real pentru `/assets/*`:** propunerea WP6B e un Worker Cloudflare (`run_worker_first = ["/assets/*"]`). Implementează doar cu acordul meu și **nu** atinge `wrangler.toml`/`_headers` fără el.
3. **[DECIZIE] CSP complet:** azi e în Report-Only. Spune-mi ce ar trebui verificat înainte de activare.

## Doar propuneri, în raport (nu implementa)
Pentru fiecare: cost, risc, beneficiu, ordine recomandată.
- Cache de date în client (TanStack Query, deja în bundle prin Clerk) și un endpoint agregat pentru Acasă.
- API pe același domeniu (`bcms.ro/api/*` prin Cloudflare către Render).
- Fișierele din Postgres (`bytea`) mutate în Cloudflare R2.
- Webhook-ul Stripe `account.updated`.
- `packages/shared` pentru `computeBoxScore` și DTO-uri (vezi propunerea WP6B).
- Redenumirea `firebaseUid` doar în TypeScript (vezi propunerea WP6B).
- `timestamptz` la resetarea bazei.
- Render plătit, în locul `wakeServer()`.
- Clientul publicat pe Cloudflare doar după CI. Pe Render, API-ul așteaptă deja CI-ul („After CI checks pass”, setat pe 19 oct.), dar bcms.ro se publică imediat la push. Variante: publicare prin `wrangler deploy` dintr-un job GitHub Actions care depinde de joburile CI, sau o setare echivalentă în Cloudflare.
- Taxe proporționale pentru jucătorii înscriși în mijlocul lunii.
- R3-19: jucătorul nu are niciun canal către antrenor când acesta nu și-a pus numărul.

## Gata =
- A–G implementate, marcate „deja rezolvat” sau lăsate în așteptarea deciziei mele.
- Teste noi și porțile verzi (inclusiv lint și E2E).
- Capturi verificate.
- Commit-uri locale pe un branch `fix/wp7-leftovers`.
- Raport final cu: ce s-a schimbat, ce migrații trebuie rulate pe Neon (dacă există), ce a rămas și propunerile.
