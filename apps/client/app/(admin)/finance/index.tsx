import { formatPaymentWhen, isDefaultDeskDescription, paymentMethodLabel } from '../../../utils/paymentDate';
import { parseApiDate } from '@/utils/dates';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, ActivityIndicator, Alert, Modal, Platform } from '@/src/web/reactNative';
import ModalBackdrop from '../../../components/ui/ModalBackdrop';
import { MaterialIcons } from '@/src/web/expoVectorIcons';
import * as DocumentPicker from '@/src/web/documentPicker';
import { financeApi, FinancialSettings, FinancialDocument, StripeAdminConfig, AdminRecentPayment, type FinanceSummary } from '../../../services/financeApi';
import BalancesCard, { type RecordedPayment } from '../../../components/finance/BalancesCard';
import { ToastHost, useToasts } from '../../../components/ui/Toast';
import FeeExtrasCard from '../../../components/finance/FeeExtrasCard';
import ConfirmDialog from '../../../components/ui/ConfirmDialog';
import StripeConnectCard from '../../../components/finance/StripeConnectCard';
import { useLocalSearchParams } from '@/src/web/expoRouter';
import { useResponsive } from '../../../hooks/useResponsive';
import { useSession } from '../../../context/AuthContext';
import { buildServerUrl, resolveDocumentUrl } from '../../../config/serverUrl';
import { apiFetch } from '../../../services/apiClient';
import PageHero, { GlassStat } from '../../../components/admin/PageHero';
import { EmptyState, SkeletonBlock } from '../../../components/dashboard/ScreenStates';
import { LoadError } from '../../../components/ui/ScreenState';
import { loadFailureMessage } from '../../../utils/errorMessages';
import { dash } from '../../../components/dashboard/dashboardTheme';
import { plural } from '../../../utils/plural';
import Button from '../../../components/ui/Button';
import FilterChips from '../../../components/ui/FilterChips';
import { FinanceCard, FinanceCardHeader } from '../../../components/finance/FinanceCard';

const DOCUMENTS_PAGE = 20;

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
    pending: { label: 'În așteptare', fg: 'var(--c-warning-fg)', bg: 'var(--c-warning-bg)', icon: 'schedule' },
    approved: { label: 'Aprobat', fg: 'var(--c-success-fg)', bg: 'var(--c-success-bg)', icon: 'check-circle' },
    rejected: { label: 'Respins', fg: 'var(--c-danger-fg)', bg: 'var(--c-danger-bg)', icon: 'warning-amber' },
};

const DOC_FILTERS: { key: 'all' | AccountingStatus; label: string; dot?: string }[] = [
    { key: 'all', label: 'Toate' },
    { key: 'pending', label: 'În așteptare', dot: 'var(--c-warning)' },
    { key: 'approved', label: 'Aprobate', dot: 'var(--c-success)' },
    { key: 'rejected', label: 'Respinse', dot: 'var(--c-danger)' },
];

