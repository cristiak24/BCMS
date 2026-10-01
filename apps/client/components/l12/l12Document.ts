import { L12_MAX_PLAYERS, L12_STAFF_ROLES, type L12Lineup, type L12Player } from '../../services/l12Api';

/**
 * Renders Formular L-12 (FRB "Lista oficială a echipei pentru joc") as an A4
 * HTML page laid out like the federation's Word template, then exports it two
 * ways:
 *
 *  - PDF: printed from a hidden iframe — the browser's print dialog has "Save
 *    as PDF" on every desktop and phone, with no server-side Chromium needed.
 *  - Word: a single-file web page (MHTML) saved as .doc, with the FRB logo
 *    embedded as a MIME part. Word opens it as a normal, editable document.
 */

export type L12DocumentInput = {
    teamName: string;
    homeTeam: string;
    awayTeam: string;
    competition: string;
    gender: 'M' | 'F' | null;
    date: string;
    lineup: L12Lineup;
};

const LOGO_PATH = '/l12/frb-logo.jpg';
const WORD_LOGO_LOCATION = 'file:///C:/bcms-l12/frb-logo.jpg';

function esc(value: unknown) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

export function l12FileBase(input: Pick<L12DocumentInput, 'teamName' | 'awayTeam' | 'homeTeam' | 'date'>) {
    const opponent = input.homeTeam === input.teamName ? input.awayTeam : input.homeTeam;
    return ['L12', input.teamName, opponent, input.date]
        .filter(Boolean)
        .join('_')
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 100);
}

function playerName(player: L12Player, captainId: number | null) {
    const name = `${player.lastName ?? ''} ${player.firstName ?? ''}`.trim().toUpperCase();
    return player.playerId === captainId ? `${name} (C)` : name;
}

export function buildL12Html(input: L12DocumentInput, logoSrc: string) {
    const { lineup } = input;
    const rows = Array.from({ length: L12_MAX_PLAYERS }, (_, index) => lineup.players[index] ?? null);
    const genderCell = (['M', 'F'] as const)
        .map((g) => (input.gender === g ? `<span class="picked">${g}</span>` : g))
        .join('&nbsp;&nbsp;/&nbsp;&nbsp;');

    const playerRows = rows.map((player, index) => `
        <tr class="row">
            <td class="c">${esc(player?.license)}</td>
            <td class="c b">${index + 4}</td>
            <td class="c">${esc(player?.shirtNumber)}</td>
            <td class="c">${player?.u22 ? 'X' : ''}</td>
            <td class="c">${esc(player?.citizenship)}</td>
            <td class="c">${player?.naturalized ? 'DA' : ''}</td>
            <td>${player ? esc(playerName(player, lineup.captainPlayerId)) : ''}</td>
        </tr>`).join('');

    const staffRows = L12_STAFF_ROLES.map(({ key, label }) => {
        const entry = lineup.staff?.[key];
        return `
        <tr class="row">
            <td class="c">${esc(entry?.license)}</td>
            <td colspan="2" class="b">${esc(label)}</td>
            <td colspan="2"></td>
            <td colspan="2">${esc(entry?.name?.toUpperCase())}</td>
        </tr>`;
    }).join('');

    return `<!DOCTYPE html>
<html lang="ro" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word">
<head>
<meta charset="utf-8">
<title>${esc(l12FileBase(input))}</title>
<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom></w:WordDocument></xml><![endif]-->
<style>
    @page { size: A4; margin: 14mm 16mm; }
    @page Section1 { size: 595.3pt 841.9pt; margin: 40pt 45pt 40pt 45pt; }
    div.Section1 { page: Section1; }
    body { font-family: 'Times New Roman', Times, serif; color: #000; margin: 0; }
    .head { width: 100%; border-collapse: collapse; margin-bottom: 6pt; }
    .head td { border: none; vertical-align: bottom; padding: 0; }
    .logo { width: 62pt; height: auto; }
    .title { text-align: center; font-weight: bold; font-size: 14pt; line-height: 1.25; }
    .form-no { text-align: right; font-weight: bold; font-size: 11pt; vertical-align: top !important; }
    table.sheet { width: 100%; border-collapse: collapse; border: 2pt double #000; }
    table.sheet td { border: 1pt solid #000; padding: 2pt 4pt; font-size: 11pt; height: 17pt; }
    .b { font-weight: bold; }
    .c { text-align: center; }
    .th td { font-weight: bold; text-align: center; font-size: 10pt; line-height: 1.15; }
    .picked { border: 1pt solid #000; border-radius: 50%; padding: 0 4pt; }
    .sign { margin-top: 14pt; font-weight: bold; font-size: 11pt; }
</style>
</head>
<body>
<div class="Section1">
<table class="head">
    <tr>
        <td style="width:80pt"><img class="logo" src="${esc(logoSrc)}" width="62" alt="FRB"></td>
        <td class="title">LISTA OFICIALĂ A ECHIPEI<br>PENTRU JOC</td>
        <td class="form-no" style="width:110pt">FORMULAR L-12</td>
    </tr>
</table>
<table class="sheet">
    <tr><td colspan="7" class="b">Echipa: ${esc(input.teamName)}</td></tr>
    <tr><td colspan="7" class="b">Jocul: ${esc(input.homeTeam)} &nbsp;vs.&nbsp; ${esc(input.awayTeam)}</td></tr>
    <tr>
        <td colspan="2" class="b">Competiția:</td>
        <td colspan="3" class="b c">${esc(input.competition)}</td>
        <td colspan="2" class="b c">${genderCell}</td>
    </tr>
    <tr>
        <td colspan="2" class="b">Data:</td>
        <td colspan="3" class="b c">${esc(input.date)}</td>
        <td colspan="2"></td>
    </tr>
    <tr class="th">
        <td style="width:12%">Licența</td>
        <td style="width:10%">Număr tabelă</td>
        <td style="width:11%">Număr echipament</td>
        <td style="width:7%">Juc. U22 U23</td>
        <td style="width:10%">Cetățenia</td>
        <td style="width:11%">Naturalizat</td>
        <td>Numele și prenumele</td>
    </tr>
    ${playerRows}
    <tr><td colspan="7" class="b c">Vă rugăm indicați numai 12 jucători cu drept de joc</td></tr>
    ${staffRows}
</table>
<p class="sign">Nume și semnătura delegat echipă:</p>
</div>
</body>
</html>`;
}

