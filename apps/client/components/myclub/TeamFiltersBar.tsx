import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, TextInput } from '@/src/web/reactNative';
import { Search, LayoutGrid, Table2, X, SlidersHorizontal } from 'lucide-react';
import SelectField from '../ui/SelectField';
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

/** One tray filter: a small sentence-case label over a native select (the chip rows read as noise). */
function LabeledSelect<T extends string>({
    label,
    options,
    value,
    onChange,
}: {
    label: string;
    options: { key: T; label: string; count?: number }[];
    value: T;
    onChange: (value: T) => void;
}) {
    return (
        <View className="gap-1.5 min-w-0">
            <Text className="t-label" style={{ color: 'var(--c-muted)' }}>{label}</Text>
            <SelectField label={label} options={options} value={value} onChange={onChange} />
        </View>
    );
}

/** Sort key and direction as one choice, worded by what comes first. */
const SORT_OPTIONS: { key: `${SortKey}:${'asc' | 'desc'}`; label: string }[] = [
    { key: 'name:asc', label: 'Nume (A–Z)' },
    { key: 'name:desc', label: 'Nume (Z–A)' },
    { key: 'updated:desc', label: 'Actualizate recent' },
    { key: 'players:desc', label: 'Cei mai mulți jucători' },
    { key: 'players:asc', label: 'Cei mai puțini jucători' },
    { key: 'medical:desc', label: 'Cele mai multe vize expirate' },
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
        { value: 'M', label: 'Masculin', dot: 'var(--c-gender-m)', count: counts.gender.M },
        { value: 'F', label: 'Feminin', dot: 'var(--c-gender-f)', count: counts.gender.F },
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

    // Everything now lives in the tray (Tip/Sex/Nivel/Status included). A
    // dimension is only offered when it can actually partition the set, or is
    // currently active — the "synthesise" the user asked for, so the tray never
    // shows dead controls like "Status: Toate 11 · Activă 11 · Inactivă 0".
    const trayDims = dims.filter((d) => isMeaningful(d.options) || d.value !== 'all');
    const hasCoachFilter = coaches.length > 0;

    // Compact summary of what's applied, shown while collapsed so the user can
    // see and clear active filters without opening the tray. Search is excluded
    // (it has its own inline clear button).
    const activeChips: { key: string; label: string; clear: () => void }[] = [];
    if (filters.source !== 'all') activeChips.push({ key: 'source', label: sourceOptions.find((o) => o.value === filters.source)?.label ?? '', clear: () => setFilter('source', 'all') });
    if (filters.gender !== 'all') activeChips.push({ key: 'gender', label: genderOptions.find((o) => o.value === filters.gender)?.label ?? '', clear: () => setFilter('gender', 'all') });
    if (filters.level !== 'all') activeChips.push({ key: 'level', label: levelOptions.find((o) => o.value === filters.level)?.label ?? '', clear: () => setFilter('level', 'all') });
    if (filters.status !== 'all') activeChips.push({ key: 'status', label: statusOptions.find((o) => o.value === filters.status)?.label ?? '', clear: () => setFilter('status', 'all') });
    if (filters.alert === 'medical') activeChips.push({ key: 'alert', label: 'Vize expirate', clear: () => setFilter('alert', 'all') });
    if (filters.coachId !== 'all') activeChips.push({ key: 'coach', label: coaches.find((c) => c.id === filters.coachId)?.name ?? 'Antrenor', clear: () => setFilter('coachId', 'all') });

    return (
        <View className="rounded-[14px] border p-2.5 mb-5 w-full gap-2.5" style={{ backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-border)' }}>
            {/* Row 1 — search, filters button, view toggle: one line (nowrap so
                the toggle never orphans onto its own row on mobile). */}
            <View className="flex-row items-center gap-2">
                <View className="relative flex-1 min-w-[140px]">
                    <View className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none">
                        <Search size={14} color="var(--c-faint)" />
                    </View>
                    <TextInput
                        value={searchDraft}
                        onChangeText={setSearchDraft}
                        placeholder="Caută echipă, categorie sau antrenor"
                        accessibilityLabel="Caută echipă, categorie sau antrenor"
                        placeholderTextColor="var(--c-faint)"
                        className="w-full h-9 [@media(pointer:coarse)]:h-10 rounded-[9px] border pl-8 pr-8 text-[13px] font-medium"
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

                {/* Sort + the non-partitioning dimensions live behind this one
                    button now — the inline sort dropdown used to eat a whole row
                    on mobile and shove the view toggle onto its own line. */}
                <Pressable
                    onPress={() => setExpanded((v) => !v)}
                    accessibilityLabel="Sortare și filtre"
                    className="h-9 [@media(pointer:coarse)]:h-10 px-2.5 rounded-[9px] border flex-row items-center gap-1.5"
                    style={expanded
                        ? { backgroundColor: 'var(--c-surface-3)', borderColor: 'var(--c-border-strong)' }
                        : { backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-border)' }}
                    aria-expanded={expanded}
                >
                    <SlidersHorizontal size={14} color={expanded ? 'var(--c-ink)' : 'var(--c-muted)'} />
                    <Text className="text-[12px] font-semibold" style={{ color: expanded ? 'var(--c-ink-strong)' : 'var(--c-ink-soft)' }}>Filtre</Text>
                    {activeFilterCount > 0 ? (
                        <View className="min-w-[18px] h-[18px] px-1 rounded-full items-center justify-center" style={{ backgroundColor: 'var(--c-brand-surface)' }}>
                            <Text className="t-num text-[10.5px] font-bold" style={{ color: 'var(--c-on-brand)' }}>{activeFilterCount}</Text>
                        </View>
                    ) : null}
                </Pressable>

                <View className="flex-row rounded-[9px] border overflow-hidden" style={{ borderColor: 'var(--c-border)' }}>
                    <Pressable
                        onPress={() => onViewChange('grid')}
                        accessibilityLabel="Vizualizare carduri"
                        aria-pressed={view === 'grid'}
                        className="w-9 h-9 [@media(pointer:coarse)]:w-10 [@media(pointer:coarse)]:h-10 items-center justify-center"
                        style={{ backgroundColor: view === 'grid' ? 'var(--c-surface-3)' : 'var(--c-surface)' }}
                    >
                        <LayoutGrid size={14} color={view === 'grid' ? 'var(--c-ink-strong)' : 'var(--c-muted)'} />
                    </Pressable>
                    <Pressable
                        onPress={() => onViewChange('table')}
                        accessibilityLabel="Vizualizare tabel"
                        aria-pressed={view === 'table'}
                        className="w-9 h-9 [@media(pointer:coarse)]:w-10 [@media(pointer:coarse)]:h-10 items-center justify-center border-l"
                        style={{ backgroundColor: view === 'table' ? 'var(--c-surface-3)' : 'var(--c-surface)', borderColor: 'var(--c-border)' }}
                    >
                        <Table2 size={14} color={view === 'table' ? 'var(--c-ink-strong)' : 'var(--c-muted)'} />
                    </Pressable>
                </View>
            </View>

            {/* Row 2 — compact summary of applied filters (removable). Absent
                entirely when nothing is filtered, so the default view is just
                search + Filtre + view toggle. */}
            {activeChips.length > 0 && (
                <View className="flex-row flex-wrap items-center gap-1.5">
                    {activeChips.map((c) => (
                        <Pressable
                            key={c.key}
                            onPress={c.clear}
                            accessibilityLabel={`Elimină filtrul ${c.label}`}
                            className="flex-row items-center gap-1 h-7 pl-2.5 pr-1.5 rounded-[8px] border"
                            style={{ backgroundColor: 'var(--c-surface-2)', borderColor: 'var(--c-border)' }}
                        >
                            <Text className="text-[12px] font-semibold" style={{ color: 'var(--c-ink-soft)' }}>{c.label}</Text>
                            <X size={12} color="var(--c-muted)" />
                        </Pressable>
                    ))}
                    <Pressable onPress={onReset} className="h-7 px-2 justify-center">
                        <Text className="text-[12px] font-semibold" style={{ color: 'var(--c-danger-fg)' }}>Șterge tot</Text>
                    </Pressable>
                </View>
            )}

            {/* Expanded tray — every filter dimension (Tip/Sex/Nivel/Status),
                sort controls, the medical-alert quick filter, and the coach
                select. Nothing lives permanently in the page anymore. */}
            {/* Expanded tray: one grid of labelled selects (sort first, then each
                dimension that actually splits the set, the visa alert and the coach)
                instead of five rows of chips with tracked-caps labels. */}
            {expanded && (
                <View
                    className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-x-3 gap-y-3 pt-3 border-t"
                    style={{ borderColor: 'var(--c-border-soft)' }}
                >
                    <LabeledSelect
                        label="Sortează"
                        options={SORT_OPTIONS}
                        value={(SORT_OPTIONS.some((o) => o.key === `${sort.key}:${sort.dir}`) ? `${sort.key}:${sort.dir}` : 'name:asc') as (typeof SORT_OPTIONS)[number]['key']}
                        onChange={(next) => {
                            const [key, dir] = next.split(':') as [SortKey, 'asc' | 'desc'];
                            setSort({ key, dir });
                        }}
                    />
                    {trayDims.map((d) => (
                        <LabeledSelect
                            key={d.key}
                            label={d.label}
                            value={d.value as string}
                            onChange={(v) => setFilter(d.filterKey, v as any)}
                            options={(d.options as ChipOption<string>[]).map((o) => ({ key: o.value, label: o.label, count: o.count }))}
                        />
                    ))}
                    {counts.alert.medical > 0 || filters.alert === 'medical' ? (
                        <LabeledSelect
                            label="Vize medicale"
                            value={filters.alert}
                            onChange={(v) => setFilter('alert', v)}
                            options={[
                                { key: 'all' as const, label: 'Toate echipele' },
                                { key: 'medical' as const, label: 'Cu vize expirate', count: counts.alert.medical },
                            ]}
                        />
                    ) : null}
                    {hasCoachFilter ? (
                        // Phones: the coach select takes the whole row when it would sit alone in it.
                        <View className={(1 + trayDims.length + (counts.alert.medical > 0 || filters.alert === 'medical' ? 1 : 0)) % 2 === 0 ? 'col-span-2 md:col-span-1' : ''}>
                        <LabeledSelect
                            label="Antrenor"
                            value={filters.coachId === 'all' ? 'all' : String(filters.coachId)}
                            onChange={(v) => setFilter('coachId', v === 'all' ? 'all' : Number(v))}
                            options={[{ key: 'all', label: 'Toți antrenorii' }, ...coaches.map((c) => ({ key: String(c.id), label: c.name }))]}
                        />
                        </View>
                    ) : null}
                </View>
            )}
        </View>
    );
}
