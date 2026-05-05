import { Router } from 'express';
import { playersController } from '../controllers/playersController';
import { authenticate } from '../middleware/auth';

const router = Router();

router.use(authenticate);

router.get('/search', playersController.searchPlayers);
router.get('/roster/summary', playersController.getRosterSummary);
router.get('/roster', playersController.getRoster);
router.post('/payment-reminders', playersController.sendPaymentReminders);
router.delete('/:id/roster', playersController.removeFromRoster);
router.get('/:id', playersController.getPlayerById);
router.post('/add-to-team', playersController.addPlayerToTeam);
router.put('/:id', playersController.updatePlayer);

export default router;
