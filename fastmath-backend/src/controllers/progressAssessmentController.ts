import { Request, Response } from 'express';
import { 
  createProgressAssessment as createAssessment, 
  startProgressAssessment as startAssessment, 
  updateAssessmentProgress, 
  completeAssessmentProgress,
  getUserAssessments as getAssessments
} from '../services/progressAssessmentService';
import { getProgressMetrics } from '../services/progressAnalyticsService';

export const createProgressAssessment = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;
    const { trackId, duration } = req.body;
    
    if (!userId) {
      res.status(400).json({ error: 'User ID is required' });
      return;
    }

    if (!trackId) {
      res.status(400).json({ error: 'Track ID is required in the request body' });
      return;
    }

    if (typeof duration !== 'number' || duration <= 0) {
      res.status(400).json({ error: 'Duration must be a positive number' });
      return;
    }

    const assessmentId = await createAssessment(userId, trackId, duration);
    res.json({ success: true, assessmentId });
  } catch (error) {
    console.error('Error creating progress assessment:', error);
    res.status(500).json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to create progress assessment'
    });
  }
};

export const startProgressAssessment = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId, trackId } = req.params;
    
    if (!userId) {
      res.status(400).json({ error: 'User ID is required' });
      return;
    }

    if (!trackId) {
      res.status(400).json({ error: 'Track ID is required' });
      return;
    }

    const assessmentData = await startAssessment(userId, trackId);
    res.json({ success: true, ...assessmentData });
  } catch (error) {
    console.error('Error starting progress assessment:', error);
    res.status(500).json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to start progress assessment'
    });
  }
};

export const updateProgressAssessment = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId, assessmentId, trackId } = req.params;
    const { facts } = req.body;
    
    if (!userId || !assessmentId || !trackId) {
      res.status(400).json({ error: 'User ID, Assessment ID and Track ID are required in URL parameters' });
      return;
    }

    if (!facts) {
      res.status(400).json({ error: 'Facts are required in request body' });
      return;
    }

    const updatedAssessment = await updateAssessmentProgress(userId, { assessmentId, facts });
    res.json({ success: true, assessment: updatedAssessment });
  } catch (error) {
    console.error('[Progress Assessment Update] Error:', error);
    res.status(500).json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to update progress assessment'
    });
  }
};

export const completeProgressAssessment = async (req: Request, res: Response): Promise<void> => {
  try {
    const { assessmentId, userId } = req.params;
    const { totalTypingTimeDeducted, totalTransitionTime, actualDurationMinutes, clientSideStats, testType } = req.body;
    
    if (!assessmentId) {
      res.status(400).json({ error: 'Assessment ID is required in URL parameters' });
      return;
    }

    if (!userId) {
      res.status(400).json({ error: 'User ID is required in URL parameters' });
      return;
    }

    const completedAssessment = await completeAssessmentProgress(
      userId, 
      assessmentId,
      {
        totalTypingTimeDeducted,
        totalTransitionTime,
        actualDurationMinutes,
        clientSideStats,
        testType
      }
    );
    res.json({ success: true, assessment: completedAssessment });
  } catch (error) {
    console.error('[Progress Assessment Complete] Error:', error);
    res.status(500).json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to complete progress assessment'
    });
  }
};

export const getUserAssessments = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;
    
    if (!userId) {
      res.status(400).json({ error: 'User ID is required' });
      return;
    }

    const assessments = await getAssessments(userId);
    res.json({ success: true, assessments });
  } catch (error) {
    console.error('Error fetching user assessments:', error);
    res.status(500).json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to fetch user assessments'
    });
  }
};

export const getProgressAnalytics = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;
    const { trackId } = req.query;
    
    if (!userId) {
      res.status(400).json({ error: 'User ID is required' });
      return;
    }

    if (!trackId || typeof trackId !== 'string') {
      res.status(400).json({ error: 'Track ID is required as a query parameter' });
      return;
    }

    const metrics = await getProgressMetrics(userId, trackId);
    res.json({ success: true, metrics });
  } catch (error) {
    console.error('Error fetching progress metrics:', error);
    res.status(500).json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to fetch progress metrics'
    });
  }
}; 