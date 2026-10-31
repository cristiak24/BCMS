import React, { useCallback, useState, useEffect, useMemo } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, TextInput, Alert } from '@/src/web/reactNative';
import { useLocalSearchParams, useRouter } from '@/src/web/expoRouter';
import {
    ArrowLeft, Users, UserPlus, Copy, Check, Search, X, Shield, ListOrdered, History,
    CalendarClock, BarChart3,
} from 'lucide-react';
import TeamSeasonTable from '../../../components/stats/TeamSeasonTable';
import Button from '../../../components/ui/Button';
import ActionSheet, { type SheetAction } from '../../../components/ui/ActionSheet';
import { DenseAvatar, DenseHeader, DenseHeading, DenseList, DenseRow } from '../../../components/ui/DenseList';
import { teamsApi, Team, Player, Coach, TeamStats, TeamPlayerStat } from '../../../services/teamsApi';
import {
    GENDER_LABELS, LEVEL_LABELS, isFrbTeam, computeAge, medicalStatus, MEDICAL_META,
} from '../../../components/myclub/teamDisplay';
import EditTeamModal from '../../../components/myclub/EditTeamModal';
import TeamMedicalVisaModal from '../../../components/schedule/admin/TeamMedicalVisaModal';
import TeamPaymentsReportModal from '../../../components/schedule/admin/TeamPaymentsReportModal';
import TeamFrbPanel from '../../../components/myclub/team-detail/TeamFrbPanel';
import TeamEventsPanel from '../../../components/myclub/team-detail/TeamEventsPanel';
import TeamAddPlayersPanel from '../../../components/myclub/team-detail/TeamAddPlayersPanel';
import ConfirmDialog from '../../../components/ui/ConfirmDialog';
import BulkAddPlayersDialog from '../../../components/family/BulkAddPlayersDialog';
import { MaterialIcons } from '@/src/web/expoVectorIcons';
import PageHero, { GlassStat, StatStrip } from '../../../components/admin/PageHero';
import { ATTENDANCE_PERIOD_LABEL } from '../../../utils/attendanceRate';
import { plural, pluralWord } from '../../../utils/plural';
import { ErrorState } from '../../../components/ui/ScreenState';
import { isNotFound } from '../../../services/apiClient';
import { loadFailureMessage } from '../../../utils/errorMessages';

