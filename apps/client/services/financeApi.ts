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
    updatedAt: string;
};

export type PlayerPaymentFee = {
    id: string;
    label: string;
    description: string;
    amount: number;
    currency: string;
    status: 'pending' | 'failed' | 'upcoming';
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

export const financeApi = {
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

    async updateDocumentStatus(id: number, status: 'pending' | 'processed' | 'rejected'): Promise<FinancialDocument> {
        return apiFetch<FinancialDocument>(`/finance/documents/${id}/status`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status }),
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

    async createManualPayment(payload: { playerId: number; amount: number; description?: string; method?: string; date?: string }): Promise<{ success: boolean }> {
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
