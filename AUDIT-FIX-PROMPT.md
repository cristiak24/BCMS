# Prompt pentru agent: repararea problemelor din auditul BCMS

> Copiază tot acest fișier ca prompt pentru o sesiune nouă Claude Code, deschisă în `/Users/baramariuscristianvalentin/BCMS`.
> Poți da agentului tot fișierul, sau doar secțiunile „Context” + „Reguli” + **un singur pachet de lucru** (WP1…WP6). Pachetele sunt gândite să poată rula separat, în sesiuni paralele.

---

## Context

Ești un inginer senior full-stack și lucrezi pe **BCMS** (Basketball Club Management System), o aplicație în producție folosită de cluburi de baschet din România.

- **Stack:** monorepo npm workspaces.
  - `apps/server`: Express 5 + Drizzle ORM + Postgres (Neon în producție, PGlite local), auth prin Clerk (Bearer token), Stripe Connect, Resend pentru email.
  - `apps/client`: React 19 + Vite + un shim React-Native-for-web (`src/web/reactNative.tsx`), Tailwind, Clerk.
- **Deploy automat la push** pe branch-ul `feat/mobile-responsive-and-dark-mode`: serverul pe Render (`bcms-qflv.onrender.com`, rulează în **UTC**), clientul pe Cloudflare Workers (`bcms.ro`).
- **Utilizatori:** admin de club, antrenor (coach), contabil (accountant), părinte (parent, cu 1+ copii), jucător (player), super-admin. Toată interfața e **doar în română**.
- **Raportul complet** cu dovezi, reproduceri și capturi descrise: [`AUDIT-2026-10-15.md`](AUDIT-2026-10-15.md). Citește-l înainte de pachetul tău. ID-urile de mai jos (P0-1, P1-7, R3-4 etc.) trimit la el.

Toate problemele de mai jos au fost **reproduse live** (marcate ✅) pe un server real cu bază locală, sau identificate în cod (🔎). Nimic nu a fost încă reparat.

---

## Reguli obligatorii (încălcarea lor a produs deja incidente)

1. **Nu atinge baza de producție Neon.** Lucrează doar pe PGlite local: `npm run db:local --workspace=apps/server` (cu `-- --reset` pentru o bază curată) și `npm run dev:local --workspace=apps/server`. Testele de integrare (`*.int.test.ts`) rulează pe PGlite în memorie (importă întâi `src/test/pgliteEnv`).
2. **Migrațiile:** fișiere SQL scrise de mână în `apps/server/src/db/migrations/00NN_*.sql` (următorul număr liber; `0023` și `0024` există deja). Actualizează și `src/db/schema.ts`. **Nu aplica nimic pe Neon.** Spune-i utilizatorului ce migrație trebuie aplicată și cere aprobare. Atenție: `db.select().from(t)` aruncă dacă în DB lipsește o coloană declarată în schemă.
3. **Worktree partajat:** în `git status` sunt fișiere modificate care **nu sunt ale tale** (manage-access, accountSignup, inviteSignup, schema.ts, migrația 0023). Nu le atinge, nu folosi `git add -A`. Înainte de commit rulează `git diff --cached --stat` și fă commit cu căi explicite: `git commit -m "…" -- <fișierele tale>`. **Nu face push** fără acordul explicit al utilizatorului (push = deploy în producție).
4. **Porți de calitate, toate verzi înainte de a declara gata:**
   - `cd apps/server && npx tsc --noEmit && npm test`
   - `cd apps/client && npx tsc --noEmit -p . && npm test && npm run build:web`
