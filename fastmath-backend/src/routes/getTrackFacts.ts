import { Router } from 'express';
import { getTrackFactsController } from '../controllers/getTrackFactsController';

const router = Router();

router.get('/track/:trackId', getTrackFactsController);

export default router; 