import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, ScrollView, Pressable } from '@/src/web/reactNative';
import { useRouter } from '@/src/web/expoRouter';
import { RefreshCw, Plus } from 'lucide-react';
import AdminHero from '../../components/admin/AdminHero';
import { basketballApi } from '../../services/basketballApi';
import { teamsApi, Team, Coach } from '../../services/teamsApi';
import { useTeamFilters } from '../../hooks/useTeamFilters';
import { isFrbTeam } from '../../components/myclub/teamDisplay';
import MyClubKpiStrip from '../../components/myclub/MyClubKpiStrip';
import MyClubSkeleton from '../../components/myclub/MyClubSkeleton';
import TeamFiltersBar from '../../components/myclub/TeamFiltersBar';
import BulkActionBar from '../../components/myclub/BulkActionBar';
import TeamCard from '../../components/myclub/TeamCard';
import TeamTable from '../../components/myclub/TeamTable';
import CreateTeamWizard from '../../components/myclub/CreateTeamWizard';
import EditTeamModal from '../../components/myclub/EditTeamModal';
import ThemedCheckbox from '../../components/myclub/ThemedCheckbox';
import { NoTeamsEmptyState, NoResultsEmptyState } from '../../components/myclub/EmptyState';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import { ToastHost, useToasts } from '../../components/ui/Toast';

const VIEW_STORAGE_KEY = 'myclub.view.v1';

/** Compare an FRB team against the federation source and rename if it drifted.
 * Returns the updated team when a change was applied, otherwise null. */
async function syncFrbTeam(team: Team): Promise<Team | null> {
    const frbList = await basketballApi.getTeams(team.frbLeagueId, team.frbSeasonId);
    const match = frbList.find((f) => f.id === team.frbTeamId);
    if (match && match.name !== team.name) {
        return teamsApi.updateTeam(team.id, { name: match.name });
    }
    return null;
}