5. **UI:** doar română, gen neutru. Folosește primitivele din `apps/client/components/ui/` (`Button`, `SelectField`, `ActionSheet`, `ConfirmDialog`, `UnsavedBar`). Verifică fiecare schimbare vizuală la **375 px și 1280 px, în ambele teme** (light/dark). Barele flotante sunt `position: fixed`.
6. **Bani:** orice calcul „cât datorează” trece prin `lib/feeSchedule.ts` + `services/clubFinance.ts`. Sumele sunt `numeric(12,2)`; folosește `roundMoney`, niciodată `Math.round`.
7. **Statistică live:** `computeBoxScore` există de două ori (`apps/server/src/lib/gameStats.ts` și `apps/client/utils/gameStats.ts`), cu teste oglindite. Schimbă-le împreună.
8. **Părinți:** orice endpoint pentru „jucătorul meu” folosește `resolveSelfPlayerForRequest` (`lib/selfPlayer.ts`, header `X-BCMS-Child`), nu `players.email`.
9. **Lot:** orice coloană personală nouă pe `players` intră în `SENSITIVE_ROSTER_FIELDS` (`controllers/playersController.ts`).
10. **Auth:** identitatea vine **doar** din tokenul Bearer verificat (`req.firebaseUser`, care e de fapt identitatea Clerk). Nu ai încredere în nimic din body sau din headere pentru identitate.
11. Scrie un **test care pică înainte de fix și trece după** pentru fiecare bug de logică sau securitate (unit pentru funcții pure, `*.int.test.ts` pentru fluxuri cu DB).
12. Dacă un punct marcat **[DECIZIE]** cere o alegere de produs, întreabă utilizatorul. Nu alege singur.

### Cum verifici în browser fără Clerk (harness de test, totul în scratchpad, nimic în repo)
- **Server:** un script tsx care înlocuiește `apps/server/src/lib/clerkAuth.ts` prin `Module._resolveFilename` cu un modul fals. `verifyBearerToken("test:<email>")` întoarce `{ uid: 'test_' + email, email }`. Apoi `require('<repo>/apps/server/src/app').app.listen(4999)`. Pornește-l cu `TZ=UTC DATABASE_URL=pglite:<scratch>/pg DB_ENVIRONMENT=development RESEND_API_KEY= STRIPE_SECRET_KEY= CLERK_SECRET_KEY=x CORS_ORIGINS=http://localhost:8095`. **`TZ=UTC` e obligatoriu**: așa rulează Render, iar bug-urile de oră apar doar așa.
- **Client:** o configurație Vite în scratchpad (`root: apps/client`, importuri de `vite` și `@vitejs/plugin-react` pe cale absolută din `apps/client/node_modules`, `resolve.dedupe: ['react','react-dom']`) cu un plugin `resolveId` care redirecționează `context/AuthContext` spre un mock. Mock-ul citește `?as=<email>` și setează `setSessionTokenGetter(async () => 'test:' + email)`. Pornește cu `EXPO_PUBLIC_API_URL=http://localhost:4999/api`, prin `preview_start` (intrare temporară în `.claude/launch.json`, restaurată la final cu `git checkout .claude/launch.json`).
- **Conturi din seed-ul local:** `admin@local.test`, `coach@local.test`, `contabil@local.test`, `parinte@local.test`.

---

## WP1 — Securitate (începe cu asta)

### WP1.1 [P0] Preluare de cont prin linkul de invitație ✅
- **Unde:** [invitations.ts:99](apps/server/src/routes/invitations.ts:99); `acceptInvitation` în [invitationsService.ts:414](apps/server/src/services/invitationsService.ts:414); `canAccept` la [:389](apps/server/src/services/invitationsService.ts:389).
- **Problema:** emailul vine din `req.body.email`, nu din identitatea Clerk. Utilizatorul existent e căutat după `firebaseUid OR email` și i se **rescrie `firebaseUid`**, plus nume, rol, club, status. Invitațiile `accepted` rămân acceptabile până la expirare.
- **Reproducere:** invitație pentru `admin2@…` (admin al altui club). Un cont Clerk străin trimite `POST /api/invitations/<token>/accept` cu `{"email":"admin2@…"}` → `/auth/me` al atacatorului = admin al acelui club. Un al doilea atacator refolosește același token și reușește și el.
- **Fix:**
  - email doar din `req.firebaseUser.email`, refuz la nepotrivire;
  - tranziție atomică `pending → accepted` (`UPDATE … WHERE status='pending' RETURNING`), iar `accepted` nu mai e acceptabil;
  - nu relega niciodată un rând `users` care are deja alt `firebaseUid`;
  - modelul corect există deja în [inviteSignup.ts](apps/server/src/lib/inviteSignup.ts).
- **Gata când:** un test `*.int.test.ts` acoperă trei cazuri (email greșit refuzat, reluarea tokenului refuzată, cont existent cu alt uid nerelegat) și toate trec. Corectează și textul emailului de invitație („poate fi folosită o singură dată” trebuie să devină adevărat).

