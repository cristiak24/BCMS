import { apiClient } from './apiClient';
import type { GameEvent, GameMode } from '../utils/gameStats';

/** Live match statistics — see apps/server/src/routes/games.ts. */

export type GameRosterEntry = { playerId: number; number: string; firstName: string; lastName: string };
export type LineupEntry = GameRosterEntry & { onL12: boolean };
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
    event: { id: number; title: string; startTime: string; location: string | null };
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

export const gamesApi = {
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
    async finish(eventId: number) {
        return (await apiClient.post<Game>(`/games/events/${eventId}/finish`)).data;
    },
    async assigned() {
        return (await apiClient.get<{ eventId: number; title: string; startTime: string; status: string }[]>('/games/assigned')).data;
    },
};