export default function MyClubAdmin() {
    const router = useRouter();

    const [teams, setTeams] = useState<Team[]>([]);
    const [coaches, setCoaches] = useState<Coach[]>([]);
    const [loading, setLoading] = useState(true);
    const [view, setView] = useState<'grid' | 'table'>(() => {
        if (typeof window === 'undefined') return 'grid';
        return window.localStorage.getItem(VIEW_STORAGE_KEY) === 'table' ? 'table' : 'grid';
    });
    const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
    const [bulkBusy, setBulkBusy] = useState(false);
    const [syncingId, setSyncingId] = useState<number | null>(null);
    const [editingTeam, setEditingTeam] = useState<Team | null>(null);
    const [teamToDelete, setTeamToDelete] = useState<Team | null>(null);
    const [wizardOpen, setWizardOpen] = useState(false);
    const [wizardSource, setWizardSource] = useState<'frb' | undefined>(undefined);

    const { toasts, showToast, dismissToast } = useToasts();
    const {
        filters, setFilter, resetFilters, filteredTeams,
        activeFilterCount, sort, setSort, toggleSort, counts, availableLevels,
    } = useTeamFilters(teams);

    // Pending soft-deletes: team is hidden immediately; the real API call fires
    // after the undo window elapses so "Anulează" can fully restore it.
    const pendingDeletes = useRef<Map<number, { team: Team; timer: ReturnType<typeof setTimeout> }>>(new Map());

    useEffect(() => {
        void loadAll();
        // On unmount, commit any deletes still in their undo window.
        return () => {
            pendingDeletes.current.forEach(({ team, timer }) => {
                clearTimeout(timer);
                void teamsApi.deleteTeam(team.id).catch(() => {});
            });
            pendingDeletes.current.clear();
        };
    }, []);

    useEffect(() => {
        if (typeof window !== 'undefined') window.localStorage.setItem(VIEW_STORAGE_KEY, view);
    }, [view]);

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
            showToast({ variant: 'error', message: 'Nu s-au putut încărca echipele. Reîncearcă.' });
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

    const allFilteredSelected = filteredTeams.length > 0 && filteredTeams.every((t) => selectedIds.has(t.id));

    const toggleSelectAll = () => {
        setSelectedIds((prev) => {
            if (allFilteredSelected) {
                const next = new Set(prev);
                filteredTeams.forEach((t) => next.delete(t.id));
                return next;
            }
            const next = new Set(prev);
            filteredTeams.forEach((t) => next.add(t.id));
            return next;
        });
    };

    const openTeam = (id: number) => router.push(`/admin/team/${id}` as any);
    const openSchedule = (teamId: number) => router.push(`/admin/schedule?teamId=${teamId}` as any);

    // ---- Delete with undo -------------------------------------------------
    const commitDelete = async (id: number) => {
        const entry = pendingDeletes.current.get(id);
        if (!entry) return;
        pendingDeletes.current.delete(id);
        try {
            await teamsApi.deleteTeam(id);
        } catch (e) {
            // Restore on failure so the admin doesn't lose a team silently.
            setTeams((prev) => (prev.some((t) => t.id === id) ? prev : [...prev, entry.team]));
            showToast({ variant: 'error', message: e instanceof Error ? e.message : 'Nu s-a putut șterge echipa.' });
        }
    };

    const undoDelete = (id: number) => {
        const entry = pendingDeletes.current.get(id);
        if (!entry) return;
        clearTimeout(entry.timer);
        pendingDeletes.current.delete(id);
        setTeams((prev) => (prev.some((t) => t.id === id) ? prev : [...prev, entry.team]));
    };

    const performDelete = (team: Team) => {
        setTeams((prev) => prev.filter((t) => t.id !== team.id));
        setSelectedIds((prev) => {
            const next = new Set(prev);
            next.delete(team.id);
            return next;
        });
        const timer = setTimeout(() => void commitDelete(team.id), 5000);
        pendingDeletes.current.set(team.id, { team, timer });
        showToast({
            variant: 'info',
            message: `Echipa „${team.name}” a fost ștearsă.`,
            duration: 5000,
            action: { label: 'Anulează', onPress: () => undoDelete(team.id) },
        });
    };

    const confirmDelete = () => {
        if (!teamToDelete) return;
        performDelete(teamToDelete);
        setTeamToDelete(null);
    };

    // ---- Single FRB sync --------------------------------------------------
    const handleSyncTeam = async (team: Team) => {
        setSyncingId(team.id);
        try {
            const updated = await syncFrbTeam(team);
            if (updated) {
                setTeams((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
                showToast({ variant: 'success', message: `„${team.name}” a fost actualizată din FRB.` });
            } else {
                showToast({ variant: 'info', message: `„${team.name}” este deja la zi cu FRB.` });
            }
        } catch (e) {
            console.error('FRB sync failed', e);
            showToast({ variant: 'error', message: 'Sincronizarea din FRB a eșuat.' });
        } finally {
            setSyncingId(null);
        }
    };

    // ---- Bulk actions -----------------------------------------------------
    async function runBulkUpdate(ids: number[], updater: (id: number) => Promise<Team>, successMsg: (n: number) => string) {
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
                showToast({ variant: 'success', message: successMsg(succeeded.length) });
            }
            if (failed > 0) {
                showToast({ variant: 'error', message: `${failed} ${failed === 1 ? 'echipă nu a putut fi actualizată' : 'echipe nu au putut fi actualizate'}.` });
            }
        } finally {
            setBulkBusy(false);
            clearSelection();
        }
    }

    const handleBulkArchive = () => runBulkUpdate(
        Array.from(selectedIds),
        (id) => teamsApi.updateTeam(id, { isActive: false }),
        (n) => `${n} ${n === 1 ? 'echipă arhivată' : 'echipe arhivate'}.`,
    );
    const handleBulkActivate = () => runBulkUpdate(
        Array.from(selectedIds),
        (id) => teamsApi.updateTeam(id, { isActive: true }),
        (n) => `${n} ${n === 1 ? 'echipă activată' : 'echipe activate'}.`,
    );
    const handleBulkReassignCoach = (coachId: number) => runBulkUpdate(
        Array.from(selectedIds),
        (id) => teamsApi.updateTeam(id, { coachId }),
        (n) => `Antrenor schimbat pentru ${n} ${n === 1 ? 'echipă' : 'echipe'}.`,
    );

    const handleBulkSyncFrb = async () => {
        const targets = teams.filter((t) => selectedIds.has(t.id) && isFrbTeam(t));
        if (targets.length === 0) {
            showToast({ variant: 'error', message: 'Selecția nu conține echipe importate din FRB.' });
            return;
        }

        setBulkBusy(true);
        try {
            const results = await Promise.allSettled(targets.map((t) => syncFrbTeam(t)));
            const updates: Team[] = [];
            results.forEach((r) => {
                if (r.status === 'fulfilled' && r.value) updates.push(r.value);
            });
            if (updates.length > 0) {
                setTeams((prev) => prev.map((t) => updates.find((u) => u.id === t.id) ?? t));
                showToast({ variant: 'success', message: `${updates.length} ${updates.length === 1 ? 'echipă actualizată' : 'echipe actualizate'} din FRB.` });
            } else {
                showToast({ variant: 'info', message: 'Toate echipele selectate sunt deja la zi cu FRB.' });
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
        showToast({ variant: 'success', message: `${targets.length} ${targets.length === 1 ? 'echipă exportată' : 'echipe exportate'} în CSV.` });
    };

    const openWizard = (source?: 'frb') => {
        setWizardSource(source);
        setWizardOpen(true);
    };

    const handleTeamCreated = (team: Team) => {
        setTeams((prev) => [...prev, team]);
        setWizardOpen(false);
    };

    const selectAllLabel = useMemo(
        () => (allFilteredSelected ? 'Deselectează tot' : 'Selectează tot'),
        [allFilteredSelected],
    );

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
                            <RefreshCw size={14} color="var(--c-brand-fg)" />
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
                    <MyClubSkeleton />
                ) : teams.length === 0 ? (
                    <NoTeamsEmptyState onImport={() => openWizard('frb')} onCreate={() => openWizard()} />
                ) : (
                    <>
                        <MyClubKpiStrip teams={teams} />

                        <TeamFiltersBar
                            filters={filters}
                            setFilter={setFilter}
                            coaches={coaches}
                            view={view}
                            onViewChange={setView}
                            activeFilterCount={activeFilterCount}
                            onReset={resetFilters}
                            sort={sort}
                            setSort={setSort}
                            counts={counts}
                            availableLevels={availableLevels}
                        />

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

                        <View className="flex-row items-center justify-between gap-3 mb-3">
                            <Text className="text-[12px] font-bold text-[#64748B]">{filteredTeams.length} din {teams.length} echipe</Text>
                            {filteredTeams.length > 0 && (
                                <Pressable onPress={toggleSelectAll} className="flex-row items-center gap-2 px-1 py-1">
                                    <ThemedCheckbox checked={allFilteredSelected} onToggle={toggleSelectAll} ariaLabel={selectAllLabel} size={17} />
                                    <Text className="text-[12px] font-bold text-[#475569]">{selectAllLabel}</Text>
                                </Pressable>
                            )}
                        </View>

                        {filteredTeams.length === 0 ? (
                            <NoResultsEmptyState onReset={resetFilters} />
                        ) : view === 'grid' ? (
                            <View className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 w-full">
                                {filteredTeams.map((team) => (
                                    <TeamCard
                                        key={team.id}
                                        team={team}
                                        selected={selectedIds.has(team.id)}
                                        deleting={false}
                                        syncing={syncingId === team.id}
                                        onToggleSelect={() => toggleSelect(team.id)}
                                        onOpen={() => openTeam(team.id)}
                                        onEdit={() => setEditingTeam(team)}
                                        onSchedule={() => openSchedule(team.id)}
                                        onSync={() => handleSyncTeam(team)}
                                        onDelete={() => setTeamToDelete(team)}
                                    />
                                ))}
                            </View>
                        ) : (
                            <TeamTable
                                teams={filteredTeams}
                                selectedIds={selectedIds}
                                deletingId={null}
                                sort={sort}
                                onToggleSort={toggleSort}
                                allSelected={allFilteredSelected}
                                onToggleSelectAll={toggleSelectAll}
                                onToggleSelect={toggleSelect}
                                onOpen={openTeam}
                                onEdit={(team) => setEditingTeam(team)}
                                onSchedule={openSchedule}
                                onDelete={(team) => setTeamToDelete(team)}
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

            <ConfirmDialog
                visible={teamToDelete !== null}
                title="Ștergi echipa?"
                message={teamToDelete ? `„${teamToDelete.name}” va fi ștearsă. Vei avea câteva secunde să anulezi.` : undefined}
                confirmLabel="Șterge"
                cancelLabel="Renunță"
                destructive
                onConfirm={confirmDelete}
                onCancel={() => setTeamToDelete(null)}
            />

            <ToastHost toasts={toasts} onDismiss={dismissToast} />
        </View>
    );
}
