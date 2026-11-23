import { Router } from 'express';
import { eventsController } from '../controllers/eventsController';
import { eventResponsesController } from '../controllers/eventResponsesController';
import { authenticate } from '../middleware/auth';

const router = Router();

router.use(authenticate);

router.get('/', eventsController.getEvents);
// Before '/:id', or "attendance" would be parsed as an event id.
router.get('/attendance', eventsController.getAttendanceBatch);
router.get('/responses/mine', eventResponsesController.mine);
router.get('/:id', eventsController.getEventById);
router.post('/', eventsController.createEvent);
router.put('/:id', eventsController.updateEvent);
router.delete('/:id', eventsController.deleteEvent);

router.get('/:id/attendance', eventsController.getEventAttendance);
router.post('/:id/attendance', eventsController.updateEventAttendance);

// Attendance confirmation (Val 3, controllers/eventResponsesController.ts).
router.put('/:id/response', eventResponsesController.respond);
router.get('/:id/responses', eventResponsesController.list);
router.post('/:id/responses/remind', eventResponsesController.remind);

router.post('/sync-frb', eventsController.syncFRBMatches);

export default router;