### WP1.2 [P1] Endpoint public care scrie în DB ✅
- **Problema:** `GET /api/invitations/:token` (fără auth, fără rate limit) apelează `syncInvitationStatuses()` ([invitationsService.ts:84](apps/server/src/services/invitationsService.ts:84)). Funcția face UPDATE pe toate invitațiile și SELECT pe **toți** utilizatorii din toate cluburile. Același job global rulează la fiecare `GET /club-admin/accounts` și `/clubs`.
- **Fix:** validarea citește doar invitația cerută; statusul „expirat” se calculează la citire; adaugă rate limit pe rutele publice de invitație; scoate sincronizarea globală din rutele de citire.

### WP1.3 [P1] Erori SQL trimise clientului ✅
- **Problema:** `handleRouteError` ([finance.ts:849](apps/server/src/routes/finance.ts:849)) și ~15 alte locuri trimit `error.message` pe 500. O plată manuală de `99999999999` întoarce textul complet `insert into "player_payments" … params: …`.
- **Fix:** pe 5xx doar mesaj generic în română, detaliile în log; limită superioară pentru sume (numeric 12,2).

### WP1.4 [P1] Lipsește verificarea „echipa ta” la L12 și la scorer ✅
- **L12:** antrenorul U12 a suprascris șablonul și lista de meci ale U14 (`PUT /l12/teams/2/template`, `PUT /l12/events/4` → 200). `loadTeamForCaller` ([l12.ts:31](apps/server/src/routes/l12.ts:31)) verifică doar clubul.
- **Scorer:** `canKeep = staff || scorekeeper` ([games.ts:66](apps/server/src/routes/games.ts:66)), deci orice membru staff poate ține statistica oricărui meci.
- **Fix:** aplică `coachManagesTeam` / `coachManagesEvent` (`lib/coachScope.ts`) pentru coach, exact ca la evenimente și prezență (acolo funcționează corect).

### WP1.5 [P1] Injecție de formule în CSV ✅
- **Problema:** un jucător numit `=HYPERLINK("http://evil.test","Click")` ajunge ca formulă activă în CSV.
- **Fix:** prefixează cu `'` orice celulă care începe cu `= + - @ \t \r`, în **toate** exporturile: [rosterCsv.ts](apps/client/components/roster/rosterCsv.ts), [financeCsv.ts](apps/client/components/finance/financeCsv.ts), [AttendanceTab.tsx:391](apps/client/components/schedule/AttendanceTab.tsx:391), [my-club-admin.tsx:269](apps/client/app/(admin)/my-club-admin.tsx:269) și exporturile din `app/super-admin`. Ideal, un singur helper comun, cu test.

### WP1.6 [P1] Restul de securitate
- **TLS către DB:** `ssl: { rejectUnauthorized: false }` ([db/index.ts:44](apps/server/src/db/index.ts:44)) → verifică certificatul (Neon are certificate valide).
- **Legarea după email** ([middleware/auth.ts:33](apps/server/src/middleware/auth.ts:33), [clerkAuth.ts:45](apps/server/src/lib/clerkAuth.ts:45)): acceptă doar emailuri Clerk **verificate**; nu lega niciodată un rând care are deja alt `firebaseUid`.
- **Headere de securitate:** `helmet()` + `app.disable('x-powered-by')` pe API; CSP + HSTS în [public/_headers](apps/client/public/_headers).
- **Cod mort:** scoate `express.static('/uploads')` ([app.ts:98](apps/server/src/app.ts:98)) și `POST /profile/me/password`, care pretinde că parola e gestionată de Firebase.
- **[DECIZIE] P1-5:** antrenorul vede telefoanele jucătorilor și părinților din **toate** echipele clubului (`/contacts`, `/players/:id`, `/teams/:id/players`). Variantele: limitezi citirile la echipele lui, sau păstrezi accesul la nivel de club. Întreabă utilizatorul.

---

## WP2 — Bani (finanțe)

### WP2.1 [P0] O plată parțială stinge toată taxa ✅
- **Unde:** [services/payments.ts:177-206](apps/server/src/services/payments.ts:177), plus `collectPaidFeeIds` din `lib/feeSchedule.ts`.
- **Problema:** o taxă e „plătită” dacă orice plată conține id-ul ei în `fee_ids`, indiferent de sumă. Reprodus din UI (dialogul „Încasare” chiar spune „poți corecta, de ex. plată parțială”): cu 50 RON pe taxe de 170 RON, jucătorul dispare din „Cu restanțe”. Și 5 RON au stins o cotizație de 150 RON.
- **Fix:**
  - alocare pe sume, cu sold rămas per taxă și plată parțială reală;
  - fără `feeIds`, alocare FIFO pe cea mai veche taxă (azi merge implicit pe luna curentă);
  - UI-ul „Încasează” arată alocarea înainte de salvare;
  - păstrează compatibilitatea cu rândurile vechi (`lib/paymentLedger.ts`).
