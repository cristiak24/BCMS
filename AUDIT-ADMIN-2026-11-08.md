# Audit frontend — admin (2026-11-08)

Ce am verificat:
- **Rute (24):** Acasă, Clubul meu, Echipă, Lot, Jucător, Program, Eveniment, Prezență, L12 (listă, meci, echipă), Statistică meci, Fișa FRB, Finanțe (Situație, Plăți online, Setări), Acces, Invită, Conturi, Vize, Contacte, Documente, Jurnal, Date personale.
- **Conturi:** administratorul și contabilul clubului. Staff-ul nu are cont în datele de test; l-am verificat din cod și din regulile serverului.
- **Mediu:**
  - 375 și 1280 px, temă deschisă și întunecată: 96 de încărcări pentru admin și 96 pentru contabil;
  - plus 768 și 1024 px (48 de încărcări);
  - 96 de capturi în `apps/client/.impeccable/critique/admin-2026-11-08-audit/`.
- **Server:** API-ul real pe baza E2E, cu Clerk simulat.
- **Verificări automate pe fiecare încărcare:**
  - erori în consolă, apeluri eșuate, scrieri făcute la deschidere;
  - contrast (cu fundalul compus), text sub 11 px, etichete MAJUSCULE spațiate;
  - ținte sub 40 px, controale fără nume, câmpuri doar cu placeholder, controale imbricate;
  - imagini fără `alt`, ID-uri duplicate, numărul de h1, scroll orizontal, `<main>`.

Nu am modificat cod în timpul auditului.

## Scor: 27 / 40 (critica 9: 27) · tehnic 14 / 20

| Heuristică | Scor | De ce |
| --- | --- | --- |
| Starea sistemului | 3 | Încărcare, salvări, coada de prezență offline: clare. |
| Limbajul utilizatorului | 3 | „Peste 20 de zile” fără verb; L12 răspunde contabilului cu „Nu ai acces la această acțiune”. |
| Control și libertate | 3 | Confirmări cu nume, gardă la ieșire, anulare pe stornare. |
| Consecvență | 2.5 | Lot și Echipă folosesc dialogul browserului, restul aplicației toast-uri. Etichete MAJUSCULE doar la admin. Aceeași restanță are două culori. |
| Prevenirea erorilor | 2 | Contabilul vede butoane de scriere pe care serverul le refuză, plus „Fără viză” pentru vize ascunse de server. |
| Recunoaștere | 3 | Meniu și titluri clare; pe telefon, contabilul vede titlul „Finanțe” pe orice pagină. |
| Flexibilitate | 2.5 | Căutare și acțiuni în bloc; filele nu răspund la săgeți. |
| Estetică / minimalism | 3 | Sobru și dens; două butoane „Adaugă” pe Lot pe tabletă, un buton dezactivat „Salvat” pe Jucător. |
| Recuperare din erori | 2.5 | L12 oferă „Reîncearcă” la un refuz care nu se schimbă la reîncercare. |
| Ajutor | 2.5 | Note scurte acolo unde contează (plăți, viză); restul lipsește. |

| Dimensiune tehnică | Scor | Constatare |
| --- | --- | --- |
| Accesibilitate | 3 | 0 probleme de contrast, nume sau titluri pentru admin. Filele nu au navigare cu săgeți; L12 fără h1 la eroare. |
| Performanță | 3 | 4–11 apeluri API pe ecran; contul de admin preîncarcă doar rutele lui. |
| Teme | 3 | 4 culori scrise direct în cod (fundalul layout-ului și textul FAB-urilor). |
| Responsive | 3 | Fără scroll orizontal; dublura de pe Lot între 640 și 1023 px. |
| Integritatea implementării | 2 | Rutele nu țin cont de rol; `Alert.alert` în 2 fișiere ocolește toast-ul. |

## Ce e în regulă (verificat)

- **Admin, pe toate cele 96 de încărcări:**
  - 0 erori în consolă și 0 apeluri eșuate;
  - 0 probleme de contrast și 0 texte sub 11 px;
  - 0 controale fără nume, 0 câmpuri doar cu placeholder, 0 controale imbricate;
  - 0 scroll orizontal la 375 px;
  - câte un h1 și un `<main>` pe fiecare ecran.
- **Scrieri la deschidere:** singura este `POST /api/events/sync-frb` pe Program, intenționat.
- **768 și 1024 px:** fără probleme.
- **Serverul ține datele în siguranță:**
  - refuză (403) scrierile contabilului în afara finanțelor;
  - setările de taxe apar contabilului doar pentru citire;
  - lotul îi vine fără vize (`playersController.ts:452`).
- **Finanțe pentru contabil:** plata, stornarea, mementourile și documentele merg cap-coadă.

## P1 — de rezolvat întâi

1. **Contabilul (și staff-ul) deschid prin adresă orice pagină de admin.**
   - **Ce se întâmplă:** meniul contabilului are doar Finanțe, Documente și Contacte. Totuși, prin adresă se deschid Acasă, Clubul meu, Echipă, Lot, Jucător, Program, Eveniment, Prezență, L12, Statistică, Fișa FRB, Conturi, Vize, Jurnal și Date personale.
   - **Butoane de scriere la vedere:** „Creează echipă”, „Adaugă jucător”, „Editează”, formularul jucătorului, „Invită părinte”, „Actualizează” la viză. Serverul le refuză, așa că datele nu sunt în pericol, dar persoana află abia după ce apasă.
   - **Informație falsă:** serverul ascunde vizele de contabil. Vize, Lot și pagina jucătorului le afișează ca „Fără viză”.
   - **L12:** afișează „Nu ai acces la această acțiune · Reîncearcă” fără h1 (20 de încărcări cu h1 lipsă).
   - **Pe telefon:** titlul din antet rămâne „Finanțe” pe toate aceste pagini.
   - **Cauza:** `src/App.tsx:381` lasă toate rutele `/admin/*` rolurilor `accountant` și `staff`, iar `app/(admin)/_layout.tsx` schimbă după rol doar meniul.
   - **Fix:** o listă de pagini permise pe rol, în layout. Restul duc la pagina de start a rolului, cum face deja `ProtectedRoute`:
     - contabil: Finanțe, Documente, Contacte;
     - staff: Program, Eveniment, Prezență (doar citire), Statistică, Fișa FRB, Documente, Contacte.

