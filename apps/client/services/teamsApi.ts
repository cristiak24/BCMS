import { API_URL } from '../config/serverUrl';
import { apiClient, apiFetch, ApiError } from './apiClient';

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
    /** The assigned coach's account is deactivated: the team needs another coach. */
    coachDisabled?: boolean;
    isActive: boolean;
    playerCount: number;
    /** Expired + missing; kept for older code. Prefer the two counts below. */
    staleMedicalChecks: number;
    /** Had a date, now past. */
    expiredMedicalChecks?: number;
    /** Never entered. */
    missingMedicalChecks?: number;
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
    /** Move an FRB-linked team to another season (same league). */
    frbSeasonId?: string;
    seasonName?: string;
    frbTeamId?: string;
}

export interface Coach {
    id: number;
    name: string;
}

/** due = overdue (Restanță), pending = owed but not late yet. */
export type PlayerPaymentState = 'paid' | 'due' | 'pending' | 'none';

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
    /** The shared 30-day rate of the team. */
    attendance?: { attended: number; counted: number; rate: number | null };
    attendancePeriod?: AttendancePeriodInfo;
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
    /** Full date of birth (YYYY-MM-DD), when a parent gave it. Staff only. */
    birthDate?: string | null;
    category?: string;
    /** Last 30 days (utils/attendanceRate.ts); null = nothing marked in the period. */
    attendanceRate?: number | null;
    attendanceAttended?: number;
    attendanceCounted?: number;
    paymentStatus?: string;
    teamName?: string;
    teamNames?: string[];
    clubId?: number | null;
    isUnassigned?: boolean;
    paidAmount?: number;
    /** De plată: everything owed, due or not. */
    outstandingAmount?: number;
    /** Restanță: the part of it that is past due. */
    overdueAmount?: number;
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

/** Session/event as a player sees it on their own team page. */
export interface MyTeamEvent {
    id: number;
    type: 'training' | 'match' | 'camp' | 'admin' | 'medical' | string;
    title: string;
    location: string | null;
    startTime: string;
    endTime: string;
    status: string;
    coachNote: string | null;
}

export interface MyTeamPastEvent extends MyTeamEvent {
    /** The caller's own attendance for this session — never a teammate's. */
    myStatus: string | null;
    myNote: string | null;
}

export interface MyAttendanceSummary {
    rate: number | null;
    present: number;
    total: number;
}

/** One card on "Echipa mea" — team identity only, no squad names. */
export interface MyTeamSummary {
    id: number;
    name: string;
    leagueName: string;
    seasonName: string;
    gender: TeamGender | null;
    level: TeamLevel | null;
    isActive: boolean;
    coachName: string | null;
    playerCount: number;
    upcomingCount: number;
    nextEvent: MyTeamEvent | null;
    attendance: MyAttendanceSummary;
}

export interface MyTeamDetail {
    id: number;
    name: string;
    leagueName: string;
    seasonName: string;
    gender: TeamGender | null;
    level: TeamLevel | null;
    isActive: boolean;
    coach: { id: number; name: string } | null;
    playerCount: number;
    roster: {
        id: number;
        firstName: string;
        lastName: string;
        number: number | null;
        avatarUrl: string | null;
        isMe: boolean;
    }[];
    attendance: MyAttendanceSummary;
    upcomingEvents: MyTeamEvent[];
    recentEvents: MyTeamPastEvent[];
}

export type AttendancePeriodInfo = { days: number; from: string; to: string };

/** What Lot asks the server for (search, filters, sort, page). */
export type RosterPageQuery = {
    q?: string;
    team?: string;
    status?: 'active' | 'inactive' | 'all';
    attendance?: 'all' | 'high' | 'medium' | 'low';
    payment?: 'all' | 'paid' | 'pending' | 'overdue';
    sort?: 'name' | 'attendance' | 'payment';
    dir?: 'asc' | 'desc';
    page: number;
    /** 'all' = every matching player (CSV export). */
    pageSize: number | 'all';
};

export interface RosterPage {
    items: Player[];
    /** Players matching the search and filters. */
    total: number;
    page: number;
    totalPages: number;
    /** The whole roster, unfiltered. */
    rosterTotal: number;
    /** Team names on the roster, for the team filter. */
    teams: string[];
    hasUnassigned: boolean;
}

export interface RosterSummary {
    athleteCount: number;
    /** The shared 30-day rate (same as `attendance.rate`); null = nothing marked. */
    averageAttendance: number | null;
    attendance?: { attended: number; counted: number; rate: number | null };
    attendancePeriod?: AttendancePeriodInfo;
    /** Coaches: the teams they manage. */
    teamCount?: number | null;
    currentPeriodAttendance: number | null;
    previousPeriodAttendance: number | null;
    attendanceDelta: number | null;
    /** Players with something past due (restanță). */
    pendingPayments: number;
    pendingPlayerIds: number[];
    /** Players who owe anything, due or not (de plată). Absent on older servers. */
    owingPayments?: number;
}

export interface PaymentReminderResponse {
    /** In-app notifications created (players and their parents). */
    sent: number;
    /** Players with something past due — the only ones reminded. */
    players?: number;
    /** Accounts skipped because they got a reminder in the last 7 days. */
    skipped?: number;
    recipients: {
        id: number;
        name: string;
        outstanding: number;
        overdue: number;
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

    // The same roster-visible players as searchPlayers, but paged and without
    // typing anything first — newest players show up on page one. The team
    // page's add panel narrows it to players not yet on that team.
    async browsePlayers(params: {
        limit?: number;
        offset?: number;
        query?: string;
        unassigned?: boolean;
        excludeTeamId?: number;
    } = {}): Promise<{ items: Player[]; hasMore: boolean; total: number }> {
        const { data } = await apiClient.get<{ items: Player[]; hasMore: boolean; total: number }>('/players/browse', {
            params: {
                limit: params.limit,
                offset: params.offset,
                query: params.query || undefined,
                unassigned: params.unassigned ? '1' : undefined,
                excludeTeamId: params.excludeTeamId,
            },
        });
        return data;
    },

    async getRoster(): Promise<Player[]> {
        const { data } = await apiClient.get<Player[]>('/players/roster');
        return data;
    },

    /** One page of Lot; the server searches, filters and sorts. */
    async getRosterPage(query: RosterPageQuery): Promise<RosterPage> {
        const { data } = await apiClient.get<RosterPage>('/players/roster', { params: query });
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

    /** Staff only: changes to this player's record and payments recorded for them. */
    async getPlayerHistory(id: number): Promise<{ logs: import('./clubAdminApi').AuditLogEntry[] }> {
        const { data } = await apiClient.get<{ logs: import('./clubAdminApi').AuditLogEntry[] }>(`/players/${id}/history`);
        return data;
    },

    /** Own player record (medical/compliance status, own team) — player/parent sessions only. */
    async getMyPlayerRecord(): Promise<Player | null> {
        try {
            const { data } = await apiClient.get<Player>('/players/me');
            return data;
        } catch (error) {
            if (error instanceof ApiError && error.status === 404) return null;
            throw error;
        }
    },

    /** Teams the signed-in player belongs to — player/parent sessions. */
    async getMyTeams(): Promise<MyTeamSummary[]> {
        const { data } = await apiClient.get<MyTeamSummary[]>('/players/me/teams');
        return data;
    },

    /** One of the signed-in player's own teams: squad, coach, schedule, own attendance. */
    async getMyTeamDetail(teamId: number): Promise<MyTeamDetail> {
        const { data } = await apiClient.get<MyTeamDetail>(`/players/me/teams/${teamId}`);
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
