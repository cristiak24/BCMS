import { apiClient } from './apiClient';

export interface AppNotification {
    id: number;
    userId: number;
    type: string;
    title: string;
    message: string;
    eventId: number | null;
    playerId: number | null;
    isRead: boolean;
    createdAt: string;
}

export const notificationsApi = {
    async getNotifications() {
        const response = await apiClient.get<AppNotification[]>('/notifications');
        return response.data;
    },

    async getUnreadCount() {
        const response = await apiClient.get<{ count: number }>('/notifications/unread-count');
        return response.data.count;
    },

    async markAsRead(id: number) {
        await apiClient.post(`/notifications/${id}/read`);
    },

    async markAllAsRead() {
        await apiClient.post('/notifications/read-all');
    },
};
