import { apiClient, apiFetch } from './apiClient';
import { buildApiUrl } from '../config/serverUrl';

/** Club document library — see apps/server/src/routes/clubDocuments.ts. */

export type ClubDocumentVisibility = 'all' | 'staff';

export type ClubDocument = {
    id: number;
    title: string;
    fileName: string;
    sizeBytes: number;
    visibility: ClubDocumentVisibility;
    uploaderName: string | null;
    createdAt: string | null;
    canDelete: boolean;
};

export type ClubDocumentList = {
    documents: ClubDocument[];
    canUpload: boolean;
    usedBytes: number;
    quotaBytes: number;
    maxFileBytes: number;
};

export const clubDocumentsApi = {
    async list() {
        return (await apiClient.get<ClubDocumentList>('/club-documents')).data;
    },
    async upload(file: File, title: string, visibility: ClubDocumentVisibility) {
        const form = new FormData();
        form.append('title', title);
        form.append('visibility', visibility);
        form.append('file', file, file.name);
        return apiFetch<ClubDocument>('/club-documents', { method: 'POST', body: form });
    },
    /** The PDF as a blob — the endpoint needs the bearer token, so no plain link. */
    async file(id: number) {
        return apiFetch<Blob>(`/club-documents/${id}/file`, undefined, 'blob');
    },
    /** Absolute, short-lived (5 min) URL the browser can open by itself — new tab, iOS PDF viewer. */
    async openUrl(id: number, download = false) {
        const { path } = await apiFetch<{ path: string; expiresAt: number }>(`/club-documents/${id}/link`, { method: 'POST' });
        return buildApiUrl(download ? `${path}?download=1` : path);
    },
    async remove(id: number) {
        await apiClient.delete(`/club-documents/${id}`);
    },
};