- **Gata când:** testele din `feeSchedule.test.ts` și `services/payments.int.test.ts` acoperă plata parțială, FIFO și supraplata.

### WP2.2 [P1] Restul
- **`paidByUserId: null` hardcodat** la plata manuală ([payments.ts:199](apps/server/src/services/payments.ts:199)) → salvează `req.user.id`.
- **„Restanță” are sensuri diferite** (P1-8): Dashboard „Plăți restante 8”, Lot „8 restante / 0% la zi”, Finanțe „1 jucător”, profilul jucătorului „240 RON Restanță” fără nimic scadent, părintele „SOLD RESTANT” scadent peste 41 de zile.
  - O singură definiție: **restanță = `overdue`**; „de plată” = `outstanding`. Aplic-o în [dashboard.ts:198](apps/server/src/routes/dashboard.ts:198), Lot, profilul jucătorului, `payments.tsx`.
- **„Trimite mementouri”** ([playersController.ts:678](apps/server/src/controllers/playersController.ts:678)) trimite tuturor celor cu `outstanding > 0`, inclusiv celor fără nimic scadent → doar `overdue > 0`.
- **Scadența e calculată în fusul serverului:** `dueDateFor` ([feeSchedule.ts:113](apps/server/src/lib/feeSchedule.ts:113)) face „23:59:59” în UTC pe Render, adică 02:59 a doua zi în România. Aplicația afișează „26” în loc de „25”, iar restanța pornește cu ~3 h mai târziu. → Calculează explicit în `Europe/Bucharest`.
- **[DECIZIE]** Contabilul poate schimba cotizația clubului (`PATCH /finance/settings` → 200). Rămâne așa sau devine doar admin?
- **[DECIZIE]** Contabilul nu vede contactele părinților (agenda îi e goală), deși urmărește restanțele.
- **[DECIZIE]** O echipă dezactivată își facturează jucătorii în continuare, fără avertisment.

---

## WP3 — Ore și fusuri orare

### WP3.1 [P0] Evenimentele create din formular sunt decalate cu +3 h (+2 h iarna) ✅
- **Unde:** [useAddEventForm.ts:302-317](apps/client/hooks/useAddEventForm.ts:302) trimite `"2026-10-22T19:00:00"` **fără offset**; [eventValidation.ts:98](apps/server/src/lib/eventValidation.ts:98) face `new Date()` în fusul serverului (UTC pe Render).
- **Efect:** un antrenament introdus la 19:00 e afișat peste tot la **22:00**: pagina evenimentului, calendarul, părinții, exportul `.ics`.
- **Fix:**
  - clientul trimite ISO cu offset (`new Date(localString).toISOString()`);
  - serverul **respinge** stringurile fără `Z` sau offset;
  - caută și alte locuri care trimit ore „naive” (de ex. `toIsoLocal` în [app/(tabs)/index.tsx](apps/client/app/(tabs)/index.tsx)).
- **Atenție la datele existente:** evenimentele deja create în producție au ora greșită. Propune un script de corecție, dar **nu-l rula pe Neon** fără aprobare.

### WP3.2 [P1] Ore brute din DB trimise clientului ✅
- **„Echipa mea”** (jucător și părinte, confirmat și pe iOS Safari): un antrenament de la 18:00 apare la **15:00**. `mapTeamEvent` ([playersController.ts:436](apps/server/src/controllers/playersController.ts:436)) trimite `"2026-10-16 15:00:00"` în loc de `toIso(...)`.
- **Alte câmpuri brute:** `createdAt`, `lastLoginAt`, `date`, `medicalCheckExpiry` ies naive în mai multe răspunsuri. Clientul le parsează inconsecvent: unele componente adaugă `Z`, [AuditLogList.tsx:94](apps/client/components/audit/AuditLogList.tsx:94) nu.
- **Fix:**
  - toate câmpurile timestamp din răspunsurile API devin ISO cu `Z`;
  - un singur helper de parsare în client;
  - `TZ=UTC` explicit în [render.yaml](render.yaml);
  - pe termen lung, `timestamptz` printr-o migrație. **[DECIZIE]**: e o migrație mare, cere aprobare.

