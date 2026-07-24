import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, TextInput } from '@/src/web/reactNative';
import { Search, LayoutGrid, Table2, ArrowUpDown, X, SlidersHorizontal } from 'lucide-react';
import type { Coach } from '../../services/teamsApi';
import type {
    FilterCounts,
    GenderFilter,
    LevelFilter,
    SortKey,
    SortState,
    SourceFilter,
    StatusFilter,
    TeamFiltersState,
} from '../../hooks/useTeamFilters';
import { LEVEL_LABELS } from './teamDisplay';
import type { TeamLevel } from '../../services/teamsApi';

/*
 * Team filter bar.
 *
 * The old version rendered ALL FIVE filter dimensions (Tip / Sex / Nivel /
 * Status / Antrenor), fully expanded, every option shown with its count —
 * regardless of whether the filter could do anything. A club whose 11 teams
 * are all active still saw "Status: Toate 11 · Activă 11 · Inactivă 0", a
 * control that partitions nothing. Five such rows of always-on chips is the
 * "haos" the redesign targets: it reads as configuration, misleads about what
 * varies in the data, and buries the two filters that matter.
 *
 * The rule now: a dimension is only worth showing inline if it actually splits
 * the set — i.e. at least two of its buckets are non-empty (`isMeaningful`) —
 * or if it currently holds an active value. Everything else collapses behind a
 * "Filtre" button, so the default state is calm.
 */

type ChipOption<T extends string> = { value: T; label: string; dot?: string; count?: number };

/** A dimension earns an inline spot only when ≥2 of its non-"all" buckets are populated. */
function isMeaningful<T extends string>(options: ChipOption<T>[]): boolean {
    return options.filter((o) => o.value !== 'all' && (o.count ?? 0) > 0).length >= 2;
}

function ChipGroup<T extends string>({
    label,
    options,
    value,
    onChange,
}: {
    label: string;
    options: ChipOption<T>[];
    value: T;
    onChange: (value: T) => void;
}) {
    return (
        <View className="flex-row items-center flex-wrap gap-1">
            <Text className="text-[10px] font-semibold uppercase tracking-wider mr-1" style={{ color: 'var(--c-faint)' }}>{label}</Text>
            {options.map((opt) => {
                const active = opt.value === value;
                return (
                    <Pressable
                        key={opt.value}
                        onPress={() => onChange(opt.value)}
                        className="flex-row items-center gap-1.5 px-2.5 h-7 rounded-[8px] border"
                        style={active
                            ? { backgroundColor: 'var(--c-brand-surface)', borderColor: 'transparent' }
                            : { backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-border)' }}
                    >
                        {opt.dot ? <View className="w-[6px] h-[6px] rounded-full" style={{ backgroundColor: opt.dot }} /> : null}
                        <Text className="text-[12px] font-semibold" style={{ color: active ? 'var(--c-on-brand)' : 'var(--c-ink-soft)' }}>{opt.label}</Text>
                        {typeof opt.count === 'number' && (
                            <Text className="text-[11px] font-semibold" style={{ color: active ? 'rgba(255,255,255,0.7)' : 'var(--c-faint)' }}>{opt.count}</Text>
                        )}
                    </Pressable>
                );
            })}
        </View>
    );
}

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
    { value: 'updated', label: 'Actualizare' },
    { value: 'name', label: 'Nume' },
    { value: 'players', label: 'Jucători' },
    { value: 'medical', label: 'Vize expirate' },
];

