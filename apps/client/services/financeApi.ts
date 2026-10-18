import { Platform } from '@/src/web/reactNative';
import { apiFetch } from './apiClient';

export type FinancialDocument = {
    id: number;
    type: string;
    amount: number;
    description: string;
    date: string;
    documentUrl: string | null;
    status: 'pending' | 'processed' | 'rejected';
    clubId?: number | null;
};

export type FinancialSettings = {
    id: number;
    monthlyPlayerFee: number;
    trainingLevy: number;
    facilityFee: number;
    autoAdjust: number; // 1 or 0
    paymentDueDay: number; // day of month (1..31) the monthly fee is due
    /** 'YYYY-MM': first month whose unpaid fees count as arrears. Null: current month only. */
    billingStartMonth?: string | null;
    updatedAt: string;
};

export type PlayerPaymentFee = {
    id: string;
    label: string;
    description: string;
    /** Still owed on the fee. */
    amount: number;
    /** Already paid towards it (partial payments, advance); absent when nothing was. */
    paidAmount?: number;
    currency: string;
    /** overdue = past its due date (restanță); upcoming = this month's fee. */
    status: 'overdue' | 'pending' | 'upcoming' | 'failed';
    dueDate: string | null;
    icon: 'training' | 'trophy' | 'receipt';
    paymentId?: number | string | null;
};

export type PlayerPaymentMethod = {
    id: string;
    brand: string;
    last4: string;
    expMonth: number | null;
    expYear: number | null;
    isDefault: boolean;
};

export type PlayerPaymentTransaction = {
    id: string;
    label: string;
    description: string;
    amount: number;
    currency: string;
    status: 'success' | 'error';
    date: string;
    receiptUrl: string | null;
};

export type PlayerPaymentSummary = {
    playerName: string;
    playerEmail: string | null;
    billingCycle: string;
    dueLabel: string;
    autoPayNote: string;
    outstandingAmount: number;
    currency: string;
    provider: 'stripe';
    stripe: {
        publishableKey: string;
        configured: boolean;
    };
    fees: PlayerPaymentFee[];
    paymentMethods: PlayerPaymentMethod[];
    transactions: PlayerPaymentTransaction[];
};

export type StripeSessionResponse = {
    id: string;
    url: string | null;
};

export type StripeAdminConfig = {
    provider: 'stripe';
    mode: 'test' | 'live';
    currency: string;
    configured: boolean;
    secretKeyConfigured: boolean;
    publishableKeyConfigured: boolean;
    webhookSecretConfigured: boolean;
    publishableKey: string;
    webhookUrl: string;
};

export type AdminRecentPayment = {
    id: string;
    playerId: number;
    playerName: string;
    playerEmail: string | null;
    teamName: string | null;
    amount: number;
    currency: string;
    status: string;
    date: string;
    description: string;
    provider: string | null;
    receiptUrl: string | null;
};

export type BalanceFee = PlayerPaymentFee & { kind: 'monthly' | 'levy' | 'facility' | 'event' | 'request' };

/** A Finanțe list row: the player's totals, without the fee-by-fee detail. */
export type PlayerBalanceSummary = {
    playerId: number;
    playerName: string;
    teamName: string | null;
    status: string;
    outstanding: number;
    overdue: number;
    overdueCount: number;
    oldestOverdue: string | null;
    state: 'overdue' | 'due' | 'paid';
    /** Advance paid beyond every fee owed (absent on older servers). */
    credit?: number;
    /** Fees still owed. */
    feeCount: number;
    /** Earliest due date among them, overdue or not. */
    oldestDueDate: string | null;
};

export type PlayerBalance = Omit<PlayerBalanceSummary, 'feeCount' | 'oldestDueDate'> & {
    fees: BalanceFee[];
};

/** One player's fees, for the „Încasează” dialog. */
export type PlayerFeeDetail = {
    currency: string;
    playerId: number;
    outstanding: number;
    overdue: number;
    overdueCount: number;
    oldestOverdue: string | null;
    state: 'overdue' | 'due' | 'paid';
    credit: number;
    fees: BalanceFee[];
};

/** How a desk payment is split over the fees, before it is saved. */
export type PaymentAllocation = {
    currency: string;
    lines: Array<{
        feeId: string;
        label: string;
        status: 'overdue' | 'pending' | 'upcoming';
        dueDate: string | null;
        owedBefore: number;
        applied: number;
        owedAfter: number;
    }>;
    /** Advance left after the payment. */
    credit: number;
};

export type FinanceSummary = {
    currency: string;
    month: string;
    collected: number;
    outstanding: number;
    overdue: number;
    playersOverdue: number;
    playersOwing: number;
};

export type StripeConnectStatus = {
    available: boolean;
    connected: boolean;
    accountId?: string | null;
    chargesEnabled?: boolean;
    payoutsEnabled?: boolean;
    detailsSubmitted?: boolean;
    canManage?: boolean;
};

