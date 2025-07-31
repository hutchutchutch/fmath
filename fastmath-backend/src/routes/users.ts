import express, { Router, RequestHandler } from 'express';
import { getUserProgress, setUserProgress, updateUserTypingSpeed, updateFocusTrack } from '../controllers/userController';
import { timezoneMiddleware } from '../middleware/timezoneMiddleware';

const router = Router();

router.get('/:userId/progress', getUserProgress as RequestHandler);
router.post('/:userId/progress/:trackId', timezoneMiddleware, setUserProgress as RequestHandler);
router.post('/:userId/typing-speed', updateUserTypingSpeed as RequestHandler);
router.put('/:userId/focus-track', updateFocusTrack as RequestHandler);

export default router;