import express, { RequestHandler } from 'express';
import { getTargetTime } from '../controllers/targetTimeController';

const router = express.Router();

router.get('/:userId/:trackId', getTargetTime as RequestHandler);

export default router; 