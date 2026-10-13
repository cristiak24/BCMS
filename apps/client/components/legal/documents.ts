import { DIGITAL_CONSENT_AGE } from '../../config/legal';

export type LegalBlock =
    | { type: 'p'; text: string }
    | { type: 'ul'; items: string[] }
    | { type: 'table'; head: string[]; rows: string[][] };

export type LegalSection = { id: string; title: string; blocks: LegalBlock[] };

export type LegalDocument = {
    slug: 'termeni' | 'confidentialitate' | 'cookie-uri';
    title: string;
    summary: string;
    sections: LegalSection[];
};

const p = (text: string): LegalBlock => ({ type: 'p', text });
const ul = (...items: string[]): LegalBlock => ({ type: 'ul', items });
const table = (head: string[], ...rows: string[][]): LegalBlock => ({ type: 'table', head, rows });

export const TERMS: LegalDocument = {
    slug: 'termeni',
    title: 'Termeni și condiții',
    summary: 'Regulile de folosire a aplicației BCMS, pentru administratori, antrenori, jucători și părinți.',
    sections: [
        {
            id: 'despre',
            title: '1. Despre acești termeni',
            blocks: [
                p('BCMS este o aplicație web (care poate fi instalată și ca aplicație pe telefon) prin care cluburile de baschet își administrează programul, prezența, plățile, echipele și statisticile de meci. Prin crearea unui cont sau prin folosirea aplicației accepți acești termeni.'),
                p('Dacă nu ești de acord cu ei, te rugăm să nu creezi cont și să nu folosești aplicația.'),
            ],
        },
        {
            id: 'cont',
            title: '2. Contul tău',
            blocks: [
                p('Contul se creează doar pe baza unui cod sau a unui link de invitație primit de la club. Rolul tău (administrator, antrenor, jucător, părinte) și echipele la care ai acces sunt stabilite de club, nu de tine.'),
                ul(
                    'Datele pe care le introduci trebuie să fie reale și actuale.',
                    'Contul este personal. Nu îți da parola altcuiva și nu folosi contul altei persoane.',
                    'Ești responsabil pentru ce se întâmplă în contul tău. Dacă bănuiești că cineva a intrat în cont, schimbă-ți parola și anunță clubul sau pe noi.',
                    'Unele conturi (de exemplu cele de antrenor) trebuie aprobate de un administrator înainte de a avea acces.',
                ),
            ],
        },
        {
            id: 'minori',
            title: '3. Minori',
            blocks: [
                p(`Dacă ai sub ${DIGITAL_CONSENT_AGE} ani, contul nu îl creezi tu. Părintele sau tutorele legal își creează un cont de părinte și își leagă copilul de acel cont. Părintele vede și gestionează datele copilului în aplicație.`),
                p('Când adaugi un copil, confirmi că ești părintele sau tutorele lui legal și că ai dreptul să furnizezi datele lui clubului prin BCMS. Fotografiile și documentele copilului se încarcă doar cu acordul părintelui.'),
            ],
        },
        {
            id: 'roluri',
            title: '4. Rolul clubului și rolul BCMS',
            blocks: [
                p('Clubul tău hotărăște ce date despre membri se introduc în aplicație, cine are acces la ele și în ce scop sunt folosite. BCMS pune la dispoziția clubului instrumentul și prelucrează datele în numele clubului, așa cum este explicat în Politica de confidențialitate.'),
                p('Înscrierea la club, cotizațiile, regulile sportive și deciziile despre echipe sunt între tine și club. BCMS nu este parte în această relație și nu răspunde pentru deciziile clubului.'),
            ],
        },
        {
            id: 'plati',
            title: '5. Plăți',
            blocks: [
                p('Clubul stabilește sumele și scadențele cotizațiilor. Le poți plăti online prin Stripe sau le poate înregistra clubul manual (numerar, transfer).'),
                ul(
                    'BCMS nu vede și nu păstrează datele cardului tău. Ele sunt introduse direct pe pagina Stripe.',
                    'Rambursările și contestațiile privind o cotizație se discută cu clubul, care primește banii.',
                    'BCMS își facturează serviciul clubului, nu membrilor acestuia.',
                ),
            ],
        },
        {
            id: 'utilizare',
            title: '6. Cum ai voie să folosești aplicația',
            blocks: [
                p('Este interzis să:'),
                ul(
                    'accesezi date ale altor persoane sau ale altor cluburi la care nu ai drept de acces;',
                    'încerci să ocolești securitatea, să ghicești coduri de invitație sau să încarci aplicația cu cereri automate;',
                    'încarci conținut ilegal, jignitor sau care încalcă drepturile altora;',
                    'folosești datele de contact ale membrilor (telefoane, emailuri) în alt scop decât activitatea clubului;',
                    'copiezi, vinzi sau dai mai departe date din aplicație în afara clubului.',
                ),
                p('Putem suspenda un cont care încalcă aceste reguli, cu informarea clubului.'),
            ],
        },
        {
            id: 'continut',
            title: '7. Ce încarci tu',
            blocks: [
                p('Documentele, pozele și textele pe care le încarci rămân ale tale (sau ale clubului). Ne dai dreptul limitat de a le stoca și afișa persoanelor autorizate, doar cât este necesar ca aplicația să funcționeze. Garantezi că ai dreptul să le încarci.'),
            ],
        },
        {
            id: 'disponibilitate',
            title: '8. Disponibilitate și limitări',
            blocks: [
                p('Depunem eforturi rezonabile ca aplicația să funcționeze fără întreruperi, dar nu putem promite că va fi mereu disponibilă sau fără erori. Putem face lucrări de mentenanță și putem schimba funcționalitățile.'),
                p('Calendarul de meciuri și clasamentele preluate de la Federația Română de Baschet sunt informative; sursa oficială rămâne cea a federației. Documentele oficiale ale clubului rămân în evidența clubului.'),
                p('În limitele permise de lege, BCMS nu răspunde pentru pagube indirecte sau pentru pierderi cauzate de indisponibilitatea temporară a aplicației. Nu excludem și nu limităm răspunderea pentru fapte săvârșite cu intenție sau din culpă gravă, nici drepturile pe care legea le acordă consumatorilor.'),
            ],
        },
        {
            id: 'incetare',
            title: '9. Încetarea contului',
            blocks: [
                p('Poți cere oricând ștergerea contului și a datelor tale din Profil, la secțiunea „Confidențialitate și date”. Clubul poate să îți dezactiveze accesul dacă nu mai ești membru. Anumite date trebuie păstrate de club sau de noi conform legii (de exemplu documentele financiar-contabile), chiar și după închiderea contului.'),
            ],
        },
        {
            id: 'date',
            title: '10. Datele tale personale',
            blocks: [
                p('Cum sunt prelucrate datele personale este explicat în Politica de confidențialitate, iar ce stocăm în browser este explicat în pagina despre cookie-uri.'),
            ],
        },
        {
            id: 'lege',
            title: '11. Legea aplicabilă',
            blocks: [
                p('Acești termeni sunt guvernați de legea română. Orice neînțelegere se rezolvă amiabil, iar dacă nu este posibil, de instanțele competente din România. Consumatorii se pot adresa și Autorității Naționale pentru Protecția Consumatorilor (anpc.ro).'),
            ],
        },
        {
            id: 'modificari',
            title: '12. Modificări',
            blocks: [
                p('Putem actualiza acești termeni. Dacă schimbarea este importantă, îți vom cere să accepți noua versiune la următoarea intrare în aplicație. Data ultimei actualizări apare sus, pe această pagină.'),
            ],
        },
    ],
};