2. **Lot și Echipă răspund cu dialogul browserului.**
   - Pe web, `Alert.alert` devine `window.alert`: o fereastră „localhost spune…”, blocantă, cu butonul în limba browserului și în afara temei.
   - Restul aplicației folosește toast-uri (`components/ui/Toast.tsx`).
   - Unde:
     - `app/(admin)/roster.tsx:228, 245, 263, 272, 396, 416, 445` — eliminare, restaurare, mementouri, export, mutare și eliminare în bloc;
     - `app/(admin)/team/[id].tsx:133, 480, 516`.

## P2

3. **Lot: două butoane de adăugare între 640 și 1023 px.**
   - „Adaugă jucător” din antetul paginii (`roster.tsx:573`, `hidden sm:flex`) apare lângă butonul plutitor „+ Jucător” (`roster.tsx:491`, sub 1024 px).
   - Program le separă la 1024 px. Lot trebuie să facă la fel.
4. **Admin-ul nu are stilul sobru al celorlalte roluri.**
   - `html[data-ui="quiet"]` (`global.css:648`) e pus de layout-ul jucătorului/antrenorului și de cel de superadmin, nu și de cel de admin.
   - Pe aceleași ecrane, antrenorul vede etichete cu literă mică, iar adminul le vede MAJUSCULE spațiate:
     - „Formular L-12 · U12 Masculin” (`components/l12/L12Screens.tsx:794`);
     - „L12 constant” (`:1044`);
     - „Statistică meci · …” (`components/stats/GameStatsScreen.tsx:108`).
   - Dialogurile și secțiunile închise implicit (L12Editor, TeamFrbPanel, BoxScoreView) au încă clase `uppercase`.
5. **Culori scrise direct în cod:**
   - `app/(admin)/_layout.tsx:174`: `bg-[#EAF1F8]`;
   - `#FFFFFF` pe FAB-ul din Lot (`roster.tsx:515-516`) și pe cel din Program (`schedule.tsx:152-153`);
   - `manage-access.tsx:231`.
6. **Filele nu răspund la săgeți.**
   - Afectează Echipă, Acces, Program (două rânduri de file), Finanțe și Contacte.
   - Fiecare filă e o oprire separată de Tab, iar săgețile nu fac nimic.
   - Modelul ARIA pentru file cere o singură oprire și săgeți între file.

## P3

7. **Jucător:** un buton dezactivat „Salvat” (`app/(admin)/player/[id].tsx:235`) arată o stare ca pe un buton.
8. **Jucător:** aceeași restanță are două culori — roșu în banda de sus (`player/[id].tsx:264`), portocaliu în cardul Plăți (`:346`).
9. **Vize:** „Peste 20 de zile” (`compliance/index.tsx:47`) nu spune ce se întâmplă; ar trebui „Expiră peste 20 de zile”.
10. **Conturi:** filtrele nu au „Contabili” (`manage-accounts.tsx:27`), deși lista îi conține.
11. **Conturi, pe telefon:** „Invitație trimisă acum 2 …” e tăiat. O invitație fără nume apare cu partea dinaintea lui „@” din email („invitat”).
12. **Finanțe, pe telefon:**
    - „Stornează” e doar o iconiță;
    - în „Plăți recente” (`finance/index.tsx:921`), echipa și metoda de plată sunt tăiate.
13. **L12:** starea de eroare nu are h1. Pagina rămâne fără titlu dacă API-ul nu răspunde.

## Găsite la verificarea staff-ului

Pe mediul local, unui antrenor i-am dat temporar rolul de staff, apoi l-am refăcut. Pe paginile permise staff-ului:

14. **Program cere lista conturilor** (`hooks/useAdminScheduleData.ts`, `GET /api/users`).
    - Serverul răspunde 403, iar în consolă apare „Fetch filters error”.
    - Filtrul „Antrenor” rămâne cu „Niciun antrenor disponibil”, deși clubul are antrenori.
15. **Eveniment cere starea L12** (`components/l12/L12MatchLink.tsx`, `GET /api/l12/events/:id`). Răspunsul e 403 la fiecare meci: linkul se ascunde, dar cererea refuzată apare ca eroare.

## Neverificat

- **Contul de staff:** nu există în datele de test. Am verificat paginile staff-ului doar pe mediul local, cu rolul dat temporar (vezi mai sus).
- **Dialogurile și secțiunile închise:** majusculele lor le acoperă fixul de stil (P2.4), nu capturile.
- **Plata online (Stripe):** nu e configurată în mediul de test.
- **Cititor de ecran real:** am verificat automat doar numele accesibile și titlurile.

## Ordine propusă

1. P1.1 (pagini pe rol): schimbă ce poate vedea și apăsa contabilul.
2. P1.2 și P2.4: dialogurile browserului devin toast-uri, iar admin-ul trece pe stilul sobru.
3. Restul P2, apoi P3.
