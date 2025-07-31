import { Router, RequestHandler } from 'express';
import { createProgressAssessment, startProgressAssessment, updateProgressAssessment, completeProgressAssessment, getUserAssessments, getProgressAnalytics } from '../controllers/progressAssessmentController';
import { timezoneMiddleware } from '../middleware/timezoneMiddleware';

const router = Router();

// Create endpoint without auth
router.post('/create/:userId', createProgressAssessment as RequestHandler);

// Other routes without auth - add timezone middleware to ensure consistent date handling
router.post('/start/:userId/:trackId', timezoneMiddleware, startProgressAssessment as RequestHandler);
router.post('/:assessmentId/update/:trackId/:userId', timezoneMiddleware, updateProgressAssessment as RequestHandler);
router.post('/:assessmentId/complete/:userId', timezoneMiddleware, completeProgressAssessment as RequestHandler);
router.get('/:userId/assessments', getUserAssessments as RequestHandler);
router.get('/:userId/metrics', getProgressAnalytics as RequestHandler);

export default router; 