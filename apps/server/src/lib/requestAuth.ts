export function normalizeRole(role?: string | null) {
    return String(role ?? '').trim().toLowerCase();
}
