import { useEffect, useMemo, useState } from 'react';
import type { Team, TeamLevel } from '../services/teamsApi';
import { isFrbTeam } from '../components/myclub/teamDisplay';

export type SourceFilter = 'all' | 'frb' | 'manual';
export type GenderFilter = 'all' | 'M' | 'F';
export type LevelFilter = 'all' | TeamLevel;
export type StatusFilter = 'all' | 'active' | 'inactive';

export type SortKey = 'name' | 'players' | 'updated' | 'medical';
export type SortDir = 'asc' | 'desc';

export interface TeamFiltersState {
    search: string;
    source: SourceFilter;
    gender: GenderFilter;
    level: LevelFilter;
    status: StatusFilter;
    coachId: number | 'all';
}

export interface SortState {
    key: SortKey;
    dir: SortDir;
}

/** Counts shown next to each filter option so admins see the distribution at a glance. */
export interface FilterCounts {
    source: Record<SourceFilter, number>;
    gender: Record<GenderFilter, number>;
    level: Record<string, number>;
    status: Record<StatusFilter, number>;
}

const DEFAULT_FILTERS: TeamFiltersState = {
    search: '',
    source: 'all',
    gender: 'all',
    level: 'all',
    status: 'all',
    coachId: 'all',
};

const DEFAULT_SORT: SortState = { key: 'updated', dir: 'desc' };

const LEVEL_ORDER: TeamLevel[] = ['national', 'municipal', 'initiere'];

const STORAGE_KEY = 'myclub.filters.v1';

interface PersistedState {
    filters?: Partial<TeamFiltersState>;
    sort?: Partial<SortState>;
}

function loadPersisted(): PersistedState {
    if (typeof window === 'undefined') return {};
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        return raw ? (JSON.parse(raw) as PersistedState) : {};
    } catch {
        return {};
    }
}

export function useTeamFilters(teams: Team[]) {
    const persisted = useMemo(loadPersisted, []);
    const [filters, setFilters] = useState<TeamFiltersState>({ ...DEFAULT_FILTERS, ...persisted.filters });
    const [sort, setSort] = useState<SortState>({ ...DEFAULT_SORT, ...persisted.sort });

    // Persist filters + sort so a refresh or a round-trip to a team detail keeps the view.
    useEffect(() => {
        if (typeof window === 'undefined') return;
        try {
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ filters, sort }));
        } catch {
            /* storage full or blocked — non-fatal */
        }
    }, [filters, sort]);

    // Levels actually present in the data, in canonical order, so the filter never hides real teams.
    const availableLevels = useMemo(() => {
        const present = new Set<TeamLevel>();
        teams.forEach((t) => {
            if (t.level) present.add(t.level);
        });
        return LEVEL_ORDER.filter((l) => present.has(l));
    }, [teams]);

    const counts = useMemo<FilterCounts>(() => {
        const c: FilterCounts = {
            source: { all: teams.length, frb: 0, manual: 0 },
            gender: { all: teams.length, M: 0, F: 0 },
            level: { all: teams.length },
            status: { all: teams.length, active: 0, inactive: 0 },
        };
        teams.forEach((t) => {
            if (isFrbTeam(t)) c.source.frb += 1; else c.source.manual += 1;
            if (t.gender === 'M') c.gender.M += 1; else if (t.gender === 'F') c.gender.F += 1;
            if (t.level) c.level[t.level] = (c.level[t.level] ?? 0) + 1;
            if (t.isActive) c.status.active += 1; else c.status.inactive += 1;
        });
        return c;
    }, [teams]);

    const filteredTeams = useMemo(() => {
        const query = filters.search.trim().toLowerCase();

        const matched = teams.filter((team) => {
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

        const dir = sort.dir === 'asc' ? 1 : -1;
        const sorted = [...matched].sort((a, b) => {
            switch (sort.key) {
                case 'name':
                    return a.name.localeCompare(b.name, 'ro') * dir;
                case 'players':
                    return (a.playerCount - b.playerCount) * dir;
                case 'medical':
                    return (a.staleMedicalChecks - b.staleMedicalChecks) * dir;
                case 'updated':
                default: {
                    const ta = new Date(a.updatedAt).getTime() || 0;
                    const tb = new Date(b.updatedAt).getTime() || 0;
                    return (ta - tb) * dir;
                }
            }
        });

        return sorted;
    }, [teams, filters, sort]);

    const setFilter = <K extends keyof TeamFiltersState>(key: K, value: TeamFiltersState[K]) => {
        setFilters((prev) => ({ ...prev, [key]: value }));
    };

    /** Toggle a sortable column: same key flips direction, new key starts descending. */
    const toggleSort = (key: SortKey) => {
        setSort((prev) => (prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' }));
    };

    const activeFilterCount =
        (filters.search.trim().length > 0 ? 1 : 0) +
        (filters.source !== 'all' ? 1 : 0) +
        (filters.gender !== 'all' ? 1 : 0) +
        (filters.level !== 'all' ? 1 : 0) +
        (filters.status !== 'all' ? 1 : 0) +
        (filters.coachId !== 'all' ? 1 : 0);

    const hasActiveFilters = activeFilterCount > 0;

    const resetFilters = () => setFilters(DEFAULT_FILTERS);

    return {
        filters,
        setFilter,
        resetFilters,
        filteredTeams,
        hasActiveFilters,
        activeFilterCount,
        sort,
        setSort,
        toggleSort,
        counts,
        availableLevels,
    };
}
