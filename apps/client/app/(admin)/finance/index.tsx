import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, ActivityIndicator, Alert, Modal, Platform } from '@/src/web/reactNative';
import { MaterialIcons } from '@/src/web/expoVectorIcons';
import * as DocumentPicker from '@/src/web/documentPicker';
import { financeApi, FinancialSettings, FinancialDocument, StripeAdminConfig, AdminRecentPayment } from '../../../services/financeApi';
import { useResponsive } from '../../../hooks/useResponsive';
import { buildServerUrl, resolveDocumentUrl } from '../../../config/serverUrl';
import { apiFetch } from '../../../services/apiClient';
import PageHero, { GlassStat } from '../../../components/admin/PageHero';
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
        <View className="flex-row items-center gap-3 mb-4 min-w-0">
            <View className="w-9 h-9 rounded-[10px] items-center justify-center shrink-0" style={{ backgroundColor: iconBg }}>
                <MaterialIcons name={icon} size={18} color={iconFg} />
            </View>
            <View className="flex-1 min-w-0">
                <Text className="f-display text-[16px] font-bold" style={{ color: dash.ink, letterSpacing: '-0.015em' } as any}>{title}</Text>
                <Text className="t-meta mt-0.5" style={{ color: dash.muted }}>{subtitle}</Text>
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
                    className="w-full rounded-[16px] p-5 border dash-fade-in"
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
    const [activeTab, setActiveTab] = useState('Finances');

    /* ─── Settings state ───────────────────────────────────────── */
    const [settings, setSettings] = useState<FinancialSettings | null>(null);
    const [loadingSettings, setLoadingSettings] = useState(true);
    const [loadingDocuments, setLoadingDocuments] = useState(true);
    /* ─── Finances tab state ───────────────────────────────────── */
    const [monthlyFeeInput, setMonthlyFeeInput] = useState('');
    const [editingFee, setEditingFee] = useState(false);
    const [savingFee, setSavingFee] = useState(false);
    const [dueDayInput, setDueDayInput] = useState('');
    const [editingDueDay, setEditingDueDay] = useState(false);
    const [savingDueDay, setSavingDueDay] = useState(false);
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

        void loadDocuments();

        void financeApi.getSettings()
            .then((settingsResponse) => {
                setSettings(settingsResponse);
                setMonthlyFeeInput(String(settingsResponse.monthlyPlayerFee || 0));
                setDueDayInput(String(settingsResponse.paymentDueDay || 25));
            })
            .catch((error) => console.error('Failed to load financial settings:', error))
            .finally(() => setLoadingSettings(false));

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

    const handleSaveDueDay = async () => {
        const day = parseInt(dueDayInput, 10);
        if (isNaN(day) || day < 1 || day > 31) {
            Alert.alert('Eroare', 'Introduceți o zi validă (între 1 și 31).');
            return;
        }
        setSavingDueDay(true);
        try {
            await financeApi.updateSettings({ paymentDueDay: day });
            setSettings(prev => prev ? { ...prev, paymentDueDay: day } : prev);
            setEditingDueDay(false);
            Alert.alert('Succes', `Ziua limită de plată a fost setată la ${day}.`);
        } catch {
            Alert.alert('Eroare', 'Nu s-a putut actualiza ziua limită.');
        } finally {
            setSavingDueDay(false);
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
            const typeLabel = docType === 'expense' ? 'Cheltuială' : 'Factură';
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

    const openDocumentUrl = async (documentUrl: string | null) => {
        if (Platform.OS !== 'web' || !documentUrl) {
            Alert.alert('Info', 'Folosiți interfața web pentru a descărca documentul.');
            return;
        }
        // Documents stored in the database are private: ask for a 5-minute
        // signed link. Open the tab first, inside the tap, or popup blockers eat it.
        const key = documentUrl.match(/^\/api\/files\/([a-f0-9]{32})$/)?.[1];
        if (!key) {
            const url = resolveDocumentUrl(documentUrl);
            if (url) window.open(url, '_blank');
            return;
        }
        const tab = window.open('about:blank', '_blank');
        try {
            const { path } = await apiFetch<{ path: string }>(`/files/${key}/link`, { method: 'POST' });
            const url = buildServerUrl(path);
            if (tab) tab.location.href = url;
            else window.location.assign(url);
        } catch {
            tab?.close();
            Alert.alert('Eroare', 'Nu am putut deschide documentul.');
        }
    };

    /* ═══════════════════════════════════════════════════════════════
       RENDER
       ═══════════════════════════════════════════════════════════════ */
    const TABS = ['Finances', 'Payment Gateways'];
    const TAB_LABELS: Record<string, string> = { Finances: 'Situație', 'Payment Gateways': 'Plăți online' };

    return (
        <ScrollView
            className="flex-1 px-4 md:px-10 pt-5 md:pt-8"
            style={{ backgroundColor: dash.bg }}
            contentContainerStyle={{ paddingBottom: isMobile ? 156 : 72 }}
            showsVerticalScrollIndicator={false}
        >

            {/* ──────────── HEADER + TABS ──────────── */}
            <PageHero
                eyebrow="Finanțe"
                title="Finanțele clubului"
                subtitle="Cotizații, plăți și documente contabile."
                className="mb-4"
                actions={
                    <View
                        className="flex-row gap-[2px] rounded-[10px] p-[3px] self-start"
                        style={{ backgroundColor: 'var(--c-surface-3)' }}
                    >
                        {TABS.map(tab => {
                            const active = activeTab === tab;
                            return (
                                <Pressable
                                    key={tab}
                                    onPress={() => setActiveTab(tab)}
                                    className="rounded-[8px] px-3.5 h-8 justify-center"
                                    style={active ? { backgroundColor: 'var(--c-surface)', boxShadow: 'var(--e-xs)' } as any : undefined}
                                >
                                    <Text className="text-[12px] font-semibold" style={{ color: active ? 'var(--c-ink)' : 'var(--c-muted)' }}>{TAB_LABELS[tab] ?? tab}</Text>
                                </Pressable>
                            );
                        })}
                    </View>
                }
            >
                {activeTab === 'Finances' ? (
                    <View className="grid grid-cols-2 lg:grid-cols-4 gap-2 ui-stagger">
                        <GlassStat
                            dot="var(--c-purple)"
                            label="Cotizație"
                            hint="per jucător / lună"
                            value={loadingSettings ? '—' : `${settings?.monthlyPlayerFee ?? 0}`}
                            suffix={loadingSettings ? undefined : 'RON'}
                        />
                        <GlassStat
                            dot="var(--c-success)"
                            label="Încasări"
                            hint={`${recentPayments.length} plăți recente`}
                            value={loadingRecentPayments ? '—' : Math.round(financeStats.collectedAmount).toLocaleString('ro-RO')}
                            suffix={loadingRecentPayments ? undefined : 'RON'}
                        />
                        <GlassStat
                            dot="var(--c-warning)"
                            label="De verificat"
                            hint={loadingDocuments ? undefined : formatCurrency(financeStats.pendingAmount)}
                            value={loadingDocuments ? '—' : financeStats.pendingCount}
                        />
                        <GlassStat
                            dot="var(--c-sky)"
                            label="Documente"
                            hint={loadingDocuments ? undefined : `${formatCurrency(financeStats.approvedAmount)} aprobat`}
                            value={loadingDocuments ? '—' : uploads.length}
                        />
                    </View>
                ) : null}
            </PageHero>

            {/* ═══════════════════════════════════════════════════════
               TAB: Finances
               ═══════════════════════════════════════════════════════ */}
            {activeTab === 'Finances' && (
                <View className="mb-20">

                    {/* ── Row: Monthly Fee + Upload ─────────────────── */}
                    <View className={`gap-4 mb-5 ${isMobile ? '' : 'flex-row'}`}>

                        {/* Monthly Fee Card */}
                        <View className={`flex-1 rounded-[16px] ${isMobile ? 'p-4' : 'p-5'} border dash-fade-in`} style={cardStyle}>
                            <SectionHeader
                                icon="account-balance-wallet"
                                iconBg="rgba(99,91,255,0.1)"
                                iconFg={dash.accent}
                                title="Cotizație lunară"
                                subtitle="Gestionează taxa lunară per jucător"
                            />

                            <View className={`${isMobile ? '' : 'flex-row gap-3'} mb-3`}>
                            <View className={`rounded-[12px] p-3.5 border flex-1 ${isMobile ? 'mb-3' : ''}`} style={{ backgroundColor: dash.surfaceSubtle, borderColor: dash.hairline }}>
                                <View className="flex-row justify-between items-center mb-3">
                                    <Text className="font-bold text-[11px] uppercase tracking-wider shrink" style={{ color: dash.muted }}>Cotizație</Text>
                                    {!editingFee && (
                                        <Pressable onPress={() => setEditingFee(true)} className="flex-row items-center gap-1 px-2.5 py-1.5 rounded-[10px] shrink-0" style={{ backgroundColor: 'rgba(99,91,255,0.08)' }}>
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
                                                className="flex-1 rounded-[11px] h-11 px-4 text-[18px] font-bold mr-3 border"
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
                                                className="flex-1 h-10 rounded-[11px] items-center justify-center flex-row gap-1.5"
                                                style={{ backgroundColor: 'var(--c-brand-surface)' }}
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
                                                className="flex-1 h-10 rounded-[11px] items-center justify-center"
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
                                            <Text className="t-num text-[32px] font-bold leading-none" style={{ color: dash.ink }}>{settings?.monthlyPlayerFee || 0}</Text>
                                            <Text className="text-[18px] font-bold ml-2 mb-1" style={{ color: dash.faint }}>RON / lună</Text>
                                        </View>
                                    )
                                )}
                            </View>

                            {/* Payment due day */}
                            <View className="rounded-[12px] p-3.5 border flex-1" style={{ backgroundColor: dash.surfaceSubtle, borderColor: dash.hairline }}>
                                <View className="flex-row justify-between items-center mb-3">
                                    <Text className="font-bold text-[11px] uppercase tracking-wider" style={{ color: dash.muted }}>Zi limită</Text>
                                    {!editingDueDay && (
                                        <Pressable onPress={() => setEditingDueDay(true)} className="flex-row items-center gap-1 px-2.5 py-1.5 rounded-[10px] shrink-0" style={{ backgroundColor: 'rgba(99,91,255,0.08)' }}>
                                            <MaterialIcons name="edit" size={12} color={dash.accent} />
                                            <Text className="text-[12px] font-bold" style={{ color: dash.accent }}>Modifică</Text>
                                        </Pressable>
                                    )}
                                </View>

                                {editingDueDay ? (
                                    <View>
                                        <View className="flex-row items-center mb-3">
                                            <Text className="text-[15px] font-bold mr-3" style={{ color: dash.faint }}>Ziua</Text>
                                            <TextInput
                                                value={dueDayInput}
                                                onChangeText={setDueDayInput}
                                                keyboardType="numeric"
                                                maxLength={2}
                                                className="w-[80px] rounded-[11px] h-11 px-4 text-[18px] font-bold border text-center"
                                                style={{ backgroundColor: dash.surface, borderColor: dash.hairlineStrong, color: dash.ink }}
                                                placeholder="25"
                                                placeholderTextColor={dash.faint}
                                            />
                                            <Text className="text-[15px] font-bold ml-3 flex-1" style={{ color: dash.faint }}>a lunii următoare</Text>
                                        </View>
                                        <View className="flex-row gap-3">
                                            <Pressable
                                                onPress={handleSaveDueDay}
                                                disabled={savingDueDay}
                                                className="flex-1 h-10 rounded-[11px] items-center justify-center flex-row gap-1.5"
                                                style={{ backgroundColor: 'var(--c-brand-surface)' }}
                                            >
                                                {savingDueDay
                                                    ? <ActivityIndicator color="white" size="small" />
                                                    : <><MaterialIcons name="save" size={14} color="#fff" /><Text className="text-white font-bold">Salvează</Text></>
                                                }
                                            </Pressable>
                                            <Pressable
                                                onPress={() => {
                                                    setEditingDueDay(false);
                                                    setDueDayInput(String(settings?.paymentDueDay || 25));
                                                }}
                                                className="flex-1 h-10 rounded-[11px] items-center justify-center"
                                                style={{ backgroundColor: dash.lineSoft }}
                                            >
                                                <Text className="font-bold" style={{ color: dash.muted }}>Anulează</Text>
                                            </Pressable>
                                        </View>
                                    </View>
                                ) : (
                                    loadingSettings ? (
                                        <SkeletonBlock width={120} height={32} />
                                    ) : (
                                        <View className="flex-row items-end">
                                            <Text className="t-num text-[28px] font-bold leading-none" style={{ color: dash.ink }}>{settings?.paymentDueDay || 25}</Text>
                                            <Text className="text-[15px] font-bold ml-2 mb-1" style={{ color: dash.faint }}>a lunii următoare</Text>
                                        </View>
                                    )
                                )}
                            </View>
                            </View>

                            <View className="flex-row items-center p-3 rounded-[11px]" style={{ backgroundColor: 'rgba(37,99,235,0.06)' }}>
                                <MaterialIcons name="info-outline" size={16} color={dash.accentBlue} style={{ marginRight: 8 }} />
                                <Text className="text-[12px] font-medium flex-1" style={{ color: dash.accentBlue }}>
                                    Ex: ziua 25 înseamnă că, până pe 25 august, jucătorii pot plăti cotizația pe luna iulie.
                                </Text>
                            </View>
                        </View>

                        {/* Upload Actions Card */}
                        <View className={`flex-1 rounded-[16px] ${isMobile ? 'p-4' : 'p-5'} border dash-fade-in`} style={cardStyle}>
                            <SectionHeader
                                icon="receipt-long"
                                iconBg="rgba(245,158,11,0.12)"
                                iconFg={dash.warningDeep}
                                title="Încărcare documente"
                                subtitle="Cheltuieli și facturi"
                            />

                            <View className={`flex-row gap-3 ${isMobile ? '' : 'flex-1'}`}>
                                <Pressable
                                    onPress={() => handleStartUpload('expense')}
                                    disabled={pickingFile === 'expense'}
                                    className="flex-1 ui-press rounded-[14px] border-[1.5px] border-dashed items-center justify-center py-5 px-3"
                                    style={{ backgroundColor: 'rgba(245,158,11,0.05)', borderColor: 'rgba(245,158,11,0.3)' }}
                                >
                                    {pickingFile === 'expense' ? (
                                        <ActivityIndicator size="small" color={dash.warningDeep} />
                                    ) : (
                                        <>
                                            <View className="w-10 h-10 rounded-[11px] items-center justify-center mb-2" style={{ backgroundColor: 'rgba(245,158,11,0.12)' }}>
                                                <MaterialIcons name="receipt-long" size={20} color={dash.warningDeep} />
                                            </View>
                                            <Text className="text-[14px] font-bold mb-0.5" style={{ color: dash.ink }}>Cheltuieli</Text>
                                            <Text className="text-[12px] font-medium text-center" style={{ color: dash.faint }}>Încarcă bonuri sau chitanțe</Text>
                                        </>
                                    )}
                                </Pressable>

                                <Pressable
                                    onPress={() => handleStartUpload('invoice')}
                                    disabled={pickingFile === 'invoice'}
                                    className="flex-1 ui-press rounded-[14px] border-[1.5px] border-dashed items-center justify-center py-5 px-3"
                                    style={{ backgroundColor: 'rgba(37,99,235,0.05)', borderColor: 'rgba(37,99,235,0.25)' }}
                                >
                                    {pickingFile === 'invoice' ? (
                                        <ActivityIndicator size="small" color={dash.accentBlue} />
                                    ) : (
                                        <>
                                            <View className="w-10 h-10 rounded-[11px] items-center justify-center mb-2" style={{ backgroundColor: 'rgba(37,99,235,0.1)' }}>
                                                <MaterialIcons name="payment" size={20} color={dash.accentBlue} />
                                            </View>
                                            <Text className="text-[14px] font-bold mb-0.5" style={{ color: dash.ink }}>Facturi</Text>
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
                        <View className={`w-full rounded-[16px] ${isMobile ? 'p-4' : 'p-5'} border dash-fade-in ${isMobile ? '' : 'xl:flex-[3]'}`} style={cardStyle}>
                            <View className="flex-row items-start justify-between mb-1 flex-wrap gap-3">
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
                                                            <Text className="text-[11px] font-semibold" style={{ color: meta.fg }}>{meta.label}</Text>
                                                        </View>

                                                        <View className="flex-row items-center gap-2">
                                                            {entry.documentUrl ? (
                                                                <Pressable
                                                                    onPress={() => void openDocumentUrl(entry.documentUrl)}
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
                        <View className={`w-full rounded-[16px] ${isMobile ? 'p-4' : 'p-5'} border dash-fade-in ${isMobile ? '' : 'xl:flex-[2]'}`} style={cardStyle}>
                            <SectionHeader
                                icon="payment"
                                iconBg="rgba(16,185,129,0.1)"
                                iconFg={dash.successDeep}
                                title="Plăți recente"
                                subtitle="Încasări jucători prin Stripe / club"
                            />

                            {loadingRecentPayments ? (
                                <View className="gap-2">
                                    {[0, 1, 2].map((i) => <SkeletonBlock key={i} width="100%" height={44} />)}
                                </View>
                            ) : recentPayments.length === 0 ? (
                                <EmptyState title="Nu există plăți" message="Plățile jucătorilor vor apărea aici." icon="payment" />
                            ) : (
                                // Rows, not one card per payment inside a 460px inner scroller
                                // that clipped the last card mid-way.
                                <View>
                                    {recentPayments.map((payment, index) => {
                                        const status = payment.status.toLowerCase();
                                        const paid = ['paid', 'processed', 'succeeded', 'success'].includes(status);
                                        const failed = ['failed', 'canceled', 'cancelled', 'refunded'].includes(status);
                                        const label = paid ? 'Plătit' : failed ? (status === 'refunded' ? 'Rambursat' : 'Eșuat') : 'În așteptare';
                                        const tone = paid ? 'var(--c-success-fg)' : failed ? 'var(--c-danger-fg)' : 'var(--c-warning-fg)';
                                        return (
                                            <View key={payment.id} className="flex-row items-center gap-3 py-2.5" style={index > 0 ? ({ borderTopWidth: 1, borderTopColor: 'var(--c-border)' } as any) : undefined}>
                                                <View className="flex-1 min-w-0">
                                                    <Text className="text-[14px] font-semibold" style={{ color: 'var(--c-ink)' }} numberOfLines={1}>{payment.playerName}</Text>
                                                    <Text className="t-meta" style={{ color: 'var(--c-muted)' }} numberOfLines={1}>
                                                        {[formatPaymentDate(payment.date), payment.teamName, payment.provider === 'cash' ? 'numerar' : payment.provider === 'stripe' ? 'card' : null].filter(Boolean).join(' · ')}
                                                    </Text>
                                                </View>
                                                <View className="items-end shrink-0">
                                                    <Text className="t-num text-[14px] font-bold" style={{ color: 'var(--c-ink)' }}>{formatCurrency(payment.amount, payment.currency)}</Text>
                                                    <Text className="text-[11.5px] font-semibold" style={{ color: tone }}>{label}</Text>
                                                </View>
                                            </View>
                                        );
                                    })}
                                </View>
                            )}
                        </View>
                    </View>
                </View>
            )}

            {activeTab === 'Payment Gateways' && (
                <View className="mb-20">
                    <View className={`rounded-[16px] ${isMobile ? 'p-4' : 'p-5'} border dash-fade-in`} style={cardStyle}>
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
                                    <Text className="text-[12.5px] font-semibold" style={{ color: stripeConfig?.configured ? dash.successDeep : loadingStripeConfig ? dash.accentBlue : dash.dangerDeep }}>
                                        {loadingStripeConfig ? 'Se încarcă' : stripeConfig?.configured ? 'Activ' : 'Necesită configurare'}
                                    </Text>
                                </View>
                            </View>

                            <View className={`rounded-[18px] border ${isMobile ? 'p-4' : 'p-6 w-[460px]'}`} style={{ backgroundColor: dash.surfaceSubtle, borderColor: dash.hairline }}>
                                {[
                                    { label: 'Mediu', value: loadingStripeConfig ? '...' : stripeConfig?.mode === 'live' ? 'Live' : 'Test' },
                                    { label: 'Monedă', value: loadingStripeConfig ? '...' : (stripeConfig?.currency || 'ron').toUpperCase() },
                                    { label: 'Cheie secretă', value: loadingStripeConfig ? '...' : stripeConfig?.secretKeyConfigured ? 'Configurat' : 'Lipsește' },
                                    { label: 'Cheie publică', value: loadingStripeConfig ? '...' : stripeConfig?.publishableKeyConfigured ? 'Configurat în env' : 'Cheie de test' },
                                    { label: 'Secret webhook', value: loadingStripeConfig ? '...' : stripeConfig?.webhookSecretConfigured ? 'Configurat' : 'Lipsește' },
                                ].map((row, idx, arr) => (
                                    <View key={row.label} className={`flex-row justify-between items-center py-2.5 ${idx < arr.length - 1 ? 'border-b' : ''}`} style={{ borderColor: dash.hairline }}>
                                        <Text className="font-medium text-[13px]" style={{ color: dash.muted }}>{row.label}</Text>
                                        <Text className="font-black text-[13px]" style={{ color: dash.ink }}>{row.value}</Text>
                                    </View>
                                ))}
                            </View>
                        </View>

                        <View className="mt-6 rounded-[18px] p-4" style={{ backgroundColor: 'rgba(37,99,235,0.06)' }}>
                            <Text className="font-black text-[12px] uppercase tracking-wide mb-2" style={{ color: dash.accentBlue }}>URL webhook</Text>
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
                    <View className="flex-row items-center gap-3 p-3 rounded-[11px] mb-4" style={{ backgroundColor: dash.lineSoft }}>
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
                    <Pressable onPress={handleConfirmUpload} disabled={uploadModal.submitting} className="flex-1 h-[48px] rounded-[12px] items-center justify-center" style={{ backgroundColor: 'var(--c-brand-surface)' }}>
                        {uploadModal.submitting ? <ActivityIndicator color="#fff" size="small" /> : <Text className="font-bold text-white">Încarcă documentul</Text>}
                    </Pressable>
                </View>
            </ModalShell>

        </ScrollView>
    );
}
