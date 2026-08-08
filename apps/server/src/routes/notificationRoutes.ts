import { Router } from 'express';
import { notificationsController } from '../controllers/notificationsController';
import { authenticate } from '../middleware/auth';

const router = Router();

router.use(authenticate);

router.get('/', notificationsController.getNotifications);
router.get('/unread-count', notificationsController.getUnreadCount);
router.post('/read-all', notificationsController.markAllAsRead);
router.post('/:id/read', notificationsController.markAsRead);

export default router;
