import { apiClient, apiFetch } from './apiClient';

/** Parent ↔ child links — see apps/server/src/routes/family.ts. */

export type FamilyChild = {
    id: number;
    firstName: string;
    lastName: string;
    number: number | null;
    birthYear: number | null;
    teams: string[];
};

export type FamilyPendingRequest = { id: number; firstName: string; lastName: string; status: 'pending' | 'denied'; teamName: string };

export type GuardianAccount = { userId: number; name: string; email: string; phone: string | null; status: string };

export const familyApi = {
    async children() {
        return (await apiClient.get<{ children: FamilyChild[]; pending: FamilyPendingRequest[] }>('/family/children')).data;
    },
    async requestChild(input: { teamCode: string; firstName: string; lastName: string; birthDate: string }) {
        return (await apiClient.post<{ id: number; teamName: string }>('/family/children/request', input)).data;
    },
    async acceptInvite(token: string) {
        return (await apiClient.post<{ playerId: number }>('/family/invites/accept', { token })).data;
    },
    async guardians(playerId: number) {
        return (await apiClient.get<GuardianAccount[]>(`/family/players/${playerId}/guardians`)).data;
    },
    async createInvite(playerId: number) {
        return (await apiClient.post<{ token: string; expiresAt: string; childName: string }>(`/family/players/${playerId}/invites`)).data;
    },
    async unlink(playerId: number, userId: number) {
        await apiClient.delete(`/family/players/${playerId}/guardians/${userId}`);
    },
    async bulkAddPlayers(teamId: number, players: { firstName: string; lastName: string; birthYear: number | null }[]) {
        return apiFetch<{ created: { id: number }[]; skipped: string[] }>(`/teams/${teamId}/players/bulk`, { method: 'POST', body: JSON.stringify({ players }) });
    },
};