export const PRIVACY: LegalDocument = {
    slug: 'confidentialitate',
    title: 'Politica de confidențialitate',
    summary: 'Ce date personale prelucrăm, de ce, cui le dăm, cât le păstrăm și ce drepturi ai conform GDPR.',
    sections: [
        {
            id: 'operatori',
            title: '1. Cine răspunde de datele tale',
            blocks: [
                p('Prelucrarea datelor personale din BCMS respectă Regulamentul (UE) 2016/679 (GDPR) și legislația română. Responsabilitatea este împărțită astfel:'),
                ul(
                    'Clubul tău este operatorul datelor membrilor săi (jucători, părinți, antrenori): el decide ce date introduce în aplicație și de ce.',
                    'BCMS este persoană împuternicită de club: stocăm și prelucrăm aceste date doar pentru a-i furniza aplicația și doar după instrucțiunile lui.',
                    'BCMS este operator pentru datele necesare contului tău și siguranței platformei (autentificare, jurnal de securitate), pentru evidența de facturare a clubului și pentru solicitările pe care ni le adresezi direct.',
                ),
                p('Pentru întrebări despre datele din club (ce se păstrează, cine are acces) poți vorbi cu administratorul clubului. Pentru orice altceva, folosește datele de contact de mai jos.'),
            ],
        },
        {
            id: 'date',
            title: '2. Ce date prelucrăm',
            blocks: [
                table(
                    ['Categorie', 'Exemple', 'De unde le avem'],
                    ['Cont', 'nume, prenume, email, telefon, rol, club, limba preferată, data creării contului și a ultimei autentificări. Parola este gestionată de furnizorul de autentificare; noi nu o vedem.', 'de la tine, la înregistrare și din Profil'],
                    ['Jucători', 'nume, număr de tricou, anul sau data nașterii, echipă, fotografie de profil, date de contact ale jucătorului și ale părinților sau tutorilor.', 'de la părinte, jucător sau de la club'],
                    ['Activitate sportivă', 'prezență la antrenamente și meciuri, notițe ale antrenorului, statistici de meci, loturi.', 'de la antrenori și club'],
                    ['Sănătate', 'data expirării avizului medical sportiv. Documentele medicale încărcate de club sunt fișiere private ale clubului.', 'de la club'],
                    ['Plăți', 'cotizații (sumă, lună, stare, metodă de plată), cine a plătit. Datele cardului sunt introduse pe pagina Stripe și nu ajung la noi.', 'de la tine, club și Stripe'],
                    ['Notificări', 'mesajele din aplicație și emailurile despre antrenamente anulate sau plăți.', 'generate de aplicație'],
                    ['Date tehnice', 'adresa IP, tipul browserului și acțiunile importante din cont (jurnal de audit), activitatea lunară folosită la facturarea clubului.', 'automat, din folosirea aplicației'],
                ),
                p('Nu cerem și nu prelucrăm CNP, serii de buletin sau alte date care nu sunt necesare. Nu folosim datele în scopuri de publicitate și nu facem profilare.'),
            ],
        },
        {
            id: 'scopuri',
            title: '3. De ce le folosim și pe ce temei legal',
            blocks: [
                table(
                    ['Scop', 'Temei legal (GDPR art. 6)'],
                    ['Crearea contului și furnizarea aplicației către club și membri', 'executarea contractului (art. 6(1)(b))'],
                    ['Organizarea activității clubului: program, prezență, echipe, statistici', 'interesul legitim al clubului și al membrilor (art. 6(1)(f)); executarea relației cu clubul (art. 6(1)(b))'],
                    ['Plăți, facturare și evidență contabilă', 'executarea contractului și obligații legale (art. 6(1)(b), (c))'],
                    ['Verificarea avizului medical sportiv', 'obligație legală a clubului și protejarea sănătății sportivilor (art. 6(1)(c), art. 9(2)(h) unde se aplică)'],
                    ['Securitatea contului și a platformei, prevenirea abuzurilor, jurnal de audit', 'interes legitim (art. 6(1)(f)) '],
                    ['Notificări despre activitate (în aplicație și pe email)', 'executarea contractului; poți opri emailurile din Profil → Notificări'],
                    ['Dovada acceptării termenilor', 'interes legitim (art. 6(1)(f)) și obligații legale'],
                ),
                p('Dacă vom ruga vreodată un acord separat (de exemplu pentru fotografii publice ale copiilor), acordul va fi liber, specific și îl vei putea retrage oricând.'),
            ],
        },
        {
            id: 'minori',
            title: '4. Datele copiilor',
            blocks: [
                p(`Datele copiilor sub ${DIGITAL_CONSENT_AGE} ani sunt introduse și gestionate de părinte sau tutore, care răspunde pentru exactitatea lor și confirmă că are dreptul să le furnizeze. Un copil nu își creează singur cont sub această vârstă.`),
                p('Colectăm doar datele necesare activității sportive. Părinții pot cere oricând acces la datele copilului, corectarea sau ștergerea lor, în același mod ca pentru datele proprii.'),
            ],
        },
        {
            id: 'destinatari',
            title: '5. Cui dăm datele',
            blocks: [
                p('În interiorul clubului, datele sunt vizibile doar în limita rolului: un antrenor vede echipele lui, un părinte vede doar copilul lui, un membru fără echipă nu vede datele altor echipe. Administratorii clubului văd datele clubului lor.'),
                p('Folosim furnizori care prelucrează date în numele nostru, pe baza unor contracte de prelucrare:'),
                table(
                    ['Furnizor', 'Ce face'],
                    ['Clerk', 'autentificare și gestionarea parolelor'],
                    ['Stripe', 'procesarea plăților online cu cardul'],
                    ['Resend', 'trimiterea emailurilor de notificare'],
                    ['Neon', 'baza de date în care sunt stocate datele'],
                    ['Render', 'găzduirea serverului aplicației'],
                    ['Cloudflare', 'găzduirea și livrarea paginilor aplicației'],
                ),
                p('Nu vindem datele și nu le dăm către terți în scopuri de marketing. Le putem comunica autorităților doar dacă legea ne obligă.'),
            ],
        },
        {
            id: 'transferuri',
            title: '6. Transferuri în afara Spațiului Economic European',
            blocks: [
                p('Unii dintre furnizorii de mai sus pot prelucra date în afara SEE, inclusiv în Statele Unite. În aceste cazuri, transferul se face doar pe baza unei decizii de adecvare a Comisiei Europene (de exemplu cadrul UE–SUA privind confidențialitatea datelor) sau a clauzelor contractuale standard, împreună cu măsuri suplimentare de protecție.'),
            ],
        },
        {
            id: 'pastrare',
            title: '7. Cât timp păstrăm datele',
            blocks: [
                ul(
                    'Datele contului și ale jucătorului: cât timp contul este activ sau jucătorul face parte din club.',
                    'Documentele financiar-contabile: perioada impusă de legea contabilității, chiar dacă contul este șters.',
                    'Jurnalul de securitate și dovada acceptării termenilor: cât este necesar pentru securitate și pentru apărarea unor drepturi.',
                    'După o cerere de ștergere: ștergem sau anonimizăm datele care nu mai trebuie păstrate legal, în cel mult 30 de zile.',
                ),
            ],
        },
        {
            id: 'drepturi',
            title: '8. Drepturile tale',
            blocks: [
                p('Ai dreptul la:'),
                ul(
                    'acces: să afli ce date avem despre tine și să primești o copie;',
                    'rectificare: să corectezi datele greșite (multe le poți modifica direct din Profil);',
                    'ștergere („dreptul de a fi uitat”), când nu mai există un motiv legal să fie păstrate;',
                    'restricționarea prelucrării, în situațiile prevăzute de GDPR;',
                    'portabilitate: să primești datele într-un format ușor de citit;',
                    'opoziție față de prelucrările bazate pe interes legitim;',
                    'retragerea acordului, atunci când prelucrarea se bazează pe acord, fără să afecteze ce s-a întâmplat înainte.',
                ),
                p('Cum le exerciți: din aplicație, la Profil → „Confidențialitate și date”, poți descărca o copie a datelor tale și poți cere ștergerea contului. Pentru celelalte drepturi ne poți scrie la adresa de contact de mai jos sau poți vorbi cu administratorul clubului. Răspundem în cel mult 30 de zile.'),
                p('Dacă consideri că ți-am încălcat drepturile, ai dreptul să depui o plângere la Autoritatea Națională de Supraveghere a Prelucrării Datelor cu Caracter Personal (ANSPDCP), B-dul G-ral. Gheorghe Magheru nr. 28-30, sector 1, București, www.dataprotection.ro, sau la instanța competentă.'),
            ],
        },
        {
            id: 'securitate',
            title: '9. Cum protejăm datele',
            blocks: [
                ul(
                    'Conexiunea la aplicație este criptată (HTTPS).',
                    'Accesul este pe roluri și separat pe club: un club nu vede datele altuia.',
                    'Autentificarea este făcută de un furnizor specializat; parolele nu sunt stocate de noi.',
                    'Acțiunile importante sunt înregistrate într-un jurnal de audit.',
                    'Cererile sunt limitate automat pentru a opri încercările de abuz.',
                ),
                p('Niciun sistem nu este perfect. Dacă apare un incident care îți pune datele în pericol, vom anunța clubul și autoritatea competentă în termenele cerute de lege și, unde este cazul, pe tine.'),
            ],
        },
        {
            id: 'automate',
            title: '10. Decizii automate',
            blocks: [p('Nu luăm decizii care te privesc pe baza unei prelucrări exclusiv automate și nu facem profilare cu efecte juridice.')],
        },
        {
            id: 'modificari',
            title: '11. Modificări ale politicii',
            blocks: [p('Putem actualiza această politică. Data ultimei actualizări apare sus. Pentru schimbări importante îți vom cere să iei act de noua versiune la următoarea intrare în aplicație.')],
        },
    ],
};