### WP3.3 [P2] Data vizei medicale
- **Problema:** [player/[id].tsx:66](apps/client/app/(admin)/player/[id].tsx:66) face `new Date(naiv).toISOString().slice(0,10)`. O viză salvată la `2027-01-01 00:00:00` apare ca 31 dec. 2026, iar o salvare ulterioară mută data definitiv cu o zi.

---

## WP4 — Bug-uri funcționale și fluxuri lipsă

| ID | Problemă | Unde | Ce trebuie |
|---|---|---|---|
| R5 | ✅ **Un jucător fără email nu poate fi editat.** Clientul trimite `email: null`, serverul răspunde 400 „email must be a string”; tricoul, anul, statusul și viza nu se pot salva. | [player/[id].tsx:127](apps/client/app/(admin)/player/[id].tsx:127) ↔ [playerUpdate.ts:45](apps/server/src/lib/playerUpdate.ts:45) | serverul acceptă `null` ca „șterge emailul”; după o eroare, UI-ul revine la valorile salvate (azi antetul arată valoarea nesalvată) |
| R3-1 | ✅ Antrenorul **nu vede sesiunile echipei lui create de admin** (Program, Prezență, Acasă), deci nu le poate nota prezența. Un antrenor fără evenimente atribuite vede tot clubul. | [coachUtils.ts:21-31](apps/client/components/coach/coachUtils.ts:21) | filtrare după echipele antrenorului (`team.coachId`) **sau** `event.coachId`, fără fallback la tot clubul; opțional, formularul adminului precompletează antrenorul echipei |
| P1-7 | ✅ Se poate marca prezent un jucător care **nu e în echipa** evenimentului; statisticile se strică (Ana U14 apare 100% la U12). | [eventsController.ts:709](apps/server/src/controllers/eventsController.ts:709) | validare pe `players_to_teams` pentru `event.teamId` |
| P1-14 | 🔎 `attendance` nu are `UNIQUE(event_id, player_id)`; citirea „există?” e în afara tranzacției. | schema + migrație | index unic + `INSERT … ON CONFLICT DO UPDATE` |
| R2 | ✅ **Nu există editare de eveniment** (titlu, oră, locație, echipă); se poate doar șterge și recrea, cu pierderea prezenței. | `app/(admin)/event/[id].tsx` | ecran sau modal „Editează” (endpoint-ul `PUT /events/:id` există deja) |
| R2 | ✅ „Adaugă jucător” din Lot doar caută sportivi existenți; la „Niciun sportiv găsit” lipsește „Creează jucător”. | `components/roster/AddPlayerModal.tsx` | buton de creare (endpoint-ul de bulk există deja) |
| R4 | ✅ **Statisticianul delegat (părinte)** primește „Meciul nu există” dacă are selectat alt copil decât cel din echipa meciului. | `GET /games/events/:id` filtrează după copilul ales; `/games/assigned` nu | accesul delegatului se verifică după `scorekeeperUserId`, nu după copilul selectat |
| R2 | ✅ Rezultatele din scorer-ul propriu **nu apar nicăieri** pentru părinți și jucători („Rezultate meciuri”, „Bilanț”, „Ultimul rezultat” vin doar din FRB). Nu există link către fișa meciului pentru ei și nici statistici pe jucător. | `app/(tabs)/index.tsx`, schedule | rezultatele `game_stats` încheiate intră în pagina de start; link „Fișa meciului” din program/eveniment pentru toate rolurile |
| R3-17 | ✅ Cantonamentele nu apar pe pagina de start a jucătorului. | `app/(tabs)/index.tsx` | secțiune sau includere în „Următoarele” |
| R3-5 | ✅ Antrenorul **nu poate scrie notițe de feedback per jucător** (doar adminul poate). | `app/(coach)/attendance.tsx` | câmpul de notă de la admin, refolosit |
| R3-13 | ✅ Cererea de ștergere GDPR nu poate fi rezolvată sau închisă de nimeni; emailul trimite la `/admin/users`, unde cererea nu apare. | `routes/privacy.ts` | listă cu cereri deschise pentru admin/super-admin, acțiunea „rezolvat” și urmărirea termenului de 30 de zile |
| R3-7 | ✅ La o cerere de copil cu nume identic, „Leagă de …” vine **preselectat**, fără avertisment că acel copil are deja un părinte și fără compararea datei de naștere; „Aprobă toți” aprobă dintr-un clic. | `components/family/FamilyRequestsPanel.tsx` + `lib/familyJoinService.ts` | implicit „Jucător nou”; avertisment vizibil la potrivire; „Aprobă toți” sare peste cererile cu potrivire |
| P1-9/10 | ✅ Trei procente de prezență diferite pentru același club; dashboard-ul antrenorului numără tot clubul („9 jucători în 1 echipă”). | dashboard, roster summary, coach dashboard | o funcție comună, cu definiție și perioadă afișate; dashboard-ul antrenorului doar pe echipele lui |
| R3-12 | Data nașterii din cererea de copil se pierde (rămâne doar anul). | `familyJoinService` | păstrează data completă sau cere doar anul |
| R3-21 | Profilul acceptă prenume gol și `preferredLanguage: "klingon"`. | `routes/profile.ts` | validare |
| R4 | Un antrenor dezactivat rămâne alocat echipei, iar echipa nu mai poate fi preluată de alt antrenor. | super-admin, users PATCH | la dezactivare: avertisment + realocare |
| L12 | Exportul L12 (PDF și Word) pune titlul evenimentului în locul adversarului și nu blochează foaia incompletă (numere de tricou lipsă, fără căpitan, fără antrenor principal, deși antrenorul e alocat echipei). | `components/l12/*`, events | câmp „adversar” pe eveniment; blocaj sau confirmare explicită la export; antrenorul echipei precompletat |
| **[DECIZIE]** R3-20 | Un jucător de 11 ani acceptă singur Termenii (GDPR art. 8: sub 16 ani consimte părintele). | `LegalAcceptanceGate` | întreabă utilizatorul ce flux vrea |

