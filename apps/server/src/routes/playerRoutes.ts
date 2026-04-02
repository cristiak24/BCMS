import { Router } from 'express';
import { playersController } from '../controllers/playersController';

const router = Router();

router.get('/search', playersController.searchPlayers);
router.get('/roster', playersController.getRoster);
router.get('/:id', playersController.getPlayerById);
router.post('/add-to-team', playersController.addPlayerToTeam);
router.put('/:id', playersController.updatePlayer);

export default router;
