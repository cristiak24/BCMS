import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, ActivityIndicator, Alert, Modal, Platform } from '@/src/web/reactNative';
import { MaterialIcons } from '@/src/web/expoVectorIcons';
import * as DocumentPicker from '@/src/web/documentPicker';
import { financeApi, FinancialSettings, FinancialDocument, StripeAdminConfig, AdminRecentPayment } from '../../../services/financeApi';
import { documentsApi } from '../../../services/documentsApi';
import { teamsApi, Team } from '../../../services/teamsApi';
import { basketballApi, Match } from '../../../services/basketballApi';
import { eventsApi, CalendarEvent } from '../../../services/eventsApi';
import { useResponsive } from '../../../hooks/useResponsive';
import { resolveDocumentUrl } from '../../../config/serverUrl';
import AdminHero from '../../../components/admin/AdminHero';
import StatCard from '../../../components/dashboard/StatCard';
import { EmptyState, SkeletonBlock } from '../../../components/dashboard/ScreenStates';
import { dash } from '../../../components/dashboard/dashboardTheme';

/* ─── Types for Finances tab ────────────────────────────────────── */
type AccountingStatus = 'pending' | 'approved' | 'rejected';

type UploadEntry = {
    id: number;
    label: string;
    type: 'expense' | 'invoice';
    fileName: string;
    amount: number;
    documentUrl: string | null;
    uploadedAt: Date;
    accountingStatus: AccountingStatus;
    accountingNote?: string;
};

type UploadModalState = {
    visible: boolean;
    docType: 'expense' | 'invoice';
    file: any;
    amount: string;
    description: string;
    submitting: boolean;
};

const EMPTY_UPLOAD_MODAL: UploadModalState = {
    visible: false,
    docType: 'expense',
    file: null,
    amount: '',
    description: '',
    submitting: false,
};

/* ─── Status meta helper ────────────────────────────────────────── */
const STATUS_META: Record<AccountingStatus, { label: string; fg: string; bg: string; icon: keyof typeof MaterialIcons.glyphMap }> = {
    pending: { label: 'În așteptare', fg: dash.warningDeep, bg: 'rgba(245,158,11,0.12)', icon: 'schedule' },
    approved: { label: 'Aprobat', fg: dash.successDeep, bg: 'rgba(16,185,129,0.12)', icon: 'check-circle' },
    rejected: { label: 'Respins', fg: dash.dangerDeep, bg: 'rgba(239,68,68,0.1)', icon: 'warning-amber' },
};

const DOC_FILTERS: { key: 'all' | AccountingStatus; label: string }[] = [
    { key: 'all', label: 'Toate' },
    { key: 'pending', label: 'În așteptare' },
    { key: 'approved', label: 'Aprobate' },
    { key: 'rejected', label: 'Respinse' },
];

function mapFinancialDocuments(documents: FinancialDocument[]): UploadEntry[] {
    return documents.map((document) => ({
        id: document.id,
        label: document.description || `Document #${document.id}`,
        type: document.type === 'Invoice' ? 'invoice' : 'expense',
        fileName: document.documentUrl?.split('/').pop() || 'fișier',
        amount: Number(document.amount) || 0,
        documentUrl: document.documentUrl,
        uploadedAt: new Date(document.date),
        accountingStatus: document.status === 'processed'
            ? 'approved'
            : document.status === 'rejected'
                ? 'rejected'
                : 'pending',
        accountingNote: document.status === 'processed'
            ? 'Aprobat de contabilitate'
            : document.status === 'rejected'
                ? 'Respins - vă rugăm reîncărcați'
                : 'În curs de verificare',
    }));
}

function formatCurrency(amount: number, currency = 'ron') {
    try {
        return new Intl.NumberFormat(currency.toLowerCase() === 'ron' ? 'ro-RO' : 'en-US', {
            style: 'currency',
            currency: currency.toUpperCase(),
            minimumFractionDigits: 2,
        }).format(amount);
    } catch {
        return `${amount.toFixed(2)} ${currency.toUpperCase()}`;
    }
}

function formatPaymentDate(value: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return value;
    }

    return new Intl.DateTimeFormat('ro-RO', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
    }).format(date);
}

function normalizeTeamName(name: string) {
    return name.toLowerCase().replace(/\s+/g, ' ').trim();
}

function parseMatchDateTime(match: Match): Date | null {
    if (!match.date) return null;
    const parts = match.date.split('.');
    if (parts.length !== 3) return null;
    const [day, month, year] = parts.map(Number);
    if (!Number.isFinite(day) || !Number.isFinite(month) || !Number.isFinite(year)) return null;

    const date = new Date(year, month - 1, day);
    if (match.time && /^\d{1,2}:\d{2}$/.test(match.time)) {
        const [hours, minutes] = match.time.split(':').map(Number);
        date.setHours(hours, minutes, 0, 0);
    } else {
        date.setHours(23, 59, 59, 999);
    }

    return date;
}

function getMatchOpponent(match: Match, teamName: string) {
    const normalizedTeamName = normalizeTeamName(teamName);
    if (normalizeTeamName(match.homeTeam) === normalizedTeamName) {
        return match.awayTeam;
    }

    if (normalizeTeamName(match.awayTeam) === normalizedTeamName) {
        return match.homeTeam;
    }

    return match.awayTeam || match.homeTeam || 'Adversar necunoscut';
}

function parseInternalMatchDate(event: CalendarEvent): Date | null {
    const date = new Date(event.startTime);
    return Number.isNaN(date.getTime()) ? null : date;
}

function getInternalMatchOpponent(event: CalendarEvent, teamName: string) {
    const normalizedTeamName = normalizeTeamName(teamName);
    const parts = event.title.split(/\s+vs\.?\s+|\s+@\s+|\s+-\s+/i).map((part) => part.trim()).filter(Boolean);

    if (parts.length >= 2) {
        if (normalizeTeamName(parts[0]) === normalizedTeamName) {
            return parts.slice(1).join(' vs ');
        }

        if (normalizeTeamName(parts[1]) === normalizedTeamName) {
            return parts[0];
        }
    }

    return event.description?.trim() || event.title || 'Adversar necunoscut';
}

type MatchSelectionItem = {
    id: string;
    source: 'frb' | 'internal';
    label: string;
    opponent: string;
    dateLabel: string;
    sortTimestamp: number;
    matchTitle: string;
    frbMatch?: Match;
    internalMatch?: CalendarEvent;
};

function getMatchSelectionTitle(item: MatchSelectionItem) {
    return item.source === 'frb' && item.frbMatch
        ? `${item.frbMatch.homeTeam} vs ${item.frbMatch.awayTeam}`
        : item.matchTitle;
}

/* ─── Shared visual primitives ──────────────────────────────────── */
const cardStyle = { backgroundColor: dash.surface, borderColor: dash.hairline, ...dash.shadow.card };

function SectionHeader({ icon, iconBg, iconFg, title, subtitle }: {
    icon: keyof typeof MaterialIcons.glyphMap;
    iconBg: string;
    iconFg: string;
    title: string;
    subtitle: string;
}) {
    return (
        <View className="flex-row items-center mb-6">
            <View className="w-11 h-11 rounded-[14px] items-center justify-center mr-3.5" style={{ backgroundColor: iconBg }}>
                <MaterialIcons name={icon} size={20} color={iconFg} />
            </View>
            <View className="flex-1">
                <Text className="text-[18px] font-bold" style={{ color: dash.ink }}>{title}</Text>
                <Text className="text-[12px] font-medium mt-0.5" style={{ color: dash.muted }}>{subtitle}</Text>
            </View>
        </View>
    );
}

