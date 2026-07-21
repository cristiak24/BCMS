// Basketball API service — wraps /api/basketball/* endpoints on the backend server.
import { apiFetch as requestApi } from './apiClient';

export interface League {
    id: string;
    name: string;
}

export interface Season {
    id: string;
    text: string;
}

export interface Team {
    id: string;
    name: string;
}

export type MatchStatus = 'scheduled' | 'finished' | 'live';
export type MatchResult = 'W' | 'L' | 'D' | 'N/A';

// MatchRaw = ce vine din API (înainte de normalizare)
interface MatchRaw {
    date: string;
    time?: string;
    homeTeam: string;
    awayTeam: string;
    homeScore: string;
    awayScore: string;
    result: string;
    status: MatchStatus;
    league: string;
}

// Match = modelul folosit în UI
export interface Match {
    date: string;          // "DD.MM.YYYY"
    time: string;          // "HH:MM" sau ""
    homeTeam: string;
    awayTeam: string;
    homeScore: string;     // șir numeric sau "" dacă neprogramat
    awayScore: string;
    result: MatchResult;
    status: MatchStatus;
    league: string;
}

export interface StandingRow {
    position: number;
    team: string;
    wins: number;
    losses: number;
    played: number;
    points: number;
}

/**
 * Normalizează un meci brut primit din API.
 * Asigură că câmpurile lipsă au valori implicite sigure.
 */
export function normalizeMatch(raw: MatchRaw): Match {
    const status: MatchStatus =
        raw.status === 'finished' || raw.status === 'live' || raw.status === 'scheduled'
            ? raw.status
            : raw.homeScore && raw.homeScore !== '?' ? 'finished' : 'scheduled';

    const result: MatchResult =
        raw.result === 'W' || raw.result === 'L' || raw.result === 'D'
            ? (raw.result as MatchResult)
            : 'N/A';

    // Dacă statusul este scheduled, scorul trebuie să fie gol
    const homeScore = status === 'scheduled' ? '' : (raw.homeScore ?? '');
    const awayScore = status === 'scheduled' ? '' : (raw.awayScore ?? '');

    return {
        date: raw.date?.trim() || '',
        time: raw.time?.trim() || '',
        homeTeam: raw.homeTeam?.trim() || 'Echipă necunoscută',
        awayTeam: raw.awayTeam?.trim() || 'Echipă necunoscută',
        homeScore,
        awayScore,
        result,
        status,
        league: raw.league?.trim() || '',
    };
}

async function basketballFetch<T>(path: string): Promise<T> {
    return requestApi<T>(`/basketball${path}`);
}

export const basketballApi = {
    getLeagues: (): Promise<League[]> =>
        basketballFetch<League[]>('/leagues'),

    getSeasons: (leagueId: string): Promise<Season[]> =>
        basketballFetch<Season[]>(`/seasons?leagueId=${leagueId}`),

    getTeams: (leagueId: string, seasonId: string): Promise<Team[]> =>
        basketballFetch<Team[]>(`/teams?leagueId=${leagueId}&seasonId=${seasonId}`),

    getMatches: async (
        leagueId: string,
        seasonId: string,
        teamId: string,
        month?: number | string
    ): Promise<Match[]> => {
        const raw = await basketballFetch<MatchRaw[]>(
            `/matches?leagueId=${leagueId}&seasonId=${seasonId}&teamId=${teamId}${month ? `&month=${month}` : ''}`
        );
        // Normalizăm fiecare meci înainte de a ajunge în UI
        return (raw ?? []).map(normalizeMatch);
    },

    getStandings: (leagueId: string, seasonId: string): Promise<StandingRow[]> =>
        basketballFetch<StandingRow[]>(`/standings?leagueId=${leagueId}&seasonId=${seasonId}`),
};