/** Opens the print dialog for the sheet (→ "Save as PDF"). */
export async function printL12(input: L12DocumentInput) {
    const html = buildL12Html(input, new URL(LOGO_PATH, window.location.origin).href);
    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    Object.assign(frame.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0' });
    document.body.appendChild(frame);

    const doc = frame.contentDocument!;
    doc.open();
    doc.write(html);
    doc.close();

    // Print only once the logo is in, or it comes out as a broken image.
    await new Promise<void>((resolve) => {
        const img = doc.querySelector('img');
        if (!img || img.complete) return resolve();
        img.addEventListener('load', () => resolve(), { once: true });
        img.addEventListener('error', () => resolve(), { once: true });
        setTimeout(resolve, 3000);
    });

    // The parent document's title names the PDF in Chrome/Safari's dialog.
    const previousTitle = document.title;
    document.title = l12FileBase(input);
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    setTimeout(() => {
        document.title = previousTitle;
        frame.remove();
    }, 1000);
}

function toBase64(bytes: Uint8Array) {
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
        binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    // 76-char lines, as MIME expects.
    return btoa(binary).replace(/.{76}/g, '$&\r\n');
}

/** Downloads the sheet as an editable Word document. */
export async function downloadL12Word(input: L12DocumentInput) {
    const html = buildL12Html(input, WORD_LOGO_LOCATION);
    let logoPart = '';
    try {
        const response = await fetch(LOGO_PATH);
        if (response.ok) {
            const logo = new Uint8Array(await response.arrayBuffer());
            logoPart = [
                '------=_BCMS_L12',
                'Content-Type: image/jpeg',
                'Content-Transfer-Encoding: base64',
                `Content-Location: ${WORD_LOGO_LOCATION}`,
                '',
                toBase64(logo),
                '',
            ].join('\r\n');
        }
    } catch {
        // The sheet is still valid without the logo.
    }

    const mhtml = [
        'MIME-Version: 1.0',
        'Content-Type: multipart/related; boundary="----=_BCMS_L12"; type="text/html"',
        '',
        '------=_BCMS_L12',
        'Content-Type: text/html; charset="utf-8"',
        'Content-Transfer-Encoding: base64',
        'Content-Location: file:///C:/bcms-l12/L12.htm',
        '',
        toBase64(new TextEncoder().encode(html)),
        '',
        logoPart,
        '------=_BCMS_L12--',
        '',
    ].join('\r\n');

    const url = URL.createObjectURL(new Blob([mhtml], { type: 'application/msword' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${l12FileBase(input)}.doc`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
}
