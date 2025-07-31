import { Request, Response } from 'express';
import { getDailyGoalsService, updateDailyGoalProgressService } from '../services/dailyGoalsService';
import { GoalType } from '../types/dailyGoals';

// Extend Request interface to include timezone properties
declare global {
  namespace Express {
    interface Request {
      timezone?: string;
      userDate?: string;
    }
  }
}

// Get daily goals for a user and track
export const getDailyGoals = async (req: Request, res: Response) => {
  try {
    const { userId } = req.query;
    if (!userId) {
      return res.status(400).json({ 
        success: false,
        message: 'Missing required field: userId' 
      });
    }

    const { trackId } = req.params;
    if (!trackId) {
      return res.status(400).json({ 
        success: false,
        message: 'Missing trackId parameter' 
      });
    }

    const dailyGoals = await getDailyGoalsService(userId as string, trackId, req.userDate);
    
    if (!dailyGoals) {
      return res.status(404).json({ 
        success: false,
        message: 'No daily goals found' 
      });
    }

    return res.status(200).json({
      success: true,
      data: dailyGoals
    });
  } catch (error) {
    console.error('Error getting daily goals:', error);
    return res.status(500).json({ 
      success: false,
      message: 'Internal server error' 
    });
  }
};

// Update daily goal progress
export const updateDailyGoalProgress = async (req: Request, res: Response) => {
  try {
    const { userId } = req.body;
    if (!userId) {
      return res.status(400).json({ 
        success: false,
        message: 'Missing required field: userId' 
      });
    }

    const { trackId } = req.params;
    const { goalType, increment } = req.body;

    if (!trackId) {
      return res.status(400).json({ 
        success: false,
        message: 'Missing trackId parameter' 
      });
    }

    if (!goalType || !['learning', 'accuracy', 'fluency', 'assessment'].includes(goalType)) {
      return res.status(400).json({ 
        success: false,
        message: 'Invalid or missing goalType' 
      });
    }

    const incrementValue = Number(increment) || 1;
    
    const updatedGoals = await updateDailyGoalProgressService(
      userId, 
      trackId, 
      goalType as GoalType, 
      incrementValue,
      req.userDate
    );
    
    if (!updatedGoals) {
      return res.status(404).json({ 
        success: false,
        message: 'Failed to update goal progress' 
      });
    }

    return res.status(200).json({
      success: true,
      data: updatedGoals
    });
  } catch (error) {
    console.error('Error updating daily goal progress:', error);
    return res.status(500).json({ 
      success: false,
      message: 'Internal server error' 
    });
  }
}; 