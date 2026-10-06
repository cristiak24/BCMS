import { isSuperadmin, resolveRequestClubId, type TenantUser } from './tenantScope';

/**
 * Which slice of the database the dashboard summary may aggregate over.
 *
 * - `all`:  superadmin, sees every club's totals.
 * - `club`: a caller tied to one club; every query must filter to it.
 * - `none`: a non-superadmin without a usable club. They see empty totals rather
 *   than everyone's — a null club id must never widen into "all clubs".
 *
 * Kept free of any store dependency so the decision is unit-tested; the route
 * module opens a database pool on import.
 */
export type DashboardClubScope =
    | { kind: 'all' }
    | { kind: 'club'; clubId: number }
    | { kind: 'none' };

export function resolveDashboardClubScope(user: TenantUser): DashboardClubScope {
    if (!user) {
        return { kind: 'none' };
    }

    if (isSuperadmin(user)) {
        return { kind: 'all' };
    }

    const clubId = resolveRequestClubId(user);
    return clubId == null ? { kind: 'none' } : { kind: 'club', clubId };
}

/**
 * The `financial_settings` row holding this scope's fees, or null when there is no
 * single club to read for.
 *
 * Mirrors getSettingsData in routes/finance.ts: the row id doubles as the club id
 * (see the TODO(schema) note there). Reading row 1 for everyone would show club 1's
 * fees on every club's dashboard.
 */
export function dashboardSettingsRowId(scope: DashboardClubScope): number | null {
    return scope.kind === 'club' ? scope.clubId : null;
}
