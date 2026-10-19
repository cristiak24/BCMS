import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, TextInput } from '@/src/web/reactNative';
import { Search, X, Check } from 'lucide-react';
import { MaterialIcons } from '@/src/web/expoVectorIcons';
import { teamsApi, Player } from '../../../services/teamsApi';
import Pagination from '../../ui/Pagination';

const PAGE_SIZE = 12;
const SEARCH_DEBOUNCE_MS = 300;
const offsetOf = (page: number) => (page - 1) * PAGE_SIZE;

type Scope = 'unassigned' | 'all';

interface Props {
    teamId: number;
    /** Changes whenever the team's roster changes (add, remove, bulk import) so the list refetches. */
    rosterVersion: number;
    onAdd: (player: Player) => Promise<void>;
    onOpenBulk: () => void;
}

/**
 * The team page's "Adaugă jucător" area: a paged list of club players who are
 * not yet on this team, newest first, filterable by name. Adding a player keeps
 * the panel (and the current filter/page) in place so several can be added in
 * a row — the list just refetches without the one that was added.
 */
export default function TeamAddPlayersPanel({ teamId, rosterVersion, onAdd, onOpenBulk }: Props) {
    const [scope, setScope] = useState<Scope>('unassigned');
    const [query, setQuery] = useState('');
    const [debouncedQuery, setDebouncedQuery] = useState('');
    const [page, setPage] = useState(1);
    const [items, setItems] = useState<Player[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [addingId, setAddingId] = useState<number | null>(null);
    const [lastAdded, setLastAdded] = useState<string | null>(null);

    useEffect(() => {
        const timer = setTimeout(() => setDebouncedQuery(query.trim()), SEARCH_DEBOUNCE_MS);
        return () => clearTimeout(timer);
    }, [query]);

    // A new result set always starts on page 1.
    useEffect(() => {
        setPage(1);
    }, [scope, debouncedQuery]);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        teamsApi
            .browsePlayers({
                limit: PAGE_SIZE,
                offset: offsetOf(page),
                query: debouncedQuery,
                unassigned: scope === 'unassigned',
                excludeTeamId: teamId,
            })
            .then((result) => {
                if (cancelled) return;
                // An older API (deployed separately) has no total: count what we know.
                const resultTotal = result.total ?? offsetOf(page) + result.items.length + (result.hasMore ? 1 : 0);
                // Adding the only player on the last page empties it — step back
                // instead of showing a blank page.
                if (result.items.length === 0 && page > 1 && resultTotal > 0) {
                    setPage(Math.ceil(resultTotal / PAGE_SIZE));
                    return;
                }
                setItems(result.items);
                setTotal(resultTotal);
                setError(null);
            })
            .catch(() => {
                if (!cancelled) setError('Nu am putut încărca jucătorii.');
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [teamId, scope, debouncedQuery, page, rosterVersion]);

    const handleAdd = async (player: Player) => {
        try {
            setAddingId(player.id);
            await onAdd(player);
            setLastAdded(`${player.firstName} ${player.lastName}`.trim());
        } catch {
            setError('Nu am putut adăuga jucătorul în echipă.');
        } finally {
            setAddingId(null);
        }
    };

    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const rangeStart = total ? (page - 1) * PAGE_SIZE + 1 : 0;
    const rangeEnd = Math.min(page * PAGE_SIZE, total);

    return (
        <View className="rounded-[16px] bg-[var(--c-surface-2)] border border-[var(--c-border)] p-3 md:p-4 mb-4">
            <View className="flex-row flex-wrap items-center gap-2 mb-3">
                <View className="flex-row p-1 rounded-[12px] border gap-1" style={{ backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-border)' } as any}>
                    <ScopeButton active={scope === 'unassigned'} label="Neasignați" onPress={() => setScope('unassigned')} />
                    <ScopeButton active={scope === 'all'} label="Toți jucătorii" onPress={() => setScope('all')} />
                </View>
                <Pressable
                    onPress={onOpenBulk}
                    accessibilityRole="button"
                    className="ui-press flex-row items-center gap-2 h-10 px-3 rounded-[12px] border"
                    style={{ borderColor: 'var(--c-border)', backgroundColor: 'var(--c-surface)' } as any}
                >
                    <MaterialIcons name="group-add" size={16} color="var(--c-brand-fg)" />
                    <Text className="text-[13px] font-semibold" style={{ color: 'var(--c-brand-fg)' }}>Lipește o listă de jucători noi</Text>
                </Pressable>
            </View>

            <View className="relative mb-3">
                <View className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"><Search size={15} color="var(--c-faint)" /></View>
                <TextInput
                    value={query}
                    onChangeText={setQuery}
                    placeholder="Filtrează după nume"
                    placeholderTextColor="var(--c-faint)"
                    className="w-full h-10 rounded-[12px] border border-[var(--c-border)] bg-[var(--c-surface)] pl-9 pr-9 text-[13px] font-semibold text-[color:var(--c-ink-strong)]"
                />
                {loading ? (
                    <View className="absolute right-3 top-2.5"><ActivityIndicator size="small" color="var(--c-brand-fg)" /></View>
                ) : query ? (
                    <Pressable onPress={() => setQuery('')} accessibilityLabel="Șterge filtrul" className="absolute right-2 top-1.5 w-7 h-7 items-center justify-center rounded-full">
                        <X size={14} color="var(--c-faint)" />
                    </Pressable>
                ) : null}
            </View>

            {lastAdded ? (
                <View className="flex-row items-center gap-2 px-3 py-2 mb-3 rounded-[10px]" style={{ backgroundColor: 'var(--c-success-bg)' } as any} accessibilityRole={'status' as any}>
                    <Check size={14} color="var(--c-success-fg)" />
                    <Text className="flex-1 text-[12.5px] font-semibold" style={{ color: 'var(--c-success-fg)' }} numberOfLines={1}>{lastAdded} a fost adăugat în lot.</Text>
                </View>
            ) : null}

            {error ? (
                <Text className="text-[12.5px] font-semibold mb-3" style={{ color: 'var(--c-danger-fg)' }}>{error}</Text>
            ) : null}

            {items.length === 0 && !loading ? (
                <View className="items-center py-6 gap-2">
                    <Text className="text-center text-[12.5px] font-semibold" style={{ color: 'var(--c-faint)' }}>
                        {debouncedQuery
                            ? 'Niciun jucător nu corespunde filtrului.'
                            : scope === 'unassigned'
                                ? 'Toți jucătorii clubului sunt deja într-o echipă.'
                                : 'Nu mai sunt jucători de adăugat.'}
                    </Text>
                    {scope === 'unassigned' ? (
                        <Pressable onPress={() => setScope('all')} className="ui-press h-8 px-3 rounded-[10px] border items-center justify-center" style={{ borderColor: 'var(--c-border)', backgroundColor: 'var(--c-surface)' } as any}>
                            <Text className="text-[12.5px] font-semibold" style={{ color: 'var(--c-brand-fg)' }}>Vezi toți jucătorii</Text>
                        </Pressable>
                    ) : null}
                </View>
            ) : (
                <View className={`grid grid-cols-1 md:grid-cols-2 gap-1.5 ${loading ? 'opacity-60' : ''}`}>
                    {items.map((p) => {
                        const meta = [
                            p.birthYear ? String(p.birthYear) : null,
                            p.teamNames?.length ? p.teamNames.join(', ') : scope === 'all' ? 'Fără echipă' : null,
                        ].filter(Boolean).join(' • ');
                        return (
                            <View key={p.id} className="flex-row items-center justify-between gap-2 px-3 py-2 rounded-[12px] bg-[var(--c-surface)] border border-[var(--c-border)]">
                                <View className="flex-row items-center gap-2.5 min-w-0 flex-1">
                                    <View className="w-8 h-8 rounded-full bg-[var(--c-surface-tint)] items-center justify-center flex-none">
                                        <Text className="text-[11px] font-black text-[color:var(--c-brand-fg)]">{p.firstName?.charAt(0)}{p.lastName?.charAt(0)}</Text>
                                    </View>
                                    <View className="min-w-0 flex-1">
                                        <Text className="text-[13px] font-bold text-[color:var(--c-ink-strong)] truncate" numberOfLines={1}>{p.firstName} {p.lastName}</Text>
                                        {meta ? <Text className="text-[11.5px] font-medium truncate" style={{ color: 'var(--c-muted)' }} numberOfLines={1}>{meta}</Text> : null}
                                    </View>
                                </View>
                                <Pressable
                                    onPress={() => handleAdd(p)}
                                    disabled={addingId !== null}
                                    accessibilityLabel={`Adaugă ${p.firstName} ${p.lastName}`}
                                    className="h-8 px-3 rounded-[10px] bg-[var(--c-brand-surface)] items-center justify-center flex-row gap-1 flex-none"
                                >
                                    {addingId === p.id ? <ActivityIndicator size="small" color="var(--c-on-brand)" /> : <Text className="text-[color:var(--c-on-brand)] text-[12.5px] font-semibold">Adaugă</Text>}
                                </Pressable>
                            </View>
                        );
                    })}
                </View>
            )}

            <Pagination
                page={page}
                totalPages={totalPages}
                onPageChange={(updater) => setPage((current) => updater(current))}
                rangeStart={rangeStart}
                rangeEnd={rangeEnd}
                total={total}
                itemNoun="jucători"
            />
        </View>
    );
}

function ScopeButton({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) {
    return (
        <Pressable
            onPress={onPress}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            className="h-8 px-3 rounded-[9px] items-center justify-center"
            style={{ backgroundColor: active ? 'var(--c-brand-surface)' : 'transparent' } as any}
        >
            <Text className="text-[12.5px] font-semibold" style={{ color: active ? 'var(--c-on-brand)' : 'var(--c-ink-soft)' }}>{label}</Text>
        </Pressable>
    );
}