---

## WP5 — Performanță (măsurat pe 300 de jucători și 2 ani de date)

| Problemă | Măsurat | Ce trebuie |
|---|---|---|
| **Indexuri lipsă** pe aproape toate cheile străine (migrațiile creează doar 4) | 🔎 | migrație cu `events(team_id, start_time)`, `attendance(event_id, player_id)` unic, `attendance(player_id, date)`, `players(team_id)`, `players_to_teams(team_id)`, `player_payments(player_id)`, `notifications(user_id, is_read)`, `users(club_id)`, `teams(club_id)`, `audit_logs(club_id, created_at)` |
| `GET /finance/admin/balances` | **3,49 MB** la fiecare deschidere a paginii Finanțe | răspuns cu sumar per jucător; lista de taxe la cerere, per jucător; paginare |
| `GET /events` fără filtru / programul antrenorului | 1,8 MB / 876 KB | interval obligatoriu sau paginare; clientul cere doar luna afișată |
| `/players/roster` (480 ms, 154 KB), `/players/roster/summary` (812 ms), `/players/:id` (343 ms) | ✅ | agregare în SQL; paginare pe server |
| Agendă | 8.593 de elemente DOM | paginare sau virtualizare |
| `/dashboard/summary` încarcă tot istoricul financiar | 207 ms, crește în timp | `SUM … GROUP BY` în SQL, limitat la perioadă ([dashboard.ts:124](apps/server/src/routes/dashboard.ts:124)) |
| `unread-count` face `SELECT *` + `.length`, la fiecare 45 s per utilizator | 🔎 [notificationsController.ts:30](apps/server/src/controllers/notificationsController.ts:30) | `count(*)` |
| Proxy-ul FRB fără timeout | 🔎 [basketball.ts:118](apps/server/src/routes/basketball.ts:118) (și 145, 222, 233) | `timeout: 15_000`, ca în `frbMatches` |
| Bundle-ul principal: 343 kB, cu `Welcome.tsx` + `login.tsx` + Clerk încărcate și pentru utilizatorii logați | ✅ | lazy-load pentru pagina de prezentare când există o sesiune în cache |
| Niciun cache de date în client (fiecare ecran refetch-uiește; Acasă la admin face 8 cereri) | 🔎 | SWR/TanStack Query sau un endpoint agregat pentru Acasă |
| `microCache` și `activityTracker` nu curăță niciodată intrările expirate | 🔎 | evacuare periodică |

