import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, TextInput } from '@/src/web/reactNative';
import { Search, LayoutGrid, Table2 } from 'lucide-react';
import type { Coach } from '../../services/teamsApi';
import type { GenderFilter, LevelFilter, SourceFilter, StatusFilter, TeamFiltersState } from '../../hooks/useTeamFilters';

type ChipOption<T extends string> = { value: T; label: string; dot?: string };

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
            <Text className="text-[10px] font-black text-[#94A3B8] uppercase tracking-widest mr-0.5">{label}</Text>
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
                    </Pressable>
                );
            })}
        </View>
    );
}

export default function TeamFiltersBar({
    filters,
    setFilter,
    coaches,
    view,
    onViewChange,
}: {
    filters: TeamFiltersState;
    setFilter: <K extends keyof TeamFiltersState>(key: K, value: TeamFiltersState[K]) => void;
    coaches: Coach[];
    view: 'grid' | 'table';
    onViewChange: (view: 'grid' | 'table') => void;
}) {
    const [searchDraft, setSearchDraft] = useState(filters.search);

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
                        <Search size={15} color="#94A3B8" />
                    </View>
                    <TextInput
                        value={searchDraft}
                        onChangeText={setSearchDraft}
                        placeholder="Caută echipă, categorie sau antrenor"
                        placeholderTextColor="#94A3B8"
                        className="w-full h-[38px] rounded-[12px] border border-[#DDE7F5] bg-[#FBFDFF] pl-9 pr-3 text-[13px] font-semibold text-[#0E2041]"
                    />
                </View>

                <View className="ml-auto flex-row rounded-[12px] border border-[#DDE7F5] overflow-hidden">
                    <Pressable
                        onPress={() => onViewChange('grid')}
                        className={`flex-row items-center gap-1.5 px-3 py-2 ${view === 'grid' ? 'bg-[#1D3E90]' : 'bg-white'}`}
                    >
                        <LayoutGrid size={13} color={view === 'grid' ? '#ffffff' : '#64748B'} />
                        <Text className={`text-[11.5px] font-bold ${view === 'grid' ? 'text-white' : 'text-[#64748B]'}`}>Grid</Text>
                    </Pressable>
                    <Pressable
                        onPress={() => onViewChange('table')}
                        className={`flex-row items-center gap-1.5 px-3 py-2 border-l border-[#DDE7F5] ${view === 'table' ? 'bg-[#1D3E90]' : 'bg-white'}`}
                    >
                        <Table2 size={13} color={view === 'table' ? '#ffffff' : '#64748B'} />
                        <Text className={`text-[11.5px] font-bold ${view === 'table' ? 'text-white' : 'text-[#64748B]'}`}>Tabel</Text>
                    </Pressable>
                </View>
            </View>

            <View className="flex-row flex-wrap items-center gap-x-5 gap-y-2.5">
                <ChipGroup<SourceFilter>
                    label="Tip"
                    value={filters.source}
                    onChange={(v) => setFilter('source', v)}
                    options={[
                        { value: 'all', label: 'Toate' },
                        { value: 'frb', label: 'FRB', dot: '#C62828' },
                        { value: 'manual', label: 'Manual', dot: '#0E9F6E' },
                    ]}
                />
                <ChipGroup<GenderFilter>
                    label="Sex"
                    value={filters.gender}
                    onChange={(v) => setFilter('gender', v)}
                    options={[
                        { value: 'all', label: 'Toate' },
                        { value: 'M', label: 'Masculin', dot: '#28345E' },
                        { value: 'F', label: 'Feminin', dot: '#7C3560' },
                    ]}
                />
                <ChipGroup<LevelFilter>
                    label="Nivel"
                    value={filters.level}
                    onChange={(v) => setFilter('level', v)}
                    options={[
                        { value: 'all', label: 'Toate' },
                        { value: 'national', label: 'Național' },
                        { value: 'municipal', label: 'Municipal' },
                        { value: 'initiere', label: 'Inițiere' },
                    ]}
                />
                <ChipGroup<StatusFilter>
                    label="Status"
                    value={filters.status}
                    onChange={(v) => setFilter('status', v)}
                    options={[
                        { value: 'all', label: 'Toate' },
                        { value: 'active', label: 'Activă' },
                        { value: 'inactive', label: 'Inactivă' },
                    ]}
                />

                {coaches.length > 0 && (
                    <View className="flex-row items-center gap-1.5">
                        <Text className="text-[10px] font-black text-[#94A3B8] uppercase tracking-widest">Antrenor</Text>
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
