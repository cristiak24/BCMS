import { Response } from 'express';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '../db';
import { notifications } from '../db/schema';
import { AuthenticatedRequest } from '../middleware/auth';

const LIST_LIMIT = 50;

export const notificationsController = {
    async getNotifications(req: AuthenticatedRequest, res: Response) {
        try {
            if (!req.user) {
                return res.status(401).json({ error: 'Unauthorized' });
            }

            const rows = await db
                .select()
                .from(notifications)
                .where(eq(notifications.userId, req.user.id))
                .orderBy(desc(notifications.createdAt))
                .limit(LIST_LIMIT);

            res.json(rows);
        } catch (error) {
            console.error('Get notifications error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    },

    async getUnreadCount(req: AuthenticatedRequest, res: Response) {
        try {
            if (!req.user) {
                return res.status(401).json({ error: 'Unauthorized' });
            }

            const rows = await db
                .select()
                .from(notifications)
                .where(and(eq(notifications.userId, req.user.id), eq(notifications.isRead, false)));

            res.json({ count: rows.length });
        } catch (error) {
            console.error('Get unread notification count error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    },

    async markAsRead(req: AuthenticatedRequest, res: Response) {
        try {
            if (!req.user) {
                return res.status(401).json({ error: 'Unauthorized' });
            }

            const id = Number(req.params.id);
            const rows = await db
                .update(notifications)
                .set({ isRead: true })
                .where(and(eq(notifications.id, id), eq(notifications.userId, req.user.id)))
                .returning();

            if (!rows[0]) {
                return res.status(404).json({ error: 'Notification not found' });
            }

            res.json({ success: true });
        } catch (error) {
            console.error('Mark notification as read error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    },

    async markAllAsRead(req: AuthenticatedRequest, res: Response) {
        try {
            if (!req.user) {
                return res.status(401).json({ error: 'Unauthorized' });
            }

            await db
                .update(notifications)
                .set({ isRead: true })
                .where(and(eq(notifications.userId, req.user.id), eq(notifications.isRead, false)));

            res.json({ success: true });
        } catch (error) {
            console.error('Mark all notifications as read error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    },
};
