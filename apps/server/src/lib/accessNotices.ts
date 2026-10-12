export type RequestRole = 'parent' | 'player' | 'coach' | 'staff' | 'accountant' | 'admin';
export type OwnRequestStatus = 'pending' | 'approved' | 'denied';

const ROLE_LABELS: Record<string, string> = {
    parent: 'părinte',
    player: 'sportiv',
    coach: 'antrenor',
    staff: 'staff',
    accountant: 'contabil',
    admin: 'administrator',
};

export function roleLabel(role: string) {
    return ROLE_LABELS[role] ?? role;
}

function joinNames(names: string[]) {
    if (names.length <= 1) return names[0] ?? '';
    return `${names.slice(0, -1).join(', ')} și ${names[names.length - 1]}`;
}

/** What the club's reviewers read when a new request lands. */
export function reviewerNotice(params: {
    requesterName: string;
    role: string;
    children?: string[];
    teamName?: string | null;
}) {
    const who = params.requesterName.trim() || 'Un utilizator nou';
    const children = (params.children ?? []).filter(Boolean);
    const team = params.teamName ? ` la ${params.teamName}` : '';
    const message = params.role === 'parent' && children.length
        ? `${who} cere acces ca părinte pentru ${joinNames(children)}${team}.`
        : `${who} cere acces ca ${roleLabel(params.role)}${team}.`;
    return { type: 'access_request', title: 'Cerere nouă de acces', message };
}

/** What the person who asked reads once someone decided. `subject` names what was decided on. */
export function decisionNotice(params: { decision: 'approved' | 'denied'; subject?: string | null }) {
    const about = params.subject ? ` pentru ${params.subject}` : '';
    if (params.decision === 'approved') {
        return {
            type: 'access_approved',
            title: 'Cerere aprobată',
            message: `Cererea ta${about} a fost aprobată. Poți intra în aplicație.`,
        };
    }
    return {
        type: 'access_denied',
        title: 'Cerere respinsă',
        message: `Cererea ta${about} a fost respinsă. Dacă crezi că e o greșeală, vorbește cu antrenorul sau cu administratorul clubului.`,
    };
}

/** What a join request is about, as the requester reads it: the child with their team, or just the team. */
export function joinSubject(request: { kind: string; childFirstName: string; childLastName: string }, teamName: string | null) {
    if (request.kind !== 'parent') return teamName ? `echipa ${teamName}` : null;
    const child = `${request.childFirstName} ${request.childLastName}`.trim();
    return teamName ? `${child} (${teamName})` : child;
}

export type OwnRequest = {
    id: string;
    label: string;
    detail: string | null;
    status: OwnRequestStatus;
    createdAt: string;
};

/**
 * One state for the waiting screen: "denied" only when every request was
 * turned down — a single pending request (or an approved one) keeps it open.
 */
export function summarizeOwnRequests(requests: OwnRequest[]): { state: 'pending' | 'denied'; requests: OwnRequest[] } {
    const sorted = [...requests].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const denied = sorted.length > 0 && sorted.every((request) => request.status === 'denied');
    return { state: denied ? 'denied' : 'pending', requests: sorted };
}
