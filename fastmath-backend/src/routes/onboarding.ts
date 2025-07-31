import { Router, RequestHandler } from 'express';
import { getOnboardingStatus } from '../controllers/onboardingController';

const router = Router();

// Get onboarding status for a user
router.get('/status/:userId', getOnboardingStatus as RequestHandler);

export default router; 