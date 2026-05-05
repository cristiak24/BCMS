import { Router } from 'express';
import { eventsController } from '../controllers/eventsController';
import { authenticate } from '../middleware/auth';

const router = Router();

router.use(authenticate);

router.get('/', eventsController.getEvents);
router.get('/:id', eventsController.getEventById);
router.post('/', eventsController.createEvent);
router.put('/:id', eventsController.updateEvent);
router.delete('/:id', eventsController.deleteEvent);

router.get('/:id/attendance', eventsController.getEventAttendance);
router.post('/:id/attendance', eventsController.updateEventAttendance);

router.post('/sync-frb', eventsController.syncFRBMatches);

export default router;