function mapFinancialDocuments(documents: FinancialDocument[]): UploadEntry[] {
    return documents.map((document) => ({
        id: document.id,
        label: document.description || `Document #${document.id}`,
        type: document.type === 'Invoice' ? 'invoice' : 'expense',
        fileName: document.documentUrl?.split('/').pop() || 'fișier',
        amount: Number(document.amount) || 0,
        documentUrl: document.documentUrl,
        uploadedAt: parseApiDate(document.date),
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

/* ─── Shared visual primitives ──────────────────────────────────── */
/** One fee setting (Cotizație, Zi limită): the value, or a field + Salvează / Anulează. */
function SettingTile({ label, canEdit, editing, onEdit, loading, value, unit, input, onInput, placeholder, maxLength, saving, onSave, onCancel }: {
    label: string;
    canEdit: boolean;
    editing: boolean;
    onEdit: () => void;
    loading: boolean;
    value: string;
    unit: string;
    input: string;
    onInput: (text: string) => void;
    placeholder: string;
    maxLength?: number;
    saving: boolean;
    onSave: () => void;
    onCancel: () => void;
}) {
    return (
        <View className="rounded-[12px] border px-3.5 py-3 min-w-0" style={{ backgroundColor: 'var(--c-surface-2)', borderColor: 'var(--c-border)' } as any}>
            <View className="flex-row items-center justify-between gap-2 h-7 mb-1.5">
                <Text className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--c-muted)' }} numberOfLines={1}>{label}</Text>
                {canEdit && !editing ? (
                    <Button size="sm" variant="ghost" icon="edit" label="Modifică" accessibilityLabel={`Modifică ${label.toLowerCase()}`} className="h-7 -mr-1.5" onPress={onEdit} />
                ) : null}
            </View>
            {editing ? (
                <View className="gap-2.5">
                    <View className="flex-row items-center h-10 rounded-[10px] border pr-3" style={{ backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-border-strong, var(--c-border))' } as any}>
                        <TextInput
                            value={input}
                            onChangeText={onInput}
                            keyboardType="numeric"
                            maxLength={maxLength}
                            placeholder={placeholder}
                            placeholderTextColor="var(--c-faint)"
                            accessibilityLabel={label}
                            autoFocus
                            className="flex-1 h-full px-3 text-[16px] font-bold t-num"
                            style={{ color: 'var(--c-ink)' }}
                        />
                        <Text className="text-[12px] font-medium shrink-0" style={{ color: 'var(--c-faint)' }}>{unit}</Text>
                    </View>
                    <View className="flex-row gap-2">
                        <Button size="sm" label="Renunță" className="flex-1" disabled={saving} onPress={onCancel} />
                        <Button size="sm" variant="primary" icon="save" label="Salvează" className="flex-1" loading={saving} onPress={onSave} />
                    </View>
                </View>
            ) : loading ? (
                <SkeletonBlock width={120} height={28} />
            ) : (
                <View className="flex-row items-baseline gap-1.5">
                    <Text className="f-display t-num text-[26px] font-extrabold leading-none" style={{ color: 'var(--c-ink-strong)', letterSpacing: '-0.02em' } as any}>{value}</Text>
                    <Text className="text-[13px] font-medium" style={{ color: 'var(--c-muted)' }}>{unit}</Text>
                </View>
            )}
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
            <ModalBackdrop
                className="flex-1 items-center justify-center p-4"
                style={{ backgroundColor: 'rgba(10,15,28,0.5)' }}
                onDismiss={onClose}
            >
                <View
                    className="w-full rounded-[16px] p-5 border dash-fade-in"
                    style={{ maxWidth, maxHeight: '90vh', overflowY: 'auto', backgroundColor: dash.surface, borderColor: dash.hairline, ...dash.shadow.lift } as any}
                >
                    {children}
                </View>
            </ModalBackdrop>
        </Modal>
    );
}

export default function FinancialSettingsPage() {
    const { isMobile } = useResponsive();
    // The accountant collects money but does not change the fees (the server refuses too).
    const { session } = useSession();
    const canEditFees = session?.role === 'admin' || session?.role === 'superadmin';
    // Back from Stripe's onboarding (?tab=online&connect=return) → the online tab.
    const params = useLocalSearchParams<{ tab?: string; connect?: string }>();
    const [activeTab, setActiveTab] = useState(params.tab === 'online' ? 'Payment Gateways' : params.tab === 'setari' ? 'Settings' : 'Finances');

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
    const { toasts, showToast, dismissToast } = useToasts();
    // The „Încasat … · Anulează” toast of each payment, closed once that payment is reversed.
    const recordToasts = useRef(new Map<string, number>());
    // Bumped after a storno so Restanțe și solduri reloads too.
    const [balancesReload, setBalancesReload] = useState(0);
    const [pendingReverse, setPendingReverse] = useState<AdminRecentPayment | null>(null);
    const [reverseReason, setReverseReason] = useState('');
    const [reversing, setReversing] = useState(false);
    const [loadingStripeConfig, setLoadingStripeConfig] = useState(false);
    const [showStripeDetails, setShowStripeDetails] = useState(false);
    const [loadingRecentPayments, setLoadingRecentPayments] = useState(false);
    const [hasLoadedFinanceMeta, setHasLoadedFinanceMeta] = useState(false);
    const [uploads, setUploads] = useState<UploadEntry[]>([]);
    const [pickingFile, setPickingFile] = useState<'expense' | 'invoice' | null>(null);
    const [uploadModal, setUploadModal] = useState<UploadModalState>(EMPTY_UPLOAD_MODAL);
    const [documentFilter, setDocumentFilter] = useState<'all' | AccountingStatus>('all');
    const openPendingDocuments = () => {
        setDocumentFilter('pending');
        requestAnimationFrame(() => document.getElementById('registru-documente')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    };
    const [documentSearch, setDocumentSearch] = useState('');
    // Documents shown at once: a club's whole register (120+, ~40 elements
    // each) was rendered on every visit; search and filters still cover all.
    const [visibleDocuments, setVisibleDocuments] = useState(DOCUMENTS_PAGE);
    const [updatingDocId, setUpdatingDocId] = useState<number | null>(null);
    const [summary, setSummary] = useState<FinanceSummary | null>(null);
    const [loadingSummary, setLoadingSummary] = useState(true);
    // A load that failed says so — a 0 there reads as a fact about the club's money.
    const [summaryError, setSummaryError] = useState<string | null>(null);
    const [documentsError, setDocumentsError] = useState<string | null>(null);
    const [settingsError, setSettingsError] = useState<string | null>(null);
    const [recentError, setRecentError] = useState<string | null>(null);

    // Collected this month + what is owed today: the same definitions as the
    // dashboard, from the server — no longer the sum of the last 12 payments.
    const loadSummary = useCallback(() => {
        setLoadingSummary(true);
        setSummaryError(null);
        return financeApi.getSummary()
            .then(setSummary)
            .catch((error) => setSummaryError(loadFailureMessage(error)))
            .finally(() => setLoadingSummary(false));
    }, []);

    useEffect(() => { void loadSummary(); }, [loadSummary]);

    /* ─── Load data ────────────────────────────────────────────── */
    const loadDocuments = useCallback(() => {
        setLoadingDocuments(true);
        setDocumentsError(null);
        return financeApi.getDocuments()
            .then((documentsResponse) => setUploads(mapFinancialDocuments(documentsResponse)))
            .catch((error) => setDocumentsError(loadFailureMessage(error)))
            .finally(() => setLoadingDocuments(false));
    }, []);

    const loadData = useCallback(() => {
        setLoadingSettings(true);
        setSettingsError(null);

        void loadDocuments();

        void financeApi.getSettings()
            .then((settingsResponse) => {
                setSettings(settingsResponse);
                setMonthlyFeeInput(String(settingsResponse.monthlyPlayerFee || 0));
                setDueDayInput(String(settingsResponse.paymentDueDay || 25));
            })
            .catch((error) => setSettingsError(loadFailureMessage(error)))
            .finally(() => setLoadingSettings(false));

    }, [loadDocuments]);

    useEffect(() => { loadData(); }, [loadData]);

    const reloadRecentPayments = useCallback(async () => {
        try {
            setRecentPayments(await financeApi.getAdminRecentPayments(12));
            setRecentError(null);
        } catch (error) {
            setRecentError(loadFailureMessage(error));
        }
    }, []);

    /** Storno (or the „Anulează” right after recording): reload everything the payment touched. */
    const reversePayment = useCallback(async (paymentId: number | string, reason: string, done: string) => {
        try {
            await financeApi.reverseManualPayment(paymentId, reason);
            const recordToast = recordToasts.current.get(String(paymentId));
            if (recordToast != null) {
                dismissToast(recordToast);
                recordToasts.current.delete(String(paymentId));
            }
            showToast({ variant: 'success', message: done });
            setBalancesReload((value) => value + 1);
            void loadSummary();
            void reloadRecentPayments();
            return true;
        } catch (error) {
            showToast({ variant: 'error', message: error instanceof Error ? error.message : 'Nu am putut storna plata.' });
            return false;
        }
    }, [showToast, dismissToast, reloadRecentPayments, loadSummary]);

    // A desk payment used to close the dialog without a word and leave „Plăți
    // recente” stale. Now: who paid how much, „Anulează” while the server's
    // undo window lasts, and the list refreshed.
    const handlePaymentRecorded = (recorded: RecordedPayment) => {
        void loadSummary();
        void reloadRecentPayments();
        const canUndo = recorded.paymentId != null && recorded.undoWindowMs > 0;
        const toastId = showToast({
            variant: 'success',
            message: `Încasat ${formatCurrency(recorded.amount, recorded.currency)} de la ${recorded.playerName}.`,
            duration: canUndo ? recorded.undoWindowMs : 4000,
            action: canUndo
                ? { label: 'Anulează', onPress: () => void reversePayment(recorded.paymentId!, 'Anulată imediat după înregistrare', 'Plata a fost anulată.') }
                : undefined,
        });
        if (recorded.paymentId != null) recordToasts.current.set(String(recorded.paymentId), toastId);
    };

    const submitReverse = async () => {
        if (!pendingReverse) return;
        setReversing(true);
        const ok = await reversePayment(pendingReverse.id, reverseReason.trim(), `Plata de ${formatCurrency(pendingReverse.amount, pendingReverse.currency)} de la ${pendingReverse.playerName} a fost stornată.`);
        setReversing(false);
        if (ok) setPendingReverse(null);
    };

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
            setRecentError(null);
        } else {
            setRecentError(loadFailureMessage(paymentsResult.reason));
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

    useEffect(() => {
        setVisibleDocuments(DOCUMENTS_PAGE);
    }, [documentFilter, documentSearch]);

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

    const handleUpdateDocumentStatus = async (id: number, status: 'processed' | 'rejected' | 'pending', reason?: string) => {
        setUpdatingDocId(id);
        try {
            await financeApi.updateDocumentStatus(id, status, reason);
            setUploads((prev) => prev.map((entry) => entry.id === id
                ? {
                    ...entry,
                    accountingStatus: status === 'processed' ? 'approved' : status === 'rejected' ? 'rejected' : 'pending',
                    accountingNote: status === 'processed'
                        ? 'Aprobat de contabilitate'
                        : status === 'rejected' ? `Respins: ${reason ?? ''}`.trim() : 'Redeschis pentru verificare',
                }
                : entry));
            void loadSummary();
            return true;
        } catch (error) {
            console.error('Failed to update document status:', error);
            Alert.alert('Eroare', error instanceof Error ? error.message : 'Nu am putut actualiza statusul documentului.');
            return false;
        } finally {
            setUpdatingDocId(null);
        }
    };

    // Rejecting or reopening a document asks for a reason (kept in the audit log).
    const [reviewDialog, setReviewDialog] = useState<{ id: number; mode: 'reject' | 'reopen' } | null>(null);
    const [reviewReason, setReviewReason] = useState('');
    const submitReview = async () => {
        if (!reviewDialog || !reviewReason.trim()) return;
        const ok = await handleUpdateDocumentStatus(reviewDialog.id, reviewDialog.mode === 'reject' ? 'rejected' : 'pending', reviewReason.trim());
        if (ok) {
            setReviewDialog(null);
            setReviewReason('');
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
    const TABS = ['Finances', 'Payment Gateways', 'Settings'];
    const TAB_LABELS: Record<string, string> = { Finances: 'Situație', 'Payment Gateways': 'Plăți online', Settings: 'Setări' };

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
                        accessibilityRole={'tablist' as any}
                    >
                        {TABS.map(tab => {
                            const active = activeTab === tab;
                            return (
                                <Pressable
                                    key={tab}
                                    onPress={() => setActiveTab(tab)}
                                    accessibilityRole={'tab' as any}
                                    accessibilityState={{ selected: active }}
                                    className="tap-40 rounded-[8px] px-3.5 h-8 justify-center"
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
                            value={loadingSettings || !settings ? '—' : `${settings.monthlyPlayerFee ?? 0}`}
                            suffix={loadingSettings || !settings ? undefined : 'RON'}
                        />
                        <GlassStat
                            dot="var(--c-success)"
                            label="Încasat luna aceasta"
                            hint={summary ? new Intl.DateTimeFormat('ro-RO', { month: 'long', year: 'numeric' }).format(new Date(`${summary.month}-01T12:00:00`)) : undefined}
                            value={loadingSummary || !summary ? '—' : Math.round(summary.collected).toLocaleString('ro-RO')}
                            suffix={loadingSummary || !summary ? undefined : 'RON'}
                        />
                        <GlassStat
                            dot="var(--c-danger)"
                            label="Restanțe"
                            hint={summary ? `${plural(summary.playersOverdue, 'jucător', 'jucători')}` : undefined}
                            value={loadingSummary || !summary ? '—' : Math.round(summary.overdue).toLocaleString('ro-RO')}
                            suffix={loadingSummary || !summary ? undefined : 'RON'}
                        />
                        {/* Approving an expense sat below the whole Restanțe list: the figure
                            takes you to the register, showing what waits. */}
                        <Pressable
                            onPress={openPendingDocuments}
                            disabled={loadingDocuments || !!documentsError || financeStats.pendingCount === 0}
                            accessibilityRole="button"
                            accessibilityLabel={`De verificat: ${financeStats.pendingCount}. Arată documentele în așteptare`}
                            className="ui-press text-left rounded-[14px]"
                        >
                            <GlassStat
                                dot="var(--c-warning)"
                                label="De verificat"
                                hint={loadingDocuments || documentsError ? undefined : formatCurrency(financeStats.pendingAmount)}
                                value={loadingDocuments || documentsError ? '—' : financeStats.pendingCount}
                            />
                        </Pressable>
                    </View>
                ) : null}
                {activeTab === 'Finances' && (summaryError || settingsError) ? (
                    <LoadError
                        title="Cifrele nu s-au încărcat"
                        message={summaryError ?? settingsError ?? ''}
                        onRetry={() => { void loadSummary(); loadData(); }}
                    />
                ) : null}
            </PageHero>

            {/* ═══════════════════════════════════════════════════════
               TAB: Settings — set once a season (fee, due day, extra fees).
               They sat between the daily work on Situație (~2.900px at 375).
               ═══════════════════════════════════════════════════════ */}
            {activeTab === 'Settings' && settingsError && !settings ? (
                <View className="mb-20">
                    {/* Not „0 RON / lună” with „Modifică”: the fees are unknown until they load. */}
                    <LoadError title="Setările nu s-au încărcat" message={settingsError} onRetry={loadData} />
                </View>
            ) : null}
            {activeTab === 'Settings' && !(settingsError && !settings) && (
                <View className="mb-20">
                    {/* ── Fees: the monthly fee + due day, then the extra fees ── */}
                    <View className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
                        <FinanceCard>
                            <FinanceCardHeader
                                icon="payments"
                                tone="brand"
                                title="Cotizație lunară"
                                subtitle="Taxa lunară per jucător și ziua limită de plată."
                            />

                            <View className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                                <SettingTile
                                    label="Cotizație"
                                    canEdit={canEditFees}
                                    editing={editingFee}
                                    onEdit={() => setEditingFee(true)}
                                    loading={loadingSettings}
                                    value={String(settings?.monthlyPlayerFee || 0)}
                                    unit="RON / lună"
                                    input={monthlyFeeInput}
                                    onInput={setMonthlyFeeInput}
                                    placeholder="0"
                                    saving={savingFee}
                                    onSave={handleSaveMonthlyFee}
                                    onCancel={() => {
                                        setEditingFee(false);
                                        setMonthlyFeeInput(String(settings?.monthlyPlayerFee || 0));
                                    }}
                                />
                                <SettingTile
                                    label="Zi limită"
                                    canEdit={canEditFees}
                                    editing={editingDueDay}
                                    onEdit={() => setEditingDueDay(true)}
                                    loading={loadingSettings}
                                    value={String(settings?.paymentDueDay || 25)}
                                    unit="a lunii următoare"
                                    input={dueDayInput}
                                    onInput={setDueDayInput}
                                    placeholder="25"
                                    maxLength={2}
                                    saving={savingDueDay}
                                    onSave={handleSaveDueDay}
                                    onCancel={() => {
                                        setEditingDueDay(false);
                                        setDueDayInput(String(settings?.paymentDueDay || 25));
                                    }}
                                />
                            </View>

                            <View className="flex-row items-start gap-2 rounded-[10px] px-3 py-2.5" style={{ backgroundColor: 'var(--c-surface-2)' }}>
                                <MaterialIcons name="info-outline" size={15} color="var(--c-muted)" style={{ marginTop: 1 }} />
                                <Text className="flex-1 text-[12px] leading-[17px]" style={{ color: 'var(--c-muted)' }}>
                                    Ex: ziua 25 înseamnă că, până pe 25 august, jucătorii pot plăti cotizația pe luna iulie.
                                </Text>
                            </View>
                        </FinanceCard>

                        <FeeExtrasCard
                            settings={settings}
                            readOnly={!canEditFees}
                            onSaved={(next) => { setSettings(next); void loadSummary(); }}
                        />
                    </View>
                </View>
            )}

            {/* ═══════════════════════════════════════════════════════
               TAB: Finances
               ═══════════════════════════════════════════════════════ */}
            {activeTab === 'Finances' && (
                <View className="mb-20">

                    <BalancesCard onPaymentRecorded={handlePaymentRecorded} onNotify={showToast} reloadKey={balancesReload} />

                    {/* ── Documents register (with its upload actions) + recent payments ── */}
                    <View className="grid grid-cols-1 xl:grid-cols-5 gap-5 items-start">

                        <FinanceCard className="xl:col-span-3" nativeID="registru-documente">
                            <FinanceCardHeader
                                icon="receipt-long"
                                tone="warning"
                                title="Registru documente"
                                subtitle="Cheltuieli și facturi trimise la contabilitate."
                                actions={
                                    <>
                                        <Button size="sm" icon="upload-file" label="Cheltuială" className="flex-1 sm:flex-none" loading={pickingFile === 'expense'} onPress={() => void handleStartUpload('expense')} accessibilityLabel="Încarcă o cheltuială (bon sau chitanță)" />
                                        <Button size="sm" icon="upload-file" label="Factură" className="flex-1 sm:flex-none" loading={pickingFile === 'invoice'} onPress={() => void handleStartUpload('invoice')} accessibilityLabel="Încarcă o factură fiscală" />
                                    </>
                                }
                            />

                            <View className="flex-col md:flex-row md:items-center gap-2 mb-3">
                                <FilterChips<'all' | AccountingStatus>
                                    label="Filtru documente"
                                    value={documentFilter}
                                    onChange={setDocumentFilter}
                                    options={DOC_FILTERS.map((f) => ({
                                        key: f.key,
                                        label: f.label,
                                        dot: f.dot,
                                        count: f.key === 'all' ? uploads.length : uploads.filter((u) => u.accountingStatus === f.key).length,
                                    }))}
                                />
                                <View className="flex-row items-center gap-2 rounded-[10px] px-3 h-9 [@media(pointer:coarse)]:h-10 border md:ml-auto md:w-[220px]" style={{ borderColor: 'var(--c-border)', backgroundColor: 'var(--c-surface-2)' } as any}>
                                    <MaterialIcons name="search" size={15} color="var(--c-faint)" />
                                    <TextInput
                                        value={documentSearch}
                                        onChangeText={setDocumentSearch}
                                        placeholder="Caută document"
                                        placeholderTextColor="var(--c-faint)"
                                        accessibilityLabel="Caută document"
                                        className="flex-1 self-stretch text-[13px]"
                                        style={{ color: 'var(--c-ink)' }}
                                    />
                                    {documentSearch.length > 0 && (
                                        <Pressable onPress={() => setDocumentSearch('')} accessibilityLabel="Șterge căutarea">
                                            <MaterialIcons name="close" size={15} color="var(--c-faint)" />
                                        </Pressable>
                                    )}
                                </View>
                            </View>

                            {loadingDocuments ? (
                                <View className="gap-2">
                                    {[0, 1, 2].map((i) => <SkeletonBlock key={i} width="100%" height={56} />)}
                                </View>
                            ) : documentsError ? (
                                <LoadError title="Registrul nu s-a încărcat" message={documentsError} onRetry={() => void loadDocuments()} />
                            ) : filteredUploads.length === 0 ? (
                                <EmptyState
                                    title="Niciun document găsit"
                                    message={documentSearch || documentFilter !== 'all' ? 'Încearcă alt filtru sau șterge căutarea.' : 'Încarcă o cheltuială sau o factură; apare aici până o verifică contabilitatea.'}
                                    icon="receipt-long"
                                />
                            ) : (
                                // One bordered list with dividers, not a card per document
                                // inside a 520px inner scroller.
                                <View className="rounded-[12px] border overflow-hidden" style={{ borderColor: 'var(--c-border)' } as any}>
                                    {filteredUploads.slice(0, visibleDocuments).map((entry, index) => {
                                        const meta = STATUS_META[entry.accountingStatus];
                                        const isUpdating = updatingDocId === entry.id;
                                        const expense = entry.type === 'expense';
                                        return (
                                            <View key={entry.id} className={`px-3.5 py-3 gap-2 ${index ? 'border-t' : ''}`} style={{ borderColor: 'var(--c-border)' } as any}>
                                                <View className="flex-row items-center gap-3">
                                                    <View className="w-8 h-8 rounded-[9px] items-center justify-center shrink-0" style={{ backgroundColor: 'var(--c-surface-3)' }}>
                                                        <MaterialIcons name={expense ? 'receipt-long' : 'payment'} size={15} color="var(--c-muted)" />
                                                    </View>
                                                    <View className="flex-1 min-w-0">
                                                        <Text className="text-[14px] font-semibold" style={{ color: 'var(--c-ink)' }} numberOfLines={1}>{entry.label}</Text>
                                                        <Text className="t-meta mt-0.5" style={{ color: 'var(--c-muted)' }} numberOfLines={1}>
                                                            {entry.uploadedAt.toLocaleDateString('ro-RO')} · {expense ? 'Cheltuială' : 'Factură'}
                                                        </Text>
                                                    </View>
                                                    <Text className="t-num text-[14px] font-bold shrink-0" style={{ color: 'var(--c-ink)' }}>{formatCurrency(entry.amount)}</Text>
                                                </View>

                                                <View className="flex-row items-center justify-between flex-wrap gap-2 sm:pl-11">
                                                    <View className="flex-row items-center gap-1.5 px-2 h-6 rounded-full" style={{ backgroundColor: meta.bg }}>
                                                        <MaterialIcons name={meta.icon} size={12} color={meta.fg} />
                                                        <Text className="text-[11.5px] font-semibold" style={{ color: meta.fg }}>{meta.label}</Text>
                                                    </View>

                                                    <View className="flex-row items-center gap-1.5 ml-auto">
                                                        {entry.documentUrl ? (
                                                            <Button size="sm" icon="file-download" label="Vezi" iconOnlyOnMobile accessibilityLabel={`Vezi documentul ${entry.label}`} onPress={() => void openDocumentUrl(entry.documentUrl)} />
                                                        ) : null}
                                                        {isUpdating ? (
                                                            <ActivityIndicator size="small" color="var(--c-brand-fg)" />
                                                        ) : entry.accountingStatus === 'pending' ? (
                                                            <>
                                                                <Button size="sm" variant="danger" icon="close" label="Respinge" onPress={() => { setReviewReason(''); setReviewDialog({ id: entry.id, mode: 'reject' }); }} />
                                                                <Button size="sm" variant="primary" icon="check" label="Aprobă" onPress={() => void handleUpdateDocumentStatus(entry.id, 'processed')} />
                                                            </>
                                                        ) : (
                                                            <Button size="sm" icon="undo" label="Redeschide" iconOnlyOnMobile accessibilityLabel="Redeschide documentul" onPress={() => { setReviewReason(''); setReviewDialog({ id: entry.id, mode: 'reopen' }); }} />
                                                        )}
                                                    </View>
                                                </View>

                                                {/* "Aprobat de contabilitate" only repeats the badge; a rejection keeps its reason. */}
                                                {entry.accountingNote && entry.accountingStatus === 'rejected' ? (
                                                    <Text className="text-[12px] sm:pl-11" style={{ color: 'var(--c-muted)' }}>{entry.accountingNote}</Text>
                                                ) : null}
                                            </View>
                                        );
                                    })}
                                </View>
                            )}
                            {!loadingDocuments && filteredUploads.length > visibleDocuments ? (
                                <View className="items-center mt-3">
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        label={`Arată încă ${Math.min(DOCUMENTS_PAGE, filteredUploads.length - visibleDocuments)} (din ${filteredUploads.length})`}
                                        onPress={() => setVisibleDocuments((count) => count + DOCUMENTS_PAGE)}
                                    />
                                </View>
                            ) : null}
                        </FinanceCard>

                        <FinanceCard className="xl:col-span-2">
                            <FinanceCardHeader
                                icon="payment"
                                tone="success"
                                title="Plăți recente"
                                subtitle="Încasări prin card și la club."
                            />

                            {loadingRecentPayments ? (
                                <View className="gap-2">
                                    {[0, 1, 2].map((i) => <SkeletonBlock key={i} width="100%" height={44} />)}
                                </View>
                            ) : recentError && recentPayments.length === 0 ? (
                                <LoadError title="Plățile recente nu s-au încărcat" message={recentError} onRetry={() => void reloadRecentPayments()} />
                            ) : recentPayments.length === 0 ? (
                                <EmptyState title="Nu există plăți" message="Plățile jucătorilor vor apărea aici." icon="payment" />
                            ) : (
                                // Rows, not one card per payment inside a 460px inner scroller
                                // that clipped the last card mid-way.
                                <View>
                                    {recentPayments.map((payment, index) => {
                                        const status = payment.status.toLowerCase();
                                        const paid = ['paid', 'processed', 'succeeded', 'success'].includes(status);
                                        const reversed = status === 'reversed';
                                        const failed = ['failed', 'canceled', 'cancelled', 'refunded'].includes(status);
                                        const label = reversed ? 'Stornată' : paid ? 'Plătit' : failed ? (status === 'refunded' ? 'Rambursat' : 'Eșuat') : 'În așteptare';
                                        const tone = reversed ? 'var(--c-muted)' : paid ? 'var(--c-success-fg)' : failed ? 'var(--c-danger-fg)' : 'var(--c-warning-fg)';
                                        // Card payments are refunded through Stripe; only desk payments are reversed here.
                                        const canReverse = paid && payment.provider !== 'stripe';
                                        return (
                                            <View key={payment.id} className="flex-row items-center gap-3 py-2.5" style={index > 0 ? ({ borderTopWidth: 1, borderTopColor: 'var(--c-border)' } as any) : undefined}>
                                                <View className="flex-1 min-w-0">
                                                    <Text className="text-[14px] font-semibold" style={{ color: 'var(--c-ink)' }} numberOfLines={1}>{payment.playerName}</Text>
                                                    <Text className="t-meta" style={{ color: 'var(--c-muted)' }} numberOfLines={1}>
                                                        {[formatPaymentWhen(payment.date, payment.provider), payment.teamName, paymentMethodLabel(payment.provider)].filter(Boolean).join(' · ')}
                                                    </Text>
                                                </View>
                                                <View className="items-end shrink-0">
                                                    <Text className="t-num text-[14px] font-bold" style={{ color: reversed ? 'var(--c-muted)' : 'var(--c-ink)', textDecorationLine: reversed ? 'line-through' : 'none' } as any}>{formatCurrency(payment.amount, payment.currency)}</Text>
                                                    <Text className="text-[11.5px] font-semibold" style={{ color: tone }}>{label}</Text>
                                                </View>
                                                {canReverse ? (
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        icon="undo"
                                                        label="Stornează"
                                                        iconOnlyOnMobile
                                                        accessibilityLabel={`Stornează plata de ${formatCurrency(payment.amount, payment.currency)} de la ${payment.playerName}`}
                                                        onPress={() => { setReverseReason(''); setPendingReverse(payment); }}
                                                    />
                                                ) : null}
                                            </View>
                                        );
                                    })}
                                </View>
                            )}
                        </FinanceCard>
                    </View>
                </View>
            )}

            {activeTab === 'Payment Gateways' && (
                <View className="mb-20">
                    <StripeConnectCard returned={params.connect === 'return'} />
                    {/* Server-side Stripe setup: done by whoever runs the platform, so it
                        stays folded away. The status the club acts on is the card above. */}
                    <View className="w-full rounded-[16px] border" style={{ backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-border)', boxShadow: 'var(--e-sm)' } as any}>
                        <Pressable
                            onPress={() => setShowStripeDetails((open) => !open)}
                            accessibilityRole="button"
                            accessibilityState={{ expanded: showStripeDetails }}
                            className="flex-row items-center gap-3 px-4 md:px-5 py-3.5"
                        >
                            <View className="flex-1 min-w-0">
                                <Text className="text-[14px] font-semibold" style={{ color: 'var(--c-ink)' }}>Detalii tehnice</Text>
                                <Text className="t-meta mt-0.5" style={{ color: 'var(--c-muted)' }}>
                                    Configurarea Stripe de pe server, pentru operatorul platformei.
                                </Text>
                            </View>
                            <View className={`transition-transform duration-200 ${showStripeDetails ? 'rotate-180' : ''}`}>
                                <MaterialIcons name="expand-more" size={20} color="var(--c-muted)" />
                            </View>
                        </Pressable>

                        {showStripeDetails ? (
                            <View className="px-4 md:px-5 pb-4 border-t" style={{ borderColor: 'var(--c-border-soft)' } as any}>
                                {[
                                    { label: 'Mediu', value: loadingStripeConfig ? '…' : stripeConfig?.mode === 'live' ? 'Live' : 'Test' },
                                    { label: 'Monedă', value: loadingStripeConfig ? '…' : (stripeConfig?.currency || 'ron').toUpperCase() },
                                    { label: 'Cheie secretă', value: loadingStripeConfig ? '…' : stripeConfig?.secretKeyConfigured ? 'Configurată' : 'Lipsește' },
                                    { label: 'Cheie publică', value: loadingStripeConfig ? '…' : stripeConfig?.publishableKeyConfigured ? 'Configurată' : 'Cheie de test' },
                                    { label: 'Secret webhook', value: loadingStripeConfig ? '…' : stripeConfig?.webhookSecretConfigured ? 'Configurat' : 'Lipsește' },
                                ].map((row) => (
                                    <View key={row.label} className="flex-row justify-between items-center gap-3 py-2.5 border-b" style={{ borderColor: 'var(--c-border-soft)' } as any}>
                                        <Text className="text-[13px] font-medium" style={{ color: 'var(--c-muted)' }}>{row.label}</Text>
                                        <Text className="text-[13px] font-semibold" style={{ color: row.value === 'Lipsește' ? 'var(--c-danger-fg)' : 'var(--c-ink)' }}>{row.value}</Text>
                                    </View>
                                ))}
                                <Text className="text-[13px] font-medium mt-3" style={{ color: 'var(--c-muted)' }}>URL webhook</Text>
                                <Text className="text-[13px] font-semibold mt-0.5 break-anywhere" style={{ color: 'var(--c-ink)' }} selectable>
                                    {stripeConfig?.webhookUrl || 'Se încarcă…'}
                                </Text>
                                <Text className="t-meta mt-2" style={{ color: 'var(--c-muted)' }}>
                                    Evenimente de trimis din Stripe: checkout.session.completed, checkout.session.async_payment_succeeded, checkout.session.async_payment_failed și checkout.session.expired.
                                </Text>
                            </View>
                        ) : null}
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
                    <Button label="Renunță" className="flex-1" disabled={uploadModal.submitting} onPress={closeUploadModal} />
                    <Button variant="primary" icon="upload-file" label="Încarcă documentul" className="flex-1" loading={uploadModal.submitting} onPress={() => void handleConfirmUpload()} />
                </View>
            </ModalShell>

            <ConfirmDialog
                visible={reviewDialog != null}
                title={reviewDialog?.mode === 'reject' ? 'Respinge documentul' : 'Redeschide documentul'}
                message={reviewDialog?.mode === 'reject'
                    ? 'Motivul ajunge în jurnalul de audit și în nota documentului.'
                    : 'Documentul revine la „În așteptare” și poate fi decis din nou. Motivul ajunge în jurnalul de audit.'}
                confirmLabel={reviewDialog?.mode === 'reject' ? 'Respinge' : 'Redeschide'}
                destructive={reviewDialog?.mode === 'reject'}
                loading={reviewDialog != null && updatingDocId === reviewDialog.id}
                confirmDisabled={!reviewReason.trim()}
                onConfirm={() => void submitReview()}
                onCancel={() => setReviewDialog(null)}
            >
                <TextInput
                    value={reviewReason}
                    onChangeText={setReviewReason}
                    placeholder="Motiv"
                    placeholderTextColor={dash.faint}
                    accessibilityLabel="Motiv"
                    maxLength={500}
                    autoFocus
                    className="h-10 rounded-[10px] px-3 border text-[13px]"
                    style={{ borderColor: 'var(--c-border-strong, var(--c-border))', color: 'var(--c-ink)', backgroundColor: 'var(--c-surface-2, var(--c-surface))' } as any}
                />
            </ConfirmDialog>

            <ConfirmDialog
                visible={pendingReverse != null}
                destructive
                icon="undo"
                title={pendingReverse ? `Stornezi plata de ${formatCurrency(pendingReverse.amount, pendingReverse.currency)} de la ${pendingReverse.playerName}?` : ''}
                message="Plata rămâne în istoric, marcată „Stornată”, iar taxele pe care le acoperea redevin de plată. Stornarea ajunge în jurnal."
                confirmLabel="Stornează"
                loading={reversing}
                // The reason is required: the journal must say why money left the books.
                confirmDisabled={!reverseReason.trim()}
                onConfirm={() => void submitReverse()}
                onCancel={() => { if (!reversing) setPendingReverse(null); }}
            >
                {/* Which payment, exactly: two 340 RON payments used to look the same here. */}
                {pendingReverse ? (
                    <View className="rounded-[10px] border px-3 py-2.5 mb-4 gap-0.5" style={{ borderColor: 'var(--c-border)', backgroundColor: 'var(--c-surface-2)' }}>
                        <Text className="text-[13px] font-semibold" style={{ color: 'var(--c-ink)' }}>
                            {[formatPaymentWhen(pendingReverse.date, pendingReverse.provider), paymentMethodLabel(pendingReverse.provider)].filter(Boolean).join(' · ')}
                        </Text>
                        {/* A desk payment without a note carries the server's default text („Plată numerar”,
                            „Transfer bancar”…): the line above already says it. */}
                        {pendingReverse.description && !isDefaultDeskDescription(pendingReverse.description) ? (
                            <Text className="t-meta" style={{ color: 'var(--c-muted)' }} numberOfLines={2}>{pendingReverse.description}</Text>
                        ) : null}
                    </View>
                ) : null}
                <Text className="text-[12px] font-semibold mb-1.5" style={{ color: 'var(--c-muted)' }}>Motivul stornării</Text>
                <TextInput
                    value={reverseReason}
                    onChangeText={setReverseReason}
                    placeholder="ex. sumă greșită, plată dublă"
                    placeholderTextColor={dash.faint}
                    accessibilityLabel="Motivul stornării (obligatoriu)"
                    aria-required
                    onSubmitEditing={() => { if (reverseReason.trim() && !reversing) void submitReverse(); }}
                    maxLength={300}
                    className="h-10 rounded-[10px] px-3 border text-[13px]"
                    style={{ borderColor: 'var(--c-border-strong, var(--c-border))', color: 'var(--c-ink)', backgroundColor: 'var(--c-surface-2, var(--c-surface))' } as any}
                />
            </ConfirmDialog>

            <ToastHost toasts={toasts} onDismiss={dismissToast} />
        </ScrollView>
    );
}