export const COOKIES: LegalDocument = {
    slug: 'cookie-uri',
    title: 'Cookie-uri și stocare locală',
    summary: 'Ce păstrăm în browserul tău și de ce. Nu folosim cookie-uri de analiză sau de publicitate.',
    sections: [
        {
            id: 'pe-scurt',
            title: '1. Pe scurt',
            blocks: [
                p('BCMS folosește doar cookie-uri și stocare locală strict necesare ca să funcționeze: să rămâi autentificat, să îți păstrăm tema aleasă și să pornească rapid aplicația. Nu folosim cookie-uri de analiză, de publicitate sau de urmărire, iar pentru cele strict necesare legea nu cere acordul tău, de aceea nu afișăm un banner de cookie-uri.'),
                p('Dacă vom adăuga vreodată cookie-uri care nu sunt strict necesare, îți vom cere acordul înainte de a le activa.'),
            ],
        },
        {
            id: 'folosite',
            title: '2. Ce se salvează în browser',
            blocks: [
                table(
                    ['Nume', 'Rol', 'Tip'],
                    ['cookie-urile Clerk (__client, __session, __clerk…)', 'mențin sesiunea de autentificare și protejează contul', 'cookie, strict necesar'],
                    ['bcms.auth.session', 'ține minte sesiunea ca aplicația să pornească rapid', 'stocare locală, strict necesar'],
                    ['bcms.theme', 'tema aleasă (luminoasă, întunecată, sistem)', 'stocare locală, preferință'],
                    ['bcms.child-id', 'copilul selectat de un părinte', 'stocare locală, funcționalitate'],
                    ['bcms.access-tab, bcms.frb-*', 'ultima filă deschisă și ultima sincronizare a calendarului', 'stocare locală, funcționalitate'],
                    ['bcms.install-dismissed-at', 'ține minte că ai închis invitația de instalare', 'stocare locală, preferință'],
                    ['bcms.chunk-reload-at', 'evită reîncărcări repetate după o actualizare a aplicației', 'stocare locală, tehnic'],
                    ['memorie cache a aplicației (service worker)', 'încarcă aplicația mai repede și o face instalabilă', 'cache, tehnic'],
                ),
            ],
        },
        {
            id: 'terti',
            title: '3. Furnizori terți',
            blocks: [
                p('Când plătești o cotizație online ești dus la pagina securizată Stripe, care își poate seta propriile cookie-uri (de exemplu pentru prevenirea fraudei), conform politicii Stripe. Aplicația nu încarcă scripturi de analiză, de reclame sau de rețele sociale.'),
            ],
        },
        {
            id: 'control',
            title: '4. Cum le ștergi',
            blocks: [
                p('Poți șterge oricând cookie-urile și datele site-ului din setările browserului. Dacă o faci, vei fi deconectat și preferințele (de exemplu tema) se vor reseta. Deconectarea din aplicație șterge și sesiunea păstrată local.'),
            ],
        },
    ],
};

export const LEGAL_DOCUMENTS = [TERMS, PRIVACY, COOKIES] as const;
