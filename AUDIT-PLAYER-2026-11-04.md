# Audit frontend — zona jucător / părinte (2026-11-04)

Ce am verificat:
- **Rute:** `/myclub`, `/schedule`, `/attendance`, `/payments`, `/team`, `/team/1`, `/documents`, `/contacts`, `/account`, `/profile`, `/stats/6`.
- **Conturi:** jucător (Luca, U12) și părinte (Ioana, cu doi copii: Matei U12 și Ana U14).
- **Mediu:** 375 și 1280 px, temă deschisă și întunecată, în total 88 de capturi.
- **Server:** API-ul real pe baza de date E2E, cu Clerk simulat.

Pe lângă capturi am rulat verificări automate (erori, contrast, ținte de atingere, etichete, titluri), am citit codul din `app/(tabs)` și am testat accesul la date prin API.

Nu am modificat cod.

## Scor: 26 / 40

| Heuristică | Scor | De ce |
| --- | --- | --- |
| Starea sistemului | 3 | Încărcare, „Totul este salvat”, erori în bloc — da. Plata e blocată fără să spună ce poți face. |
| Limbajul utilizatorului | 2.5 | „configurarea cheilor Stripe”, „Volum lunar” care nu e volum, părintele vede „Echipa mea”. |
| Control și libertate | 3 | Schimbarea copilului merge pe Plăți și Prezență; există „Înapoi” pe detalii. |
| Consecvență | 2 | Rata de prezență are altă definiție decât la antrenor/admin; „Scadență”/„Scadent”; două stiluri de plăcuțe de dată; etichete MAJUSCULE față de admin. |
| Prevenirea erorilor | 2.5 | 7 butoane „Plătește” dezactivate, plus „Adaugă card” când plata online e oprită. |
| Recunoaștere | 3 | Navigația e clară, numele lunii lipsește din titlurile taxelor pe telefon. |
| Flexibilitate | 2.5 | Căutarea din antet promite „jucători, meciuri sau rapoarte” pe ecrane unde nu caută așa ceva. |
| Estetică / minimalism | 2 | Acasă arată același eveniment de 3 ori, Program de 2 ori; cercuri decorative în antete; 12–16 etichete MAJUSCULE pe ecran. |
| Recuperare din erori | 3 | Starea de eroare are reîncercare; stările goale sunt explicite. |
| Ajutor | 2.5 | Aproape inexistent acolo unde contează (cum plătesc dacă plata online e oprită). |

## Ce e în regulă (verificat)

- **Securitate și date** (testat prin API):
  - Un jucător primește lotul echipei fără date sensibile: telefon, viză, plăți, data nașterii și emailul vin goale, chiar și după ce am setat telefonul unui coleg.
  - `/players/:id` pentru un coleg întoarce `Access denied`.
  - `/contacts` nu arată numerele altor familii.
  - Evenimentele vin doar pentru echipa proprie. `X-BCMS-Child` schimbă corect setul de date (Ana → doar U14).
- **Rezultatul verificărilor automate:**
  - 0 erori în consolă și 0 apeluri API eșuate pe toate rutele.
  - 0 scroll orizontal la 375 px.
  - Niciun text sub 11 px și niciun control fără nume accesibil.
  - 0 probleme de contrast la textul normal, în ambele teme.
- **Încărcare:** 4–8 apeluri API pe ecran (în dev se vede dublu din cauza StrictMode). Acasă încarcă doar ultimele luni, nu tot istoricul.

## P1 — de rezolvat întâi

1. **Rata de prezență nu se potrivește cu ce vede antrenorul.**
   - **Cauza:** `utils/playerAttendance.ts:124` (`loadPlayerAttendanceDetails`) calculează pe ultimele 20–30 de *sesiuni*. Restul aplicației folosește ultimele *30 de zile* (`utils/attendanceRate.ts`, „rate on every screen”). Același copil poate avea alt procent pe Acasă/Prezență decât în Lot sau pe Echipă la antrenor.
   - **Agravant:** eticheta „Pe drumul bun” apare după o singură sesiune (1/1).
   - **Fix:** aceeași fereastră de 30 de zile și eticheta `ATTENDANCE_PERIOD_LABEL` sub cifră. Fără verdict sub un minim de sesiuni (de ex. 3).

2. **Plăți când plata online nu e activă: părintele nu are ce face.**
   - **Ce vede:** un banner tehnic („Stripe Checkout nu este configurat… configurarea cheilor Stripe”, `app/(tabs)/payments.tsx:574`), „Plătește tot” dezactivat, 7 butoane „Plătește” dezactivate la opacitate 0.55 (contrast slab) și „Adaugă” card activ.
   - **Fix:** o frază pentru părinte, de tipul „Plata online nu e activă la club. Plătești cash sau prin transfer la club; plata apare aici după ce e înregistrată.” Ascunde butoanele „Plătește” și „Adaugă card” cât timp `stripe.configured` e fals.

3. **Acasă repetă aceleași evenimente de 3 ori.**
   - Același antrenament (5 nov.) apare în cipurile din antet, în caruselul de carduri și în „Activități viitoare”. „Amical U12 (scorer)” apare tot de 3 ori.
   - Pe telefon pagina are ~2.200 px, cu trei butoane „Vezi în program”.
   - **Fix:** un singur bloc „Urmează” (următoarele 3–4 evenimente, într-o listă densă) și un singur link spre Program. Caruselul tăiat la margine („Amica…”) dispare.

