import { Request, Response } from 'express';
import { getOnboardingStatus as getOnboardingStatusService } from '../services/onboardingService';

export const getOnboardingStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;
    
    if (!userId) {
      res.status(400).json({ error: 'User ID is required' });
      return;
    }

    const status = await getOnboardingStatusService(userId);
    
    // Business logic (e.g. completing onboarding) now handled in service layer
    
    res.json(status);

  } catch (error) {
    console.error('Error getting onboarding status:', error);
    
    if (error instanceof Error && error.message === 'User not found') {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    
    res.status(500).json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to get onboarding status'
    });
  }
}; 