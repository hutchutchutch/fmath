import express, { Router, RequestHandler, Request, Response } from 'express';
import { searchUsersController, getUserCQPMController, getActiveStudentsController } from '../controllers/adminController';
import { updateUserGradesBatchController, updateUserTracksBatchController } from '../controllers/userUpdateController';
import { getAllUsersCSV, getSessionsInDateRangeCSV, getDailyGoalsInDateRangeCSV, getUserProgressCSV, getProgressAssessmentsInDateRangeCSV } from '../controllers/downloadController';
import { createUsersController, resetUserProgress } from '../controllers/userRosteringController';
import { getCqpmDashboardController, getUserCqpmDetailsController } from '../controllers/cqpmController';

const router = Router();

// Search users endpoint - requires authentication
router.get('/users/search', searchUsersController as RequestHandler);

// Get user CQPM data endpoint - requires authentication
router.get('/users/cqpm', getUserCQPMController as RequestHandler);

// Get active students endpoint - requires authentication
router.get('/users/active', getActiveStudentsController as RequestHandler);

// Update user grades endpoint (batch) - requires authentication
router.put('/users/grades/batch', updateUserGradesBatchController as RequestHandler);

// Update user tracks endpoint (batch) - requires authentication
router.put('/users/tracks/batch', updateUserTracksBatchController as RequestHandler);

// User rostering endpoint - requires authentication
router.post('/user-rostering/create', createUsersController as RequestHandler);

// Reset User Progress
router.post('/users/progress/reset', resetUserProgress as unknown as RequestHandler);

// Download routes - all require authentication
router.get('/downloads/users', getAllUsersCSV as RequestHandler);
router.get('/downloads/sessions', getSessionsInDateRangeCSV as RequestHandler);
router.get('/downloads/daily-goals', getDailyGoalsInDateRangeCSV as RequestHandler);
router.get('/downloads/user-progress', getUserProgressCSV as RequestHandler);
router.get('/downloads/progress-assessments', getProgressAssessmentsInDateRangeCSV as RequestHandler);

// CQPM Dashboard routes - requires authentication
router.get('/cqpm/dashboard-data', getCqpmDashboardController as RequestHandler);
router.get('/cqpm/user-details/:email', getUserCqpmDetailsController as RequestHandler);

export default router; 