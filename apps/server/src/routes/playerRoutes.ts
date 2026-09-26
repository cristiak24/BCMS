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
// Must come before /:id — otherwise "me" would be parsed as a numeric id.
router.get('/me/teams/:teamId', playersController.getMyTeamDetail);
router.get('/me/teams', playersController.getMyTeams);
router.get('/me', playersController.getMe);
router.get('/:id', playersController.getPlayerById);
router.post('/add-to-team', playersController.addPlayerToTeam);
router.put('/:id', playersController.updatePlayer);

export default router;
