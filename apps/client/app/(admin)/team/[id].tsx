import React, { useCallback, useState, useEffect, useMemo } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, TextInput, Alert } from '@/src/web/reactNative';
import { useLocalSearchParams, useRouter } from '@/src/web/expoRouter';
import {
    ArrowLeft, Users, UserPlus, Copy, Check, Pencil, Calendar, ClipboardCheck,
    Search, X, Trash2, Shield, ListOrdered, History,
    CalendarClock, LayoutGrid, List, ShieldCheck, Receipt,
} from 'lucide-react';
import { teamsApi, Team, Player, Coach, TeamStats, TeamPlayerStat } from '../../../services/teamsApi';
import {
    GENDER_LABELS, LEVEL_LABELS, isFrbTeam, computeAge, medicalStatus, MEDICAL_META,
} from '../../../components/myclub/teamDisplay';
import EditTeamModal from '../../../components/myclub/EditTeamModal';
import TeamMedicalVisaModal from '../../../components/schedule/admin/TeamMedicalVisaModal';
import TeamPaymentsReportModal from '../../../components/schedule/admin/TeamPaymentsReportModal';
import TeamFrbPanel from '../../../components/myclub/team-detail/TeamFrbPanel';
import TeamEventsPanel from '../../../components/myclub/team-detail/TeamEventsPanel';
import ConfirmDialog from '../../../components/ui/ConfirmDialog';
import BulkAddPlayersDialog from '../../../components/family/BulkAddPlayersDialog';
import { MaterialIcons } from '@/src/web/expoVectorIcons';
import PageHero, { GlassStat } from '../../../components/admin/PageHero';

type TabKey = 'roster' | 'events' | 'history' | 'frb';
type RosterView = 'grid' | 'list';

function attendanceColor(rate: number | null) {
    if (rate == null) return 'var(--c-faint)';
    if (rate >= 75) return 'var(--c-success-fg)';
    if (rate >= 50) return 'var(--c-warning-fg)';
    return 'var(--c-danger-fg)';
}

