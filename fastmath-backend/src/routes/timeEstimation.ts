import express, { RequestHandler } from 'express';
import { calculateTimeEstimation } from '../controllers/timeEstimationController';

const router = express.Router();

// GET /api/timeEstimation/calculate - Calculate time to completion
router.get('/calculate', calculateTimeEstimation as unknown as RequestHandler);

export default router; 