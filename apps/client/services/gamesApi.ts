import { apiClient } from './apiClient';
import type { GameEvent, GameMode } from '../utils/gameStats';

/** Live match statistics — see apps/server/src/routes/games.ts. */

export type GameRosterEntry = { playerId: number; number: string; firstName: string; lastName: string };
/** `visaExpired`: doesn't play; `visaMissing`: may play, flagged (server games.ts). With an L12 saved, only its players come. */
export type LineupEntry = GameRosterEntry & { onL12: boolean; visaExpired?: boolean; visaMissing?: boolean };
export type OpponentEntry = { number: string; name: string };

export type Game = {
    id: number;
    eventId: number;
    mode: GameMode;
    status: 'setup' | 'live' | 'finished';
    periodSec: number | null;
    opponentName: string | null;
    opponentRoster: OpponentEntry[];
    roster: GameRosterEntry[];
    starters: number[];
    scorekeeperUserId: number | null;
    scoreUs: number;
    scoreThem: number;
    currentPeriod: number;
    clockSec: number | null;
    updatedAt: string | null;
    finishedAt: string | null;
};

export type GamePayload = {
    event: { id: number; title: string; startTime: string; location: string | null; opponent?: string | null };
    team: { id: number; name: string };
    canKeep: boolean;
    canSetup: boolean;
    game: Game | null;
    events: GameEvent[];
    lineup: LineupEntry[];
};

export type GameSetupInput = {
    mode: GameMode;
    periodSec: number | null;
    opponentName: string;
    opponentRoster: OpponentEntry[];
    roster: number[];
    starters: number[];
    scorekeeperUserId: number | null;
};

/** Season statistics of one player — server lib/seasonStats.ts. Null = nothing to average. */
export type SeasonTotals = {
    games: number;
    fullGames: number;
    timedGames: number;
    totals: { pts: number; pf: number; fgm2: number; fgm3: number; ftm: number; reb: number; ast: number; stl: number; blk: number; tov: number; secondsPlayed: number };
    averages: { pts: number | null; pf: number | null; reb: number | null; ast: number | null; stl: number | null; blk: number | null; tov: number | null; minutes: number | null };
    shooting: { fgm2: number; fga2: number; fgm3: number; fga3: number; ftm: number; fta: number; fg2Pct: number | null; fg3Pct: number | null; ftPct: number | null };
};

export type SeasonInfo = { label: string; startYear: number };

export type PlayerSeason = SeasonTotals & {
    season: SeasonInfo;
    recent: {
        eventId: number;
        title: string;
        startTime: string | null;
        opponentName: string | null;
        mode: GameMode;
        scoreUs: number;
        scoreThem: number;
        pts: number;
        reb: number | null;
        ast: number | null;
        pf: number;
        minutes: number | null;
    }[];
};

export type TeamSeasonRow = SeasonTotals & { playerId: number; firstName: string; lastName: string; number: string };
export type TeamSeason = { season: SeasonInfo; games: number; players: TeamSeasonRow[] };

export const gamesApi = {
    async playerSeason(playerId: number) {
        return (await apiClient.get<PlayerSeason>(`/games/season/players/${playerId}`)).data;
    },
    async teamSeason(teamId: number) {
        return (await apiClient.get<TeamSeason>(`/games/season/teams/${teamId}`)).data;
    },
    async get(eventId: number) {
        return (await apiClient.get<GamePayload>(`/games/events/${eventId}`)).data;
    },
    async keepers(eventId: number) {
        return (await apiClient.get<{ id: number; name: string; role: string }[]>(`/games/events/${eventId}/keepers`)).data;
    },
    async setup(eventId: number, input: GameSetupInput) {
        return (await apiClient.put<Game>(`/games/events/${eventId}/setup`, input)).data;
    },
    async push(eventId: number, events: GameEvent[], state: { period: number; clockSec: number | null }) {
        return (await apiClient.post<{ acked: string[]; rejected: { clientId: string; error: string }[]; scoreUs: number; scoreThem: number }>(
            `/games/events/${eventId}/events`, { events, state },
        )).data;
    },
    /** Club admin only: a finished match back to live, to correct the sheet. */
    async reopen(eventId: number) {
        return (await apiClient.post<Game>(`/games/events/${eventId}/reopen`)).data;
    },
    async finish(eventId: number) {
        return (await apiClient.post<Game>(`/games/events/${eventId}/finish`)).data;
    },
    async assigned() {
        return (await apiClient.get<{ eventId: number; title: string; startTime: string; status: string }[]>('/games/assigned')).data;
    },
};
