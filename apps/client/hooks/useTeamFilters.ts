import { useMemo, useState } from 'react';
import type { Team } from '../services/teamsApi';
import { isFrbTeam } from '../components/myclub/teamDisplay';

export type SourceFilter = 'all' | 'frb' | 'manual';
export type GenderFilter = 'all' | 'M' | 'F';
export type LevelFilter = 'all' | 'national' | 'municipal' | 'initiere';
export type StatusFilter = 'all' | 'active' | 'inactive';

export interface TeamFiltersState {
    search: string;
    source: SourceFilter;
    gender: GenderFilter;
    level: LevelFilter;
    status: StatusFilter;
    coachId: number | 'all';
}

const DEFAULT_FILTERS: TeamFiltersState = {
    search: '',
    source: 'all',
    gender: 'all',
    level: 'all',
    status: 'all',
    coachId: 'all',
};

export function useTeamFilters(teams: Team[]) {
    const [filters, setFilters] = useState<TeamFiltersState>(DEFAULT_FILTERS);

    const filteredTeams = useMemo(() => {
        const query = filters.search.trim().toLowerCase();

        return teams.filter((team) => {
            const isFrb = isFrbTeam(team);
            if (filters.source === 'frb' && !isFrb) return false;
            if (filters.source === 'manual' && isFrb) return false;
            if (filters.gender !== 'all' && team.gender !== filters.gender) return false;
            if (filters.level !== 'all' && team.level !== filters.level) return false;
            if (filters.status === 'active' && !team.isActive) return false;
            if (filters.status === 'inactive' && team.isActive) return false;
            if (filters.coachId !== 'all' && team.coachId !== filters.coachId) return false;

            if (query) {
                const haystack = `${team.name} ${team.leagueName} ${team.seasonName} ${team.coachName ?? ''}`.toLowerCase();
                if (!haystack.includes(query)) return false;
            }

            return true;
        });
    }, [teams, filters]);

    const setFilter = <K extends keyof TeamFiltersState>(key: K, value: TeamFiltersState[K]) => {
        setFilters((prev) => ({ ...prev, [key]: value }));
    };

    const hasActiveFilters =
        filters.search.trim().length > 0 ||
        filters.source !== 'all' ||
        filters.gender !== 'all' ||
        filters.level !== 'all' ||
        filters.status !== 'all' ||
        filters.coachId !== 'all';

    const resetFilters = () => setFilters(DEFAULT_FILTERS);

    return { filters, setFilter, resetFilters, filteredTeams, hasActiveFilters };
}
