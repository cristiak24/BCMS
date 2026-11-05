# Audit frontend — antrenor și superadmin (2026-11-05)

Ce am verificat:
- **Antrenor:** `/coach/dashboard`, `/coach/teams`, `/coach/team/1`, `/coach/attendance`, `/coach/l12`, `/coach/requests`, `/coach/stats/6`, `/schedule`, `/documents`, `/contacts`, `/account`.
- **Superadmin:** `/super-admin/dashboard`, `clubs`, `clubs/1`, `users`, `billing`, `create-user`, `audit-logs`, `settings`, `privacy`.
- **Mediu:** 375 și 1280 px, temă deschisă și întunecată, 80 de capturi.
- **Server:** API-ul real pe baza E2E. Contul de superadmin l-am adăugat temporar, doar pentru capturi.
- **Verificări automate:** erori, contrast, ținte de atingere, titluri, majuscule.

**Rezultat general:** 0 erori în consolă și 0 apeluri API eșuate. Aspectul a rămas în urma admin-ului și a zonei de jucător.

## Scor: antrenor 23/40 · superadmin 26/40

## Antrenor

### P1
1. **„Necesită atenție” arată jucători la 100%.**
   - Unde: Acasă, iar pe Echipe, „Prezența cea mai scăzută”.
   - Cauza: lista ia primii 5 după rată, indiferent de valoare.
   - Fix: doar jucătorii sub 75%; când nu e niciunul, o frază care spune asta.
2. **Acasă repetă aceeași sesiune de trei ori:** cardul „Următoarea sesiune”, banda „Săptămâna ta” și lista „Sesiuni următoare”.
   - În plus, cipurile din antet („3 sesiuni săptămâna asta”) dublează cifrele de dedesubt („3 · 7 zile”).
   - Există două butoane primare către același loc: „Marchează prezența” și „Gestionează prezența”.
3. **Program repetă lista lunii.** Coloana „Evenimente viitoare” și „Evenimentele lunii” arată aceleași evenimente, la fel ca la jucător înainte de 8e93bf6.
   - Pe telefon, ecranul nu are h1.
4. **Echipe poate arăta toate echipele clubului.** Când antrenorul nu are evenimente programate, lista cade pe `teams` (tot clubul), în loc de echipele pe care le antrenează (`coachManagedTeamIds`).
5. **Prezență:**
   - Inelul arată „0%” pentru procentul marcat, lângă „Marcaj 0/6” și „Rată —”: trei cifre pentru același lucru, iar „0%” se citește ca rată de prezență.
   - „Prezență pentru rest (6)” nu spune ce face.

### P2
6. **Antet decorativ peste tot:** cerc colorat, linii de teren, plăci „glass”, etichete MAJUSCULE spațiate (4–16 pe ecran) și rolul „ANTRENOR” în antet.
   - Meniul lateral are pastila de marcă și plăcuțe cu chenar la fiecare iconiță. Admin-ul și jucătorul au renunțat la toate acestea.
7. **Liste din câte un card per rând:**
   - sesiunile de pe Acasă, Echipă și Prezență;
   - lotul de pe Echipă și din cardul de pe Echipe;
   - jucătorii de marcat pe Prezență;
   - meciurile L12.
   - Plăcuțele de dată sunt colorate pe tip („NOV” portocaliu sau albastru).
8. **Cardul de echipă:** are o bară în gradient sus, o plăcuță cu scut colorată și statusul „Activ” repetat pe fiecare jucător.
9. **Ținte sub 40 px pe telefon:**
   - „Adaugă notă” (36), filtrele L12 (32);
   - filtrele de autor din Statistică (36), „Vezi programul” și „Vezi tot” (32);
   - butoanele din Contacte (36), „Adaugă din listă” (36).
10. **Căutarea din antet** promite „jucători, meciuri sau rapoarte” pe Acasă, Echipe și Prezență, dar acolo nu caută nimic.
11. **Profil:** opțiunea „English”, care nu are efect; plăcile „Membru din / Ultima autentificare / Profil completat”; formularul de parolă afișat de la început; câte un pătrățel colorat pe fiecare secțiune.

## Superadmin

### P1
1. **Facturare: „Fără preț 0 — Toate cluburile active au preț”** apare chiar pe rândul unui club cu „Setează”. Cifra numără doar cluburile active luna asta, deci un club fără preț și fără activitate dispare din avertizare.
2. **„Evoluție pe 6 luni” cu toate valorile 0** desenează șase bare goale, cu „0” deasupra fiecăreia, în loc de o stare goală.

### P2
3. **Insignele și avatarele colorate pe rol** au contrastul 3,34 în tema întunecată (sub 4,5) și o culoare diferită pentru fiecare rol. Barele „Pe roluri” sunt și ele în șase culori.
4. **KPI-urile:** câte un card cu plăcuță de iconiță colorată și etichetă MAJUSCULĂ. Admin-ul le-a înlocuit cu o bandă divizată.
5. **Antetul de tabel** e MAJUSCUL spațiat (Cont, Rol, Stare…), lunile din grafic sunt cu majuscule, iar rolul din antet e „SUPERADMIN”. În meniu scrie „Super admin”, deci aceeași eticheta e scrisă în două feluri.
6. **Meniul lateral:** pastilă de marcă și plăcuțe cu chenar, ca la vechiul admin.
7. **Ținte sub 40 px pe telefon:**
   - filtrele de stare (32), cele trei filtre ale graficului (32);
   - filele clubului (32), meniul de pe rând „⋯” (32);
   - „Descarcă” (32), căutarea din club (20 px înălțime), selectoarele (36).
8. **Notificarea „info”** e colorată în marcă (chenar și fundal indigo). E prea puternică pentru o informație.

## Ordine
1. P1 (date și repetări), apoi trecerea de stil (P2), aceeași ca la admin și jucător.