4. **Program repetă lista lunii.** „Evenimente viitoare” (carduri) și „Evenimentele lunii” arată aceleași 4 evenimente sub calendar. **Fix:** păstrează una dintre ele, de preferat lista lunii, legată de ziua selectată.

5. **Plăți pe telefon: titlurile taxelor sunt tăiate exact unde diferă.**
   - „Contribuție antrename…” × 2 și „Cotizație noiembrie …” nu se pot deosebi; luna e informația care contează.
   - **Fix:** titlul pe două rânduri, sau luna mutată în subrând („Cotizație · oct. 2026”). Butonul „Plătește” trece sub sumă.

6. **„Volum lunar” numără sesiunile programate, nu pe cele făcute.**
   - `app/(tabs)/index.tsx:1107` (`sessionMonthCounts`) numără toate antrenamentele și meciurile din lună, inclusiv cele viitoare.
   - Cardul se numește „Forma copilului”, iar „▲ 3 față de luna trecută” arată ca o performanță.
   - **Fix:** numără doar sesiunile trecute cu prezență, sau redenumește în „Sesiuni programate luna aceasta”, fără săgeată verde.

## P2

7. **Program nu are titlu (h1) pe telefon.** `app/(tabs)/schedule.tsx:552` ascunde `PageHero` sub 1024 px; e singurul ecran fără h1.
8. **Etichete MAJUSCULE spațiate peste tot și antet decorativ.**
   - Exemple: Acasă are 12 („RATĂ PREZENȚĂ”, „PE TEREN”, „ZI DE MECI”, „TABELĂ”…), Program 16, inclusiv insignele „ANTRENAMENT”/„MECI”.
   - `PageHero` în varianta `hero` (cerc colorat + linii de teren) apare pe fiecare ecran.
   - Admin-ul a renunțat la ambele. **Fix:** aceeași trecere ca la admin (`t-label`, `variant="plain"`).
9. **Liste făcute din câte un card per rând** în loc de o listă densă: Plăți → De plată, Program → Evenimente viitoare, Acasă → liste, Prezență → istoric. Fiecare tip de eveniment e codat de 3 ori: plăcuță colorată, insignă colorată și bară în stânga.
10. **Ținte de atingere sub 40 px pe telefon:**
    - „Plătește” (78×32), „Vezi în program” (118×32), „Adaugă” card (48×20);
    - butonul ochi de la parolă (32×32), Română/English (152×34);
    - filtrele din Prezență (36 px), „+” copil (38×36).
11. **Texte pentru părinte scrise ca pentru jucător.**
    - Meniul spune „Echipa mea” și în antet apare „PĂRINTE” cu majuscule.
    - Căutarea din antet spune „Caută jucători, meciuri sau rapoarte…” pe Plăți/Echipă.
    - La Contacte, starea goală spune „Antrenorii nu și-au adăugat numărul”, deși titlul promite și administratorii.
12. **Viza medicală e calculată cu `new Date(expiry)`** (`app/(tabs)/team/index.tsx:27`), nu cu `parseApiDate`, și cu prag propriu de 30 de zile (zi întreagă, fără fusul București). Poate arăta altă stare decât Conformitatea din admin în ziua expirării.
13. **„Limbă preferată: English” nu are efect.** Interfața e doar în română (`components/profile/ProfileForm.tsx:22`). Fie dispare opțiunea, fie spune la ce se folosește.
14. **Profil (părinte): ~3.200 px pe telefon.** Are plăci de vanitate („Membru din 04.11.2026 / Ultima autentificare 04.11.2026”) și „Profil completat 25%”. Fiecare secțiune are un pătrățel colorat cu iconiță. **Fix:** grupează (Date personale, Notificări, Securitate, Confidențialitate) și scoate plăcile.
15. **Prezență: texte la zero.** Apare „Ultimele 0 sesiuni marcate”, iar filtrele „Absent 0”/„Motivat 0” rămân apăsabile.
16. **Istoric tranzacții pe 375 px.** „Înregistrată de club / 20 sept. 2026 · Reușită” se rupe pe patru rânduri înghesuite.
17. **Echipă → cardul „Evenimente”.** Arată „4 · Antrenament U12”, iar subrândul pare titlul unui singur eveniment.

## P3

18. `/account` și `/profile` deschid același `ProfileScreen`. Două adrese pentru aceeași pagină; meniul trimite la una.
19. `app/(tabs)/_layout.tsx:105` are fundalul hardcodat `bg-[#EAF1F8]`; în tema întunecată nu urmează token-urile (se vede doar sub conținut).
20. **Formularul de parolă:** cele trei câmpuri sunt pe pagina principală de profil; ar sta mai bine într-un dialog „Schimbă parola”.

## Neverificat

- Schimbarea copilului pe Acasă: pe Plăți și Prezență datele se schimbă corect. Pe Acasă scriptul meu a lăsat meniul deschis, deci nu am confirmarea.
- Fluxul real de plată Stripe: în mediul de test nu e configurat.
- Statisticile de meci cu date: meciul de test nu are scor, se vede doar starea goală.
- Un browser cu cititor de ecran real: am verificat doar nume accesibile și titluri, automat.

## Ordine propusă

1. P1.1 (rata de prezență) și P1.2 (Plăți fără Stripe) — schimbă ce înțelege părintele.
2. P1.3–P1.4 (Acasă și Program fără repetări), împreună cu P2.8–P2.9 (aceeași trecere de stil ca la admin).
3. P1.5–P1.6, apoi restul P2.