export default function TeamDetailsScreen() {
    const { id } = useLocalSearchParams();
    const router = useRouter();
    const teamId = Number(id);

    const [team, setTeam] = useState<Team | null>(null);
    const [players, setPlayers] = useState<Player[]>([]);
    const [coaches, setCoaches] = useState<Coach[]>([]);
    const [stats, setStats] = useState<TeamStats | null>(null);
    const [loading, setLoading] = useState(true);

    const [tab, setTab] = useState<TabKey>('roster');
    const [rosterView, setRosterView] = useState<RosterView>('grid');
    const [rosterQuery, setRosterQuery] = useState('');
    const [showAdd, setShowAdd] = useState(false);
    const [showBulk, setShowBulk] = useState(false);
    const [copied, setCopied] = useState(false);
    const [editOpen, setEditOpen] = useState(false);
    const [medicalVisaOpen, setMedicalVisaOpen] = useState(false);
    const [paymentsReportOpen, setPaymentsReportOpen] = useState(false);
    const [removingId, setRemovingId] = useState<number | null>(null);
    // Removing a player from a team is destructive, so it goes through the shared
    // ConfirmDialog rather than a native window.confirm (unstyled, not themeable,
    // and blocks the whole tab).
    const [playerPendingRemoval, setPlayerPendingRemoval] = useState<Player | null>(null);

    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<Player[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [isAdding, setIsAdding] = useState<number | null>(null);

    const loadData = useCallback(async () => {
        try {
            setLoading(true);
            const [tData, pData, cData, sData] = await Promise.all([
                teamsApi.getTeamById(teamId),
                teamsApi.getTeamPlayers(teamId),
                teamsApi.getCoaches().catch(() => []),
                teamsApi.getTeamStats(teamId).catch(() => null),
            ]);
            setTeam(tData);
            setPlayers(pData);
            setCoaches(cData);
            setStats(sData);
        } catch (error) {
            console.error('Error loading team details', error);
            Alert.alert('Eroare', 'Eroare la încărcarea detaliilor echipei.');
        } finally {
            setLoading(false);
        }
    }, [teamId]);

    useEffect(() => {
        if (!isNaN(teamId)) loadData();
    }, [loadData, teamId]);

    const refreshStats = useCallback(async () => {
        const s = await teamsApi.getTeamStats(teamId).catch(() => null);
        if (s) setStats(s);
    }, [teamId]);

    useEffect(() => {
        const timer = setTimeout(async () => {
            if (searchQuery.trim().length >= 2) {
                try {
                    setIsSearching(true);
                    const results = await teamsApi.searchPlayers(searchQuery.trim());
                    setSearchResults(results.filter((rp) => !players.some((p) => p.id === rp.id)));
                } catch (e) {
                    console.error('Error searching players', e);
                } finally {
                    setIsSearching(false);
                }
            } else {
                setSearchResults([]);
            }
        }, 300);
        return () => clearTimeout(timer);
    }, [searchQuery, players]);

    const handleAddExistingPlayer = async (player: Player) => {
        try {
            setIsAdding(player.id);
            await teamsApi.addPlayerToTeam(player.id, teamId);
            setPlayers((prev) => [...prev, player]);
            setSearchQuery('');
            setSearchResults([]);
            void refreshStats();
        } catch {
            Alert.alert('Eroare', 'Nu am putut adăuga jucătorul în echipă.');
        } finally {
            setIsAdding(null);
        }
    };

    const handleRemovePlayer = (player: Player) => setPlayerPendingRemoval(player);

    const confirmRemovePlayer = async () => {
        const player = playerPendingRemoval;
        if (!player) return;

        try {
            setRemovingId(player.id);
            await teamsApi.removePlayerFromTeam(teamId, player.id);
            setPlayers((prev) => prev.filter((p) => p.id !== player.id));
            void refreshStats();
            setPlayerPendingRemoval(null);
        } catch (e) {
            Alert.alert('Eroare', e instanceof Error ? e.message : 'Nu am putut scoate jucătorul.');
        } finally {
            setRemovingId(null);
        }
    };

    const handleCopyInvite = async () => {
        if (!team) return;
        try {
            await navigator.clipboard?.writeText(team.inviteCode);
            setCopied(true);
            setTimeout(() => setCopied(false), 1600);
        } catch {
            /* ignore */
        }
    };

    const statsByPlayer = useMemo(() => {
        const map = new Map<number, TeamPlayerStat>();
        stats?.players.forEach((s) => map.set(s.playerId, s));
        return map;
    }, [stats]);

    const filteredPlayers = useMemo(() => {
        const q = rosterQuery.trim().toLowerCase();
        if (!q) return players;
        return players.filter((p) => `${p.firstName} ${p.lastName}`.toLowerCase().includes(q));
    }, [players, rosterQuery]);

    const avgAge = useMemo(() => {
        const ages = players.map((p) => computeAge(p.birthYear)).filter((a): a is number => a != null);
        if (ages.length === 0) return null;
        return Math.round(ages.reduce((s, a) => s + a, 0) / ages.length);
    }, [players]);

    const medicalIssues = useMemo(
        () => players.filter((p) => ['expired', 'missing'].includes(medicalStatus(p.medicalCheckExpiry))).length,
        [players],
    );

    if (loading) {
        return (
            <View className="flex-1 items-center justify-center" style={{ backgroundColor: 'var(--c-bg)' } as any}>
                <ActivityIndicator size="large" color="var(--c-brand-fg)" />
            </View>
        );
    }

    if (!team) {
        return (
            <View className="flex-1 items-center justify-center" style={{ backgroundColor: 'var(--c-bg)' } as any}>
                <Text className="font-bold" style={{ color: 'var(--c-ink-strong)' }}>Echipa nu a fost găsită.</Text>
                <Pressable onPress={() => router.back('/admin/my-club-admin')} className="mt-4 px-6 py-2.5 rounded-xl" style={{ backgroundColor: 'var(--c-brand-surface)' } as any}>
                    <Text className="font-bold" style={{ color: 'var(--c-on-brand)' }}>Înapoi</Text>
                </Pressable>
            </View>
        );
    }

    const frb = isFrbTeam(team);
    const accentColor = frb ? 'var(--c-danger)' : 'var(--c-success)';
    const crestTint = frb ? 'var(--c-danger-bg)' : 'var(--c-success-bg)';
    const monthlyAtt = stats?.monthlyAttendanceRate ?? null;
    const arrears = stats?.playersWithArrears ?? 0;

    return (
        <View className="flex-1 w-full pb-20" style={{ backgroundColor: 'var(--c-bg)' } as any}>
            <ScrollView className="flex-1 w-full px-4 md:px-8 xl:px-12 pt-6 md:pt-8" showsVerticalScrollIndicator={false}>
                <View className="w-full max-w-[1180px] mx-auto">

                    {/* Top bar. On mobile the six actions can't fit one row, so
                        the back button sits on its own line and the actions
                        become a horizontal scroll strip (was overflowing and
                        truncating labels to "Progr", "Preze", …). */}
                    <View className="flex-col lg:flex-row lg:items-center lg:justify-between gap-2.5 mb-4">
                        <Pressable onPress={() => router.push('/admin/my-club-admin' as any)} className="flex-row items-center gap-2 h-9 pl-2 pr-3.5 rounded-[10px] self-start border" style={{ backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-border)' } as any}>
                            <ArrowLeft size={16} color="var(--c-ink)" />
                            <Text className="text-[12px] font-semibold" style={{ color: 'var(--c-ink)' }}>Clubul meu</Text>
                        </Pressable>
                        <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            className="-mx-4 lg:mx-0 lg:flex-none"
                            contentContainerStyle={{ paddingHorizontal: 16, gap: 8, flexGrow: 0 }}
                        >
                            <Pressable onPress={() => router.push(`/admin/schedule?teamId=${team.id}` as any)} className="flex-row items-center gap-1.5 h-9 px-3 rounded-[10px] border" style={{ backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-border)' } as any}>
                                <Calendar size={14} color="var(--c-brand-fg)" />
                                <Text className="text-[12px] font-semibold" style={{ color: 'var(--c-ink-soft)' }}>Program</Text>
                            </Pressable>
                            <Pressable onPress={() => router.push(`/admin/schedule?teamId=${team.id}&tab=attendance` as any)} className="flex-row items-center gap-1.5 h-9 px-3 rounded-[10px] border" style={{ backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-border)' } as any}>
                                <ClipboardCheck size={14} color="var(--c-brand-fg)" />
                                <Text className="text-[12px] font-semibold" style={{ color: 'var(--c-ink-soft)' }}>Prezență</Text>
                            </Pressable>
                            <Pressable onPress={() => setMedicalVisaOpen(true)} className="flex-row items-center gap-1.5 h-9 px-3 rounded-[10px] border" style={{ backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-border)' } as any}>
                                <ShieldCheck size={14} color="var(--c-success-fg)" />
                                <Text className="text-[12px] font-semibold" style={{ color: 'var(--c-ink-soft)' }}>Vize medicale</Text>
                            </Pressable>
                            <Pressable onPress={() => setPaymentsReportOpen(true)} className="flex-row items-center gap-1.5 h-9 px-3 rounded-[10px] border" style={{ backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-border)' } as any}>
                                <Receipt size={14} color="var(--c-brand-fg)" />
                                <Text className="text-[12px] font-semibold" style={{ color: 'var(--c-ink-soft)' }}>Raport plăți</Text>
                            </Pressable>
                            <Pressable onPress={() => setEditOpen(true)} className="flex-row items-center gap-1.5 h-9 px-3.5 rounded-[10px]" style={{ backgroundColor: 'var(--c-brand-surface)', boxShadow: 'var(--e-brand)' } as any}>
                                <Pencil size={14} color="var(--c-on-brand)" />
                                <Text className="text-[12px] font-semibold" style={{ color: 'var(--c-on-brand)' }}>Editează</Text>
                            </Pressable>
                        </ScrollView>
                    </View>

                    <PageHero
                        eyebrow="Echipă"
                        title={team.name}
                        subtitle={team.leagueName ? `${team.leagueName} • ${team.seasonName}` : undefined}
                        leading={
                            <View className="w-14 h-14 md:w-16 md:h-16 rounded-[16px] items-center justify-center flex-none" style={{ backgroundColor: crestTint }}>
                                <Shield size={28} color={accentColor} fill={accentColor} />
                            </View>
                        }
                        actions={
                            <View className="flex-row items-center gap-2.5 rounded-[12px] border px-3 py-2" style={{ backgroundColor: 'var(--c-surface-2)', borderColor: 'var(--c-border)' } as any}>
                                <View>
                                    <Text className="t-eyebrow" style={{ color: 'var(--c-faint)' }}>Cod invitație</Text>
                                    <Text className="f-display t-num text-[18px] font-extrabold tracking-[2px] leading-tight" style={{ color: 'var(--c-brand-fg)' }}>{team.inviteCode}</Text>
                                </View>
                                <Pressable onPress={handleCopyInvite} className="ui-press w-9 h-9 rounded-[10px] items-center justify-center border" style={{ backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-border)' } as any} accessibilityLabel="Copiază codul">
                                    {copied ? <Check size={16} color="var(--c-success-fg)" /> : <Copy size={15} color="var(--c-brand-fg)" />}
                                </Pressable>
                            </View>
                        }
                    >
                        <View className="flex-row flex-wrap items-center gap-1.5">
                            <View className="flex-row items-center gap-1 px-2 py-1 rounded-full" style={{ backgroundColor: crestTint }}>
                                <Text className="text-[11px] font-semibold" style={{ color: frb ? 'var(--c-danger-fg)' : 'var(--c-success-fg)' }}>{frb ? 'Sincronizat FRB' : 'Administrat local'}</Text>
                            </View>
                            {team.gender && (
                                <View className="px-2 py-1 rounded-full" style={{ backgroundColor: team.gender === 'M' ? 'var(--c-surface-tint)' : 'var(--c-danger-bg)' }}>
                                    <Text className="text-[11px] font-semibold" style={{ color: team.gender === 'M' ? 'var(--c-gender-m)' : 'var(--c-gender-f)' }}>{GENDER_LABELS[team.gender]}</Text>
                                </View>
                            )}
                            {team.level && (
                                <View className="px-2 py-1 rounded-full" style={{ backgroundColor: 'var(--c-surface-3)' }}><Text className="text-[11px] font-semibold" style={{ color: 'var(--c-muted)' }}>{LEVEL_LABELS[team.level]}</Text></View>
                            )}
                            {!team.isActive && (
                                <View className="px-2 py-1 rounded-full" style={{ backgroundColor: 'var(--c-surface-3)' }}><Text className="text-[11px] font-semibold" style={{ color: 'var(--c-muted)' }}>Inactivă</Text></View>
                            )}
                        </View>
                        <View className="grid grid-cols-2 lg:grid-cols-5 gap-2 ui-stagger">
                            <GlassStat value={players.length} label="Jucători în lot" dot="var(--c-brand-fg)" />
                            <GlassStat
                                value={monthlyAtt != null ? monthlyAtt : '—'}
                                suffix={monthlyAtt != null ? '%' : undefined}
                                label="Prezență luna aceasta"
                                dot={attendanceColor(monthlyAtt)}
                                bar={monthlyAtt ?? undefined}
                            />
                            <GlassStat
                                value={medicalIssues > 0 ? medicalIssues : 'La zi'}
                                label={medicalIssues > 0 ? 'vize de rezolvat' : 'vize medicale'}
                                dot={medicalIssues > 0 ? 'var(--c-warning)' : 'var(--c-success)'}
                            />
                            <GlassStat
                                value={arrears}
                                label={arrears > 0 ? 'jucători cu restanțe' : 'plăți restante'}
                                dot={arrears > 0 ? 'var(--c-danger)' : 'var(--c-success)'}
                                danger={arrears > 0}
                            />
                            <GlassStat value={avgAge ?? '—'} suffix={avgAge ? 'ani' : undefined} label="Vârstă medie" dot="var(--c-purple)" />
                        </View>
                    </PageHero>

                    {/* Tabs */}
                    <View className="flex-row flex-wrap p-1 rounded-[14px] border self-start mb-4 gap-1" style={{ backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-border)' } as any}>
                        <TabButton active={tab === 'roster'} onPress={() => setTab('roster')} icon={<Users size={14} color={tab === 'roster' ? 'var(--c-on-brand)' : 'var(--c-faint)'} />} label={`Lot (${players.length})`} />
                        <TabButton active={tab === 'events'} onPress={() => setTab('events')} icon={<CalendarClock size={14} color={tab === 'events' ? 'var(--c-on-brand)' : 'var(--c-faint)'} />} label="Evenimente" />
                        <TabButton active={tab === 'history'} onPress={() => setTab('history')} icon={<History size={14} color={tab === 'history' ? 'var(--c-on-brand)' : 'var(--c-faint)'} />} label="Istoric" />
                        {frb && (
                            <TabButton active={tab === 'frb'} onPress={() => setTab('frb')} icon={<ListOrdered size={14} color={tab === 'frb' ? 'var(--c-on-brand)' : 'var(--c-faint)'} />} label="Competiție FRB" />
                        )}
                    </View>

                    {tab === 'events' ? (
                        <TeamEventsPanel teamId={team.id} scope="upcoming" />
                    ) : tab === 'history' ? (
                        <TeamEventsPanel teamId={team.id} scope="past" />
                    ) : tab === 'frb' && frb ? (
                        <TeamFrbPanel team={team} />
                    ) : (
                        <View className="bg-[var(--c-surface)] rounded-[16px] border border-[var(--c-border)] p-4 md:p-5 ui-rise">
                            {/* Roster toolbar */}
                            <View className="flex-row flex-wrap items-center gap-3 mb-4">
                                <View className="relative flex-1 min-w-[200px]">
                                    <View className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"><Search size={15} color="var(--c-faint)" /></View>
                                    <TextInput
                                        value={rosterQuery}
                                        onChangeText={setRosterQuery}
                                        placeholder="Caută în lot"
                                        placeholderTextColor="var(--c-faint)"
                                        className="w-full h-10 rounded-[12px] border border-[var(--c-border)] bg-[var(--c-surface-2)] pl-9 pr-3 text-[13px] font-semibold text-[color:var(--c-ink-strong)]"
                                    />
                                </View>
                                {players.length > 0 && (
                                    <View className="flex-row rounded-[12px] border border-[var(--c-border)] overflow-hidden flex-none">
                                        <Pressable onPress={() => setRosterView('grid')} className={`flex-row items-center gap-1.5 h-10 px-3 ${rosterView === 'grid' ? 'bg-[var(--c-brand-surface)]' : 'bg-[var(--c-surface)]'}`} accessibilityLabel="Vizualizare grid">
                                            <LayoutGrid size={14} color={rosterView === 'grid' ? 'var(--c-surface)' : 'var(--c-muted)'} />
                                        </Pressable>
                                        <Pressable onPress={() => setRosterView('list')} className={`flex-row items-center gap-1.5 h-10 px-3 border-l border-[var(--c-border)] ${rosterView === 'list' ? 'bg-[var(--c-brand-surface)]' : 'bg-[var(--c-surface)]'}`} accessibilityLabel="Vizualizare listă">
                                            <List size={14} color={rosterView === 'list' ? 'var(--c-surface)' : 'var(--c-muted)'} />
                                        </Pressable>
                                    </View>
                                )}
                                <Pressable onPress={() => setShowAdd((v) => !v)} className={`flex-row items-center gap-1.5 h-10 px-4 rounded-[12px] ${showAdd ? 'bg-[var(--c-surface-tint)] border border-[var(--c-brand-border)]' : 'bg-[var(--c-brand-surface)]'}`}>
                                    {showAdd ? <X size={15} color="var(--c-brand-fg)" /> : <UserPlus size={15} color="var(--c-surface)" />}
                                    <Text className={`text-[13px] font-semibold ${showAdd ? 'text-[color:var(--c-brand-fg)]' : 'text-[color:var(--c-on-brand)]'}`}>{showAdd ? 'Închide' : 'Adaugă jucător'}</Text>
                                </Pressable>
                            </View>

                            {/* Add panel */}
                            {showAdd && (
                                <View className="rounded-[16px] bg-[var(--c-surface-2)] border border-[var(--c-border)] p-4 mb-4">
                                    <Pressable
                                        onPress={() => setShowBulk(true)}
                                        accessibilityRole="button"
                                        className="ui-press flex-row items-center gap-2 h-10 px-3 mb-3 rounded-[12px] border self-start"
                                        style={{ borderColor: 'var(--c-border)', backgroundColor: 'var(--c-surface)' } as any}
                                    >
                                        <MaterialIcons name="group-add" size={16} color="var(--c-brand-fg)" />
                                        <Text className="text-[13px] font-semibold" style={{ color: 'var(--c-brand-fg)' }}>Lipește o listă de jucători noi</Text>
                                    </Pressable>
                                    <View className="relative mb-2">
                                        <View className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"><Search size={15} color="var(--c-faint)" /></View>
                                        <TextInput
                                            value={searchQuery}
                                            onChangeText={setSearchQuery}
                                            placeholder="Caută jucători existenți după nume"
                                            placeholderTextColor="var(--c-faint)"
                                            className="w-full h-10 rounded-[12px] border border-[var(--c-border)] bg-[var(--c-surface)] pl-9 pr-9 text-[13px] font-semibold text-[color:var(--c-ink-strong)]"
                                        />
                                        {isSearching && <View className="absolute right-3 top-2.5"><ActivityIndicator size="small" color="var(--c-brand-fg)" /></View>}
                                    </View>
                                    {searchResults.length > 0 && (
                                        <View className="gap-1.5 max-h-[260px] overflow-y-auto">
                                            {searchResults.map((rp) => (
                                                <View key={rp.id} className="flex-row items-center justify-between px-3.5 py-2.5 rounded-[12px] bg-[var(--c-surface)] border border-[var(--c-border)]">
                                                    <View className="flex-row items-center gap-2.5 min-w-0">
                                                        <View className="w-8 h-8 rounded-full bg-[var(--c-surface-tint)] items-center justify-center flex-none"><Text className="text-[11px] font-black text-[color:var(--c-brand-fg)]">{rp.firstName.charAt(0)}{rp.lastName.charAt(0)}</Text></View>
                                                        <Text className="text-[13px] font-bold text-[color:var(--c-ink-strong)] truncate" numberOfLines={1}>{rp.firstName} {rp.lastName}</Text>
                                                    </View>
                                                    <Pressable onPress={() => handleAddExistingPlayer(rp)} disabled={isAdding !== null} className="h-8 px-3 rounded-[10px] bg-[var(--c-brand-surface)] items-center justify-center flex-row gap-1">
                                                        {isAdding === rp.id ? <ActivityIndicator size="small" color="var(--c-on-brand)" /> : <Text className="text-[color:var(--c-on-brand)] text-[12.5px] font-semibold">Adaugă</Text>}
                                                    </Pressable>
                                                </View>
                                            ))}
                                        </View>
                                    )}
                                    {searchQuery.length >= 2 && !isSearching && searchResults.length === 0 && (
                                        <Text className="text-center text-[color:var(--c-faint)] text-[12px] py-3 font-bold">Niciun jucător disponibil găsit.</Text>
                                    )}
                                    {searchQuery.length < 2 && (
                                        <Text className="text-center text-[color:var(--c-faint)] text-[12px] py-1 font-semibold">Scrie cel puțin 2 caractere pentru a căuta.</Text>
                                    )}
                                </View>
                            )}

                            {/* Roster grid */}
                            {players.length === 0 ? (
                                <View className="items-center justify-center py-16">
                                    <View className="w-14 h-14 rounded-full bg-[var(--c-surface-3)] items-center justify-center mb-3"><Users size={26} color="var(--c-faint)" /></View>
                                    <Text className="text-[color:var(--c-ink-strong)] text-[14px] font-black mb-1">Niciun jucător în lot</Text>
                                    <Text className="text-[color:var(--c-faint)] text-[12.5px] font-semibold">Folosește „Adaugă jucător" pentru a construi lotul.</Text>
                                </View>
                            ) : filteredPlayers.length === 0 ? (
                                <Text className="text-center text-[color:var(--c-faint)] text-[13px] py-10 font-bold">Niciun jucător nu corespunde căutării.</Text>
                            ) : rosterView === 'grid' ? (
                                <View className="grid grid-cols-1 xl:grid-cols-2 gap-2.5">
                                    {filteredPlayers.map((p) => (
                                        <PlayerRosterCard
                                            key={p.id}
                                            player={p}
                                            stat={statsByPlayer.get(p.id)}
                                            removing={removingId === p.id}
                                            onOpen={() => router.push(`/admin/player/${p.id}` as any)}
                                            onRemove={() => handleRemovePlayer(p)}
                                        />
                                    ))}
                                </View>
                            ) : (
                                <View className="flex-col rounded-[14px] border border-[var(--c-border)] overflow-hidden">
                                    <View className="hidden md:flex flex-row items-center gap-3 px-3.5 py-2 bg-[var(--c-surface-2)] border-b border-[var(--c-border)]">
                                        <Text className="text-[10px] font-black uppercase tracking-widest text-[color:var(--c-faint)] flex-1">Jucător</Text>
                                        <Text className="text-[10px] font-black uppercase tracking-widest text-[color:var(--c-faint)] w-[150px]">Prezență</Text>
                                        <Text className="text-[10px] font-black uppercase tracking-widest text-[color:var(--c-faint)] w-[84px]">Plată</Text>
                                        <Text className="text-[10px] font-black uppercase tracking-widest text-[color:var(--c-faint)] w-[112px]">Medical</Text>
                                        <View className="w-[72px]" />
                                    </View>
                                    {filteredPlayers.map((p, i) => (
                                        <PlayerRosterRow
                                            key={p.id}
                                            player={p}
                                            stat={statsByPlayer.get(p.id)}
                                            removing={removingId === p.id}
                                            last={i === filteredPlayers.length - 1}
                                            onOpen={() => router.push(`/admin/player/${p.id}` as any)}
                                            onRemove={() => handleRemovePlayer(p)}
                                        />
                                    ))}
                                </View>
                            )}
                        </View>
                    )}
                </View>
            </ScrollView>

            {editOpen && (
                <EditTeamModal
                    team={team}
                    coaches={coaches}
                    onClose={() => setEditOpen(false)}
                    onSaved={(updated) => { setTeam(updated); setEditOpen(false); }}
                />
            )}

            <TeamMedicalVisaModal
                visible={medicalVisaOpen}
                teamId={teamId}
                teamName={team.name}
                onClose={() => setMedicalVisaOpen(false)}
                onSuccess={(updated, failed) => {
                    if (updated > 0) loadData();
                    if (failed > 0) Alert.alert('Eroare', `${failed} actualizări au eșuat.`);
                }}
            />

            <TeamPaymentsReportModal
                visible={paymentsReportOpen}
                teamId={teamId}
                teamName={team.name}
                onClose={() => setPaymentsReportOpen(false)}
            />

            <ConfirmDialog
                visible={playerPendingRemoval != null}
                destructive
                icon="person-remove"
                title="Scoți jucătorul din echipă?"
                message={
                    playerPendingRemoval
                        ? `${playerPendingRemoval.firstName} ${playerPendingRemoval.lastName} va fi eliminat din ${team.name}. Istoricul de prezență rămâne salvat.`
                        : undefined
                }
                confirmLabel="Scoate din echipă"
                cancelLabel="Anulează"
                loading={removingId != null}
                onConfirm={() => void confirmRemovePlayer()}
                onCancel={() => setPlayerPendingRemoval(null)}
            />

            <BulkAddPlayersDialog
                visible={showBulk}
                teamId={teamId}
                teamName={team.name}
                onClose={() => setShowBulk(false)}
                onDone={({ created, skipped }) => {
                    setShowBulk(false);
                    setShowAdd(false);
                    loadData();
                    Alert.alert('Lot actualizat', `${created} ${created === 1 ? 'jucător adăugat' : 'jucători adăugați'}${skipped.length ? `, ${skipped.length} deja în lot (${skipped.slice(0, 5).join(', ')}${skipped.length > 5 ? '…' : ''})` : ''}.`);
                }}
            />
        </View>
    );
}

function TabButton({ active, onPress, icon, label }: { active: boolean; onPress: () => void; icon: React.ReactNode; label: string }) {
    return (
        <Pressable onPress={onPress} className={`flex-row items-center gap-1.5 px-4 py-2.5 rounded-[11px] ${active ? 'bg-[var(--c-brand-surface)]' : ''}`}>
            {icon}
            <Text className={`text-[12.5px] font-black ${active ? 'text-[color:var(--c-on-brand)]' : 'text-[color:var(--c-faint)]'}`}>{label}</Text>
        </Pressable>
    );
}

type RowProps = {
    player: Player;
    stat: TeamPlayerStat | undefined;
    removing: boolean;
    onOpen: () => void;
    onRemove: () => void;
};

function PaymentPill({ status }: { status: 'paid' | 'due' | 'pending' | 'none' }) {
    const map = {
        due: { bg: 'var(--c-danger-bg)', fg: 'var(--c-danger-fg)', label: 'Restanță' },
        pending: { bg: 'var(--c-warning-bg)', fg: 'var(--c-warning-fg)', label: 'De plată' },
        paid: { bg: 'var(--c-success-bg)', fg: 'var(--c-success-fg)', label: 'Achitat' },
        none: { bg: 'var(--c-surface-3)', fg: 'var(--c-faint)', label: 'Fără plăți' },
    }[status];
    return (
        <View className="px-2 py-0.5 rounded-full self-start" style={{ backgroundColor: map.bg }}>
            <Text className="text-[11px] font-semibold" style={{ color: map.fg }}>{map.label}</Text>
        </View>
    );
}

function RowActions({ removing, onOpen, onRemove }: { removing: boolean; onOpen: () => void; onRemove: () => void }) {
    return (
        <View className="flex-row items-center gap-0.5 flex-none">
            <Pressable onPress={onOpen} className="w-8 h-8 rounded-[9px] items-center justify-center hover:bg-[var(--c-surface-3)]" accessibilityLabel="Detalii jucător">
                <Pencil size={14} color="var(--c-muted)" />
            </Pressable>
            <Pressable onPress={onRemove} disabled={removing} className="w-8 h-8 rounded-[9px] items-center justify-center hover:bg-[var(--c-danger-bg)]" accessibilityLabel="Scoate din echipă">
                {removing ? <ActivityIndicator size="small" color="var(--c-danger)" /> : <Trash2 size={14} color="var(--c-danger)" />}
            </Pressable>
        </View>
    );
}

function AttendanceMeter({ stat, showCount }: { stat: TeamPlayerStat | undefined; showCount?: boolean }) {
    const rate = stat?.attendanceRate ?? null;
    const col = attendanceColor(rate);
    return (
        <View className="w-full">
            <View className="flex-row items-center justify-between mb-1">
                <Text className="text-[11px] font-semibold text-[color:var(--c-faint)]">Prezență</Text>
                <Text className="text-[11px] font-black" style={{ color: col }}>{rate != null ? `${rate}%` : 'N/A'}</Text>
            </View>
            <View className="h-1.5 rounded-full bg-[var(--c-surface-3)] overflow-hidden">
                <View className="h-full rounded-full" style={{ width: `${rate ?? 0}%`, backgroundColor: col }} />
            </View>
            {showCount && stat && stat.total > 0 && (
                <Text className="text-[10px] font-semibold text-[color:var(--c-faint)] mt-1">{stat.present}/{stat.total} sesiuni</Text>
            )}
        </View>
    );
}

function PlayerRosterCard({ player: p, stat, removing, onOpen, onRemove }: RowProps) {
    const age = computeAge(p.birthYear);
    const med = MEDICAL_META[medicalStatus(p.medicalCheckExpiry)];
    return (
        <View className="flex-col rounded-[16px] border border-[var(--c-border)] hover:border-[var(--c-border)] hover:bg-[var(--c-surface-2)] px-3.5 py-3 transition-colors ui-lift">
            <View className="flex-row items-center gap-3">
                <View className="w-11 h-11 rounded-[13px] bg-[var(--c-surface-tint)] items-center justify-center flex-none">
                    <Text className="text-[14px] font-black text-[color:var(--c-brand-fg)]">{p.firstName.charAt(0)}{p.lastName.charAt(0)}</Text>
                </View>
                <View className="flex-1 min-w-0">
                    <Text className="f-display text-[14px] font-extrabold text-[color:var(--c-ink-strong)]" numberOfLines={1}>{p.firstName} {p.lastName}</Text>
                    <Text className="text-[11.5px] font-semibold text-[color:var(--c-faint)]">{age ? `${age} ani` : 'Vârstă nespecificată'}{p.number != null ? ` · #${p.number}` : ''}</Text>
                </View>
                <RowActions removing={removing} onOpen={onOpen} onRemove={onRemove} />
            </View>
            <View className="flex-row items-center gap-3 mt-3">
                <View className="flex-1 min-w-0"><AttendanceMeter stat={stat} showCount /></View>
                <View className="flex-col items-end gap-1 flex-none">
                    <PaymentPill status={stat?.paymentStatus ?? 'none'} />
                    <View className="px-2 py-0.5 rounded-full" style={{ backgroundColor: med.bg }}>
                        <Text className="text-[11px] font-semibold" style={{ color: med.fg }}>{med.label}</Text>
                    </View>
                </View>
            </View>
        </View>
    );
}

function PlayerRosterRow({ player: p, stat, removing, last, onOpen, onRemove }: RowProps & { last: boolean }) {
    const age = computeAge(p.birthYear);
    const med = MEDICAL_META[medicalStatus(p.medicalCheckExpiry)];
    return (
        <View className={`flex-row items-center gap-3 px-3.5 py-2.5 hover:bg-[var(--c-surface-2)] transition-colors ${last ? '' : 'border-b border-[var(--c-border)]'}`}>
            <View className="w-9 h-9 rounded-[11px] bg-[var(--c-surface-tint)] items-center justify-center flex-none">
                <Text className="text-[12px] font-black text-[color:var(--c-brand-fg)]">{p.firstName.charAt(0)}{p.lastName.charAt(0)}</Text>
            </View>
            <View className="flex-1 min-w-0">
                <Text className="text-[13.5px] font-black text-[color:var(--c-ink-strong)]" numberOfLines={1}>{p.firstName} {p.lastName}</Text>
                <Text className="text-[11px] font-semibold text-[color:var(--c-faint)]">{age ? `${age} ani` : 'Vârstă nespecificată'}{p.number != null ? ` · #${p.number}` : ''}</Text>
            </View>
            <View className="w-[150px] hidden md:flex flex-none"><AttendanceMeter stat={stat} /></View>
            <View className="w-[84px] hidden md:flex flex-none"><PaymentPill status={stat?.paymentStatus ?? 'none'} /></View>
            <View className="w-[112px] hidden md:flex flex-none">
                <View className="px-2 py-0.5 rounded-full self-start" style={{ backgroundColor: med.bg }}>
                    <Text className="text-[11px] font-semibold" style={{ color: med.fg }}>{med.label}</Text>
                </View>
            </View>
            <RowActions removing={removing} onOpen={onOpen} onRemove={onRemove} />
        </View>
    );
}
