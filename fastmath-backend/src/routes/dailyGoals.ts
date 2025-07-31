import express, { RequestHandler } from 'express';
import { getDailyGoals, updateDailyGoalProgress } from '../controllers/dailyGoalsController';
import { timezoneMiddleware } from '../middleware/timezoneMiddleware';

const router = express.Router();

// GET /api/dailyGoals/:trackId - Get daily goals for a user and track
router.get('/:trackId', timezoneMiddleware, getDailyGoals as unknown as RequestHandler);

// POST /api/dailyGoals/:trackId/progress - Update daily goal progress
router.post('/:trackId/progress', timezoneMiddleware, updateDailyGoalProgress as unknown as RequestHandler);

export default router; 