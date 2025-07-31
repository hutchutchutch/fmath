import { Request, Response } from 'express';
import { calculateTimeToCompletion } from '../services/timeEstimationService';

/**
 * Calculate time to completion for a user's track
 * @route GET /api/timeEstimation/calculate
 */
export const calculateTimeEstimation = async (req: Request, res: Response) => {
  try {
    const { userId, trackId } = req.query;

    // Validate required parameters
    if (!userId || !trackId) {
      return res.status(400).json({ 
        error: 'Missing required parameters: userId and trackId are required' 
      });
    }

    // Calculate time to completion
    const timeEstimation = await calculateTimeToCompletion(
      userId as string,
      trackId as string
    );

    // Return the time estimation
    return res.status(200).json(timeEstimation);
  } catch (error) {
    console.error('Error calculating time estimation:', error);
    return res.status(500).json({ 
      error: 'An error occurred while calculating time estimation' 
    });
  }
}; 