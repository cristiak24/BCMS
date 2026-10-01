import { apiClient } from './apiClient';

/** Team-code signups awaiting approval — see apps/server/src/routes/familyRequests.ts. */

export type JoinSuggestion = {
    id: number;
    firstName: string | null;
    lastName: string | null;
    birthYear: number | null;
    number: number | null;
    hasAccount: boolean;
    guardians: number;
    teams: string[];
    exact: boolean;
    sameBirthYear: boolean;
};

export type FamilyJoinRequest = {
    id: number;
    kind: 'parent' | 'player';
    status: 'pending' | 'approved' | 'denied';
    team: { id: number; name: string };
    requester: { id: number; name: string; email: string; phone: string | null };
    child: { firstName: string; lastName: string; birthDate: string | null };
    playerId: number | null;
    createdAt: string;
    suggestions: JoinSuggestion[];
};

export type TeamJoinCode = { id: number; name: string; code: string };

export const familyRequestsApi = {
    async list() {
        return (await apiClient.get<FamilyJoinRequest[]>('/family-requests')).data;
    },
    async approve(id: number, playerId: number | 'new') {
        return (await apiClient.post<{ requestId: number; playerId: number; created: boolean }>(`/family-requests/${id}/approve`, { playerId })).data;
    },
    async deny(id: number) {
        return (await apiClient.post(`/family-requests/${id}/deny`)).data;
    },
    async approveAll(ids: number[]) {
        return (await apiClient.post<{ results: { id: number; ok: boolean; error?: string; created?: boolean }[] }>('/family-requests/approve-all', { ids })).data;
    },
    async teamCodes() {
        return (await apiClient.get<TeamJoinCode[]>('/family-requests/team-codes')).data;
    },
    async rotateCode(teamId: number) {
        return (await apiClient.post<TeamJoinCode>(`/family-requests/team-codes/${teamId}/rotate`)).data;
    },
};

/** "4KQ72M" → "4KQ-72M" for reading out loud. */
export function formatTeamCode(code: string) {
    return code.length === 6 ? `${code.slice(0, 3)}-${code.slice(3)}` : code;
}