export const financeApi = {
    /** The club's own Stripe account (Connect). */
    async getConnectStatus(): Promise<StripeConnectStatus> {
        return apiFetch<StripeConnectStatus>('/finance/stripe/connect');
    },

    async startConnectOnboarding(): Promise<{ url: string }> {
        return apiFetch<{ url: string }>('/finance/stripe/connect/onboard', { method: 'POST' });
    },

    async getDocuments(): Promise<FinancialDocument[]> {
        return apiFetch<FinancialDocument[]>('/finance/documents');
    },

    async uploadDocument(fileUri: string | File, mimeType: string, filename: string, type: string, amount: string, description: string) {
        const formData = new FormData();
        if (Platform.OS === 'web' && typeof File !== 'undefined' && fileUri instanceof File) {
            formData.append('file', fileUri, filename);
        } else {
            formData.append('file', {
                uri: Platform.OS === 'ios' && typeof fileUri === 'string' ? fileUri.replace('file://', '') : fileUri,
                name: filename,
                type: mimeType || 'image/jpeg',
            } as any);
        }
        formData.append('type', type);
        formData.append('amount', amount);
        formData.append('description', description);

        return apiFetch('/finance/upload', {
            method: 'POST',
            body: formData,
        });
    },

    /** Rejecting or reopening needs a reason; approving one's own upload is refused when someone else can review. */
    async updateDocumentStatus(id: number, status: 'pending' | 'processed' | 'rejected', reason?: string): Promise<FinancialDocument> {
        return apiFetch<FinancialDocument>(`/finance/documents/${id}/status`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status, reason }),
        });
    },

    async getSettings(): Promise<FinancialSettings> {
        return apiFetch<FinancialSettings>('/finance/settings');
    },

    async updateSettings(settings: Partial<FinancialSettings>): Promise<FinancialSettings> {
        return apiFetch<FinancialSettings>('/finance/settings', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(settings),
        });
    },

    async getStripeConfig(): Promise<StripeAdminConfig> {
        return apiFetch<StripeAdminConfig>('/finance/stripe/config');
    },

    async getAdminRecentPayments(limit = 12, teamId?: number | null): Promise<AdminRecentPayment[]> {
        const teamQuery = teamId != null ? `&teamId=${teamId}` : '';
        return apiFetch<AdminRecentPayment[]>(`/finance/admin/recent-payments?limit=${limit}${teamQuery}`);
    },

    /** What every player owes (same calculation as the player's Plăți page): totals per player. */
    async getBalances(teamId?: number | null): Promise<{ currency: string; players: PlayerBalanceSummary[] }> {
        const query = teamId != null ? `?teamId=${teamId}` : '';
        return apiFetch<{ currency: string; players: PlayerBalanceSummary[] }>(`/finance/admin/balances${query}`);
    },

    /** The same list with every fee of every player — only for the CSV export. */
    async getBalancesWithFees(teamId?: number | null): Promise<{ currency: string; players: PlayerBalance[] }> {
        const query = teamId != null ? `&teamId=${teamId}` : '';
        return apiFetch<{ currency: string; players: PlayerBalance[] }>(`/finance/admin/balances?include=fees${query}`);
    },

    /** One player's fees, fee by fee. */
    async getPlayerBalance(playerId: number): Promise<PlayerFeeDetail> {
        return apiFetch<PlayerFeeDetail>(`/finance/admin/balances/${playerId}`);
    },

    /** Every payment of the club in a date range (YYYY-MM-DD), for the CSV export. */
    async getPaymentsExport(from: string, to: string): Promise<{ currency: string; payments: import('../components/finance/financeCsv').ExportedPayment[] }> {
        return apiFetch(`/finance/admin/payments-export?from=${from}&to=${to}`);
    },

    /** Collected in a month (default: this one) and what is owed today. */
    async getSummary(month?: string): Promise<FinanceSummary> {
        return apiFetch<FinanceSummary>(`/finance/admin/summary${month ? `?month=${month}` : ''}`);
    },

    async previewManualPayment(payload: { playerId: number; amount: number; feeIds?: string[] }): Promise<PaymentAllocation> {
        return apiFetch<PaymentAllocation>('/finance/admin/manual-payment/preview', {
            method: 'POST',
            body: JSON.stringify(payload),
        });
    },

    async createManualPayment(payload: { playerId: number; amount: number; description?: string; method?: string; date?: string; feeIds?: string[] }): Promise<{ success: boolean }> {
        return apiFetch<{ success: boolean }>('/finance/admin/manual-payment', {
            method: 'POST',
            body: JSON.stringify({ method: 'cash', ...payload }),
        });
    },

    async getPlayerPaymentSummary(): Promise<PlayerPaymentSummary> {
        return apiFetch<PlayerPaymentSummary>('/finance/player/summary');
    },

    async createPlayerCheckoutSession(feeIds?: string[], returnUrl?: string): Promise<StripeSessionResponse> {
        return apiFetch<StripeSessionResponse>('/finance/player/checkout-session', {
            method: 'POST',
            body: JSON.stringify({ feeIds, returnUrl }),
        });
    },

    async createPlayerSetupSession(returnUrl?: string): Promise<StripeSessionResponse> {
        return apiFetch<StripeSessionResponse>('/finance/player/setup-session', {
            method: 'POST',
            body: JSON.stringify({ returnUrl }),
        });
    },

    async confirmPlayerCheckoutSession(sessionId: string) {
        return apiFetch<{ success: boolean }>('/finance/player/confirm-checkout-session', {
            method: 'POST',
            body: JSON.stringify({ sessionId }),
        });
    },

    async confirmPlayerSetupSession(sessionId: string) {
        return apiFetch<{ success: boolean; paymentMethods: PlayerPaymentMethod[] }>('/finance/player/confirm-setup-session', {
            method: 'POST',
            body: JSON.stringify({ sessionId }),
        });
    }
};
