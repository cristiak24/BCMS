import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, TextInput } from '@/src/web/reactNative';
import { Search, LayoutGrid, Table2, ArrowUpDown, X } from 'lucide-react';
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

type ChipOption<T extends string> = { value: T; label: string; dot?: string; count?: number };

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
        <View className="flex-row items-center flex-wrap gap-1.5">
            <Text className="text-[11px] font-black text-[#64748B] uppercase tracking-widest mr-0.5">{label}</Text>
            {options.map((opt) => {
                const active = opt.value === value;
                return (
                    <Pressable
                        key={opt.value}
                        onPress={() => onChange(opt.value)}
                        className={`flex-row items-center gap-1.5 px-3 py-1.5 rounded-full border transition-colors ${
                            active ? 'bg-[#0E2041] border-[#0E2041]' : 'bg-white border-[#DDE7F5] hover:bg-[#F4F8FD]'
                        }`}
                    >
                        {opt.dot ? <View className="w-[6px] h-[6px] rounded-full" style={{ backgroundColor: opt.dot }} /> : null}
                        <Text className={`text-[11.5px] font-bold ${active ? 'text-white' : 'text-[#475569]'}`}>{opt.label}</Text>
                        {typeof opt.count === 'number' && (
                            <Text className={`text-[10.5px] font-black ${active ? 'text-white/70' : 'text-[#94A3B8]'}`}>{opt.count}</Text>
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

    // Keep the local input in sync when filters are reset from the outside.
    useEffect(() => {
        setSearchDraft(filters.search);
    }, [filters.search]);

    useEffect(() => {
        const timer = setTimeout(() => setFilter('search', searchDraft), 150);
        return () => clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchDraft]);

    return (
        <View className="bg-white rounded-[22px] border border-[#DDE7F5] p-4 mb-6 flex-col gap-3.5 w-full">
            <View className="flex-row flex-wrap items-center gap-3">
                <View className="relative w-full sm:w-[280px]">
                    <View className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
                        <Search size={15} color="var(--c-faint)" />
                    </View>
                    <TextInput
                        value={searchDraft}
                        onChangeText={setSearchDraft}
                        placeholder="Caută echipă, categorie sau antrenor"
                        placeholderTextColor="var(--c-faint)"
                        className="w-full h-[38px] rounded-[12px] border border-[#DDE7F5] bg-[#FBFDFF] pl-9 pr-8 text-[13px] font-semibold text-[#0E2041]"
                    />
                    {searchDraft.length > 0 && (
                        <Pressable
                            onPress={() => setSearchDraft('')}
                            accessibilityLabel="Golește căutarea"
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 w-5 h-5 items-center justify-center rounded-full hover:bg-[#F1F5F9]"
                        >
                            <X size={13} color="var(--c-faint)" />
                        </Pressable>
                    )}
                </View>

                {/* Sort control */}
                <View className="flex-row items-center gap-1.5">
                    <ArrowUpDown size={14} color="var(--c-muted)" />
                    <select
                        value={sort.key}
                        onChange={(e) => setSort({ key: e.target.value as SortKey, dir: sort.dir })}
                        className="h-[34px] rounded-[10px] border border-[#DDE7F5] bg-white px-2.5 text-[12px] font-bold text-[#475569]"
                    >
                        {SORT_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                    </select>
                    <Pressable
                        onPress={() => setSort({ key: sort.key, dir: sort.dir === 'asc' ? 'desc' : 'asc' })}
                        accessibilityLabel="Schimbă ordinea de sortare"
                        className="h-[34px] px-2.5 rounded-[10px] border border-[#DDE7F5] bg-white items-center justify-center hover:bg-[#F4F8FD]"
                    >
                        <Text className="text-[12px] font-black text-[#475569]">{sort.dir === 'asc' ? '↑' : '↓'}</Text>
                    </Pressable>
                </View>

                <View className="ml-auto flex-row items-center gap-2.5">
                    {activeFilterCount > 0 && (
                        <Pressable
                            onPress={onReset}
                            className="flex-row items-center gap-1.5 h-[34px] px-3 rounded-[10px] border border-[#F3C6C6] bg-[#FEF3F2] hover:bg-[#FDE7E6]"
                        >
                            <X size={13} color="var(--c-danger-fg)" />
                            <Text className="text-[#B42318] text-[12px] font-bold">
                                Șterge filtrele ({activeFilterCount})
                            </Text>
                        </Pressable>
                    )}

                    <View className="flex-row rounded-[12px] border border-[#DDE7F5] overflow-hidden">
                        <Pressable
                            onPress={() => onViewChange('grid')}
                            className={`flex-row items-center gap-1.5 px-3 py-2 ${view === 'grid' ? 'bg-[#1D3E90]' : 'bg-white'}`}
                        >
                            <LayoutGrid size={13} color={view === 'grid' ? '#ffffff' : 'var(--c-muted)'} />
                            <Text className={`text-[11.5px] font-bold ${view === 'grid' ? 'text-white' : 'text-[#64748B]'}`}>Grid</Text>
                        </Pressable>
                        <Pressable
                            onPress={() => onViewChange('table')}
                            className={`flex-row items-center gap-1.5 px-3 py-2 border-l border-[#DDE7F5] ${view === 'table' ? 'bg-[#1D3E90]' : 'bg-white'}`}
                        >
                            <Table2 size={13} color={view === 'table' ? '#ffffff' : 'var(--c-muted)'} />
                            <Text className={`text-[11.5px] font-bold ${view === 'table' ? 'text-white' : 'text-[#64748B]'}`}>Tabel</Text>
                        </Pressable>
                    </View>
                </View>
            </View>

            <View className="flex-row flex-wrap items-center gap-x-5 gap-y-2.5">
                <ChipGroup<SourceFilter>
                    label="Tip"
                    value={filters.source}
                    onChange={(v) => setFilter('source', v)}
                    options={[
                        { value: 'all', label: 'Toate', count: counts.source.all },
                        { value: 'frb', label: 'FRB', dot: 'var(--c-danger)', count: counts.source.frb },
                        { value: 'manual', label: 'Manual', dot: 'var(--c-success)', count: counts.source.manual },
                    ]}
                />
                <ChipGroup<GenderFilter>
                    label="Sex"
                    value={filters.gender}
                    onChange={(v) => setFilter('gender', v)}
                    options={[
                        { value: 'all', label: 'Toate', count: counts.gender.all },
                        { value: 'M', label: 'Masculin', dot: '#28345E', count: counts.gender.M },
                        { value: 'F', label: 'Feminin', dot: '#7C3560', count: counts.gender.F },
                    ]}
                />
                {availableLevels.length > 0 && (
                    <ChipGroup<LevelFilter>
                        label="Nivel"
                        value={filters.level}
                        onChange={(v) => setFilter('level', v)}
                        options={[
                            { value: 'all', label: 'Toate', count: counts.level.all },
                            ...availableLevels.map((lvl) => ({
                                value: lvl as LevelFilter,
                                label: LEVEL_LABELS[lvl],
                                count: counts.level[lvl] ?? 0,
                            })),
                        ]}
                    />
                )}
                <ChipGroup<StatusFilter>
                    label="Status"
                    value={filters.status}
                    onChange={(v) => setFilter('status', v)}
                    options={[
                        { value: 'all', label: 'Toate', count: counts.status.all },
                        { value: 'active', label: 'Activă', count: counts.status.active },
                        { value: 'inactive', label: 'Inactivă', count: counts.status.inactive },
                    ]}
                />

                {coaches.length > 0 && (
                    <View className="flex-row items-center gap-1.5">
                        <Text className="text-[11px] font-black text-[#64748B] uppercase tracking-widest">Antrenor</Text>
                        <select
                            value={filters.coachId === 'all' ? 'all' : String(filters.coachId)}
                            onChange={(e) => setFilter('coachId', e.target.value === 'all' ? 'all' : Number(e.target.value))}
                            className="h-[30px] rounded-full border border-[#DDE7F5] bg-white px-3 text-[11.5px] font-bold text-[#475569]"
                        >
                            <option value="all">Toți antrenorii</option>
                            {coaches.map((c) => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                        </select>
                    </View>
                )}
            </View>
        </View>
    );
}