function ModalShell({ visible, onClose, children, maxWidth = 420 }: {
    visible: boolean;
    onClose: () => void;
    children: React.ReactNode;
    maxWidth?: number;
}) {
    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
            <Pressable
                className="flex-1 items-center justify-center p-4"
                style={{ backgroundColor: 'rgba(10,15,28,0.5)' }}
                onPress={onClose}
            >
                <Pressable
                    className="w-full rounded-[24px] p-6 border dash-fade-in"
                    style={{ maxWidth, maxHeight: '90vh', overflowY: 'auto', backgroundColor: dash.surface, borderColor: dash.hairline, ...dash.shadow.lift } as any}
                    onPress={(event: any) => event.stopPropagation()}
                >
                    {children}
                </Pressable>
            </Pressable>
        </Modal>
    );
}

export default function FinancialSettingsPage() {
    const { isMobile } = useResponsive();
    const [activeTab, setActiveTab] = useState('Configuration');

    /* ─── Settings state ───────────────────────────────────────── */
    const [settings, setSettings] = useState<FinancialSettings | null>(null);
    const [loadingSettings, setLoadingSettings] = useState(true);
    const [loadingDocuments, setLoadingDocuments] = useState(true);
    const [loadingTeams, setLoadingTeams] = useState(true);
    const [loadingL12Archive, setLoadingL12Archive] = useState(true);

    /* ─── L12 state ────────────────────────────────────────────── */
    const [teams, setTeams] = useState<Team[]>([]);
    const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
    const [teamModalVisible, setTeamModalVisible] = useState(false);
    const [matches, setMatches] = useState<MatchSelectionItem[]>([]);
    const [selectedMatch, setSelectedMatch] = useState<MatchSelectionItem | null>(null);
    const [matchModalVisible, setMatchModalVisible] = useState(false);
    const [players, setPlayers] = useState<any[]>([]);
    const [selectedPlayers, setSelectedPlayers] = useState<number[]>([]);
    const [playerModalVisible, setPlayerModalVisible] = useState(false);
    const [generatingL12, setGeneratingL12] = useState(false);
    const [l12Archive, setL12Archive] = useState<any[]>([]);

    /* ─── Finances tab state ───────────────────────────────────── */
    const [monthlyFeeInput, setMonthlyFeeInput] = useState('');
    const [editingFee, setEditingFee] = useState(false);
    const [savingFee, setSavingFee] = useState(false);
    const [stripeConfig, setStripeConfig] = useState<StripeAdminConfig | null>(null);
    const [recentPayments, setRecentPayments] = useState<AdminRecentPayment[]>([]);
    const [loadingStripeConfig, setLoadingStripeConfig] = useState(false);
    const [loadingRecentPayments, setLoadingRecentPayments] = useState(false);
    const [hasLoadedFinanceMeta, setHasLoadedFinanceMeta] = useState(false);
    const [uploads, setUploads] = useState<UploadEntry[]>([]);
    const [pickingFile, setPickingFile] = useState<'expense' | 'invoice' | null>(null);
    const [uploadModal, setUploadModal] = useState<UploadModalState>(EMPTY_UPLOAD_MODAL);
    const [documentFilter, setDocumentFilter] = useState<'all' | AccountingStatus>('all');
    const [documentSearch, setDocumentSearch] = useState('');
    const [updatingDocId, setUpdatingDocId] = useState<number | null>(null);

    /* ─── Load data ────────────────────────────────────────────── */
    const loadDocuments = useCallback(() => {
        setLoadingDocuments(true);
        return financeApi.getDocuments()
            .then((documentsResponse) => setUploads(mapFinancialDocuments(documentsResponse)))
            .catch((error) => console.error('Failed to load financial documents:', error))
            .finally(() => setLoadingDocuments(false));
    }, []);

    const loadData = useCallback(() => {
        setLoadingSettings(true);
        setLoadingTeams(true);
        setLoadingL12Archive(true);

        void loadDocuments();

        void financeApi.getSettings()
            .then((settingsResponse) => {
                setSettings(settingsResponse);
                setMonthlyFeeInput(String(settingsResponse.monthlyPlayerFee || 0));
            })
            .catch((error) => console.error('Failed to load financial settings:', error))
            .finally(() => setLoadingSettings(false));

        void teamsApi.getTeams()
            .then(setTeams)
            .catch((error) => console.error('Failed to load finance teams:', error))
            .finally(() => setLoadingTeams(false));

        void documentsApi.getL12Archive()
            .then(setL12Archive)
            .catch((error) => {
                console.error('Failed to load L12 archive:', error);
                setL12Archive([]);
            })
            .finally(() => setLoadingL12Archive(false));
    }, [loadDocuments]);

    useEffect(() => { loadData(); }, [loadData]);

    const loadFinanceMeta = useCallback(async () => {
        if (hasLoadedFinanceMeta) {
            return;
        }

        setHasLoadedFinanceMeta(true);
        setLoadingStripeConfig(true);
        setLoadingRecentPayments(true);

        const [stripeResult, paymentsResult] = await Promise.allSettled([
            financeApi.getStripeConfig(),
            financeApi.getAdminRecentPayments(12),
        ]);

        if (stripeResult.status === 'fulfilled') {
            setStripeConfig(stripeResult.value);
        } else {
            console.error('Failed to load Stripe config:', stripeResult.reason);
        }

        if (paymentsResult.status === 'fulfilled') {
            setRecentPayments(paymentsResult.value);
        } else {
            console.error('Failed to load recent payments:', paymentsResult.reason);
        }

        setLoadingStripeConfig(false);
        setLoadingRecentPayments(false);
    }, [hasLoadedFinanceMeta]);

    useEffect(() => {
        if (activeTab === 'Finances' || activeTab === 'Payment Gateways') {
            void loadFinanceMeta();
        }
    }, [activeTab, loadFinanceMeta]);

    /* ─── Derived stats (memoized so they don't recompute every render) */
    const financeStats = useMemo(() => {
        const pendingDocs = uploads.filter((u) => u.accountingStatus === 'pending');
        const approvedDocs = uploads.filter((u) => u.accountingStatus === 'approved');
        const collectedAmount = recentPayments
            .filter((p) => ['paid', 'processed', 'succeeded', 'success'].includes(p.status.toLowerCase()))
            .reduce((sum, p) => sum + p.amount, 0);

        return {
            pendingCount: pendingDocs.length,
            pendingAmount: pendingDocs.reduce((sum, u) => sum + u.amount, 0),
            approvedAmount: approvedDocs.reduce((sum, u) => sum + u.amount, 0),
            collectedAmount,
        };
    }, [uploads, recentPayments]);

    const filteredUploads = useMemo(() => {
        const query = documentSearch.trim().toLowerCase();
        return uploads.filter((entry) => {
            if (documentFilter !== 'all' && entry.accountingStatus !== documentFilter) return false;
            if (query && !entry.label.toLowerCase().includes(query) && !entry.fileName.toLowerCase().includes(query)) return false;
            return true;
        });
    }, [uploads, documentFilter, documentSearch]);

    /* ─── Team / Match / Player handlers (L12) ─────────────────── */
    const handleTeamSelect = async (t: Team) => {
        setSelectedTeam(t);
        setTeamModalVisible(false);
        setSelectedMatch(null);
        try {
            const now = new Date();
            const monthsToFetch = [0, 1, 2].map((offset) => ((now.getMonth() + offset) % 12) + 1);

            const [pls, frbMonthMatches, internalMatches, ...extraFrbMonths] = await Promise.all([
                teamsApi.getTeamPlayers(t.id),
                basketballApi.getMatches(t.frbLeagueId, t.frbSeasonId, t.frbTeamId, monthsToFetch[0]),
                eventsApi.getEvents({ teamId: t.id, type: 'match' })
                ,
                ...monthsToFetch.slice(1).map((month) =>
                    basketballApi.getMatches(t.frbLeagueId, t.frbSeasonId, t.frbTeamId, month)
                ),
            ]);
            setPlayers(pls);
            setSelectedPlayers(pls.slice(0, 12).map((p: any) => p.id));

            const frbMatches = [frbMonthMatches, ...extraFrbMonths].flat();
            const nowTs = now.getTime();
            const frbItems: MatchSelectionItem[] = frbMatches.flatMap((match) => {
                const dateTime = parseMatchDateTime(match);
                if (!dateTime || dateTime.getTime() < nowTs) return [];

                const opponent = getMatchOpponent(match, t.name);
                return [{
                    id: `frb-${match.date}-${match.time}-${match.homeTeam}-${match.awayTeam}`,
                    source: 'frb' as const,
                    label: `FRB • ${dateTime.toLocaleDateString('ro-RO')} - ${opponent}`,
                    opponent,
                    dateLabel: dateTime.toLocaleString('ro-RO'),
                    sortTimestamp: dateTime.getTime(),
                    matchTitle: `${match.homeTeam} vs ${match.awayTeam}`,
                    frbMatch: match,
                }];
            });

            const internalItems: MatchSelectionItem[] = internalMatches.flatMap((event) => {
                const dateTime = parseInternalMatchDate(event);
                if (!dateTime || dateTime.getTime() < nowTs) return [];

                const opponent = getInternalMatchOpponent(event, t.name);
                return [{
                    id: `internal-${event.id}`,
                    source: 'internal' as const,
                    label: `Site • ${dateTime.toLocaleDateString('ro-RO')} - ${opponent}`,
                    opponent,
                    dateLabel: dateTime.toLocaleString('ro-RO'),
                    sortTimestamp: dateTime.getTime(),
                    matchTitle: event.title,
                    internalMatch: event,
                }];
            });

            const combined = [...frbItems, ...internalItems]
                .sort((a, b) => a.sortTimestamp - b.sortTimestamp || a.label.localeCompare(b.label));

            const deduped = Array.from(new Map(
                combined.map((item) => [
                    `${Math.floor(item.sortTimestamp / 1000)}|${normalizeTeamName(item.opponent)}`,
                    item,
                ])
            ).values());

            setMatches(deduped);
        } catch {
            Alert.alert('Eroare', 'Nu s-au putut încărca datele echipei.');
        }
    };

    const togglePlayer = (pId: number) => {
        if (selectedPlayers.includes(pId)) {
            setSelectedPlayers(selectedPlayers.filter(id => id !== pId));
        } else {
            if (selectedPlayers.length >= 12) {
                Alert.alert('Limită', 'Poți selecta maxim 12 jucători pentru foaia de meci.');
                return;
            }
            setSelectedPlayers([...selectedPlayers, pId]);
        }
    };

    const handleGenerateL12 = async () => {
        if (!selectedTeam) { Alert.alert('Eroare', 'Te rugăm să selectezi o echipă.'); return; }
        if (!selectedMatch) { Alert.alert('Eroare', 'Te rugăm să selectezi un meci.'); return; }
        if (selectedPlayers.length === 0) { Alert.alert('Eroare', 'Te rugăm să selectezi cel puțin un jucător (max 12).'); return; }

        const finalPlayers = players.filter(p => selectedPlayers.includes(p.id));
        try {
            setGeneratingL12(true);
            await documentsApi.generateL12AndShare(
                selectedTeam.id.toString(),
                {
                    opponent: selectedMatch.opponent,
                    date: selectedMatch.dateLabel,
                    competition: selectedTeam.leagueName
                },
                finalPlayers
            );
            const newArchive = await documentsApi.getL12Archive().catch(() => []);
            setL12Archive(newArchive);
        } catch {
            Alert.alert('Eroare', 'A apărut o eroare la generarea PDF-ului.');
        } finally {
            setGeneratingL12(false);
        }
    };

    /* ─── Finances handlers ────────────────────────────────────── */
    const handleSaveMonthlyFee = async () => {
        const val = parseFloat(monthlyFeeInput);
        if (isNaN(val) || val < 0) {
            Alert.alert('Eroare', 'Introduceți o valoare validă pentru cotizație.');
            return;
        }
        setSavingFee(true);
        try {
            await financeApi.updateSettings({ monthlyPlayerFee: val });
            setSettings(prev => prev ? { ...prev, monthlyPlayerFee: val } : prev);
            setEditingFee(false);
            Alert.alert('Succes', `Cotizația lunară a fost actualizată la ${val} RON.`);
        } catch {
            Alert.alert('Eroare', 'Nu s-a putut actualiza cotizația.');
        } finally {
            setSavingFee(false);
        }
    };

    const handleStartUpload = async (docType: 'expense' | 'invoice') => {
        setPickingFile(docType);
        try {
            const result = await DocumentPicker.getDocumentAsync({
                type: ['image/*', 'application/pdf'],
                copyToCacheDirectory: true,
            });
            if (result.canceled) return;

            const file = result.assets[0];
            const typeLabel = docType === 'expense' ? 'Expense' : 'Invoice';
            setUploadModal({
                visible: true,
                docType,
                file,
                amount: '',
                description: `${typeLabel} – ${file.name}`,
                submitting: false,
            });
        } catch (error) {
            console.error('Error picking document', error);
            Alert.alert('Eroare', 'Nu am putut selecta fișierul.');
        } finally {
            setPickingFile(null);
        }
    };

    const closeUploadModal = () => {
        if (uploadModal.submitting) return;
        setUploadModal(EMPTY_UPLOAD_MODAL);
    };

    const handleConfirmUpload = async () => {
        if (!uploadModal.file) return;
        const amountValue = parseFloat(uploadModal.amount.replace(',', '.'));
        if (!Number.isFinite(amountValue) || amountValue < 0) {
            Alert.alert('Eroare', 'Introduceți o sumă validă (0 sau mai mare).');
            return;
        }

        setUploadModal((prev) => ({ ...prev, submitting: true }));
        try {
            const typeLabel = uploadModal.docType === 'expense' ? 'Expense' : 'Invoice';
            const file = uploadModal.file;
            await financeApi.uploadDocument(
                (file as any).file ?? file.uri,
                file.mimeType || 'application/octet-stream',
                file.name,
                typeLabel,
                String(amountValue),
                uploadModal.description.trim() || `${typeLabel} – ${file.name}`
            );

            await loadDocuments();
            setUploadModal(EMPTY_UPLOAD_MODAL);
            Alert.alert('Succes', `${typeLabel === 'Expense' ? 'Cheltuiala' : 'Factura'} a fost încărcată cu succes.`);
        } catch (error) {
            console.error('Error uploading document', error);
            Alert.alert('Eroare', 'Nu am putut încărca documentul.');
            setUploadModal((prev) => ({ ...prev, submitting: false }));
        }
    };

    const handleUpdateDocumentStatus = async (id: number, status: 'processed' | 'rejected') => {
        setUpdatingDocId(id);
        try {
            await financeApi.updateDocumentStatus(id, status);
            setUploads((prev) => prev.map((entry) => entry.id === id
                ? {
                    ...entry,
                    accountingStatus: status === 'processed' ? 'approved' : 'rejected',
                    accountingNote: status === 'processed' ? 'Aprobat de contabilitate' : 'Respins - vă rugăm reîncărcați',
                }
                : entry));
        } catch (error) {
            console.error('Failed to update document status:', error);
            Alert.alert('Eroare', 'Nu am putut actualiza statusul documentului.');
        } finally {
            setUpdatingDocId(null);
        }
    };

    const openDocumentUrl = (documentUrl: string | null) => {
        const url = resolveDocumentUrl(documentUrl);
        if (Platform.OS === 'web' && url) {
            window.open(url, '_blank');
        } else {
            Alert.alert('Info', 'Folosiți interfața web pentru a descărca documentul.');
        }
    };

    /* ═══════════════════════════════════════════════════════════════
       RENDER
       ═══════════════════════════════════════════════════════════════ */
    const TABS = ['Configuration', 'Finances', 'Payment Gateways'];

    return (
        <ScrollView
            className="flex-1 px-4 md:px-10 pt-5 md:pt-8"
            style={{ backgroundColor: dash.bg }}
            contentContainerStyle={{ paddingBottom: isMobile ? 156 : 72 }}
            showsVerticalScrollIndicator={false}
        >

            {/* ──────────── HEADER + TABS ──────────── */}
            <AdminHero
                title="Financial Settings"
                subtitle="Club billing, payments, documents, and L12 exports."
                className={`${isMobile ? 'gap-5' : 'flex-row items-end justify-between'} mb-6`}
            >
                <View className={`gap-2 bg-white/10 border border-white/20 rounded-[18px] p-1 ${isMobile ? 'flex-row flex-wrap self-start' : 'flex-row'}`}>
                    {TABS.map(tab => (
                        <Pressable key={tab} onPress={() => setActiveTab(tab)} className={`relative rounded-[14px] px-4 py-2 ${activeTab === tab ? 'bg-white' : ''}`}>
                            <Text className={`text-[13px] font-black ${activeTab === tab ? 'text-[#123A97]' : 'text-[#D6E6FF]'}`}>{tab}</Text>
                        </Pressable>
                    ))}
                </View>
            </AdminHero>

            {/* ═══════════════════════════════════════════════════════
               TAB: Configuration – Only L12 Player List card
               ═══════════════════════════════════════════════════════ */}
            {activeTab === 'Configuration' && (
                <View className="mb-20">

                    {/* ── L12 GENERATOR CARD ───────────────────────── */}
                    <View className={`rounded-[24px] ${isMobile ? 'p-5' : 'p-7'} border dash-fade-in mb-6 relative overflow-hidden`} style={cardStyle}>
                        <View pointerEvents="none" className="absolute top-0 left-0 right-0 h-[3px]" style={{ backgroundImage: 'linear-gradient(90deg, #635BFF, #2563EB)' } as any} />
                        <View className="flex-row justify-between items-start mb-6">
                            <SectionHeader
                                icon="sports-basketball"
                                iconBg="rgba(99,91,255,0.1)"
                                iconFg={dash.accent}
                                title="L12 Player List"
                                subtitle="Generation & validation module"
                            />
                            {!isMobile && (
                                <View pointerEvents="none" className="absolute right-0 top-0">
                                    <Text className="text-[56px] font-black italic" style={{ color: dash.lineSoft }}>L.12</Text>
                                </View>
                            )}
                        </View>

                        {/* Team & Match selectors */}
                        <View className={`gap-4 mb-6 ${isMobile ? '' : 'flex-row'}`}>
                            <View className="flex-1">
                                <Text className="font-bold text-[11px] uppercase tracking-wide mb-2 ml-1" style={{ color: dash.muted }}>Team Selection</Text>
                                <Pressable
                                    onPress={() => setTeamModalVisible(true)}
                                    disabled={loadingTeams}
                                    className="flex-row h-[50px] items-center px-4 rounded-[14px] border"
                                    style={{ backgroundColor: dash.lineSoft, borderColor: dash.hairline }}
                                >
                                    <Text className="font-bold flex-1" style={{ color: selectedTeam ? dash.ink : dash.faint }} numberOfLines={1}>
                                        {loadingTeams ? 'Loading teams...' : selectedTeam ? selectedTeam.name : 'Select a team...'}
                                    </Text>
                                    {loadingTeams ? <ActivityIndicator size="small" color={dash.accent} style={{ marginLeft: 10 }} /> : (
                                        <MaterialIcons name="chevron-right" size={18} color={dash.faint} />
                                    )}
                                </Pressable>
                            </View>
                            <View className="flex-1">
                                <Text className="font-bold text-[11px] uppercase tracking-wide mb-2 ml-1" style={{ color: dash.muted }}>Match Selection</Text>
                                <Pressable
                                    onPress={() => {
                                        if (!selectedTeam) Alert.alert('Atenție', 'Selectează echipa mai întâi.');
                                        else setMatchModalVisible(true);
                                    }}
                                    className="flex-row h-[50px] items-center px-4 rounded-[14px] border"
                                    style={{ backgroundColor: dash.lineSoft, borderColor: dash.hairline }}
                                >
                                    <Text className="font-bold flex-1" style={{ color: selectedMatch ? dash.ink : dash.faint }} numberOfLines={1}>
                                        {selectedMatch ? selectedMatch.label : 'Select a match...'}
                                    </Text>
                                    <MaterialIcons name="chevron-right" size={18} color={dash.faint} />
                                </Pressable>
                            </View>
                        </View>

                        {/* Player Selection Area */}
                        <View className="rounded-[18px] p-5 border" style={{ backgroundColor: dash.surfaceSubtle, borderColor: dash.hairline }}>
                            <Text className="font-black text-[11px] tracking-widest uppercase mb-4" style={{ color: dash.muted }}>
                                Active Selection ({selectedPlayers.length}/12)
                            </Text>
                            <View className="flex-row flex-wrap gap-2">
                                {players.filter(p => selectedPlayers.includes(p.id)).map(p => (
                                    <View key={p.id} className="px-4 py-2 rounded-full border flex-row items-center" style={{ backgroundColor: dash.surface, borderColor: dash.hairline, ...dash.shadow.sm }}>
                                        <View className="w-5 h-5 rounded-full mr-2" style={{ backgroundColor: dash.line }} />
                                        <Text className="font-bold text-sm" style={{ color: dash.ink }}>{p.firstName} {p.lastName}</Text>
                                        {p.number && <Text className="font-black text-xs ml-2" style={{ color: dash.accent }}>#{p.number}</Text>}
                                    </View>
                                ))}
                                {selectedTeam && (
                                    <Pressable
                                        onPress={() => setPlayerModalVisible(true)}
                                        className="px-4 py-2 rounded-full border border-dashed flex-row items-center"
                                        style={{ borderColor: dash.line, backgroundColor: dash.lineSoft }}
                                    >
                                        <MaterialIcons name="add" size={14} color={dash.muted} style={{ marginRight: 4 }} />
                                        <Text className="font-bold text-sm" style={{ color: dash.muted }}>Configure All Players</Text>
                                    </Pressable>
                                )}
                            </View>
                        </View>

                        {selectedTeam && (
                            <Pressable
                                onPress={handleGenerateL12}
                                disabled={generatingL12}
                                className={`mt-6 h-[50px] items-center justify-center rounded-full ${isMobile ? 'w-full' : 'w-[220px]'}`}
                                style={{ backgroundColor: dash.ink, ...dash.shadow.sm }}
                            >
                                {generatingL12
                                    ? <ActivityIndicator color="white" />
                                    : <Text className="text-white font-bold tracking-wide">Generate List</Text>
                                }
                            </Pressable>
                        )}
                    </View>

                    {/* ── L12 ARCHIVE CARD ──────────────────────────── */}
                    <View className={`rounded-[24px] ${isMobile ? 'p-5' : 'p-7'} border dash-fade-in`} style={cardStyle}>
                        <View className="flex-row justify-between items-start mb-6">
                            <SectionHeader
                                icon="receipt-long"
                                iconBg="rgba(37,99,235,0.1)"
                                iconFg={dash.accentBlue}
                                title="Generated L12 Archive"
                                subtitle="History of official lists"
                            />
                        </View>
                        <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
                            <View className="gap-3">
                                {loadingL12Archive ? (
                                    [0, 1, 2].map((i) => (
                                        <View key={i} className="p-4 rounded-[16px] border" style={{ borderColor: dash.hairline }}>
                                            <SkeletonBlock width="45%" height={12} className="mb-2" />
                                            <SkeletonBlock width="70%" height={16} />
                                        </View>
                                    ))
                                ) : l12Archive.length === 0 ? (
                                    <EmptyState title="Niciun document L12 generat" message="Documentele generate vor apărea aici." icon="event-busy" />
                                ) : (
                                    l12Archive.map((doc: any, idx: number) => (
                                        <View key={idx} className={`p-4 rounded-[16px] border ${isMobile ? 'gap-3' : 'flex-row justify-between items-center'}`} style={{ backgroundColor: dash.surfaceSubtle, borderColor: dash.hairline }}>
                                            <View className="flex-1">
                                                <Text className="font-bold mb-1" style={{ color: dash.ink }} numberOfLines={1}>{doc.matchTitle}</Text>
                                                <Text className="text-[11px] font-medium" style={{ color: dash.muted }}>{new Date(doc.createdAt).toLocaleString()}</Text>
                                            </View>
                                            <Pressable
                                                onPress={() => openDocumentUrl(doc.documentUrl)}
                                                className={`flex-row items-center gap-1.5 px-4 py-2 rounded-[12px] ${isMobile ? 'self-start' : ''}`}
                                                style={{ backgroundColor: 'rgba(37,99,235,0.08)' }}
                                            >
                                                <MaterialIcons name="file-download" size={14} color={dash.accentBlue} />
                                                <Text className="text-[12px] font-black uppercase tracking-wide" style={{ color: dash.accentBlue }}>Download</Text>
                                            </Pressable>
                                        </View>
                                    ))
                                )}
                            </View>
                        </ScrollView>
                    </View>
                </View>
            )}

            {/* ═══════════════════════════════════════════════════════
               TAB: Finances
               ═══════════════════════════════════════════════════════ */}
            {activeTab === 'Finances' && (
                <View className="mb-20">

                    {/* ── Overview KPI row ─────────────────────────── */}
                    <View className="flex-row flex-wrap gap-3 mb-6">
                        <StatCard
                            icon="account-balance-wallet"
                            label="Cotizație lunară"
                            value={loadingSettings ? '—' : `${settings?.monthlyPlayerFee ?? 0} RON`}
                            detail="per jucător / lună"
                            tone="purple"
                            loading={loadingSettings}
                        />
                        <StatCard
                            icon="payment"
                            label="Încasări recente"
                            value={loadingRecentPayments ? '—' : formatCurrency(financeStats.collectedAmount)}
                            detail={`${recentPayments.length} plăți încasate`}
                            tone="green"
                            loading={loadingRecentPayments}
                        />
                        <StatCard
                            icon="schedule"
                            label="Documente în așteptare"
                            value={loadingDocuments ? '—' : String(financeStats.pendingCount)}
                            detail={loadingDocuments ? undefined : formatCurrency(financeStats.pendingAmount)}
                            tone="orange"
                            loading={loadingDocuments}
                        />
                        <StatCard
                            icon="receipt-long"
                            label="Total documente"
                            value={loadingDocuments ? '—' : String(uploads.length)}
                            detail={loadingDocuments ? undefined : `${formatCurrency(financeStats.approvedAmount)} aprobat`}
                            tone="blue"
                            loading={loadingDocuments}
                        />
                    </View>

                    {/* ── Row: Monthly Fee + Upload ─────────────────── */}
                    <View className={`gap-6 mb-6 ${isMobile ? '' : 'flex-row'}`}>

                        {/* Monthly Fee Card */}
                        <View className={`flex-1 rounded-[24px] ${isMobile ? 'p-5' : 'p-7'} border dash-fade-in`} style={cardStyle}>
                            <SectionHeader
                                icon="account-balance-wallet"
                                iconBg="rgba(99,91,255,0.1)"
                                iconFg={dash.accent}
                                title="Cotizație Lunară"
                                subtitle="Gestionează taxa lunară per jucător"
                            />

                            <View className="rounded-[18px] p-5 border mb-4" style={{ backgroundColor: dash.surfaceSubtle, borderColor: dash.hairline }}>
                                <View className="flex-row justify-between items-center mb-4">
                                    <Text className="font-bold text-[11px] uppercase tracking-wider" style={{ color: dash.muted }}>Taxa curentă</Text>
                                    {!editingFee && (
                                        <Pressable onPress={() => setEditingFee(true)} className="flex-row items-center gap-1 px-3 py-1.5 rounded-[10px]" style={{ backgroundColor: 'rgba(99,91,255,0.08)' }}>
                                            <MaterialIcons name="edit" size={12} color={dash.accent} />
                                            <Text className="text-[12px] font-bold" style={{ color: dash.accent }}>Modifică</Text>
                                        </Pressable>
                                    )}
                                </View>

                                {editingFee ? (
                                    <View>
                                        <View className="flex-row items-center mb-4">
                                            <TextInput
                                                value={monthlyFeeInput}
                                                onChangeText={setMonthlyFeeInput}
                                                keyboardType="numeric"
                                                className="flex-1 rounded-[14px] h-[50px] px-4 text-[20px] font-black mr-3 border"
                                                style={{ backgroundColor: dash.surface, borderColor: dash.hairlineStrong, color: dash.ink }}
                                                placeholder="0"
                                                placeholderTextColor={dash.faint}
                                            />
                                            <Text className="text-[18px] font-bold" style={{ color: dash.faint }}>RON / lună</Text>
                                        </View>
                                        <View className="flex-row gap-3">
                                            <Pressable
                                                onPress={handleSaveMonthlyFee}
                                                disabled={savingFee}
                                                className="flex-1 h-[46px] rounded-[14px] items-center justify-center flex-row gap-1.5"
                                                style={{ backgroundColor: dash.ink }}
                                            >
                                                {savingFee
                                                    ? <ActivityIndicator color="white" size="small" />
                                                    : <><MaterialIcons name="save" size={14} color="#fff" /><Text className="text-white font-bold">Salvează</Text></>
                                                }
                                            </Pressable>
                                            <Pressable
                                                onPress={() => {
                                                    setEditingFee(false);
                                                    setMonthlyFeeInput(String(settings?.monthlyPlayerFee || 0));
                                                }}
                                                className="flex-1 h-[46px] rounded-[14px] items-center justify-center"
                                                style={{ backgroundColor: dash.lineSoft }}
                                            >
                                                <Text className="font-bold" style={{ color: dash.muted }}>Anulează</Text>
                                            </Pressable>
                                        </View>
                                    </View>
                                ) : (
                                    loadingSettings ? (
                                        <View className="flex-row items-center py-1">
                                            <SkeletonBlock width={140} height={40} />
                                        </View>
                                    ) : (
                                        <View className="flex-row items-end">
                                            <Text className="text-[40px] font-black leading-none" style={{ color: dash.ink }}>{settings?.monthlyPlayerFee || 0}</Text>
                                            <Text className="text-[18px] font-bold ml-2 mb-1" style={{ color: dash.faint }}>RON / lună</Text>
                                        </View>
                                    )
                                )}
                            </View>

                            <View className="flex-row items-center p-3 rounded-[14px]" style={{ backgroundColor: 'rgba(37,99,235,0.06)' }}>
                                <MaterialIcons name="info-outline" size={16} color={dash.accentBlue} style={{ marginRight: 8 }} />
                                <Text className="text-[12px] font-medium flex-1" style={{ color: dash.accentBlue }}>
                                    Modificarea se aplică pentru clubul tău și este folosită de toți jucătorii din echipele administrate.
                                </Text>
                            </View>
                        </View>

                        {/* Upload Actions Card */}
                        <View className={`flex-1 rounded-[24px] ${isMobile ? 'p-5' : 'p-7'} border dash-fade-in`} style={cardStyle}>
                            <SectionHeader
                                icon="receipt-long"
                                iconBg="rgba(245,158,11,0.12)"
                                iconFg={dash.warningDeep}
                                title="Încărcare Documente"
                                subtitle="Cheltuieli și facturi"
                            />

                            <View className={`gap-4 ${isMobile ? '' : 'flex-row'}`}>
                                <Pressable
                                    onPress={() => handleStartUpload('expense')}
                                    disabled={pickingFile === 'expense'}
                                    className="flex-1 rounded-[20px] border-2 border-dashed items-center justify-center py-8 px-4"
                                    style={{ backgroundColor: 'rgba(245,158,11,0.05)', borderColor: 'rgba(245,158,11,0.3)' }}
                                >
                                    {pickingFile === 'expense' ? (
                                        <ActivityIndicator size="small" color={dash.warningDeep} />
                                    ) : (
                                        <>
                                            <View className="w-14 h-14 rounded-[18px] items-center justify-center mb-3" style={{ backgroundColor: 'rgba(245,158,11,0.12)' }}>
                                                <MaterialIcons name="receipt-long" size={26} color={dash.warningDeep} />
                                            </View>
                                            <Text className="text-[15px] font-black mb-1" style={{ color: dash.ink }}>Cheltuieli</Text>
                                            <Text className="text-[12px] font-medium text-center" style={{ color: dash.faint }}>Încarcă bonuri sau chitanțe</Text>
                                        </>
                                    )}
                                </Pressable>

                                <Pressable
                                    onPress={() => handleStartUpload('invoice')}
                                    disabled={pickingFile === 'invoice'}
                                    className="flex-1 rounded-[20px] border-2 border-dashed items-center justify-center py-8 px-4"
                                    style={{ backgroundColor: 'rgba(37,99,235,0.05)', borderColor: 'rgba(37,99,235,0.25)' }}
                                >
                                    {pickingFile === 'invoice' ? (
                                        <ActivityIndicator size="small" color={dash.accentBlue} />
                                    ) : (
                                        <>
                                            <View className="w-14 h-14 rounded-[18px] items-center justify-center mb-3" style={{ backgroundColor: 'rgba(37,99,235,0.1)' }}>
                                                <MaterialIcons name="payment" size={26} color={dash.accentBlue} />
                                            </View>
                                            <Text className="text-[15px] font-black mb-1" style={{ color: dash.ink }}>Facturi</Text>
                                            <Text className="text-[12px] font-medium text-center" style={{ color: dash.faint }}>Încarcă facturi fiscale</Text>
                                        </>
                                    )}
                                </Pressable>
                            </View>
                        </View>
                    </View>

                    {/* ── Row: Documents Ledger + Recent Payments ──── */}
                    <View className={`gap-6 items-start ${isMobile ? '' : 'flex-row'}`}>

                        {/* Documents Ledger */}
                        <View className={`w-full rounded-[24px] ${isMobile ? 'p-5' : 'p-7'} border dash-fade-in ${isMobile ? '' : 'xl:flex-[3]'}`} style={cardStyle}>
                            <View className="flex-row items-start justify-between mb-5 flex-wrap gap-3">
                                <SectionHeader
                                    icon="receipt-long"
                                    iconBg="rgba(37,99,235,0.1)"
                                    iconFg={dash.accentBlue}
                                    title="Registru documente"
                                    subtitle="Cheltuieli și facturi transmise către contabilitate"
                                />
                            </View>

                            <View className="flex-row items-center gap-2 rounded-[12px] px-3 h-11 border mb-4" style={{ backgroundColor: dash.lineSoft, borderColor: dash.hairline }}>
                                <MaterialIcons name="search" size={16} color={dash.faint} />
                                <TextInput
                                    value={documentSearch}
                                    onChangeText={setDocumentSearch}
                                    placeholder="Caută document..."
                                    placeholderTextColor={dash.faint}
                                    className="text-[13px] font-medium flex-1"
                                    style={{ color: dash.ink }}
                                />
                                {documentSearch.length > 0 && (
                                    <Pressable onPress={() => setDocumentSearch('')}>
                                        <MaterialIcons name="close" size={16} color={dash.faint} />
                                    </Pressable>
                                )}
                            </View>

                            <View className="flex-row flex-wrap gap-2 mb-5">
                                {DOC_FILTERS.map((f) => {
                                    const active = documentFilter === f.key;
                                    const count = f.key === 'all' ? uploads.length : uploads.filter(u => u.accountingStatus === f.key).length;
                                    return (
                                        <Pressable
                                            key={f.key}
                                            onPress={() => setDocumentFilter(f.key)}
                                            className="flex-row items-center gap-1.5 px-3 py-1.5 rounded-full border"
                                            style={{
                                                backgroundColor: active ? 'rgba(99,91,255,0.08)' : dash.lineSoft,
                                                borderColor: active ? 'rgba(99,91,255,0.25)' : dash.hairline,
                                            }}
                                        >
                                            <Text className="text-[12px] font-bold" style={{ color: active ? dash.accent : dash.muted }}>{f.label}</Text>
                                            <View className="w-[18px] h-[18px] rounded-full items-center justify-center" style={{ backgroundColor: active ? dash.accent : dash.line }}>
                                                <Text className="text-[10px] font-bold" style={{ color: active ? '#fff' : dash.muted }}>{count}</Text>
                                            </View>
                                        </Pressable>
                                    );
                                })}
                            </View>

                            <ScrollView style={{ maxHeight: 520 }} showsVerticalScrollIndicator={false}>
                                {loadingDocuments ? (
                                    <View className="gap-3">
                                        {[0, 1, 2].map((i) => (
                                            <View key={i} className="p-4 rounded-[16px] border" style={{ borderColor: dash.hairline }}>
                                                <SkeletonBlock width="40%" height={12} className="mb-2" />
                                                <SkeletonBlock width="70%" height={16} />
                                            </View>
                                        ))}
                                    </View>
                                ) : filteredUploads.length === 0 ? (
                                    <EmptyState
                                        title="Niciun document găsit"
                                        message={documentSearch || documentFilter !== 'all' ? 'Încearcă alt filtru sau șterge căutarea.' : 'Documentele încărcate vor apărea aici.'}
                                        icon="receipt-long"
                                    />
                                ) : (
                                    <View className="gap-3">
                                        {filteredUploads.map((entry) => {
                                            const meta = STATUS_META[entry.accountingStatus];
                                            const isUpdating = updatingDocId === entry.id;
                                            return (
                                                <View key={entry.id} className="p-4 rounded-[16px] border" style={{ backgroundColor: dash.surfaceSubtle, borderColor: dash.hairline }}>
                                                    <View className="flex-row items-start justify-between gap-3 mb-2">
                                                        <View className="flex-row items-center flex-1 min-w-0">
                                                            <View className="w-9 h-9 rounded-[11px] items-center justify-center mr-3" style={{ backgroundColor: entry.type === 'expense' ? 'rgba(245,158,11,0.12)' : 'rgba(37,99,235,0.1)' }}>
                                                                <MaterialIcons name={entry.type === 'expense' ? 'receipt-long' : 'payment'} size={16} color={entry.type === 'expense' ? dash.warningDeep : dash.accentBlue} />
                                                            </View>
                                                            <View className="flex-1 min-w-0">
                                                                <Text className="text-[13px] font-bold" style={{ color: dash.ink }} numberOfLines={1}>{entry.label}</Text>
                                                                <Text className="text-[11px] font-medium mt-0.5" style={{ color: dash.muted }}>
                                                                    {entry.uploadedAt.toLocaleDateString('ro-RO')} · {entry.type === 'expense' ? 'Cheltuială' : 'Factură'}
                                                                </Text>
                                                            </View>
                                                        </View>
                                                        <Text className="text-[14px] font-black" style={{ color: dash.ink }}>{formatCurrency(entry.amount)}</Text>
                                                    </View>

                                                    <View className="flex-row items-center justify-between flex-wrap gap-2 mt-1">
                                                        <View className="flex-row items-center gap-1.5 px-2.5 py-1 rounded-full" style={{ backgroundColor: meta.bg }}>
                                                            <MaterialIcons name={meta.icon} size={12} color={meta.fg} />
                                                            <Text className="text-[10px] font-bold uppercase tracking-wide" style={{ color: meta.fg }}>{meta.label}</Text>
                                                        </View>

                                                        <View className="flex-row items-center gap-2">
                                                            {entry.documentUrl ? (
                                                                <Pressable
                                                                    onPress={() => openDocumentUrl(entry.documentUrl)}
                                                                    className="flex-row items-center gap-1 px-2.5 py-1.5 rounded-[10px]"
                                                                    style={{ backgroundColor: dash.lineSoft }}
                                                                >
                                                                    <MaterialIcons name="file-download" size={13} color={dash.muted} />
                                                                    <Text className="text-[11px] font-bold" style={{ color: dash.muted }}>Vezi</Text>
                                                                </Pressable>
                                                            ) : null}
                                                            {entry.accountingStatus === 'pending' && (
                                                                isUpdating ? (
                                                                    <ActivityIndicator size="small" color={dash.accent} />
                                                                ) : (
                                                                    <>
                                                                        <Pressable
                                                                            onPress={() => handleUpdateDocumentStatus(entry.id, 'processed')}
                                                                            className="flex-row items-center gap-1 px-2.5 py-1.5 rounded-[10px]"
                                                                            style={{ backgroundColor: 'rgba(16,185,129,0.1)' }}
                                                                        >
                                                                            <MaterialIcons name="check-circle" size={13} color={dash.successDeep} />
                                                                            <Text className="text-[11px] font-bold" style={{ color: dash.successDeep }}>Aprobă</Text>
                                                                        </Pressable>
                                                                        <Pressable
                                                                            onPress={() => handleUpdateDocumentStatus(entry.id, 'rejected')}
                                                                            className="flex-row items-center gap-1 px-2.5 py-1.5 rounded-[10px]"
                                                                            style={{ backgroundColor: 'rgba(239,68,68,0.08)' }}
                                                                        >
                                                                            <MaterialIcons name="close" size={13} color={dash.dangerDeep} />
                                                                            <Text className="text-[11px] font-bold" style={{ color: dash.dangerDeep }}>Respinge</Text>
                                                                        </Pressable>
                                                                    </>
                                                                )
                                                            )}
                                                        </View>
                                                    </View>

                                                    {entry.accountingNote && entry.accountingStatus !== 'pending' && (
                                                        <View className="mt-2.5 rounded-[10px] p-2.5" style={{ backgroundColor: dash.lineSoft }}>
                                                            <Text className="text-[11px] font-medium italic" style={{ color: dash.muted }}>„{entry.accountingNote}”</Text>
                                                        </View>
                                                    )}
                                                </View>
                                            );
                                        })}
                                    </View>
                                )}
                            </ScrollView>
                        </View>

                        {/* Recent Payments */}
                        <View className={`w-full rounded-[24px] ${isMobile ? 'p-5' : 'p-7'} border dash-fade-in ${isMobile ? '' : 'xl:flex-[2]'}`} style={cardStyle}>
                            <SectionHeader
                                icon="payment"
                                iconBg="rgba(16,185,129,0.1)"
                                iconFg={dash.successDeep}
                                title="Plăți recente"
                                subtitle="Încasări jucători prin Stripe / club"
                            />

                            <ScrollView style={{ maxHeight: 460 }} showsVerticalScrollIndicator={false}>
                                {loadingRecentPayments ? (
                                    <View className="gap-3">
                                        {[0, 1, 2].map((i) => (
                                            <View key={i} className="p-4 rounded-[16px] border" style={{ borderColor: dash.hairline }}>
                                                <SkeletonBlock width="50%" height={12} className="mb-2" />
                                                <SkeletonBlock width="80%" height={16} />
                                            </View>
                                        ))}
                                    </View>
                                ) : recentPayments.length === 0 ? (
                                    <EmptyState title="Nu există plăți" message="Plățile jucătorilor vor apărea aici." icon="payment" />
                                ) : (
                                    <View className="gap-3">
                                        {recentPayments.map((payment) => {
                                            const paid = ['paid', 'processed', 'succeeded', 'success'].includes(payment.status.toLowerCase());
                                            return (
                                                <View key={payment.id} className="p-4 rounded-[16px] border" style={{ backgroundColor: dash.surfaceSubtle, borderColor: dash.hairline }}>
                                                    <View className="flex-row justify-between gap-3">
                                                        <View className="flex-1 min-w-0">
                                                            <Text className="font-black" style={{ color: dash.ink }} numberOfLines={1}>{payment.playerName}</Text>
                                                            <Text className="text-[12px] font-medium mt-1" style={{ color: dash.muted }} numberOfLines={1}>
                                                                {payment.teamName || payment.playerEmail || 'Jucător'}
                                                            </Text>
                                                        </View>
                                                        <Text className="font-black text-[15px]" style={{ color: dash.accent }}>
                                                            {formatCurrency(payment.amount, payment.currency)}
                                                        </Text>
                                                    </View>
                                                    <View className="flex-row justify-between items-center mt-3">
                                                        <View className="px-2.5 py-1 rounded-lg" style={{ backgroundColor: paid ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.1)' }}>
                                                            <Text className="text-[10px] font-black uppercase" style={{ color: paid ? dash.successDeep : dash.warningDeep }}>
                                                                {payment.status}
                                                            </Text>
                                                        </View>
                                                        <Text className="text-[11px] font-bold" style={{ color: dash.faint }}>
                                                            {formatPaymentDate(payment.date)}
                                                        </Text>
                                                    </View>
                                                </View>
                                            );
                                        })}
                                    </View>
                                )}
                            </ScrollView>
                        </View>
                    </View>
                </View>
            )}

            {activeTab === 'Payment Gateways' && (
                <View className="mb-20">
                    <View className={`rounded-[24px] ${isMobile ? 'p-5' : 'p-7'} border dash-fade-in`} style={cardStyle}>
                        <View className={`gap-6 ${isMobile ? '' : 'flex-row items-start justify-between'}`}>
                            <View className="flex-1">
                                <SectionHeader
                                    icon="payment"
                                    iconBg="rgba(99,91,255,0.1)"
                                    iconFg={dash.accent}
                                    title="Stripe"
                                    subtitle="Checkout pentru plățile jucătorilor"
                                />

                                <View
                                    className="self-start px-4 py-2 rounded-full flex-row items-center gap-1.5"
                                    style={{ backgroundColor: stripeConfig?.configured ? 'rgba(16,185,129,0.1)' : loadingStripeConfig ? 'rgba(37,99,235,0.08)' : 'rgba(239,68,68,0.08)' }}
                                >
                                    <View className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: stripeConfig?.configured ? dash.successDeep : loadingStripeConfig ? dash.accentBlue : dash.dangerDeep }} />
                                    <Text className="text-[12px] font-black uppercase" style={{ color: stripeConfig?.configured ? dash.successDeep : loadingStripeConfig ? dash.accentBlue : dash.dangerDeep }}>
                                        {loadingStripeConfig ? 'Se încarcă' : stripeConfig?.configured ? 'Activ' : 'Necesită configurare'}
                                    </Text>
                                </View>
                            </View>

                            <View className={`rounded-[18px] border ${isMobile ? 'p-4' : 'p-6 w-[460px]'}`} style={{ backgroundColor: dash.surfaceSubtle, borderColor: dash.hairline }}>
                                {[
                                    { label: 'Mediu', value: loadingStripeConfig ? '...' : stripeConfig?.mode === 'live' ? 'Live' : 'Test' },
                                    { label: 'Monedă', value: loadingStripeConfig ? '...' : (stripeConfig?.currency || 'ron').toUpperCase() },
                                    { label: 'Secret key', value: loadingStripeConfig ? '...' : stripeConfig?.secretKeyConfigured ? 'Configurat' : 'Lipsește' },
                                    { label: 'Publishable key', value: loadingStripeConfig ? '...' : stripeConfig?.publishableKeyConfigured ? 'Configurat în env' : 'Fallback test' },
                                    { label: 'Webhook secret', value: loadingStripeConfig ? '...' : stripeConfig?.webhookSecretConfigured ? 'Configurat' : 'Lipsește' },
                                ].map((row, idx, arr) => (
                                    <View key={row.label} className={`flex-row justify-between items-center py-2.5 ${idx < arr.length - 1 ? 'border-b' : ''}`} style={{ borderColor: dash.hairline }}>
                                        <Text className="font-bold text-[12px] uppercase tracking-wide" style={{ color: dash.muted }}>{row.label}</Text>
                                        <Text className="font-black text-[13px]" style={{ color: dash.ink }}>{row.value}</Text>
                                    </View>
                                ))}
                            </View>
                        </View>

                        <View className="mt-6 rounded-[18px] p-4" style={{ backgroundColor: 'rgba(37,99,235,0.06)' }}>
                            <Text className="font-black text-[12px] uppercase tracking-wide mb-2" style={{ color: dash.accentBlue }}>Webhook URL</Text>
                            <Text className="font-bold text-[13px]" style={{ color: dash.ink }} selectable>{stripeConfig?.webhookUrl || 'Se încarcă...'}</Text>
                            <Text className="text-[12px] font-medium mt-3" style={{ color: dash.accentBlue }}>
                                Evenimente recomandate în Stripe: checkout.session.completed, checkout.session.async_payment_succeeded, checkout.session.async_payment_failed și checkout.session.expired.
                            </Text>
                        </View>
                    </View>
                </View>
            )}

            {/* ═══════════════════════════════════════════════════════
               MODALS
               ═══════════════════════════════════════════════════════ */}

            {/* Teams Modal */}
            <ModalShell visible={teamModalVisible} onClose={() => setTeamModalVisible(false)} maxWidth={400}>
                <Text className="text-[18px] font-black mb-5" style={{ color: dash.ink }}>Selectează Echipa</Text>
                <ScrollView style={{ maxHeight: 380 }}>
                    {teams.map(t => (
                        <Pressable
                            key={t.id}
                            onPress={() => handleTeamSelect(t)}
                            className="p-4 border-b flex-row justify-between items-center"
                            style={{ borderColor: dash.hairline }}
                        >
                            <Text className="font-bold" style={{ color: dash.ink }}>{t.name}</Text>
                            <Text className="text-xs" style={{ color: dash.faint }}>{t.leagueName}</Text>
                        </Pressable>
                    ))}
                </ScrollView>
            </ModalShell>

            {/* Match Modal */}
            <ModalShell visible={matchModalVisible} onClose={() => setMatchModalVisible(false)} maxWidth={400}>
                <Text className="text-[18px] font-black mb-5" style={{ color: dash.ink }}>Selectează Meciul</Text>
                <ScrollView style={{ maxHeight: 380 }}>
                    {matches.length === 0 ? (
                        <View className="py-6 items-center">
                            <Text className="font-semibold text-center" style={{ color: dash.muted }}>
                                Nu există meciuri viitoare pentru echipa selectată.
                            </Text>
                        </View>
                    ) : (
                        matches.map(m => (
                            <Pressable
                                key={m.id}
                                onPress={() => { setSelectedMatch(m); setMatchModalVisible(false); }}
                                className="p-4 border-b flex-col"
                                style={{ borderColor: dash.hairline }}
                            >
                                <View className="flex-row items-center justify-between gap-3 mb-1">
                                    <Text className="font-bold flex-1" style={{ color: dash.ink }} numberOfLines={1}>{getMatchSelectionTitle(m)}</Text>
                                    <View className="px-2.5 py-1 rounded-full" style={{ backgroundColor: m.source === 'frb' ? 'rgba(37,99,235,0.08)' : 'rgba(16,185,129,0.1)' }}>
                                        <Text className="text-[10px] font-black uppercase" style={{ color: m.source === 'frb' ? dash.accentBlue : dash.successDeep }}>
                                            {m.source === 'frb' ? 'FRB' : 'Site'}
                                        </Text>
                                    </View>
                                </View>
                                <Text className="text-xs" style={{ color: dash.faint }}>{m.dateLabel}</Text>
                            </Pressable>
                        ))
                    )}
                </ScrollView>
            </ModalShell>

            {/* Players Modal */}
            <ModalShell visible={playerModalVisible} onClose={() => setPlayerModalVisible(false)} maxWidth={500}>
                <View className="flex-row justify-between items-center mb-5">
                    <Text className="text-[18px] font-black" style={{ color: dash.ink }}>Selectează Jucători ({selectedPlayers.length}/12)</Text>
                    <Pressable onPress={() => setPlayerModalVisible(false)} className="w-8 h-8 rounded-full items-center justify-center" style={{ backgroundColor: dash.lineSoft }}>
                        <MaterialIcons name="close" size={15} color={dash.faint} />
                    </Pressable>
                </View>
                <ScrollView style={{ maxHeight: 480 }}>
                    {players.map(p => {
                        const isSelected = selectedPlayers.includes(p.id);
                        return (
                            <Pressable
                                key={p.id}
                                onPress={() => togglePlayer(p.id)}
                                className="p-4 border-b flex-row justify-between items-center"
                                style={{ borderColor: dash.hairline, backgroundColor: isSelected ? 'rgba(99,91,255,0.05)' : 'transparent' }}
                            >
                                <View className="flex-row items-center">
                                    <View className="w-5 h-5 rounded border items-center justify-center mr-3" style={{ backgroundColor: isSelected ? dash.accent : 'transparent', borderColor: isSelected ? dash.accent : dash.line }}>
                                        {isSelected && <MaterialIcons name="check" size={14} color="white" />}
                                    </View>
                                    <Text className="font-bold" style={{ color: dash.ink }}>{p.firstName} {p.lastName}</Text>
                                </View>
                                {p.number && <Text className="font-black" style={{ color: dash.faint }}>#{p.number}</Text>}
                            </Pressable>
                        );
                    })}
                </ScrollView>
            </ModalShell>

            {/* Upload Details Modal */}
            <ModalShell visible={uploadModal.visible} onClose={closeUploadModal} maxWidth={420}>
                <View className="flex-row items-center justify-between mb-5">
                    <Text className="text-[17px] font-bold" style={{ color: dash.ink }}>
                        {uploadModal.docType === 'expense' ? 'Detalii cheltuială' : 'Detalii factură'}
                    </Text>
                    <Pressable onPress={closeUploadModal} disabled={uploadModal.submitting} className="w-8 h-8 rounded-full items-center justify-center" style={{ backgroundColor: dash.lineSoft }}>
                        <MaterialIcons name="close" size={15} color={dash.faint} />
                    </Pressable>
                </View>

                {uploadModal.file ? (
                    <View className="flex-row items-center gap-3 p-3 rounded-[14px] mb-4" style={{ backgroundColor: dash.lineSoft }}>
                        <MaterialIcons name="receipt-long" size={18} color={dash.accent} />
                        <Text className="text-[12px] font-semibold flex-1" style={{ color: dash.inkSoft }} numberOfLines={1}>{uploadModal.file.name}</Text>
                    </View>
                ) : null}

                <Text className="text-[11px] font-bold uppercase tracking-wide mb-2" style={{ color: dash.muted }}>Sumă (RON)</Text>
                <TextInput
                    value={uploadModal.amount}
                    onChangeText={(text: string) => setUploadModal((prev) => ({ ...prev, amount: text }))}
                    keyboardType="numeric"
                    placeholder="0.00"
                    placeholderTextColor={dash.faint}
                    className="border rounded-[12px] h-[48px] px-4 text-[16px] font-bold mb-4"
                    style={{ borderColor: dash.hairlineStrong, color: dash.ink }}
                />

                <Text className="text-[11px] font-bold uppercase tracking-wide mb-2" style={{ color: dash.muted }}>Descriere</Text>
                <TextInput
                    value={uploadModal.description}
                    onChangeText={(text: string) => setUploadModal((prev) => ({ ...prev, description: text }))}
                    placeholder="Descriere document"
                    placeholderTextColor={dash.faint}
                    className="border rounded-[12px] h-[48px] px-4 text-[13px] font-semibold mb-6"
                    style={{ borderColor: dash.hairlineStrong, color: dash.ink }}
                />

                <View className="flex-row gap-3">
                    <Pressable onPress={closeUploadModal} disabled={uploadModal.submitting} className="flex-1 h-[48px] rounded-[12px] items-center justify-center" style={{ backgroundColor: dash.lineSoft }}>
                        <Text className="font-bold" style={{ color: dash.muted }}>Anulează</Text>
                    </Pressable>
                    <Pressable onPress={handleConfirmUpload} disabled={uploadModal.submitting} className="flex-1 h-[48px] rounded-[12px] items-center justify-center" style={{ backgroundColor: dash.ink }}>
                        {uploadModal.submitting ? <ActivityIndicator color="#fff" size="small" /> : <Text className="font-bold text-white">Încarcă documentul</Text>}
                    </Pressable>
                </View>
            </ModalShell>

        </ScrollView>
    );
}
