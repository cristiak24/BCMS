import { API_URL } from '../config/serverUrl';
import { apiClient, apiFetch } from './apiClient';

const TEAMS_BASE_URL = '/teams';
export { API_URL };

export type TeamGender = 'M' | 'F';
export type TeamLevel = 'national' | 'municipal' | 'initiere';

export interface Team {
    id: number;
    frbTeamId: string;
    name: string;
    frbLeagueId: string;
    leagueName: string;
    frbSeasonId: string;
    seasonName: string;
    inviteCode: string;
    clubId: number | null;
    gender: TeamGender | null;
    level: TeamLevel | null;
    coachId: number | null;
    coachName: string | null;
    isActive: boolean;
    playerCount: number;
    staleMedicalChecks: number;
    createdAt: string;
    updatedAt: string;
}

export type DBTeam = Team;
export interface CreateTeamPayload {
    frbTeamId?: string;
    name: string;
    frbLeagueId?: string;
    leagueName: string;
    frbSeasonId?: string;
    seasonName: string;
    isCustom?: boolean;
    gender: TeamGender;
    level?: TeamLevel;
    coachId?: number | null;
}

export interface UpdateTeamPayload {
    name?: string;
    gender?: TeamGender;
    level?: TeamLevel;
    coachId?: number | null;
    isActive?: boolean;
}

export interface Coach {
    id: number;
    name: string;
}

export type PlayerPaymentState = 'paid' | 'due' | 'none';

export interface TeamPlayerStat {
    playerId: number;
    attendanceRate: number | null;
    present: number;
    total: number;
    monthlyRate: number | null;
    paymentStatus: PlayerPaymentState;
    outstandingAmount: number;
}

export interface TeamStats {
    monthlyAttendanceRate: number | null;
    previousMonthAttendanceRate: number | null;
    overallAttendanceRate: number | null;
    playersWithArrears: number;
    totalOutstanding: number;
    players: TeamPlayerStat[];
}

export interface Player {
    id: number;
    firstName: string;
    lastName: string;
    email: string | null;
    number: number | null;
    position: string | null;
    status: string | null;
    avatarUrl: string | null;
    medicalCheckExpiry: string | null;
    birthYear: number | null;
    category?: string;
    attendanceRate?: number;
    paymentStatus?: string;
    teamName?: string;
    teamNames?: string[];
    clubId?: number | null;
    isUnassigned?: boolean;
    paidAmount?: number;
    outstandingAmount?: number;
    amountDue?: number;
    paymentCurrency?: string;
    paymentTransactions?: {
        id: string;
        label: string;
        amount: number;
        currency: string;
        status: 'success' | 'error';
        date: string;
    }[];
}

export interface RosterSummary {
    athleteCount: number;
    averageAttendance: number;
    currentPeriodAttendance: number | null;
    previousPeriodAttendance: number | null;
    attendanceDelta: number | null;
    pendingPayments: number;
    pendingPlayerIds: number[];
}

export interface PaymentReminderResponse {
    sent: number;
    recipients: {
        id: number;
        firstName: string;
        lastName: string;
        email: string | null;
        paymentStatus: string;
    }[];
    sentAt: string;
    provider: string;
}

export const teamsApi = {
    async getTeams(): Promise<Team[]> {
        return apiFetch<Team[]>(TEAMS_BASE_URL);
    },

    async getTeamById(id: number): Promise<Team> {
        return apiFetch<Team>(`${TEAMS_BASE_URL}/${id}`);
    },
    
    async addTeam(team: CreateTeamPayload): Promise<Team> {
        return apiFetch<Team>(TEAMS_BASE_URL, {
            method: 'POST',
            body: JSON.stringify(team),
        });
    },

    async updateTeam(id: number, payload: UpdateTeamPayload): Promise<Team> {
        return apiFetch<Team>(`${TEAMS_BASE_URL}/${id}`, {
            method: 'PATCH',
            body: JSON.stringify(payload),
        });
    },

    async deleteTeam(id: number): Promise<void> {
        await apiFetch<void>(`${TEAMS_BASE_URL}/${id}`, { method: 'DELETE' }, 'void');
    },

    async getCoaches(): Promise<Coach[]> {
        return apiFetch<Coach[]>(`${TEAMS_BASE_URL}/coaches`);
    },

    async getTeamStats(id: number): Promise<TeamStats> {
        return apiFetch<TeamStats>(`${TEAMS_BASE_URL}/${id}/stats`);
    },

    async getTeamPlayers(id: number): Promise<Player[]> {
        return apiFetch<Player[]>(`${TEAMS_BASE_URL}/${id}/players`);
    },

    async searchPlayers(query: string): Promise<Player[]> {
        const { data } = await apiClient.get<Player[]>('/players/search', {
            params: { query },
        });
        return data;
    },

    async getRoster(): Promise<Player[]> {
        const { data } = await apiClient.get<Player[]>('/players/roster');
        return data;
    },

    async getRosterSummary(): Promise<RosterSummary> {
        const { data } = await apiClient.get<RosterSummary>('/players/roster/summary');
        return data;
    },

    async getPlayerById(id: number): Promise<Player> {
        const { data } = await apiClient.get<Player>(`/players/${id}`);
        return data;
    },

    async addPlayerToTeam(playerId: number, teamId: number): Promise<void> {
        await apiClient.post('/players/add-to-team', { playerId, teamId });
    },

    async removePlayerFromTeam(teamId: number, playerId: number): Promise<void> {
        await apiFetch<void>(`${TEAMS_BASE_URL}/${teamId}/players/${playerId}`, { method: 'DELETE' }, 'void');
    },

    async sendPaymentReminders(): Promise<PaymentReminderResponse> {
        const { data } = await apiClient.post<PaymentReminderResponse>('/players/payment-reminders');
        return data;
    },

    async removePlayerFromRoster(playerId: number): Promise<void> {
        await apiClient.delete(`/players/${playerId}/roster`);
    },

    async updatePlayer(id: number, player: Partial<Player>): Promise<Player> {
        const { data } = await apiClient.put<Player>(`/players/${id}`, player);
        return data;
    }
};