**Gata când:** măsori înainte și după, pe aceeași bază mare (vezi seed-ul de mai jos), și raportezi cifrele. Fișierele seed rămân în scratchpad.
- **Seed rapid pentru volum** (tsx, după `db:local`): 15 echipe, 300 de jucători, 250 de părinți legați, evenimente 3/săptămână/echipă pe 2 ani, prezență pentru evenimentele trecute, plăți lunare.
- **Măsurare:** `curl -w "%{time_total} %{size_download}"` pe endpoint-uri, plus Playwright cu `Emulation.setCPUThrottlingRate 4` la 375 px.

---

## WP6 — UI/UX și calitate cod

- **Netradus:** statusul jucătorilor apare ca „active” în Echipe și pe pagina echipei la antrenor.
- **Texte pentru părinte:** „Forma ta”, „Prezența mea” și „echipei tale” se adresează părintelui ca și cum ar fi jucătorul. „Ultimul rezultat: Nimic programat” → „Niciun rezultat încă”. Profilul arată o singură echipă.
- **Antrenor:** profilul arată „Echipă: Neatribuit” pentru antrenorul U12. Confirmarea de respingere („Contul rămâne în așteptare”) e falsă pentru un părinte activ.
- **Notificări:** cele de plată nu spun pentru ce copil sunt.
- **Pluralizare:** „1 sesiuni”, „1 vize”, „1 părinți” → un helper `plural()` pentru română.
- **`<title>`** e „BCMS” pe toate rutele → titluri per rută.
- **Accesibilitate:**
  - zero titluri (`h1`–`h3`) și zero landmark-uri în shell-ul admin; shim-ul mapează `accessibilityRole="header"` la `role="header"` (invalid) în loc de `heading`;
  - o singură regiune `aria-live`;
  - butoane-icon fără nume în Program;
  - 12 ținte tactile sub 24 px în Lot.
- **CSV:** separatorul e virgula, iar Excel în română așteaptă `;`. Folosește `;` sau oferă opțiunea.
- **Pagini:**
  - **Lot:** coloana „Poziție” e mereu goală, iar „Categorie” dublează echipa.
  - **Pagina echipei pe mobil:** antetul ocupă tot primul ecran.
  - **Program:** calendarul lunar nu arată ora, iar cantonamentele de mai multe zile apar doar în prima zi.
- **Scorer:**
  - în timpul sfertului, coloana MIN arată 0:00;
  - un jucător eliminat cu 5 faulturi poate încă primi puncte;
  - butonul „Fault” din modul Complet e parțial ascuns de bara de jos pe mobil.
- **Listă FRB:** fixă, cu 7 ligi, fără U12, U13, U15 și U20 ([basketball.ts:98](apps/server/src/routes/basketball.ts:98)).
- **ESLint e stricat:** [eslint.config.js](apps/client/eslint.config.js) cere `eslint-config-expo`. Înlocuiește-l cu o configurație flat cu `eslint-plugin-react-hooks` și adaugă `npm run lint` real.
- **CI:** adaugă un workflow GitHub care rulează porțile de la regula 4 la fiecare push (azi există doar keep-alive).
- **Producție:** un `/assets/*.js` inexistent primește `index.html` cu `immutable, 1 an`. Mai curat e un 404 real pentru `/assets/*`.

---

## Ce NU face

- Nu aplica migrații și nu rula scripturi pe Neon. Nu face push. Nu face commit cu `git add -A`.
- Nu schimba comportamentul la punctele **[DECIZIE]** fără răspunsul utilizatorului.
- Nu repara „pe lângă”: un pachet = o temă. Notează în raportul final ce ai observat în afara pachetului, fără să repari.
- Nu lăsa în repo harness-ul, baze PGlite de test, build-uri sau capturi. Totul stă în scratchpad, iar la final se șterge.

## Raportul final (ce trimiți utilizatorului)

1. Pentru fiecare ID reparat: ce ai schimbat (fișier:linie), testul adăugat și dovada (comanda și rezultatul).
2. Rezultatul porților de la regula 4.
3. Migrațiile care trebuie aplicate pe Neon (fișier + SQL) și scripturile de corecție a datelor, toate **neaplicate**.
4. Punctele **[DECIZIE]** rămase deschise.
5. Ce a rămas nereparat și de ce.
