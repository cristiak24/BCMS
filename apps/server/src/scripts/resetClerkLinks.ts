/**
 * Trecerea pe instanța Clerk de producție: fiecare persoană primește acolo un
 * `user_…` nou, iar lib/identityLink.ts refuză să lege un rând deja legat de
 * alt id Clerk. Scriptul golește legătura (`users.firebase_uid = NULL`), ca
 * prima logare pe instanța nouă să lege contul prin emailul VERIFICAT
 * (findOrLinkUser), exact ca la un cont creat înainte de prima logare.
 *
 *   DATABASE_URL=… npx tsx src/scripts/resetClerkLinks.ts            # dry run: doar numără și listează
 *   DATABASE_URL=… npx tsx src/scripts/resetClerkLinks.ts --apply    # scrie, într-o singură tranzacție
 *
 * Nu atinge nimic altceva: rolurile, cluburile și datele rămân. `users.uid`
 * (coloană veche) nu e folosit la legare pentru id-uri noi, deci rămâne.
 * Rulează-l DOAR în momentul schimbării cheilor Clerk (vezi LAUNCH-CHECKLIST):
 * cât timp aplicația merge încă pe instanța de dezvoltare, un cont fără email
 * verificat acolo nu s-ar mai putea lega.
 */
import { isNotNull } from 'drizzle-orm';
import { db, pglite, pool } from '../db';
import { users } from '../db/schema';

export type LinkedAccount = { id: number; email: string; role: string; status: string; clerkUserId: string };

export type ResetResult = { accounts: LinkedAccount[]; cleared: number; applied: boolean };

/** `ana.pop@club.ro` → `a***@club.ro`: destul cât să recunoști contul în consolă. */
export function maskEmail(email: string) {
    const [local, domain] = email.split('@');
    if (!domain) return '***';
    return `${local.slice(0, 1)}***@${domain}`;
}

export async function resetClerkLinks({ apply }: { apply: boolean }): Promise<ResetResult> {
    const accounts = await db
        .select({ id: users.id, email: users.email, role: users.role, status: users.status, clerkUserId: users.clerkUserId })
        .from(users)
        .where(isNotNull(users.clerkUserId))
        .orderBy(users.id) as LinkedAccount[];

    if (!apply || !accounts.length) return { accounts, cleared: 0, applied: false };

    const cleared = await db.transaction(async (tx) => {
        const rows = await tx
            .update(users)
            .set({ clerkUserId: null, updatedAt: new Date().toISOString() })
            .where(isNotNull(users.clerkUserId))
            .returning({ id: users.id });
        return rows.length;
    });
    return { accounts, cleared, applied: true };
}

function databaseLabel(url: string | undefined) {
    if (!url) return '(DATABASE_URL lipsă)';
    if (url.startsWith('pglite:')) return url;
    try {
        return new URL(url).host;
    } catch {
        return '(DATABASE_URL nevalid)';
    }
}

async function main() {
    const apply = process.argv.includes('--apply');
    console.log(`Baza de date: ${databaseLabel(process.env.DATABASE_URL)}`);
    const result = await resetClerkLinks({ apply });

    const byRole = new Map<string, number>();
    for (const account of result.accounts) {
        byRole.set(account.role, (byRole.get(account.role) ?? 0) + 1);
        const kind = account.clerkUserId.startsWith('user_') ? 'clerk' : 'pre-Clerk';
        console.log(`#${account.id} ${maskEmail(account.email)} · ${account.role} · ${account.status} · ${kind}`);
    }
    const roles = [...byRole].map(([role, count]) => `${role}: ${count}`).join(', ') || '—';
    console.log(`${result.accounts.length} conturi legate de un id Clerk (${roles}).`);
    console.log(result.applied
        ? `${result.cleared} legături golite. Prima logare pe instanța nouă le leagă prin emailul verificat.`
        : 'Dry run — nimic scris; rulează cu --apply.');
}

if (require.main === module) {
    main()
        .catch((error) => { console.error(error); process.exitCode = 1; })
        .finally(async () => { await pool?.end(); await pglite?.close(); });
}
