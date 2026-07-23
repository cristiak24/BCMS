import React, { useCallback, useState, useEffect, useMemo } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, TextInput, Alert } from '@/src/web/reactNative';
import { useLocalSearchParams, useRouter } from '@/src/web/expoRouter';
import {
    ArrowLeft, Users, UserPlus, Copy, Check, Pencil, Calendar, ClipboardCheck,
    Search, X, Trash2, Shield, ListOrdered, History, Percent, Wallet,
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
    const [copied, setCopied] = useState(false);
    const [editOpen, setEditOpen] = useState(false);
    const [medicalVisaOpen, setMedicalVisaOpen] = useState(false);
    const [paymentsReportOpen, setPaymentsReportOpen] = useState(false);
    const [removingId, setRemovingId] = useState<number | null>(null);

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

    const handleRemovePlayer = async (player: Player) => {
        if (!window.confirm(`Scoți ${player.firstName} ${player.lastName} din echipă?`)) return;
        try {
            setRemovingId(player.id);
            await teamsApi.removePlayerFromTeam(teamId, player.id);
            setPlayers((prev) => prev.filter((p) => p.id !== player.id));
            void refreshStats();
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
            <View className="flex-1 items-center justify-center bg-[#EDF4FB]">
                <ActivityIndicator size="large" color="var(--c-brand-fg)" />
            </View>
        );
    }

    if (!team) {
        return (
            <View className="flex-1 items-center justify-center bg-[#EDF4FB]">
                <Text className="text-[#0E2041] font-bold">Echipa nu a fost găsită.</Text>
                <Pressable onPress={() => router.back()} className="mt-4 bg-[#1D3E90] px-6 py-2.5 rounded-xl">
                    <Text className="text-white font-bold">Înapoi</Text>
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
        <View className="flex-1 w-full bg-[#EDF4FB] pb-20">
            <ScrollView className="flex-1 w-full px-4 md:px-8 xl:px-12 pt-6 md:pt-8" showsVerticalScrollIndicator={false}>
                <View className="w-full max-w-[1180px] mx-auto">

                    {/* Top bar */}
                    <View className="flex-row items-center justify-between mb-5">
                        <Pressable onPress={() => router.push('/admin/my-club-admin' as any)} className="flex-row items-center gap-2 h-9 pl-2 pr-3.5 rounded-full bg-white border border-[#E3E9F2] active:bg-[#F4F8FD]">
                            <ArrowLeft size={16} color="var(--c-ink)" />
                            <Text className="text-[#0E2041] text-[12px] font-black">My Club</Text>
                        </Pressable>
                        <View className="flex-row items-center gap-2">
                            <Pressable onPress={() => router.push(`/admin/schedule?teamId=${team.id}` as any)} className="flex-row items-center gap-1.5 h-9 px-3.5 rounded-full bg-white border border-[#E3E9F2] active:bg-[#F4F8FD]">
                                <Calendar size={14} color="var(--c-brand-fg)" />
                                <Text className="text-[#1D3E90] text-[12px] font-black">Program</Text>
                            </Pressable>
                            <Pressable onPress={() => router.push(`/admin/schedule?teamId=${team.id}&tab=attendance` as any)} className="flex-row items-center gap-1.5 h-9 px-3.5 rounded-full bg-white border border-[#E3E9F2] active:bg-[#F4F8FD]">
                                <ClipboardCheck size={14} color="var(--c-brand-fg)" />
                                <Text className="text-[#1D3E90] text-[12px] font-black">Prezență</Text>
                            </Pressable>
                            <Pressable onPress={() => setMedicalVisaOpen(true)} className="flex-row items-center gap-1.5 h-9 px-3.5 rounded-full bg-white border border-[#E3E9F2] active:bg-[#F4F8FD]">
                                <ShieldCheck size={14} color="var(--c-success-fg)" />
                                <Text className="text-[#1D3E90] text-[12px] font-black">Vize medicale</Text>
                            </Pressable>
                            <Pressable onPress={() => setPaymentsReportOpen(true)} className="flex-row items-center gap-1.5 h-9 px-3.5 rounded-full bg-white border border-[#E3E9F2] active:bg-[#F4F8FD]">
                                <Receipt size={14} color="var(--c-brand-fg)" />
                                <Text className="text-[#1D3E90] text-[12px] font-black">Raport plăți</Text>
                            </Pressable>
                            <Pressable onPress={() => setEditOpen(true)} className="flex-row items-center gap-1.5 h-9 px-3.5 rounded-full bg-[#1D3E90] active:bg-[#15316f]">
                                <Pencil size={14} color="#ffffff" />
                                <Text className="text-white text-[12px] font-black">Editează</Text>
                            </Pressable>
                        </View>
                    </View>

                    {/* Hero */}
                    <View className="bg-white rounded-[22px] border border-[#E3E9F2] p-6 mb-4 flex-col lg:flex-row lg:items-center gap-5">
                        <View className="flex-row items-center gap-4 flex-1 min-w-0">
                            <View className="w-16 h-16 rounded-[18px] items-center justify-center flex-none" style={{ backgroundColor: crestTint }}>
                                <Shield size={30} color={accentColor} fill={accentColor} />
                            </View>
                            <View className="flex-1 min-w-0">
                                <Text className="text-[#0E2041] text-[22px] font-black leading-tight" numberOfLines={2}>{team.name}</Text>
                                <View className="flex-row flex-wrap items-center gap-1.5 mt-2">
                                    <View className="flex-row items-center gap-1 px-2 py-1 rounded-full" style={{ backgroundColor: crestTint }}>
                                        <Text className="text-[10px] font-black uppercase tracking-wide" style={{ color: frb ? 'var(--c-danger-fg)' : 'var(--c-success-fg)' }}>{frb ? 'Sincronizat FRB' : 'Administrat local'}</Text>
                                    </View>
                                    {team.gender && (
                                        <View className="px-2 py-1 rounded-full" style={{ backgroundColor: team.gender === 'M' ? 'var(--c-surface-tint)' : 'var(--c-danger-bg)' }}>
                                            <Text className="text-[10px] font-black uppercase tracking-wide" style={{ color: team.gender === 'M' ? '#28345E' : '#7C3560' }}>{GENDER_LABELS[team.gender]}</Text>
                                        </View>
                                    )}
                                    {team.level && (
                                        <View className="px-2 py-1 rounded-full bg-[#F1F5F9]"><Text className="text-[10px] font-black uppercase tracking-wide text-[#64748B]">{LEVEL_LABELS[team.level]}</Text></View>
                                    )}
                                    {!team.isActive && (
                                        <View className="px-2 py-1 rounded-full bg-slate-100"><Text className="text-[10px] font-black uppercase tracking-wide text-slate-500">Inactivă</Text></View>
                                    )}
                                </View>
                                <Text className="text-[#94A3B8] text-[12px] font-bold mt-2" numberOfLines={1}>{team.leagueName} • {team.seasonName}</Text>
                            </View>
                        </View>

                        {/* Invite code */}
                        <View className="flex-row items-center gap-3 rounded-[16px] bg-[#F7F9FC] border border-[#E3E9F2] px-4 py-3 lg:w-[260px] flex-none">
                            <View className="flex-1">
                                <Text className="text-[#94A3B8] text-[10px] font-black uppercase tracking-widest mb-1">Cod invitație</Text>
                                <Text className="text-[#1D3E90] text-[22px] font-black tracking-[2px]">{team.inviteCode}</Text>
                            </View>
                            <Pressable onPress={handleCopyInvite} className="w-10 h-10 rounded-[12px] items-center justify-center bg-white border border-[#E3E9F2] active:bg-[#F4F8FD]" accessibilityLabel="Copiază codul">
                                {copied ? <Check size={17} color="var(--c-success-fg)" /> : <Copy size={16} color="var(--c-brand-fg)" />}
                            </Pressable>
                        </View>
                    </View>

                    {/* Stats row */}
                    <View className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
                        <StatCard icon={<Users size={16} color="var(--c-brand-fg)" />} value={String(players.length)} label="Jucători în lot" tint="var(--c-surface-tint)" />
                        <StatCard
                            icon={<Percent size={16} color={attendanceColor(monthlyAtt)} />}
                            value={monthlyAtt != null ? `${monthlyAtt}%` : '—'}
                            label="Prezență (luna curentă)"
                            tint="var(--c-surface-tint)"
                        />
                        <StatCard
                            icon={<ClipboardCheck size={16} color={medicalIssues > 0 ? 'var(--c-warning-fg)' : 'var(--c-success-fg)'} />}
                            value={medicalIssues > 0 ? String(medicalIssues) : 'La zi'}
                            label={medicalIssues > 0 ? 'vizite de rezolvat' : 'vizite medicale'}
                            tint={medicalIssues > 0 ? 'var(--c-warning-bg)' : 'var(--c-success-bg)'}
                        />
                        <StatCard
                            icon={<Wallet size={16} color={arrears > 0 ? 'var(--c-danger-fg)' : 'var(--c-success-fg)'} />}
                            value={arrears > 0 ? String(arrears) : '0'}
                            label={arrears > 0 ? 'jucători cu restanțe' : 'plăți restante'}
                            tint={arrears > 0 ? 'var(--c-danger-bg)' : 'var(--c-success-bg)'}
                        />
                        <StatCard icon={<Calendar size={16} color="var(--c-brand-fg)" />} value={avgAge ? `${avgAge} ani` : '—'} label="Vârstă medie" tint="var(--c-surface-tint)" />
                    </View>

                    {/* Tabs */}
                    <View className="flex-row flex-wrap bg-white p-1 rounded-[14px] border border-[#E3E9F2] self-start mb-4 gap-1">
                        <TabButton active={tab === 'roster'} onPress={() => setTab('roster')} icon={<Users size={14} color={tab === 'roster' ? '#ffffff' : 'var(--c-faint)'} />} label={`Lot (${players.length})`} />
                        <TabButton active={tab === 'events'} onPress={() => setTab('events')} icon={<CalendarClock size={14} color={tab === 'events' ? '#ffffff' : 'var(--c-faint)'} />} label="Evenimente" />
                        <TabButton active={tab === 'history'} onPress={() => setTab('history')} icon={<History size={14} color={tab === 'history' ? '#ffffff' : 'var(--c-faint)'} />} label="Istoric" />
                        {frb && (
                            <TabButton active={tab === 'frb'} onPress={() => setTab('frb')} icon={<ListOrdered size={14} color={tab === 'frb' ? '#ffffff' : 'var(--c-faint)'} />} label="Competiție FRB" />
                        )}
                    </View>

                    {tab === 'events' ? (
                        <TeamEventsPanel teamId={team.id} scope="upcoming" />
                    ) : tab === 'history' ? (
                        <TeamEventsPanel teamId={team.id} scope="past" />
                    ) : tab === 'frb' && frb ? (
                        <TeamFrbPanel team={team} />
                    ) : (
                        <View className="bg-white rounded-[20px] border border-[#E3E9F2] p-5">
                            {/* Roster toolbar */}
                            <View className="flex-row flex-wrap items-center gap-3 mb-4">
                                <View className="relative flex-1 min-w-[200px]">
                                    <View className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"><Search size={15} color="var(--c-faint)" /></View>
                                    <TextInput
                                        value={rosterQuery}
                                        onChangeText={setRosterQuery}
                                        placeholder="Caută în lot"
                                        placeholderTextColor="var(--c-faint)"
                                        className="w-full h-10 rounded-[12px] border border-[#DDE7F5] bg-[#FBFDFF] pl-9 pr-3 text-[13px] font-semibold text-[#0E2041]"
                                    />
                                </View>
                                {players.length > 0 && (
                                    <View className="flex-row rounded-[12px] border border-[#DDE7F5] overflow-hidden flex-none">
                                        <Pressable onPress={() => setRosterView('grid')} className={`flex-row items-center gap-1.5 h-10 px-3 ${rosterView === 'grid' ? 'bg-[#1D3E90]' : 'bg-white'}`} accessibilityLabel="Vizualizare grid">
                                            <LayoutGrid size={14} color={rosterView === 'grid' ? '#ffffff' : 'var(--c-muted)'} />
                                        </Pressable>
                                        <Pressable onPress={() => setRosterView('list')} className={`flex-row items-center gap-1.5 h-10 px-3 border-l border-[#DDE7F5] ${rosterView === 'list' ? 'bg-[#1D3E90]' : 'bg-white'}`} accessibilityLabel="Vizualizare listă">
                                            <List size={14} color={rosterView === 'list' ? '#ffffff' : 'var(--c-muted)'} />
                                        </Pressable>
                                    </View>
                                )}
                                <Pressable onPress={() => setShowAdd((v) => !v)} className={`flex-row items-center gap-1.5 h-10 px-4 rounded-[12px] ${showAdd ? 'bg-[#EBF1FF] border border-[#BFD3F5]' : 'bg-[#1D3E90]'}`}>
                                    {showAdd ? <X size={15} color="var(--c-brand-fg)" /> : <UserPlus size={15} color="#ffffff" />}
                                    <Text className={`text-[12px] font-black uppercase tracking-wide ${showAdd ? 'text-[#1D3E90]' : 'text-white'}`}>{showAdd ? 'Închide' : 'Adaugă jucător'}</Text>
                                </Pressable>
                            </View>

                            {/* Add panel */}
                            {showAdd && (
                                <View className="rounded-[16px] bg-[#F7F9FC] border border-[#E3E9F2] p-4 mb-4">
                                    <View className="relative mb-2">
                                        <View className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"><Search size={15} color="var(--c-faint)" /></View>
                                        <TextInput
                                            value={searchQuery}
                                            onChangeText={setSearchQuery}
                                            placeholder="Caută jucători existenți după nume"
                                            placeholderTextColor="var(--c-faint)"
                                            className="w-full h-10 rounded-[12px] border border-[#DDE7F5] bg-white pl-9 pr-9 text-[13px] font-semibold text-[#0E2041]"
                                        />
                                        {isSearching && <View className="absolute right-3 top-2.5"><ActivityIndicator size="small" color="var(--c-brand-fg)" /></View>}
                                    </View>
                                    {searchResults.length > 0 && (
                                        <View className="gap-1.5 max-h-[260px] overflow-y-auto">
                                            {searchResults.map((rp) => (
                                                <View key={rp.id} className="flex-row items-center justify-between px-3.5 py-2.5 rounded-[12px] bg-white border border-[#F1F5F9]">
                                                    <View className="flex-row items-center gap-2.5 min-w-0">
                                                        <View className="w-8 h-8 rounded-full bg-[#EBF1FF] items-center justify-center flex-none"><Text className="text-[11px] font-black text-[#1D3E90]">{rp.firstName.charAt(0)}{rp.lastName.charAt(0)}</Text></View>
                                                        <Text className="text-[13px] font-bold text-[#0E2041] truncate" numberOfLines={1}>{rp.firstName} {rp.lastName}</Text>
                                                    </View>
                                                    <Pressable onPress={() => handleAddExistingPlayer(rp)} disabled={isAdding !== null} className="h-8 px-3 rounded-[10px] bg-[#1D3E90] items-center justify-center flex-row gap-1">
                                                        {isAdding === rp.id ? <ActivityIndicator size="small" color="#fff" /> : <Text className="text-white text-[11px] font-black uppercase">Adaugă</Text>}
                                                    </Pressable>
                                                </View>
                                            ))}
                                        </View>
                                    )}
                                    {searchQuery.length >= 2 && !isSearching && searchResults.length === 0 && (
                                        <Text className="text-center text-[#94A3B8] text-[12px] py-3 font-bold">Niciun jucător disponibil găsit.</Text>
                                    )}
                                    {searchQuery.length < 2 && (
                                        <Text className="text-center text-[#94A3B8] text-[12px] py-1 font-semibold">Scrie cel puțin 2 caractere pentru a căuta.</Text>
                                    )}
                                </View>
                            )}

                            {/* Roster grid */}
                            {players.length === 0 ? (
                                <View className="items-center justify-center py-16">
                                    <View className="w-14 h-14 rounded-full bg-[#F4F8FD] items-center justify-center mb-3"><Users size={26} color="var(--c-faint)" /></View>
                                    <Text className="text-[#0E2041] text-[14px] font-black mb-1">Niciun jucător în lot</Text>
                                    <Text className="text-[#94A3B8] text-[12.5px] font-semibold">Folosește „Adaugă jucător" pentru a construi lotul.</Text>
                                </View>
                            ) : filteredPlayers.length === 0 ? (
                                <Text className="text-center text-[#94A3B8] text-[13px] py-10 font-bold">Niciun jucător nu corespunde căutării.</Text>
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
                                <View className="flex-col rounded-[14px] border border-[#EDF1F7] overflow-hidden">
                                    <View className="hidden md:flex flex-row items-center gap-3 px-3.5 py-2 bg-[#F8FAFC] border-b border-[#EDF1F7]">
                                        <Text className="text-[10px] font-black uppercase tracking-widest text-[#94A3B8] flex-1">Jucător</Text>
                                        <Text className="text-[10px] font-black uppercase tracking-widest text-[#94A3B8] w-[150px]">Prezență</Text>
                                        <Text className="text-[10px] font-black uppercase tracking-widest text-[#94A3B8] w-[84px]">Plată</Text>
                                        <Text className="text-[10px] font-black uppercase tracking-widest text-[#94A3B8] w-[112px]">Medical</Text>
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
        </View>
    );
}

function TabButton({ active, onPress, icon, label }: { active: boolean; onPress: () => void; icon: React.ReactNode; label: string }) {
    return (
        <Pressable onPress={onPress} className={`flex-row items-center gap-1.5 px-4 py-2.5 rounded-[11px] ${active ? 'bg-[#1D3E90]' : ''}`}>
            {icon}
            <Text className={`text-[12.5px] font-black ${active ? 'text-white' : 'text-[#94A3B8]'}`}>{label}</Text>
        </Pressable>
    );
}

function StatCard({ icon, value, label, tint, valueSize = 20 }: { icon: React.ReactNode; value: string; label: string; tint: string; valueSize?: number }) {
    return (
        <View className="bg-white rounded-[16px] border border-[#E3E9F2] p-4">
            <View className="w-9 h-9 rounded-[11px] items-center justify-center mb-2.5" style={{ backgroundColor: tint }}>{icon}</View>
            <Text className="font-black text-[#0E2041] leading-tight" style={{ fontSize: valueSize }} numberOfLines={1}>{value}</Text>
            <Text className="text-[11px] font-bold text-[#94A3B8] mt-0.5">{label}</Text>
        </View>
    );
}

type RowProps = {
    player: Player;
    stat: TeamPlayerStat | undefined;
    removing: boolean;
    onOpen: () => void;
    onRemove: () => void;
};

function PaymentPill({ status }: { status: 'paid' | 'due' | 'none' }) {
    const map = {
        due: { bg: 'var(--c-danger-bg)', fg: 'var(--c-danger-fg)', label: 'Restanță' },
        paid: { bg: 'var(--c-success-bg)', fg: 'var(--c-success-fg)', label: 'Achitat' },
        none: { bg: 'var(--c-surface-3)', fg: 'var(--c-faint)', label: 'Fără plăți' },
    }[status];
    return (
        <View className="px-2 py-0.5 rounded-full self-start" style={{ backgroundColor: map.bg }}>
            <Text className="text-[10px] font-black uppercase tracking-wide" style={{ color: map.fg }}>{map.label}</Text>
        </View>
    );
}

function RowActions({ removing, onOpen, onRemove }: { removing: boolean; onOpen: () => void; onRemove: () => void }) {
    return (
        <View className="flex-row items-center gap-0.5 flex-none">
            <Pressable onPress={onOpen} className="w-8 h-8 rounded-[9px] items-center justify-center hover:bg-[#F1F5F9]" accessibilityLabel="Detalii jucător">
                <Pencil size={14} color="var(--c-muted)" />
            </Pressable>
            <Pressable onPress={onRemove} disabled={removing} className="w-8 h-8 rounded-[9px] items-center justify-center hover:bg-red-50" accessibilityLabel="Scoate din echipă">
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
                <Text className="text-[10px] font-black uppercase tracking-wide text-[#94A3B8]">Prezență</Text>
                <Text className="text-[11px] font-black" style={{ color: col }}>{rate != null ? `${rate}%` : 'N/A'}</Text>
            </View>
            <View className="h-1.5 rounded-full bg-[#EEF2F8] overflow-hidden">
                <View className="h-full rounded-full" style={{ width: `${rate ?? 0}%`, backgroundColor: col }} />
            </View>
            {showCount && stat && stat.total > 0 && (
                <Text className="text-[10px] font-semibold text-[#94A3B8] mt-1">{stat.present}/{stat.total} sesiuni</Text>
            )}
        </View>
    );
}

function PlayerRosterCard({ player: p, stat, removing, onOpen, onRemove }: RowProps) {
    const age = computeAge(p.birthYear);
    const med = MEDICAL_META[medicalStatus(p.medicalCheckExpiry)];
    return (
        <View className="flex-col rounded-[16px] border border-[#EDF1F7] hover:border-[#E3E9F2] hover:bg-[#FBFDFF] px-4 py-3.5 transition-colors">
            <View className="flex-row items-center gap-3">
                <View className="w-11 h-11 rounded-[13px] bg-[#EBF1FF] items-center justify-center flex-none">
                    <Text className="text-[14px] font-black text-[#1D3E90]">{p.firstName.charAt(0)}{p.lastName.charAt(0)}</Text>
                </View>
                <View className="flex-1 min-w-0">
                    <Text className="text-[14px] font-black text-[#0E2041]" numberOfLines={1}>{p.firstName} {p.lastName}</Text>
                    <Text className="text-[11.5px] font-semibold text-[#94A3B8]">{age ? `${age} ani` : 'Vârstă nespecificată'}{p.number != null ? ` · #${p.number}` : ''}</Text>
                </View>
                <RowActions removing={removing} onOpen={onOpen} onRemove={onRemove} />
            </View>
            <View className="flex-row items-center gap-3 mt-3">
                <View className="flex-1 min-w-0"><AttendanceMeter stat={stat} showCount /></View>
                <View className="flex-col items-end gap-1 flex-none">
                    <PaymentPill status={stat?.paymentStatus ?? 'none'} />
                    <View className="px-2 py-0.5 rounded-full" style={{ backgroundColor: med.bg }}>
                        <Text className="text-[10px] font-black uppercase tracking-wide" style={{ color: med.fg }}>{med.label}</Text>
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
        <View className={`flex-row items-center gap-3 px-3.5 py-2.5 hover:bg-[#FBFDFF] transition-colors ${last ? '' : 'border-b border-[#F1F5F9]'}`}>
            <View className="w-9 h-9 rounded-[11px] bg-[#EBF1FF] items-center justify-center flex-none">
                <Text className="text-[12px] font-black text-[#1D3E90]">{p.firstName.charAt(0)}{p.lastName.charAt(0)}</Text>
            </View>
            <View className="flex-1 min-w-0">
                <Text className="text-[13.5px] font-black text-[#0E2041]" numberOfLines={1}>{p.firstName} {p.lastName}</Text>
                <Text className="text-[11px] font-semibold text-[#94A3B8]">{age ? `${age} ani` : 'Vârstă nespecificată'}{p.number != null ? ` · #${p.number}` : ''}</Text>
            </View>
            <View className="w-[150px] hidden md:flex flex-none"><AttendanceMeter stat={stat} /></View>
            <View className="w-[84px] hidden md:flex flex-none"><PaymentPill status={stat?.paymentStatus ?? 'none'} /></View>
            <View className="w-[112px] hidden md:flex flex-none">
                <View className="px-2 py-0.5 rounded-full self-start" style={{ backgroundColor: med.bg }}>
                    <Text className="text-[10px] font-black uppercase tracking-wide" style={{ color: med.fg }}>{med.label}</Text>
                </View>
            </View>
            <RowActions removing={removing} onOpen={onOpen} onRemove={onRemove} />
        </View>
    );
}
