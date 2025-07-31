import { Router, RequestHandler } from 'express';
import { handleLTILaunch } from '../controllers/ltiController';

const router = Router();

router.post('/launch', handleLTILaunch as RequestHandler);

export default router;