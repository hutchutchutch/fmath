import express from 'express';
import sessionAnalyticsController from '../controllers/sessionAnalyticsController';

const router = express.Router();

// POST /api/sessionAnalytics/pageTransition - Record a page transition
router.post('/pageTransition', sessionAnalyticsController.recordPageTransition);

// GET /api/sessionAnalytics - Get session analytics for a user
router.get('/', sessionAnalyticsController.getSessionAnalytics);

// GET /api/sessionAnalytics/lastActivity - Get the user's most recent activity
router.get('/lastActivity', sessionAnalyticsController.getLastActivity);

// GET /api/sessionAnalytics/userSessionsLastWeek - Get the user's sessions from the last 7 days
router.get('/userSessionsLastWeek', sessionAnalyticsController.getUserSessionsLastWeek);

export default router; 