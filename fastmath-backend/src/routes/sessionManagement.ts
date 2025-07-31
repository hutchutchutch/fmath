import { Router, RequestHandler } from 'express';
import { getSessionController } from '../controllers/sessionManagementController';

const router = Router();

router.get('/:userId/:trackId', getSessionController as unknown as RequestHandler);

export default router; 