type TabKey = 'roster' | 'events' | 'history' | 'stats' | 'frb';

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
    // Gone (404 or a bad link) vs didn't load: one says „nu mai există”, the other offers Reîncearcă.
    const [missing, setMissing] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);

    const [tab, setTab] = useState<TabKey>('roster');
    const [teamActionsOpen, setTeamActionsOpen] = useState(false);
    const [rosterQuery, setRosterQuery] = useState('');
    const [showAdd, setShowAdd] = useState(false);
    const [showBulk, setShowBulk] = useState(false);
    const [copied, setCopied] = useState(false);
    const [editOpen, setEditOpen] = useState(false);
    const [medicalVisaOpen, setMedicalVisaOpen] = useState(false);
    const [paymentsReportOpen, setPaymentsReportOpen] = useState(false);
    const [removingId, setRemovingId] = useState<number | null>(null);
    const [rowMenuFor, setRowMenuFor] = useState<Player | null>(null);
    // Removing a player from a team is destructive, so it goes through the shared
    // ConfirmDialog rather than a native window.confirm (unstyled, not themeable,
    // and blocks the whole tab).
    const [playerPendingRemoval, setPlayerPendingRemoval] = useState<Player | null>(null);

    // Bumped on every roster change so the add panel refetches who is still available.
    const [rosterVersion, setRosterVersion] = useState(0);

    // `silent` refreshes in place (after a bulk import) instead of swapping the
    // whole page for a spinner, so the add panel stays open where it was.
    const loadData = useCallback(async ({ silent = false }: { silent?: boolean } = {}) => {
        try {
            if (!silent) setLoading(true);
            setLoadError(null);
            setMissing(false);
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
            setRosterVersion((v) => v + 1);
        } catch (error) {
            console.error('Error loading team details', error);
            setMissing(isNotFound(error));
            setLoadError(loadFailureMessage(error));
        } finally {
            setLoading(false);
        }
    }, [teamId]);

    useEffect(() => {
        if (!isNaN(teamId)) loadData();
        else { setMissing(true); setLoading(false); }
    }, [loadData, teamId]);

    const refreshStats = useCallback(async () => {
        const s = await teamsApi.getTeamStats(teamId).catch(() => null);
        if (s) setStats(s);
    }, [teamId]);

    // Errors propagate to TeamAddPlayersPanel, which shows them inline.
    const handleAddExistingPlayer = async (player: Player) => {
        await teamsApi.addPlayerToTeam(player.id, teamId);
        setPlayers((prev) => [...prev, player]);
        setRosterVersion((v) => v + 1);
        void refreshStats();
    };

    const handleRemovePlayer = (player: Player) => setPlayerPendingRemoval(player);

    const confirmRemovePlayer = async () => {
        const player = playerPendingRemoval;
        if (!player) return;

        try {
            setRemovingId(player.id);
            await teamsApi.removePlayerFromTeam(teamId, player.id);
            setPlayers((prev) => prev.filter((p) => p.id !== player.id));
            setRosterVersion((v) => v + 1);
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
            <View className="flex-1 items-center justify-center p-6" style={{ backgroundColor: 'var(--c-bg)' } as any}>
                <Text className="sr-only" accessibilityRole="header" aria-level={1}>Echipă</Text>
                {missing || !loadError ? (
                    <ErrorState title="Echipa nu mai există" message="A fost ștearsă sau linkul nu mai e valid." actionLabel="Înapoi la Clubul meu" onAction={() => router.replace('/admin/my-club-admin' as any)} />
                ) : (
                    <ErrorState title="Echipa nu s-a încărcat" message={loadError} actionLabel="Reîncearcă" onAction={() => void loadData()} />
                )}
            </View>
        );
    }

    const frb = isFrbTeam(team);
    // Secondary team actions: inline from md, in the „Mai multe” sheet on phones.
    const teamActions: SheetAction[] = [
        { key: 'schedule', label: 'Program', icon: 'event', onPress: () => router.push(`/admin/schedule?teamId=${team.id}` as any) },
        { key: 'attendance', label: 'Prezență', icon: 'fact-check', onPress: () => router.push(`/admin/schedule?teamId=${team.id}&tab=attendance` as any) },
        { key: 'visa', label: 'Vize medicale', icon: 'verified-user', onPress: () => setMedicalVisaOpen(true) },
        { key: 'payments', label: 'Raport plăți', icon: 'receipt-long', onPress: () => setPaymentsReportOpen(true) },
    ];
    // One crest colour: red for FRB teams and green for manual ones read as danger / OK.
    const accentColor = 'var(--c-brand-fg)';
    const crestTint = 'var(--c-surface-tint)';
    // The shared 30-day rate (utils/attendanceRate.ts), same as Dashboard and Lot.
    const monthlyAtt = stats?.attendance?.rate ?? stats?.monthlyAttendanceRate ?? null;
    const arrears = stats?.playersWithArrears ?? 0;

    return (
        <View className="flex-1 w-full pb-20" style={{ backgroundColor: 'var(--c-bg)' } as any}>
            <ScrollView className="flex-1 w-full px-4 md:px-8 xl:px-12 pt-6 md:pt-8" showsVerticalScrollIndicator={false}>
                <View className="w-full max-w-[1180px] mx-auto">

                    {/* Top bar. On mobile the six actions can't fit one row, so
                        the back button sits on its own line and the actions
                        become a horizontal scroll strip (was overflowing and
                        truncating labels to "Progr", "Preze", …). */}
                    {/* Phones: back (icon only) and the actions share one row, so the
                        header no longer fills the first screen before the roster. */}
                    <View className="flex-row items-center lg:justify-between gap-2 lg:gap-2.5 mb-3 lg:mb-4">
                        <Pressable
                            onPress={() => router.push('/admin/my-club-admin' as any)}
                            accessibilityRole="button"
                            accessibilityLabel="Înapoi la Clubul meu"
                            className="flex-row items-center gap-2 h-9 w-9 [@media(pointer:coarse)]:h-10 [@media(pointer:coarse)]:w-10 lg:w-auto justify-center lg:justify-start lg:pl-2 lg:pr-3.5 rounded-[10px] shrink-0 border"
                            style={{ backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-border)' } as any}
                        >
                            <ArrowLeft size={16} color="var(--c-ink)" />
                            <Text className="hidden lg:flex text-[12px] font-semibold" style={{ color: 'var(--c-ink)' }}>Clubul meu</Text>
                        </Pressable>
                        {/* Phones: one primary + „Mai multe”. Five buttons in a sideways strip
                            ran off the edge („Raport plăți” was never visible). */}
                        <View className="flex-1 md:hidden flex-row justify-end gap-2">
                            <Button icon="more-horiz" label="Mai multe" onPress={() => setTeamActionsOpen(true)} />
                            <Button icon="edit" label="Editează" variant="primary" onPress={() => setEditOpen(true)} />
                        </View>
                        <View className="hidden md:flex flex-1 flex-row flex-wrap justify-end gap-2">
                            {teamActions.map((action) => (
                                <Button key={action.key} icon={action.icon} label={action.label} onPress={action.onPress} />
                            ))}
                            <Button icon="edit" label="Editează" variant="primary" onPress={() => setEditOpen(true)} />
                        </View>
                    </View>

                    <PageHero
                        eyebrow="Echipă"
                        title={team.name}
                        subtitle={team.leagueName ? `${team.leagueName} • ${team.seasonName}` : undefined}
                        leading={
                            <View className="w-11 h-11 md:w-16 md:h-16 rounded-[14px] md:rounded-[16px] items-center justify-center flex-none" style={{ backgroundColor: crestTint }}>
                                <Shield size={24} color={accentColor} fill={accentColor} />
                            </View>
                        }
                        actions={
                            <View className="flex-row items-center gap-2.5 rounded-[12px] border pl-3 pr-1.5 py-1.5 md:pr-3 md:py-2" style={{ backgroundColor: 'var(--c-surface-2)', borderColor: 'var(--c-border)' } as any}>
                                <View className="flex-row md:flex-col items-baseline md:items-start gap-2 md:gap-0">
                                    <Text className="t-label" style={{ color: 'var(--c-muted)' }}>Cod invitație</Text>
                                    <Text className="f-display t-num text-[16px] md:text-[18px] font-extrabold tracking-[2px] leading-tight" style={{ color: 'var(--c-brand-fg)' }}>{team.inviteCode}</Text>
                                </View>
                                <Pressable onPress={handleCopyInvite} className="tap-40 ui-press w-8 h-8 md:w-9 md:h-9 rounded-[10px] items-center justify-center border" style={{ backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-border)' } as any} accessibilityLabel="Copiază codul">
                                    {copied ? <Check size={16} color="var(--c-success-fg)" /> : <Copy size={15} color="var(--c-brand-fg)" />}
                                </Pressable>
                            </View>
                        }
                    >
                        <View className="flex-row flex-wrap items-center gap-1.5">
                            {/* Neutral tags: source, gender and level are facts, not states (they were green, red and pink). */}
                            <View className="flex-row items-center gap-1 px-2 py-1 rounded-full" style={{ backgroundColor: 'var(--c-surface-3)' }}>
                                <Text className="text-[11px] font-semibold" style={{ color: 'var(--c-muted)' }}>{frb ? 'Sincronizat FRB' : 'Manual'}</Text>
                            </View>
                            {team.gender && (
                                <View className="px-2 py-1 rounded-full" style={{ backgroundColor: 'var(--c-surface-3)' }}>
                                    <Text className="text-[11px] font-semibold" style={{ color: 'var(--c-muted)' }}>{GENDER_LABELS[team.gender]}</Text>
                                </View>
                            )}
                            {team.level && (
                                <View className="px-2 py-1 rounded-full" style={{ backgroundColor: 'var(--c-surface-3)' }}><Text className="text-[11px] font-semibold" style={{ color: 'var(--c-muted)' }}>{LEVEL_LABELS[team.level]}</Text></View>
                            )}
                            {/* Phones: the average age is a chip here, not a fifth tile alone on its row. */}
                            {avgAge ? (
                                <View className="lg:hidden px-2 py-1 rounded-full" style={{ backgroundColor: 'var(--c-surface-3)' }}><Text className="text-[11px] font-semibold" style={{ color: 'var(--c-muted)' }}>Vârstă medie {avgAge} ani</Text></View>
                            ) : null}
                            {!team.isActive && (
                                <View className="px-2 py-1 rounded-full" style={{ backgroundColor: 'var(--c-surface-3)' }}><Text className="text-[11px] font-semibold" style={{ color: 'var(--c-muted)' }}>Inactivă</Text></View>
                            )}
                        </View>
                        <StatStrip className="grid-cols-4 lg:grid-cols-5">
                            <GlassStat value={players.length} label="Jucători în lot" shortLabel="în lot" dot="var(--c-brand-fg)" />
                            <GlassStat
                                value={monthlyAtt != null ? monthlyAtt : '—'}
                                suffix={monthlyAtt != null ? '%' : undefined}
                                label="Prezență"
                                shortLabel="prezență"
                                hint={ATTENDANCE_PERIOD_LABEL.toLowerCase()}
                                dot={attendanceColor(monthlyAtt)}
                                bar={monthlyAtt ?? undefined}
                            />
                            <GlassStat
                                value={medicalIssues > 0 ? medicalIssues : 'La zi'}
                                // Expired + missing: "fără viză valabilă", not "vize de rezolvat" (Acasă counts only expired ones).
                                label={medicalIssues > 0 ? 'fără viză valabilă' : 'vize medicale'}
                                shortLabel={medicalIssues > 0 ? 'fără viză' : 'vize'}
                                dot={medicalIssues > 0 ? 'var(--c-warning)' : 'var(--c-success)'}
                            />
                            <GlassStat
                                value={arrears}
                                label={arrears > 0 ? 'jucători cu restanțe' : 'plăți restante'}
                                shortLabel="restanțe"
                                dot={arrears > 0 ? 'var(--c-danger)' : 'var(--c-success)'}
                                danger={arrears > 0}
                            />
                            <View className="hidden lg:flex">
                                <GlassStat value={avgAge ?? '—'} suffix={avgAge ? 'ani' : undefined} label="Vârstă medie" dot="var(--c-purple)" />
                            </View>
                        </StatStrip>
                    </PageHero>

                    {team.coachDisabled ? (
                        <Pressable
                            onPress={() => setEditOpen(true)}
                            accessibilityRole="button"
                            className="ui-press mb-4 rounded-[14px] border px-4 py-3 flex-row items-center gap-3 text-left"
                            style={{ backgroundColor: 'var(--c-warning-bg)', borderColor: 'var(--c-warning-border)' } as any}
                        >
                            <MaterialIcons name="warning-amber" size={18} color="var(--c-warning-fg)" />
                            <View className="flex-1 min-w-0">
                                <Text className="text-[13.5px] font-bold" style={{ color: 'var(--c-warning-fg)' }}>
                                    {`Antrenorul echipei${team.coachName ? `, ${team.coachName},` : ''} are contul dezactivat`}
                                </Text>
                                <Text className="text-[12.5px] font-medium mt-0.5" style={{ color: 'var(--c-warning-fg)' }}>
                                    Niciun alt antrenor nu poate prelua echipa până nu alegi unul. Apasă ca să schimbi antrenorul.
                                </Text>
                            </View>
                            <MaterialIcons name="chevron-right" size={20} color="var(--c-warning-fg)" />
                        </Pressable>
                    ) : null}

                    {/* Tabs */}
                    {/* One row that scrolls on a phone; wrapping left „Statistici” alone on a second line. */}
                    <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        className="mb-4 -mx-4 px-4 md:mx-0 md:px-0"
                        contentContainerStyle={{ flexGrow: 0 }}
                    >
                    {/* Same neutral segmented track as Program and Finanțe: the brand fill on the active tab was accent on chrome. */}
                    <View accessibilityRole={'tablist' as any} className="flex-row p-[3px] rounded-[10px] gap-[2px]" style={{ backgroundColor: 'var(--c-surface-3)' } as any}>
                        <TabButton active={tab === 'roster'} onPress={() => setTab('roster')} icon={<Users size={14} color={tab === 'roster' ? 'var(--c-brand-fg)' : 'var(--c-faint)'} />} label={`Lot (${players.length})`} />
                        <TabButton active={tab === 'events'} onPress={() => setTab('events')} icon={<CalendarClock size={14} color={tab === 'events' ? 'var(--c-brand-fg)' : 'var(--c-faint)'} />} label="Evenimente" />
                        <TabButton active={tab === 'history'} onPress={() => setTab('history')} icon={<History size={14} color={tab === 'history' ? 'var(--c-brand-fg)' : 'var(--c-faint)'} />} label="Istoric" />
                        <TabButton active={tab === 'stats'} onPress={() => setTab('stats')} icon={<BarChart3 size={14} color={tab === 'stats' ? 'var(--c-brand-fg)' : 'var(--c-faint)'} />} label="Statistici" />
                        {frb && (
                            <TabButton active={tab === 'frb'} onPress={() => setTab('frb')} icon={<ListOrdered size={14} color={tab === 'frb' ? 'var(--c-brand-fg)' : 'var(--c-faint)'} />} label="Competiție FRB" />
                        )}
                    </View>
                    </ScrollView>

                    {/* A heading for the open tab: the page exposed only its h1, so heading
                        navigation skipped straight past the roster, events and stats. */}
                    <Text className="sr-only" accessibilityRole="header">
                        {tab === 'events' ? 'Evenimente' : tab === 'history' ? 'Istoric' : tab === 'stats' ? 'Statistici' : tab === 'frb' ? 'Competiție FRB' : 'Lotul echipei'}
                    </Text>

                    {tab === 'events' ? (
                        <TeamEventsPanel teamId={team.id} scope="upcoming" />
                    ) : tab === 'history' ? (
                        <TeamEventsPanel teamId={team.id} scope="past" />
                    ) : tab === 'stats' ? (
                        <TeamSeasonTable teamId={team.id} />
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
                                        accessibilityLabel="Caută în lot"
                                        placeholderTextColor="var(--c-faint)"
                                        className="w-full h-10 rounded-[12px] border border-[var(--c-border)] bg-[var(--c-surface-2)] pl-9 pr-3 text-[13px] font-semibold text-[color:var(--c-ink-strong)]"
                                    />
                                </View>
                                <Pressable onPress={() => setShowAdd((v) => !v)} className={`flex-row items-center gap-1.5 h-10 px-4 rounded-[12px] ${showAdd ? 'bg-[var(--c-surface-tint)] border border-[var(--c-brand-border)]' : 'bg-[var(--c-brand-surface)]'}`}>
                                    {showAdd ? <X size={15} color="var(--c-brand-fg)" /> : <UserPlus size={15} color="var(--c-surface)" />}
                                    <Text className={`text-[13px] font-semibold ${showAdd ? 'text-[color:var(--c-brand-fg)]' : 'text-[color:var(--c-on-brand)]'}`}>{showAdd ? 'Închide' : 'Adaugă jucător'}</Text>
                                </Pressable>
                            </View>

                            {/* Add panel */}
                            {showAdd && (
                                <TeamAddPlayersPanel
                                    teamId={teamId}
                                    rosterVersion={rosterVersion}
                                    onAdd={handleAddExistingPlayer}
                                    onOpenBulk={() => setShowBulk(true)}
                                />
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
                            ) : (
                                // One dense list. The default used to be a grid of bordered cards
                                // (one per player), with the list behind a toggle.
                                <DenseList
                                    label="Lotul echipei"
                                    header={
                                        <DenseHeader>
                                            {/* Lot's order: Viză, Prezență, Plată. */}
                                            <DenseHeading className="flex-1">Jucător</DenseHeading>
                                            <DenseHeading className="w-[112px]">Viză medicală</DenseHeading>
                                            <DenseHeading className="w-[150px]">Prezență</DenseHeading>
                                            <DenseHeading className="w-[84px]">Plată</DenseHeading>
                                            <View className="w-[40px]" />
                                        </DenseHeader>
                                    }
                                >
                                    {filteredPlayers.map((p) => (
                                        <PlayerRosterRow
                                            key={p.id}
                                            player={p}
                                            stat={statsByPlayer.get(p.id)}
                                            removing={removingId === p.id}
                                            onOpen={() => router.push(`/admin/player/${p.id}` as any)}
                                            onActions={() => setRowMenuFor(p)}
                                        />
                                    ))}
                                </DenseList>
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

            <ActionSheet
                visible={rowMenuFor != null}
                title={rowMenuFor ? `${rowMenuFor.firstName} ${rowMenuFor.lastName}` : ''}
                subtitle={team.name}
                actions={rowMenuFor ? [
                    { key: 'open', label: 'Deschide fișa', icon: 'person', onPress: () => router.push(`/admin/player/${rowMenuFor.id}` as any) },
                    { key: 'remove', label: 'Scoate din echipă', icon: 'person-remove', tone: 'danger', onPress: () => handleRemovePlayer(rowMenuFor) },
                ] : []}
                onClose={() => setRowMenuFor(null)}
            />

            <ActionSheet
                visible={teamActionsOpen}
                title="Mai multe"
                subtitle={team.name}
                actions={teamActions.map((action) => ({ ...action, onPress: () => { setTeamActionsOpen(false); action.onPress(); } }))}
                onClose={() => setTeamActionsOpen(false)}
            />

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
                cancelLabel="Renunță"
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
                    void loadData({ silent: true });
                    Alert.alert('Lot actualizat', `${plural(created, 'jucător adăugat', 'jucători adăugați')}${skipped.length ? `, ${skipped.length} deja în lot (${skipped.slice(0, 5).join(', ')}${skipped.length > 5 ? '…' : ''})` : ''}.`);
                }}
            />
        </View>
    );
}

function TabButton({ active, onPress, icon, label }: { active: boolean; onPress: () => void; icon: React.ReactNode; label: string }) {
    return (
        <Pressable
            onPress={onPress}
            accessibilityRole={'tab' as any}
            accessibilityState={{ selected: active }}
            // Phones: no icon and tighter padding, so the four tabs fit at 375 („Statistici” was cut off).
            className="flex-row items-center gap-1.5 px-2.5 sm:px-3.5 min-h-9 [@media(pointer:coarse)]:min-h-10 rounded-[8px] shrink-0"
            style={active ? { backgroundColor: 'var(--c-surface)', boxShadow: 'var(--e-xs)' } as any : undefined}
        >
            <View className="hidden sm:flex">{icon}</View>
            <Text className={`text-[12.5px] font-semibold whitespace-nowrap ${active ? 'text-[color:var(--c-ink)]' : 'text-[color:var(--c-muted)]'}`}>{label}</Text>
        </Pressable>
    );
}

type RowProps = {
    player: Player;
    stat: TeamPlayerStat | undefined;
    removing: boolean;
    onOpen: () => void;
    onActions: () => void;
};

function PaymentPill({ status }: { status: 'paid' | 'due' | 'pending' | 'none' }) {
    const map = {
        due: { bg: 'var(--c-danger-bg)', fg: 'var(--c-danger-fg)', label: 'Restanță' },
        pending: { bg: 'var(--c-surface-3)', fg: 'var(--c-ink-soft)', label: 'De plată' },
        paid: { bg: 'var(--c-success-bg)', fg: 'var(--c-success-fg)', label: 'Plătit' },
        none: { bg: 'var(--c-surface-3)', fg: 'var(--c-faint)', label: 'Fără plăți' },
    }[status];
    return (
        <View className="px-2 py-0.5 rounded-full self-start" style={{ backgroundColor: map.bg }}>
            <Text className="text-[11px] font-semibold" style={{ color: map.fg }}>{map.label}</Text>
        </View>
    );
}

/** One ⋯ per row, as in Lot (a pencil and a red remove icon sat on every row). */
function RowActions({ name, removing, onActions }: { name: string; removing: boolean; onActions: () => void }) {
    return (
        <Pressable
            onPress={onActions}
            disabled={removing}
            accessibilityRole="button"
            accessibilityLabel={`Acțiuni pentru ${name}`}
            className="ui-press tap-40 w-9 h-9 rounded-[9px] items-center justify-center flex-none hover:bg-[var(--c-surface-3)]"
        >
            {removing ? <ActivityIndicator size="small" color="var(--c-muted)" /> : <MaterialIcons name="more-horiz" size={20} color="var(--c-muted)" />}
        </Pressable>
    );
}

function AttendanceMeter({ stat, showCount }: { stat: TeamPlayerStat | undefined; showCount?: boolean }) {
    const rate = stat?.attendanceRate ?? null;
    const col = attendanceColor(rate);
    return (
        <View className="w-full">
            <View className="flex-row items-center justify-between mb-1">
                <Text className="text-[11px] font-semibold text-[color:var(--c-faint)]">Prezență</Text>
                <Text className="t-num text-[11px] font-semibold" style={{ color: col }}>{rate != null ? `${rate}%` : '—'}</Text>
            </View>
            {rate != null ? (
                <View className="h-1.5 rounded-full bg-[var(--c-surface-3)] overflow-hidden">
                    <View className="h-full rounded-full" style={{ width: `${rate}%`, backgroundColor: col }} />
                </View>
            ) : null}
            {showCount && stat && stat.total > 0 && (
                <Text className="text-[10px] font-semibold text-[color:var(--c-faint)] mt-1">{stat.present}/{stat.total} {pluralWord(stat.total, 'sesiune', 'sesiuni')}</Text>
            )}
        </View>
    );
}

function PlayerRosterRow({ player: p, stat, removing, onOpen, onActions }: RowProps) {
    const age = computeAge(p.birthYear);
    const med = MEDICAL_META[medicalStatus(p.medicalCheckExpiry)];
    const rate = stat?.attendanceRate ?? null;
    const meta = `${age ? `${age} ani` : 'Vârstă nespecificată'}${p.number != null ? ` · #${p.number}` : ''}`;
    return (
        <DenseRow className="hover:bg-[var(--c-surface-2)] transition-colors">
            <Pressable onPress={onOpen} accessibilityRole="link" accessibilityLabel={`${p.firstName} ${p.lastName}`} className="flex-1 min-w-0 flex-row items-center gap-3 text-left">
                <DenseAvatar className="hidden sm:flex" initials={`${p.firstName.charAt(0)}${p.lastName.charAt(0)}`} />
                <View className="flex-1 min-w-0">
                    <Text className="text-[14px] font-semibold text-[color:var(--c-ink)]" numberOfLines={1}>{p.firstName} {p.lastName}</Text>
                    <Text className="t-meta text-[color:var(--c-muted)] md:hidden" numberOfLines={1}>
                        {meta} · <Text className="t-num" style={{ color: attendanceColor(rate) }}>{rate != null ? `${rate}% prezență` : 'prezență —'}</Text>
                    </Text>
                    <Text className="t-meta text-[color:var(--c-muted)] hidden md:flex" numberOfLines={1}>{meta}</Text>
                    {/* Phones: payment and clearance under the name instead of their own columns. */}
                    <View className="md:hidden flex-row flex-wrap items-center gap-1.5 mt-1">
                        <View className="px-2 py-0.5 rounded-full" style={{ backgroundColor: med.bg }}>
                            <Text className="text-[11px] font-semibold" style={{ color: med.fg }}>{med.label}</Text>
                        </View>
                        <PaymentPill status={stat?.paymentStatus ?? 'none'} />
                    </View>
                </View>
            </Pressable>
            <View className="w-[112px] hidden md:flex flex-none">
                <View className="px-2 py-0.5 rounded-full self-start" style={{ backgroundColor: med.bg }}>
                    <Text className="text-[11px] font-semibold" style={{ color: med.fg }}>{med.label}</Text>
                </View>
            </View>
            <View className="w-[150px] hidden md:flex flex-none"><AttendanceMeter stat={stat} /></View>
            <View className="w-[84px] hidden md:flex flex-none"><PaymentPill status={stat?.paymentStatus ?? 'none'} /></View>
            <RowActions name={`${p.firstName} ${p.lastName}`} removing={removing} onActions={onActions} />
        </DenseRow>
    );
}
