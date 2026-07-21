import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, Pressable } from '@/src/web/reactNative';
import { useRouter } from '@/src/web/expoRouter';
import { RefreshCw, Plus } from 'lucide-react';
import AdminHero from '../../components/admin/AdminHero';
import { basketballApi } from '../../services/basketballApi';
import { teamsApi, Team, Coach } from '../../services/teamsApi';
import { useTeamFilters } from '../../hooks/useTeamFilters';
import { isFrbTeam } from '../../components/myclub/teamDisplay';
import MyClubKpiStrip from '../../components/myclub/MyClubKpiStrip';
import TeamFiltersBar from '../../components/myclub/TeamFiltersBar';
import BulkActionBar from '../../components/myclub/BulkActionBar';
import TeamCard from '../../components/myclub/TeamCard';
import TeamTable from '../../components/myclub/TeamTable';
import CreateTeamWizard from '../../components/myclub/CreateTeamWizard';
import EditTeamModal from '../../components/myclub/EditTeamModal';
import { NoTeamsEmptyState, NoResultsEmptyState } from '../../components/myclub/EmptyState';

export default function MyClubAdmin() {
    const router = useRouter();

    const [teams, setTeams] = useState<Team[]>([]);
    const [coaches, setCoaches] = useState<Coach[]>([]);
    const [loading, setLoading] = useState(true);
    const [view, setView] = useState<'grid' | 'table'>('grid');
    const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
    const [bulkBusy, setBulkBusy] = useState(false);
    const [deletingId, setDeletingId] = useState<number | null>(null);
    const [editingTeam, setEditingTeam] = useState<Team | null>(null);
    const [wizardOpen, setWizardOpen] = useState(false);
    const [wizardSource, setWizardSource] = useState<'frb' | undefined>(undefined);

    const { filters, setFilter, resetFilters, filteredTeams } = useTeamFilters(teams);

    useEffect(() => {
        void loadAll();
    }, []);

    const loadAll = async () => {
        try {
            setLoading(true);
            const [teamRows, coachRows] = await Promise.all([
                teamsApi.getTeams(),
                teamsApi.getCoaches().catch(() => []),
            ]);
            setTeams(teamRows);
            setCoaches(coachRows);
        } catch (e) {
            console.error('Failed to load club data', e);
        } finally {
            setLoading(false);
        }
    };

    const toggleSelect = (id: number) => {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    const clearSelection = () => setSelectedIds(new Set());

    const openTeam = (id: number) => router.push(`/admin/team/${id}` as any);
    const openSchedule = () => router.push('/admin/schedule' as any);

    const handleDelete = async (team: Team) => {
        if (!window.confirm(`Sigur vrei să ștergi echipa ${team.name}? Această acțiune este ireversibilă.`)) return;
        try {
            setDeletingId(team.id);
            await teamsApi.deleteTeam(team.id);
            setTeams((prev) => prev.filter((t) => t.id !== team.id));
            setSelectedIds((prev) => {
                const next = new Set(prev);
                next.delete(team.id);
                return next;
            });
        } catch (e) {
            window.alert(e instanceof Error ? e.message : 'Nu s-a putut șterge echipa.');
        } finally {
            setDeletingId(null);
        }
    };

    async function runBulkUpdate(ids: number[], updater: (id: number) => Promise<Team>) {
        setBulkBusy(true);
        try {
            const results = await Promise.allSettled(ids.map(updater));
            const succeeded: Team[] = [];
            let failed = 0;
            results.forEach((r) => {
                if (r.status === 'fulfilled') succeeded.push(r.value);
                else failed += 1;
            });
            if (succeeded.length > 0) {
                setTeams((prev) => prev.map((t) => succeeded.find((s) => s.id === t.id) ?? t));
            }
            if (failed > 0) {
                window.alert(`${failed} ${failed === 1 ? 'echipă nu a putut fi actualizată' : 'echipe nu au putut fi actualizate'}.`);
            }
        } finally {
            setBulkBusy(false);
            clearSelection();
        }
    }

    const handleBulkArchive = () => runBulkUpdate(Array.from(selectedIds), (id) => teamsApi.updateTeam(id, { isActive: false }));
    const handleBulkActivate = () => runBulkUpdate(Array.from(selectedIds), (id) => teamsApi.updateTeam(id, { isActive: true }));
    const handleBulkReassignCoach = (coachId: number) => runBulkUpdate(Array.from(selectedIds), (id) => teamsApi.updateTeam(id, { coachId }));

    const handleBulkSyncFrb = async () => {
        const targets = teams.filter((t) => selectedIds.has(t.id) && isFrbTeam(t));
        if (targets.length === 0) {
            window.alert('Selecția nu conține echipe importate din FRB.');
            return;
        }

        setBulkBusy(true);
        try {
            const groups = new Map<string, Team[]>();
            targets.forEach((t) => {
                const key = `${t.frbLeagueId}::${t.frbSeasonId}`;
                const arr = groups.get(key) ?? [];
                arr.push(t);
                groups.set(key, arr);
            });

            const updates: Team[] = [];
            for (const [key, groupTeams] of groups) {
                const [lId, sId] = key.split('::');
                try {
                    const frbList = await basketballApi.getTeams(lId, sId);
                    for (const team of groupTeams) {
                        const match = frbList.find((f) => f.id === team.frbTeamId);
                        if (match && match.name !== team.name) {
                            const updated = await teamsApi.updateTeam(team.id, { name: match.name });
                            updates.push(updated);
                        }
                    }
                } catch (e) {
                    console.error('FRB sync failed for group', key, e);
                }
            }

            if (updates.length > 0) {
                setTeams((prev) => prev.map((t) => updates.find((u) => u.id === t.id) ?? t));
                window.alert(`${updates.length} ${updates.length === 1 ? 'echipă actualizată' : 'echipe actualizate'} din FRB.`);
            } else {
                window.alert('Toate echipele selectate sunt deja la zi cu FRB.');
            }
        } finally {
            setBulkBusy(false);
            clearSelection();
        }
    };

    const handleExportCsv = () => {
        const targets = teams.filter((t) => selectedIds.has(t.id));
        const header = ['Nume', 'Sursă', 'Sex', 'Nivel', 'Jucători', 'Antrenor', 'Status', 'Actualizat'];
        const rows = targets.map((t) => [
            t.name,
            isFrbTeam(t) ? 'FRB' : 'Manual',
            t.gender ?? '',
            t.level ?? '',
            String(t.playerCount),
            t.coachName ?? '',
            t.isActive ? 'Activă' : 'Inactivă',
            t.updatedAt,
        ]);
        const csv = [header, ...rows]
            .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
            .join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `echipe-${new Date().toISOString().slice(0, 10)}.csv`;
        link.click();
        URL.revokeObjectURL(url);
    };

    const openWizard = (source?: 'frb') => {
        setWizardSource(source);
        setWizardOpen(true);
    };

    const handleTeamCreated = (team: Team) => {
        setTeams((prev) => [...prev, team]);
        setWizardOpen(false);
    };

    return (
        <View className="flex-1 w-full mx-auto bg-[#EDF4FB] pb-20">
            <ScrollView className="flex-1 w-full px-4 md:px-8 xl:px-12 pt-8 md:pt-10" showsVerticalScrollIndicator={false}>

                <AdminHero
                    title="My Club"
                    subtitle="Administrarea echipelor clubului"
                    className="md:mb-8 flex-col lg:flex-row justify-between items-start lg:items-center gap-5"
                >
                    <View className="flex-row gap-2.5">
                        <Pressable
                            onPress={() => openWizard('frb')}
                            className="flex-row items-center gap-2 h-11 px-4 rounded-[14px] bg-white/95 border border-white/70 active:bg-white"
                        >
                            <RefreshCw size={14} color="#1D3E90" />
                            <Text className="text-[#1D3E90] text-[12px] font-black uppercase tracking-widest">Importă din FRB</Text>
                        </Pressable>
                        <Pressable
                            onPress={() => openWizard()}
                            className="flex-row items-center gap-2 h-11 px-4 rounded-[14px] bg-[#123A97] border border-white/40 active:bg-[#0d2c73]"
                        >
                            <Plus size={14} color="#ffffff" />
                            <Text className="text-white text-[12px] font-black uppercase tracking-widest">Creează echipă</Text>
                        </Pressable>
                    </View>
                </AdminHero>

                {loading ? (
                    <View className="items-center justify-center p-16">
                        <ActivityIndicator size="large" color="#1D3E90" />
                    </View>
                ) : teams.length === 0 ? (
                    <NoTeamsEmptyState onImport={() => openWizard('frb')} onCreate={() => openWizard()} />
                ) : (
                    <>
                        <MyClubKpiStrip teams={teams} />

                        <TeamFiltersBar filters={filters} setFilter={setFilter} coaches={coaches} view={view} onViewChange={setView} />

                        <BulkActionBar
                            count={selectedIds.size}
                            coaches={coaches}
                            busy={bulkBusy}
                            onArchive={handleBulkArchive}
                            onActivate={handleBulkActivate}
                            onReassignCoach={handleBulkReassignCoach}
                            onExport={handleExportCsv}
                            onSyncFrb={handleBulkSyncFrb}
                            onClear={clearSelection}
                        />

                        <Text className="text-[12px] font-bold text-[#94A3B8] mb-3">{filteredTeams.length} din {teams.length} echipe</Text>

                        {filteredTeams.length === 0 ? (
                            <NoResultsEmptyState onReset={resetFilters} />
                        ) : view === 'grid' ? (
                            <View className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 w-full">
                                {filteredTeams.map((team) => (
                                    <TeamCard
                                        key={team.id}
                                        team={team}
                                        selected={selectedIds.has(team.id)}
                                        deleting={deletingId === team.id}
                                        onToggleSelect={() => toggleSelect(team.id)}
                                        onOpen={() => openTeam(team.id)}
                                        onEdit={() => setEditingTeam(team)}
                                        onSchedule={openSchedule}
                                        onDelete={() => handleDelete(team)}
                                    />
                                ))}
                            </View>
                        ) : (
                            <TeamTable
                                teams={filteredTeams}
                                selectedIds={selectedIds}
                                deletingId={deletingId}
                                onToggleSelect={toggleSelect}
                                onOpen={openTeam}
                                onEdit={(team) => setEditingTeam(team)}
                                onSchedule={openSchedule}
                                onDelete={handleDelete}
                            />
                        )}
                    </>
                )}
            </ScrollView>

            {wizardOpen && (
                <CreateTeamWizard
                    coaches={coaches}
                    initialSource={wizardSource}
                    onClose={() => setWizardOpen(false)}
                    onCreated={handleTeamCreated}
                />
            )}

            {editingTeam && (
                <EditTeamModal
                    team={editingTeam}
                    coaches={coaches}
                    onClose={() => setEditingTeam(null)}
                    onSaved={(updated) => {
                        setTeams((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
                        setEditingTeam(null);
                    }}
                />
            )}
        </View>
    );
}
