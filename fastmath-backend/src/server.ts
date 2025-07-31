import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import authRoutes from './routes/auth';
import ltiRoutes from './routes/lti';
import userRoutes from './routes/users';
import getTrackFactsRoutes from './routes/getTrackFacts';
import targetTimeRoutes from './routes/targetTime';
import progressAssessmentRoutes from './routes/progressAssessment';
import adminRoutes from './routes/admin';
import sessionManagementRoutes from './routes/sessionManagement';
import sessionAnalyticsRoutes from './routes/sessionAnalytics';
import timeEstimationRoutes from './routes/timeEstimation';
import dailyGoalsRoutes from './routes/dailyGoals';
import onboardingRoutes from './routes/onboarding';

const app = express();
const port = process.env.PORT || 3000;

app.use(cors({
  origin: [
    'https://app.fastmath.pro',
    'http://localhost:3001',
    'http://localhost:3003'
  ],
  credentials: true
}));
app.use(express.json());

// Routes
app.use('/auth', authRoutes);
app.use('/lti', ltiRoutes);
app.use('/users', userRoutes);
app.use('/trackFacts', getTrackFactsRoutes);
app.use('/targetTime', targetTimeRoutes);
app.use('/progressAssessment', progressAssessmentRoutes);
app.use('/admin', adminRoutes);
app.use('/session', sessionManagementRoutes);
app.use('/sessionAnalytics', sessionAnalyticsRoutes);
app.use('/timeEstimation', timeEstimationRoutes);
app.use('/dailyGoals', dailyGoalsRoutes);
app.use('/onboarding', onboardingRoutes);

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Global error handler - must be last middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  // Log the error for debugging
  console.error('[Global Error Handler]', {
    error: err.message || 'Unknown error',
    stack: err.stack,
    url: req.url,
    method: req.method,
    timestamp: new Date().toISOString()
  });

  // Send JSON error response
  res.status(err.status || 500).json({
    success: false,
    error: {
      message: err.message || 'Internal server error',
      // Only include error details in development
      ...(process.env.NODE_ENV !== 'production' && { details: err.toString() })
    }
  });
});

// 404 handler for undefined routes
app.use((req: express.Request, res: express.Response) => {
  res.status(404).json({
    success: false,
    error: {
      message: `Route ${req.method} ${req.url} not found`
    }
  });
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});