export default function TeamFiltersBar({
    filters,
    setFilter,
    coaches,
    view,
    onViewChange,
    activeFilterCount,
    onReset,
    sort,
    setSort,
    counts,
    availableLevels,
}: {
    filters: TeamFiltersState;
    setFilter: <K extends keyof TeamFiltersState>(key: K, value: TeamFiltersState[K]) => void;
    coaches: Coach[];
    view: 'grid' | 'table';
    onViewChange: (view: 'grid' | 'table') => void;
    activeFilterCount: number;
    onReset: () => void;
    sort: SortState;
    setSort: (sort: SortState) => void;
    counts: FilterCounts;
    availableLevels: TeamLevel[];
}) {
    const [searchDraft, setSearchDraft] = useState(filters.search);
    const [expanded, setExpanded] = useState(false);

    // Keep the local input in sync when filters are reset from the outside.
    useEffect(() => {
        setSearchDraft(filters.search);
    }, [filters.search]);

    useEffect(() => {
        const timer = setTimeout(() => setFilter('search', searchDraft), 150);
        return () => clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchDraft]);

    const sourceOptions: ChipOption<SourceFilter>[] = [
        { value: 'all', label: 'Toate', count: counts.source.all },
        { value: 'frb', label: 'FRB', dot: 'var(--c-danger)', count: counts.source.frb },
        { value: 'manual', label: 'Manual', dot: 'var(--c-success)', count: counts.source.manual },
    ];
    const genderOptions: ChipOption<GenderFilter>[] = [
        { value: 'all', label: 'Toate', count: counts.gender.all },
        { value: 'M', label: 'Masculin', dot: '#28345E', count: counts.gender.M },
        { value: 'F', label: 'Feminin', dot: '#7C3560', count: counts.gender.F },
    ];
    const levelOptions: ChipOption<LevelFilter>[] = [
        { value: 'all', label: 'Toate', count: counts.level.all },
        ...availableLevels.map((lvl) => ({
            value: lvl as LevelFilter,
            label: LEVEL_LABELS[lvl],
            count: counts.level[lvl] ?? 0,
        })),
    ];
    const statusOptions: ChipOption<StatusFilter>[] = [
        { value: 'all', label: 'Toate', count: counts.status.all },
        { value: 'active', label: 'Activă', count: counts.status.active },
        { value: 'inactive', label: 'Inactivă', count: counts.status.inactive },
    ];

    const dims = useMemo(() => [
        { key: 'source' as const, label: 'Tip', options: sourceOptions, value: filters.source, filterKey: 'source' as const },
        { key: 'gender' as const, label: 'Sex', options: genderOptions, value: filters.gender, filterKey: 'gender' as const },
        { key: 'level' as const, label: 'Nivel', options: levelOptions, value: filters.level, filterKey: 'level' as const },
        { key: 'status' as const, label: 'Status', options: statusOptions, value: filters.status, filterKey: 'status' as const },
        // eslint-disable-next-line react-hooks/exhaustive-deps
    ], [filters, counts, availableLevels]);

    // Inline when the dimension partitions the data OR is currently non-default
    // (so an active filter never hides itself).
    const visibleDims = dims.filter((d) => isMeaningful(d.options) || d.value !== 'all');
    const hiddenDims = dims.filter((d) => !isMeaningful(d.options) && d.value === 'all');
    const hasCoachFilter = coaches.length > 0;

    return (
        <View className="rounded-[14px] border p-2.5 mb-5 w-full gap-2.5" style={{ backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-border)' }}>
            {/* Row 1 — search, sort, view toggle: always one line. */}
            <View className="flex-row items-center gap-2 flex-wrap">
                <View className="relative flex-1 min-w-[180px]">
                    <View className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none">
                        <Search size={14} color="var(--c-faint)" />
                    </View>
                    <TextInput
                        value={searchDraft}
                        onChangeText={setSearchDraft}
                        placeholder="Caută echipă, categorie sau antrenor"
                        placeholderTextColor="var(--c-faint)"
                        className="w-full h-9 rounded-[9px] border pl-8 pr-8 text-[13px] font-medium"
                        style={{ backgroundColor: 'var(--c-surface-2)', borderColor: 'var(--c-border)', color: 'var(--c-ink)' } as any}
                    />
                    {searchDraft.length > 0 && (
                        <Pressable
                            onPress={() => setSearchDraft('')}
                            accessibilityLabel="Golește căutarea"
                            className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 items-center justify-center rounded-full"
                        >
                            <X size={13} color="var(--c-faint)" />
                        </Pressable>
                    )}
                </View>

                <View className="flex-row items-center gap-1">
                    <ArrowUpDown size={13} color="var(--c-muted)" />
                    <select
                        value={sort.key}
                        onChange={(e) => setSort({ key: e.target.value as SortKey, dir: sort.dir })}
                        className="h-9 rounded-[9px] border px-2 text-[12px] font-semibold"
                        style={{ backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-border)', color: 'var(--c-ink-soft)' }}
                    >
                        {SORT_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                    </select>
                    <Pressable
                        onPress={() => setSort({ key: sort.key, dir: sort.dir === 'asc' ? 'desc' : 'asc' })}
                        accessibilityLabel="Schimbă ordinea de sortare"
                        className="h-9 w-9 rounded-[9px] border items-center justify-center"
                        style={{ backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-border)' }}
                    >
                        <Text className="text-[13px] font-bold" style={{ color: 'var(--c-ink-soft)' }}>{sort.dir === 'asc' ? '↑' : '↓'}</Text>
                    </Pressable>
                </View>

                {(hiddenDims.length > 0 || hasCoachFilter) && (
                    <Pressable
                        onPress={() => setExpanded((v) => !v)}
                        accessibilityLabel="Mai multe filtre"
                        className="h-9 px-2.5 rounded-[9px] border flex-row items-center gap-1.5"
                        style={expanded
                            ? { backgroundColor: 'var(--c-surface-tint)', borderColor: 'var(--c-brand-border)' }
                            : { backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-border)' }}
                    >
                        <SlidersHorizontal size={14} color={expanded ? 'var(--c-brand-fg)' : 'var(--c-muted)'} />
                        <Text className="text-[12px] font-semibold" style={{ color: expanded ? 'var(--c-brand-fg)' : 'var(--c-ink-soft)' }}>Filtre</Text>
                    </Pressable>
                )}

                <View className="flex-row rounded-[9px] border overflow-hidden" style={{ borderColor: 'var(--c-border)' }}>
                    <Pressable
                        onPress={() => onViewChange('grid')}
                        accessibilityLabel="Vizualizare grid"
                        className="w-9 h-9 items-center justify-center"
                        style={{ backgroundColor: view === 'grid' ? 'var(--c-brand-surface)' : 'var(--c-surface)' }}
                    >
                        <LayoutGrid size={14} color={view === 'grid' ? 'var(--c-on-brand)' : 'var(--c-muted)'} />
                    </Pressable>
                    <Pressable
                        onPress={() => onViewChange('table')}
                        accessibilityLabel="Vizualizare tabel"
                        className="w-9 h-9 items-center justify-center border-l"
                        style={{ backgroundColor: view === 'table' ? 'var(--c-brand-surface)' : 'var(--c-surface)', borderColor: 'var(--c-border)' }}
                    >
                        <Table2 size={14} color={view === 'table' ? 'var(--c-on-brand)' : 'var(--c-muted)'} />
                    </Pressable>
                </View>
            </View>

            {/* Row 2 — the filters that actually vary. */}
            {(visibleDims.length > 0 || activeFilterCount > 0) && (
                <View className="flex-row flex-wrap items-center gap-x-4 gap-y-2">
                    {visibleDims.map((d) => (
                        <ChipGroup
                            key={d.key}
                            label={d.label}
                            value={d.value as any}
                            onChange={(v) => setFilter(d.filterKey, v as any)}
                            options={d.options as any}
                        />
                    ))}
                    {activeFilterCount > 0 && (
                        <Pressable
                            onPress={onReset}
                            className="flex-row items-center gap-1.5 h-7 px-2.5 rounded-[8px] border"
                            style={{ backgroundColor: 'var(--c-danger-bg)', borderColor: 'var(--c-danger-border)' }}
                        >
                            <X size={12} color="var(--c-danger-fg)" />
                            <Text className="text-[12px] font-semibold" style={{ color: 'var(--c-danger-fg)' }}>
                                Șterge ({activeFilterCount})
                            </Text>
                        </Pressable>
                    )}
                </View>
            )}

            {/* Expanded tray — non-partitioning dimensions plus the coach select. */}
            {expanded && (hiddenDims.length > 0 || hasCoachFilter) && (
                <View className="flex-row flex-wrap items-center gap-x-4 gap-y-2 pt-2 border-t" style={{ borderColor: 'var(--c-border-soft)' }}>
                    {hiddenDims.map((d) => (
                        <ChipGroup
                            key={d.key}
                            label={d.label}
                            value={d.value as any}
                            onChange={(v) => setFilter(d.filterKey, v as any)}
                            options={d.options as any}
                        />
                    ))}
                    {hasCoachFilter && (
                        <View className="flex-row items-center gap-1.5">
                            <Text className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--c-faint)' }}>Antrenor</Text>
                            <select
                                value={filters.coachId === 'all' ? 'all' : String(filters.coachId)}
                                onChange={(e) => setFilter('coachId', e.target.value === 'all' ? 'all' : Number(e.target.value))}
                                className="h-8 rounded-[8px] border px-2.5 text-[12px] font-semibold"
                                style={{ backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-border)', color: 'var(--c-ink-soft)' }}
                            >
                                <option value="all">Toți antrenorii</option>
                                {coaches.map((c) => (
                                    <option key={c.id} value={c.id}>{c.name}</option>
                                ))}
                            </select>
                        </View>
                    )}
                </View>
            )}
        </View>
    );
}
