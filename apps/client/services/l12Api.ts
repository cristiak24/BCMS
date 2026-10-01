import { apiClient } from './apiClient';

/**
 * Formular L-12 ("Lista oficială a echipei pentru joc") — see
 * apps/server/src/routes/l12.ts. One sheet per match plus a per-team
 * "L12 constant" every new match sheet can start from.
 */

export const L12_MAX_PLAYERS = 12;

export const L12_STAFF_ROLES = [
    { key: 'headCoach', label: 'Antrenor principal' },
    { key: 'assistantCoach1', label: 'Antrenor secund 1' },
    { key: 'assistantCoach2', label: 'Antrenor secund 2' },
    { key: 'technicalDirector', label: 'Director tehnic' },
    { key: 'sportsDirector', label: 'Director sportiv' },
    { key: 'manager', label: 'Manager' },
    { key: 'doctor', label: 'Medic' },
    { key: 'trainer', label: 'Preparator' },
    { key: 'statistician', label: 'Statistician' },
] as const;

export type L12StaffRole = (typeof L12_STAFF_ROLES)[number]['key'];
export type L12StaffEntry = { name: string; license: string };

export type L12Player = {
    playerId: number;
    firstName?: string;
    lastName?: string;
    shirtNumber: string;
    license: string;
    u22: boolean;
    citizenship: string;
    naturalized: boolean;
};

export type L12Lineup = {
    id?: number;
    teamId?: number;
    eventId?: number | null;
    competition: string | null;
    gender: 'M' | 'F' | null;
    players: L12Player[];
    staff: Partial<Record<L12StaffRole, L12StaffEntry>>;
    captainPlayerId: number | null;
    updatedAt?: string | null;
};

export type L12Team = { id: number; name: string; leagueName: string; seasonName: string; gender: 'M' | 'F' | null };

export type L12Event = { id: number; title: string; type: string; startTime: string; endTime: string; location: string | null };

export type L12Overview = {
    teams: { id: number; name: string; leagueName: string; coachName: string | null; hasTemplate: boolean; templatePlayerCount: number; templateUpdatedAt: string | null }[];
    matches: { eventId: number; title: string; startTime: string; location: string | null; teamId: number | null; teamName: string | null; hasLineup: boolean; playerCount: number }[];
};

export const l12Api = {
    async overview() {
        return (await apiClient.get<L12Overview>('/l12/overview')).data;
    },
    async getTemplate(teamId: number) {
        return (await apiClient.get<{ team: L12Team; template: L12Lineup | null }>(`/l12/teams/${teamId}/template`)).data;
    },
    async saveTemplate(teamId: number, lineup: L12Lineup) {
        return (await apiClient.put<L12Lineup>(`/l12/teams/${teamId}/template`, lineup)).data;
    },
    async getForEvent(eventId: number) {
        return (await apiClient.get<{ event: L12Event; team: L12Team; lineup: L12Lineup | null; template: L12Lineup | null }>(`/l12/events/${eventId}`)).data;
    },
    async saveForEvent(eventId: number, lineup: L12Lineup) {
        return (await apiClient.put<L12Lineup>(`/l12/events/${eventId}`, lineup)).data;
    },
    async resetForEvent(eventId: number) {
        await apiClient.delete(`/l12/events/${eventId}`);
    },
};
